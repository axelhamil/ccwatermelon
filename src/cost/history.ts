import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Sample } from "./types";

const SCHEMA = `
	CREATE TABLE IF NOT EXISTS samples (
		metric TEXT NOT NULL,
		sampled_at INTEGER NOT NULL,
		value REAL NOT NULL,
		PRIMARY KEY (metric, sampled_at)
	);
	CREATE INDEX IF NOT EXISTS samples_recent ON samples(metric, sampled_at DESC);
	CREATE TABLE IF NOT EXISTS session_cost (
		session_id TEXT PRIMARY KEY,
		cost REAL NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS session_cost_recent ON session_cost(updated_at DESC);
	CREATE TABLE IF NOT EXISTS daily_cost (
		session_id TEXT NOT NULL,
		day TEXT NOT NULL,
		cost REAL NOT NULL,
		project TEXT,
		PRIMARY KEY (session_id, day)
	);
	CREATE INDEX IF NOT EXISTS daily_cost_day ON daily_cost(day);
	CREATE TABLE IF NOT EXISTS active_session (
		session_id TEXT PRIMARY KEY,
		project TEXT NOT NULL,
		last_seen INTEGER NOT NULL
	);
`;

const LOCAL_DAY = "date(?, 'unixepoch', 'localtime')";

export class History {
	private db: Database;

	constructor(path: string) {
		mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		this.db.exec("PRAGMA busy_timeout = 2000");
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA synchronous = NORMAL");
		this.migrate();
	}

	private migrate(): void {
		const migration = this.db.transaction(() => {
			const hadDailyCost = this.hasTable("daily_cost");

			this.db.exec(SCHEMA);
			if (!hadDailyCost) this.backfillDailyCost();
			if (!this.hasColumn("daily_cost", "project")) this.addDailyCostProject();
		});

		migration.immediate();
	}

	private hasTable(name: string): boolean {
		const row = this.db
			.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
			.get(name);

		return row !== null;
	}

	private hasColumn(table: string, column: string): boolean {
		const row = this.db
			.query("SELECT 1 FROM pragma_table_info(?) WHERE name = ?")
			.get(table, column);

		return row !== null;
	}

	private backfillDailyCost(): void {
		this.db.exec(`
			INSERT OR IGNORE INTO daily_cost (session_id, day, cost)
			SELECT session_id, date(updated_at, 'unixepoch', 'localtime'), cost FROM session_cost
		`);
	}

	private addDailyCostProject(): void {
		this.db.exec(`
			ALTER TABLE daily_cost ADD COLUMN project TEXT;
			UPDATE daily_cost SET project = (
				SELECT project FROM active_session WHERE active_session.session_id = daily_cost.session_id
			);
		`);
	}

	recordSessionCost(sessionId: string, project: string, cost: number, now: number): void {
		const record = this.db.transaction(() => {
			const previous = this.db
				.query("SELECT cost FROM session_cost WHERE session_id = ?")
				.get(sessionId) as { cost: number } | null;
			const highestSeen = previous?.cost ?? 0;
			const spent = cost - highestSeen;

			this.db
				.query(
					"INSERT INTO session_cost VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET cost = excluded.cost, updated_at = excluded.updated_at",
				)
				.run(sessionId, Math.max(cost, highestSeen), now);
			if (spent <= 0) return;

			this.db
				.query(
					`INSERT INTO daily_cost (session_id, day, cost, project) VALUES (?, ${LOCAL_DAY}, ?, ?) ON CONFLICT(session_id, day) DO UPDATE SET cost = cost + excluded.cost, project = excluded.project`,
				)
				.run(sessionId, now, spent, project);
		});

		record.immediate();
	}

	costToday(now: number): number {
		return this.costOverDays(1, now);
	}

	projectCostToday(project: string, now: number): number {
		const row = this.db
			.query(
				`SELECT COALESCE(SUM(cost), 0) AS total FROM daily_cost WHERE project = ? AND day = ${LOCAL_DAY}`,
			)
			.get(project, now) as { total: number } | null;

		return row?.total ?? 0;
	}

	costOverDays(days: number, now: number): number {
		const row = this.db
			.query(
				"SELECT COALESCE(SUM(cost), 0) AS total FROM daily_cost WHERE day > date(?, 'unixepoch', 'localtime', ?)",
			)
			.get(now, `-${days} days`) as { total: number } | null;

		return row?.total ?? 0;
	}

	pruneCosts(retentionDays: number, now: number): void {
		const cutoff = now - retentionDays * 86_400;

		this.db.query("DELETE FROM session_cost WHERE updated_at < ?").run(cutoff);
		this.db.query(`DELETE FROM daily_cost WHERE day < ${LOCAL_DAY}`).run(cutoff);
	}

	touchSession(sessionId: string, project: string, now: number): void {
		this.db
			.query(
				"INSERT INTO active_session VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET project = excluded.project, last_seen = excluded.last_seen",
			)
			.run(sessionId, project, now);
	}

	countActiveSessions(project: string, since: number): number {
		const row = this.db
			.query("SELECT COUNT(*) AS total FROM active_session WHERE project = ? AND last_seen >= ?")
			.get(project, since) as { total: number } | null;

		return row?.total ?? 0;
	}

	pruneSessions(cutoff: number): void {
		this.db.query("DELETE FROM active_session WHERE last_seen < ?").run(cutoff);
	}

	record(metric: string, value: number, sampledAt: number): void {
		this.db
			.query(
				"INSERT INTO samples VALUES (?, ?, ?) ON CONFLICT(metric, sampled_at) DO UPDATE SET value = excluded.value",
			)
			.run(metric, sampledAt, value);
	}

	samplesSince(metric: string, since: number): Sample[] {
		return this.db
			.query(
				"SELECT sampled_at, value FROM samples WHERE metric = ? AND sampled_at >= ? ORDER BY sampled_at ASC",
			)
			.all(metric, since) as Sample[];
	}

	prune(retentionMinutes: number, now: number): void {
		this.db.query("DELETE FROM samples WHERE sampled_at < ?").run(now - retentionMinutes * 60);
	}

	close(): void {
		this.db.close();
	}
}

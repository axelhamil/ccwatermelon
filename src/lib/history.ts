import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class History {
	private db: Database;

	constructor(path: string) {
		mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		// Several Claude Code sessions render concurrently against the same file,
		// so the default rollback journal hands out "database is locked" and drops
		// the whole statusline to its fallback line. WAL lets readers and the
		// single writer coexist; busy_timeout absorbs the remaining write overlap.
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA busy_timeout = 2000");
		this.db.exec("PRAGMA synchronous = NORMAL");
		this.db.exec(`
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
		`);
	}

	recordSessionCost(sessionId: string, cost: number, now: number): void {
		this.db
			.query(
				"INSERT INTO session_cost VALUES (?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET cost = excluded.cost, updated_at = excluded.updated_at",
			)
			.run(sessionId, cost, now);
	}

	costSince(since: number): number {
		const row = this.db
			.query("SELECT COALESCE(SUM(cost), 0) AS total FROM session_cost WHERE updated_at >= ?")
			.get(since) as { total: number } | null;
		return row?.total ?? 0;
	}

	costToday(now: number): number {
		const row = this.db
			.query(
				"SELECT COALESCE(SUM(cost), 0) AS total FROM session_cost WHERE date(updated_at, 'unixepoch', 'localtime') = date(?, 'unixepoch', 'localtime')",
			)
			.get(now) as { total: number } | null;
		return row?.total ?? 0;
	}

	pruneCosts(retentionDays: number, now: number): void {
		this.db.query("DELETE FROM session_cost WHERE updated_at < ?").run(now - retentionDays * 86400);
	}

	record(metric: string, value: number, sampledAt: number): void {
		this.db
			.query(
				"INSERT INTO samples VALUES (?, ?, ?) ON CONFLICT(metric, sampled_at) DO UPDATE SET value = excluded.value",
			)
			.run(metric, sampledAt, value);
	}

	getSeries(metric: string, windowMinutes: number, now: number): number[] {
		const since = now - windowMinutes * 60;
		const rows = this.db
			.query(
				"SELECT value FROM samples WHERE metric = ? AND sampled_at >= ? ORDER BY sampled_at ASC",
			)
			.all(metric, since) as { value: number }[];
		return rows.map((r) => r.value);
	}

	prune(retentionMinutes: number, now: number): void {
		const cutoff = now - retentionMinutes * 60;
		this.db.query("DELETE FROM samples WHERE sampled_at < ?").run(cutoff);
	}

	close(): void {
		this.db.close();
	}
}

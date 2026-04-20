import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class History {
	private db: Database;

	constructor(path: string) {
		mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS samples (
				metric TEXT NOT NULL,
				sampled_at INTEGER NOT NULL,
				value REAL NOT NULL,
				PRIMARY KEY (metric, sampled_at)
			);
			CREATE INDEX IF NOT EXISTS samples_recent ON samples(metric, sampled_at DESC);
		`);
	}

	record(metric: string, value: number, sampledAt: number): void {
		this.db
			.query("INSERT INTO samples VALUES (?, ?, ?) ON CONFLICT(metric, sampled_at) DO UPDATE SET value = excluded.value")
			.run(metric, sampledAt, value);
	}

	getSeries(metric: string, windowMinutes: number, now: number): number[] {
		const since = now - windowMinutes * 60;
		const rows = this.db
			.query("SELECT value FROM samples WHERE metric = ? AND sampled_at >= ? ORDER BY sampled_at ASC")
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

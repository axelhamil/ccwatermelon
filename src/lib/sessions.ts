import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface SessionEntry {
	session_id: string;
	cwd: string;
	last_seen: number;
}

export class SessionsStore {
	constructor(private path: string) {
		mkdirSync(dirname(path), { recursive: true });
	}

	private load(): SessionEntry[] {
		try {
			const raw = readFileSync(this.path, "utf-8");
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
				console.error(`ccwatermelon: sessions store unreadable, resetting — ${err}`);
			}
			return [];
		}
	}

	private save(entries: SessionEntry[]): void {
		writeFileSync(this.path, JSON.stringify(entries), "utf-8");
	}

	record(sessionId: string, cwd: string, now: number): void {
		const entries = this.load();
		const key = `${sessionId}|${cwd}`;
		const existing = entries.findIndex((e) => `${e.session_id}|${e.cwd}` === key);
		const entry: SessionEntry = { session_id: sessionId, cwd, last_seen: now };
		if (existing >= 0) entries[existing] = entry;
		else entries.push(entry);
		this.save(entries);
	}

	countActive(staleMinutes: number, now: number): number {
		const cutoff = now - staleMinutes * 60_000;
		return this.load().filter((e) => e.last_seen >= cutoff).length;
	}
}

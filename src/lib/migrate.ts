import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

interface MigrationPair {
	from: string;
	to: string;
}

// One-shot best-effort move from the old `statusline-godlike` XDG paths to
// the renamed `ccstatusline-godlike` ones, preserving the real SQLite
// history and sessions data. Never throws: a failed migration just means the
// tool starts fresh at the new path, which is safe (not silent data loss —
// the old file stays in place untouched).
export function migrateLegacyPaths(pairs: MigrationPair[]): void {
	for (const { from, to } of pairs) {
		try {
			if (!existsSync(from) || existsSync(to)) continue;
			mkdirSync(dirname(to), { recursive: true });
			renameSync(from, to);
		} catch (err) {
			console.error(`ccstatusline-godlike: migration skipped for ${from} -> ${to}: ${err}`);
		}
	}
}

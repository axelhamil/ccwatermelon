import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

interface MigrationPair {
	from: string;
	to: string;
}

export function migrateLegacyPaths(pairs: MigrationPair[]): void {
	for (const { from, to } of pairs) {
		try {
			if (!existsSync(from) || existsSync(to)) continue;

			mkdirSync(dirname(to), { recursive: true });
			renameSync(from, to);
		} catch (err) {
			console.error(
				`ccwatermelon: could not move ${from} to ${to}, starting fresh there instead: ${err}`,
			);
		}
	}
}

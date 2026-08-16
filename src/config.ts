import { homedir } from "node:os";
import { join } from "node:path";

const dataDir = process.env.CCWATERMELON_DATA_DIR ?? join(homedir(), ".local/share/ccwatermelon");
const cacheDir = process.env.CCWATERMELON_CACHE_DIR ?? join(homedir(), ".cache/ccwatermelon");
// Two rounds of renaming: statusline-godlike -> ccstatusline-godlike ->
// ccwatermelon. Both older locations are still migrated so nobody loses their
// cost history by upgrading late.
const LEGACY_NAMES = ["ccstatusline-godlike", "statusline-godlike"] as const;

const legacyPaths = LEGACY_NAMES.map((name) => ({
	historyDb: join(homedir(), ".local/share", name, "history.db"),
	sessionsJson: join(homedir(), ".local/share", name, "sessions.json"),
	limitsCache: join(homedir(), ".cache", name, "limits.json"),
}));

export const CONFIG = {
	paths: {
		historyDb: join(dataDir, "history.db"),
		sessionsJson: join(dataDir, "sessions.json"),
		limitsCache: join(cacheDir, "limits.json"),
		settings: join(homedir(), ".claude/settings.json"),
		legacy: legacyPaths,
	},
	history: {
		retentionMinutes: 30,
		windowMinutes: 8,
		costRetentionDays: 30,
	},
	thresholds: {
		compactAlert: 85,
		fiveHourAlert: 90,
		sevenDayAlert: 80,
	},
	compaction: {
		fallbackWindow: 200_000,
		reserveRatio: 0.92,
	},
	limits: {
		cacheTtlSec: 60,
		fetchTimeoutMs: 3000,
	},
} as const;

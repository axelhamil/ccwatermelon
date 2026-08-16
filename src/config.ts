import { homedir } from "node:os";
import { join } from "node:path";

const dataDir =
	process.env.CCSTATUSLINE_DATA_DIR ?? join(homedir(), ".local/share/ccstatusline-godlike");
const cacheDir =
	process.env.CCSTATUSLINE_CACHE_DIR ?? join(homedir(), ".cache/ccstatusline-godlike");
const legacyDataDir = join(homedir(), ".local/share/statusline-godlike");
const legacyCacheDir = join(homedir(), ".cache/statusline-godlike");

export const CONFIG = {
	paths: {
		historyDb: join(dataDir, "history.db"),
		sessionsJson: join(dataDir, "sessions.json"),
		limitsCache: join(cacheDir, "limits.json"),
		settings: join(homedir(), ".claude/settings.json"),
		legacy: {
			historyDb: join(legacyDataDir, "history.db"),
			sessionsJson: join(legacyDataDir, "sessions.json"),
			limitsCache: join(legacyCacheDir, "limits.json"),
		},
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

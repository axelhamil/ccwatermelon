import { homedir } from "node:os";
import { join } from "node:path";

const LEGACY_NAMES = ["ccstatusline-godlike", "statusline-godlike"] as const;

function dataDir(): string {
	return process.env.CCWATERMELON_DATA_DIR ?? join(homedir(), ".local/share/ccwatermelon");
}

function cacheDir(): string {
	return process.env.CCWATERMELON_CACHE_DIR ?? join(homedir(), ".cache/ccwatermelon");
}

function claudeDir(): string {
	return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

export const CONFIG = {
	paths: {
		get historyDb() {
			return join(dataDir(), "history.db");
		},
		get limitsCache() {
			return join(cacheDir(), "limits.json");
		},
		get refreshLog() {
			return join(cacheDir(), "refresh.log");
		},
		get settings() {
			return join(claudeDir(), "settings.json");
		},
		get credentials() {
			return join(claudeDir(), ".credentials.json");
		},
		get legacy() {
			return LEGACY_NAMES.map((name) => ({
				historyDb: join(homedir(), ".local/share", name, "history.db"),
				limitsCache: join(homedir(), ".cache", name, "limits.json"),
			}));
		},
	},
	history: {
		retentionMinutes: 30,
		windowMinutes: 8,
		costRetentionDays: 30,
	},
	sessions: {
		activeWindowSec: 300,
		retentionSec: 86_400,
	},
	compaction: {
		fallbackWindow: 200_000,
	},
	limits: {
		cacheTtlSec: 60,
		fetchTimeoutMs: 3000,
	},
};

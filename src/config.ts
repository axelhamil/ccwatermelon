import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG = {
	paths: {
		historyDb: join(homedir(), ".local/share/statusline-godlike/history.db"),
		sessionsJson: join(homedir(), ".local/share/statusline-godlike/sessions.json"),
		limitsCache: join(homedir(), ".cache/statusline-godlike/limits.json"),
	},
	history: {
		retentionMinutes: 30,
		windowMinutes: 8,
	},
	thresholds: {
		contextAlert: 85,
		fiveHourAlert: 90,
	},
	limits: {
		cacheTtlSec: 60,
		fetchTimeoutMs: 3000,
	},
} as const;

import { homedir } from "node:os";
import { join } from "node:path";

function claudeDir(): string {
	return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

export const CONFIG = {
	paths: {
		get settings() {
			return join(claudeDir(), "settings.json");
		},
	},
	compaction: {
		fallbackWindow: 200_000,
	},
};

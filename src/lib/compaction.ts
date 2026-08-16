import { readFileSync } from "node:fs";
import { CONFIG } from "../config";

let cached: number | null | undefined;

function readSettings(): { autoCompactEnabled?: boolean; autoCompactWindow?: number } {
	try {
		return JSON.parse(readFileSync(CONFIG.paths.settings, "utf-8"));
	} catch {
		return {};
	}
}

export function compactThreshold(contextWindowSize: number): number | null {
	if (cached !== undefined) return cached;
	const settings = readSettings();
	if (settings.autoCompactEnabled === false) {
		cached = null;
		return cached;
	}
	const window = contextWindowSize || CONFIG.compaction.fallbackWindow;
	const ceiling = Math.round(window * CONFIG.compaction.reserveRatio);
	cached = settings.autoCompactWindow ? Math.min(settings.autoCompactWindow, ceiling) : ceiling;
	return cached;
}

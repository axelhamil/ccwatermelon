import { readFileSync } from "node:fs";
import { CONFIG } from "../config";

let cached: number | null | undefined;

function readSettings(): { autoCompactEnabled?: boolean; autoCompactWindow?: number } {
	try {
		return JSON.parse(readFileSync(CONFIG.paths.settings, "utf-8"));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.error(`ccstatusline-godlike: settings.json unreadable — ${err}`);
		}
		return {};
	}
}

export function compactThreshold(
	contextWindowSize: number,
	reserveRatio: number = CONFIG.compaction.reserveRatio,
): number | null {
	if (cached !== undefined) return cached;
	const settings = readSettings();
	if (settings.autoCompactEnabled === false) {
		cached = null;
		return cached;
	}
	const window = contextWindowSize || CONFIG.compaction.fallbackWindow;
	const safeRatio =
		Number.isFinite(reserveRatio) && reserveRatio > 0
			? reserveRatio
			: CONFIG.compaction.reserveRatio;
	const ceiling = Math.round(window * safeRatio);
	cached = settings.autoCompactWindow ? Math.min(settings.autoCompactWindow, ceiling) : ceiling;
	return cached;
}

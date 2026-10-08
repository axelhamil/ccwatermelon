import type { ColorName } from "./format";

export type PressureLevel = "calm" | "warn" | "critical" | "panic";

const WARN_MARGIN = 20;

export function pressureZones(alertAbove: number): { warnAbove: number; panicAbove: number } {
	return {
		warnAbove: alertAbove - WARN_MARGIN,
		panicAbove: alertAbove + (100 - alertAbove) / 2,
	};
}

export function pressureLevel(pct: number | null, alertAbove: number): PressureLevel {
	if (pct === null) return "calm";

	const { warnAbove, panicAbove } = pressureZones(alertAbove);
	if (pct > panicAbove) return "panic";
	if (pct > alertAbove) return "critical";
	if (pct > warnAbove) return "warn";

	return "calm";
}

export function isAlerting(level: PressureLevel): boolean {
	return level === "critical" || level === "panic";
}

export function toneOf(level: PressureLevel, calm: ColorName): ColorName {
	if (isAlerting(level)) return "red";

	return level === "warn" ? "peach" : calm;
}

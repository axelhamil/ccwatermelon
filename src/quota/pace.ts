const MIN_ELAPSED_RATIO = 0.1;

export const FIVE_HOUR_WINDOW_SEC = 5 * 3600;
export const SEVEN_DAY_WINDOW_SEC = 7 * 86_400;

export function projectedAtReset(
	pct: number | null,
	resetsAt: number | null,
	windowSec: number,
	now: number,
): number | null {
	if (pct === null || resetsAt === null) return null;

	const elapsedRatio = 1 - (resetsAt - now) / windowSec;
	if (elapsedRatio < MIN_ELAPSED_RATIO || elapsedRatio > 1) return null;

	return Math.round(pct / elapsedRatio);
}

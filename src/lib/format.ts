export const PALETTE = {
	text: [205, 214, 244],
	subtext: [166, 173, 200],
	dim: [108, 112, 134],
	red: [243, 139, 168],
	peach: [250, 179, 135],
	yellow: [249, 226, 175],
	green: [166, 227, 161],
	teal: [148, 226, 213],
	sky: [137, 220, 235],
	blue: [137, 180, 250],
	lavender: [180, 190, 254],
	mauve: [203, 166, 247],
	pink: [245, 194, 231],
} as const;

export type ColorName = keyof typeof PALETTE;

export function color(text: string, name: ColorName): string {
	const [r, g, b] = PALETTE[name];
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

export function formatCost(usd: number): string {
	if (usd === 0) return "$0.00";
	if (usd < 10) return `$${usd.toFixed(2)}`;
	return `$${usd.toFixed(1)}`;
}

export function formatDuration(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
	if (m > 0) return `${m}m`;
	return `${s}s`;
}

export function formatTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatPct(n: number): string {
	return `${Math.round(n)}%`;
}

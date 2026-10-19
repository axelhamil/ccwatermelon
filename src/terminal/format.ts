const SGR_CODES = {
	bold: "1",
	dim: "2",
	red: "31",
	green: "32",
	yellow: "33",
	blue: "34",
	magenta: "35",
	cyan: "36",
} as const;

export type ColorName = keyof typeof SGR_CODES;

export function color(text: string, name: ColorName): string {
	return text === "" ? "" : `\x1b[${SGR_CODES[name]}m${text}\x1b[0m`;
}

export function tinted(text: string, name: ColorName | null): string {
	return name === null ? text : color(text, name);
}

export function labelled(label: string, value: string): string {
	return `${color(label, "dim")} ${value}`;
}

const LINK_OPEN = "\x1b]8;;";
const LINK_END = "\x07";

export function link(text: string, url: string | null): string {
	return url === null ? text : `${LINK_OPEN}${url}${LINK_END}${text}${LINK_OPEN}${LINK_END}`;
}

export function formatDuration(ms: number): string {
	const totalSec = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
	if (m > 0) return `${m}m`;
	return `${s}s`;
}

export function formatTokens(n: number): string {
	const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
	if (safe < 1000) return `${Math.round(safe)}`;

	const thousands = Math.round(safe / 1000);
	if (thousands < 1000) return `${thousands}k`;

	return `${(safe / 1_000_000).toFixed(1)}M`;
}

export function formatPct(n: number): string {
	const safe = Number.isFinite(n) ? n : 0;
	if (Math.abs(safe) >= 10) return `${Math.round(safe)}%`;

	return `${Math.round(safe * 10) / 10}%`;
}

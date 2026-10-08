// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI SGR sequences to strip them
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const ELLIPSIS = "…";
const FALLBACK_WIDTH = 80;

type Range = readonly [number, number];

const ZERO_WIDTH: readonly Range[] = [
	[0x0, 0x1f],
	[0x7f, 0x9f],
	[0x300, 0x36f],
	[0x1ab0, 0x1aff],
	[0x1dc0, 0x1dff],
	[0x200d, 0x200d],
	[0x20d0, 0x20ff],
	[0xfe0f, 0xfe0f],
];

const WIDE: readonly Range[] = [
	[0x1100, 0x115f],
	[0x231a, 0x231b],
	[0x2329, 0x232a],
	[0x23e9, 0x23ec],
	[0x23f0, 0x23f0],
	[0x23f3, 0x23f3],
	[0x25fd, 0x25fe],
	[0x2614, 0x2615],
	[0x2648, 0x2653],
	[0x267f, 0x267f],
	[0x2693, 0x2693],
	[0x26a1, 0x26a1],
	[0x26aa, 0x26ab],
	[0x26bd, 0x26be],
	[0x26c4, 0x26c5],
	[0x26ce, 0x26ce],
	[0x26d4, 0x26d4],
	[0x26ea, 0x26ea],
	[0x26f2, 0x26f3],
	[0x26f5, 0x26f5],
	[0x26fa, 0x26fa],
	[0x26fd, 0x26fd],
	[0x2705, 0x2705],
	[0x270a, 0x270b],
	[0x2728, 0x2728],
	[0x274c, 0x274c],
	[0x274e, 0x274e],
	[0x2753, 0x2755],
	[0x2757, 0x2757],
	[0x2795, 0x2797],
	[0x27b0, 0x27b0],
	[0x27bf, 0x27bf],
	[0x2b1b, 0x2b1c],
	[0x2b50, 0x2b50],
	[0x2b55, 0x2b55],
	[0x2e80, 0x303e],
	[0x3040, 0xa4cf],
	[0xac00, 0xd7a3],
	[0xf900, 0xfaff],
	[0xfe30, 0xfe6f],
	[0xff00, 0xff60],
	[0xffe0, 0xffe6],
	[0x1f300, 0x1faff],
	[0x20000, 0x3fffd],
];

function isIn(ranges: readonly Range[], cp: number): boolean {
	return ranges.some(([from, to]) => cp >= from && cp <= to);
}

function codePointWidth(cp: number): 0 | 1 | 2 {
	if (isIn(ZERO_WIDTH, cp)) return 0;
	if (isIn(WIDE, cp)) return 2;

	return 1;
}

export function stripAnsi(s: string): string {
	return s.replace(ANSI_RE, "");
}

export function visualWidth(s: string): number {
	let width = 0;
	for (const ch of stripAnsi(s)) {
		width += codePointWidth(ch.codePointAt(0) ?? 0);
	}

	return width;
}

export function truncateToWidth(plainText: string, maxWidth: number): string {
	if (visualWidth(plainText) <= maxWidth) return plainText;

	let kept = "";
	let width = visualWidth(ELLIPSIS);
	for (const ch of plainText) {
		width += codePointWidth(ch.codePointAt(0) ?? 0);
		if (width > maxWidth) break;
		kept += ch;
	}

	return `${kept}${ELLIPSIS}`;
}

function positiveInt(value: string | undefined): number | null {
	const parsed = Number.parseInt(value ?? "", 10);

	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveWidth(): number {
	return (
		positiveInt(process.env.CCWATERMELON_WIDTH) ??
		positiveInt(String(process.stdout.columns ?? "")) ??
		positiveInt(process.env.COLUMNS) ??
		FALLBACK_WIDTH
	);
}

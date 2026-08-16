// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI SGR sequences to strip them
const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
	return s.replace(ANSI_RE, "");
}

// Zero-width: control chars, combining marks, variation selectors, ZWJ.
// Wide (2 cells): CJK, Hangul, fullwidth forms, most emoji blocks.
// Nerd Font private-use icons render single-cell in every patched terminal
// font in use, so PUA planes stay width 1 rather than the Unicode-assigned 2.
function codePointWidth(cp: number): 0 | 1 | 2 {
	if (cp === 0) return 0;
	if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f)) return 0;
	if (
		(cp >= 0x300 && cp <= 0x36f) ||
		(cp >= 0x1ab0 && cp <= 0x1aff) ||
		(cp >= 0x1dc0 && cp <= 0x1dff) ||
		(cp >= 0x20d0 && cp <= 0x20ff) ||
		cp === 0xfe0f ||
		cp === 0x200d
	) {
		return 0;
	}
	if (
		(cp >= 0x1100 && cp <= 0x115f) ||
		cp === 0x2329 ||
		cp === 0x232a ||
		(cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
		(cp >= 0xac00 && cp <= 0xd7a3) ||
		(cp >= 0xf900 && cp <= 0xfaff) ||
		(cp >= 0xfe30 && cp <= 0xfe6f) ||
		(cp >= 0xff00 && cp <= 0xff60) ||
		(cp >= 0xffe0 && cp <= 0xffe6) ||
		(cp >= 0x1f300 && cp <= 0x1faff) ||
		(cp >= 0x20000 && cp <= 0x3fffd)
	) {
		return 2;
	}
	if (
		(cp >= 0xe000 && cp <= 0xf8ff) ||
		(cp >= 0xf0000 && cp <= 0xffffd) ||
		(cp >= 0x100000 && cp <= 0x10fffd)
	) {
		return 1;
	}
	return 1;
}

export function visualWidth(s: string): number {
	const clean = stripAnsi(s);
	let w = 0;
	for (const ch of clean) {
		w += codePointWidth(ch.codePointAt(0) ?? 0);
	}
	return w;
}

export function resolveWidth(): number {
	const envWidth = process.env.CCSTATUSLINE_WIDTH;
	if (envWidth) {
		const n = Number.parseInt(envWidth, 10);
		if (Number.isFinite(n) && n > 0) return n;
	}
	if (process.stdout.columns && process.stdout.columns > 0) {
		return process.stdout.columns;
	}
	const columnsEnv = process.env.COLUMNS;
	if (columnsEnv) {
		const n = Number.parseInt(columnsEnv, 10);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return 80;
}

const MOCHA_PALETTE = {
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

export type ColorName = keyof typeof MOCHA_PALETTE;
export type Rgb = readonly [number, number, number];

const WATERMELON_PALETTE = {
	text: [244, 240, 226],
	subtext: [168, 198, 159],
	dim: [90, 110, 86],
	red: [255, 77, 109],
	peach: [255, 143, 163],
	yellow: [247, 212, 136],
	green: [123, 201, 80],
	teal: [63, 164, 106],
	sky: [111, 207, 151],
	blue: [79, 180, 119],
	lavender: [201, 228, 166],
	mauve: [232, 106, 138],
	pink: [255, 168, 186],
} as const satisfies Record<ColorName, Rgb>;

export const THEMES = {
	watermelon: WATERMELON_PALETTE,
	mocha: MOCHA_PALETTE,
} as const;

export type ThemeName = keyof typeof THEMES;

export const PALETTE: Record<ColorName, Rgb> = { ...WATERMELON_PALETTE };

export function applyPaletteOverrides(
	overrides: Record<string, Rgb>,
	theme: ThemeName = "watermelon",
): void {
	const base = THEMES[theme] ?? WATERMELON_PALETTE;
	for (const key of Object.keys(MOCHA_PALETTE) as ColorName[]) {
		PALETTE[key] = overrides[key] ?? base[key];
	}
}

export function color(text: string, name: ColorName): string {
	const rgb = PALETTE[name];
	return colorRgb(text, rgb);
}

const LINK_OPEN = "\x1b]8;;";
const LINK_END = "\x07";

export function link(text: string, url: string | null): string {
	return url === null ? text : `${LINK_OPEN}${url}${LINK_END}${text}${LINK_OPEN}${LINK_END}`;
}

export function colorRgb(text: string, rgb: Rgb): string {
	const [r, g, b] = rgb;
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

export function lerpColor(t: number, a: Rgb, b: Rgb): Rgb {
	const c = Math.max(0, Math.min(1, t));
	const ai = (i: number) => a[i] ?? 0;
	const bi = (i: number) => b[i] ?? 0;
	return [
		Math.round(ai(0) + (bi(0) - ai(0)) * c),
		Math.round(ai(1) + (bi(1) - ai(1)) * c),
		Math.round(ai(2) + (bi(2) - ai(2)) * c),
	];
}

function gradientStops(): readonly Rgb[] {
	return [
		PALETTE.pink,
		PALETTE.mauve,
		PALETTE.lavender,
		PALETTE.sky,
		PALETTE.teal,
		PALETTE.green,
		PALETTE.yellow,
		PALETTE.peach,
	];
}

export function gradientText(text: string, drift = 0): string {
	const chars = [...text];
	const stops = gradientStops();
	const span = Math.max(1, chars.length - 1);
	const stopAt = (index: number) => stops[index % stops.length] ?? PALETTE.text;

	return chars
		.map((ch, i) => {
			if (ch === " ") return ch;

			const position = (i / span) * (stops.length - 1) + drift;
			const from = Math.floor(position);

			return colorRgb(ch, lerpColor(position - from, stopAt(from), stopAt(from + 1)));
		})
		.join("");
}

const COST_DISPLAY_CEILING = 999_999;
const WHOLE_DOLLARS_FROM = 99.95;

export function formatCost(usd: number): string {
	const safe = Number.isFinite(usd) ? Math.min(Math.max(usd, 0), COST_DISPLAY_CEILING) : 0;
	if (safe === 0) return "$0.00";
	if (safe < 10) return `$${safe.toFixed(2)}`;
	if (safe >= COST_DISPLAY_CEILING) return `$${COST_DISPLAY_CEILING}+`;
	if (safe >= WHOLE_DOLLARS_FROM) return `$${Math.round(safe)}`;
	return `$${safe.toFixed(1)}`;
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
	return `${Math.round(safe)}%`;
}

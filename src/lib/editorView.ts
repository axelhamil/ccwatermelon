import type { EditorState, Row, ThresholdKey } from "./editor";
import { previewData, ROWS, segmentView, themeOf, thresholdOf } from "./editor";
import type { ColorName } from "./format";
import { applyPaletteOverrides, color, colorRgb, lerpColor, PALETTE, THEMES } from "./format";
import type { PressureLevel } from "./pressure";
import { pressureLevel, pressureZones } from "./pressure";
import { render } from "./render";
import type { ConfigFile } from "./userConfig";
import { defaultConfig, mergeConfig } from "./userConfig";
import { truncateToWidth, visualWidth } from "./width";

interface Tween {
	from: number;
	to: number;
	startedAt: number;
}

export interface Motion {
	knobs: Partial<Record<ThresholdKey, Tween>>;
	widthDemoStartedAt: number | null;
	pressureDemoStartedAt: number | null;
	savedAt: number | null;
	quitArmed: boolean;
	reduced: boolean;
}

export interface Viewport {
	columns: number;
	rows: number;
}

const KNOB_MS = 180;
const WIDTH_DEMO_MS = 5200;
const PRESSURE_DEMO_MS = 4800;
const SAVED_TOAST_MS = 900;
const MAX_PREVIEW_WIDTH = 110;
const MIN_PREVIEW_WIDTH = 34;
const MAX_TRACK_CELLS = 40;
const MIN_TRACK_CELLS_WITH_ZONES = 20;
const MIN_TRACK_CELLS = 4;
const MARKER_WIDTH = 2;
const LABEL_WIDTH = 10;
const VALUE_WIDTH = 5;
const ZONES_GAP = "  ";
const ZONES_WIDTH = ZONES_GAP.length + "warns past 80%, panics past 100%".length;
const MIN_PATH_WIDTH = 12;
const HINT_GAP = "   ";
const INDENT = "  ";
// biome-ignore lint/suspicious/noControlCharactersInRegex: splits a line around its ANSI SGR sequences
const SGR_SPLIT_RE = /(\x1b\[[0-9;]*m)/;
const SECTION_OF: Record<Row["kind"], string> = {
	threshold: "Alerts",
	theme: "Look",
	segment: "Segments",
};
const ZONE_TONES: Record<PressureLevel, ColorName> = {
	calm: "green",
	warn: "peach",
	critical: "red",
	panic: "pink",
};

interface Layout {
	chrome: number;
	minRoom: number;
	framed: boolean;
	spaced: boolean;
	preview: boolean;
}

const LAYOUTS: readonly Layout[] = [
	{ chrome: 12, minRoom: 3, framed: true, spaced: true, preview: true },
	{ chrome: 6, minRoom: 3, framed: true, spaced: true, preview: false },
	{ chrome: 3, minRoom: 1, framed: true, spaced: false, preview: false },
];
const BARE_LAYOUT: Layout = { chrome: 0, minRoom: 0, framed: false, spaced: false, preview: false };

function clip(line: string, columns: number): string {
	if (visualWidth(line) <= columns) return line;

	let room = columns;

	return line
		.split(SGR_SPLIT_RE)
		.map((part) => {
			if (SGR_SPLIT_RE.test(part)) return part;
			if (room <= 0) return "";

			const kept = truncateToWidth(part, room);
			room = kept === part ? room - visualWidth(kept) : 0;

			return kept;
		})
		.join("");
}

function firstFitting(candidates: string[], columns: number): string {
	const fitting = candidates.find((candidate) => visualWidth(candidate) <= columns);

	return fitting ?? clip(candidates.at(-1) ?? "", columns);
}

function fitHints(hints: string[], columns: number): string {
	const kept = hints.filter(
		(_, index) => visualWidth(hints.slice(0, index + 1).join(HINT_GAP)) <= columns,
	);

	return kept.join(HINT_GAP);
}

function easeOut(t: number): number {
	return 1 - (1 - t) ** 3;
}

function easeInOut(t: number): number {
	return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function progress(startedAt: number | null, durationMs: number, now: number): number | null {
	if (startedAt === null) return null;

	const t = (now - startedAt) / durationMs;

	return t >= 0 && t < 1 ? t : null;
}

function thereAndBack(t: number): number {
	return easeInOut(t < 0.5 ? t * 2 : (1 - t) * 2);
}

function tweened(tween: Tween | undefined, settled: number, now: number): number {
	const t = tween ? progress(tween.startedAt, KNOB_MS, now) : null;
	if (!tween || t === null) return settled;

	return tween.from + (tween.to - tween.from) * easeOut(t);
}

export function isAnimating(motion: Motion, now: number): boolean {
	const knobMoving = Object.values(motion.knobs).some(
		(tween) => progress(tween.startedAt, KNOB_MS, now) !== null,
	);

	return (
		knobMoving ||
		progress(motion.widthDemoStartedAt, WIDTH_DEMO_MS, now) !== null ||
		progress(motion.pressureDemoStartedAt, PRESSURE_DEMO_MS, now) !== null ||
		progress(motion.savedAt, SAVED_TOAST_MS, now) !== null
	);
}

export function isSaveToastOver(motion: Motion, now: number): boolean {
	return motion.savedAt !== null && progress(motion.savedAt, SAVED_TOAST_MS, now) === null;
}

function sliceRule(width: number): string {
	const stops = [PALETTE.green, PALETTE.text, PALETTE.red] as const;

	return Array.from({ length: width }, (_, i) => {
		const position = (i / Math.max(1, width - 1)) * (stops.length - 1);
		const from = Math.min(stops.length - 2, Math.floor(position));
		const start = stops[from] ?? PALETTE.green;
		const end = stops[from + 1] ?? PALETTE.red;

		return colorRgb("▁", lerpColor(position - from, start, end));
	}).join("");
}

function track(alertAbove: number, cells: number): string {
	const knobCell = Math.min(cells - 1, Math.round((alertAbove / 100) * cells));

	return Array.from({ length: cells }, (_, cell) =>
		cell === knobCell
			? color("●", "text")
			: color("━", ZONE_TONES[pressureLevel((cell / cells) * 100, alertAbove)]),
	).join("");
}

function thresholdRow(
	file: ConfigFile,
	row: Extract<Row, { kind: "threshold" }>,
	motion: Motion,
	now: number,
	columns: number,
): string {
	const value = thresholdOf(file, row.key);
	const shown = tweened(motion.knobs[row.key], value, now);
	const { warnAbove, panicAbove } = pressureZones(value);
	const zones = `warns past ${Math.max(0, warnAbove)}%, panics past ${Math.floor(panicAbove)}%`;
	const trackRoom = columns - MARKER_WIDTH - LABEL_WIDTH - VALUE_WIDTH;
	const showsZones = trackRoom - ZONES_WIDTH >= MIN_TRACK_CELLS_WITH_ZONES;
	const freeCells = showsZones ? trackRoom - ZONES_WIDTH : trackRoom;
	const cells = Math.max(MIN_TRACK_CELLS, Math.min(MAX_TRACK_CELLS, freeCells));
	const gauge = `${row.label.padEnd(LABEL_WIDTH)}${track(shown, cells)} ${color(`${value}%`.padStart(4), "text")}`;

	return showsZones ? `${gauge}${ZONES_GAP}${color(zones, "dim")}` : gauge;
}

function themeRow(file: ConfigFile): string {
	const selected = themeOf(file);
	const names = Object.keys(THEMES).map((name) =>
		name === selected ? color(`◆ ${name}`, "text") : color(`◇ ${name}`, "dim"),
	);

	return `${"theme".padEnd(10)}${names.join("   ")}`;
}

function segmentRow(
	file: ConfigFile,
	row: Extract<Row, { kind: "segment" }>,
	columns: number,
): string {
	const view = segmentView(file, row.spec);
	const state = view.enabled ? color("on ", "green") : color("off", "dim");
	const name = `${color(row.spec.id.padEnd(16), view.enabled ? "subtext" : "dim")}${state}`;
	const line = `line ${view.line}`;
	const placement = row.spec.priority !== undefined ? `${line}   priority ${view.priority}` : line;
	const edited = view.edited ? color(" edited", "peach") : "";
	const candidates = [
		`${name}   ${color(placement, "dim")}${edited}`,
		`${name}   ${color(line, "dim")}${edited}`,
		`${name}${edited}`,
	];

	return firstFitting(candidates, columns - MARKER_WIDTH);
}

function rowText(file: ConfigFile, row: Row, motion: Motion, now: number, columns: number): string {
	if (row.kind === "threshold") return thresholdRow(file, row, motion, now, columns);
	if (row.kind === "theme") return themeRow(file);

	return segmentRow(file, row, columns);
}

function listLines(
	state: EditorState,
	motion: Motion,
	now: number,
	viewport: Viewport,
	headings: boolean,
): string[] {
	const room = viewport.rows;
	const lines = ROWS.flatMap((row, index) => {
		const opensSection = headings && ROWS[index - 1]?.kind !== row.kind;
		const marker = index === state.cursor ? color("▌", "red") : " ";
		const text = `${marker} ${rowText(state.file, row, motion, now, viewport.columns)}`;
		const heading = { text: `${INDENT}${color(SECTION_OF[row.kind], "dim")}`, index };

		return opensSection ? [heading, { text, index }] : [{ text, index }];
	});
	const cursorLine = lines.findLastIndex((line) => line.index === state.cursor);
	const start = Math.max(0, Math.min(cursorLine - Math.floor(room / 2), lines.length - room));

	return lines.slice(start, start + room).map((line) => line.text);
}

function rowHints(row: Row | undefined): string[] {
	if (!row) return [];
	if (row.kind === "threshold") return ["←→ adjust", "[ ] by 5", "r reset"];
	if (row.kind === "theme") return ["←→ switch", "r reset"];

	const relocate = row.spec.relocatable ? ["l line"] : [];

	return ["space on/off", "←→ priority", ...relocate, "r reset"];
}

function keyHints(row: Row | undefined, motion: Motion, columns: number): string[] {
	const dim = (hint: string) => color(hint, "dim");
	const demos = motion.reduced ? [] : ["w width demo", "p pressure demo"];
	const quit = motion.quitArmed ? color("q again to drop your changes", "red") : dim("q quit");

	return [
		fitHints(["↑↓ move", ...rowHints(row)].map(dim), columns),
		fitHints([dim("s save"), quit, ...demos.map(dim)], columns),
	];
}

function titleLine(configPath: string, columns: number): string {
	const title = `${INDENT}🍉 ${color("ccwatermelon", "text")}`;
	const pathRoom = columns - visualWidth(title) - 1;
	if (pathRoom < MIN_PATH_WIDTH) return title;

	const path = truncateToWidth(configPath, pathRoom);
	const gap = columns - visualWidth(title) - visualWidth(path);

	return `${title}${" ".repeat(gap)}${color(path, "dim")}`;
}

function footerLines(
	state: EditorState,
	motion: Motion,
	now: number,
	columns: number,
	configPath: string,
): string[] {
	const saved = progress(motion.savedAt, SAVED_TOAST_MS, now) !== null;
	if (!saved) return keyHints(ROWS[state.cursor], motion, columns);

	const toast = state.dirty
		? `saved to ${configPath}`
		: `nothing to save, ${configPath} is unchanged`;

	return [color(truncateToWidth(toast, columns), "green"), ""];
}

function previewLines(
	state: EditorState,
	motion: Motion,
	now: number,
	viewport: Viewport,
): string[] {
	const resolved = mergeConfig(defaultConfig(), state.file);
	const idleWidth = Math.min(viewport.columns - INDENT.length, MAX_PREVIEW_WIDTH);
	const narrowWidth = Math.min(idleWidth, MIN_PREVIEW_WIDTH);
	const widthT = progress(motion.widthDemoStartedAt, WIDTH_DEMO_MS, now);
	const pressureT = progress(motion.pressureDemoStartedAt, PRESSURE_DEMO_MS, now);
	const width =
		widthT === null
			? idleWidth
			: Math.round(idleWidth - (idleWidth - narrowWidth) * thereAndBack(widthT));
	const pressure = pressureT === null ? null : Math.round(4 + 95 * thereAndBack(pressureT));
	const data = previewData(resolved, pressure, Math.floor(now / 1000));
	const rendered = render(data, resolved.segments, width, now).split("\n");
	const ruler =
		widthT === null
			? color(pressure === null ? "" : `every gauge at ${pressure}%`, "dim")
			: color(`${"─".repeat(Math.max(0, width - 9))} ${width} cols`, "dim");

	return [...rendered, "", "", ""].slice(0, 4).concat(ruler);
}

export function drawEditor(
	state: EditorState,
	motion: Motion,
	now: number,
	viewport: Viewport,
	configPath: string,
): string[] {
	const resolved = mergeConfig(defaultConfig(), state.file);
	applyPaletteOverrides(resolved.colors, resolved.theme);

	const { columns, rows } = viewport;
	const width = Math.min(columns, MAX_PREVIEW_WIDTH + INDENT.length);
	const layout = LAYOUTS.find(({ chrome, minRoom }) => rows >= chrome + minRoom) ?? BARE_LAYOUT;
	const indented = (lines: string[]) => lines.map((line) => `${INDENT}${line}`);
	const hintColumns = columns - INDENT.length;
	const title = titleLine(configPath, width);
	const header = layout.spaced ? [title, sliceRule(width)] : [title];
	const preview = indented(previewLines(state, motion, now, viewport));
	const list = listLines(
		state,
		motion,
		now,
		{ columns, rows: rows - layout.chrome },
		layout.spaced,
	);
	const footer = indented(footerLines(state, motion, now, hintColumns, configPath));
	const sections = [
		layout.framed ? header : [],
		layout.preview ? preview : [],
		list,
		layout.framed ? footer : [],
	].filter((section) => section.length > 0);

	return sections
		.flatMap((section, index) => (layout.spaced && index > 0 ? ["", ...section] : section))
		.map((line) => clip(line, columns));
}

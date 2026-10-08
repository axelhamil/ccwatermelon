import type { Chunk } from "./fit";
import { fitChunks } from "./fit";
import type { ColorName } from "./format";
import { color, formatCost, formatDuration, formatPct, formatTokens, gradientText } from "./format";
import { brailleGauge } from "./gauge";
import { isAlerting, type PressureLevel, toneOf } from "./pressure";
import { resetOf } from "./reset";
import type { SegmentConfig } from "./segments";
import {
	dot,
	GAUGE_SEGMENTS,
	isEnabled,
	optionalChunks,
	PACE_SEGMENT,
	priorityOf,
} from "./segments";
import type { StatuslineData } from "./types";
import { resolveWidth, truncateToWidth, visualWidth } from "./width";

const MELON = "🍉";
const COST_ICON = "\u{f140b}";
const COST_MILESTONES = [10, 25, 50, 100];
const ROW_INDENT = "\u{2800}\u{2800} ";
const MIN_LABEL_WIDTH = 6;
const HEADROOM_SHOWN_ABOVE_PCT = 60;
const PACE_WARN_ABOVE_PCT = 85;
const PACE_DISPLAY_CEILING = 999;
const DRIFT_PER_SECOND = 0.35;

function shrinkToFit(labels: string[], excess: number): string[] {
	const shrunk = [...labels];
	let remaining = excess;

	while (remaining > 0) {
		const widths = shrunk.map(visualWidth);
		const widest = widths.indexOf(Math.max(...widths));
		const current = widths[widest] ?? 0;
		if (current <= MIN_LABEL_WIDTH) break;

		const target = Math.max(MIN_LABEL_WIDTH, current - remaining);
		shrunk[widest] = truncateToWidth(shrunk[widest] ?? "", target);
		remaining -= current - target;
	}

	return shrunk;
}

function driftOf(now: number): number {
	return Math.floor(now / 1000) * DRIFT_PER_SECOND;
}

function gaugeHead(
	label: string,
	pct: number,
	level: PressureLevel,
	calm: ColorName,
	now: number,
	pctWidth = 0,
): string {
	const tone = toneOf(level, calm);
	const isPulseBeat = isAlerting(level) && Math.floor(now / 1000) % 2 === 1;

	return (
		color(`${label} ${formatPct(pct).padStart(pctWidth)}`, tone) +
		color(brailleGauge(pct), isPulseBeat ? "pink" : tone)
	);
}

function headroomNote(headroom: number | null, pct: number): string {
	if (headroom === null) return "";
	if (headroom < 0) return ` ${color(`+${formatTokens(-headroom)}`, "red")}`;

	return pct > HEADROOM_SHOWN_ABOVE_PCT ? ` ${color(`↓${formatTokens(headroom)}`, "dim")}` : "";
}

function contextChunk(d: StatuslineData, now: number, segments: SegmentConfig): Chunk[] {
	const spec = GAUGE_SEGMENTS.contextGauge;
	const pct = d.compactPct ?? d.contextPct;
	if (pct === null || !isEnabled(segments, spec.id)) return [];

	const gauge = gaugeHead("conv", pct, d.contextLevel, "sky", now);

	return [
		{
			text: ` ${dot()} ${gauge}${headroomNote(d.compactHeadroom, pct)}`,
			priority: priorityOf(segments, spec.id, spec.priority),
		},
	];
}

function identityCore(d: StatuslineData, dirName: string, branchName: string, now: number): string {
	const mood = color(d.mood.face, d.mood.color);
	const spark = d.celebrationMode ? gradientText(" ✨", driftOf(now)) : "";
	const dir = color(dirName, "subtext");
	const branch = color(branchName, "mauve") + (d.git.dirty ? color("*", "green") : "");
	const insertions = d.git.insertions > 0 ? ` ${color(`+${d.git.insertions}`, "green")}` : "";
	const deletions = d.git.deletions > 0 ? ` ${color(`-${d.git.deletions}`, "red")}` : "";
	const contextBadge = /1M/.test(d.modelName) ? color(" 1M", "dim") : "";
	const model = color(d.modelName.replace(/\s*\(.*?\)\s*$/, ""), "peach") + contextBadge;
	const separator = dot();

	return `${mood}${spark} ${dir} ${separator} ${branch}${insertions}${deletions} ${separator} ${model}`;
}

function renderIdentityLine(
	d: StatuslineData,
	now: number,
	segments: SegmentConfig,
	width: number,
): string {
	const excess = visualWidth(identityCore(d, d.dirName, d.git.branch, now)) - width;
	const [dirName = d.dirName, branchName = d.git.branch] = shrinkToFit(
		[d.dirName, d.git.branch],
		excess,
	);

	return fitChunks(
		identityCore(d, dirName, branchName, now),
		[...contextChunk(d, now, segments), ...optionalChunks(1, d, now, segments)],
		width,
	);
}

function costDisplay(cost: number, now: number): string {
	const text = `${COST_ICON} ${formatCost(cost)}`;

	return COST_MILESTONES.some((milestone) => cost >= milestone)
		? gradientText(text, driftOf(now))
		: color(text, "teal");
}

function renderEconomyLine(
	d: StatuslineData,
	now: number,
	segments: SegmentConfig,
	width: number,
): string {
	const duration = color(`(${formatDuration(d.sessionDurationMs)})`, "dim");
	const core = `${costDisplay(d.sessionCost, now)} ${duration}`;

	return fitChunks(core, optionalChunks(2, d, now, segments), width);
}

interface Cell {
	text: string;
	tone: ColorName;
}

type Column = "countdown" | "clock" | "pace" | "note";

const BLANK: Cell = { text: "", tone: "dim" };
const COLUMN_SETS: readonly (readonly Column[])[] = [
	["countdown", "clock", "pace", "note"],
	["countdown", "pace", "note"],
	["countdown", "note"],
	["note"],
	[],
];
const RIGHT_ALIGNED: readonly Column[] = ["pace"];

interface QuotaRow {
	label: string;
	pct: number;
	level: PressureLevel;
	calm: ColorName;
	cells: Record<Column, Cell>;
}

function paceTone(projectedPct: number): ColorName {
	if (projectedPct > 100) return "red";

	return projectedPct > PACE_WARN_ABOVE_PCT ? "peach" : "dim";
}

function paceCell(projectedPct: number | null): Cell {
	if (projectedPct === null) return BLANK;

	const shown = formatPct(Math.min(projectedPct, PACE_DISPLAY_CEILING));

	return { text: `end ${shown}`, tone: paceTone(projectedPct) };
}

function limitCell(d: StatuslineData): Cell {
	if (d.etaMinutes === 0) return { text: "⚠ limit reached", tone: "red" };
	if (d.etaMinutes !== null) {
		return { text: `⚠ limit in ${formatDuration(d.etaMinutes * 60_000)}`, tone: "red" };
	}

	return d.etaCooling ? { text: "↓ cooling", tone: "green" } : BLANK;
}

function quotaRows(d: StatuslineData, segments: SegmentConfig, now: number): QuotaRow[] {
	const showPace = isEnabled(segments, PACE_SEGMENT.id);
	const quotas = [
		{
			spec: GAUGE_SEGMENTS.fiveHourGauge,
			label: "5h",
			pct: d.fiveHourPct,
			level: d.fiveHourLevel,
			projectedPct: d.fiveHourProjectedPct,
			resetsAt: d.fiveHourResetsAt,
			calm: "sky" as const,
			note: limitCell(d),
		},
		{
			spec: GAUGE_SEGMENTS.sevenDayGauge,
			label: "7d",
			pct: d.sevenDayPct,
			level: d.sevenDayLevel,
			projectedPct: d.sevenDayProjectedPct,
			resetsAt: d.sevenDayResetsAt,
			calm: "lavender" as const,
			note: BLANK,
		},
	];

	return quotas.flatMap(({ spec, label, pct, level, projectedPct, resetsAt, calm, note }) => {
		if (pct === null || !isEnabled(segments, spec.id)) return [];

		const reset = resetOf(resetsAt, now);
		const cells = {
			countdown: reset ? { text: reset.countdown, tone: "dim" as const } : BLANK,
			clock: reset ? { text: reset.clock, tone: "dim" as const } : BLANK,
			pace: showPace ? paceCell(projectedPct) : BLANK,
			note,
		};

		return [{ label, pct, level, calm, cells }];
	});
}

function padCell(text: string, width: number, column: Column): string {
	const padding = " ".repeat(Math.max(0, width - visualWidth(text)));

	return RIGHT_ALIGNED.includes(column) ? padding + text : text + padding;
}

function quotaTable(rows: QuotaRow[], columns: readonly Column[], now: number): string[] {
	const filled = columns.filter((column) => rows.some((row) => row.cells[column].text !== ""));
	const widthOf = (column: Column) =>
		Math.max(...rows.map((row) => visualWidth(row.cells[column].text)));
	const pctWidth = Math.max(...rows.map((row) => formatPct(row.pct).length));

	return rows.map((row, index) => {
		const prefix = index === 0 ? `${MELON} ` : ROW_INDENT;
		const head = gaugeHead(row.label, row.pct, row.level, row.calm, now, pctWidth);
		const lastFilled = filled.findLastIndex((column) => row.cells[column].text !== "");
		const cells = filled.slice(0, lastFilled + 1).map((column, position) => {
			const cell = row.cells[column];
			const padded = padCell(cell.text, widthOf(column), column);

			return ` ${color(position === lastFilled ? padded.trimEnd() : padded, cell.tone)}`;
		});

		return prefix + head + cells.join("");
	});
}

function quotaLine(rows: QuotaRow[], now: number): string {
	const quotas = rows.map((row) => {
		const head = gaugeHead(row.label, row.pct, row.level, row.calm, now);
		const cells = Object.values(row.cells)
			.filter((cell) => cell.text !== "")
			.map((cell) => ` ${color(cell.text, cell.tone)}`);

		return head + cells.join("");
	});

	return `${MELON} ${quotas.join(` ${dot()} `)}`;
}

function renderQuotaLines(
	d: StatuslineData,
	now: number,
	segments: SegmentConfig,
	width: number,
): string[] {
	const rows = quotaRows(d, segments, now);
	if (rows.length === 0) return [color(`${MELON} quotas unavailable`, "dim")];

	const line = quotaLine(rows, now);
	if (visualWidth(line) <= width) return [line];

	const layouts = COLUMN_SETS.map((columns) => quotaTable(rows, columns, now));
	const fitting = layouts.find((lines) => lines.every((line) => visualWidth(line) <= width));

	return fitting ?? layouts[layouts.length - 1] ?? [];
}

export function render(
	d: StatuslineData,
	segments: SegmentConfig = {},
	width: number = resolveWidth(),
	now: number = Date.now(),
): string {
	return [
		renderIdentityLine(d, now, segments, width),
		renderEconomyLine(d, now, segments, width),
		...renderQuotaLines(d, now, segments, width),
	].join("\n");
}

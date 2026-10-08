import type { SegmentConfig } from "../config/segmentConfig";
import { isAlerting, type PressureLevel, toneOf } from "../quota/pressure";
import { resetOf } from "../quota/reset";
import type { ColorName } from "../terminal/format";
import {
	color,
	formatCost,
	formatDuration,
	formatPct,
	formatTokens,
	gradientText,
	link,
} from "../terminal/format";
import { resolveWidth, truncateToWidth, visualWidth } from "../terminal/width";
import type { Clock, PullRequest, ReviewState, StatuslineData } from "./data";
import type { Chunk } from "./fit";
import { fitChunks } from "./fit";
import { brailleGauge } from "./gauge";
import {
	dot,
	GAUGE_SEGMENTS,
	isEnabled,
	LINKS_SEGMENT,
	MOTION_SEGMENT,
	optionalChunks,
	PACE_SEGMENT,
	PULL_REQUEST_SEGMENT,
	priorityOf,
} from "./segments";

const MELON = "🍉";
const COST_ICON = "\u{f140b}";
const COST_MILESTONES = [10, 25, 50, 100];
const ROW_INDENT = "\u{2800}\u{2800} ";
const MIN_LABEL_WIDTH = 6;
const HEADROOM_SHOWN_ABOVE_PCT = 60;
const PACE_WARN_ABOVE_PCT = 85;
const PACE_DISPLAY_CEILING = 999;
const DRIFT_PER_SECOND = 0.35;
const BLINK_EVERY_BEATS = 5;

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

function driftOf(clock: Clock): number {
	return clock.beat * DRIFT_PER_SECOND;
}

function gaugeHead(
	label: string,
	pct: number,
	level: PressureLevel,
	calm: ColorName,
	clock: Clock,
	pctWidth = 0,
): string {
	const tone = toneOf(level, calm);
	const isPulseBeat = isAlerting(level) && clock.beat % 2 === 1;

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

function contextChunk(d: StatuslineData, clock: Clock, segments: SegmentConfig): Chunk[] {
	const spec = GAUGE_SEGMENTS.contextGauge;
	const pct = d.compactPct ?? d.contextPct;
	if (pct === null || !isEnabled(segments, spec.id)) return [];

	const gauge = gaugeHead("conv", pct, d.contextLevel, "sky", clock);

	return [
		{
			text: ` ${dot()} ${gauge}${headroomNote(d.compactHeadroom, pct)}`,
			priority: priorityOf(segments, spec.id, spec.priority),
		},
	];
}

const REVIEW_MARKS: Record<ReviewState, { glyph: string; tone: ColorName }> = {
	approved: { glyph: "✓", tone: "green" },
	pending: { glyph: "●", tone: "yellow" },
	changes_requested: { glyph: "✗", tone: "red" },
	draft: { glyph: "◌", tone: "dim" },
};

function pullRequestBadge(pr: PullRequest | null, linked: boolean): string {
	if (pr === null) return "";

	const mark = pr.reviewState ? REVIEW_MARKS[pr.reviewState] : null;
	const badge = color(`#${pr.number}${mark ? ` ${mark.glyph}` : ""}`, mark?.tone ?? "subtext");

	return ` ${link(badge, linked ? pr.url : null)}`;
}

function identityCore(
	d: StatuslineData,
	dirName: string,
	branchName: string,
	clock: Clock,
	segments: SegmentConfig,
): string {
	const linked = isEnabled(segments, LINKS_SEGMENT.id);
	const repoUrl = linked ? d.repoUrl : null;
	const branchPath = d.git.branch.split("/").map(encodeURIComponent).join("/");
	const branchUrl = repoUrl === null ? null : `${repoUrl}/tree/${branchPath}`;
	const pullRequest = isEnabled(segments, PULL_REQUEST_SEGMENT.id)
		? pullRequestBadge(d.pullRequest, linked)
		: "";
	const isBlinking = clock.moving && clock.beat % BLINK_EVERY_BEATS === BLINK_EVERY_BEATS - 1;
	const mood = color(isBlinking ? d.mood.blink : d.mood.face, d.mood.color);
	const spark = d.celebrationMode ? gradientText(" ✨", driftOf(clock)) : "";
	const dir = link(color(dirName, "subtext"), repoUrl);
	const branch =
		link(color(branchName, "mauve"), branchUrl) + (d.git.dirty ? color("*", "green") : "");
	const insertions = d.git.insertions > 0 ? ` ${color(`+${d.git.insertions}`, "green")}` : "";
	const deletions = d.git.deletions > 0 ? ` ${color(`-${d.git.deletions}`, "red")}` : "";
	const contextBadge = /1M/.test(d.modelName) ? color(" 1M", "dim") : "";
	const model = color(d.modelName.replace(/\s*\(.*?\)\s*$/, ""), "peach") + contextBadge;
	const separator = dot();

	return `${mood}${spark} ${dir} ${separator} ${branch}${pullRequest}${insertions}${deletions} ${separator} ${model}`;
}

function renderIdentityLine(
	d: StatuslineData,
	clock: Clock,
	segments: SegmentConfig,
	width: number,
): string {
	const widthWith = (shown: SegmentConfig) =>
		visualWidth(identityCore(d, d.dirName, d.git.branch, clock, shown));
	const withoutPullRequest = { ...segments, [PULL_REQUEST_SEGMENT.id]: { enabled: false } };
	const shown = widthWith(segments) <= width ? segments : withoutPullRequest;
	const [dirName = d.dirName, branchName = d.git.branch] = shrinkToFit(
		[d.dirName, d.git.branch],
		widthWith(shown) - width,
	);

	return fitChunks(
		identityCore(d, dirName, branchName, clock, shown),
		[...optionalChunks(1, d, clock, segments), ...contextChunk(d, clock, segments)],
		width,
	);
}

function costDisplay(cost: number, clock: Clock): string {
	const text = `${COST_ICON} ${formatCost(cost)}`;

	return COST_MILESTONES.some((milestone) => cost >= milestone)
		? gradientText(text, driftOf(clock))
		: color(text, "teal");
}

function renderEconomyLine(
	d: StatuslineData,
	clock: Clock,
	segments: SegmentConfig,
	width: number,
): string {
	const duration = color(`(${formatDuration(d.sessionDurationMs)})`, "dim");
	const core = `${costDisplay(d.sessionCost, clock)} ${duration}`;

	return fitChunks(core, optionalChunks(2, d, clock, segments), width);
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

function quotaRows(d: StatuslineData, segments: SegmentConfig, clock: Clock): QuotaRow[] {
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

		const reset = resetOf(resetsAt, clock.now);
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

function quotaTable(rows: QuotaRow[], columns: readonly Column[], clock: Clock): string[] {
	const filled = columns.filter((column) => rows.some((row) => row.cells[column].text !== ""));
	const widthOf = (column: Column) =>
		Math.max(...rows.map((row) => visualWidth(row.cells[column].text)));
	const pctWidth = Math.max(...rows.map((row) => formatPct(row.pct).length));

	return rows.map((row, index) => {
		const prefix = index === 0 ? `${MELON} ` : ROW_INDENT;
		const head = gaugeHead(row.label, row.pct, row.level, row.calm, clock, pctWidth);
		const lastFilled = filled.findLastIndex((column) => row.cells[column].text !== "");
		const cells = filled.slice(0, lastFilled + 1).map((column, position) => {
			const cell = row.cells[column];
			const padded = padCell(cell.text, widthOf(column), column);

			return ` ${color(position === lastFilled ? padded.trimEnd() : padded, cell.tone)}`;
		});

		return prefix + head + cells.join("");
	});
}

function quotaLine(rows: QuotaRow[], clock: Clock): string {
	const quotas = rows.map((row) => {
		const head = gaugeHead(row.label, row.pct, row.level, row.calm, clock);
		const cells = Object.values(row.cells)
			.filter((cell) => cell.text !== "")
			.map((cell) => ` ${color(cell.text, cell.tone)}`);

		return head + cells.join("");
	});

	return `${MELON} ${quotas.join(` ${dot()} `)}`;
}

function renderQuotaLines(
	d: StatuslineData,
	clock: Clock,
	segments: SegmentConfig,
	width: number,
): string[] {
	const rows = quotaRows(d, segments, clock);
	if (rows.length === 0) return [color(`${MELON} quotas unavailable`, "dim")];

	const line = quotaLine(rows, clock);
	if (visualWidth(line) <= width) return [line];

	const layouts = COLUMN_SETS.map((columns) => quotaTable(rows, columns, clock));
	const fitting = layouts.find((lines) => lines.every((line) => visualWidth(line) <= width));

	return fitting ?? layouts[layouts.length - 1] ?? [];
}

function chaseSeparators(lines: string[], clock: Clock): string[] {
	const separator = dot();
	const total = lines.reduce((count, line) => count + line.split(separator).length - 1, 0);
	if (!clock.moving || total === 0) return lines;

	const lit = clock.beat % total;
	let seen = 0;

	return lines.map((line) =>
		line
			.split(separator)
			.reduce((built, part) => built + (seen++ === lit ? color("·", "text") : separator) + part),
	);
}

export function render(
	d: StatuslineData,
	segments: SegmentConfig = {},
	width: number = resolveWidth(),
	now: number = Date.now(),
): string {
	const moving = isEnabled(segments, MOTION_SEGMENT.id);
	const clock = { now, beat: moving ? Math.floor(now / 1000) : 0, moving };
	const lines = [
		renderIdentityLine(d, clock, segments, width),
		renderEconomyLine(d, clock, segments, width),
		...renderQuotaLines(d, clock, segments, width),
	];

	return chaseSeparators(lines, clock).join("\n");
}

import type { Chunk } from "./fit";
import { color, formatCost, formatPct } from "./format";
import type { StatuslineData } from "./types";

export interface SegmentToggle {
	enabled?: boolean;
	priority?: number;
	line?: 1 | 2;
}

export type SegmentConfig = Record<string, SegmentToggle>;

type Line = 1 | 2;

export interface SegmentSpec {
	id: string;
	line: Line | 3;
	priority?: number;
	relocatable?: boolean;
	disabledByDefault?: boolean;
}

interface OptionalSegment extends SegmentSpec {
	line: Line;
	priority: number;
	text: (d: StatuslineData, now: number) => string | null;
}

export function dot(): string {
	return color("·", "dim");
}

const CACHE_ALERT_PCT = 70;

const FIRE = "🔥";
const LINES_ICON = "\u{f0176}";
const BURN_ALERT_PER_HR = 10;
const NIGHT_START_HOUR = 1;
const NIGHT_END_HOUR = 5;

function isNight(now: number): boolean {
	const hour = new Date(now).getHours();

	return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
}

function linesChanged(d: StatuslineData): string | null {
	if (d.linesAdded <= 0 && d.linesRemoved <= 0) return null;

	const added = d.linesAdded > 0 ? color(`+${d.linesAdded}`, "green") : "";
	const removed = d.linesRemoved > 0 ? color(`-${d.linesRemoved}`, "red") : "";

	return ` ${dot()} ${color(LINES_ICON, "dim")}${added}${removed}`;
}

function scopedCost(scope: string, cost: number): string {
	return ` ${dot()} ${color(`${scope} ${formatCost(cost)}`, "subtext")}`;
}

function projectToday(d: StatuslineData): string | null {
	const shown = formatCost(d.projectTodayCost);
	const repeatsNeighbour = shown === formatCost(d.sessionCost) || shown === formatCost(d.todayCost);

	return d.projectTodayCost > 0 && !repeatsNeighbour ? scopedCost("P", d.projectTodayCost) : null;
}

const OPTIONAL_SEGMENTS: readonly OptionalSegment[] = [
	{
		id: "worktree",
		line: 1,
		priority: 4,
		relocatable: true,
		text: (d) => (d.worktree ? ` ${color(`⑂${d.worktree}`, "dim")}` : null),
	},
	{
		id: "vimMode",
		line: 1,
		priority: 6,
		relocatable: true,
		text: (d) => (d.vimMode ? ` ${color(d.vimMode.toUpperCase(), "lavender")}` : null),
	},
	{
		id: "agentName",
		line: 1,
		priority: 6,
		relocatable: true,
		text: (d) => (d.agentName ? ` ${color(`🤖${d.agentName}`, "sky")}` : null),
	},
	{
		id: "outputStyle",
		line: 1,
		priority: 3,
		relocatable: true,
		text: (d) => (d.outputStyle ? ` ${color(`✎${d.outputStyle}`, "dim")}` : null),
	},
	{
		id: "sessionName",
		line: 1,
		priority: 5,
		relocatable: true,
		disabledByDefault: true,
		text: (d) => (d.sessionName ? ` ${color(d.sessionName, "dim")}` : null),
	},
	{
		id: "ccVersion",
		line: 1,
		priority: 2,
		relocatable: true,
		disabledByDefault: true,
		text: (d) => (d.ccVersion ? ` ${color(`v${d.ccVersion}`, "dim")}` : null),
	},
	{
		id: "night",
		line: 1,
		priority: 8,
		relocatable: true,
		text: (_d, now) => (isNight(now) ? ` ${color("☾", "lavender")}` : null),
	},
	{ id: "linesChanged", line: 2, priority: 22, relocatable: true, text: linesChanged },
	{
		id: "sessions",
		line: 1,
		priority: 10,
		text: (d) => (d.activeSessions > 1 ? ` ${color(`[${d.activeSessions}]`, "lavender")}` : null),
	},
	{ id: "projectToday", line: 2, priority: 28, text: projectToday },
	{
		id: "today",
		line: 2,
		priority: 30,
		text: (d) => (d.todayCost > 0 ? scopedCost("D", d.todayCost) : null),
	},
	{
		id: "week",
		line: 2,
		priority: 25,
		text: (d) => (d.weekCost > 0 ? scopedCost("W", d.weekCost) : null),
	},
	{
		id: "burn",
		line: 2,
		priority: 50,
		text: (d) =>
			d.burnRatePerHr !== null && d.burnRatePerHr > BURN_ALERT_PER_HR
				? ` ${dot()} ${FIRE} ${color(`${formatCost(d.burnRatePerHr)}/hr`, "red")}`
				: null,
	},
	{
		id: "cache",
		line: 2,
		priority: 40,
		text: (d) =>
			d.cacheHitPct !== null && d.cacheHitPct < CACHE_ALERT_PCT
				? ` ${dot()} ${color(`cache ${formatPct(d.cacheHitPct)}`, "red")}`
				: null,
	},
];

export const GAUGE_SEGMENTS = {
	contextGauge: { id: "contextGauge", line: 1, priority: 30 },
	fiveHourGauge: { id: "fiveHourGauge", line: 3 },
	sevenDayGauge: { id: "sevenDayGauge", line: 3 },
} as const satisfies Record<string, SegmentSpec>;

export const PACE_SEGMENT: SegmentSpec = { id: "pace", line: 3 };

export const SEGMENT_SPECS: readonly SegmentSpec[] = [
	...OPTIONAL_SEGMENTS,
	...Object.values(GAUGE_SEGMENTS),
	PACE_SEGMENT,
];

export function isEnabled(config: SegmentConfig, id: string, disabledByDefault = false): boolean {
	return config[id]?.enabled ?? !disabledByDefault;
}

export function priorityOf(config: SegmentConfig, id: string, fallback: number): number {
	return config[id]?.priority ?? fallback;
}

function lineOf(config: SegmentConfig, segment: OptionalSegment): Line {
	const override = segment.relocatable ? config[segment.id]?.line : undefined;

	return override ?? segment.line;
}

export function optionalChunks(
	line: Line,
	d: StatuslineData,
	now: number,
	config: SegmentConfig,
): Chunk[] {
	return OPTIONAL_SEGMENTS.filter(
		(segment) =>
			isEnabled(config, segment.id, segment.disabledByDefault) && lineOf(config, segment) === line,
	).flatMap((segment) => {
		const text = segment.text(d, now);

		return text === null
			? []
			: [{ text, priority: priorityOf(config, segment.id, segment.priority) }];
	});
}

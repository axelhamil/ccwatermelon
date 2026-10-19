import type { SegmentConfig } from "../config/segmentConfig";
import { isAlerting, toneOf } from "../context/pressure";
import { color, formatDuration, formatPct, formatTokens, labelled } from "../terminal/format";
import type { Clock, StatuslineData } from "./data";
import type { Part } from "./fit";
import { brailleGauge } from "./gauge";

export interface SegmentSpec {
	id: string;
	priority?: number;
	disabledByDefault?: boolean;
}

interface OptionalSegment extends SegmentSpec {
	priority: number;
	text: (d: StatuslineData, clock: Clock) => string | null;
}

const CACHE_ALERT_PCT = 70;
const HEADROOM_SHOWN_ABOVE_PCT = 60;
const NIGHT_START_HOUR = 1;
const NIGHT_END_HOUR = 5;

function isNight(now: number): boolean {
	const hour = new Date(now).getHours();

	return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
}

function headroomNote(headroom: number | null, pct: number): string {
	if (headroom === null) return "";
	if (headroom < 0) return ` ${color(`+${formatTokens(-headroom)}`, "red")}`;

	return pct > HEADROOM_SHOWN_ABOVE_PCT ? ` ${color(`↓${formatTokens(headroom)}`, "dim")}` : "";
}

function contextGauge(d: StatuslineData, clock: Clock): string | null {
	const pct = d.compactPct ?? d.contextPct;
	if (pct === null) return null;

	const tone = toneOf(d.contextLevel);
	const isPulseBeat = isAlerting(d.contextLevel) && clock.beat % 2 === 1;
	const gauge = color(brailleGauge(pct), isPulseBeat ? "dim" : tone);

	return `${labelled("conv", color(formatPct(pct), tone))}${gauge}${headroomNote(d.compactHeadroom, pct)}`;
}

function linesChanged(d: StatuslineData): string | null {
	if (d.linesAdded <= 0 && d.linesRemoved <= 0) return null;

	const added = d.linesAdded > 0 ? color(`+${d.linesAdded}`, "green") : "";
	const removed = d.linesRemoved > 0 ? color(`-${d.linesRemoved}`, "red") : "";

	return labelled("lines", [added, removed].filter((part) => part !== "").join(" "));
}

const OPTIONAL_SEGMENTS: readonly OptionalSegment[] = [
	{
		id: "effort",
		priority: 7,
		text: (d) => (d.effort ? labelled("effort", d.effort) : null),
	},
	{
		id: "fastMode",
		priority: 7,
		text: (d) => (d.fastMode ? color("↯ fast", "yellow") : null),
	},
	{
		id: "thinking",
		priority: 3,
		disabledByDefault: true,
		text: (d) => (d.thinking ? color("✦ thinking", "magenta") : null),
	},
	{ id: "contextGauge", priority: 30, text: contextGauge },
	{
		id: "cache",
		priority: 40,
		text: (d) =>
			d.cacheHitPct !== null && d.cacheHitPct < CACHE_ALERT_PCT
				? labelled("cache", color(formatPct(d.cacheHitPct), "red"))
				: null,
	},
	{
		id: "duration",
		priority: 20,
		text: (d) =>
			d.sessionDurationMs > 0 ? labelled("time", formatDuration(d.sessionDurationMs)) : null,
	},
	{ id: "linesChanged", priority: 22, text: linesChanged },
	{
		id: "worktree",
		priority: 4,
		text: (d) => (d.worktree ? labelled("worktree", d.worktree) : null),
	},
	{
		id: "vimMode",
		priority: 6,
		text: (d) => (d.vimMode ? color(d.vimMode.toUpperCase(), "bold") : null),
	},
	{
		id: "agentName",
		priority: 6,
		text: (d) => (d.agentName ? labelled("agent", d.agentName) : null),
	},
	{
		id: "outputStyle",
		priority: 3,
		text: (d) => (d.outputStyle ? labelled("style", d.outputStyle) : null),
	},
	{
		id: "sessionName",
		priority: 5,
		disabledByDefault: true,
		text: (d) => (d.sessionName ? labelled("session", d.sessionName) : null),
	},
	{
		id: "ccVersion",
		priority: 2,
		disabledByDefault: true,
		text: (d) => (d.ccVersion ? color(`v${d.ccVersion}`, "dim") : null),
	},
	{
		id: "night",
		priority: 8,
		text: (_d, clock) => (isNight(clock.now) ? color("☾", "blue") : null),
	},
];

export const PULL_REQUEST_SEGMENT: SegmentSpec = { id: "pullRequest" };
export const LINKS_SEGMENT: SegmentSpec = { id: "links" };
export const MOTION_SEGMENT: SegmentSpec = { id: "motion" };

export const SEGMENT_SPECS: readonly SegmentSpec[] = [
	...OPTIONAL_SEGMENTS,
	PULL_REQUEST_SEGMENT,
	LINKS_SEGMENT,
	MOTION_SEGMENT,
];

export function isEnabled(config: SegmentConfig, id: string, disabledByDefault = false): boolean {
	return config[id]?.enabled ?? !disabledByDefault;
}

export function optionalParts(d: StatuslineData, clock: Clock, config: SegmentConfig): Part[] {
	return OPTIONAL_SEGMENTS.filter((segment) =>
		isEnabled(config, segment.id, segment.disabledByDefault),
	).flatMap((segment) => {
		const text = segment.text(d, clock);

		return text === null
			? []
			: [{ text, priority: config[segment.id]?.priority ?? segment.priority }];
	});
}

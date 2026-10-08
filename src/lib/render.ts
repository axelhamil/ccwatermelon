import type { Part } from "./fit";
import { fitChunks, fitParts } from "./fit";
import type { ColorName } from "./format";
import { color, formatCost, formatDuration, formatPct, formatTokens, gradientText } from "./format";
import { brailleGauge } from "./gauge";
import { formatReset } from "./reset";
import type { SegmentConfig } from "./segments";
import { CACHE_ALERT_PCT, dot, isEnabled, optionalChunks, priorityOf } from "./segments";
import type { StatuslineData } from "./types";
import { resolveWidth, truncateToWidth, visualWidth } from "./width";

const MELON = "🍉";
const COST_ICON = "\u{f140b}";
const CONTEXT_ICON = "\u{f0128}";
const COST_MILESTONES = [10, 25, 50, 100];
const MIN_LABEL_WIDTH = 6;

interface Tones {
	calm: ColorName;
	warnAbove: number;
	criticalAbove: number;
}

function toneFor(pct: number, { calm, warnAbove, criticalAbove }: Tones): ColorName {
	if (pct > criticalAbove) return "red";
	if (pct > warnAbove) return "peach";

	return calm;
}

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

function identityCore(d: StatuslineData, dirName: string, branchName: string): string {
	const mood = color(d.mood.face, d.mood.color);
	const spark = d.celebrationMode ? gradientText(" ✨") : "";
	const dir = color(dirName, "subtext");
	const branch = color(branchName, "mauve") + (d.git.dirty ? color("*", "green") : "");
	const insertions = d.git.insertions > 0 ? ` ${color(`+${d.git.insertions}`, "green")}` : "";
	const deletions = d.git.deletions > 0 ? ` ${color(`-${d.git.deletions}`, "red")}` : "";
	const contextBadge = /1M/.test(d.modelName) ? color(" 1M", "dim") : "";
	const model = color(d.modelName.replace(/\s*\(.*?\)\s*$/, ""), "peach") + contextBadge;

	const separator = dot();

	return `${mood}${spark}  ${dir} ${separator}  ${branch}${insertions}${deletions} ${separator}  ${model}`;
}

function renderIdentityLine(
	d: StatuslineData,
	now: number,
	segments: SegmentConfig,
	width: number,
): string {
	const excess = visualWidth(identityCore(d, d.dirName, d.git.branch)) - width;
	const [dirName = d.dirName, branchName = d.git.branch] = shrinkToFit(
		[d.dirName, d.git.branch],
		excess,
	);

	return fitChunks(
		identityCore(d, dirName, branchName),
		optionalChunks(1, d, now, segments),
		width,
	);
}

function costDisplay(cost: number): string {
	const text = `${COST_ICON} ${formatCost(cost)}`;

	return COST_MILESTONES.some((milestone) => cost >= milestone)
		? gradientText(text)
		: color(text, "teal");
}

function renderEconomyLine(
	d: StatuslineData,
	now: number,
	segments: SegmentConfig,
	width: number,
): string {
	const duration = color(`(${formatDuration(d.sessionDurationMs)})`, "dim");
	const core = `${costDisplay(d.sessionCost)} ${duration}`;

	return fitChunks(core, optionalChunks(2, d, now, segments), width);
}

type Gauge = Pick<Part, "full" | "compact">;

function contextGauge(d: StatuslineData): Gauge | null {
	const pct = d.compactPct ?? d.contextPct;
	if (pct === null) return null;

	const tone = toneFor(pct, { calm: "sky", warnAbove: 65, criticalAbove: 85 });
	const compact =
		color(`${CONTEXT_ICON} conv ${formatPct(pct)}`, tone) + color(brailleGauge(pct), tone);
	if (d.tokensToCompact === null || pct <= 60) return { compact, full: compact };

	return { compact, full: `${compact} ${color(`↓${formatTokens(d.tokensToCompact)}`, "dim")}` };
}

const QUOTA_TONES = { warnAbove: 70, criticalAbove: 90 };

function quotaGauge(
	label: string,
	pct: number | null,
	resetsAt: number | null,
	calm: ColorName,
	now: number,
): Gauge | null {
	if (pct === null) return null;

	const tone = toneFor(pct, { calm, ...QUOTA_TONES });
	const reset = formatReset(resetsAt, now);
	const compact = color(`${label} ${formatPct(pct)}`, tone) + color(brailleGauge(pct), tone);

	return { compact, full: reset ? `${compact} ${color(reset, "dim")}` : compact };
}

function renderGaugeLine(
	d: StatuslineData,
	now: number,
	segments: SegmentConfig,
	width: number,
): string {
	const candidates = [
		{ id: "contextGauge", priority: 30, gauge: contextGauge(d) },
		{
			id: "fiveHourGauge",
			priority: 20,
			gauge: quotaGauge("5h", d.fiveHourPct, d.fiveHourResetsAt, "sky", now),
		},
		{
			id: "sevenDayGauge",
			priority: 40,
			gauge: quotaGauge("7d", d.sevenDayPct, d.sevenDayResetsAt, "lavender", now),
		},
	];
	const gauges = candidates.flatMap(({ id, priority, gauge }): Part[] =>
		gauge && isEnabled(segments, id)
			? [{ ...gauge, priority: priorityOf(segments, id, priority) }]
			: [],
	);
	if (gauges.length === 0) return color(`${MELON} gauges unavailable`, "dim");

	return fitParts(`${MELON} `, gauges, `  ${dot()}  `, width);
}

function compactionAlert(d: StatuslineData): Part | null {
	if (d.contextTokens === null) return null;

	const inContext = `${formatTokens(d.contextTokens)} in ctx`;
	if (d.tokensToCompact === null) return { full: color(inContext, "red"), priority: 20 };

	const countdown = `compact in ${formatTokens(d.tokensToCompact)}`;

	return {
		full: color(`${countdown} (${inContext})`, "red"),
		compact: color(countdown, "red"),
		priority: 20,
	};
}

function cacheAlert(d: StatuslineData): Part | null {
	if (d.cacheHitPct === null || d.cacheHitPct >= CACHE_ALERT_PCT) return null;

	const rate = `cache ${formatPct(d.cacheHitPct)}`;

	return {
		full: color(`${rate}, context costs full price`, "red"),
		compact: color(rate, "red"),
		priority: 10,
	};
}

function quotaAlert(d: StatuslineData): Part | null {
	if (d.etaMinutes === 0) return { full: color("⚠ AT LIMIT", "red"), priority: 30 };
	if (d.etaMinutes !== null) {
		return { full: color(`⚠ limit in ${d.etaMinutes}min`, "red"), priority: 30 };
	}

	return d.etaCooling ? { full: color("↓ cooling", "green"), priority: 30 } : null;
}

function renderAlertLine(d: StatuslineData, width: number): string | null {
	const alerts = [compactionAlert(d), cacheAlert(d), quotaAlert(d)].filter(
		(alert): alert is Part => alert !== null,
	);
	if (alerts.length === 0) return null;

	return fitParts("", alerts, ` ${dot()} `, width);
}

export function render(
	d: StatuslineData,
	segments: SegmentConfig = {},
	width: number = resolveWidth(),
): string {
	const now = Date.now();
	const lines = [
		renderIdentityLine(d, now, segments, width),
		renderEconomyLine(d, now, segments, width),
		renderGaugeLine(d, now, segments, width),
	];
	const alertLine = d.alertMode ? renderAlertLine(d, width) : null;
	if (alertLine !== null) lines.push(alertLine);

	return lines.join("\n");
}

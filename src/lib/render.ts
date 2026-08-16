import type { Chunk } from "./fit";
import { fitChunks } from "./fit";
import { color, formatCost, formatDuration, formatPct, formatTokens, gradientText } from "./format";
import type { ColorName } from "./format";
import { brailleGauge } from "./gauge";
import type { StatuslineData } from "./types";
import { resolveWidth, visualWidth } from "./width";

const FIRE = "🔥";
const WAVE = "🌊";
const BOLT = "⚡";
const DOT = color("·", "dim");
const COST_MILESTONES = [10, 25, 50, 100];

export interface SegmentToggle {
	enabled?: boolean;
	priority?: number;
	line?: 1 | 2;
}

export type SegmentConfig = Record<string, SegmentToggle>;

const DEFAULT_ENABLED: Record<string, boolean> = {
	sessionName: false,
	ccVersion: false,
};

function isEnabled(segments: SegmentConfig, id: string): boolean {
	const override = segments[id]?.enabled;
	if (override !== undefined) return override;
	return DEFAULT_ENABLED[id] ?? true;
}

function priorityOf(segments: SegmentConfig, id: string, fallback: number): number {
	const override = segments[id]?.priority;
	return override ?? fallback;
}

function formatResetIn(resetsAt: string | number | null): string {
	if (!resetsAt) return "";
	const at = typeof resetsAt === "number" ? resetsAt * 1000 : Date.parse(resetsAt);
	const ms = at - Date.now();
	if (!Number.isFinite(ms) || ms <= 0) return "";
	const totalMin = Math.round(ms / 60000);
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}m`;
}

function formatResetClock(resetsAt: string | number | null): string {
	if (!resetsAt) return "";
	const at = typeof resetsAt === "number" ? resetsAt * 1000 : Date.parse(resetsAt);
	if (!Number.isFinite(at)) return "";
	const d = new Date(at);
	return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatReset(resetsAt: string | number | null): string {
	const countdown = formatResetIn(resetsAt);
	if (!countdown) return "";
	const clock = formatResetClock(resetsAt);
	return clock ? `↺${countdown} (${clock})` : `↺${countdown}`;
}

function nightGlyph(now: number): string {
	const hour = new Date(now).getHours();
	if (hour >= 1 && hour < 5) return ` ${color("☾", "lavender")}`;
	return "";
}

interface RelocatableChunk extends Chunk {
	id: string;
	defaultLine: 1 | 2;
}

// These segments carry a genuine payload but no fixed visual home — the user
// can send them to line 1 (identity) or line 2 (economy) via config.
function relocatableChunks(
	d: StatuslineData,
	now: number,
	segments: SegmentConfig,
): RelocatableChunk[] {
	const chunks: RelocatableChunk[] = [];

	if (isEnabled(segments, "worktree") && d.worktree) {
		chunks.push({
			id: "worktree",
			defaultLine: 1,
			text: ` ${color(`⑂${d.worktree}`, "dim")}`,
			priority: priorityOf(segments, "worktree", 4),
		});
	}
	if (isEnabled(segments, "vimMode") && d.vimMode) {
		chunks.push({
			id: "vimMode",
			defaultLine: 1,
			text: ` ${color(d.vimMode.toUpperCase(), "lavender")}`,
			priority: priorityOf(segments, "vimMode", 6),
		});
	}
	if (isEnabled(segments, "agentName") && d.agentName) {
		chunks.push({
			id: "agentName",
			defaultLine: 1,
			text: ` ${color(`🤖${d.agentName}`, "sky")}`,
			priority: priorityOf(segments, "agentName", 6),
		});
	}
	if (isEnabled(segments, "outputStyle") && d.outputStyle) {
		chunks.push({
			id: "outputStyle",
			defaultLine: 1,
			text: ` ${color(`✎${d.outputStyle}`, "dim")}`,
			priority: priorityOf(segments, "outputStyle", 3),
		});
	}
	if (isEnabled(segments, "sessionName") && d.sessionName) {
		chunks.push({
			id: "sessionName",
			defaultLine: 1,
			text: ` ${color(d.sessionName, "dim")}`,
			priority: priorityOf(segments, "sessionName", 5),
		});
	}
	if (isEnabled(segments, "ccVersion") && d.ccVersion) {
		chunks.push({
			id: "ccVersion",
			defaultLine: 1,
			text: ` ${color(`v${d.ccVersion}`, "dim")}`,
			priority: priorityOf(segments, "ccVersion", 2),
		});
	}
	if (isEnabled(segments, "night")) {
		const glyph = nightGlyph(now);
		if (glyph)
			chunks.push({
				id: "night",
				defaultLine: 1,
				text: glyph,
				priority: priorityOf(segments, "night", 8),
			});
	}
	if (isEnabled(segments, "linesChanged") && (d.linesAdded > 0 || d.linesRemoved > 0)) {
		const ins = d.linesAdded > 0 ? color(`+${d.linesAdded}`, "green") : "";
		const del = d.linesRemoved > 0 ? color(`-${d.linesRemoved}`, "red") : "";
		chunks.push({
			id: "linesChanged",
			defaultLine: 2,
			text: ` ${DOT} ${color("󰅶", "dim")}${ins}${del}`,
			priority: priorityOf(segments, "linesChanged", 22),
		});
	}

	return chunks;
}

function renderLine1(
	d: StatuslineData,
	now: number,
	segments: SegmentConfig,
	relocated: RelocatableChunk[],
	width: number,
): string {
	const mood = color(d.mood.face, d.mood.color as ColorName);
	const spark = d.celebrationMode ? gradientText(" ✨") : "";
	const branch = color(` ${d.git.branch}`, "mauve") + (d.git.dirty ? color("*", "green") : "");
	const ins = d.git.insertions > 0 ? ` ${color(`+${d.git.insertions}`, "green")}` : "";
	const del = d.git.deletions > 0 ? ` ${color(`-${d.git.deletions}`, "red")}` : "";
	const ctxBadge = /1M/.test(d.modelName) ? color(" 1M", "dim") : "";
	const model = color(` ${d.modelName.replace(/\s*\(.*?\)\s*$/, "")}`, "peach") + ctxBadge;
	const dir = color(` ${d.dirName}`, "subtext");

	const core = `${mood}${spark} ${dir} ${DOT} ${branch}${ins}${del} ${DOT} ${model}`;

	const optional: Chunk[] = [
		...relocated.filter((c) => lineOf(segments, c.id, c.defaultLine) === 1),
	];

	if (isEnabled(segments, "sessions") && d.activeSessions > 1) {
		optional.push({
			text: ` ${color(`[${d.activeSessions}]`, "lavender")}`,
			priority: priorityOf(segments, "sessions", 10),
		});
	}

	return fitChunks(core, optional, width);
}

function lineOf(segments: SegmentConfig, id: string, fallback: 1 | 2): 1 | 2 {
	return segments[id]?.line ?? fallback;
}

function costDisplay(cost: number): string {
	const text = `󱐋 ${formatCost(cost)}`;
	return COST_MILESTONES.some((m) => cost >= m) ? gradientText(text) : color(text, "teal");
}

function renderLine2(
	d: StatuslineData,
	segments: SegmentConfig,
	relocated: RelocatableChunk[],
	width: number,
): string {
	const cost = costDisplay(d.sessionCost);
	const dur = color(`(${formatDuration(d.sessionDurationMs)})`, "dim");
	const core = `${cost} ${dur}`;

	const optional: Chunk[] = [
		...relocated.filter((c) => lineOf(segments, c.id, c.defaultLine) === 2),
	];

	if (isEnabled(segments, "today") && d.todayCost > 0) {
		optional.push({
			text: ` ${FIRE} ${color(`D ${formatCost(d.todayCost)}`, "subtext")}`,
			priority: priorityOf(segments, "today", 30),
		});
	}
	if (isEnabled(segments, "week") && d.weekCost > 0) {
		optional.push({
			text: ` ${FIRE} ${color(`W ${formatCost(d.weekCost)}`, "subtext")}`,
			priority: priorityOf(segments, "week", 25),
		});
	}
	if (isEnabled(segments, "burn") && d.burnRatePerHr !== null && d.burnRatePerHr > 10) {
		optional.push({
			text: ` ${FIRE} ${color(`${formatCost(d.burnRatePerHr)}/hr`, "red")}`,
			priority: priorityOf(segments, "burn", 50),
		});
	}
	if (isEnabled(segments, "cache") && d.cacheHitPct !== null && d.cacheHitPct < 70) {
		optional.push({
			text: ` ${DOT} ${color(`cache ${formatPct(d.cacheHitPct)}`, "red")}`,
			priority: priorityOf(segments, "cache", 40),
		});
	}
	if (isEnabled(segments, "tps") && d.tokensPerSec !== null) {
		optional.push({
			text: ` ${BOLT} ${color(`${Math.round(d.tokensPerSec)} t/s`, "yellow")}`,
			priority: priorityOf(segments, "tps", 35),
		});
	}

	return fitChunks(core, optional, width);
}

function quotaSegment(
	label: string,
	pct: number,
	resetsAt: string | number | null,
	tone: ColorName,
): string {
	const reset = formatReset(resetsAt);
	return (
		color(`${label} ${formatPct(pct)}`, tone) +
		color(brailleGauge(pct), tone) +
		(reset ? ` ${color(reset, "dim")}` : "")
	);
}

function contextSegment(d: StatuslineData): string | null {
	const pct = d.compactPct ?? d.contextPct;
	if (pct === null) return null;

	const tone: ColorName = pct > 85 ? "red" : pct > 65 ? "peach" : "sky";
	const room =
		d.tokensToCompact !== null && pct > 60
			? ` ${color(`↓${formatTokens(d.tokensToCompact)}`, "dim")}`
			: "";

	return color(`󰄨 conv ${formatPct(pct)}`, tone) + color(brailleGauge(pct), tone) + room;
}

function renderGaugeLine(d: StatuslineData, segments: SegmentConfig, width: number): string {
	const gauges: { id: string; text: string; priority: number }[] = [];

	if (isEnabled(segments, "contextGauge")) {
		const ctx = contextSegment(d);
		if (ctx)
			gauges.push({
				id: "contextGauge",
				text: ctx,
				priority: priorityOf(segments, "contextGauge", 30),
			});
	}

	if (isEnabled(segments, "fiveHourGauge") && d.fiveHourPct !== null) {
		const tone: ColorName = d.fiveHourPct > 90 ? "red" : d.fiveHourPct > 70 ? "peach" : "sky";
		gauges.push({
			id: "fiveHourGauge",
			text: quotaSegment("5h", d.fiveHourPct, d.fiveHourResetsAt, tone),
			priority: priorityOf(segments, "fiveHourGauge", 20),
		});
	}

	if (isEnabled(segments, "sevenDayGauge") && d.sevenDayPct !== null) {
		const tone: ColorName = d.sevenDayPct > 90 ? "red" : d.sevenDayPct > 70 ? "peach" : "lavender";
		gauges.push({
			id: "sevenDayGauge",
			text: quotaSegment("7d", d.sevenDayPct, d.sevenDayResetsAt, tone),
			priority: priorityOf(segments, "sevenDayGauge", 10),
		});
	}

	if (gauges.length === 0) return color(`${WAVE} gauges unavailable`, "dim");

	const sorted = [...gauges].sort((a, b) => a.priority - b.priority);
	const kept = new Set(gauges.map((g) => g.id));
	const compose = () =>
		`${WAVE} ${gauges
			.filter((g) => kept.has(g.id))
			.map((g) => g.text)
			.join(`  ${DOT}  `)}`;

	let result = compose();
	let cursor = 0;
	while (visualWidth(result) > width && cursor < sorted.length - 1) {
		const victim = sorted[cursor];
		cursor++;
		if (!victim) continue;
		kept.delete(victim.id);
		result = compose();
	}
	return result;
}

function renderLine3(d: StatuslineData): string {
	const parts: string[] = [];

	if (d.tokensToCompact !== null && d.contextTokens !== null) {
		parts.push(
			color(
				`compact in ${formatTokens(d.tokensToCompact)} (${formatTokens(d.contextTokens)} in ctx)`,
				"red",
			),
		);
	} else if (d.contextTokens !== null) {
		parts.push(color(`${formatTokens(d.contextTokens)} in ctx`, "red"));
	}

	if (d.cacheHitPct !== null && d.cacheHitPct < 70) {
		parts.push(color(`cache ${formatPct(d.cacheHitPct)} — context costs full price`, "red"));
	}

	if (d.etaMinutes !== null) {
		const label = d.etaMinutes === 0 ? "⚠ AT LIMIT" : `⚠ limit in ${d.etaMinutes}min`;
		parts.push(color(label, "red"));
	} else if (d.etaCooling) {
		parts.push(color("↓ cooling", "green"));
	}

	return parts.join(` ${DOT} `);
}

export function render(d: StatuslineData, segments: SegmentConfig = {}): string {
	const now = Date.now();
	const width = resolveWidth();
	const relocated = relocatableChunks(d, now, segments);

	const lines = [
		renderLine1(d, now, segments, relocated, width),
		renderLine2(d, segments, relocated, width),
		renderGaugeLine(d, segments, width),
	];
	if (d.alertMode) lines.push(renderLine3(d));
	return lines.join("\n");
}

import { color, formatCost, formatDuration, formatPct, formatTokens, gradientText } from "./format";
import type { ColorName } from "./format";
import { brailleGauge } from "./gauge";
import type { StatuslineData } from "./types";

const FIRE = "🔥";
const WAVE = "🌊";
const BOLT = "⚡";
const DOT = color("·", "dim");
const COST_MILESTONES = [10, 25, 50, 100];

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

function renderLine1(d: StatuslineData, now: number): string {
	const mood = color(d.mood.face, d.mood.color as ColorName);
	const spark = d.celebrationMode ? gradientText(" ✨") : "";
	const branch = color(` ${d.git.branch}`, "mauve") + (d.git.dirty ? color("*", "green") : "");
	const ins = d.git.insertions > 0 ? ` ${color(`+${d.git.insertions}`, "green")}` : "";
	const del = d.git.deletions > 0 ? ` ${color(`-${d.git.deletions}`, "red")}` : "";
	const ctxBadge = /1M/.test(d.modelName) ? color(" 1M", "dim") : "";
	const model = color(` ${d.modelName.replace(/\s*\(.*?\)\s*$/, "")}`, "peach") + ctxBadge;
	const dir = color(` ${d.dirName}`, "subtext");
	const sessions = d.activeSessions > 1 ? ` ${color(`[${d.activeSessions}]`, "lavender")}` : "";

	return `${mood}${spark} ${dir} ${DOT} ${branch}${ins}${del} ${DOT} ${model}${sessions}${nightGlyph(now)}`;
}

function costDisplay(cost: number): string {
	const text = `󱐋 ${formatCost(cost)}`;
	return COST_MILESTONES.some((m) => cost >= m) ? gradientText(text) : color(text, "teal");
}

function renderLine2(d: StatuslineData): string {
	const cost = costDisplay(d.sessionCost);
	const dur = color(`(${formatDuration(d.sessionDurationMs)})`, "dim");
	const today =
		d.todayCost > 0 ? ` ${FIRE} ${color(`D ${formatCost(d.todayCost)}`, "subtext")}` : "";
	const week = d.weekCost > 0 ? ` ${FIRE} ${color(`7j ${formatCost(d.weekCost)}`, "subtext")}` : "";
	const burn =
		d.burnRatePerHr !== null && d.burnRatePerHr > 10
			? ` ${FIRE} ${color(`${formatCost(d.burnRatePerHr)}/hr`, "red")}`
			: "";

	const cache =
		d.cacheHitPct !== null && d.cacheHitPct < 70
			? ` ${DOT} ${color(`cache ${formatPct(d.cacheHitPct)}`, "red")}`
			: "";

	const tps =
		d.tokensPerSec !== null
			? ` ${BOLT} ${color(`${Math.round(d.tokensPerSec)} t/s`, "yellow")}`
			: "";

	return `${cost} ${dur}${today}${week}${burn}${cache}${tps}`;
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

function renderGaugeLine(d: StatuslineData): string {
	const segments: string[] = [];

	const ctx = contextSegment(d);
	if (ctx) segments.push(ctx);

	if (d.fiveHourPct !== null) {
		const tone: ColorName = d.fiveHourPct > 90 ? "red" : d.fiveHourPct > 70 ? "peach" : "sky";
		segments.push(quotaSegment("5h", d.fiveHourPct, d.fiveHourResetsAt, tone));
	}

	if (d.sevenDayPct !== null) {
		const tone: ColorName = d.sevenDayPct > 90 ? "red" : d.sevenDayPct > 70 ? "peach" : "lavender";
		segments.push(quotaSegment("7d", d.sevenDayPct, d.sevenDayResetsAt, tone));
	}

	if (segments.length === 0) return color(`${WAVE} jauges indisponibles`, "dim");
	return `${WAVE} ${segments.join(`  ${DOT}  `)}`;
}

function renderLine3(d: StatuslineData): string {
	const parts: string[] = [];

	if (d.tokensToCompact !== null && d.contextTokens !== null) {
		parts.push(
			color(
				`compact dans ${formatTokens(d.tokensToCompact)} (${formatTokens(d.contextTokens)} en ctx)`,
				"red",
			),
		);
	} else if (d.contextTokens !== null) {
		parts.push(color(`${formatTokens(d.contextTokens)} en ctx`, "red"));
	}

	if (d.cacheHitPct !== null && d.cacheHitPct < 70) {
		parts.push(color(`cache ${formatPct(d.cacheHitPct)} — contexte repayé plein tarif`, "red"));
	}

	if (d.etaMinutes !== null) {
		const label = d.etaMinutes === 0 ? "⚠ AT LIMIT" : `⚠ limite dans ${d.etaMinutes}min`;
		parts.push(color(label, "red"));
	} else if (d.etaCooling) {
		parts.push(color("↓ cooling", "green"));
	}

	return parts.join(` ${DOT} `);
}

export function render(d: StatuslineData): string {
	const now = Date.now();
	const lines = [renderLine1(d, now), renderLine2(d), renderGaugeLine(d)];
	if (d.alertMode) lines.push(renderLine3(d));
	return lines.join("\n");
}

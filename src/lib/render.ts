import { color, formatCost, formatDuration, formatPct, formatTokens } from "./format";
import { sparkline } from "./sparkline";
import type { StatuslineData } from "./types";

const FIRE = "🔥";
const WAVE = "🌊";
const BOLT = "⚡";
const DOT = color("·", "dim");

function renderLine1(d: StatuslineData): string {
	const mood = color(d.mood.face, d.mood.color as Parameters<typeof color>[1]);
	const label = d.mood.label ? ` ${color(d.mood.label, d.mood.color as Parameters<typeof color>[1])}` : "";
	const branch = color(` ${d.git.branch}`, "mauve") + (d.git.dirty ? color("*", "green") : "");
	const ins = d.git.insertions > 0 ? " " + color(`+${d.git.insertions}`, "green") : "";
	const del = d.git.deletions > 0 ? " " + color(`-${d.git.deletions}`, "red") : "";
	const model = color(` ${d.modelName}`, "peach");
	const dir = color(` ${d.dirName}`, "subtext");
	const sessions = color(`[${d.activeSessions}]`, "lavender");

	return `${mood}${label} ${DOT} ${branch}${ins}${del} ${FIRE} ${model} ${FIRE} ${dir} ${DOT} ${sessions}`;
}

function renderLine2(d: StatuslineData): string {
	const cost = color(`󱐋 ${formatCost(d.sessionCost)}`, "teal");
	const dur = color(`(${formatDuration(d.sessionDurationMs)})`, "dim");
	const today = d.todayCost > 0 ? ` ${FIRE} ` + color(`D ${formatCost(d.todayCost)}`, "subtext") : "";
	const burn =
		d.burnRatePerHr !== null && d.burnRatePerHr > 10
			? ` ${FIRE} ` + color(`${formatCost(d.burnRatePerHr)}/hr`, "red")
			: "";
	const week =
		d.weekCost > 0 && d.fiveHourPct !== null && d.fiveHourPct > 70
			? ` ${FIRE} ` + color(` ${formatCost(d.weekCost)}/125`, "subtext")
			: "";

	const ctxLine =
		d.contextPct !== null
			? color(`󰄨 ${formatPct(d.contextPct)}`, "sky") +
				" " +
				color(sparkline(d.contextSeries), "sky")
			: "";

	const fhLine =
		d.fiveHourPct !== null
			? color(` 5h ${formatPct(d.fiveHourPct)}`, "peach") +
				" " +
				color(sparkline(d.fiveHourSeries), "peach")
			: "";

	const tps =
		d.tokensPerSec !== null
			? ` ${BOLT} ` + color(`${Math.round(d.tokensPerSec)} t/s`, "yellow")
			: "";

	return `${cost} ${dur}${today}${burn}${week} ${WAVE} ${ctxLine} ${WAVE} ${fhLine}${tps}`;
}

function renderLine3(d: StatuslineData): string {
	const ctxDetail =
		d.contextPct !== null
			? color(`󰄨 ${formatPct(d.contextPct)}${d.contextPct > 85 ? "!" : ""}`, "red") +
				" " +
				color(sparkline(d.contextSeries), "red") +
				" " +
				color(`${formatTokens(d.contextTokens ?? 0)}`, "dim")
			: "";
	const fhDetail =
		d.fiveHourPct !== null
			? color(` ${formatPct(d.fiveHourPct)}`, "red") +
				" " +
				color(sparkline(d.fiveHourSeries), "red")
			: "";
	let forecast = "";
	if (d.etaMinutes !== null) {
		if (d.etaMinutes === 0) forecast = color("⚠ AT LIMIT", "red");
		else forecast = color(`⚠ ETA limit: ${d.etaMinutes}min`, "red");
	} else if (d.etaCooling) {
		forecast = color("Trend: cooling ↓", "green");
	} else {
		forecast = color("Forecast: SAFE ✓", "green");
	}
	return `${ctxDetail} ${WAVE} ${fhDetail} ${DOT} ${forecast}`;
}

export function render(d: StatuslineData): string {
	const l1 = renderLine1(d);
	const l2 = renderLine2(d);
	if (!d.alertMode) return `${l1}\n${l2}`;
	return `${l1}\n${l2}\n${renderLine3(d)}`;
}

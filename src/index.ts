import { basename } from "node:path";
import { CONFIG } from "./config";
import { burnRate } from "./lib/burn";
import { compactThreshold } from "./lib/compaction";
import { forecastEta } from "./lib/forecast";
import { getGitStatus } from "./lib/git";
import { History } from "./lib/history";
import { getUsageLimits, limitsFromPayload } from "./lib/limits";
import { classifyMood } from "./lib/mood";
import { render } from "./lib/render";
import { SessionsStore } from "./lib/sessions";
import type { HookInput, StatuslineData } from "./lib/types";

function fallback(dir: string, model: string): string {
	return `${basename(dir)} · ${model}`;
}

async function main(): Promise<void> {
	let input: HookInput;
	try {
		input = await Bun.stdin.json();
	} catch {
		console.log("statusline-godlike: invalid stdin");
		return;
	}

	try {
		const nowSec = Math.floor(Date.now() / 1000);
		const minuteBucket = Math.floor(nowSec / 60) * 60;
		const nowMs = Date.now();
		const cwd = input.workspace.current_dir;
		const dirName = basename(cwd);

		const history = new History(CONFIG.paths.historyDb);
		history.prune(CONFIG.history.retentionMinutes, nowSec);
		history.pruneCosts(CONFIG.history.costRetentionDays, nowSec);

		const payloadLimits = limitsFromPayload(input.rate_limits);
		const [git, limits] = await Promise.all([
			getGitStatus(cwd),
			payloadLimits ?? getUsageLimits(nowSec),
		]);

		const ctxUsage = input.context_window?.current_usage;
		const contextTokens = ctxUsage
			? (ctxUsage.input_tokens ?? 0) +
				(ctxUsage.cache_creation_input_tokens ?? 0) +
				(ctxUsage.cache_read_input_tokens ?? 0)
			: null;
		const cacheHitPct =
			ctxUsage && contextTokens
				? Math.round(((ctxUsage.cache_read_input_tokens ?? 0) / contextTokens) * 100)
				: null;
		const ctxMax = input.context_window?.context_window_size ?? 200_000;
		const contextPct =
			input.context_window?.used_percentage ??
			(contextTokens !== null ? Math.round((contextTokens / ctxMax) * 100) : null);

		const sessionCost = input.cost.total_cost_usd;
		const sessionDur = input.cost.total_duration_ms;
		const apiDur = input.cost.total_api_duration_ms ?? 0;
		const tokensPerSec = apiDur > 0 && contextTokens ? (contextTokens / apiDur) * 1000 : null;
		const fiveHourPct = limits.five_hour?.utilization ?? null;
		const fiveHourResetsAt = limits.five_hour?.resets_at ?? null;
		const sevenDayPct = limits.seven_day?.utilization ?? null;
		const sevenDayResetsAt = limits.seven_day?.resets_at ?? null;

		const threshold = compactThreshold(ctxMax);
		const compactPct =
			threshold !== null && contextTokens !== null
				? Math.round((contextTokens / threshold) * 100)
				: null;
		const tokensToCompact =
			threshold !== null && contextTokens !== null ? Math.max(0, threshold - contextTokens) : null;

		// Record samples
		history.record("cost", sessionCost, minuteBucket);
		history.recordSessionCost(input.session_id, sessionCost, nowSec);
		if (compactPct !== null) history.record("ctx_pct", compactPct, minuteBucket);
		else if (contextPct !== null) history.record("ctx_pct", contextPct, minuteBucket);
		if (fiveHourPct !== null) history.record("5h_pct", fiveHourPct, minuteBucket);
		if (tokensPerSec !== null) history.record("tps", tokensPerSec, minuteBucket);

		// Read series
		const costSeries = history.getSeries("cost", CONFIG.history.windowMinutes, nowSec);
		const ctxSeries = history.getSeries("ctx_pct", CONFIG.history.windowMinutes, nowSec);
		const fhSeries = history.getSeries("5h_pct", CONFIG.history.windowMinutes, nowSec);
		const tpsSeries = history.getSeries("tps", CONFIG.history.windowMinutes, nowSec);

		// Burn rate from cost samples
		const costSamples = costSeries.map((v, i) => ({
			metric: "cost",
			value: v,
			sampled_at: nowSec - (costSeries.length - 1 - i) * 60,
		}));
		const burn = burnRate(costSamples);

		// Sessions
		const sessionsStore = new SessionsStore(CONFIG.paths.sessionsJson);
		sessionsStore.record(input.session_id, cwd, nowMs);
		const activeSessions = sessionsStore.countActive(5, nowMs);

		// Alert / mood / forecast
		const pressurePct = compactPct ?? contextPct;
		const alertMode =
			(pressurePct !== null && pressurePct > CONFIG.thresholds.compactAlert) ||
			(fiveHourPct !== null && fiveHourPct > CONFIG.thresholds.fiveHourAlert) ||
			(sevenDayPct !== null && sevenDayPct > CONFIG.thresholds.sevenDayAlert);
		const mood = classifyMood({ contextPct: pressurePct, sessionCost, fiveHourPct, sevenDayPct });
		const { minutes: etaMinutes, cooling: etaCooling } = alertMode
			? forecastEta(fhSeries, 100)
			: { minutes: null, cooling: false };

		const todayCost = history.costToday(nowSec);
		const weekCost = history.costSince(nowSec - 7 * 86400);

		history.close();

		const data: StatuslineData = {
			mood,
			git: git ?? { branch: "no-git", dirty: false, insertions: 0, deletions: 0 },
			modelName: input.model.display_name,
			dirName,
			activeSessions,
			sessionCost,
			sessionDurationMs: sessionDur,
			todayCost,
			weekCost,
			contextPct,
			contextTokens,
			contextSeries: ctxSeries,
			compactPct,
			tokensToCompact,
			fiveHourPct,
			fiveHourResetsAt,
			fiveHourSeries: fhSeries,
			sevenDayPct,
			sevenDayResetsAt,
			tokensPerSec,
			tokensPerSecSeries: tpsSeries,
			cacheHitPct,
			burnRatePerHr: burn,
			etaMinutes,
			etaCooling,
			alertMode,
			celebrationMode: mood.kind === "rose",
		};

		console.log(render(data));
	} catch (err) {
		console.log(fallback(input.workspace?.current_dir ?? "?", input.model?.display_name ?? "?"));
	}
}

main();

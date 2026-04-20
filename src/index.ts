import { basename } from "node:path";
import { CONFIG } from "./config";
import { burnRate } from "./lib/burn";
import { forecastEta } from "./lib/forecast";
import { getGitStatus } from "./lib/git";
import { History } from "./lib/history";
import { getUsageLimits } from "./lib/limits";
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
		const nowMs = Date.now();
		const cwd = input.workspace.current_dir;
		const dirName = basename(cwd);

		const history = new History(CONFIG.paths.historyDb);
		history.prune(CONFIG.history.retentionMinutes, nowSec);

		const [git, limits] = await Promise.all([getGitStatus(cwd), getUsageLimits(nowSec)]);

		const ctxUsage = input.context_window?.current_usage;
		const contextTokens = ctxUsage
			? (ctxUsage.input_tokens ?? 0) +
				(ctxUsage.cache_creation_input_tokens ?? 0) +
				(ctxUsage.cache_read_input_tokens ?? 0)
			: null;
		const ctxMax = input.context_window?.context_window_size ?? 200_000;
		const contextPct =
			input.context_window?.used_percentage ??
			(contextTokens !== null ? Math.round((contextTokens / ctxMax) * 100) : null);

		const sessionCost = input.cost.total_cost_usd;
		const sessionDur = input.cost.total_duration_ms;
		const apiDur = input.cost.total_api_duration_ms ?? 0;
		const tokensPerSec =
			apiDur > 0 && contextTokens ? (contextTokens / apiDur) * 1000 : null;
		const fiveHourPct = limits.five_hour?.utilization ?? null;
		const fiveHourResetsAt = limits.five_hour?.resets_at ?? null;

		// Record samples
		history.record("cost", sessionCost, nowSec);
		if (contextPct !== null) history.record("ctx_pct", contextPct, nowSec);
		if (fiveHourPct !== null) history.record("5h_pct", fiveHourPct, nowSec);
		if (tokensPerSec !== null) history.record("tps", tokensPerSec, nowSec);

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
		const alertMode =
			(contextPct !== null && contextPct > CONFIG.thresholds.contextAlert) ||
			(fiveHourPct !== null && fiveHourPct > CONFIG.thresholds.fiveHourAlert);
		const mood = classifyMood({ contextPct, sessionCost, fiveHourPct });
		const { minutes: etaMinutes, cooling: etaCooling } = alertMode
			? forecastEta(fhSeries, 100)
			: { minutes: null, cooling: false };

		history.close();

		// todayCost / weekCost aggregation deferred to v0.2 — render hides segments when 0
		const todayCost = 0;
		const weekCost = 0;

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
			fiveHourPct,
			fiveHourResetsAt,
			fiveHourSeries: fhSeries,
			tokensPerSec,
			tokensPerSecSeries: tpsSeries,
			cacheHitPct: null,
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

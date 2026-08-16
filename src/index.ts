import { basename } from "node:path";
import { CONFIG } from "./config";
import { burnRate } from "./lib/burn";
import { compactThreshold } from "./lib/compaction";
import { forecastEta } from "./lib/forecast";
import { applyPaletteOverrides } from "./lib/format";
import { getGitStatus } from "./lib/git";
import { History } from "./lib/history";
import { limitsFromCache, limitsFromPayload } from "./lib/limits";
import { migrateLegacyPaths } from "./lib/migrate";
import { classifyMood } from "./lib/mood";
import { render } from "./lib/render";
import { sanitizeLabel, sanitizeOptionalLabel } from "./lib/sanitize";
import { SessionsStore } from "./lib/sessions";
import type { HookInput, StatuslineData } from "./lib/types";
import { loadUserConfig } from "./lib/userConfig";

function fallback(dir: string, model: string): string {
	return `${basename(dir)} · ${model}`;
}

// The hook payload is JSON from outside this process: a field typed `number`
// can still arrive as a string, null, or 1e308. Every numeric read goes
// through these so one bad field degrades a single segment instead of
// dropping the whole statusline to the fallback line.
function finite(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Absurd values are rejected rather than clamped: a clamped 1e308 would still
// be written to the cost history and poison the day/week totals for 30 days.
const MAX_PLAUSIBLE = 1e12;

function count(value: unknown, fallbackValue = 0): number {
	const n = finite(value);
	return n === null || n < 0 || n > MAX_PLAUSIBLE ? fallbackValue : n;
}

async function main(): Promise<void> {
	let input: HookInput;
	try {
		input = await Bun.stdin.json();
	} catch {
		console.log("ccstatusline-godlike: invalid stdin");
		return;
	}

	try {
		if (!process.env.CCSTATUSLINE_DATA_DIR && !process.env.CCSTATUSLINE_CACHE_DIR) {
			migrateLegacyPaths([
				{ from: CONFIG.paths.legacy.historyDb, to: CONFIG.paths.historyDb },
				{ from: CONFIG.paths.legacy.sessionsJson, to: CONFIG.paths.sessionsJson },
				{ from: CONFIG.paths.legacy.limitsCache, to: CONFIG.paths.limitsCache },
			]);
		}

		const cwd = input.workspace?.current_dir ?? process.cwd();
		const { config: userConfig, errors: configErrors } = loadUserConfig(cwd);
		for (const err of configErrors) console.error(`ccstatusline-godlike: config error — ${err}`);
		applyPaletteOverrides(userConfig.colors);

		const nowSec = Math.floor(Date.now() / 1000);
		const minuteBucket = Math.floor(nowSec / 60) * 60;
		const nowMs = Date.now();
		const dirName = basename(cwd);
		const sessionId = sanitizeOptionalLabel(input.session_id) ?? "unknown";

		const history = new History(CONFIG.paths.historyDb);
		history.prune(CONFIG.history.retentionMinutes, nowSec);
		history.pruneCosts(CONFIG.history.costRetentionDays, nowSec);

		const limits = limitsFromPayload(input.rate_limits) ?? limitsFromCache(nowSec);
		const git = await getGitStatus(cwd);

		const ctxUsage = input.context_window?.current_usage;
		const contextTokens = ctxUsage
			? count(ctxUsage.input_tokens) +
				count(ctxUsage.cache_creation_input_tokens) +
				count(ctxUsage.cache_read_input_tokens)
			: null;
		const cacheHitPct =
			ctxUsage && contextTokens
				? Math.round((count(ctxUsage.cache_read_input_tokens) / contextTokens) * 100)
				: null;
		const ctxMax = count(input.context_window?.context_window_size, 200_000);
		const contextPct =
			finite(input.context_window?.used_percentage) ??
			(contextTokens !== null && ctxMax > 0 ? Math.round((contextTokens / ctxMax) * 100) : null);

		const sessionCost = count(input.cost?.total_cost_usd);
		const sessionDur = count(input.cost?.total_duration_ms);
		const apiDur = count(input.cost?.total_api_duration_ms);
		const tokensPerSec = apiDur > 0 && contextTokens ? (contextTokens / apiDur) * 1000 : null;
		const fiveHourPct = limits.five_hour?.utilization ?? null;
		const fiveHourResetsAt = limits.five_hour?.resets_at ?? null;
		const sevenDayPct = limits.seven_day?.utilization ?? null;
		const sevenDayResetsAt = limits.seven_day?.resets_at ?? null;

		const threshold = compactThreshold(ctxMax, userConfig.thresholds.compactionReserveRatio);
		const compactPct =
			threshold !== null && contextTokens !== null
				? Math.round((contextTokens / threshold) * 100)
				: null;
		const tokensToCompact =
			threshold !== null && contextTokens !== null ? Math.max(0, threshold - contextTokens) : null;

		// Record samples
		history.record("cost", sessionCost, minuteBucket);
		history.recordSessionCost(sessionId, sessionCost, nowSec);
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
		sessionsStore.record(sessionId, cwd, nowMs);
		const activeSessions = sessionsStore.countActive(5, nowMs);

		// Alert / mood / forecast
		const pressurePct = compactPct ?? contextPct;
		const alertMode =
			(pressurePct !== null && pressurePct > userConfig.thresholds.compactAlert) ||
			(fiveHourPct !== null && fiveHourPct > userConfig.thresholds.fiveHourAlert) ||
			(sevenDayPct !== null && sevenDayPct > userConfig.thresholds.sevenDayAlert);
		const mood = classifyMood({ contextPct: pressurePct, sessionCost, fiveHourPct, sevenDayPct });
		const { minutes: etaMinutes, cooling: etaCooling } = alertMode
			? forecastEta(fhSeries, 100)
			: { minutes: null, cooling: false };

		const todayCost = history.costToday(nowSec);
		const weekCost = history.costSince(nowSec - 7 * 86400);

		history.close();

		const data: StatuslineData = {
			mood,
			git: git
				? { ...git, branch: sanitizeLabel(git.branch) }
				: { branch: "no-git", dirty: false, insertions: 0, deletions: 0 },
			modelName: sanitizeOptionalLabel(input.model?.display_name) ?? "?",
			dirName: sanitizeLabel(dirName),
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
			sessionName: sanitizeOptionalLabel(input.session_name),
			ccVersion: sanitizeOptionalLabel(input.version),
			outputStyle:
				input.output_style?.name && input.output_style.name.toLowerCase() !== "default"
					? sanitizeOptionalLabel(input.output_style.name)
					: null,
			worktree: input.workspace?.git_worktree
				? sanitizeOptionalLabel(basename(input.workspace.git_worktree))
				: null,
			linesAdded: count(input.cost?.total_lines_added),
			linesRemoved: count(input.cost?.total_lines_removed),
			vimMode: sanitizeOptionalLabel(input.vim?.mode),
			agentName: sanitizeOptionalLabel(input.agent?.name),
		};

		console.log(render(data, userConfig.segments));
	} catch (err) {
		console.error(`ccstatusline-godlike: fallback path hit — ${err}`);
		console.log(fallback(input.workspace?.current_dir ?? "?", input.model?.display_name ?? "?"));
	}
}

main();

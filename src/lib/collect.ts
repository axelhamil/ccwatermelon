import { basename } from "node:path";
import { CONFIG } from "../config";
import { burnRate } from "./burn";
import { compactThreshold } from "./compaction";
import { forecastEta } from "./forecast";
import { getGitStatus } from "./git";
import { History } from "./history";
import { resolveLimits } from "./limits";
import { classifyMood } from "./mood";
import type { Payload } from "./payload";
import { sanitizeLabel, sanitizeOptionalLabel } from "./sanitize";
import type { GitStatus, StatuslineData, UsageLimits } from "./types";
import type { ResolvedConfig } from "./userConfig";

const FIVE_HOUR_METRIC = "5h_pct";
const NO_GIT: GitStatus = { branch: "no-git", dirty: false, insertions: 0, deletions: 0 };

type ContextUsage = Pick<
	StatuslineData,
	"contextPct" | "contextTokens" | "cacheHitPct" | "compactPct" | "tokensToCompact"
>;

type Ledger = Pick<
	StatuslineData,
	"todayCost" | "weekCost" | "burnRatePerHr" | "activeSessions"
> & {
	fiveHourEta: ReturnType<typeof forecastEta>;
};

interface Session {
	id: string;
	project: string;
	cost: number | null;
}

function contextUsage(window: Payload["context_window"], reserveRatio: number): ContextUsage {
	const usage = window?.current_usage;
	const cachedTokens = usage?.cache_read_input_tokens ?? 0;
	const contextTokens = usage
		? (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + cachedTokens
		: null;
	const windowSize = window?.context_window_size || CONFIG.compaction.fallbackWindow;
	const measuredPct =
		contextTokens === null ? null : Math.round((contextTokens / windowSize) * 100);
	const threshold = compactThreshold(windowSize, reserveRatio);
	const pressure =
		contextTokens === null || threshold === null
			? { compactPct: null, tokensToCompact: null }
			: {
					compactPct: Math.round((contextTokens / threshold) * 100),
					tokensToCompact: Math.max(0, threshold - contextTokens),
				};

	return {
		contextTokens,
		contextPct: window?.used_percentage ?? measuredPct,
		cacheHitPct: contextTokens ? Math.round((cachedTokens / contextTokens) * 100) : null,
		...pressure,
	};
}

function updateLedger(session: Session, fiveHourPct: number | null, now: number): Ledger {
	const history = new History(CONFIG.paths.historyDb);

	try {
		const minute = Math.floor(now / 60) * 60;
		const windowStart = now - CONFIG.history.windowMinutes * 60;
		const costMetric = `cost:${session.id}`;

		history.prune(CONFIG.history.retentionMinutes, now);
		history.pruneCosts(CONFIG.history.costRetentionDays, now);
		history.pruneSessions(now - CONFIG.sessions.retentionSec);

		if (session.cost !== null) {
			history.record(costMetric, session.cost, minute);
			history.recordSessionCost(session.id, session.cost, now);
		}
		history.touchSession(session.id, session.project, now);
		if (fiveHourPct !== null) history.record(FIVE_HOUR_METRIC, fiveHourPct, minute);

		return {
			todayCost: history.costToday(now),
			weekCost: history.costOverDays(7, now),
			burnRatePerHr: burnRate(history.samplesSince(costMetric, windowStart)),
			activeSessions: history.countActiveSessions(
				session.project,
				now - CONFIG.sessions.activeWindowSec,
			),
			fiveHourEta: forecastEta(history.samplesSince(FIVE_HOUR_METRIC, windowStart), 100),
		};
	} finally {
		history.close();
	}
}

function isAlerting(
	pressurePct: number | null,
	limits: UsageLimits,
	thresholds: ResolvedConfig["thresholds"],
): boolean {
	const exceeds = (pct: number | null | undefined, threshold: number) =>
		pct !== null && pct !== undefined && pct > threshold;

	return (
		exceeds(pressurePct, thresholds.compactAlert) ||
		exceeds(limits.five_hour?.utilization, thresholds.fiveHourAlert) ||
		exceeds(limits.seven_day?.utilization, thresholds.sevenDayAlert)
	);
}

function outputStyle(payload: Payload): string | null {
	const name = sanitizeOptionalLabel(payload.output_style?.name);

	return name?.toLowerCase() === "default" ? null : name;
}

export async function collectStatuslineData(
	payload: Payload,
	config: ResolvedConfig,
	cwd: string,
): Promise<StatuslineData> {
	const now = Math.floor(Date.now() / 1000);
	const limits = resolveLimits(payload.rate_limits, now);
	const fiveHourPct = limits.five_hour?.utilization ?? null;
	const sevenDayPct = limits.seven_day?.utilization ?? null;
	const context = contextUsage(payload.context_window, config.thresholds.compactionReserveRatio);
	const pressurePct = context.compactPct ?? context.contextPct;
	const reportedCost = payload.cost?.total_cost_usd ?? null;
	const sessionCost = reportedCost ?? 0;
	const session: Session = {
		id: sanitizeOptionalLabel(payload.session_id) ?? "unknown",
		project: payload.workspace?.project_dir ?? cwd,
		cost: reportedCost,
	};
	const { fiveHourEta, ...ledger } = updateLedger(session, fiveHourPct, now);
	const git = await getGitStatus(cwd);
	const mood = classifyMood({ contextPct: pressurePct, sessionCost, fiveHourPct, sevenDayPct });
	const alertMode = isAlerting(pressurePct, limits, config.thresholds);
	const worktree = payload.workspace?.git_worktree;

	return {
		...context,
		...ledger,
		mood,
		git: git ? { ...git, branch: sanitizeLabel(git.branch) } : NO_GIT,
		modelName: sanitizeOptionalLabel(payload.model?.display_name) ?? "?",
		dirName: sanitizeLabel(basename(cwd)),
		sessionCost,
		sessionDurationMs: payload.cost?.total_duration_ms ?? 0,
		fiveHourPct,
		fiveHourResetsAt: limits.five_hour?.resets_at ?? null,
		sevenDayPct,
		sevenDayResetsAt: limits.seven_day?.resets_at ?? null,
		etaMinutes: alertMode ? fiveHourEta.minutes : null,
		etaCooling: alertMode && fiveHourEta.cooling,
		alertMode,
		celebrationMode: mood.kind === "rose",
		sessionName: sanitizeOptionalLabel(payload.session_name),
		ccVersion: sanitizeOptionalLabel(payload.version),
		outputStyle: outputStyle(payload),
		worktree: worktree ? sanitizeOptionalLabel(basename(worktree)) : null,
		linesAdded: payload.cost?.total_lines_added ?? 0,
		linesRemoved: payload.cost?.total_lines_removed ?? 0,
		vimMode: sanitizeOptionalLabel(payload.vim?.mode),
		agentName: sanitizeOptionalLabel(payload.agent?.name),
	};
}

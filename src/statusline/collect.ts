import { basename } from "node:path";
import { CONFIG } from "../config/constants";
import type { ResolvedConfig } from "../config/userConfig";
import { compactThreshold } from "../context/compaction";
import { burnRate } from "../cost/burn";
import { History } from "../cost/history";
import type { GitStatus } from "../git/git";
import { getGitStatus } from "../git/git";
import { forecastEta } from "../quota/forecast";
import { resolveLimits } from "../quota/limits";
import { FIVE_HOUR_WINDOW_SEC, projectedAtReset, SEVEN_DAY_WINDOW_SEC } from "../quota/pace";
import { pressureLevel } from "../quota/pressure";
import type { UsageLimits } from "../quota/rateLimits";
import { sanitizeLabel, sanitizeOptionalLabel } from "../terminal/sanitize";
import type { PullRequest, StatuslineData } from "./data";
import { classifyMood } from "./mood";
import type { Payload } from "./payload";

const FIVE_HOUR_METRIC = "5h_pct";
const NO_GIT: GitStatus = { branch: "no-git", dirty: false, insertions: 0, deletions: 0 };

type ContextUsage = Pick<
	StatuslineData,
	"contextPct" | "cacheHitPct" | "compactPct" | "compactHeadroom"
>;

type Quotas = Pick<
	StatuslineData,
	| "fiveHourPct"
	| "fiveHourResetsAt"
	| "fiveHourProjectedPct"
	| "sevenDayPct"
	| "sevenDayResetsAt"
	| "sevenDayProjectedPct"
>;

type Ledger = Pick<
	StatuslineData,
	"projectTodayCost" | "todayCost" | "weekCost" | "burnRatePerHr" | "activeSessions"
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
			? { compactPct: null, compactHeadroom: null }
			: {
					compactPct: Math.round((contextTokens / threshold) * 100),
					compactHeadroom: threshold - contextTokens,
				};

	return {
		contextPct: window?.used_percentage ?? measuredPct,
		cacheHitPct: contextTokens ? Math.round((cachedTokens / contextTokens) * 100) : null,
		...pressure,
	};
}

function quotasOf(limits: UsageLimits, now: number): Quotas {
	const fiveHourPct = limits.five_hour?.utilization ?? null;
	const fiveHourResetsAt = limits.five_hour?.resets_at ?? null;
	const sevenDayPct = limits.seven_day?.utilization ?? null;
	const sevenDayResetsAt = limits.seven_day?.resets_at ?? null;

	return {
		fiveHourPct,
		fiveHourResetsAt,
		fiveHourProjectedPct: projectedAtReset(
			fiveHourPct,
			fiveHourResetsAt,
			FIVE_HOUR_WINDOW_SEC,
			now,
		),
		sevenDayPct,
		sevenDayResetsAt,
		sevenDayProjectedPct: projectedAtReset(
			sevenDayPct,
			sevenDayResetsAt,
			SEVEN_DAY_WINDOW_SEC,
			now,
		),
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
			history.recordSessionCost(session.id, session.project, session.cost, now);
		}
		history.touchSession(session.id, session.project, now);
		if (fiveHourPct !== null) history.record(FIVE_HOUR_METRIC, fiveHourPct, minute);

		return {
			projectTodayCost: history.projectCostToday(session.project, now),
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

function minutesToLimit(
	eta: Ledger["fiveHourEta"],
	resetsAt: number | null,
	now: number,
): number | null {
	if (eta.minutes === null || resetsAt === null) return null;

	const minutesToReset = (resetsAt - now) / 60;

	return eta.minutes < minutesToReset ? eta.minutes : null;
}

const WEB_URL = /^https:\/\/[\x21-\x7e]{1,2048}$/;
const REPO_PART = /^[\w.-]+(\/[\w.-]+)*$/;

function webUrl(value: string | undefined): string | null {
	return value !== undefined && WEB_URL.test(value) ? value : null;
}

function repoUrl(repo: NonNullable<Payload["workspace"]>["repo"]): string | null {
	const parts = [repo?.host, repo?.owner, repo?.name];
	const isComplete = parts.every((part) => part !== undefined && REPO_PART.test(part));

	return isComplete ? webUrl(`https://${parts.join("/")}`) : null;
}

function pullRequest(pr: Payload["pr"]): PullRequest | null {
	if (pr?.number === undefined) return null;

	return { number: pr.number, url: webUrl(pr.url), reviewState: pr.review_state ?? null };
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
	const { thresholds } = config;
	const quotas = quotasOf(resolveLimits(payload.rate_limits, now), now);
	const context = contextUsage(payload.context_window, thresholds.compactionReserveRatio);
	const pressurePct = context.compactPct ?? context.contextPct;
	const contextLevel = pressureLevel(pressurePct, thresholds.compactAlert);
	const fiveHourLevel = pressureLevel(quotas.fiveHourPct, thresholds.fiveHourAlert);
	const sevenDayLevel = pressureLevel(quotas.sevenDayPct, thresholds.sevenDayAlert);
	const levels = [contextLevel, fiveHourLevel, sevenDayLevel];
	const isFiveHourTense = fiveHourLevel !== "calm";

	const reportedCost = payload.cost?.total_cost_usd ?? null;
	const sessionCost = reportedCost ?? 0;
	const session: Session = {
		id: sanitizeOptionalLabel(payload.session_id) ?? "unknown",
		project: payload.workspace?.project_dir ?? cwd,
		cost: reportedCost,
	};
	const { fiveHourEta, ...ledger } = updateLedger(session, quotas.fiveHourPct, now);

	const git = await getGitStatus(cwd);
	const mood = classifyMood({
		levels,
		contextPct: pressurePct,
		sessionCost,
		fiveHourPct: quotas.fiveHourPct,
		sevenDayPct: quotas.sevenDayPct,
	});
	const worktree = payload.workspace?.git_worktree;

	return {
		...context,
		...quotas,
		...ledger,
		contextLevel,
		fiveHourLevel,
		sevenDayLevel,
		mood,
		git: git ? { ...git, branch: sanitizeLabel(git.branch) } : NO_GIT,
		modelName: sanitizeOptionalLabel(payload.model?.display_name) ?? "?",
		dirName: sanitizeLabel(basename(cwd)),
		sessionCost,
		sessionDurationMs: payload.cost?.total_duration_ms ?? 0,
		etaMinutes: isFiveHourTense ? minutesToLimit(fiveHourEta, quotas.fiveHourResetsAt, now) : null,
		etaCooling: isFiveHourTense && fiveHourEta.cooling,
		celebrationMode: mood.kind === "rose",
		sessionName: sanitizeOptionalLabel(payload.session_name),
		ccVersion: sanitizeOptionalLabel(payload.version),
		outputStyle: outputStyle(payload),
		worktree: worktree ? sanitizeOptionalLabel(basename(worktree)) : null,
		linesAdded: payload.cost?.total_lines_added ?? 0,
		linesRemoved: payload.cost?.total_lines_removed ?? 0,
		vimMode: sanitizeOptionalLabel(payload.vim?.mode),
		agentName: sanitizeOptionalLabel(payload.agent?.name),
		effort: sanitizeOptionalLabel(payload.effort?.level),
		thinking: payload.thinking?.enabled ?? false,
		fastMode: payload.fast_mode ?? false,
		pullRequest: pullRequest(payload.pr),
		repoUrl: git ? repoUrl(payload.workspace?.repo) : null,
	};
}

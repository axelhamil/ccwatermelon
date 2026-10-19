import { basename } from "node:path";
import { CONFIG } from "../config/constants";
import type { ResolvedConfig } from "../config/userConfig";
import { compactThreshold } from "../context/compaction";
import { pressureLevel } from "../context/pressure";
import type { GitStatus } from "../git/git";
import { getGitStatus } from "../git/git";
import { sanitizeLabel, sanitizeOptionalLabel } from "../terminal/sanitize";
import type { PullRequest, StatuslineData } from "./data";
import { classifyMood } from "./mood";
import type { Payload } from "./payload";

const NO_GIT: GitStatus = { branch: "no-git", dirty: false, insertions: 0, deletions: 0 };

type ContextUsage = Pick<
	StatuslineData,
	"contextPct" | "cacheHitPct" | "compactPct" | "compactHeadroom"
>;

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
	const { thresholds } = config;
	const context = contextUsage(payload.context_window, thresholds.compactionReserveRatio);
	const pressurePct = context.compactPct ?? context.contextPct;
	const contextLevel = pressureLevel(pressurePct, thresholds.compactAlert);
	const git = await getGitStatus(cwd);
	const mood = classifyMood({ contextLevel, contextPct: pressurePct });
	const worktree = payload.workspace?.git_worktree;

	return {
		...context,
		contextLevel,
		mood,
		git: git ? { ...git, branch: sanitizeLabel(git.branch) } : NO_GIT,
		modelName: sanitizeOptionalLabel(payload.model?.display_name) ?? "?",
		dirName: sanitizeLabel(basename(cwd)),
		sessionDurationMs: payload.cost?.total_duration_ms ?? 0,
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

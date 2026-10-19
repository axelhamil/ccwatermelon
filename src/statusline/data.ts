import type { PressureLevel } from "../context/pressure";
import type { GitStatus } from "../git/git";
import type { Mood } from "./mood";

export type ReviewState = "approved" | "pending" | "changes_requested" | "draft";

export interface PullRequest {
	number: number;
	url: string | null;
	reviewState: ReviewState | null;
}

export interface Clock {
	now: number;
	beat: number;
	moving: boolean;
}

export interface StatuslineData {
	mood: Mood;
	git: GitStatus;
	modelName: string;
	dirName: string;
	sessionDurationMs: number;

	contextPct: number | null;
	compactPct: number | null;
	compactHeadroom: number | null;
	contextLevel: PressureLevel;

	cacheHitPct: number | null;

	celebrationMode: boolean;

	sessionName: string | null;
	ccVersion: string | null;
	outputStyle: string | null;
	worktree: string | null;
	linesAdded: number;
	linesRemoved: number;
	vimMode: string | null;
	agentName: string | null;

	effort: string | null;
	thinking: boolean;
	fastMode: boolean;
	pullRequest: PullRequest | null;
	repoUrl: string | null;
}

import type { GitStatus } from "../git/git";
import type { PressureLevel } from "../quota/pressure";
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
	activeSessions: number;

	sessionCost: number;
	sessionDurationMs: number;
	projectTodayCost: number;
	todayCost: number;
	weekCost: number;

	contextPct: number | null;
	compactPct: number | null;
	compactHeadroom: number | null;
	contextLevel: PressureLevel;

	fiveHourPct: number | null;
	fiveHourResetsAt: number | null;
	fiveHourProjectedPct: number | null;
	fiveHourLevel: PressureLevel;

	sevenDayPct: number | null;
	sevenDayResetsAt: number | null;
	sevenDayProjectedPct: number | null;
	sevenDayLevel: PressureLevel;

	cacheHitPct: number | null;

	burnRatePerHr: number | null;
	etaMinutes: number | null;
	etaCooling: boolean;

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

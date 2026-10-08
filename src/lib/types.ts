import type { ColorName } from "./format";

type MoodKind = "rose" | "zen" | "focus" | "stressed" | "panic";

export interface Mood {
	kind: MoodKind;
	face: string;
	color: ColorName;
}

export interface UsageLimit {
	utilization: number;
	resets_at: number | null;
}

export interface UsageLimits {
	five_hour: UsageLimit | null;
	seven_day: UsageLimit | null;
}

export interface GitStatus {
	branch: string;
	dirty: boolean;
	insertions: number;
	deletions: number;
}

export interface Sample {
	sampled_at: number;
	value: number;
}

export interface StatuslineData {
	mood: Mood;
	git: GitStatus;
	modelName: string;
	dirName: string;
	activeSessions: number;

	sessionCost: number;
	sessionDurationMs: number;
	todayCost: number;
	weekCost: number;

	contextPct: number | null;
	contextTokens: number | null;
	compactPct: number | null;
	tokensToCompact: number | null;

	fiveHourPct: number | null;
	fiveHourResetsAt: number | null;

	sevenDayPct: number | null;
	sevenDayResetsAt: number | null;

	cacheHitPct: number | null;

	burnRatePerHr: number | null;
	etaMinutes: number | null;
	etaCooling: boolean;

	alertMode: boolean;
	celebrationMode: boolean;

	sessionName: string | null;
	ccVersion: string | null;
	outputStyle: string | null;
	worktree: string | null;
	linesAdded: number;
	linesRemoved: number;
	vimMode: string | null;
	agentName: string | null;
}

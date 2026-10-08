import type { ColorName } from "./format";
import type { PressureLevel } from "./pressure";

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
}

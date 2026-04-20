export type MoodKind = "rose" | "zen" | "focus" | "stressed" | "panic";

export interface Mood {
	kind: MoodKind;
	face: string;
	label: string | null;
	color: string;
	pulseFast: boolean;
}

export interface UsageLimit {
	utilization: number;
	resets_at: string | null;
}

export interface HookInput {
	session_id: string;
	workspace: { current_dir: string };
	model: { display_name: string };
	cost: {
		total_cost_usd: number;
		total_duration_ms: number;
		total_api_duration_ms?: number;
		total_lines_added?: number;
		total_lines_removed?: number;
	};
	context_window?: {
		current_usage?: {
			input_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
		};
		used_percentage?: number;
		context_window_size?: number;
	};
}

export interface GitStatus {
	branch: string;
	dirty: boolean;
	insertions: number;
	deletions: number;
}

export interface Sample {
	metric: string;
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
	contextSeries: number[];

	fiveHourPct: number | null;
	fiveHourResetsAt: string | null;
	fiveHourSeries: number[];

	tokensPerSec: number | null;
	tokensPerSecSeries: number[];
	cacheHitPct: number | null;

	burnRatePerHr: number | null;
	etaMinutes: number | null;
	etaCooling: boolean;

	alertMode: boolean;
	celebrationMode: boolean;
}

import type { SegmentToggle } from "../config/segmentConfig";
import type { ConfigFile, ResolvedConfig } from "../config/userConfig";
import { defaultConfig } from "../config/userConfig";
import { FIVE_HOUR_WINDOW_SEC, projectedAtReset, SEVEN_DAY_WINDOW_SEC } from "../quota/pace";
import { isAlerting, pressureLevel } from "../quota/pressure";
import type { StatuslineData } from "../statusline/data";
import { classifyMood } from "../statusline/mood";
import { SEGMENT_SPECS, type SegmentSpec } from "../statusline/segments";
import { THEMES, type ThemeName } from "../terminal/format";

export type ThresholdKey = "compactAlert" | "fiveHourAlert" | "sevenDayAlert";

export type Row =
	| { kind: "threshold"; key: ThresholdKey; label: string }
	| { kind: "theme" }
	| { kind: "segment"; spec: SegmentSpec };

export type EditorKey =
	| "up"
	| "down"
	| "left"
	| "right"
	| "bigLeft"
	| "bigRight"
	| "toggle"
	| "line"
	| "reset";

export interface EditorState {
	file: ConfigFile;
	cursor: number;
	dirty: boolean;
}

export interface SegmentView {
	enabled: boolean;
	line: 1 | 2 | 3;
	priority: number;
	edited: boolean;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matches one terminal key sequence per hit
const KEY_SEQUENCE_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1bO[@-~]|[\s\S]/gu;
const BIG_STEP = 5;
const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
const STEPS: Partial<Record<EditorKey, number>> = {
	left: -1,
	right: 1,
	bigLeft: -BIG_STEP,
	bigRight: BIG_STEP,
};

export const ROWS: readonly Row[] = [
	{ kind: "threshold", key: "compactAlert", label: "context" },
	{ kind: "threshold", key: "fiveHourAlert", label: "5h quota" },
	{ kind: "threshold", key: "sevenDayAlert", label: "7d quota" },
	{ kind: "theme" },
	...SEGMENT_SPECS.map((spec): Row => ({ kind: "segment", spec })),
];

export function splitKeys(chunk: string): string[] {
	return chunk.match(KEY_SEQUENCE_RE) ?? [];
}

export function thresholdOf(file: ConfigFile, key: ThresholdKey): number {
	return file.thresholds?.[key] ?? defaultConfig().thresholds[key];
}

export function themeOf(file: ConfigFile): ThemeName {
	return file.theme ?? defaultConfig().theme;
}

export function segmentView(file: ConfigFile, spec: SegmentSpec): SegmentView {
	const override = file.segments?.[spec.id];
	const line = spec.relocatable ? (override?.line ?? spec.line) : spec.line;

	return {
		enabled: override?.enabled ?? !spec.disabledByDefault,
		line,
		priority: override?.priority ?? spec.priority ?? 0,
		edited: override !== undefined && Object.keys(override).length > 0,
	};
}

function patchSegment(file: ConfigFile, id: string, patch: SegmentToggle): ConfigFile {
	return { ...file, segments: { ...file.segments, [id]: { ...file.segments?.[id], ...patch } } };
}

function editThreshold(file: ConfigFile, key: ThresholdKey, action: EditorKey): ConfigFile {
	if (action === "reset") {
		if (file.thresholds?.[key] === undefined) return file;

		const { [key]: _default, ...thresholds } = file.thresholds;

		return { ...file, thresholds };
	}

	const step = STEPS[action];
	if (step === undefined) return file;

	const current = thresholdOf(file, key);
	const value = Math.min(100, Math.max(0, current + step));
	if (value === current) return file;

	return { ...file, thresholds: { ...file.thresholds, [key]: value } };
}

function editTheme(file: ConfigFile, action: EditorKey): ConfigFile {
	if (action === "reset") {
		if (file.theme === undefined) return file;

		const { theme: _default, ...rest } = file;

		return rest;
	}

	const step = STEPS[action];
	if (step === undefined) return file;

	const next = THEME_NAMES.indexOf(themeOf(file)) + Math.sign(step) + THEME_NAMES.length;

	return { ...file, theme: THEME_NAMES[next % THEME_NAMES.length] };
}

function editSegment(file: ConfigFile, spec: SegmentSpec, action: EditorKey): ConfigFile {
	const current = segmentView(file, spec);

	if (action === "reset") {
		if (file.segments?.[spec.id] === undefined) return file;

		const { [spec.id]: _default, ...segments } = file.segments;

		return { ...file, segments };
	}
	if (action === "toggle") return patchSegment(file, spec.id, { enabled: !current.enabled });
	if (action === "line" && spec.relocatable) {
		return patchSegment(file, spec.id, { line: current.line === 1 ? 2 : 1 });
	}

	const step = STEPS[action];
	const hasPriority = spec.priority !== undefined;
	if (step === undefined || !hasPriority) return file;

	const priority = Math.max(1, current.priority + step);
	if (priority === current.priority) return file;

	return patchSegment(file, spec.id, { priority });
}

function editRow(file: ConfigFile, row: Row, action: EditorKey): ConfigFile {
	if (row.kind === "threshold") return editThreshold(file, row.key, action);
	if (row.kind === "theme") return editTheme(file, action);

	return editSegment(file, row.spec, action);
}

export function applyKey(state: EditorState, action: EditorKey): EditorState {
	if (action === "up" || action === "down") {
		const moved = state.cursor + (action === "up" ? -1 : 1);
		const cursor = Math.min(ROWS.length - 1, Math.max(0, moved));

		return cursor === state.cursor ? state : { ...state, cursor };
	}

	const row = ROWS[state.cursor];
	if (!row) return state;

	const file = editRow(state.file, row, action);

	return file === state.file ? state : { ...state, file, dirty: true };
}

const IDLE_PRESSURE = { context: 72, fiveHour: 78, sevenDay: 64 };
const CONTEXT_THRESHOLD_TOKENS = 184_000;

export function previewData(
	config: ResolvedConfig,
	pressurePct: number | null,
	nowSec: number,
): StatuslineData {
	const { thresholds } = config;
	const contextPct = pressurePct ?? IDLE_PRESSURE.context;
	const fiveHourPct = pressurePct ?? IDLE_PRESSURE.fiveHour;
	const sevenDayPct = pressurePct ?? IDLE_PRESSURE.sevenDay;
	const contextLevel = pressureLevel(contextPct, thresholds.compactAlert);
	const fiveHourLevel = pressureLevel(fiveHourPct, thresholds.fiveHourAlert);
	const sevenDayLevel = pressureLevel(sevenDayPct, thresholds.sevenDayAlert);
	const levels = [contextLevel, fiveHourLevel, sevenDayLevel];
	const alertMode = levels.some(isAlerting);
	const contextTokens = Math.round((contextPct / 100) * CONTEXT_THRESHOLD_TOKENS);
	const fiveHourResetsAt = nowSec + 50 * 60;
	const sevenDayResetsAt = nowSec + 47 * 3600 + 18 * 60;
	const sessionCost = 3.42;
	const mood = classifyMood({ levels, contextPct, sessionCost, fiveHourPct, sevenDayPct });

	return {
		mood,
		git: { branch: "feat/melon-config", dirty: true, insertions: 142, deletions: 38 },
		modelName: "Opus 4.7",
		dirName: "ccwatermelon",
		activeSessions: 2,
		sessionCost,
		sessionDurationMs: 18 * 60_000,
		projectTodayCost: 12.4,
		todayCost: 95.9,
		weekCost: 412,
		contextPct,
		compactPct: contextPct,
		compactHeadroom: CONTEXT_THRESHOLD_TOKENS - contextTokens,
		contextLevel,
		fiveHourPct,
		fiveHourResetsAt,
		fiveHourProjectedPct: projectedAtReset(
			fiveHourPct,
			fiveHourResetsAt,
			FIVE_HOUR_WINDOW_SEC,
			nowSec,
		),
		fiveHourLevel,
		sevenDayPct,
		sevenDayResetsAt,
		sevenDayProjectedPct: projectedAtReset(
			sevenDayPct,
			sevenDayResetsAt,
			SEVEN_DAY_WINDOW_SEC,
			nowSec,
		),
		sevenDayLevel,
		cacheHitPct: 41,
		burnRatePerHr: alertMode ? 14.2 : null,
		etaMinutes: isAlerting(fiveHourLevel) ? Math.max(0, Math.round(100 - fiveHourPct)) : null,
		etaCooling: false,
		celebrationMode: mood.kind === "rose",
		sessionName: "melon-config-session",
		ccVersion: "2.1.0",
		outputStyle: null,
		worktree: "melon",
		linesAdded: 142,
		linesRemoved: 38,
		vimMode: null,
		agentName: null,
		effort: "high",
		thinking: false,
		fastMode: false,
		pullRequest: { number: 128, url: null, reviewState: "approved" },
		repoUrl: null,
	};
}

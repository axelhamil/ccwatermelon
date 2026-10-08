import type { PressureLevel } from "../quota/pressure";
import type { ColorName } from "../terminal/format";

type MoodKind = "rose" | "zen" | "focus" | "stressed" | "panic";

export interface Mood {
	kind: MoodKind;
	face: string;
	blink: string;
	color: ColorName;
}

export interface MoodInput {
	levels: PressureLevel[];
	contextPct: number | null;
	sessionCost: number;
	fiveHourPct: number | null;
	sevenDayPct: number | null;
}

const FOCUS_COST = 5;
const QUIET = { contextPct: 30, sessionCost: 1, fiveHourPct: 10, sevenDayPct: 30 };

function isQuiet(input: MoodInput): boolean {
	return (
		(input.contextPct ?? 0) < QUIET.contextPct &&
		input.sessionCost < QUIET.sessionCost &&
		(input.fiveHourPct ?? 0) < QUIET.fiveHourPct &&
		(input.sevenDayPct ?? 0) < QUIET.sevenDayPct
	);
}

export function classifyMood(input: MoodInput): Mood {
	const reached = (level: PressureLevel) => input.levels.includes(level);

	if (reached("panic")) return { kind: "panic", face: "(╯°□°)╯", blink: "(ノ°□°)ノ", color: "red" };
	if (reached("critical")) return { kind: "stressed", face: "(◉_◉)", blink: "(-_-)", color: "red" };
	if (reached("warn") || input.sessionCost > FOCUS_COST) {
		return { kind: "focus", face: "(•‿•)", blink: "(-‿-)", color: "yellow" };
	}
	if (isQuiet(input)) return { kind: "rose", face: "(◕‿◕)", blink: "(◡‿◡)", color: "pink" };

	return { kind: "zen", face: "(=ᴥ=)", blink: "(-ᴥ-)", color: "teal" };
}

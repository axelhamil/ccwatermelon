import type { PressureLevel } from "../context/pressure";
import type { ColorName } from "../terminal/format";

type MoodKind = "rose" | "zen" | "focus" | "stressed" | "panic";

export interface Mood {
	kind: MoodKind;
	face: string;
	blink: string;
	color: ColorName;
}

export interface MoodInput {
	contextLevel: PressureLevel;
	contextPct: number | null;
}

const QUIET_CONTEXT_PCT = 30;

export function classifyMood({ contextLevel, contextPct }: MoodInput): Mood {
	if (contextLevel === "panic") {
		return { kind: "panic", face: "(╯°□°)╯", blink: "(ノ°□°)ノ", color: "red" };
	}
	if (contextLevel === "critical") {
		return { kind: "stressed", face: "(◉_◉)", blink: "(-_-)", color: "red" };
	}
	if (contextLevel === "warn") {
		return { kind: "focus", face: "(•‿•)", blink: "(-‿-)", color: "yellow" };
	}
	if ((contextPct ?? 0) < QUIET_CONTEXT_PCT) {
		return { kind: "rose", face: "(◕‿◕)", blink: "(◡‿◡)", color: "magenta" };
	}

	return { kind: "zen", face: "(=ᴥ=)", blink: "(-ᴥ-)", color: "green" };
}

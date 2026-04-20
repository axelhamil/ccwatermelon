import type { Mood } from "./types";

export interface MoodInput {
	contextPct: number | null;
	sessionCost: number;
	fiveHourPct: number | null;
}

export function classifyMood(input: MoodInput): Mood {
	const ctx = input.contextPct ?? 0;
	const cost = input.sessionCost;
	const fh = input.fiveHourPct ?? 0;

	if (ctx > 95 || fh > 97) {
		return { kind: "panic", face: "(˵=͟͟͞╯°□°)╯", label: "PANIC", color: "red", pulseFast: true };
	}
	if (ctx > 85 || fh > 90) {
		return { kind: "stressed", face: "(◉_◉)⚠", label: "stressed", color: "red", pulseFast: false };
	}
	if (ctx > 70 || cost > 5 || fh > 70) {
		return { kind: "focus", face: "(•‿•)", label: "focus", color: "yellow", pulseFast: false };
	}
	if (ctx < 30 && cost < 1 && fh < 10) {
		return { kind: "rose", face: "(◕‿◕)♡", label: null, color: "pink", pulseFast: false };
	}
	return { kind: "zen", face: "(=ᴥ=)~", label: null, color: "teal", pulseFast: false };
}

import type { Mood } from "./types";

export interface MoodInput {
	contextPct: number | null;
	sessionCost: number;
	fiveHourPct: number | null;
	sevenDayPct: number | null;
}

export function classifyMood(input: MoodInput): Mood {
	const ctx = input.contextPct ?? 0;
	const cost = input.sessionCost;
	const fh = input.fiveHourPct ?? 0;
	const sd = input.sevenDayPct ?? 0;

	if (ctx > 95 || fh > 97 || sd > 95) return { kind: "panic", face: "(╯°□°)╯", color: "red" };
	if (ctx > 85 || fh > 90 || sd > 85) return { kind: "stressed", face: "(◉_◉)", color: "red" };
	if (ctx > 70 || cost > 5 || fh > 70 || sd > 70) {
		return { kind: "focus", face: "(•‿•)", color: "yellow" };
	}
	if (ctx < 30 && cost < 1 && fh < 10 && sd < 30) {
		return { kind: "rose", face: "(◕‿◕)", color: "pink" };
	}

	return { kind: "zen", face: "(=ᴥ=)", color: "teal" };
}

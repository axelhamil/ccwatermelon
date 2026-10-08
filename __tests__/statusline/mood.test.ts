import { describe, expect, test } from "bun:test";
import type { MoodInput } from "../src/lib/mood";
import { classifyMood } from "../src/lib/mood";

const ordinary: MoodInput = {
	levels: ["calm", "calm", "calm"],
	contextPct: 40,
	sessionCost: 2,
	fiveHourPct: 30,
	sevenDayPct: 40,
};

describe("classifyMood", () => {
	test("given an ordinary session, then the mood is zen", () => {
		expect(classifyMood(ordinary).kind).toBe("zen");
	});

	test("given a fresh cheap session with empty quotas, then the mood is rose", () => {
		const fresh = {
			...ordinary,
			contextPct: 10,
			sessionCost: 0.5,
			fiveHourPct: 5,
			sevenDayPct: null,
		};

		expect(classifyMood(fresh).kind).toBe("rose");
	});

	test("given one gauge in its warning zone or a session above $5, then the mood is focus", () => {
		expect(classifyMood({ ...ordinary, levels: ["calm", "warn", "calm"] }).kind).toBe("focus");
		expect(classifyMood({ ...ordinary, sessionCost: 6 }).kind).toBe("focus");
	});

	test("given one gauge past its alert threshold, then the mood is stressed", () => {
		expect(classifyMood({ ...ordinary, levels: ["calm", "calm", "critical"] }).kind).toBe(
			"stressed",
		);
	});

	test("given one gauge close to its ceiling, then panic wins over everything else", () => {
		expect(classifyMood({ ...ordinary, levels: ["warn", "panic", "critical"] }).kind).toBe("panic");
	});
});

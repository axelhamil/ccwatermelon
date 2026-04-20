import { describe, expect, test } from "bun:test";
import { classifyMood } from "../src/lib/mood";

describe("classifyMood", () => {
	test("all safe → rose", () => {
		const m = classifyMood({ contextPct: 10, sessionCost: 0.5, fiveHourPct: 5 });
		expect(m.kind).toBe("rose");
		expect(m.face).toBe("(◕‿◕)♡");
	});

	test("normal values → zen", () => {
		const m = classifyMood({ contextPct: 40, sessionCost: 2, fiveHourPct: 30 });
		expect(m.kind).toBe("zen");
		expect(m.face).toBe("(=ᴥ=)~");
	});

	test("context 75 → focus", () => {
		const m = classifyMood({ contextPct: 75, sessionCost: 2, fiveHourPct: 30 });
		expect(m.kind).toBe("focus");
	});

	test("cost 6 → focus", () => {
		const m = classifyMood({ contextPct: 40, sessionCost: 6, fiveHourPct: 30 });
		expect(m.kind).toBe("focus");
	});

	test("context 87 → stressed", () => {
		const m = classifyMood({ contextPct: 87, sessionCost: 2, fiveHourPct: 30 });
		expect(m.kind).toBe("stressed");
		expect(m.label).toBe("stressed");
	});

	test("5h 91 → stressed", () => {
		const m = classifyMood({ contextPct: 40, sessionCost: 2, fiveHourPct: 91 });
		expect(m.kind).toBe("stressed");
	});

	test("context 96 → panic", () => {
		const m = classifyMood({ contextPct: 96, sessionCost: 2, fiveHourPct: 30 });
		expect(m.kind).toBe("panic");
		expect(m.label).toBe("PANIC");
		expect(m.pulseFast).toBe(true);
	});

	test("null inputs treated as 0", () => {
		const m = classifyMood({ contextPct: null, sessionCost: 0, fiveHourPct: null });
		expect(m.kind).toBe("rose");
	});
});

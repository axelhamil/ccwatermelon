import { describe, expect, test } from "bun:test";
import type { MoodInput } from "../../src/statusline/mood";
import { classifyMood } from "../../src/statusline/mood";

const ordinary: MoodInput = { contextLevel: "calm", contextPct: 40 };

describe("classifyMood", () => {
	test("given a calm context half used, then the mood is zen", () => {
		expect(classifyMood(ordinary).kind).toBe("zen");
	});

	test("given a fresh context, then the mood is rose", () => {
		expect(classifyMood({ ...ordinary, contextPct: 10 }).kind).toBe("rose");
	});

	test("given no context measure yet, then the mood is rose", () => {
		expect(classifyMood({ contextLevel: "calm", contextPct: null }).kind).toBe("rose");
	});

	test("given the context in its warning zone, then the mood is focus", () => {
		expect(classifyMood({ ...ordinary, contextLevel: "warn", contextPct: 70 }).kind).toBe("focus");
	});

	test("given the context past its alert threshold, then the mood is stressed", () => {
		expect(classifyMood({ contextLevel: "critical", contextPct: 88 }).kind).toBe("stressed");
	});

	test("given the context close to its ceiling, then the mood is panic", () => {
		expect(classifyMood({ contextLevel: "panic", contextPct: 98 }).kind).toBe("panic");
	});
});

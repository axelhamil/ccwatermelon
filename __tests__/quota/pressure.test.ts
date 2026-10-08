import { describe, expect, test } from "bun:test";
import { pressureLevel } from "../../src/quota/pressure";

describe("pressureLevel", () => {
	test("given an alert threshold of 80, then warning starts 20 points below and panic halfway to 100", () => {
		expect(pressureLevel(60, 80)).toBe("calm");
		expect(pressureLevel(61, 80)).toBe("warn");
		expect(pressureLevel(80, 80)).toBe("warn");
		expect(pressureLevel(81, 80)).toBe("critical");
		expect(pressureLevel(91, 80)).toBe("panic");
	});

	test("given context past its compaction threshold, then it is panic", () => {
		expect(pressureLevel(163, 85)).toBe("panic");
	});

	test("given an unknown percentage, then it is calm", () => {
		expect(pressureLevel(null, 80)).toBe("calm");
	});
});

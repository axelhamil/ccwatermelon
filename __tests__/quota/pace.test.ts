import { describe, expect, test } from "bun:test";
import { projectedAtReset, SEVEN_DAY_WINDOW_SEC } from "../../src/quota/pace";

const now = 1_800_000_000;
const DAY = 86_400;

describe("projectedAtReset", () => {
	test("given 60% used with half of the week gone, then the week ends at 120%", () => {
		expect(projectedAtReset(60, now + 3.5 * DAY, SEVEN_DAY_WINDOW_SEC, now)).toBe(120);
	});

	test("given 20% used with 5 of 7 days gone, then the week ends at 28%", () => {
		expect(projectedAtReset(20, now + 2 * DAY, SEVEN_DAY_WINDOW_SEC, now)).toBe(28);
	});

	test("given a window that has barely started, then there is no projection yet", () => {
		expect(projectedAtReset(3, now + 6.9 * DAY, SEVEN_DAY_WINDOW_SEC, now)).toBeNull();
	});

	test("given no reset time or no percentage, then there is no projection", () => {
		expect(projectedAtReset(60, null, SEVEN_DAY_WINDOW_SEC, now)).toBeNull();
		expect(projectedAtReset(null, now + DAY, SEVEN_DAY_WINDOW_SEC, now)).toBeNull();
	});
});

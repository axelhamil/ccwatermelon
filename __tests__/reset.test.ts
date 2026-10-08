import { describe, expect, test } from "bun:test";
import { formatReset } from "../src/lib/reset";

const nowMs = new Date(2026, 5, 10, 9, 0, 0).getTime();
const inSeconds = (seconds: number) => Math.floor(nowMs / 1000) + seconds;

describe("formatReset", () => {
	test("given a reset later today, then it shows hours, minutes and the local clock", () => {
		expect(formatReset(inSeconds(3 * 3600 + 34 * 60), nowMs)).toBe("↺3h34 (12:34)");
	});

	test("given a reset days away, then it counts in days and names the weekday", () => {
		expect(formatReset(inSeconds(3 * 86_400 + 2 * 3600), nowMs)).toBe("↺3d2h (Sat 11:00)");
	});

	test("given a reset seconds away, then it never reads zero minutes", () => {
		expect(formatReset(inSeconds(3), nowMs)).toBe("↺1m (09:00)");
	});

	test("given a reset a few seconds short of a day, then the countdown and the weekday agree", () => {
		expect(formatReset(inSeconds(86_370), nowMs)).toBe("↺1d0h (Thu 08:59)");
	});

	test("given no reset time or one already passed, then nothing is shown", () => {
		expect(formatReset(null, nowMs)).toBe("");
		expect(formatReset(inSeconds(-10), nowMs)).toBe("");
	});
});

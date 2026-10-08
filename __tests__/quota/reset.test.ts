import { describe, expect, test } from "bun:test";
import { resetOf } from "../../src/quota/reset";

const nowMs = new Date(2026, 5, 10, 9, 0, 0).getTime();
const inSeconds = (seconds: number) => Math.floor(nowMs / 1000) + seconds;

describe("resetOf", () => {
	test("given a reset later today, then it shows hours, minutes and the local clock", () => {
		expect(resetOf(inSeconds(3 * 3600 + 34 * 60), nowMs)).toEqual({
			countdown: "↺3h34",
			clock: "(12:34)",
		});
	});

	test("given a reset days away, then it counts in days and names the weekday", () => {
		expect(resetOf(inSeconds(3 * 86_400 + 2 * 3600), nowMs)).toEqual({
			countdown: "↺3d2h",
			clock: "(Sat 11:00)",
		});
	});

	test("given a reset less than five minutes away, then the countdown ticks in seconds", () => {
		expect(resetOf(inSeconds(272), nowMs)?.countdown).toBe("↺4m32s");
		expect(resetOf(inSeconds(3), nowMs)?.countdown).toBe("↺0m03s");
		expect(resetOf(inSeconds(300), nowMs)?.countdown).toBe("↺5m");
	});

	test("given a reset a few seconds short of a day, then the countdown and the weekday agree", () => {
		expect(resetOf(inSeconds(86_370), nowMs)).toEqual({ countdown: "↺1d0h", clock: "(Thu 08:59)" });
	});

	test("given no reset time or one already passed, then nothing is shown", () => {
		expect(resetOf(null, nowMs)).toBeNull();
		expect(resetOf(inSeconds(-10), nowMs)).toBeNull();
	});
});

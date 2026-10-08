import { describe, expect, test } from "bun:test";
import { forecastEta } from "../../src/quota/forecast";

const everyMinute = (values: number[]) => values.map((value, i) => ({ sampled_at: i * 60, value }));

describe("forecastEta", () => {
	test("given fewer than 3 samples, then there is no forecast", () => {
		expect(forecastEta(everyMinute([50, 60]), 100)).toEqual({ minutes: null, cooling: false });
	});

	test("given usage climbing 5 points a minute from 85, then the limit is 3 minutes away", () => {
		expect(forecastEta(everyMinute([70, 75, 80, 85]), 100)).toEqual({ minutes: 3, cooling: false });
	});

	test("given the same climb seen across idle gaps, then the forecast follows real elapsed time", () => {
		const sparse = [
			{ sampled_at: 0, value: 70 },
			{ sampled_at: 600, value: 80 },
			{ sampled_at: 1200, value: 90 },
		];

		expect(forecastEta(sparse, 100)).toEqual({ minutes: 10, cooling: false });
	});

	test("given a limit less than a minute away, then it is not announced as already reached", () => {
		expect(forecastEta(everyMinute([90, 94, 98, 99.7]), 100).minutes).toBe(1);
	});

	test("given flat usage, then there is no forecast and no cooling", () => {
		expect(forecastEta(everyMinute([50, 50, 50]), 100)).toEqual({ minutes: null, cooling: false });
	});

	test("given falling usage, then it reports cooling", () => {
		expect(forecastEta(everyMinute([90, 80, 70]), 100)).toEqual({ minutes: null, cooling: true });
	});

	test("given usage already at the target and still climbing, then the limit is now", () => {
		expect(forecastEta(everyMinute([98, 99, 100]), 100)).toEqual({ minutes: 0, cooling: false });
	});
});

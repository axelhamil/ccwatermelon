import { describe, expect, test } from "bun:test";
import { burnRate } from "../../src/cost/burn";

describe("burnRate", () => {
	test("returns null if fewer than 2 samples", () => {
		expect(burnRate([])).toBeNull();
		expect(burnRate([{ sampled_at: 0, value: 1 }])).toBeNull();
	});

	test("returns null if samples span < 1 min", () => {
		expect(
			burnRate([
				{ sampled_at: 100, value: 1 },
				{ sampled_at: 150, value: 2 },
			]),
		).toBeNull();
	});

	test("computes $/hr from 10-min diff", () => {
		const now = 1_000_000;
		const result = burnRate([
			{ sampled_at: now - 600, value: 1.0 },
			{ sampled_at: now, value: 3.0 },
		]);
		expect(result).toBeCloseTo(12, 0);
	});

	test("clamps negative (cost can only go up)", () => {
		const now = 1_000_000;
		const result = burnRate([
			{ sampled_at: now - 600, value: 5.0 },
			{ sampled_at: now, value: 3.0 },
		]);
		expect(result).toBe(0);
	});
});

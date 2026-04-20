import { describe, expect, test } from "bun:test";
import { forecastEta } from "../src/lib/forecast";

describe("forecastEta", () => {
	test("needs 3+ points", () => {
		expect(forecastEta([50], 100)).toEqual({ minutes: null, cooling: false });
		expect(forecastEta([50, 60], 100)).toEqual({ minutes: null, cooling: false });
	});

	test("constant series → null minutes, not cooling", () => {
		const r = forecastEta([50, 50, 50, 50, 50, 50, 50, 50], 100);
		expect(r.minutes).toBeNull();
		expect(r.cooling).toBe(false);
	});

	test("ascending → minutes to 100", () => {
		// +5%/min → reaches 100 in 10 min from 50
		const r = forecastEta([50, 55, 60, 65, 70, 75, 80, 85], 100);
		expect(r.minutes).toBeGreaterThan(2);
		expect(r.minutes).toBeLessThan(4);
		expect(r.cooling).toBe(false);
	});

	test("descending → null minutes, cooling=true", () => {
		const r = forecastEta([80, 70, 60, 50, 40, 30, 20, 10], 100);
		expect(r.minutes).toBeNull();
		expect(r.cooling).toBe(true);
	});

	test("already over target → 0 minutes", () => {
		const r = forecastEta([90, 95, 100, 102, 104, 106, 108, 110], 100);
		expect(r.minutes).toBe(0);
	});
});

import { describe, expect, test } from "bun:test";
import { formatCost, formatDuration, formatTokens, formatPct, color } from "../src/lib/format";

describe("formatCost", () => {
	test("under $10 shows 2 decimals", () => {
		expect(formatCost(3.421)).toBe("$3.42");
	});
	test("over $10 shows 1 decimal", () => {
		expect(formatCost(12.8)).toBe("$12.8");
	});
	test("zero", () => {
		expect(formatCost(0)).toBe("$0.00");
	});
});

describe("formatDuration", () => {
	test("under 1 min", () => {
		expect(formatDuration(45_000)).toBe("45s");
	});
	test("minutes only", () => {
		expect(formatDuration(18 * 60_000)).toBe("18m");
	});
	test("hours + minutes", () => {
		expect(formatDuration(2 * 3_600_000 + 15 * 60_000)).toBe("2h15m");
	});
});

describe("formatTokens", () => {
	test("under 1k", () => {
		expect(formatTokens(523)).toBe("523");
	});
	test("thousands", () => {
		expect(formatTokens(142_000)).toBe("142k");
	});
	test("millions", () => {
		expect(formatTokens(1_500_000)).toBe("1.5M");
	});
});

describe("formatPct", () => {
	test("rounds", () => {
		expect(formatPct(71.4)).toBe("71%");
		expect(formatPct(71.6)).toBe("72%");
	});
});

describe("color", () => {
	test("wraps with ANSI escape", () => {
		const result = color("hello", "red");
		expect(result.startsWith("\x1b[38;2;")).toBe(true);
		expect(result.endsWith("\x1b[0m")).toBe(true);
		expect(result).toContain("hello");
	});
});

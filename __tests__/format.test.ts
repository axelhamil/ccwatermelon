import { describe, expect, test } from "bun:test";
import {
	applyPaletteOverrides,
	colorRgb,
	formatCost,
	formatDuration,
	formatPct,
	formatTokens,
	gradientText,
	lerpColor,
	PALETTE,
	THEMES,
} from "../src/lib/format";
import { stripAnsi } from "../src/lib/width";

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

describe("colorRgb", () => {
	test("wraps text with a literal rgb triple", () => {
		const result = colorRgb("x", [10, 20, 30]);
		expect(result).toBe("\x1b[38;2;10;20;30mx\x1b[0m");
	});
});

describe("lerpColor", () => {
	test("t=0 returns first color", () => {
		expect(lerpColor(0, [0, 0, 0], [255, 255, 255])).toEqual([0, 0, 0]);
	});
	test("t=1 returns second color", () => {
		expect(lerpColor(1, [0, 0, 0], [255, 255, 255])).toEqual([255, 255, 255]);
	});
	test("t=0.5 returns midpoint", () => {
		expect(lerpColor(0.5, [0, 0, 0], [200, 200, 200])).toEqual([100, 100, 100]);
	});
	test("clamps out-of-range t", () => {
		expect(lerpColor(-1, [10, 10, 10], [20, 20, 20])).toEqual([10, 10, 10]);
		expect(lerpColor(2, [10, 10, 10], [20, 20, 20])).toEqual([20, 20, 20]);
	});
});

describe("gradientText", () => {
	test("preserves character content once stripped of color", () => {
		const result = gradientText("$12.50");
		expect(stripAnsi(result)).toBe("$12.50");
	});
	test("keeps literal spaces uncolored", () => {
		const result = gradientText("a b");
		expect(result).toContain(" ");
	});
	test("colors each non-space character independently", () => {
		const result = gradientText("ab");
		// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI color codes
		const codes = result.match(/\x1b\[[0-9;]*m/g) ?? [];
		expect(codes.length).toBeGreaterThanOrEqual(4);
	});
});

describe("formatCost hardening", () => {
	test("caps absurd values instead of printing scientific notation", () => {
		const out = formatCost(1e308);
		expect(out).not.toContain("e+");
		expect(out).toBe("$999999+");
	});

	test("never renders a negative cost", () => {
		expect(formatCost(-42)).toBe("$0.00");
	});

	test("falls back to zero on NaN", () => {
		expect(formatCost(Number.NaN)).toBe("$0.00");
	});
});

describe("themes", () => {
	test("given a theme and a user color, when applied, then the user color wins and the rest follows the theme", () => {
		applyPaletteOverrides({ green: [1, 2, 3] }, "mocha");

		expect(PALETTE.green).toEqual([1, 2, 3]);
		expect(PALETTE.red).toEqual(THEMES.mocha.red);

		applyPaletteOverrides({});
		expect(PALETTE.green).toEqual(THEMES.watermelon.green);
	});
});

describe("formatTokens rounding", () => {
	test("given a count that rounds up to a thousand thousands, then it switches to millions", () => {
		expect(formatTokens(999_600)).toBe("1.0M");
		expect(formatTokens(999_400)).toBe("999k");
	});
});

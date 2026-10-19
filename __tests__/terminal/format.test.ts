import { describe, expect, test } from "bun:test";
import { color, formatDuration, formatPct, formatTokens } from "../../src/terminal/format";

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
	test("given 10 or more, then it rounds to a whole percent", () => {
		expect(formatPct(71.4)).toBe("71%");
		expect(formatPct(71.6)).toBe("72%");
	});

	test("given less than 10, then it keeps one decimal", () => {
		expect(formatPct(2.34)).toBe("2.3%");
		expect(formatPct(5)).toBe("5%");
	});
});

describe("color", () => {
	test("given a colour name, then the text is wrapped in its basic SGR code so the terminal theme applies", () => {
		expect(color("x", "dim")).toBe("\x1b[2mx\x1b[0m");
		expect(color("x", "red")).toBe("\x1b[31mx\x1b[0m");
	});

	test("given empty text, then no escape sequence is emitted", () => {
		expect(color("", "green")).toBe("");
	});
});

describe("formatTokens rounding", () => {
	test("given a count that rounds up to a thousand thousands, then it switches to millions", () => {
		expect(formatTokens(999_600)).toBe("1.0M");
		expect(formatTokens(999_400)).toBe("999k");
	});
});

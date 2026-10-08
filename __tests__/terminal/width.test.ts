import { describe, expect, test } from "bun:test";
import { color } from "../src/lib/format";
import { resolveWidth, stripAnsi, truncateToWidth, visualWidth } from "../src/lib/width";

describe("width", () => {
	test("stripAnsi removes SGR color codes", () => {
		expect(stripAnsi(color("hi", "red"))).toBe("hi");
	});

	test("visualWidth ignores ANSI codes", () => {
		expect(visualWidth(color("hello", "teal"))).toBe(5);
	});

	test("visualWidth counts plain ASCII as 1 per char", () => {
		expect(visualWidth("main")).toBe(4);
	});

	test("visualWidth counts emoji as double width", () => {
		expect(visualWidth("🔥")).toBe(2);
	});

	test("visualWidth counts CJK as double width", () => {
		expect(visualWidth("中文")).toBe(4);
	});

	test("visualWidth counts Nerd Font PUA icons as single width", () => {
		const nerdFontIcon = String.fromCodePoint(0xf0c6);
		expect(visualWidth(nerdFontIcon)).toBe(1);
	});

	test("visualWidth treats variation selectors as zero-width additions", () => {
		const heartWithVs16 = `${String.fromCodePoint(0x2764)}${String.fromCodePoint(0xfe0f)}`;
		expect(visualWidth(heartWithVs16)).toBe(1);
	});

	test("resolveWidth reads CCWATERMELON_WIDTH env var first", () => {
		const prev = process.env.CCWATERMELON_WIDTH;
		process.env.CCWATERMELON_WIDTH = "42";
		try {
			expect(resolveWidth()).toBe(42);
		} finally {
			if (prev === undefined) {
				delete process.env.CCWATERMELON_WIDTH;
			} else {
				process.env.CCWATERMELON_WIDTH = prev;
			}
		}
	});

	test("given a label wider than the room left, when truncated, then it ends with an ellipsis and fits", () => {
		expect(truncateToWidth("feature/very-long-branch", 10)).toBe("feature/v…");
		expect(truncateToWidth("short", 10)).toBe("short");
	});

	test("given emoji that terminals draw two cells wide, then they count for two", () => {
		expect(visualWidth("⚡")).toBe(2);
		expect(visualWidth("✨")).toBe(2);
		expect(visualWidth("⚠")).toBe(1);
	});
});

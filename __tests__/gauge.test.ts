import { describe, expect, test } from "bun:test";
import { brailleGauge } from "../src/lib/gauge";

describe("brailleGauge", () => {
	test("renders empty at 0", () => {
		expect(brailleGauge(0)).toBe("⠀");
	});

	test("renders full at 100", () => {
		expect(brailleGauge(100)).toBe(String.fromCodePoint(0x2800 + 0xff));
	});

	test("stays within the braille block for any percentage", () => {
		for (let pct = 0; pct <= 100; pct += 7) {
			const glyph = brailleGauge(pct);
			const cp = glyph.codePointAt(0) ?? 0;
			expect(cp).toBeGreaterThanOrEqual(0x2800);
			expect(cp).toBeLessThanOrEqual(0x28ff);
		}
	});

	test("shows at least one dot for any non-zero value", () => {
		expect(brailleGauge(1)).not.toBe("⠀");
	});

	test("is monotonic", () => {
		let prev = 0;
		for (let pct = 0; pct <= 100; pct += 5) {
			const cp = brailleGauge(pct).codePointAt(0) ?? 0;
			const dots = (cp - 0x2800).toString(2).split("1").length - 1;
			expect(dots).toBeGreaterThanOrEqual(prev);
			prev = dots;
		}
	});

	test("clamps out-of-range input", () => {
		expect(brailleGauge(-10)).toBe(brailleGauge(0));
		expect(brailleGauge(150)).toBe(brailleGauge(100));
	});

	test("is deterministic", () => {
		expect(brailleGauge(55)).toBe(brailleGauge(55));
	});
});

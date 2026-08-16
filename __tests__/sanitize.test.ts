import { describe, expect, test } from "bun:test";
import { sanitizeLabel, sanitizeOptionalLabel } from "../src/lib/sanitize";

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

describe("sanitizeLabel", () => {
	test("leaves ordinary labels untouched", () => {
		expect(sanitizeLabel("feature/my-branch")).toBe("feature/my-branch");
		expect(sanitizeLabel("acme-web")).toBe("acme-web");
	});

	test("strips an OSC window-title injection", () => {
		const hostile = `repo${ESC}]0;pwned${BEL}`;
		const out = sanitizeLabel(hostile);
		expect(out).not.toContain(ESC);
		expect(out).not.toContain(BEL);
	});

	test("strips a CSI screen-clear injection", () => {
		const out = sanitizeLabel(`dir${ESC}[2J`);
		expect(out).toBe("dir[2J");
		expect(out).not.toContain(ESC);
	});

	test("strips carriage returns and newlines that could hide content", () => {
		expect(sanitizeLabel("visible\r\nhidden")).toBe("visiblehidden");
	});

	test("strips DEL and C1 control characters", () => {
		expect(sanitizeLabel(`a${String.fromCharCode(0x7f)}b${String.fromCharCode(0x9b)}c`)).toBe(
			"abc",
		);
	});

	test("keeps accented and multi-byte characters", () => {
		expect(sanitizeLabel("café-日本-🚀")).toBe("café-日本-🚀");
	});

	test("caps absurdly long labels", () => {
		expect(sanitizeLabel("a".repeat(500)).length).toBe(120);
	});
});

describe("sanitizeOptionalLabel", () => {
	test("returns null for non-strings", () => {
		expect(sanitizeOptionalLabel(null)).toBeNull();
		expect(sanitizeOptionalLabel(undefined)).toBeNull();
	});

	test("returns null when nothing survives sanitisation", () => {
		expect(sanitizeOptionalLabel(`${ESC}${BEL}`)).toBeNull();
	});

	test("returns the cleaned value otherwise", () => {
		expect(sanitizeOptionalLabel(`main${ESC}`)).toBe("main");
	});
});

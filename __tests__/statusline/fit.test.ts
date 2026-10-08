import { describe, expect, test } from "bun:test";
import { fitChunks } from "../src/lib/fit";

describe("fitChunks", () => {
	test("keeps everything when it fits", () => {
		const out = fitChunks(
			"core",
			[
				{ text: "-a", priority: 1 },
				{ text: "-b", priority: 2 },
			],
			20,
		);
		expect(out).toBe("core-a-b");
	});

	test("drops lowest priority chunks first when width is tight", () => {
		const out = fitChunks(
			"core",
			[
				{ text: "-low", priority: 1 },
				{ text: "-high", priority: 100 },
			],
			"core-high".length,
		);
		expect(out).toBe("core-high");
	});

	test("never drops the core text even if it alone overflows", () => {
		const out = fitChunks("core-that-is-long", [{ text: "-x", priority: 1 }], 3);
		expect(out).toBe("core-that-is-long");
	});

	test("empty optional list returns core unchanged", () => {
		expect(fitChunks("core", [], 1)).toBe("core");
	});
});

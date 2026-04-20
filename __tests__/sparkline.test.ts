import { describe, expect, test } from "bun:test";
import { sparkline } from "../src/lib/sparkline";

describe("sparkline", () => {
	test("empty array returns empty string", () => {
		expect(sparkline([])).toBe("");
	});

	test("single value uses middle char", () => {
		expect(sparkline([50])).toBe("▄");
	});

	test("monotonic ascending uses full scale", () => {
		const result = sparkline([0, 14, 28, 42, 57, 71, 85, 100]);
		expect(result).toBe("▁▂▃▄▅▆▇█");
	});

	test("constant series renders flat middle", () => {
		expect(sparkline([50, 50, 50, 50])).toBe("▄▄▄▄");
	});

	test("respects explicit min/max", () => {
		const result = sparkline([0, 100], { min: 0, max: 100 });
		expect(result).toBe("▁█");
	});
});

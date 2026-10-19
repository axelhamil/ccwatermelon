import { describe, expect, test } from "bun:test";
import { parsePayload } from "../../src/statusline/payload";

describe("parsePayload", () => {
	test("given one hostile field, then only that field is dropped", () => {
		const payload = parsePayload({
			version: "2.1.0",
			cost: { total_duration_ms: "12", total_lines_added: 4, total_lines_removed: -1 },
			context_window: { used_percentage: null, context_window_size: -5 },
		});

		expect(payload?.version).toBe("2.1.0");
		expect(payload?.cost).toEqual({
			total_duration_ms: undefined,
			total_lines_added: 4,
			total_lines_removed: undefined,
		});
		expect(payload?.context_window?.context_window_size).toBeUndefined();
	});

	test("given a section of the wrong type, then the rest of the payload survives", () => {
		const payload = parsePayload({ model: "opus", workspace: { current_dir: "/work/app" } });

		expect(payload?.model).toBeUndefined();
		expect(payload?.workspace?.current_dir).toBe("/work/app");
	});

	test("given current_usage is null before the first API call, then it reads as absent", () => {
		const payload = parsePayload({ context_window: { current_usage: null, used_percentage: 3 } });

		expect(payload?.context_window).toEqual({
			current_usage: undefined,
			used_percentage: 3,
			context_window_size: undefined,
		});
	});

	test("given stdin that is not an object, then there is no payload", () => {
		expect(parsePayload(null)).toBeNull();
		expect(parsePayload("status")).toBeNull();
	});
});

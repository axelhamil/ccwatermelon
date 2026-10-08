import { describe, expect, test } from "bun:test";
import { defaultConfig, mergeConfig } from "../../src/config/userConfig";
import type { EditorKey, EditorState } from "../../src/editor/state";
import { applyKey, previewData, ROWS, segmentView, splitKeys } from "../../src/editor/state";

const fresh: EditorState = { file: {}, cursor: 0, dirty: false };
const rowOf = (id: string) =>
	ROWS.findIndex((row) => (row.kind === "segment" ? row.spec.id === id : row.kind === id));
const press = (state: EditorState, ...keys: EditorKey[]) => keys.reduce(applyKey, state);
const specOf = (id: string) => {
	const row = ROWS[rowOf(id)];
	if (row?.kind !== "segment") throw new Error(`no segment row for ${id}`);

	return row.spec;
};

describe("config editor", () => {
	test("given the context alert at its default, when it is lowered by 5 then by 1, then the file holds 79 and is dirty", () => {
		const state = press(fresh, "bigLeft", "left");

		expect(state.file.thresholds?.compactAlert).toBe(79);
		expect(state.dirty).toBe(true);
	});

	test("given an alert at a bound, when pushed further, then the state is untouched and stays clean", () => {
		const maxed = { ...fresh, file: { thresholds: { compactAlert: 100 } } };
		const floored = { ...fresh, file: { thresholds: { compactAlert: 0 } } };

		expect(press(maxed, "right")).toBe(maxed);
		expect(press(maxed, "bigRight")).toBe(maxed);
		expect(press(floored, "left")).toBe(floored);
	});

	test("given rows that were never edited, when each is reset, then the state is untouched and stays clean", () => {
		const onTheme = { ...fresh, cursor: rowOf("theme") };
		const onSegment = { ...fresh, cursor: rowOf("night") };

		expect(press(fresh, "reset")).toBe(fresh);
		expect(press(onTheme, "reset")).toBe(onTheme);
		expect(press(onSegment, "reset")).toBe(onSegment);
	});

	test("given a segment already at the lowest priority, when lowered again, then the state is untouched", () => {
		const lowest = {
			...fresh,
			cursor: rowOf("night"),
			file: { segments: { night: { priority: 1 } } },
		};

		expect(press(lowest, "left")).toBe(lowest);
	});

	test("given an edited row, when it is reset, then its override leaves the file", () => {
		const state = press(fresh, "bigLeft", "reset");

		expect(state.file.thresholds).toEqual({});
	});

	test("given the theme row, when cycled right twice, then it comes back to the default theme", () => {
		const onTheme = { ...fresh, cursor: rowOf("theme") };

		expect(press(onTheme, "right").file.theme).toBe("mocha");
		expect(press(onTheme, "right", "right").file.theme).toBe("watermelon");
	});

	test("given a segment off by default, when toggled, then it is enabled and flagged as edited", () => {
		const state = press({ ...fresh, cursor: rowOf("ccVersion") }, "toggle");

		expect(segmentView(state.file, specOf("ccVersion"))).toMatchObject({
			enabled: true,
			edited: true,
		});
	});

	test("given a fixed segment, when asked to change line, then nothing changes", () => {
		const onToday = { ...fresh, cursor: rowOf("today") };

		expect(press(onToday, "line")).toBe(onToday);
		expect(press({ ...fresh, cursor: rowOf("night") }, "line").file.segments?.night?.line).toBe(2);
	});

	test("given the cursor on the first row, when moved up, then it stays there", () => {
		expect(press(fresh, "up")).toBe(fresh);
		expect(press(fresh, "down").cursor).toBe(1);
	});
});

describe("key chunks", () => {
	test("given several keys read in one chunk, when split, then each key sequence comes out on its own", () => {
		expect(splitKeys("\x1b[C\x1b[C]j r")).toEqual(["\x1b[C", "\x1b[C", "]", "j", " ", "r"]);
	});

	test("given a modified arrow, when split, then it stays one sequence instead of leaking a bracket key", () => {
		expect(splitKeys("\x1b[1;5Cq")).toEqual(["\x1b[1;5C", "q"]);
	});
});

describe("preview data", () => {
	test("given a lowered weekly alert, then the sample weekly quota turns critical", () => {
		const relaxed = previewData(defaultConfig(), null, 1_800_000_000);
		const strict = previewData(
			mergeConfig(defaultConfig(), { thresholds: { sevenDayAlert: 50 } }),
			null,
			1_800_000_000,
		);

		expect(relaxed.sevenDayLevel).toBe("warn");
		expect(strict.sevenDayLevel).toBe("critical");
	});
});

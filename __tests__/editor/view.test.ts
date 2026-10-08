import { describe, expect, test } from "bun:test";
import type { EditorState } from "../../src/editor/state";
import { ROWS } from "../../src/editor/state";
import type { Motion } from "../../src/editor/view";
import { drawEditor } from "../../src/editor/view";
import { color } from "../../src/terminal/format";
import { stripAnsi, visualWidth } from "../../src/terminal/width";

const NOW = 1_800_000_000_000;
const CONFIG_PATH = "/home/someone/.config/ccwatermelon/config.json";
const CURSOR = "▌";
const still: Motion = {
	knobs: {},
	widthDemoStartedAt: null,
	pressureDemoStartedAt: null,
	savedAt: null,
	quitArmed: false,
	reduced: false,
};
const fresh: EditorState = { file: {}, cursor: 0, dirty: false };
const segmentRow = (id: string) =>
	ROWS.findIndex((row) => row.kind === "segment" && row.spec.id === id);
const lastRow = ROWS.length - 1;
const draw = (state: EditorState, motion: Motion, columns: number, rows = 24) =>
	drawEditor(state, motion, NOW, { columns, rows }, CONFIG_PATH);
const plain = (lines: string[]) => lines.map(stripAnsi).join("\n");

const SCENES: Record<string, { state: EditorState; motion: Motion }> = {
	"cursor on a threshold": { state: fresh, motion: still },
	"cursor on the theme": {
		state: { ...fresh, cursor: ROWS.findIndex((row) => row.kind === "theme") },
		motion: still,
	},
	"cursor on an edited segment": {
		state: {
			file: { segments: { night: { enabled: false, priority: 12 } } },
			cursor: segmentRow("night"),
			dirty: true,
		},
		motion: still,
	},
	"quit armed": { state: { ...fresh, dirty: true }, motion: { ...still, quitArmed: true } },
	"width demo": { state: fresh, motion: { ...still, widthDemoStartedAt: NOW - 1300 } },
	"pressure demo": { state: fresh, motion: { ...still, pressureDemoStartedAt: NOW - 2400 } },
	"save toast": { state: { ...fresh, dirty: true }, motion: { ...still, savedAt: NOW - 100 } },
};

describe("config editor drawing", () => {
	test("given any editor state from 40 to 120 columns, when drawn, then no line is wider than the terminal", () => {
		for (const { state, motion } of Object.values(SCENES)) {
			for (const columns of [40, 60, 80, 120]) {
				const widths = draw(state, motion, columns).map(visualWidth);

				expect(Math.max(...widths)).toBeLessThanOrEqual(columns);
			}
		}
	});

	test("given a terminal of 8 to 24 rows, when drawn, then it fits and the cursor row shows wherever the cursor is", () => {
		for (const rows of [8, 12, 24]) {
			for (const cursor of [0, segmentRow("night"), lastRow]) {
				const lines = draw({ ...fresh, cursor }, still, 100, rows);

				expect(lines.length).toBeLessThanOrEqual(rows);
				expect(lines.filter((line) => line.includes(CURSOR))).toHaveLength(1);
			}
		}
	});

	test("given a short terminal, when drawn, then the preview goes before the list and the key hints", () => {
		const tall = plain(draw(fresh, still, 100, 24));
		const short = plain(draw(fresh, still, 100, 12));

		expect(tall).toContain("ccwatermelon ");
		expect(tall).toContain("Opus 4.7");
		expect(short).not.toContain("Opus 4.7");
		expect(short).toContain("Alerts");
		expect(short).toContain("s save");
		expect(plain(draw(fresh, still, 100, 8))).not.toContain("Alerts");
	});

	test("given an 80 column terminal, when a threshold is drawn, then its value and zones stay whole", () => {
		const row = plain(draw(fresh, still, 80))
			.split("\n")
			.find((line) => line.includes(CURSOR));

		expect(row).toContain("warns past 65%, panics past 92%");
		expect(plain(draw(fresh, still, 40))).toContain(" 85%");
		expect(plain(draw(fresh, still, 40))).not.toContain("warns past");
	});

	test("given an alert at 50, when its slider is drawn, then the zones start where the gauge changes level", () => {
		const state = { ...fresh, file: { thresholds: { compactAlert: 50 } } };
		const row = draw(state, still, 120).find((line) => line.includes(CURSOR)) ?? "";
		const calm = color("━", "green").repeat(13);
		const warn = color("━", "peach").repeat(7);
		const critical = color("━", "red").repeat(10);
		const panic = color("━", "pink").repeat(9);

		expect(row).toContain(`${calm}${warn}${color("●", "text")}${critical}${panic}`);
		expect(stripAnsi(row)).toContain("warns past 30%, panics past 75%");
	});

	test("given the cursor on a segment, when drawn, then the line key shows only if that segment can change line", () => {
		const onMovable = plain(draw({ ...fresh, cursor: segmentRow("night") }, still, 120));
		const onFixed = plain(draw({ ...fresh, cursor: segmentRow("today") }, still, 120));

		expect(onMovable).toContain("l line");
		expect(onFixed).not.toContain("l line");
		expect(onFixed).toContain("space on/off");
	});

	test("given a save with nothing changed, when the toast shows, then it says nothing was written", () => {
		const toast = { ...still, savedAt: NOW - 100 };

		expect(plain(draw(fresh, toast, 120))).toContain("nothing to save");
		expect(plain(draw({ ...fresh, dirty: true }, toast, 120))).toContain(`saved to ${CONFIG_PATH}`);
	});
});

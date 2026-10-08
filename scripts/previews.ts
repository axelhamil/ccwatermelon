import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EditorKey, EditorState } from "../src/lib/editor";
import { applyKey, previewData } from "../src/lib/editor";
import type { Motion } from "../src/lib/editorView";
import { drawEditor } from "../src/lib/editorView";
import { applyPaletteOverrides } from "../src/lib/format";
import { classifyMood } from "../src/lib/mood";
import { isAlerting, pressureLevel } from "../src/lib/pressure";
import { render } from "../src/lib/render";
import type { StatuslineData } from "../src/lib/types";
import type { ConfigFile } from "../src/lib/userConfig";
import { defaultConfig, mergeConfig } from "../src/lib/userConfig";
import { visualWidth } from "../src/lib/width";

process.env.TZ = "UTC";

const OUT_DIR = join(import.meta.dir, "..", "docs", "previews");
const START_MS = Date.UTC(2026, 5, 10, 9, 0, 0);
const CELL_WIDTH = 8.4;
const LINE_HEIGHT = 21;
const FONT_SIZE = 14;
const PADDING = 18;
const BACKGROUND = "#121712";
const CAPTION = "#7d8f78";
const DEFAULT_INK = "#f4f0e2";
const FONT_STACK =
	"ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
// biome-ignore lint/suspicious/noControlCharactersInRegex: the cost icon may be followed by ANSI colour sequences
const COST_ICON = /\u{f140b}(\x1b\[[0-9;]*m)* /gu;
const LINES_ICON = /\u{f0176}/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: splits a line on its ANSI colour sequences
const SGR = /\x1b\[([0-9;]*)m/g;

interface Frame {
	caption?: string;
	lines: string[];
}

interface Scene {
	name: string;
	title: string;
	columns: number;
	frameSeconds: number;
	frames: Frame[];
}

interface Run {
	text: string;
	fill: string;
	column: number;
	cells: number;
	isWide: boolean;
}

function escapeXml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function withoutNerdFont(line: string): string {
	return line.replace(COST_ICON, "").replace(LINES_ICON, "±");
}

function fillOf(sgr: string): string {
	const [mode, kind, r, g, b] = sgr.split(";");

	return mode === "38" && kind === "2" ? `rgb(${r},${g},${b})` : DEFAULT_INK;
}

function runsOf(line: string): Run[] {
	const plain = withoutNerdFont(line);
	const runs: Run[] = [];
	let fill = DEFAULT_INK;
	let column = 0;
	let pendingSpaces = 0;

	const place = (ch: string) => {
		const cells = visualWidth(ch);
		const last = runs[runs.length - 1];
		const continuesLast =
			last !== undefined &&
			last.fill === fill &&
			last.column + last.cells + pendingSpaces === column;

		if (ch === " ") {
			pendingSpaces += 1;
		} else if (last && cells === 0) {
			last.text += ch;
		} else if (last && continuesLast && !last.isWide && cells === 1 && pendingSpaces <= 1) {
			last.text += `${" ".repeat(pendingSpaces)}${ch}`;
			last.cells += pendingSpaces + cells;
			pendingSpaces = 0;
		} else {
			runs.push({ text: ch, fill, column, cells, isWide: cells === 2 });
			pendingSpaces = 0;
		}
		column += cells || (ch === " " ? 1 : 0);
	};

	let cursor = 0;
	for (const match of plain.matchAll(SGR)) {
		for (const ch of plain.slice(cursor, match.index)) place(ch);
		fill = fillOf(match[1] ?? "");
		cursor = match.index + match[0].length;
	}
	for (const ch of plain.slice(cursor)) place(ch);

	return runs;
}

function lineSvg(line: string): string {
	return runsOf(line)
		.map((run) => {
			const x = (PADDING + run.column * CELL_WIDTH).toFixed(1);
			const length = (run.cells * CELL_WIDTH).toFixed(1);

			return `<text x="${x}" fill="${run.fill}" textLength="${length}" lengthAdjust="spacingAndGlyphs">${escapeXml(run.text)}</text>`;
		})
		.join("");
}

function rowY(row: number): number {
	return PADDING + (row + 1) * LINE_HEIGHT - 6;
}

function captionRowsOf(scene: Scene): number {
	return scene.frames.some((frame) => frame.caption !== undefined) ? 2 : 0;
}

function sceneSvg(scene: Scene): string {
	const captionRows = captionRowsOf(scene);
	const rows = Math.max(...scene.frames.map((frame) => frame.lines.length)) + captionRows;
	const width = Math.round(scene.columns * CELL_WIDTH + PADDING * 2);
	const height = rows * LINE_HEIGHT + PADDING * 2;
	const total = (scene.frames.length * scene.frameSeconds).toFixed(2);
	const visibleUntil = (100 / scene.frames.length).toFixed(4);
	const lineIds = new Map<string, string>();
	const idOf = (line: string) => {
		const known = lineIds.get(line);
		if (known) return known;

		const id = `l${lineIds.size}`;
		lineIds.set(line, id);

		return id;
	};

	const frames = scene.frames.map((frame, index) => {
		const caption =
			frame.caption === undefined
				? ""
				: `<text x="${PADDING}" y="${rowY(0)}" fill="${CAPTION}">${escapeXml(frame.caption)}</text>`;
		const lines = frame.lines
			.map((line, row) =>
				line.trim() ? `<use href="#${idOf(line)}" y="${rowY(row + captionRows)}"/>` : "",
			)
			.join("");
		const delay = (index * scene.frameSeconds).toFixed(2);

		const still = index === scene.frames.length - 1 ? " still" : "";

		return `<g class="frame${still}" style="animation-delay:${delay}s">${caption}${lines}</g>`;
	});
	const defs = [...lineIds].map(([line, id]) => `<g id="${id}">${lineSvg(line)}</g>`);

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
<title>${escapeXml(scene.title)}</title>
<style>
text{font-family:${FONT_STACK};font-size:${FONT_SIZE}px;white-space:pre}
.frame{opacity:0}
.still{opacity:1}
@keyframes show{0%{opacity:1}${visibleUntil}%{opacity:0}100%{opacity:0}}
@supports (animation-name:show){.frame{opacity:0;animation:show ${total}s step-end infinite}}
@media (prefers-reduced-motion:reduce){.frame{animation:none}.still{opacity:1}}
</style>
<rect width="${width}" height="${height}" rx="10" fill="${BACKGROUND}"/>
<defs>
${defs.join("\n")}
</defs>
${frames.join("\n")}
</svg>
`;
}

function resolve(file: ConfigFile) {
	const config = mergeConfig(defaultConfig(), file);
	applyPaletteOverrides(config.colors, config.theme);

	return config;
}

function sessionAt(t: number, nowMs: number): StatuslineData {
	const config = resolve({});
	const nowSec = Math.floor(nowMs / 1000);
	const contextPct = Math.round(6 + 92 * t);
	const fiveHourPct = Math.round(4 + 94 * t ** 1.4);
	const sevenDayPct = Math.round(38 + 30 * t);
	const sessionCost = 0.12 + 46 * t ** 2;
	const levels = [
		pressureLevel(contextPct, config.thresholds.compactAlert),
		pressureLevel(fiveHourPct, config.thresholds.fiveHourAlert),
		pressureLevel(sevenDayPct, config.thresholds.sevenDayAlert),
	];
	const [contextLevel = "calm", fiveHourLevel = "calm", sevenDayLevel = "calm"] = levels;
	const mood = classifyMood({ levels, contextPct, sessionCost, fiveHourPct, sevenDayPct });
	const contextTokens = Math.round(contextPct * 1840);

	return {
		...previewData(config, null, nowSec),
		mood,
		celebrationMode: mood.kind === "rose",
		dirName: "acme-web",
		git: {
			branch: "feat/checkout",
			dirty: t > 0.1,
			insertions: Math.round(420 * t),
			deletions: Math.round(96 * t),
		},
		activeSessions: 1,
		worktree: null,
		sessionCost,
		sessionDurationMs: (2 + 170 * t) * 60_000,
		projectTodayCost: 9.4 + sessionCost,
		todayCost: 31.2 + sessionCost,
		weekCost: 268 + sessionCost,
		linesAdded: Math.round(420 * t),
		linesRemoved: Math.round(96 * t),
		contextPct,
		compactPct: contextPct,
		compactHeadroom: 184_000 - contextTokens,
		contextLevel,
		fiveHourPct,
		fiveHourLevel,
		fiveHourProjectedPct: t < 0.15 ? null : Math.round(fiveHourPct * 1.22),
		sevenDayPct,
		sevenDayLevel,
		sevenDayProjectedPct: Math.round(sevenDayPct * 1.5),
		cacheHitPct: t > 0.55 ? 91 : 97,
		burnRatePerHr: t > 0.6 ? 11 + 9 * t : null,
		etaMinutes: isAlerting(fiveHourLevel)
			? Math.max(0, Math.round((100 - fiveHourPct) * 2.5))
			: null,
	};
}

function sessionScene(): Scene {
	const steps = 14;

	return {
		name: "session",
		title: "A session from the first prompt to the limit",
		columns: 96,
		frameSeconds: 0.9,
		frames: Array.from({ length: steps }, (_, i) => {
			const nowMs = START_MS + i * 1000;

			return { lines: render(sessionAt(i / (steps - 1), nowMs), {}, 96, nowMs).split("\n") };
		}),
	};
}

function responsiveScene(): Scene {
	const widths = [100, 92, 84, 76, 68, 60, 52, 44, 36, 44, 52, 60, 68, 76, 84, 92];
	const data = { ...sessionAt(0.62, START_MS), activeSessions: 2 };

	return {
		name: "responsive",
		title: "The same data from 100 to 36 columns",
		columns: 100,
		frameSeconds: 0.7,
		frames: widths.map((width) => ({
			caption: `${"─".repeat(Math.max(0, width - 9))} ${width} cols`,
			lines: render(data, {}, width, START_MS).split("\n"),
		})),
	};
}

const CUSTOM_CONFIGS: { caption: string; file: ConfigFile }[] = [
	{ caption: "{}", file: {} },
	{ caption: '{ "theme": "mocha" }', file: { theme: "mocha" } },
	{
		caption:
			'{ "colors": { "green": [255,196,84], "sky": [255,160,90], "lavender": [255,214,150], … } }',
		file: {
			colors: {
				green: [255, 196, 84],
				teal: [255, 178, 102],
				sky: [255, 160, 90],
				lavender: [255, 214, 150],
				mauve: [255, 122, 89],
				subtext: [232, 200, 160],
				dim: [128, 104, 84],
			},
		},
	},
	{
		caption:
			'{ "segments": { "sessionName": { "enabled": true, "line": 2 }, "ccVersion": { "enabled": true } } }',
		file: { segments: { sessionName: { enabled: true, line: 2 }, ccVersion: { enabled: true } } },
	},
	{
		caption:
			'{ "segments": { "today": off, "week": off, "linesChanged": off, "pace": off, "cache": off } }',
		file: {
			segments: {
				today: { enabled: false },
				week: { enabled: false },
				projectToday: { enabled: false },
				linesChanged: { enabled: false },
				pace: { enabled: false },
				cache: { enabled: false },
				sessions: { enabled: false },
				worktree: { enabled: false },
			},
		},
	},
	{
		caption: '{ "thresholds": { "compactAlert": 60, "sevenDayAlert": 50 } }',
		file: { thresholds: { compactAlert: 60, sevenDayAlert: 50 } },
	},
];

function customScene(): Scene {
	return {
		name: "custom",
		title: "One config file, six different status lines",
		columns: 104,
		frameSeconds: 2.4,
		frames: CUSTOM_CONFIGS.map(({ caption, file }) => {
			const config = resolve(file);
			const data = previewData(config, null, Math.floor(START_MS / 1000));

			return { caption, lines: render(data, config.segments, 104, START_MS).split("\n") };
		}),
	};
}

type Beat = EditorKey | "width" | "pressure" | "wait";

const EDITOR_SCRIPT: Beat[] = [
	"wait",
	"bigLeft",
	"bigLeft",
	"bigLeft",
	"wait",
	"down",
	"down",
	"bigLeft",
	"bigLeft",
	"wait",
	"down",
	"right",
	"wait",
	"left",
	"down",
	"down",
	"down",
	"down",
	"down",
	"toggle",
	"wait",
	"width",
	"wait",
	"wait",
	"wait",
	"wait",
	"pressure",
	"wait",
	"wait",
	"wait",
	"wait",
];

function editorScene(): Scene {
	const columns = 112;
	const frameMs = 520;
	const motion: Motion = {
		knobs: {},
		widthDemoStartedAt: null,
		pressureDemoStartedAt: null,
		savedAt: null,
		quitArmed: false,
		reduced: false,
	};
	let state: EditorState = { file: {}, cursor: 0, dirty: false };

	const frames = EDITOR_SCRIPT.map((beat, i) => {
		const nowMs = START_MS + i * frameMs;

		if (beat === "width") motion.widthDemoStartedAt = nowMs - 1;
		else if (beat === "pressure") motion.pressureDemoStartedAt = nowMs - 1;
		else if (beat !== "wait") state = applyKey(state, beat);

		const lines = drawEditor(
			state,
			motion,
			nowMs + frameMs / 2,
			{ columns, rows: 26 },
			"~/.config/ccwatermelon/config.jsonc",
		);

		return { lines };
	});

	return {
		name: "config",
		title: "The interactive config editor",
		columns,
		frameSeconds: frameMs / 1000,
		frames,
	};
}

mkdirSync(OUT_DIR, { recursive: true });
for (const scene of [sessionScene(), responsiveScene(), customScene(), editorScene()]) {
	writeFileSync(join(OUT_DIR, `${scene.name}.svg`), sceneSvg(scene), "utf-8");
	console.log(`${scene.name}.svg: ${scene.frames.length} frames`);
}

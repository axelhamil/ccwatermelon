import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as readline from "node:readline/promises";
import { applyPaletteOverrides, color } from "./lib/format";
import { render } from "./lib/render";
import type { StatuslineData } from "./lib/types";
import {
	type ConfigFile,
	type ResolvedConfig,
	defaultConfig,
	stripJsonComments,
} from "./lib/userConfig";

const CONFIG_PATH = join(homedir(), ".config", "ccstatusline-godlike", "config.jsonc");

const SAMPLE: StatuslineData = {
	mood: { kind: "focus", face: "(•‿•)", label: null, color: "yellow" },
	git: { branch: "feat/godlike-config", dirty: true, insertions: 142, deletions: 38 },
	modelName: "Opus 4.7",
	dirName: "ccstatusline-godlike",
	activeSessions: 2,
	sessionCost: 3.42,
	sessionDurationMs: 18 * 60_000,
	todayCost: 95.9,
	weekCost: 95.9,
	contextPct: 55,
	contextTokens: 110_000,
	contextSeries: [40, 42, 45, 48, 50, 52, 54, 55],
	compactPct: 55,
	tokensToCompact: 74_000,
	fiveHourPct: 20,
	fiveHourResetsAt: Math.floor(Date.now() / 1000) + 3 * 3600 + 22 * 60,
	fiveHourSeries: [15, 16, 17, 18, 19, 20, 20, 20],
	sevenDayPct: 23,
	sevenDayResetsAt: Math.floor(Date.now() / 1000) + 107 * 3600 + 18 * 60,
	tokensPerSec: 113,
	tokensPerSecSeries: [100, 105, 110, 113, 113, 113, 113, 113],
	cacheHitPct: 41,
	burnRatePerHr: null,
	etaMinutes: null,
	etaCooling: false,
	alertMode: false,
	celebrationMode: false,
	sessionName: "godlike-config-session",
	ccVersion: "2.1.0",
	outputStyle: null,
	worktree: null,
	linesAdded: 142,
	linesRemoved: 38,
	vimMode: null,
	agentName: null,
};

function loadWorkingConfig(): ConfigFile {
	if (!existsSync(CONFIG_PATH)) return {};
	try {
		const raw = readFileSync(CONFIG_PATH, "utf-8");
		return JSON.parse(stripJsonComments(raw));
	} catch (err) {
		console.error(`invalid config ignored (${err}), editing from defaults`);
		return {};
	}
}

function toResolved(file: ConfigFile): ResolvedConfig {
	const defaults = defaultConfig();
	return {
		theme: file.theme ?? defaults.theme,
		thresholds: { ...defaults.thresholds, ...file.thresholds },
		colors: { ...defaults.colors, ...file.colors },
		segments: { ...defaults.segments, ...file.segments },
	};
}

const SEGMENT_IDS = [
	"sessions",
	"night",
	"worktree",
	"vimMode",
	"agentName",
	"outputStyle",
	"sessionName",
	"ccVersion",
	"linesChanged",
	"today",
	"week",
	"burn",
	"cache",
	"tps",
	"contextGauge",
	"fiveHourGauge",
	"sevenDayGauge",
] as const;

function preview(file: ConfigFile): string {
	const resolved = toResolved(file);
	applyPaletteOverrides(resolved.colors);
	const prevWidth = process.env.CCSTATUSLINE_WIDTH;
	process.env.CCSTATUSLINE_WIDTH = "110";
	const out = render(SAMPLE, resolved.segments);
	if (prevWidth === undefined) {
		// biome-ignore lint/performance/noDelete: env var must be absent, not the string "undefined"
		delete process.env.CCSTATUSLINE_WIDTH;
	} else {
		process.env.CCSTATUSLINE_WIDTH = prevWidth;
	}
	return out;
}

function printPreview(file: ConfigFile): void {
	console.log(`\n${color("── preview ──────────────────────────────────────────", "dim")}`);
	console.log(preview(file));
	console.log(`${color("─────────────────────────────────────────────────────", "dim")}\n`);
}

async function menu(rl: readline.Interface, file: ConfigFile): Promise<boolean> {
	printPreview(file);
	console.log("1) Alert thresholds");
	console.log("2) Enable/disable a segment");
	console.log("3) Segment priority (drop order under reduced width)");
	console.log("4) Line for a relocatable segment (1=identity, 2=economy)");
	console.log("5) Save and exit");
	console.log("6) Exit without saving");
	const choice = (await rl.question("> ")).trim();

	switch (choice) {
		case "1": {
			const thresholds = file.thresholds ?? {};
			for (const key of ["compactAlert", "fiveHourAlert", "sevenDayAlert"] as const) {
				const current = thresholds[key] ?? defaultConfig().thresholds[key];
				const raw = await rl.question(`${key} [${current}] : `);
				if (raw.trim()) {
					const n = Number.parseFloat(raw);
					if (Number.isFinite(n) && n >= 0 && n <= 100) thresholds[key] = n;
				}
			}
			file.thresholds = thresholds;
			return true;
		}
		case "2": {
			console.log(SEGMENT_IDS.map((id, i) => `  ${i + 1}. ${id}`).join("\n"));
			const raw = await rl.question("segment #: ");
			const idx = Number.parseInt(raw, 10) - 1;
			const id = SEGMENT_IDS[idx];
			if (!id) return true;
			const answer = (await rl.question(`enable ${id}? (y/n) : `)).trim().toLowerCase();
			file.segments = file.segments ?? {};
			file.segments[id] = { ...file.segments[id], enabled: answer === "o" || answer === "y" };
			return true;
		}
		case "3": {
			console.log(SEGMENT_IDS.map((id, i) => `  ${i + 1}. ${id}`).join("\n"));
			const raw = await rl.question("segment #: ");
			const idx = Number.parseInt(raw, 10) - 1;
			const id = SEGMENT_IDS[idx];
			if (!id) return true;
			const p = await rl.question("priority (number, higher = disappears last): ");
			const n = Number.parseFloat(p);
			if (Number.isFinite(n)) {
				file.segments = file.segments ?? {};
				file.segments[id] = { ...file.segments[id], priority: n };
			}
			return true;
		}
		case "4": {
			const relocatable = [
				"worktree",
				"vimMode",
				"agentName",
				"outputStyle",
				"sessionName",
				"ccVersion",
				"night",
				"linesChanged",
			];
			console.log(relocatable.map((id, i) => `  ${i + 1}. ${id}`).join("\n"));
			const raw = await rl.question("segment #: ");
			const idx = Number.parseInt(raw, 10) - 1;
			const id = relocatable[idx];
			if (!id) return true;
			const l = (await rl.question("line (1 or 2): ")).trim();
			if (l === "1" || l === "2") {
				file.segments = file.segments ?? {};
				file.segments[id] = { ...file.segments[id], line: l === "1" ? 1 : 2 };
			}
			return true;
		}
		case "5":
			return false;
		case "6":
			process.exit(0);
			break;
		default:
			return true;
	}
	return true;
}

async function main(): Promise<void> {
	const file = loadWorkingConfig();
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	console.log(color("ccstatusline-godlike — interactive config", "peach"));
	console.log(color(`file: ${CONFIG_PATH}`, "dim"));

	let keepGoing = true;
	while (keepGoing) {
		keepGoing = await menu(rl, file);
	}
	rl.close();

	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(file, null, 2), "utf-8");
	console.log(color(`config saved: ${CONFIG_PATH}`, "green"));
}

main();

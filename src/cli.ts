#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as readline from "node:readline/promises";
import { applyPaletteOverrides, color, THEMES } from "./lib/format";
import { render } from "./lib/render";
import type { SegmentToggle } from "./lib/segments";
import { RELOCATABLE_SEGMENT_IDS, SEGMENT_IDS } from "./lib/segments";
import type { StatuslineData } from "./lib/types";
import type { ConfigFile } from "./lib/userConfig";
import { defaultConfig, mergeConfig, readConfigFile, userConfigPath } from "./lib/userConfig";

const CONFIG_PATH = userConfigPath();
const PREVIEW_WIDTH = 110;
const RULE = "─".repeat(53);
const THRESHOLD_KEYS = ["compactAlert", "fiveHourAlert", "sevenDayAlert"] as const;
const NOW_SEC = Math.floor(Date.now() / 1000);

const SAMPLE: StatuslineData = {
	mood: { kind: "focus", face: "(•‿•)", color: "yellow" },
	git: { branch: "feat/melon-config", dirty: true, insertions: 142, deletions: 38 },
	modelName: "Opus 4.7",
	dirName: "ccwatermelon",
	activeSessions: 2,
	sessionCost: 3.42,
	sessionDurationMs: 18 * 60_000,
	todayCost: 95.9,
	weekCost: 95.9,
	contextPct: 55,
	contextTokens: 110_000,
	compactPct: 55,
	tokensToCompact: 74_000,
	fiveHourPct: 20,
	fiveHourResetsAt: NOW_SEC + 3 * 3600 + 22 * 60,
	sevenDayPct: 23,
	sevenDayResetsAt: NOW_SEC + 107 * 3600 + 18 * 60,
	cacheHitPct: 41,
	burnRatePerHr: null,
	etaMinutes: null,
	etaCooling: false,
	alertMode: false,
	celebrationMode: false,
	sessionName: "melon-config-session",
	ccVersion: "2.1.0",
	outputStyle: null,
	worktree: null,
	linesAdded: 142,
	linesRemoved: 38,
	vimMode: null,
	agentName: null,
};

type Editor = (rl: readline.Interface, file: ConfigFile) => Promise<void>;
type Outcome = "continue" | "save" | "discard";

function loadWorkingConfig(): ConfigFile | null {
	const { data, error } = readConfigFile(CONFIG_PATH);
	if (!error) return data ?? {};

	console.error(`the existing config is invalid, fix or delete it before editing: ${error}`);
	return null;
}

function printPreview(file: ConfigFile): void {
	const resolved = mergeConfig(defaultConfig(), file);
	applyPaletteOverrides(resolved.colors, resolved.theme);

	console.log(`\n${color(`── preview ${RULE}`, "dim")}`);
	console.log(render(SAMPLE, resolved.segments, PREVIEW_WIDTH));
	console.log(`${color(RULE, "dim")}\n`);
}

async function pickSegment(rl: readline.Interface, ids: readonly string[]): Promise<string | null> {
	console.log(ids.map((id, i) => `  ${i + 1}. ${id}`).join("\n"));
	const answer = await rl.question("segment #: ");

	return ids[Number.parseInt(answer, 10) - 1] ?? null;
}

function patchSegment(file: ConfigFile, id: string, patch: SegmentToggle): void {
	file.segments = { ...file.segments, [id]: { ...file.segments?.[id], ...patch } };
}

const editThresholds: Editor = async (rl, file) => {
	const thresholds = { ...file.thresholds };

	for (const key of THRESHOLD_KEYS) {
		const current = thresholds[key] ?? defaultConfig().thresholds[key];
		const answer = (await rl.question(`${key} [${current}] : `)).trim();
		const value = Number.parseFloat(answer);
		if (!answer) continue;

		if (Number.isFinite(value) && value >= 0 && value <= 100) thresholds[key] = value;
		else console.log(`${key} unchanged: "${answer}" is not a number between 0 and 100`);
	}

	file.thresholds = thresholds;
};

const toggleSegment: Editor = async (rl, file) => {
	const id = await pickSegment(rl, SEGMENT_IDS);
	if (!id) return;

	const answer = (await rl.question(`enable ${id}? (y/n) : `)).trim().toLowerCase();
	patchSegment(file, id, { enabled: answer === "y" });
};

const editPriority: Editor = async (rl, file) => {
	const id = await pickSegment(rl, SEGMENT_IDS);
	if (!id) return;

	const priority = Number.parseFloat(
		await rl.question("priority (number, higher = disappears last): "),
	);
	if (Number.isFinite(priority)) patchSegment(file, id, { priority });
	else console.log(`${id} unchanged: the priority must be a number`);
};

const relocateSegment: Editor = async (rl, file) => {
	const id = await pickSegment(rl, RELOCATABLE_SEGMENT_IDS);
	if (!id) return;

	const line = (await rl.question("line (1 or 2): ")).trim();
	if (line === "1" || line === "2") patchSegment(file, id, { line: line === "1" ? 1 : 2 });
	else console.log(`${id} unchanged: the line must be 1 or 2`);
};

const editTheme: Editor = async (rl, file) => {
	const names = Object.keys(THEMES) as (keyof typeof THEMES)[];
	const answer = (await rl.question(`theme (${names.join(" or ")}): `)).trim();
	const theme = names.find((name) => name === answer);
	if (theme) file.theme = theme;
	else console.log(`theme unchanged: "${answer}" is not one of ${names.join(", ")}`);
};

const EDITORS: Record<string, { label: string; edit: Editor }> = {
	"1": { label: "Alert thresholds", edit: editThresholds },
	"2": { label: "Enable/disable a segment", edit: toggleSegment },
	"3": { label: "Segment priority (drop order under reduced width)", edit: editPriority },
	"4": { label: "Line for a relocatable segment (1=identity, 2=economy)", edit: relocateSegment },
	"5": { label: "Theme", edit: editTheme },
};

async function menu(rl: readline.Interface, file: ConfigFile): Promise<Outcome> {
	printPreview(file);
	for (const [key, { label }] of Object.entries(EDITORS)) console.log(`${key}) ${label}`);
	console.log("s) Save and exit");
	console.log("q) Exit without saving");

	const choice = (await rl.question("> ")).trim().toLowerCase();
	if (choice === "s") return "save";
	if (choice === "q") return "discard";

	await EDITORS[choice]?.edit(rl, file);

	return "continue";
}

async function main(): Promise<void> {
	const file = loadWorkingConfig();
	if (!file) {
		process.exitCode = 1;
		return;
	}

	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

	console.log(color("ccwatermelon, interactive config", "peach"));
	console.log(color(`file: ${CONFIG_PATH}`, "dim"));

	let outcome: Outcome = "continue";
	while (outcome === "continue") outcome = await menu(rl, file);
	rl.close();
	if (outcome === "discard") return;

	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(file, null, 2), "utf-8");
	console.log(color(`config saved: ${CONFIG_PATH}`, "green"));
}

main().catch((err) => {
	console.error(`ccwatermelon-config stopped, nothing was saved: ${err}`);
	process.exitCode = 1;
});

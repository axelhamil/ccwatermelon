#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readConfigFile, userConfigPath } from "./config/userConfig";
import type { EditorKey, EditorState } from "./editor/state";
import { applyKey, ROWS, splitKeys, thresholdOf } from "./editor/state";
import type { Motion } from "./editor/view";
import { drawEditor, isAnimating, isSaveToastOver } from "./editor/view";

const CONFIG_PATH = userConfigPath();
const FRAME_MS = 33;
const ENTER_SCREEN = "\x1b[?1049h\x1b[?25l";
const LEAVE_SCREEN = "\x1b[?25h\x1b[?1049l";
const CTRL_C = "\x03";
const FALLBACK_VIEWPORT = { columns: 80, rows: 24 };
const STOP_SIGNALS = ["SIGTERM", "SIGHUP"] as const;

class SaveFailure extends Error {}

function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const EDITOR_KEYS: Record<string, EditorKey> = {
	"\x1b[A": "up",
	"\x1b[B": "down",
	"\x1b[C": "right",
	"\x1b[D": "left",
	k: "up",
	j: "down",
	"]": "bigRight",
	"[": "bigLeft",
	" ": "toggle",
	l: "line",
	r: "reset",
};

function loadState(): EditorState | null {
	const { data, error } = readConfigFile(CONFIG_PATH);
	if (!error) return { file: data ?? {}, cursor: 0, dirty: false };

	console.error(`the existing config is invalid, fix or delete it before editing: ${error}`);

	return null;
}

function save(state: EditorState): void {
	try {
		mkdirSync(dirname(CONFIG_PATH), { recursive: true });
		writeFileSync(CONFIG_PATH, JSON.stringify(state.file, null, 2), "utf-8");
	} catch (error) {
		throw new SaveFailure(
			`could not write ${CONFIG_PATH} (${reasonOf(error)}), your changes were not saved. Check that its folder exists and is writable, then run the editor again`,
		);
	}
}

function moveKnob(motion: Motion, before: EditorState, after: EditorState, now: number): void {
	const row = ROWS[before.cursor];
	if (row?.kind !== "threshold" || motion.reduced) return;

	const from = thresholdOf(before.file, row.key);
	const to = thresholdOf(after.file, row.key);
	if (from !== to) motion.knobs[row.key] = { from, to, startedAt: now };
}

function runEditor(initial: EditorState): Promise<void> {
	const { stdin, stdout } = process;
	const motion: Motion = {
		knobs: {},
		widthDemoStartedAt: null,
		pressureDemoStartedAt: null,
		savedAt: null,
		quitArmed: false,
		reduced: Boolean(process.env.NO_MOTION),
	};
	let state = initial;
	let ticker: ReturnType<typeof setInterval> | null = null;
	let closed = false;

	return new Promise((resolve, reject) => {
		const close = () => {
			if (closed) return;

			closed = true;
			if (ticker) clearInterval(ticker);
			stdin.off("data", onData);
			stdout.off("resize", onResize);
			for (const signal of STOP_SIGNALS) process.off(signal, onSignal);
			stdout.write(LEAVE_SCREEN);
			stdin.setRawMode(false);
			stdin.pause();
		};

		const quit = () => {
			close();
			resolve();
		};

		const safely = (run: () => void) => {
			if (closed) return;

			try {
				run();
			} catch (error) {
				close();
				reject(error);
			}
		};

		const paint = () => {
			const now = Date.now();
			const viewport = {
				columns: stdout.columns || FALLBACK_VIEWPORT.columns,
				rows: stdout.rows || FALLBACK_VIEWPORT.rows,
			};
			const lines = drawEditor(state, motion, now, viewport, CONFIG_PATH);

			stdout.write(`\x1b[H${lines.map((line) => `\x1b[2K${line}`).join("\n")}\x1b[J`);
			if (isSaveToastOver(motion, now)) return quit();
			if (isAnimating(motion, now) || !ticker) return;

			clearInterval(ticker);
			ticker = null;
		};

		const animate = () => {
			ticker ??= setInterval(() => safely(paint), FRAME_MS);
			paint();
		};

		const onKey = (key: string) => {
			if (key === CTRL_C) return quit();
			if (motion.savedAt !== null) return;

			const now = Date.now();
			const wasArmed = motion.quitArmed;
			motion.quitArmed = false;

			if (key === "q" && (!state.dirty || wasArmed)) return quit();
			if (key === "q") motion.quitArmed = true;
			if (key === "w" && !motion.reduced) motion.widthDemoStartedAt = now;
			if (key === "p" && !motion.reduced) motion.pressureDemoStartedAt = now;
			if (key === "s") {
				if (state.dirty) save(state);
				motion.savedAt = now;
			}

			const action = EDITOR_KEYS[key];
			if (action) {
				const next = applyKey(state, action);
				moveKnob(motion, state, next, now);
				state = next;
			}

			animate();
		};

		const onData = (chunk: string) => {
			for (const key of splitKeys(chunk)) safely(() => onKey(key));
		};

		const onResize = () => safely(paint);

		const onSignal = () => {
			close();
			process.exitCode = 1;
			resolve();
		};

		safely(() => {
			for (const signal of STOP_SIGNALS) process.on(signal, onSignal);
			stdout.write(ENTER_SCREEN);
			stdin.setRawMode(true);
			stdin.setEncoding("utf-8");
			stdin.resume();
			stdin.on("data", onData);
			stdout.on("resize", onResize);
			paint();
		});
	});
}

async function main(): Promise<void> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		console.error("ccwatermelon-config needs an interactive terminal, run it directly in one");
		process.exitCode = 1;
		return;
	}

	const state = loadState();
	if (!state) {
		process.exitCode = 1;
		return;
	}

	await runEditor(state);
}

main().catch((error) => {
	const failure =
		error instanceof SaveFailure
			? error.message
			: `unexpected error (${reasonOf(error)}), nothing more was saved. Run the editor again, and report it if it comes back`;

	console.error(`ccwatermelon-config stopped: ${failure}`);
	process.exitCode = 1;
});

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "ccwatermelon-data-"));
const cacheDir = mkdtempSync(join(tmpdir(), "ccwatermelon-cache-"));
const homeDir = mkdtempSync(join(tmpdir(), "ccwatermelon-home-"));

afterAll(() => {
	rmSync(dataDir, { recursive: true, force: true });
	rmSync(cacheDir, { recursive: true, force: true });
	rmSync(homeDir, { recursive: true, force: true });
});

async function runStdin(stdin: string, width = 120): Promise<string> {
	const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "..", "src", "index.ts")], {
		stdin: new Blob([stdin]),
		stdout: "pipe",
		stderr: "ignore",
		env: {
			...process.env,
			CCWATERMELON_WIDTH: String(width),
			CCWATERMELON_DATA_DIR: dataDir,
			CCWATERMELON_CACHE_DIR: cacheDir,
			CLAUDE_CONFIG_DIR: homeDir,
			HOME: homeDir,
		},
	});
	const out = await new Response(proc.stdout).text();
	await proc.exited;

	return out;
}

function runPayload(payload: unknown, width = 120): Promise<string> {
	return runStdin(JSON.stringify(payload), width);
}

async function runFixture(name: string, width = 120): Promise<string> {
	const fixture = JSON.parse(
		readFileSync(join(import.meta.dir, "..", "fixtures", "statusline", name), "utf-8"),
	);
	return runPayload(fixture, width);
}

describe("integration", () => {
	test("given the normal fixture on a wide terminal, then the whole status line fits on one line", async () => {
		const lines = (await runFixture("normal.json", 160)).trimEnd().split("\n");

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(/\(=ᴥ=\)|\(-ᴥ-\)/);
	});

	test("given the alert-context fixture, then the mood is stressed and the output has no cost nor quota", async () => {
		const out = await runFixture("alert-context.json");

		expect(out).toMatch(/\(◉_◉\)|\(-_-\)/);
		expect(out).not.toContain("$");
		expect(out).not.toMatch(/\b(5h|7d) /);
	});

	test("given a narrow terminal, then the segments flow over at most 3 lines without an empty one", async () => {
		const lines = (await runFixture("normal.json", 40)).trimEnd().split("\n");

		expect(lines.length).toBeGreaterThanOrEqual(2);
		expect(lines.length).toBeLessThanOrEqual(3);
		for (const line of lines) expect(line.trim()).not.toBe("");
	});

	test("given a sandboxed render, then nothing is written to the data or cache dirs", async () => {
		await runFixture("normal.json");

		expect(readdirSync(dataDir)).toEqual([]);
		expect(readdirSync(cacheDir)).toEqual([]);
	});

	test("celebration fixture renders the rose mood with a sparkle", async () => {
		const out = await runFixture("celebration.json");

		expect(out).toMatch(/\(◕‿◕\)|\(◡‿◡\)/);
		expect(out).toContain("✨");
	});

	test("project-local config disables a segment for the render", async () => {
		const projectDir = join(homeDir, "project");
		mkdirSync(projectDir);
		writeFileSync(
			join(projectDir, ".ccwatermelon.jsonc"),
			`{
				// hide the session duration for this project
				"segments": { "duration": { "enabled": false } }
			}`,
		);
		const base = JSON.parse(
			readFileSync(join(import.meta.dir, "..", "fixtures", "statusline", "normal.json"), "utf-8"),
		);
		base.workspace.current_dir = projectDir;

		const out = await runPayload(base);
		expect(out).toContain("conv");
		expect(out).not.toContain("time");
	});

	test("given a pull request whose url is not a plain https address, when rendered, then the badge shows without a link", async () => {
		const base = JSON.parse(
			readFileSync(join(import.meta.dir, "..", "fixtures", "statusline", "normal.json"), "utf-8"),
		);
		const hostile = {
			...base,
			pr: {
				number: 7,
				url: "https://evil.test/\u0007\u001b]8;;https://other.test",
				review_state: "approved",
			},
			workspace: { ...base.workspace, repo: { host: "github.com", owner: "acme", name: "web;rm" } },
		};

		const out = await runPayload(hostile);

		expect(out).toContain("#7 ✓");
		expect(out).not.toContain("\x1b]8");
	});

	test("given the normal fixture, then the whole render stays under 250ms", async () => {
		const start = Date.now();

		await runFixture("normal.json");

		expect(Date.now() - start).toBeLessThan(250);
	});

	test("given hostile numbers in the payload, then it still renders the status line", async () => {
		const out = await runPayload({
			session_id: "hostile",
			workspace: { current_dir: homeDir },
			model: { display_name: "Opus 4.7" },
			cost: { total_lines_added: 1e308, total_duration_ms: "soon" },
			context_window: { used_percentage: "half", context_window_size: null },
		});

		expect(out).toContain("Opus 4.7");
		expect(out.replace(basename(homeDir), "")).not.toContain("NaN");
		expect(out.split("\n").filter((l) => l.trim().length > 0).length).toBeGreaterThanOrEqual(1);
	});

	test("given stdin that is not JSON, then it says so instead of crashing", async () => {
		expect(await runStdin("not json")).toContain("stdin is not the Claude Code");
	});
});

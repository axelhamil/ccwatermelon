import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
	const fixture = JSON.parse(readFileSync(join(import.meta.dir, "..", "fixtures", name), "utf-8"));
	return runPayload(fixture, width);
}

describe("integration", () => {
	test("normal renders 3 lines (identity, session, quotas)", async () => {
		const out = await runFixture("normal.json");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBe(3);
		expect(out).toContain("(=ᴥ=)");
	});

	test("alert-context renders 3 lines", async () => {
		const out = await runFixture("alert-context.json");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBe(3);
		expect(out).toContain("(◉_◉)");
	});

	test("narrow width collapses to a leaner render without crashing", async () => {
		const out = await runFixture("normal.json", 40);
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBeGreaterThanOrEqual(2);
		expect(out).toContain("(=ᴥ=)");
	});

	test("celebration fixture renders the rose mood with a sparkle", async () => {
		const out = await runFixture("celebration.json");

		expect(out).toContain("(◕‿◕)");
		expect(out).toContain("✨");
	});

	test("payload without rate_limits never shows NaN% and still renders", async () => {
		const out = await runFixture("no-rate-limits.json");
		expect(out).not.toContain("NaN");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBeGreaterThanOrEqual(2);
	}, 8000);

	test("project-local config disables a segment for the render", async () => {
		const projectDir = join(homeDir, "project");
		mkdirSync(projectDir);
		writeFileSync(
			join(projectDir, ".ccwatermelon.jsonc"),
			`{
				// hide the daily cost for this project
				"segments": { "today": { "enabled": false } }
			}`,
		);
		const base = JSON.parse(
			readFileSync(join(import.meta.dir, "..", "fixtures", "normal.json"), "utf-8"),
		);
		base.workspace.current_dir = projectDir;

		const out = await runPayload(base);
		expect(out).not.toContain(" D $");
	});

	test("given the normal fixture, then the whole render stays under 250ms", async () => {
		const start = Date.now();

		await runFixture("normal.json");

		expect(Date.now() - start).toBeLessThan(250);
	});

	test("given hostile numbers in the payload, then it still renders the full status line", async () => {
		const out = await runPayload({
			session_id: "hostile",
			workspace: { current_dir: homeDir },
			model: { display_name: "Opus 4.7" },
			cost: { total_cost_usd: 1e308, total_duration_ms: "soon" },
			context_window: { used_percentage: "half", context_window_size: null },
		});

		expect(out).toContain("Opus 4.7");
		expect(out).not.toContain("NaN");
		expect(out.split("\n").filter((l) => l.trim().length > 0).length).toBeGreaterThanOrEqual(3);
	});

	test("given stdin that is not JSON, then it says so instead of crashing", async () => {
		expect(await runStdin("not json")).toContain("stdin is not the Claude Code");
	});
});

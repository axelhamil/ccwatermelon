import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "ccwatermelon-data-"));
const cacheDir = mkdtempSync(join(tmpdir(), "ccwatermelon-cache-"));

afterAll(() => {
	rmSync(dataDir, { recursive: true, force: true });
	rmSync(cacheDir, { recursive: true, force: true });
});

async function runPayload(payload: unknown, width = 120): Promise<string> {
	const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "..", "src", "index.ts")], {
		stdin: new Blob([JSON.stringify(payload)]),
		stdout: "pipe",
		env: {
			...process.env,
			CCWATERMELON_WIDTH: String(width),
			CCWATERMELON_DATA_DIR: dataDir,
			CCWATERMELON_CACHE_DIR: cacheDir,
		},
	});
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out;
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

	test("alert-context renders 4 lines", async () => {
		const out = await runFixture("alert-context.json");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBe(4);
		expect(out).toContain("(◉_◉)");
	});

	test("narrow width collapses to a leaner render without crashing", async () => {
		const out = await runFixture("normal.json", 40);
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBeGreaterThanOrEqual(2);
		expect(out).toContain("(=ᴥ=)");
	});

	test("celebration fixture renders without crash", async () => {
		// Rose mood requires ALL of: ctx<30, cost<$1, 5h<10. The 5h value is
		// fetched from live Anthropic API (not the fixture), so rose mood is
		// environment-dependent. Rose mood classification is tested in
		// __tests__/mood.test.ts; here we just verify the fixture renders.
		const out = await runFixture("celebration.json");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBeGreaterThanOrEqual(2);
		expect(out).toContain("Sonnet 4.6");
	});

	test("payload without rate_limits never shows NaN% and still renders", async () => {
		const out = await runFixture("no-rate-limits.json");
		expect(out).not.toContain("NaN");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBeGreaterThanOrEqual(2);
	}, 8000);

	test("project-local config disables a segment for the render", async () => {
		const projectDir = mkdtempSync(join(tmpdir(), "ccwatermelon-project-"));
		writeFileSync(
			join(projectDir, ".ccwatermelon.jsonc"),
			`{
				// disable the tokens/s segment for this project
				"segments": { "tps": { "enabled": false } }
			}`,
		);
		const base = JSON.parse(
			readFileSync(join(import.meta.dir, "..", "fixtures", "normal.json"), "utf-8"),
		);
		base.workspace.current_dir = projectDir;

		const out = await runPayload(base);
		expect(out).not.toContain("t/s");

		rmSync(projectDir, { recursive: true, force: true });
	});

	test("normal fixture renders in < 250ms", async () => {
		const start = Date.now();
		await runFixture("normal.json");
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(250);
	});
});

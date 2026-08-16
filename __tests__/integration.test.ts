import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function runFixture(name: string, width = 120): Promise<string> {
	const fixture = readFileSync(join(import.meta.dir, "..", "fixtures", name), "utf-8");
	const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "..", "src", "index.ts")], {
		stdin: new Blob([fixture]),
		stdout: "pipe",
		env: { ...process.env, CCSTATUSLINE_WIDTH: String(width) },
	});
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out;
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

	test("normal fixture renders in < 250ms", async () => {
		const start = Date.now();
		await runFixture("normal.json");
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(250);
	});
});

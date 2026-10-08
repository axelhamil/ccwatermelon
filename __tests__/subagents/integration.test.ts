import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const homeDir = mkdtempSync(join(tmpdir(), "ccwatermelon-subagents-"));

afterAll(() => {
	rmSync(homeDir, { recursive: true, force: true });
});

async function runStdin(stdin: string): Promise<{ out: string; exitCode: number }> {
	const proc = Bun.spawn(["bun", "run", join(ROOT, "src", "subagents.ts")], {
		stdin: new Blob([stdin]),
		stdout: "pipe",
		stderr: "ignore",
		env: { ...process.env, CLAUDE_CONFIG_DIR: homeDir, HOME: homeDir },
	});
	const out = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;

	return { out, exitCode };
}

describe("subagents integration", () => {
	test("given the three tasks fixture on stdin, then one JSON line per task comes out", async () => {
		const fixture = readFileSync(join(ROOT, "fixtures", "subagents", "three-tasks.json"), "utf-8");

		const { out, exitCode } = await runStdin(fixture);
		const rows = out
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		expect(exitCode).toBe(0);
		expect(rows.map((row) => row.id)).toEqual(["a1f3c9e2", "b7d20a55", "c04e8b17"]);
		for (const row of rows) expect(row.content.length).toBeGreaterThan(0);
	});

	test("given garbage on stdin, then nothing is printed and the exit code stays 0", async () => {
		const garbage = ["not json", "42", '{"tasks":"nope"}', '{"tasks":[null,7,{},{"id":3}]}'];

		for (const stdin of garbage) {
			expect(await runStdin(stdin)).toEqual({ out: "", exitCode: 0 });
		}
	});
});

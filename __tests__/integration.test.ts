import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function runFixture(name: string): Promise<string> {
	const fixture = readFileSync(join(import.meta.dir, "..", "fixtures", name), "utf-8");
	const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "..", "src", "index.ts")], {
		stdin: new Blob([fixture]),
		stdout: "pipe",
	});
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out;
}

describe("integration", () => {
	test("normal renders 2 lines", async () => {
		const out = await runFixture("normal.json");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBe(2);
		expect(out).toContain("(=ᴥ=)~");
	});

	test("alert-context renders 3 lines", async () => {
		const out = await runFixture("alert-context.json");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBe(3);
		expect(out).toContain("(◉_◉)⚠");
	});

	test("celebration shows rose pet", async () => {
		const out = await runFixture("celebration.json");
		expect(out).toContain("(◕‿◕)♡");
	});

	test("normal fixture renders in < 250ms", async () => {
		const start = Date.now();
		await runFixture("normal.json");
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(250);
	});
});

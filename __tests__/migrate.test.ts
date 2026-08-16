import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLegacyPaths } from "../src/lib/migrate";

describe("migrateLegacyPaths", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
	});

	test("moves an old file to the new path, preserving content", () => {
		const dir = mkdtempSync(join(tmpdir(), "ccstatusline-migrate-"));
		dirs.push(dir);
		const from = join(dir, "old", "history.db");
		const to = join(dir, "new", "history.db");
		mkdirSync(join(dir, "old"), { recursive: true });
		writeFileSync(from, "old-data");

		migrateLegacyPaths([{ from, to }]);

		expect(existsSync(to)).toBe(true);
		expect(existsSync(from)).toBe(false);
		expect(readFileSync(to, "utf-8")).toBe("old-data");
	});

	test("does nothing when the old file does not exist", () => {
		const dir = mkdtempSync(join(tmpdir(), "ccstatusline-migrate-"));
		dirs.push(dir);
		const from = join(dir, "missing.db");
		const to = join(dir, "new.db");
		expect(() => migrateLegacyPaths([{ from, to }])).not.toThrow();
		expect(existsSync(to)).toBe(false);
	});

	test("does nothing when the new file already exists, never overwriting", () => {
		const dir = mkdtempSync(join(tmpdir(), "ccstatusline-migrate-"));
		dirs.push(dir);
		const from = join(dir, "old.db");
		const to = join(dir, "new.db");
		writeFileSync(from, "old-data");
		writeFileSync(to, "already-here");

		migrateLegacyPaths([{ from, to }]);

		expect(readFileSync(to, "utf-8")).toBe("already-here");
		expect(existsSync(from)).toBe(true);
	});
});

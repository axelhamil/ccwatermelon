import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const claudeDir = mkdtempSync(join(tmpdir(), "ccw-compaction-"));
process.env.CLAUDE_CONFIG_DIR = claudeDir;

const { compactThreshold } = await import("../../src/context/compaction");

function givenSettings(settings: unknown): void {
	writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(settings), "utf-8");
}

afterAll(() => {
	rmSync(claudeDir, { recursive: true, force: true });
});

describe("compactThreshold", () => {
	test("given no auto-compact setting, then the threshold is the reserve ratio of the window", () => {
		givenSettings({});

		expect(compactThreshold(200_000, 0.92)).toBe(184_000);
	});

	test("given an auto-compact window below the ceiling, then compaction happens at that window", () => {
		givenSettings({ autoCompactWindow: 430_000 });

		expect(compactThreshold(1_000_000, 0.92)).toBe(430_000);
	});

	test("given an auto-compact window above what the model allows, then the ceiling wins", () => {
		givenSettings({ autoCompactWindow: 900_000 });

		expect(compactThreshold(200_000, 0.92)).toBe(184_000);
	});

	test("given auto-compact set to auto, then it falls back to the reserve ratio", () => {
		givenSettings({ autoCompactWindow: "auto" });

		expect(compactThreshold(1_000_000, 0.92)).toBe(920_000);
	});

	test("given auto-compact disabled, then there is no threshold", () => {
		givenSettings({ autoCompactEnabled: false });

		expect(compactThreshold(200_000, 0.92)).toBeNull();
	});
});

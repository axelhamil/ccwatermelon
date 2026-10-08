import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadUserConfig, stripJsonComments } from "../src/lib/userConfig";

describe("stripJsonComments", () => {
	test("removes line and block comments outside strings", () => {
		const input = `{
			// a comment
			"a": 1, /* block */ "b": "// not a comment"
		}`;
		const parsed = JSON.parse(stripJsonComments(input));
		expect(parsed).toEqual({ a: 1, b: "// not a comment" });
	});
});

describe("loadUserConfig", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
	});

	test("returns defaults when no config file exists", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ccstatusline-"));
		dirs.push(cwd);
		const { config, errors } = loadUserConfig(cwd, [join(cwd, ".ccwatermelon.jsonc")]);
		expect(config.thresholds.compactAlert).toBe(85);
		expect(errors.length).toBe(0);
	});

	test("project-local config overrides thresholds", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ccstatusline-"));
		dirs.push(cwd);
		writeFileSync(
			join(cwd, ".ccwatermelon.jsonc"),
			`{
				// custom threshold
				"thresholds": { "compactAlert": 70 }
			}`,
		);
		const { config } = loadUserConfig(cwd, [join(cwd, ".ccwatermelon.jsonc")]);
		expect(config.thresholds.compactAlert).toBe(70);
		expect(config.thresholds.fiveHourAlert).toBe(90);
	});

	test("invalid config falls back to defaults and reports an error, never throws", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ccstatusline-"));
		dirs.push(cwd);
		writeFileSync(join(cwd, ".ccwatermelon.jsonc"), `{ "thresholds": { "compactAlert": 500 } }`);
		const { config, errors } = loadUserConfig(cwd, [join(cwd, ".ccwatermelon.jsonc")]);
		expect(config.thresholds.compactAlert).toBe(85);
		expect(errors.length).toBe(1);
	});

	test("malformed JSON falls back to defaults and reports an error, never throws", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ccstatusline-"));
		dirs.push(cwd);
		writeFileSync(join(cwd, ".ccwatermelon.jsonc"), "{ not json`");
		const { config, errors } = loadUserConfig(cwd, [join(cwd, ".ccwatermelon.jsonc")]);
		expect(config.thresholds.compactAlert).toBe(85);
		expect(errors.length).toBe(1);
	});
});

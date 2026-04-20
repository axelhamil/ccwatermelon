import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { History } from "../src/lib/history";

let dir: string;
let h: History;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "sl-hist-"));
	h = new History(join(dir, "test.db"));
});

afterEach(() => {
	h.close();
	rmSync(dir, { recursive: true, force: true });
});

describe("History", () => {
	test("record + getSeries recent", () => {
		const now = Math.floor(Date.now() / 1000);
		h.record("ctx_pct", 50, now - 120);
		h.record("ctx_pct", 55, now - 60);
		h.record("ctx_pct", 60, now);
		const series = h.getSeries("ctx_pct", 8, now);
		expect(series.length).toBe(3);
		expect(series[2]).toBe(60);
	});

	test("getSeries filters by metric", () => {
		const now = Math.floor(Date.now() / 1000);
		h.record("ctx_pct", 50, now);
		h.record("cost", 2.0, now);
		expect(h.getSeries("ctx_pct", 8, now)).toEqual([50]);
		expect(h.getSeries("cost", 8, now)).toEqual([2.0]);
	});

	test("prune removes rows older than retention", () => {
		const now = Math.floor(Date.now() / 1000);
		h.record("ctx_pct", 10, now - 3600);
		h.record("ctx_pct", 20, now);
		h.prune(30, now);
		expect(h.getSeries("ctx_pct", 60, now)).toEqual([20]);
	});

	test("upsert same metric+timestamp", () => {
		const now = Math.floor(Date.now() / 1000);
		h.record("ctx_pct", 50, now);
		h.record("ctx_pct", 60, now);
		expect(h.getSeries("ctx_pct", 8, now)).toEqual([60]);
	});
});

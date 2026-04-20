import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionsStore } from "../src/lib/sessions";

let dir: string;
let path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "sl-sess-"));
	path = join(dir, "sessions.json");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("SessionsStore", () => {
	test("empty file → 0 active", () => {
		const s = new SessionsStore(path);
		expect(s.countActive(5, Date.now())).toBe(0);
	});

	test("record then count fresh", () => {
		const s = new SessionsStore(path);
		const now = Date.now();
		s.record("s1", "/tmp/p1", now);
		expect(s.countActive(5, now)).toBe(1);
	});

	test("stale sessions excluded", () => {
		const s = new SessionsStore(path);
		const now = Date.now();
		s.record("s1", "/tmp/p1", now - 10 * 60_000);
		s.record("s2", "/tmp/p2", now);
		expect(s.countActive(5, now)).toBe(1);
	});

	test("same session_id+cwd updates last_seen", () => {
		const s = new SessionsStore(path);
		const now = Date.now();
		s.record("s1", "/tmp/p1", now - 60_000);
		s.record("s1", "/tmp/p1", now);
		expect(s.countActive(5, now)).toBe(1);
	});
});

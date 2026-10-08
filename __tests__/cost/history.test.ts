import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { History } from "../../src/cost/history";

const DAY = 86_400;
const noon = Math.floor(new Date(2026, 5, 10, 12, 0, 0).getTime() / 1000);

let dir: string;
let dbPath: string;
let history: History;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "ccw-history-"));
	dbPath = join(dir, "history.db");
	history = new History(dbPath);
});

afterEach(() => {
	history.close();
	rmSync(dir, { recursive: true, force: true });
});

describe("cost per day", () => {
	test("given a session that spans midnight, when it keeps spending, then each day only gets what was spent that day", () => {
		history.recordSessionCost("s1", "/work/app", 50, noon - DAY);

		history.recordSessionCost("s1", "/work/app", 53, noon);

		expect(history.costToday(noon)).toBeCloseTo(3, 5);
		expect(history.costOverDays(7, noon)).toBeCloseTo(53, 5);
	});

	test("given the same cost reported at every render, when it is recorded again, then it is not counted twice", () => {
		history.recordSessionCost("s1", "/work/app", 2, noon);

		history.recordSessionCost("s1", "/work/app", 2, noon + 60);

		expect(history.costToday(noon + 60)).toBeCloseTo(2, 5);
	});

	test("given two windows sharing a session id and reporting different costs, when they alternate, then only spend above the highest seen is counted", () => {
		history.recordSessionCost("s1", "/work/app", 20, noon);
		history.recordSessionCost("s1", "/work/app", 0.5, noon + 60);
		history.recordSessionCost("s1", "/work/app", 20, noon + 120);

		history.recordSessionCost("s1", "/work/app", 21, noon + 180);

		expect(history.costToday(noon + 180)).toBeCloseTo(21, 5);
	});

	test("given a legacy session last updated yesterday, when two connections open the database, then its cost is backfilled once", () => {
		history.close();
		const legacy = new Database(dbPath);
		legacy.exec("DROP TABLE daily_cost");
		legacy.query("INSERT INTO session_cost VALUES (?, ?, ?)").run("legacy", 7.5, noon - DAY);
		legacy.close();

		history = new History(dbPath);
		history.recordSessionCost("legacy", "/work/app", 7.5, noon);
		const other = new History(dbPath);

		expect(other.costOverDays(7, noon)).toBeCloseTo(7.5, 5);
		other.close();
	});

	test("given two sessions writing through two connections, when both record, then the day total sums them", () => {
		const other = new History(dbPath);

		history.recordSessionCost("s1", "/work/app", 1.5, noon);
		other.recordSessionCost("s2", "/work/app", 2.5, noon);

		expect(other.costToday(noon)).toBeCloseTo(4, 5);
		other.close();
	});

	test("given spend older than the week, when the week total is read, then it is left out", () => {
		history.recordSessionCost("old", "/work/app", 40, noon - 8 * DAY);
		history.recordSessionCost("recent", "/work/app", 5, noon - 6 * DAY);

		expect(history.costOverDays(7, noon)).toBeCloseTo(5, 5);
	});

	test("given a database written before daily costs existed, when it is opened, then the stored totals are kept", () => {
		history.close();
		const legacy = new Database(dbPath);
		legacy.exec("DROP TABLE daily_cost");
		legacy.query("INSERT INTO session_cost VALUES (?, ?, ?)").run("legacy", 12, noon);
		legacy.close();

		history = new History(dbPath);

		expect(history.costToday(noon)).toBeCloseTo(12, 5);
	});

	test("given sessions on two projects today, when the project total is read, then it only sums this project", () => {
		history.recordSessionCost("here-1", "/work/app", 4, noon);
		history.recordSessionCost("here-2", "/work/app", 6, noon);
		history.recordSessionCost("elsewhere", "/work/other", 30, noon);
		history.recordSessionCost("here-old", "/work/app", 50, noon - DAY);

		expect(history.projectCostToday("/work/app", noon)).toBeCloseTo(10, 5);
		expect(history.costToday(noon)).toBeCloseTo(40, 5);
	});

	test("given a database whose daily costs have no project yet, when it is opened, then sessions seen recently get theirs", () => {
		history.touchSession("s1", "/work/app", noon);
		history.recordSessionCost("s1", "/work/app", 9, noon);
		history.close();
		const legacy = new Database(dbPath);
		legacy.exec("ALTER TABLE daily_cost DROP COLUMN project");
		legacy.close();

		history = new History(dbPath);

		expect(history.projectCostToday("/work/app", noon)).toBeCloseTo(9, 5);
	});

	test("given costs past the retention, when pruned, then they leave the totals", () => {
		history.recordSessionCost("old", "/work/app", 40, noon - 40 * DAY);

		history.pruneCosts(30, noon);

		expect(history.costOverDays(60, noon)).toBe(0);
	});
});

describe("active sessions", () => {
	test("given sessions on two projects, when counting, then only the fresh ones of this project count", () => {
		history.touchSession("here-1", "/work/app", noon);
		history.touchSession("here-2", "/work/app", noon - 30);
		history.touchSession("here-stale", "/work/app", noon - 900);
		history.touchSession("elsewhere", "/work/other", noon);

		expect(history.countActiveSessions("/work/app", noon - 300)).toBe(2);
	});

	test("given a session that renders again, when it is touched twice, then it counts once", () => {
		history.touchSession("s1", "/work/app", noon - 60);
		history.touchSession("s1", "/work/app", noon);

		expect(history.countActiveSessions("/work/app", noon - 300)).toBe(1);
	});

	test("given sessions past the retention, when pruned, then they are forgotten", () => {
		history.touchSession("s1", "/work/app", noon - 2 * DAY);

		history.pruneSessions(noon - DAY);

		expect(history.countActiveSessions("/work/app", 0)).toBe(0);
	});
});

describe("samples", () => {
	test("given samples of two metrics, when one is read, then it comes back in time order with its timestamps", () => {
		history.record("5h_pct", 60, noon);
		history.record("5h_pct", 50, noon - 120);
		history.record("cost:s1", 2, noon);

		expect(history.samplesSince("5h_pct", noon - 480)).toEqual([
			{ sampled_at: noon - 120, value: 50 },
			{ sampled_at: noon, value: 60 },
		]);
	});

	test("given two samples in the same minute, when recorded, then the last one wins", () => {
		history.record("5h_pct", 50, noon);
		history.record("5h_pct", 60, noon);

		expect(history.samplesSince("5h_pct", noon - 60)).toEqual([{ sampled_at: noon, value: 60 }]);
	});

	test("given samples past the retention, when pruned, then only recent ones remain", () => {
		history.record("5h_pct", 10, noon - 3600);
		history.record("5h_pct", 20, noon);

		history.prune(30, noon);

		expect(history.samplesSince("5h_pct", 0)).toEqual([{ sampled_at: noon, value: 20 }]);
	});
});

import { describe, expect, test } from "bun:test";
import { render } from "../src/lib/render";
import type { StatuslineData } from "../src/lib/types";

const base: StatuslineData = {
	mood: { kind: "zen", face: "(=ᴥ=)~", label: null, color: "teal", pulseFast: false },
	git: { branch: "main", dirty: false, insertions: 0, deletions: 0 },
	modelName: "Opus 4.7",
	dirName: "openup-app",
	activeSessions: 1,
	sessionCost: 1.23,
	sessionDurationMs: 300_000,
	todayCost: 5.0,
	weekCost: 20.0,
	contextPct: 40,
	contextTokens: 80_000,
	contextSeries: [30, 32, 35, 38, 40, 40, 40, 40],
	fiveHourPct: 20,
	fiveHourResetsAt: null,
	fiveHourSeries: [15, 16, 17, 18, 19, 20, 20, 20],
	tokensPerSec: 300,
	tokensPerSecSeries: [280, 290, 300, 310, 300, 300, 300, 300],
	cacheHitPct: 85,
	burnRatePerHr: null,
	etaMinutes: null,
	etaCooling: false,
	alertMode: false,
	celebrationMode: false,
};

describe("render", () => {
	test("normal state produces 2 lines", () => {
		const out = render(base);
		const lines = out.split("\n").filter(Boolean);
		expect(lines.length).toBe(2);
	});

	test("alert state produces 3 lines", () => {
		const out = render({ ...base, alertMode: true, etaMinutes: 12 });
		const lines = out.split("\n").filter(Boolean);
		expect(lines.length).toBe(3);
	});

	test("shows mood face", () => {
		const out = render(base);
		expect(out).toContain("(=ᴥ=)~");
	});

	test("shows branch and model", () => {
		const out = render(base);
		expect(out).toContain("main");
		expect(out).toContain("Opus 4.7");
	});

	test("shows session cost formatted", () => {
		const out = render(base);
		expect(out).toContain("$1.23");
	});

	test("ETA in alert mode", () => {
		const out = render({ ...base, alertMode: true, etaMinutes: 12 });
		expect(out).toContain("ETA");
		expect(out).toContain("12");
	});
});

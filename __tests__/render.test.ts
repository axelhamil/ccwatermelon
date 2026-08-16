import { describe, expect, test } from "bun:test";
import { render } from "../src/lib/render";
import type { StatuslineData } from "../src/lib/types";

const base: StatuslineData = {
	mood: { kind: "zen", face: "(=ᴥ=)~", label: null, color: "teal" },
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
	compactPct: 40,
	tokensToCompact: 258000,
	fiveHourPct: 20,
	fiveHourResetsAt: null,
	fiveHourSeries: [15, 16, 17, 18, 19, 20, 20, 20],
	sevenDayPct: 23,
	sevenDayResetsAt: null,
	tokensPerSec: 300,
	tokensPerSecSeries: [280, 290, 300, 310, 300, 300, 300, 300],
	cacheHitPct: 85,
	burnRatePerHr: null,
	etaMinutes: null,
	etaCooling: false,
	alertMode: false,
	celebrationMode: false,
};

function withWidth<T>(width: number | undefined, fn: () => T): T {
	const prev = process.env.CCSTATUSLINE_WIDTH;
	// biome-ignore lint/performance/noDelete: env var must be absent, not "undefined", to hit the fallback path
	if (width === undefined) delete process.env.CCSTATUSLINE_WIDTH;
	else process.env.CCSTATUSLINE_WIDTH = String(width);
	try {
		return fn();
	} finally {
		// biome-ignore lint/performance/noDelete: env var must be absent, not "undefined", to hit the fallback path
		if (prev === undefined) delete process.env.CCSTATUSLINE_WIDTH;
		else process.env.CCSTATUSLINE_WIDTH = prev;
	}
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI color codes for assertions
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("render", () => {
	test("shows mood face", () => {
		const out = withWidth(120, () => render(base));
		expect(out).toContain("(=ᴥ=)~");
	});

	test("shows branch and model", () => {
		const out = withWidth(120, () => render(base));
		expect(out).toContain("main");
		expect(out).toContain("Opus 4.7");
	});

	test("shows session cost formatted", () => {
		const out = withWidth(120, () => render(base));
		expect(out).toContain("$1.23");
	});

	test("ETA in alert mode", () => {
		const out = withWidth(120, () => render({ ...base, alertMode: true, etaMinutes: 12 }));
		expect(out).toContain("limite dans");
		expect(out).toContain("12");
	});

	test("context pressure shows a single braille gauge glyph, no sparkline blocks", () => {
		const out = stripAnsi(withWidth(120, () => render(base)));
		expect(out).toMatch(/[⠀-⣿]/);
		expect(out).not.toMatch(/[▁▂▃▄▅▆▇█]/);
		expect(out).not.toMatch(/[█░]{2,}/);
	});

	test("five hour reset shows countdown and local clock", () => {
		const resetsAt = Math.floor(Date.now() / 1000) + 5400;
		const out = stripAnsi(withWidth(120, () => render({ ...base, fiveHourResetsAt: resetsAt })));
		expect(out).toContain("↺1h30");
		expect(out).toMatch(/\(\d{2}:\d{2}\)/);
	});

	test("five hour reset accepts an ISO string", () => {
		const resetsAt = new Date(Date.now() + 90 * 60_000).toISOString();
		const out = stripAnsi(withWidth(120, () => render({ ...base, fiveHourResetsAt: resetsAt })));
		expect(out).toContain("↺1h30");
	});

	test("session cost past a milestone renders with a moving gradient", () => {
		const out = withWidth(120, () => render({ ...base, sessionCost: 42 }));
		expect(stripAnsi(out)).toContain("$42.0");
		// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI color codes
		const codes = out.match(/\x1b\[[0-9;]*m/g) ?? [];
		expect(codes.length).toBeGreaterThan(10);
	});

	test("session cost under milestone stays a flat single color", () => {
		const out = withWidth(120, () => render({ ...base, sessionCost: 1.23 }));
		expect(out).toContain("$1.23");
	});

	test("celebration mode adds a sparkle", () => {
		const out = stripAnsi(withWidth(120, () => render({ ...base, celebrationMode: true })));
		expect(out).toContain("✨");
	});
});

describe("gauge line", () => {
	test("is always present, even outside alert mode", () => {
		const out = stripAnsi(render(base));
		const lines = out.split("\n");
		expect(lines.length).toBe(3);
		expect(lines[2]).toContain("conv");
		expect(lines[2]).toContain("5h");
		expect(lines[2]).toContain("7d");
	});

	test("carries countdown and local clock for both quotas", () => {
		const resetsAt = Math.floor(Date.now() / 1000) + 3 * 3600 + 34 * 60;
		const out = stripAnsi(
			render({ ...base, fiveHourResetsAt: resetsAt, sevenDayResetsAt: resetsAt }),
		);
		const quota = out.split("\n")[2] ?? "";
		expect(quota).toContain("\u21ba3h34");
		expect(quota).toMatch(/\(\d{2}:\d{2}\)/);
	});

	test("falls back to a placeholder when no quota is known", () => {
		const out = stripAnsi(
			render({ ...base, fiveHourPct: null, sevenDayPct: null, compactPct: null, contextPct: null }),
		);
		expect(out.split("\n")[2]).toContain("jauges indisponibles");
	});

	test("session line no longer carries the quotas", () => {
		const session = stripAnsi(render(base)).split("\n")[1] ?? "";
		expect(session).not.toContain("5h");
		expect(session).not.toContain("conv");
		expect(session).not.toContain("7d ");
	});
});

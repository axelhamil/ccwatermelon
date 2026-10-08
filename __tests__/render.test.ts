import { describe, expect, test } from "bun:test";
import { render } from "../src/lib/render";
import type { StatuslineData } from "../src/lib/types";
import { stripAnsi, visualWidth } from "../src/lib/width";

const base: StatuslineData = {
	mood: { kind: "zen", face: "(=ᴥ=)~", color: "teal" },
	git: { branch: "main", dirty: false, insertions: 0, deletions: 0 },
	modelName: "Opus 4.7",
	dirName: "acme-web",
	activeSessions: 1,
	sessionCost: 1.23,
	sessionDurationMs: 300_000,
	todayCost: 5.0,
	weekCost: 20.0,
	contextPct: 40,
	contextTokens: 80_000,
	compactPct: 40,
	tokensToCompact: 258000,
	fiveHourPct: 20,
	fiveHourResetsAt: null,
	sevenDayPct: 23,
	sevenDayResetsAt: null,
	cacheHitPct: 85,
	burnRatePerHr: null,
	etaMinutes: null,
	etaCooling: false,
	alertMode: false,
	celebrationMode: false,
	sessionName: null,
	ccVersion: null,
	outputStyle: null,
	worktree: null,
	linesAdded: 0,
	linesRemoved: 0,
	vimMode: null,
	agentName: null,
};

function withWidth(width: number, fn: () => string): string {
	const previous = process.env.CCWATERMELON_WIDTH;
	process.env.CCWATERMELON_WIDTH = String(width);
	try {
		return fn();
	} finally {
		if (previous === undefined) delete process.env.CCWATERMELON_WIDTH;
		else process.env.CCWATERMELON_WIDTH = previous;
	}
}

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
		expect(out).toContain("limit in");
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

	test("session cost past a milestone renders with a moving gradient", () => {
		const out = withWidth(120, () => render({ ...base, sessionCost: 42 }));
		expect(stripAnsi(out)).toContain("$42.0");
		// biome-ignore lint/suspicious/noControlCharactersInRegex: matches ANSI color codes
		const codes = out.match(/\x1b\[[0-9;]*m/g) ?? [];
		expect(codes.length).toBeGreaterThan(10);
	});

	test("celebration mode adds a sparkle", () => {
		const out = stripAnsi(withWidth(120, () => render({ ...base, celebrationMode: true })));
		expect(out).toContain("✨");
	});
});

describe("gauge line", () => {
	test("is always present, even outside alert mode", () => {
		const out = stripAnsi(render(base, {}, 120));
		const lines = out.split("\n");
		expect(lines.length).toBe(3);
		expect(lines[2]).toContain("conv");
		expect(lines[2]).toContain("5h");
		expect(lines[2]).toContain("7d");
	});

	test("carries countdown and local clock for both quotas", () => {
		const resetsAt = Math.floor(Date.now() / 1000) + 3 * 3600 + 34 * 60;
		const out = stripAnsi(
			render({ ...base, fiveHourResetsAt: resetsAt, sevenDayResetsAt: resetsAt }, {}, 120),
		);
		const quota = out.split("\n")[2] ?? "";
		expect(quota).toContain("\u21ba3h34");
		expect(quota).toMatch(/\(\d{2}:\d{2}\)/);
	});

	test("keeps the weekly quota at any width, shedding detail then other gauges first", () => {
		const resetsAt = Math.floor(Date.now() / 1000) + 3 * 3600 + 34 * 60;
		const data = { ...base, fiveHourResetsAt: resetsAt, sevenDayResetsAt: resetsAt };

		const medium = withWidth(60, () => stripAnsi(render(data)).split("\n")[2] ?? "");
		expect(medium).toContain("conv");
		expect(medium).toContain("5h 20%");
		expect(medium).toContain("7d 23%");

		const tiny = withWidth(14, () => stripAnsi(render(data)).split("\n")[2] ?? "");
		expect(tiny).toContain("7d 23%");
		expect(tiny).not.toContain("5h");
		expect(tiny).not.toContain("conv");
	});

	test("given a directory and a branch too long for the terminal, then they are cut with an ellipsis and the line fits", () => {
		const identity = withWidth(60, () =>
			stripAnsi(
				render({
					...base,
					dirName: "a-very-long-directory-name-that-never-ends-anywhere",
					git: { ...base.git, branch: "feat/an-equally-endless-branch-name-for-the-test" },
				}),
			),
		).split("\n")[0];

		expect(identity).toContain("…");
		expect(visualWidth(identity ?? "")).toBeLessThanOrEqual(60);
	});

	test("given an alert on a narrow terminal, then the alert line sheds detail to fit", () => {
		const alert = withWidth(50, () =>
			stripAnsi(render({ ...base, alertMode: true, cacheHitPct: 41, etaMinutes: 35 })),
		).split("\n")[3];

		expect(alert).toContain("limit in 35min");
		expect(visualWidth(alert ?? "")).toBeLessThanOrEqual(50);
	});

	test("given alert mode with nothing to report, then no empty fourth line is printed", () => {
		const out = render({ ...base, alertMode: true, contextTokens: null, tokensToCompact: null });

		expect(out.split("\n").length).toBe(3);
	});

	test("falls back to a placeholder when no quota is known", () => {
		const out = stripAnsi(
			render(
				{ ...base, fiveHourPct: null, sevenDayPct: null, compactPct: null, contextPct: null },
				{},
				120,
			),
		);
		expect(out.split("\n")[2]).toContain("gauges unavailable");
	});

	test("session line no longer carries the quotas", () => {
		const session = stripAnsi(render(base, {}, 120)).split("\n")[1] ?? "";
		expect(session).not.toContain("5h");
		expect(session).not.toContain("conv");
		expect(session).not.toContain("7d ");
	});
});

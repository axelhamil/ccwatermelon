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
	projectTodayCost: 5.0,
	todayCost: 5.0,
	weekCost: 20.0,
	contextPct: 40,
	compactPct: 40,
	compactHeadroom: 258000,
	contextLevel: "calm",
	fiveHourPct: 20,
	fiveHourResetsAt: null,
	fiveHourProjectedPct: null,
	fiveHourLevel: "calm",
	sevenDayPct: 23,
	sevenDayResetsAt: null,
	sevenDayProjectedPct: null,
	sevenDayLevel: "calm",
	cacheHitPct: 85,
	burnRatePerHr: null,
	etaMinutes: null,
	etaCooling: false,
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

describe("quota rows", () => {
	const resetsAt = Math.floor(Date.now() / 1000) + 3 * 3600 + 34 * 60;
	const weekResetsAt = resetsAt + 2 * 86_400;
	const paced = {
		...base,
		fiveHourResetsAt: resetsAt,
		fiveHourProjectedPct: 31,
		sevenDayPct: 100,
		sevenDayResetsAt: weekResetsAt,
		sevenDayProjectedPct: 104,
	};
	const columnOf = (line: string | undefined, mark: string) => (line ?? "").indexOf(mark);

	test("given room for both quotas, then they share one line under the identity line carrying the conversation gauge", () => {
		const lines = stripAnsi(render(paced, {}, 120)).split("\n");

		expect(lines).toHaveLength(3);
		expect(lines[0]).toContain("conv 40%");
		expect(lines[2]).toMatch(
			/^🍉 5h 20%. ↺3h34 \(\d{2}:\d{2}\) end 31% · 7d 100%. ↺2d3h \(\w{3} \d{2}:\d{2}\) end 104%$/u,
		);
	});

	test("given quotas too wide for one line, then each gets a row and gauge, countdown, clock and projection line up", () => {
		const lines = stripAnsi(render(paced, {}, 60)).split("\n");

		expect(lines[2]).toMatch(/5h {2}20%. ↺3h34 \(\d{2}:\d{2}\) +end 31%$/);
		expect(lines[3]).toMatch(/7d 100%. ↺2d3h \(\w{3} \d{2}:\d{2}\) end 104%$/);
		for (const mark of ["↺", "(", "%\n"]) {
			expect(columnOf(`${lines[2]}\n`, mark)).toBe(columnOf(`${lines[3]}\n`, mark));
		}
	});

	test("given a narrowing terminal, then both rows shed the same column, clock first, and the weekly quota stays", () => {
		const withoutClock = stripAnsi(render(paced, {}, 34)).split("\n");
		const tiny = stripAnsi(render(paced, {}, 14)).split("\n");

		expect(withoutClock[2]).toContain("↺3h34 ");
		expect(withoutClock[2]).toContain("end 31%");
		expect(withoutClock[3]).not.toContain("(");
		expect(tiny[2]).toMatch(/^🍉 5h {2}20%.$/u);
		expect(tiny[3]).toContain("7d 100%");
		expect(tiny[3]).not.toContain("↺");
	});

	test("given the 5h quota about to run out, then the warning sits on its row", () => {
		const lines = stripAnsi(render({ ...paced, etaMinutes: 35 }, {}, 60)).split("\n");

		expect(lines).toHaveLength(4);
		expect(lines[2]).toContain("⚠ limit in 35m");
		expect(lines[3]).not.toContain("limit");
	});

	test("given no line ever wider than the terminal, then every width from 30 to 120 fits", () => {
		for (const width of [30, 44, 60, 80, 120]) {
			const lines = stripAnsi(render({ ...paced, etaMinutes: 35 }, {}, width)).split("\n");

			for (const line of lines.slice(2)) expect(visualWidth(line)).toBeLessThanOrEqual(width);
		}
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

	test("given context past the compaction threshold, then the conversation gauge says by how much", () => {
		const identity = stripAnsi(
			render(
				{
					...base,
					compactPct: 163,
					contextLevel: "panic",
					compactHeadroom: -272_000,
				},
				{},
				120,
			),
		).split("\n")[0];

		expect(identity).toContain("conv 163%");
		expect(identity).toContain("+272k");
	});

	test("given the pace segment disabled, then no projection is shown", () => {
		const out = render({ ...base, sevenDayProjectedPct: 143 }, { pace: { enabled: false } }, 120);

		expect(stripAnsi(out)).not.toContain("end ");
	});

	test("given a project that is only part of today's spend, then its total sits between session and day", () => {
		const economy = stripAnsi(
			render({ ...base, projectTodayCost: 3.5, todayCost: 5, weekCost: 20 }, {}, 120),
		).split("\n")[1];

		expect(economy).toContain("$1.23 (5m) · P $3.50 · D $5.00 · W $20.0");
	});

	test("given a project total equal to the day total, then it is not repeated", () => {
		const economy = stripAnsi(render(base, {}, 120)).split("\n")[1];

		expect(economy).not.toContain("P $");
	});

	test("given a gauge past its alert threshold, then its glyph alternates colour from one second to the next", () => {
		const alerting = { ...base, sevenDayLevel: "critical" as const };

		expect(render(alerting, {}, 120, 1000)).not.toBe(render(alerting, {}, 120, 2000));
		expect(render(base, {}, 120, 1000)).toBe(render(base, {}, 120, 2000));
	});

	test("falls back to a placeholder when no quota is known", () => {
		const out = stripAnsi(
			render(
				{ ...base, fiveHourPct: null, sevenDayPct: null, compactPct: null, contextPct: null },
				{},
				120,
			),
		);
		expect(out.split("\n")[2]).toContain("quotas unavailable");
	});

	test("session line no longer carries the quotas", () => {
		const session = stripAnsi(render(base, {}, 120)).split("\n")[1] ?? "";
		expect(session).not.toContain("5h");
		expect(session).not.toContain("conv");
		expect(session).not.toContain("7d ");
	});
});

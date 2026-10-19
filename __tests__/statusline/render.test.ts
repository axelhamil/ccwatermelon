import { describe, expect, test } from "bun:test";
import type { StatuslineData } from "../../src/statusline/data";
import { brailleGauge } from "../../src/statusline/gauge";
import { render } from "../../src/statusline/render";
import { color } from "../../src/terminal/format";
import { stripAnsi, visualWidth } from "../../src/terminal/width";

const base: StatuslineData = {
	mood: { kind: "zen", face: "(=ᴥ=)~", blink: "(-ᴥ-)~", color: "green" },
	git: { branch: "main", dirty: false, insertions: 0, deletions: 0 },
	modelName: "Opus 4.7",
	dirName: "acme-web",
	sessionDurationMs: 300_000,
	contextPct: 40,
	compactPct: 40,
	compactHeadroom: 258000,
	contextLevel: "calm",
	cacheHitPct: 85,
	celebrationMode: false,
	sessionName: null,
	ccVersion: null,
	outputStyle: null,
	worktree: null,
	linesAdded: 0,
	linesRemoved: 0,
	vimMode: null,
	agentName: null,
	effort: null,
	thinking: false,
	fastMode: false,
	pullRequest: null,
	repoUrl: null,
};

const busy: StatuslineData = {
	...base,
	git: { branch: "feat/checkout", dirty: true, insertions: 42, deletions: 7 },
	effort: "high",
	cacheHitPct: 41,
	linesAdded: 142,
	linesRemoved: 38,
	worktree: "melon",
	agentName: "explorer",
	outputStyle: "terse",
	ccVersion: "2.1.0",
};
const everything = { ccVersion: { enabled: true } };
const plainLines = (out: string) => stripAnsi(out).split("\n");

describe("render", () => {
	test("given a wide terminal, when rendered, then mood, project, branch, model and context share one line three spaces apart", () => {
		expect(plainLines(render(base, {}, 120, 0))).toEqual([
			"(=ᴥ=)~   acme-web   main   Opus 4.7   conv 40%⡆   time 5m",
		]);
	});

	test("given any render, then it only uses the 16 terminal colours and dims its labels", () => {
		const out = render(busy, everything, 160, 0);

		expect(out).not.toContain("38;2;");
		expect(out).not.toContain("·");
		expect(out).toContain(`${color("conv", "dim")} ${color("40%", "green")}`);
		expect(out).toContain(color("41%", "red"));
	});

	test("given a celebration, when rendered, then a sparkle follows the face", () => {
		expect(stripAnsi(render({ ...base, celebrationMode: true }, {}, 120, 0))).toContain(
			"(=ᴥ=)~ ✨",
		);
	});

	test("given no context measure yet, when rendered, then the context gauge is left out", () => {
		const out = stripAnsi(render({ ...base, contextPct: null, compactPct: null }, {}, 120, 0));

		expect(out).not.toContain("conv");
	});
});

describe("line flow", () => {
	test("given a wide terminal, when every segment fits, then the status line is one line", () => {
		expect(plainLines(render(busy, everything, 200, 0))).toHaveLength(1);
	});

	test("given a medium terminal, when segments overflow line 1, then they flow onto line 2 in order", () => {
		const lines = plainLines(render(busy, everything, 100, 0));

		expect(lines).toHaveLength(2);
		expect(lines[0]).toStartWith("(=ᴥ=)~   acme-web   feat/checkout* +42 -7   Opus 4.7");
		expect(lines[1]).toContain("worktree melon");
	});

	test("given a narrow terminal, when segments need more room, then a third line is used", () => {
		expect(plainLines(render(busy, everything, 60, 0))).toHaveLength(3);
	});

	test("given fewer segments enabled, when rendered at the same width, then fewer lines are used", () => {
		const lean = {
			...everything,
			effort: { enabled: false },
			cache: { enabled: false },
			linesChanged: { enabled: false },
			worktree: { enabled: false },
			agentName: { enabled: false },
			outputStyle: { enabled: false },
			ccVersion: { enabled: false },
		};

		expect(plainLines(render(busy, lean, 60, 0))).toHaveLength(2);
	});

	test("given a very narrow terminal, when 3 lines are not enough, then the lowest priority segments leave first", () => {
		const out = stripAnsi(render(busy, everything, 44, 0));

		expect(out.split("\n")).toHaveLength(3);
		expect(out).not.toContain("v2.1.0");
		expect(out).not.toContain("style terse");
		expect(out).toContain("cache 41%");
		expect(out).toContain("conv 40%");
	});

	test("given a raised priority, when segments must leave, then the raised one stays", () => {
		const out = stripAnsi(
			render(busy, { ...everything, ccVersion: { enabled: true, priority: 99 } }, 44, 0),
		);

		expect(out).toContain("v2.1.0");
	});

	test("given any width from 20 to 200, then there are 1 to 3 lines, none empty", () => {
		for (const width of [20, 30, 44, 60, 80, 100, 120, 160, 200]) {
			const lines = plainLines(render(busy, everything, width, 0));

			expect(lines.length).toBeGreaterThanOrEqual(1);
			expect(lines.length).toBeLessThanOrEqual(3);
			for (const line of lines) expect(line.trim()).not.toBe("");
		}
	});

	test("given widths from 40 up, then no line is wider than the terminal", () => {
		for (const width of [40, 60, 80, 120]) {
			for (const line of plainLines(render(busy, everything, width, 0))) {
				expect(visualWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});

	test("given a tiny terminal and a busy branch, when rendered, then the pull request badge and diff give way and every line fits", () => {
		const crowded: StatuslineData = {
			...base,
			modelName: "Claude Opus 4.7 Extended",
			git: { branch: "feat/checkout", dirty: true, insertions: 14200, deletions: 3800 },
			pullRequest: {
				number: 12345,
				url: "https://example.com/pr/12345",
				reviewState: "changes_requested",
			},
		};

		for (const width of [16, 20, 24, 30]) {
			for (const line of plainLines(render(crowded, {}, width, 0))) {
				expect(visualWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});

	test("given a directory and a branch too long for the terminal, then they are cut with an ellipsis and every line fits", () => {
		const long = {
			...base,
			dirName: "a-very-long-directory-name-that-never-ends-anywhere",
			git: { ...base.git, branch: "feat/an-equally-endless-branch-name-for-the-test" },
		};
		const lines = plainLines(render(long, {}, 40, 0));

		expect(lines.join("\n")).toContain("…");
		for (const line of lines) expect(visualWidth(line)).toBeLessThanOrEqual(40);
	});
});

describe("identity", () => {
	const reviewed = {
		...base,
		effort: "high",
		repoUrl: "https://github.com/acme/web",
		pullRequest: {
			number: 128,
			url: "https://github.com/acme/web/pull/128",
			reviewState: "changes_requested" as const,
		},
	};

	test("given an open pull request, when rendered, then its number and review state follow the branch", () => {
		expect(stripAnsi(render(reviewed, {}, 120, 0))).toContain(
			"main #128 ✗   Opus 4.7   effort high",
		);
	});

	test("given a known repository, when rendered, then directory, branch and pull request are links that take no width", () => {
		const linked = render(reviewed, {}, 120, 0);
		const plain = render(reviewed, { links: { enabled: false } }, 120, 0);

		expect(linked).toContain("\x1b]8;;https://github.com/acme/web\x07");
		expect(linked).toContain("\x1b]8;;https://github.com/acme/web/tree/main\x07");
		expect(linked).toContain("\x1b]8;;https://github.com/acme/web/pull/128\x07");
		expect(plain).not.toContain("\x1b]8");
		expect(visualWidth(linked)).toBe(visualWidth(plain));
	});

	test("given a branch with characters that mean something in a url, when linked, then they are escaped", () => {
		const odd = { ...reviewed, git: { ...reviewed.git, branch: "fix/#12 a" } };

		expect(render(odd, {}, 120, 0)).toContain("/tree/fix/%2312%20a\x07");
	});

	test("given the pull request segment disabled, when rendered, then the badge is gone", () => {
		expect(stripAnsi(render(reviewed, { pullRequest: { enabled: false } }, 120, 0))).not.toContain(
			"#128",
		);
	});
});

describe("context gauge", () => {
	const alerting = { ...base, compactPct: 90, contextLevel: "critical" as const };

	test("given context past the compaction threshold, then the gauge says by how much", () => {
		const out = stripAnsi(
			render(
				{ ...base, compactPct: 163, contextLevel: "panic", compactHeadroom: -272_000 },
				{},
				120,
				0,
			),
		);

		expect(out).toContain("conv 163%");
		expect(out).toContain("+272k");
	});

	test("given the context in its warning zone, then its value turns yellow", () => {
		const out = render({ ...base, compactPct: 70, contextLevel: "warn" }, {}, 120, 0);

		expect(out).toContain(color("70%", "yellow"));
	});

	test("given the context past its alert threshold, then its glyph alternates from one second to the next", () => {
		const dimmed = color(brailleGauge(90), "dim");

		expect(render(alerting, {}, 120, 1000)).toContain(dimmed);
		expect(render(alerting, {}, 120, 2000)).toContain(color(brailleGauge(90), "red"));
	});

	test("given the clock advancing, when rendered, then the face blinks one second in five", () => {
		const faces = [0, 1, 2, 3, 4].map((second) => stripAnsi(render(base, {}, 120, second * 1000)));

		expect(faces.slice(0, 4).every((out) => out.includes("(=ᴥ=)~"))).toBe(true);
		expect(faces[4]).toContain("(-ᴥ-)~");
	});

	test("given motion switched off, when the clock advances, then nothing moves", () => {
		const still = { motion: { enabled: false } };

		expect(render(alerting, still, 120, 1000)).toBe(render(alerting, still, 120, 4000));
	});
});

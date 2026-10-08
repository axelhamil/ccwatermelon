import { describe, expect, test } from "bun:test";
import { parseSubagentPayload } from "../../src/subagents/payload";
import { renderSubagentRows } from "../../src/subagents/row";
import { stripAnsi, visualWidth } from "../../src/terminal/width";

const NOW = 1_791_461_000_000;

const TASKS = [
	{
		id: "a",
		name: "explorer",
		status: "running",
		label: "Map every caller of the billing webhook handler",
		startTime: NOW - 200_000,
		model: "claude-haiku-4-5-20251001",
		tokenCount: 48_200,
		tokenSamples: [1200, 4100, 6900, 9800, 14_200, 18_900, 21_000, 24_800],
	},
	{
		id: "b",
		agentType: "feature-dev:code-reviewer",
		status: "completed",
		label: "Review the retry policy diff",
		startTime: NOW - 4_000_000,
		model: "claude-opus-4-5-20251101",
		tokenCount: 1_314_000,
		tokenSamples: [88_000, 131_400],
	},
	{
		id: "c",
		name: "日本語の名前",
		status: "failed",
		description: "Read the Stripe idempotency key documentation",
		startTime: NOW - 9000,
		model: "sonnet",
		tokenCount: 920,
		tokenSamples: [310, 920, 920],
	},
];

function plainRows(raw: unknown, columns: number): string[] {
	const tasks = parseSubagentPayload({ tasks: raw })?.tasks ?? [];

	return renderSubagentRows(tasks, columns, NOW).map((row) => stripAnsi(row.content));
}

function widthUpTo(row: string, needle: string): number {
	return visualWidth(row.slice(0, row.indexOf(needle) + needle.length));
}

describe("renderSubagentRows", () => {
	test("given a shrinking width, when rendered, then description, sparkline, elapsed and model leave in that order", () => {
		const shown = (columns: number) => {
			const [row = ""] = plainRows(TASKS, columns);

			return {
				description: row.includes("Map"),
				sparkline: /[⠁-⣿]{2}/.test(row),
				elapsed: row.includes("3m"),
				model: row.includes("haiku"),
				tokens: row.includes("48k"),
			};
		};
		const order = ["description", "sparkline", "elapsed", "model", "tokens"] as const;
		let gone = 0;

		for (let columns = 130; columns >= 22; columns--) {
			const state = shown(columns);
			const firstKept = order.findIndex((column) => state[column]);
			const kept = firstKept === -1 ? order.length : firstKept;

			expect(order.slice(kept).every((column) => state[column])).toBe(true);
			expect(kept).toBeGreaterThanOrEqual(gone);
			gone = kept;
		}

		expect(gone).toBe(order.length);
		expect(shown(130).description).toBe(true);
	});

	test("given rows with different content, when rendered, then the first and last columns line up", () => {
		const [first = "", second = "", third = ""] = plainRows(TASKS, 120);

		const modelEnds = [
			widthUpTo(first, "haiku 4.5"),
			widthUpTo(second, "opus 4.5 "),
			widthUpTo(third, "sonnet   "),
		];
		const elapsedEnds = [
			widthUpTo(first, " 3m "),
			widthUpTo(second, " 1h06m "),
			widthUpTo(third, " 9s "),
		];

		expect(new Set(modelEnds).size).toBe(1);
		expect(new Set(elapsedEnds).size).toBe(1);
		expect(second.startsWith("✓ ")).toBe(true);
	});

	test("given key widths, when rendered, then every task keeps a row no wider than the columns", () => {
		for (const columns of [1, 22, 40, 80, 130]) {
			const rows = plainRows(TASKS, columns);

			expect(rows).toHaveLength(TASKS.length);
			for (const row of rows) expect(visualWidth(row)).toBeLessThanOrEqual(columns);
		}
	});

	test("given a task with only an id and a type, when rendered, then it still gets a row", () => {
		const rows = plainRows([{ id: "x", agentType: "Explore" }, TASKS[0]], 100);

		expect(rows[0]).toBe("· Explore");
		expect(rows[1]).toContain("explorer");
	});
});

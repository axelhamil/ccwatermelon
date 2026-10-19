import { describe, expect, test } from "bun:test";
import type { Part } from "../../src/statusline/fit";
import { CORE_PRIORITY, flowLines } from "../../src/statusline/fit";

const core = (text: string): Part => ({ text, priority: CORE_PRIORITY });
const optional = (text: string, priority: number): Part => ({ text, priority });

describe("flowLines", () => {
	const parts = [core("aaaa"), core("bbbb"), optional("cccc", 5), optional("dddd", 9)];

	test("given room for every segment, when laid out, then they share one line three spaces apart", () => {
		expect(flowLines(parts, 40)).toEqual(["aaaa   bbbb   cccc   dddd"]);
	});

	test("given a narrower terminal, when laid out, then line 1 fills first and the rest flows below in order", () => {
		expect(flowLines(parts, 17)).toEqual(["aaaa   bbbb", "cccc   dddd"]);
	});

	test("given room for one segment per line, when four are enabled, then the lowest priority one leaves to stay within 3 lines", () => {
		expect(flowLines(parts, 6)).toEqual(["aaaa", "bbbb", "dddd"]);
	});

	test("given a custom priority, when segments must leave, then the lowest priority leaves first wherever it sits", () => {
		const reranked = [core("aaaa"), optional("cccc", 9), core("bbbb"), optional("dddd", 1)];

		expect(flowLines(reranked, 6)).toEqual(["aaaa", "cccc", "bbbb"]);
	});

	test("given only core segments that need more than 3 lines, when laid out, then it still never emits more than 3", () => {
		const cores = ["a", "b", "c", "d", "e"].map(core);

		expect(flowLines(cores, 1)).toHaveLength(3);
	});

	test("given no segment at all, when laid out, then no empty line is emitted", () => {
		expect(flowLines([], 80)).toEqual([]);
	});
});

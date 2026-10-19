import { visualWidth } from "../terminal/width";

export interface Part {
	text: string;
	priority: number;
}

export const CORE_PRIORITY = Number.POSITIVE_INFINITY;
export const GAP = "   ";
export const MAX_LINES = 3;

function flow(parts: Part[], width: number): Part[][] {
	const lines: Part[][] = [];
	let current: Part[] = [];
	let used = 0;

	for (const part of parts) {
		const partWidth = visualWidth(part.text);
		const needed = current.length === 0 ? partWidth : used + GAP.length + partWidth;

		if (current.length > 0 && needed > width) {
			lines.push(current);
			current = [part];
			used = partWidth;
			continue;
		}

		current.push(part);
		used = needed;
	}

	return current.length > 0 ? [...lines, current] : lines;
}

export function flowLines(parts: Part[], width: number): string[] {
	const victims = parts
		.filter((part) => part.priority !== CORE_PRIORITY)
		.sort((a, b) => a.priority - b.priority);
	const dropped = new Set<Part>();
	let lines = flow(parts, width);

	for (const victim of victims) {
		if (lines.length <= MAX_LINES) break;

		dropped.add(victim);
		lines = flow(
			parts.filter((part) => !dropped.has(part)),
			width,
		);
	}

	return lines.slice(0, MAX_LINES).map((line) => line.map((part) => part.text).join(GAP));
}

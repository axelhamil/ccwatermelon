import { visualWidth } from "./width";

export interface Chunk {
	text: string;
	priority: number;
}

export interface Part {
	full: string;
	compact?: string;
	priority: number;
}

function byPriority<T extends { priority: number }>(items: T[]): T[] {
	return [...items].sort((a, b) => a.priority - b.priority);
}

export function fitChunks(core: string, optional: Chunk[], width: number): string {
	const dropped = new Set<Chunk>();
	const compose = () =>
		core +
		optional
			.filter((chunk) => !dropped.has(chunk))
			.map((chunk) => chunk.text)
			.join("");

	for (const victim of byPriority(optional)) {
		if (visualWidth(compose()) <= width) break;
		dropped.add(victim);
	}

	return compose();
}

export function fitParts(prefix: string, parts: Part[], separator: string, width: number): string {
	const compacted = new Set<Part>();
	const dropped = new Set<Part>();
	const compose = () =>
		prefix +
		parts
			.filter((part) => !dropped.has(part))
			.map((part) => (compacted.has(part) ? (part.compact ?? part.full) : part.full))
			.join(separator);

	const ranked = byPriority(parts);
	const shrinkSteps = [
		...ranked.map((part) => () => compacted.add(part)),
		...ranked.slice(0, -1).map((part) => () => dropped.add(part)),
	];
	for (const shrink of shrinkSteps) {
		if (visualWidth(compose()) <= width) break;
		shrink();
	}

	return compose();
}

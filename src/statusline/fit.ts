import { visualWidth } from "../terminal/width";

export interface Chunk {
	text: string;
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

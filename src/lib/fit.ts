import { visualWidth } from "./width";

export interface Chunk {
	text: string;
	priority: number;
}

// Concatenates chunks (each chunk owns its own leading separator/spacing)
// and, if the result overflows `width`, drops chunks lowest-priority-first
// until it fits or only priority Infinity ("core") chunks remain.
export function fitChunks(core: string, optional: Chunk[], width: number): string {
	const sorted = [...optional].sort((a, b) => a.priority - b.priority);
	const dropped = new Set<number>();

	const compose = (): string => {
		return (
			core +
			optional
				.filter((_, i) => !dropped.has(i))
				.map((c) => c.text)
				.join("")
		);
	};

	let result = compose();
	let cursor = 0;
	while (visualWidth(result) > width && cursor < sorted.length) {
		const victim = sorted[cursor];
		cursor++;
		if (!victim) continue;
		const idx = optional.indexOf(victim);
		if (idx >= 0) dropped.add(idx);
		result = compose();
	}
	return result;
}

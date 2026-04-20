import type { Sample } from "./types";

export function burnRate(samples: Sample[]): number | null {
	if (samples.length < 2) return null;
	const sorted = [...samples].sort((a, b) => a.sampled_at - b.sampled_at);
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	if (!first || !last) return null;
	const spanSec = last.sampled_at - first.sampled_at;
	if (spanSec < 60) return null;
	const deltaCost = Math.max(0, last.value - first.value);
	return (deltaCost / spanSec) * 3600;
}

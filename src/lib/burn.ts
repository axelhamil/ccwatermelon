import type { Sample } from "./types";

export function burnRate(samples: Sample[]): number | null {
	const sorted = [...samples].sort((a, b) => a.sampled_at - b.sampled_at);
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	if (sorted.length < 2 || !first || !last) return null;

	const spanSec = last.sampled_at - first.sampled_at;
	if (spanSec < 60) return null;

	const spent = Math.max(0, last.value - first.value);

	return (spent / spanSec) * 3600;
}

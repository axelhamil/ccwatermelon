import type { Sample } from "../cost/sample";

export interface EtaResult {
	minutes: number | null;
	cooling: boolean;
}

function slopePerMinute(points: { minute: number; value: number }[]): number {
	const minuteMean = points.reduce((sum, p) => sum + p.minute, 0) / points.length;
	const valueMean = points.reduce((sum, p) => sum + p.value, 0) / points.length;
	const covariance = points.reduce(
		(sum, p) => sum + (p.minute - minuteMean) * (p.value - valueMean),
		0,
	);
	const variance = points.reduce((sum, p) => sum + (p.minute - minuteMean) ** 2, 0);

	return variance === 0 ? 0 : covariance / variance;
}

export function forecastEta(samples: Sample[], target: number): EtaResult {
	const first = samples[0];
	const last = samples[samples.length - 1];
	if (samples.length < 3 || !first || !last) return { minutes: null, cooling: false };

	const points = samples.map((s) => ({
		minute: (s.sampled_at - first.sampled_at) / 60,
		value: s.value,
	}));
	const slope = slopePerMinute(points);
	if (slope <= 0) return { minutes: null, cooling: slope < 0 };
	if (last.value >= target) return { minutes: 0, cooling: false };

	return { minutes: Math.max(1, Math.ceil((target - last.value) / slope)), cooling: false };
}

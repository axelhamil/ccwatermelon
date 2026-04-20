export interface EtaResult {
	minutes: number | null;
	cooling: boolean;
}

export function forecastEta(series: number[], target: number): EtaResult {
	if (series.length < 3) return { minutes: null, cooling: false };

	const n = series.length;
	const xs = Array.from({ length: n }, (_, i) => i);
	const xMean = xs.reduce((a, b) => a + b, 0) / n;
	const yMean = series.reduce((a, b) => a + b, 0) / n;
	let num = 0;
	let den = 0;
	for (let i = 0; i < n; i++) {
		const x = xs[i];
		const y = series[i];
		if (x === undefined || y === undefined) continue;
		num += (x - xMean) * (y - yMean);
		den += (x - xMean) ** 2;
	}
	const slope = den === 0 ? 0 : num / den;

	if (slope <= 0) {
		return { minutes: null, cooling: slope < 0 };
	}

	const last = series[n - 1];
	if (last === undefined) return { minutes: null, cooling: false };

	if (last >= target) return { minutes: 0, cooling: false };

	const stepsToTarget = (target - last) / slope;
	return { minutes: Math.round(stepsToTarget), cooling: false };
}

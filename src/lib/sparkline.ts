const CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export interface SparklineOpts {
	min?: number;
	max?: number;
}

export function sparkline(values: number[], opts: SparklineOpts = {}): string {
	if (values.length === 0) return "";
	const min = opts.min ?? Math.min(...values);
	const max = opts.max ?? Math.max(...values);
	const range = max - min;
	return values
		.map((v) => {
			if (range === 0) return CHARS[3];
			const normalized = (v - min) / range;
			const idx = Math.min(7, Math.max(0, Math.round(normalized * 7)));
			return CHARS[idx];
		})
		.join("");
}

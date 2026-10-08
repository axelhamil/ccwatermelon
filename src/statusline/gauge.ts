const GAUGE_BITS = [0x40, 0x04, 0x02, 0x01, 0x08, 0x10, 0x20, 0x80] as const;
const BRAILLE_BLANK = 0x2800;

export function brailleGauge(pct: number): string {
	const clamped = Math.max(0, Math.min(100, pct));
	const exactLevel = (clamped / 100) * GAUGE_BITS.length;
	const level = clamped > 0 ? Math.max(1, Math.round(exactLevel)) : 0;
	const bits = GAUGE_BITS.slice(0, level).reduce((acc, bit) => acc | bit, 0);

	return String.fromCodePoint(BRAILLE_BLANK + bits);
}

// Fill order chosen for a pleasant bottom-to-top, left-to-right density ramp
// across the 2x4 braille dot matrix (U+2800 base).
const GAUGE_BITS = [0x40, 0x04, 0x02, 0x01, 0x08, 0x10, 0x20, 0x80] as const;

export function brailleGauge(pct: number): string {
	const clamped = Math.max(0, Math.min(100, pct));
	const exact = (clamped / 100) * GAUGE_BITS.length;
	const level = clamped > 0 ? Math.max(1, Math.round(exact)) : 0;

	let bits = 0;
	for (let i = 0; i < level; i++) {
		bits |= GAUGE_BITS[i] ?? 0;
	}
	return String.fromCodePoint(0x2800 + bits);
}

const MAX_LABEL_LENGTH = 120;

function isControl(cp: number): boolean {
	return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);
}

export function sanitizeLabel(value: string): string {
	let out = "";
	for (const ch of value) {
		if (isControl(ch.codePointAt(0) ?? 0)) continue;

		out += ch;
		if (out.length >= MAX_LABEL_LENGTH) break;
	}

	return out;
}

export function sanitizeOptionalLabel(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;

	const cleaned = sanitizeLabel(value);

	return cleaned.length > 0 ? cleaned : null;
}

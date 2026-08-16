// Everything we print lands in a terminal already carrying our own ANSI SGR
// codes. Any externally-sourced label (directory name, worktree, session name,
// agent name, output style, vim mode, model name) must therefore be stripped of
// control characters first: a directory named with a raw ESC could emit an OSC
// title-change, a CSI screen-clear, or a lone CR that hides the start of the
// line. Git itself rejects control characters in refnames, but nothing stops a
// cloned repository from containing such a directory.
const MAX_LABEL_LENGTH = 120;

function isControl(cp: number): boolean {
	return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);
}

export function sanitizeLabel(value: string): string {
	let out = "";
	for (const ch of value) {
		const cp = ch.codePointAt(0) ?? 0;
		if (isControl(cp)) continue;
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

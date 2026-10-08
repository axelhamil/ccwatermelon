import type { ColorName } from "../terminal/format";
import { color, formatDuration, formatTokens } from "../terminal/format";
import { sanitizeOptionalLabel } from "../terminal/sanitize";
import { truncateToWidth, visualWidth } from "../terminal/width";
import type { SubagentTask } from "./payload";

interface Glyph {
	mark: string;
	tone: ColorName;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_FRAME_MS = 1000;
const UNKNOWN_GLYPH: Glyph = { mark: "·", tone: "dim" };
const SETTLED_GLYPHS = new Map<string, Glyph>([
	["completed", { mark: "✓", tone: "green" }],
	["failed", { mark: "✗", tone: "red" }],
	["killed", { mark: "■", tone: "dim" }],
]);

const BRAILLE_BLANK = 0x2800;
const LEFT_BAR_DOTS = [0x00, 0x40, 0x44, 0x46, 0x47];
const RIGHT_BAR_DOTS = [0x00, 0x80, 0xa0, 0xb0, 0xb8];
const SPARK_TONES: readonly ColorName[] = ["dim", "teal", "green", "yellow", "mauve"];
const SPARK_TOP_LEVEL = 4;
const SPARK_SAMPLES = 16;

const GLYPH_WIDTH = 1;
const GLYPH_GAP = " ";
const COLUMN_GAP = "  ";
const MAX_IDENTITY_WIDTH = 18;
const MAX_MODEL_WIDTH = 12;
const MIN_DESCRIPTION_WIDTH = 12;

type ColumnId = "identity" | "model" | "tokens" | "spark" | "elapsed";

const RIGHT_ALIGNED: ReadonlySet<ColumnId> = new Set(["tokens", "spark", "elapsed"]);
const COLUMN_SETS: readonly (readonly ColumnId[])[] = [
	["identity", "model", "tokens", "spark", "elapsed"],
	["identity", "model", "tokens", "elapsed"],
	["identity", "model", "tokens"],
	["identity", "tokens"],
	["identity"],
];
const IDENTITY_ONLY: readonly ColumnId[] = ["identity"];

interface Cell {
	text: string;
	width: number;
}

interface Row {
	id: string;
	glyph: string;
	cells: Record<ColumnId, Cell>;
	description: string;
}

export interface SubagentRow {
	id: string;
	content: string;
}

function cell(plain: string, tone: ColorName): Cell {
	if (plain.length === 0) return { text: "", width: 0 };

	return { text: color(plain, tone), width: visualWidth(plain) };
}

function statusGlyph(status: string | undefined, nowMs: number): string {
	if (status === "running") {
		const frame = Math.floor(nowMs / SPINNER_FRAME_MS) % SPINNER_FRAMES.length;

		return color(SPINNER_FRAMES[frame] ?? UNKNOWN_GLYPH.mark, "pink");
	}

	const { mark, tone } = SETTLED_GLYPHS.get(status ?? "") ?? UNKNOWN_GLYPH;

	return color(mark, tone);
}

function shortModel(model: string): string {
	const bare = model
		.replace(/^.*claude-/, "")
		.replace(/\[.*\]$/, "")
		.replace(/-v\d+(:\d+)?$/, "")
		.replace(/-\d{8}$/, "");
	const parts = bare.split("-").filter((part) => part.length > 0);
	const isVersion = (part: string) => /^\d+$/.test(part);
	const family = parts.filter((part) => !isVersion(part)).join(" ");
	const version = parts.filter(isVersion).join(".");
	const short = [family, version].filter((part) => part.length > 0).join(" ");

	return truncateToWidth(short, MAX_MODEL_WIDTH);
}

function sparkLevels(samples: number[]): number[] {
	const low = Math.min(...samples);
	const span = Math.max(...samples) - low;
	if (span === 0) return samples.map(() => 1);

	return samples.map((sample) => 1 + Math.round(((sample - low) / span) * (SPARK_TOP_LEVEL - 1)));
}

function sparkline(samples: number[]): Cell {
	if (samples.length === 0) return { text: "", width: 0 };

	const levels = sparkLevels(samples.slice(-SPARK_SAMPLES));
	const padded = levels.length % 2 === 0 ? levels : [0, ...levels];
	let text = "";

	for (let i = 0; i < padded.length; i += 2) {
		const left = padded[i] ?? 0;
		const right = padded[i + 1] ?? 0;
		const dots = (LEFT_BAR_DOTS[left] ?? 0) | (RIGHT_BAR_DOTS[right] ?? 0);
		const tone = SPARK_TONES[Math.max(left, right)] ?? "dim";

		text += color(String.fromCodePoint(BRAILLE_BLANK + dots), tone);
	}

	return { text, width: padded.length / 2 };
}

function toRow(task: SubagentTask, identityCap: number, nowMs: number): Row | null {
	const label = sanitizeOptionalLabel(task.label) ?? sanitizeOptionalLabel(task.description);
	const named = sanitizeOptionalLabel(task.name) ?? sanitizeOptionalLabel(task.agentType);
	const identity = named ?? label;
	if (identity === null) return null;

	const model = sanitizeOptionalLabel(task.model);
	const tokens = task.tokenCount === undefined ? "" : formatTokens(task.tokenCount);
	const elapsed = task.startTime === undefined ? "" : formatDuration(nowMs - task.startTime);

	return {
		id: task.id,
		glyph: statusGlyph(task.status, nowMs),
		cells: {
			identity: cell(truncateToWidth(identity, identityCap), "text"),
			model: cell(model === null ? "" : shortModel(model), "peach"),
			tokens: cell(tokens, "subtext"),
			spark: sparkline(task.tokenSamples ?? []),
			elapsed: cell(elapsed, "subtext"),
		},
		description: named === null ? "" : (label ?? ""),
	};
}

function columnWidths(rows: Row[]): Record<ColumnId, number> {
	const widest = (id: ColumnId) => Math.max(...rows.map((row) => row.cells[id].width));

	return {
		identity: widest("identity"),
		model: widest("model"),
		tokens: widest("tokens"),
		spark: widest("spark"),
		elapsed: widest("elapsed"),
	};
}

function pad(content: Cell, width: number, alignRight: boolean): string {
	const gap = " ".repeat(width - content.width);

	return alignRight ? `${gap}${content.text}` : `${content.text}${gap}`;
}

export function renderSubagentRows(
	tasks: SubagentTask[],
	columns: number,
	nowMs: number,
): SubagentRow[] {
	const room = Math.max(GLYPH_WIDTH, Math.floor(columns));
	const identityCap = Math.min(MAX_IDENTITY_WIDTH, room - GLYPH_WIDTH - GLYPH_GAP.length);

	const rows = tasks.flatMap((task) => toRow(task, Math.max(1, identityCap), nowMs) ?? []);
	if (identityCap < 1) return rows.map((row) => ({ id: row.id, content: row.glyph }));
	if (rows.length === 0) return [];

	const widths = columnWidths(rows);
	const widthOf = (set: readonly ColumnId[]) => {
		const shown = set.filter((id) => widths[id] > 0);
		const cells = shown.reduce((sum, id) => sum + widths[id], 0);

		return GLYPH_WIDTH + GLYPH_GAP.length + cells + COLUMN_GAP.length * (shown.length - 1);
	};

	const fullSet = COLUMN_SETS[0] ?? IDENTITY_ONLY;
	const set = COLUMN_SETS.find((candidate) => widthOf(candidate) <= room) ?? IDENTITY_ONLY;
	const shown = set.filter((id) => widths[id] > 0);
	const descriptionRoom = room - widthOf(set) - COLUMN_GAP.length;
	const showsDescription = set === fullSet && descriptionRoom >= MIN_DESCRIPTION_WIDTH;

	return rows.map((row) => {
		const body = shown
			.map((id) => pad(row.cells[id], widths[id], RIGHT_ALIGNED.has(id)))
			.join(COLUMN_GAP);
		const description = showsDescription
			? cell(truncateToWidth(row.description, descriptionRoom), "dim").text
			: "";
		const content = [`${row.glyph}${GLYPH_GAP}${body}`, description]
			.filter((part) => part.length > 0)
			.join(COLUMN_GAP);

		return { id: row.id, content: content.trimEnd() };
	});
}

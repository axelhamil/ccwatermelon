import { loadUserConfig } from "./config/userConfig";
import type { SubagentPayload } from "./subagents/payload";
import { parseSubagentPayload } from "./subagents/payload";
import { renderSubagentRows } from "./subagents/row";
import { applyPaletteOverrides } from "./terminal/format";

const FALLBACK_COLUMNS = 80;
const WRONG_STDIN_HINT =
	"check that subagentStatusLine.command in settings.json runs src/subagents.ts, then update ccwatermelon if Claude Code changed its format";

async function readPayload(): Promise<SubagentPayload | null> {
	try {
		const payload = parseSubagentPayload(await Bun.stdin.json());
		if (payload) return payload;

		console.error(
			`ccwatermelon: stdin is JSON but not the object Claude Code sends to subagentStatusLine, ${WRONG_STDIN_HINT}`,
		);
	} catch (err) {
		console.error(
			`ccwatermelon: stdin is not the JSON Claude Code sends to subagentStatusLine (${err}), ${WRONG_STDIN_HINT}`,
		);
	}

	return null;
}

async function main(): Promise<void> {
	const payload = await readPayload();
	if (!payload) return;

	const { config, errors } = loadUserConfig(payload.cwd ?? process.cwd());
	for (const error of errors) console.error(`ccwatermelon: config ignored, ${error}`);
	applyPaletteOverrides(config.colors, config.theme);

	const rows = renderSubagentRows(payload.tasks, payload.columns ?? FALLBACK_COLUMNS, Date.now());
	for (const row of rows) console.log(JSON.stringify(row));
}

main().catch((err) => {
	console.error(
		`ccwatermelon: subagent rows could not be drawn, Claude Code keeps its default rows, report this with the message: ${err}`,
	);
});

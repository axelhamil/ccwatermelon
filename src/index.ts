import { basename } from "node:path";
import { loadUserConfig } from "./config/userConfig";
import { collectStatuslineData } from "./statusline/collect";
import type { Payload } from "./statusline/payload";
import { parsePayload } from "./statusline/payload";
import { render } from "./statusline/render";
import { sanitizeLabel } from "./terminal/sanitize";

async function readPayload(): Promise<Payload | null> {
	try {
		return parsePayload(await Bun.stdin.json());
	} catch (err) {
		console.error(`ccwatermelon: stdin could not be read as JSON: ${err}`);
		return null;
	}
}

function fallbackLine(cwd: string, payload: Payload): string {
	return sanitizeLabel(`${basename(cwd)}   ${payload.model?.display_name ?? "?"}`);
}

async function main(): Promise<void> {
	const payload = await readPayload();
	if (!payload) {
		console.log("ccwatermelon: stdin is not the Claude Code status line JSON, nothing to show");
		return;
	}

	const cwd = payload.workspace?.current_dir ?? process.cwd();

	try {
		const { config, errors } = loadUserConfig(cwd);
		for (const error of errors) console.error(`ccwatermelon: config ignored, ${error}`);

		console.log(render(await collectStatuslineData(payload, config, cwd), config.segments));
	} catch (err) {
		console.error(`ccwatermelon: full render failed, showing the fallback line: ${err}`);
		console.log(fallbackLine(cwd, payload));
	}
}

main();

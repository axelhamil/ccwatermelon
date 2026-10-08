import { basename } from "node:path";
import { CONFIG } from "./config";
import { collectStatuslineData } from "./lib/collect";
import { applyPaletteOverrides } from "./lib/format";
import { migrateLegacyPaths } from "./lib/migrate";
import type { Payload } from "./lib/payload";
import { parsePayload } from "./lib/payload";
import { render } from "./lib/render";
import { sanitizeLabel } from "./lib/sanitize";
import { loadUserConfig } from "./lib/userConfig";

async function readPayload(): Promise<Payload | null> {
	try {
		return parsePayload(await Bun.stdin.json());
	} catch (err) {
		console.error(`ccwatermelon: stdin could not be read as JSON: ${err}`);
		return null;
	}
}

function migrateLegacyData(): void {
	if (process.env.CCWATERMELON_DATA_DIR || process.env.CCWATERMELON_CACHE_DIR) return;

	migrateLegacyPaths(
		CONFIG.paths.legacy.flatMap((legacy) => [
			{ from: legacy.historyDb, to: CONFIG.paths.historyDb },
			{ from: legacy.limitsCache, to: CONFIG.paths.limitsCache },
		]),
	);
}

function fallbackLine(cwd: string, payload: Payload): string {
	return sanitizeLabel(`${basename(cwd)} · ${payload.model?.display_name ?? "?"}`);
}

async function main(): Promise<void> {
	const payload = await readPayload();
	if (!payload) {
		console.log("ccwatermelon: stdin is not the Claude Code status line JSON, nothing to show");
		return;
	}

	const cwd = payload.workspace?.current_dir ?? process.cwd();

	try {
		migrateLegacyData();

		const { config, errors } = loadUserConfig(cwd);
		for (const error of errors) console.error(`ccwatermelon: config ignored, ${error}`);
		applyPaletteOverrides(config.colors, config.theme);

		console.log(render(await collectStatuslineData(payload, config, cwd), config.segments));
	} catch (err) {
		console.error(`ccwatermelon: full render failed, showing the fallback line: ${err}`);
		console.log(fallbackLine(cwd, payload));
	}
}

main();

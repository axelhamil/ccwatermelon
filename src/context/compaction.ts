import { z } from "zod";
import { CONFIG } from "../config";
import { readJsonFile } from "./json";

const SettingsSchema = z.object({
	autoCompactEnabled: z.boolean().optional().catch(undefined),
	autoCompactWindow: z.number().positive().optional().catch(undefined),
});

export function compactThreshold(contextWindowSize: number, reserveRatio: number): number | null {
	const settings = readJsonFile(CONFIG.paths.settings, SettingsSchema, "Claude Code settings");
	if (settings?.autoCompactEnabled === false) return null;

	const ceiling = Math.round(contextWindowSize * reserveRatio);

	return settings?.autoCompactWindow ? Math.min(settings.autoCompactWindow, ceiling) : ceiling;
}

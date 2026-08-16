import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { ThemeName } from "./format";

const RgbTupleSchema = z.tuple([
	z.number().int().min(0).max(255),
	z.number().int().min(0).max(255),
	z.number().int().min(0).max(255),
]);

const SegmentConfigSchema = z
	.object({
		enabled: z.boolean().optional(),
		line: z.union([z.literal(1), z.literal(2)]).optional(),
		priority: z.number().finite().optional(),
	})
	.strict();

const ConfigFileSchema = z
	.object({
		theme: z.enum(["watermelon", "mocha"]).optional(),
		thresholds: z
			.object({
				compactAlert: z.number().min(0).max(100).optional(),
				fiveHourAlert: z.number().min(0).max(100).optional(),
				sevenDayAlert: z.number().min(0).max(100).optional(),
				compactionReserveRatio: z.number().min(0.1).max(1).optional(),
			})
			.strict()
			.partial()
			.optional(),
		colors: z.record(z.string(), RgbTupleSchema).optional(),
		segments: z.record(z.string(), SegmentConfigSchema).optional(),
	})
	.strict()
	.partial();

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

export interface ResolvedConfig {
	theme: ThemeName;
	thresholds: {
		compactAlert: number;
		fiveHourAlert: number;
		sevenDayAlert: number;
		compactionReserveRatio: number;
	};
	colors: Record<string, readonly [number, number, number]>;
	segments: Record<string, { enabled?: boolean; line?: 1 | 2; priority?: number }>;
}

export interface LoadResult {
	config: ResolvedConfig;
	sources: string[];
	errors: string[];
}

const DEFAULTS: ResolvedConfig = {
	theme: "watermelon",
	thresholds: {
		compactAlert: 85,
		fiveHourAlert: 90,
		sevenDayAlert: 80,
		compactionReserveRatio: 0.92,
	},
	colors: {},
	segments: {},
};

// Strips // line comments and /* */ block comments while leaving string
// contents (including "//" inside a string) untouched, so JSONC files parse
// with plain JSON.parse afterwards.
export function stripJsonComments(input: string): string {
	let out = "";
	let inString = false;
	let inLine = false;
	let inBlock = false;
	let escaped = false;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i] ?? "";
		const next = input[i + 1] ?? "";

		if (inLine) {
			if (ch === "\n") {
				inLine = false;
				out += ch;
			}
			continue;
		}
		if (inBlock) {
			if (ch === "*" && next === "/") {
				inBlock = false;
				i++;
			}
			continue;
		}
		if (inString) {
			out += ch;
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			continue;
		}
		if (ch === "/" && next === "/") {
			inLine = true;
			i++;
			continue;
		}
		if (ch === "/" && next === "*") {
			inBlock = true;
			i++;
			continue;
		}
		out += ch;
	}
	return out;
}

function readConfigFile(path: string): { data: ConfigFile | null; error: string | null } {
	if (!existsSync(path)) return { data: null, error: null };
	try {
		const raw = readFileSync(path, "utf-8");
		const stripped = stripJsonComments(raw);
		const json = JSON.parse(stripped);
		const parsed = ConfigFileSchema.safeParse(json);
		if (!parsed.success) {
			return {
				data: null,
				error: `${path}: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
			};
		}
		return { data: parsed.data, error: null };
	} catch (err) {
		return { data: null, error: `${path}: ${err instanceof Error ? err.message : String(err)}` };
	}
}

function mergeConfig(base: ResolvedConfig, override: ConfigFile): ResolvedConfig {
	return {
		theme: override.theme ?? base.theme,
		thresholds: { ...base.thresholds, ...override.thresholds },
		colors: { ...base.colors, ...override.colors },
		segments: { ...base.segments, ...override.segments },
	};
}

export function configSearchPaths(cwd: string): string[] {
	const paths: string[] = [];
	const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
	if (claudeConfigDir) {
		paths.push(join(claudeConfigDir, "ccwatermelon", "config.jsonc"));
	}
	paths.push(join(homedir(), ".config", "ccwatermelon", "config.jsonc"));
	paths.push(join(cwd, ".ccwatermelon.jsonc"));
	return paths;
}

export function loadUserConfig(cwd: string): LoadResult {
	let config = DEFAULTS;
	const sources: string[] = [];
	const errors: string[] = [];

	for (const path of configSearchPaths(cwd)) {
		const { data, error } = readConfigFile(path);
		if (error) errors.push(error);
		if (data) {
			config = mergeConfig(config, data);
			sources.push(path);
		}
	}

	return { config, sources, errors };
}

export function defaultConfig(): ResolvedConfig {
	return DEFAULTS;
}

export { ConfigFileSchema };

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { SegmentConfig } from "./segmentConfig";

const SegmentConfigSchema = z.object({
	enabled: z.boolean().optional(),
	priority: z.number().finite().optional(),
});

const ConfigFileSchema = z.object({
	thresholds: z
		.object({
			compactAlert: z.number().min(0).max(100).optional(),
			compactionReserveRatio: z.number().min(0.1).max(1).optional(),
		})
		.optional(),
	segments: z.record(z.string(), SegmentConfigSchema).optional(),
});

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

export interface ResolvedConfig {
	thresholds: {
		compactAlert: number;
		compactionReserveRatio: number;
	};
	segments: SegmentConfig;
}

export interface LoadResult {
	config: ResolvedConfig;
	errors: string[];
}

const DEFAULTS: ResolvedConfig = {
	thresholds: {
		compactAlert: 85,
		compactionReserveRatio: 0.92,
	},
	segments: {},
};

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

export function readConfigFile(path: string): { data: ConfigFile | null; error: string | null } {
	if (!existsSync(path)) return { data: null, error: null };

	try {
		const json = JSON.parse(stripJsonComments(readFileSync(path, "utf-8")));
		const parsed = ConfigFileSchema.safeParse(json);
		if (parsed.success) return { data: parsed.data, error: null };

		const issues = parsed.error.issues
			.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
			.join(", ");

		return { data: null, error: `${path} (${issues})` };
	} catch (err) {
		return { data: null, error: `${path} (${err instanceof Error ? err.message : String(err)})` };
	}
}

export function mergeConfig(base: ResolvedConfig, override: ConfigFile): ResolvedConfig {
	return {
		thresholds: { ...base.thresholds, ...override.thresholds },
		segments: { ...base.segments, ...override.segments },
	};
}

export function userConfigPath(): string {
	return join(homedir(), ".config", "ccwatermelon", "config.jsonc");
}

function configSearchPaths(cwd: string): string[] {
	const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
	const claudeScoped = claudeConfigDir
		? [join(claudeConfigDir, "ccwatermelon", "config.jsonc")]
		: [];

	return [...claudeScoped, userConfigPath(), join(cwd, ".ccwatermelon.jsonc")];
}

export function loadUserConfig(cwd: string, paths: string[] = configSearchPaths(cwd)): LoadResult {
	let config = DEFAULTS;
	const errors: string[] = [];

	for (const path of paths) {
		const { data, error } = readConfigFile(path);
		if (error) errors.push(error);
		if (data) config = mergeConfig(config, data);
	}

	return { config, errors };
}

export function defaultConfig(): ResolvedConfig {
	return DEFAULTS;
}

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { CONFIG } from "../config";
import type { UsageLimit } from "./types";

const API_URL = "https://api.anthropic.com/api/oauth/usage";
const CRED_PATH = join(homedir(), ".claude", ".credentials.json");

export interface UsageLimits {
	five_hour: UsageLimit | null;
	seven_day: UsageLimit | null;
}

interface CachedResponse {
	fetchedAt: number;
	data: UsageLimits;
}

function getToken(): string | null {
	try {
		const raw = readFileSync(CRED_PATH, "utf-8");
		return JSON.parse(raw)?.claudeAiOauth?.accessToken ?? null;
	} catch {
		return null;
	}
}

function readCache(): CachedResponse | null {
	try {
		const raw = readFileSync(CONFIG.paths.limitsCache, "utf-8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function writeCache(data: UsageLimits, now: number): void {
	mkdirSync(dirname(CONFIG.paths.limitsCache), { recursive: true });
	writeFileSync(
		CONFIG.paths.limitsCache,
		JSON.stringify({ fetchedAt: now, data }),
		"utf-8",
	);
}

export async function getUsageLimits(now: number = Math.floor(Date.now() / 1000)): Promise<UsageLimits> {
	const cached = readCache();
	if (cached && now - cached.fetchedAt < CONFIG.limits.cacheTtlSec) {
		return cached.data;
	}

	const token = getToken();
	if (!token) {
		const empty: UsageLimits = { five_hour: null, seven_day: null };
		return empty;
	}

	try {
		const response = await fetch(API_URL, {
			headers: {
				Authorization: `Bearer ${token}`,
				"anthropic-beta": "oauth-2025-04-20",
				"Content-Type": "application/json",
			},
			signal: AbortSignal.timeout(CONFIG.limits.fetchTimeoutMs),
		});
		if (!response.ok) {
			return cached?.data ?? { five_hour: null, seven_day: null };
		}
		const data = (await response.json()) as UsageLimits;
		const normalized: UsageLimits = {
			five_hour: data.five_hour
				? { utilization: Math.round(data.five_hour.utilization), resets_at: data.five_hour.resets_at }
				: null,
			seven_day: data.seven_day
				? { utilization: Math.round(data.seven_day.utilization), resets_at: data.seven_day.resets_at }
				: null,
		};
		writeCache(normalized, now);
		return normalized;
	} catch {
		return cached?.data ?? { five_hour: null, seven_day: null };
	}
}

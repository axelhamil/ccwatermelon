import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG } from "../config";
import type { HookInput, UsageLimit } from "./types";

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
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.error(`ccwatermelon: credentials unreadable — ${err}`);
		}
		return null;
	}
}

function readCache(): CachedResponse | null {
	try {
		const raw = readFileSync(CONFIG.paths.limitsCache, "utf-8");
		return JSON.parse(raw);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.error(`ccwatermelon: limits cache unreadable — ${err}`);
		}
		return null;
	}
}

function writeCache(data: UsageLimits, now: number): void {
	mkdirSync(dirname(CONFIG.paths.limitsCache), { recursive: true });
	writeFileSync(CONFIG.paths.limitsCache, JSON.stringify({ fetchedAt: now, data }), "utf-8");
}

function clampPct(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.round(Math.min(Math.max(value, 0), 100));
}

export function limitsFromPayload(rateLimits: HookInput["rate_limits"]): UsageLimits | null {
	const fh = rateLimits?.five_hour;
	const sd = rateLimits?.seven_day;
	if (fh?.used_percentage === undefined && sd?.used_percentage === undefined) return null;
	return {
		five_hour:
			fh?.used_percentage === undefined
				? null
				: { utilization: clampPct(fh.used_percentage), resets_at: fh.resets_at ?? null },
		seven_day:
			sd?.used_percentage === undefined
				? null
				: { utilization: clampPct(sd.used_percentage), resets_at: sd.resets_at ?? null },
	};
}

const EMPTY_LIMITS: UsageLimits = { five_hour: null, seven_day: null };

// The render path must never await the network: Claude Code kills the script
// when a new render is triggered mid-execution. So we serve whatever the cache
// holds — even stale — and hand the refresh to a detached process that will
// have warmed the cache by the next render.
export function limitsFromCache(now: number = Math.floor(Date.now() / 1000)): UsageLimits {
	const cached = readCache();
	if (cached && now - cached.fetchedAt < CONFIG.limits.cacheTtlSec) return cached.data;

	spawnRefresh();
	return cached?.data ?? EMPTY_LIMITS;
}

function spawnRefresh(): void {
	try {
		const proc = Bun.spawn([process.execPath, join(import.meta.dir, "..", "refresh-limits.ts")], {
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});
		proc.unref();
	} catch (err) {
		console.error(`ccwatermelon: limits refresh could not be spawned — ${err}`);
	}
}

export async function getUsageLimits(
	now: number = Math.floor(Date.now() / 1000),
): Promise<UsageLimits> {
	const cached = readCache();
	if (cached && now - cached.fetchedAt < CONFIG.limits.cacheTtlSec) {
		return cached.data;
	}

	const token = getToken();
	if (!token) {
		return EMPTY_LIMITS;
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
			five_hour:
				data.five_hour && Number.isFinite(data.five_hour.utilization)
					? {
							utilization: clampPct(data.five_hour.utilization),
							resets_at: data.five_hour.resets_at,
						}
					: null,
			seven_day:
				data.seven_day && Number.isFinite(data.seven_day.utilization)
					? {
							utilization: clampPct(data.seven_day.utilization),
							resets_at: data.seven_day.resets_at,
						}
					: null,
		};
		writeCache(normalized, now);
		return normalized;
	} catch (err) {
		console.error(`ccwatermelon: usage limits fetch failed — ${err}`);
		return cached?.data ?? { five_hour: null, seven_day: null };
	}
}

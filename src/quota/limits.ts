import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { CONFIG } from "../config/constants";
import { readJsonFile } from "../config/json";
import type { RateLimits, UsageLimit, UsageLimits } from "./rateLimits";

const API_URL = "https://api.anthropic.com/api/oauth/usage";
const EMPTY_LIMITS: UsageLimits = { five_hour: null, seven_day: null };

type ResetsAt = number | string | null | undefined;

function clampPct(value: number): number {
	return Math.round(Math.min(Math.max(value, 0), 100));
}

function toEpochSeconds(resetsAt: ResetsAt): number | null {
	if (typeof resetsAt === "number") return resetsAt;
	if (typeof resetsAt !== "string") return null;

	const ms = Date.parse(resetsAt);

	return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

const UsageWindowSchema = z
	.object({
		utilization: z.number(),
		resets_at: z.union([z.number(), z.string()]).nullish(),
	})
	.transform(
		(window): UsageLimit => ({
			utilization: clampPct(window.utilization),
			resets_at: toEpochSeconds(window.resets_at),
		}),
	)
	.nullish()
	.catch(null)
	.transform((window) => window ?? null);

const UsageLimitsSchema = z.object({ five_hour: UsageWindowSchema, seven_day: UsageWindowSchema });

const CachedLimitsSchema = z.object({ fetchedAt: z.number(), data: UsageLimitsSchema });

const CredentialsSchema = z.object({
	claudeAiOauth: z.object({ accessToken: z.string().min(1) }),
});

function readCache() {
	return readJsonFile(CONFIG.paths.limitsCache, CachedLimitsSchema, "limits cache");
}

function writeCache(data: UsageLimits, now: number): void {
	const target = CONFIG.paths.limitsCache;
	const draft = `${target}.${process.pid}.tmp`;

	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(draft, JSON.stringify({ fetchedAt: now, data }), "utf-8");
	renameSync(draft, target);
}

function windowFromPayload(window: NonNullable<RateLimits>["five_hour"]): UsageLimit | null {
	if (window?.used_percentage === undefined) return null;

	return {
		utilization: clampPct(window.used_percentage),
		resets_at: toEpochSeconds(window.resets_at),
	};
}

function limitsFromPayload(rateLimits: RateLimits): UsageLimits {
	return {
		five_hour: windowFromPayload(rateLimits?.five_hour),
		seven_day: windowFromPayload(rateLimits?.seven_day),
	};
}

function spawnRefresh(): void {
	try {
		const refreshScript = join(import.meta.dir, "..", "refresh-limits.ts");
		const proc = Bun.spawn([process.execPath, refreshScript], {
			stdin: "ignore",
			stdout: "ignore",
			stderr: Bun.file(CONFIG.paths.refreshLog),
		});
		proc.unref();
	} catch (err) {
		console.error(`ccwatermelon: the limits refresh process could not start: ${err}`);
	}
}

function claimRefresh(lastKnown: UsageLimits, now: number): boolean {
	try {
		writeCache(lastKnown, now);

		return true;
	} catch (err) {
		console.error(
			`ccwatermelon: the limits cache is not writable, quotas missing from the payload stay stale until ${CONFIG.paths.limitsCache} can be written: ${err}`,
		);

		return false;
	}
}

function resetIfExpired(window: UsageLimit | null, now: number): UsageLimit | null {
	const hasExpired = window !== null && window.resets_at !== null && window.resets_at <= now;

	return hasExpired ? { utilization: 0, resets_at: null } : window;
}

function limitsFromCache(now: number, refresh: () => void): UsageLimits {
	const cached = readCache();
	const lastKnown = cached?.data ?? EMPTY_LIMITS;
	const isFresh = cached !== null && now - cached.fetchedAt < CONFIG.limits.cacheTtlSec;
	if (isFresh) return lastKnown;

	if (claimRefresh(lastKnown, now)) refresh();

	return lastKnown;
}

export function resolveLimits(
	rateLimits: RateLimits,
	now: number,
	refresh: () => void = spawnRefresh,
): UsageLimits {
	const live = limitsFromPayload(rateLimits);
	const cached = live.five_hour && live.seven_day ? EMPTY_LIMITS : limitsFromCache(now, refresh);

	return {
		five_hour: resetIfExpired(live.five_hour ?? cached.five_hour, now),
		seven_day: resetIfExpired(live.seven_day ?? cached.seven_day, now),
	};
}

async function fetchLimits(): Promise<UsageLimits | null> {
	const credentials = readJsonFile(CONFIG.paths.credentials, CredentialsSchema, "credentials");
	if (!credentials) return null;

	const response = await fetch(API_URL, {
		headers: {
			Authorization: `Bearer ${credentials.claudeAiOauth.accessToken}`,
			"anthropic-beta": "oauth-2025-04-20",
			"Content-Type": "application/json",
		},
		signal: AbortSignal.timeout(CONFIG.limits.fetchTimeoutMs),
	});
	if (!response.ok) {
		console.error(`ccwatermelon: the usage API answered ${response.status}, keeping cached limits`);
		return null;
	}

	const parsed = UsageLimitsSchema.safeParse(await response.json());
	if (!parsed.success) {
		console.error(
			"ccwatermelon: the usage API answered an unexpected shape, keeping cached limits",
		);
		return null;
	}

	return parsed.data;
}

export async function refreshLimits(now: number = Math.floor(Date.now() / 1000)): Promise<void> {
	try {
		const limits = await fetchLimits();
		if (limits) writeCache(limits, now);
	} catch (err) {
		console.error(
			`ccwatermelon: the usage limits could not be refreshed, keeping the cache: ${err}`,
		);
	}
}

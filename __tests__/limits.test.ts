import { afterAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ccw-limits-"));
process.env.CCWATERMELON_CACHE_DIR = sandbox;
process.env.CLAUDE_CONFIG_DIR = sandbox;

const limits = await import("../src/lib/limits");

const refresh = mock();
const resolveLimits = (rateLimits: Parameters<typeof limits.resolveLimits>[0], at: number) =>
	limits.resolveLimits(rateLimits, at, refresh);

const now = 1_800_000_000;
const later = now + 3600;

function givenCache(content: unknown): void {
	writeFileSync(join(sandbox, "limits.json"), JSON.stringify(content), "utf-8");
}

function givenCachedLimits(utilization: number, resetsAt: number | string | null = later): void {
	givenCache({
		fetchedAt: now,
		data: {
			five_hour: { utilization, resets_at: resetsAt },
			seven_day: { utilization, resets_at: resetsAt },
		},
	});
}

afterAll(() => {
	rmSync(sandbox, { recursive: true, force: true });
});

describe("resolveLimits", () => {
	test("given a payload with both windows, then it wins over the cache and percentages are rounded", () => {
		givenCachedLimits(64);

		refresh.mockClear();

		const resolved = resolveLimits(
			{
				five_hour: { used_percentage: 20.4, resets_at: later },
				seven_day: { used_percentage: 80.6, resets_at: null },
			},
			now,
		);

		expect(resolved.five_hour).toEqual({ utilization: 20, resets_at: later });
		expect(resolved.seven_day).toEqual({ utilization: 81, resets_at: null });
		expect(refresh).not.toHaveBeenCalled();
	});

	test("given Claude Code dropped the weekly window from the payload, then the cached one fills in", () => {
		givenCachedLimits(64);

		const resolved = resolveLimits({ five_hour: { used_percentage: 12 } }, now);

		expect(resolved.five_hour?.utilization).toBe(12);
		expect(resolved.seven_day?.utilization).toBe(64);
	});

	test("given no payload limits and a stale cache, then the stale values are shown and a refresh starts", () => {
		givenCache({
			fetchedAt: now - 86_400,
			data: { five_hour: { utilization: 77, resets_at: later }, seven_day: null },
		});
		refresh.mockClear();

		expect(resolveLimits(undefined, now).five_hour?.utilization).toBe(77);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	test("given a cached window whose reset time has passed, then it reads as reset to zero", () => {
		givenCachedLimits(97, now - 60);

		expect(resolveLimits(undefined, now).seven_day).toEqual({ utilization: 0, resets_at: null });
	});

	test("given a cache holding ISO reset times, then they are read as epoch seconds", () => {
		givenCachedLimits(40, new Date(later * 1000).toISOString());

		expect(resolveLimits(undefined, now).five_hour?.resets_at).toBe(later);
	});

	test("given a corrupted cache, then limits are unknown instead of crashing the render", () => {
		givenCache({ fetchedAt: now });

		expect(resolveLimits(undefined, now)).toEqual({ five_hour: null, seven_day: null });
	});

	test("given no cache at all, then limits are unknown", () => {
		rmSync(join(sandbox, "limits.json"), { force: true });

		expect(resolveLimits(undefined, now)).toEqual({ five_hour: null, seven_day: null });
	});
});

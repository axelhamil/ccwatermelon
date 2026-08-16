import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cacheDir = mkdtempSync(join(tmpdir(), "ccsl-limits-"));
process.env.CCSTATUSLINE_CACHE_DIR = cacheDir;

const { limitsFromCache, limitsFromPayload } = await import("../src/lib/limits");

function writeCache(fetchedAt: number, utilization: number): void {
	writeFileSync(
		join(cacheDir, "limits.json"),
		JSON.stringify({
			fetchedAt,
			data: {
				five_hour: { utilization, resets_at: null },
				seven_day: { utilization, resets_at: null },
			},
		}),
		"utf-8",
	);
}

describe("limitsFromPayload", () => {
	test("returns null when the hook payload carries no rate limits", () => {
		expect(limitsFromPayload(undefined)).toBeNull();
		expect(limitsFromPayload({})).toBeNull();
	});

	test("rounds percentages and keeps the reset timestamp", () => {
		const out = limitsFromPayload({
			five_hour: { used_percentage: 20.4, resets_at: 1234 },
			seven_day: { used_percentage: 80.6, resets_at: null },
		});
		expect(out?.five_hour).toEqual({ utilization: 20, resets_at: 1234 });
		expect(out?.seven_day).toEqual({ utilization: 81, resets_at: null });
	});

	test("keeps a window that is present even when the other is missing", () => {
		const out = limitsFromPayload({ five_hour: { used_percentage: 12 } });
		expect(out?.five_hour?.utilization).toBe(12);
		expect(out?.seven_day).toBeNull();
	});
});

describe("limitsFromCache", () => {
	test("serves a fresh cache without touching the network", () => {
		const now = Math.floor(Date.now() / 1000);
		writeCache(now, 42);
		const out = limitsFromCache(now);
		expect(out.five_hour?.utilization).toBe(42);
	});

	test("still serves a stale cache rather than blocking on a refresh", () => {
		const now = Math.floor(Date.now() / 1000);
		writeCache(now - 86400, 77);
		const out = limitsFromCache(now);
		expect(out.five_hour?.utilization).toBe(77);
	});

	test("returns empty limits when no cache exists at all", () => {
		rmSync(join(cacheDir, "limits.json"), { force: true });
		const out = limitsFromCache(Math.floor(Date.now() / 1000));
		expect(out.five_hour).toBeNull();
		expect(out.seven_day).toBeNull();
	});
});

afterAll(() => {
	rmSync(cacheDir, { recursive: true, force: true });
});

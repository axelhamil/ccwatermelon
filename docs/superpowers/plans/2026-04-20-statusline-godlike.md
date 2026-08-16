# Statusline Godlike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom dashboard-style statusline for Claude Code (Bun/TS) that shows axolotl pet moods, semantic 🔥🌊⚡ separators, 8-min sparklines, ETA forecast, burn rate, and auto-expand to 3 lines on alert — per validated spec at `~/.claude/scripts/statusline-godlike/SPEC.md`.

**Architecture:** Pure functional core (mood/sparkline/forecast/burn/render as pure fns) + thin I/O layer (git/sqlite/http/tmux). Entry point orchestrates: read stdin JSON → record sample → read 8min series → classify mood → compute derived metrics → render → stdout. Fail-safe: any exception → fallback minimal output.

**Tech Stack:** Bun runtime, TypeScript strict, `bun:sqlite` for history DB, `bun:test`, Biome for lint/format, Claude OAuth API for rate limits.

---

## File Structure

```
~/.claude/scripts/statusline-godlike/
├── SPEC.md                          # existing, validated
├── docs/superpowers/plans/
│   └── 2026-04-20-statusline-godlike.md  # this file
├── .gitignore
├── package.json
├── tsconfig.json
├── biome.json
├── README.md
├── src/
│   ├── index.ts                     # entry: stdin → render → stdout
│   ├── config.ts                    # thresholds, color palette, paths
│   └── lib/
│       ├── types.ts                 # HookInput, StatuslineData, Mood
│       ├── format.ts                # ANSI colors + number/time formatters
│       ├── sparkline.ts             # number[] → unicode blocks string
│       ├── mood.ts                  # metrics → Mood classification
│       ├── burn.ts                  # samples → $/hour rate
│       ├── forecast.ts              # linear regression → ETA minutes
│       ├── history.ts               # SQLite CRUD for samples
│       ├── sessions.ts              # tmux-active sessions count
│       ├── git.ts                   # branch + dirty + insertions
│       ├── limits.ts                # Claude OAuth API (60s cached)
│       └── render.ts                # pure StatuslineData → string[]
├── __tests__/
│   ├── format.test.ts
│   ├── sparkline.test.ts
│   ├── mood.test.ts
│   ├── burn.test.ts
│   ├── forecast.test.ts
│   ├── history.test.ts
│   ├── sessions.test.ts
│   ├── render.test.ts
│   └── integration.test.ts          # all fixtures → expected output
└── fixtures/
    ├── normal.json
    ├── alert-context.json
    ├── alert-5h.json
    └── celebration.json
```

---

## Task 0: Project scaffold

**Files:**
- Create: `~/.claude/scripts/statusline-godlike/package.json`
- Create: `~/.claude/scripts/statusline-godlike/tsconfig.json`
- Create: `~/.claude/scripts/statusline-godlike/biome.json`
- Create: `~/.claude/scripts/statusline-godlike/.gitignore`
- Create: `~/.claude/scripts/statusline-godlike/README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "statusline-godlike",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/bun": "latest",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "lib": ["ESNext"],
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src/**/*", "__tests__/**/*"]
}
```

- [ ] **Step 3: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "formatter": { "enabled": true, "indentStyle": "tab", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
*.log
.DS_Store
data/
*.tmp
```

- [ ] **Step 5: Create `README.md`**

```markdown
# Statusline Godlike

Custom Claude Code statusline — dashboard with axolotl mood, sparklines, ETA forecast.

See `SPEC.md` for design, `docs/superpowers/plans/` for implementation plan.

## Install

```bash
bun install
```

## Use

Update `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bun ~/.claude/scripts/statusline-godlike/src/index.ts",
    "padding": 0
  }
}
```

## Test

```bash
bun test
bun run start < fixtures/normal.json
```
```

- [ ] **Step 6: Initialize git + first commit**

```bash
cd ~/.claude/scripts/statusline-godlike
git init
bun install
git add .
git commit -m "feat: scaffold statusline-godlike project"
```

Run: `ls -la` — should see `package.json`, `tsconfig.json`, `biome.json`, `.gitignore`, `README.md`, `node_modules/`, `.git/`, `bun.lock`.

---

## Task 1: Types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```ts
export type MoodKind = "rose" | "zen" | "focus" | "stressed" | "panic";

export interface Mood {
	kind: MoodKind;
	face: string;
	label: string | null;
	color: string;
	pulseFast: boolean;
}

export interface UsageLimit {
	utilization: number;
	resets_at: string | null;
}

export interface HookInput {
	session_id: string;
	workspace: { current_dir: string };
	model: { display_name: string };
	cost: {
		total_cost_usd: number;
		total_duration_ms: number;
		total_api_duration_ms?: number;
		total_lines_added?: number;
		total_lines_removed?: number;
	};
	context_window?: {
		current_usage?: {
			input_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
		};
		used_percentage?: number;
		context_window_size?: number;
	};
}

export interface GitStatus {
	branch: string;
	dirty: boolean;
	insertions: number;
	deletions: number;
}

export interface Sample {
	metric: string;
	sampled_at: number;
	value: number;
}

export interface StatuslineData {
	mood: Mood;
	git: GitStatus;
	modelName: string;
	dirName: string;
	activeSessions: number;

	sessionCost: number;
	sessionDurationMs: number;
	todayCost: number;
	weekCost: number;

	contextPct: number | null;
	contextTokens: number | null;
	contextSeries: number[];

	fiveHourPct: number | null;
	fiveHourResetsAt: string | null;
	fiveHourSeries: number[];

	tokensPerSec: number | null;
	tokensPerSecSeries: number[];
	cacheHitPct: number | null;

	burnRatePerHr: number | null;
	etaMinutes: number | null;
	etaCooling: boolean;

	alertMode: boolean;
	celebrationMode: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: define core types"
```

---

## Task 2: Format (ANSI colors + number/time formatters)

**Files:**
- Create: `src/lib/format.ts`
- Test: `__tests__/format.test.ts`

- [ ] **Step 1: Write failing test `__tests__/format.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { formatCost, formatDuration, formatTokens, formatPct, color } from "../src/lib/format";

describe("formatCost", () => {
	test("under $10 shows 2 decimals", () => {
		expect(formatCost(3.421)).toBe("$3.42");
	});
	test("over $10 shows 1 decimal", () => {
		expect(formatCost(12.8)).toBe("$12.8");
	});
	test("zero", () => {
		expect(formatCost(0)).toBe("$0.00");
	});
});

describe("formatDuration", () => {
	test("under 1 min", () => {
		expect(formatDuration(45_000)).toBe("45s");
	});
	test("minutes only", () => {
		expect(formatDuration(18 * 60_000)).toBe("18m");
	});
	test("hours + minutes", () => {
		expect(formatDuration(2 * 3_600_000 + 15 * 60_000)).toBe("2h15m");
	});
});

describe("formatTokens", () => {
	test("under 1k", () => {
		expect(formatTokens(523)).toBe("523");
	});
	test("thousands", () => {
		expect(formatTokens(142_000)).toBe("142k");
	});
	test("millions", () => {
		expect(formatTokens(1_500_000)).toBe("1.5M");
	});
});

describe("formatPct", () => {
	test("rounds", () => {
		expect(formatPct(71.4)).toBe("71%");
		expect(formatPct(71.6)).toBe("72%");
	});
});

describe("color", () => {
	test("wraps with ANSI escape", () => {
		const result = color("hello", "red");
		expect(result.startsWith("\x1b[38;2;")).toBe(true);
		expect(result.endsWith("\x1b[0m")).toBe(true);
		expect(result).toContain("hello");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/format.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `src/lib/format.ts`**

```ts
export const PALETTE = {
	text: [205, 214, 244],
	subtext: [166, 173, 200],
	dim: [108, 112, 134],
	red: [243, 139, 168],
	peach: [250, 179, 135],
	yellow: [249, 226, 175],
	green: [166, 227, 161],
	teal: [148, 226, 213],
	sky: [137, 220, 235],
	blue: [137, 180, 250],
	lavender: [180, 190, 254],
	mauve: [203, 166, 247],
	pink: [245, 194, 231],
} as const;

export type ColorName = keyof typeof PALETTE;

export function color(text: string, name: ColorName): string {
	const [r, g, b] = PALETTE[name];
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

export function formatCost(usd: number): string {
	if (usd === 0) return "$0.00";
	if (usd < 10) return `$${usd.toFixed(2)}`;
	return `$${usd.toFixed(1)}`;
}

export function formatDuration(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
	if (m > 0) return `${m}m`;
	return `${s}s`;
}

export function formatTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatPct(n: number): string {
	return `${Math.round(n)}%`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/format.test.ts`
Expected: 11 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts __tests__/format.test.ts
git commit -m "feat: add format utilities (ANSI color, cost, duration, tokens, pct)"
```

---

## Task 3: Sparkline

**Files:**
- Create: `src/lib/sparkline.ts`
- Test: `__tests__/sparkline.test.ts`

- [ ] **Step 1: Write failing test `__tests__/sparkline.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { sparkline } from "../src/lib/sparkline";

describe("sparkline", () => {
	test("empty array returns empty string", () => {
		expect(sparkline([])).toBe("");
	});

	test("single value uses middle char", () => {
		expect(sparkline([50])).toBe("▄");
	});

	test("monotonic ascending uses full scale", () => {
		const result = sparkline([0, 14, 28, 42, 57, 71, 85, 100]);
		expect(result).toBe("▁▂▃▄▅▆▇█");
	});

	test("constant series renders flat middle", () => {
		expect(sparkline([50, 50, 50, 50])).toBe("▄▄▄▄");
	});

	test("respects explicit min/max", () => {
		const result = sparkline([0, 100], { min: 0, max: 100 });
		expect(result).toBe("▁█");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/sparkline.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/sparkline.ts`**

```ts
const CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export interface SparklineOpts {
	min?: number;
	max?: number;
}

export function sparkline(values: number[], opts: SparklineOpts = {}): string {
	if (values.length === 0) return "";
	const min = opts.min ?? Math.min(...values);
	const max = opts.max ?? Math.max(...values);
	const range = max - min;
	return values
		.map((v) => {
			if (range === 0) return CHARS[3];
			const normalized = (v - min) / range;
			const idx = Math.min(7, Math.max(0, Math.round(normalized * 7)));
			return CHARS[idx];
		})
		.join("");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test __tests__/sparkline.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sparkline.ts __tests__/sparkline.test.ts
git commit -m "feat: add sparkline renderer"
```

---

## Task 4: Mood classification

**Files:**
- Create: `src/lib/mood.ts`
- Test: `__tests__/mood.test.ts`

- [ ] **Step 1: Write failing test `__tests__/mood.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { classifyMood } from "../src/lib/mood";

describe("classifyMood", () => {
	test("all safe → rose", () => {
		const m = classifyMood({ contextPct: 10, sessionCost: 0.5, fiveHourPct: 5 });
		expect(m.kind).toBe("rose");
		expect(m.face).toBe("(◕‿◕)♡");
	});

	test("normal values → zen", () => {
		const m = classifyMood({ contextPct: 40, sessionCost: 2, fiveHourPct: 30 });
		expect(m.kind).toBe("zen");
		expect(m.face).toBe("(=ᴥ=)~");
	});

	test("context 75 → focus", () => {
		const m = classifyMood({ contextPct: 75, sessionCost: 2, fiveHourPct: 30 });
		expect(m.kind).toBe("focus");
	});

	test("cost 6 → focus", () => {
		const m = classifyMood({ contextPct: 40, sessionCost: 6, fiveHourPct: 30 });
		expect(m.kind).toBe("focus");
	});

	test("context 87 → stressed", () => {
		const m = classifyMood({ contextPct: 87, sessionCost: 2, fiveHourPct: 30 });
		expect(m.kind).toBe("stressed");
		expect(m.label).toBe("stressed");
	});

	test("5h 91 → stressed", () => {
		const m = classifyMood({ contextPct: 40, sessionCost: 2, fiveHourPct: 91 });
		expect(m.kind).toBe("stressed");
	});

	test("context 96 → panic", () => {
		const m = classifyMood({ contextPct: 96, sessionCost: 2, fiveHourPct: 30 });
		expect(m.kind).toBe("panic");
		expect(m.label).toBe("PANIC");
		expect(m.pulseFast).toBe(true);
	});

	test("null inputs treated as 0", () => {
		const m = classifyMood({ contextPct: null, sessionCost: 0, fiveHourPct: null });
		expect(m.kind).toBe("rose");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/mood.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/mood.ts`**

```ts
import type { Mood } from "./types";

export interface MoodInput {
	contextPct: number | null;
	sessionCost: number;
	fiveHourPct: number | null;
}

export function classifyMood(input: MoodInput): Mood {
	const ctx = input.contextPct ?? 0;
	const cost = input.sessionCost;
	const fh = input.fiveHourPct ?? 0;

	if (ctx > 95 || fh > 97) {
		return { kind: "panic", face: "(˵=͟͟͞╯°□°)╯", label: "PANIC", color: "red", pulseFast: true };
	}
	if (ctx > 85 || fh > 90) {
		return { kind: "stressed", face: "(◉_◉)⚠", label: "stressed", color: "red", pulseFast: false };
	}
	if (ctx > 70 || cost > 5 || fh > 70) {
		return { kind: "focus", face: "(•‿•)", label: "focus", color: "yellow", pulseFast: false };
	}
	if (ctx < 30 && cost < 1 && fh < 10) {
		return { kind: "rose", face: "(◕‿◕)♡", label: null, color: "pink", pulseFast: false };
	}
	return { kind: "zen", face: "(=ᴥ=)~", label: null, color: "teal", pulseFast: false };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test __tests__/mood.test.ts`
Expected: 8 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mood.ts __tests__/mood.test.ts
git commit -m "feat: add mood classification (rose/zen/focus/stressed/panic)"
```

---

## Task 5: Burn rate

**Files:**
- Create: `src/lib/burn.ts`
- Test: `__tests__/burn.test.ts`

- [ ] **Step 1: Write failing test `__tests__/burn.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { burnRate } from "../src/lib/burn";

describe("burnRate", () => {
	test("returns null if fewer than 2 samples", () => {
		expect(burnRate([])).toBeNull();
		expect(burnRate([{ sampled_at: 0, value: 1 }])).toBeNull();
	});

	test("returns null if samples span < 1 min", () => {
		expect(
			burnRate([
				{ sampled_at: 100, value: 1 },
				{ sampled_at: 150, value: 2 },
			]),
		).toBeNull();
	});

	test("computes $/hr from 10-min diff", () => {
		const now = 1_000_000;
		const result = burnRate([
			{ sampled_at: now - 600, value: 1.0 },
			{ sampled_at: now, value: 3.0 },
		]);
		expect(result).toBeCloseTo(12, 0);
	});

	test("clamps negative (cost can only go up)", () => {
		const now = 1_000_000;
		const result = burnRate([
			{ sampled_at: now - 600, value: 5.0 },
			{ sampled_at: now, value: 3.0 },
		]);
		expect(result).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/burn.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/burn.ts`**

```ts
import type { Sample } from "./types";

export function burnRate(samples: Sample[]): number | null {
	if (samples.length < 2) return null;
	const sorted = [...samples].sort((a, b) => a.sampled_at - b.sampled_at);
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	if (!first || !last) return null;
	const spanSec = last.sampled_at - first.sampled_at;
	if (spanSec < 60) return null;
	const deltaCost = Math.max(0, last.value - first.value);
	return (deltaCost / spanSec) * 3600;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test __tests__/burn.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/burn.ts __tests__/burn.test.ts
git commit -m "feat: add burn rate (\$/hr) computation"
```

---

## Task 6: Forecast (ETA rate limit)

**Files:**
- Create: `src/lib/forecast.ts`
- Test: `__tests__/forecast.test.ts`

- [ ] **Step 1: Write failing test `__tests__/forecast.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { forecastEta } from "../src/lib/forecast";

describe("forecastEta", () => {
	test("needs 3+ points", () => {
		expect(forecastEta([50], 100)).toEqual({ minutes: null, cooling: false });
		expect(forecastEta([50, 60], 100)).toEqual({ minutes: null, cooling: false });
	});

	test("constant series → null minutes, not cooling", () => {
		const r = forecastEta([50, 50, 50, 50, 50, 50, 50, 50], 100);
		expect(r.minutes).toBeNull();
		expect(r.cooling).toBe(false);
	});

	test("ascending → minutes to 100", () => {
		// +5%/min → reaches 100 in 10 min from 50
		const r = forecastEta([50, 55, 60, 65, 70, 75, 80, 85], 100);
		expect(r.minutes).toBeGreaterThan(2);
		expect(r.minutes).toBeLessThan(4);
		expect(r.cooling).toBe(false);
	});

	test("descending → null minutes, cooling=true", () => {
		const r = forecastEta([80, 70, 60, 50, 40, 30, 20, 10], 100);
		expect(r.minutes).toBeNull();
		expect(r.cooling).toBe(true);
	});

	test("already over target → 0 minutes", () => {
		const r = forecastEta([90, 95, 100, 102, 104, 106, 108, 110], 100);
		expect(r.minutes).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/forecast.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/forecast.ts`**

```ts
export interface EtaResult {
	minutes: number | null;
	cooling: boolean;
}

export function forecastEta(series: number[], target: number): EtaResult {
	if (series.length < 3) return { minutes: null, cooling: false };

	const n = series.length;
	const xs = Array.from({ length: n }, (_, i) => i);
	const xMean = xs.reduce((a, b) => a + b, 0) / n;
	const yMean = series.reduce((a, b) => a + b, 0) / n;
	let num = 0;
	let den = 0;
	for (let i = 0; i < n; i++) {
		const x = xs[i];
		const y = series[i];
		if (x === undefined || y === undefined) continue;
		num += (x - xMean) * (y - yMean);
		den += (x - xMean) ** 2;
	}
	const slope = den === 0 ? 0 : num / den;

	if (slope <= 0) {
		return { minutes: null, cooling: slope < 0 };
	}

	const last = series[n - 1];
	if (last === undefined) return { minutes: null, cooling: false };

	if (last >= target) return { minutes: 0, cooling: false };

	const stepsToTarget = (target - last) / slope;
	return { minutes: Math.round(stepsToTarget), cooling: false };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test __tests__/forecast.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast.ts __tests__/forecast.test.ts
git commit -m "feat: add ETA forecast via linear regression"
```

---

## Task 7: History DB (SQLite)

**Files:**
- Create: `src/config.ts`
- Create: `src/lib/history.ts`
- Test: `__tests__/history.test.ts`

- [ ] **Step 1: Create `src/config.ts`**

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG = {
	paths: {
		historyDb: join(homedir(), ".local/share/statusline-godlike/history.db"),
		sessionsJson: join(homedir(), ".local/share/statusline-godlike/sessions.json"),
		limitsCache: join(homedir(), ".cache/statusline-godlike/limits.json"),
	},
	history: {
		retentionMinutes: 30,
		windowMinutes: 8,
	},
	thresholds: {
		contextAlert: 85,
		fiveHourAlert: 90,
	},
	limits: {
		cacheTtlSec: 60,
		fetchTimeoutMs: 3000,
	},
} as const;
```

- [ ] **Step 2: Write failing test `__tests__/history.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { History } from "../src/lib/history";

let dir: string;
let h: History;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "sl-hist-"));
	h = new History(join(dir, "test.db"));
});

afterEach(() => {
	h.close();
	rmSync(dir, { recursive: true, force: true });
});

describe("History", () => {
	test("record + getSeries recent", () => {
		const now = Math.floor(Date.now() / 1000);
		h.record("ctx_pct", 50, now - 120);
		h.record("ctx_pct", 55, now - 60);
		h.record("ctx_pct", 60, now);
		const series = h.getSeries("ctx_pct", 8, now);
		expect(series.length).toBe(3);
		expect(series[2]).toBe(60);
	});

	test("getSeries filters by metric", () => {
		const now = Math.floor(Date.now() / 1000);
		h.record("ctx_pct", 50, now);
		h.record("cost", 2.0, now);
		expect(h.getSeries("ctx_pct", 8, now)).toEqual([50]);
		expect(h.getSeries("cost", 8, now)).toEqual([2.0]);
	});

	test("prune removes rows older than retention", () => {
		const now = Math.floor(Date.now() / 1000);
		h.record("ctx_pct", 10, now - 3600);
		h.record("ctx_pct", 20, now);
		h.prune(30, now);
		expect(h.getSeries("ctx_pct", 60, now)).toEqual([20]);
	});

	test("upsert same metric+timestamp", () => {
		const now = Math.floor(Date.now() / 1000);
		h.record("ctx_pct", 50, now);
		h.record("ctx_pct", 60, now);
		expect(h.getSeries("ctx_pct", 8, now)).toEqual([60]);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test __tests__/history.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement `src/lib/history.ts`**

```ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class History {
	private db: Database;

	constructor(path: string) {
		mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS samples (
				metric TEXT NOT NULL,
				sampled_at INTEGER NOT NULL,
				value REAL NOT NULL,
				PRIMARY KEY (metric, sampled_at)
			);
			CREATE INDEX IF NOT EXISTS samples_recent ON samples(metric, sampled_at DESC);
		`);
	}

	record(metric: string, value: number, sampledAt: number): void {
		this.db
			.query("INSERT INTO samples VALUES (?, ?, ?) ON CONFLICT(metric, sampled_at) DO UPDATE SET value = excluded.value")
			.run(metric, sampledAt, value);
	}

	getSeries(metric: string, windowMinutes: number, now: number): number[] {
		const since = now - windowMinutes * 60;
		const rows = this.db
			.query("SELECT value FROM samples WHERE metric = ? AND sampled_at >= ? ORDER BY sampled_at ASC")
			.all(metric, since) as { value: number }[];
		return rows.map((r) => r.value);
	}

	prune(retentionMinutes: number, now: number): void {
		const cutoff = now - retentionMinutes * 60;
		this.db.query("DELETE FROM samples WHERE sampled_at < ?").run(cutoff);
	}

	close(): void {
		this.db.close();
	}
}
```

- [ ] **Step 5: Run tests**

Run: `bun test __tests__/history.test.ts`
Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/lib/history.ts __tests__/history.test.ts
git commit -m "feat: add SQLite history DB for sparkline samples"
```

---

## Task 8: Sessions tracker

**Files:**
- Create: `src/lib/sessions.ts`
- Test: `__tests__/sessions.test.ts`

- [ ] **Step 1: Write failing test `__tests__/sessions.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionsStore } from "../src/lib/sessions";

let dir: string;
let path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "sl-sess-"));
	path = join(dir, "sessions.json");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("SessionsStore", () => {
	test("empty file → 0 active", () => {
		const s = new SessionsStore(path);
		expect(s.countActive(5, Date.now())).toBe(0);
	});

	test("record then count fresh", () => {
		const s = new SessionsStore(path);
		const now = Date.now();
		s.record("s1", "/tmp/p1", now);
		expect(s.countActive(5, now)).toBe(1);
	});

	test("stale sessions excluded", () => {
		const s = new SessionsStore(path);
		const now = Date.now();
		s.record("s1", "/tmp/p1", now - 10 * 60_000);
		s.record("s2", "/tmp/p2", now);
		expect(s.countActive(5, now)).toBe(1);
	});

	test("same session_id+cwd updates last_seen", () => {
		const s = new SessionsStore(path);
		const now = Date.now();
		s.record("s1", "/tmp/p1", now - 60_000);
		s.record("s1", "/tmp/p1", now);
		expect(s.countActive(5, now)).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/sessions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/sessions.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface SessionEntry {
	session_id: string;
	cwd: string;
	last_seen: number;
}

export class SessionsStore {
	constructor(private path: string) {
		mkdirSync(dirname(path), { recursive: true });
	}

	private load(): SessionEntry[] {
		try {
			const raw = readFileSync(this.path, "utf-8");
			return JSON.parse(raw);
		} catch {
			return [];
		}
	}

	private save(entries: SessionEntry[]): void {
		writeFileSync(this.path, JSON.stringify(entries), "utf-8");
	}

	record(sessionId: string, cwd: string, now: number): void {
		const entries = this.load();
		const key = `${sessionId}|${cwd}`;
		const existing = entries.findIndex((e) => `${e.session_id}|${e.cwd}` === key);
		const entry: SessionEntry = { session_id: sessionId, cwd, last_seen: now };
		if (existing >= 0) entries[existing] = entry;
		else entries.push(entry);
		this.save(entries);
	}

	countActive(staleMinutes: number, now: number): number {
		const cutoff = now - staleMinutes * 60_000;
		return this.load().filter((e) => e.last_seen >= cutoff).length;
	}
}
```

- [ ] **Step 4: Run tests**

Run: `bun test __tests__/sessions.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessions.ts __tests__/sessions.test.ts
git commit -m "feat: add sessions store (per session_id+cwd)"
```

---

## Task 9: Git status

**Files:**
- Create: `src/lib/git.ts`

- [ ] **Step 1: Implement `src/lib/git.ts`** (no unit test — wraps shell-out, tested via integration)

```ts
import { $ } from "bun";
import type { GitStatus } from "./types";

export async function getGitStatus(cwd: string): Promise<GitStatus | null> {
	try {
		const branchResult = await $`git -C ${cwd} rev-parse --abbrev-ref HEAD`.quiet().nothrow();
		if (branchResult.exitCode !== 0) return null;
		const branch = branchResult.stdout.toString().trim();

		const statusResult = await $`git -C ${cwd} status --porcelain`.quiet().nothrow();
		const dirty = statusResult.stdout.toString().trim().length > 0;

		const diffResult = await $`git -C ${cwd} diff HEAD --shortstat`.quiet().nothrow();
		const diffText = diffResult.stdout.toString();
		const insMatch = diffText.match(/(\d+) insertion/);
		const delMatch = diffText.match(/(\d+) deletion/);
		const insertions = insMatch?.[1] ? Number.parseInt(insMatch[1], 10) : 0;
		const deletions = delMatch?.[1] ? Number.parseInt(delMatch[1], 10) : 0;

		return { branch, dirty, insertions, deletions };
	} catch {
		return null;
	}
}
```

- [ ] **Step 2: Smoke test via shell**

Run: `bun -e "import('./src/lib/git.ts').then(m => m.getGitStatus(process.cwd())).then(console.log)"`
Expected: JSON object with `branch`, `dirty`, `insertions`, `deletions`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/git.ts
git commit -m "feat: add git status (branch, dirty, insertions)"
```

---

## Task 10: Usage limits (Claude OAuth API, cached 60s)

**Files:**
- Create: `src/lib/limits.ts`

- [ ] **Step 1: Implement `src/lib/limits.ts`**

```ts
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
```

- [ ] **Step 2: Smoke test**

Run: `bun -e "import('./src/lib/limits.ts').then(m => m.getUsageLimits()).then(console.log)"`
Expected: Object with `five_hour`/`seven_day` keys (may be null if not authenticated, OK).

- [ ] **Step 3: Commit**

```bash
git add src/lib/limits.ts
git commit -m "feat: add usage limits fetcher with 60s cache"
```

---

## Task 11: Render (pure function)

**Files:**
- Create: `src/lib/render.ts`
- Test: `__tests__/render.test.ts`

- [ ] **Step 1: Write failing test `__tests__/render.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { render } from "../src/lib/render";
import type { StatuslineData } from "../src/lib/types";

const base: StatuslineData = {
	mood: { kind: "zen", face: "(=ᴥ=)~", label: null, color: "teal", pulseFast: false },
	git: { branch: "main", dirty: false, insertions: 0, deletions: 0 },
	modelName: "Opus 4.7",
	dirName: "acme-web",
	activeSessions: 1,
	sessionCost: 1.23,
	sessionDurationMs: 300_000,
	todayCost: 5.0,
	weekCost: 20.0,
	contextPct: 40,
	contextTokens: 80_000,
	contextSeries: [30, 32, 35, 38, 40, 40, 40, 40],
	fiveHourPct: 20,
	fiveHourResetsAt: null,
	fiveHourSeries: [15, 16, 17, 18, 19, 20, 20, 20],
	tokensPerSec: 300,
	tokensPerSecSeries: [280, 290, 300, 310, 300, 300, 300, 300],
	cacheHitPct: 85,
	burnRatePerHr: null,
	etaMinutes: null,
	etaCooling: false,
	alertMode: false,
	celebrationMode: false,
};

describe("render", () => {
	test("normal state produces 2 lines", () => {
		const out = render(base);
		const lines = out.split("\n").filter(Boolean);
		expect(lines.length).toBe(2);
	});

	test("alert state produces 3 lines", () => {
		const out = render({ ...base, alertMode: true, etaMinutes: 12 });
		const lines = out.split("\n").filter(Boolean);
		expect(lines.length).toBe(3);
	});

	test("shows mood face", () => {
		const out = render(base);
		expect(out).toContain("(=ᴥ=)~");
	});

	test("shows branch and model", () => {
		const out = render(base);
		expect(out).toContain("main");
		expect(out).toContain("Opus 4.7");
	});

	test("shows session cost formatted", () => {
		const out = render(base);
		expect(out).toContain("$1.23");
	});

	test("ETA in alert mode", () => {
		const out = render({ ...base, alertMode: true, etaMinutes: 12 });
		expect(out).toContain("ETA");
		expect(out).toContain("12");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test __tests__/render.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/render.ts`**

```ts
import { color, formatCost, formatDuration, formatPct, formatTokens } from "./format";
import { sparkline } from "./sparkline";
import type { StatuslineData } from "./types";

const FIRE = "🔥";
const WAVE = "🌊";
const BOLT = "⚡";
const DOT = color("·", "dim");

function renderLine1(d: StatuslineData): string {
	const mood = color(d.mood.face, d.mood.color as Parameters<typeof color>[1]);
	const label = d.mood.label ? ` ${color(d.mood.label, d.mood.color as Parameters<typeof color>[1])}` : "";
	const branch = color(` ${d.git.branch}`, "mauve") + (d.git.dirty ? color("*", "green") : "");
	const ins = d.git.insertions > 0 ? " " + color(`+${d.git.insertions}`, "green") : "";
	const del = d.git.deletions > 0 ? " " + color(`-${d.git.deletions}`, "red") : "";
	const model = color(` ${d.modelName}`, "peach");
	const dir = color(` ${d.dirName}`, "subtext");
	const sessions = color(`[${d.activeSessions}]`, "lavender");

	return `${mood}${label} ${DOT} ${branch}${ins}${del} ${FIRE} ${model} ${FIRE} ${dir} ${DOT} ${sessions}`;
}

function renderLine2(d: StatuslineData): string {
	const cost = color(`󱐋 ${formatCost(d.sessionCost)}`, "teal");
	const dur = color(`(${formatDuration(d.sessionDurationMs)})`, "dim");
	const today = d.todayCost > 0 ? ` ${FIRE} ` + color(`D ${formatCost(d.todayCost)}`, "subtext") : "";
	const burn =
		d.burnRatePerHr !== null && d.burnRatePerHr > 10
			? ` ${FIRE} ` + color(`${formatCost(d.burnRatePerHr)}/hr`, "red")
			: "";
	const week =
		d.weekCost > 0 && d.fiveHourPct !== null && d.fiveHourPct > 70
			? ` ${FIRE} ` + color(` ${formatCost(d.weekCost)}/125`, "subtext")
			: "";

	const ctxLine =
		d.contextPct !== null
			? color(`󰄨 ${formatPct(d.contextPct)}`, "sky") +
				" " +
				color(sparkline(d.contextSeries), "sky")
			: "";

	const fhLine =
		d.fiveHourPct !== null
			? color(` 5h ${formatPct(d.fiveHourPct)}`, "peach") +
				" " +
				color(sparkline(d.fiveHourSeries), "peach")
			: "";

	const tps =
		d.tokensPerSec !== null
			? ` ${BOLT} ` + color(`${Math.round(d.tokensPerSec)} t/s`, "yellow")
			: "";

	return `${cost} ${dur}${today}${burn}${week} ${WAVE} ${ctxLine} ${WAVE} ${fhLine}${tps}`;
}

function renderLine3(d: StatuslineData): string {
	const ctxDetail =
		d.contextPct !== null
			? color(`󰄨 ${formatPct(d.contextPct)}${d.contextPct > 85 ? "!" : ""}`, "red") +
				" " +
				color(sparkline(d.contextSeries), "red") +
				" " +
				color(`${formatTokens(d.contextTokens ?? 0)}`, "dim")
			: "";
	const fhDetail =
		d.fiveHourPct !== null
			? color(` ${formatPct(d.fiveHourPct)}`, "red") +
				" " +
				color(sparkline(d.fiveHourSeries), "red")
			: "";
	let forecast = "";
	if (d.etaMinutes !== null) {
		if (d.etaMinutes === 0) forecast = color("⚠ AT LIMIT", "red");
		else forecast = color(`⚠ ETA limit: ${d.etaMinutes}min`, "red");
	} else if (d.etaCooling) {
		forecast = color("Trend: cooling ↓", "green");
	} else {
		forecast = color("Forecast: SAFE ✓", "green");
	}
	return `${ctxDetail} ${WAVE} ${fhDetail} ${DOT} ${forecast}`;
}

export function render(d: StatuslineData): string {
	const l1 = renderLine1(d);
	const l2 = renderLine2(d);
	if (!d.alertMode) return `${l1}\n${l2}`;
	return `${l1}\n${l2}\n${renderLine3(d)}`;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test __tests__/render.test.ts`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/render.ts __tests__/render.test.ts
git commit -m "feat: add pure render (2-line base, 3-line alert)"
```

---

## Task 12: Entry point (orchestrator)

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement `src/index.ts`**

```ts
import { basename } from "node:path";
import { CONFIG } from "./config";
import { burnRate } from "./lib/burn";
import { forecastEta } from "./lib/forecast";
import { getGitStatus } from "./lib/git";
import { History } from "./lib/history";
import { getUsageLimits } from "./lib/limits";
import { classifyMood } from "./lib/mood";
import { render } from "./lib/render";
import { SessionsStore } from "./lib/sessions";
import type { HookInput, StatuslineData } from "./lib/types";

function fallback(dir: string, model: string): string {
	return `${basename(dir)} · ${model}`;
}

async function main(): Promise<void> {
	let input: HookInput;
	try {
		input = await Bun.stdin.json();
	} catch {
		console.log("statusline-godlike: invalid stdin");
		return;
	}

	try {
		const nowSec = Math.floor(Date.now() / 1000);
		const nowMs = Date.now();
		const cwd = input.workspace.current_dir;
		const dirName = basename(cwd);

		const history = new History(CONFIG.paths.historyDb);
		history.prune(CONFIG.history.retentionMinutes, nowSec);

		const [git, limits] = await Promise.all([getGitStatus(cwd), getUsageLimits(nowSec)]);

		const ctxUsage = input.context_window?.current_usage;
		const contextTokens = ctxUsage
			? (ctxUsage.input_tokens ?? 0) +
				(ctxUsage.cache_creation_input_tokens ?? 0) +
				(ctxUsage.cache_read_input_tokens ?? 0)
			: null;
		const ctxMax = input.context_window?.context_window_size ?? 200_000;
		const contextPct =
			input.context_window?.used_percentage ??
			(contextTokens !== null ? Math.round((contextTokens / ctxMax) * 100) : null);

		const sessionCost = input.cost.total_cost_usd;
		const sessionDur = input.cost.total_duration_ms;
		const apiDur = input.cost.total_api_duration_ms ?? 0;
		const tokensPerSec =
			apiDur > 0 && contextTokens ? (contextTokens / apiDur) * 1000 : null;
		const fiveHourPct = limits.five_hour?.utilization ?? null;
		const fiveHourResetsAt = limits.five_hour?.resets_at ?? null;

		// Record samples
		history.record("cost", sessionCost, nowSec);
		if (contextPct !== null) history.record("ctx_pct", contextPct, nowSec);
		if (fiveHourPct !== null) history.record("5h_pct", fiveHourPct, nowSec);
		if (tokensPerSec !== null) history.record("tps", tokensPerSec, nowSec);

		// Read series
		const costSeries = history.getSeries("cost", CONFIG.history.windowMinutes, nowSec);
		const ctxSeries = history.getSeries("ctx_pct", CONFIG.history.windowMinutes, nowSec);
		const fhSeries = history.getSeries("5h_pct", CONFIG.history.windowMinutes, nowSec);
		const tpsSeries = history.getSeries("tps", CONFIG.history.windowMinutes, nowSec);

		// Burn rate from cost samples
		const costSamples = costSeries.map((v, i) => ({
			metric: "cost",
			value: v,
			sampled_at: nowSec - (costSeries.length - 1 - i) * 60,
		}));
		const burn = burnRate(costSamples);

		// Sessions
		const sessionsStore = new SessionsStore(CONFIG.paths.sessionsJson);
		sessionsStore.record(input.session_id, cwd, nowMs);
		const activeSessions = sessionsStore.countActive(5, nowMs);

		// Alert / mood / forecast
		const alertMode =
			(contextPct !== null && contextPct > CONFIG.thresholds.contextAlert) ||
			(fiveHourPct !== null && fiveHourPct > CONFIG.thresholds.fiveHourAlert);
		const mood = classifyMood({ contextPct, sessionCost, fiveHourPct });
		const { minutes: etaMinutes, cooling: etaCooling } = alertMode
			? forecastEta(fhSeries, 100)
			: { minutes: null, cooling: false };

		history.close();

		// todayCost / weekCost aggregation deferred to v0.2 — render hides segments when 0
		const todayCost = 0;
		const weekCost = 0;

		const data: StatuslineData = {
			mood,
			git: git ?? { branch: "no-git", dirty: false, insertions: 0, deletions: 0 },
			modelName: input.model.display_name,
			dirName,
			activeSessions,
			sessionCost,
			sessionDurationMs: sessionDur,
			todayCost,
			weekCost,
			contextPct,
			contextTokens,
			contextSeries: ctxSeries,
			fiveHourPct,
			fiveHourResetsAt,
			fiveHourSeries: fhSeries,
			tokensPerSec,
			tokensPerSecSeries: tpsSeries,
			cacheHitPct: null,
			burnRatePerHr: burn,
			etaMinutes,
			etaCooling,
			alertMode,
			celebrationMode: mood.kind === "rose",
		};

		console.log(render(data));
	} catch (err) {
		console.log(fallback(input.workspace?.current_dir ?? "?", input.model?.display_name ?? "?"));
	}
}

main();
```

- [ ] **Step 2: Smoke test with minimal fixture**

```bash
echo '{
  "session_id": "smoke-1",
  "workspace": {"current_dir": "~"},
  "model": {"display_name": "Opus 4.7"},
  "cost": {"total_cost_usd": 1.5, "total_duration_ms": 300000},
  "context_window": {"used_percentage": 40, "context_window_size": 200000}
}' | bun run src/index.ts
```

Expected: 2 lines of colored output, no crash.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire up orchestrator with fallback"
```

---

## Task 13: Fixtures + integration tests

**Files:**
- Create: `fixtures/normal.json`, `fixtures/alert-context.json`, `fixtures/alert-5h.json`, `fixtures/celebration.json`
- Create: `__tests__/integration.test.ts`

- [ ] **Step 1: Create `fixtures/normal.json`**

```json
{
  "session_id": "fix-normal",
  "workspace": {"current_dir": "~/DEV/acme-web"},
  "model": {"display_name": "Opus 4.7"},
  "cost": {"total_cost_usd": 3.42, "total_duration_ms": 1080000, "total_api_duration_ms": 900000, "total_lines_added": 142, "total_lines_removed": 38},
  "context_window": {"current_usage": {"input_tokens": 100000, "cache_read_input_tokens": 42000}, "used_percentage": 71, "context_window_size": 200000}
}
```

- [ ] **Step 2: Create `fixtures/alert-context.json`**

```json
{
  "session_id": "fix-alert-ctx",
  "workspace": {"current_dir": "~/DEV/acme-web"},
  "model": {"display_name": "Opus 4.7"},
  "cost": {"total_cost_usd": 8.9, "total_duration_ms": 2700000, "total_api_duration_ms": 2200000},
  "context_window": {"current_usage": {"input_tokens": 160000, "cache_read_input_tokens": 24000}, "used_percentage": 92, "context_window_size": 200000}
}
```

- [ ] **Step 3: Create `fixtures/alert-5h.json`**

```json
{
  "session_id": "fix-alert-5h",
  "workspace": {"current_dir": "~/DEV/acme-web"},
  "model": {"display_name": "Opus 4.7"},
  "cost": {"total_cost_usd": 5.5, "total_duration_ms": 3600000, "total_api_duration_ms": 3000000},
  "context_window": {"current_usage": {"input_tokens": 80000, "cache_read_input_tokens": 10000}, "used_percentage": 45, "context_window_size": 200000}
}
```

- [ ] **Step 4: Create `fixtures/celebration.json`**

```json
{
  "session_id": "fix-celeb",
  "workspace": {"current_dir": "~/DEV/acme-web"},
  "model": {"display_name": "Sonnet 4.6"},
  "cost": {"total_cost_usd": 0.18, "total_duration_ms": 180000, "total_api_duration_ms": 120000},
  "context_window": {"current_usage": {"input_tokens": 18000, "cache_read_input_tokens": 6000}, "used_percentage": 12, "context_window_size": 200000}
}
```

- [ ] **Step 5: Write integration test `__tests__/integration.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function runFixture(name: string): Promise<string> {
	const fixture = readFileSync(join(import.meta.dir, "..", "fixtures", name), "utf-8");
	const proc = Bun.spawn(["bun", "run", join(import.meta.dir, "..", "src", "index.ts")], {
		stdin: new Blob([fixture]),
		stdout: "pipe",
	});
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out;
}

describe("integration", () => {
	test("normal renders 2 lines", async () => {
		const out = await runFixture("normal.json");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBe(2);
		expect(out).toContain("(=ᴥ=)~");
	});

	test("alert-context renders 3 lines", async () => {
		const out = await runFixture("alert-context.json");
		const lines = out.split("\n").filter((l) => l.trim().length > 0);
		expect(lines.length).toBe(3);
		expect(out).toContain("(◉_◉)⚠");
	});

	test("celebration shows rose pet", async () => {
		const out = await runFixture("celebration.json");
		expect(out).toContain("(◕‿◕)♡");
	});
});
```

- [ ] **Step 6: Run integration tests**

Run: `bun test __tests__/integration.test.ts`
Expected: 3 pass.

- [ ] **Step 7: Commit**

```bash
git add fixtures/ __tests__/integration.test.ts
git commit -m "test: add fixtures + integration tests for 3 states"
```

---

## Task 14: Performance guard

**Files:**
- Modify: `__tests__/integration.test.ts`

- [ ] **Step 1: Add perf test to `__tests__/integration.test.ts`**

Append to the existing file:

```ts
test("normal fixture renders in < 250ms", async () => {
	const start = Date.now();
	await runFixture("normal.json");
	const elapsed = Date.now() - start;
	expect(elapsed).toBeLessThan(250);
});
```

- [ ] **Step 2: Run perf test**

Run: `bun test __tests__/integration.test.ts`
Expected: 4 pass. If perf fails, profile with `bun --hot` / `console.time` and optimize the slowest lib.

- [ ] **Step 3: Commit**

```bash
git add __tests__/integration.test.ts
git commit -m "test: add perf guard (< 250ms p99)"
```

---

## Task 15: Switch Claude Code statusline command

**Files:**
- Modify: `~/.claude/settings.json` — the `statusLine.command` line

- [ ] **Step 1: Backup current settings**

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak.$(date +%Y%m%d-%H%M%S)
```

- [ ] **Step 2: Update `~/.claude/settings.json`**

Replace the current line :

```json
"statusLine": {
  "type": "command",
  "command": "bun ~/.claude/scripts/statusline/src/index.ts",
  "padding": 0
}
```

with :

```json
"statusLine": {
  "type": "command",
  "command": "bun ~/.claude/scripts/statusline-godlike/src/index.ts",
  "padding": 0
}
```

- [ ] **Step 3: Final verification in real Claude Code session**

Open a new Claude Code terminal in `~/DEV/acme-web`. Statusline should show 2-line godlike format. Run a few commands to accumulate samples. Verify sparklines populate after 2-3 minutes. No regression on core work.

If anything looks wrong, rollback :

```bash
# Restore previous settings
cp ~/.claude/settings.json.bak.<timestamp> ~/.claude/settings.json
```

- [ ] **Step 4: Final commit in statusline repo**

```bash
cd ~/.claude/scripts/statusline-godlike
git log --oneline | head -20
# Tag the rollout
git tag v0.1.0 -m "First rollout — godlike statusline active"
```

---

## Acceptance checklist (from SPEC §12)

- [ ] Fixture `normal.json` renders correct 2-line output
- [ ] Fixture `alert-context.json` renders 3 lines with ETA
- [ ] Fixture `alert-5h.json` renders 3 lines with 5h details
- [ ] Fixture `celebration.json` renders pet rose mood
- [ ] All `bun test` pass
- [ ] p99 < 250 ms (target < 200 ms on p50)
- [ ] 10 consecutive runs build up 10 points in `history.db`, sparkline updates reactively
- [ ] Throwing an error in any lib results in fallback output (no Claude Code crash)
- [ ] Swap `settings.json` to new statusline for 1 hour on `acme-web` without regression
- [ ] Visual matches validated final-design mockup

---

## Deferred to follow-up spec (YAGNI for v0.1)

- `todayCost` / `weekCost` aggregation (currently return 0 — harmless, hides `D $x` / `W $x` segments, not a regression)
- Dotfiles stow migration to `~/.dotfiles/claude/`
- Config file (thresholds/colors user-editable)
- Multi-line auto-alignment (powerline visual polish)

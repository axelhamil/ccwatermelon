# Statusline Godlike — Design Spec

**Date** : 2026-04-20
**Status** : Validated design, pending implementation plan
**Replaces** : `~/.claude/scripts/statusline/` (old stays in place until rollout validated)
**Target path** : `~/.claude/scripts/statusline-godlike/`

---

## 1. Goal

Build a custom dashboard-style statusline for Claude Code that shows the maximum useful, reliable data in a readable format. The line is the user's permanent cockpit while coding.

Non-goals :
- Replace every feature of the current statusline on day 1
- Support macOS Keychain (user is on Linux, uses `~/.claude/.credentials.json`)
- Multi-provider (Claude only)
- Configurable via TUI (YAGNI — one user, one config)

---

## 2. Layout & behavior

### 2.1 Base state (2 lines)

```
(=ᴥ=)~ · <branch>*<+/-> 🔥  <model> 🔥  <dir> · [<sessions>]
󱐋 $<session>  (<dur>) 🔥 D $<today> 🔥 󰄨 <ctx%> <spark> 🌊  5h <pct%> <spark> <reset> ⚡ <t/s>
```

### 2.2 Alert state (3 lines, auto-expand)

Trigger : `context > 85%` **OR** `5h_usage > 90%`.

Adds a 3rd line with :
- Detailed context (`142→184k`, sparkline in red)
- Detailed 5h block (sparkline in red)
- **ETA forecast** (`ETA limit: 12min` or `Forecast: SAFE ✓`)

Also adds on L2 :
- Burn rate (`🔥 $18/hr burn`), animated pulse if > $20/hr
- Week usage if approaching weekly limit

### 2.3 Celebration state (subtle)

When all safe (`ctx < 30%`, `session < $1`, `5h < 10%`) :
- Pet switches to rose mood (`(◕‿◕)♡`, pink color)
- Progress bars shown in green
- No behavioral difference otherwise

### 2.4 Pet moods

| Condition (any match) | Mood | Face | Label | Color | Animation |
|---|---|---|---|---|---|
| `ctx < 30% AND cost < $1 AND 5h < 10%` | rose | `(◕‿◕)♡` | — | pink | wiggle |
| default | zen | `(=ᴥ=)~` | — | teal | wiggle |
| `ctx > 70% OR cost > $5 OR 5h > 70%` | focus | `(•‿•)` | focus | yellow | wiggle |
| `ctx > 85% OR 5h > 90%` | stressed | `(◉_◉)⚠` | stressed | red | pulse |
| `ctx > 95% OR 5h > 97%` | panic | `(˵=͟͟͞╯°□°)╯` | PANIC | red | pulse-fast |

Evaluation order : panic → stressed → focus → zen/rose. First match wins.

### 2.5 Separators (semantic)

| Symbol | Meaning | Around what |
|---|---|---|
| `🔥` | money / project identity | session cost, today, week, burn rate, model, dir |
| `🌊` | context / memory | context %, tokens, 5h transition |
| `⚡` | performance | tokens/s, cache hit |
| `·` / `│` | neutral intra-group | inside a semantic block |

---

## 3. Sparklines

- **Granularity** : 8 points, 1 sample / minute = last 8 minutes
- **Charset** : `▁▂▃▄▅▆▇█` (Unicode block elements)
- **Metrics tracked** : session cost delta, context %, 5h utilization %, tokens/s
- **Color** : matches metric family (context=sky, 5h=peach, cost=teal, perf=yellow). Red+pulse in alert.
- **Storage** : SQLite at `~/.local/share/statusline-godlike/history.db`
- **Retention** : rolling window of 30 min per metric (safety margin beyond the 8-min display)

### 3.1 DB schema

```sql
CREATE TABLE samples (
  metric    TEXT NOT NULL,      -- 'cost', 'ctx_pct', '5h_pct', 'tps'
  sampled_at INTEGER NOT NULL,  -- unix seconds
  value     REAL NOT NULL,
  PRIMARY KEY (metric, sampled_at)
);
CREATE INDEX samples_recent ON samples(metric, sampled_at DESC);
```

Insert at each statusline run (truncate rows older than 30 min per metric).

---

## 4. Forecast (ETA rate limit)

- Triggered : only in alert state
- Method : simple linear regression on the last 8 points of the 5h sparkline
- Output :
  - If projected to hit 100% before `resets_at` → `ETA limit: Xmin` (red, pulse if <15 min)
  - Otherwise → `Forecast: SAFE ✓` (green)

Edge cases :
- < 3 points in history → show `Forecast: — (warming up)`
- Non-monotonic trend (usage decreasing) → show `Trend: cooling ↓`

---

## 5. Burn rate

- Formula : `($session_now − $session_10min_ago) × 6` = projected $/hour
- Displayed : only if > $10/hr OR in alert state
- Format : `🔥 $18/hr burn`, red, pulse animation if > $20/hr
- Data source : same `samples` table, `metric='cost'`

---

## 6. Info layout

### L1 (always)
```
<pet>[<mood_label>?] · <branch><dirty><insertions> 🔥 <model> 🔥 <dir> · [<active_sessions>]
```

- `<dirty>` : `*` if any uncommitted changes (staged or unstaged)
- `<insertions>` : `+N -M` from `git diff HEAD --shortstat` (working tree vs HEAD, combined staged+unstaged)
- `<active_sessions>` : count of Claude Code sessions with `last_seen` within 5 min, read from `sessions.json`. Each statusline run writes the current session's entry — sessions stale out naturally.

### L2 (always)
```
󱐋 $<session_cost> (<duration>) 🔥 D $<today> [🔥 <burn>?] 🔥 [W $<week>?] 🌊 󰄨 <ctx%> <spark> 🌊  5h <pct%> <spark> <reset> ⚡ <t/s> [· <cache_hit>%]
```

- `D $<today>` : sum of session costs with `sampled_at ≥ local_midnight_today`
- `W $<week>` : shown if `5h > 70%`. Sum from current calendar week (Monday 00:00 local → now)
- `<burn>` : shown if `$/hr > 10` or alert state

### L3 (alert only)
```
<ctx_icon> <spark_red> <pct%>[!] 🌊 <tokens_absolute> · <5h_icon> <spark_red> <pct%> · <eta_forecast>
```

---

## 7. Stack & architecture

### 7.1 Runtime
- **Bun** (reuse existing install, zero new dep) — same as current statusline
- **TypeScript strict mode**
- **Biome** for lint/format (already configured in `~/.claude/scripts/`)

### 7.2 File layout
```
~/.claude/scripts/statusline-godlike/
├── SPEC.md                    # this file
├── src/
│   ├── index.ts               # entry point (stdin → render)
│   ├── config.ts              # static config (thresholds, colors)
│   └── lib/
│       ├── types.ts           # HookInput, StatuslineData
│       ├── git.ts             # branch, dirty, insertions
│       ├── limits.ts          # 5h/weekly fetch + cache
│       ├── history.ts         # SQLite samples CRUD
│       ├── sparkline.ts       # array → unicode string
│       ├── forecast.ts        # linear regression + ETA
│       ├── burn.ts            # $/hr computation
│       ├── mood.ts            # thresholds → pet mood
│       ├── sessions.ts        # tmux active sessions
│       ├── format.ts          # ANSI colors, number formatting
│       └── render.ts          # pure: StatuslineData → string[]
├── __tests__/                 # bun:test per lib
│   ├── mood.test.ts
│   ├── forecast.test.ts
│   ├── sparkline.test.ts
│   ├── burn.test.ts
│   └── render.test.ts
├── fixtures/                  # fixture payloads for each state
│   ├── normal.json
│   ├── alert-context.json
│   ├── alert-5h.json
│   └── celebration.json
└── package.json
```

### 7.3 Data flow

```
stdin (Claude Code hook JSON)
  ↓
index.ts :
  ├─ parse HookInput
  ├─ git.getStatus()
  ├─ limits.fetch() [cached 60s]
  ├─ history.recordSample(metric, value)   ← writes current values
  ├─ history.getSeries(metric, 8min)       ← reads for sparkline
  ├─ forecast.eta() + burn.rate()
  ├─ mood.classify(thresholds)
  ├─ sessions.count()
  └─ render.statusline(data) → stdout
```

### 7.4 Storage paths
- **History DB** : `~/.local/share/statusline-godlike/history.db`
- **Sessions state** : `~/.local/share/statusline-godlike/sessions.json` (kept from current statusline pattern)
- **Cache** : `~/.cache/statusline-godlike/limits.json` (60s TTL)

---

## 8. Performance targets

| Step | Budget |
|---|---|
| stdin parse | < 5 ms |
| git status | < 50 ms |
| history record + series read | < 10 ms |
| limits fetch (cached) | < 5 ms (on miss: < 300 ms, 60s TTL) |
| forecast + burn | < 5 ms |
| render | < 10 ms |
| **Total p99** | **< 200 ms** |

Perf regression test : run `bun test perf` after each change, fail if > 250 ms.

---

## 9. Safety & rollback

- **Zero disruption** : current statusline at `~/.claude/scripts/statusline/` stays UNTOUCHED until explicit swap.
- **Switch** : single line change in `~/.claude/settings.json` :
  ```json
  "statusLine": { "type": "command", "command": "bun ~/.claude/scripts/ccstatusline-godlike/src/index.ts", "padding": 0 }
  ```
- **Rollback** : revert that one line to point back to old statusline.
- **Error path** : ANY exception → fallback to minimal output `<dir> · <model>` (never crashes Claude Code UI).
- **Empty data** : every lib returns sensible defaults on missing data (no git → `no-git`, no limits → no 5h segment, no history → no sparkline).
- **WIP protection** : this design explicitly lists `acme-web` as the critical active project — no code anywhere that risks its integrity.

---

## 10. Dotfiles integration

After initial shipping, migrate to :
```
~/.dotfiles/claude/.claude/scripts/statusline-godlike/   → stow source
```

Stow symlinks it into `~/.claude/scripts/statusline-godlike/` and the whole thing is git-versioned. **Out of scope for this spec** (separate follow-up).

---

## 11. Out of scope (YAGNI)

- TUI config UI (`bun run demo`-style) — user edits `config.ts` manually
- Multi-provider support
- macOS Keychain
- Presets system
- Internationalization (labels hardcoded in French, per original design)
- Cross-platform (Linux only, uses `tmux list-sessions` and `sqlite3`)

---

## 12. Acceptance criteria

Implementation is complete when :

1. `bun src/index.ts < fixtures/normal.json` renders correct 2-line output
2. `bun src/index.ts < fixtures/alert-context.json` renders 3 lines with ETA
3. `bun src/index.ts < fixtures/alert-5h.json` renders 3 lines with 5h details
4. `bun src/index.ts < fixtures/celebration.json` renders pet rose mood
5. All `bun test` pass (>95% coverage on `lib/`)
6. p99 latency < 200 ms on real session JSON
7. Running 10 consecutive times builds up 10 points in `history.db` and sparkline updates reactively
8. Throwing an error in any lib results in fallback output (chaos test)
9. User swaps `settings.json` to new statusline for 1 hour on `acme-web` without any regression or crash
10. User approves the visual result matches the validated final-design mockup

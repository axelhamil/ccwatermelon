# ccstatusline-godlike

Personal Claude Code statusline: a 3-line dashboard (4 in alert mode), Catppuccin Mocha palette, Nerd Font glyphs, rendered in ~15-20ms.

```
(=ᴥ=)  acme-web ·  main* +12 -3 ·  Opus 4.7 [2]
󱐋 $3.42 (18m) 🔥 D $95.9 🔥 W $95.9 · cache 41% ⚡ 113 t/s
🌊 󰄨 conv 55%⡇  ·  5h 20%⡄ ↺3h22 (03:10)  ·  7d 23%⡄ ↺107h18 (11:06)
```

In alert mode (context, 5h quota, or 7-day quota above threshold), a 4th line appears with the details and an estimated time-to-limit.

## Requirements

- **Bun** ≥ 1.1 (runtime, no other one is supported)
- **A truecolor terminal** (24-bit ANSI) — no 256-color fallback, the Catppuccin Mocha palette is sent as raw RGB
- **A patched Nerd Font** installed in the terminal (glyphs `󱐋 󰄨 󰅶 ⑂` etc.)
- `git` on `PATH` (optional — without it, the branch segment simply shows `no-git`)

## Installation

```bash
bun install
```

In `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bun ~/.claude/scripts/ccstatusline-godlike/src/index.ts",
    "padding": 0
  }
}
```

On first run, if data still exists at the old location
(`~/.local/share/statusline-godlike/`, before the project was renamed), it
is moved automatically to `~/.local/share/ccstatusline-godlike/` with no
loss — real cost history is preserved.

## Segments

| Segment | Line | Default | Why |
|---|---|---|---|
| `mood` | 1 | always on | ASCII mood that reacts to context, cost, and quotas — the first warning signal, before you even read a number |
| `dir` / `git` / `model` | 1 | always on | identity: directory, branch + diff (`+ins -del`), active model — the essential baseline |
| `sessions` | 1 | on | number of active Claude Code sessions on this project (shown only if >1), so you don't step on your own toes across tabs |
| `night` | 1 | on | `☾` between 1am and 5am local time — a quiet reminder that it's late |
| `worktree` | 1 | on, silent if absent | current git worktree name (`workspace.git_worktree`), useful in multi-branch dev |
| `vimMode` | 1 | on, silent if absent | current vim mode (`vim.mode`), only if the hook provides it |
| `agentName` | 1 | on, silent if absent | name of the active sub-agent (`agent.name`) |
| `outputStyle` | 1 | on, hidden if "default" | current output style, only if it differs from the default |
| `sessionName` | 1 | **off** | Claude Code session name — noisy by default (often auto-generated), enable if useful |
| `ccVersion` | 1 | **off** | Claude Code CLI version — occasionally useful to spot an update, enable as needed |
| `cost` / `duration` | 2 | always on | cost and duration of the current session — the number that matters most |
| `linesChanged` | 2 | on, silent if zero | total lines added/removed over the session (`cost.total_lines_added/removed`), distinct from the git diff on line 1 |
| `today` / `week` | 2 | on if cost > 0 | cumulative cost for today and the last 7 days (local SQLite) |
| `burn` | 2 | on if > $10/hr | burn rate — warns you before the bill surprises you |
| `cache` | 2 | on if < 70% | cache hit rate — below 70%, context is being paid for at full price |
| `tps` | 2 | on | tokens/second measured over the session |
| `contextGauge` | 3 | always on | conversation context pressure **measured against the real compaction threshold** (not the raw window — see below), braille gradient |
| `fiveHourGauge` / `sevenDayGauge` | 3 | always on | 5h and 7-day rate-limit quotas, with countdown and local reset time |

Every optional segment carries a **priority**: under reduced width, the
lowest-priority segments disappear first, line by line. The line-3 gauges
are tuned to disappear only as a last resort. Segments listed as
"relocatable" (`worktree`, `vimMode`, `agentName`, `outputStyle`,
`sessionName`, `ccVersion`, `night`, `linesChanged`) can be sent to line 1
or line 2 via config — the fixed identity and economy segments
(`mood`/`dir`/`git`/`model` and `cost`/`duration`) stay put: their position
has already been validated aesthetically, and making them movable would
risk breaking the intended readable/fun hierarchy.

## Configuration

Format of choice: **JSONC** (JSON + `//` and `/* */` comments), with no
dedicated parsing dependency (a simple comment strip is enough before
`JSON.parse`) — consistent with claude-powerline and ccstatusline, and
zero risk of pulling a TOML lib into the render path.

### Resolution cascade

1. `$CLAUDE_CONFIG_DIR/ccstatusline-godlike/config.jsonc` (if the variable is set)
2. `~/.config/ccstatusline-godlike/config.jsonc`
3. `./.ccstatusline-godlike.jsonc` (project file, in the session's `cwd`) — **overrides** the previous levels, key by key

Each file is validated independently with **zod** (`safeParse`): an
invalid file (malformed JSON, out-of-range threshold, wrong type) is
ignored with a warning on **stderr** (never stdout — that would break the
display), and the statusline falls back to defaults. No file at all =
current behavior unchanged.

### Reference

```jsonc
{
  // Color theme. Only one exists today (Catppuccin Mocha) — the field is
  // kept for future extensions.
  "theme": "mocha",

  "thresholds": {
    "compactAlert": 85,            // % of the "compaction threshold" window that triggers the alert
    "fiveHourAlert": 90,           // % of the 5h quota that triggers the alert
    "sevenDayAlert": 80,           // % of the 7-day quota that triggers the alert
    "compactionReserveRatio": 0.92 // fraction of the window reserved before auto-compact
  },

  // Catppuccin Mocha color overrides, in RGB [0-255, 0-255, 0-255].
  // Valid keys: text, subtext, dim, red, peach, yellow, green, teal,
  // sky, blue, lavender, mauve, pink.
  "colors": {
    "teal": [148, 226, 213]
  },

  "segments": {
    "tps": { "enabled": false },
    "ccVersion": { "enabled": true, "line": 2 },
    "worktree": { "priority": 12 }
  }
}
```

- `enabled`: `true`/`false`, hides the segment
- `line`: `1` or `2` — only for the relocatable segments listed above
- `priority`: number — higher means it disappears last under reduced width

An invalid config (e.g. `compactAlert: 500`) never breaks the render: it
is rejected as a whole with a message on stderr, and defaults apply.

### Environment variables

| Variable | Effect |
|---|---|
| `CCSTATUSLINE_WIDTH` | forces the terminal width (otherwise `process.stdout.columns`, then `$COLUMNS`, then 80) |
| `CCSTATUSLINE_DATA_DIR` | relocates `history.db` and `sessions.json` (default `~/.local/share/ccstatusline-godlike`) |
| `CCSTATUSLINE_CACHE_DIR` | relocates `limits.json` (default `~/.cache/ccstatusline-godlike`) |
| `CLAUDE_CONFIG_DIR` | adds `$CLAUDE_CONFIG_DIR/ccstatusline-godlike/config.jsonc` at the top of the config cascade |

The first two are mainly used by tests (see `__tests__/integration.test.ts`) so that `bun test` never writes to real data.

## Interactive CLI

```bash
bun run config
# or, once the package is linked: ccstatusline-godlike-config
```

Text menu in ANSI (no React/Ink dependency on this path — only the CLI
loads it, never the statusline render itself) with a **live preview**:
every change to a threshold, segment, or color immediately redraws a
sample of the actual render via the same `render()` function used in
production, on a fictional dataset close to a real-world case (cost,
context, quotas). Saves to `~/.config/ccstatusline-godlike/config.jsonc`.

## Security & robustness

A statusline is an unusual attack surface: it renders untrusted content
(directory names, branch names) into a terminal, on every single message.
The hardening here is deliberate.

- **Terminal injection is neutralised.** Every externally-sourced label —
  directory, branch, worktree, session name, agent name, output style, vim
  mode, model — is stripped of control characters before rendering
  (`src/lib/sanitize.ts`). Without this, a cloned repository containing a
  directory whose name embeds a raw `ESC` could emit an OSC sequence to
  rewrite your window title, a CSI to clear the screen, or a bare `CR` to
  hide the start of the line. Git rejects control characters in refnames,
  but nothing stops a directory from carrying them.
- **The OAuth token never leaves the request.** It is read from
  `~/.claude/.credentials.json` and used only as an `Authorization` header.
  It is never logged, never written to the cache file, never stored in
  SQLite, never printed.
- **No shell, no string-built SQL.** Git runs through `Bun.$` with escaped
  interpolation, never `sh -c`; every SQLite query uses bound parameters.
- **A malformed payload degrades one segment, not the whole line.** Numeric
  fields from stdin are validated at the boundary: a string where a number
  belongs, a negative duration, or `1e308` is rejected rather than clamped —
  a clamped absurd value would still be written to the cost history and
  poison the day/week totals for 30 days.
- **Concurrent sessions don't collide.** SQLite runs in WAL mode with a
  busy timeout, because several Claude Code windows render against the same
  database at once; the default rollback journal returns
  "database is locked" and drops the statusline to its fallback line.
- **One runtime dependency** (`zod`), loaded only by the config layer and
  the CLI — never on the render path. Nothing is fetched at render time, so
  there is no `npx @latest` executing freshly-downloaded code on every
  message.

## Width & responsiveness

Width is resolved via `CCSTATUSLINE_WIDTH` → `process.stdout.columns` →
`$COLUMNS` → `80`, never via `tput` (that's exactly the bug that breaks
ccstatusline on Windows by creating a `null` file).

Visual width calculation (`src/lib/width.ts`) is not `string.length`: ANSI
codes are ignored, emoji and CJK characters count as double-width,
combining marks and variation selectors count as zero, and Nerd Font
glyphs (Unicode private-use plane) count as single-width — matching how
they actually render in a patched terminal.

Each line is adjusted independently: the lowest-priority optional
segments disappear one by one (never mid-segment character truncation)
until the line fits, or only the incompressible core remains (identity on
line 1, cost+duration on line 2).

## Design rationale

- **No block progress bars (`████░░░░`), no sparklines.** They were tried
  and deliberately removed: for the same information density, a single
  braille glyph (`⡇⡄⣿…`) carries the same signal in one character instead
  of eight, and color (sky → peach → red by threshold) carries the rest.
  Constant length, variable information — that's the guiding principle
  behind the whole statusline.
- **No time-based animation.** The statusline is only redrawn on a Claude
  Code event (new message, tool call, etc.) — never continuously. An
  animation driven by `Date.now()` would therefore never move between two
  consecutive renders, or would jump inconsistently depending on event
  frequency. The render is deliberately deterministic given the same data.
- **Context is measured against the compaction threshold, not the raw
  window.** `contextGauge` compares tokens used to the real auto-compact
  threshold (`autoCompactWindow` × `compactionReserveRatio`, read from
  `settings.json`), not `context_window_size`. That's the limit that
  actually matters day to day: at 90% of the raw window but 60% of the
  compaction threshold, there's still plenty of headroom — showing the
  first number would create a false alarm.
- **Never any network on the render path.** Claude Code kills the script
  if a new render is triggered while it's still running: a blocking
  `fetch` there is a bug, not just slowness. Quotas come from the hook
  payload when it provides them; otherwise the disk cache is served — even
  if stale — and a detached process refreshes it for the next render. On a
  plan where Anthropic doesn't send `rate_limits`
  ([known bug](https://github.com/anthropics/claude-code/issues/40094)),
  that's the difference between 640ms and 120ms per render.
- **Readability of important data comes first, fun stays minimal.** The
  ASCII mood and the night glyph cost a handful of characters; the quota
  gauges, on the other hand, keep their countdown and reset time even
  under width pressure, because that's the information that saves you
  from a bad surprise mid-sprint.

## Comparison with the ecosystem

|  | ccstatusline-godlike | ccstatusline (sirmalloc) | CCometixLine | claude-powerline |
|---|---|---|---|---|
| Config | JSONC + zod, 3-level cascade | JSON + React/Ink TUI | TOML + Rust TUI | JSON, 3-level cascade |
| Widgets | ~20, sized for solo use | 50+ | built-in themes (minimal/gruvbox/nord/powerline) | 4 styles, several themes |
| Perf | ~15-20ms, no transcript parsing | 60-80% CPU documented (reparses the whole JSONL on every render) | native Rust, fast | no dependency, lightweight |
| Cost history | local SQLite, day/week | no (recomputed on every call) | no | no |
| Responsive | real width + per-segment priority | width detection with a known `tput`/Windows bug | not documented | CSS-Grid-style grid with breakpoints, more advanced on this specific point |
| Bars/sparklines | deliberately absent | yes (blocks and gradients) | yes | yes |
| Setup | zero dependency on the render path | `npx -y @latest` on every message (documented supply-chain risk) | compiled binary | zero dependency |

What we do better: latency, persistent cost history, readable gauges
without visual noise, config that never breaks the render. What others do
better: ccstatusline has substantially more widgets and an established
theme ecosystem; claude-powerline has a more mature responsive layout
engine (CSS-Grid-style breakpoints, whereas we settle for a per-segment
priority system); CCometixLine has a config TUI with a live preview
compiled in Rust, visually more polished than our plain-text ANSI menu.

## Development

```bash
bun test                                  # full suite
bunx biome check --write src __tests__    # lint + format
bunx tsc --noEmit                         # strict typecheck
bun run start < fixtures/normal.json      # manual test with a payload
bun run config                            # config CLI with live preview
```

`__tests__/integration.test.ts` isolates all its writes via
`CCSTATUSLINE_DATA_DIR`/`CCSTATUSLINE_CACHE_DIR` pointed at temporary
directories — never at real data. A perf test keeps the `normal.json`
fixture render under 250ms.

See `SPEC.md` for the history of the initial design (partially outdated —
the original 2-line render became 3 lines + a 4th in alert mode after
iterating with the user).

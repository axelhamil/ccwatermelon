# ccwatermelon

Claude Code status line: JSON payload on stdin, 3 lines of ANSI out (4 when the quotas do not fit on one). Bun + TypeScript, one runtime dependency (zod).

## This checkout is the live install

`~/.claude/settings.json` runs `src/index.ts` from this directory at every render, so any edit is live immediately and the real data is `~/.local/share/ccwatermelon/history.db` and `~/.cache/ccwatermelon/limits.json`.

- Never run `src/index.ts` bare: it writes the payload's cost into the real history. Always sandbox it:
  `HOME=$T CLAUDE_CONFIG_DIR=$T CCWATERMELON_DATA_DIR=$T/data CCWATERMELON_CACHE_DIR=$T/cache COLUMNS=100 bun src/index.ts < fixtures/statusline/normal.json`
- Never `git stash` or switch branch here while a session is open, the status line would run the other code.
- A schema change in `src/cost/history.ts` migrates the real database on the next render: back it up (`sqlite3 history.db ".backup ..."`), make it idempotent, then check with `sqlite3 -readonly`.
- Change a function signature and all its callers in one write. A half-applied edit runs live: a `History` method called with shifted arguments would write garbage into the real cost history.

## Commands

- `bun test`: full suite, `bun test __tests__/quota` for one domain
- `bun run lint`: Biome check, `bunx biome check --write .` to fix
- `bun run typecheck`, `bun run knip`
- `bun run config`: full-screen config editor (needs a TTY)
- `bun run previews`: regenerate `docs/previews/*.svg` from the real renderer, CI fails if they are stale
- Use `bun` and `bunx` only: `pnpm exec` drops a stray `pnpm-lock.yaml`.

Done means the four checks are green, and `bun run previews` rerun when the output changed. Versions and tags come from semantic-release in CI, never by hand. The `pre-commit` hook and CI run the same four, `commit-msg` enforces Conventional Commits.

## Layout

Entry points stay at the root of `src/` (their paths are in users' `settings.json`), everything else lives in one folder per domain, with `__tests__/` and `fixtures/` mirroring it.

- `src/index.ts` (status line), `src/subagents.ts` (subagent rows), `src/cli.ts` (config editor), `src/refresh-limits.ts` (detached usage refresh)
- `src/statusline/`: `payload.ts` (zod schema of stdin, every field fails on its own), `data.ts` (`StatuslineData`, `Clock`), `collect.ts` (builds `StatuslineData`), `segments.ts` (declarative table of the optional segments), `render.ts` + `fit.ts` (lines and width fitting), `gauge.ts`, `mood.ts`
- `src/quota/`: `rateLimits.ts` (schema and types of the windows), `limits.ts` (quotas from the payload, missing windows filled from the disk cache), `pace.ts`, `forecast.ts`, `reset.ts`, `pressure.ts` (one alert threshold per gauge gives its level, which drives colour, pulse and mood)
- `src/cost/`: `history.ts` (SQLite: samples, per-day costs, active sessions), `sample.ts`, `burn.ts`, `migrate.ts`
- `src/context/compaction.ts`, `src/git/git.ts`
- `src/terminal/`: `format.ts` (palette, colours, links), `width.ts` (visual width), `sanitize.ts`
- `src/config/`: `constants.ts` (paths and constants), `userConfig.ts`, `segmentConfig.ts`, `json.ts`
- `src/editor/`: `state.ts` (pure state and key handling), `view.ts` (pure drawing)
- `src/subagents/`: `payload.ts`, `row.ts` (pure rendering of the subagent rows)
- `scripts/previews.ts`: ANSI to animated SVG for the README

## Rules of this codebase

- The 7-day gauge must never disappear: the quotas share one line while it fits, otherwise one row each, and width then only removes columns (`COLUMN_SETS` in `render.ts`), the same ones on both rows so they stay aligned.
- Claude Code trims leading spaces of a status line row: indent a continuation row with braille blanks (`\u{2800}`), never spaces.
- No network and nothing slow on the render path, Claude Code kills the script when the next render starts. The usage API is only called by `src/refresh-limits.ts`, detached.
- Everything read from outside (stdin, cache, API, `settings.json`, config) goes through a zod schema. A bad field degrades one segment, never the whole line.
- No comments in code, no em dash or en dash anywhere (code, messages, README).
- Nerd Font icons are written as `\u{f0128}` escapes, never pasted: they are invisible in most editors and get lost in a rewrite.
- A new file goes in the folder of its domain, never in a catch-all `lib/`, `utils/` or `types.ts`. A type lives with the code that produces it, and only `statusline/` and `editor/` may import the other domains.
- Motion is a pure function of `Clock.beat` (the wall clock second, frozen at 0 when the `motion` segment is off), designed for one frame per second: no state, no timer.
- To add an optional segment, add one entry to `OPTIONAL_SEGMENTS` and a row in the README table.

## Facts about the payload (Claude Code docs)

- `rate_limits.five_hour` and `seven_day` can each be absent, and Claude Code drops a window once its `resets_at` has passed. `resets_at` is epoch seconds.
- Claude Code sets `COLUMNS` to the terminal width, the script cannot detect it itself.
- `context_window.total_output_tokens` is per response, not cumulative: there is no way to compute a real tokens per second.
- `current_usage` is `null` before the first API call and right after `/compact`.
- `autoCompactWindow` in `settings.json` is a token count, or `"auto"`.

## Testing

- Tests are given / when / then on behaviour, with ports replaced by `mock()` from `bun:test` (see `resolveLimits` and its injected `refresh`).
- `bun test` shares one module registry across files: never capture an env var at module load. `CONFIG.paths` are getters for that reason, set the env at the top of the test file.
- Tests must stay hermetic: point `HOME`, `CLAUDE_CONFIG_DIR`, `CCWATERMELON_DATA_DIR` and `CCWATERMELON_CACHE_DIR` at a temp dir.

## Upgrades

- `biome migrate` rewrote `recommended: true` as `"preset": "none"`, which silently disables linting. Check `biome.json` after any migration.

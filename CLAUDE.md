# ccwatermelon

Claude Code status line, companion to Burnrate (`~/DEV/perso/burnrate`): JSON payload on stdin, 1 to 3 lines of ANSI out. Burnrate's band owns quotas, projections, budget and dollar costs, never add them back here. Bun + TypeScript, one runtime dependency (zod).

## This checkout is the live install

`~/.claude/settings.json` runs `src/index.ts` from this directory at every render, so any edit is live immediately. It reads the real `~/.claude/settings.json` and `~/.config/ccwatermelon/config.jsonc`, and writes nothing.

- Run `src/index.ts` sandboxed so it reads no real config:
  `HOME=$T CLAUDE_CONFIG_DIR=$T COLUMNS=100 bun src/index.ts < fixtures/statusline/normal.json`
- Never `git stash` or switch branch here while a session is open, the status line would run the other code.
- Change a function signature and all its callers in one write, a half-applied edit runs live.
- Old data dirs (`~/.local/share/ccwatermelon`, `~/.cache/ccwatermelon`) are no longer used: leave them, never delete user data.

## Commands

- `bun test`: full suite, `bun test __tests__/statusline` for one domain
- `bun run lint`: Biome check, `bunx biome check --write .` to fix
- `bun run typecheck`, `bun run knip`
- `bun run config`: full-screen config editor (needs a TTY)
- `bun run previews`: regenerate `docs/previews/*.svg` from the real renderer, CI fails if they are stale
- Use `bun` and `bunx` only: `pnpm exec` drops a stray `pnpm-lock.yaml`.

Done means the four checks are green, and `bun run previews` rerun when the output changed. Versions and tags come from semantic-release in CI, never by hand. The `pre-commit` hook and CI run the same four, `commit-msg` enforces Conventional Commits.

## Layout

Entry points stay at the root of `src/` (their paths are in users' `settings.json`), everything else lives in one folder per domain, with `__tests__/` and `fixtures/` mirroring it.

- `src/index.ts` (status line), `src/subagents.ts` (subagent rows), `src/cli.ts` (config editor)
- `src/statusline/`: `payload.ts` (zod schema of stdin, every field fails on its own), `data.ts` (`StatuslineData`, `Clock`), `collect.ts` (builds `StatuslineData`), `segments.ts` (declarative table of the optional segments), `render.ts` (core identity parts) + `fit.ts` (flow over at most 3 lines, priority drop), `gauge.ts`, `mood.ts` (from the context pressure only)
- `src/context/`: `compaction.ts`, `pressure.ts` (one alert threshold gives the context level, which drives colour, pulse and mood)
- `src/git/git.ts`
- `src/terminal/`: `format.ts` (16-colour SGR, links, `formatPct` like Burnrate), `width.ts` (visual width), `sanitize.ts`
- `src/config/`: `constants.ts` (paths and constants), `userConfig.ts`, `segmentConfig.ts`, `json.ts`
- `src/editor/`: `state.ts` (pure state and key handling), `view.ts` (pure drawing)
- `src/subagents/`: `payload.ts`, `row.ts` (pure rendering of the subagent rows)
- `scripts/previews.ts`: ANSI to animated SVG for the README

## Rules of this codebase

- Style follows Burnrate's band: the 16 basic ANSI colours only (never truecolor, the terminal theme applies), labels dim, values in the default colour, green / yellow / red only for a status. Segments are 3 spaces apart, no separator glyph.
- Layout: segments in table order fill line 1 first and flow to the next line, at most 3 lines and never an empty one; beyond 3, the lowest priority optional segments leave first. Mood, directory, branch and model are core and never leave.
- Claude Code trims leading spaces of a status line row: indent a continuation row with braille blanks (`\u{2800}`), never spaces.
- No network, no disk write and nothing slow on the render path, Claude Code kills the script when the next render starts.
- Everything read from outside (stdin, `settings.json`, config) goes through a zod schema. A bad field degrades one segment, never the whole line. Unknown config keys (from older versions) are stripped, never an error.
- No comments in code, no em dash or en dash anywhere (code, messages, README).
- Nerd Font icons are written as `\u{f0128}` escapes, never pasted: they are invisible in most editors and get lost in a rewrite.
- A new file goes in the folder of its domain, never in a catch-all `lib/`, `utils/` or `types.ts`. A type lives with the code that produces it, and only `statusline/` and `editor/` may import the other domains.
- Motion is a pure function of `Clock.beat` (the wall clock second, frozen at 0 when the `motion` segment is off), designed for one frame per second: no state, no timer.
- To add an optional segment, add one entry to `OPTIONAL_SEGMENTS` and a row in the README table.

## Facts about the payload (Claude Code docs)

- Claude Code sets `COLUMNS` to the terminal width, the script cannot detect it itself.
- `context_window.total_output_tokens` is per response, not cumulative: there is no way to compute a real tokens per second.
- `current_usage` is `null` before the first API call and right after `/compact`.
- `autoCompactWindow` in `settings.json` is a token count, or `"auto"`.

## Testing

- Tests are given / when / then on behaviour, with ports replaced by `mock()` from `bun:test`.
- `bun test` shares one module registry across files: never capture an env var at module load. `CONFIG.paths` are getters for that reason, set the env at the top of the test file.
- Tests must stay hermetic: point `HOME` and `CLAUDE_CONFIG_DIR` at a temp dir.

## Upgrades

- `biome migrate` rewrote `recommended: true` as `"preset": "none"`, which silently disables linting. Check `biome.json` after any migration.

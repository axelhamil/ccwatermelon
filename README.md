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
    "command": "bun /home/axel/.claude/scripts/statusline-godlike/src/index.ts",
    "padding": 0
  }
}
```

## Test

```bash
bun test
bun run start < fixtures/normal.json
```

# cache-hit

Very Simple opencode TUI plugin that shows prompt-cache hit rate in a popup dialog.

Open it with the `/cache-hit` command (or the `cache-hit.show` command) while inside a session.

## What it shows

- Overall cache hit % for the active session
- Per-model breakdown (hit %, message count, input tokens)
- Totals across the main session including its subagents
- Subagent list with individual hit rates

Cache hit rate is computed as:

```
hit = cache read / (input + cache read)
```

Cache write is a one-time priming cost and is excluded from the hit ratio. The plugin also reports how many API calls read from the cache.

## Install

Copy the plugin into your opencode config and register it in `~/.config/opencode/tui.json`:

```json
{
  "plugin": ["./tui-plugins/cache-hit.tsx"]
}
```

A copy of `tui.json` is kept as `tui.json.example` in this repo.

Then restart opencode and run `/cache-hit` inside a session.

## Files

- `tui-plugins/cache-hit.tsx` — the TUI plugin
- `tui.json.example` — registration config example

## Documentation

- [index](docs/index.md) — overview
- [installation](docs/installation.md) — how to install the plugin
- [usage](docs/usage.md) — how to use the plugin
- [how-it-works](docs/how-it-works.md) — how the plugin collects the data
- [colors](docs/colors.md) — how the plugin colors the rate
- [troubleshooting](docs/troubleshooting.md) — how to fix common errors

# cache-stats

cache-stats is an OpenCode V2 CLI/TUI plugin for version 2.1.4. It shows the cache hit rate for a session. When you run `/cache-stats`, the plugin opens a dialog. It does not call a model. For OpenCode V1, use the [`v1` branch](https://github.com/nmdra/opencode-cache-stats/tree/v1).

Use the plugin to see how much prompt input comes from the cache. A high cache hit rate means a lower session cost.

## How the rate works

The plugin uses this formula:

```
hit = cache read / (input + cache read)
```

The cache hit rate uses token counts from messages in the session and its subagents. A cache write is a one-time priming cost. The cache hit rate does not include cache writes.

Only assistant steps with recorded usage count as requests. The plugin reports compaction separately and excludes other auxiliary calls. It reads all pages, including history before compaction. The V2 version adds live refresh, All/Main/Subagents filters, a recent-request trend, a sidebar indicator, and Markdown/JSON clipboard reports.

The plugin shows a word and a color for the cache hit rate. The word is `Excellent` at 90% or more. The word is `Good` at 70% to 89%. The word is `Fair` at 40% to 69%. The word is `Poor` below 40%. See `docs/colors.md` for the color mapping.

## Documents

- `docs/installation.md` — how to install the plugin
- `docs/usage.md` — how to use the slash command and read the dialog
- `docs/how-it-works.md` — how the plugin collects data and calculates statistics
- `docs/colors.md` — how the plugin uses colors for the cache hit rate
- `docs/troubleshooting.md` — how to fix common errors

Read `docs/installation.md` first.

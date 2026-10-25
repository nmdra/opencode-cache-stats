# cache-stats

cache-stats is an OpenCode V2 CLI/TUI plugin, targeting version 2.1.4. It shows the cache rate of a session. It opens a dialog when you run `/cache-stats` and does not invoke a model. OpenCode V1 users should use the [`v1` branch](https://github.com/nmdra/opencode-cache-stats/tree/v1).

You use it to see how much of the prompt input comes from the cache. A high rate means a lower cost for the session.

## How the rate works

The plugin uses this formula:

```
hit = cache read / (input + cache read)
```

The rate uses the token counts of the session. The counts come from the messages of the session and its subagents. Cache write is a one-time priming cost, so it is not part of the rate.

Only assistant steps with recorded usage count as requests. Compaction is reported separately and other auxiliary calls are excluded. All pages are read, including pre-compaction history. The V2 version adds live refresh, All/Main/Subagents filters, a recent-request trend, a sidebar indicator, and Markdown/JSON clipboard reports.

The plugin shows a verdict word and a color for the rate. The word is `Excellent` at 90% or more. The word is `Good` at 70% to 89%. The word is `Fair` at 40% to 69%. The word is `Poor` below 40%. The mapping is in `docs/colors.md`.

## Documents

- `docs/installation.md` — how to install the plugin
- `docs/usage.md` — how to use the slash command and read the dialog
- `docs/how-it-works.md` — how the plugin collects and computes the data
- `docs/colors.md` — how the plugin shows the rate with colors
- `docs/troubleshooting.md` — how to fix common errors

Read `docs/installation.md` first.

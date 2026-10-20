# /cache-stats

/cache-stats is a lightweight TUI plugin for opencode that displays the active session's cache statistics in a popup dialog. It provides the overall cache hit rate, a breakdown by model and subagent, and the associated costs, making it easy to understand cache performance at a glance. The plugin works with opencode v1 and opencode v2.

> Run the `/cache-stats` command (or the `cache-stats.show` command) inside a session to open the dialog.

| Summary and models | Totals breakdown | Subagents |
|:---:|:---:|:---:|
| ![Session summary and models](assets/preview-summary.jpeg) | ![Grouped totals](assets/preview-totals.jpeg) | ![Subagent list](assets/preview-subagents.jpeg) |

## What it shows

The dialog shows:

- The overall cache hit percentage of the active session. A hit bar and a verdict word (Excellent, Good, Fair, or Poor) show the level.
- A session summary: total requests, model count, subagent count, total tokens, and total cost.
- A per-model breakdown with hit bars, hit percentages, and token totals.
- Grouped totals for tokens, requests, and cost. The totals include percentages and averages per request.
- A subagent list with the hit rate of each subagent and the model that each subagent used.

The plugin computes the cache hit rate with this formula:

```
hit = cache read / (input + cache read)
```

A cache write is a one-time priming cost. It is excluded from the hit ratio. The plugin also reports the number of API requests that read from the cache.

## Install

The install steps are different for opencode v1 and opencode v2. Follow the part for your version.

### opencode v1

1. Copy the plugin into `~/.config/opencode/tui-plugins/`.
2. Register the plugin in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./tui-plugins/cache-stats.tsx"]
}
```

The repo keeps a copy of `tui.json` as `tui.json.example`.

If you already use the plugin on opencode v1, copy the new file over the old one. The `tui.json` entry stays the same.

After you change `tui.json`, restart [opencode](https://opencode.ai). Then run the `/cache-stats` command inside a session.

### opencode v2

1. Create the plugin folder.

```
mkdir -p ~/.config/opencode/plugins/cache-stats
```

2. Copy the plugin file into the folder and rename it to `tui.tsx`.

```
cp tui-plugins/cache-stats.tsx ~/.config/opencode/plugins/cache-stats/tui.tsx
```

No config change is needed. Restart [opencode](https://opencode.ai). Then run the `/cache-stats` command inside a session.

The folder must contain a file named `tui.tsx`. Do not put files named `index` or `server` in the folder. See the [installation guide](docs/installation.md) for details.

## Development

```
bun install
bun test
bun run typecheck
```

The tests and the type check cover both the opencode v1 and the opencode v2 plugin API.

## Documentation

- [index](docs/index.md) — overview
- [installation](docs/installation.md) — how to install the plugin
- [usage](docs/usage.md) — how to use the plugin
- [how-it-works](docs/how-it-works.md) — how the plugin collects the data
- [colors](docs/colors.md) — how the plugin colors the rate
- [troubleshooting](docs/troubleshooting.md) — how to fix common errors

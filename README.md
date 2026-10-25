# /cache-stats

/cache-stats is a lightweight CLI/TUI plugin for **OpenCode V2**. It displays the active session's cache statistics in a popup dialog, with a breakdown by model and subagent, token totals, and recorded costs.

This branch targets OpenCode **2.1.4**. For OpenCode V1, use the [`v1` branch](https://github.com/nmdra/opencode-cache-stats/tree/v1).

> Run the `/cache-stats` command (or the `cache-stats.show` command) inside a session to open the dialog.

The screenshots below show the legacy V1 layout. V2 uses a compact tabbed dialog.

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
- Live refresh, with **All / Main / Subagents** filters and a trend for the latest 25 recorded requests.
- Compaction tokens and cost in a separate section, without changing assistant-only request totals.
- A sidebar cache indicator and Markdown/JSON clipboard reports.

The plugin computes the cache hit rate with this formula:

```
hit = cache read / (input + cache read)
```

A cache write is a one-time priming cost. It is excluded from the hit ratio. The plugin also reports the number of API requests that read from the cache.

Requests mean assistant steps with recorded usage, not individual retry attempts. **All** includes the active session and all descendants, including history before compaction. Compaction is reported separately; title generation and other auxiliary calls are excluded. The open dialog refreshes at step boundaries and marks retained data as stale if a refresh fails.

The popup opens on **Summary**, with compact totals and a spaced recent-request trend. **Tab** / **Shift+Tab** switch between Summary, Models, Usage, and Agents. The scope filter, overall cached token hit rate, and status stay visible while scrolling. Empty compaction sections and repeated accounting notes are omitted; details remain available in Help.

**f** cycles scope, **r** refreshes, **m** copies Markdown, **j** copies JSON, and **h** opens help. Up/Down and Page Up/Page Down scroll; Home/End jump; Escape closes. Reports cover the whole selected scope, regardless of the visible tab. Exports require terminal OSC 52 clipboard support and include session metadata but no prompts, tool outputs, or compaction summaries.

## Install

1. Copy the V2 plugin directory (not a single TSX file):

```sh
mkdir -p ~/.config/opencode/plugins/cache-stats
cp plugins/cache-stats/{package.json,tui.tsx,view.tsx,presentation.ts,controller.ts,collect.ts,stats.ts,live.ts,report.ts,sidebar.tsx} \
  ~/.config/opencode/plugins/cache-stats/
```

2. Add it to `plugins` in the global `~/.config/opencode/cli.json`, preserving other settings:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["./plugins/cache-stats"]
}
```

Use `$XDG_CONFIG_HOME/opencode` instead when `XDG_CONFIG_HOME` is set. OpenCode also discovers this global plugin directory automatically; the explicit entry makes enablement clear. No server plugin or npm installation is needed for this local install.

See [`cli.json.example`](cli.json.example). Config changes reload automatically; use `/reload` if needed. Open a session, then run `/cache-stats`.

The sidebar indicator is enabled by default and uses assistant-only totals for the selected session and descendants. To disable it, use an options entry in `cli.json`:

```json
{
  "plugins": [{ "package": "./plugins/cache-stats", "options": { "sidebar": false } }]
}
```

## Development

Use Node.js 26.4 or newer (required by the OpenTUI development dependencies).

```sh
npm ci
npm test
npm run typecheck
```

The plugin uses the terminal's connected client, including with remote servers. It does not read the local OpenCode database or start a separate service.

## Documentation

- [index](docs/index.md) — overview
- [installation](docs/installation.md) — how to install the plugin
- [usage](docs/usage.md) — how to use the plugin
- [how-it-works](docs/how-it-works.md) — how the plugin collects the data
- [colors](docs/colors.md) — how the plugin colors the rate
- [troubleshooting](docs/troubleshooting.md) — how to fix common errors
- [V2 API references](docs/how-it-works.md#references) — official documentation and the targeted client contract

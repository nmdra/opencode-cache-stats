# Troubleshooting

## The command is missing or the dialog does not appear

- Check `opencode --version`. This branch targets V2 **2.1.4**; V1 users need the [`v1` branch](https://github.com/nmdra/opencode-cache-stats/tree/v1).
- Copy the complete plugin directory, including `package.json` and all nine runtime modules (including `presentation.ts`).
- Check the `plugins` entry in the global `cli.json`. It must name a directory, such as `./plugins/cache-stats`, not a TSX file.
- Use `/reload`, then try `/cache-stats` inside a session. Config changes normally reload automatically.
- Check OpenCode's plugin diagnostics and `~/.local/share/opencode/log/opencode.log` for loading errors. Redact credentials and session contents before sharing logs.

## The dialog shows “No active session.”

Open a session first. The plugin measures the session currently shown in the terminal.

## The plugin cannot read complete statistics

Check the connected server and try again. With a remote server, check its connection rather than the local database. A failed metadata, assistant/compaction page, or child-session request prevents a first open. During live refresh, the plugin retains its last complete snapshot and marks it **Stale**; press **r** to retry. It intentionally does not replace missing history with cached TUI data.

## There is no rate, or assistant steps lack usage

`n/a` means fresh input plus cache reads is zero. An empty session or scope has no assistant statistics. While streaming, usage may not be recorded yet; the dialog updates at step boundaries. Failed steps may never receive usage and remain excluded from totals without a popup notice.

## Numbers differ from OpenCode's session totals

This dialog counts recorded assistant steps, reports compaction separately, and excludes title generation and other auxiliary model calls. Its request count does not count every retry attempt. Check the selected scope. See [usage scope](how-it-works.md#usage-scope).

The models list and overall totals both include the active session and all descendants. Each subagent row includes its descendants too, so subagent rows can overlap. Do not add overlapping rows together.

Each live refresh is a snapshot across several API calls, not a transaction. Press **r** after concurrent work finishes for a newer reading.

## Clipboard export does not paste

The terminal must allow OSC 52 clipboard writes. A success toast confirms dispatch, not acceptance by the terminal. Enable clipboard support in the terminal or SSH/tmux setup. Unsupported/inactive terminals and reports over 256 KiB show an error toast rather than claiming a successful copy.

## The sidebar indicator is missing

The plugin does not force OpenCode's sidebar to open. Make it visible using OpenCode's settings and ensure the plugin's `sidebar` option is not `false`. The indicator always shows All-scope assistant usage. If it shows unavailable or stale, check the server connection.

## The dialog is long or the terminal is narrow

Use Tab or Left/Right to select a view rather than scrolling through every section. Up/Down and Page Up/Page Down scroll that view; Home/End jump. Names are truncated to available terminal cells while values remain right-aligned. Narrow layouts use stacked metrics and shortened labels. Below 28 × 12, resize as requested. Escape always closes the popup.

Compaction is omitted when there are no compaction messages. Help (**h**) contains the full key list, accounting notes, and hit-level legend, keeping the statistics views and footer short.

## Colors look different

Colors come from V2's semantic theme tokens. Change the terminal theme using OpenCode's settings. The dialog follows the active theme; no logout or service restart is required.

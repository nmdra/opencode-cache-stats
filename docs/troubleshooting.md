# Troubleshooting

## The command is missing or the dialog does not appear

- Check `opencode --version`. This branch targets V2 **2.1.4**. For V1, use the [`v1` branch](https://github.com/nmdra/opencode-cache-stats/tree/v1).
- Copy the complete plugin directory, including `package.json` and all nine runtime modules (including `presentation.ts`).
- Check the `plugins` entry in the global `cli.json`. It must name a directory, such as `./plugins/cache-stats`, not a TSX file.
- Use `/reload`. Then try `/cache-stats` inside a session. Configuration changes normally reload automatically.
- Check OpenCode's plugin diagnostics and `~/.local/share/opencode/log/opencode.log` for loading errors. Before you share logs, redact credentials and session contents.

## The dialog shows “No active session.”

Open a session first. The plugin measures the session shown in the terminal.

## The plugin cannot read complete statistics

Check the connected server. Then try again. For a remote server, check the server connection, not the local database. If the initial collection fails on a metadata, assistant/compaction page, or child-session request, the dialog does not open. If a live refresh fails, the plugin keeps the last complete snapshot and marks it **Stale**. Press **r** to retry. The plugin does not replace missing history with cached TUI data.

## There is no rate, or assistant steps lack usage

`n/a` means that fresh input plus cache reads is zero. An empty session or scope has no assistant statistics. During streaming, usage may not be recorded yet. The dialog updates at step boundaries. Failed steps may never receive usage. If a failed step has no usage, the plugin excludes that step from totals without a notice in the dialog.

## Numbers differ from OpenCode's session totals

The dialog counts recorded assistant steps. It reports compaction separately and excludes title generation and other auxiliary model calls. The request count does not include every retry attempt. Check the selected scope. See [usage scope](how-it-works.md#usage-scope).

The model list and overall totals both include the active session and all descendants. Each subagent row also includes that subagent's descendants. Thus, subagent rows can overlap. Do not add overlapping rows together.

Each live refresh is a snapshot from several API calls. It is not a transaction. After concurrent work finishes, press **r** for a newer reading.

## Clipboard export does not paste

The terminal must allow OSC 52 clipboard writes. A success toast confirms that the clipboard sequence was queued. It does not confirm that the terminal accepted the sequence. Enable clipboard support in the terminal or SSH/tmux setup. Unsupported or inactive terminals and reports over 256 KiB show an error toast, not a successful copy message.

## The sidebar indicator is missing

The plugin does not force OpenCode's sidebar to open. Use OpenCode's settings to make the sidebar visible. Make sure that the plugin's `sidebar` option is not `false`. The indicator always shows assistant usage in All scope. If the indicator shows unavailable or stale data, check the server connection.

## The dialog is long or the terminal is narrow

Use Tab or Left/Right to select a view instead of scrolling through every section. Use Up/Down and Page Up/Page Down to scroll the selected view. Use Home/End to move to the first or last row. The dialog shortens names to fit the available terminal cells. Values stay aligned to the right. Narrow layouts show metrics in a single column and use shorter labels. Below 28 × 12, resize the terminal as requested. Escape always closes the dialog.

If no compaction messages exist, the dialog does not show compaction. Help (**h**) contains the full key list, accounting notes, and cache hit level legend. This keeps the statistics views and footer short.

## Colors look different

Colors come from V2's semantic theme tokens. To change the terminal theme, use OpenCode's settings. The dialog follows the active theme. You do not need to log out or restart a service.

# Troubleshooting

## The command is missing or the dialog does not appear

- Check `opencode --version`. This branch targets V2 **2.1.4**; V1 users need the [`v1` branch](https://github.com/nmdra/opencode-cache-stats/tree/v1).
- Copy the complete plugin directory, including `package.json` and all runtime modules.
- Check the `plugins` entry in the global `cli.json`. It must name a directory, such as `./plugins/cache-stats`, not a TSX file.
- Use `/reload`, then try `/cache-stats` inside a session. Config changes normally reload automatically.
- Check OpenCode's plugin diagnostics and `~/.local/share/opencode/log/opencode.log` for loading errors. Redact credentials and session contents before sharing logs.

## The dialog shows “No active session.”

Open a session first. The plugin measures the session currently shown in the terminal.

## The plugin cannot read complete statistics

Check the connected server and try again. With a remote server, check its connection rather than the local database. A failed metadata, message, or child-session request prevents the dialog from opening. The plugin intentionally does not replace missing history with cached TUI data.

## There is no rate, or assistant steps lack usage

`n/a` means fresh input plus cache reads is zero. An empty session has no statistics. While streaming, usage may not be recorded yet; reopen after the step finishes. Failed steps may never receive usage, and the dialog warns when it excludes them.

## Numbers differ from OpenCode's session totals

This dialog counts recorded assistant steps and excludes compaction, title generation, and other auxiliary model calls. Its request count does not count every retry attempt. See [usage scope](how-it-works.md#usage-scope).

The models list and overall totals both include the active session and all descendants. Each subagent row includes its descendants too, so subagent rows can overlap. Do not add overlapping rows together.

The dialog is a snapshot. Reopen it after concurrent work finishes to obtain a newer reading.

## The dialog is long or the terminal is narrow

Use Up/Down or Page Up/Page Down to scroll, and Escape to close. Long names are shortened. Widen the terminal if fixed-width model or subagent rows are clipped.

## Colors look different

Colors come from V2's semantic theme tokens. Change the terminal theme using OpenCode's settings. The dialog follows the active theme; no logout or service restart is required.

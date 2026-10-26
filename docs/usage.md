# Use the plugin

Open a session. Run `/cache-stats` or select **Cache stats** in the command palette (`cache-stats.show`). The 60-column dialog is centered. It opens on **Summary** with **All** scope selected. The dialog refreshes while open.

## Controls

| Control | Action |
| --- | --- |
| Tab / Shift+Tab, or Right / Left | Open the next / previous view |
| Click a view label | Open Summary, Models, Usage, or Agents |
| `f` or click a scope | Switch between All, Main, and Subagents |
| `r` or click the status line | Refresh immediately |
| `m` / `j` | Copy Markdown / JSON for the whole selected scope |
| `h` or click Help | Open help / return to the previous view |
| Up/Down, Page Up/Page Down | Scroll the active view |
| Home / End | Move to the first / last row |
| Escape or click `esc` | Close the dialog |

When you change a view or scope, the body returns to the top. Live updates keep the active view and scope. The header, scope controls, cache hit rate, and footer stay visible when you scroll the body. When scrolling is necessary, an indicator shows the row range.

## Views

### Summary

The header shows `Cache Stat | session title` on one line. It shortens long titles to leave space for Help and Escape. The six main metrics are requests, models, subagents, tokens, cache reads, and cost. These metrics use two compact columns when space is available. The header bar uses green for cache hits and red for cache misses. The miss percentage appears next to the bar. Partial cells show small miss fractions. If usage is unavailable, the bar uses neutral colors.

**Recent 25** shows up to 25 recorded assistant requests, from oldest to newest. A taller glyph means a higher cache hit rate. A dot means `n/a`. The percentage for the displayed samples is token-weighted. It is not an average of request percentages.

The summary fits without scrolling at normal terminal sizes. On narrow terminals, the metrics appear in a single column. The trend shows fewer samples and recalculates its percentage for the visible samples. If compaction is recorded, a separate line shows its cost. Usage contains the full compaction details.

### Models

Each model card shows the model name, provider, cache hit rate, request count, tokens, and recorded cost. The dialog shortens long names to fit the available terminal cells. The numbers stay on the screen. Models are sorted by cache hit rate, then request count. On narrow terminals, the dialog does not show the small progress line. It always shows the numeric rate.

### Usage

The view shows detailed token counts and shares first. It then shows counts of requests with cache reads, averages per request, and recorded USD costs. The **Share** column gives a percentage of total tokens. It does not use the cache hit rate denominator. **Requests with cache reads** is a different measure from the cache hit rate in the header.

If compaction messages exist, a separate section shows compaction counts, tokens, and cost. Otherwise, the view does not show this section. The combined cost includes assistant usage and recorded compaction usage. It excludes title generation and other auxiliary calls. Help explains accounting limits and how retries are counted. The main views do not repeat these details.

Costs do not use an approximation marker. Small nonzero amounts keep extra precision. Amounts below the display threshold show `<$0.00001`, not zero.

### Agents

Each subagent card shows its name, session ID, dominant model, cache hit rate, ratio of requests with cache reads, tokens, and cost. Each row includes that subagent's descendants. Rows can overlap. Do not add all rows to calculate the overall total.

Main scope excludes subagents. Its empty Agents view explains this and includes a **Show All scope** action. If the session tree has no subagents, the view explains that subagents appear when they run.

## Scope and data status

- **All:** the selected session and every descendant, each counted once.
- **Main:** only the selected session, even if that session is a subagent.
- **Subagents:** all descendants, excluding the selected session.

Every metric and report uses the selected scope. Requests are assistant steps with recorded tokens, not individual retry attempts. Assistant totals exclude compaction. The plugin excludes missing usage. It does not treat missing usage as zero.

The status line shows the time of the last successful update or the refresh/retry state. After a failed refresh, it shows **Stale**. Steps without usage remain excluded. The dialog does not show a notice for these steps. Help and exported reports explain the accounting. Press **r** to retry. Empty scopes show guidance instead of many zero values.

## Sidebar and reports

When OpenCode's sidebar is visible, **Cache** shows assistant usage for the selected session tree in All scope. Click **Cache** to open the dialog. To disable the indicator, use the plugin option `sidebar: false` in `cli.json`.

Reports include the whole selected scope, not only the active view. They contain session titles/IDs and usage figures, but no prompts, compaction summaries, or tool output. To copy a report, the terminal must support OSC 52. A success toast confirms that the clipboard sequence was queued. It does not confirm that the terminal accepted the sequence. A clipboard failure does not close the dialog.

## Small terminals

The dialog adjusts to the terminal width and height. It shortens tab labels when necessary. The session title shares the header row with the plugin name. The dialog shortens the title to fit the available space. If the terminal has fewer than 28 columns or fewer than 12 rows, the dialog asks you to resize the terminal. It does not show an unusable layout. Press Escape to close the dialog.

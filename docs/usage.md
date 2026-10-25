# Use the plugin

Open a session and run `/cache-stats`, or select **Cache stats** in the command palette (`cache-stats.show`). The centered, 60-column popup opens on **Summary** with **All** scope selected. It refreshes while open.

## Controls

| Control | Action |
| --- | --- |
| Tab / Shift+Tab, or Right / Left | Next / previous view |
| Click a view label | Open Summary, Models, Usage, or Agents |
| `f` or click a scope | Switch All, Main, or Subagents |
| `r` or click the status line | Refresh immediately |
| `m` / `j` | Copy Markdown / JSON for the entire selected scope |
| `h` or click Help | Open help / return to the previous view |
| Up/Down, Page Up/Page Down | Scroll the active view |
| Home / End | Jump to the first / last row |
| Escape or click `esc` | Close |

Changing a view or scope resets scrolling to the top. Live updates preserve the active view and scope. The header, scope controls, hit rate, and footer remain visible while the body scrolls. A row-range indicator appears when scrolling is needed.

## Views

### Summary

The header shows `Cache Stat | session title` on one line, trimming long titles to leave room for Help and Escape. The six main metrics—requests, models, subagents, tokens, cache reads, and cost—use two compact columns where space permits. The header bar uses green for cache hits and red for misses, with the miss percentage alongside it. Partial cells preserve small miss fractions; unavailable usage remains neutral. **Recent 25** shows up to 25 recorded assistant requests, oldest to newest. Higher glyphs mean better token cache hits; a dot means `n/a`. The window percentage is token-weighted, not an average of request percentages.

The summary fits without scrolling at normal terminal sizes. On narrow terminals the metrics stack and the trend displays fewer samples, with its percentage recalculated for those visible samples. Recorded compaction, when present, adds a separate cost line; full details are under Usage.

### Models

Each model card shows the model name, provider, token cache-hit rate, request count, tokens, and recorded cost. Long names are truncated by terminal cell width rather than pushing numbers off-screen. Models sort by hit rate, then request count. The small progress line is omitted on narrow terminals; the numeric rate is always retained.

### Usage

Detailed token counts and shares are followed by cached-request counts, averages per request, and recorded USD costs. The **Share** column is a percentage of total tokens, not the cache-hit denominator. **Requests with cache reads** is also a different measure from the token cache-hit percentage in the header.

Compaction counts, tokens, and cost appear separately only when compaction messages exist. Otherwise this section is omitted. Combined cost includes assistant plus recorded compaction usage, not title generation or other auxiliary calls. Accounting caveats and retry semantics are available in Help rather than repeated in the main views.

Costs do not use an approximation marker. Small nonzero amounts retain extra precision; amounts below the display threshold show `<$0.00001` rather than a misleading zero.

### Agents

Each subagent card includes its name, session ID, dominant model, cache-hit rate, cached-request ratio, tokens, and cost. Rows include their own descendants and can overlap; do not add all rows to reconstruct the overall total.

Main scope excludes subagents. Its empty Agents view explains this and offers a **Show All scope** action. An empty session tree instead explains that subagents will appear when they run.

## Scope and data status

- **All:** the selected session and every descendant, each counted once.
- **Main:** only the selected session, even if it is itself a subagent.
- **Subagents:** all descendants, excluding the selected session.

Every metric and report follows this filter. Requests mean assistant steps with recorded tokens, not individual retry attempts. Assistant totals exclude compaction; missing usage is excluded rather than treated as zero.

The status line shows the last successful update time, refreshing/retrying state, or **Stale** after a failed refresh. Steps without usage remain excluded without a popup notice; Help and exported reports explain the accounting. Press **r** to retry. Empty scopes give guidance rather than showing a wall of zero values.

## Sidebar and reports

When OpenCode's sidebar is visible, **Cache** shows All-scope assistant usage for the selected session tree. Click it to open the popup. Disable it with the plugin option `sidebar: false` in `cli.json`.

Reports include the entire selected scope regardless of the active view. They contain session titles/IDs and usage figures, but no prompts, compaction summaries, or tool output. Copying requires terminal OSC 52 support; a success toast confirms dispatch, not terminal acceptance. A clipboard failure does not close the popup.

## Small terminals

The dialog adapts to width and height and shortens tab labels when necessary. The session title shares the header row with the plugin name and is trimmed to available space. Below 28 columns or 12 rows it asks you to resize instead of rendering an unusable layout. Escape still closes it.

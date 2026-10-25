# How the V2 plugin works

The plugin is read-only. It uses the CLI's connected OpenCode client, so local and remote servers follow the same path. It does not query the local database, create sessions, or invoke a model.

## Data collection

The target is the session currently open in the terminal, not automatically its root parent. The collector:

1. Reads its metadata with `client.session.get({ sessionID })`.
2. Reads its entire assistant and compaction timelines with `client.message.list({ sessionID, type: "assistant" })` and `type: "compaction"`, retaining the type filter on every page.
3. Retrieves children with `client.session.list({ parentID: sessionID })` and repeats for every descendant.

All lists are paginated. The collector follows every `cursor.next` and lets session cursors carry their original filters. Duplicate message/session IDs and repeated cursors are guarded against. At most four sessions are read concurrently, with at most eight list requests in flight. The two message types are fetched sequentially per session, avoiding prompt and tool-output payloads.

`session.context()` is deliberately not used: it returns active context after the last compaction, which would undercount cumulative usage. Cached TUI messages are not a complete-history fallback. If any page fails, a first open reports an error; a live view retains its last complete snapshot and marks it stale.

## What counts as a request

V2 represents assistant steps as messages with `type: "assistant"`, `model`, and optional `tokens` and `cost`. There are no V1 `step-finish` parts to sum.

The dialog counts one request per distinct assistant message with recorded token usage. It includes failed or interrupted steps when usage was recorded. A message's retry metadata does not add requests: this is **recorded assistant-step usage, not an HTTP-attempt counter**.

Messages without token usage are excluded from usage totals and request counts without a popup notice. This can happen while streaming or after a failure. Exported reports retain the missing-usage count. A recorded zero-token step still counts as a request.

## Usage scope

The default **All** scope includes the active session and every descendant, including messages before compaction. **Main** includes only the selected session; **Subagents** includes each descendant once. Filters change summary totals, model groups, trends, compaction usage, and exports together. If opened inside a subagent, **Main** means that subagent, not its root parent.

Assistant totals exclude compaction messages. The separate **Compaction** section under Usage counts completed/failed compactions with recorded tokens and adds a combined assistant-plus-compaction cost. It is omitted when no compaction messages exist. Missing compaction usage is excluded without a popup notice. Title generation and other auxiliary calls remain excluded, so even combined cost can differ from OpenCode's broader session cost. These caveats are explained in Help instead of repeated in the statistics views.

## Live updates and sidebar

The plugin uses V2's `context.data.listen()` for step completion/failure, compaction, usage, session creation/deletion/rename, committed revert, and reconnect events. Events for unrelated session trees and streamed text/tool deltas do not trigger collection. Related bursts are coalesced for 750 ms. Events during a read queue a follow-up rather than overlapping refreshes.

The popup and sidebar share refresh work for the same selected session. A 30-second reconciliation while watched recovers missed events; **r** requests an immediate refresh. Failed refreshes retain a clearly marked stale snapshot. Each refresh reads complete paginated histories; long or wide session trees can take longer. No live view is a transaction across the entire tree.

The sidebar uses V2's `sidebar.content` slot, displays assistant-only family hit rate and request count, and opens the popup when clicked. It can be disabled with the plugin's `sidebar: false` option. Once no popup/sidebar is watching a session, its timers are cleared and in-flight reads are aborted. Unloading also removes the event listener and UI registrations.

## Recent-request trend

The trend retains at most 25 usage-bearing assistant messages per selected scope, ordered by completion time (creation time as a fallback). A taller glyph means a higher cache-hit rate; a dot means an undefined rate. Glyphs are separated to keep high-hit runs visually distinct. Narrow layouts show fewer samples and calculate the displayed window rate from those samples. Ties have deterministic session/message-ID ordering. The window cache-hit percentage is token-weighted, not an average of request percentages. Compactions and messages without usage do not enter the trend. Exports still retain up to 25 samples regardless of viewport width.

## Presentation and navigation

Summary, Models, Usage, and Agents share a fixed header and footer, with one scrollable body. Tab/Shift+Tab and Left/Right select views; **f** selects scope. View/scope changes reset the body to the top, while live updates do not change selection. **h** opens help in the same dialog, preserving the live subscription and the previous view.

Presentation helpers cap dialog width at the host's medium size and budget body height after reserving space for controls. The header places the session title alongside `Cache Stat |`, using native terminal-cell truncation for long or Unicode names. Flex rows right-align values without string-padding collisions. Recorded USD amounts retain precision for small nonzero values and do not use an approximation prefix. The hit-level legend lives in Help rather than occupying a permanent footer row.

## Reports and clipboard

**m** exports Markdown and **j** exports JSON for the current scope and last complete snapshot. Reports include capture time, stale status, assistant/compaction totals, models, recent requests, and subagent subtree rows. Maps are explicitly serialized to model arrays; undefined rates become JSON `null` or Markdown `n/a`.

Exports contain session titles/IDs, model identities, and usage figures, but never message bodies, prompts, tool output, or compaction summaries. Markdown metadata is escaped. Copying uses the exposed OpenTUI renderer's OSC 52 method; success means the sequence was queued, not that the terminal confirmed clipboard acceptance. Unsupported or inactive terminals and reports over 256 KiB produce an error toast. No files are written and no server-side clipboard is used.

## Tokens and cache rate

The V2 `TokenUsage.Info` fields are:

- `input`: fresh input tokens
- `cache.read`: cache-read tokens
- `cache.write`: cache-write tokens
- `output`: output tokens, excluding the separate reasoning count
- `reasoning`: reasoning tokens

Total tokens follow OpenCode's `TokenUsage.total`: the sum of those five fields. Invalid or negative numeric values contribute zero.

```text
hit = cache read / (fresh input + cache read)
```

Cache writes are excluded from this denominator. A zero denominator displays `n/a`. Request cache efficiency is a separate metric: requests with positive cache reads divided by recorded requests.

Counts accumulate over requests, so repeated reads of the same prefix can exceed the model's context window. Recorded costs are summed, not estimated from current model prices.

## Models and subagents

Models are grouped by provider ID and model ID; variants share the same row. The model list follows the selected scope. Models and subagents sort by cache hit rate, then request count.

Each subagent row includes its own descendants. Its model is the model used by the most recorded requests in that subtree. Subagent rows can therefore overlap; do not add their rows together to reconstruct the session total. Each session contributes to the overall total exactly once.

## References

- [V2 plugin migration](https://opencode.ai/v2/docs/build/plugins/migrate-v1)
- [CLI plugin API](https://opencode.ai/v2/docs/build/plugins/cli)
- [CLI plugin loading](https://opencode.ai/v2/docs/cli/plugins)
- [TypeScript client](https://opencode.ai/v2/docs/build/client)
- [OpenAPI specification](https://opencode.ai/v2/openapi.json)
- [OpenCode token accounting](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/token-usage.ts)
- [OpenTUI 0.6.8 clipboard API](https://opentui.com/docs/core-concepts/clipboard)

The implementation is typechecked against published `@opencode/plugin` and `@opencode/client` **2.1.4**. That client exposes message listing as `client.message.list()`. The online OpenAPI reference may show a newer operation grouping, so use the targeted package's generated types when changing API calls.

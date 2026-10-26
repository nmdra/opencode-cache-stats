# How the V2 plugin works

The plugin is read-only. It uses the OpenCode client connected to the CLI. It uses the same method for local and remote servers. It does not query the local database, create sessions, or call a model.

## Data collection

The plugin reads the session open in the terminal. It does not automatically select that session's root parent. The collector:

1. Reads the session metadata with `client.session.get({ sessionID })`.
2. Reads the complete assistant and compaction histories with `client.message.list({ sessionID, type: "assistant" })` and `type: "compaction"`. It keeps the type filter on every page.
3. Reads child sessions with `client.session.list({ parentID: sessionID })`. It repeats the collection for every descendant.

All lists use pagination. The collector follows every `cursor.next`. Session cursors keep their original filters. The collector guards against duplicate message/session IDs and repeated cursors. It reads at most four sessions at the same time, with at most eight list requests in progress. For each session, it reads the two message types in sequence. It does not read prompt or tool-output payloads.

The collector does not use `session.context()`. That method returns only the active context after the last compaction. It would undercount cumulative usage. The collector does not use cached TUI messages instead of complete history. If any page fails when the dialog first opens, the plugin reports an error. If a page fails during live refresh, the view keeps the last complete snapshot and marks it stale.

## What counts as a request

V2 represents assistant steps as messages with `type: "assistant"`, `model`, and optional `tokens` and `cost`. There are no V1 `step-finish` parts to sum.

The dialog counts one request for each distinct assistant message with recorded token usage. If usage was recorded, the count includes failed or interrupted steps. Retry metadata does not increase the request count. This is **recorded assistant-step usage, not an HTTP-attempt counter**.

The plugin excludes messages without token usage from usage totals and request counts. The dialog does not show a notice for these messages. Token usage can be missing during streaming or after a failure. Exported reports keep the missing-usage count. A recorded zero-token step still counts as a request.

## Usage scope

The default **All** scope includes the active session and every descendant, including messages before compaction. **Main** includes only the selected session. **Subagents** includes each descendant once. The scope filter applies to summary totals, model groups, trends, compaction usage, and exports. If you open the dialog inside a subagent, **Main** means that subagent, not its root parent.

Assistant totals exclude compaction messages. The separate **Compaction** section under Usage counts completed/failed compactions with recorded tokens. It also shows the combined cost of assistant and compaction usage. If no compaction messages exist, the view does not show this section. The plugin excludes missing compaction usage without a notice in the dialog. It also excludes title generation and other auxiliary calls. Thus, the combined cost can differ from OpenCode's broader session cost. Help explains these accounting limits. The statistics views do not repeat them.

## Live updates and sidebar

The plugin uses V2's `context.data.listen()` for step completion/failure, compaction, usage, session creation/deletion/rename, committed revert, and reconnect events. Events for unrelated session trees do not start collection. Streamed text/tool deltas do not start collection. The plugin groups related event bursts for 750 ms. If events arrive during a read, the plugin queues another refresh. It does not run overlapping refreshes.

The dialog and sidebar share refresh work for the same selected session. While either watches a session, a 30-second reconciliation recovers missed events. Press **r** to request an immediate refresh. If a refresh fails, the plugin keeps the last complete snapshot and clearly marks it stale. Each refresh reads the complete paginated histories. Long or wide session trees can take longer to read. A live view is not a transaction across the whole session tree.

The sidebar uses V2's `sidebar.content` slot. It shows the cache hit rate and request count for assistant steps in the selected session and its descendants. Click the indicator to open the dialog. To disable the indicator, use the plugin's `sidebar: false` option. When no dialog or sidebar watches a session, the plugin clears the session's timers and cancels reads in progress. When the plugin unloads, it also removes the event listener and UI registrations.

## Recent-request trend

The trend keeps at most 25 assistant messages with usage for each selected scope. It orders messages by completion time. If completion time is unavailable, it uses creation time. A taller glyph means a higher cache hit rate. A dot means an undefined rate. Spaces between glyphs keep consecutive high rates visually separate.

Narrow layouts show fewer samples. The displayed rate uses those visible samples. Ties use a deterministic order based on session/message IDs. The percentage for the displayed samples is token-weighted. It is not an average of request percentages. The trend excludes compactions and messages without usage. Exports keep up to 25 samples, regardless of the viewport width.

## Presentation and navigation

Summary, Models, Usage, and Agents share a fixed header and footer. The dialog has one scrollable body. Use Tab/Shift+Tab and Left/Right to select views. Press **f** to select the scope. When you change a view or scope, the body returns to the top. Live updates do not change the selection. Press **h** to open help in the same dialog. Help keeps the live subscription and the previous view.

Presentation helpers limit the dialog width to the host's medium size. They reserve space for controls before they calculate the body height. The header puts the session title next to `Cache Stat |`. Native terminal-cell truncation shortens long or Unicode names. Flex rows align values to the right without collisions from string padding. Recorded USD amounts keep precision for small nonzero values. They do not use an approximation prefix. Help contains the cache hit level legend. The legend does not use a permanent footer row.

## Reports and clipboard

Press **m** to export Markdown. Press **j** to export JSON. Both exports use the current scope and the last complete snapshot. Reports include capture time, stale status, assistant/compaction totals, models, recent requests, and subagent subtree rows. Maps are explicitly serialized to model arrays. Undefined rates become JSON `null` or Markdown `n/a`.

Exports contain session titles/IDs, model identities, and usage figures. They never contain message bodies, prompts, tool output, or compaction summaries. Markdown metadata is escaped. Copying uses the exposed OpenTUI renderer's OSC 52 method. Success means that the sequence was queued. It does not mean that the terminal confirmed clipboard acceptance. Unsupported or inactive terminals and reports over 256 KiB produce an error toast. The plugin does not write files or use a server-side clipboard.

## Tokens and cache rate

The V2 `TokenUsage.Info` fields are:

- `input`: fresh input tokens
- `cache.read`: cache-read tokens
- `cache.write`: cache-write tokens
- `output`: output tokens, excluding the separate reasoning count
- `reasoning`: reasoning tokens

The total token count follows OpenCode's `TokenUsage.total`. It is the sum of those five fields. Invalid or negative numeric values contribute zero.

```text
hit = cache read / (fresh input + cache read)
```

The denominator excludes cache writes. If the denominator is zero, the dialog shows `n/a`. Request cache efficiency is a separate metric. It is the number of requests with positive cache reads divided by the number of recorded requests.

Counts accumulate over requests. Thus, repeated reads of the same prefix can exceed the model's context window. The plugin adds recorded costs. It does not estimate costs from current model prices.

## Models and subagents

The plugin groups models by provider ID and model ID. Variants share the same row. The model list uses the selected scope. Models and subagents are sorted by cache hit rate, then request count.

Each subagent row includes that subagent's descendants. The row shows the model used by the most recorded requests in that subtree. Thus, subagent rows can overlap. Do not add subagent rows to calculate the session total. The overall total includes each session exactly once.

## References

- [V2 plugin migration](https://opencode.ai/v2/docs/build/plugins/migrate-v1)
- [CLI plugin API](https://opencode.ai/v2/docs/build/plugins/cli)
- [CLI plugin loading](https://opencode.ai/v2/docs/cli/plugins)
- [TypeScript client](https://opencode.ai/v2/docs/build/client)
- [OpenAPI specification](https://opencode.ai/v2/openapi.json)
- [OpenCode token accounting](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/token-usage.ts)
- [OpenTUI 0.6.8 clipboard API](https://opentui.com/docs/core-concepts/clipboard)

The implementation is typechecked against published `@opencode/plugin` and `@opencode/client` **2.1.4**. That client provides message listing through `client.message.list()`. The online OpenAPI reference may show a newer operation grouping. When you change API calls, use the generated types from the target package version.

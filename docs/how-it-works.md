# How the V2 plugin works

The plugin is read-only. It uses the CLI's connected OpenCode client, so local and remote servers follow the same path. It does not query the local database, create sessions, or invoke a model.

## Data collection

The target is the session currently open in the terminal, not automatically its root parent. The collector:

1. Reads its metadata with `client.session.get({ sessionID })`.
2. Reads its entire assistant-message timeline with `client.message.list({ sessionID, type: "assistant" })`.
3. Retrieves children with `client.session.list({ parentID: sessionID })` and repeats for every descendant.

Both lists are paginated. The collector follows every `cursor.next`, retains the assistant filter on message pages, and lets session cursors carry their original filters. Duplicate message/session IDs and repeated cursors are guarded against. At most four sessions are read concurrently, with at most eight list requests in flight.

`session.context()` is deliberately not used: it returns active context after the last compaction, which would undercount cumulative usage. Cached TUI messages are not a complete-history fallback. If any page fails, the dialog reports an error instead of showing partial totals as complete.

## What counts as a request

V2 represents assistant steps as messages with `type: "assistant"`, `model`, and optional `tokens` and `cost`. There are no V1 `step-finish` parts to sum.

The dialog counts one request per distinct assistant message with recorded token usage. It includes failed or interrupted steps when usage was recorded. A message's retry metadata does not add requests: this is **recorded assistant-step usage, not an HTTP-attempt counter**.

Messages without token usage are excluded from usage totals and request counts. A warning states how many assistant steps lack usage. This can happen while streaming or after a failure. A recorded zero-token step still counts as a request.

## Usage scope

Totals include the active session and every descendant, including messages before compaction. They exclude compaction messages, title generation, and other auxiliary calls. Consequently the dialog's cost can differ from OpenCode's broader session cost.

The dialog is a snapshot, not a live transaction across the session tree. Reopen it after work finishes to refresh. Navigating away cancels an in-flight collection. Unloading the plugin aborts requests, closes its active dialog, and lets OpenCode remove its command layer.

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

Models are grouped by provider ID and model ID; variants share the same row. The model list includes the whole selected session tree. Models and subagents sort by cache hit rate, then request count.

Each subagent row includes its own descendants. Its model is the model used by the most recorded requests in that subtree. Subagent rows can therefore overlap; do not add their rows together to reconstruct the session total. Each session contributes to the overall total exactly once.

## References

- [V2 plugin migration](https://opencode.ai/v2/docs/build/plugins/migrate-v1)
- [CLI plugin API](https://opencode.ai/v2/docs/build/plugins/cli)
- [CLI plugin loading](https://opencode.ai/v2/docs/cli/plugins)
- [TypeScript client](https://opencode.ai/v2/docs/build/client)
- [OpenAPI specification](https://opencode.ai/v2/openapi.json)
- [OpenCode token accounting](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/token-usage.ts)

The implementation is typechecked against published `@opencode/plugin` and `@opencode/client` **2.1.4**. That client exposes message listing as `client.message.list()`. The online OpenAPI reference may show a newer operation grouping, so use the targeted package's generated types when changing API calls.

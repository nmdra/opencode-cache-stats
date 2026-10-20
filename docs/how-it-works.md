# How the plugin works

This guide explains how the plugin collects the data. It describes how the plugin computes the rate.

## The opencode versions

The plugin is one file. The same file works on opencode v1 and opencode v2.

opencode v1 calls the plugin's `tui` entry point. opencode v2 calls its `setup` entry point.

## The data source

The plugin reads the token data from the current session. It reads the same data from the child sessions. A child session is a subagent.

## The API requests

On opencode v1, an assistant message can contain many provider steps. Each step is one API request. The plugin reads the step data from the message parts. It looks for parts of the type `step-finish`.

When the parts have no step data, the plugin reads the totals of the whole assistant message. The step data is more exact than the message totals.

On opencode v2, each assistant message is one provider step, which is one API request. There are no `step-finish` parts. When the provider retries a step, the step keeps one message, so the plugin does not count the retry as another request.

The plugin counts the API requests. It also counts the requests that read from the cache and the requests that write to the cache.

## The messages

The plugin reads the messages of a session. It counts the assistant messages. An assistant message has a token count.

The plugin ignores the messages of the user. A user message has no tokens.

On opencode v2, the plugin reads all messages of a session page by page. A compaction has its own message. The plugin counts it like one assistant message. opencode v1 stored a compaction as an assistant message, so the totals match. A compaction that retries can send more than one request. It has one message, so the request count can be a little lower than the real number. A compaction without its own model counts under the model that was active before it: the model of the last assistant message or of the last model switch.

## The token counts

The plugin reads four values from the assistant messages. On opencode v2, it reads the same four values from the compaction messages.

- `input` is the number of input tokens that are not served from the cache. The dialog refers to it as the fresh input.
- `cache read` is the number of tokens that came from the cache.
- `cache write` is the number of tokens written to the cache.
- `reasoning` is the number of reasoning tokens.

The plugin adds the values of the main session. Then it adds the values of each subagent. The totals are cumulative over every request in the session. A long session can show a cache read total that is much larger than the context window. Every request re-reads the same cached prefix, so the cache read count grows with each request.

## The rate formula

The plugin computes the rate with the formula:

```
hit = cache read / (input + cache read)
```

The rate is a percentage. The plugin shows `n/a` when the sum of the values is zero. A session with no tokens gives no rate.

The plugin maps the rate to a verdict word and a color. The mapping has four levels. The levels are `Excellent`, `Good`, `Fair`, and `Poor`. The mapping is in `docs/colors.md`.

The plugin excludes cache write from the rate. A cache write is a one-time priming cost. It is not part of the input that the provider serves again.

## The model list

The plugin groups the messages by model. Each group gives one row. The row order depends on the cache hit rate. The model with the highest rate is first.

## The data read order

The plugin tries the read with the API first. If the API fails or returns no messages, the plugin reads from the local state. This keeps the data current in the dialog.

On opencode v2, the local state keeps only the newest messages of a session. The numbers from the local state can be incomplete.

## The limits

The dialog shortens long model names, long session titles, and long subagent names. A shortened name ends with `…`. It shows all subagents. When there are many, the dialog scrolls.

The plugin does not change the data. It only reads the data. You can run it many times on the same session.
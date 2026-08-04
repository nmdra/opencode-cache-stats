# Use the plugin

This guide has two parts. The first part is a procedure. It opens the dialog. The second part explains how to read the dialog.

## Run the slash command

1. Open a session in opencode.
2. Run the command `/cache-stats`.

The dialog appears. It shows the cache rate of the current session.

If the dialog shows the message `No active session.`, open a session first. Then run the command again.

## Close the dialog

Press the key `esc`. The dialog closes. The session stays open.

## The sections of the dialog

The dialog has seven sections. A footer shows the color levels at the bottom.

- **The header.** This section shows the title `Cache stats`. The session title follows it. It shows the key `esc` on the right.
- **The highlight.** This section shows the overall cache rate.
- **The session summary.** This section shows the overall hit with a bar, the total calls, the model count, the subagent count, the total tokens, and the total cost.
- **The models.** This section lists the models of the session. Each row shows a hit bar, the hit rate, and the total tokens of the model.
- **The totals.** This section shows grouped totals for tokens, calls, and cost. It shows averages per call. It shows the last request.
- **The subagents.** This section lists the subagents of the session. Each subagent has a child row. The child row shows the model of the subagent and its tokens.
- **The footer.** This shows the label `Cache Hit Levels`. It also shows the color levels with a dot for each level.

## The overall rate

The overall rate is the first value. The plugin computes it from all messages. It includes the messages of the subagents. A verdict word follows the rate: `Excellent`, `Good`, `Fair`, or `Poor`.

A high rate means that many tokens come from the cache. A low rate means that many tokens do not come from the cache.

## The models section

The models section shows one row per model. Each row has a bar. The bar shows how much of the input came from the cache. The filled cells of the bar use the color of the hit level. Next to the bar the row shows the hit rate and the total tokens of the model.

The dialog sorts the models by call count. The model with the most calls is first.

## The totals section

The totals section groups the metrics. The group `Tokens` shows the fresh input, the cache read, the output, and the reasoning tokens. Each value has a percentage. The percentage is the share of the total input. The group `Calls` shows the total calls, the cache hits, the cache misses, and a cache-efficiency bar. The group `Cost` shows the total cost and the cache writes.

The group `Avg per Call` shows the averages per call. The averages are the totals divided by the number of calls. The group `Last Request` shows the last request of the main session. It shows the fresh input, the cache read, the output, and the hit rate of that request. This value is close to the context size in the TUI. The group does not include the calls of the subagents.

The totals add the values of every call in the session. The values grow as the session grows. A cache read total can be much larger than the context window. This is correct. Every call re-reads the same cached prefix. The values are not a snapshot of the current context.

## The subagents section

The subagents section shows one parent row per subagent. The row shows the subagent name, a short id, its cache rate, its message count, and its cache-hit ratio. A child row below shows the model of the subagent and its total tokens. The model is the model with the most calls. The child row has a muted color.

The dialog shows all subagents. When there are many, the dialog scrolls. Use the `↑` and `↓` keys to scroll.

## No data yet

When the session has no assistant messages, the dialog shows a guidance message. It tells you to run at least one assistant request and then open the dialog again.

When the session has messages but no token data yet, the dialog shows a different message. It tells you to wait for the session to finish streaming.
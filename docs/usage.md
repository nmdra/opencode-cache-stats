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

The dialog has six sections. A footer shows the color levels at the bottom.

- **The header.** This section shows the title `Cache stats`. The session title follows it. It shows the key `esc` on the right.
- **The highlight.** This section shows the overall cache rate.
- **The models.** This section lists the models of the session.
- **The totals.** This section shows the total token counts. It shows the total cost.
- **The subagents.** This section lists the subagents of the session.
- **The footer.** This shows the label `Cache Hit Levels`. It also shows the color levels with a dot for each level.

## The overall rate

The overall rate is the first value. The plugin computes it from all messages. It includes the messages of the subagents. A verdict word follows the rate: `Excellent`, `Good`, `Fair`, or `Poor`.

A high rate means that many tokens come from the cache. A low rate means that many tokens do not come from the cache.

## The models section

The models section shows one row per model. Each row has a bar. The bar shows how much of the input came from the cache. The filled cells of the bar use the color of the hit level. Next to the bar the row shows the hit rate. When the model has API calls, the row also shows how many of those calls read from the cache, for example `43/65`.

The dialog sorts the models by call count. The model with the most calls is first.

## The totals section

The totals section shows the sum of all messages. It shows the fresh input, the output, and the reasoning tokens. It shows the cache read, the cache write, and the cost. It also shows how many API calls read from the cache, for example `43 of 65 calls read from cache`.

The totals add the values of every call in the session. The values grow as the session grows. A cache read total can be much larger than the context window. This is correct. Every call re-reads the same cached prefix. The values are not a snapshot of the current context.

The section has a `most recent request` line for comparison. It shows the token count of the most recent call in the main session. This value is close to the context size in the TUI. The line does not include the calls of the subagents.

## The subagents section

The subagents section shows one line per subagent. Each line shows the subagent name, a short id, its cache rate, and its message count. When the subagent has API calls, the line also shows how many calls read from the cache.

The dialog shows all subagents. When there are many, the dialog scrolls. Use the `↑` and `↓` keys to scroll.

## No data yet

When the session has no assistant messages, the dialog shows a guidance message. It tells you to run a few turns and then open the dialog again.

When the session has messages but no token data yet, the dialog shows a different message. It tells you to wait for the session to finish streaming.
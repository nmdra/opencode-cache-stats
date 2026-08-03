# Use the plugin

This guide has two parts. The first part is a procedure. It opens the dialog. The second part explains how to read the dialog.

## Run the slash command

1. Open a session in opencode.
2. Run the command `/cache-hit`.

The dialog appears. It shows the cache rate of the current session.

If the dialog shows the message `No active session.`, open a session first. Then run the command again.

## Close the dialog

Press the key `esc`. The dialog closes. The session stays open.

## The sections of the dialog

The dialog has five sections. A footer shows the formula at the bottom.

- **The header.** This section shows the title `Cache hit`. It shows the key `esc` on the right.
- **The highlight.** This section shows the overall cache rate. It shows the title of the session below that rate.
- **The models.** This section lists the models of the session.
- **The totals.** This section shows the total token counts. It shows the total cost.
- **The subagents.** This section lists the subagents of the session.
- **The footer.** This shows the formula for the cache rate.

## The overall rate

The overall rate is the first value. The plugin computes it from all messages. It includes the messages of the subagents.

A high rate means that many tokens come from the cache. A low rate means that many tokens do not come from the cache.

## The models section

The models section shows one line per model. Each line shows the model name and the hit rate of the model. When the model has API calls, the line also shows how many of those calls read from the cache, for example `3/5 calls hit`.

The dialog sorts the models by message count. The model with the most messages is first.

## The totals section

The totals section shows the sum of all messages. It shows the input tokens, the reasoning tokens, the cache read, and the cache write. It shows the output tokens and the cost. It also shows how many API calls read from the cache, for example `3 of 5 calls read from cache`.

The totals add the values of every call in the session. The values grow as the session grows. A cache read total can be much larger than the context window. This is correct. Every call re-reads the same cached prefix. The values are not a snapshot of the current context.

The section has a `latest request` line for comparison. It shows the token count of the most recent call. This value is close to the context size in the TUI.

## The subagents section

The subagents section shows one line per subagent. Each line shows the subagent id, its cache rate, and its message count. When the subagent has API calls, the line also shows how many calls read from the cache.

The dialog shows the first eight subagents. It does not show the rest.
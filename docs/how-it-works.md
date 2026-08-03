# How the plugin works

This guide explains how the plugin collects the data. It describes how the plugin computes the rate.

## The data source

The plugin reads the token data from the current session. It reads the same data from the child sessions. A child session is a subagent.

## The API calls

An assistant message can contain many provider steps. Each step is one API call. The plugin reads the step data from the message parts. It looks for parts of the type `step-finish`.

When the parts have no step data, the plugin reads the totals of the whole assistant message. The step data is more exact than the message totals.

The plugin counts the API calls. It also counts the calls that read from the cache and the calls that write to the cache.

## The messages

The plugin reads the messages of a session. It counts only the assistant messages. An assistant message has a token count.

The plugin ignores the messages of the user. A user message has no tokens. The summary messages also have no tokens.

## The token counts

The plugin reads four values from the assistant messages.

- `input` is the number of input tokens.
- `cache read` is the number of tokens that came from the cache.
- `cache write` is the number of tokens written to the cache.
- `reasoning` is the number of reasoning tokens.

The plugin adds the values of the main session. Then it adds the values of each subagent.

## The rate formula

The plugin computes the rate with the formula:

```
hit = cache read / (input + cache read)
```

The rate is a percentage. The plugin shows `n/a` when the sum of the values is zero. A session with no tokens gives no rate.

The plugin excludes cache write from the rate. A cache write is a one-time priming cost. It is not part of the input that the provider serves again.

## The model list

The plugin groups the messages by model. Each group gives one row. The row order depends on the message count. The model with the most messages is first.

## The data read order

The plugin tries the read with the API first. If the API returns no messages, the plugin reads from the local state. This keeps the data current in the dialog.

## The limits

The dialog shows the first eight subagents. The dialog shortens long model names and long session titles. A shortened name ends with `…`.

The plugin does not change the data. It only reads the data. You can run it many times on the same session.
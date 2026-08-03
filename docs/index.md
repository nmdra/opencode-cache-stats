# cache-hit

cache-hit is an opencode TUI plugin. It shows the cache rate of a session. It opens a dialog when you run the slash command `/cache-hit`. It does not call an AI model.

You use it to see how much of the prompt input comes from the cache. A high rate means a lower cost for the session.

## How the rate works

The plugin uses this formula:

```
hit = cache read / (input + cache read + cache write)
```

The rate uses the token counts of the session. The counts come from the messages of the session and its subagents.

## Documents

- `docs/installation.md` — how to install the plugin
- `docs/usage.md` — how to use the slash command and read the dialog
- `docs/how-it-works.md` — how the plugin collects and computes the data
- `docs/colors.md` — how the plugin shows the rate with colors
- `docs/troubleshooting.md` — how to fix common errors

Read `docs/installation.md` first.
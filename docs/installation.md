# Install the V2 plugin

This branch targets OpenCode **2.1.4**. OpenCode V1 users should use the [`v1` branch](https://github.com/nmdra/opencode-cache-stats/tree/v1), which retains the original single-file plugin and installation instructions.

## 1. Copy the plugin directory

From this repository's root, on Linux:

```sh
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
mkdir -p "$config_dir/plugins/cache-stats"
cp plugins/cache-stats/{package.json,tui.tsx,view.tsx,controller.ts,collect.ts,stats.ts} \
  "$config_dir/plugins/cache-stats/"
```

Keep all six files together. V2 loads plugin directories, not a configured path to an individual TSX file. OpenCode supplies the plugin and OpenTUI runtime imports; you do not need to run npm install in the copied directory.

## 2. Enable the CLI plugin

Edit the global `~/.config/opencode/cli.json` (or `$XDG_CONFIG_HOME/opencode/cli.json`). Preserve existing settings and plugin entries:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["./plugins/cache-stats"]
}
```

See `cli.json.example`. The global `plugins/` directory is also discovered automatically. Do not register this terminal-only plugin in `opencode.json` or in the old `tui.json`.

V2 CLI configuration is global; there is no project-local `cli.json`. Because this is a CLI-only plugin, it remains available when your terminal connects to a remote server.

## 3. Load and test

Configuration changes reload automatically. Use `/reload` if necessary, then open a session and run `/cache-stats`. The command is also available in the palette as **Cache stats** (`cache-stats.show`).

If replacing an old installation, remove its `tui.json` registration and old `tui-plugins/cache-stats.tsx` only after confirming you no longer need them for V1. V1 code itself does not run in V2.

See [troubleshooting](troubleshooting.md) if the dialog does not appear.

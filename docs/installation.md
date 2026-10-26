# Install the V2 plugin

This branch targets OpenCode **2.1.4**. For OpenCode V1, use the [`v1` branch](https://github.com/nmdra/opencode-cache-stats/tree/v1). That branch contains the original single-file plugin and its installation instructions.

## 1. Copy the plugin directory

On Linux, run these commands from the root of this repository:

```sh
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
mkdir -p "$config_dir/plugins/cache-stats"
cp plugins/cache-stats/{package.json,tui.tsx,view.tsx,presentation.ts,controller.ts,collect.ts,stats.ts,live.ts,report.ts,sidebar.tsx} \
  "$config_dir/plugins/cache-stats/"
```

Keep all ten files together. V2 loads plugin directories. It does not load a configured path to an individual TSX file. OpenCode supplies the plugin and OpenTUI runtime imports. You do not need to run npm install in the copied directory.

## 2. Enable the CLI plugin

Edit the global `~/.config/opencode/cli.json` (or `$XDG_CONFIG_HOME/opencode/cli.json`). Keep the existing settings and plugin entries:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["./plugins/cache-stats"]
}
```

See `cli.json.example`. OpenCode also finds the global `plugins/` directory automatically. Do not register this terminal-only plugin in `opencode.json` or in the old `tui.json`.

V2 CLI configuration is global. There is no project-local `cli.json`. This CLI-only plugin remains available when your terminal connects to a remote server.

The sidebar indicator is enabled by default. To disable the indicator, use `{"package":"./plugins/cache-stats","options":{"sidebar":false}}` in the `plugins` array. The indicator does not force OpenCode's sidebar to become visible.

## 3. Load and test

Configuration changes reload automatically. If necessary, use `/reload`. Open a session. Then run `/cache-stats`. You can also select **Cache stats** in the command palette (`cache-stats.show`).

If you replace an old installation, first confirm that you no longer need its files or registration for V1. Only then remove the old `tui.json` registration and `tui-plugins/cache-stats.tsx`. V1 code does not run in V2.

See [troubleshooting](troubleshooting.md) if the dialog does not appear.

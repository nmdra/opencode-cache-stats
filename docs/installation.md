# Install the plugin

This guide is for Linux. The path for the opencode configuration is `~/.config/opencode`.

## 1. Find the configuration folder

1. Open a terminal.
2. Run the command `echo $HOME` to find your home folder.

The configuration folder is `$HOME/.config/opencode`.

## 2. Copy the plugin file

1. Go to the configuration folder.

Run the command:

```
cd ~/.config/opencode
```

2. Create the folder `tui-plugins`.

Run the command:

```
mkdir -p tui-plugins
```

3. Copy the file `cache-stats.tsx` from this repository into `tui-plugins`.

```
cp tui-plugins/cache-stats.tsx ~/.config/opencode/tui-plugins/cache-stats.tsx
```

4. Make sure that the file exists.

Run the command:

```
ls ~/.config/opencode/tui-plugins/
```

The file `cache-stats.tsx` appears in the list.

## 3. Register the plugin

The file `tui.json` in the config folder lists the TUI plugins. This plugin must be on that list.

1. Open the file `tui.json` with a text editor.

```
code ~/.config/opencode/tui.json
```

If the file does not exist, create a new file with this name.

2. Add the path `"./tui-plugins/cache-stats.tsx"` to the list of plugins.

Use the example file `tui.json.example` in this repository as a starting point. The registration looks like this:

```json
{
  "plugin": ["./tui-plugins/cache-stats.tsx"]
}
```

3. Save the file, then close the editor.

## 4. Restart opencode

1. Close the opencode program.
2. Start the opencode program again.

The plugin loads when opencode starts.

## 5. Test the plugin

1. Open a session.
2. Run the command `/cache-stats`.

If the dialog appears, the plugin works. If it does not appear, read `docs/troubleshooting.md`.
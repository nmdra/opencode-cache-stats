# Install the plugin

This guide is for Linux. The path for the opencode configuration is `~/.config/opencode`.

The plugin is one file: `tui-plugins/cache-stats.tsx`. The same file works on opencode v1 and opencode v2. The install steps are different for each version. Follow the part for your version. The last part, "Test the plugin", is the same for both.

## 1. Find the configuration folder

1. Open a terminal.
2. Run the command `echo $HOME` to find your home folder.

The configuration folder is `$HOME/.config/opencode`.

## 2. Install on opencode v1

### 2.1 Copy the plugin file

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

### 2.2 Register the plugin

The file `tui.json` in the config folder lists the TUI plugins. This plugin must be on that list.

If you already use the plugin on opencode v1, you only replace the file in step 2.1. The entry in `tui.json` stays the same.

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

### 2.3 Restart opencode

1. Close the opencode program.
2. Start the opencode program again.

The plugin loads when opencode starts.

## 3. Install on opencode v2

opencode v2 does not read the plugin list from `tui.json`. It does not load a plugin from a single file path. It loads every folder in `~/.config/opencode/plugins/` as a plugin. The folder must contain a file named `tui.tsx`. No config change is needed.

### 3.1 Create the plugin folder

1. Create the folder `cache-stats` in `~/.config/opencode/plugins/`.

Run the command:

```
mkdir -p ~/.config/opencode/plugins/cache-stats
```

### 3.2 Copy the plugin file

1. Copy the file `cache-stats.tsx` from this repository into the new folder. Rename it to `tui.tsx`.

Run the command in the root folder of this repository:

```
cp tui-plugins/cache-stats.tsx ~/.config/opencode/plugins/cache-stats/tui.tsx
```

2. Make sure that the file exists.

Run the command:

```
ls ~/.config/opencode/plugins/cache-stats/
```

The file `tui.tsx` appears in the list.

Do not put files named `index` or `server` in this folder. opencode v2 loads such a file as a server plugin.

### 3.3 Restart opencode

1. Close the opencode program.
2. Start the opencode program again.

The plugin loads when opencode starts. After that, opencode reloads the plugin when the file changes.

### 3.4 Check `cli.json`

When opencode v2 starts for the first time, it copies the plugin list from `tui.json` into `~/.config/opencode/cli.json`, under the key `plugins`. A file path such as `./tui-plugins/cache-stats.tsx` in that list is skipped without an error. A `plugins` entry in `cli.json` must point to a plugin folder or a plugin package, not to a single file.

The install in section 3.1 to 3.3 does not need an entry in `cli.json`.

## 4. Test the plugin

1. Open a session.
2. Run the command `/cache-stats`.

If the dialog appears, the plugin works. If it does not appear, read `docs/troubleshooting.md`.

# Install the plugin

Install the plugin from this GitHub repository with the opencode CLI. You do not copy files.

## 1. Install globally

Run the command:

```
opencode plugin -g "opencode-cache-stats@git+https://github.com/nmdra/opencode-cache-stats.git"
```

The command adds the plugin to `tui.json` in the global config folder (`~/.config/opencode`). Run it without `-g` to install for the current project only.

The command `opencode plug` is an alias for `opencode plugin`.

## 2. Restart opencode

1. Close the opencode program.
2. Start the opencode program again.

The plugin loads when opencode starts.

## 3. Test the plugin

1. Open a session.
2. Run the command `/cache-stats`.

If the dialog appears, the plugin works. If it does not appear, read `docs/troubleshooting.md`.

## Update the plugin

Run the command again with the flag `-f`:

```
opencode plugin -g -f "opencode-cache-stats@git+https://github.com/nmdra/opencode-cache-stats.git"
```

## Pin a version

Add a release tag to the URL to install a fixed version:

```
opencode plugin -g "opencode-cache-stats@git+https://github.com/nmdra/opencode-cache-stats.git#v0.1.0"
```

## Remove the plugin

1. Open the file `tui.json` in the config folder with a text editor.
2. Remove the entry `opencode-cache-stats@git+https://github.com/nmdra/opencode-cache-stats.git` from the `plugin` list.
3. Save the file, then restart opencode.
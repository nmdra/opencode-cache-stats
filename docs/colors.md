# Colors of the dialog

The plugin uses the colors from the opencode theme. It maps the cache rate to a color. The mapping is the same everywhere in the dialog.

## The color levels

- 70% or more: the success color
- 40% to 69%: the info color
- below 40%: the warning color
- no rate: the muted color

The plugin shows `n/a` in the muted color when there is no rate. This can happen for a session with no tokens.

## Where the colors appear

The overall rate uses these colors. Each model row uses these colors for its rate. Each subagent row uses these colors for its rate.

The other values have their own colors from the theme. For example, the input tokens use the number color.

## The theme

The colors depend on the opencode theme. A dark theme and a light theme give different colors. You can change the theme in opencode. The plugin uses the new theme on the next run.
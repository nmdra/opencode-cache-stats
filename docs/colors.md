# Colors of the dialog

The plugin uses the colors from the opencode theme. It maps the cache rate to a color. The mapping is the same everywhere in the dialog: the overall rate, each model row, and each subagent row.

## The color levels

- 90% or more: the success color
- 70% to 89%: the info color
- 40% to 69%: the warning color
- below 40%: the error color
- no rate: the muted color

The plugin shows `n/a` in the muted color when there is no rate. This can happen for a session with no tokens.

## The verdict word

The plugin shows a word next to the rate. The word uses the same colors:

- `Excellent` for 90% or more
- `Good` for 70% to 89%
- `Fair` for 40% to 69%
- `Poor` for below 40%
- `—` for no rate

## The bars

Each model row has a bar. The bar shows how much of the input came from the cache. The filled cells use the color of the rate. The empty cells use the border color.

A bar of all filled cells means the whole input came from the cache. A bar of all empty cells means none of the input came from the cache.

## Where the colors appear

The overall rate uses these colors. Each model rate uses these colors. Each subagent rate uses these colors.

The other values have their own theme colors. The cache read number uses the info color. The cache write number uses the warning color. The token counts and the cost have their own colors.

The footer repeats the color levels with a dot for each level: `● ≥90%` in the success color, `● 70–89%` in the info color, `● 40–69%` in the warning color, and `● <40%` in the error color.

## The theme

The colors depend on the opencode theme. A dark theme and a light theme give different colors. You can change the theme in opencode. The plugin uses the new theme on the next run.
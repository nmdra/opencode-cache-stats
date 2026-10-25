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
- `No rate` when usage is unavailable

## The bars

The overall and model bars split the input into two colors: **green/success for cache hits** and **red/error for cache misses**. These segment colors stay distinct even when the verdict is Fair or Poor. The overall row also shows the numeric miss percentage.

Partial cells use eighth-cell precision, with a green glyph over a red background. This keeps a small miss rate such as 1.3% visible instead of rounding the whole bar to green. Numeric percentages remain the authoritative values. Zero hits gives an all-red bar; all hits gives an all-green bar. Missing usage uses neutral dots, not a red miss bar.

## Where the colors appear

The overall rate uses these colors. Each model rate uses these colors. Each subagent rate uses these colors.

The other values have their own theme colors. The cache read number uses the info color. The cache write number uses the warning color. The token counts and the cost have their own colors.

Help (**h**) lists the verdict thresholds and explains the hit/miss segment colors. Recent-request glyphs remain separated so a high-hit run does not become a solid rectangle.

## The theme

The colors use OpenCode V2's semantic theme tokens: `text.feedback.success`, `info`, `warning`, and `error`, plus `text.muted`, `border.base`, and `syntax.number`. Dark and light themes can give different colors. You can change the theme in OpenCode; the dialog follows the active theme.

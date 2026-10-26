# Colors of the dialog

The plugin uses colors from the OpenCode theme. It assigns a color to the cache hit rate. The overall rate, each model row, and each subagent row use the same color mapping.

## The color levels

- 90% or more: the success color
- 70% to 89%: the info color
- 40% to 69%: the warning color
- below 40%: the error color
- no rate: the muted color

If no rate is available, the plugin shows `n/a` in the muted color. A session with no tokens can have no rate.

## The verdict word

The plugin shows a word next to the cache hit rate. The word uses the same colors:

- `Excellent` for 90% or more
- `Good` for 70% to 89%
- `Fair` for 40% to 69%
- `Poor` for below 40%
- `No rate` when usage is unavailable

## The bars

The overall and model bars show input in two colors: **green/success for cache hits** and **red/error for cache misses**. These segment colors stay separate even when the word is Fair or Poor. The overall row also shows the numeric miss percentage.

Partial cells use eighth-cell precision. Each partial cell has a green glyph over a red background. This keeps a small miss rate such as 1.3% visible instead of rounding the whole bar to green. Use the numeric percentages as the authoritative values. Zero hits gives an all-red bar. All hits gives an all-green bar. Missing usage uses neutral dots, not a red miss bar.

## Where the colors appear

The overall cache hit rate, each model rate, and each subagent rate use these colors.

Other values use their own theme colors. The cache read count uses the info color. The cache write count uses the warning color. Token counts and cost use their own colors.

Help (**h**) lists the thresholds for each word and explains the cache hit/miss segment colors. Spaces between recent-request glyphs keep consecutive high rates from forming a solid rectangle.

## The theme

The colors use OpenCode V2's semantic theme tokens: `text.feedback.success`, `info`, `warning`, and `error`, plus `text.muted`, `border.base`, and `syntax.number`. Dark and light themes can give different colors. To change the colors, change the theme in OpenCode. The dialog follows the active theme.

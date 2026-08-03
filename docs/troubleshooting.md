# Troubleshooting

Read the error first. Then read the fix. The fixes are one instruction per step.

## The command does nothing

The slash command `/cache-hit` does nothing when you are not in a session.

Open a session first. Then run the command again.

## The dialog shows `No active session.`

The plugin cannot find a session. This message appears when the command runs outside a session.

Open a session. Then run `/cache-hit` again.

Make sure that you are on the session page. A session page has the session id in the route.

## The dialog does not appear

The plugin loads at opencode startup. If the plugin was not installed before the start, it does not load.

Restart opencode. Then run `/cache-hit` again.

Make sure that the path in `tui.json` is correct. The path must point to `cache-hit.tsx`.

## The dialog shows `n/a`

The plugin shows `n/a` when the rate has no value. This happens when the sum of the token values is zero.

Do a session with an AI model. Then run `/cache-hit` again. A session before the first reply gives no rate.

## The dialog shows wrong numbers

The plugin reads the data from the session. It reads from the API first. If the API fails, it reads from the local state. The two reads have different numbers.

Run the command again after the reply finishes. A reply that still runs gives partial numbers.

## The total is different from the models

The plugin adds the subagents into the total. The models list shows the main session only. The difference is the subagent contribution.

This is expected. The totals include everything. The models list does not.

## No color on the rate

The colors come from the opencode theme. If the theme has no color map, the plugin shows the text color.

Set the opencode theme to a default theme. Log out, then log back in. The dialog uses the theme on the next run.
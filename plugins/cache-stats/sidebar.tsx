/** @jsxImportSource @opentui/solid */
import { usePlugin } from "@opencode/plugin/tui";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { LiveState, LiveStats } from "./live.ts";
import { hitPct } from "./stats.ts";

export function CacheStatsSidebar(props: { sessionID: string; live: LiveStats }) {
  const context = usePlugin();
  const [state, setState] = createSignal<LiveState>({ loading: true, stale: false });
  createEffect(() => {
    const stop = props.live.watch(props.sessionID, (next) => setState(next));
    onCleanup(stop);
  });
  const hit = () => state().stats ? hitPct(state().stats!.acc) : -1;
  const color = () => {
    const feedback = context.theme.text.feedback;
    return state().stale ? feedback.warning.base : hit() >= 90 ? feedback.success.base
      : hit() >= 70 ? feedback.info.base : hit() >= 40 ? feedback.warning.base
      : hit() >= 0 ? feedback.error.base : context.theme.text.muted;
  };
  return <box flexDirection="column" paddingTop={1} onMouseUp={() => context.keymap.dispatch("cache-stats.show")}>
    <text fg={context.theme.text.base}><b>Cache</b><span style={{ fg: color() }}>
      {" "}{state().stats ? hit() < 0 ? "n/a" : `${hit().toFixed(1)}%` : state().stale ? "unavailable" : "loading…"}
    </span>{state().stale && state().stats ? " · stale" : ""}</text>
    <text fg={context.theme.text.muted}>{state().stats ? `${state().stats!.acc.reqs} requests · session + subagents` : "Recorded assistant usage"}</text>
  </box>;
}

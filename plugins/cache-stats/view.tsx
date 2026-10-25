/** @jsxImportSource @opentui/solid */
import { usePlugin } from "@opencode/plugin/tui";
import { useKeyboard, useTerminalDimensions, type JSX } from "@opentui/solid";
import type { RGBA, ScrollBoxRenderable } from "@opentui/core";
import type { Collected, Sub } from "./collect.ts";
import { hitPct, tokenTotal, type Acc } from "./stats.ts";

type Theme = {
  text: RGBA;
  muted: RGBA;
  border: RGBA;
  accent: RGBA;
  number: RGBA;
  success: RGBA;
  info: RGBA;
  warning: RGBA;
  error: RGBA;
};

function fmt(n: number): string {
  const value = Math.round(n);
  return value >= 1e6 ? `${(value / 1e6).toFixed(2)}M`
    : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : String(value);
}

function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, Math.max(0, length - 1))}…` : text;
}

function short(model: string): string { return model.slice(model.indexOf("/") + 1); }
function cost(value: number, digits = 3): string { return `~$${value.toFixed(digits)}`; }
function fmtHit(hit: number): string { return hit < 0 ? "n/a" : `${hit.toFixed(1)}%`; }
function share(part: number, total: number): string { return total > 0 ? ` (${(100 * part / total).toFixed(1)}%)` : ""; }

function hitStyle(theme: Theme, hit: number) {
  if (hit < 0) return { color: theme.muted, word: "—" };
  if (hit >= 90) return { color: theme.success, word: "Excellent" };
  if (hit >= 70) return { color: theme.info, word: "Good" };
  if (hit >= 40) return { color: theme.warning, word: "Fair" };
  return { color: theme.error, word: "Poor" };
}

function HitBar(props: { theme: Theme; hit: number }) {
  const filled = () => props.hit < 0 ? 0 : Math.min(10, Math.max(0, Math.round(props.hit / 10)));
  return <>
    <b><span style={{ fg: hitStyle(props.theme, props.hit).color }}>{"█".repeat(filled())}</span></b>
    <b><span style={{ fg: props.theme.border }}>{(props.hit < 0 ? "·" : "░").repeat(10 - filled())}</span></b>
  </>;
}

function Section(props: { theme: Theme; title: string; count?: string; children: JSX.Element }) {
  return <box flexDirection="column" gap={0} marginTop={1}>
    <text fg={props.theme.accent}><b>│ {props.title}</b>
      {props.count ? <span style={{ fg: props.theme.muted }}> · {props.count}</span> : null}
    </text>
    <box flexDirection="column" paddingLeft={2} gap={0}>{props.children}</box>
  </box>;
}

function Row(props: { theme: Theme; label: string; value: string; suffix?: string; color?: RGBA; last?: boolean; tree?: boolean }) {
  return <text fg={props.theme.muted} wrapMode="none">
    {props.tree ? props.last ? "└─ " : "├─ " : ""}{props.label.padEnd(16)}
    <b><span style={{ fg: props.color ?? props.theme.text }}>{props.value.padStart(9)}</span></b>
    {props.suffix}
  </text>;
}

function MetaLine(props: { theme: Theme; label: string; tokens: number; value: number }) {
  return <text fg={props.theme.muted} wrapMode="none">
    └─ {truncate(props.label, 23).padEnd(23)} {fmt(props.tokens).padStart(7)} {cost(props.value).padStart(9)}
  </text>;
}

function Totals(props: { theme: Theme; acc: Acc }) {
  const total = () => tokenTotal(props.acc);
  const efficiency = () => props.acc.reqs > 0 ? 100 * props.acc.reqsWithCacheRead / props.acc.reqs : -1;
  return <>
    <text fg={props.theme.text}><b>Tokens</b></text>
    {([
      ["Fresh Input", "input", "number"],
      ["Cache Read", "cacheRead", "info"],
      ["Output", "output", "number"],
      ["Reasoning", "reasoning", "number"],
      ["Cache Writes", "cacheWrite", "warning"],
    ] as const).map(([label, key, color], index) => <Row
      theme={props.theme} label={label} value={fmt(props.acc[key])} color={props.theme[color]}
      suffix={share(props.acc[key], total())} tree last={index === 4}
    />)}
    <text fg={props.theme.text}><b>Requests</b></text>
    <Row theme={props.theme} label="Total" value={String(props.acc.reqs)} tree />
    <Row theme={props.theme} label="Cache Hits" value={String(props.acc.reqsWithCacheRead)}
      suffix={share(props.acc.reqsWithCacheRead, props.acc.reqs)} tree />
    <Row theme={props.theme} label="Cache Misses" value={String(props.acc.reqs - props.acc.reqsWithCacheRead)}
      suffix={share(props.acc.reqs - props.acc.reqsWithCacheRead, props.acc.reqs)} tree />
    <text fg={props.theme.muted} wrapMode="none">└─ {"Cache Efficiency".padEnd(16)}
      <b><span style={{ fg: hitStyle(props.theme, efficiency()).color }}>{fmtHit(efficiency()).padStart(9)}</span></b>{" "}
      <HitBar theme={props.theme} hit={efficiency()} />
    </text>
    <text fg={props.theme.text}><b>Cost</b></text>
    <Row theme={props.theme} label="Total Cost" value={cost(props.acc.cost, 5)} tree last />
    <text fg={props.theme.text}><b>Avg per Request</b></text>
    {([ ["Fresh Input", "input"], ["Cache Read", "cacheRead"], ["Output", "output"] ] as const).map(([label, key]) =>
      <Row theme={props.theme} label={label} value={fmt(props.acc[key] / props.acc.reqs)} tree />
    )}
    <Row theme={props.theme} label="Cost" value={cost(props.acc.cost / props.acc.reqs, 5)} tree last />
    <text fg={props.theme.muted}><i>cumulative recorded assistant steps; compaction excluded</i></text>
  </>;
}

function Subagent(props: { theme: Theme; sub: Sub }) {
  return <box flexDirection="column" gap={0} marginBottom={1}>
    <text fg={props.theme.muted} wrapMode="none">
      <b><span style={{ fg: props.theme.text }}>{truncate(props.sub.name, 12).padEnd(12)}</span></b>{" "}
      {`${props.sub.id.slice(0, 4)}…${props.sub.id.slice(-8)}`.padEnd(15)}
      <b><span style={{ fg: hitStyle(props.theme, props.sub.hit).color }}>{fmtHit(props.sub.hit).padStart(7)}</span></b>{" "}
      {props.sub.reqs > 0 ? `${props.sub.reqsWithCacheRead}/${props.sub.reqs} hit` : ""}
    </text>
    {props.sub.model ? <MetaLine theme={props.theme} label={short(props.sub.model)} tokens={props.sub.tokens} value={props.sub.cost} /> : null}
  </box>;
}

export function CacheStatsView(props: { stats: Collected }) {
  const context = usePlugin();
  const dimensions = useTerminalDimensions();
  // Getters retain the host theme's reactivity while keeping color choices local.
  const theme: Theme = {
    get text() { return context.theme.text.base; },
    get muted() { return context.theme.text.muted; },
    get border() { return context.theme.border.base; },
    get accent() { return context.theme.text.action.primary.base; },
    get number() { return context.theme.syntax.number; },
    get success() { return context.theme.text.feedback.success.base; },
    get info() { return context.theme.text.feedback.info.base; },
    get warning() { return context.theme.text.feedback.warning.base; },
    get error() { return context.theme.text.feedback.error.base; },
  };
  const acc = () => props.stats.acc;
  const hit = () => hitPct(acc());
  const models = () => [...props.stats.perModel].sort((a, b) => hitPct(b[1]) - hitPct(a[1]) || b[1].reqs - a[1].reqs);
  const subs = () => [...props.stats.subs].sort((a, b) => b.hit - a.hit || b.reqs - a.reqs);
  let scroll: ScrollBoxRenderable | undefined;
  useKeyboard((event) => {
    const delta = { up: -1, down: 1, pageup: -10, pagedown: 10 }[event.name];
    if (delta === undefined || !scroll || scroll.scrollHeight <= scroll.height) return;
    scroll.scrollBy(delta);
    event.preventDefault();
    event.stopPropagation();
  });

  return <box flexDirection="column" width="100%" padding={1} gap={0}>
    <box flexDirection="row" justifyContent="space-between">
      <text fg={theme.accent}><b>Cache stats</b><span style={{ fg: theme.muted }}> · {truncate(props.stats.title, Math.max(8, Math.min(30, dimensions().width - 34)))}</span></text>
      <text fg={theme.muted}>↑/↓ · esc</text>
    </box>
    <text fg={theme.border}>{"─".repeat(Math.max(4, Math.min(54, dimensions().width - 12)))}</text>
    <scrollbox height={Math.max(3, Math.min(14, dimensions().height - 12))} scrollY
      scrollbarOptions={{ trackOptions: { backgroundColor: theme.border } }}
      viewportOptions={{ paddingRight: 1 }} ref={(value) => { scroll = value; }}>
      {acc().reqs === 0 ? <box paddingTop={2} paddingBottom={2} flexDirection="column">
        <text fg={theme.muted}>{acc().count > 0 ? "No recorded token data for this session yet." : "No cache statistics available for this session."}</text>
        <text fg={theme.muted}>{acc().count > 0 ? "Reopen after the assistant step completes." : "Run an assistant request, then open again."}</text>
      </box> : <box flexDirection="column" gap={0}>
        <text fg={theme.muted}><HitBar theme={theme} hit={hit()} />{" "}
          <b><span style={{ fg: hitStyle(theme, hit()).color }}>{fmtHit(hit())} {hitStyle(theme, hit()).word}</span></b> · overall cache hit
        </text>
        <Section theme={theme} title="Session Summary">
          <Row theme={theme} label="Total Requests" value={String(acc().reqs)} />
          <Row theme={theme} label="Models" value={String(models().length)} />
          <Row theme={theme} label="Subagents" value={String(props.stats.subagents)} />
          <Row theme={theme} label="Total Tokens" value={fmt(tokenTotal(acc()))} color={theme.number} />
          <Row theme={theme} label="Cached Tokens" value={fmt(acc().cacheRead)} color={theme.info} />
          <Row theme={theme} label="Total Cost" value={cost(acc().cost)} />
        </Section>
        <Section theme={theme} title="Models" count={String(models().length)}>
          {models().map(([key, usage]) => <box flexDirection="column" gap={0} marginBottom={1}>
            <text fg={theme.muted} wrapMode="none">
              <b><span style={{ fg: theme.text }}>{truncate(short(key), 23).padEnd(23)}</span></b>{" "}
              <b><span style={{ fg: hitStyle(theme, hitPct(usage)).color }}>{fmtHit(hitPct(usage)).padStart(7)}</span></b>{" "}
              <HitBar theme={theme} hit={hitPct(usage)} />
            </text>
            <MetaLine theme={theme} label={key.split("/")[0]} tokens={tokenTotal(usage)} value={usage.cost} />
          </box>)}
        </Section>
        <Section theme={theme} title="Totals" count={`main + ${props.stats.subagents} subagents`}>
          <Totals theme={theme} acc={acc()} />
        </Section>
        {subs().length > 0 ? <Section theme={theme} title="Subagents" count={String(subs().length)}>
          {subs().map((sub) => <Subagent theme={theme} sub={sub} />)}
        </Section> : null}
      </box>}
      {acc().count > acc().reqs ? <text fg={theme.warning}>
        {acc().count - acc().reqs} assistant step(s) have no recorded usage; totals exclude them.
      </text> : null}
    </scrollbox>
    <text fg={theme.muted}>Snapshot · assistant steps only · excludes compaction</text>
    <text fg={theme.muted}>CH Levels {([[90, "≥90%"], [70, "70–89%"], [40, "40–69%"], [0, "<40%"]] as const).map(([hit, label]) =>
      <span style={{ fg: hitStyle(theme, hit).color }}> ● {label}</span>
    )}</text>
  </box>;
}

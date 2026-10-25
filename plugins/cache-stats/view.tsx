/** @jsxImportSource @opentui/solid */
import { usePlugin } from "@opencode/plugin/tui";
import { useTerminalDimensions, type JSX } from "@opentui/solid";
import type { RGBA, ScrollBoxRenderable } from "@opentui/core";
import { createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { selectScope, type Collected, type Scope, type ScopeStats, type Sub } from "./collect.ts";
import { hitPct, sanitize, tokenTotal, type Acc, type RequestSample } from "./stats.ts";
import type { LiveState, LiveStats } from "./live.ts";
import { copyReport } from "./report.ts";
import {
  dialogLayout, formatCost, formatHit, formatNumber, hitLevel,
  nextView, progressBar, recentWindow, scrollLabel, trendGlyph, VIEWS, type StatsView,
} from "./presentation.ts";

type Theme = Record<"text" | "muted" | "border" | "accent" | "number" | "success" | "info" | "warning" | "error", RGBA>;
const SCOPES = ["all", "main", "subagents"] as const;
const VIEW_LABELS = { summary: "Summary", models: "Models", usage: "Usage", agents: "Agents" };
const SHORT_LABELS = { summary: "Sum", models: "Mod", usage: "Use", agents: "Agt" };

function shortModel(model: string): string { return sanitize(model.slice(model.indexOf("/") + 1)); }
function share(part: number, total: number): string { return total > 0 ? `${(100 * part / total).toFixed(1)}%` : "—"; }

function Metric(props: { theme: Theme; label: string; value: string; color?: RGBA; labelColor?: RGBA; suffix?: string }) {
  return <box flexDirection="row" gap={1} width="100%">
    <text fg={props.labelColor ?? props.theme.muted} flexGrow={1} flexShrink={1} minWidth={0} wrapMode="none" truncate>{props.label}</text>
    <text fg={props.color ?? props.theme.text} flexShrink={0} wrapMode="none"><b>{props.value}</b></text>
    <Show when={props.suffix !== undefined}>
      <text fg={props.theme.muted} width={7} textAlign="right" flexShrink={0} wrapMode="none">{props.suffix}</text>
    </Show>
  </box>;
}

function Section(props: { theme: Theme; title: string; detail?: string; children: JSX.Element }) {
  return <box flexDirection="column" gap={0} marginTop={1}>
    <box flexDirection="row" gap={1}>
      <text fg={props.theme.accent} flexShrink={0}><b>{props.title}</b></text>
      <text fg={props.theme.muted} minWidth={0} flexShrink={1} wrapMode="none" truncate>{props.detail}</text>
    </box>
    {props.children}
  </box>;
}

function HitBar(props: { theme: Theme; hit: number; width?: number }) {
  const bar = () => progressBar(props.hit, props.width);
  return <>
    <span style={{ fg: props.theme.success }}>{bar().filled}</span>
    <Show when={bar().partial}>
      <span style={{ fg: props.theme.success, bg: props.theme.error }}>{bar().partial}</span>
    </Show>
    <span style={{ fg: bar().unknown ? props.theme.muted : props.theme.error }}>{bar().empty}</span>
  </>;
}

function Empty(props: { theme: Theme; title: string; message: string; action?: () => void; actionLabel?: string }) {
  return <box flexDirection="column" gap={1} paddingTop={1}>
    <text fg={props.theme.text}><b>{props.title}</b></text>
    <text fg={props.theme.muted}>{props.message}</text>
    <Show when={props.action}>
      <text fg={props.theme.accent} onMouseUp={() => props.action?.()}>{props.actionLabel}</text>
    </Show>
  </box>;
}

function RecentTrend(props: { theme: Theme; samples: RequestSample[]; width: number }) {
  const recent = createMemo(() => recentWindow(props.samples, props.width));
  return <Section theme={props.theme} title={`Recent ${recent().samples.length}`} detail={`· ${formatHit(recent().hit)} cached token hit`}>
    <text wrapMode="none">
      {recent().samples.map((sample, index) => <span style={{ fg: props.theme[hitLevel(hitPct(sample.usage)).color] }}>
        {index > 0 ? " " : ""}{trendGlyph(hitPct(sample.usage))}
      </span>)}
    </text>
    <box flexDirection="row" justifyContent="space-between">
      <text fg={props.theme.muted}>oldest</text><text fg={props.theme.muted}>newest</text>
    </box>
  </Section>;
}

function Summary(props: { theme: Theme; stats: ScopeStats; width: number; twoColumns: boolean; scope: Scope }) {
  const acc = () => props.stats.acc;
  return <Show when={acc().reqs > 0} fallback={<Empty theme={props.theme}
    title={acc().count > 0 ? "Waiting for recorded usage" : "No assistant usage in this scope"}
    message={props.scope === "subagents" && props.stats.subagents === 0
      ? "No subagents have run. Main and All may have usage."
      : acc().count > 0 ? "Streaming or failed steps may not report tokens yet."
        : "Run a request; this view will update automatically."} />}>
    <box flexDirection="column" gap={0}>
      <text fg={props.theme.muted}>Assistant usage</text>
      <box flexDirection={props.twoColumns ? "row" : "column"} gap={props.twoColumns ? 3 : 0}>
        <box flexDirection="column" flexGrow={props.twoColumns ? 1 : 0} flexBasis={props.twoColumns ? 0 : undefined} minWidth={0}>
          <Metric theme={props.theme} label="Requests" value={String(acc().reqs)} />
          <Metric theme={props.theme} label="Models" value={String(props.stats.perModel.size)} />
          <Metric theme={props.theme} label="Subagents" value={String(props.stats.subagents)} />
        </box>
        <box flexDirection="column" flexGrow={props.twoColumns ? 1 : 0} flexBasis={props.twoColumns ? 0 : undefined} minWidth={0}>
          <Metric theme={props.theme} label="Tokens" value={formatNumber(tokenTotal(acc()))} color={props.theme.number} />
          <Metric theme={props.theme} label="Cache read" value={formatNumber(acc().cacheRead)} color={props.theme.info} />
          <Metric theme={props.theme} label="Cost" value={formatCost(acc().cost)} />
        </box>
      </box>
      <RecentTrend theme={props.theme} samples={props.stats.recent} width={props.width} />
      <Show when={props.stats.compaction.count > 0}>
        <box marginTop={1}>
          <Metric theme={props.theme} label="Compaction (separate)" value={formatCost(props.stats.compaction.cost)} />
        </box>
      </Show>
    </box>
  </Show>;
}

function TokenRows(props: { theme: Theme; acc: Acc }) {
  return <>
    {([
      ["Fresh input", "input", "number"], ["Cache read", "cacheRead", "info"],
      ["Cache write", "cacheWrite", "warning"], ["Output", "output", "number"],
      ["Reasoning", "reasoning", "number"],
    ] as const).map(([label, key, color]) => <Metric theme={props.theme} label={label}
      value={formatNumber(props.acc[key])} color={props.theme[color]} suffix={share(props.acc[key], tokenTotal(props.acc))} />)}
    <Metric theme={props.theme} label="Total tokens" value={formatNumber(tokenTotal(props.acc))}
      suffix={share(tokenTotal(props.acc), tokenTotal(props.acc))} />
  </>;
}

function Usage(props: { theme: Theme; stats: ScopeStats }) {
  const acc = () => props.stats.acc;
  const compaction = () => props.stats.compaction;
  return <box flexDirection="column" gap={0}>
    <Metric theme={props.theme} label="Assistant tokens" value="Count" suffix="Share"
      labelColor={props.theme.accent} color={props.theme.muted} />
    <TokenRows theme={props.theme} acc={acc()} />
    <Section theme={props.theme} title="Requests">
      <Metric theme={props.theme} label="Requests with cache reads" value={`${acc().reqsWithCacheRead}/${acc().reqs}`}
        suffix={share(acc().reqsWithCacheRead, acc().reqs)} />
      <Metric theme={props.theme} label="Requests without cache reads" value={String(acc().reqs - acc().reqsWithCacheRead)} />
    </Section>
    <Show when={acc().reqs > 0}>
      <Section theme={props.theme} title="Average / request">
        <Metric theme={props.theme} label="Fresh input" value={formatNumber(acc().input / acc().reqs)} />
        <Metric theme={props.theme} label="Cache read" value={formatNumber(acc().cacheRead / acc().reqs)} />
        <Metric theme={props.theme} label="Output" value={formatNumber(acc().output / acc().reqs)} />
        <Metric theme={props.theme} label="Cost" value={formatCost(acc().cost / acc().reqs)} />
      </Section>
    </Show>
    <Section theme={props.theme} title="Recorded cost" detail="· USD">
      <Metric theme={props.theme} label="Assistant" value={formatCost(acc().cost)} />
      <Show when={compaction().count > 0}>
        <Metric theme={props.theme} label="Compaction" value={formatCost(compaction().cost)} />
        <Metric theme={props.theme} label="Combined" value={formatCost(acc().cost + compaction().cost)} />
      </Show>
    </Section>
    <Show when={compaction().count > 0}>
      <Section theme={props.theme} title="Compaction" detail={`· ${compaction().reqs} recorded steps`}>
        <Metric theme={props.theme} label="Token type" value="Count" suffix="Share" color={props.theme.muted} />
        <TokenRows theme={props.theme} acc={compaction()} />
      </Section>
    </Show>
  </box>;
}

function Models(props: { theme: Theme; models: [string, Acc][]; width: number }) {
  return <Show when={props.models.length > 0} fallback={<Empty theme={props.theme}
    title="No models with recorded usage" message="Choose another scope or wait for an assistant step to finish." />}>
    <box flexDirection="column" gap={1}>
      {props.models.map(([model, acc]) => <box flexDirection="column" gap={0}>
        <box flexDirection="row" gap={1}>
          <text fg={props.theme.text} flexGrow={1} flexShrink={1} minWidth={0} wrapMode="none" truncate><b>{shortModel(model)}</b></text>
          <text fg={props.theme[hitLevel(hitPct(acc)).color]} flexShrink={0}><b>{formatHit(hitPct(acc))}</b></text>
          <Show when={props.width >= 42}><text flexShrink={0}><HitBar theme={props.theme} hit={hitPct(acc)} width={8} /></text></Show>
        </box>
        <Metric theme={props.theme} label={sanitize(model.split("/")[0])} value={formatCost(acc.cost)} />
        <text fg={props.theme.muted}>{acc.reqs} requests · {formatNumber(tokenTotal(acc))} tokens</text>
      </box>)}
    </box>
  </Show>;
}

function Agents(props: { theme: Theme; subs: Sub[]; scope: Scope; showAll: () => void }) {
  return <Show when={props.subs.length > 0} fallback={<Empty theme={props.theme}
    title={props.scope === "main" ? "Main excludes subagents" : "No subagents in this session tree"}
    message={props.scope === "main" ? "Select All or Subagents to inspect their usage." : "Subagents will appear here when they run."}
    action={props.scope === "main" ? props.showAll : undefined} actionLabel="Show All scope →" />}>
    <box flexDirection="column" gap={1}>
      <text fg={props.theme.muted}>Subtree totals; nested rows overlap.</text>
      {props.subs.map((sub) => <box flexDirection="column" gap={0}>
        <box flexDirection="row" gap={1}>
          <text fg={props.theme.text} flexGrow={1} minWidth={0} flexShrink={1} wrapMode="none" truncate><b>{sub.name}</b></text>
          <text fg={props.theme[hitLevel(sub.hit).color]} flexShrink={0}><b>{formatHit(sub.hit)}</b></text>
        </box>
        <Metric theme={props.theme} label={sub.model ? shortModel(sub.model) : "No model usage"} value={formatCost(sub.cost)} />
        <text fg={props.theme.muted}>{sub.reqsWithCacheRead}/{sub.reqs} requests cached · {formatNumber(sub.tokens)} tokens</text>
        <text fg={props.theme.muted} wrapMode="none" truncate>{sub.id}</text>
      </box>)}
    </box>
  </Show>;
}

function Help(props: { theme: Theme; back: () => void }) {
  return <box flexDirection="column" gap={0}>
    <text fg={props.theme.accent}><b>Controls</b></text>
    {([
      ["Next / previous view", "Tab / Shift+Tab"], ["Views also support", "← / →"],
      ["Cycle scope", "f"], ["Refresh", "r"], ["Copy Markdown / JSON", "m / j"],
      ["Scroll / page", "↑↓ / PgUp PgDn"], ["First / last row", "Home / End"],
      ["Help / return", "h"], ["Close", "Esc"],
    ] as const).map(([label, value]) => <Metric theme={props.theme} label={label} value={value} />)}
    <Section theme={props.theme} title="Reading the numbers">
      <text fg={props.theme.muted}>Hit = cache read / (fresh input + cache read).</text>
      <text fg={props.theme.muted}>Bar: green = cache hit; red = cache miss.</text>
      <text fg={props.theme.muted}>Requests count recorded steps, not retries.</text>
      <text fg={props.theme.muted}>Costs are reported usage, not estimated savings.</text>
      <text fg={props.theme.muted}>Missing usage is excluded, not counted as zero.</text>
      <text fg={props.theme.muted}>Compaction is separate; other auxiliary calls excluded.</text>
    </Section>
    <Section theme={props.theme} title="Cache hit levels">
      {([90, 70, 40, 0] as const).map((hit) => <Metric theme={props.theme}
        label={hit === 90 ? "90% and above" : hit === 70 ? "70–89%" : hit === 40 ? "40–69%" : "Below 40%"}
        value={hitLevel(hit).word} color={props.theme[hitLevel(hit).color]} />)}
    </Section>
    <Section theme={props.theme} title="Reports">
      <text fg={props.theme.muted}>Copies the entire selected scope, not just this view.</text>
      <text fg={props.theme.muted}>Includes session IDs and titles, never message text.</text>
      <text fg={props.theme.muted}>The terminal must allow OSC 52 clipboard writes.</text>
    </Section>
    <text fg={props.theme.accent} marginTop={1} onMouseUp={props.back}>← Back to statistics (h)</text>
  </box>;
}

export function CacheStatsView(props: { stats: Collected; live: LiveStats }) {
  const context = usePlugin();
  const dimensions = useTerminalDimensions();
  const layout = createMemo(() => dialogLayout(dimensions().width, dimensions().height));
  const [state, setState] = createSignal<LiveState>({ stats: props.stats, loading: false, stale: false });
  const stop = props.live.watch(props.stats.sessionID, (next) => setState(next), props.stats);
  onCleanup(stop);
  const [scope, setScope] = createSignal<Scope>("all");
  const [view, setView] = createSignal<StatsView>("summary");
  const [scrollInfo, setScrollInfo] = createSignal("");
  let previousView: StatsView = "summary";
  const snapshot = () => state().stats ?? props.stats;
  const selected = createMemo(() => selectScope(snapshot(), scope()));
  const acc = () => selected().acc;
  const hit = () => hitPct(acc());
  const missLabel = () => hit() < 0 ? "no usage" : `${formatHit(100 - hit())} miss`;
  const barWidth = () => Math.max(4, Math.min(12,
    layout().width - `${formatHit(hit())} ${hitLevel(hit()).word}`.length - missLabel().length - 19));
  const models = createMemo(() => [...selected().perModel].sort((a, b) => hitPct(b[1]) - hitPct(a[1]) || b[1].reqs - a[1].reqs));
  const subs = createMemo(() => [...selected().subs].sort((a, b) => b.hit - a.hit || b.reqs - a.reqs));
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
  let scroll: ScrollBoxRenderable | undefined;
  const syncScroll = () => {
    if (!scroll || scroll.isDestroyed) return;
    setScrollInfo(scrollLabel(scroll.scrollTop, scroll.viewport.height, scroll.scrollHeight));
  };
  // Observe our content wrapper, not ScrollBox's internal size callback:
  // overriding that callback prevents OpenTUI from recalculating scroll ranges.
  const deferScroll = () => queueMicrotask(syncScroll);
  const resetScroll = () => { scroll?.scrollTo(0); syncScroll(); };
  const changeScope = (next: Scope) => { setScope(next); resetScroll(); };
  const changeView = (next: StatsView) => { setView(next); resetScroll(); };
  const toggleHelp = () => {
    if (view() === "help") changeView(previousView);
    else { previousView = view(); changeView("help"); }
  };
  const moveScroll = (delta: number) => { scroll?.scrollBy(delta); syncScroll(); };

  context.keymap.layer(() => ({
    mode: "modal",
    priority: 20,
    commands: [
      { id: "cache-stats.filter", title: "Cycle cache stats scope", bind: "f", run: () => changeScope(SCOPES[(SCOPES.indexOf(scope()) + 1) % SCOPES.length]) },
      { id: "cache-stats.view-next", title: "Next cache stats view", bind: "tab,right", run: () => changeView(nextView(view())) },
      { id: "cache-stats.view-previous", title: "Previous cache stats view", bind: "shift+tab,left", run: () => changeView(nextView(view(), -1)) },
      { id: "cache-stats.help", title: "Cache stats help", bind: "h,?,shift+?", run: toggleHelp },
      { id: "cache-stats.refresh", title: "Refresh cache stats", bind: "r", run: () => props.live.refresh(snapshot().sessionID) },
      { id: "cache-stats.copy-markdown", title: "Copy cache stats as Markdown", bind: "m", run: () => { copyReport(context, snapshot(), scope(), "markdown", state().stale); } },
      { id: "cache-stats.copy-json", title: "Copy cache stats as JSON", bind: "j", run: () => { copyReport(context, snapshot(), scope(), "json", state().stale); } },
      { id: "cache-stats.scroll-up", bind: "up", run: () => moveScroll(-1) },
      { id: "cache-stats.scroll-down", bind: "down", run: () => moveScroll(1) },
      { id: "cache-stats.page-up", bind: "pageup", run: () => moveScroll(-Math.max(1, layout().bodyHeight - 1)) },
      { id: "cache-stats.page-down", bind: "pagedown", run: () => moveScroll(Math.max(1, layout().bodyHeight - 1)) },
      { id: "cache-stats.first", bind: "home", run: resetScroll },
      { id: "cache-stats.last", bind: "end", run: () => { scroll?.scrollTo(scroll.scrollHeight); syncScroll(); } },
    ],
  }));

  const status = () => {
    if (state().loading) return state().stale ? "Retrying…" : "Refreshing…";
    if (state().stale) return "Stale · r to retry";
    const time = new Date(snapshot().updatedAt).toLocaleTimeString("en-GB", { hour12: false });
    return `Live ${time}`;
  };

  return <Show when={layout().supported} fallback={<box flexDirection="column" padding={1}>
    <text fg={theme.accent}><b>Cache stats</b></text>
    <text fg={theme.muted}>Resize terminal to at least 28 × 12.</text>
    <text fg={theme.muted}>Esc to close</text>
  </box>}>
    <box flexDirection="column" width="100%" paddingLeft={1} paddingRight={1} paddingBottom={1} gap={0}>
      <box flexDirection="row" gap={1}>
        <text fg={theme.accent} flexShrink={0}><b>Cache Stat</b></text>
        <text fg={theme.muted} flexShrink={0}>|</text>
        <text fg={theme.muted} flexGrow={1} flexShrink={1} minWidth={0} wrapMode="none" truncate>{snapshot().title}</text>
        <text fg={theme.muted} flexShrink={0} onMouseUp={toggleHelp}>{layout().compact ? "?" : view() === "help" ? "h back" : "h help"}</text>
        <text fg={theme.muted} flexShrink={0} onMouseUp={() => context.ui.dialog.clear()}>esc</text>
      </box>
      <box flexDirection="row" gap={1}>
        <text fg={theme.muted} flexShrink={0}>Scope</text>
        {SCOPES.map((value) => <text fg={scope() === value ? theme.accent : theme.muted} flexShrink={0}
          onMouseUp={() => changeScope(value)} wrapMode="none">
          {scope() === value ? `[${value === "subagents" && layout().compact ? "Subs" : value === "subagents" ? "Subagents" : value === "main" ? "Main" : "All"}]`
            : value === "subagents" && layout().compact ? "Subs" : value === "subagents" ? "Subagents" : value === "main" ? "Main" : "All"}
        </text>)}
      </box>
      <box flexDirection="row" gap={1}>
        {VIEWS.map((value) => <text fg={view() === value ? theme.text : theme.muted} flexShrink={0}
          onMouseUp={() => changeView(value)} wrapMode="none">
          {view() === value ? `[${layout().compact ? SHORT_LABELS[value] : VIEW_LABELS[value]}]`
            : layout().compact ? SHORT_LABELS[value] : VIEW_LABELS[value]}
        </text>)}
      </box>
      <box flexDirection="row" gap={1}>
        <text fg={theme[hitLevel(hit()).color]} flexShrink={0}><b>{formatHit(hit())} {hitLevel(hit()).word}</b></text>
        <Show when={!layout().compact}>
          <text fg={theme.muted} flexGrow={1} minWidth={0} wrapMode="none" truncate>cached token hit</text>
          <text flexShrink={0}><HitBar theme={theme} hit={hit()} width={barWidth()} /></text>
          <text fg={hit() < 0 ? theme.muted : theme.error} flexShrink={0}>{missLabel()}</text>
        </Show>
      </box>
      <text fg={theme.border} wrapMode="none">{"─".repeat(layout().width)}</text>
      <scrollbox height={layout().bodyHeight} scrollY scrollX={false}
        scrollbarOptions={{ trackOptions: { backgroundColor: theme.border } }}
        viewportOptions={{ paddingRight: 1 }}
        onSizeChange={deferScroll} onMouseScroll={deferScroll} onMouseUp={deferScroll}
        ref={(value) => { scroll = value; }}>
        <box flexDirection="column" width="100%" flexShrink={0} onSizeChange={deferScroll}>
          <Switch>
          <Match when={view() === "summary"}><Summary theme={theme} stats={selected()} scope={scope()} width={layout().bodyWidth} twoColumns={layout().twoColumns} /></Match>
          <Match when={view() === "models"}><Models theme={theme} models={models()} width={layout().bodyWidth} /></Match>
          <Match when={view() === "usage"}><Usage theme={theme} stats={selected()} /></Match>
          <Match when={view() === "agents"}><Agents theme={theme} subs={subs()} scope={scope()} showAll={() => changeScope("all")} /></Match>
          <Match when={view() === "help"}><Help theme={theme} back={toggleHelp} /></Match>
          </Switch>
        </box>
      </scrollbox>
      <box flexDirection="row" gap={1}>
        <text fg={state().stale ? theme.warning : theme.muted} flexGrow={1} flexShrink={1}
          minWidth={0} wrapMode="none" truncate onMouseUp={() => { void props.live.refresh(snapshot().sessionID); }}>{status()}</text>
        <Show when={!layout().compact}><text fg={theme.muted} flexShrink={0}>{scrollInfo()}</text></Show>
      </box>
      <text fg={theme.muted} wrapMode="none" truncate>{layout().compact ? "Tab view · f scope · ↑↓" : "Tab view · f scope · r refresh · m/j copy"}</text>
    </box>
  </Show>;
}

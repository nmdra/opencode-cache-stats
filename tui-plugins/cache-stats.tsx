/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"
import type { TuiPlugin, TuiPluginModule, TuiPluginApi } from "@opencode-ai/plugin/tui"

type Theme = TuiPluginApi["theme"]["current"]

type RGBA = TuiPluginApi["theme"]["current"]["primary"]

type Acc = {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  cost: number
  count: number
  calls: number
  callsWithCacheRead: number
  callsWithCacheWrite: number
  lastInput: number
  lastOutput: number
  lastReasoning: number
  lastCacheRead: number
  lastCacheWrite: number
}

type Sub = { id: string; name: string; hit: number; msgs: number; calls: number; callsWithCacheRead: number }

type Collected = {
  acc: Acc
  subagents: number
  perModel: Map<string, Acc>
  subs: Sub[]
}

type SessionChild = { id?: string; agent?: string; agentType?: string; title?: string }

type StateSessionWithChildren = { children?: (sessionID: string) => SessionChild[] | undefined }

type NormalizedMsg = {
  role?: string
  tokens?: Tokens
  cost: number
  providerID?: string
  modelID?: string
  model?: Part["model"]
}

type ScrollHandle = {
  scrollHeight: number
  height: number
  scrollBy(delta: number): void
}

function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

function safe(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0
}

const HIT_EXCELLENT = 90
const HIT_GOOD = 70
const HIT_FAIR = 40

const PANEL_WIDTH = 58
const SCROLL_HEIGHT = 14
const BAR_WIDTH = 10
const CELL_MIN = 18
const CELL_MAX = 22
const HEADER_TITLE_MAX = 30
const EMPTY_TITLE_MAX = 40
const SUB_NAME_MAX = 18
const SUB_ID_MAX = 8
const SUB_FALLBACK_MAX = 20
const SCROLL_HINT_MIN = 12
const PAGE_STEP = 10
const SEPARATOR = "─".repeat(31)

function hitPct(t: Acc): number {
  const denom = t.input + t.cacheRead
  return denom <= 0 ? -1 : (100 * t.cacheRead) / denom
}

function fmtHit(h: number): string {
  return h < 0 ? "n/a" : `${h.toFixed(1)}%`
}

function hitText(t: Acc): string {
  return fmtHit(hitPct(t))
}

function hitStyle(theme: Theme, h: number): { color: RGBA; word: string } {
  if (h < 0) return { color: theme.textMuted, word: "—" }
  if (h >= HIT_EXCELLENT) return { color: theme.success, word: "Excellent" }
  if (h >= HIT_GOOD) return { color: theme.info, word: "Good" }
  if (h >= HIT_FAIR) return { color: theme.warning, word: "Fair" }
  return { color: theme.error, word: "Poor" }
}

function hitSegments(theme: Theme, h: number, width: number): { color: RGBA; filled: string; empty: string } {
  const w = Math.max(4, width)
  if (h < 0) return { color: theme.textMuted, filled: "·".repeat(w), empty: "" }
  const filled = Math.round((h / 100) * w)
  return { color: hitStyle(theme, h).color, filled: "█".repeat(filled), empty: "░".repeat(Math.max(0, w - filled)) }
}

function HitBar(props: { theme: Theme; pct: number; width: number }) {
  const b = hitSegments(props.theme, props.pct, props.width)
  return (
    <>
      <b>
        <span style={{ fg: b.color }}>{b.filled}</span>
      </b>
      {b.empty.length > 0 ? (
        <b>
          <span style={{ fg: props.theme.borderSubtle }}>{b.empty}</span>
        </b>
      ) : null}
    </>
  )
}

function newAcc(): Acc {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    count: 0,
    calls: 0,
    callsWithCacheRead: 0,
    callsWithCacheWrite: 0,
    lastInput: 0,
    lastOutput: 0,
    lastReasoning: 0,
    lastCacheRead: 0,
    lastCacheWrite: 0,
  }
}

function padStart(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

function sanitize(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, "")
}

function short(s: string): string {
  const i = s.indexOf("/")
  return i >= 0 ? s.slice(i + 1) : s
}

type Tokens = { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }

type Part = { type?: string; tokens?: Tokens; cost?: number; model?: { providerID?: string; modelID?: string; id?: string } }

type Msg = {
  info?: { role?: string; tokens?: Tokens; cost?: number; providerID?: string; modelID?: string; model?: { providerID?: string; modelID?: string; id?: string } }
  data?: { role?: string; tokens?: Tokens; cost?: number; providerID?: string; modelID?: string; model?: { providerID?: string; modelID?: string; id?: string } }
  role?: string
  type?: string
  tokens?: Tokens
  cost?: number
  providerID?: string
  modelID?: string
  model?: { providerID?: string; modelID?: string; id?: string }
  parts?: Part[]
}

type Call = { tokens?: Tokens; cost?: number; model?: Part["model"] }

function normalizeMsg(m: Msg): NormalizedMsg {
  const info = m.info
  const data = m.data
  const model = data?.model ?? info?.model ?? m.model
  return {
    role: data?.role ?? info?.role ?? m.role ?? m.type,
    tokens: data?.tokens ?? info?.tokens ?? m.tokens,
    cost: safe(data?.cost ?? info?.cost ?? m.cost),
    providerID:
      data?.providerID ?? data?.model?.providerID ?? info?.providerID ?? info?.model?.providerID ?? m.providerID ?? m.model?.providerID,
    modelID:
      data?.modelID ?? data?.model?.modelID ?? data?.model?.id ?? info?.modelID ?? info?.model?.modelID ?? info?.model?.id ?? m.modelID ??
      m.model?.modelID ?? m.model?.id,
    model,
  }
}

function collectCalls(m: Msg, nm: NormalizedMsg): Call[] {
  const parts = m.parts ?? []
  const steps = parts.filter((p) => p.type === "step-finish")
  if (steps.length > 0) {
    return steps.map((p) => ({ tokens: p.tokens, cost: p.cost, model: p.model }))
  }
  return [{ tokens: nm.tokens, cost: nm.cost, model: nm.model }]
}

function accCall(acc: Acc, call: Call): void {
  const t = call.tokens
  if (!t) return
  const input = safe(t.input)
  const cacheRead = safe(t.cache?.read)
  const cacheWrite = safe(t.cache?.write)
  acc.input += input
  acc.output += safe(t.output)
  acc.reasoning += safe(t.reasoning)
  acc.cacheRead += cacheRead
  acc.cacheWrite += cacheWrite
  acc.cost += safe(call.cost)
  acc.calls += 1
  if (cacheRead > 0) acc.callsWithCacheRead += 1
  if (cacheWrite > 0) acc.callsWithCacheWrite += 1
  acc.lastInput = input
  acc.lastOutput = safe(t.output)
  acc.lastReasoning = safe(t.reasoning)
  acc.lastCacheRead = cacheRead
  acc.lastCacheWrite = cacheWrite
}

function mergeAcc(dst: Acc, src: Acc): void {
  dst.input += src.input
  dst.output += src.output
  dst.reasoning += src.reasoning
  dst.cacheRead += src.cacheRead
  dst.cacheWrite += src.cacheWrite
  dst.cost += src.cost
  dst.count += src.count
  dst.calls += src.calls
  dst.callsWithCacheRead += src.callsWithCacheRead
  dst.callsWithCacheWrite += src.callsWithCacheWrite
}
function mergeModel(dst: Map<string, Acc>, src: Map<string, Acc>): void {
  for (const [k, v] of src) {
    let p = dst.get(k)
    if (!p) {
      p = newAcc()
      dst.set(k, p)
    }
    mergeAcc(p, v)
  }
}

function keyFor(model: Part["model"] | undefined, nm: NormalizedMsg): string {
  const p = model?.providerID ?? nm.providerID ?? "?"
  const q = model?.modelID ?? model?.id ?? nm.modelID ?? "?"
  return `${p}/${q}`
}

const SUBAGENT_TITLE_RE = /\(@([^)\s]+)\s+subagent\)/

function agentName(child: SessionChild): string {
  const raw = child?.agent ?? child?.agentType
  if (typeof raw === "string" && raw.trim()) return raw.trim()
  const title = child?.title
  if (typeof title === "string") {
    const m = title.match(SUBAGENT_TITLE_RE)
    if (m) return m[1]
    const word = title.split(/\s+/)[0]
    if (word) return word
  }
  return ""
}

function fmtCost(n: number): string {
  return n === 0 ? "$0" : `$${n.toFixed(2)}`
}

async function fetchList<T>(
  api: () => Promise<T[] | { data?: T[] }>,
  state: () => T[],
  tag: string,
): Promise<T[]> {
  let apiErr: unknown
  try {
    const res = await api()
    const data = Array.isArray(res) ? res : res?.data
    if (Array.isArray(data) && data.length > 0) return data
  } catch (err) {
    apiErr = err
  }
  let stateErr: unknown
  try {
    const data = state()
    if (Array.isArray(data) && data.length > 0) return data
  } catch (err) {
    stateErr = err
  }
  if (apiErr !== undefined || stateErr !== undefined) {
    console.error(`[cache-stats] ${tag}: no data`, { api: apiErr, state: stateErr })
  }
  return []
}

async function collect(
  client: TuiPluginApi["client"],
  state: TuiPluginApi["state"],
  sessionID: string,
  visited: Set<string>,
  signal: AbortSignal,
): Promise<Collected> {
  if (visited.has(sessionID) || signal.aborted) return { acc: newAcc(), subagents: 0, perModel: new Map(), subs: [] }
  visited.add(sessionID)

  const [messages, children] = await Promise.all([
    fetchList<Msg>(
      () => client.session.messages({ sessionID }),
      () => state.session.messages(sessionID),
      "messages",
    ),
    fetchList<SessionChild>(
      () => client.session.children({ sessionID }),
      () => (state.session as unknown as StateSessionWithChildren).children?.(sessionID) ?? [],
      "children",
    ),
  ])

  const acc = newAcc()
  const perModel = new Map<string, Acc>()
  for (const m of messages) {
    if (!m || signal.aborted) continue
    const nm = normalizeMsg(m)
    if (nm.role !== "assistant") continue
    for (const call of collectCalls(m, nm)) {
      const key = keyFor(call.model, nm)
      let p = perModel.get(key)
      if (!p) {
        p = newAcc()
        perModel.set(key, p)
      }
      accCall(p, call)
    }
    acc.count += 1
  }
  for (const p of perModel.values()) mergeAcc(acc, p)

  if (signal.aborted) return { acc, subagents: 0, perModel, subs: [] }

  let subagents = 0
  const subs: Sub[] = []
  const results = await Promise.all(
    children.map(async (child) => {
      const cid = child?.id ?? ""
      if (!cid) return null
      const sub = await collect(client, state, cid, visited, signal)
      return { child, cid, sub }
    }),
  )
  for (const r of results) {
    if (!r || signal.aborted) continue
    const { child, cid, sub } = r
    subagents += 1 + sub.subagents
    subs.push({
      id: cid,
      name: sanitize(agentName(child)) || cid,
      hit: hitPct(sub.acc),
      msgs: sub.acc.count,
      calls: sub.acc.calls,
      callsWithCacheRead: sub.acc.callsWithCacheRead,
    })
    mergeAcc(acc, sub.acc)
    mergeModel(perModel, sub.perModel)
    subs.push(...sub.subs)
  }

  return { acc, subagents, perModel, subs }
}

function SectionHeader(props: { theme: Theme; title: string; count: string }) {
  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.theme.accent}>│</text>
      <text fg={props.theme.secondary}>
        <b>{props.title}</b> <b><span style={{ fg: props.theme.textMuted }}>· {props.count}</span></b>
      </text>
    </box>
  )
}

function ModelsSection(props: { theme: Theme; models: { key: string; acc: Acc }[]; cell: number }) {
  const theme = props.theme
  return (
    <>
      <SectionHeader theme={theme} title="Models" count={String(props.models.length)} />
      <box flexDirection="column" gap={0} paddingLeft={2}>
        {props.models.map((model) => {
          const m = model.acc
          const mh = hitPct(m)
          const mc = hitStyle(theme, mh).color
          const name = truncate(short(model.key), props.cell)
          return (
            <text fg={theme.textMuted} wrapMode="none">
              {padEnd(name, props.cell)}  <b><span style={{ fg: mc }}>{padStart(fmtHit(mh), 6)}</span></b>  <HitBar theme={theme} pct={mh} width={BAR_WIDTH} />
              {m.calls > 0 ? (
                <b>
                  <span style={{ fg: m.callsWithCacheRead === m.calls ? theme.success : theme.textMuted }}>
                    {"  "}
                    {String(m.callsWithCacheRead)}/{String(m.calls)}
                  </span>
                </b>
              ) : null}
            </text>
          )
        })}
      </box>
    </>
  )
}

function TotalsSection(props: { theme: Theme; s: Acc; subagents: number }) {
  const theme = props.theme
  const s = props.s
  const subWord = props.subagents === 1 ? "subagent" : "subagents"
  return (
    <>
      <SectionHeader theme={theme} title="Totals" count={`main + ${String(props.subagents)} ${subWord}`} />
      <box flexDirection="column" gap={0} paddingLeft={2}>
        <text fg={theme.textMuted} wrapMode="none">
          fresh input <b><span style={{ fg: theme.syntaxNumber }}>{fmt(s.input)}</span></b> · output <b><span style={{ fg: theme.syntaxNumber }}>{fmt(s.output)}</span></b> · reasoning <b><span style={{ fg: theme.syntaxNumber }}>{fmt(s.reasoning)}</span></b>
        </text>
        <text fg={theme.textMuted} wrapMode="none">
          cache read <b><span style={{ fg: theme.info }}>{fmt(s.cacheRead)}</span></b> · cache write <b><span style={{ fg: theme.warning }}>{fmt(s.cacheWrite)}</span></b> · cost <b><span style={{ fg: theme.text }}>{fmtCost(s.cost)}</span></b>
        </text>
        {s.calls > 0 ? (
          <text fg={theme.textMuted} wrapMode="none">
            <b><span style={{ fg: s.callsWithCacheRead === s.calls ? theme.success : theme.text }}>{String(s.callsWithCacheRead)}</span></b> of <b><span style={{ fg: theme.text }}>{String(s.calls)}</span></b> calls read from cache
          </text>
        ) : null}
        {s.lastInput + s.lastCacheRead > 0 ? (
          <text fg={theme.textMuted} wrapMode="none">
            <b><span style={{ fg: theme.accent }}>most recent request</span></b> · <b><span style={{ fg: theme.text }}>{fmt(s.lastInput + s.lastCacheRead)}</span></b> tokens · <b><span style={{ fg: theme.info }}>{fmt(s.lastCacheRead)}</span></b> cache
          </text>
        ) : null}
        <text fg={theme.textMuted} wrapMode="none">
          totals are cumulative over all calls
        </text>
      </box>
    </>
  )
}

function SubagentsSection(props: { theme: Theme; subs: Sub[] }) {
  const theme = props.theme
  if (props.subs.length === 0) return null
  return (
    <>
      <box height={1} />
      <SectionHeader theme={theme} title="Subagents" count={String(props.subs.length)} />
      <box flexDirection="column" gap={0} paddingLeft={2}>
        {props.subs.map((sub) => {
          return (
            <text fg={theme.textMuted} wrapMode="none">
              {sub.name !== sub.id ? (
                <>
                  <b><span style={{ fg: theme.text }}>{truncate(sub.name, SUB_NAME_MAX)}</span></b>{" "}
                  <b><span style={{ fg: theme.textMuted }}>{truncate(sub.id, SUB_ID_MAX)}</span></b>
                </>
              ) : (
                truncate(sub.id, SUB_FALLBACK_MAX)
              )}{" "}
              · <b><span style={{ fg: hitStyle(theme, sub.hit).color }}>{fmtHit(sub.hit)}</span></b> · {String(sub.msgs)} msg{sub.msgs === 1 ? "" : "s"}
              {sub.calls > 0 ? ` · ${String(sub.callsWithCacheRead)}/${String(sub.calls)} hit` : ""}
            </text>
          )
        })}
      </box>
    </>
  )
}

function CacheStatsView(props: {
  theme: Theme
  title: string
  acc: Acc
  subagents: number
  subs: Sub[]
  models: { key: string; acc: Acc }[]
}) {
  const theme = props.theme
  const s = props.acc
  const h = hitPct(s)
  const head = hitStyle(theme, h)
  let maxKey = 0
  for (const model of props.models) maxKey = Math.max(maxKey, short(model.key).length)
  const cell = Math.min(Math.max(maxKey, CELL_MIN), CELL_MAX)

  let scroll: ScrollHandle | undefined
  useKeyboard((evt) => {
    if (!scroll) return
    if (scroll.scrollHeight <= scroll.height) return
    if (evt.name === "up") {
      scroll.scrollBy(-1)
      evt.preventDefault()
      evt.stopPropagation()
    } else if (evt.name === "down") {
      scroll.scrollBy(1)
      evt.preventDefault()
      evt.stopPropagation()
    } else if (evt.name === "pageup") {
      scroll.scrollBy(-PAGE_STEP)
      evt.preventDefault()
      evt.stopPropagation()
    } else if (evt.name === "pagedown") {
      scroll.scrollBy(PAGE_STEP)
      evt.preventDefault()
      evt.stopPropagation()
    }
  })

  return (
    <box flexDirection="column" width={PANEL_WIDTH} paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={0}>
      <box flexDirection="row" width="100%" justifyContent="space-between">
        <text fg={theme.primary}>
          <b>Cache stats</b> <b><span style={{ fg: theme.textMuted }}>·</span></b> <b><span style={{ fg: theme.textMuted }}>{truncate(props.title, HEADER_TITLE_MAX)}</span></b>
        </text>
        <text fg={theme.textMuted}>{props.models.length + props.subs.length > SCROLL_HINT_MIN ? "↑/↓ · esc" : "esc"}</text>
      </box>
      <text fg={theme.borderSubtle} wrapMode="none">
        {SEPARATOR}
      </text>

      <scrollbox
        height={SCROLL_HEIGHT}
        scrollY
        scrollbarOptions={{ trackOptions: { backgroundColor: theme.borderSubtle } }}
        viewportOptions={{ paddingRight: 2 }}
        ref={(r) => {
          scroll = r as ScrollHandle
        }}
      >
        {s.calls === 0 ? (
          s.count > 0 ? (
            <box flexDirection="column" width="100%" gap={0} paddingTop={2} paddingBottom={2}>
              <text fg={theme.textMuted} wrapMode="none">
                No token data for <b><span style={{ fg: theme.text }}>{truncate(props.title, EMPTY_TITLE_MAX)}</span></b> yet.
              </text>
              <text fg={theme.textMuted} wrapMode="none">
                Wait for the session to finish streaming, then open again.
              </text>
            </box>
          ) : (
            <box flexDirection="column" width="100%" gap={0} paddingTop={2} paddingBottom={2}>
              <text fg={theme.textMuted} wrapMode="none">
                No cache stats data for <b><span style={{ fg: theme.text }}>{truncate(props.title, EMPTY_TITLE_MAX)}</span></b> yet.
              </text>
              <text fg={theme.textMuted} wrapMode="none">
                Run a few turns in the session, then open again.
              </text>
            </box>
          )
        ) : (
          <box flexDirection="column" width="100%" gap={0}>
            <text fg={theme.textMuted} wrapMode="none">
              <b><span style={{ fg: head.color }}>{hitText(s)}</span></b> <b><span style={{ fg: head.color }}>{head.word}</span></b> · overall hit · <b><span style={{ fg: theme.text }}>{String(s.calls)}</span></b> calls
            </text>

            <box height={1} />

            <ModelsSection theme={theme} models={props.models} cell={cell} />

            <box height={1} />

            <TotalsSection theme={theme} s={s} subagents={props.subagents} />

            <SubagentsSection theme={theme} subs={props.subs} />
          </box>
        )}
      </scrollbox>

      <text fg={theme.borderSubtle} wrapMode="none">
        Cache Hit Levels
      </text>
      <text fg={theme.borderSubtle} wrapMode="none">
        <b><span style={{ fg: theme.success }}>● ≥{HIT_EXCELLENT}%</span></b> <b><span style={{ fg: theme.textMuted }}>·</span></b> <b><span style={{ fg: theme.info }}>● {HIT_GOOD}–{HIT_EXCELLENT - 1}%</span></b> <b><span style={{ fg: theme.textMuted }}>·</span></b> <b><span style={{ fg: theme.warning }}>● {HIT_FAIR}–{HIT_GOOD - 1}%</span></b> <b><span style={{ fg: theme.textMuted }}>·</span></b> <b><span style={{ fg: theme.error }}>● &lt;{HIT_FAIR}%</span></b>
      </text>
    </box>
  )
}

let showInFlight = false

async function showCache(api: TuiPluginApi): Promise<void> {
  if (showInFlight) return
  showInFlight = true
  try {
    const route = api.route?.current
    const sessionID = route?.name === "session" ? route.params?.sessionID : undefined
    if (!sessionID) {
      api.ui.toast({ title: "Cache stats", message: "No active session.", variant: "warning" })
      return
    }

    let title = "session"
    try {
      const s = api.state.session.get(sessionID)
      title = sanitize(s?.title || "session")
    } catch (err) {
      console.error("[cache-stats] session:", err)
    }

    const { acc, subagents, perModel, subs } = await collect(api.client, api.state, sessionID, new Set(), api.lifecycle.signal)
    if (api.lifecycle.signal.aborted) return

    const sorted = [...perModel.entries()].sort((a, b) => b[1].calls - a[1].calls)

    api.ui.dialog.setSize("medium")
    api.ui.dialog.replace(() => (
      <CacheStatsView
        theme={api.theme.current}
        title={title}
        acc={acc}
        subagents={subagents}
        subs={subs}
        models={sorted.map(([key, m]) => ({ key, acc: m }))}
      />
    ))
  } finally {
    showInFlight = false
  }
}

export const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "cache-stats.show",
        title: "Cache stats",
        category: "System",
        namespace: "palette",
        slashName: "cache-stats",
        run: () => {
          void showCache(api)
        },
      },
    ],
  })
}

const plugin: TuiPluginModule = { id: "cache-stats", tui }
export default plugin
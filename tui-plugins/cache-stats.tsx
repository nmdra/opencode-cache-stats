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

type Sub = { id: string; name: string; hit: string; msgs: number; calls: number; callsWithCacheRead: number }

type Collected = {
  acc: Acc
  subagents: number
  perModel: Map<string, Acc>
  subs: Sub[]
}

function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

function safe(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0
}

const HIT_GOOD = 70
const HIT_FAIR = 40

function hitPct(t: Acc): number {
  const denom = t.input + t.cacheRead
  return denom <= 0 ? -1 : (100 * t.cacheRead) / denom
}

function hitText(t: Acc): string {
  const h = hitPct(t)
  return h < 0 ? "n/a" : `${h.toFixed(1)}%`
}

function hitColor(theme: Theme, h: number): RGBA {
  if (h < 0) return theme.textMuted
  if (h >= HIT_GOOD) return theme.success
  if (h >= HIT_FAIR) return theme.info
  return theme.warning
}

function hitVerdict(theme: Theme, h: number): { word: string; color: RGBA } {
  if (h < 0) return { word: "—", color: theme.textMuted }
  if (h >= HIT_GOOD) return { word: "Good", color: theme.success }
  if (h >= HIT_FAIR) return { word: "Fair", color: theme.info }
  return { word: "Poor", color: theme.warning }
}

function hitSegments(theme: Theme, h: number, width: number): { color: RGBA; filled: string; empty: string } {
  const w = Math.max(4, width)
  if (h < 0) return { color: theme.textMuted, filled: "·".repeat(w), empty: "" }
  const filled = Math.round((h / 100) * w)
  return { color: hitColor(theme, h), filled: "█".repeat(filled), empty: "░".repeat(Math.max(0, w - filled)) }
}

function HitBar(props: { theme: Theme; pct: number; width: number }) {
  const b = hitSegments(props.theme, props.pct, props.width)
  return (
    <>
      <b fg={b.color}>{b.filled}</b>
      {b.empty.length > 0 ? <b fg={props.theme.borderSubtle}>{b.empty}</b> : null}
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

function msgRole(m: Msg): string | undefined {
  return m.info?.role ?? m.data?.role ?? m.role ?? m.type
}

function msgTokens(m: Msg): Tokens | undefined {
  return m.info?.tokens ?? m.data?.tokens ?? m.tokens
}

function msgCost(m: Msg): number {
  return safe(m.info?.cost ?? m.data?.cost ?? m.cost)
}

function msgModel(m: Msg): Part["model"] {
  return m.data?.model ?? m.info?.model ?? m.model
}

function msgProviderID(m: Msg): string | undefined {
  return m.data?.providerID ?? m.data?.model?.providerID ?? m.info?.providerID ?? m.info?.model?.providerID ?? m.providerID ?? m.model?.providerID
}

function msgModelID(m: Msg): string | undefined {
  return m.data?.modelID ?? m.data?.model?.modelID ?? m.data?.model?.id ?? m.info?.modelID ?? m.info?.model?.modelID ?? m.info?.model?.id ?? m.modelID ?? m.model?.modelID ?? m.model?.id
}

function collectCalls(m: Msg): Call[] {
  const parts = m.parts ?? []
  const steps = parts.filter((p) => p.type === "step-finish")
  if (steps.length > 0) {
    return steps.map((p) => ({ tokens: p.tokens, cost: p.cost, model: p.model }))
  }
  return [{ tokens: msgTokens(m), cost: m.info?.cost ?? m.data?.cost ?? m.cost, model: msgModel(m) }]
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

function accMsg(acc: Acc, m: Msg): void {
  for (const call of collectCalls(m)) accCall(acc, call)
  acc.count += 1
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

function modelKey(m: Msg): string {
  const p = msgProviderID(m) ?? "?"
  const q = msgModelID(m) ?? "?"
  return `${p}/${q}`
}

function agentName(child: any): string {
  const raw = child?.agent ?? child?.agentType
  if (typeof raw === "string" && raw.trim()) return raw.trim()
  const title = child?.title
  if (typeof title === "string") {
    const m = title.match(/\(@([^)\s]+)\s+subagent\)/)
    if (m) return m[1]
    const word = title.split(/\s+/)[0]
    if (word) return word
  }
  return ""
}

function fmtCost(n: number): string {
  return n === 0 ? "$0" : `$${n.toFixed(2)}`
}

async function collect(
  client: TuiPluginApi["client"],
  state: TuiPluginApi["state"],
  sessionID: string,
  visited: Set<string>,
): Promise<Collected> {
  if (visited.has(sessionID)) return { acc: newAcc(), subagents: 0, perModel: new Map(), subs: [] }
  visited.add(sessionID)

  let messages: Msg[] = []
  try {
    const res: any = await client.session.messages({ sessionID })
    messages = (res?.data ?? res ?? []) as Msg[]
  } catch {}
  if (messages.length === 0) {
    try {
      messages = (state.session.messages(sessionID) ?? []) as Msg[]
    } catch {}
  }

  const acc = newAcc()
  const perModel = new Map<string, Acc>()
  for (const m of messages ?? []) {
    if (!m) continue
    const isAssistant = msgRole(m) === "assistant"
    if (!isAssistant) continue
    const key = modelKey(m)
    let p = perModel.get(key)
    if (!p) {
      p = newAcc()
      perModel.set(key, p)
    }
    accMsg(p, m)
    accMsg(acc, m)
  }

  let children: any[] = []
  let subagents = 0
  const subs: Sub[] = []
  try {
    const res: any = await client.session.children({ sessionID })
    children = res?.data ?? res ?? []
  } catch {}

  for (const child of children) {
    const cid = child?.id ?? ""
    if (!cid) continue
    const sub = await collect(client, state, cid, visited)
    subagents += 1 + sub.subagents
    subs.push({
      id: cid,
      name: agentName(child) || cid,
      hit: hitText(sub.acc),
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
  const headColor = hitColor(theme, h)
  const verdict = hitVerdict(theme, h)
  const subWord = props.subagents === 1 ? "subagent" : "subagents"
  let maxKey = 0
  for (const model of props.models) maxKey = Math.max(maxKey, short(model.key).length)
  const cell = Math.min(Math.max(maxKey, 18), 22)

  const panelW = 56
  const barW = 10

  let scroll: any
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
      scroll.scrollBy(-10)
      evt.preventDefault()
      evt.stopPropagation()
    } else if (evt.name === "pagedown") {
      scroll.scrollBy(10)
      evt.preventDefault()
      evt.stopPropagation()
    }
  })

  return (
    <box flexDirection="column" width={panelW} paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={0}>
      <box flexDirection="row" width="100%" justifyContent="space-between">
        <text fg={theme.primary}>
          <b>Cache stats</b>
        </text>
        <text fg={theme.textMuted}>{props.models.length + props.subs.length > 12 ? "↑/↓ · esc" : "esc"}</text>
      </box>
      <text fg={theme.borderSubtle} wrapMode="none">
        ───────────────────────────────
      </text>

      <scrollbox
        height={14}
        scrollY
        scrollbarOptions={{ trackOptions: { backgroundColor: theme.borderSubtle } }}
        ref={(r) => {
          scroll = r
        }}
      >
        {s.calls === 0 ? (
          <box flexDirection="column" width="100%" gap={0} paddingTop={2} paddingBottom={2}>
            <text fg={theme.textMuted} wrapMode="none">
              No cache stats data for <b fg={theme.text}>{truncate(props.title, 40)}</b> yet.
            </text>
            <text fg={theme.textMuted} wrapMode="none">
              Run a few turns in the session, then open again.
            </text>
          </box>
        ) : (
          <box flexDirection="column" width="100%" gap={0}>
            <text fg={theme.textMuted} wrapMode="none">
              <b fg={headColor}>{hitText(s)}</b> <b fg={verdict.color}>{verdict.word}</b> · overall hit · <b fg={theme.text}>{String(s.calls)}</b> calls
            </text>
            <text fg={theme.textMuted} wrapMode="none">
              {truncate(props.title, 60)}
            </text>

            <box height={1} />

            <box flexDirection="row" gap={1}>
              <text fg={theme.accent}>│</text>
              <text fg={theme.secondary}>
                <b>Models</b> <b fg={theme.textMuted}>· {String(props.models.length)}</b>
              </text>
            </box>
            <box flexDirection="column" gap={0} paddingLeft={2}>
              {props.models.map((model) => {
                const m = model.acc
                const mh = hitPct(m)
                const mc = hitColor(theme, mh)
                const name = truncate(short(model.key), cell)
                return (
                  <text fg={theme.textMuted} wrapMode="none">
                    {padEnd(name, cell)}  <b fg={mc}>{padStart(hitText(m), 6)}</b>  <HitBar theme={theme} pct={mh} width={barW} />
                    {m.calls > 0 ? (
                      <b fg={m.callsWithCacheRead === m.calls ? theme.success : theme.textMuted}>
                        {"  "}
                        {String(m.callsWithCacheRead)}/{String(m.calls)}
                      </b>
                    ) : null}
                  </text>
                )
              })}
            </box>

            <box height={1} />

            <box flexDirection="row" gap={1}>
              <text fg={theme.accent}>│</text>
              <text fg={theme.secondary}>
                <b>Totals</b> <b fg={theme.textMuted}>· main + {String(props.subagents)} {subWord}</b>
              </text>
            </box>
            <box flexDirection="column" gap={0} paddingLeft={2}>
              <text fg={theme.textMuted} wrapMode="none">
                fresh input <b fg={theme.syntaxNumber}>{fmt(s.input)}</b> · output <b fg={theme.syntaxNumber}>{fmt(s.output)}</b> · reasoning <b fg={theme.syntaxNumber}>{fmt(s.reasoning)}</b>
              </text>
              <text fg={theme.textMuted} wrapMode="none">
                cache read <b fg={theme.info}>{fmt(s.cacheRead)}</b> · cache write <b fg={theme.warning}>{fmt(s.cacheWrite)}</b> · cost <b fg={theme.text}>{fmtCost(s.cost)}</b>
              </text>
              {s.calls > 0 ? (
                <text fg={theme.textMuted} wrapMode="none">
                  <b fg={s.callsWithCacheRead === s.calls ? theme.success : theme.text}>{String(s.callsWithCacheRead)}</b> of <b fg={theme.text}>{String(s.calls)}</b> calls read from cache
                </text>
              ) : null}
              {s.lastInput + s.lastCacheRead > 0 ? (
                <text fg={theme.textMuted} wrapMode="none">
                  <b fg={theme.accent}>most recent request</b> · <b fg={theme.text}>{fmt(s.lastInput + s.lastCacheRead)}</b> tokens · <b fg={theme.info}>{fmt(s.lastCacheRead)}</b> cache
                </text>
              ) : null}
            </box>
            <text fg={theme.textMuted} wrapMode="none">
              totals are cumulative over all calls
            </text>

            {props.subs.length > 0 ? (
              <>
                <box height={1} />
                <box flexDirection="row" gap={1}>
                  <text fg={theme.accent}>│</text>
                  <text fg={theme.secondary}>
                    <b>Subagents</b> <b fg={theme.textMuted}>· {String(props.subs.length)}</b>
                  </text>
                </box>
                <box flexDirection="column" gap={0} paddingLeft={2}>
                  {props.subs.map((sub) => {
                    const sh = parseFloat(sub.hit)
                    return (
                      <text fg={theme.textMuted} wrapMode="none">
                        {sub.name !== sub.id ? (
                          <>
                            <b fg={theme.text}>{truncate(sub.name, 18)}</b>{" "}
                            <b fg={theme.textMuted}>{truncate(sub.id, 8)}</b>
                          </>
                        ) : (
                          truncate(sub.id, 20)
                        )}{" "}
                        · <b fg={hitColor(theme, sh)}>{sub.hit}</b> · {String(sub.msgs)} msg{sub.msgs === 1 ? "" : "s"}
                        {sub.calls > 0 ? ` · ${String(sub.callsWithCacheRead)}/${String(sub.calls)} hit` : ""}
                      </text>
                    )
                  })}
                </box>
              </>
            ) : null}
          </box>
        )}
      </scrollbox>

      <text fg={theme.borderSubtle} wrapMode="none">
        hit = cache read / (input + cache read)
      </text>
      <text fg={theme.borderSubtle} wrapMode="none">
        <b fg={theme.success}>≥{HIT_GOOD}%</b> <b fg={theme.textMuted}>·</b> <b fg={theme.info}>{HIT_FAIR}–{HIT_GOOD - 1}%</b> <b fg={theme.textMuted}>·</b> <b fg={theme.warning}>&lt;{HIT_FAIR}%</b> <b fg={theme.textMuted}>hit levels</b>
      </text>
    </box>
  )
}

async function showCache(api: TuiPluginApi): Promise<void> {
  const route = api.route?.current
  const sessionID = route?.name === "session" ? route.params?.sessionID : undefined
  if (!sessionID) {
    api.ui.toast({ title: "Cache stats", message: "No active session.", variant: "warning" })
    return
  }

  let title = "session"
  try {
    const s = api.state.session.get(sessionID)
    title = s?.title || "session"
  } catch {}

  const { acc, subagents, perModel, subs } = await collect(api.client, api.state, sessionID, new Set())

  const sorted = [...perModel.entries()].sort((a, b) => b[1].count - a[1].count)

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
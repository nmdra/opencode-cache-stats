/** @jsxImportSource @opentui/solid */
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
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

type Sub = { id: string; hit: string; msgs: number; calls: number; callsWithCacheRead: number }

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

function hitPct(t: Acc): number {
  const denom = t.input + t.cacheRead
  return denom <= 0 ? -1 : (100 * t.cacheRead) / denom
}

function hitText(t: Acc): string {
  const h = hitPct(t)
  return h < 0 ? "n/a" : `${h.toFixed(1)}%`
}

function hitColor(theme: Theme, t: Acc): RGBA {
  const h = hitPct(t)
  if (h < 0) return theme.textMuted
  if (h >= 70) return theme.success
  if (h >= 40) return theme.info
  return theme.warning
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
    subs.push({ id: cid, hit: hitText(sub.acc), msgs: sub.acc.count, calls: sub.acc.calls, callsWithCacheRead: sub.acc.callsWithCacheRead })
    mergeAcc(acc, sub.acc)
    mergeModel(perModel, sub.perModel)
    subs.push(...sub.subs)
  }

  return { acc, subagents, perModel, subs }
}

function CacheHitView(props: {
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
  const headColor = hitColor(theme, s)
  const subWord = props.subagents === 1 ? "subagent" : "subagents"
  let maxKey = 0
  for (const model of props.models) maxKey = Math.max(maxKey, model.key.length)
  const cell = Math.min(Math.max(maxKey, 18), 32)

  const dimensions = useTerminalDimensions()

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
    <box flexDirection="column" width="100%" paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={0}>
      <box flexDirection="row" width="100%" justifyContent="space-between">
        <text fg={theme.primary}>
          <b>Cache hit</b>
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <text fg={theme.borderSubtle} wrapMode="none">
        ───────────────────────────────
      </text>

      <scrollbox
        height={Math.min(36, Math.max(8, Math.floor(dimensions().height * 0.5)))}
        scrollY
        scrollbarOptions={{ trackOptions: { backgroundColor: theme.borderSubtle } }}
        ref={(r) => {
          scroll = r
        }}
      >
        <box flexDirection="column" width="100%" gap={0}>
          <text fg={headColor} wrapMode="none">
            <b>{hitText(s)}</b> overall hit
          </text>
          <text fg={theme.textMuted} wrapMode="none">
            {truncate(props.title, 60)}
          </text>

          <box height={1} />

          <text fg={theme.text} wrapMode="none">
            <b>Models</b> <b fg={theme.textMuted}>· {String(props.models.length)}</b>
          </text>
          <box flexDirection="column" gap={0} paddingLeft={1}>
            {props.models.map((model) => {
              const m = model.acc
              const mc = hitColor(theme, m)
              const name = truncate(model.key, cell)
              return (
                <text fg={theme.textMuted} wrapMode="none">
                  {padEnd(name, cell)} <b fg={mc}>{padStart(hitText(m), 6)}</b>
                  {m.calls > 0 ? (
                    <b fg={m.callsWithCacheRead === m.calls ? theme.success : theme.textMuted}>
                      {"  "}
                      {String(m.callsWithCacheRead)}/{String(m.calls)} calls hit
                    </b>
                  ) : null}
                </text>
              )
            })}
          </box>

          <box height={1} />

          <text fg={theme.text} wrapMode="none">
            <b>Totals</b> <b fg={theme.textMuted}>· main + {String(props.subagents)} {subWord}</b>
          </text>
          <box flexDirection="column" gap={0} paddingLeft={1}>
            <text fg={theme.textMuted} wrapMode="none">
              input <b fg={theme.syntaxNumber}>{fmt(s.input)}</b> · output <b fg={theme.syntaxNumber}>{fmt(s.output)}</b> · reasoning <b fg={theme.syntaxNumber}>{fmt(s.reasoning)}</b>
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
                latest request · <b fg={theme.text}>{fmt(s.lastInput + s.lastCacheRead)}</b> tokens in · cache read <b fg={theme.info}>{fmt(s.lastCacheRead)}</b>
              </text>
            ) : null}
          </box>
          <text fg={theme.textMuted} wrapMode="none">
            totals are cumulative over all calls
          </text>

          {props.subs.length > 0 ? (
            <>
              <box height={1} />
              <text fg={theme.text} wrapMode="none">
                <b>Subagents</b> <b fg={theme.textMuted}>· {String(props.subs.length)}</b>
              </text>
              <box flexDirection="column" gap={0} paddingLeft={1}>
                {props.subs.map((sub) => (
                  <text fg={theme.textMuted} wrapMode="none">
                    {truncate(sub.id, 20)} · <b fg={hitColorSub(theme, sub.hit)}>{sub.hit}</b> · {String(sub.msgs)} msg{sub.msgs === 1 ? "" : "s"}
                    {sub.calls > 0 ? ` · ${String(sub.callsWithCacheRead)}/${String(sub.calls)} calls hit` : ""}
                  </text>
                ))}
              </box>
            </>
          ) : null}
        </box>
      </scrollbox>

      <text fg={theme.borderSubtle} wrapMode="none">
        hit = cache read / (input + cache read)
      </text>
    </box>
  )
}

function hitColorSub(theme: Theme, hit: string): RGBA {
  const n = parseFloat(hit)
  if (Number.isNaN(n)) return theme.textMuted
  if (n >= 70) return theme.success
  if (n >= 40) return theme.info
  return theme.warning
}

async function showCache(api: TuiPluginApi): Promise<void> {
  const route = api.route?.current
  const sessionID = route?.name === "session" ? route.params?.sessionID : undefined
  if (!sessionID) {
    api.ui.toast({ title: "Cache hit", message: "No active session.", variant: "warning" })
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
    <CacheHitView
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
        name: "cache-hit.show",
        title: "Cache hit",
        category: "System",
        namespace: "palette",
        slashName: "cache-hit",
        run: () => {
          void showCache(api)
        },
      },
    ],
  })
}

const plugin: TuiPluginModule = { id: "cache-hit", tui }
export default plugin
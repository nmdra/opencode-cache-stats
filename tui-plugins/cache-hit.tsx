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
}

type Sub = { id: string; hit: string; msgs: number }

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

function hitPct(t: Acc): number {
  const denom = t.input + t.cacheRead + t.cacheWrite
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
  return { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0, count: 0 }
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

function accMsg(acc: Acc, tokens: unknown, cost: number): void {
  const t = tokens as { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
  if (!t) return
  acc.input += t.input ?? 0
  acc.output += t.output ?? 0
  acc.reasoning += t.reasoning ?? 0
  acc.cacheRead += t.cache?.read ?? 0
  acc.cacheWrite += t.cache?.write ?? 0
  acc.cost += cost ?? 0
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

function modelKey(m: any): string {
  const p = m.providerID ?? m.model?.providerID ?? "?"
  const q = m.modelID ?? m.model?.id ?? "?"
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

  let messages: any[] = []
  try {
    const res: any = await client.session.messages({ sessionID })
    const list = res?.data ?? res ?? []
    messages = list.map((row: any) => row?.info ?? row)
  } catch {}
  if (messages.length === 0) {
    try {
      messages = state.session.messages(sessionID) ?? []
    } catch {}
  }

  const acc = newAcc()
  const perModel = new Map<string, Acc>()
  for (const m of messages ?? []) {
    if (!m) continue
    const isAssistant = m.role === "assistant" || m.type === "assistant"
    if (!isAssistant || !m.tokens) continue
    const key = modelKey(m)
    let p = perModel.get(key)
    if (!p) {
      p = newAcc()
      perModel.set(key, p)
    }
    accMsg(p, m.tokens, m.cost)
    accMsg(acc, m.tokens, m.cost)
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
    subs.push({ id: cid, hit: hitText(sub.acc), msgs: sub.acc.count })
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
              const count = m.count === 1 ? "msg" : "msgs"
              return (
                <text fg={theme.textMuted} wrapMode="none">
                  {padEnd(name, cell)} <b fg={mc}>{padStart(hitText(m), 6)}</b>  <b fg={theme.text}>{padStart(String(m.count), 3)} {count}</b>  in <b fg={theme.syntaxNumber ?? theme.text}>{padStart(fmt(m.input), 6)}</b>
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
          </box>

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
                  </text>
                ))}
              </box>
            </>
          ) : null}
        </box>
      </scrollbox>

      <text fg={theme.borderSubtle} wrapMode="none">
        hit = cache read / (input + cache read + cache write)
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
/** @jsxImportSource @opentui/solid */
import { useKeyboard, type JSX } from "@opentui/solid";
import { TextAttributes } from "@opentui/core";
import type {
  TuiPlugin,
  TuiPluginModule,
  TuiPluginApi,
} from "@opencode-ai/plugin/tui";
import type { Plugin } from "@opencode/plugin/tui";
import type {
  MessageListInput,
  SessionInfo,
  SessionListInput,
  SessionMessageInfo,
  SessionMessagesResponse,
  SessionsResponse,
} from "@opencode/client";

// The plugin runs on opencode v1 (tui) and on opencode v2 (setup). Each
// host provides only its own opencode packages at runtime, and both
// provide @opentui, so every opencode import above is type-only.

// The theme colors that the dialog uses. The v1 theme has them as they
// are; palette() maps a v2 theme onto them.
type Theme = Pick<
  TuiPluginApi["theme"]["current"],
  | "text"
  | "textMuted"
  | "primary"
  | "accent"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "error"
  | "borderSubtle"
  | "syntaxNumber"
>;

type RGBA = TuiPluginApi["theme"]["current"]["primary"];

export type Acc = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  count: number;
  reqs: number;
  reqsWithCacheRead: number;
};

type Sub = {
  id: string;
  name: string;
  hit: number;
  reqs: number;
  reqsWithCacheRead: number;
  tokens: number;
  cost: number;
  model?: string;
};

type Collected = {
  acc: Acc;
  subagents: number;
  perModel: Map<string, Acc>;
  subs: Sub[];
};

type SessionChild = {
  id?: string;
  agent?: string;
  agentType?: string;
  title?: string;
};

type StateSessionWithChildren = {
  children?: (sessionID: string) => SessionChild[] | undefined;
};

type NormalizedMsg = {
  role?: string;
  tokens?: Tokens;
  cost: number;
  providerID?: string;
  modelID?: string;
  model?: ModelRef;
};

type ScrollHandle = {
  scrollHeight: number;
  height: number;
  scrollBy(delta: number): void;
};

function fmt(n: number): string {
  const r = Math.round(n);
  if (r >= 1e6) return `${(r / 1e6).toFixed(2)}M`;
  if (r >= 1e3) return `${(r / 1e3).toFixed(1)}K`;
  return String(r);
}

function safe(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

const HIT_EXCELLENT = 90;
const HIT_GOOD = 70;
const HIT_FAIR = 40;

type HitLevel = {
  range: string;
  color: (theme: Theme) => RGBA;
};

const HIT_LEVELS: HitLevel[] = [
  { range: `≥${HIT_EXCELLENT}%`, color: (t) => t.success },
  { range: `${HIT_GOOD}–${HIT_EXCELLENT - 1}%`, color: (t) => t.info },
  { range: `${HIT_FAIR}–${HIT_GOOD - 1}%`, color: (t) => t.warning },
  { range: `<${HIT_FAIR}%`, color: (t) => t.error },
];

const PANEL_WIDTH = 58;
const SCROLL_HEIGHT = 14;
const BAR_WIDTH = 10;
const CELL_MIN = 18;
const CELL_MAX = 30;
const HEADER_TITLE_MAX = 30;
const EMPTY_TITLE_MAX = 40;
const SUB_NAME_COL = 12;
const SUB_ID_COL = 17;
const MODEL_COL = 21;
const HIT_COL = 8;
const TOKEN_COL = 8;
const MODEL_HIT_COL = 5;
const MODEL_TOKEN_COL = 6;
const PROVIDER_COL = 11;
const RATIO_COL = 7;
const LABEL_COL = 16;
const SUMMARY_LABEL_COL = 14;
const PAGE_STEP = 10;
const VAL_COL = 8;
const COST_COL = 8;
const SEPARATOR = "─".repeat(31);

function hitPct(t: Acc): number {
  const denom = t.input + t.cacheRead;
  return denom <= 0 ? -1 : (100 * t.cacheRead) / denom;
}

function fmtHit(h: number): string {
  return h < 0 ? "n/a" : `${h.toFixed(1)}%`;
}

function hitStyle(theme: Theme, h: number): { color: RGBA; word: string } {
  if (h < 0) return { color: theme.textMuted, word: "—" };
  if (h >= HIT_EXCELLENT) return { color: theme.success, word: "Excellent" };
  if (h >= HIT_GOOD) return { color: theme.info, word: "Good" };
  if (h >= HIT_FAIR) return { color: theme.warning, word: "Fair" };
  return { color: theme.error, word: "Poor" };
}

function hitSegments(
  theme: Theme,
  h: number,
  width: number,
): { color: RGBA; filled: string; empty: string } {
  const w = Math.max(4, width);
  if (h < 0)
    return { color: theme.textMuted, filled: "·".repeat(w), empty: "" };
  const filled = Math.round((h / 100) * w);
  return {
    color: hitStyle(theme, h).color,
    filled: "█".repeat(filled),
    empty: "░".repeat(Math.max(0, w - filled)),
  };
}

function HitBar(props: { theme: Theme; pct: number; width: number }) {
  const b = hitSegments(props.theme, props.pct, props.width);
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
  );
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
    reqs: 0,
    reqsWithCacheRead: 0,
  };
}

function truncate(s: string, n: number): string {
  if (n <= 1) return "…";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function sanitize(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, "");
}

function short(s: string): string {
  const i = s.indexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function shortId(s: string): string {
  const head = s.slice(0, 4);
  const tail = s.slice(-8);
  return s.length > head.length + tail.length ? `${head}…${tail}` : s;
}

function providerOf(key: string): string {
  const p = key.split("/")[0];
  return p && p !== "?" ? p : "";
}

type Tokens = {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
};

type ModelRef = { providerID?: string; modelID?: string; id?: string };

type Part = {
  type?: string;
  tokens?: Tokens;
  cost?: number;
  model?: ModelRef;
};

type Msg = {
  info?: {
    role?: string;
    tokens?: Tokens;
    cost?: number;
    providerID?: string;
    modelID?: string;
    model?: ModelRef;
  };
  data?: {
    role?: string;
    tokens?: Tokens;
    cost?: number;
    providerID?: string;
    modelID?: string;
    model?: ModelRef;
  };
  role?: string;
  type?: string;
  time?: { created?: number };
  tokens?: Tokens;
  cost?: number;
  providerID?: string;
  modelID?: string;
  model?: ModelRef;
  parts?: Part[];
};

type Req = { tokens?: Tokens; cost?: number; model?: ModelRef };

function normalizeMsg(m: Msg): NormalizedMsg {
  const info = m.info;
  const data = m.data;
  const model = data?.model ?? info?.model ?? m.model;
  return {
    role: data?.role ?? info?.role ?? m.role ?? m.type,
    tokens: data?.tokens ?? info?.tokens ?? m.tokens,
    cost: safe(data?.cost ?? info?.cost ?? m.cost),
    providerID:
      data?.providerID ??
      data?.model?.providerID ??
      info?.providerID ??
      info?.model?.providerID ??
      m.providerID ??
      m.model?.providerID,
    modelID:
      data?.modelID ??
      data?.model?.modelID ??
      data?.model?.id ??
      info?.modelID ??
      info?.model?.modelID ??
      info?.model?.id ??
      m.modelID ??
      m.model?.modelID ??
      m.model?.id,
    model,
  };
}

// A v2 compaction without its own model ran on the session's model at
// the time: the model of the last assistant request or model switch
// before it.
function modelAt(messages: Msg[], time: number | undefined): ModelRef | undefined {
  if (time === undefined) return undefined;
  let best: Msg | undefined;
  for (const m of messages) {
    const created = m?.time?.created;
    if (m?.type !== "assistant" && m?.type !== "model-switched") continue;
    if (created === undefined || created > time) continue;
    if (!best || created > (best.time?.created ?? 0)) best = m;
  }
  return best?.model;
}

function collectReqs(m: Msg, nm: NormalizedMsg, messages: Msg[]): Req[] {
  // opencode v2 keeps compaction usage in a message of its own. v1 stored
  // a compaction as an assistant message, so it counts the same way.
  if (nm.role === "compaction") {
    if (!nm.tokens) return [];
    return [
      {
        tokens: nm.tokens,
        cost: nm.cost,
        model: nm.model ?? modelAt(messages, m.time?.created),
      },
    ];
  }
  const parts = m.parts ?? [];
  const steps = parts.filter((p) => p.type === "step-finish");
  if (steps.length > 0) {
    return steps.map((p) => ({
      tokens: p.tokens,
      cost: p.cost,
      model: p.model,
    }));
  }
  return [{ tokens: nm.tokens, cost: nm.cost, model: nm.model }];
}

function accReq(acc: Acc, req: Req): void {
  const t = req.tokens;
  if (!t) return;
  const input = safe(t.input);
  const cacheRead = safe(t.cache?.read);
  const cacheWrite = safe(t.cache?.write);
  acc.input += input;
  acc.output += safe(t.output);
  acc.reasoning += safe(t.reasoning);
  acc.cacheRead += cacheRead;
  acc.cacheWrite += cacheWrite;
  acc.cost += safe(req.cost);
  acc.reqs += 1;
  if (cacheRead > 0) acc.reqsWithCacheRead += 1;
}

function mergeAcc(dst: Acc, src: Acc): void {
  dst.input += src.input;
  dst.output += src.output;
  dst.reasoning += src.reasoning;
  dst.cacheRead += src.cacheRead;
  dst.cacheWrite += src.cacheWrite;
  dst.cost += src.cost;
  dst.count += src.count;
  dst.reqs += src.reqs;
  dst.reqsWithCacheRead += src.reqsWithCacheRead;
}
function mergeModel(dst: Map<string, Acc>, src: Map<string, Acc>): void {
  for (const [k, v] of src) {
    let p = dst.get(k);
    if (!p) {
      p = newAcc();
      dst.set(k, p);
    }
    mergeAcc(p, v);
  }
}

function keyFor(model: ModelRef | undefined, nm: NormalizedMsg): string {
  const p = model?.providerID ?? nm.providerID ?? "?";
  const q = model?.modelID ?? model?.id ?? nm.modelID ?? "?";
  return `${p}/${q}`;
}

const SUBAGENT_TITLE_RE = /\(@([^)\s]+)\s+subagent\)/;

function agentName(child: SessionChild): string {
  const raw = child?.agent ?? child?.agentType;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const title = child?.title;
  if (typeof title === "string") {
    const m = title.match(SUBAGENT_TITLE_RE);
    if (m) return m[1];
    const word = title.split(/\s+/)[0];
    if (word) return word;
  }
  return "";
}

function dominantModel(m: Map<string, Acc>): string | undefined {
  let best: string | undefined;
  let bestReqs = 0;
  for (const [key, acc] of m) {
    if (short(key) === "?") continue;
    if (acc.reqs > bestReqs) {
      best = key;
      bestReqs = acc.reqs;
    }
  }
  return best;
}

function fmtCost(n: number, digits = 3): string {
  const s = `~$${n.toFixed(digits)}`;
  return s.length > COST_COL ? s.slice(1) : s;
}

function fmtCostPadded(n: number): string {
  return fmtCost(n).padStart(COST_COL);
}

function tokenTotal(t: Acc): number {
  return t.input + t.cacheRead + t.cacheWrite + t.output + t.reasoning;
}

function pctSuffix(part: number, total: number): string {
  return total > 0 ? ` (${((100 * part) / total).toFixed(1)}%)` : "";
}

async function fetchList<T>(
  api: () => Promise<T[] | { data?: T[] }>,
  state: () => T[],
  tag: string,
): Promise<T[]> {
  let apiErr: unknown;
  try {
    const res = await api();
    const data = Array.isArray(res) ? res : res?.data;
    if (Array.isArray(data) && data.length > 0) return data;
  } catch (err) {
    apiErr = err;
  }
  let stateErr: unknown;
  try {
    const data = state();
    if (Array.isArray(data) && data.length > 0) return data;
  } catch (err) {
    stateErr = err;
  }
  if (apiErr !== undefined || stateErr !== undefined) {
    console.error(`[cache-stats] ${tag}: no data`, {
      api: apiErr,
      state: stateErr,
    });
  }
  return [];
}

// Where collect() reads the messages and the subagent sessions of a
// session. opencode v1 and v2 expose them through different APIs.
type Source = {
  messages: (sessionID: string) => Promise<Msg[]>;
  children: (sessionID: string) => Promise<SessionChild[]>;
};

function v1Source(
  client: TuiPluginApi["client"],
  state: TuiPluginApi["state"],
): Source {
  return {
    messages: (sessionID) =>
      fetchList<Msg>(
        () => client.session.messages({ sessionID }),
        () => [...state.session.messages(sessionID)],
        "messages",
      ),
    children: (sessionID) =>
      fetchList<SessionChild>(
        () => client.session.children({ sessionID }),
        () =>
          (state.session as unknown as StateSessionWithChildren).children?.(
            sessionID,
          ) ?? [],
        "children",
      ),
  };
}

// The parts of the v2 plugin context that v2Source() reads.
type RequestOptions = { readonly signal?: AbortSignal };

export type V2Client = {
  readonly message: {
    list: (
      input: MessageListInput,
      options?: RequestOptions,
    ) => Promise<SessionMessagesResponse>;
  };
  readonly session: {
    list: (
      input?: SessionListInput,
      options?: RequestOptions,
    ) => Promise<SessionsResponse>;
  };
};

export type V2Cache = {
  readonly session: {
    list: () => SessionInfo[];
    readonly message: { list: (sessionID: string) => SessionMessageInfo[] };
  };
};

const PAGE = 200;

type Page<T> = { data: T[]; cursor: { next?: string | null } };

// Follows cursor.next until a short or empty page, or a cursor that
// repeats. The server rejects a cursor combined with order, and a cursor
// already carries the filters of the first page, so later pages pass
// only the cursor.
async function readAll<T>(
  page: (cursor?: string) => Promise<Page<T>>,
  signal: AbortSignal,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const res = await page(cursor);
    out.push(...res.data);
    const next =
      res.data.length < PAGE ? undefined : (res.cursor.next ?? undefined);
    cursor = next === cursor ? undefined : next;
  } while (cursor && !signal.aborted);
  return out;
}

// The v2 local cache holds only the newest messages of a session, so it
// is a fallback for a failed server request, as the v1 state is.
function v2Source(
  client: V2Client,
  data: V2Cache,
  signal: AbortSignal,
): Source {
  return {
    messages: (sessionID) =>
      fetchList<Msg>(
        () =>
          readAll(
            (cursor) =>
              client.message.list(
                cursor
                  ? { sessionID, cursor, limit: PAGE }
                  : { sessionID, limit: PAGE },
                { signal },
              ),
            signal,
          ),
        () => data.session.message.list(sessionID),
        "messages",
      ),
    children: (sessionID) =>
      fetchList<SessionChild>(
        () =>
          readAll(
            (cursor) =>
              client.session.list(
                cursor
                  ? { cursor, limit: PAGE }
                  : { parentID: sessionID, limit: PAGE },
                { signal },
              ),
            signal,
          ),
        () => data.session.list().filter((s) => s.parentID === sessionID),
        "children",
      ),
  };
}

async function collect(
  source: Source,
  sessionID: string,
  visited: Set<string>,
  signal: AbortSignal,
): Promise<Collected> {
  if (visited.has(sessionID) || signal.aborted)
    return { acc: newAcc(), subagents: 0, perModel: new Map(), subs: [] };
  visited.add(sessionID);
  // A child shared by two parents is skipped on its second visit and
  // appears with zeroed stats; acceptable for real session trees,
  // where each session has a single parent.

  const [messages, children] = await Promise.all([
    source.messages(sessionID),
    source.children(sessionID),
  ]);

  const acc = newAcc();
  const perModel = new Map<string, Acc>();
  for (const m of messages) {
    if (!m || signal.aborted) continue;
    const nm = normalizeMsg(m);
    if (nm.role !== "assistant" && nm.role !== "compaction") continue;
    for (const req of collectReqs(m, nm, messages)) {
      const key = keyFor(req.model, nm);
      let p = perModel.get(key);
      if (!p) {
        p = newAcc();
        perModel.set(key, p);
      }
      accReq(p, req);
    }
    acc.count += 1;
  }
  for (const p of perModel.values()) mergeAcc(acc, p);

  if (signal.aborted) return { acc, subagents: 0, perModel, subs: [] };

  let subagents = 0;
  const subs: Sub[] = [];
  const results = await Promise.all(
    children.map(async (child) => {
      const cid = child?.id ?? "";
      if (!cid) return null;
      const childStats = await collect(source, cid, visited, signal);
      return { child, cid, childStats };
    }),
  );
  for (const r of results) {
    if (!r || signal.aborted) continue;
    const { child, cid, childStats } = r;
    subagents += 1 + childStats.subagents;
    subs.push({
      id: cid,
      name: sanitize(agentName(child)) || cid,
      hit: hitPct(childStats.acc),
      reqs: childStats.acc.reqs,
      reqsWithCacheRead: childStats.acc.reqsWithCacheRead,
      tokens: tokenTotal(childStats.acc),
      cost: childStats.acc.cost,
      model: dominantModel(childStats.perModel),
    });
    mergeAcc(acc, childStats.acc);
    mergeModel(perModel, childStats.perModel);
    subs.push(...childStats.subs);
  }

  return { acc, subagents, perModel, subs };
}

function SectionHeader(props: { theme: Theme; title: string; count?: string }) {
  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.theme.accent}>│</text>
      <text fg={props.theme.secondary}>
        <b>{props.title}</b>{" "}
        {props.count !== undefined ? (
          <b>
            <span style={{ fg: props.theme.textMuted }}>· {props.count}</span>
          </b>
        ) : null}
      </text>
    </box>
  );
}

function SummaryRow(props: {
  theme: Theme;
  label: string;
  value: string;
  valueColor?: RGBA;
}) {
  return (
    <text fg={props.theme.textMuted} wrapMode="none">
      {props.label.padEnd(SUMMARY_LABEL_COL)}{" "}
      <b>
        <span style={{ fg: props.valueColor ?? props.theme.text }}>
          {props.value.padStart(VAL_COL)}
        </span>
      </b>
    </text>
  );
}

function SummarySection(props: {
  theme: Theme;
  acc: Acc;
  modelCount: number;
  subagentCount: number;
}) {
  const theme = props.theme;
  const acc = props.acc;
  return (
    <>
      <SectionHeader theme={theme} title="Session Summary" />
      <box flexDirection="row" paddingLeft={2}>
        <box flexDirection="column" gap={0}>
          <SummaryRow
            theme={theme}
            label="Total Requests"
            value={String(acc.reqs).padStart(VAL_COL)}
          />
          <SummaryRow
            theme={theme}
            label="Models"
            value={String(props.modelCount).padStart(VAL_COL)}
          />
          <SummaryRow
            theme={theme}
            label="Subagents"
            value={String(props.subagentCount).padStart(VAL_COL)}
          />
        </box>
        <box flexDirection="column" gap={0} paddingLeft={2}>
          <SummaryRow
            theme={theme}
            label="Total Tokens"
            value={fmt(tokenTotal(acc)).padStart(VAL_COL)}
            valueColor={theme.syntaxNumber}
          />
          <SummaryRow
            theme={theme}
            label="Cached Tokens"
            value={fmt(acc.cacheRead).padStart(VAL_COL)}
            valueColor={theme.info}
          />
          <SummaryRow
            theme={theme}
            label="Total Cost"
            value={fmtCostPadded(acc.cost)}
          />
        </box>
      </box>
    </>
  );
}

function GroupLabel(props: { theme: Theme; title: string }) {
  return (
    <text fg={props.theme.text} wrapMode="none">
      <b>{props.title}</b>
    </text>
  );
}

function TreeRow(props: {
  theme: Theme;
  last?: boolean;
  label: string;
  value: string;
  valueColor?: RGBA;
  suffix?: string;
  trail?: JSX.Element;
}) {
  return (
    <text fg={props.theme.textMuted} wrapMode="none">
      {props.last ? "└─ " : "├─ "}
      {props.label.padEnd(LABEL_COL)}
      <b>
        <span style={{ fg: props.valueColor ?? props.theme.text }}>
          {props.value.padStart(VAL_COL)}
        </span>
      </b>
      {props.suffix ? (
        <b>
          <span style={{ fg: props.theme.textMuted }}>{props.suffix}</span>
        </b>
      ) : null}
      {props.trail ? props.trail : null}
    </text>
  );
}

function ModelRow(props: { theme: Theme; model: { key: string; acc: Acc }; cell: number }) {
  const theme = props.theme;
  const { key, acc } = props.model;
  const hit = hitPct(acc);
  const hitColor = hitStyle(theme, hit).color;
  const name = truncate(short(key), props.cell);
  const provider = providerOf(key);
  return (
    <box flexDirection="column" gap={0}>
      <text fg={theme.textMuted} wrapMode="none">
        <b>
          <span style={{ fg: theme.text }}>{name.padEnd(props.cell)}</span>
        </b>
        {"  "}
        <b>
          <span style={{ fg: hitColor }}>{fmtHit(hit).padStart(MODEL_HIT_COL)}</span>
        </b>
        {"  "}
        <HitBar theme={theme} pct={hit} width={BAR_WIDTH} />
      </text>
      {hit >= 0 && provider ? (
        <MetaLine
          theme={theme}
          label={provider}
          labelCol={PROVIDER_COL}
          tokenCol={MODEL_TOKEN_COL}
          tokens={tokenTotal(acc)}
          cost={acc.cost}
        />
      ) : null}
    </box>
  );
}

function ModelsSection(props: {
  theme: Theme;
  models: { key: string; acc: Acc }[];
  cell: number;
}) {
  const theme = props.theme;
  return (
    <>
      <SectionHeader
        theme={theme}
        title="Models"
        count={String(props.models.length)}
      />
      <box flexDirection="column" gap={0} paddingLeft={2}>
        {props.models.map((model) => (
          <ModelRow theme={theme} model={model} cell={props.cell} />
        ))}
      </box>
    </>
  );
}

function deriveTotals(acc: Acc): { efficiencyPct: number } {
  return {
    efficiencyPct:
      acc.reqs > 0 ? (100 * acc.reqsWithCacheRead) / acc.reqs : -1,
  };
}

function TotalsSection(props: { theme: Theme; acc: Acc; subagents: number }) {
  const theme = props.theme;
  const acc = props.acc;
  const subWord = props.subagents === 1 ? "subagent" : "subagents";
  const { efficiencyPct } = deriveTotals(acc);
  const effColor = hitStyle(theme, efficiencyPct).color;
  const total = tokenTotal(acc);
  return (
    <>
      <SectionHeader
        theme={theme}
        title="Totals"
        count={`main + ${String(props.subagents)} ${subWord}`}
      />
      <box flexDirection="column" gap={0} paddingLeft={2}>
        <GroupLabel theme={theme} title="Tokens" />
        <TreeRow
          theme={theme}
          label="Fresh Input"
          value={fmt(acc.input)}
          valueColor={theme.syntaxNumber}
          suffix={pctSuffix(acc.input, total)}
        />
        <TreeRow
          theme={theme}
          label="Cache Read"
          value={fmt(acc.cacheRead)}
          valueColor={theme.info}
          suffix={pctSuffix(acc.cacheRead, total)}
        />
        <TreeRow
          theme={theme}
          label="Output"
          value={fmt(acc.output)}
          valueColor={theme.syntaxNumber}
          suffix={pctSuffix(acc.output, total)}
        />
        <TreeRow
          theme={theme}
          label="Reasoning"
          value={fmt(acc.reasoning)}
          valueColor={theme.syntaxNumber}
          suffix={pctSuffix(acc.reasoning, total)}
        />
        <TreeRow
          theme={theme}
          last
          label="Cache Writes"
          value={fmt(acc.cacheWrite)}
          valueColor={theme.warning}
          suffix={pctSuffix(acc.cacheWrite, total)}
        />
        <GroupLabel theme={theme} title="Requests" />
        <TreeRow theme={theme} label="Total" value={String(acc.reqs)} />
        <TreeRow
          theme={theme}
          label="Cache Hits"
          value={String(acc.reqsWithCacheRead)}
          suffix={pctSuffix(acc.reqsWithCacheRead, acc.reqs)}
        />
        <TreeRow
          theme={theme}
          label="Cache Misses"
          value={String(acc.reqs - acc.reqsWithCacheRead)}
          suffix={pctSuffix(acc.reqs - acc.reqsWithCacheRead, acc.reqs)}
        />
        <TreeRow
          theme={theme}
          last
          label="Cache Efficiency"
          value={fmtHit(efficiencyPct)}
          valueColor={effColor}
          trail={
            <>
              {" "}
              <HitBar theme={theme} pct={efficiencyPct} width={BAR_WIDTH} />
            </>
          }
        />
        <GroupLabel theme={theme} title="Cost" />
        <TreeRow
          theme={theme}
          last
          label="Total Cost"
          value={fmtCost(acc.cost, 5)}
        />
        {acc.reqs > 0 ? (
          <>
            <GroupLabel theme={theme} title="Avg per Request" />
            <TreeRow
              theme={theme}
              label="Fresh Input"
              value={fmt(acc.input / acc.reqs)}
              valueColor={theme.syntaxNumber}
            />
            <TreeRow
              theme={theme}
              label="Cache Read"
              value={fmt(acc.cacheRead / acc.reqs)}
              valueColor={theme.info}
            />
            <TreeRow
              theme={theme}
              label="Output"
              value={fmt(acc.output / acc.reqs)}
              valueColor={theme.syntaxNumber}
            />
            <TreeRow
              theme={theme}
              last
              label="Cost"
              value={fmtCost(acc.cost / acc.reqs, 5)}
            />
          </>
        ) : null}
        <text
          fg={theme.textMuted}
          wrapMode="none"
          style={{ attributes: TextAttributes.ITALIC }}
        >
          totals are cumulative over all requests
        </text>
      </box>
    </>
  );
}

function VSpacer() {
  return <box height={1} />;
}

function MetaLine(props: {
  theme: Theme;
  label: string;
  labelCol: number;
  tokenCol: number;
  tokens: number;
  cost: number;
}) {
  return (
    <text fg={props.theme.textMuted} wrapMode="none">
      └─ {truncate(props.label, props.labelCol).padEnd(props.labelCol)}{" "}
      {fmt(props.tokens).padStart(props.tokenCol)} {fmtCostPadded(props.cost)}
    </text>
  );
}

function SubagentRow(props: { theme: Theme; sub: Sub }) {
  const theme = props.theme;
  const sub = props.sub;
  const named = sub.name !== sub.id;
  return (
    <>
      <text fg={theme.textMuted} wrapMode="none">
        <b>
          <span style={{ fg: theme.text }}>
            {(named
                ? truncate(sub.name, SUB_NAME_COL)
                : truncate(sub.id, SUB_NAME_COL)
            ).padEnd(SUB_NAME_COL)}
          </span>
        </b>{" "}
        {named ? (
          <b>
            <span style={{ fg: theme.textMuted }}>
              {shortId(sub.id).padEnd(SUB_ID_COL)}
            </span>
          </b>
        ) : null}
        <b>
          <span style={{ fg: hitStyle(theme, sub.hit).color }}>
            {fmtHit(sub.hit).padStart(HIT_COL)}
          </span>
        </b>
        {sub.reqs > 0 ? (
          <b>
            <span style={{ fg: theme.textMuted }}>
              {" "}
              {`${String(sub.reqsWithCacheRead)}/${String(sub.reqs)}`.padStart(RATIO_COL)}{" "}
              hit
            </span>
          </b>
        ) : null}
      </text>
      {sub.model ? (
        <MetaLine
          theme={theme}
          label={short(sub.model)}
          labelCol={MODEL_COL}
          tokenCol={TOKEN_COL}
          tokens={sub.tokens}
          cost={sub.cost}
        />
      ) : null}
    </>
  );
}

function SubagentsSection(props: { theme: Theme; subs: Sub[] }) {
  const theme = props.theme;
  if (props.subs.length === 0) return null;
  return (
    <>
      <VSpacer />
      <SectionHeader
        theme={theme}
        title="Subagents"
        count={String(props.subs.length)}
      />
      <box flexDirection="column" gap={0} paddingLeft={2}>
        {props.subs.map((sub, i) => (
          <>
            {i > 0 ? <VSpacer /> : null}
            <SubagentRow theme={theme} sub={sub} />
          </>
        ))}
      </box>
    </>
  );
}

function EmptyState(props: { theme: Theme; title: string; streaming: boolean }) {
  return (
    <box
      flexDirection="column"
      width="100%"
      gap={0}
      paddingTop={2}
      paddingBottom={2}
    >
      <text fg={props.theme.textMuted} wrapMode="none">
        {props.streaming ? (
          <>
            No token data for{" "}
            <b>
              <span style={{ fg: props.theme.text }}>
                {truncate(props.title, EMPTY_TITLE_MAX)}
              </span>
            </b>{" "}
            yet.
          </>
        ) : (
          "No cache statistics available for this session."
        )}
      </text>
      <text fg={props.theme.textMuted} wrapMode="none">
        {props.streaming
          ? "Wait for the session to finish streaming, then open again."
          : "Run at least one assistant request to generate cache metrics."}
      </text>
    </box>
  );
}

function LevelLegend(props: { theme: Theme }) {
  const theme = props.theme;
  return (
    <text
      fg={theme.borderSubtle}
      wrapMode="none"
      style={{ attributes: TextAttributes.ITALIC | TextAttributes.DIM }}
    >
      CH Levels
      {HIT_LEVELS.map((level) => (
        <>
          <b>
            <span style={{ fg: theme.textMuted }}>·</span>
          </b>{" "}
          <b>
            <span style={{ fg: level.color(theme) }}>●</span>
          </b>{" "}
          <b>
            <span style={{ fg: theme.textMuted }}>{level.range}</span>
          </b>{" "}
        </>
      ))}
    </text>
  );
}

function modelCellWidth(models: { key: string; acc: Acc }[]): number {
  let maxKey = 0;
  for (const model of models)
    maxKey = Math.max(maxKey, short(model.key).length);
  return Math.min(Math.max(maxKey, CELL_MIN), CELL_MAX);
}

function CacheStatsView(props: {
  theme: Theme;
  title: string;
  acc: Acc;
  subagents: number;
  subs: Sub[];
  models: { key: string; acc: Acc }[];
  bindPageKeys?: (page: (delta: number) => void) => void;
}) {
  const theme = props.theme;
  const acc = props.acc;
  const h = hitPct(acc);
  const head = hitStyle(theme, h);
  const cell = modelCellWidth(props.models);

  let scroll: ScrollHandle | undefined;
  props.bindPageKeys?.((delta) => {
    if (!scroll || scroll.scrollHeight <= scroll.height) return;
    scroll.scrollBy(delta);
  });
  useKeyboard((evt) => {
    if (!scroll) return;
    if (scroll.scrollHeight <= scroll.height) return;
    if (
      props.bindPageKeys &&
      (evt.name === "pageup" || evt.name === "pagedown")
    )
      return;
    if (evt.name === "up") {
      scroll.scrollBy(-1);
      evt.preventDefault();
      evt.stopPropagation();
    } else if (evt.name === "down") {
      scroll.scrollBy(1);
      evt.preventDefault();
      evt.stopPropagation();
    } else if (evt.name === "pageup") {
      scroll.scrollBy(-PAGE_STEP);
      evt.preventDefault();
      evt.stopPropagation();
    } else if (evt.name === "pagedown") {
      scroll.scrollBy(PAGE_STEP);
      evt.preventDefault();
      evt.stopPropagation();
    }
  });

  return (
    <box
      flexDirection="column"
      width={PANEL_WIDTH}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      gap={0}
    >
      <box flexDirection="row" width="100%" justifyContent="space-between">
        <text fg={theme.primary}>
          <b>Cache stats</b>{" "}
          <b>
            <span style={{ fg: theme.textMuted }}>·</span>
          </b>{" "}
          <b>
            <span style={{ fg: theme.textMuted }}>
              {truncate(props.title, HEADER_TITLE_MAX)}
            </span>
          </b>
        </text>
        <text fg={theme.textMuted}>{acc.reqs > 0 ? "↑/↓ · esc" : "esc"}</text>
      </box>
      <text fg={theme.borderSubtle} wrapMode="none">
        {SEPARATOR}
      </text>

      <scrollbox
        height={SCROLL_HEIGHT}
        scrollY
        scrollbarOptions={{
          trackOptions: { backgroundColor: theme.borderSubtle },
        }}
        viewportOptions={{ paddingRight: 2 }}
        ref={(r) => {
          scroll = r as ScrollHandle;
        }}
      >
        {acc.reqs === 0 ? (
          <EmptyState
            theme={theme}
            title={props.title}
            streaming={acc.count > 0}
          />
        ) : (
          <box flexDirection="column" width="100%" gap={0}>
            <text fg={theme.textMuted} wrapMode="none">
              <HitBar theme={theme} pct={h} width={BAR_WIDTH} />{" "}
              <b>
                <span style={{ fg: head.color }}>{fmtHit(h)}</span>
              </b>{" "}
              <b>
                <span style={{ fg: head.color }}>{head.word}</span>
              </b>{" "}
              · overall cache hit
            </text>

            <VSpacer />

            <SummarySection
              theme={theme}
              acc={acc}
              modelCount={props.models.length}
              subagentCount={props.subagents}
            />

            <VSpacer />

            <ModelsSection theme={theme} models={props.models} cell={cell} />

            <VSpacer />

            <TotalsSection theme={theme} acc={acc} subagents={props.subagents} />

            <SubagentsSection theme={theme} subs={props.subs} />
          </box>
        )}
      </scrollbox>

      <LevelLegend theme={theme} />
    </box>
  );
}

// Maps a v2 theme onto the v1 color names that the dialog uses. The
// mapping follows opencode's own v1 theme migration (@opencode/theme).
// v2 has no subtle border color, so the border color stands in for it.
function palette(t: Plugin.Context["theme"]): Theme {
  return {
    text: t.text.base,
    textMuted: t.text.muted,
    primary: t.hue.interactive[200],
    accent: t.hue.accent[200],
    // For a theme migrated from v1, categorical[0] is its secondary hue.
    secondary: t.categorical[0]?.[200] ?? t.hue.accent[200],
    success: t.text.feedback.success.base,
    info: t.text.feedback.info.base,
    warning: t.text.feedback.warning.base,
    error: t.text.feedback.error.base,
    borderSubtle: t.border.base,
    syntaxNumber: t.syntax.number,
  };
}

// What showCache() needs from opencode. tui() builds it from the v1 API
// and setup() from the v2 plugin context.
type Host = {
  sessionID: () => string | undefined;
  session: (sessionID: string) => { title?: string } | undefined;
  toast: (options: {
    title: string;
    message: string;
    variant: "warning";
  }) => void;
  dialog: (render: () => JSX.Element) => void;
  theme: () => Theme;
  source: Source;
  signal: AbortSignal;
  // Binds PgUp/PgDn for the open dialog when the host's keymap would
  // take them before useKeyboard sees them.
  pageKeys?: (page: (delta: number) => void) => void;
};

function v1Host(api: TuiPluginApi): Host {
  return {
    sessionID() {
      const route = api.route?.current;
      const id = route?.name === "session" ? route.params?.sessionID : undefined;
      return typeof id === "string" ? id : undefined;
    },
    session: (sessionID) => api.state.session.get(sessionID),
    toast: (options) => api.ui.toast(options),
    dialog(render) {
      api.ui.dialog.setSize("medium");
      api.ui.dialog.replace(render);
    },
    theme: () => api.theme.current,
    source: v1Source(api.client, api.state),
    signal: api.lifecycle.signal,
  };
}

function v2Host(ctx: Plugin.Context, signal: AbortSignal): Host {
  return {
    sessionID() {
      const route = ctx.ui.router.current();
      return route.type === "session" ? route.sessionID : undefined;
    },
    session: (sessionID) => ctx.data.session.get(sessionID),
    toast: (options) => ctx.ui.toast.show(options),
    dialog(render) {
      ctx.ui.dialog.show(render);
      // Set the size explicitly, as the v1 path does with setSize().
      ctx.ui.dialog.set({ size: "medium" });
    },
    theme: () => palette(ctx.theme.surface("dialog")),
    source: v2Source(ctx.client, ctx.data, signal),
    signal,
    // opencode v2 binds PgUp/PgDn to session paging in a global layer
    // that also closes the open dialog. A layer created by the dialog
    // takes precedence and is removed with it.
    pageKeys: (page) =>
      ctx.keymap.layer(() => ({
        mode: "modal",
        priority: 1,
        commands: [
          {
            bind: "pageup",
            title: "Page up",
            group: "Cache stats",
            run: () => page(-PAGE_STEP),
          },
          {
            bind: "pagedown",
            title: "Page down",
            group: "Cache stats",
            run: () => page(PAGE_STEP),
          },
        ],
      })),
  };
}

let showInFlight = false;

async function showCache(host: Host): Promise<void> {
  if (showInFlight) return;
  showInFlight = true;
  try {
    const sessionID = host.sessionID();
    if (!sessionID) {
      host.toast({
        title: "Cache stats",
        message: "No active session.",
        variant: "warning",
      });
      return;
    }

    let title = "session";
    try {
      const s = host.session(sessionID);
      title = sanitize(s?.title || "session");
    } catch (err) {
      console.error("[cache-stats] session:", err);
    }

    const { acc, subagents, perModel, subs } = await collect(
      host.source,
      sessionID,
      new Set(),
      host.signal,
    );
    if (host.signal.aborted) return;

    const sorted = [...perModel.entries()].sort(
      (a, b) => hitPct(b[1]) - hitPct(a[1]) || b[1].reqs - a[1].reqs,
    );
    subs.sort((a, b) => b.hit - a.hit || b.reqs - a.reqs);

    host.dialog(() => (
      <CacheStatsView
        theme={host.theme()}
        title={title}
        acc={acc}
        subagents={subagents}
        subs={subs}
        models={sorted.map(([key, m]) => ({ key, acc: m }))}
        bindPageKeys={host.pageKeys}
      />
    ));
  } finally {
    showInFlight = false;
  }
}

// opencode v1 entry point.
const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "cache-stats.show",
        title: "Cache stats",
        category: "Plugin",
        namespace: "palette",
        slashName: "cache-stats",
        run: () => {
          void showCache(v1Host(api));
        },
      },
    ],
  });
};

// opencode v2 entry point. v2 has no lifecycle signal, so the cleanup
// that setup() returns aborts a pending load.
const setup: Plugin.Definition["setup"] = (ctx) => {
  const ctrl = new AbortController();
  ctx.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "cache-stats.show",
        title: "Cache stats",
        group: "Plugin",
        palette: true,
        slash: { name: "cache-stats" },
        run: () => showCache(v2Host(ctx, ctrl.signal)),
      },
    ],
  }));
  return () => ctrl.abort();
};

const plugin = {
  id: "nmdra.cache-stats",
  tui,
  setup,
} satisfies TuiPluginModule & Plugin.Definition;
export default plugin;

// Used by the tests.
export { collect, v1Source, v2Source };

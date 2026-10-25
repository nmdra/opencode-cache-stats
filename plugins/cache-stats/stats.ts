import type { SessionMessageInfo, TokenUsageInfo } from "@opencode/client";

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

export const RECENT_LIMIT = 25;

export type RequestSample = {
  id: string;
  sessionID: string;
  at: number;
  model: string;
  usage: Acc;
};

export type UsageSummary = {
  acc: Acc;
  perModel: Map<string, Acc>;
  compaction: Acc;
  recent: RequestSample[];
};

export function newAcc(): Acc {
  return {
    input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0,
    cost: 0, count: 0, reqs: 0, reqsWithCacheRead: 0,
  };
}

export function safe(n: number | undefined): number {
  return n !== undefined && Number.isFinite(n) && n > 0 ? n : 0;
}

export function hitPct(acc: Acc): number {
  const denominator = acc.input + acc.cacheRead;
  return denominator > 0 ? (100 * acc.cacheRead) / denominator : -1;
}

// Matches OpenCode's TokenUsage.total: output and reasoning are separate counts.
export function tokenTotal(acc: Acc): number {
  return acc.input + acc.cacheRead + acc.cacheWrite + acc.output + acc.reasoning;
}

export function mergeAcc(target: Acc, source: Acc): void {
  for (const key of Object.keys(target) as (keyof Acc)[]) {
    target[key] += source[key];
  }
}

export function mergeModels(target: Map<string, Acc>, source: Map<string, Acc>): void {
  for (const [key, acc] of source) {
    const model = target.get(key) ?? newAcc();
    mergeAcc(model, acc);
    target.set(key, model);
  }
}

function recordedUsage(tokens: TokenUsageInfo, cost?: number): Acc {
  return {
    ...newAcc(),
    input: safe(tokens.input), output: safe(tokens.output), reasoning: safe(tokens.reasoning),
    cacheRead: safe(tokens.cache.read), cacheWrite: safe(tokens.cache.write), cost: safe(cost),
    reqs: 1, reqsWithCacheRead: safe(tokens.cache.read) > 0 ? 1 : 0,
  };
}

export function recentRequests(samples: readonly RequestSample[]): RequestSample[] {
  return [...samples].sort((a, b) => a.at - b.at || a.sessionID.localeCompare(b.sessionID) || a.id.localeCompare(b.id)).slice(-RECENT_LIMIT);
}

export function mergeUsage(target: UsageSummary, source: UsageSummary): void {
  mergeAcc(target.acc, source.acc);
  mergeModels(target.perModel, source.perModel);
  mergeAcc(target.compaction, source.compaction);
  target.recent = recentRequests([...target.recent, ...source.recent]);
}

export function summarize(messages: readonly SessionMessageInfo[], sessionID = ""): UsageSummary {
  const acc = newAcc();
  const compaction = newAcc();
  const perModel = new Map<string, Acc>();
  const recent: RequestSample[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    // Keep auxiliary compaction usage separate from assistant request counts.
    if (message.type === "compaction") {
      compaction.count++;
      if (message.status !== "running" && message.tokens) {
        mergeAcc(compaction, recordedUsage(message.tokens, message.cost));
      }
      continue;
    }
    if (message.type !== "assistant") continue;
    acc.count++;
    if (!message.tokens) continue;
    const usage = recordedUsage(message.tokens, message.cost);
    mergeAcc(acc, usage);
    const key = `${message.model.providerID}/${message.model.id}`;
    const model = perModel.get(key) ?? newAcc();
    mergeAcc(model, usage);
    perModel.set(key, model);
    recent.push({ id: message.id, sessionID, at: safe(message.time.completed ?? message.time.created), model: key, usage });
  }
  return { acc, perModel, compaction, recent: recentRequests(recent) };
}

export function dominantModel(models: Map<string, Acc>): string | undefined {
  return [...models].sort((a, b) => b[1].reqs - a[1].reqs)[0]?.[0];
}

export function sanitize(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "");
}

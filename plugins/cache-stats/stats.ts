import type { SessionMessageInfo } from "@opencode/client";

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

export function summarize(messages: readonly SessionMessageInfo[]) {
  const acc = newAcc();
  const perModel = new Map<string, Acc>();
  const seen = new Set<string>();
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    // Compaction has its own usage in V2; this dialog measures assistant steps only.
    if (message.type !== "assistant") continue;
    acc.count++;
    if (!message.tokens) continue;
    const tokens = message.tokens;
    const usage = newAcc();
    usage.input = safe(tokens.input);
    usage.output = safe(tokens.output);
    usage.reasoning = safe(tokens.reasoning);
    usage.cacheRead = safe(tokens.cache.read);
    usage.cacheWrite = safe(tokens.cache.write);
    usage.cost = safe(message.cost);
    usage.reqs = 1;
    usage.reqsWithCacheRead = usage.cacheRead > 0 ? 1 : 0;
    mergeAcc(acc, usage);
    const key = `${message.model.providerID}/${message.model.id}`;
    const model = perModel.get(key) ?? newAcc();
    mergeAcc(model, usage);
    perModel.set(key, model);
  }
  return { acc, perModel };
}

export function dominantModel(models: Map<string, Acc>): string | undefined {
  return [...models].sort((a, b) => b[1].reqs - a[1].reqs)[0]?.[0];
}

export function sanitize(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "");
}

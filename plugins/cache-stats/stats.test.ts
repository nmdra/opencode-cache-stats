import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionMessageInfo } from "@opencode/client";
import { dominantModel, hitPct, mergeUsage, newAcc, safe, sanitize, summarize, tokenTotal } from "./stats.ts";
import { assistant, compaction, tokens } from "./test-helpers.ts";

test("normalizes V2 usage and excludes cache writes from the hit denominator", () => {
  const { acc } = summarize([assistant("msg_one")]);
  assert.equal(acc.reqs, 1);
  assert.equal(acc.count, 1);
  assert.equal(acc.reqsWithCacheRead, 1);
  assert.equal(acc.cost, 0.25);
  assert.equal(hitPct(acc), 90);
  assert.equal(tokenTotal(acc), 110);
});

test("groups by provider/model, combines variants, and deduplicates messages", () => {
  const first = assistant("msg_one");
  const { acc, perModel } = summarize([
    first, first,
    assistant("msg_two", { model: { providerID: "acme", id: "model-a", variant: "high" } }),
    assistant("msg_three", { model: { providerID: "other", id: "model-a" } }),
  ]);
  assert.equal(acc.reqs, 3);
  assert.equal(perModel.size, 2);
  assert.equal(perModel.get("acme/model-a")?.reqs, 2);
  assert.equal(dominantModel(perModel), "acme/model-a");
});

test("ignores non-assistant usage including compaction", () => {
  const messages: SessionMessageInfo[] = [
    { id: "msg_user", type: "user", text: "hello", time: { created: 1 } },
    { id: "msg_compact", type: "compaction", status: "completed", reason: "manual",
      summary: "summary", time: { created: 2 }, tokens: tokens(), cost: 10 },
  ];
  assert.deepEqual(summarize(messages).acc, newAcc());
});

test("counts recorded steps, not retry attempts or incomplete assistant messages", () => {
  const { acc } = summarize([
    assistant("msg_streaming", { tokens: undefined, cost: undefined, time: { created: 1 } }),
    assistant("msg_interrupted", { finish: "error", tokens: undefined }),
    assistant("msg_retried", { retry: { attempt: 3, at: 4, error: { type: "unknown", message: "retry" } } }),
    assistant("msg_zero", { tokens: tokens({ input: 0, cache: { read: 0, write: 0 } }), cost: 0 }),
  ]);
  assert.equal(acc.count, 4);
  assert.equal(acc.reqs, 2);
  assert.equal(acc.reqsWithCacheRead, 1);
  assert.equal(acc.cost, 0.25);
});

test("handles misses, zero usage, and invalid numeric values", () => {
  assert.equal(hitPct(newAcc()), -1);
  const { acc } = summarize([assistant("msg_miss", {
    tokens: tokens({ input: 10, output: -1, reasoning: NaN, cache: { read: 0, write: Infinity } }),
    cost: -2,
  })]);
  assert.equal(hitPct(acc), 0);
  assert.equal(acc.reqsWithCacheRead, 0);
  assert.equal(tokenTotal(acc), 10);
  assert.equal(acc.cost, 0);
  assert.equal(safe(undefined), 0);
  assert.equal(sanitize("title\x1b\n\t\x7f"), "title");
});

test("separates compaction usage including recorded failures and missing usage", () => {
  const result = summarize([
    assistant("msg_assistant"), compaction("msg_compaction"), compaction("msg_compaction"),
    { id: "msg_running", type: "compaction", status: "running", reason: "auto", summary: "", time: { created: 4 } },
    { id: "msg_failed", type: "compaction", status: "failed", reason: "auto", time: { created: 5 },
      error: { type: "unknown", message: "failed" }, tokens: tokens(), cost: 0.75 },
  ]);
  assert.equal(result.acc.reqs, 1);
  assert.equal(result.acc.cost, 0.25);
  assert.equal(result.compaction.count, 3);
  assert.equal(result.compaction.reqs, 2);
  assert.equal(result.compaction.cost, 1.25);
  assert.equal(result.recent.length, 1);
});

test("retains the newest 25 usage-bearing requests, in chronological order", () => {
  const messages = Array.from({ length: 30 }, (_, i) => assistant(`msg_${i}`, { time: { created: i, completed: i + 1 } }));
  const result = summarize([...messages.reverse(), assistant("msg_pending", { tokens: undefined })], "root");
  assert.equal(result.acc.reqs, 30);
  assert.equal(result.recent.length, 25);
  assert.equal(result.recent[0].id, "msg_5");
  assert.equal(result.recent.at(-1)?.id, "msg_29");
  assert.equal(result.recent[0].sessionID, "root");
});

test("merges recent history across sessions without mutating source totals", () => {
  const first = summarize([assistant("msg_main", { time: { created: 1, completed: 2 } })], "root");
  const second = summarize([assistant("msg_child", { time: { created: 2, completed: 3 } })], "child");
  const total = summarize([]);
  mergeUsage(total, second);
  mergeUsage(total, first);
  assert.deepEqual(total.recent.map((sample) => sample.sessionID), ["root", "child"]);
  assert.equal(total.acc.reqs, 2);
  assert.equal(first.acc.reqs, 1);
  assert.equal(second.perModel.get("acme/model-a")?.reqs, 1);
});

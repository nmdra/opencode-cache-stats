import assert from "node:assert/strict";
import { test } from "node:test";
import type { OpenCodeEvent } from "@opencode/client";
import type { Plugin } from "@opencode/plugin/tui";
import { collect } from "./collect.ts";
import { createLiveStats, type LiveState } from "./live.ts";
import { client, session, tokens } from "./test-helpers.ts";

function events() {
  const listeners = new Set<Parameters<Plugin.Context["data"]["listen"]>[0]>();
  return {
    listen(handler: Parameters<Plugin.Context["data"]["listen"]>[0]) { listeners.add(handler); return () => { listeners.delete(handler); }; },
    emit(details: OpenCodeEvent) { listeners.forEach((listener) => listener({ details })); },
    count: () => listeners.size,
  };
}
function usageEvent(sessionID = "root"): OpenCodeEvent {
  return { id: "evt_usage", created: 1, type: "session.usage.updated", data: { sessionID, cost: 1, tokens: tokens() } };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 25));

test("shares one initial collection between dialog/sidebar watchers and stops at last close", async () => {
  let reads = 0;
  const source = events();
  const hub = createLiveStats(client({ get: async ({ sessionID }) => { reads++; return session(sessionID); } }), source, { debounceMs: 1, pollMs: 0 });
  const first: LiveState[] = [], second: LiveState[] = [];
  const offFirst = hub.watch("root", (state) => first.push(state));
  const offSecond = hub.watch("root", (state) => second.push(state));
  await settle();
  assert.equal(reads, 1);
  assert.equal(first.at(-1)?.stats, second.at(-1)?.stats);
  offFirst();
  await hub.refresh("root");
  assert.equal(reads, 2);
  offSecond();
  source.emit(usageEvent());
  await tick();
  assert.equal(reads, 2);
  hub.dispose();
  assert.equal(source.count(), 0);
});

test("coalesces related event bursts and ignores unrelated sessions and text deltas", async () => {
  let reads = 0;
  const source = events();
  const hub = createLiveStats(client({ get: async ({ sessionID }) => { reads++; return session(sessionID); } }), source, { debounceMs: 1, pollMs: 0 });
  hub.watch("root", () => {});
  await settle();
  for (let i = 0; i < 20; i++) source.emit(usageEvent());
  await tick();
  assert.equal(reads, 2);
  source.emit(usageEvent("unrelated"));
  source.emit({ id: "evt_text", created: 1, type: "session.text.delta", data: { sessionID: "root", assistantMessageID: "msg_one", ordinal: 1, delta: "private text" } });
  await tick();
  assert.equal(reads, 2);
  hub.dispose();
});

test("retains a marked stale snapshot on failure and clears stale state on recovery", async () => {
  let fail = false;
  const hub = createLiveStats(client({ get: async ({ sessionID }) => {
    if (fail) throw new Error("offline");
    return session(sessionID);
  } }), events(), { pollMs: 0 });
  let latest: LiveState = { loading: false, stale: false };
  hub.watch("root", (state) => { latest = state; });
  await settle();
  const snapshot = latest.stats;
  fail = true;
  await hub.refresh("root");
  assert.equal(latest.stats, snapshot);
  assert.equal(latest.stale, true);
  assert.equal(latest.loading, false);
  fail = false;
  await hub.refresh("root");
  assert.equal(latest.stale, false);
  hub.dispose();
});

test("discovers a newly created child and refreshes after reconnect", async () => {
  let child = false, reads = 0;
  const source = events();
  const hub = createLiveStats(client({
    get: async ({ sessionID }) => { reads++; return session(sessionID); },
    list: async (input) => ({ data: child && input?.parentID === "root" ? [session("child")] : [], cursor: {} }),
  }), source, { debounceMs: 1, pollMs: 0 });
  let latest: LiveState = { loading: false, stale: false };
  hub.watch("root", (state) => { latest = state; });
  await settle();
  child = true;
  source.emit({ id: "evt_created", created: 1, type: "session.created", durable: { aggregateID: "child", seq: 1, version: 1 },
    data: { sessionID: "child", parentID: "root", projectID: "project", location: { directory: "/project" }, slug: "child", version: "2.1.4" } });
  await tick();
  assert.equal(latest.stats?.subagents, 1);
  source.emit(usageEvent("child"));
  await tick();
  source.emit({ id: "evt_reconnect", type: "server.connected", data: {} });
  await tick();
  assert.equal(reads, 4);
  hub.dispose();
});

test("aborts an in-flight read on unsubscribe and makes cleanup idempotent", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  let signal: AbortSignal | undefined;
  const source = events();
  const hub = createLiveStats(client({ get: async ({ sessionID }, options) => {
    signal = options?.signal;
    await pending;
    return session(sessionID);
  } }), source, { debounceMs: 1, pollMs: 0 });
  let calls = 0;
  const off = hub.watch("root", () => { calls++; });
  off(); off();
  assert.equal(signal?.aborted, true);
  finish();
  await settle();
  assert.equal(calls, 2);
  hub.dispose(); hub.dispose();
  assert.equal(source.count(), 0);
});

test("queues a follow-up for events during a read without overlapping collections", async () => {
  const initial = await collect(client(), "root", new AbortController().signal);
  let reads = 0, finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const source = events();
  const hub = createLiveStats(client({ get: async ({ sessionID }) => {
    reads++;
    if (reads === 1) await gate;
    return session(sessionID);
  } }), source, { debounceMs: 1, pollMs: 0 });
  hub.watch("root", () => {}, initial);
  const loading = hub.refresh("root");
  source.emit(usageEvent());
  source.emit(usageEvent());
  assert.equal(reads, 1);
  finish();
  await loading;
  await tick();
  assert.equal(reads, 2);
  hub.dispose();
});

test("periodic reconciliation recovers missed events and stops when unwatched", async () => {
  let reads = 0;
  const hub = createLiveStats(client({ get: async ({ sessionID }) => { reads++; return session(sessionID); } }), events(), { pollMs: 5 });
  const off = hub.watch("root", () => {});
  await tick();
  assert.ok(reads > 1);
  off();
  const stoppedAt = reads;
  await tick();
  assert.equal(reads, stoppedAt);
  hub.dispose();
});

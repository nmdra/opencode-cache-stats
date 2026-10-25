import assert from "node:assert/strict";
import { test } from "node:test";
import { collect } from "./collect.ts";
import { assistant, client, session } from "./test-helpers.ts";

const signal = () => new AbortController().signal;

test("reads every message page, keeps assistant filters, and includes old history", async () => {
  const cursors: (string | undefined)[] = [];
  const result = await collect(client({
    messages: async (input, options) => {
      assert.ok(options?.signal);
      assert.equal(input.type, "assistant");
      cursors.push(input.cursor);
      if (!input.cursor) {
        assert.equal(input.order, "asc");
        return { data: [assistant("msg_before_compaction")], cursor: { next: "page2" } };
      }
      assert.equal(input.order, undefined);
      return { data: [assistant("msg_after_compaction"), assistant("msg_before_compaction")], cursor: {} };
    },
  }), "root", signal());
  assert.deepEqual(cursors, [undefined, "page2"]);
  assert.equal(result.acc.reqs, 2);
  assert.equal(result.acc.cacheRead, 180);
});

test("paginates more than 50 children and aggregates nested descendants once", async () => {
  const children = Array.from({ length: 60 }, (_, index) => session(`child_${index}`, { parentID: "root", agent: "explore" }));
  const result = await collect(client({
    list: async (input) => {
      if (input?.cursor === "children2") {
        assert.equal(input.parentID, undefined);
        return { data: children.slice(50), cursor: {} };
      }
      if (input?.parentID === "root") return { data: children.slice(0, 50), cursor: { next: "children2" } };
      if (input?.parentID === "child_0") return { data: [session("grandchild", { parentID: "child_0" }), children[1], session("root")], cursor: {} };
      return { data: [], cursor: {} };
    },
    messages: async ({ sessionID }) => ({ data: [assistant(`msg_${sessionID}`)], cursor: {} }),
  }), "root", signal());
  assert.equal(result.subagents, 61);
  assert.equal(result.subs.length, 61);
  assert.equal(new Set(result.subs.map((sub) => sub.id)).size, 61);
  assert.equal(result.acc.reqs, 62);
  assert.equal(result.perModel.get("acme/model-a")?.reqs, 62);
  assert.equal(result.subs.find((sub) => sub.id === "child_0")?.reqs, 2);
  assert.equal(result.subs.find((sub) => sub.id === "child_0")?.name, "explore");
});

test("keeps model switches and missing usage visible across the family", async () => {
  const result = await collect(client({
    list: async (input) => ({ data: input?.parentID === "root" ? [session("child")] : [], cursor: {} }),
    messages: async ({ sessionID }) => ({ data: sessionID === "root" ? [
      assistant("msg_root"), assistant("msg_pending", { tokens: undefined }),
    ] : [assistant("msg_child", { model: { providerID: "other", id: "model-b" } })], cursor: {} }),
  }), "root", signal());
  assert.equal(result.perModel.size, 2);
  assert.equal(result.acc.count - result.acc.reqs, 1);
  assert.equal(result.subs[0].model, "other/model-b");
});

test("bounds concurrent requests for a wide session tree", async () => {
  let active = 0;
  let max = 0;
  const pause = async () => {
    active++;
    max = Math.max(max, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
  };
  await collect(client({
    list: async (input) => {
      await pause();
      return { data: input?.parentID === "root" ? Array.from({ length: 20 }, (_, i) => session(`child_${i}`)) : [], cursor: {} };
    },
    messages: async () => { await pause(); return { data: [], cursor: {} }; },
  }), "root", signal());
  assert.ok(max > 1);
  assert.ok(max <= 8, `expected at most 8 requests, saw ${max}`);
});

test("collects a deep session chain without recursive traversal or duplicate rows", async () => {
  const depth = 1000;
  const result = await collect(client({
    list: async (input) => {
      const index = Number(input?.parentID?.slice(4));
      return { data: index < depth ? [session(`node${index + 1}`)] : [], cursor: {} };
    },
    messages: async ({ sessionID }) => ({ data: [assistant(`msg_${sessionID}`)], cursor: {} }),
  }), "node0", signal());
  assert.equal(result.subagents, depth);
  assert.equal(result.subs.length, depth);
  assert.equal(result.acc.reqs, depth + 1);
  assert.equal(result.subs.find((sub) => sub.id === "node1")?.reqs, depth);
});

test("rejects partial results and cancels sibling reads on a page failure", async () => {
  let requestSignal: AbortSignal | undefined;
  await assert.rejects(collect(client({
    list: async (_input, options) => { requestSignal = options?.signal; return { data: [], cursor: {} }; },
    messages: async ({ cursor }) => {
      if (cursor) throw new Error("offline");
      return { data: [assistant("msg_one")], cursor: { next: "page2" } };
    },
  }), "root", signal()), /offline/);
  assert.equal(requestSignal?.aborted, true);
});

test("rejects repeated pagination cursors rather than hanging", async () => {
  await assert.rejects(collect(client({ messages: async () => ({ data: [], cursor: { next: "same" } }) }), "root", signal()), /repeated/);
});

test("does not start requests when cancelled", async () => {
  const abort = new AbortController();
  abort.abort();
  let called = false;
  await assert.rejects(collect(client({ get: async () => { called = true; return session("root"); } }), "root", abort.signal), { name: "AbortError" });
  assert.equal(called, false);
});

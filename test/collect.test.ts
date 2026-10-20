import { describe, expect, spyOn, test } from "bun:test";
import type {
  MessageListInput,
  SessionInfo,
  SessionListInput,
  SessionMessageInfo,
  SessionMessagesResponse,
  SessionsResponse,
} from "@opencode/client";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import {
  collect,
  v1Source,
  v2Source,
  type Acc,
  type V2Cache as Cache,
  type V2Client as Client,
} from "../tui-plugins/cache-stats";
import {
  assistant,
  nextSeq,
  session,
  usage,
  user,
  v1Assistant,
  v1Session,
  v1User,
  type V1Entry,
} from "./fixtures";

// In-memory stand-in for the opencode server. It follows the real
// endpoints: a message page holds at most 200 items, a cursor cannot be
// combined with order and carries the filters of the first page, every
// non-empty page returns a next cursor, and messages come newest first.
function fakeServer(
  messages: Record<string, SessionMessageInfo[]>,
  sessions: SessionInfo[],
) {
  const calls = { message: 0, session: 0 };
  const signals: (AbortSignal | undefined)[] = [];
  const page = <T>(items: T[], offset: number, limit: number, key: string) => {
    const data = items.slice(offset, offset + limit);
    return { data, next: data.length > 0 ? `${key}|${offset + data.length}` : null };
  };
  const check = (
    input: { limit?: number; cursor?: string; order?: string },
    max = Infinity,
  ) => {
    if (input.limit !== undefined && (input.limit < 1 || input.limit > max))
      throw new Error(`invalid limit ${input.limit}`);
    if (input.cursor !== undefined && input.order !== undefined)
      throw new Error("cursor cannot be combined with order");
  };
  const client: Client = {
    message: {
      async list(
        input: MessageListInput,
        options?: { readonly signal?: AbortSignal },
      ): Promise<SessionMessagesResponse> {
        calls.message += 1;
        signals.push(options?.signal);
        check(input, 200);
        const [key, offset] = input.cursor?.split("|") ?? [input.sessionID, "0"];
        const newest = [...(messages[key] ?? [])].reverse();
        const r = page(newest, Number(offset), input.limit ?? 50, key);
        return { data: r.data, cursor: { next: r.next } };
      },
    },
    session: {
      async list(
        input: SessionListInput = {},
        options?: { readonly signal?: AbortSignal },
      ): Promise<SessionsResponse> {
        calls.session += 1;
        signals.push(options?.signal);
        check(input);
        const [key, offset] = input.cursor?.split("|") ?? [String(input.parentID), "0"];
        const children = sessions.filter((s) => s.parentID === key);
        const r = page(children, Number(offset), input.limit ?? 50, key);
        return { data: r.data, cursor: { next: r.next } };
      },
    },
  };
  return { client, calls, signals };
}

function emptyCache(): Cache {
  return { session: { list: () => [], message: { list: () => [] } } };
}

function acc(fields: Partial<Acc>): Acc {
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
    ...fields,
  };
}

function expectAcc(actual: Acc | undefined, expected: Acc) {
  expect(actual).toBeDefined();
  const { cost, ...rest } = actual as Acc;
  const { cost: expectedCost, ...expectedRest } = expected;
  expect(rest).toEqual(expectedRest);
  expect(cost).toBeCloseTo(expectedCost, 10);
}

const run = (
  client: Client,
  data: Cache,
  sessionID: string,
  signal = new AbortController().signal,
) => collect(v2Source(client, data, signal), sessionID, new Set(), signal);

describe("collect on opencode v2", () => {
  test("sums the usage of every assistant request and skips other messages", async () => {
    const { client } = fakeServer(
      {
        ses_main: [
          user(),
          assistant("anthropic/claude-sonnet", usage(100, 50, 10, 900, 200), 0.01),
          user(),
          assistant("anthropic/claude-sonnet", usage(300, 20, 0, 0, 0), 0.02),
          assistant("openai/gpt-5", usage(50, 5, 5, 150, 0), 0.005),
        ],
      },
      [session("ses_main")],
    );

    const out = await run(client, emptyCache(), "ses_main");

    expectAcc(
      out.acc,
      acc({
        input: 450,
        output: 75,
        reasoning: 15,
        cacheRead: 1050,
        cacheWrite: 200,
        cost: 0.035,
        count: 3,
        reqs: 3,
        reqsWithCacheRead: 2,
      }),
    );
    expect([...out.perModel.keys()].sort()).toEqual([
      "anthropic/claude-sonnet",
      "openai/gpt-5",
    ]);
    expectAcc(
      out.perModel.get("anthropic/claude-sonnet"),
      acc({
        input: 400,
        output: 70,
        reasoning: 10,
        cacheRead: 900,
        cacheWrite: 200,
        cost: 0.03,
        reqs: 2,
        reqsWithCacheRead: 1,
      }),
    );
    expectAcc(
      out.perModel.get("openai/gpt-5"),
      acc({ input: 50, output: 5, reasoning: 5, cacheRead: 150, cost: 0.005, reqs: 1, reqsWithCacheRead: 1 }),
    );
    expect(out.subagents).toBe(0);
    expect(out.subs).toEqual([]);
  });

  test("reads every page of a long session", async () => {
    const long = Array.from({ length: 450 }, () =>
      assistant("anthropic/claude-sonnet", usage(1, 0, 0, 1, 0), 0),
    );
    const { client } = fakeServer({ ses_long: long }, [session("ses_long")]);

    const out = await run(client, emptyCache(), "ses_long");

    expect(out.acc.reqs).toBe(450);
    expect(out.acc.input).toBe(450);
    expect(out.acc.cacheRead).toBe(450);
  });

  test("reads a session whose size is an exact multiple of the page size", async () => {
    const even = Array.from({ length: 400 }, () =>
      assistant("anthropic/claude-sonnet", usage(1, 0, 0, 0, 0), 0),
    );
    const { client } = fakeServer({ ses_even: even }, [session("ses_even")]);

    const out = await run(client, emptyCache(), "ses_even");

    expect(out.acc.reqs).toBe(400);
  });

  test("counts compaction usage like an assistant request", async () => {
    const { client } = fakeServer(
      {
        // Chronological; every fixture takes the next timestamp.
        ses_main: [
          assistant("anthropic/claude-sonnet", usage(100, 50, 10, 900, 200), 0.01),
          {
            type: "compaction",
            id: "msg_c1",
            time: { created: nextSeq() },
            status: "completed",
            reason: "auto",
            model: { id: "claude-sonnet", providerID: "anthropic" },
            summary: "summary",
            cost: 0.05,
            tokens: usage(1000, 200, 0, 0, 0),
          },
          assistant("openai/gpt-5", usage(50, 5, 5, 150, 0), 0.005),
          {
            type: "compaction",
            id: "msg_c2",
            time: { created: nextSeq() },
            status: "failed",
            reason: "manual",
            error: { type: "provider", message: "overloaded" },
            cost: 0.01,
            tokens: usage(500, 0, 0, 0, 0),
          },
          assistant("anthropic/claude-sonnet", usage(300, 20, 0, 0, 0), 0.02),
          {
            type: "compaction",
            id: "msg_c3",
            time: { created: nextSeq() },
            status: "running",
            reason: "auto",
            summary: "",
          },
        ],
      },
      [session("ses_main")],
    );

    const out = await run(client, emptyCache(), "ses_main");

    expectAcc(
      out.acc,
      acc({
        input: 1950,
        output: 275,
        reasoning: 15,
        cacheRead: 1050,
        cacheWrite: 200,
        cost: 0.095,
        count: 6,
        reqs: 5,
        reqsWithCacheRead: 2,
      }),
    );
    // A compaction without its own model belongs to the model of the
    // last assistant request before it, as in v1.
    expect([...out.perModel.keys()].sort()).toEqual([
      "anthropic/claude-sonnet",
      "openai/gpt-5",
    ]);
    expectAcc(
      out.perModel.get("anthropic/claude-sonnet"),
      acc({
        input: 1400,
        output: 270,
        reasoning: 10,
        cacheRead: 900,
        cacheWrite: 200,
        cost: 0.08,
        reqs: 3,
        reqsWithCacheRead: 1,
      }),
    );
    expectAcc(
      out.perModel.get("openai/gpt-5"),
      acc({ input: 550, output: 5, reasoning: 5, cacheRead: 150, cost: 0.015, reqs: 2, reqsWithCacheRead: 1 }),
    );
  });

  test("includes nested subagent sessions in the totals and the subagent list", async () => {
    const { client } = fakeServer(
      {
        ses_main: [assistant("anthropic/claude-sonnet", usage(100, 50, 10, 900, 200), 0.01)],
        ses_child: [
          assistant("openai/gpt-5", usage(100, 10, 0, 300, 0), 0.002),
          assistant("openai/gpt-5", usage(100, 10, 0, 0, 0), 0.001),
        ],
        ses_grand: [assistant("anthropic/claude-haiku", usage(10, 1, 0, 90, 0), 0.0001)],
      },
      [
        session("ses_main"),
        session("ses_child", { parentID: "ses_main", agent: "explore", title: "Look around" }),
        session("ses_grand", { parentID: "ses_child", title: "Find files (@general subagent)" }),
        session("ses_other", { parentID: "ses_elsewhere", agent: "build" }),
      ],
    );

    const out = await run(client, emptyCache(), "ses_main");

    expectAcc(
      out.acc,
      acc({
        input: 310,
        output: 71,
        reasoning: 10,
        cacheRead: 1290,
        cacheWrite: 200,
        cost: 0.0131,
        count: 4,
        reqs: 4,
        reqsWithCacheRead: 3,
      }),
    );
    expect(out.subagents).toBe(2);
    expect(out.subs.map((s) => ({ ...s, cost: Number(s.cost.toFixed(6)) }))).toEqual([
      {
        id: "ses_child",
        name: "explore",
        hit: 65,
        reqs: 3,
        reqsWithCacheRead: 2,
        tokens: 621,
        cost: 0.0031,
        model: "openai/gpt-5",
      },
      {
        id: "ses_grand",
        name: "general",
        hit: 90,
        reqs: 1,
        reqsWithCacheRead: 1,
        tokens: 101,
        cost: 0.0001,
        model: "anthropic/claude-haiku",
      },
    ]);
    expect([...out.perModel.keys()].sort()).toEqual([
      "anthropic/claude-haiku",
      "anthropic/claude-sonnet",
      "openai/gpt-5",
    ]);
  });

  test("reads every page of subagent sessions", async () => {
    const children = Array.from({ length: 250 }, (_, i) =>
      session(`ses_c${i}`, { parentID: "ses_main", agent: "explore" }),
    );
    const { client } = fakeServer({}, [session("ses_main"), ...children]);

    const out = await run(client, emptyCache(), "ses_main");

    expect(out.subagents).toBe(250);
    expect(new Set(out.subs.map((s) => s.id)).size).toBe(250);
  });

  test("falls back to the local cache when the server request fails", async () => {
    const offline: Client = {
      message: { list: async () => Promise.reject(new Error("offline")) },
      session: { list: async () => Promise.reject(new Error("offline")) },
    };
    const cached: Record<string, SessionMessageInfo[]> = {
      ses_main: [user(), assistant("anthropic/claude-sonnet", usage(100, 0, 0, 300, 0), 0.01)],
      ses_child: [assistant("openai/gpt-5", usage(50, 0, 0, 50, 0), 0.002)],
    };
    const data: Cache = {
      session: {
        list: () => [
          session("ses_main"),
          session("ses_child", { parentID: "ses_main", agent: "explore" }),
          session("ses_other", { parentID: "ses_elsewhere", agent: "build" }),
        ],
        message: { list: (id) => cached[id] ?? [] },
      },
    };
    const logged = spyOn(console, "error").mockImplementation(() => {});

    try {
      const out = await run(offline, data, "ses_main");

      expectAcc(
        out.acc,
        acc({ input: 150, cacheRead: 350, cost: 0.012, count: 2, reqs: 2, reqsWithCacheRead: 2 }),
      );
      expect(out.subs.map((s) => s.id)).toEqual(["ses_child"]);
    } finally {
      logged.mockRestore();
    }
  });

  test("passes the abort signal to every server request", async () => {
    const { client, signals } = fakeServer(
      {
        ses_main: [assistant("anthropic/claude-sonnet", usage(1, 0, 0, 1, 0), 0)],
        ses_child: [assistant("anthropic/claude-sonnet", usage(1, 0, 0, 1, 0), 0)],
      },
      [session("ses_main"), session("ses_child", { parentID: "ses_main", agent: "explore" })],
    );
    const ctrl = new AbortController();

    await run(client, emptyCache(), "ses_main", ctrl.signal);

    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s === ctrl.signal)).toBe(true);
  });

  test("stops paging when the server repeats a cursor", async () => {
    let calls = 0;
    const full = Array.from({ length: 200 }, () =>
      assistant("anthropic/claude-sonnet", usage(1, 0, 0, 0, 0), 0),
    );
    const client: Client = {
      message: {
        list: async () => {
          calls += 1;
          if (calls > 5) throw new Error("paging did not stop");
          return { data: full, cursor: { next: "same" } };
        },
      },
      session: { list: async () => ({ data: [], cursor: { next: null } }) },
    };

    await run(client, emptyCache(), "ses_loop");

    expect(calls).toBe(2);
  });

  test("files a compaction without a model under the model selected before it", async () => {
    const { client } = fakeServer(
      {
        // Chronological; every fixture takes the next timestamp.
        ses_main: [
          assistant("anthropic/claude-sonnet", usage(100, 0, 0, 0, 0), 0.01),
          {
            type: "model-switched",
            id: "msg_m1",
            time: { created: nextSeq() },
            model: { id: "gpt-5", providerID: "openai" },
            previous: { id: "claude-sonnet", providerID: "anthropic" },
          },
          {
            type: "compaction",
            id: "msg_c9",
            time: { created: nextSeq() },
            status: "failed",
            reason: "auto",
            error: { type: "provider", message: "overloaded" },
            cost: 0.02,
            tokens: usage(500, 0, 0, 0, 0),
          },
        ],
      },
      [session("ses_main")],
    );

    const out = await run(client, emptyCache(), "ses_main");

    expectAcc(out.perModel.get("openai/gpt-5"), acc({ input: 500, cost: 0.02, reqs: 1 }));
    expectAcc(
      out.perModel.get("anthropic/claude-sonnet"),
      acc({ input: 100, cost: 0.01, reqs: 1 }),
    );
  });

  test("does no work once the plugin is shutting down", async () => {
    const { client, calls } = fakeServer(
      { ses_main: [assistant("anthropic/claude-sonnet", usage(1, 1, 0, 1, 0), 0.01)] },
      [session("ses_main")],
    );
    const ctrl = new AbortController();
    ctrl.abort();

    const out = await run(client, emptyCache(), "ses_main", ctrl.signal);

    expect(out.acc.reqs).toBe(0);
    expect(out.subs).toEqual([]);
    expect(calls).toEqual({ message: 0, session: 0 });
  });
});

// The v1 TUI API returns { info, parts } entries from the server and bare
// messages from its local state.
function v1Api(
  entries: Record<string, V1Entry[]>,
  sessions: ReturnType<typeof v1Session>[],
  opts: { offline?: boolean } = {},
) {
  const fail = async () => Promise.reject(new Error("offline"));
  const client = {
    session: {
      messages: opts.offline
        ? fail
        : async (input: { sessionID: string }) => ({ data: entries[input.sessionID] ?? [] }),
      children: opts.offline
        ? fail
        : async (input: { sessionID: string }) => ({
            data: sessions.filter((s) => s.parentID === input.sessionID),
          }),
    },
  } as unknown as TuiPluginApi["client"];
  const state = {
    session: {
      get: (id: string) => sessions.find((s) => s.id === id),
      messages: (id: string) => (entries[id] ?? []).map((e) => e.info),
    },
  } as unknown as TuiPluginApi["state"];
  return { client, state };
}

const runV1 = (api: ReturnType<typeof v1Api>, sessionID: string) => {
  const signal = new AbortController().signal;
  return collect(v1Source(api.client, api.state), sessionID, new Set(), signal);
};

describe("collect on opencode v1", () => {
  test("counts each step of an assistant message as one request", async () => {
    const api = v1Api(
      {
        ses_main: [
          v1User("ses_main"),
          // The message totals differ from its steps; the steps win.
          v1Assistant("ses_main", "anthropic/claude-sonnet", usage(1, 1, 1, 1, 1), 1, [
            { tokens: usage(100, 10, 0, 900, 200), cost: 0.01 },
            { tokens: usage(50, 5, 0, 0, 0), cost: 0.002 },
          ]),
          // Without step parts the message totals are one request.
          v1Assistant("ses_main", "openai/gpt-5", usage(30, 3, 3, 70, 0), 0.003),
        ],
      },
      [v1Session("ses_main")],
    );

    const out = await runV1(api, "ses_main");

    expectAcc(
      out.acc,
      acc({
        input: 180,
        output: 18,
        reasoning: 3,
        cacheRead: 970,
        cacheWrite: 200,
        cost: 0.015,
        count: 2,
        reqs: 3,
        reqsWithCacheRead: 2,
      }),
    );
    expectAcc(
      out.perModel.get("anthropic/claude-sonnet"),
      acc({ input: 150, output: 15, cacheRead: 900, cacheWrite: 200, cost: 0.012, reqs: 2, reqsWithCacheRead: 1 }),
    );
    expectAcc(
      out.perModel.get("openai/gpt-5"),
      acc({ input: 30, output: 3, reasoning: 3, cacheRead: 70, cost: 0.003, reqs: 1, reqsWithCacheRead: 1 }),
    );
  });

  test("includes the subagent sessions listed by session.children", async () => {
    const api = v1Api(
      {
        ses_main: [v1Assistant("ses_main", "anthropic/claude-sonnet", usage(100, 10, 0, 300, 0), 0.01)],
        ses_child: [v1Assistant("ses_child", "anthropic/claude-haiku", usage(10, 1, 0, 90, 0), 0.0001)],
      },
      [
        v1Session("ses_main"),
        v1Session("ses_child", { parentID: "ses_main", title: "Find files (@explore subagent)" }),
      ],
    );

    const out = await runV1(api, "ses_main");

    expect(out.subagents).toBe(1);
    expect(out.subs.map((s) => ({ ...s, cost: Number(s.cost.toFixed(6)) }))).toEqual([
      {
        id: "ses_child",
        name: "explore",
        hit: 90,
        reqs: 1,
        reqsWithCacheRead: 1,
        tokens: 101,
        cost: 0.0001,
        model: "anthropic/claude-haiku",
      },
    ]);
    expectAcc(
      out.acc,
      acc({ input: 110, output: 11, cacheRead: 390, cost: 0.0101, count: 2, reqs: 2, reqsWithCacheRead: 2 }),
    );
  });

  test("falls back to the local state when the server request fails", async () => {
    const api = v1Api(
      {
        ses_main: [
          v1User("ses_main"),
          v1Assistant("ses_main", "anthropic/claude-sonnet", usage(100, 10, 0, 300, 0), 0.01),
        ],
      },
      [v1Session("ses_main")],
      { offline: true },
    );
    const logged = spyOn(console, "error").mockImplementation(() => {});

    try {
      const out = await runV1(api, "ses_main");

      expectAcc(
        out.acc,
        acc({ input: 100, output: 10, cacheRead: 300, cost: 0.01, count: 1, reqs: 1, reqsWithCacheRead: 1 }),
      );
      expect(out.subs).toEqual([]);
    } finally {
      logged.mockRestore();
    }
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import type { SessionInfo, SessionMessageInfo } from "@opencode/client";
import type { Plugin } from "@opencode/plugin/tui";
import type {
  DialogOptions,
  KeymapCommand,
  KeymapLayer,
  Route,
  ToastOptions,
} from "@opencode/plugin/tui/context";
import { testRender, type JSX } from "@opentui/solid";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import plugin, { type V2Client } from "../tui-plugins/cache-stats";
import {
  assistant,
  session,
  theme,
  usage,
  v1Assistant,
  v1Session,
  v1Theme,
  type V1Entry,
} from "./fixtures";

// Stand-in for the plugin context that the v2 TUI passes to setup(). It
// records what the plugin asks the host to do; the server data is served
// in one page because paging is covered by the collect tests.
function host(opts: {
  route: Route;
  messages?: Record<string, SessionMessageInfo[]>;
  sessions?: SessionInfo[];
}) {
  const layers: (() => KeymapLayer)[] = [];
  const toasts: ToastOptions[] = [];
  const dialogs: (() => JSX.Element)[] = [];
  const sizes: DialogOptions[] = [];
  const sessions = opts.sessions ?? [];
  // The fake is checked against slices of the real context; only the
  // hand-off to setup() widens it.
  const fake = {
    theme: theme(),
    client: {
      message: {
        list: async (input: { sessionID: string }) => ({
          data: opts.messages?.[input.sessionID] ?? [],
          cursor: { next: null },
        }),
      },
      session: {
        list: async (input: { parentID?: string | null } = {}) => ({
          data: sessions.filter((s) => s.parentID === input.parentID),
          cursor: { next: null },
        }),
      },
    },
    data: {
      session: {
        get: (id: string) => sessions.find((s) => s.id === id),
        list: () => sessions,
        message: { list: () => [] },
      },
    },
    keymap: { layer: (factory: () => KeymapLayer) => void layers.push(factory) },
    ui: {
      router: { current: () => opts.route },
      toast: { show: (o: ToastOptions) => void toasts.push(o) },
      dialog: {
        show: (render: () => JSX.Element) => void dialogs.push(render),
        set: (o: DialogOptions) => void sizes.push(o),
      },
    },
  } satisfies {
    theme: Plugin.Context["theme"];
    client: V2Client;
    data: {
      session: Pick<Plugin.Context["data"]["session"], "get" | "list"> & {
        message: Pick<Plugin.Context["data"]["session"]["message"], "list">;
      };
    };
    keymap: Pick<Plugin.Context["keymap"], "layer">;
    ui: {
      router: Pick<Plugin.Context["ui"]["router"], "current">;
      toast: Plugin.Context["ui"]["toast"];
      dialog: Pick<Plugin.Context["ui"]["dialog"], "show" | "set">;
    };
  };
  const ctx = fake as unknown as Plugin.Context;
  const command = (): KeymapCommand | undefined =>
    layers
      .flatMap((layer) => layer().commands ?? [])
      .find((c) => c.slash?.name === "cache-stats");
  const bound = (key: string): KeymapCommand | undefined =>
    layers
      .flatMap((layer) => layer().commands ?? [])
      .find((c) => c.bind === key);
  return { ctx, toasts, dialogs, sizes, command, bound };
}

let rendered: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(async () => {
  await rendered?.dispose();
  rendered = undefined;
});

describe("cache-stats plugin on opencode v2", () => {
  test("registers /cache-stats in the prompt and the command palette", async () => {
    const h = host({ route: { type: "home" } });

    await plugin.setup(h.ctx);

    const cmd = h.command();
    expect(cmd).toBeDefined();
    expect(cmd?.palette).toBe(true);
    expect(cmd?.title).toBe("Cache stats");
  });

  test("warns instead of opening the dialog outside a session", async () => {
    const h = host({ route: { type: "home" } });
    await plugin.setup(h.ctx);

    await h.command()?.run();

    expect(h.toasts).toEqual([
      { title: "Cache stats", message: "No active session.", variant: "warning" },
    ]);
    expect(h.dialogs).toHaveLength(0);
  });

  test("opens a medium dialog with the stats of the current session", async () => {
    const h = host({
      route: { type: "session", sessionID: "ses_main" },
      sessions: [session("ses_main", { title: "Refactor parser" })],
      messages: {
        ses_main: [assistant("anthropic/claude-sonnet", usage(100, 40, 0, 900, 0), 0.01)],
      },
    });
    await plugin.setup(h.ctx);

    await h.command()?.run();

    expect(h.toasts).toHaveLength(0);
    expect(h.dialogs).toHaveLength(1);
    expect(h.sizes).toEqual([{ size: "medium" }]);

    rendered = await testRender(h.dialogs[0], { width: 64, height: 30 });
    await rendered.renderOnce();
    const frame = rendered.captureCharFrame();
    expect(frame).toContain("Cache stats · Refactor parser");
    expect(frame).toContain("90.0% Excellent · overall cache hit");
    expect(frame).toContain("claude-sonnet");

    // The verdict uses the success color of the dialog surface.
    const spans = rendered.captureSpans().lines.flatMap((line) => line.spans);
    const verdict = spans.find((s) => s.text.includes("Excellent"));
    const success = h.ctx.theme.surface("dialog").text.feedback.success.base;
    expect(verdict?.fg.equals(success)).toBe(true);
  });

  test("pages the dialog with PgUp/PgDn through the keymap", async () => {
    const h = host({
      route: { type: "session", sessionID: "ses_main" },
      sessions: [session("ses_main", { title: "Refactor parser" })],
      messages: {
        ses_main: [assistant("anthropic/claude-sonnet", usage(100, 40, 0, 900, 0), 0.01)],
      },
    });
    await plugin.setup(h.ctx);
    await h.command()?.run();
    rendered = await testRender(h.dialogs[0], { width: 64, height: 30 });
    await rendered.renderOnce();
    expect(rendered.captureCharFrame()).toContain("overall cache hit");

    // opencode v2 binds PgUp/PgDn to session paging in a global layer
    // that closes dialogs, so the dialog binds them in a layer of its own.
    await h.bound("pagedown")?.run();
    await rendered.renderOnce();
    expect(rendered.captureCharFrame()).not.toContain("overall cache hit");

    await h.bound("pageup")?.run();
    await rendered.renderOnce();
    expect(rendered.captureCharFrame()).toContain("overall cache hit");
  });

  test("leaves raw PgDn key events to the keymap", async () => {
    const h = host({
      route: { type: "session", sessionID: "ses_main" },
      sessions: [session("ses_main")],
      messages: {
        ses_main: [assistant("anthropic/claude-sonnet", usage(100, 40, 0, 900, 0), 0.01)],
      },
    });
    await plugin.setup(h.ctx);
    await h.command()?.run();
    rendered = await testRender(h.dialogs[0], { width: 64, height: 30 });
    await rendered.renderOnce();

    rendered.mockInput.pressKey("\x1b[6~");
    await rendered.renderOnce();

    // Scrolling here as well would page twice per key press.
    expect(rendered.captureCharFrame()).toContain("overall cache hit");
  });

  test("stops loading once opencode unloads the plugin", async () => {
    const h = host({
      route: { type: "session", sessionID: "ses_main" },
      sessions: [session("ses_main")],
      messages: {
        ses_main: [assistant("anthropic/claude-sonnet", usage(1, 1, 0, 1, 0), 0)],
      },
    });
    const cleanup = await plugin.setup(h.ctx);

    await cleanup?.();
    await h.command()?.run();

    expect(h.dialogs).toHaveLength(0);
  });
});

// Stand-in for the v1 TUI plugin API (api passed to tui()). It stays a
// cast: the v1 SDK client returns hey-api RequestResult objects whose
// transport fields a fake cannot provide.
function v1Host(opts: {
  route: { name: string; params?: Record<string, unknown> };
  entries?: Record<string, V1Entry[]>;
  sessions?: ReturnType<typeof v1Session>[];
  signal?: AbortSignal;
}) {
  const layers: { commands?: Record<string, unknown>[] }[] = [];
  const toasts: unknown[] = [];
  const calls: string[] = [];
  const dialogs: (() => JSX.Element)[] = [];
  // v1 runs the command without returning its promise, so the fake
  // resolves this once the plugin shows a toast or a dialog.
  const reported = Promise.withResolvers<void>();
  const sessions = opts.sessions ?? [];
  const current = v1Theme();
  const api = {
    theme: { current },
    client: {
      session: {
        messages: async (input: { sessionID: string }) => ({
          data: opts.entries?.[input.sessionID] ?? [],
        }),
        children: async (input: { sessionID: string }) => ({
          data: sessions.filter((s) => s.parentID === input.sessionID),
        }),
      },
    },
    state: {
      session: {
        get: (id: string) => sessions.find((s) => s.id === id),
        messages: () => [],
      },
    },
    route: { current: opts.route },
    ui: {
      toast: (o: unknown) => {
        toasts.push(o);
        reported.resolve();
      },
      dialog: {
        setSize: (size: string) => void calls.push(`setSize:${size}`),
        replace: (render: () => JSX.Element) => {
          calls.push("replace");
          dialogs.push(render);
          reported.resolve();
        },
      },
    },
    keymap: { registerLayer: (layer: (typeof layers)[number]) => void layers.push(layer) },
    lifecycle: { signal: opts.signal ?? new AbortController().signal },
  } as unknown as TuiPluginApi;
  const command = () =>
    layers
      .flatMap((layer) => layer.commands ?? [])
      .find((c) => c.slashName === "cache-stats") as
      | { title?: string; namespace?: string; run: () => void }
      | undefined;
  return { api, current, toasts, calls, dialogs, command, reported: reported.promise };
}

describe("cache-stats plugin on opencode v1", () => {
  test("registers /cache-stats in the prompt and the command palette", async () => {
    const h = v1Host({ route: { name: "home" } });

    await plugin.tui(h.api, undefined, undefined as never);

    const cmd = h.command();
    expect(cmd).toBeDefined();
    expect(cmd?.namespace).toBe("palette");
    expect(cmd?.title).toBe("Cache stats");
  });

  test("warns instead of opening the dialog outside a session", async () => {
    const h = v1Host({ route: { name: "home" } });
    await plugin.tui(h.api, undefined, undefined as never);

    h.command()?.run();
    await h.reported;

    expect(h.toasts).toEqual([
      { title: "Cache stats", message: "No active session.", variant: "warning" },
    ]);
    expect(h.dialogs).toHaveLength(0);
  });

  test("opens a medium dialog with the stats of the current session", async () => {
    const h = v1Host({
      route: { name: "session", params: { sessionID: "ses_main" } },
      sessions: [v1Session("ses_main", { title: "Refactor parser" })],
      entries: {
        ses_main: [
          v1Assistant("ses_main", "anthropic/claude-sonnet", usage(100, 40, 0, 900, 0), 0.01),
        ],
      },
    });
    await plugin.tui(h.api, undefined, undefined as never);

    h.command()?.run();
    await h.reported;

    expect(h.toasts).toHaveLength(0);
    expect(h.calls).toEqual(["setSize:medium", "replace"]);

    rendered = await testRender(h.dialogs[0], { width: 64, height: 30 });
    await rendered.renderOnce();
    const frame = rendered.captureCharFrame();
    expect(frame).toContain("Cache stats · Refactor parser");
    expect(frame).toContain("90.0% Excellent · overall cache hit");
    expect(frame).toContain("claude-sonnet");

    const spans = rendered.captureSpans().lines.flatMap((line) => line.spans);
    const verdict = spans.find((s) => s.text.includes("Excellent"));
    expect(verdict?.fg.equals(h.current.success)).toBe(true);
  });

  test("pages the dialog with PgDn", async () => {
    const h = v1Host({
      route: { name: "session", params: { sessionID: "ses_main" } },
      sessions: [v1Session("ses_main")],
      entries: {
        ses_main: [
          v1Assistant("ses_main", "anthropic/claude-sonnet", usage(100, 40, 0, 900, 0), 0.01),
        ],
      },
    });
    await plugin.tui(h.api, undefined, undefined as never);
    h.command()?.run();
    await h.reported;
    rendered = await testRender(h.dialogs[0], { width: 64, height: 30 });
    await rendered.renderOnce();
    expect(rendered.captureCharFrame()).toContain("overall cache hit");

    rendered.mockInput.pressKey("\x1b[6~");
    await rendered.renderOnce();

    expect(rendered.captureCharFrame()).not.toContain("overall cache hit");
  });

  test("stops loading once opencode disposes the plugin", async () => {
    const ctrl = new AbortController();
    const h = v1Host({
      route: { name: "session", params: { sessionID: "ses_main" } },
      sessions: [v1Session("ses_main")],
      entries: {
        ses_main: [v1Assistant("ses_main", "anthropic/claude-sonnet", usage(1, 1, 0, 1, 0), 0)],
      },
      signal: ctrl.signal,
    });
    await plugin.tui(h.api, undefined, undefined as never);
    ctrl.abort();

    h.command()?.run();
    // Nothing is reported on this path, so give the load a bounded window.
    await Promise.race([h.reported, Bun.sleep(20)]);

    expect(h.dialogs).toHaveLength(0);
  });
});

describe("cache-stats plugin source", () => {
  test("imports at runtime only what both opencode hosts provide", async () => {
    const src = await Bun.file(
      new URL("../tui-plugins/cache-stats.tsx", import.meta.url),
    ).text();

    // Bun drops type-only imports. v1 cannot load @opencode/* (v2) and v2
    // cannot load @opencode-ai/* (v1); both provide @opentui.
    const runtime = new Bun.Transpiler({ loader: "tsx" })
      .scan(src)
      .imports.map((i) => i.path);

    expect(runtime.length).toBeGreaterThan(0);
    expect(runtime.filter((path) => !path.startsWith("@opentui/"))).toEqual([]);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plugin } from "@opencode/plugin/tui";
import { setupCacheStats, type CacheContext } from "./controller.ts";
import { client, session } from "./test-helpers.ts";

function harness(api = client()) {
  let route: ReturnType<Plugin.Context["ui"]["router"]["current"]> = { type: "session", sessionID: "root" };
  let layer: ReturnType<Parameters<Plugin.Context["keymap"]["layer"]>[0]> | undefined;
  let shown = 0;
  let cleared = 0;
  let presentation: Parameters<Plugin.Context["ui"]["dialog"]["set"]>[0] = { size: "medium", centered: false };
  let closed: (() => void) | undefined;
  const toasts: Parameters<Plugin.Context["ui"]["toast"]["show"]>[0][] = [];
  const context: CacheContext = {
    client: api,
    keymap: { layer(factory) { layer = factory(); } },
    ui: {
      router: { current: () => route },
      toast: { show: (options) => { toasts.push(options); } },
      dialog: {
        set(options) { presentation = options; },
        show(_render, onClose) {
          // Match the host: showing a new dialog resets its presentation.
          presentation = { size: "medium", centered: false };
          shown++;
          closed = onClose;
        },
        clear() { cleared++; },
      },
    },
  };
  const controller = setupCacheStats(context, () => undefined);
  return {
    controller, toasts, layer: () => layer, shown: () => shown, cleared: () => cleared,
    presentation: () => presentation,
    navigate(next: typeof route) { route = next; }, close() { closed?.(); },
  };
}

test("registers the existing slash and palette commands", async () => {
  const app = harness();
  const command = app.layer()?.commands?.[0];
  assert.equal(command?.id, "cache-stats.show");
  assert.equal(command?.slash?.name, "cache-stats");
  assert.equal(command?.palette, true);
  await command?.run();
  assert.equal(app.shown(), 1);
});

test("warns outside a session", async () => {
  const app = harness();
  app.navigate({ type: "home" });
  await app.controller.run();
  assert.equal(app.toasts[0].message, "No active session.");
  assert.equal(app.shown(), 0);
});

test("applies centered presentation after opening resets the dialog options", async () => {
  const app = harness();
  await app.controller.run();
  assert.deepEqual(app.presentation(), { size: "medium", centered: true });
});

test("reports server failures without showing zero or partial totals", async () => {
  const app = harness(client({ messages: async () => { throw new Error("offline"); } }));
  await app.controller.run();
  assert.equal(app.toasts[0].variant, "error");
  assert.equal(app.shown(), 0);
});

test("deduplicates concurrent opens and suppresses results after navigation", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  let requests = 0;
  const app = harness(client({ get: async () => { requests++; await pending; return session("root"); } }));
  const first = app.controller.run();
  await app.controller.run();
  assert.equal(requests, 1);
  app.navigate({ type: "session", sessionID: "other" });
  finish();
  await first;
  assert.equal(app.shown(), 0);
});

test("unloading aborts pending reads and prevents a late dialog", async () => {
  let finish!: () => void;
  let requestSignal: AbortSignal | undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const app = harness(client({ get: async (_input, options) => {
    requestSignal = options?.signal;
    await pending;
    return session("root");
  } }));
  const first = app.controller.run();
  app.controller.dispose();
  assert.equal(requestSignal?.aborted, true);
  finish();
  await first;
  await app.controller.run();
  assert.equal(app.shown(), 0);
  assert.equal(app.toasts.length, 0);
});

test("navigation cancellation stays silent and permits a later open", async () => {
  const app = harness();
  const first = app.controller.run();
  app.controller.cancel();
  await first;
  assert.equal(app.shown(), 0);
  assert.equal(app.toasts.length, 0);
  await app.controller.run();
  assert.equal(app.shown(), 1);
});

test("unload closes only a dialog still owned by this plugin", async () => {
  const app = harness();
  await app.controller.run();
  app.close();
  app.controller.dispose();
  assert.equal(app.cleared(), 0);
  const open = harness();
  await open.controller.run();
  open.controller.dispose();
  open.controller.dispose();
  assert.equal(open.cleared(), 1);
});

import type { Plugin } from "@opencode/plugin/tui";
import type { JSX } from "@opentui/solid";
import { collect, type Collected, type CollectionClient } from "./collect.ts";

export type CacheContext = {
  client: CollectionClient;
  keymap: Pick<Plugin.Context["keymap"], "layer">;
  ui: {
    router: Pick<Plugin.Context["ui"]["router"], "current">;
    dialog: Pick<Plugin.Context["ui"]["dialog"], "show" | "set" | "clear">;
    toast: Plugin.Context["ui"]["toast"];
  };
};

export function setupCacheStats(context: CacheContext, render: (stats: Collected) => JSX.Element) {
  let inFlight: AbortController | undefined;
  let disposed = false;
  let dialogOpen = false;

  const run = async () => {
    if (disposed || inFlight) return;
    const route = context.ui.router.current();
    if (route.type !== "session") {
      context.ui.toast.show({ title: "Cache stats", message: "No active session.", variant: "warning" });
      return;
    }
    const request = new AbortController();
    inFlight = request;
    try {
      const stats = await collect(context.client, route.sessionID, request.signal);
      const current = context.ui.router.current();
      if (request.signal.aborted || disposed || current.type !== "session" || current.sessionID !== route.sessionID) return;
      context.ui.dialog.set({ size: "large", centered: true });
      context.ui.dialog.show(() => render(stats), () => { dialogOpen = false; });
      dialogOpen = true;
    } catch {
      if (!request.signal.aborted && !disposed) {
        context.ui.toast.show({
          title: "Cache stats",
          message: "Could not read complete session statistics. Check the server connection and try again.",
          variant: "error",
        });
      }
    } finally {
      request.abort();
      if (inFlight === request) inFlight = undefined;
    }
  };

  context.keymap.layer(() => ({
    mode: "global",
    commands: [{
      id: "cache-stats.show",
      title: "Cache stats",
      group: "Plugin",
      palette: true,
      slash: { name: "cache-stats" },
      run,
    }],
  }));

  return {
    run,
    cancel() { inFlight?.abort(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      inFlight?.abort();
      if (dialogOpen) context.ui.dialog.clear();
    },
  };
}

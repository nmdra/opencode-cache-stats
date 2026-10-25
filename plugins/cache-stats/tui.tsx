/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import { createEffect } from "solid-js";
import { setupCacheStats } from "./controller.ts";
import { CacheStatsView } from "./view.tsx";

export default Plugin.define({
  id: "nmdra.cache-stats",
  setup(context) {
    const controller = setupCacheStats(context, (stats) => <CacheStatsView stats={stats} />);
    let previousSession: string | undefined;
    createEffect(() => {
      const route = context.ui.router.current();
      const sessionID = route.type === "session" ? route.sessionID : undefined;
      if (previousSession !== sessionID) controller.cancel();
      previousSession = sessionID;
    });
    return () => controller.dispose();
  },
});

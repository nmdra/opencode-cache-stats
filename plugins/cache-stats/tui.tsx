/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import { createEffect } from "solid-js";
import { setupCacheStats } from "./controller.ts";
import { CacheStatsView } from "./view.tsx";
import { createLiveStats } from "./live.ts";
import { CacheStatsSidebar } from "./sidebar.tsx";

export default Plugin.define({
  id: "nmdra.cache-stats",
  setup(context) {
    const live = createLiveStats(context.client, context.data);
    const controller = setupCacheStats(context, (stats) => <CacheStatsView stats={stats} live={live} />);
    if (context.options.sidebar !== false) {
      context.ui.slot({
        append: "sidebar.content",
        render: (input) => <CacheStatsSidebar sessionID={input.sessionID} live={live} />,
      });
    }
    let previousSession: string | undefined;
    createEffect(() => {
      const route = context.ui.router.current();
      const sessionID = route.type === "session" ? route.sessionID : undefined;
      if (previousSession !== sessionID) controller.cancel();
      previousSession = sessionID;
    });
    return () => { controller.dispose(); live.dispose(); };
  },
});

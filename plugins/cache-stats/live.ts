import type { OpenCodeEvent } from "@opencode/client";
import type { Plugin } from "@opencode/plugin/tui";
import { collect, type Collected, type CollectionClient } from "./collect.ts";

export type LiveState = {
  stats?: Collected;
  loading: boolean;
  stale: boolean;
};

type Listener = (state: LiveState) => void;
type Entry = {
  sessionID: string;
  state: LiveState;
  listeners: Set<Listener>;
  abort?: AbortController;
  task?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  poll?: ReturnType<typeof setInterval>;
  dirty: boolean;
  active: boolean;
};

// Refresh at step boundaries, not for every streamed text/tool delta.
export function affectedSessions(event: OpenCodeEvent): string[] | undefined {
  switch (event.type) {
    case "server.connected": return [];
    case "session.created": return [event.data.sessionID, ...(event.data.parentID ? [event.data.parentID] : [])];
    case "session.step.ended":
    case "session.step.failed":
    case "session.compaction.ended":
    case "session.compaction.failed":
    case "session.usage.updated":
    case "session.renamed":
    case "session.deleted":
    case "session.revert.committed":
      return [event.data.sessionID];
    default: return undefined;
  }
}

export function createLiveStats(
  client: CollectionClient,
  data: Pick<Plugin.Context["data"], "listen">,
  options: { debounceMs?: number; pollMs?: number } = {},
) {
  const entries = new Map<string, Entry>();
  const delay = options.debounceMs ?? 750;
  const pollMs = options.pollMs ?? 30_000;
  let disposed = false;
  const emit = (entry: Entry) => entry.listeners.forEach((listener) => listener(entry.state));

  const schedule = (entry: Entry) => {
    if (!entry.active) return;
    if (entry.task) { entry.dirty = true; return; }
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      void refresh(entry);
    }, delay);
  };

  const refresh = (entry: Entry): Promise<void> => {
    if (!entry.active) return Promise.resolve();
    if (entry.task) return entry.task;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    entry.dirty = false;
    const abort = new AbortController();
    entry.abort = abort;
    entry.state = { ...entry.state, loading: true };
    emit(entry);
    entry.task = (async () => {
      try {
        const stats = await collect(client, entry.sessionID, abort.signal);
        if (!entry.active || abort.signal.aborted) return;
        entry.state = { stats, loading: false, stale: false };
      } catch {
        if (!entry.active || abort.signal.aborted) return;
        // Preserve a visibly stale snapshot rather than zeroing or hiding failure.
        entry.state = { ...entry.state, loading: false, stale: true };
      } finally {
        entry.task = undefined;
        entry.abort = undefined;
        if (entry.active) {
          emit(entry);
          if (entry.dirty) schedule(entry);
        }
      }
    })();
    return entry.task;
  };

  const stopEntry = (entry: Entry) => {
    entry.active = false;
    entry.abort?.abort();
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.poll) clearInterval(entry.poll);
    entries.delete(entry.sessionID);
  };

  const stopEvents = data.listen(({ details }) => {
    const affected = affectedSessions(details);
    if (!affected) return;
    for (const entry of entries.values()) {
      const family = entry.state.stats?.sessionIDs ?? [entry.sessionID];
      if (affected.length === 0 || affected.some((id) => family.includes(id))) schedule(entry);
    }
  });

  return {
    watch(sessionID: string, listener: Listener, initial?: Collected): () => void {
      if (disposed) return () => {};
      let entry = entries.get(sessionID);
      if (!entry) {
        entry = { sessionID, state: { stats: initial, loading: false, stale: false }, listeners: new Set(), dirty: false, active: true };
        entries.set(sessionID, entry);
        if (pollMs > 0) entry.poll = setInterval(() => { void refresh(entry!); }, pollMs);
      } else if (initial && (!entry.state.stats || initial.updatedAt >= entry.state.stats.updatedAt)) {
        entry.state = { stats: initial, loading: !!entry.task, stale: false };
        emit(entry);
      }
      entry.listeners.add(listener);
      listener(entry.state);
      if (!entry.state.stats && !entry.task) void refresh(entry);
      const watched = entry;
      let watching = true;
      return () => {
        if (!watching) return;
        watching = false;
        watched.listeners.delete(listener);
        if (watched.listeners.size === 0) stopEntry(watched);
      };
    },
    refresh(sessionID: string): Promise<void> {
      const entry = entries.get(sessionID);
      return entry ? refresh(entry) : Promise.resolve();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopEvents();
      for (const entry of entries.values()) stopEntry(entry);
    },
  };
}

export type LiveStats = ReturnType<typeof createLiveStats>;

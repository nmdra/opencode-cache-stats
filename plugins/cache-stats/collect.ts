import type { OpenCodeClient, SessionInfo } from "@opencode/client";
import { dominantModel, hitPct, mergeAcc, mergeModels, mergeUsage, sanitize, summarize, tokenTotal, type UsageSummary } from "./stats.ts";

export type CollectionClient = {
  session: Pick<OpenCodeClient["session"], "get" | "list">;
  message: Pick<OpenCodeClient["message"], "list">;
};

export type Sub = {
  id: string;
  name: string;
  hit: number;
  reqs: number;
  reqsWithCacheRead: number;
  tokens: number;
  cost: number;
  model?: string;
};

export type Scope = "all" | "main" | "subagents";

export type ScopeStats = UsageSummary & {
  subagents: number;
  subs: Sub[];
};

export type Collected = ScopeStats & {
  sessionID: string;
  sessionIDs: string[];
  title: string;
  updatedAt: number;
  scopes: { main: ScopeStats; subagents: ScopeStats };
};

export function selectScope(stats: Collected, scope: Scope): ScopeStats {
  return scope === "all" ? stats : stats.scopes[scope];
}

type Page<T> = {
  data: T[];
  cursor: { next?: string | null };
};

const PAGE_SIZE = 100;
const SESSION_CONCURRENCY = 4;

async function allPages<T>(
  read: (cursor?: string) => Promise<Page<T>>,
  signal: AbortSignal,
): Promise<T[]> {
  const result: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    signal.throwIfAborted();
    const page = await read(cursor);
    signal.throwIfAborted();
    result.push(...page.data);
    cursor = page.cursor.next ?? undefined;
    if (cursor && seenCursors.has(cursor)) {
      throw new Error("The server repeated a pagination cursor.");
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return result;
}

async function mapSessions<T, R>(
  items: T[],
  read: (item: T) => Promise<R>,
  signal: AbortSignal,
): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(SESSION_CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      signal.throwIfAborted();
      const current = index++;
      result[current] = await read(items[current]);
    }
  }));
  return result;
}

export async function collect(
  client: CollectionClient,
  sessionID: string,
  signal: AbortSignal,
): Promise<Collected> {
  // A failure cancels sibling reads; no incomplete API/cache mix is presented as totals.
  const failed = new AbortController();
  const requestSignal = AbortSignal.any([signal, failed.signal]);
  const options = { signal: requestSignal };
  try {
    requestSignal.throwIfAborted();
    const root = await client.session.get({ sessionID }, options);
    const seen = new Set([sessionID]);
    let main = summarize([]);
    const descendants = summarize([]);
    const tree: { info: SessionInfo; children: string[]; stats: ReturnType<typeof summarize> }[] = [];
    let pending = [root];
    while (pending.length) {
      const batch = await mapSessions(pending, async (info) => {
        const [messages, children] = await Promise.all([
          // The released 2.1.4 client exposes the timeline as client.message.list.
          (async () => {
            const groups = [];
            // Filter each timeline to avoid fetching prompts and tool outputs.
            // Sequential types keep the global list-request limit at eight.
            for (const type of ["assistant", "compaction"] as const) {
              groups.push(await allPages((cursor) => client.message.list({
                sessionID: info.id, limit: PAGE_SIZE, type,
                ...(cursor ? { cursor } : { order: "asc" as const }),
              }, options), requestSignal));
            }
            return groups.flat();
          })(),
          allPages((cursor) => client.session.list({
            limit: PAGE_SIZE,
            ...(cursor ? { cursor } : { parentID: info.id, order: "asc" as const }),
          }, options), requestSignal),
        ]);
        return { info, messages, children };
      }, requestSignal);
      pending = [];
      for (const { info, messages, children } of batch) {
        const childIDs: string[] = [];
        for (const child of children) {
          if (seen.has(child.id)) continue;
          seen.add(child.id);
          childIDs.push(child.id);
          pending.push(child);
        }
        const stats = summarize(messages, info.id);
        if (info.id === sessionID) main = stats;
        else mergeUsage(descendants, stats);
        tree.push({ info, children: childIDs, stats });
      }
    }
    requestSignal.throwIfAborted();

    type SessionTotal = Pick<ScopeStats, "acc" | "perModel" | "subagents">;
    const totals = new Map<string, SessionTotal>();
    const subs: Sub[] = [];
    // Breadth-first discovery followed by reverse accumulation avoids recursive stack growth.
    for (const { info, children, stats } of tree.reverse()) {
      const value: SessionTotal = { acc: { ...stats.acc }, perModel: new Map(), subagents: 0 };
      mergeModels(value.perModel, stats.perModel);
      for (const childID of children) {
        const child = totals.get(childID)!;
        value.subagents += 1 + child.subagents;
        mergeAcc(value.acc, child.acc);
        mergeModels(value.perModel, child.perModel);
      }
      // Record subtree totals so a subagent row includes its own descendants.
      if (info.id !== sessionID) {
        subs.push({
          id: info.id,
          name: sanitize(info.agent || info.title || info.id),
          hit: hitPct(value.acc),
          reqs: value.acc.reqs,
          reqsWithCacheRead: value.acc.reqsWithCacheRead,
          tokens: tokenTotal(value.acc),
          cost: value.acc.cost,
          model: dominantModel(value.perModel),
        });
      }
      totals.set(info.id, value);
    }
    const all = summarize([]);
    mergeUsage(all, main);
    mergeUsage(all, descendants);
    const subagents = totals.get(sessionID)!.subagents;
    return {
      ...all, sessionID, sessionIDs: [...seen], title: sanitize(root.title || "session"),
      updatedAt: Date.now(), subagents, subs,
      scopes: {
        main: { ...main, subagents: 0, subs: [] },
        subagents: { ...descendants, subagents, subs },
      },
    };
  } catch (error) {
    failed.abort();
    throw error;
  }
}

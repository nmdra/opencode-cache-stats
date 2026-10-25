import type { OpenCodeClient, SessionInfo } from "@opencode/client";
import { dominantModel, hitPct, mergeAcc, mergeModels, sanitize, summarize, tokenTotal, type Acc } from "./stats.ts";

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

export type Collected = {
  title: string;
  acc: Acc;
  subagents: number;
  perModel: Map<string, Acc>;
  subs: Sub[];
};

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
    const tree: { info: SessionInfo; children: string[]; stats: ReturnType<typeof summarize> }[] = [];
    let pending = [root];
    while (pending.length) {
      const batch = await mapSessions(pending, async (info) => {
        const [messages, children] = await Promise.all([
          // The released 2.1.4 client exposes the timeline as client.message.list.
          allPages((cursor) => client.message.list({
            sessionID: info.id, limit: PAGE_SIZE, type: "assistant",
            ...(cursor ? { cursor } : { order: "asc" as const }),
          }, options), requestSignal),
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
        tree.push({ info, children: childIDs, stats: summarize(messages) });
      }
    }
    requestSignal.throwIfAborted();

    const totals = new Map<string, Omit<Collected, "subs">>();
    const subs: Sub[] = [];
    // Breadth-first discovery followed by reverse accumulation avoids recursive stack growth.
    for (const { info, children, stats } of tree.reverse()) {
      const value: Omit<Collected, "subs"> = {
        ...stats, title: sanitize(info.title || "session"), subagents: 0,
      };
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
    return { ...totals.get(sessionID)!, subs };
  } catch (error) {
    failed.abort();
    throw error;
  }
}

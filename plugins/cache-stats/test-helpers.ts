import type { SessionInfo, SessionMessageAssistant, TokenUsageInfo } from "@opencode/client";
import type { CollectionClient } from "./collect.ts";

export function tokens(overrides: Partial<TokenUsageInfo> = {}): TokenUsageInfo {
  return { input: 10, output: 3, reasoning: 2, cache: { read: 90, write: 5 }, ...overrides };
}

export function assistant(id: string, overrides: Partial<SessionMessageAssistant> = {}): SessionMessageAssistant {
  return {
    id, type: "assistant", agent: "build", model: { providerID: "acme", id: "model-a" },
    time: { created: 1, completed: 2 }, content: [], tokens: tokens(), cost: 0.25,
    ...overrides,
  };
}

export function session(id: string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id, projectID: "project", title: id, agent: "build", cost: 0,
    tokens: tokens({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
    time: { created: 1, updated: 2 }, location: { directory: "/project" },
    ...overrides,
  };
}

export function client(overrides: {
  get?: CollectionClient["session"]["get"];
  list?: CollectionClient["session"]["list"];
  messages?: CollectionClient["message"]["list"];
} = {}): CollectionClient {
  return {
    session: {
      get: overrides.get ?? (async ({ sessionID }) => session(sessionID)),
      list: overrides.list ?? (async () => ({ data: [], cursor: {} })),
    },
    message: {
      list: overrides.messages ?? (async () => ({ data: [assistant("msg_one")], cursor: {} })),
    },
  };
}

import type {
  SessionInfo,
  SessionMessageAssistant,
  SessionMessageUser,
  TokenUsageInfo,
} from "@opencode/client";
import {
  migrateV1,
  resolveThemeDocument,
  type ResolvedTheme,
} from "@opencode/theme/tui";
import type { ThemeV1Json } from "@opencode/theme/tui/v1";
import type {
  AssistantMessage as V1AssistantMessage,
  Message as V1Message,
  Part as V1Part,
  Session as V1Session,
  StepFinishPart as V1StepFinishPart,
  TextPart as V1TextPart,
  UserMessage as V1UserMessage,
} from "@opencode-ai/sdk/v2";
import { RGBA } from "@opentui/core";

// Fixtures mirror the opencode v2.1.0 message, session and theme shapes.

export function usage(
  input: number,
  output: number,
  reasoning: number,
  read: number,
  write: number,
): TokenUsageInfo {
  return { input, output, reasoning, cache: { read, write } };
}

let seq = 0;

export function nextSeq(): number {
  return ++seq;
}

export function assistant(
  model: string,
  tokens: TokenUsageInfo,
  cost: number,
): SessionMessageAssistant {
  const [providerID, id] = model.split("/");
  const n = nextSeq();
  return {
    id: `msg_a${n}`,
    time: { created: n, completed: n },
    type: "assistant",
    agent: "build",
    model: { id, providerID },
    content: [{ type: "text", text: "ok" }],
    finish: "stop",
    cost,
    tokens,
  };
}

export function user(): SessionMessageUser {
  const n = nextSeq();
  return { id: `msg_u${n}`, time: { created: n }, text: "hi", type: "user" };
}

export function session(
  id: string,
  extra: { parentID?: string; agent?: string; title?: string } = {},
): SessionInfo {
  return {
    id,
    projectID: "prj_1",
    cost: 0,
    tokens: usage(0, 0, 0, 0, 0),
    time: { created: 1, updated: 1 },
    location: { directory: "/tmp/project" },
    ...extra,
  };
}

// A dark v1 theme resolved through opencode's own v1 migration, so tests
// render with the same token structure the v2 TUI hands to plugins.
export function theme(): ResolvedTheme {
  const accents = {
    primary: "#fab283",
    secondary: "#5c9cf5",
    accent: "#9d7cd8",
    error: "#e06c75",
    warning: "#f5a742",
    success: "#7fd88f",
    info: "#56b6c2",
    text: "#eeeeee",
    textMuted: "#808080",
    background: "#0a0a0a",
    backgroundPanel: "#141414",
    backgroundElement: "#1e1e1e",
    border: "#484848",
    borderActive: "#606060",
    borderSubtle: "#3c3c3c",
    syntaxNumber: "#f5a742",
  };
  const rest = [
    "diffAdded", "diffRemoved", "diffContext", "diffHunkHeader",
    "diffHighlightAdded", "diffHighlightRemoved", "diffAddedBg",
    "diffRemovedBg", "diffContextBg", "diffLineNumber",
    "diffAddedLineNumberBg", "diffRemovedLineNumberBg", "markdownText",
    "markdownHeading", "markdownLink", "markdownLinkText", "markdownCode",
    "markdownBlockQuote", "markdownEmph", "markdownStrong",
    "markdownHorizontalRule", "markdownListItem", "markdownListEnumeration",
    "markdownImage", "markdownImageText", "markdownCodeBlock",
    "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable",
    "syntaxString", "syntaxType", "syntaxOperator", "syntaxPunctuation",
  ];
  const doc = migrateV1({
    theme: {
      ...Object.fromEntries(rest.map((key) => [key, "#808080"])),
      ...accents,
    },
  } as ThemeV1Json);
  return resolveThemeDocument(doc, "dark");
}

// opencode v1 shapes (@opencode-ai/sdk/v2, used by the v1 TUI API).

export type V1Entry = { info: V1Message; parts: V1Part[] };

export function v1Assistant(
  sessionID: string,
  model: string,
  totals: TokenUsageInfo,
  cost: number,
  steps: { tokens: TokenUsageInfo; cost: number }[] = [],
): V1Entry {
  const [providerID, modelID] = model.split("/");
  const n = nextSeq();
  const id = `msg_a${n}`;
  const info: V1AssistantMessage = {
    id,
    sessionID,
    role: "assistant",
    time: { created: n, completed: n },
    parentID: `msg_u${n}`,
    modelID,
    providerID,
    mode: "build",
    agent: "build",
    path: { cwd: "/tmp/project", root: "/tmp/project" },
    cost,
    tokens: totals,
    finish: "stop",
  };
  const text: V1TextPart = {
    id: `prt_t${n}`,
    sessionID,
    messageID: id,
    type: "text",
    text: "ok",
  };
  const finished = steps.map(
    (step, i): V1StepFinishPart => ({
      id: `prt_s${n}_${i}`,
      sessionID,
      messageID: id,
      type: "step-finish",
      reason: "stop",
      cost: step.cost,
      tokens: step.tokens,
    }),
  );
  return { info, parts: [text, ...finished] };
}

export function v1User(sessionID: string): V1Entry {
  const n = nextSeq();
  const info: V1UserMessage = {
    id: `msg_u${n}`,
    sessionID,
    role: "user",
    time: { created: n },
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-sonnet" },
  };
  return { info, parts: [] };
}

export function v1Session(
  id: string,
  extra: { parentID?: string; agent?: string; title?: string } = {},
): V1Session {
  return {
    id,
    slug: id,
    projectID: "prj_1",
    directory: "/tmp/project",
    title: "New session",
    version: "1.19.3",
    time: { created: 1, updated: 1 },
    ...extra,
  };
}

// The color names of a v1 theme (api.theme.current) that the dialog uses.
export function v1Theme() {
  const hex = {
    primary: "#fab283",
    secondary: "#5c9cf5",
    accent: "#9d7cd8",
    error: "#e06c75",
    warning: "#f5a742",
    success: "#7fd88f",
    info: "#56b6c2",
    text: "#eeeeee",
    textMuted: "#808080",
    borderSubtle: "#3c3c3c",
    syntaxNumber: "#f5a742",
  };
  return Object.fromEntries(
    Object.entries(hex).map(([key, value]) => [key, RGBA.fromHex(value)]),
  ) as Record<keyof typeof hex, RGBA>;
}

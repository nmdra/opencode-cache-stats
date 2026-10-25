import assert from "node:assert/strict";
import { test } from "node:test";
import { collect } from "./collect.ts";
import { buildReport, copyReport, markdownReport } from "./report.ts";
import { assistant, client, compaction, session } from "./test-helpers.ts";

async function fixture() {
  return collect(client({
    get: async ({ sessionID }) => session(sessionID, { title: "title | <unsafe> `quoted`" }),
    list: async (input) => ({ data: input?.parentID === "root" ? [session("child")] : [], cursor: {} }),
    messages: async ({ sessionID, type }) => ({ data: type === "compaction" ? [compaction(`msg_comp_${sessionID}`)] : [assistant(`msg_${sessionID}`, {
      content: [{ type: "text", text: "PRIVATE MESSAGE BODY" }],
    })], cursor: {} }),
  }), "root", new AbortController().signal);
}

test("exports selected-scope plain JSON with models, trends, and separate compaction", async () => {
  const stats = await fixture();
  const result = buildReport(stats, "main", true);
  assert.equal(result.assistant.reqs, 1);
  assert.equal(result.compaction.reqs, 1);
  assert.equal(result.models[0].reqs, 1);
  assert.equal(result.recent[0].sessionID, "root");
  assert.equal(result.recordedCost, 0.75);
  assert.equal(result.stale, true);
  assert.equal(result.subagents.length, 0);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
  assert.ok(!JSON.stringify(result).includes("PRIVATE MESSAGE BODY"));
  assert.ok(!JSON.stringify(result).includes("private summary"));
});

test("escapes Markdown metadata and identifies stale snapshots and overlapping subagents", async () => {
  const stats = await fixture();
  const text = markdownReport(stats, "all", true);
  assert.ok(text.includes("title \\| &lt;unsafe&gt; \\`quoted\\`"));
  assert.ok(text.includes("STALE: refresh failed"));
  assert.ok(text.includes("rows may overlap"));
  assert.ok(text.includes("| Recorded steps | 2 | 2 |"));
  assert.ok(!text.includes("PRIVATE MESSAGE BODY"));
});

test("represents undefined rates as JSON null and Markdown n/a", async () => {
  const stats = await collect(client({ messages: async () => ({ data: [], cursor: {} }) }), "root", new AbortController().signal);
  assert.equal(buildReport(stats, "all").assistant.hitPercent, null);
  assert.ok(markdownReport(stats, "all").includes("| Cache hit | n/a | n/a |"));
});

test("reports clipboard dispatch accurately and handles unsupported or throwing terminals", async () => {
  const stats = await fixture();
  let text = "", variant = "";
  const context = {
    renderer: { copyToClipboardOSC52: (value: string) => { text = value; return true; } },
    ui: { toast: { show: (options: { variant?: string }) => { variant = options.variant ?? ""; } } },
  };
  assert.equal(copyReport(context, stats, "subagents", "json"), true);
  assert.equal(JSON.parse(text).scope, "subagents");
  assert.equal(variant, "success");
  context.renderer.copyToClipboardOSC52 = () => false;
  assert.equal(copyReport(context, stats, "all", "markdown"), false);
  assert.equal(variant, "error");
  context.renderer.copyToClipboardOSC52 = () => { throw new Error("inactive terminal"); };
  assert.equal(copyReport(context, stats, "all", "json"), false);
});

test("rejects oversized reports before writing to the terminal clipboard", async () => {
  const stats = await fixture();
  stats.title = "x".repeat(256 * 1024);
  let copied = false;
  const context = {
    renderer: { copyToClipboardOSC52: () => { copied = true; return true; } },
    ui: { toast: { show() {} } },
  };
  assert.equal(copyReport(context, stats, "all", "json"), false);
  assert.equal(copied, false);
});

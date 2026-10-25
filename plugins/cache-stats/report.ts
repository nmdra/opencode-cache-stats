import type { Plugin } from "@opencode/plugin/tui";
import { selectScope, type Collected, type Scope } from "./collect.ts";
import { hitPct, sanitize, tokenTotal, type Acc } from "./stats.ts";

function usage(acc: Acc) {
  return { ...acc, totalTokens: tokenTotal(acc), hitPercent: hitPct(acc) < 0 ? null : hitPct(acc) };
}

export function buildReport(stats: Collected, scope: Scope, stale = false) {
  const selected = selectScope(stats, scope);
  return {
    version: 1,
    session: { id: stats.sessionID, title: stats.title },
    scope,
    capturedAt: new Date(stats.updatedAt).toISOString(),
    stale,
    currency: "USD",
    assistant: usage(selected.acc),
    compaction: usage(selected.compaction),
    recordedCost: selected.acc.cost + selected.compaction.cost,
    models: [...selected.perModel].sort(([a], [b]) => a.localeCompare(b)).map(([model, acc]) => ({ model, ...usage(acc) })),
    recent: selected.recent.map(({ id, sessionID, at, model, usage: acc }) => ({ id, sessionID, at, model, ...usage(acc) })),
    subagents: selected.subs.map((sub) => ({ ...sub, hit: sub.hit < 0 ? null : sub.hit })),
  };
}

function cell(value: string): string {
  return sanitize(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\\|`*_\[\]]/g, "\\$&");
}

function pct(value: number | null): string { return value === null ? "n/a" : `${value.toFixed(1)}%`; }

export function markdownReport(stats: Collected, scope: Scope, stale = false): string {
  const report = buildReport(stats, scope, stale);
  const acc = report.assistant;
  const compaction = report.compaction;
  return [
    "# Cache stats", "",
    `Session: ${cell(report.session.title)} (${cell(report.session.id)})`,
    `Scope: ${scope} · Captured: ${report.capturedAt}${stale ? " · STALE: refresh failed" : ""}`, "",
    "| Metric | Assistant | Compaction |", "| --- | ---: | ---: |",
    `| Recorded steps | ${acc.reqs} | ${compaction.reqs} |`,
    `| Steps without usage | ${acc.count - acc.reqs} | ${compaction.count - compaction.reqs} |`,
    `| Cache hit | ${pct(acc.hitPercent)} | ${pct(compaction.hitPercent)} |`,
    `| Fresh input | ${acc.input} | ${compaction.input} |`,
    `| Cache read | ${acc.cacheRead} | ${compaction.cacheRead} |`,
    `| Cache write | ${acc.cacheWrite} | ${compaction.cacheWrite} |`,
    `| Output | ${acc.output} | ${compaction.output} |`,
    `| Reasoning | ${acc.reasoning} | ${compaction.reasoning} |`,
    `| Total tokens | ${acc.totalTokens} | ${compaction.totalTokens} |`,
    `| Recorded cost (USD) | $${acc.cost.toFixed(5)} | $${compaction.cost.toFixed(5)} |`, "",
    "## Assistant models", "", "| Model | Requests | Cache hit | Tokens | USD |", "| --- | ---: | ---: | ---: | ---: |",
    ...report.models.map((model) => `| ${cell(model.model)} | ${model.reqs} | ${pct(model.hitPercent)} | ${model.totalTokens} | ${model.cost.toFixed(5)} |`), "",
    "## Recent assistant requests (oldest → newest)", "", "| Model | Cache hit | Tokens |", "| --- | ---: | ---: |",
    ...report.recent.map((sample) => `| ${cell(sample.model)} | ${pct(sample.hitPercent)} | ${sample.totalTokens} |`), "",
    "## Subagents (subtree totals; rows may overlap)", "", "| Agent | Session | Requests | Cache hit | Tokens | USD |", "| --- | --- | ---: | ---: | ---: | ---: |",
    ...report.subagents.map((sub) => `| ${cell(sub.name)} | ${cell(sub.id)} | ${sub.reqs} | ${pct(sub.hit)} | ${sub.tokens} | ${sub.cost.toFixed(5)} |`), "",
    "Requests count recorded assistant steps, not retry attempts. Compaction is separate. Title and other auxiliary calls are excluded.",
  ].join("\n");
}

export function copyReport(
  context: { renderer: Pick<Plugin.Context["renderer"], "copyToClipboardOSC52">; ui: Pick<Plugin.Context["ui"], "toast"> },
  stats: Collected, scope: Scope, format: "markdown" | "json", stale = false,
): boolean {
  try {
    const text = format === "json" ? JSON.stringify(buildReport(stats, scope, stale), null, 2) : markdownReport(stats, scope, stale);
    if (new TextEncoder().encode(text).length > 256 * 1024) throw new Error("Report too large");
    if (!context.renderer.copyToClipboardOSC52(text)) throw new Error("Clipboard unavailable");
    context.ui.toast.show({ title: "Cache stats", message: `${format === "json" ? "JSON" : "Markdown"} report sent to terminal clipboard.`, variant: "success" });
    return true;
  } catch {
    context.ui.toast.show({ title: "Cache stats", message: "Could not copy report. Enable OSC 52 clipboard support; very large reports may exceed the copy limit.", variant: "error" });
    return false;
  }
}

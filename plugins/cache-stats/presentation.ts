import { hitPct, mergeAcc, newAcc, RECENT_LIMIT, type RequestSample } from "./stats.ts";

export const VIEWS = ["summary", "models", "usage", "agents"] as const;
export type StatsView = typeof VIEWS[number] | "help";

export function nextView(view: StatsView, direction = 1): StatsView {
  const index = VIEWS.findIndex((item) => item === view);
  if (index < 0) return direction < 0 ? VIEWS[VIEWS.length - 1] : VIEWS[0];
  return VIEWS[(index + direction + VIEWS.length) % VIEWS.length];
}

export function dialogLayout(columns: number, rows: number) {
  const width = Math.max(0, Math.min(60, Math.floor(columns) - 2) - 2);
  return {
    width,
    bodyWidth: Math.max(0, width - 2),
    bodyHeight: Math.max(1, Math.min(12, Math.floor(rows) - 11)),
    compact: width < 38,
    twoColumns: width >= 40,
    supported: columns >= 28 && rows >= 12,
  };
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value > 0 && value < 1) return value < 0.01 ? "<0.01" : value.toFixed(2);
  const rounded = Math.round(value);
  if (rounded >= 999_950) return `${(rounded / 1e6).toFixed(2)}M`;
  if (rounded >= 1_000) return `${(rounded / 1e3).toFixed(1)}K`;
  return String(rounded);
}

export function formatCost(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return "$0.00";
  if (value < 0.00001) return "<$0.00001";
  if (value < 0.01) return `$${value.toFixed(5)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatHit(value: number): string {
  return value < 0 ? "n/a" : `${value.toFixed(1)}%`;
}

export function hitLevel(hit: number) {
  if (hit < 0) return { color: "muted", word: "No rate" } as const;
  if (hit >= 90) return { color: "success", word: "Excellent" } as const;
  if (hit >= 70) return { color: "info", word: "Good" } as const;
  if (hit >= 40) return { color: "warning", word: "Fair" } as const;
  return { color: "error", word: "Poor" } as const;
}

export function progressBar(hit: number, width = 12) {
  const size = Math.max(0, Math.floor(width));
  if (!Number.isFinite(hit) || hit < 0) {
    return { filled: "", partial: "", empty: "·".repeat(size), unknown: true };
  }
  const rate = Math.min(100, hit);
  // Eighth-cell precision keeps small misses visible without coloring an entire
  // cell red. The partial green glyph is rendered on a red miss background.
  const maximum = size * 8;
  let units = Math.round(rate * maximum / 100);
  if (rate > 0 && rate < 100 && maximum > 0) units = Math.max(1, Math.min(maximum - 1, units));
  const full = Math.floor(units / 8);
  const fraction = units % 8;
  return {
    filled: "█".repeat(full),
    partial: fraction ? "▏▎▍▌▋▊▉"[fraction - 1] : "",
    empty: "█".repeat(size - full - (fraction ? 1 : 0)),
    unknown: false,
  };
}

export function recentWindow(samples: readonly RequestSample[], width: number) {
  // A blank cell between glyphs prevents a high-hit trend becoming a solid slab.
  const count = Math.max(1, Math.min(RECENT_LIMIT, Math.floor((width + 1) / 2)));
  const visible = samples.slice(-count);
  const acc = newAcc();
  for (const sample of visible) mergeAcc(acc, sample.usage);
  return { samples: visible, hit: hitPct(acc) };
}

export function trendGlyph(hit: number): string {
  return hit < 0 ? "·" : "▁▂▃▄▅▆▇█"[Math.min(7, Math.max(0, Math.floor(hit * 8 / 100)))];
}

export function scrollLabel(top: number, height: number, total: number): string {
  const viewport = Math.max(0, Math.floor(height));
  const rows = Math.max(0, Math.ceil(total));
  if (viewport === 0 || rows <= viewport) return "";
  const start = Math.max(0, Math.min(Math.floor(top), rows - viewport));
  return `↑↓ ${start + 1}–${Math.min(rows, start + viewport)}/${rows}`;
}

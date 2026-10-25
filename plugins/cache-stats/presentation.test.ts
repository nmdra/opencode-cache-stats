import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dialogLayout, formatCost, formatHit, formatNumber, hitLevel,
  nextView, progressBar, recentWindow, scrollLabel, trendGlyph,
} from "./presentation.ts";
import { summarize } from "./stats.ts";
import { assistant, tokens } from "./test-helpers.ts";

test("uses a compact dialog instead of scaling the layout with a wide terminal", () => {
  assert.equal(dialogLayout(200, 60).width, 58);
  assert.equal(dialogLayout(200, 60).bodyHeight, 12);
  assert.equal(dialogLayout(80, 24).bodyHeight, 12);
});

test("reserves space for fixed headers and footer at short terminal heights", () => {
  for (const rows of [12, 14, 18, 20, 24, 40]) {
    const layout = dialogLayout(60, rows);
    const chrome = 9;
    assert.ok(layout.bodyHeight + chrome <= rows - 2, `overflow at ${rows} rows`);
    assert.ok(layout.bodyHeight >= 1);
  }
});

test("adapts narrow layouts and explicitly rejects unusably small terminals", () => {
  const layout = dialogLayout(32, 18);
  assert.equal(layout.width, 28);
  assert.equal(layout.bodyWidth, 26);
  assert.equal(layout.compact, true);
  assert.equal(layout.twoColumns, false);
  assert.equal(layout.supported, true);
  assert.equal(dialogLayout(80, 24).twoColumns, true);
  assert.equal(dialogLayout(27, 24).supported, false);
  assert.equal(dialogLayout(80, 11).supported, false);
});

test("formats recorded costs without approximation markers or hiding tiny nonzero values", () => {
  assert.equal(formatCost(0), "$0.00");
  assert.equal(formatCost(0.0000001), "<$0.00001");
  assert.equal(formatCost(0.00003), "$0.00003");
  assert.equal(formatCost(0.025), "$0.0250");
  assert.equal(formatCost(1234.567), "$1,234.57");
  assert.equal(formatCost(NaN), "—");
});

test("keeps abbreviated numbers stable at unit boundaries and small averages visible", () => {
  assert.equal(formatNumber(999_999), "1.00M");
  assert.equal(formatNumber(1234), "1.2K");
  assert.equal(formatNumber(0.5), "0.50");
  assert.equal(formatNumber(0.001), "<0.01");
  assert.equal(formatNumber(0), "0");
  assert.equal(formatHit(-1), "n/a");
});

test("splits progress into hit and miss segments with neutral unknown usage", () => {
  assert.deepEqual(progressBar(100, 6), { filled: "██████", partial: "", empty: "", unknown: false });
  assert.deepEqual(progressBar(50, 6), { filled: "███", partial: "", empty: "███", unknown: false });
  assert.deepEqual(progressBar(0, 6), { filled: "", partial: "", empty: "██████", unknown: false });
  assert.deepEqual(progressBar(-1, 6), { filled: "", partial: "", empty: "······", unknown: true });
  assert.equal(progressBar(NaN, 6).unknown, true);
  assert.equal(progressBar(200, 6).filled.length, 6);
  assert.equal(trendGlyph(-1), "·");
  assert.equal(trendGlyph(100), "█");
});

test("keeps small hit and miss fractions visible without changing total bar width", () => {
  const almostFull = progressBar(98.7, 12);
  assert.equal(almostFull.filled.length, 11);
  assert.equal(almostFull.partial, "▉");
  assert.equal(almostFull.empty, "");
  for (const rate of [0, 0.01, 1.3, 25, 50, 98.7, 99.99, 100]) {
    const bar = progressBar(rate, 12);
    assert.equal(bar.filled.length + bar.partial.length + bar.empty.length, 12);
    if (rate > 0 && rate < 100) assert.notEqual(bar.partial || bar.empty, "");
  }
  assert.deepEqual(progressBar(98.7, 0), { filled: "", partial: "", empty: "", unknown: false });
});

test("spaces trend samples to fit the viewport and weights only visible samples", () => {
  const messages = Array.from({ length: 30 }, (_, i) => assistant(`msg_${i}`, {
    time: { created: i },
    tokens: tokens({ input: 1, cache: { read: i, write: 0 } }),
  }));
  const samples = summarize(messages).recent;
  const narrow = recentWindow(samples, 11);
  assert.equal(narrow.samples.length, 6);
  assert.equal(narrow.samples[0].id, "msg_24");
  assert.ok(narrow.samples.length * 2 - 1 <= 11);
  assert.equal(recentWindow(samples, 56).samples.length, 25);
  assert.equal(recentWindow([], 56).hit, -1);
  const unequal = summarize([
    assistant("msg_miss", { tokens: tokens({ input: 1, cache: { read: 0, write: 0 } }) }),
    assistant("msg_hit", { tokens: tokens({ input: 0, cache: { read: 99, write: 0 } }) }),
  ]).recent;
  assert.equal(recentWindow(unequal, 20).hit, 99);
});

test("wraps view navigation predictably, including navigation out of help", () => {
  assert.equal(nextView("summary"), "models");
  assert.equal(nextView("agents"), "summary");
  assert.equal(nextView("summary", -1), "agents");
  assert.equal(nextView("help"), "summary");
  assert.equal(nextView("help", -1), "agents");
});

test("shows accurate scroll positions only when scrolling is needed", () => {
  assert.equal(scrollLabel(0, 12, 10), "");
  assert.equal(scrollLabel(0, 12, 42), "↑↓ 1–12/42");
  assert.equal(scrollLabel(5, 12, 42), "↑↓ 6–17/42");
  assert.equal(scrollLabel(100, 12, 42), "↑↓ 31–42/42");
  assert.equal(scrollLabel(0, 0, 42), "");
});

test("uses consistent hit levels", () => {
  assert.equal(hitLevel(90).word, "Excellent");
  assert.equal(hitLevel(70).word, "Good");
  assert.equal(hitLevel(40).word, "Fair");
  assert.equal(hitLevel(39).word, "Poor");
  assert.equal(hitLevel(-1).word, "No rate");
});

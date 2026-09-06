#!/usr/bin/env node
// Measures the real inter-call gap between dispatch tool calls (Task/Agent/Workflow)
// in one or more Claude Code transcripts, to fix the fan-out detection window the
// slicing design leaves open rather than guessing it.
//
// The question the window must answer: "were these two dispatch calls issued in the
// same turn (a deliberate fan-out) or in consecutive turns (sequential work)?"
// A PreToolUse hook has no turn-boundary field, so the only discriminator is elapsed
// time. This measures BOTH populations from real data:
//   - same-assistant-message pairs  -> a genuine fan-out
//   - different-message pairs       -> sequential dispatches
// A usable window exists only if the two populations are cleanly separated.
//
// Usage: node scratch/measure-fanout-window.mjs <transcript.jsonl> [...]

import { readFileSync } from "node:fs";

const DISPATCH_TOOLS = new Set(["Task", "Agent", "Workflow"]);

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scratch/measure-fanout-window.mjs <transcript.jsonl> [...]");
  process.exit(2);
}

/** @type {{ts:number, msgId:string, tool:string, file:string}[]} */
const calls = [];

for (const file of files) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    console.error(`skipped ${file}: ${error.message}`);
    continue;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const content = row?.message?.content;
    if (!Array.isArray(content)) continue;
    const ts = Date.parse(row.timestamp ?? "");
    if (Number.isNaN(ts)) continue;
    // The message id is what makes two calls "the same turn": parallel tool calls
    // are separate content blocks inside ONE assistant message.
    const msgId = row?.message?.id ?? row?.uuid ?? "";
    for (const block of content) {
      if (block?.type === "tool_use" && DISPATCH_TOOLS.has(block.name)) {
        calls.push({ ts, msgId, tool: block.name, file });
      }
    }
  }
}

calls.sort((a, b) => a.ts - b.ts);

if (calls.length < 2) {
  console.log(`dispatch calls found: ${calls.length} — too few to measure a window.`);
  process.exit(0);
}

const sameTurn = [];
const crossTurn = [];
for (let i = 1; i < calls.length; i += 1) {
  const gap = calls[i].ts - calls[i - 1].ts;
  if (calls[i].msgId && calls[i].msgId === calls[i - 1].msgId) sameTurn.push(gap);
  else crossTurn.push(gap);
}

const stat = (label, xs) => {
  if (xs.length === 0) return `${label}: none observed`;
  const sorted = [...xs].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return [
    `${label}: n=${xs.length}`,
    `  min    ${sorted[0]} ms`,
    `  median ${q(0.5)} ms`,
    `  p90    ${q(0.9)} ms`,
    `  max    ${sorted[sorted.length - 1]} ms`,
  ].join("\n");
};

console.log(`dispatch calls: ${calls.length} (${new Set(calls.map((c) => c.tool)).size} distinct tools)`);
console.log(stat("same-message pairs (a real fan-out)", sameTurn));
console.log(stat("cross-message pairs (sequential)", crossTurn));

if (sameTurn.length > 0 && crossTurn.length > 0) {
  const maxSame = Math.max(...sameTurn);
  const minCross = Math.min(...crossTurn);
  console.log(`\nseparation: max same-turn ${maxSame} ms vs min cross-turn ${minCross} ms`);
  console.log(
    minCross > maxSame
      ? `CLEAN — any window W with ${maxSame} < W < ${minCross} ms separates the two populations.`
      : "OVERLAP — no single timestamp window separates fan-out from sequential work here.",
  );
}

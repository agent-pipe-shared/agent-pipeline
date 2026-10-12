#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Repeatable C1 telemetry: classify a Claude JSONL main-thread transcript into
// wake-up replies, inline reads, guard refusals, authoring and other, with shares.
// Metric is a utf8-byte upper bound (not exact model tokens). Claude transcripts only.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const CATEGORIES = ["wakeUp", "inlineRead", "guardRefusal", "authoring", "other"];
export const ADMIN_CATEGORIES = ["wakeUp", "guardRefusal", "authoring"];
export const ADMIN_TARGET_SHARE = 0.1;

const READ_TOOLS = new Set(["Read", "Grep", "Glob", "NotebookRead", "WebFetch", "WebSearch"]);
const AUTHORING_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Agent", "Task"]);
const GIT_READ = /^\s*git\s+(status|log|diff|show|branch|rev-parse|ls-files|worktree|fetch)\b/;
const WAKE_MARKERS = [/<task-notification>/, /Stop hook feedback/i, /<goal[\s>]/i, /\[goal\]/i];

const bytes = (value) => Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value ?? ""), "utf8");

function blocksOf(message) {
  const content = message?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content : [];
}

function textOf(blocks) {
  return blocks.map((b) => (b.type === "text" ? b.text ?? "" : b.type === "tool_result" ? textOf(blocksOf({ content: b.content })) : "")).join("\n");
}

function classifyToolUse(block) {
  const name = block.name ?? "";
  if (READ_TOOLS.has(name)) return "inlineRead";
  if (AUTHORING_TOOLS.has(name)) return "authoring";
  if (name === "Bash") {
    const command = String(block.input?.command ?? "");
    if (GIT_READ.test(command) || /^\s*(cat|head|tail|ls|grep|rg|find|sed -n)\b/.test(command)) return "inlineRead";
  }
  return "other";
}

export function classifyTranscript(jsonlText) {
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const toolCategory = new Map();
  let pendingWake = false;
  let malformedLines = 0;
  const add = (category, size) => { totals[category] += size; counts[category] += 1; };

  for (const line of jsonlText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { malformedLines += 1; continue; }
    if (event?.isSidechain === true) continue;
    const role = event?.message?.role ?? event?.type;
    const blocks = blocksOf(event?.message);
    if (role === "user") {
      let wakeSeen = false;
      for (const block of blocks) {
        if (block.type === "tool_result") {
          const text = textOf([block]);
          const refused = block.is_error === true && /BLOCKED|GUARD-|refus/i.test(text);
          const category = refused ? "guardRefusal" : toolCategory.get(block.tool_use_id) ?? "other";
          add(category, bytes(block.content));
        } else {
          const text = textOf([block]);
          if (WAKE_MARKERS.some((re) => re.test(text))) wakeSeen = true;
          add(wakeSeen ? "wakeUp" : "other", bytes(text));
        }
      }
      pendingWake = wakeSeen;
    } else if (role === "assistant") {
      const toolUses = blocks.filter((b) => b.type === "tool_use");
      if (toolUses.length === 0) {
        add(pendingWake ? "wakeUp" : "other", bytes(blocks));
      } else {
        for (const block of toolUses) {
          const category = classifyToolUse(block);
          toolCategory.set(block.id, category);
          add(category, bytes(block));
        }
        const nonTool = blocks.filter((b) => b.type !== "tool_use");
        if (nonTool.length) add("other", bytes(nonTool));
      }
      pendingWake = false;
    }
  }

  const totalUnits = CATEGORIES.reduce((sum, c) => sum + totals[c], 0);
  const shares = Object.fromEntries(CATEGORIES.map((c) => [c, totalUnits === 0 ? 0 : totals[c] / totalUnits]));
  const adminShare = ADMIN_CATEGORIES.reduce((sum, c) => sum + shares[c], 0);
  return {
    schema: "pipeline.elephant-context-measurement.v1",
    metric: "utf8-byte-upper-bound",
    exactModelTokens: false,
    runner: "claude",
    totalUnits,
    units: totals,
    events: counts,
    shares,
    adminShare,
    adminTargetShare: ADMIN_TARGET_SHARE,
    withinAdminTarget: totalUnits > 0 && adminShare <= ADMIN_TARGET_SHARE,
    malformedLines,
  };
}

export function main(argv = process.argv) {
  const path = argv[2];
  if (!path) {
    process.stderr.write("usage: elephant-context-measure.mjs <claude-transcript.jsonl>\n");
    process.exitCode = 64;
    return null;
  }
  const result = classifyTranscript(readFileSync(resolve(path), "utf8"));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (isDirectInvocation(import.meta.url)) main();

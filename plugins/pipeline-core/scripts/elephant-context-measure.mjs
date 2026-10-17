#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Repeatable C1 telemetry: classify a Claude JSONL main-thread transcript into
// wake-up replies, inline reads, guard refusals, authoring and other, with shares,
// then attribute the same events to the five structural causes the backlog item
// pipeline.elephant-main-context-spent-on-wake-ups-and-inline-reads names
// (wake-up loops, delegation cost, refused Explore/Plan dispatch, guard refusals,
// hand-written briefings) and compare two measurements per cause.
// Metric is a utf8-byte upper bound (not exact model tokens). Claude transcripts only.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const CATEGORIES = ["wakeUp", "inlineRead", "guardRefusal", "authoring", "other"];
export const ADMIN_CATEGORIES = ["wakeUp", "guardRefusal", "authoring"];
export const ADMIN_TARGET_SHARE = 0.1;
// One key per cause in the item's Description. Causes are attribution views over the
// category totals, not a partition: their shares overlap and are never summed.
// `guardRefusals` counts every guard refusal. The transcript cannot tell a false positive from
// a true one (a true refusal is also followed by an admitted respelling), so the cause is named
// for what it counts and `retriedAdmitted*` is the false-positive CANDIDATE subset, not a verdict.
export const CAUSES = ["wakeUpLoops", "delegationCost", "exploreOrPlanRefused", "guardRefusals", "handWrittenBriefings"];

const READ_TOOLS = new Set(["Read", "Grep", "Glob", "NotebookRead", "WebFetch", "WebSearch"]);
const AUTHORING_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Agent", "Task"]);
const DELEGATION_TOOLS = new Set(["Agent", "Task"]);
const RECON_AGENT_TYPES = new Set(["explore", "plan"]);
const GIT_READ = /^\s*git\s+(status|log|diff|show|branch|rev-parse|ls-files|worktree|fetch)\b/;
const WAKE_MARKERS = [/<task-notification>/, /Stop hook feedback/i, /<goal[\s>]/i, /\[goal\]/i];
// The six field headings of templates/prompts/goldfish-task.md. A dispatch prompt that
// carries all six is template-shaped; the rest is an UPPER BOUND on hand-written
// briefings (it can still contain other non-Goldfish prompts that carry no template).
const TEMPLATE_FIELD_MARKERS = [
  /\b1\.\s*Goal\b/i,
  /\b2\.\s*Context files\b/i,
  /\b3\.\s*DoD checks\b/i,
  /\b4\.\s*(?:Forbidden|Prohibitions)\b/i,
  /\b5\.\s*Stop conditions\b/i,
  /\b6\.\s*Dispatch metadata\b/i,
];
// The fixed headings of templates/prompts/critic-review.md. A Critic prompt never carries the six
// Goldfish fields, so a correctly filled Critic briefing is recognised by its own template: the
// fail-closed reference boundary plus both review phases. One heading quoted in a freehand
// prompt is not the template.
const CRITIC_TEMPLATE_MARKERS = [
  /^#{1,6}\s*Fail-closed reference boundary \(MUST\)/im,
  /^#{1,6}\s*Phase A\b[^\n]*Adversarial hunt/im,
  /^#{1,6}\s*Phase B\b[^\n]*Evidence gate/im,
];

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

const tally = () => ({ events: 0, units: 0 });

export function classifyTranscript(jsonlText) {
  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const toolMeta = new Map();
  const retryRefusalBytes = new Map();
  let pendingRefusals = new Map();
  let pendingWake = false;
  let lastWakeReply = false;
  let wakeRun = 0;
  let malformedLines = 0;
  const wake = { replyEvents: 0, replyUnits: 0, longestRun: 0 };
  const inlineActions = { count: 0 };
  const delegation = tally();
  const recon = tally();
  const refusals = tally();
  const retried = tally();
  const briefings = { all: tally(), templateShaped: tally(), notTemplateShaped: tally() };
  let criticTemplateEvents = 0;
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
          const meta = toolMeta.get(block.tool_use_id);
          const size = bytes(block.content);
          const refused = block.is_error === true && /BLOCKED|GUARD-|refus/i.test(text);
          add(refused ? "guardRefusal" : meta?.category ?? "other", size);
          if (meta?.delegated) delegation.units += size;
          if (refused) {
            const target = meta?.delegated && RECON_AGENT_TYPES.has(meta.subagentType) ? recon : refusals;
            target.events += 1;
            target.units += size;
            if (target === refusals) pendingRefusals.set(meta?.name ?? "", size);
          } else if (block.is_error !== true && retryRefusalBytes.has(block.tool_use_id)) {
            retried.events += 1;
            retried.units += retryRefusalBytes.get(block.tool_use_id);
          }
        } else {
          const text = textOf([block]);
          if (WAKE_MARKERS.some((re) => re.test(text))) wakeSeen = true;
          add(wakeSeen ? "wakeUp" : "other", bytes(text));
        }
      }
      if (wakeSeen) {
        wakeRun = lastWakeReply ? wakeRun + 1 : 1;
        wake.longestRun = Math.max(wake.longestRun, wakeRun);
      }
      pendingWake = wakeSeen;
    } else if (role === "assistant") {
      const toolUses = blocks.filter((b) => b.type === "tool_use");
      const refusedBefore = pendingRefusals;
      pendingRefusals = new Map();
      if (toolUses.length === 0) {
        const size = bytes(blocks);
        add(pendingWake ? "wakeUp" : "other", size);
        lastWakeReply = pendingWake;
        if (pendingWake) { wake.replyEvents += 1; wake.replyUnits += size; }
      } else {
        lastWakeReply = false;
        for (const block of toolUses) {
          const category = classifyToolUse(block);
          const size = bytes(block);
          const name = block.name ?? "";
          const delegated = DELEGATION_TOOLS.has(name);
          toolMeta.set(block.id, { category, name, delegated, subagentType: String(block.input?.subagent_type ?? "").toLowerCase() });
          if (refusedBefore.has(name)) retryRefusalBytes.set(block.id, refusedBefore.get(name));
          add(category, size);
          if (category === "inlineRead") inlineActions.count += 1;
          if (delegated) {
            delegation.events += 1;
            delegation.units += size;
            const prompt = typeof block.input?.prompt === "string" ? block.input.prompt : "";
            const criticShaped = CRITIC_TEMPLATE_MARKERS.every((re) => re.test(prompt));
            const shaped = criticShaped || TEMPLATE_FIELD_MARKERS.every((re) => re.test(prompt));
            if (criticShaped) criticTemplateEvents += 1;
            for (const bucket of [briefings.all, shaped ? briefings.templateShaped : briefings.notTemplateShaped]) {
              bucket.events += 1;
              bucket.units += size;
            }
          }
        }
        const nonTool = blocks.filter((b) => b.type !== "tool_use");
        if (nonTool.length) add("other", bytes(nonTool));
      }
      pendingWake = false;
    }
  }

  const totalUnits = CATEGORIES.reduce((sum, c) => sum + totals[c], 0);
  const shareOf = (units) => (totalUnits === 0 ? 0 : units / totalUnits);
  const shares = Object.fromEntries(CATEGORIES.map((c) => [c, shareOf(totals[c])]));
  const adminShare = ADMIN_CATEGORIES.reduce((sum, c) => sum + shares[c], 0);
  const perDelegation = delegation.events === 0 ? null : delegation.units / delegation.events;
  const perInline = inlineActions.count === 0 ? null : totals.inlineRead / inlineActions.count;
  const costRatio = perDelegation === null || perInline === null || perInline === 0 ? null : perDelegation / perInline;
  const causes = {
    wakeUpLoops: { events: counts.wakeUp, units: totals.wakeUp, share: shares.wakeUp, replyEvents: wake.replyEvents, replyUnits: wake.replyUnits, longestRun: wake.longestRun },
    delegationCost: { events: delegation.events, units: delegation.units, share: shareOf(delegation.units), perDelegationUnits: perDelegation, perInlineActionUnits: perInline, costRatio, costlierThanInline: costRatio !== null && costRatio > 1 },
    exploreOrPlanRefused: { events: recon.events, units: recon.units, share: shareOf(recon.units) },
    guardRefusals: { events: refusals.events, units: refusals.units, share: shareOf(refusals.units), retriedAdmittedEvents: retried.events, retriedAdmittedUnits: retried.units },
    handWrittenBriefings: { events: briefings.notTemplateShaped.events, units: briefings.notTemplateShaped.units, share: shareOf(briefings.notTemplateShaped.units), briefingEvents: briefings.all.events, templateShapedEvents: briefings.templateShaped.events, criticTemplateEvents },
  };
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
    causes,
    malformedLines,
  };
}

/**
 * Per-cause before/after over two measurements produced by classifyTranscript().
 * A cause's share is relative: it falls whenever the REST of the transcript grows, at an
 * unchanged absolute cost. The share change is therefore reported on its own (`deltaShare`,
 * `shareFell`) and `improved` additionally requires the absolute cost to fall (`unitsFell`, the
 * utf8-byte metric). `eventsFell` is reported alongside. A cause absent in `before` (no events)
 * cannot be improved and is reported `improved: false`.
 */
export function compareMeasurements(before, after) {
  const view = (m, key) => ({ events: m?.causes?.[key]?.events ?? 0, units: m?.causes?.[key]?.units ?? 0, share: m?.causes?.[key]?.share ?? 0 });
  const causes = Object.fromEntries(CAUSES.map((key) => {
    const b = view(before, key);
    const a = view(after, key);
    const shareFell = a.share < b.share;
    const unitsFell = a.units < b.units;
    return [key, { before: b, after: a, deltaUnits: a.units - b.units, deltaShare: a.share - b.share, shareFell, unitsFell, eventsFell: a.events < b.events, improved: b.events > 0 && shareFell && unitsFell }];
  }));
  return {
    schema: "pipeline.elephant-context-comparison.v1",
    metric: "utf8-byte-upper-bound",
    exactModelTokens: false,
    causes,
    adminShare: { before: before?.adminShare ?? 0, after: after?.adminShare ?? 0, target: ADMIN_TARGET_SHARE },
    withinAdminTarget: after?.withinAdminTarget === true,
  };
}

export function main(argv = process.argv) {
  const compare = argv[2] === "--compare";
  if (compare ? !argv[3] || !argv[4] : !argv[2]) {
    process.stderr.write("usage: elephant-context-measure.mjs <claude-transcript.jsonl> | --compare <before.jsonl> <after.jsonl>\n");
    process.exitCode = 64;
    return null;
  }
  const measure = (path) => classifyTranscript(readFileSync(resolve(path), "utf8"));
  const result = compare ? compareMeasurements(measure(argv[3]), measure(argv[4])) : measure(argv[2]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (isDirectInvocation(import.meta.url)) main();

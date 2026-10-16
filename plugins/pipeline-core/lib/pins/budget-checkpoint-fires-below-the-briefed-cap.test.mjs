// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.budget-checkpoint-fires-below-the-briefed-cap (AC-120).
 *
 * Original defect: a dispatch briefed with a 45-call cap and a checkpoint at about
 * 36 was stopped by the hook at 35. Accepted resolution: the template states which
 * source wins. Acceptance points pinned here, each through the real modules and the
 * real template/agent files:
 *   P1 the hook's cap is min(briefed base cap, agent maxTurns - 15), read from the
 *      agent definition frontmatter and the briefing's Tool budget line;
 *   P2 the 80 % checkpoint is ceil(0.8 x EFFECTIVE cap), not 0.8 x briefed cap;
 *   P3 a 45 briefing on goldfish-implementor (maxTurns 50) is clamped to 35 and the
 *      hook exhausts at call 36 (the observed stop), checkpoint at 28;
 *   P4 templates/prompts/goldfish-task.md states that rule (the documentation fix),
 *      and its default (35) fits the shipped maxTurns with no clamp.
 * Each contract is also run against a mutant mirror to prove the pin can fail (RED).
 * No case needs directory mode bits or directory symlinks, so none is host-skipped.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  decideDispatchBudgetCall,
  dispatchCheckpointDecision,
  dispatchCheckpointThreshold,
  effectiveDispatchBaseCap,
} from "../dispatch-budget-core.mjs";
import { bindDispatchBudget, readAgentMaxTurns } from "../dispatch-budget-binding.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = join(PLUGIN_ROOT, "..", "..");
const TEMPLATE = readFileSync(join(REPO_ROOT, "templates", "prompts", "goldfish-task.md"), "utf8");

const briefing = (n) => `## Briefing\n- Tool budget (TB-09): ≤${n} tool uses base cap\n`;

// The cap/checkpoint contract, parametrised over the implementation so a mutant mirror can be run against it.
function assertCapContract(impl) {
  assert.equal(impl.effective(45, 50), 35, "45 briefed on maxTurns 50 clamps to 35");
  assert.equal(impl.effective(30, 50), 30, "a cap under the tier limit is honoured");
  assert.equal(impl.effective(35, 50), 35);
  assert.equal(impl.effective(40, 50), 35, "a stated 40 is silently clamped to 35");
  assert.equal(impl.effective(100, 80), 65, "goldfish-deep tier limit is 65");
  assert.equal(impl.threshold(35), 28, "checkpoint is ceil(0.8 x 35) = 28, computed on the effective cap");
  assert.equal(impl.threshold(impl.effective(45, 50)), 28, "NOT ceil(0.8 x 45) = 36");
}

const real = {
  effective: effectiveDispatchBaseCap,
  threshold: dispatchCheckpointThreshold,
};

test("P1/P2 cap = min(briefed, maxTurns - 15); checkpoint = ceil(0.8 x effective cap)", () => {
  assertCapContract(real);
  for (let cap = 1; cap <= 200; cap += 1) {
    assert.equal(dispatchCheckpointThreshold(cap), Math.ceil(0.8 * cap), `threshold for cap ${cap}`);
  }
});

test("RED: a mutant without the maxTurns clamp fails the cap contract", () => {
  const unclamped = { effective: (base) => base, threshold: dispatchCheckpointThreshold };
  assert.throws(() => assertCapContract(unclamped), assert.AssertionError);
});

test("RED: a mutant computing the checkpoint on the briefed cap fails the contract", () => {
  const briefedBased = {
    effective: effectiveDispatchBaseCap,
    threshold: (cap) => dispatchCheckpointThreshold(cap === 35 ? 45 : cap),
  };
  assert.throws(() => assertCapContract(briefedBased), assert.AssertionError);
});

test("P1 the agent definition frontmatter is the maxTurns source (50 / 50 / 80)", () => {
  assert.equal(readAgentMaxTurns("pipeline-core:goldfish-implementor", PLUGIN_ROOT), 50);
  assert.equal(readAgentMaxTurns("goldfish-mechanic", PLUGIN_ROOT), 50);
  assert.equal(readAgentMaxTurns("pipeline-core:goldfish-deep", PLUGIN_ROOT), 80);
});

test("P1/P3 the briefing Tool budget line is the briefed base cap; 45 on the implementor binds effective 35", () => {
  const maxTurns = readAgentMaxTurns("pipeline-core:goldfish-implementor", PLUGIN_ROOT);
  const binding = bindDispatchBudget({ prompt: briefing(45), maxTurns, applicable: true });
  assert.equal(binding.status, "prepared");
  assert.equal(binding.baseCalls, 45);
  assert.equal(binding.workingCap, 35);
  assert.equal(binding.effectiveCap, 35);
  assert.equal(binding.tierLimited, true);
  const within = bindDispatchBudget({ prompt: briefing(30), maxTurns, applicable: true });
  assert.equal(within.effectiveCap, 30);
  assert.equal(within.tierLimited, false);
});

test("P3 the hook stops a 45-briefed implementor after 35 working calls, not at the briefed 45", () => {
  const input = { maxTurns: 50, baseCalls: 45, isClosingAct: false };
  assert.deepEqual(decideDispatchBudgetCall({ ...input, currentCount: 34 }), { allowed: true, decision: "working", nextCount: 35, workingCap: 35 });
  const stop = decideDispatchBudgetCall({ ...input, currentCount: 35 });
  assert.equal(stop.allowed, false);
  assert.equal(stop.decision, "exhausted");
  assert.equal(stop.workingCap, 35);
  const closing = decideDispatchBudgetCall({ ...input, currentCount: 35, isClosingAct: true });
  assert.equal(closing.decision, "closing", "the closing allowance sits on top of the effective cap");
});

test("P2/P3 the checkpoint notice fires at call 28 of 35 (not 36), and repeats on the last working calls", () => {
  const at = (nextCount) => dispatchCheckpointDecision({ workingCap: 35, nextCount }).notice;
  assert.equal(at(27), false);
  assert.equal(at(28), true);
  assert.equal(at(29), false);
  assert.equal(at(32), false);
  assert.equal(at(33), true);
  assert.equal(at(35), true);
  assert.equal(at(36), false, "beyond the working cap there is no working-call notice");
  assert.equal(dispatchCheckpointDecision({ workingCap: 35, nextCount: 28 }).threshold, 28);
  assert.equal(dispatchCheckpointDecision({ workingCap: 35, nextCount: 28, decision: "closing" }).notice, false);
});

test("P4 the template states which source wins and the effective-cap rule", () => {
  assert.match(TEMPLATE, /enforces `min\(stated base cap, maxTurns - 15\)` for the dispatched `agentType`/u);
  assert.match(TEMPLATE, /silently clamps a higher stated cap/u);
  assert.match(TEMPLATE, /Treat the effective cap, not the stated number, as the base cap everywhere/u);
  assert.match(TEMPLATE, /a stated 40 would silently be clamped to 35/u);
  assert.match(TEMPLATE, /80 % checkpoint is computed on that effective cap \(e\.g\. call 28 of 35 on the implementor\)/u);
  assert.match(TEMPLATE, /`goldfish-deep` ships a higher `maxTurns: 80`[^.]*effective cap is at most 65/u);
  assert.match(TEMPLATE, /80 % of the effective tool cap \(the base cap as the hook enforces it: `min\(stated base cap, maxTurns - 15\)`/u);
});

test("P4 the template default (35) plus the 15 reserved fits shipped maxTurns 50 with no clamp", () => {
  assert.match(TEMPLATE, /\{\{TOOL_BUDGET default: "≤35 tool uses"\}\}/u);
  assert.equal(effectiveDispatchBaseCap(35, readAgentMaxTurns("pipeline-core:goldfish-implementor", PLUGIN_ROOT)), 35);
  assert.equal(effectiveDispatchBaseCap(35, readAgentMaxTurns("pipeline-core:goldfish-mechanic", PLUGIN_ROOT)), 35);
});

test("RED: the template pin fails against a mirror that lacks the clamp statement", () => {
  const stale = TEMPLATE.replaceAll("silently clamps a higher stated cap", "honours any stated cap");
  assert.doesNotMatch(stale, /silently clamps a higher stated cap/u);
});

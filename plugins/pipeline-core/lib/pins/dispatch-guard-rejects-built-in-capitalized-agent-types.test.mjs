// SPDX-License-Identifier: SUL-1.0
/**
 * Regression pin: pipeline.dispatch-guard-rejects-built-in-capitalized-agent-types (AC-162).
 *
 * Acceptance points (backlog item, Acceptance):
 *   A1 role normalisation accepts the runner's real agent-type spellings; a batch without the
 *      prohibition line is `not-applicable` before any role parsing can reject it.
 *   A2 Explore, Plan, general-purpose and pipeline-core:* types dispatch, alone and in parallel batches.
 *   A3 an invalid role produces its own code (APB-ROLE-UNPARSEABLE) naming the offending value.
 * The real module and the real hook CLI are exercised; the RED cases run a scratch MIRROR of the
 * production function carrying the original defect, never an edit of production.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ADVISOR_PROHIBITION_LINE,
  prepareAdvisorProhibitionBindings,
} from "../advisor-prohibition-binding.mjs";
import { recordConsentGiven } from "../onboarding-consent-marker.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const MODULE_PATH = join(here, "..", "advisor-prohibition-binding.mjs");
const GUARD = join(here, "..", "..", "hooks", "guard-dispatch.mjs");

mkdirSync(join(repoRoot, "scratch"), { recursive: true });
const work = mkdtempSync(join(repoRoot, "scratch", "pin-capitalized-agent-types-"));
process.once("exit", () => rmSync(work, { recursive: true, force: true }));

const repo = join(work, "repo");
mkdirSync(join(repo, ".claude"), { recursive: true });
execFileSync("git", ["init", "-q"], { cwd: repo });
recordConsentGiven({ rootDir: repo });

function guard(payload) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}
const PROHIBITION = `- ${ADVISOR_PROHIBITION_LINE} (MP-26)`;

// ---- A1/A2: the real hook CLI, exact live tool_input shapes ----
for (const type of ["Explore", "Plan", "general-purpose"]) {
  test(`A1/A2 CLI: Agent ${type} without a prohibition line is admitted`, () => {
    const { code, stderr } = guard({
      tool_use_id: `pin-${type}`, tool_name: "Agent",
      tool_input: { subagent_type: type, model: "sonnet", description: "read-only research", prompt: "Read the repository and report where X is defined." },
    });
    assert.equal(code, 0, stderr.slice(0, 300));
    assert.doesNotMatch(stderr, /APB-/u);
  });
}

test("A2 CLI: a parallel Workflow batch of Explore, Plan and general-purpose is admitted", () => {
  const { code, stderr } = guard({
    tool_use_id: "pin-batch", tool_name: "Workflow",
    tool_input: { script: `
      agent({ agentType: 'Explore', prompt: 'Read a and report.' })
      agent({ agentType: 'Plan', prompt: 'Plan b.' })
      agent({ agentType: 'general-purpose', prompt: 'Find c.' })
      agent({ agentType: 'Explore', prompt: 'Read d and report.' })
    ` },
  });
  assert.equal(code, 0, stderr.slice(0, 300));
  assert.doesNotMatch(stderr, /APB-/u);
});

test("A2 CLI: the hook never reports the misleading Advisor denial for a capitalised built-in", () => {
  const { stderr } = guard({
    tool_use_id: "pin-msg", tool_name: "Agent",
    tool_input: { subagent_type: "Explore", model: "sonnet", description: "r", prompt: "Read and report." },
  });
  assert.doesNotMatch(stderr, /APB-DISPATCH-INVALID|cannot be assigned to one exact child/u);
});

// ---- A1/A2: module level ----
test("A1 module: batches without the prohibition are not-applicable for every built-in spelling", () => {
  for (const subagentType of ["Explore", "Plan", "general-purpose", "pipeline-core:goldfish-implementor", "pipeline-core:critic"]) {
    const alone = prepareAdvisorProhibitionBindings([{ subagentType, prompt: "Read and report." }]);
    assert.equal(alone.status, "not-applicable", subagentType);
    assert.equal(alone.code, "APB-NO-PROHIBITION");
  }
  const batch = prepareAdvisorProhibitionBindings([
    { subagentType: "Explore", prompt: "a" }, { subagentType: "Plan", prompt: "b" },
    { subagentType: "general-purpose", prompt: "c" }, { subagentType: "pipeline-core:critic", prompt: "d" },
  ]);
  assert.equal(batch.status, "not-applicable");
});

test("A1 module: a role that would be unparseable is still not-applicable when no prompt carries the prohibition", () => {
  assert.equal(prepareAdvisorProhibitionBindings([{ subagentType: "bad role", prompt: "x" }]).status, "not-applicable");
  assert.equal(prepareAdvisorProhibitionBindings([{ subagentType: undefined, prompt: "x" }]).status, "not-applicable");
});

test("A1/A2 module: built-in spellings bind case-preservingly in a mixed prohibition-bearing batch", () => {
  const prepared = prepareAdvisorProhibitionBindings([
    { subagentType: "Explore", prompt: PROHIBITION },
    { subagentType: "Plan", prompt: "ordinary" },
    { subagentType: "general-purpose", prompt: "ordinary" },
    { subagentType: "pipeline-core:goldfish-implementor", prompt: "ordinary" },
  ]);
  assert.equal(prepared.status, "prepared");
  assert.deepEqual(
    Object.fromEntries(prepared.bindings.map(({ agentType, disposition }) => [agentType, disposition])),
    { Explore: "prohibited", Plan: "unrestricted", "general-purpose": "unrestricted", "goldfish-implementor": "unrestricted" },
  );
});

test("A2 module: pipeline-core: prefix is stripped and Explore vs explore stay distinct identities", () => {
  const prepared = prepareAdvisorProhibitionBindings([
    { subagentType: "pipeline-core:critic", prompt: PROHIBITION },
    { subagentType: "Explore", prompt: "x" },
    { subagentType: "explore", prompt: "y" },
  ]);
  assert.equal(prepared.status, "prepared");
  assert.deepEqual(new Set(prepared.bindings.map((b) => b.agentType)), new Set(["Explore", "critic", "explore"]));
});

// ---- A3: own code naming the offending value ----
test("A3 module: an invalid role gets APB-ROLE-UNPARSEABLE naming the value", () => {
  for (const bad of ["", "  ", "bad role", "9lives", "Exp\u0007lore", 42, undefined]) {
    const prepared = prepareAdvisorProhibitionBindings([{ subagentType: bad, prompt: PROHIBITION }]);
    assert.equal(prepared.status, "rejected");
    assert.equal(prepared.code, "APB-ROLE-UNPARSEABLE");
    assert.notEqual(prepared.code, "APB-DISPATCH-INVALID");
    assert.doesNotMatch(prepared.message, /\u0007/u);
  }
  assert.match(prepareAdvisorProhibitionBindings([{ subagentType: "bad role", prompt: PROHIBITION }]).message, /"bad role"/u);
  const long = prepareAdvisorProhibitionBindings([{ subagentType: `x y${"z".repeat(500)}`, prompt: PROHIBITION }]);
  assert.ok(long.message.length < 300);
});

test("A3 CLI: the hook blocks an unparseable role with APB-ROLE-UNPARSEABLE naming it", () => {
  const { code, stderr } = guard({
    tool_use_id: "pin-bad", tool_name: "Agent",
    tool_input: { subagent_type: "bad role", model: "sonnet", description: "r", prompt: `${PROHIBITION}\nRead and report.` },
  });
  assert.equal(code, 2, stderr.slice(0, 300));
  assert.match(stderr, /APB-ROLE-UNPARSEABLE/u);
  assert.match(stderr, /"bad role"/u);
  assert.doesNotMatch(stderr, /APB-DISPATCH-INVALID/u);
});

// ---- RED: scratch mirrors carrying the original defect ----
async function loadMirror(name, transform) {
  const original = readFileSync(MODULE_PATH, "utf8");
  const mutated = transform(original);
  assert.notEqual(mutated, original, `mirror ${name}: mutation did not apply (production text changed)`);
  const file = join(work, `${name}.mjs`);
  writeFileSync(file, mutated);
  return import(pathToFileURL(file).href);
}

test("RED: a mirror with the original lowercase-only grammar rejects Explore/Plan (the pin can fail)", async () => {
  const mirror = await loadMirror("lowercase-only", (s) => s.replace("/^[A-Za-z][A-Za-z0-9_-]*$/u", "/^[a-z][a-z0-9-]*$/u"));
  for (const subagentType of ["Explore", "Plan"]) {
    const bad = mirror.prepareAdvisorProhibitionBindings([{ subagentType, prompt: PROHIBITION }]);
    assert.equal(bad.status, "rejected", `mirror must reject ${subagentType}`);
  }
  // The real function does not.
  assert.equal(prepareAdvisorProhibitionBindings([{ subagentType: "Explore", prompt: PROHIBITION }]).status, "prepared");
});

test("RED: a mirror that parses roles before checking for the prohibition rejects a clean Explore batch", async () => {
  const mirror = await loadMirror("role-first", (s) => s
    .replace("/^[A-Za-z][A-Za-z0-9_-]*$/u", "/^[a-z][a-z0-9-]*$/u")
    .replace('if (!dispositions.includes("prohibited")) return result("not-applicable", "APB-NO-PROHIBITION");',
      'if (dispatches.some((d) => typeof d?.subagentType !== "string" || !/^[a-z][a-z0-9-]*$/u.test(d.subagentType))) return result("rejected", "APB-DISPATCH-INVALID");\n  if (!dispositions.includes("prohibited")) return result("not-applicable", "APB-NO-PROHIBITION");'));
  const bad = mirror.prepareAdvisorProhibitionBindings([{ subagentType: "Explore", prompt: "Read and report." }]);
  assert.equal(bad.code, "APB-DISPATCH-INVALID");
  assert.equal(prepareAdvisorProhibitionBindings([{ subagentType: "Explore", prompt: "Read and report." }]).code, "APB-NO-PROHIBITION");
});

test("RED: a mirror with the generic code fails the A3 own-code expectation", async () => {
  const mirror = await loadMirror("generic-code", (s) => s.replace('"APB-ROLE-UNPARSEABLE"', '"APB-DISPATCH-INVALID"'));
  const bad = mirror.prepareAdvisorProhibitionBindings([{ subagentType: "bad role", prompt: PROHIBITION }]);
  assert.notEqual(bad.code, "APB-ROLE-UNPARSEABLE");
});

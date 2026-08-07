#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-dispatch.mjs — hook-level suite.
 *
 * The unit-level rules live in ../lib/dispatch-policy.test.mjs. These cases prove the hook
 * around them: that it reads the real tool-input shape, that it blocks rather than warns,
 * and that it fails open on everything it cannot parse.
 *
 * GD8/GD9 read the real shipped templates rather than a hand-written stand-in, for the same
 * reason as dispatch-policy.test.mjs DP11/DP12: a hand-written fixture is what let the F1
 * adjacency bug ship green while every real template-built dispatch was refused.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./guard-dispatch.mjs", import.meta.url));
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function filledTemplateBody(relativePath) {
  const raw = readFileSync(join(repoRoot, relativePath), "utf8");
  const marker = "COPY EVERYTHING BELOW THIS LINE\n-->";
  const markerIndex = raw.indexOf(marker);
  assert.ok(markerIndex >= 0, `${relativePath}: copy marker not found -- template shape changed`);
  let body = raw.slice(markerIndex + marker.length);
  body = body.replace(/\{\{MODEL_ID\}\}/g, "claude-opus-5");
  body = body.replace(/\{\{EFFORT\}\}/g, "max");
  body = body.replace(/\{\{MODEL_EFFORT[^{}]*\}\}/g, "claude-sonnet-5 / medium");
  body = body.replace(/\{\{[^{}]*\}\}/g, "FILLED");
  return body;
}

let pass = 0;
const failures = [];
function run(payload) {
  const res = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(payload), encoding: "utf8" });
  return { code: res.status, stderr: res.stderr ?? "" };
}
function check(id, payload, expectExit, { stderrIncludes } = {}) {
  const { code, stderr } = run(payload);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- ${stderr.trim().slice(0, 200)}`);
  for (const needle of [].concat(stderrIncludes ?? [])) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  if (problems.length === 0) { pass += 1; console.log(`PASS  ${id}`); }
  else { failures.push(`${id}: ${problems.join("; ")}`); console.log(`FAIL  ${id} -- ${problems.join("; ")}`); }
}

const BLOCK = 2, ALLOW = 0;

const CLEAN_CRITIC = [
  "Independent Critic review. Build your own input from the references below.",
  "DIFF RANGE: 754b32b..1568fe3",
  "SPEC: specs/sprint-nova-epic/spec.md",
  "GUARDRAILS: guardrails/global.md",
  "EVIDENCE ARTIFACTS: evidence/verify-latest.json",
  "TASK FRAME: risk class high; Ruleset-SHA: 0f38b425; Model: claude-opus-5.",
].join("\n");

// GD1 -- the failure this hook exists for, at the hook boundary.
check("GD1 block  a Critic dispatch carrying a claims list", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: `${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x` },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-CLAIMS-LIST", "templates/prompts/critic-review.md"] });

check("GD2 allow  a references-only Critic dispatch", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: CLEAN_CRITIC },
}, ALLOW);

// GD3 -- the `subagentType` spelling, so a runner that uses camelCase is not a silent no-op.
check("GD3 block  the camelCase subagentType field is read too", {
  tool_name: "Agent",
  tool_input: { subagentType: "pipeline-core:critic", prompt: `${CLEAN_CRITIC}\n\nADVERSARIAL FOCUS: look here.` },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-HUNT-LIST"] });

check("GD4 block  an incomplete Goldfish briefing", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:goldfish-implementor", prompt: "Please fix the thing. Model: claude-sonnet-5." },
}, BLOCK, { stderrIncludes: ["DISPATCH-INCOMPLETE-BRIEFING", "GOAL"] });

// GD5 -- roles with no template contract are not this hook's business.
check("GD5 allow  an unrelated subagent type", {
  tool_name: "Task",
  tool_input: { subagent_type: "general-purpose", prompt: "find where X is defined" },
}, ALLOW);

// GD6/GD7 -- fail-open. A guard that cannot read its input has no opinion, and a broken
// hook must never become a work stoppage.
check("GD6 allow  a payload with no tool_input", { tool_name: "Task" }, ALLOW);
check("GD7 allow  a dispatch with no subagent type", { tool_input: { prompt: "anything" } }, ALLOW);

// GD8/GD9 -- the real templates, filled, must be dispatchable at the hook boundary too.
check("GD8 the real critic-review.md template, filled, is dispatchable", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: filledTemplateBody("templates/prompts/critic-review.md") },
}, ALLOW);

check("GD9 the real goldfish-task.md template, filled, is dispatchable", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:goldfish-implementor", prompt: filledTemplateBody("templates/prompts/goldfish-task.md") },
}, ALLOW);

console.log(`\n${pass}/${pass + failures.length} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);

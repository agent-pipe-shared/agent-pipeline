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
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// NOTE, deliberately absent: no module-scope `import { extractWorkflowDispatches } from
// "./guard-dispatch.mjs"` here. That shape was tried and removed (NVA-B-GD16HARDEN-1): if the
// entrypoint gate ever regressed to executing the hook body on import (reading stdin, calling
// process.exit), such an import would silently terminate the whole test process during module
// evaluation, before a single `check(...)` call ran -- and under `node --test`, a file with no
// `test()` calls that exits 0 is reported as ONE PASSING TEST, with none of GD1-GD19's own
// checks having run. That is the exact silent-disarm shape this hook package exists to catch,
// reproduced inside the guard's own suite. GD16 below instead spawns a CHILD process to import
// the module and call the function, so a regression of that shape makes GD16 fail loudly
// (missing success marker) rather than silently vanish the whole file's coverage.
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

// GD10/GD11 -- Workflow-tool awareness (backlog 2026-08-18-guard-dispatch-has-no-workflow-tool-awareness):
// an `agent()` call embedded in a Workflow `script` string is checked the same way a direct
// Task/Agent dispatch is, without needing a discrete subagent_type/prompt tool_input field.
const WORKFLOW_SCRIPT_CONTAMINATED = `
async function main() {
  const result = await agent({
    agentType: 'pipeline-core:critic',
    prompt: \`${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x\`,
    isolation: 'worktree',
  });
  return result;
}
`;
check("GD10 block  a Workflow-embedded agent() call carrying a claims list", {
  tool_name: "Workflow",
  tool_input: { script: WORKFLOW_SCRIPT_CONTAMINATED },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-CLAIMS-LIST", "templates/prompts/critic-review.md"] });

const WORKFLOW_SCRIPT_CLEAN = `
async function main() {
  const result = await agent({
    agentType: 'pipeline-core:critic',
    prompt: \`${CLEAN_CRITIC}\`,
    isolation: 'worktree',
  });
  return result;
}
`;
check("GD11 allow  a Workflow-embedded agent() call with a clean references-only prompt", {
  tool_name: "Workflow",
  tool_input: { script: WORKFLOW_SCRIPT_CLEAN },
}, ALLOW);

// GD12-GD15 -- the Antigravity runner's native invoke_subagent payload shape (backlog
// 2026-08-25-guard-dispatch-fails-open-on-the-antigravity-subagents-payload-shape.md): the
// ACTUAL shape reported by the source session, capitalization included -- not a paraphrased
// stand-in ("fixture-blindness" lesson, goldfish-task.md's DoD note).
check("GD12 block  an Antigravity Subagents-array dispatch carrying a claims list", {
  tool_name: "invoke_subagent",
  tool_input: { Subagents: [{ TypeName: "critic", Prompt: `${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x` }] },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-CLAIMS-LIST", "templates/prompts/critic-review.md"] });

check("GD13 allow  an Antigravity Subagents-array dispatch with a clean references-only prompt", {
  tool_name: "invoke_subagent",
  tool_input: { Subagents: [{ TypeName: "critic", Prompt: CLEAN_CRITIC }] },
}, ALLOW);

check("GD14 block  a freehand prose Antigravity Critic dispatch (the reproduced source-session bypass)", {
  tool_name: "invoke_subagent",
  tool_input: {
    Subagents: [{
      TypeName: "critic",
      Prompt: "please review this code. I think the bug is in line 42 because I changed the array map.",
    }],
  },
}, BLOCK, { stderrIncludes: ["DISPATCH-NO-RULESET-SHA"] });

check("GD15 allow  an Antigravity dispatch of an unrelated subagent type", {
  tool_name: "invoke_subagent",
  tool_input: { Subagents: [{ TypeName: "general-purpose", Prompt: "find where X is defined" }] },
}, ALLOW);

// GD16-GD19 -- NVA-B-DISPATCHEXPORT-1: extractWorkflowDispatches is now exported and the hook
// body only runs when this module is the process entrypoint (isDirectInvocation, matching
// guard-dispatch-budget.mjs), so it can be imported without disarming it. GD16 proves the
// import half; GD17/GD18 prove the hook still fires via its own real path after the gate was
// added; GD19 proves it still fires reached through a symlink -- the exact 2026-08-06 failure
// shape entrypoint.mjs's header documents (a naive entrypoint check left six hooks dead when
// reached through a symlinked marketplace root).
//
// GD16 -- NVA-B-GD16HARDEN-1: proves the same thing the original GD16 proved (the export exists,
// is callable, and returns the correct recovery), but via a CHILD process rather than a
// module-scope import in THIS file. A module-scope `import { extractWorkflowDispatches } from
// "./guard-dispatch.mjs"` at the top of this test file would be safe today only because the
// entrypoint gate happens to be in place; if a future edit ever removed that gate (top-level
// stdin read plus an unconditional process.exit, no isDirectInvocation check), that import would
// silently terminate this whole test file during module evaluation, and `node --test` would
// still report it as one passing test with none of GD1-GD19 having run. Spawning a child process
// removes that risk: a regression of that shape makes the CHILD exit with no success marker in
// its stdout, which the assertions below treat as an explicit failure, not a silent pass.
{
  const id = "GD16 extractWorkflowDispatches is importable and callable directly, via a subprocess, with no in-process import of the hook module";
  const expected = [{ subagentType: "pipeline-core:critic", prompt: "hello world" }];
  const successMarker = "GD16-IMPORT-OK";
  const runnerDir = mkdtempSync(join(tmpdir(), "guard-dispatch-import-check-"));
  try {
    const runnerPath = join(runnerDir, "import-check.mjs");
    // The runner does the importing and calling; THIS file never imports guard-dispatch.mjs at
    // its own module scope. Any stdin the runner's import might touch is fed explicitly via
    // spawnSync's `input` option below -- never a shell redirect.
    writeFileSync(runnerPath, [
      "const mod = await import(process.argv[2]);",
      "if (typeof mod.extractWorkflowDispatches !== 'function') {",
      "  console.log('GD16-IMPORT-FAIL: extractWorkflowDispatches is not a function');",
      "  process.exit(1);",
      "}",
      "const result = mod.extractWorkflowDispatches(\"agentType: 'pipeline-core:critic', prompt: `hello world`\");",
      `console.log('${successMarker}');`,
      "console.log('GD16-RESULT: ' + JSON.stringify(result));",
    ].join("\n"));
    const res = spawnSync(process.execPath, [runnerPath, GUARD], { input: "", encoding: "utf8", timeout: 10000 });
    const stdout = res.stdout ?? "";
    const stderr = res.stderr ?? "";
    const problems = [];
    if (res.status !== 0) problems.push(`child exited ${res.status} (expected 0) -- ${stderr.trim().slice(0, 200)}`);
    // Fails loudly on ABSENCE of success, not merely on an error: a child that exits 0 having
    // printed nothing (exactly what the pre-adc165bb regression shape produces) must fail here,
    // because the success marker is what is actually asserted, not just the exit code.
    if (!stdout.includes(successMarker)) problems.push(`child stdout missing success marker "${successMarker}" -- got ${JSON.stringify(stdout)}`);
    // Exact-line match, not a substring: `includes` would still pass if a regression made the
    // recovery return extra, unexpected entries alongside the correct one (e.g. `[expected,
    // extra]`), which is exactly the kind of change the ORIGINAL GD16's strict
    // `JSON.stringify(result) === JSON.stringify(expected)` equality caught. Matching a whole
    // stdout line keeps that same strength under the new subprocess shape.
    const expectedLine = `GD16-RESULT: ${JSON.stringify(expected)}`;
    if (!stdout.split("\n").includes(expectedLine)) problems.push(`child stdout missing the exact line "${expectedLine}" -- got ${JSON.stringify(stdout)}`);
    if (problems.length === 0) { pass += 1; console.log(`PASS  ${id}`); }
    else { failures.push(`${id}: ${problems.join("; ")}`); console.log(`FAIL  ${id} -- ${problems.join("; ")}`); }
  } finally {
    rmSync(runnerDir, { recursive: true, force: true });
  }
}

check("GD17 block  via the real path, a refusable dispatch still refuses after the entrypoint gate", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: `${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x` },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-CLAIMS-LIST", "templates/prompts/critic-review.md"] });

check("GD18 allow  via the real path, an admissible dispatch still admits after the entrypoint gate", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: CLEAN_CRITIC },
}, ALLOW);

{
  const id = "GD19 block  invoked through a symlink to the module, the hook still refuses (the 2026-08-06 failure shape)";
  const linkDir = mkdtempSync(join(tmpdir(), "guard-dispatch-link-"));
  try {
    const linked = join(linkDir, "guard-dispatch.mjs");
    symlinkSync(GUARD, linked);
    const payload = {
      tool_name: "Task",
      tool_input: { subagent_type: "pipeline-core:critic", prompt: `${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x` },
    };
    const res = spawnSync(process.execPath, [linked], { input: JSON.stringify(payload), encoding: "utf8" });
    const stderr = res.stderr ?? "";
    const problems = [];
    if (res.status !== BLOCK) problems.push(`exit ${res.status} (expected ${BLOCK}) through the symlink -- ${stderr.trim().slice(0, 200)}`);
    if (!stderr.includes("DISPATCH-CONTAMINATION-CLAIMS-LIST")) problems.push("stderr missing DISPATCH-CONTAMINATION-CLAIMS-LIST through the symlink");
    if (res.status === 0 && stderr === "") problems.push("silent no-op through the symlink -- exit 0 means ALLOW");
    if (problems.length === 0) { pass += 1; console.log(`PASS  ${id}`); }
    else { failures.push(`${id}: ${problems.join("; ")}`); console.log(`FAIL  ${id} -- ${problems.join("; ")}`); }
  } finally {
    rmSync(linkDir, { recursive: true, force: true });
  }
}

// GD20 -- NVA-B-SLICINGRUNNER-1: extractAntigravityDispatches is now exported the same way
// extractWorkflowDispatches was (adc165bb/GD16 above) -- same subprocess-only proof, for the same
// reason documented at the top of this file: a module-scope import here would be safe only as
// long as the entrypoint gate stays in place, and a regression of that gate must fail this case
// loudly (missing success marker) rather than silently vanish this whole file's coverage.
{
  const id = "GD20 extractAntigravityDispatches is importable and callable directly, via a subprocess, with no in-process import of the hook module";
  const expected = [{ subagentType: "pipeline-core:critic", prompt: "hello world" }];
  const successMarker = "GD20-IMPORT-OK";
  const runnerDir = mkdtempSync(join(tmpdir(), "guard-dispatch-antigravity-import-check-"));
  try {
    const runnerPath = join(runnerDir, "import-check.mjs");
    // The runner does the importing and calling; THIS file never imports guard-dispatch.mjs at
    // its own module scope. Any stdin the runner's import might touch is fed explicitly via
    // spawnSync's `input` option below -- never a shell redirect.
    writeFileSync(runnerPath, [
      "const mod = await import(process.argv[2]);",
      "if (typeof mod.extractAntigravityDispatches !== 'function') {",
      "  console.log('GD20-IMPORT-FAIL: extractAntigravityDispatches is not a function');",
      "  process.exit(1);",
      "}",
      "const result = mod.extractAntigravityDispatches([{ TypeName: 'pipeline-core:critic', Prompt: 'hello world' }]);",
      `console.log('${successMarker}');`,
      "console.log('GD20-RESULT: ' + JSON.stringify(result));",
    ].join("\n"));
    const res = spawnSync(process.execPath, [runnerPath, GUARD], { input: "", encoding: "utf8", timeout: 10000 });
    const stdout = res.stdout ?? "";
    const stderr = res.stderr ?? "";
    const problems = [];
    if (res.status !== 0) problems.push(`child exited ${res.status} (expected 0) -- ${stderr.trim().slice(0, 200)}`);
    // Fails loudly on ABSENCE of success, not merely on an error -- same rationale as GD16.
    if (!stdout.includes(successMarker)) problems.push(`child stdout missing success marker "${successMarker}" -- got ${JSON.stringify(stdout)}`);
    const expectedLine = `GD20-RESULT: ${JSON.stringify(expected)}`;
    if (!stdout.split("\n").includes(expectedLine)) problems.push(`child stdout missing the exact line "${expectedLine}" -- got ${JSON.stringify(stdout)}`);
    if (problems.length === 0) { pass += 1; console.log(`PASS  ${id}`); }
    else { failures.push(`${id}: ${problems.join("; ")}`); console.log(`FAIL  ${id} -- ${problems.join("; ")}`); }
  } finally {
    rmSync(runnerDir, { recursive: true, force: true });
  }
}

console.log(`\n${pass}/${pass + failures.length} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);

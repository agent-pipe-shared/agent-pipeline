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
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADVISOR_PROHIBITION_AUDIT_SCHEMA,
  ADVISOR_PROHIBITION_DENIAL_CODE,
  ADVISOR_PROHIBITION_LINE,
  advisorProhibitionDisposition,
  persistAdvisorProhibitionAudit,
  persistPendingAdvisorProhibitionBindings,
  prepareAdvisorProhibitionBindings,
  resolvePendingAdvisorProhibitionBinding,
} from "../lib/advisor-prohibition-binding.mjs";
import { evaluateAdvisorProhibitionGuard } from "./guard-advisor-prohibition.mjs";

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
const ADVISOR_GUARD = fileURLToPath(new URL("./guard-advisor-prohibition.mjs", import.meta.url));
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const bindingRepo = mkdtempSync(join(repoRoot, "scratch", "guard-dispatch-binding-"));
execFileSync("git", ["init", "-q"], { cwd: bindingRepo });
process.once("exit", () => rmSync(bindingRepo, { recursive: true, force: true }));

function filledTemplateBody(relativePath) {
  const raw = readFileSync(join(repoRoot, relativePath), "utf8");
  const marker = "COPY EVERYTHING BELOW THIS LINE\n-->";
  const markerIndex = raw.indexOf(marker);
  assert.ok(markerIndex >= 0, `${relativePath}: copy marker not found -- template shape changed`);
  let body = raw.slice(markerIndex + marker.length);
  body = body.replace(/\{\{MODEL_ID\}\}/g, "claude-opus-5");
  body = body.replace(/\{\{EFFORT\}\}/g, "max");
  body = body.replace(/\{\{MODEL_EFFORT[^{}]*\}\}/g, "claude-sonnet-5 / medium");
  body = body.replace(/\{\{TOOL_BUDGET[^{}]*\}\}/g, "≤24 tool uses");
  body = body.replace(/\{\{[^{}]*\}\}/g, "FILLED");
  return body;
}

let pass = 0;
const failures = [];
function run(payload) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: bindingRepo },
  });
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
function manualCheck(id, fn) {
  try { fn(); pass += 1; console.log(`PASS  ${id}`); }
  catch (error) { failures.push(`${id}: ${error.message}`); console.log(`FAIL  ${id} -- ${error.message}`); }
}

const BLOCK = 2, ALLOW = 0;

const CLEAN_CRITIC = [
  "Independent Critic review. Build your own input from the references below.",
  "DIFF RANGE: 754b32b..1568fe3",
  "SPEC: specs/sprint-nova-epic/spec.md",
  "GUARDRAILS: guardrails/global.md",
  "EVIDENCE ARTIFACTS: evidence/verify-latest.json",
  "TASK FRAME: risk class high; Ruleset-SHA: 0f38b425; Model: claude-opus-5.",
  "- **Tool budget (hard cap, first-class field):** ≤24 tool uses.",
].join("\n");

// GD1 -- the failure this hook exists for, at the hook boundary.
check("GD1 block  a Critic dispatch carrying a claims list", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: `${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x` },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-CLAIMS-LIST", "templates/prompts/critic-review.md"] });

check("GD2 allow  a references-only Critic dispatch", {
  tool_use_id: "gd2",
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: CLEAN_CRITIC },
}, ALLOW);

const prohibitedToolUseId = "gd2-advisor-prohibited";
check("GD2a allow and bind a policy-clean Critic dispatch carrying the exact Advisor prohibition", {
  tool_use_id: prohibitedToolUseId,
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: `${CLEAN_CRITIC}\n- ${ADVISOR_PROHIBITION_LINE} (MP-26)` },
}, ALLOW);
{
  const key = createHash("sha256").update(prohibitedToolUseId).digest("hex");
  const path = join(bindingRepo, ".git", "agent-pipeline", "advisor-prohibition", "pending", `${key}.json`);
  const id = "GD2b the pre-launch carrier contains only the exact role, disposition and prompt digest";
  const problems = [];
  if (!existsSync(path)) problems.push("binding record is absent");
  else {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value.toolUseIdSha256 !== key) problems.push("parent tool-use digest mismatch");
    if (JSON.stringify(value.bindings.map(({ agentType, disposition }) => [agentType, disposition])) !== JSON.stringify([["critic", "prohibited"]])) {
      problems.push("role/disposition binding mismatch");
    }
    if (!/^[a-f0-9]{64}$/u.test(value.bindings[0]?.promptSha256 ?? "")) problems.push("prompt digest missing");
    if (JSON.stringify(value).includes(ADVISOR_PROHIBITION_LINE)) problems.push("raw prompt escaped into the private carrier");
  }
  if (problems.length === 0) { pass += 1; console.log(`PASS  ${id}`); }
  else { failures.push(`${id}: ${problems.join("; ")}`); console.log(`FAIL  ${id} -- ${problems.join("; ")}`); }
}

check("GD2c block a prohibition-bearing child whose parent tool-use id is absent", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: `${CLEAN_CRITIC}\n- ${ADVISOR_PROHIBITION_LINE} (MP-26)` },
}, BLOCK, { stderrIncludes: ["APB-PARENT-TOOL-USE-ID-MISSING"] });

check("GD2d block a same-role Workflow batch whose mixed Advisor dispositions cannot map to exact children", {
  tool_use_id: "gd2d",
  tool_name: "Workflow",
  tool_input: { script: `
    agent({ agentType: 'pipeline-core:critic', prompt: \`${CLEAN_CRITIC}\n- ${ADVISOR_PROHIBITION_LINE} (MP-26)\` })
    agent({ agentType: 'pipeline-core:critic', prompt: \`${CLEAN_CRITIC}\` })
  ` },
}, BLOCK, { stderrIncludes: ["APB-DISPATCH-IDENTITY-AMBIGUOUS"] });

manualCheck("GD2e only the exact canonical MP-26 line creates a prohibition", () => {
  const prohibited = `### 4. Forbidden\n- ${ADVISOR_PROHIBITION_LINE} (MP-26)\n`;
  assert.equal(advisorProhibitionDisposition(prohibited).disposition, "prohibited");
  assert.equal(advisorProhibitionDisposition("- Please do not use the Advisor.\n").disposition, "unrestricted");
  assert.equal(advisorProhibitionDisposition(`Narrative: ${ADVISOR_PROHIBITION_LINE}\n`).disposition, "unrestricted");
  assert.equal(advisorProhibitionDisposition(`${prohibited}- ${ADVISOR_PROHIBITION_LINE}\n`).code, "APB-PROHIBITION-AMBIGUOUS");
});

manualCheck("GD2f the portable binding preserves a prohibited child and an unrestricted sibling", () => {
  const prepared = prepareAdvisorProhibitionBindings([
    { subagentType: "pipeline-core:critic", prompt: `- ${ADVISOR_PROHIBITION_LINE}` },
    { subagentType: "pipeline-core:goldfish-deep", prompt: "ordinary child" },
  ]);
  assert.equal(prepared.status, "prepared");
  assert.deepEqual(prepared.bindings.map(({ agentType, disposition }) => [agentType, disposition]), [
    ["critic", "prohibited"], ["goldfish-deep", "unrestricted"],
  ]);
  assert.equal(prepareAdvisorProhibitionBindings([
    { subagentType: "critic", prompt: `- ${ADVISOR_PROHIBITION_LINE}` },
    { subagentType: "critic", prompt: "ordinary child" },
  ]).code, "APB-DISPATCH-IDENTITY-AMBIGUOUS");
});

manualCheck("GD2g the private carrier resolves only the exact parent and role", () => {
  const root = mkdtempSync(join(tmpdir(), "advisor-prohibition-binding-"));
  try {
    const prepared = prepareAdvisorProhibitionBindings([
      { subagentType: "critic", prompt: `- ${ADVISOR_PROHIBITION_LINE}` },
      { subagentType: "goldfish-deep", prompt: "ordinary child" },
    ]);
    assert.equal(persistPendingAdvisorProhibitionBindings({ commonDir: root, toolUseId: "parent-1", bindings: prepared.bindings }).status, "prepared");
    assert.equal(resolvePendingAdvisorProhibitionBinding({ commonDir: root, toolUseId: "parent-1", agentType: "pipeline-core:critic" }).binding.disposition, "prohibited");
    assert.equal(resolvePendingAdvisorProhibitionBinding({ commonDir: root, toolUseId: "parent-1", agentType: "goldfish-deep" }).binding.disposition, "unrestricted");
    assert.equal(resolvePendingAdvisorProhibitionBinding({ commonDir: root, toolUseId: "other", agentType: "critic" }).status, "not-bound");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

manualCheck("GD2h a private denial audit is content-free and digest-bound", () => {
  const root = mkdtempSync(join(tmpdir(), "advisor-prohibition-audit-"));
  try {
    const result = persistAdvisorProhibitionAudit({
      commonDir: root, agentId: "child-secret-identity", agentType: "pipeline-core:critic",
      parentToolUseId: "parent-secret-identity", callToolUseId: "call-secret-identity",
      promptSha256: "a".repeat(64), occurredAt: "2026-09-12T12:00:00.000Z",
    });
    assert.equal(result.status, "recorded");
    assert.doesNotMatch(readFileSync(result.path, "utf8"), /secret-identity/u);
    assert.equal(result.record.schema, ADVISOR_PROHIBITION_AUDIT_SCHEMA);
    assert.equal(result.record.code, ADVISOR_PROHIBITION_DENIAL_CODE);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const advisorChild = {
  tool_name: "advisor", tool_use_id: "advisor-call-1", agent_id: "child-1",
  agent_type: "pipeline-core:critic", transcript_path: "/measured/session.jsonl",
  tool_input: { question: "PRIVATE QUESTION MUST NOT ESCAPE" },
};
manualCheck("GD2i an unbound child and an orchestrator are not blanket-blocked", () => {
  assert.equal(evaluateAdvisorProhibitionGuard({ tool_name: "advisor", tool_input: { question: "ordinary" } }).exitCode, 0);
  assert.equal(evaluateAdvisorProhibitionGuard(advisorChild, {
    resolveGitCommonDirFn: () => "/private/git-common",
    resolveParentDispatchToolUseIdFn: () => ({ status: "prepared", toolUseId: "parent-1" }),
    resolvePendingAdvisorProhibitionBindingFn: () => ({ status: "not-bound" }),
  }).exitCode, 0);
});

manualCheck("GD2j an exactly bound prohibited child is content-free audited and blocked", () => {
  let auditInput;
  const result = evaluateAdvisorProhibitionGuard(advisorChild, {
    resolveGitCommonDirFn: () => "/private/git-common",
    resolveParentDispatchToolUseIdFn: () => ({ status: "prepared", toolUseId: "parent-1" }),
    resolvePendingAdvisorProhibitionBindingFn: () => ({ status: "bound", binding: { disposition: "prohibited", promptSha256: "a".repeat(64) } }),
    persistAdvisorProhibitionAuditFn: (input) => { auditInput = input; return { status: "recorded" }; },
    nowFn: () => "2026-09-12T12:00:00.000Z",
  });
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, new RegExp(ADVISOR_PROHIBITION_DENIAL_CODE, "u"));
  assert.doesNotMatch(JSON.stringify(auditInput), /PRIVATE QUESTION/u);
});

manualCheck("GD2k audit failure remains blocked before a model call", () => {
  const result = evaluateAdvisorProhibitionGuard(advisorChild, {
    resolveGitCommonDirFn: () => "/private/git-common",
    resolveParentDispatchToolUseIdFn: () => ({ status: "prepared", toolUseId: "parent-1" }),
    resolvePendingAdvisorProhibitionBindingFn: () => ({ status: "bound", binding: { disposition: "prohibited", promptSha256: "a".repeat(64) } }),
    persistAdvisorProhibitionAuditFn: () => ({ status: "rejected", code: "APB-AUDIT-WRITE" }),
  });
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /APB-AUDIT-WRITE/u);
});

manualCheck("GD2l the real Claude hook path resolves the dispatch carrier, denies, and emits a content-free audit", () => {
  const transcriptPath = join(bindingRepo, "session.jsonl");
  const metaDir = join(bindingRepo, "session", "subagents");
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(transcriptPath, "");
  writeFileSync(join(metaDir, "agent-child-1.meta.json"), JSON.stringify({
    agentType: "pipeline-core:critic", description: "fixture", toolUseId: prohibitedToolUseId, spawnDepth: 1,
  }));
  const secret = "PRIVATE-ADVISOR-QUESTION-DO-NOT-PERSIST";
  const res = spawnSync(process.execPath, [ADVISOR_GUARD], {
    input: JSON.stringify({ ...advisorChild, transcript_path: transcriptPath, tool_input: { question: secret } }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: bindingRepo },
  });
  assert.equal(res.status, 2, res.stderr);
  assert.match(res.stderr, new RegExp(ADVISOR_PROHIBITION_DENIAL_CODE, "u"));
  const auditDir = join(bindingRepo, ".git", "agent-pipeline", "advisor-prohibition", "audit");
  const audits = readdirSync(auditDir).map((name) => readFileSync(join(auditDir, name), "utf8"));
  assert.equal(audits.length, 1);
  assert.doesNotMatch(audits[0], new RegExp(secret, "u"));
});

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
  tool_use_id: "gd8",
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: filledTemplateBody("templates/prompts/critic-review.md") },
}, ALLOW);

check("GD9 the real goldfish-task.md template, filled, is dispatchable", {
  tool_use_id: "gd9",
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
  tool_use_id: "gd11",
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

check("GD15a block a direct Agent packet with no role before launch", {
  tool_name: "Agent",
  tool_input: { prompt: "do work" },
}, BLOCK, { stderrIncludes: ["DISPATCH-ROLE-REQUIRED", '"modelCalls":0'] });

check("GD15b block a shipped direct role with no prompt before launch", {
  tool_name: "Agent",
  tool_input: { subagent_type: "pipeline-core:consult-advisor", prompt: "" },
}, BLOCK, { stderrIncludes: ["DISPATCH-PROMPT-REQUIRED", '"phase":"packet"'] });

check("GD15c block an unknown namespaced role before launch", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic-typo", prompt: CLEAN_CRITIC },
}, BLOCK, { stderrIncludes: ["DISPATCH-ROLE-UNKNOWN", '"status":"rejected"'] });

check("GD15d block a statically visible Workflow role without the plugin prefix", {
  tool_name: "Workflow",
  tool_input: { script: "agent({ agentType: 'consult-advisor', prompt: 'inspect the supplied paths' })" },
}, BLOCK, { stderrIncludes: ["DISPATCH-AGENT-TYPE-PREFIX", "pipeline-core:consult-advisor"] });

check("GD15e block malformed Antigravity entries before launch", {
  tool_name: "invoke_subagent",
  tool_input: { Subagents: [{ TypeName: "critic" }] },
}, BLOCK, { stderrIncludes: ["DISPATCH-ROLE-REQUIRED", '"modelCalls":0'] });

check("GD15f block an empty Antigravity batch before launch", {
  tool_name: "invoke_subagent",
  tool_input: { Subagents: [] },
}, BLOCK, { stderrIncludes: ["DISPATCH-ROLE-REQUIRED", '"modelCalls":0'] });

check("GD15g block a Codex critic packet carrying a claims list", {
  tool_name: "spawn_agent",
  tool_input: { agent_type: "critic", message: `${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x`, task_name: "review" },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-CLAIMS-LIST", '"modelCalls":0'] });

check("GD15h allow an ordinary Codex worker packet", {
  tool_name: "spawn_agent",
  tool_input: { agent_type: "worker", message: "Implement the bounded task.", task_name: "implementation" },
}, ALLOW);

check("GD15i allow Codex to use its valid default role when agent_type is omitted", {
  tool_name: "spawn_agent",
  tool_input: { message: "Inspect the bounded question.", task_name: "inspection" },
}, ALLOW);

check("GD15j block a Codex packet with no message before launch", {
  tool_name: "spawn_agent",
  tool_input: { agent_type: "worker", task_name: "missing-message" },
}, BLOCK, { stderrIncludes: ["DISPATCH-PROMPT-REQUIRED", '"phase":"packet"'] });

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
  tool_use_id: "gd18",
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: CLEAN_CRITIC },
}, ALLOW);

check("GD18a block a budget-bearing Claude dispatch without its parent tool-use id before launch", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", prompt: CLEAN_CRITIC },
}, BLOCK, { stderrIncludes: ["DBB-PARENT-TOOL-USE-ID-MISSING"] });

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

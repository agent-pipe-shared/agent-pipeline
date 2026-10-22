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
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { recordConsentGiven } from "../lib/onboarding-consent-marker.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { resolveGovernedItemQueue } from "../lib/native-goldfish-host-state.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE, parseNativeGoldfishBriefing } from "../lib/native-goldfish-host-return.mjs";

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
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."); mkdirSync(join(repoRoot, "scratch"), { recursive: true }); // a fresh checkout has no scratch/
const bindingRepo = mkdtempSync(join(repoRoot, "scratch", "guard-dispatch-binding-"));
execFileSync("git", ["init", "-q"], { cwd: bindingRepo });
mkdirSync(join(bindingRepo, ".claude"), { recursive: true });
recordConsentGiven({ rootDir: bindingRepo });
// The fixture is an ENROLLED project that says so explicitly: it carries the project authority files the production
// resolver reads (resolveProjectAuthorityPaths) with no active feature and no slice queue, i.e. enrolled but NOT item
// governed. Consent alone is not enough: without these two files the resolver finds no authority and refuses every
// productive Goldfish dispatch SQ-AUTHORITY-UNAVAILABLE before the briefing is even judged (GD4 never reached
// DISPATCH-INCOMPLETE-BRIEFING and GD9 was refused as a governed-item failure). Same shape as itemBackgroundRepo(false).
writeFileSync(join(bindingRepo, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
writeFileSync(join(bindingRepo, ".claude", "pipeline-state.json"), JSON.stringify({ schema: "pipeline.state.v0" }));
assert.equal(observeGovernanceScope({ rootDir: bindingRepo }).requiresEnforcement, true,
  "guard fixture must be admitted through canonical governance enrollment");
assert.equal(resolveGovernedItemQueue({ root: bindingRepo }).status, "not-applicable",
  "the shared guard fixture must be enrolled but not item-governed, or GD4/GD9 would test the governed-admission branch instead");
process.once("exit", () => rmSync(bindingRepo, { recursive: true, force: true }));

// `modelId`/`effort` default to the Design-tier values this helper always used. A Critic dispatch that selects Opus is
// admitted only with an MP-07 batch scope AND a critical-architecture/security rationale (dispatch-policy), so a case that
// fills the Critic template overrides these with the implement-tier model rather than inventing a rationale line.
function filledTemplateBody(relativePath, { modelId = "claude-opus-5", effort = "max" } = {}) {
  const raw = readFileSync(join(repoRoot, relativePath), "utf8");
  const marker = "COPY EVERYTHING BELOW THIS LINE\n-->";
  const markerIndex = raw.indexOf(marker);
  assert.ok(markerIndex >= 0, `${relativePath}: copy marker not found -- template shape changed`);
  let body = raw.slice(markerIndex + marker.length);
  body = body.replace(/\{\{MODEL_ID\}\}/g, modelId);
  body = body.replace(/\{\{EFFORT\}\}/g, effort);
  body = body.replace(/\{\{MODEL_EFFORT[^{}]*\}\}/g, "claude-sonnet-5 / medium");
  body = body.replace(/\{\{TOOL_BUDGET[^{}]*\}\}/g, "≤24 tool uses");
  body = body.replace(/\{\{[^{}]*\}\}/g, "FILLED");
  return body;
}

const cases = [];
function register(name, run) {
  const id = `GD${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({ id, name, run });
}
function run(payload, projectDir = bindingRepo) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}
function check(id, payload, expectExit, { stderrIncludes, projectDir } = {}) {
  register(id, () => {
    const { code, stderr } = run(payload, projectDir);
    assert.equal(code, expectExit, `exit ${code} (expected ${expectExit}) -- ${stderr.trim().slice(0, 200)}`);
    for (const needle of [].concat(stderrIncludes ?? [])) assert.ok(stderr.includes(needle), `stderr missing "${needle}"`);
  });
}
function manualCheck(id, fn) {
  register(id, fn);
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
function nativeCodexWorkerPrompt(extra = {}) {
  const binding = { schema: "pipeline.native-goldfish-host-briefing.v2", dispatchId: "GD-CODEX-WORKER",
    candidateCommit: "a".repeat(40), candidateTree: "b".repeat(40), runner: "codex",
    role: "pipeline-core:goldfish-implementor", nativeAgentType: "worker", model: "gpt-6-luna", effort: "high",
    rulesetSha: "c".repeat(64), allowedPaths: ["src/change.mjs"],
    criticDecision: { schema: "pipeline.critic-required-decision.v1",
      trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
        diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" }, ...extra };
  return `<!-- pipeline-native-goldfish-host-commit:v2\n${JSON.stringify(binding)}\n-->\nNATIVE HOST-COMMIT RULE: Do not run git add, git commit, or write a dispatch-record; return the exact JSON contract below and leave all changes uncommitted for the host.`;
}

// GD1 -- the failure this hook exists for, at the hook boundary.
check("GD1 block  a Critic dispatch carrying a claims list", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt: `${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x` },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-CLAIMS-LIST", "templates/prompts/critic-review.md"] });

check("GD2 allow  a references-only Critic dispatch", {
  tool_use_id: "gd2",
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt: CLEAN_CRITIC },
}, ALLOW);

const prohibitedToolUseId = "gd2-advisor-prohibited";
check("GD2a allow and bind a policy-clean Critic dispatch carrying the exact Advisor prohibition", {
  tool_use_id: prohibitedToolUseId,
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt: `${CLEAN_CRITIC}\n- ${ADVISOR_PROHIBITION_LINE} (MP-26)` },
}, ALLOW);
manualCheck("GD2b the pre-launch carrier contains only the exact role, disposition and prompt digest", () => {
  const key = createHash("sha256").update(prohibitedToolUseId).digest("hex");
  const path = join(bindingRepo, ".git", "agent-pipeline", "advisor-prohibition", "pending", `${key}.json`);
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
  assert.deepEqual(problems, []);
});

check("GD2c block a prohibition-bearing child whose parent tool-use id is absent", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt: `${CLEAN_CRITIC}\n- ${ADVISOR_PROHIBITION_LINE} (MP-26)` },
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

// Host built-in agent types (Explore/Plan/general-purpose) must not be refused by the Advisor binding.
for (const builtIn of ["Explore", "Plan", "general-purpose"]) {
  check(`GD2i allow a ${builtIn} dispatch without a prohibition line (exact live tool_input shape)`, {
    tool_use_id: `gd2i-${builtIn}`,
    tool_name: "Agent",
    tool_input: { subagent_type: builtIn, model: "sonnet", description: "read-only research", prompt: "Read the repository and report where X is defined." },
  }, ALLOW);
}
check("GD2j allow a batch of two Explore dispatches without a prohibition line", {
  tool_use_id: "gd2j",
  tool_name: "Workflow",
  tool_input: { script: `
    agent({ agentType: 'Explore', prompt: 'Read a and report.' })
    agent({ agentType: 'Explore', prompt: 'Read b and report.' })
  ` },
}, ALLOW);

manualCheck("GD2k built-in role spellings bind case-preservingly when the prohibition line is present", () => {
  const root = mkdtempSync(join(tmpdir(), "advisor-prohibition-builtin-"));
  try {
    const prepared = prepareAdvisorProhibitionBindings([
      { subagentType: "Explore", prompt: `- ${ADVISOR_PROHIBITION_LINE} (MP-26)` },
      { subagentType: "pipeline-core:goldfish-implementor", prompt: "ordinary child" },
    ]);
    assert.equal(prepared.status, "prepared");
    assert.deepEqual(prepared.bindings.map(({ agentType, disposition }) => [agentType, disposition]), [
      ["Explore", "prohibited"], ["goldfish-implementor", "unrestricted"],
    ]);
    assert.equal(persistPendingAdvisorProhibitionBindings({ commonDir: root, toolUseId: "parent-b", bindings: prepared.bindings }).status, "prepared");
    assert.equal(resolvePendingAdvisorProhibitionBinding({ commonDir: root, toolUseId: "parent-b", agentType: "Explore" }).binding.disposition, "prohibited");
    assert.equal(resolvePendingAdvisorProhibitionBinding({ commonDir: root, toolUseId: "parent-b", agentType: "explore" }).status, "not-bound");
    const plan = prepareAdvisorProhibitionBindings([{ subagentType: "Plan", prompt: `${ADVISOR_PROHIBITION_LINE}` }]);
    assert.deepEqual(plan.bindings.map(({ agentType, disposition }) => [agentType, disposition]), [["Plan", "prohibited"]]);
    assert.equal(prepareAdvisorProhibitionBindings([
      { subagentType: "Explore", prompt: "a" }, { subagentType: "Explore", prompt: "b" },
    ]).code, "APB-NO-PROHIBITION");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

manualCheck("GD2l an unparseable role gets its own code naming the value", () => {
  for (const bad of ["", "  ", "bad role", "Exp\u0007lore", 42, undefined]) {
    const prepared = prepareAdvisorProhibitionBindings([{ subagentType: bad, prompt: `- ${ADVISOR_PROHIBITION_LINE}` }]);
    assert.equal(prepared.status, "rejected");
    assert.equal(prepared.code, "APB-ROLE-UNPARSEABLE");
    assert.doesNotMatch(prepared.message, /\u0007/u);
  }
  const long = prepareAdvisorProhibitionBindings([{ subagentType: `x y${"z".repeat(500)}`, prompt: `- ${ADVISOR_PROHIBITION_LINE}` }]);
  assert.ok(long.message.length < 300);
  assert.match(prepareAdvisorProhibitionBindings([{ subagentType: "bad role", prompt: `- ${ADVISOR_PROHIBITION_LINE}` }]).message, /"bad role"/u);
  // Without a prohibition line the same role is not this guard's business.
  assert.equal(prepareAdvisorProhibitionBindings([{ subagentType: "bad role", prompt: "x" }]).status, "not-applicable");
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
  tool_input: { subagentType: "pipeline-core:critic", model: "opus", prompt: `${CLEAN_CRITIC}\n\nADVERSARIAL FOCUS: look here.` },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-HUNT-LIST"] });

check("GD4 block  an incomplete Goldfish briefing", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:goldfish-implementor", model: "sonnet", prompt: "Please fix the thing. Model: claude-sonnet-5." },
}, BLOCK, { stderrIncludes: ["DISPATCH-INCOMPLETE-BRIEFING", "GOAL"] });

// GD5 -- roles with no template contract are not this hook's business.
check("GD5 allow  an unrelated subagent type", {
  tool_name: "Task",
  tool_input: { subagent_type: "general-purpose", model: "sonnet", prompt: "find where X is defined" },
}, ALLOW);

// GD6/GD7 -- fail-open. A guard that cannot read its input has no opinion, and a broken
// hook must never become a work stoppage.
check("GD6 allow  a payload with no tool_input", { tool_name: "Task" }, ALLOW);
check("GD7 allow  a dispatch with no subagent type", { tool_input: { prompt: "anything" } }, ALLOW);

// GD8/GD9 -- the real templates, filled, must be dispatchable at the hook boundary too.
check("GD8 the real critic-review.md template, filled, is dispatchable", {
  tool_use_id: "gd8",
  tool_name: "Task",
  // Mirrors dispatch-policy.test.mjs DP11: a filled Critic template at the implement-tier model needs no Opus rationale.
  tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt: filledTemplateBody("templates/prompts/critic-review.md", { modelId: "claude-sonnet-5", effort: "max" }) },
}, ALLOW);

check("GD9 the real goldfish-task.md template, filled, is dispatchable", {
  tool_use_id: "gd9",
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:goldfish-implementor", model: "sonnet", prompt: filledTemplateBody("templates/prompts/goldfish-task.md") },
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
  tool_input: { model: "sonnet", prompt: "do work" },
}, BLOCK, { stderrIncludes: ["DISPATCH-ROLE-REQUIRED", '"modelCalls":0'] });

check("GD15b block a shipped direct role with no prompt before launch", {
  tool_name: "Agent",
  tool_input: { subagent_type: "pipeline-core:consult-advisor", model: "sonnet", prompt: "" },
}, BLOCK, { stderrIncludes: ["DISPATCH-PROMPT-REQUIRED", '"phase":"packet"'] });

check("GD15c block an unknown namespaced role before launch", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic-typo", model: "sonnet", prompt: CLEAN_CRITIC },
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
manualCheck("GD16 extractWorkflowDispatches is importable and callable directly, via a subprocess, with no in-process import of the hook module", () => {
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
    assert.deepEqual(problems, []);
  } finally {
    rmSync(runnerDir, { recursive: true, force: true });
  }
});

check("GD17 block  via the real path, a refusable dispatch still refuses after the entrypoint gate", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt: `${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x` },
}, BLOCK, { stderrIncludes: ["DISPATCH-CONTAMINATION-CLAIMS-LIST", "templates/prompts/critic-review.md"] });

check("GD18 allow  via the real path, an admissible dispatch still admits after the entrypoint gate", {
  tool_use_id: "gd18",
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt: CLEAN_CRITIC },
}, ALLOW);

check("GD18a block a budget-bearing Claude dispatch without its parent tool-use id before launch", {
  tool_name: "Task",
  tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt: CLEAN_CRITIC },
}, BLOCK, { stderrIncludes: ["DBB-PARENT-TOOL-USE-ID-MISSING"] });

manualCheck("GD19 block  invoked through a symlink to the module, the hook still refuses (the 2026-08-06 failure shape)", () => {
  const linkDir = mkdtempSync(join(tmpdir(), "guard-dispatch-link-"));
  try {
    const linked = join(linkDir, "guard-dispatch.mjs");
    symlinkSync(GUARD, linked);
    const payload = {
      tool_name: "Task",
      tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt: `${CLEAN_CRITIC}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x` },
    };
    const res = spawnSync(process.execPath, [linked], { input: JSON.stringify(payload), encoding: "utf8" });
    const stderr = res.stderr ?? "";
    const problems = [];
    if (res.status !== BLOCK) problems.push(`exit ${res.status} (expected ${BLOCK}) through the symlink -- ${stderr.trim().slice(0, 200)}`);
    if (!stderr.includes("DISPATCH-CONTAMINATION-CLAIMS-LIST")) problems.push("stderr missing DISPATCH-CONTAMINATION-CLAIMS-LIST through the symlink");
    if (res.status === 0 && stderr === "") problems.push("silent no-op through the symlink -- exit 0 means ALLOW");
    assert.deepEqual(problems, []);
  } finally {
    rmSync(linkDir, { recursive: true, force: true });
  }
});

// GD20 -- NVA-B-SLICINGRUNNER-1: extractAntigravityDispatches is now exported the same way
// extractWorkflowDispatches was (adc165bb/GD16 above) -- same subprocess-only proof, for the same
// reason documented at the top of this file: a module-scope import here would be safe only as
// long as the entrypoint gate stays in place, and a regression of that gate must fail this case
// loudly (missing success marker) rather than silently vanish this whole file's coverage.
manualCheck("GD20 extractAntigravityDispatches is importable and callable directly, via a subprocess, with no in-process import of the hook module", () => {
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
    assert.deepEqual(problems, []);
  } finally {
    rmSync(runnerDir, { recursive: true, force: true });
  }
});

// GD21-GD27 -- ALF-C-P19-05C / V-10: the route digest is bound to the briefing INLINE in the dispatch. A route
// record `evidence/dispatch-route-<sliceId>.json` carries the digest; the guard hashes the canonical inline
// briefing (CRLF -> LF, nothing else) and refuses a mismatch typed. The expected digests below are computed
// here with createHash directly, so the cases do not depend on the guard's own digest function being right.
const routeSha = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
const routePrompt = (sliceId) => `${CLEAN_CRITIC}\n- **Slice:** ${sliceId}`;
function writeRoute(sliceId, record) {
  mkdirSync(join(bindingRepo, "evidence"), { recursive: true });
  writeFileSync(join(bindingRepo, "evidence", `dispatch-route-${sliceId}.json`),
    typeof record === "string" ? record : `${JSON.stringify(record)}\n`);
}
const routeRecord = (sliceId, text) => ({ schema: "pipeline.dispatch-briefing-route.v1", sliceId, briefingSha256: routeSha(text) });
const routeDispatch = (toolUseId, prompt) => ({
  tool_use_id: toolUseId, tool_name: "Task", tool_input: { subagent_type: "pipeline-core:critic", model: "opus", prompt },
});

manualCheck("GD21 allow  the inline briefing hashes to the digest its route record carries", () => {
  const prompt = routePrompt("GD-ROUTE-MATCH");
  writeRoute("GD-ROUTE-MATCH", routeRecord("GD-ROUTE-MATCH", prompt));
  const { code, stderr } = run(routeDispatch("gd21", prompt));
  assert.equal(code, ALLOW, stderr.slice(0, 300));
});

manualCheck("GD22 block  a one-byte-changed inline briefing, typed, naming the expected and the observed digest", () => {
  const prompt = routePrompt("GD-ROUTE-BYTE");
  writeRoute("GD-ROUTE-BYTE", routeRecord("GD-ROUTE-BYTE", prompt));
  const changed = prompt.replace("risk class high", "risk class hugh");
  assert.equal(changed.length, prompt.length);
  const { code, stderr } = run(routeDispatch("gd22", changed));
  assert.equal(code, BLOCK, stderr.slice(0, 300));
  for (const needle of ["DISPATCH-BRIEFING-DIGEST-MISMATCH", routeSha(prompt), routeSha(changed), "evidence/dispatch-route-GD-ROUTE-BYTE.json"]) {
    assert.ok(stderr.includes(needle), `stderr missing "${needle}"`);
  }
});

manualCheck("GD23 allow  a CRLF copy of the routed briefing (the canonical form is LF; nothing else is normalised)", () => {
  const prompt = routePrompt("GD-ROUTE-CRLF");
  writeRoute("GD-ROUTE-CRLF", routeRecord("GD-ROUTE-CRLF", prompt));
  const crlf = run(routeDispatch("gd23", prompt.replace(/\n/g, "\r\n")));
  assert.equal(crlf.code, ALLOW, crlf.stderr.slice(0, 300));
  const trailing = run(routeDispatch("gd23b", `${prompt}\n`)); // a trailing newline IS a different briefing
  assert.equal(trailing.code, BLOCK, trailing.stderr.slice(0, 300));
  assert.ok(trailing.stderr.includes("DISPATCH-BRIEFING-DIGEST-MISMATCH"));
});

manualCheck("GD24 allow  no route digest: a slice without a record, or a briefing without a Slice line, is unchanged", () => {
  writeRoute("GD-ROUTE-OTHER", routeRecord("GD-ROUTE-OTHER", routePrompt("GD-ROUTE-OTHER")));
  const unrouted = run(routeDispatch("gd24", routePrompt("GD-ROUTE-NONE").replace("risk class high", "risk class hugh")));
  assert.equal(unrouted.code, ALLOW, unrouted.stderr.slice(0, 300));
  const sliceless = run(routeDispatch("gd24b", CLEAN_CRITIC));
  assert.equal(sliceless.code, ALLOW, sliceless.stderr.slice(0, 300));
});

manualCheck("GD25 block  a route record that exists but cannot be verified refuses typed, never reads as no route", () => {
  const prompt = routePrompt("GD-ROUTE-BAD");
  const good = routeRecord("GD-ROUTE-BAD", prompt);
  const variants = {
    "not JSON": "{ not json\n",
    "another slice's record": { ...good, sliceId: "GD-ROUTE-ELSE" },
    "an extra key": { ...good, note: "x" },
    "a short digest": { ...good, briefingSha256: good.briefingSha256.slice(0, 63) },
    "an upper-case digest": { ...good, briefingSha256: good.briefingSha256.toUpperCase() },
    "another schema": { ...good, schema: "pipeline.dispatch-briefing-route.v0" },
    "an array": [good],
  };
  let n = 0;
  for (const [label, record] of Object.entries(variants)) {
    writeRoute("GD-ROUTE-BAD", record);
    n += 1;
    const { code, stderr } = run(routeDispatch(`gd25-${n}`, prompt));
    assert.equal(code, BLOCK, `${label}: ${stderr.slice(0, 200)}`);
    assert.ok(stderr.includes("DISPATCH-BRIEFING-ROUTE-INVALID"), `${label}: ${stderr.slice(0, 200)}`);
  }
});

manualCheck("GD26 block  the existing contamination finding still wins over the route check", () => {
  const prompt = `${routePrompt("GD-ROUTE-POLICY")}\n\nWHAT THE CHANGE CLAIMS (verify each):\n 1. x`;
  writeRoute("GD-ROUTE-POLICY", routeRecord("GD-ROUTE-POLICY", "a different briefing"));
  const { code, stderr } = run(routeDispatch("gd26", prompt));
  assert.equal(code, BLOCK);
  assert.ok(stderr.includes("DISPATCH-CONTAMINATION-CLAIMS-LIST") && !stderr.includes("DISPATCH-BRIEFING-DIGEST-MISMATCH"), stderr.slice(0, 300));
});

// GD28 -- ALF-C-V10-WIRE3: the guard's own admission record carries ONE optional extra key, origin "admission". It is
// accepted by the route check and read back with its provenance; any other origin value stays unverifiable (GD25 keeps
// every other extra key invalid). A dispatch that is not itself recorded (a Critic) cannot supersede such a record: its
// mismatch is refused typed, exactly as against a producer record.
manualCheck("GD28 allow/block  an origin-admission route record binds a non-recorded dispatch; another origin value is unverifiable", () => {
  const prompt = routePrompt("GD-ROUTE-ADMISSION");
  const admission = { ...routeRecord("GD-ROUTE-ADMISSION", prompt), origin: "admission" };
  writeRoute("GD-ROUTE-ADMISSION", admission);
  const matched = run(routeDispatch("gd28a", prompt));
  assert.equal(matched.code, ALLOW, matched.stderr.slice(0, 300));
  const changed = prompt.replace("risk class high", "risk class hugh");
  const refused = run(routeDispatch("gd28b", changed));
  assert.equal(refused.code, BLOCK, refused.stderr.slice(0, 300));
  for (const needle of ["DISPATCH-BRIEFING-DIGEST-MISMATCH", routeSha(prompt), routeSha(changed)]) {
    assert.ok(refused.stderr.includes(needle), `stderr missing "${needle}"`);
  }
  writeRoute("GD-ROUTE-ADMISSION", { ...admission, origin: "preflight" });
  const other = run(routeDispatch("gd28c", prompt));
  assert.equal(other.code, BLOCK, other.stderr.slice(0, 300));
  assert.ok(other.stderr.includes("DISPATCH-BRIEFING-ROUTE-INVALID"), other.stderr.slice(0, 300));
});

// GD27 -- the digest definition is exported ONCE and reused: subprocess-only, same hardening as GD16/GD20.
manualCheck("GD27 briefingSha256 / buildBriefingRoute are importable, share one canonical form, and refuse unusable input", () => {
  const successMarker = "GD27-IMPORT-OK";
  const runnerDir = mkdtempSync(join(tmpdir(), "guard-dispatch-route-export-check-"));
  try {
    const runnerPath = join(runnerDir, "import-check.mjs");
    writeFileSync(runnerPath, [
      "const mod = await import(process.argv[2]);",
      "const lf = 'a\\nb\\n', crlf = 'a\\r\\nb\\r\\n';",
      "const route = mod.buildBriefingRoute({ sliceId: 'S-1', briefing: crlf });",
      "const refusals = [];",
      "for (const bad of [{ sliceId: '../x', briefing: lf }, { sliceId: 'S-1', briefing: '' }, {}]) {",
      "  try { mod.buildBriefingRoute(bad); refusals.push('admitted'); } catch { refusals.push('refused'); }",
      "}",
      "const none = mod.evaluateBriefingRoute({ prompt: 'no slice line here', root: process.argv[3] });",
      "console.log('GD27-RESULT: ' + JSON.stringify({ same: mod.briefingSha256(lf) === mod.briefingSha256(crlf), digest: mod.briefingSha256(lf), route, refusals, none: none.status }));",
      `console.log('${successMarker}');`,
    ].join("\n"));
    const res = spawnSync(process.execPath, [runnerPath, pathToFileURL(GUARD).href, bindingRepo], { input: "", encoding: "utf8", timeout: 10000 });
    const stdout = res.stdout ?? "";
    const problems = [];
    if (res.status !== 0) problems.push(`child exited ${res.status} (expected 0) -- ${(res.stderr ?? "").trim().slice(0, 200)}`);
    if (!stdout.includes(successMarker)) problems.push(`child stdout missing success marker "${successMarker}" -- got ${JSON.stringify(stdout)}`);
    const expectedLine = `GD27-RESULT: ${JSON.stringify({ same: true, digest: routeSha("a\nb\n"),
      route: { schema: "pipeline.dispatch-briefing-route.v1", sliceId: "S-1", briefingSha256: routeSha("a\nb\n") },
      refusals: ["refused", "refused", "refused"], none: "none" })}`;
    if (!stdout.split("\n").includes(expectedLine)) problems.push(`child stdout missing the exact line "${expectedLine}" -- got ${JSON.stringify(stdout)}`);
    assert.deepEqual(problems, []);
  } finally {
    rmSync(runnerDir, { recursive: true, force: true });
  }
});

// GD57-GD60 -- ALF-C-C6G2-CORR-A / Critic C6g2 finding F1: the background-only fallback of an item-governed
// marked Claude dispatch is for a runtime that carries NO `run_in_background` key at all. The host-state code
// NGHS-CLAUDE-FOREGROUND-REQUIRED fires for ANY value that is not exactly `false` (absent OR true), so the code alone
// cannot tell "this runtime has no such parameter" from "the caller explicitly asked for a background launch".
// The item-governed fixture is its own scratch repository (the shared bindingRepo above must stay un-governed);
// every git call it makes sets GIT_CEILING_DIRECTORIES to the fixture parent and the repo owns its own `git init`.
const ITEM_BACKGROUND_SLICE = "GD-ITEM-BG";
const ITEM_BACKGROUND_CANDIDATE = "a".repeat(40);
const FOREGROUND_CODE = "NGHS-CLAUDE-FOREGROUND-REQUIRED";
const backgroundFixtures = new Map();
// `itemGoverned: true` is an enrolled project with an approved course and a v2 delivery queue (the guard resolves it as
// a required item queue); `false` is the same enrolled project with no active feature (no approved course, no queue).
function itemBackgroundRepo(itemGoverned = true) {
  if (backgroundFixtures.has(itemGoverned)) return backgroundFixtures.get(itemGoverned);
  const parent = join(repoRoot, "scratch");
  mkdirSync(parent, { recursive: true });
  const root = realpathSync(mkdtempSync(join(parent, "guard-dispatch-item-")));
  process.once("exit", () => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: parent };
  execFileSync("git", ["init", "-q"], { cwd: root, env });
  mkdirSync(join(root, ".claude"), { recursive: true });
  recordConsentGiven({ rootDir: root });
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  writeFileSync(join(root, ".claude", "pipeline-state.json"), JSON.stringify(itemGoverned ? {
    schema: "pipeline.state.v0",
    activeFeature: { id: "unit", planPath: "specs/unit/plan.md", phase: "implementation" },
    planApproved: true,
  } : { schema: "pipeline.state.v0" }));
  if (itemGoverned) {
    mkdirSync(join(root, "specs", "unit"), { recursive: true });
    writeFileSync(join(root, "specs", "unit", "slice-queue.json"), JSON.stringify({
      schema: "pipeline.slice-queue.v2", feature: "unit",
      slices: [{ id: ITEM_BACKGROUND_SLICE, title: ITEM_BACKGROUND_SLICE, state: "ready", dependsOn: [], writeScope: ["src/change.mjs"],
        tier: "implementor", commitMode: "diff-only", loadClass: "light",
        delivery: { itemId: "AC-1", criteria: ["CR-1"], baseCommit: ITEM_BACKGROUND_CANDIDATE } }],
    }));
  }
  // The fixture must really be (or not be) item-governed, or the cases below would prove nothing about the branch.
  assert.equal(resolveGovernedItemQueue({ root }).status, itemGoverned ? "required" : "not-applicable",
    `the ${itemGoverned ? "item-governed" : "non-item-governed"} fixture must resolve accordingly`);
  const fixture = { root, parent };
  backgroundFixtures.set(itemGoverned, fixture);
  return fixture;
}
function markedGoldfishPrompt() {
  const binding = { schema: "pipeline.native-goldfish-host-briefing.v1", dispatchId: ITEM_BACKGROUND_SLICE,
    candidateCommit: ITEM_BACKGROUND_CANDIDATE, candidateTree: "b".repeat(40), runner: "claude",
    role: "pipeline-core:goldfish-implementor", agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
    rulesetSha: "c".repeat(64), allowedPaths: ["src/change.mjs"],
    criticDecision: { schema: "pipeline.critic-required-decision.v1",
      trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
        diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T4" } };
  // The filled goldfish-task body already carries the exact directive once; the parser demands exactly one.
  const body = filledTemplateBody("templates/prompts/goldfish-task.md");
  const prompt = [
    `<!-- pipeline-native-goldfish-host-commit:v1\n${JSON.stringify(binding)}\n-->`,
    body.includes(NATIVE_GOLDFISH_HOST_DIRECTIVE) ? body : `${NATIVE_GOLDFISH_HOST_DIRECTIVE}\n${body}`,
    `Slice: ${ITEM_BACKGROUND_SLICE}`,
    "Write scope: src/change.mjs",
    "",
  ].join("\n");
  assert.equal(parseNativeGoldfishBriefing(prompt).ok, true, "the marked briefing must parse, or the cases never reach the background branch");
  return prompt;
}
// `background` is spread into tool_input: `{}` carries no run_in_background key at all.
function markedGoldfishDispatch(root, toolUseId, background) {
  return { cwd: root, session_id: "gd-item-session", tool_name: "Agent", tool_use_id: toolUseId,
    tool_input: { subagent_type: "pipeline-core:goldfish-implementor", model: "sonnet", prompt: markedGoldfishPrompt(), ...background } };
}
function runAt(payload, root, env = {}) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: root },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}
function pendingNativeStates(root) {
  const directory = join(root, ".git", "agent-pipeline", "run", "native-goldfish-host-commit");
  return existsSync(directory) ? readdirSync(directory).filter((name) => name.startsWith("pending-")) : [];
}
const FOREGROUND_WARNING = `WARNING (guard-dispatch): native host-commit preparation failed (${FOREGROUND_CODE}); dispatch continues, the child must leave changes uncommitted, and no authorship record will be claimed.`;

// D19 (PF-26) re-pin of the ALF-G2C2A keyless refusal: with the SubagentStop route REGISTERED (the shipped hooks.json this
// real guard reads) a keyless item-governed dispatch takes the SubagentStop route like an explicit true and stops only at
// the next preparation step (the candidate check); with the route UNREGISTERED it keeps the WARNING and claims no authorship.
manualCheck("GD57 block  D19: an item-governed marked Claude dispatch with NO run_in_background key passes the foreground check while the route is registered (stops at the candidate check); UNREGISTERED it continues with the WARNING and claims no authorship", () => {
  const { root, parent } = itemBackgroundRepo();
  const registered = runAt(markedGoldfishDispatch(root, "gd57", {}), root, { GIT_CEILING_DIRECTORIES: parent });
  assert.ok(!registered.stderr.includes(FOREGROUND_CODE), `a registered completion route must not refuse the keyless launch -- got ${JSON.stringify(registered.stderr.slice(0, 300))}`);
  assert.equal(registered.code, BLOCK, `exit ${registered.code} (expected ${BLOCK}) -- ${registered.stderr.trim().slice(0, 300)}`);
  assert.ok(registered.stderr.includes("BLOCKED (guard-dispatch): NGHS-CANDIDATE-MISMATCH"), `stderr missing NGHS-CANDIDATE-MISMATCH -- got ${JSON.stringify(registered.stderr.slice(0, 300))}`);
  const { code, stderr } = runAtGuard(guardCopyWithHooks("unregistered-pinned", UNREGISTERED_HOOKS), markedGoldfishDispatch(root, "gd57-unregistered", {}), root, { GIT_CEILING_DIRECTORIES: parent });
  assert.equal(code, ALLOW, stderr.trim().slice(0, 300));
  assert.ok(stderr.includes(FOREGROUND_WARNING), `stderr missing the background-only WARNING -- got ${JSON.stringify(stderr.slice(0, 300))}`);
  assert.ok(!stderr.includes("BLOCKED"), stderr.slice(0, 300));
  assert.deepEqual(pendingNativeStates(root), [], "a continued background-only dispatch must leave no native host pending state (no authorship claim)");
});

manualCheck("GD58 block  an item-governed marked Claude dispatch with an EXPLICIT run_in_background: true stays blocked (typed, no WARNING fallback)", () => {
  const { root, parent } = itemBackgroundRepo();
  const { code, stderr } = runAtGuard(guardCopyWithHooks("unregistered-pinned", UNREGISTERED_HOOKS), markedGoldfishDispatch(root, "gd58", { run_in_background: true }), root, { GIT_CEILING_DIRECTORIES: parent });
  assert.equal(code, BLOCK, `exit ${code} (expected ${BLOCK}) -- ${stderr.trim().slice(0, 300)}`);
  assert.ok(stderr.includes(`BLOCKED (guard-dispatch): ${FOREGROUND_CODE}`), `stderr missing the typed BLOCKED code -- got ${JSON.stringify(stderr.slice(0, 300))}`);
  assert.ok(!stderr.includes("WARNING (guard-dispatch): native host-commit preparation failed"), stderr.slice(0, 300));
  assert.deepEqual(pendingNativeStates(root), []);
});

manualCheck("GD59 an item-governed marked Claude dispatch with an explicit run_in_background: false does not fail with NGHS-CLAUDE-FOREGROUND-REQUIRED", () => {
  const { root, parent } = itemBackgroundRepo();
  const { code, stderr } = runAt(markedGoldfishDispatch(root, "gd59", { run_in_background: false }), root, { GIT_CEILING_DIRECTORIES: parent });
  assert.ok(!stderr.includes(FOREGROUND_CODE), `the foreground launch must not be refused as background -- got ${JSON.stringify(stderr.slice(0, 300))}`);
  // The fixture repository has no commit, so preparation proceeds past the foreground gate and the whole item-queue
  // admission and stops at the candidate check: that proves the explicit-false dispatch reached the next preparation step.
  assert.equal(code, BLOCK, `exit ${code} (expected ${BLOCK}) -- ${stderr.trim().slice(0, 300)}`);
  assert.ok(stderr.includes("BLOCKED (guard-dispatch): NGHS-CANDIDATE-MISMATCH"), `stderr missing NGHS-CANDIDATE-MISMATCH -- got ${JSON.stringify(stderr.slice(0, 300))}`);
});

manualCheck("GD60 allow  a marked Claude dispatch that is NOT item-governed is unchanged: key absent and explicit true both continue with the WARNING", () => {
  const { root, parent } = itemBackgroundRepo(false);
  for (const [label, background] of [["key absent", {}], ["explicit true", { run_in_background: true }]]) {
    const { code, stderr } = runAtGuard(guardCopyWithHooks("unregistered-pinned", UNREGISTERED_HOOKS), markedGoldfishDispatch(root, `gd60-${label.replace(/\W+/gu, "-")}`, background), root, { GIT_CEILING_DIRECTORIES: parent });
    assert.equal(code, ALLOW, `${label}: ${stderr.trim().slice(0, 300)}`);
    assert.ok(stderr.includes(FOREGROUND_WARNING), `${label}: stderr missing the WARNING -- got ${JSON.stringify(stderr.slice(0, 300))}`);
    assert.ok(!stderr.includes("BLOCKED"), `${label}: ${stderr.slice(0, 300)}`);
  }
});

// GD61-GD65 -- ALF-G2C2A-BACKGROUND-PENDING-GATE: an explicit `run_in_background: true` is admitted past the foreground
// check ONLY while the Claude SubagentStop completion route is registered. The guard derives that fact from the
// hooks/hooks.json that sits beside the running module (never from cwd, the project or an environment switch). GD58/GD60
// above assert the UNREGISTERED behaviour of an explicit run_in_background: true, so they run a guard copy beside a
// hooks.json with no SubagentStop entry (UNREGISTERED_HOOKS): the shipped hooks.json registers the route, and these two
// must not depend on whether it does. (Their runtime ids are GD59/GD61: ids are positional, the labels are not.)
const UNREGISTERED_HOOKS = "{}";
// The seam for the registered/unregistered variants is the module-location rule itself: a throwaway plugin-shaped
// directory holding a COPY of the guard (its `./` sibling and `../lib` symlinked, so every import still resolves to the real
// code), so the copy's import.meta.url -- and therefore the hooks.json it reads -- is the only thing that differs.
const SUBAGENT_STOP_COMMAND = 'node "${CLAUDE_PLUGIN_ROOT}/hooks/native-goldfish-host.mjs" --runner claude';
const hooksWith = (event, command, type = "command") => JSON.stringify({ hooks: { [event]: [{ hooks: [{ type, command, timeout: 300 }] }] } });
const REGISTERED_HOOKS = hooksWith("SubagentStop", SUBAGENT_STOP_COMMAND);
const guardCopies = new Map();
function guardCopyWithHooks(label, hooksJsonText) {
  if (guardCopies.has(label)) return guardCopies.get(label);
  const parent = join(repoRoot, "scratch");
  mkdirSync(parent, { recursive: true });
  const dir = realpathSync(mkdtempSync(join(parent, "guard-dispatch-copy-")));
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "hooks"));
  copyFileSync(GUARD, join(dir, "hooks", "guard-dispatch.mjs"));
  symlinkSync(join(dirname(GUARD), "guard-dispatch-budget.mjs"), join(dir, "hooks", "guard-dispatch-budget.mjs"));
  symlinkSync(join(dirname(GUARD), "..", "lib"), join(dir, "lib"));
  if (hooksJsonText !== null) writeFileSync(join(dir, "hooks", "hooks.json"), hooksJsonText);
  const guard = join(dir, "hooks", "guard-dispatch.mjs");
  guardCopies.set(label, guard);
  return guard;
}
function runAtGuard(guard, payload, root, env = {}) {
  const res = spawnSync(process.execPath, [guard], {
    input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, ...env, CLAUDE_PROJECT_DIR: root },
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}
const CANDIDATE_WARNING = "WARNING (guard-dispatch): native host-commit preparation failed (NGHS-CANDIDATE-MISMATCH);";

manualCheck("GD61 block  REGISTERED: an item-governed marked Claude dispatch with an explicit run_in_background: true passes the foreground check and stops at the candidate check", () => {
  const { root, parent } = itemBackgroundRepo();
  const guard = guardCopyWithHooks("registered", REGISTERED_HOOKS);
  // Critic F4: an earlier admission's route record, which this briefing supersedes, is written over before the native
  // preparation and restored byte for byte when that preparation refuses.
  const routeFile = join(root, "evidence", `dispatch-route-${ITEM_BACKGROUND_SLICE}.json`);
  const routeBefore = existsSync(routeFile) ? readFileSync(routeFile) : null;
  const earlier = `${JSON.stringify({ schema: "pipeline.dispatch-briefing-route.v1", sliceId: ITEM_BACKGROUND_SLICE, briefingSha256: "0".repeat(64), origin: "admission" })}\n`;
  mkdirSync(join(root, "evidence"), { recursive: true }); writeFileSync(routeFile, earlier);
  try {
    const { code, stderr } = runAtGuard(guard, markedGoldfishDispatch(root, "gd61", { run_in_background: true }), root, { GIT_CEILING_DIRECTORIES: parent });
    assert.ok(!stderr.includes(FOREGROUND_CODE), `a registered completion route must not refuse the background launch -- got ${JSON.stringify(stderr.slice(0, 300))}`);
    assert.equal(code, BLOCK, `exit ${code} (expected ${BLOCK}) -- ${stderr.trim().slice(0, 300)}`);
    assert.ok(stderr.includes("BLOCKED (guard-dispatch): NGHS-CANDIDATE-MISMATCH"), `stderr missing NGHS-CANDIDATE-MISMATCH -- got ${JSON.stringify(stderr.slice(0, 300))}`);
    assert.deepEqual(pendingNativeStates(root), []);
    assert.equal(readFileSync(routeFile, "utf8"), earlier, "the refused dispatch leaves the earlier route record as it was");
  } finally {
    if (routeBefore === null) rmSync(routeFile, { force: true }); else writeFileSync(routeFile, routeBefore);
  }
});

manualCheck("GD62 allow  REGISTERED: a marked Claude dispatch that is NOT item-governed no longer warns with the foreground code for an explicit run_in_background: true", () => {
  const { root, parent } = itemBackgroundRepo(false);
  const guard = guardCopyWithHooks("registered", REGISTERED_HOOKS);
  const { code, stderr } = runAtGuard(guard, markedGoldfishDispatch(root, "gd62", { run_in_background: true }), root, { GIT_CEILING_DIRECTORIES: parent });
  assert.equal(code, ALLOW, stderr.trim().slice(0, 300));
  assert.ok(!stderr.includes(FOREGROUND_CODE), `stderr must not carry the foreground code -- got ${JSON.stringify(stderr.slice(0, 300))}`);
  assert.ok(stderr.includes(CANDIDATE_WARNING), `stderr missing the next-step WARNING -- got ${JSON.stringify(stderr.slice(0, 300))}`);
  assert.ok(!stderr.includes("BLOCKED"), stderr.slice(0, 300));
});

manualCheck("GD63 block  D19 REGISTERED: a MISSING run_in_background key takes the same route as an explicit true (passes the foreground check, stops at the candidate check)", () => {
  const { root, parent } = itemBackgroundRepo();
  const guard = guardCopyWithHooks("registered", REGISTERED_HOOKS);
  const { code, stderr } = runAtGuard(guard, markedGoldfishDispatch(root, "gd63", {}), root, { GIT_CEILING_DIRECTORIES: parent });
  assert.ok(!stderr.includes(FOREGROUND_CODE), `a registered completion route must not refuse the keyless launch -- got ${JSON.stringify(stderr.slice(0, 300))}`);
  assert.equal(code, BLOCK, `exit ${code} (expected ${BLOCK}) -- ${stderr.trim().slice(0, 300)}`);
  assert.ok(stderr.includes("BLOCKED (guard-dispatch): NGHS-CANDIDATE-MISMATCH"), `stderr missing NGHS-CANDIDATE-MISMATCH -- got ${JSON.stringify(stderr.slice(0, 300))}`);
  assert.deepEqual(pendingNativeStates(root), []);
});

manualCheck("GD64 an unreadable, malformed or non-matching hooks.json fails closed to today's behaviour for an explicit run_in_background: true", () => {
  const variants = [
    ["malformed JSON", "{not json"],
    ["no hooks.json beside the module", null],
    ["SubagentStop registered for the codex runner only", hooksWith("SubagentStop", SUBAGENT_STOP_COMMAND.replace("claude", "codex"))],
    ["completion route registered under PostToolUse only", hooksWith("PostToolUse", SUBAGENT_STOP_COMMAND)],
  ];
  for (const [label, text] of variants) {
    const guard = guardCopyWithHooks(`unregistered-${label}`, text);
    const governed = itemBackgroundRepo();
    const blocked = runAtGuard(guard, markedGoldfishDispatch(governed.root, `gd64-item-${label.replace(/\W+/gu, "-")}`, { run_in_background: true }), governed.root, { GIT_CEILING_DIRECTORIES: governed.parent });
    assert.equal(blocked.code, BLOCK, `${label} (item-governed): ${blocked.stderr.trim().slice(0, 300)}`);
    assert.ok(blocked.stderr.includes(`BLOCKED (guard-dispatch): ${FOREGROUND_CODE}`), `${label} (item-governed): stderr missing the typed BLOCKED code -- got ${JSON.stringify(blocked.stderr.slice(0, 300))}`);
    const loose = itemBackgroundRepo(false);
    const warned = runAtGuard(guard, markedGoldfishDispatch(loose.root, `gd64-plain-${label.replace(/\W+/gu, "-")}`, { run_in_background: true }), loose.root, { GIT_CEILING_DIRECTORIES: loose.parent });
    assert.equal(warned.code, ALLOW, `${label} (not item-governed): ${warned.stderr.trim().slice(0, 300)}`);
    assert.ok(warned.stderr.includes(FOREGROUND_WARNING), `${label} (not item-governed): stderr missing the WARNING -- got ${JSON.stringify(warned.stderr.slice(0, 300))}`);
  }
});

manualCheck("GD65 the registration fact is one exported function: the real hooks/hooks.json reads to a boolean and fixture files are judged exactly", () => {
  const dir = realpathSync(mkdtempSync(join(repoRoot, "scratch", "guard-dispatch-registration-")));
  try {
    const otherGroup = { hooks: [{ type: "command", command: "node other.mjs" }] };
    const fixtures = [
      ["registered", REGISTERED_HOOKS, true],
      ["registered beside an unrelated group", JSON.stringify({ hooks: { SubagentStop: [otherGroup, { hooks: [{ type: "command", command: SUBAGENT_STOP_COMMAND }] }] } }), true],
      ["malformed", "{not json", false],
      ["empty object", "{}", false],
      ["array root", "[]", false],
      ["codex runner only", hooksWith("SubagentStop", SUBAGENT_STOP_COMMAND.replace("claude", "codex")), false],
      ["runner value only starts with claude", hooksWith("SubagentStop", `${SUBAGENT_STOP_COMMAND}-extra`), false],
      ["other script", hooksWith("SubagentStop", 'node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-dispatch.mjs" --runner claude'), false],
      ["PostToolUse only", hooksWith("PostToolUse", SUBAGENT_STOP_COMMAND), false],
      ["non-command hook type", hooksWith("SubagentStop", SUBAGENT_STOP_COMMAND, "prompt"), false],
    ];
    const files = fixtures.map(([, text], index) => { const file = join(dir, `fixture-${index}.json`); writeFileSync(file, text); return file; });
    files.push(join(dir, "does-not-exist.json"));
    const realHooks = join(dirname(GUARD), "hooks.json");
    assert.ok(existsSync(realHooks), "the real hooks/hooks.json must exist beside the guard");
    const runnerPath = join(dir, "registration-check.mjs");
    writeFileSync(runnerPath, [
      "const [guardHref, realHooks, ...files] = process.argv.slice(2);",
      "const { claudeSubagentStopCompletionRegistered: registered } = await import(guardHref);",
      "process.stdout.write(JSON.stringify({ byDefault: registered(), real: registered({ hooksJsonPath: realHooks }), files: files.map((hooksJsonPath) => registered({ hooksJsonPath })) }));",
    ].join("\n"));
    const res = spawnSync(process.execPath, [runnerPath, pathToFileURL(GUARD).href, realHooks, ...files], { input: "", encoding: "utf8", timeout: 10000 });
    assert.equal(res.status, 0, `runner exit ${res.status} -- ${(res.stderr ?? "").trim().slice(0, 300)}`);
    const out = JSON.parse(res.stdout);
    assert.equal(typeof out.byDefault, "boolean", "the default read of the real hooks/hooks.json must yield a boolean");
    assert.equal(out.real, out.byDefault, "the default read and an explicit read of the real hooks/hooks.json must agree");
    assert.deepEqual(out.files, [...fixtures.map(([, , expected]) => expected), false],
      `fixture verdicts differ -- ${JSON.stringify(fixtures.map(([label], index) => [label, out.files[index]]))}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

assert.equal(cases.length, 66, "the complete dispatch guard corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

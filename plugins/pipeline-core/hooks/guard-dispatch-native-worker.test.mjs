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
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
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
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { recordConsentGiven } from "../lib/onboarding-consent-marker.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";

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
mkdirSync(join(bindingRepo, ".claude"), { recursive: true });
recordConsentGiven({ rootDir: bindingRepo });
assert.equal(observeGovernanceScope({ rootDir: bindingRepo }).requiresEnforcement, true,
  "guard fixture must be admitted through canonical governance enrollment");
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

manualCheck("GD15n prepare a native pending binding for a complete dispatched Codex briefing and block failed preparation", () => {
  const fixture = mkdtempSync(join(repoRoot, "scratch", "guard-dispatch-native-v2-"));
  const sessionId = "gd15n-session";
  const toolUseId = "gd15n-positive";
  try {
    execFileSync("git", ["init", "-q"], { cwd: fixture });
    execFileSync("git", ["config", "user.name", "Pipeline Fixture"], { cwd: fixture });
    execFileSync("git", ["config", "user.email", "pipeline-fixture@example.invalid"], { cwd: fixture });
    mkdirSync(join(fixture, "src"), { recursive: true });
    writeFileSync(join(fixture, "src", "change.mjs"), "export const candidate = true;\n");
    recordConsentGiven({ rootDir: fixture });
    assert.equal(observeGovernanceScope({ rootDir: fixture }).requiresEnforcement, true,
      "native fixture must be admitted through canonical governance enrollment");
    execFileSync("git", ["add", "--", ".agent-pipeline/onboarding-consent.json", "src/change.mjs"], { cwd: fixture });
    execFileSync("git", ["commit", "-q", "-m", "fixture candidate"], { cwd: fixture });
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: fixture, encoding: "utf8" }).trim(), "",
      "native preparation fixture must begin from a clean committed tree");
    const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixture, encoding: "utf8" }).trim();
    const candidateTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: fixture, encoding: "utf8" }).trim();
    const binding = { schema: "pipeline.native-goldfish-host-briefing.v2", dispatchId: "GD15N-CODEX-WORKER",
      candidateCommit, candidateTree, runner: "codex", role: "pipeline-core:goldfish-implementor",
      nativeAgentType: "worker", model: "gpt-6-luna", effort: "high", rulesetSha: "c".repeat(64),
      allowedPaths: ["src/change.mjs"],
      criticDecision: { schema: "pipeline.critic-required-decision.v1",
        trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
          diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" } };
    const fullBriefing = filledTemplateBody("plugins/pipeline-core/templates/prompts/goldfish-task.md");
    const message = `<!-- pipeline-native-goldfish-host-commit:v2\n${JSON.stringify(binding)}\n-->\n${fullBriefing}`;
    assert.equal((message.match(new RegExp("<" + "!-- pipeline-native-goldfish-host-commit:v[12]", "gu")) ?? []).length, 1,
      "the dispatched message must contain only its selected binding");
    assert.equal((message.match(/NATIVE HOST-COMMIT RULE: Do not run git add, git commit, or write a dispatch-record;/gu) ?? []).length, 1,
      "the dispatched message must contain exactly one host directive");
    const positive = run({ tool_name: "spawn_agent", tool_use_id: toolUseId, session_id: sessionId,
      tool_input: { agent_type: "worker", message } }, fixture);
    assert.equal(positive.code, ALLOW, `complete v2 briefing should prepare before launch: ${positive.stderr}`);
    const privateDir = join(fixture, ".git", "agent-pipeline", "run", "native-goldfish-host-commit");
    const pendingFiles = readdirSync(privateDir).filter((name) => name.startsWith("pending-codex-") && name.endsWith(".json"));
    assert.equal(pendingFiles.length, 1, "successful preparation must publish one native pending state");
    const pending = JSON.parse(readFileSync(join(privateDir, pendingFiles[0]), "utf8"));
    assert.equal(pending.schema, "pipeline.native-goldfish-host-state.v1");
    assert.equal(pending.binding.dispatchId, binding.dispatchId);
    assert.equal(pending.binding.adapterVersion, 2);
    assert.equal(pending.binding.nativeAgentType, "worker");
    assert.equal(pending.binding.candidateCommit, candidateCommit);

    const failedBinding = { ...binding, candidateTree: "d".repeat(40), dispatchId: "GD15N-CODEX-MISMATCH" };
    const failedMessage = `<!-- pipeline-native-goldfish-host-commit:v2\n${JSON.stringify(failedBinding)}\n-->\n${fullBriefing}`;
    const failed = run({ tool_name: "spawn_agent", tool_use_id: "gd15n-negative", session_id: sessionId,
      tool_input: { agent_type: "worker", message: failedMessage } }, fixture);
    assert.equal(failed.code, BLOCK, `failed v2 native preparation must block launch: ${failed.stderr}`);
    assert.ok(failed.stderr.includes("NGHS-CANDIDATE-MISMATCH"), `typed preparation failure missing: ${failed.stderr}`);
    assert.equal(readdirSync(privateDir).filter((name) => name.startsWith("pending-codex-") && name.endsWith(".json")).length, 1,
      "failed preparation must not publish a pending state");
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
check("GD15k block a marked Codex worker when its native type differs from the binding", {
  tool_name: "spawn_agent", tool_input: { agent_type: "goldfish-implementor", message: nativeCodexWorkerPrompt() },
}, BLOCK, { stderrIncludes: ["NGHR-NATIVE-AGENT-TYPE"], projectDir: repoRoot });
check("GD15l block a marked Codex worker binding with an unknown field", {
  tool_name: "spawn_agent", tool_input: { agent_type: "worker", message: nativeCodexWorkerPrompt({ unexpected: true }) },
}, BLOCK, { stderrIncludes: ["NGHR-BRIEFING-SHAPE"], projectDir: repoRoot });
check("GD15m check a marked worker packet against the functional Goldfish briefing", {
  tool_name: "spawn_agent", tool_input: { agent_type: "worker", message: nativeCodexWorkerPrompt() },
}, BLOCK, { stderrIncludes: ["DISPATCH-INCOMPLETE-BRIEFING"], projectDir: repoRoot });

assert.equal(cases.length, 4, "the native-worker dispatch regression corpus must register four cases");

const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
const completionCases = cases.map((entry, index) => ({ ...entry, id: `GDW${String(index + 1).padStart(2, "0")}` }));
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

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
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
import { nativeContractFixtureParent, nativeContractFixtureRepositoryRoot, prepareApprovedItemCourseFixture } from "../lib/test-item-approved-course-fixture.mjs";
import { runDispatchBriefing } from "../scripts/dispatch-briefing.mjs";

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

// D185 (90fa209cf, b206d17cb): a productive Goldfish dispatch is admitted only with a briefing from the generator, so this case
// (D183 never weakened) builds its Codex worker briefing with the real generator, run in process with an injected ruleset
// identity and Codex route, on a production approved-course fixture. The intent is unchanged: a complete dispatched Codex
// briefing publishes one native pending binding; a candidate that no longer matches the fixture HEAD blocks launch with the
// typed NGHS-CANDIDATE-MISMATCH and publishes nothing.
const generatedRoots = [];
process.once("exit", () => { for (const root of generatedRoots) rmSync(root, { recursive: true, force: true }); });
function generatedCodexFixture(label) {
  const root = realpathSync(mkdtempSync(join(nativeContractFixtureParent(), `guard-dispatch-native-${label}-`)));
  generatedRoots.push(root);
  const pipelineUserSource = readFileSync(join(nativeContractFixtureRepositoryRoot(), "pipeline.user.yaml"), "utf8").replace("gates:\n", "gates:\n  human_approval: chat\n");
  prepareApprovedItemCourseFixture({ root, pipelineUserSource, calibrationExtra: { handover: "docs/state.md" } });
  recordConsentGiven({ rootDir: root });
  assert.equal(observeGovernanceScope({ rootDir: root }).requiresEnforcement, true,
    "native fixture must be admitted through canonical governance enrollment");
  mkdirSync(join(root, "scratch"), { recursive: true });
  writeFileSync(join(root, "scratch", "pkg.json"), JSON.stringify({
    id: "GD15N-CODEX-WORKER", item: "unit-item", criterion: "AC-1", agentType: "goldfish-implementor", runner: "codex", modelId: "gpt-6-luna", modelWhy: "role default",
    check: "src/change.test.mjs", paths: ["src/change.mjs"], spec: "specs/unit/spec.md", title: "Fixture title", ac: "AC-1", goal: "Fixture goal text.",
    context: ["`src/change.mjs` -- the module."], targeted: ["`node --test src/change.test.mjs` (green)"], forbidden: ["Fixture forbidden rule."], stops: ["Fixture stop rule."],
  }));
  const built = runDispatchBriefing(["build", "--root", root, "--package", "scratch/pkg.json"], {
    observePreflight: () => ({ rulesetSource: { selectedPlugin: { id: "pipeline-core", version: "9.9.9+test" }, loadedIdentity: { status: "available", algorithm: "content-sha256", value: "c".repeat(64) } } }),
    resolveBaseline: () => ({ status: "ready", entries: [] }),
    codexRoute: (taskRoute) => ({ taskRoute, runner: "codex", role: "worker", effort: "high", state: "default", selector: { kind: "model-id", value: "gpt-6-luna" } }),
  });
  assert.equal(built.ok, true, `the generator must build the fixture briefing -- ${JSON.stringify(built).slice(0, 300)}`);
  return { root, text: built.text };
}
const pendingCodexFiles = (root) => {
  const privateDir = join(root, ".git", "agent-pipeline", "run", "native-goldfish-host-commit");
  return existsSync(privateDir) ? readdirSync(privateDir).filter((name) => name.startsWith("pending-codex-") && name.endsWith(".json")).map((name) => join(privateDir, name)) : [];
};
manualCheck("GD15n prepare a native pending binding for a complete dispatched Codex briefing and block failed preparation", () => {
  const sessionId = "gd15n-session";
  const { root, text } = generatedCodexFixture("positive");
  const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert.equal((text.match(new RegExp("<" + "!-- pipeline-native-goldfish-host-commit:v[123]", "gu")) ?? []).length, 1,
    "the dispatched message must contain only its selected binding");
  assert.equal((text.match(/NATIVE HOST-COMMIT RULE: Do not run git add, git commit, or write a dispatch-record;/gu) ?? []).length, 1,
    "the dispatched message must contain exactly one host directive");
  const positive = run({ tool_name: "spawn_agent", tool_use_id: "gd15n-positive", session_id: sessionId, cwd: root,
    tool_input: { agent_type: "worker", message: text } }, root);
  assert.equal(positive.code, ALLOW, `complete generated briefing should prepare before launch: ${positive.stderr}`);
  const pendingFiles = pendingCodexFiles(root);
  assert.equal(pendingFiles.length, 1, "successful preparation must publish one native pending state");
  const pending = JSON.parse(readFileSync(pendingFiles[0], "utf8"));
  // A generated, item-governed briefing publishes the configured-route state schema (the bare v1 schema was the hand-built shape).
  assert.equal(pending.schema, "pipeline.native-goldfish-host-state.v3");
  assert.equal(pending.binding.dispatchId, "GD15N-CODEX-WORKER");
  assert.equal(pending.binding.adapterVersion, 2);
  assert.equal(pending.binding.nativeAgentType, "worker");
  assert.equal(pending.binding.candidateCommit, candidateCommit);

  // The candidate moves after the briefing is generated: the binding no longer matches the fixture HEAD.
  const stale = generatedCodexFixture("negative");
  writeFileSync(join(stale.root, "src", "moved.txt"), "head moved after the briefing was generated\n");
  execFileSync("git", ["add", "--", "src/moved.txt"], { cwd: stale.root });
  execFileSync("git", ["-c", "user.name=Pipeline Fixture", "-c", "user.email=pipeline-fixture@example.invalid", "commit", "-q", "-m", "move the candidate"], { cwd: stale.root });
  const failed = run({ tool_name: "spawn_agent", tool_use_id: "gd15n-negative", session_id: sessionId, cwd: stale.root,
    tool_input: { agent_type: "worker", message: stale.text } }, stale.root);
  assert.equal(failed.code, BLOCK, `failed native preparation must block launch: ${failed.stderr}`);
  assert.ok(failed.stderr.includes("NGHS-CANDIDATE-MISMATCH"), `typed preparation failure missing: ${failed.stderr}`);
  assert.equal(pendingCodexFiles(stale.root).length, 0, "failed preparation must not publish a pending state");
});
check("GD15k block a marked Codex worker when its native type differs from the binding", {
  tool_name: "spawn_agent", tool_input: { agent_type: "goldfish-implementor", message: nativeCodexWorkerPrompt() },
}, BLOCK, { stderrIncludes: ["NGHR-NATIVE-AGENT-TYPE"], projectDir: repoRoot });
check("GD15l block a marked Codex worker binding with an unknown field", {
  tool_name: "spawn_agent", tool_input: { agent_type: "worker", message: nativeCodexWorkerPrompt({ unexpected: true }) },
}, BLOCK, { stderrIncludes: ["NGHR-BRIEFING-SHAPE"], projectDir: repoRoot });
// GD15m runs in its own governed fixture with no active feature, not in `repoRoot`: the live repository's State
// carries an approved feature, and the guard then demands that feature's untracked, gitignored slice-queue.json
// (SQ-DELIVERY-COURSE-ABSENT) before it reaches the briefing check, so the case was green only in the one checkout
// that owns that file and red in every fresh clone (K144).
manualCheck("GD15m check a marked worker packet against the functional Goldfish briefing", () => {
  const fixture = mkdtempSync(join(repoRoot, "scratch", "guard-dispatch-native-incomplete-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: fixture });
    execFileSync("git", ["config", "user.name", "Pipeline Fixture"], { cwd: fixture });
    execFileSync("git", ["config", "user.email", "pipeline-fixture@example.invalid"], { cwd: fixture });
    recordConsentGiven({ rootDir: fixture });
    assert.equal(observeGovernanceScope({ rootDir: fixture }).requiresEnforcement, true,
      "native fixture must be admitted through canonical governance enrollment");
    mkdirSync(join(fixture, ".claude"), { recursive: true });
    writeFileSync(join(fixture, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
    writeFileSync(join(fixture, ".claude", "pipeline-state.json"), `${JSON.stringify({ schema: "pipeline.state.v0" })}\n`);
    execFileSync("git", ["add", "--", ".agent-pipeline/onboarding-consent.json", ".claude/pipeline.yaml", ".claude/pipeline-state.json"], { cwd: fixture });
    execFileSync("git", ["commit", "-q", "-m", "fixture candidate"], { cwd: fixture });
    const { code, stderr } = run({ tool_name: "spawn_agent", tool_input: { agent_type: "worker", message: nativeCodexWorkerPrompt() } }, fixture);
    assert.equal(code, BLOCK, `exit ${code} (expected ${BLOCK}) -- ${stderr.trim().slice(0, 200)}`);
    // D185 (90fa209cf): the generated-briefing check runs before the completeness check, so a marked worker packet that is not
    // the generator's output is refused DBG-GENERATED-BRIEFING-REQUIRED; DISPATCH-INCOMPLETE-BRIEFING stays pinned in
    // lib/dispatch-policy.test.mjs. The packet is still never admitted as a functional Goldfish briefing.
    assert.ok(stderr.includes("BLOCKED (guard-dispatch): DBG-GENERATED-BRIEFING-REQUIRED"), `stderr missing "DBG-GENERATED-BRIEFING-REQUIRED" -- ${stderr.trim().slice(0, 200)}`);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

assert.equal(cases.length, 4, "the native-worker dispatch regression corpus must register four cases");

const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
const completionCases = cases.map((entry, index) => ({ ...entry, id: `GDW${String(index + 1).padStart(2, "0")}` }));
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

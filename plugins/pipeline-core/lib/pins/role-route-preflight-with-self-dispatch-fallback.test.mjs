// SPDX-License-Identifier: SUL-1.0
/**
 * Criterion-bound pin (QG-04) for AC-245 / pipeline.role-route-preflight-with-self-dispatch-fallback.
 *
 * Points, each driven through the real modules (no mock of the behavior under test):
 *  1. evaluateRoleRoutePreflight reports native | fallback-self-dispatch | unavailable per role,
 *     with RRP-* codes; fallback is legal only for the claude advisor.
 *  2a. prepareCanonicalRoleFallback / runCanonicalRoleFallback turn a failed role route into a
 *     method-preparation-only self-dispatch with canonical templates.
 *  3. The fallback is not self-review: a fresh-context subagent of the packet's role, read-only for
 *     Critic/Advisor, with the evidence left to the owning role's intake.
 *  4. The producer failure output is surfaced: runCanonicalRoleFallback returns exitCode/stdout/stderr,
 *     and executeDesignCourseProducer returns a bounded, sanitized stderr TEXT (not only a byte count).
 *
 * 2b (built as a consumer function, NOT wired end to end): admitRoleFallbackEvidence in
 * design-course-session.mjs accepts a "returned" runCanonicalRoleFallback result as the role's evidence
 * with an honest assurance label and refuses implementor self-review. runDesignCourseV2 itself is
 * behaviorally retired (ADR-0085, DESIGN-COURSE-RETIRED), so no live course path calls it. The
 * end-to-end clause ("the course accepts that result as the role's evidence") named a course that
 * no longer exists. QG-04 restatement (bounded, PO decision D125 of 2026-10-22): the acceptance is
 * restated against the single-review route, where fallback evidence goes to the present-plan
 * --review-receipt route; the retired-course wording is not a held assertion any more. Points 1 to 6
 * prove the admission function and its neighbours. The restated clause is now asserted too (K128, PO
 * decision of 2026-10-23, batch 12, row 41; QG-04: no earlier assertion changed, this only adds cases):
 * 7 (the typed fallback on the single-review route) the design review receipt carries an OPTIONAL, closed `fallback` record
 *   ({route: fallback-self-dispatch, reasonCode, requestedRoute, observedIdentity}); the producer writes it when the typed
 *   fallback occurred, the receipt schema refuses a malformed or extended one (a receipt without it stays valid and unchanged),
 *   and `present-plan --review-receipt` names it in the presented plan and in the PO's signed binding instead of presenting a
 *   single-review route as an independent review; see the point-7 cases and the added route-1 assertions in
 *   scripts/design-approval-route.e2e.test.mjs. What stays outside: the Elephant must still pass the flag
 *   `--fallback-reason-code` when it produces a receipt after a fallback (a briefing duty, not a guard).
 * 5 (P1-1 bullet 3, standalone, NOT wired into a caller): lib/dispatch-recovery-state.mjs keeps one atomic recovery
 *   state per task identity (dispatchId + role + candidate) with a bounded attempt history; see the point-5 cases.
 * 6 (P1-1 bullet 2, briefing-side consumer of the declared route, no new guard): the agent-obligations document and the Goldfish
 *   task template tell the owner to submit every DoD / targeted / quick check at the declared host boundary from the first call when
 *   the preflight declares roleScope.testCommands.route = host-boundary-from-first-call; see the point-6 cases.
 * P1-1 (role-dependent preflight, 0.7.0) is pinned in scripts/pipeline-start-preflight.test.mjs.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { evaluateRoleRoutePreflight } from "../role-route-preflight.mjs";
import { registeredFunctionalTaskRoutes } from "../model-role-route-source.mjs";
import {
  ROLE_DISPATCH_REQUEST_SCHEMA,
  prepareCanonicalRoleFallback,
  runCanonicalRoleFallback,
} from "../role-dispatch-preflight.mjs";
import { buildDesignCourseProducerAction, executeDesignCourseProducer } from "../../scripts/design-course-session.mjs";
// Namespace import for the point-2b function: a missing export then fails its own cases (TypeError), not the whole file at link time.
import * as designCourseSession from "../../scripts/design-course-session.mjs";
import { createDesignReviewReceipt, parseDesignReviewReceipt, summarizeDesignReviewReceipt } from "../design-review-receipt.mjs";
import { createDesignApprovalBinding, validateDesignApprovalBinding } from "../design-approval-binding.mjs";
import { canonical } from "../po-approval-proof.mjs";
import { createReceiptFromDisk, main as receiptProducerMain } from "../../scripts/design-review-receipt.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const pluginRoot = resolve(repoRoot, "plugins", "pipeline-core");
const digest = (char) => char.repeat(64);
const observed = (kind, evidenceSha256 = digest("a")) => ({ kind, evidenceSha256, hookRecordedStart: true, hookRecordedTerminal: true });
const ROLES = ["advisor", "critic", "goldfish.implement", "goldfish.mechanic", "goldfish.deep", "readiness", "plan-verifier"];
const headOf = (cwd) => execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();

// --- Point 1: per-role route preflight ---------------------------------------------------------
test("point 1: native, fallback-self-dispatch and unavailable are all reported per role with RRP-* codes", () => {
  const source = registeredFunctionalTaskRoutes();
  assert.equal(source.ok, true, "the real registry source must be registered");
  const result = evaluateRoleRoutePreflight({ source, runner: "claude", hostObservations: {
    advisor: observed("fallback-self-dispatch", digest("b")),
    critic: observed("native"),
  } });
  assert.equal(result.schema, "pipeline.role-route-preflight.v1");
  assert.equal(result.ok, true);
  assert.deepEqual(result.roles.advisor, { state: "fallback-self-dispatch", reasonCode: "RRP-FALLBACK-ADVISOR-CONSULT", evidence: digest("b") });
  assert.equal(result.roles.critic.state, "native");
  assert.match(result.roles.critic.reasonCode, /^RRP-/u);
  assert.equal(result.roles["goldfish.implement"].state, "unavailable");
  assert.match(result.roles["goldfish.implement"].reasonCode, /^RRP-/u);
});

test("point 1: fallback-self-dispatch is legal only for the claude advisor", () => {
  const source = registeredFunctionalTaskRoutes();
  for (const runner of ["claude", "codex", "antigravity"]) {
    for (const role of ROLES.filter((name) => name !== "advisor")) {
      const result = evaluateRoleRoutePreflight({ source, runner, hostObservations: { [role]: observed("fallback-self-dispatch") } });
      assert.equal(result.roles[role].state, "unavailable", `${runner}/${role}`);
      assert.equal(result.roles[role].reasonCode, "RRP-FALLBACK-ROLE-NOT-ALLOWED", `${runner}/${role}`);
    }
  }
  for (const runner of ["codex", "antigravity"]) {
    const result = evaluateRoleRoutePreflight({ source, runner, hostObservations: { advisor: observed("fallback-self-dispatch") } });
    assert.notEqual(result.roles.advisor.state, "fallback-self-dispatch", `${runner} has no advisor fallback route`);
  }
});

// --- Points 2a, 3, 4 (runCanonicalRoleFallback half): git fixture under scratch/ ---------------
const scratchParent = join(repoRoot, "scratch");
mkdirSync(scratchParent, { recursive: true });
const fixture = realpathSync(mkdtempSync(join(scratchParent, "role-fallback-pin-")));
const fixtureEnv = { ...process.env, GIT_CEILING_DIRECTORIES: scratchParent };
const git = (...args) => execFileSync("git", args, { cwd: fixture, env: fixtureEnv, encoding: "utf8" }).trim();
git("init", "-q");
git("config", "user.email", "fixture@example.invalid");
git("config", "user.name", "Fixture");
mkdirSync(join(fixture, "scratch"));
writeFileSync(join(fixture, "input.txt"), "input\n");
git("add", "input.txt");
git("commit", "-q", "-m", "fixture");
const candidate = { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
const projectHeadBefore = headOf(repoRoot);
test.after(() => {
  rmSync(fixture, { recursive: true, force: true });
  assert.equal(headOf(repoRoot), projectHeadBefore, "project HEAD must be unchanged by the pin");
});

function templateBody(relativePath) {
  const raw = readFileSync(join(pluginRoot, "..", "..", relativePath), "utf8");
  const marker = "COPY EVERYTHING BELOW THIS LINE\n-->";
  const index = raw.indexOf(marker);
  assert.ok(index >= 0, `${relativePath}: copy marker`);
  return raw.slice(index + marker.length)
    .replace(/\{\{MODEL_ID\}\}/g, "claude-sonnet-5-5").replace(/\{\{EFFORT\}\}/g, "medium")
    .replace(/\{\{MODEL_EFFORT[^{}]*\}\}/g, "claude-sonnet-5-5 / medium")
    .replace(/\{\{TOOL_BUDGET[^{}]*\}\}/g, "<=24 tool uses").replace(/\{\{[^{}]*\}\}/g, "FILLED")
    .replace(/opus/gi, "sonnet");
}
const PROMPTS = {
  "consult-advisor": "Inspect input.txt with model codex; Ruleset-SHA: 0f38b425.",
  critic: templateBody("templates/prompts/critic-review.md"),
  "goldfish-implementor": templateBody("templates/prompts/goldfish-task.md"),
};
const packetFor = (role, index) => ({
  schema: ROLE_DISPATCH_REQUEST_SCHEMA, dispatchId: `fallback-${index}`, transport: "direct",
  role: `pipeline-core:${role}`, prompt: PROMPTS[role], candidate,
  requiredPaths: ["input.txt"], requiredPathSha256: { "input.txt": createHash("sha256").update("input\n").digest("hex") },
  resultPath: `scratch/result-${index}.json`,
});

test("point 2a: a failed route is prepared as a canonical self-dispatch fallback (preparation only)", () => {
  const expected = { critic: ["templates/prompts/critic-review.md", "duty.critic_normal"],
    "consult-advisor": ["skills/advisor-consult/SKILL.md", "duty.advisory"],
    "goldfish-implementor": ["templates/prompts/goldfish-task.md", "duty.implement"] };
  let index = 0;
  for (const [role, [path, taskRoute]] of Object.entries(expected)) {
    const result = prepareCanonicalRoleFallback({ root: fixture, packet: packetFor(role, ++index), runner: "claude", reasonCode: "RRP-NO-HOST-OBSERVATION" });
    assert.equal(result.status, "prepared", `${role}: ${result.code}`);
    assert.equal(result.code, "RDF-PREPARED");
    assert.equal(result.route, "fallback-self-dispatch");
    assert.equal(result.reasonCode, "RRP-NO-HOST-OBSERVATION");
    assert.equal(result.assurance, "method-preparation-only");
    assert.equal(result.nativeProof, "unavailable");
    assert.equal(result.taskRoute, taskRoute);
    assert.equal(result.carrier.path, path);
    assert.match(result.carrier.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(result.action.canonicalTemplate.length > 0, "canonical template text is carried");
    assert.equal(result.modelCalls, 0);
    assert.equal(result.launcherCalls, 0);
  }
  const bad = prepareCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 9), runner: "not-a-runner", reasonCode: "x" });
  assert.equal(bad.status, "unavailable");
  assert.equal(bad.code, "RDF-INPUT");
  assert.equal(bad.route, "fallback-self-dispatch");
});

test("point 3: the fallback is not self-review (fresh context, read-only for Critic/Advisor, intake still required)", async () => {
  let index = 20;
  for (const [role, readOnly] of [["critic", true], ["consult-advisor", true], ["goldfish-implementor", false]]) {
    const launched = [];
    const result = await runCanonicalRoleFallback({ root: fixture, packet: packetFor(role, ++index), runner: "claude",
      reasonCode: "RRP-NO-HOST-OBSERVATION", launch: async (action, packet) => { launched.push({ action, packet }); return { exitCode: 0, stdout: "ok", stderr: "" }; } });
    assert.equal(launched.length, 1, role);
    const { action } = launched[0];
    assert.equal(action.kind, "runner-native-subagent");
    assert.equal(action.subagentType, `pipeline-core:${role}`, "dispatched to the packet's own role, never the caller");
    assert.equal(action.freshContext, true);
    assert.equal(action.readOnly, readOnly, role);
    assert.equal(action.requiredAdmission, "owning-role-course-and-host-gates");
    assert.equal(result.status, "returned");
    assert.equal(result.evidenceStatus, "owning-role-intake-required", "exit zero is not review evidence");
    assert.equal(result.nativeProof, "unavailable");
    assert.equal(result.launcherCalls, 1);
  }
  const noLauncher = await runCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 40), runner: "claude", reasonCode: "RRP-X" });
  assert.equal(noLauncher.code, "RDF-LAUNCHER");
  assert.equal(noLauncher.launcherCalls, 0, "without an explicit launcher nothing is run");
});

test("point 4a: runCanonicalRoleFallback surfaces exitCode, stdout and stderr of a failed producer", async () => {
  const result = await runCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 50), runner: "claude",
    reasonCode: "RRP-X", launch: async () => ({ exitCode: 3, stdout: "partial", stderr: "boom" }) });
  assert.equal(result.status, "failed");
  assert.equal(result.code, "RDF-PRODUCER-FAILED");
  assert.deepEqual(result.output, { exitCode: 3, stdout: "partial", stderr: "boom" });
  const thrown = await runCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 51), runner: "claude",
    reasonCode: "RRP-X", launch: async () => { throw new Error("launcher exploded"); } });
  assert.equal(thrown.code, "RDF-LAUNCH-ERROR");
  assert.equal(thrown.output.stderr, "launcher exploded");
});

// --- Point 2b: admitRoleFallbackEvidence, a pure consumer of a runCanonicalRoleFallback result ------
const AUTHOR = "pipeline-core:goldfish-implementor";
const RFE_REASON = "RRP-NO-HOST-OBSERVATION";
const returnedFallback = (role, index, stdout = `${role} findings`) => runCanonicalRoleFallback({ root: fixture,
  packet: packetFor(role, index), runner: "claude", reasonCode: RFE_REASON, launch: async () => ({ exitCode: 0, stdout, stderr: "" }) });
const admit = (fallbackResult, authorRole = AUTHOR) => designCourseSession.admitRoleFallbackEvidence({ fallbackResult, authorRole });
const tampered = async (mutate) => { const value = structuredClone(await returnedFallback("critic", 70)); mutate(value); return value; };

test("point 2b: a returned read-only critic or advisor fallback is admitted with its honest labels unchanged", async () => {
  let index = 60;
  for (const role of ["critic", "consult-advisor"]) {
    const fallbackResult = await returnedFallback(role, ++index);
    assert.equal(fallbackResult.code, "RDF-RETURNED", role);
    const before = JSON.stringify(fallbackResult);
    assert.deepEqual(admit(fallbackResult), {
      schema: "pipeline.role-fallback-evidence-admission.v1", ok: true, route: "fallback-self-dispatch", reasonCode: RFE_REASON,
      role: `pipeline-core:${role}`, assurance: "method-preparation-only", nativeProof: "unavailable",
      evidenceStatus: "owning-role-intake-required", outputSha256: createHash("sha256").update(`${role} findings`).digest("hex"),
      implementationAuthority: false,
    }, role);
    assert.equal(JSON.stringify(fallbackResult), before, `${role}: the admission is pure and does not touch its input`);
  }
});

test("point 2b: a Goldfish producer is refused, even from a genuinely returned fallback", async () => {
  const fallbackResult = await returnedFallback("goldfish-implementor", 62);
  assert.equal(fallbackResult.code, "RDF-RETURNED");
  assert.deepEqual(admit(fallbackResult, "pipeline-core:critic"), { schema: "pipeline.role-fallback-evidence-admission.v1", ok: false, code: "RFE-PRODUCER-GOLDFISH", implementationAuthority: false });
  assert.equal(admit(await tampered((value) => { value.action.subagentType = "pipeline-core:plan-verifier"; })).code, "RFE-PRODUCER-NOT-ALLOWED");
});

test("point 2b: the implementor never reviews itself (producer equal to authorRole, prefixed or bare)", async () => {
  for (const [role, index] of [["critic", 63], ["consult-advisor", 64]]) {
    const fallbackResult = await returnedFallback(role, index);
    for (const authorRole of [`pipeline-core:${role}`, role]) {
      assert.equal(admit(fallbackResult, authorRole).code, "RFE-SELF-REVIEW", `${role} authored by ${authorRole}`);
    }
  }
  const critic = await returnedFallback("critic", 65);
  for (const authorRole of [undefined, "", 7, null]) {
    // Called directly: the `admit` helper above would replace an undefined authorRole with its default.
    const refusal = designCourseSession.admitRoleFallbackEvidence({ fallbackResult: critic, authorRole });
    assert.equal(refusal.code, "RFE-AUTHOR-ROLE-INVALID", String(authorRole));
  }
});

test("point 2b: a failed, unlaunched or malformed result is refused", async () => {
  const failed = await runCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 66), runner: "claude", reasonCode: RFE_REASON,
    launch: async () => ({ exitCode: 3, stdout: "partial", stderr: "boom" }) });
  const thrown = await runCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 67), runner: "claude", reasonCode: RFE_REASON,
    launch: async () => { throw new Error("launcher exploded"); } });
  const unlaunched = await runCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 68), runner: "claude", reasonCode: RFE_REASON });
  const prepared = prepareCanonicalRoleFallback({ root: fixture, packet: packetFor("critic", 69), runner: "claude", reasonCode: RFE_REASON });
  for (const [label, value] of [["failed", failed], ["launch error", thrown], ["no launcher", unlaunched], ["prepared only", prepared]]) {
    assert.equal(admit(value).code, "RFE-RESULT-NOT-RETURNED", label);
  }
  for (const value of [undefined, null, "returned", [], {}, { status: "returned", code: "RDF-RETURNED" }]) {
    assert.equal(admit(value).code, "RFE-RESULT-MALFORMED", JSON.stringify(value));
  }
  assert.equal(admit(await tampered((value) => { value.output = { exitCode: 0, stdout: 7, stderr: "" }; })).code, "RFE-RESULT-MALFORMED");
  assert.equal(admit(await tampered((value) => { delete value.output; })).code, "RFE-RESULT-MALFORMED");
  assert.equal(admit(await tampered((value) => { value.action = null; })).code, "RFE-RESULT-MALFORMED");
  for (const refusal of [admit(failed), admit(undefined)]) assert.equal(refusal.implementationAuthority, false);
});

test("point 2b: only the honest fallback labels are admitted (no native claim, no accepted evidence)", async () => {
  const cases = [
    ["route", (value) => { value.route = "native"; }, "RFE-LABEL-MISMATCH"],
    ["assurance", (value) => { value.assurance = "native-proof"; }, "RFE-LABEL-MISMATCH"],
    ["nativeProof", (value) => { value.nativeProof = "available"; }, "RFE-LABEL-MISMATCH"],
    ["evidenceStatus", (value) => { value.evidenceStatus = "accepted"; }, "RFE-LABEL-MISMATCH"],
    ["reasonCode empty", (value) => { value.reasonCode = ""; }, "RFE-REASON-MISSING"],
    ["reasonCode absent", (value) => { delete value.reasonCode; }, "RFE-REASON-MISSING"],
  ];
  for (const [label, mutate, code] of cases) assert.equal(admit(await tampered(mutate)).code, code, label);
});

test("point 2b: the dispatched action must be a fresh-context, read-only native subagent", async () => {
  const cases = [
    ["readOnly false", (value) => { value.action.readOnly = false; }, "RFE-ACTION-NOT-READ-ONLY"],
    ["readOnly absent", (value) => { delete value.action.readOnly; }, "RFE-ACTION-NOT-READ-ONLY"],
    ["freshContext false", (value) => { value.action.freshContext = false; }, "RFE-ACTION-NOT-FRESH-CONTEXT"],
    ["other kind", (value) => { value.action.kind = "shell-command"; }, "RFE-ACTION-INVALID"],
  ];
  for (const [label, mutate, code] of cases) assert.equal(admit(await tampered(mutate)).code, code, label);
});

// --- Point 4b: executeDesignCourseProducer surfaces a bounded, sanitized stderr text -----------
const sources = Object.fromEntries(["input", "prd", "spec", "design", "traceability"].map((name, index) => [name,
  { path: `docs/${name}.md`, sha256: String(index).repeat(64) }]));
function execute(spawnResult) {
  const action = buildDesignCourseProducerAction({ root: fixture, pluginRoot, candidate, sources, featureId: "feature-x",
    authoringDispatchId: "author-x", profile: "feature", outputPrefix: "evidence/advisor", runner: "claude", stage: "advisor" });
  return executeDesignCourseProducer(action, { execFileSync: () => fixture, readCandidate: () => candidate, spawnSync: () => spawnResult });
}

test("point 4b: a producer failure with unparseable stdout surfaces its stderr text, not only a byte count", () => {
  const result = execute({ status: 1, signal: null, stdout: "not json", stderr: "boom" });
  assert.equal(result.status, "producer-output-invalid");
  assert.equal(result.exitCode, 1);
  assert.equal(result.stderrBytes, 4);
  assert.equal(result.stderr, "boom");
});

test("point 4b: a producer failure with parseable stdout surfaces its stderr text too", () => {
  const result = execute({ status: 1, signal: null, stdout: JSON.stringify({ ok: false, status: "failed" }), stderr: "boom" });
  assert.equal(result.status, "producer-failed");
  assert.equal(result.stderrBytes, 4);
  assert.equal(result.stderr, "boom");
});

test("point 4b: the surfaced stderr is bounded to 4096 bytes with a truncation marker and keeps the true byte count", () => {
  const result = execute({ status: 1, signal: null, stdout: "not json", stderr: "x".repeat(10_000) });
  assert.equal(result.stderrBytes, 10_000);
  assert.ok(Buffer.byteLength(result.stderr) <= 4096, "at most 4096 bytes");
  assert.match(result.stderr, /\[truncated\]$/u);
});

test("point 4b: the surfaced stderr carries no absolute home or drive paths", () => {
  const dirty = "fatal at C:\\Users\\example-user\\work\\x.js:1 and /home/example-user/work/y.js and /Users/example-user/z.js";
  const result = execute({ status: 1, signal: null, stdout: "not json", stderr: dirty });
  assert.match(result.stderr, /fatal at /u);
  assert.doesNotMatch(result.stderr, /example-user/iu);
  assert.doesNotMatch(result.stderr, /[A-Za-z]:\\/u);
  assert.doesNotMatch(result.stderr, /\/home\/|\/Users\//u);
});

// --- Point 5: an atomic recovery state keeps the task identity and the attempt history -----------
// Namespace import with a catch: a missing module then fails each case on its own (TypeError), not the whole file at link time.
const recovery = await import("../dispatch-recovery-state.mjs").catch(() => ({}));
const failedRun = (role, index, code = 3, stderr = "boom") => runCanonicalRoleFallback({ root: fixture, packet: packetFor(role, index),
  runner: "claude", reasonCode: RFE_REASON, launch: async () => ({ exitCode: code, stdout: "", stderr }) });
const returnedRun = (role, index) => returnedFallback(role, index);
const recoveryRoot = () => realpathSync(mkdtempSync(join(tmpdir(), "dispatch-recovery-pin-")));
const stateFile = (root, id) => join(root, "evidence", `dispatch-recovery-${id}.json`);
const fixedNow = () => "2026-10-22T00:00:00.000Z";

test("point 5: a failed fallback opens one recovery state bound to dispatchId, role and candidate", async () => {
  const root = recoveryRoot();
  try {
    const packet = packetFor("critic", 80);
    const opened = await recovery.openDispatchRecovery({ root, packet, result: await failedRun("critic", 80), now: fixedNow });
    assert.equal(opened.ok, true, opened.code);
    assert.equal(opened.state.schema, "pipeline.dispatch-recovery-state.v1");
    assert.equal(opened.state.status, "open");
    assert.deepEqual(opened.state.taskIdentity, { dispatchId: packet.dispatchId, role: packet.role, candidateCommit: candidate.commit, candidateTree: candidate.tree });
    assert.match(opened.state.taskIdentitySha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(opened.state.attempts, [{ attempt: 1, outcome: "failed", code: "RDF-PRODUCER-FAILED", route: "fallback-self-dispatch",
      reasonCode: RFE_REASON, exitCode: 3, stderr: "boom", recordedAt: fixedNow() }]);
    const read = recovery.readDispatchRecovery({ root, dispatchId: packet.dispatchId });
    assert.equal(read.ok, true, read.code);
    assert.deepEqual(read.state, opened.state);
    assert.equal((await recovery.openDispatchRecovery({ root, packet, result: await failedRun("critic", 80), now: fixedNow })).code, "DRS-EXISTS",
      "a second open never replaces the first state");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("point 5: a further failed attempt is appended; attempt 1 and the task identity stay byte-identical", async () => {
  const root = recoveryRoot();
  try {
    const packet = packetFor("critic", 81);
    const first = await recovery.openDispatchRecovery({ root, packet, result: await failedRun("critic", 81, 3, "first"), now: fixedNow });
    const second = await recovery.recordRecoveryAttempt({ root, packet, result: await failedRun("critic", 81, 4, "second"), expectedAttempts: 1, now: fixedNow });
    assert.equal(second.ok, true, second.code);
    assert.equal(second.state.attempts.length, 2);
    assert.deepEqual(second.state.attempts[0], first.state.attempts[0]);
    assert.equal(second.state.attempts[1].attempt, 2);
    assert.equal(second.state.attempts[1].stderr, "second");
    assert.equal(second.state.taskIdentitySha256, first.state.taskIdentitySha256);
    assert.equal(second.state.status, "open");
    const unlaunched = await recovery.recordRecoveryAttempt({ root, packet, result: await runCanonicalRoleFallback({ root: fixture, packet, runner: "claude", reasonCode: RFE_REASON }),
      expectedAttempts: 2, now: fixedNow });
    assert.equal(unlaunched.ok, true, "a route that never launched (RDF-LAUNCHER) is an attempt too");
    assert.equal(unlaunched.state.attempts[2].code, "RDF-LAUNCHER");
    assert.equal(unlaunched.state.attempts[2].exitCode, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("point 5: a renamed or re-bound task cannot continue another task's recovery state", async () => {
  const root = recoveryRoot();
  try {
    const packet = packetFor("critic", 82);
    await recovery.openDispatchRecovery({ root, packet, result: await failedRun("critic", 82), now: fixedNow });
    const bytesBefore = readFileSync(stateFile(root, packet.dispatchId), "utf8");
    const renamed = { ...packet, dispatchId: "renamed-82" };
    const viaRename = await recovery.recordRecoveryAttempt({ root, packet: renamed, result: await failedRun("critic", 82), expectedAttempts: 1, now: fixedNow });
    assert.equal(viaRename.code, "DRS-NO-RECOVERY", "a renamed task has no state of its own and does not inherit the old one");
    const foreign = await recovery.recordRecoveryAttempt({ root, packet, result: await failedRun("critic", 90), expectedAttempts: 1, now: fixedNow });
    assert.equal(foreign.code, "DRS-ATTEMPT-INVALID", "a result produced for another task is not an attempt of this one");
    for (const mutated of [{ ...packet, role: "pipeline-core:consult-advisor" }, { ...packet, candidate: { commit: candidate.commit, tree: "0".repeat(40) } }]) {
      const result = await recovery.recordRecoveryAttempt({ root, packet: mutated, result: await failedRun("critic", 82), expectedAttempts: 1, now: fixedNow });
      assert.equal(result.code, "DRS-IDENTITY-MISMATCH");
    }
    assert.equal(readFileSync(stateFile(root, packet.dispatchId), "utf8"), bytesBefore, "every refusal leaves the state untouched");
    assert.deepEqual(readdirSync(join(root, "evidence")), [`dispatch-recovery-${packet.dispatchId}.json`], "no state file and no temporary file for the renamed task");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("point 5: the write is atomic and compare-and-swap (stale count, injected write failure, attempt bound)", async () => {
  const root = recoveryRoot();
  try {
    const packet = packetFor("critic", 83);
    await recovery.openDispatchRecovery({ root, packet, result: await failedRun("critic", 83), now: fixedNow });
    const bytesBefore = readFileSync(stateFile(root, packet.dispatchId), "utf8");
    const failing = await failedRun("critic", 83, 5, "again");
    assert.equal((await recovery.recordRecoveryAttempt({ root, packet, result: failing, expectedAttempts: 0, now: fixedNow })).code, "DRS-STALE");
    assert.equal((await recovery.recordRecoveryAttempt({ root, packet, result: failing, now: fixedNow })).code, "DRS-STALE", "the expected count is mandatory");
    const broken = await recovery.recordRecoveryAttempt({ root, packet, result: failing, expectedAttempts: 1, now: fixedNow,
      io: { open: async () => { throw new Error("disk full"); } } });
    assert.equal(broken.code, "DRS-WRITE-FAILED");
    assert.equal(readFileSync(stateFile(root, packet.dispatchId), "utf8"), bytesBefore, "a failed write leaves the previous state");
    assert.deepEqual(readdirSync(join(root, "evidence")), [`dispatch-recovery-${packet.dispatchId}.json`], "no temporary file is left");
    for (let count = 1; count < recovery.MAX_RECOVERY_ATTEMPTS; count += 1) {
      assert.equal((await recovery.recordRecoveryAttempt({ root, packet, result: failing, expectedAttempts: count, now: fixedNow })).ok, true, `attempt ${count + 1}`);
    }
    const over = await recovery.recordRecoveryAttempt({ root, packet, result: failing, expectedAttempts: recovery.MAX_RECOVERY_ATTEMPTS, now: fixedNow });
    assert.equal(over.code, "DRS-ATTEMPT-LIMIT", "the history is bounded and never drops an old attempt");
    assert.equal(recovery.readDispatchRecovery({ root, dispatchId: packet.dispatchId }).state.attempts.length, recovery.MAX_RECOVERY_ATTEMPTS);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("point 5: a returned fallback resolves the state; a resolved state accepts nothing more", async () => {
  const root = recoveryRoot();
  try {
    const packet = packetFor("critic", 84);
    await recovery.openDispatchRecovery({ root, packet, result: await failedRun("critic", 84), now: fixedNow });
    const resolved = await recovery.recordRecoveryAttempt({ root, packet, result: await returnedRun("critic", 84), expectedAttempts: 1, now: fixedNow });
    assert.equal(resolved.ok, true, resolved.code);
    assert.equal(resolved.state.status, "resolved");
    assert.equal(resolved.state.attempts[1].outcome, "returned");
    assert.equal((await recovery.recordRecoveryAttempt({ root, packet, result: await failedRun("critic", 84), expectedAttempts: 2, now: fixedNow })).code, "DRS-TERMINAL");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("point 5: a state that was edited, truncated or is unreadable is refused, never trusted", async () => {
  const root = recoveryRoot();
  try {
    const packet = packetFor("critic", 85);
    await recovery.openDispatchRecovery({ root, packet, result: await failedRun("critic", 85), now: fixedNow });
    const file = stateFile(root, packet.dispatchId);
    const original = readFileSync(file, "utf8");
    const edits = [
      (state) => { state.attempts[0].exitCode = 0; },
      (state) => { state.attempts = []; },
      (state) => { state.taskIdentity.dispatchId = "other-85"; },
      (state) => { state.extra = true; },
    ];
    for (const edit of edits) {
      const state = JSON.parse(original); edit(state);
      writeFileSync(file, JSON.stringify(state));
      assert.equal(recovery.readDispatchRecovery({ root, dispatchId: packet.dispatchId }).code, "DRS-CORRUPT");
    }
    writeFileSync(file, original.slice(0, 40));
    assert.equal(recovery.readDispatchRecovery({ root, dispatchId: packet.dispatchId }).code, "DRS-CORRUPT");
    assert.equal(recovery.readDispatchRecovery({ root, dispatchId: "no-such-task" }).code, "DRS-NO-RECOVERY");
    assert.equal(recovery.readDispatchRecovery({ root, dispatchId: "../escape" }).code, "DRS-INPUT");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("point 5: only a real fallback result is an attempt; surfaced stderr is bounded and path-free", async () => {
  const root = recoveryRoot();
  try {
    const packet = packetFor("critic", 86);
    for (const result of [undefined, null, {}, { schema: "pipeline.canonical-role-fallback.v1", status: "prepared", code: "RDF-PREPARED" },
      { ...(await failedRun("critic", 86)), code: 7 }]) {
      assert.equal((await recovery.openDispatchRecovery({ root, packet, result, now: fixedNow })).code, "DRS-ATTEMPT-INVALID", JSON.stringify(result)?.slice(0, 60));
    }
    const dirty = `fatal at /home/example-user/work/y.js and C:\\Users\\example-user\\z.js ${"x".repeat(5000)}`;
    const opened = await recovery.openDispatchRecovery({ root, packet, result: await failedRun("critic", 86, 9, dirty), now: fixedNow });
    assert.equal(opened.ok, true, opened.code);
    const { stderr } = opened.state.attempts[0];
    assert.ok(Buffer.byteLength(stderr) <= 1024);
    assert.match(stderr, /\[truncated\]$/u);
    assert.doesNotMatch(stderr, /example-user|\/home\/|[A-Za-z]:\\/iu);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- Point 6: the declared host-boundary test route reaches the Goldfish through the briefing -----------------------
const ROUTE_DECLARATION = "host-boundary-from-first-call";
const OBLIGATION_FILES = ["templates/prompts/agent-obligations.md", "plugins/pipeline-core/templates/prompts/agent-obligations.md"];
const TASK_TEMPLATES = ["templates/prompts/goldfish-task.md", "plugins/pipeline-core/templates/prompts/goldfish-task.md"];
const readUnix = (rel) => readFileSync(join(repoRoot, rel), "utf8").replace(/\r\n/g, "\n");
const flatten = (text) => text.replace(/\s+/g, " ");

test("point 6: the declaration string the briefing names is exactly the one the preflight emits", () => {
  const source = readFileSync(join(pluginRoot, "scripts", "pipeline-start-preflight.mjs"), "utf8");
  assert.ok(source.includes(`"${ROUTE_DECLARATION}"`), "preflight declares the route string");
});

test("point 6: the obligations document (canonical and vendored) states the host-boundary-from-first-call rule", () => {
  for (const rel of OBLIGATION_FILES) {
    const text = flatten(readUnix(rel));
    assert.ok(text.includes("roleScope.testCommands.route"), `${rel}: names the preflight field`);
    assert.ok(text.includes(ROUTE_DECLARATION), `${rel}: names the declaration exactly`);
    assert.ok(text.includes("host-authorized-wsl"), `${rel}: names the execution boundary`);
    assert.match(text, /EVERY DoD \/ targeted \/ quick check/, rel);
    assert.match(text, /from the FIRST call/, rel);
    assert.match(text, /never sandbox first/, rel);
    assert.match(text, /never probe both views/, rel);
  }
});

test("point 6: the Goldfish task template (canonical and vendored) carries the matching line inside the targeted-checks field", () => {
  for (const rel of TASK_TEMPLATES) {
    const text = readUnix(rel);
    const start = text.indexOf("- Targeted checks");
    const end = text.indexOf("- Quick check:");
    assert.ok(start >= 0 && start < end, rel);
    const field = flatten(text.slice(start, end));
    assert.ok(field.includes("roleScope.testCommands.route"), `${rel}: names the preflight field`);
    assert.ok(field.includes(ROUTE_DECLARATION), `${rel}: names the declaration exactly`);
    assert.match(field, /from the first call/, rel);
    assert.match(field, /agent-obligations\.md/, rel);
  }
});

// --- Point 7 (K128, PO decision of 2026-10-23, batch 12, row 41): the typed fallback record rides on the review receipt ----------
// The open entry "pin the fallback evidence on the single-review route": an OPTIONAL, CLOSED `fallback` field of the design review
// receipt. Names come from records that already exist: `route` and `reasonCode` (the canonical fallback result and the recovery
// state), `requestedRoute` and `observedIdentity` (the receipt producer). Absent stays valid, so every existing receipt is unchanged.
const FALLBACK = Object.freeze({
  route: "fallback-self-dispatch", reasonCode: "RRP-FALLBACK-SELF-DISPATCH-NO-CARRIER",
  requestedRoute: "duty.critic_normal", observedIdentity: "unknown",
});
const P7_FEATURE = "feat-k128";
const p7Sources = () => ({ prd: { path: "specs/f/prd.md", sha256: digest("1") }, spec: { path: "specs/f/spec.md", sha256: digest("2") }, companions: [] });
const p7Input = (extra = {}) => ({
  featureId: P7_FEATURE, previous: null, sources: p7Sources(), reviewer: { runner: "claude", model: "unknown" },
  report: { path: "specs/f/review.md", sha256: digest("3") }, openFindingIds: [], reviewedAt: "2026-10-23T09:00:00.000Z", ...extra,
});
const p7Bytes = (object) => new TextEncoder().encode(`${canonical(object)}\n`);

test("point 7a: a receipt that carries the typed fallback is accepted, round-trips and is surfaced by the summary", () => {
  const created = createDesignReviewReceipt(p7Input({ fallback: { ...FALLBACK } }));
  assert.equal(created.ok, true, `createDesignReviewReceipt: ${created.code}`);
  assert.deepEqual(created.receipt.fallback, FALLBACK);
  const parsed = parseDesignReviewReceipt(created.bytes);
  assert.equal(parsed.ok, true, `parse: ${parsed.code}`);
  assert.deepEqual(parsed.receipt.fallback, FALLBACK);
  const summary = summarizeDesignReviewReceipt({ path: "specs/f/review/r1.json", bytes: created.bytes });
  assert.equal(summary.ok, true, `summarize: ${summary.code}`);
  assert.deepEqual(summary.summary.fallback, FALLBACK, "the read-back summary names the fallback");
});

test("point 7b: a receipt without the field is unchanged (no key, same summary shape, still valid)", () => {
  const created = createDesignReviewReceipt(p7Input());
  assert.equal(created.ok, true);
  assert.equal(Object.hasOwn(created.receipt, "fallback"), false);
  assert.equal(parseDesignReviewReceipt(created.bytes).ok, true);
  const summary = summarizeDesignReviewReceipt({ path: "specs/f/review/r1.json", bytes: created.bytes });
  assert.equal(summary.ok, true);
  assert.equal(Object.hasOwn(summary.summary, "fallback"), false, "no fallback key appears on a native receipt summary");
});

test("point 7c: a malformed or extended fallback is refused on creation and on parse; unknown keys stay refused", () => {
  const malformed = [
    ["extra key", { ...FALLBACK, extra: "x" }],
    ["missing observedIdentity", (({ observedIdentity, ...rest }) => rest)(FALLBACK)],
    ["wrong route", { ...FALLBACK, route: "native" }],
    ["lower-case reason code", { ...FALLBACK, reasonCode: "rrp-fallback" }],
    ["space in requested route", { ...FALLBACK, requestedRoute: "duty critic" }],
    ["empty observed identity", { ...FALLBACK, observedIdentity: "" }],
    ["not an object", "fallback-self-dispatch"],
    ["null", null],
  ];
  for (const [label, fallback] of malformed) {
    const created = createDesignReviewReceipt(p7Input({ fallback }));
    assert.equal(created.ok, false, `creation must refuse: ${label}`);
    assert.equal(created.code, "DRR-SHAPE", label);
  }
  const good = createDesignReviewReceipt(p7Input({ fallback: { ...FALLBACK } }));
  assert.equal(good.ok, true);
  for (const [label, fallback] of malformed) {
    const bytes = p7Bytes({ ...good.receipt, fallback });
    assert.equal(parseDesignReviewReceipt(bytes).ok, false, `parse must refuse: ${label}`);
  }
  assert.equal(parseDesignReviewReceipt(p7Bytes({ ...createDesignReviewReceipt(p7Input()).receipt, unknownKey: 1 })).code, "DRR-SHAPE", "an unknown top-level key is still refused");
});

test("point 7d: the approval binding that present-plan builds names the fallback of the receipt, and is unchanged without it", () => {
  const entry = (extra) => ({ path: "specs/f/review/r1.json", bytes: createDesignReviewReceipt(p7Input(extra)).bytes });
  const withFallback = createDesignApprovalBinding({ featureId: P7_FEATURE, receipts: [entry({ fallback: { ...FALLBACK } })], currentSources: p7Sources() });
  assert.equal(withFallback.ok, true, `binding: ${withFallback.code} ${withFallback.causes}`);
  assert.deepEqual(withFallback.binding.reviewReceipts[0].fallback, FALLBACK, "the presented binding names the fallback");
  assert.equal(validateDesignApprovalBinding(withFallback.binding).ok, true);
  assert.equal(validateDesignApprovalBinding({ ...withFallback.binding, reviewReceipts: [{ ...withFallback.binding.reviewReceipts[0], fallback: { ...FALLBACK, extra: 1 } }] }).ok, false, "an extended fallback in a binding is refused");
  assert.equal(validateDesignApprovalBinding({ ...withFallback.binding, reviewReceipts: [{ ...withFallback.binding.reviewReceipts[0], unknownKey: 1 }] }).ok, false, "unknown keys stay refused");
  const native = createDesignApprovalBinding({ featureId: P7_FEATURE, receipts: [entry({})], currentSources: p7Sources() });
  assert.equal(native.ok, true, `native binding: ${native.code}`);
  assert.deepEqual(Object.keys(native.binding.reviewReceipts[0]).sort(), ["path", "round", "sha256"], "a native receipt keeps the exact three-key binding entry");
});

test("point 7e: the receipt producer writes the fallback when the typed fallback occurred, and refuses it without a requested route", () => {
  const dir = realpathSync(mkdtempSync(join(scratchParent, "k128-fallback-receipt-")));
  try {
    const relative = (name) => `specs/f/${name}`;
    mkdirSync(join(dir, "specs", "f"), { recursive: true });
    for (const [name, text] of [["prd.md", "# PRD\n"], ["spec.md", "# Spec\n"], ["review.md", "# Critic report\n\nVerdict: PASS\n"]]) writeFileSync(join(dir, relative(name)), text);
    const base = { repo: dir, featureId: P7_FEATURE, reportPath: relative("review.md"), prdPath: relative("prd.md"), specPath: relative("spec.md") };
    const env = { CLAUDECODE: "1" };
    const made = createReceiptFromDisk({ ...base, outPath: relative("r1.json"), requestedRoute: "duty.critic_normal", fallbackReasonCode: "RRP-FALLBACK-SELF-DISPATCH-NO-CARRIER" }, { env });
    assert.equal(made.ok, true, `${made.code}: ${made.message}`);
    assert.deepEqual(made.receipt.fallback, FALLBACK);
    assert.deepEqual(parseDesignReviewReceipt(readFileSync(join(dir, relative("r1.json")))).receipt.fallback, FALLBACK, "the file on disk carries it");
    const refused = createReceiptFromDisk({ ...base, outPath: relative("r2.json"), fallbackReasonCode: "RRP-FALLBACK-SELF-DISPATCH-NO-CARRIER" }, { env });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "DRC-USAGE", "a fallback names the route that was requested");
    const badCode = createReceiptFromDisk({ ...base, outPath: relative("r3.json"), requestedRoute: "duty.critic_normal", fallbackReasonCode: "not a code" }, { env });
    assert.equal(badCode.ok, false);
    assert.equal(badCode.code, "DRC-USAGE");
    const native = createReceiptFromDisk({ ...base, outPath: relative("r4.json") }, { env });
    assert.equal(native.ok, true);
    assert.equal(Object.hasOwn(native.receipt, "fallback"), false, "no fallback unless it occurred");
    let printed = "";
    const code = receiptProducerMain(["create", "--repo", dir, "--feature", P7_FEATURE, "--report", relative("review.md"), "--prd", relative("prd.md"), "--spec", relative("spec.md"),
      "--requested-route", "duty.critic_normal", "--observed-identity", "claude-sonnet-5-5", "--fallback-reason-code", "RRP-FALLBACK-ADVISOR-CONSULT", "--out", relative("r5.json")], env,
    { writeFn: (text) => { printed += text; }, errorFn: () => {} });
    assert.equal(code, 0, printed);
    assert.deepEqual(JSON.parse(printed).fallback, { ...FALLBACK, reasonCode: "RRP-FALLBACK-ADVISOR-CONSULT", observedIdentity: "claude-sonnet-5-5" }, "the CLI report names the fallback");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("point 7f: present-plan states the fallback so a single-review route is not presented as an independent review", () => {
  const source = readFileSync(join(pluginRoot, "scripts", "pipeline-state.mjs"), "utf8");
  assert.match(source, /Review route: .*fallback-self-dispatch/u, "present-plan prints a line naming the fallback route");
  assert.match(source, /not an independent/u);
});

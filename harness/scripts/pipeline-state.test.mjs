#!/usr/bin/env node
/**
 * pipeline-state.test.mjs — behavior tests for the sanctioned pipeline-state.mjs
 * writer CLI (AP1-P3 "DURIN").
 *
 * Run: node harness/scripts/pipeline-state.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed (failure list on stdout).
 *
 * Two layers: (a) in-process calls against `run()` with injected {dir, now, gitHead}
 * (fast, no real git/process spawn needed for most cases), (b) one real-git-repo case
 * for `approve-push` end to end (spawnSync the actual CLI as a subprocess, mirroring
 * how a Goldfish/Elephant would invoke it).
 */
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, renameSync, symlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  acquireContinuityLock,
  atomicWriteContinuityState,
  continuityLockPath,
  releaseContinuityLock,
  run,
  readState,
  statePath,
  CONTINUITY_LOCK_SCHEMA_ID,
  SCHEMA_ID,
} from "./pipeline-state.mjs";
import { computeContinuityFinalDigest } from "../../plugins/pipeline-core/lib/continuity-host-adapter.mjs";
import { loadManifestSafe } from "../../plugins/pipeline-core/lib/manifest.mjs";
import { loadStateSafe, resolveSuggestion } from "../../plugins/pipeline-core/hooks/stop-suggest.mjs";
import { COURSE_KINDS, buildCourseDecisionBrief, sha256Canonical } from "../../plugins/pipeline-core/lib/review-economy.mjs";
import {
  PO_GATE_AUTHORITY_EVIDENCE_SCHEMA,
  PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
  PO_GATE_PRD_LANGUAGE_MARKER,
  createPoGateProfileReceipt,
  derivePoGateRepositoryFingerprint,
  poGateProfileReceiptPath,
  serializePoGateProfileReceipt,
} from "../../plugins/pipeline-core/lib/po-gate-authority.mjs";

const CLI = fileURLToPath(new URL("./pipeline-state.mjs", import.meta.url));
const ALL_DIRS = [];
function freshDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `pipeline-state-${prefix}-`));
  ALL_DIRS.push(dir);
  return dir;
}

let pass = 0;
const failures = [];
function ok(id, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}${detail ? `: ${detail}` : ""}`);
    console.log(`FAIL  ${id}${detail ? ` -- ${detail}` : ""}`);
  }
}

function captureConsoleError(action) {
  const original = console.error;
  const messages = [];
  console.error = (...args) => messages.push(args.join(" "));
  try {
    return { value: action(), text: messages.join("\n") };
  } finally {
    console.error = original;
  }
}

const FIXED_NOW = () => "2026-07-07T21:00:00.000Z";
const FIXED_GIT_HEAD = () => ({ ok: true, commit: "abc123deadbeef" });
const FIXED_NOW_MS = () => 60_000;
let nonceSequence = 0;
const continuityDeps = (dir, overrides = {}) => ({
  dir,
  now: FIXED_NOW,
  nowMs: FIXED_NOW_MS,
  ownerNonce: () => `nonce-${String(++nonceSequence).padStart(8, "0")}`,
  lockStaleMs: 30_000,
  ...overrides,
});
const A = "a".repeat(64);
const B = "b".repeat(64);
const RESULT_FIXTURE = "```pipeline-result\n{\n  \"finalIntegrations\": []\n}\n```\n";
const COURSE_RESULT_FIXTURE = "```pipeline-result\n{\n  \"decisionBriefs\": [],\n  \"courseDecisionIntents\": [],\n  \"courseDecisionReceipts\": [],\n  \"finalIntegrations\": []\n}\n```\n";
const C = createHash("sha256").update(RESULT_FIXTURE).digest("hex");
const D = "d".repeat(64);
const CONTINUITY_FEATURE = "phase26-test";

function injectedPoGateAuthority(planPath) {
  const planSha256 = createHash("sha256").update(`fixture:${planPath}`).digest("hex");
  const specPath = `${planPath.slice(0, planPath.lastIndexOf("/") + 1)}spec.md`;
  const specSha256 = createHash("sha256").update(`fixture:${specPath}`).digest("hex");
  const value = {
    schema: PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
    humanFacing: "de",
    sourceSha256: A,
    runtimeSha256: B,
    receiptSha256: C,
    repositoryFingerprint: D,
    planPath,
    planSha256,
    specPath,
    specSha256,
  };
  return ({ expectedPlanSha256, expectedSpecSha256 } = {}) =>
    (expectedPlanSha256 === undefined || expectedPlanSha256 === planSha256)
      && (expectedSpecSha256 === undefined || expectedSpecSha256 === specSha256)
      ? { ok: true, code: "PO-GATE-AUTHORITY-VALID", value }
      : { ok: false, code: "PO-GATE-AUTHORITY-STALE" };
}

function seedSubprocessPoGateAuthority(dir, planPath) {
  const sourcePath = join(dir, "pipeline.user.yaml");
  const runtimePath = join(dir, ".claude", "pipeline.yaml");
  if (!existsSync(sourcePath)) {
    writeFileSync(sourcePath, "schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\n");
  }
  if (!existsSync(runtimePath)) {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(runtimePath, "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n");
  }
  mkdirSync(join(dir, ...planPath.split("/").slice(0, -1)), { recursive: true });
  const specPath = join(dir, ...planPath.split("/").slice(0, -1), "spec.md");
  const specBytes = Buffer.from("# Test Spec\n", "utf8");
  writeFileSync(specPath, specBytes);
  const specSha256 = createHash("sha256").update(specBytes).digest("hex");
  writeFileSync(join(dir, planPath), `${PO_GATE_PRD_LANGUAGE_MARKER("de")}\n<!-- technical-spec-sha256: ${specSha256} -->\n# Test PRD\n`);

  const gitCommonDir = join(dir, ".git");
  const receipt = createPoGateProfileReceipt({
    repositoryFingerprint: derivePoGateRepositoryFingerprint({ gitCommonDir, primaryRoot: dir }),
    primaryRoot: dir,
    sourceBytes: readFileSync(sourcePath),
    runtimeBytes: readFileSync(runtimePath),
    updatedAt: FIXED_NOW(),
  });
  const receiptPath = poGateProfileReceiptPath(gitCommonDir);
  mkdirSync(join(gitCommonDir, "agent-pipeline", "po-gate"), { recursive: true });
  writeFileSync(receiptPath, serializePoGateProfileReceipt(receipt));
  chmodSync(receiptPath, 0o600);
}

function continuityIdentity(overrides = {}) {
  return {
    featureId: CONTINUITY_FEATURE,
    queueRevision: 0,
    packageId: "P1",
    actionId: "continuity-writer",
    dispatchId: "dispatch-p1-01",
    attemptId: "attempt-01",
    authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C },
    routeRequestSha256: D,
    mayDelegate: false,
    ...overrides,
  };
}

function continuityQueue(overrides = {}) {
  return {
    packageId: "P1",
    actionId: "continuity-writer",
    nextAction: "poll",
    productRetryCount: 0,
    environmentRerouteCount: 0,
    dispatch: continuityIdentity(),
    ...overrides,
  };
}

function continuityState(overrides = {}) {
  return {
    schema: "pipeline.continuity.v0",
    featureId: CONTINUITY_FEATURE,
    revision: 0,
    runtime: { humanFacingLanguage: "en", activeDuty: "Coordinator" },
    authority: {
      prd: { path: "specs/prd.md", sha256: A },
      spec: { path: "specs/spec.md", sha256: B },
      result: { path: "specs/result.md", sha256: C },
    },
    queueHead: continuityQueue(),
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 0, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: { concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1, fallbackPolicy: "defer" },
    ...overrides,
  };
}

function writeRequest(dir, name, value) {
  const rel = `${name}.json`;
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2) + "\n");
  return rel;
}

function seedContinuityRoot(dir) {
  run(["set-feature", "--id", CONTINUITY_FEATURE, "--plan-path", "specs/prd.md"], { dir, now: FIXED_NOW });
  mkdirSync(join(dir, "specs"), { recursive: true });
  writeFileSync(join(dir, "specs", "result.md"), RESULT_FIXTURE);
}

function seedCourseContinuityRoot(dir) {
  seedContinuityRoot(dir);
  writeFileSync(join(dir, "specs", "result.md"), COURSE_RESULT_FIXTURE);
  return createHash("sha256").update(COURSE_RESULT_FIXTURE).digest("hex");
}

function courseOption(kind, index, continuationTransitionSha256 = A) {
  return {
    optionId: `option-${index}`,
    kind,
    equivalenceKey: `course-${index}`,
    expectedOutcome: `outcome-${index}`,
    scopeDelta: { add: [], modify: [], remove: [] },
    requiredEvidence: [{ id: `evidence-${index}`, sha256: A }],
    timeCost: { minimumMinutes: 0, maximumMinutes: 30, confidence: "medium" },
    residualRisk: `risk-${index}`,
    securityAssuranceClaims: [],
    claimImpact: { addedClaims: [], removedClaims: [], retainedNonClaims: ["os-isolation"] },
    reversibility: "reversible",
    authority: kind === "stop" || kind === "defer" ? "po" : "coordinator",
    permittedOperations: [],
    trustBoundary: "unchanged",
    newTrustBoundaries: [],
    rollbackImpact: `rollback-${index}`,
    resumeImpact: `resume-${index}`,
    resumePredicate: kind === "defer" ? "external-predicate" : null,
    continuationTransitionSha256: kind === "defer" || kind === "stop" ? null : continuationTransitionSha256,
  };
}

function courseBrief(revision = 1, continuationTransitionSha256 = A) {
  return buildCourseDecisionBrief({
    briefId: "brief-01",
    featureId: CONTINUITY_FEATURE,
    revision,
    gateId: "gate-01",
    blockerId: "blocker-01",
    commit: "a".repeat(40),
    tree: "b".repeat(40),
    authorityDigests: { prd: A, spec: B },
    normalizedFailureSignature: D,
    similarityGroupId: "similar-product-failure",
    triggerEvidence: [
      { attemptId: "attempt-01", attemptSha256: A, resultId: "result-01", resultSha256: B, evidence: [{ id: "evidence-01", sha256: C }] },
      { attemptId: "attempt-02", attemptSha256: B, resultId: "result-02", resultSha256: C, evidence: [{ id: "evidence-02", sha256: D }] },
    ],
    observedCount: 2,
    configuredLimit: 1,
    gateTrigger: { kind: "repeated-signature", budget: null },
    consumedBudgets: { productRetries: 1, environmentReroutes: 0, reviewRounds: 1, correctionCommits: 1 },
    invariants: ["INV-01"],
    nonClaims: ["os-isolation"],
    forbiddenOperations: ["main-merge", "force-push"],
    exactPoDecisionQuestion: "Which evidence-bound course should be selected?",
    alternatives: COURSE_KINDS.map((kind, index) => courseOption(kind, index, continuationTransitionSha256)),
    eliminated: [],
    recommendation: { optionId: "option-0", evidence: [{ id: "recommendation-evidence", sha256: A }], nonBinding: true },
  });
}

function courseDispositionDigest(kind, intent, resumePredicate) {
  return sha256Canonical({
    schema: "pipeline.course-disposition.v1",
    kind,
    idempotencyKey: intent.idempotencyKey,
    briefSha256: intent.briefSha256,
    optionId: intent.optionId,
    blockerSignature: intent.blockerSignature,
    poEvidenceSha256: intent.poEvidenceSha256,
    preStateSha256: intent.preStateSha256,
    expectedRevision: intent.expectedRevision,
    selectedRevision: intent.selectedRevision,
    dispatchableRevision: intent.dispatchableRevision,
    resumePredicate,
  });
}

function continuityArgs(sub, revision, requestFile, token = "token-00000001") {
  return [sub, "--expected-revision", String(revision), "--request-file", requestFile, "--lock-token", token];
}

function finalTransactionFixture(dir, name = "txn") {
  seedContinuityRoot(dir);
  const initial = continuityState();
  const initFile = writeRequest(dir, `${name}-init`, initial);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const resultJson = JSON.stringify({ verdict: "pass" });
  const envelope = {
    schema: "pipeline.continuity-final.v0", identity: continuityIdentity(), outcome: "succeeded",
    resultJson, resultBytes: Buffer.byteLength(resultJson, "utf8"),
  };
  const delivered = { ...envelope, resultDigest: computeContinuityFinalDigest(envelope) };
  const observation = { status: "completed", identity: continuityIdentity(), final: delivered };
  const next = structuredClone(initial);
  next.revision = 1;
  next.acknowledgedFinal = {
    identity: continuityIdentity(), resultDigest: delivered.resultDigest,
    finalOutcome: "succeeded", integratedRevision: 1,
  };
  next.queueHead = continuityQueue({ actionId: `${name}-next`, nextAction: "dispatch", dispatch: null });
  next.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  const nextTransition = Object.fromEntries(
    ["queueHead", "blocker", "resume", "recovery", "decisionTxn", "capacity"].map((key) => [key, next[key]]),
  );
  const request = { observation, nextTransition, result: { path: "specs/result.md", preResultSha256: C } };
  return { initial, request, requestFile: writeRequest(dir, `${name}-final`, request) };
}

function canonicalFixtureJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalFixtureJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalFixtureJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// ---- PS01: approve-plan without --by is refused, nothing written ----------------------
{
  const dir = freshDir("refuse-approve-no-by");
  const code = run(["approve-plan"], { dir, now: FIXED_NOW });
  ok("PS01a approve-plan without --by refused (exit 2)", code === 2, `got ${code}`);
  ok("PS01b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS02: approve-plan with empty --by is refused -------------------------------------
{
  const dir = freshDir("refuse-approve-empty-by");
  const code = run(["approve-plan", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS02 approve-plan with empty --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS03: revoke-plan without --by is refused -----------------------------------------
{
  const dir = freshDir("refuse-revoke-no-by");
  const code = run(["revoke-plan"], { dir, now: FIXED_NOW });
  ok("PS03 revoke-plan without --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS04: approve-push without --by is refused ----------------------------------------
{
  const dir = freshDir("refuse-push-no-by");
  const code = run(["approve-push"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS04 approve-push without --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS05: malformed pre-existing state file -> English error, exit 2, no overwrite -----
{
  const dir = freshDir("malformed-existing");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), "{ this is not json");
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["set-feature", "--id", "x", "--plan-path", "p.md"], { dir, now: FIXED_NOW });
  ok("PS05a malformed existing file -> exit 2", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS05b file left byte-identical (no silent overwrite)", after === before);
}

// ---- PS06: approve-plan shape correct ---------------------------------------------------
{
  const dir = freshDir("approve-shape");
  run(["set-feature", "--id", "ap1-pipeline-tuning", "--plan-path", ".claude/plans/x.md"], { dir, now: FIXED_NOW });
  const code = run(["approve-plan", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    poGateAuthority: injectedPoGateAuthority(".claude/plans/x.md"),
  });
  ok("PS06a approve-plan exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS06b schema field correct", state.schema === SCHEMA_ID);
  ok("PS06c planApproved true", state.planApproved === true);
  ok(
    "PS06d planApproval is exact v2 and binds the injected Plan and Spec authority",
    state.planApproval?.schema === "pipeline.plan-approval.v2"
      && state.planApproval?.approvedBy === "po-test"
      && state.planApproval?.approvedAt === FIXED_NOW()
      && state.planApproval?.specBoundBy === "po-test"
      && state.planApproval?.specBoundAt === FIXED_NOW()
      && state.planApproval?.poGateAuthority?.schema === PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA,
  );
  ok("PS06e activeFeature preserved from set-feature", state.activeFeature?.id === "ap1-pipeline-tuning");
}

// ---- PS07: set-feature resets planApproved to false + phase design ---------------------
{
  const dir = freshDir("set-feature-reset");
  run(["set-feature", "--id", "f1", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  run(["approve-plan", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    poGateAuthority: injectedPoGateAuthority("p1.md"),
  });
  run(["set-feature", "--id", "f2", "--plan-path", "p2.md"], { dir, now: FIXED_NOW });
  const state = readState(dir).state;
  ok("PS07a new feature resets planApproved=false", state.planApproved === false);
  ok("PS07b phase reset to design (inside activeFeature, F1 fix)", state.activeFeature?.phase === "design");
  ok("PS07c prior planApproval cleared", state.planApproval === undefined);
  ok("PS07d activeFeature reflects the NEW feature", state.activeFeature?.id === "f2");
}

// ---- PS08: revoke-plan sets planApproved=false + records revocation -------------------
{
  const dir = freshDir("revoke");
  run(["set-feature", "--id", "f1", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  run(["approve-plan", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    poGateAuthority: injectedPoGateAuthority("p1.md"),
  });
  const code = run(["revoke-plan", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS08a revoke-plan exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS08b planApproved false after revoke", state.planApproved === false);
  ok("PS08c exact v2 planRevocation recorded", state.planRevocation?.schema === "pipeline.plan-revocation.v2" && state.planRevocation?.revokedBy === "po-test");
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const replay = run(["revoke-plan", "--by", "po-test"], { dir, now: () => "2026-07-07T22:00:00.000Z" });
  ok("PS08d revoke-plan replay accepts the stored timestamp after an ambiguous response", replay === 0, `got ${replay}`);
  ok("PS08e revoke-plan replay leaves state byte-identical", readFileSync(statePath(dir), "utf8") === beforeReplay);
}

// ---- PS08f: bind-plan-spec replay keeps the stored bind time --------------------------
{
  const dir = freshDir("bind-plan-spec-replay");
  const planPath = "specs/bind/prd_bind.md";
  const planSha256 = createHash("sha256").update(`fixture:${planPath}`).digest("hex");
  const specPath = "specs/bind/spec.md";
  const specSha256 = createHash("sha256").update(`fixture:${specPath}`).digest("hex");
  const authority = injectedPoGateAuthority(planPath);
  run(["set-feature", "--id", "bind-replay", "--plan-path", planPath], { dir, now: FIXED_NOW });
  const legacy = readState(dir).state;
  writeFileSync(statePath(dir), JSON.stringify({
    ...legacy,
    planApproved: true,
    planApproval: { approvedBy: "original-po", approvedAt: FIXED_NOW() },
  }, null, 2) + "\n");
  const first = run([
    "bind-plan-spec", "--by", "po-test", "--expected-plan-sha256", planSha256, "--expected-spec-sha256", specSha256,
  ], { dir, now: FIXED_NOW, poGateAuthority: authority });
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const replay = run([
    "bind-plan-spec", "--by", "po-test", "--expected-plan-sha256", planSha256, "--expected-spec-sha256", specSha256,
  ], { dir, now: () => "2026-07-07T22:00:00.000Z", poGateAuthority: authority });
  ok("PS08f bind-plan-spec initial transition exits 0", first === 0, `got ${first}`);
  ok("PS08g bind-plan-spec replay exits 0 with a newer wall clock", replay === 0, `got ${replay}`);
  ok("PS08h bind-plan-spec replay leaves state byte-identical", readFileSync(statePath(dir), "utf8") === beforeReplay);
}

// ---- PS09: set-phase updates only phase ------------------------------------------------
{
  const dir = freshDir("set-phase");
  run(["set-feature", "--id", "f1", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  run(["approve-plan", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    poGateAuthority: injectedPoGateAuthority("p1.md"),
  });
  const code = run(["set-phase", "--phase", "implementation"], { dir, now: FIXED_NOW });
  ok("PS09a set-phase exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS09b phase updated (inside activeFeature, F1 fix)", state.activeFeature?.phase === "implementation");
  ok("PS09c planApproved untouched", state.planApproved === true);
  ok("PS09d activeFeature id/planPath untouched by set-phase", state.activeFeature?.id === "f1" && state.activeFeature?.planPath === "p1.md");
}

// ---- PS10: approve-push records {approvedBy, approvedAt, forCommit} via injected git --
{
  const dir = freshDir("approve-push-shape");
  const code = run(["approve-push", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS10a approve-push exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS10b pushApproval.lastApproved shape correct",
    state.pushApproval?.lastApproved?.approvedBy === "po-test" &&
      state.pushApproval?.lastApproved?.approvedAt === FIXED_NOW() &&
      state.pushApproval?.lastApproved?.forCommit === "abc123deadbeef",
  );
}

// ---- PS11: approve-push fails cleanly when git rev-parse HEAD fails -------------------
{
  const dir = freshDir("approve-push-no-git");
  const code = run(["approve-push", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    gitHead: () => ({ ok: false, error: "not a git repository" }),
  });
  ok("PS11 approve-push without a resolvable HEAD refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS12: real subprocess invocation end-to-end (real git repo) ----------------------
{
  const dir = freshDir("subprocess-e2e");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const head = git("rev-parse", "HEAD").stdout.trim();

  const planPath = "specs/e2e/prd_e2e.md";
  seedSubprocessPoGateAuthority(dir, planPath);
  const res1 = spawnSync(process.execPath, [CLI, "set-feature", "--id", "e2e", "--plan-path", planPath], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  ok("PS12a subprocess set-feature exit 0", res1.status === 0, `stderr: ${res1.stderr}`);

  const res2 = spawnSync(process.execPath, [CLI, "approve-plan", "--by", "po-test"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  ok("PS12b subprocess approve-plan exit 0", res2.status === 0, `stderr: ${res2.stderr}`);

  const res3 = spawnSync(process.execPath, [CLI, "approve-push", "--by", "po-test"], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  ok("PS12c subprocess approve-push exit 0", res3.status === 0, `stderr: ${res3.stderr}`);

  const finalState = JSON.parse(readFileSync(statePath(dir), "utf8"));
  ok("PS12d final state has planApproved true", finalState.planApproved === true);
  ok("PS12e final state pushApproval.forCommit matches real HEAD", finalState.pushApproval?.lastApproved?.forCommit === head);
  ok("PS12f state file is pretty-printed (contains newline+indent)", readFileSync(statePath(dir), "utf8").includes("\n  "));
}

// ---- PS13: unknown subcommand refused ---------------------------------------------------
{
  const dir = freshDir("unknown-cmd");
  const code = run(["frobnicate"], { dir, now: FIXED_NOW });
  ok("PS13 unknown subcommand refused (exit 2)", code === 2, `got ${code}`);
  ok("PS13b nothing written", !existsSync(statePath(dir)));
}

// ---- PS14: F1 REAL end-to-end integration -- the real CLI subprocess writes the state file,
// stop-suggest.mjs's own real resolver reads it -- this is the exact test class whose absence
// let Finding F1 (specs/2026-07-07-ap1-tuning/e2e-demo.md) ship: pipeline-state.mjs wrote
// `phase` top-level while stop-suggest.mjs reads `activeFeature.phase`, and neither suite
// noticed because both fixtured the SAME (mismatched) shape independently instead of one
// producing real output for the other to consume. Declared here (not in stop-suggest.test.mjs)
// because it exercises pipeline-state.mjs's real CLI as the state-producing half.
{
  const dir = freshDir("f1-integration");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "language:",
      "  human_facing: de",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "flags:",
      "  has_ui: false",
      "",
    ].join("\n"),
  );

  const planPath = "specs/f1-integration/prd_f1-integration.md";
  seedSubprocessPoGateAuthority(dir, planPath);

  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
  const r1 = spawnSync(process.execPath, [CLI, "set-feature", "--id", "f1-integration-test", "--plan-path", planPath], {
    encoding: "utf8",
    env,
  });
  ok("PS14a F1-integration: real set-feature subprocess exit 0", r1.status === 0, `stderr: ${r1.stderr}`);
  const r2 = spawnSync(process.execPath, [CLI, "approve-plan", "--by", "po-test"], { encoding: "utf8", env });
  ok("PS14b F1-integration: real approve-plan subprocess exit 0", r2.status === 0, `stderr: ${r2.stderr}`);
  const r3 = spawnSync(process.execPath, [CLI, "set-phase", "--phase", "implementation"], { encoding: "utf8", env });
  ok("PS14c F1-integration: real set-phase subprocess exit 0", r3.status === 0, `stderr: ${r3.stderr}`);

  // Feed the REAL resulting file into stop-suggest.mjs's OWN real loader/resolver (not a
  // fixture reconstruction) -- this is the load-bearing cross-check.
  const manifest = loadManifestSafe(dir);
  ok("PS14d F1-integration: real manifest loads ok via stop-suggest's loadManifestSafe", manifest !== null);
  const state = loadStateSafe(statePath(dir));
  ok("PS14e F1-integration: real CLI-written state file loads via stop-suggest's loadStateSafe", state !== null);
  ok(
    "PS14f F1-integration: real state has activeFeature.phase populated (THE F1 bug: this used to be undefined)",
    state?.activeFeature?.phase === "implementation",
    JSON.stringify(state),
  );

  const suggestion = resolveSuggestion(manifest, state);
  ok(
    "PS14g F1-integration: resolveSuggestion produces a NON-EMPTY suggestion against the REAL CLI-written state",
    typeof suggestion === "string" && suggestion.length > 0,
    suggestion,
  );
  ok(
    "PS14h F1-integration: suggestion names the next phase (security-scan)",
    typeof suggestion === "string" && suggestion.includes("security-scan"),
    suggestion,
  );
}

// ---- PS15: close-feature without --by is refused, nothing written ---------------------
{
  const dir = freshDir("close-feature-no-by");
  const code = run(["close-feature"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS15a close-feature without --by refused (exit 2)", code === 2, `got ${code}`);
  ok("PS15b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS16: close-feature with empty --by is refused ------------------------------------
{
  const dir = freshDir("close-feature-empty-by");
  const code = run(["close-feature", "--by", ""], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS16 close-feature with empty --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS17: close-feature without an activeFeature is refused, nothing written ----------
{
  const dir = freshDir("close-feature-no-active");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS17a close-feature without activeFeature refused (exit 2)", code === 2, `got ${code}`);
  ok("PS17b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS18: close-feature with an activeFeature -- full shape assertion -----------------
{
  const dir = freshDir("close-feature-shape");
  run(["set-feature", "--id", "f-close", "--plan-path", "p-close.md"], { dir, now: FIXED_NOW });
  run(["approve-plan", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    poGateAuthority: injectedPoGateAuthority("p-close.md"),
  });
  run(["approve-push", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS18a close-feature exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS18b activeFeature removed", state.activeFeature === undefined);
  ok("PS18c planApproved false", state.planApproved === false);
  ok("PS18d planApproval cleared", state.planApproval === undefined);
  ok("PS18e planRevocation cleared", state.planRevocation === undefined);
  ok(
    "PS18f closedFeatures[0] shape correct",
    state.closedFeatures?.length === 1 &&
      state.closedFeatures[0].id === "f-close" &&
      state.closedFeatures[0].planPath === "p-close.md" &&
      state.closedFeatures[0].phaseAtClose === "design" &&
      state.closedFeatures[0].closedAt === FIXED_NOW() &&
      state.closedFeatures[0].closedBy === "po-test" &&
      state.closedFeatures[0].forCommit === "abc123deadbeef",
    JSON.stringify(state.closedFeatures),
  );
  ok("PS18g pushApproval preserved", state.pushApproval?.lastApproved?.forCommit === "abc123deadbeef");
}

// ---- PS19: close-feature best-effort on a git failure (DEVIATION vs. approve-push) -----
{
  const dir = freshDir("close-feature-git-error");
  run(["set-feature", "--id", "f-git-err", "--plan-path", "p.md"], { dir, now: FIXED_NOW });
  const code = run(["close-feature", "--by", "po-test"], {
    dir,
    now: FIXED_NOW,
    gitHead: () => ({ ok: false, error: "not a git repository" }),
  });
  ok("PS19a close-feature with unresolvable git HEAD still exits 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS19b forCommit null on git failure", state.closedFeatures?.[0]?.forCommit === null);
  ok("PS19c activeFeature still removed despite git failure", state.activeFeature === undefined);
}

// ---- PS20: close-feature appends -- prior closedFeatures entries are preserved ---------
{
  const dir = freshDir("close-feature-append");
  run(["set-feature", "--id", "f-first", "--plan-path", "p1.md"], { dir, now: FIXED_NOW });
  run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  run(["set-feature", "--id", "f-second", "--plan-path", "p2.md"], { dir, now: FIXED_NOW });
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS20a second close-feature exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok("PS20b closedFeatures length 2", state.closedFeatures?.length === 2, JSON.stringify(state.closedFeatures));
  ok("PS20c first closedFeatures entry unchanged", state.closedFeatures?.[0]?.id === "f-first");
  ok("PS20d second closedFeatures entry appended", state.closedFeatures?.[1]?.id === "f-second");
}

// ---- PS21: close-feature silences the stop-suggest nudge (no activeFeature -> null) ----
{
  const dir = freshDir("close-feature-nudge-silence");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline.yaml"),
    [
      "schema: pipeline.manifest.v0",
      "phases:",
      "  - name: design",
      "    enabled: true",
      "  - name: implementation",
      "    enabled: true",
      "  - name: security-scan",
      "    enabled: true",
      "gates:",
      "  dev-plan:",
      "    mode: blocking",
      "    type: human",
      "  push:",
      "    mode: blocking",
      "    type: human",
      "  security:",
      "    mode: blocking",
      "    type: automated",
      "profiles:",
      "  active: full-sdlc",
      "  full-sdlc:",
      "    phases:",
      "      - design",
      "      - implementation",
      "      - security-scan",
      "flags:",
      "  has_ui: false",
      "",
    ].join("\n"),
  );
  run(["set-feature", "--id", "nudge-test", "--plan-path", ".claude/plans/nudge.md"], { dir, now: FIXED_NOW });
  run(["set-phase", "--phase", "implementation"], { dir, now: FIXED_NOW });

  const manifestBefore = loadManifestSafe(dir);
  const stateBefore = loadStateSafe(statePath(dir));
  const suggestionBefore = resolveSuggestion(manifestBefore, stateBefore);
  ok(
    "PS21a sanity: BEFORE close-feature the nudge is non-empty",
    typeof suggestionBefore === "string" && suggestionBefore.length > 0,
    suggestionBefore,
  );

  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS21b close-feature exit 0", code === 0, `got ${code}`);

  const manifestAfter = loadManifestSafe(dir);
  const stateAfter = loadStateSafe(statePath(dir));
  const suggestionAfter = resolveSuggestion(manifestAfter, stateAfter);
  ok("PS21c AFTER close-feature the nudge is silent (null)", suggestionAfter === null, JSON.stringify(suggestionAfter));
}

// ---- PS22: close-feature refuses when activeFeature.id is blank (F2 hardening) ---------
{
  const dir = freshDir("close-feature-blank-id");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify({ schema: SCHEMA_ID, activeFeature: { id: "", planPath: "p.md", phase: "design" } }, null, 2) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS22a close-feature with blank activeFeature.id refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS22b file left byte-identical (no silent write)", after === before);
}

// ---- PS23: close-feature refuses when activeFeature.planPath is blank (F2 hardening) ---
{
  const dir = freshDir("close-feature-blank-planpath");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify({ schema: SCHEMA_ID, activeFeature: { id: "f-blank-plan", planPath: "  ", phase: "design" } }, null, 2) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS23a close-feature with blank activeFeature.planPath refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS23b file left byte-identical (no silent write)", after === before);
}

// ---- PS24: close-feature refuses when existing closedFeatures is not an array (F2) -----
{
  const dir = freshDir("close-feature-nonarray-closed");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify(
      { schema: SCHEMA_ID, activeFeature: { id: "f-ok", planPath: "p.md", phase: "design" }, closedFeatures: "not-an-array" },
      null,
      2,
    ) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS24a close-feature with non-array closedFeatures refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS24b file left byte-identical (no silent overwrite with [])", after === before);
}

// ---- PS25: close-feature happy path still succeeds and appends the audit entry ---------
// (regression guard: the new F2 validations must not break the normal case already
// covered by PS18/PS20 -- kept as an explicit, minimal case named for the F2 fix.)
{
  const dir = freshDir("close-feature-f2-happy-path");
  run(["set-feature", "--id", "f2-happy", "--plan-path", "p2-happy.md"], { dir, now: FIXED_NOW });
  const code = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS25a close-feature happy path exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS25b closedFeatures[0] appended with correct id/planPath",
    state.closedFeatures?.length === 1 && state.closedFeatures[0].id === "f2-happy" && state.closedFeatures[0].planPath === "p2-happy.md",
    JSON.stringify(state.closedFeatures),
  );
  ok("PS25c activeFeature removed", state.activeFeature === undefined);
}

// ---- PS26: approve-deploy binds {forArtifact, forEnvironment, approvedBy, approvedAt} -----
{
  const dir = freshDir("approve-deploy-shape");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS26a approve-deploy exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS26b deployApprovals[0] shape correct",
    state.deployApprovals?.length === 1 &&
      state.deployApprovals[0].forArtifact === "v1.0.0" &&
      state.deployApprovals[0].forEnvironment === "prod" &&
      state.deployApprovals[0].approvedBy === "po-test" &&
      state.deployApprovals[0].approvedAt === FIXED_NOW() &&
      state.deployApprovals[0].usedAt === undefined,
    JSON.stringify(state.deployApprovals),
  );
}

// ---- PS27: approve-deploy refuses blank --env/--artifact/--by, nothing written ------------
{
  const dir = freshDir("approve-deploy-blank-env");
  const code = run(["approve-deploy", "--env", "", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS27a approve-deploy blank --env refused (exit 2)", code === 2, `got ${code}`);
  ok("PS27b nothing written", readState(dir).status === "absent");
}
{
  const dir = freshDir("approve-deploy-blank-artifact");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS27c approve-deploy blank --artifact refused (exit 2)", code === 2, `got ${code}`);
  ok("PS27d nothing written", readState(dir).status === "absent");
}
{
  const dir = freshDir("approve-deploy-blank-by");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS27e approve-deploy blank --by refused (exit 2)", code === 2, `got ${code}`);
  ok("PS27f nothing written", readState(dir).status === "absent");
}
{
  const dir = freshDir("approve-deploy-missing-env");
  const code = run(["approve-deploy", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS27g approve-deploy missing --env refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS28: a `test` approval does NOT satisfy a `prod` check ------------------------------
{
  const dir = freshDir("deploy-env-does-not-cross");
  run(["approve-deploy", "--env", "test", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const codeWrongEnv = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS28a consume-deploy for prod fails when only a test approval exists (exit 2)", codeWrongEnv === 2, `got ${codeWrongEnv}`);
  const stateAfterFail = readState(dir).state;
  ok(
    "PS28b test approval left untouched (still unconsumed) after the failed prod check",
    stateAfterFail.deployApprovals?.[0]?.usedAt === undefined,
  );
  const codeRightEnv = run(["consume-deploy", "--env", "test", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS28c consume-deploy for the matching test env succeeds (exit 0)", codeRightEnv === 0, `got ${codeRightEnv}`);
}

// ---- PS29: consumed-on-use -- a consumed record fails a second consume-deploy check ------
{
  const dir = freshDir("deploy-consumed-on-use");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code1 = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS29a first consume-deploy exit 0", code1 === 0, `got ${code1}`);
  const state1 = readState(dir).state;
  ok("PS29b usedAt set after first consume", state1.deployApprovals?.[0]?.usedAt === FIXED_NOW());
  const code2 = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS29c second consume-deploy on the same record fails (exit 2, never a silent no-op)", code2 === 2, `got ${code2}`);
}

// ---- PS30: consume-deploy refuses blank --env/--artifact/--by ----------------------------
{
  const dir = freshDir("consume-deploy-blank-env");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["consume-deploy", "--env", "", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS30a consume-deploy blank --env refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("consume-deploy-blank-artifact");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["consume-deploy", "--env", "prod", "--artifact", "", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS30b consume-deploy blank --artifact refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("consume-deploy-blank-by");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS30c consume-deploy blank --by refused (exit 2)", code === 2, `got ${code}`);
}

// ---- PS31: consume-deploy fails loudly (exit 2, nothing written) on a non-existent record -
{
  const dir = freshDir("consume-deploy-no-record");
  const code = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS31a consume-deploy with no prior approval refused (exit 2)", code === 2, `got ${code}`);
  ok("PS31b nothing written (state file absent)", readState(dir).status === "absent");
}

// ---- PS32: clear-deploy removes pending approvals for the env (unconsumed only) ----------
{
  const dir = freshDir("clear-deploy-pending-only");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["approve-deploy", "--env", "prod", "--artifact", "v2.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS32a clear-deploy exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS32b only the pending (unconsumed) v2.0.0 record was removed -- the consumed v1.0.0 record stays",
    state.deployApprovals?.length === 1 && state.deployApprovals[0].forArtifact === "v1.0.0" && state.deployApprovals[0].usedAt === FIXED_NOW(),
    JSON.stringify(state.deployApprovals),
  );
}

// ---- PS33: clear-deploy narrowed by --artifact only clears the named artifact -------------
{
  const dir = freshDir("clear-deploy-narrowed");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["approve-deploy", "--env", "prod", "--artifact", "v2.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS33a clear-deploy narrowed by --artifact exit 0", code === 0, `got ${code}`);
  const state = readState(dir).state;
  ok(
    "PS33b only v1.0.0 removed, v2.0.0 stays pending",
    state.deployApprovals?.length === 1 && state.deployApprovals[0].forArtifact === "v2.0.0",
    JSON.stringify(state.deployApprovals),
  );
}

// ---- PS34: clear-deploy refuses blank --env/--by; --artifact stays optional ---------------
{
  const dir = freshDir("clear-deploy-blank-env");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS34a clear-deploy blank --env refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("clear-deploy-blank-by");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--by", ""], { dir, now: FIXED_NOW });
  ok("PS34b clear-deploy blank --by refused (exit 2)", code === 2, `got ${code}`);
}
{
  const dir = freshDir("clear-deploy-no-artifact-ok");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS34c clear-deploy without --artifact (optional) still succeeds (exit 0)", code === 0, `got ${code}`);
}

// ---- PS35: clear-deploy fails loudly (exit 2, nothing written) when nothing matches -------
{
  const dir = freshDir("clear-deploy-no-match");
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS35a clear-deploy with no matching pending approval refused (exit 2)", code === 2, `got ${code}`);
  ok("PS35b nothing written (state file absent)", readState(dir).status === "absent");
}
{
  const dir = freshDir("clear-deploy-already-consumed-no-match");
  run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS35c clear-deploy with only an already-consumed record refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS35d file left byte-identical (no silent write)", after === before);
}

// ---- PS36: existing malformed-file refusal still holds with the new subcommands ----------
{
  const dir = freshDir("malformed-existing-deploy");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), "{ this is not json");
  const before = readFileSync(statePath(dir), "utf8");

  const codeApprove = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS36a approve-deploy on malformed existing file -> exit 2", codeApprove === 2, `got ${codeApprove}`);
  ok("PS36b file left byte-identical after approve-deploy attempt", readFileSync(statePath(dir), "utf8") === before);

  const codeConsume = run(["consume-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS36c consume-deploy on malformed existing file -> exit 2", codeConsume === 2, `got ${codeConsume}`);
  ok("PS36d file left byte-identical after consume-deploy attempt", readFileSync(statePath(dir), "utf8") === before);

  const codeClear = run(["clear-deploy", "--env", "prod", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS36e clear-deploy on malformed existing file -> exit 2", codeClear === 2, `got ${codeClear}`);
  ok("PS36f file left byte-identical after clear-deploy attempt", readFileSync(statePath(dir), "utf8") === before);
}

// ---- PS37: approve-deploy refuses a non-array pre-existing deployApprovals field ---------
{
  const dir = freshDir("approve-deploy-nonarray");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "pipeline-state.json"),
    JSON.stringify({ schema: SCHEMA_ID, deployApprovals: "not-an-array" }, null, 2) + "\n",
  );
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(["approve-deploy", "--env", "prod", "--artifact", "v1.0.0", "--by", "po-test"], { dir, now: FIXED_NOW });
  ok("PS37a approve-deploy with non-array deployApprovals refused (exit 2)", code === 2, `got ${code}`);
  const after = readFileSync(statePath(dir), "utf8");
  ok("PS37b file left byte-identical (no silent overwrite)", after === before);
}

// ---- PS38: continuity init is revision-bound, atomic and leaves no transient files --------
{
  const dir = freshDir("continuity-init");
  seedContinuityRoot(dir);
  const requestFile = writeRequest(dir, "continuity-init", continuityState());
  const code = run(continuityArgs("continuity-init", "absent", requestFile), continuityDeps(dir));
  const state = readState(dir).state;
  ok("PS38a continuity-init exit 0", code === 0, `got ${code}`);
  ok("PS38b initialized continuity is persisted at revision 0", state.continuity?.revision === 0);
  ok("PS38c continuity feature is bound to activeFeature.id", state.continuity?.featureId === state.activeFeature?.id);
  ok("PS38d owned lock is released", !existsSync(continuityLockPath(dir)));
  ok("PS38e same-directory temp is absent after rename", !readdirSync(join(dir, ".claude")).some((name) => name.includes(".tmp.")));
}

// ---- PS39: exact CAS advances once and stale replay is byte-null ---------------------------
{
  const dir = freshDir("continuity-cas");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const next = structuredClone(readState(dir).state.continuity);
  next.revision = 1;
  next.queueHead = continuityQueue({ nextAction: "dispatch", dispatch: null });
  next.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  const requestFile = writeRequest(dir, "next", next);
  const first = run(continuityArgs("continuity-cas", 0, requestFile), continuityDeps(dir));
  ok("PS39a exact continuity CAS exit 0", first === 0, `got ${first}`);
  ok("PS39b exact continuity CAS advances to revision 1", readState(dir).state.continuity?.revision === 1);
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const replay = run(continuityArgs("continuity-cas", 0, requestFile), continuityDeps(dir));
  ok("PS39c stale continuity CAS is refused", replay === 2, `got ${replay}`);
  ok("PS39d stale continuity CAS performs zero byte mutation", readFileSync(statePath(dir), "utf8") === beforeReplay);
}

// ---- PS40: invalid XOR transition fails before write ---------------------------------------
{
  const dir = freshDir("continuity-xor");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const invalid = structuredClone(readState(dir).state.continuity);
  invalid.revision = 1;
  invalid.queueHead.dispatch.queueRevision = 1;
  invalid.blocker = {
    type: "product",
    signature: "invalid-both-v1",
    resumeCondition: { kind: "manual", evidenceSha256: A },
    decisionBrief: null,
  };
  const requestFile = writeRequest(dir, "invalid", invalid);
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(continuityArgs("continuity-cas", 0, requestFile), continuityDeps(dir));
  ok("PS40a queueHead+blocker XOR violation is refused", code === 2, `got ${code}`);
  ok("PS40b invalid XOR transition performs zero byte mutation", readFileSync(statePath(dir), "utf8") === before);
}

// ---- PS41: a fresh foreign lock is preserved and blocks the writer -------------------------
{
  const dir = freshDir("continuity-foreign-lock");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const foreign = {
    schema: CONTINUITY_LOCK_SCHEMA_ID,
    token: "foreign-token-01",
    ownerNonce: "foreign-nonce-01",
    acquiredAtMs: FIXED_NOW_MS(),
  };
  writeFileSync(continuityLockPath(dir), JSON.stringify(foreign) + "\n");
  const before = readFileSync(statePath(dir), "utf8");
  const code = run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  ok("PS41a fresh foreign continuity lock blocks", code === 2, `got ${code}`);
  ok("PS41b foreign lock remains byte-owned by the foreign token", readFileSync(continuityLockPath(dir), "utf8") === JSON.stringify(foreign) + "\n");
  ok("PS41c blocked writer performs zero state mutation", readFileSync(statePath(dir), "utf8") === before);
  foreign.acquiredAtMs = 0;
  writeFileSync(continuityLockPath(dir), JSON.stringify(foreign) + "\n");
  const staleForeign = run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  ok("PS41d even a stale foreign-token lock cannot be recovered", staleForeign === 2 && readFileSync(continuityLockPath(dir), "utf8") === JSON.stringify(foreign) + "\n");
}

// ---- PS42: stale recovery requires the same token and rotates the internal nonce ------------
{
  const dir = freshDir("continuity-stale-lock");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  const stale = {
    schema: CONTINUITY_LOCK_SCHEMA_ID,
    token: "token-stale-001",
    ownerNonce: "nonce-stale-old",
    acquiredAtMs: 0,
  };
  writeFileSync(continuityLockPath(dir), JSON.stringify(stale) + "\n");
  writeFileSync(`${statePath(dir)}.tmp.${stale.ownerNonce}`, "interrupted partial state\n");
  const code = run(continuityArgs("continuity-init", "absent", initFile, stale.token), continuityDeps(dir));
  ok("PS42a same-token stale lock is recovered and transition succeeds", code === 0, `got ${code}`);
  ok("PS42b recovered owned lock is released", !existsSync(continuityLockPath(dir)));
  ok("PS42c exclusive recovery guard is released after complete takeover", !existsSync(`${continuityLockPath(dir)}.recover`));
  ok("PS42d only the stale owner's bound temp is cleaned", !existsSync(`${statePath(dir)}.tmp.${stale.ownerNonce}`));
  writeFileSync(`${continuityLockPath(dir)}.recover`, JSON.stringify(stale) + "\n");
  const guarded = acquireContinuityLock(dir, stale.token, continuityDeps(dir));
  ok("PS42e orphaned recovery guard fails closed instead of admitting another owner", guarded.ok === false && guarded.code === "PS-CONTINUITY-RECOVERY-IN-PROGRESS");
  ok("PS42f orphaned recovery guard remains for explicit disposition", existsSync(`${continuityLockPath(dir)}.recover`));
}

// ---- PS43: unsafe request paths and symlinks fail before lock acquisition -------------------
{
  const dir = freshDir("continuity-request-path");
  seedContinuityRoot(dir);
  const outside = writeRequest(dir, "real-request", continuityState());
  symlinkSync(join(dir, outside), join(dir, "linked-request.json"));
  const before = readFileSync(statePath(dir), "utf8");
  const traversal = run(continuityArgs("continuity-init", "absent", "../request.json"), continuityDeps(dir));
  const symlink = run(continuityArgs("continuity-init", "absent", "linked-request.json"), continuityDeps(dir));
  ok("PS43a traversing request path is refused", traversal === 2, `got ${traversal}`);
  ok("PS43b symlink request path is refused", symlink === 2, `got ${symlink}`);
  ok("PS43c unsafe request attempts perform zero mutation", readFileSync(statePath(dir), "utf8") === before);
  ok("PS43d unsafe request attempts never acquire a lock", !existsSync(continuityLockPath(dir)));
}

// ---- PS44: delivered final acknowledgement and next head persist in one atomic revision -----
{
  const dir = freshDir("continuity-final");
  seedContinuityRoot(dir);
  const initial = continuityState();
  const initFile = writeRequest(dir, "init", initial);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const resultJson = JSON.stringify({ verdict: "pass" });
  const envelope = {
    schema: "pipeline.continuity-final.v0",
    identity: continuityIdentity(),
    outcome: "succeeded",
    resultJson,
    resultBytes: Buffer.byteLength(resultJson, "utf8"),
  };
  const delivered = { ...envelope, resultDigest: computeContinuityFinalDigest(envelope) };
  const observation = { status: "completed", identity: continuityIdentity(), final: delivered };
  const next = structuredClone(initial);
  next.revision = 1;
  next.acknowledgedFinal = {
    identity: continuityIdentity(),
    resultDigest: delivered.resultDigest,
    finalOutcome: "succeeded",
    integratedRevision: 1,
  };
  next.queueHead = continuityQueue({ actionId: "writer-next", nextAction: "dispatch", dispatch: null });
  next.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  const nextTransition = Object.fromEntries(
    ["queueHead", "blocker", "resume", "recovery", "decisionTxn", "capacity"].map((key) => [key, next[key]]),
  );
  const requestFile = writeRequest(dir, "final", {
    observation,
    nextTransition,
    result: { path: "specs/result.md", preResultSha256: C },
  });
  const code = run(continuityArgs("continuity-integrate-final", 0, requestFile), continuityDeps(dir));
  const persisted = readState(dir).state.continuity;
  ok("PS44a final integration writer exits 0", code === 0, `got ${code}`);
  ok("PS44b acknowledgement and next head share revision 1", persisted.revision === 1 && persisted.acknowledgedFinal?.integratedRevision === 1);
  ok("PS44c persisted acknowledgement binds canonical final digest", persisted.acknowledgedFinal?.resultDigest === delivered.resultDigest);
  ok("PS44d persisted next head is dispatchable and has no stale dispatch", persisted.queueHead?.actionId === "writer-next" && persisted.queueHead?.dispatch === null);
  const integratedResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  ok("PS44e Result contains exactly one canonical immutable final integration", (integratedResult.match(/\"integrationId\":\"fi-/g) ?? []).length === 1 && persisted.authority.result.sha256 === createHash("sha256").update(integratedResult).digest("hex"));
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const beforeResultReplay = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-integrate-final", 0, requestFile), continuityDeps(dir));
  ok("PS44f matching final replay is accepted without either write", replay === 0 && readFileSync(statePath(dir), "utf8") === beforeReplay && readFileSync(join(dir, "specs", "result.md"), "utf8") === beforeResultReplay);
  const extraFile = writeRequest(dir, "final-extra", { observation, nextTransition, result: { path: "specs/result.md", preResultSha256: C }, rawHostError: "must-not-be-ignored" });
  const extra = run(continuityArgs("continuity-integrate-final", 0, extraFile), continuityDeps(dir));
  ok("PS44g non-closed final request envelope is refused byte-null", extra === 2 && readFileSync(statePath(dir), "utf8") === beforeReplay && readFileSync(join(dir, "specs", "result.md"), "utf8") === beforeResultReplay);
}

// ---- PS44R: Result-before-State crash window replays one entry to one commit -----------
{
  const dir = freshDir("continuity-final-result-first");
  const fixture = finalTransactionFixture(dir, "result-first");
  const failed = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir, {
    renameSync: () => { throw new Error("injected state rename failure"); },
  }));
  const preparedResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  ok("PS44Ra State fault reports failure after durable Result prepare", failed === 2 && readState(dir).state.continuity.revision === 0 && (preparedResult.match(/\"integrationId\":\"fi-/g) ?? []).length === 1);
  const replay = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  const replayedResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  ok("PS44Rb exact Result-before-State replay commits State without duplicate append", replay === 0 && readState(dir).state.continuity.revision === 1 && replayedResult === preparedResult && (replayedResult.match(/\"integrationId\":\"fi-/g) ?? []).length === 1);
}

// ---- PS44S: reconstructive State-before-Result repair is hash-bound --------------------
{
  const dir = freshDir("continuity-final-state-first-repair");
  const fixture = finalTransactionFixture(dir, "state-first");
  const committed = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  const committedState = readFileSync(statePath(dir), "utf8");
  const committedResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  writeFileSync(join(dir, "specs", "result.md"), RESULT_FIXTURE);
  const repair = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  ok("PS44Sa committed transaction fixture is valid", committed === 0);
  ok("PS44Sb exact old Result is reconstructively repaired without State rewrite", repair === 0 && readFileSync(statePath(dir), "utf8") === committedState && readFileSync(join(dir, "specs", "result.md"), "utf8") === committedResult);
  writeFileSync(join(dir, "specs", "result.md"), RESULT_FIXTURE.replace("[]", "[ ]"));
  const beforeTamperState = readFileSync(statePath(dir), "utf8");
  const conflict = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  ok("PS44Sc noncanonical/tampered old Result fails closed", conflict === 2 && readFileSync(statePath(dir), "utf8") === beforeTamperState);
}

// ---- PS44T: non-final transitions refuse State/Result authority drift ------------------
{
  const dir = freshDir("continuity-result-drift");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "drift-init", continuityState());
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const next = structuredClone(readState(dir).state.continuity);
  next.revision = 1;
  next.queueHead.dispatch = null;
  next.queueHead.nextAction = "verify";
  next.resume = { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" };
  const casFile = writeRequest(dir, "drift-cas", next);
  writeFileSync(join(dir, "specs", "result.md"), RESULT_FIXTURE.replace("\"finalIntegrations\"", "\"tampered\""));
  const before = readFileSync(statePath(dir), "utf8");
  const drifted = run(continuityArgs("continuity-cas", 0, casFile), continuityDeps(dir));
  ok("PS44T Result digest drift blocks other continuity commands byte-null", drifted === 2 && readFileSync(statePath(dir), "utf8") === before);
}

// ---- PS44U: every Result/State fault has an exact observable disposition ---------------
{
  const resultRenameDir = freshDir("continuity-result-rename-fault");
  const resultRenameFixture = finalTransactionFixture(resultRenameDir, "result-rename-fault");
  const beforeResultRename = readFileSync(join(resultRenameDir, "specs", "result.md"), "utf8");
  const resultRenameObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultRenameFixture.requestFile),
    continuityDeps(resultRenameDir, { renameResultSync: () => { throw new Error("injected Result rename fault"); } }),
  ));
  ok("PS44Ua Result pre-rename fault is explicitly zero-mutation", resultRenameObserved.value === 2
    && readFileSync(join(resultRenameDir, "specs", "result.md"), "utf8") === beforeResultRename
    && readState(resultRenameDir).state.continuity.revision === 0
    && resultRenameObserved.text.includes("PS-CONTINUITY-RESULT-WRITE-IO")
    && resultRenameObserved.text.includes("zero State and Result mutation"));

  const resultEffectDir = freshDir("continuity-result-rename-effect");
  const resultEffectFixture = finalTransactionFixture(resultEffectDir, "result-rename-effect");
  const resultEffectObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultEffectFixture.requestFile),
    continuityDeps(resultEffectDir, {
      renameResultSync: (from, to) => { renameSync(from, to); throw new Error("rename took effect, then threw"); },
    }),
  ));
  ok("PS44Ub Result rename-effect-then-throw is explicitly committed/not-zero", resultEffectObserved.value === 2
    && readState(resultEffectDir).state.continuity.revision === 0
    && (readFileSync(join(resultEffectDir, "specs", "result.md"), "utf8").match(/\"integrationId\":\"fi-/g) ?? []).length === 1
    && resultEffectObserved.text.includes("PS-CONTINUITY-RESULT-DURABILITY-UNKNOWN")
    && resultEffectObserved.text.includes("mutation is NOT reported as zero"));

  const resultPreWriteDir = freshDir("continuity-result-pre-write-fault");
  const resultPreWriteFixture = finalTransactionFixture(resultPreWriteDir, "result-pre-write-fault");
  const beforeResultPreWrite = readFileSync(join(resultPreWriteDir, "specs", "result.md"), "utf8");
  const resultPreWriteObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultPreWriteFixture.requestFile),
    continuityDeps(resultPreWriteDir, {
      replaceResultFdContents: () => { throw new Error("injected fault before temp write"); },
    }),
  ));
  ok("PS44U pre-write Result fault is distinctly zero-mutation", resultPreWriteObserved.value === 2
    && readFileSync(join(resultPreWriteDir, "specs", "result.md"), "utf8") === beforeResultPreWrite
    && resultPreWriteObserved.text.includes("PS-CONTINUITY-RESULT-WRITE-IO")
    && resultPreWriteObserved.text.includes("zero State and Result mutation"));

  const resultFsyncDir = freshDir("continuity-result-fsync-fault");
  const resultFsyncFixture = finalTransactionFixture(resultFsyncDir, "result-fsync-fault");
  const beforeResultFsync = readFileSync(join(resultFsyncDir, "specs", "result.md"), "utf8");
  let exactTempBytesWritten = false;
  const resultFsyncObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultFsyncFixture.requestFile),
    continuityDeps(resultFsyncDir, {
      replaceResultFdContents: (fd, bytes) => {
        writeSync(fd, bytes);
        exactTempBytesWritten = true;
        throw new Error("injected Result sync fault after exact temp write");
      },
    }),
  ));
  ok("PS44Uc Result fd-sync fault after exact temp write remains explicitly pre-commit", resultFsyncObserved.value === 2
    && exactTempBytesWritten
    && readFileSync(join(resultFsyncDir, "specs", "result.md"), "utf8") === beforeResultFsync
    && !readdirSync(join(resultFsyncDir, "specs")).some((name) => name.includes(".tmp."))
    && resultFsyncObserved.text.includes("PS-CONTINUITY-RESULT-WRITE-IO")
    && resultFsyncObserved.text.includes("zero State and Result mutation"));

  const resultDirSyncDir = freshDir("continuity-result-dir-sync-fault");
  const resultDirSyncFixture = finalTransactionFixture(resultDirSyncDir, "result-dir-sync-fault");
  const resultDirSyncObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, resultDirSyncFixture.requestFile),
    continuityDeps(resultDirSyncDir, { syncResultDirectory: () => ({ ok: false, supported: true }) }),
  ));
  ok("PS44Ud Result directory-sync fault is explicitly committed/durability-unknown", resultDirSyncObserved.value === 2
    && readState(resultDirSyncDir).state.continuity.revision === 0
    && (readFileSync(join(resultDirSyncDir, "specs", "result.md"), "utf8").match(/\"integrationId\":\"fi-/g) ?? []).length === 1
    && resultDirSyncObserved.text.includes("PS-CONTINUITY-RESULT-DURABILITY-UNKNOWN")
    && resultDirSyncObserved.text.includes("mutation is NOT reported as zero"));

  const stateEffectDir = freshDir("continuity-state-rename-effect");
  const stateEffectFixture = finalTransactionFixture(stateEffectDir, "state-rename-effect");
  const stateEffectObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, stateEffectFixture.requestFile),
    continuityDeps(stateEffectDir, {
      renameSync: (from, to) => { renameSync(from, to); throw new Error("State rename took effect, then threw"); },
    }),
  ));
  ok("PS44Ue State rename-effect-then-throw is explicitly committed/durability-unknown", stateEffectObserved.value === 2
    && readState(stateEffectDir).state.continuity.revision === 1
    && stateEffectObserved.text.includes("PS-CONTINUITY-COMMITTED-DURABILITY-UNKNOWN")
    && stateEffectObserved.text.includes("mutation is NOT reported as zero"));
}

// ---- PS44V: the between-writes window rechecks ownership and exact Result bytes --------
{
  const lossDir = freshDir("continuity-lock-loss-between-writes");
  const lossFixture = finalTransactionFixture(lossDir, "lock-loss");
  const lockLossObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, lossFixture.requestFile),
    continuityDeps(lossDir, {
      beforeStateWrite: () => writeFileSync(continuityLockPath(lossDir), JSON.stringify({
        schema: CONTINUITY_LOCK_SCHEMA_ID,
        token: "foreign-token-0001",
        ownerNonce: "foreign-nonce-0001",
        acquiredAtMs: FIXED_NOW_MS(),
      }) + "\n"),
    }),
  ));
  ok("PS44Va lock loss after durable Result explicitly blocks State without zero claim", lockLossObserved.value === 2
    && readState(lossDir).state.continuity.revision === 0
    && (readFileSync(join(lossDir, "specs", "result.md"), "utf8").match(/\"integrationId\":\"fi-/g) ?? []).length === 1
    && lockLossObserved.text.includes("PS-CONTINUITY-LOCK-OWNERSHIP")
    && lockLossObserved.text.includes("Result prepare or repair may be durable; mutation is NOT reported as zero"));

  const tamperDir = freshDir("continuity-tamper-between-writes");
  const tamperFixture = finalTransactionFixture(tamperDir, "tamper-between");
  const tamperedObserved = captureConsoleError(() => run(
    continuityArgs("continuity-integrate-final", 0, tamperFixture.requestFile),
    continuityDeps(tamperDir, {
      beforeStateWrite: () => writeFileSync(join(tamperDir, "specs", "result.md"), `${readFileSync(join(tamperDir, "specs", "result.md"), "utf8")}\n`),
    }),
  ));
  ok("PS44Vb exact Result tamper explicitly blocks State without zero claim", tamperedObserved.value === 2
    && readState(tamperDir).state.continuity.revision === 0
    && tamperedObserved.text.includes("PS-CONTINUITY-RESULT-CHANGED")
    && tamperedObserved.text.includes("Result prepare or repair may be durable; mutation is NOT reported as zero"));

  const contenderDir = freshDir("continuity-concurrent-contender");
  const contenderFixture = finalTransactionFixture(contenderDir, "contender");
  let contender;
  const serialized = run(continuityArgs("continuity-integrate-final", 0, contenderFixture.requestFile), continuityDeps(contenderDir, {
    beforeStateWrite: () => { contender = acquireContinuityLock(contenderDir, "contender-token-01", continuityDeps(contenderDir)); },
  }));
  ok("PS44Vc concurrent lock contender is refused while owner commits", serialized === 0
    && contender?.ok === false && contender?.code === "PS-CONTINUITY-LOCKED"
    && readState(contenderDir).state.continuity.revision === 1);
}

// ---- PS44W: Result codec rejects ambiguous bytes and symlink ancestors -----------------
{
  const mutations = [
    ["duplicate-key", (text) => text.replace('{\n  "finalIntegrations": []\n}', '{\n  "finalIntegrations": [],\n  "finalIntegrations": []\n}')],
    ["duplicate-fence", (text) => `${text}${text}`],
    ["crlf", (text) => text.replaceAll("\n", "\r\n")],
    ["bom", (text) => `\uFEFF${text}`],
  ];
  for (const [name, mutate] of mutations) {
    const dir = freshDir(`continuity-result-codec-${name}`);
    const fixture = finalTransactionFixture(dir, `codec-${name}`);
    writeFileSync(join(dir, "specs", "result.md"), mutate(RESULT_FIXTURE));
    const before = readFileSync(statePath(dir), "utf8");
    const refused = run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
    ok(`PS44W ${name} Result bytes are refused byte-null`, refused === 2 && readFileSync(statePath(dir), "utf8") === before);
  }

  const ancestorDir = freshDir("continuity-result-ancestor-symlink");
  const outsideDir = freshDir("continuity-result-ancestor-target");
  run(["set-feature", "--id", CONTINUITY_FEATURE, "--plan-path", "specs/prd.md"], { dir: ancestorDir, now: FIXED_NOW });
  writeFileSync(join(outsideDir, "result.md"), RESULT_FIXTURE);
  symlinkSync(outsideDir, join(ancestorDir, "specs"));
  const initFile = writeRequest(ancestorDir, "ancestor-init", continuityState());
  const before = readFileSync(statePath(ancestorDir), "utf8");
  const refused = run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(ancestorDir));
  ok("PS44W ancestor symlink in Result path is refused before mutation", refused === 2
    && readFileSync(statePath(ancestorDir), "utf8") === before);
}

// ---- PS44X: historical entries are recursively validated, not checksum-trusted ---------
{
  const rewriteHistoricalEntry = (dir, mutate) => {
    const path = join(dir, "specs", "result.md");
    const text = readFileSync(path, "utf8");
    const json = JSON.parse(/^```pipeline-result\n([\s\S]*?)\n```$/m.exec(text)[1]);
    const entry = json.finalIntegrations[0];
    mutate(entry);
    entry.nextTransitionSha256 = createHash("sha256").update(canonicalFixtureJson(entry.nextTransition)).digest("hex");
    const tuple = {
      identity: entry.identity,
      finalDigest: entry.finalDigest,
      finalOutcome: entry.finalOutcome,
      preResultSha256: entry.preResultSha256,
      nextTransitionSha256: entry.nextTransitionSha256,
    };
    entry.integrationId = `fi-${createHash("sha256").update(canonicalFixtureJson(tuple)).digest("hex")}`;
    writeFileSync(path, `\`\`\`pipeline-result\n{\n  "finalIntegrations": [\n    ${canonicalFixtureJson(entry)}\n  ]\n}\n\`\`\`\n`);
  };

  const identityDir = freshDir("continuity-history-identity-garbage");
  const identityFixture = finalTransactionFixture(identityDir, "history-identity");
  run(continuityArgs("continuity-integrate-final", 0, identityFixture.requestFile), continuityDeps(identityDir));
  rewriteHistoricalEntry(identityDir, (entry) => { entry.identity.mayDelegate = true; });
  const identityStateBefore = readFileSync(statePath(identityDir), "utf8");
  const identityReplay = run(continuityArgs("continuity-integrate-final", 0, identityFixture.requestFile), continuityDeps(identityDir));
  ok("PS44Xa self-consistent historical identity garbage is refused", identityReplay === 2
    && readFileSync(statePath(identityDir), "utf8") === identityStateBefore);

  const shapeDir = freshDir("continuity-history-shape-garbage");
  const shapeFixture = finalTransactionFixture(shapeDir, "history-shape");
  run(continuityArgs("continuity-integrate-final", 0, shapeFixture.requestFile), continuityDeps(shapeDir));
  rewriteHistoricalEntry(shapeDir, (entry) => { entry.nextTransition.capacity.reservedCriticSlots = 0; });
  const shapeStateBefore = readFileSync(statePath(shapeDir), "utf8");
  const shapeReplay = run(continuityArgs("continuity-integrate-final", 0, shapeFixture.requestFile), continuityDeps(shapeDir));
  ok("PS44Xb self-consistent malformed historical transition is refused", shapeReplay === 2
    && readFileSync(statePath(shapeDir), "utf8") === shapeStateBefore);

  const literalDigestDir = freshDir("continuity-history-literal-post-digest");
  const literalDigestFixture = finalTransactionFixture(literalDigestDir, "history-literal-digest");
  run(continuityArgs("continuity-integrate-final", 0, literalDigestFixture.requestFile), continuityDeps(literalDigestDir));
  rewriteHistoricalEntry(literalDigestDir, (entry) => {
    entry.nextTransition.queueHead = continuityQueue({
      actionId: "literal-next",
      nextAction: "poll",
      dispatch: continuityIdentity({
        queueRevision: 1,
        actionId: "literal-next",
        dispatchId: "dispatch-literal-01",
        attemptId: "attempt-literal-01",
        authorityDigests: { prdSha256: A, specSha256: B, resultSha256: "0".repeat(64) },
      }),
    });
  });
  const literalStateBefore = readFileSync(statePath(literalDigestDir), "utf8");
  const literalReplay = run(continuityArgs("continuity-integrate-final", 0, literalDigestFixture.requestFile), continuityDeps(literalDigestDir));
  ok("PS44Xc self-consistent literal post-Result digest is refused without sentinel", literalReplay === 2
    && readFileSync(statePath(literalDigestDir), "utf8") === literalStateBefore);

  const failedQueueDir = freshDir("continuity-history-failed-with-queue");
  const failedQueueFixture = finalTransactionFixture(failedQueueDir, "history-failed-queue");
  run(continuityArgs("continuity-integrate-final", 0, failedQueueFixture.requestFile), continuityDeps(failedQueueDir));
  rewriteHistoricalEntry(failedQueueDir, (entry) => { entry.finalOutcome = "failed"; });
  const failedQueueStateBefore = readFileSync(statePath(failedQueueDir), "utf8");
  const failedQueueReplay = run(continuityArgs("continuity-integrate-final", 0, failedQueueFixture.requestFile), continuityDeps(failedQueueDir));
  ok("PS44Xd self-consistent failed final with queue instead of blocker is refused", failedQueueReplay === 2
    && readFileSync(statePath(failedQueueDir), "utf8") === failedQueueStateBefore);
}

// ---- PS44Y: multi-entry Result-before-State replay removes only the exact tail ----------
{
  const dir = freshDir("continuity-multi-entry-replay");
  seedContinuityRoot(dir);
  const initial = continuityState();
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "multi-init", initial)), continuityDeps(dir));

  const firstResultJson = JSON.stringify({ verdict: "first" });
  const firstEnvelope = {
    schema: "pipeline.continuity-final.v0", identity: continuityIdentity(), outcome: "succeeded",
    resultJson: firstResultJson, resultBytes: Buffer.byteLength(firstResultJson),
  };
  const firstFinal = { ...firstEnvelope, resultDigest: computeContinuityFinalDigest(firstEnvelope) };
  const secondDispatch = continuityIdentity({
    queueRevision: 1,
    actionId: "second-action",
    dispatchId: "dispatch-p1-02",
    attemptId: "attempt-02",
    authorityDigests: { prdSha256: A, specSha256: B, resultSha256: "$POST_RESULT_SHA256" },
  });
  const firstNext = {
    queueHead: continuityQueue({ actionId: "second-action", nextAction: "poll", dispatch: secondDispatch }),
    blocker: null,
    resume: { mode: "immediate", sourceRevision: 1, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: initial.capacity,
  };
  const firstRequest = writeRequest(dir, "multi-first", {
    observation: { status: "completed", identity: continuityIdentity(), final: firstFinal },
    nextTransition: firstNext,
    result: { path: "specs/result.md", preResultSha256: C },
  });
  const first = run(continuityArgs("continuity-integrate-final", 0, firstRequest), continuityDeps(dir));
  const afterFirst = readState(dir).state.continuity;
  const exactSecondIdentity = afterFirst.queueHead.dispatch;
  const secondResultJson = JSON.stringify({ verdict: "second" });
  const secondEnvelope = {
    schema: "pipeline.continuity-final.v0", identity: exactSecondIdentity, outcome: "succeeded",
    resultJson: secondResultJson, resultBytes: Buffer.byteLength(secondResultJson),
  };
  const secondFinal = { ...secondEnvelope, resultDigest: computeContinuityFinalDigest(secondEnvelope) };
  const secondNext = {
    queueHead: continuityQueue({ actionId: "third-action", nextAction: "review", dispatch: null }),
    blocker: null,
    resume: { mode: "immediate", sourceRevision: 2, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: initial.capacity,
  };
  const secondRequest = writeRequest(dir, "multi-second", {
    observation: { status: "completed", identity: exactSecondIdentity, final: secondFinal },
    nextTransition: secondNext,
    result: { path: "specs/result.md", preResultSha256: afterFirst.authority.result.sha256 },
  });
  const interrupted = run(continuityArgs("continuity-integrate-final", 1, secondRequest), continuityDeps(dir, {
    renameSync: () => { throw new Error("second State rename interrupted"); },
  }));
  const preparedTwo = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-integrate-final", 1, secondRequest), continuityDeps(dir));
  ok("PS44Ya first historical integration commits", first === 0);
  ok("PS44Yb second Result tail survives interrupted State write exactly once", interrupted === 2
    && (preparedTwo.match(/\"integrationId\":\"fi-/g) ?? []).length === 2);
  ok("PS44Yc multi-entry prior replay commits without splice/duplication", replay === 0
    && readState(dir).state.continuity.revision === 2
    && readFileSync(join(dir, "specs", "result.md"), "utf8") === preparedTwo);
}

// ---- PS44Z: duplicate replay comparison is canonical key-order independent --------------
{
  const dir = freshDir("continuity-replay-key-order");
  const fixture = finalTransactionFixture(dir, "key-order");
  run(continuityArgs("continuity-integrate-final", 0, fixture.requestFile), continuityDeps(dir));
  const reordered = structuredClone(fixture.request);
  reordered.observation.identity = Object.fromEntries(Object.entries(reordered.observation.identity).reverse());
  const finalWithoutDigest = { ...reordered.observation.final, identity: reordered.observation.identity };
  delete finalWithoutDigest.resultDigest;
  reordered.observation.final = { ...finalWithoutDigest, resultDigest: computeContinuityFinalDigest(finalWithoutDigest) };
  const replayFile = writeRequest(dir, "key-order-replay", reordered);
  const beforeState = readFileSync(statePath(dir), "utf8");
  const beforeResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-integrate-final", 0, replayFile), continuityDeps(dir));
  ok("PS44Z canonical duplicate replay ignores object insertion order", replay === 0
    && readFileSync(statePath(dir), "utf8") === beforeState
    && readFileSync(join(dir, "specs", "result.md"), "utf8") === beforeResult);
}

// ---- PS45: decision state-applied marker blocks until its bound receipt clears it -----------
{
  const dir = freshDir("continuity-decision");
  seedContinuityRoot(dir);
  const blocker = {
    type: "course",
    signature: "repeat-product-v1",
    resumeCondition: { kind: "po-decision", evidenceSha256: A },
    decisionBrief: { decisionBriefId: "brief-01", decisionBriefSha256: B, resultPath: "specs/result.md" },
  };
  const initial = continuityState({ queueHead: null, blocker });
  const initFile = writeRequest(dir, "init", initial);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const txn = {
    idempotencyKey: "idempotency-fixture-01",
    briefSha256: B,
    intentSha256: C,
    selectedOptionId: "continue-narrow",
    preSelectionRevision: 0,
    selectedRevision: 1,
    dispatchableRevision: 2,
    phase: "state-applied",
  };
  const applyFile = writeRequest(dir, "decision-apply", {
    decisionTxn: txn,
    queueHead: continuityQueue({ nextAction: "dispatch", dispatch: null }),
    blocker: null,
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
  });
  const applied = run(continuityArgs("continuity-apply-decision", 0, applyFile), continuityDeps(dir));
  ok("PS45a decision state-applied marker persists at selected revision", applied === 0 && readState(dir).state.continuity?.decisionTxn?.phase === "state-applied");
  const clearFile = writeRequest(dir, "decision-clear", {
    receipt: {
      idempotencyKey: txn.idempotencyKey,
      briefSha256: txn.briefSha256,
      intentSha256: txn.intentSha256,
      selectedOptionId: txn.selectedOptionId,
      receiptSha256: D,
      selectedRevision: 1,
      dispatchableRevision: 2,
    },
  });
  const cleared = run(continuityArgs("continuity-clear-decision", 1, clearFile), continuityDeps(dir));
  const final = readState(dir).state.continuity;
  ok("PS45b bound receipt clears decision marker at pre-bound revision", cleared === 0 && final.revision === 2 && final.decisionTxn === null);
}

// ---- PS45C: Result-first course brief is canonical, bound and exactly recoverable ----------
{
  const dir = freshDir("continuity-course-brief");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  const initFile = writeRequest(dir, "course-init", initial);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const built = courseBrief();
  const blocker = {
    type: "course", signature: D,
    resumeCondition: { kind: "po-decision", evidenceSha256: D },
    decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" },
  };
  const request = {
    brief: built.brief,
    blocker,
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
    result: { path: "specs/result.md", preResultSha256: resultSha },
  };
  const requestFile = writeRequest(dir, "course-brief", request);
  const courseDeps = continuityDeps(dir, { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) });
  const first = run(continuityArgs("continuity-record-course-brief", 0, requestFile), courseDeps);
  const firstState = readState(dir).state.continuity;
  const firstResult = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-record-course-brief", 0, requestFile), courseDeps);
  ok("PS45Ca Result-first course brief advances State with its exact Result pointer", first === 0
    && firstState.revision === 1 && firstState.queueHead === null
    && firstState.blocker?.decisionBrief?.decisionBriefSha256 === built.sha256
    && firstState.authority.result.sha256 === createHash("sha256").update(firstResult).digest("hex"));
  ok("PS45Cb course brief replay is exact and performs zero mutation", replay === 0
    && readFileSync(join(dir, "specs", "result.md"), "utf8") === firstResult
    && readState(dir).state.continuity.revision === 1);
}

{
  const dir = freshDir("continuity-course-brief-recovery");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "recovery-init", initial)), continuityDeps(dir));
  const built = courseBrief();
  const requestFile = writeRequest(dir, "recovery-course-brief", {
    brief: built.brief,
    blocker: { type: "course", signature: D, resumeCondition: { kind: "po-decision", evidenceSha256: D }, decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" } },
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
    result: { path: "specs/result.md", preResultSha256: resultSha },
  });
  const shared = { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) };
  const interrupted = run(continuityArgs("continuity-record-course-brief", 0, requestFile), continuityDeps(dir, {
    ...shared,
    renameSync: () => { throw new Error("State rename interrupted"); },
  }));
  const prepared = readFileSync(join(dir, "specs", "result.md"), "utf8");
  const replay = run(continuityArgs("continuity-record-course-brief", 0, requestFile), continuityDeps(dir, shared));
  ok("PS45Cc interrupted State write reports durable Result preparation", interrupted === 2
    && JSON.parse(prepared.match(/```pipeline-result\n([\s\S]*?)\n```/)[1]).decisionBriefs.length === 1);
  ok("PS45Cd exact Result-before-State course replay commits without duplicate", replay === 0
    && readFileSync(join(dir, "specs", "result.md"), "utf8") === prepared
    && readState(dir).state.continuity.revision === 1);
}

// ---- PS45D: one literal selection writes intent, marker, receipt and clear ---------------
{
  const dir = freshDir("continuity-course-selection");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "select-init", initial)), continuityDeps(dir));
  const selectedTransition = {
    queueHead: continuityQueue({ actionId: "selected-action", nextAction: "dispatch", dispatch: null }),
    blocker: null,
    resume: { mode: "resume-on-next-turn", sourceRevision: 2, reasonCode: "blocker" },
  };
  const built = courseBrief(1, sha256Canonical(selectedTransition));
  const briefRequest = {
    brief: built.brief,
    blocker: { type: "course", signature: D, resumeCondition: { kind: "po-decision", evidenceSha256: D }, decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" } },
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" },
    result: { path: "specs/result.md", preResultSha256: resultSha },
  };
  const binding = { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) };
  run(continuityArgs("continuity-record-course-brief", 0, writeRequest(dir, "select-brief", briefRequest)), continuityDeps(dir, binding));
  const blocked = readState(dir).state.continuity;
  const intent = {
    schema: "pipeline.course-decision-intent.v1",
    idempotencyKey: "idempotency-fixture-01",
    briefId: built.brief.briefId,
    briefSha256: built.sha256,
    blockerSignature: D,
    optionId: "option-0",
    poEvidenceSha256: C,
    preStateSha256: createHash("sha256").update(readFileSync(statePath(dir))).digest("hex"),
    selectedTransitionSha256: sha256Canonical(selectedTransition),
    expectedRevision: 1,
    selectedRevision: 2,
    dispatchableRevision: 3,
  };
  const requestFile = writeRequest(dir, "select-course", {
    intent,
    selectedTransition,
    result: { path: "specs/result.md", preResultSha256: blocked.authority.result.sha256 },
  });
  const first = run(continuityArgs("continuity-select-course", 1, requestFile), continuityDeps(dir, binding));
  const final = readState(dir).state.continuity;
  const result = JSON.parse(readFileSync(join(dir, "specs", "result.md"), "utf8").match(/```pipeline-result\n([\s\S]*?)\n```/)[1]);
  const replay = run(continuityArgs("continuity-select-course", 1, requestFile), continuityDeps(dir, binding));
  ok("PS45Da selection commits intent receipt and dispatchable state in bound revisions", first === 0
    && final.revision === 3 && final.decisionTxn === null
    && final.authority.result.sha256 === createHash("sha256").update(readFileSync(join(dir, "specs", "result.md"))).digest("hex")
    && result.courseDecisionIntents.length === 1 && result.courseDecisionReceipts.length === 1
    && result.courseDecisionReceipts[0].intentSha256 === sha256Canonical(intent));
  ok("PS45Db selection replay admits only the same idempotency key with zero mutation", replay === 0
    && readState(dir).state.continuity.revision === 3);
}

{
  const dir = freshDir("continuity-course-selection-clear-recovery");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "clear-init", initial)), continuityDeps(dir));
  const selectedTransition = { queueHead: continuityQueue({ actionId: "selected-recovery", nextAction: "dispatch", dispatch: null }), blocker: null, resume: { mode: "resume-on-next-turn", sourceRevision: 2, reasonCode: "blocker" } };
  const built = courseBrief(1, sha256Canonical(selectedTransition));
  const binding = { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) };
  run(continuityArgs("continuity-record-course-brief", 0, writeRequest(dir, "clear-brief", {
    brief: built.brief,
    blocker: { type: "course", signature: D, resumeCondition: { kind: "po-decision", evidenceSha256: D }, decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" } },
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" }, result: { path: "specs/result.md", preResultSha256: resultSha },
  })), continuityDeps(dir, binding));
  const blocked = readState(dir).state.continuity;
  const intent = {
    schema: "pipeline.course-decision-intent.v1", idempotencyKey: "idempotency-fixture-02", briefId: built.brief.briefId,
    briefSha256: built.sha256, blockerSignature: D, optionId: "option-0", poEvidenceSha256: C,
    preStateSha256: createHash("sha256").update(readFileSync(statePath(dir))).digest("hex"), selectedTransitionSha256: sha256Canonical(selectedTransition),
    expectedRevision: 1, selectedRevision: 2, dispatchableRevision: 3,
  };
  const requestFile = writeRequest(dir, "clear-course", { intent, selectedTransition, result: { path: "specs/result.md", preResultSha256: blocked.authority.result.sha256 } });
  let stateRenames = 0;
  const interrupted = run(continuityArgs("continuity-select-course", 1, requestFile), continuityDeps(dir, {
    ...binding,
    renameSync: (...args) => { stateRenames += 1; if (stateRenames === 2) throw new Error("clear interrupted"); return renameSync(...args); },
  }));
  const selected = readState(dir).state.continuity;
  const replay = run(continuityArgs("continuity-select-course", 1, requestFile), continuityDeps(dir, binding));
  ok("PS45Dc receipt-before-clear interruption leaves a dispatch-blocking marker", interrupted === 2
    && selected.revision === 2 && selected.decisionTxn?.idempotencyKey === intent.idempotencyKey);
  ok("PS45Dd receipt-backed replay clears without a second intent or receipt", replay === 0
    && readState(dir).state.continuity.revision === 3 && readState(dir).state.continuity.decisionTxn === null);
}

{
  const dir = freshDir("continuity-course-stop");
  const resultSha = seedCourseContinuityRoot(dir);
  const initial = continuityState({
    authority: { prd: { path: "specs/prd.md", sha256: A }, spec: { path: "specs/spec.md", sha256: B }, result: { path: "specs/result.md", sha256: resultSha } },
    queueHead: continuityQueue({ dispatch: null }),
  });
  run(continuityArgs("continuity-init", "absent", writeRequest(dir, "stop-init", initial)), continuityDeps(dir));
  const built = courseBrief();
  const binding = { gitBinding: () => ({ ok: true, commit: "a".repeat(40), tree: "b".repeat(40) }) };
  run(continuityArgs("continuity-record-course-brief", 0, writeRequest(dir, "stop-brief", {
    brief: built.brief,
    blocker: { type: "course", signature: D, resumeCondition: { kind: "po-decision", evidenceSha256: D }, decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" } },
    resume: { mode: "resume-on-next-turn", sourceRevision: 1, reasonCode: "blocker" }, result: { path: "specs/result.md", preResultSha256: resultSha },
  })), continuityDeps(dir, binding));
  const blocked = readState(dir).state.continuity;
  const intent = {
    schema: "pipeline.course-decision-intent.v1", idempotencyKey: "decision-key-stop", briefId: built.brief.briefId,
    briefSha256: built.sha256, blockerSignature: D, optionId: "option-5", poEvidenceSha256: C,
    preStateSha256: createHash("sha256").update(readFileSync(statePath(dir))).digest("hex"), selectedTransitionSha256: A,
    expectedRevision: 1, selectedRevision: 2, dispatchableRevision: 3,
  };
  const digest = courseDispositionDigest("stop", intent, null);
  const selectedTransition = {
    queueHead: null,
    blocker: {
      type: "course", signature: `stop-${digest.slice(0, 32)}`,
      resumeCondition: { kind: "authority-update", evidenceSha256: digest },
      decisionBrief: { decisionBriefId: built.brief.briefId, decisionBriefSha256: built.sha256, resultPath: "specs/result.md" },
    },
    resume: { mode: "resume-on-next-turn", sourceRevision: 2, reasonCode: "blocker" },
  };
  intent.selectedTransitionSha256 = sha256Canonical(selectedTransition);
  const result = run(continuityArgs("continuity-select-course", 1, writeRequest(dir, "stop-select", {
    intent, selectedTransition, result: { path: "specs/result.md", preResultSha256: blocked.authority.result.sha256 },
  })), continuityDeps(dir, binding));
  const final = readState(dir).state.continuity;
  ok("PS45De stop selection has no SHA fixed point and remains terminally blocked", result === 0
    && final.revision === 3 && final.queueHead === null && final.decisionTxn === null
    && /^stop-[a-f0-9]{32}$/.test(final.blocker?.signature ?? "")
    && final.blocker?.resumeCondition.kind === "authority-update");
}

// ---- PS46: exchanged ownership nonce cannot release another writer's lock ------------------
{
  const dir = freshDir("continuity-lock-exchange");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const lock = acquireContinuityLock(dir, "token-owner-001", continuityDeps(dir));
  const exchanged = {
    schema: CONTINUITY_LOCK_SCHEMA_ID,
    token: lock.token,
    ownerNonce: "nonce-foreign-new",
    acquiredAtMs: FIXED_NOW_MS(),
  };
  writeFileSync(continuityLockPath(dir), JSON.stringify(exchanged) + "\n");
  const released = releaseContinuityLock(lock);
  ok("PS46a old owner cannot release exchanged nonce", released.ok === false && released.code === "PS-CONTINUITY-LOCK-OWNERSHIP");
  ok("PS46b exchanged lock remains present and byte-identical", readFileSync(continuityLockPath(dir), "utf8") === JSON.stringify(exchanged) + "\n");
}

// ---- PS47: legacy state transitions share the same lock and preserve continuity -------------
{
  const dir = freshDir("continuity-legacy-serialization");
  seedContinuityRoot(dir);
  const initFile = writeRequest(dir, "init", continuityState());
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const before = readFileSync(statePath(dir), "utf8");
  const continuityBefore = structuredClone(readState(dir).state.continuity);
  const foreign = acquireContinuityLock(dir, "continuity-owner-01", continuityDeps(dir));
  const blocked = run(["set-phase", "--phase", "verify"], { dir, now: FIXED_NOW });
  ok("PS47a legacy writer is blocked by the shared continuity lock", blocked === 2, `got ${blocked}`);
  ok("PS47b blocked legacy writer performs zero byte mutation", readFileSync(statePath(dir), "utf8") === before);
  releaseContinuityLock(foreign);
  const allowed = run(["set-phase", "--phase", "verify"], { dir, now: FIXED_NOW });
  ok("PS47c serialized legacy writer succeeds after lock release", allowed === 0, `got ${allowed}`);
  ok("PS47d non-lifecycle legacy transition preserves continuity exactly", JSON.stringify(readState(dir).state.continuity) === JSON.stringify(continuityBefore));
}

// ---- PS48: feature lifecycle cannot retain continuity for the wrong active feature ----------
{
  const dir = freshDir("continuity-lifecycle-clear");
  seedContinuityRoot(dir);
  mkdirSync(join(dir, "specs"), { recursive: true });
  mkdirSync(join(dir, "evidence"), { recursive: true });
  const resultText = RESULT_FIXTURE;
  const closeEvidenceText = "bound close evidence\n";
  writeFileSync(join(dir, "specs", "result.md"), resultText);
  writeFileSync(join(dir, "evidence", "close.json"), closeEvidenceText);
  const resultSha256 = createHash("sha256").update(resultText).digest("hex");
  const closeEvidenceSha256 = createHash("sha256").update(closeEvidenceText).digest("hex");
  const closeReady = continuityState();
  closeReady.authority.result.sha256 = resultSha256;
  closeReady.queueHead = continuityQueue({ nextAction: "close", dispatch: null });
  const initFile = writeRequest(dir, "init", closeReady);
  run(continuityArgs("continuity-init", "absent", initFile), continuityDeps(dir));
  const beforeReset = readFileSync(statePath(dir), "utf8");
  const reset = run(["set-feature", "--id", "next-feature", "--plan-path", "specs/next.md"], { dir, now: FIXED_NOW });
  ok("PS48a set-feature cannot discard an open continuity feature", reset === 2, `got ${reset}`);
  ok("PS48b refused replacement leaves state byte-identical", readFileSync(statePath(dir), "utf8") === beforeReset);
  const closeRequest = {
    schema: "pipeline.continuity-close.v0",
    featureId: CONTINUITY_FEATURE,
    expectedRevision: 0,
    result: { path: "specs/result.md", sha256: resultSha256 },
    closeEvidence: { path: "evidence/close.json", sha256: closeEvidenceSha256 },
  };
  const closeRequestFile = writeRequest(dir, "close-request", closeRequest);
  const missingGate = run(["close-feature", "--by", "po-test"], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  ok("PS48c close-feature without revision/evidence request is refused", missingGate === 2, `got ${missingGate}`);
  const closed = run(["close-feature", "--by", "po-test", "--continuity-close-request", closeRequestFile], { dir, now: FIXED_NOW, gitHead: FIXED_GIT_HEAD });
  const final = readState(dir).state;
  ok("PS48d revision/evidence-bound close-feature succeeds", closed === 0, `got ${closed}`);
  ok("PS48e closing active feature removes continuity with activeFeature", final.activeFeature === undefined && final.continuity === undefined);
  ok("PS48f closed audit entry persists the exact close request", JSON.stringify(final.closedFeatures?.at(-1)?.continuityClose) === JSON.stringify(closeRequest));
}

// ---- PS49: post-rename durability failure is never mislabeled as zero mutation ---------------
{
  const dir = freshDir("continuity-post-rename");
  seedContinuityRoot(dir);
  const lock = acquireContinuityLock(dir, "token-write-fault-01", continuityDeps(dir));
  const next = structuredClone(readState(dir).state);
  next.activeFeature.phase = "verify";
  const postRename = atomicWriteContinuityState(dir, next, lock, {
    syncDirectory: () => ({ ok: false, supported: true }),
  });
  ok("PS49a directory-sync failure reports committed durability-unknown", postRename.ok === false && postRename.committed === true && postRename.code === "PS-CONTINUITY-COMMITTED-DURABILITY-UNKNOWN");
  ok("PS49b exact renamed target is observable despite red durability result", JSON.stringify(readState(dir).state) === JSON.stringify(next));
  releaseContinuityLock(lock);

  const second = acquireContinuityLock(dir, "token-write-fault-02", continuityDeps(dir));
  const before = readFileSync(statePath(dir), "utf8");
  const proposed = structuredClone(readState(dir).state);
  proposed.activeFeature.phase = "close";
  const preRename = atomicWriteContinuityState(dir, proposed, second, {
    renameSync: () => { throw Object.assign(new Error("injected rename fault"), { code: "EIO" }); },
  });
  ok("PS49c pre-rename failure reports committed=false", preRename.ok === false && preRename.committed === false);
  ok("PS49d pre-rename failure preserves target byte-identically", readFileSync(statePath(dir), "utf8") === before);
  ok("PS49e pre-rename failure cleans its owned temp", !readdirSync(join(dir, ".claude")).some((name) => name.includes(`.tmp.${second.ownerNonce}`)));
  releaseContinuityLock(second);
}

// ---- PS50: lock publication is atomic despite an unrelated interrupted candidate ------------
{
  const dir = freshDir("continuity-lock-publication");
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(`${continuityLockPath(dir)}.candidate.orphan-nonce`, "partial-record");
  const lock = acquireContinuityLock(dir, "token-publish-001", continuityDeps(dir, { ownerNonce: () => "nonce-publish-001" }));
  const record = JSON.parse(readFileSync(continuityLockPath(dir), "utf8"));
  ok("PS50a unrelated partial candidate cannot become the published lock", lock.ok === true && record.schema === CONTINUITY_LOCK_SCHEMA_ID);
  ok("PS50b published lock atomically carries exact token and owner nonce", record.token === lock.token && record.ownerNonce === lock.ownerNonce);
  releaseContinuityLock(lock);
}

// ---- PS51: the gate-estimate producer is a closed, source/evidence-bound writer ------------
{
  const dir = freshDir("gate-estimate");
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  const oid = git("rev-parse", "HEAD").stdout.trim();
  mkdirSync(join(dir, "evidence"), { recursive: true });
  const estimateEvidence = {
    schema: "pipeline.gate-estimate-evidence.v1",
    featureId: "eta-feature",
    gate: "security",
    observedAt: FIXED_NOW(),
    basis: [{ kind: "verify-run", reference: "evidence/verify.json", digest: A }],
    note: "One bounded check remains.",
  };
  const evidenceBytes = `${JSON.stringify(estimateEvidence)}\n`;
  writeFileSync(join(dir, "evidence", "eta.json"), evidenceBytes);
  const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
  run(["set-feature", "--id", "eta-feature", "--plan-path", "specs/eta/prd_eta.md"], { dir, now: FIXED_NOW });
  run(["set-phase", "--phase", "implementation"], { dir, now: FIXED_NOW });
  const args = [
    "set-gate-estimate", "--id", "eta-security-1", "--expected-current-id", "absent",
    "--feature-id", "eta-feature", "--gate", "security", "--object-format", "sha1", "--source-oid", oid,
    "--evidence-path", "evidence/eta.json", "--evidence-sha256", evidenceSha256,
    "--min-minutes", "20", "--max-minutes", "45", "--by", "coordinator",
  ];
  const recorded = run(args, { dir, now: FIXED_NOW });
  const stored = readState(dir).state;
  ok("PS51a set-gate-estimate writes only a source/evidence-bound coordinator record", recorded === 0
    && stored.gateEstimate?.id === "eta-security-1"
    && stored.gateEstimate?.sourceOid === oid
    && stored.gateEstimate?.evidence?.sha256 === evidenceSha256
    && stored.gateEstimate?.recordedBy === "coordinator", JSON.stringify(stored.gateEstimate));
  const beforeReplay = readFileSync(statePath(dir), "utf8");
  const replay = run(args.map((value, index) => index === 4 ? "eta-security-1" : value), { dir, now: () => "2026-07-08T00:00:00.000Z" });
  ok("PS51b identical estimate retry is a zero-write CAS replay", replay === 0 && readFileSync(statePath(dir), "utf8") === beforeReplay);
  const beforeRejected = readFileSync(statePath(dir), "utf8");
  const rejected = run([...args.slice(0, -1), "operator"], { dir, now: FIXED_NOW });
  ok("PS51c non-coordinator estimate attribution is refused without mutation", rejected === 2 && readFileSync(statePath(dir), "utf8") === beforeRejected);
  const advanced = run(["set-phase", "--phase", "security-scan"], { dir, now: FIXED_NOW });
  ok("PS51d a later successful state mutation clears the persisted estimate", advanced === 0 && readState(dir).state.gateEstimate === undefined);
}

// ---- Cleanup ------------------------------------------------------------------------------
for (const dir of ALL_DIRS) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);

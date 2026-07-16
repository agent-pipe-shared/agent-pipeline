#!/usr/bin/env node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkArtifactLifecycle,
  deriveCloseLifecycleStatus,
  validateCloseLifecycleProjection,
} from "./check-artifact-lifecycle.mjs";

const OWNERSHIP = {
  prd: "product-intent",
  spec: "implementation-contract",
  result: "execution-evidence",
  pipelineState: "active-queue-gate-blocker-resume-only",
  humanState: "bounded-operational-projection",
  backlog: "unresolved-future-work-not-active-status",
  changelog: "released-user-visible-delta-not-work-in-progress",
};
const roots = [];
let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function write(root, path, text) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}
function digest(root, path) {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "artifact-lifecycle-"));
  roots.push(root);
  write(root, "specs/prd.md", "# PRD\n");
  write(root, "specs/spec.md", "# Spec\n");
  write(root, "docs/state.md", "Feature feature-x is in implementation.\n");
  write(root, "backlog/README.md", "Backlog owns unresolved future work, not active task status.\n");
  write(root, "CHANGELOG.md", "Changelog owns released user-visible delta, not work-in-progress completion.\n");
  const result = {
    schema: "pipeline.phase2.6-result.v0",
    status: "implementation-active",
    authorities: { prd: "specs/prd.md", spec: "specs/spec.md", result: "specs/result.md" },
    artifactLifecycle: {
      schema: "pipeline.artifact-lifecycle.v1",
      featureId: "feature-x",
      artifacts: [
        { kind: "prd", path: "specs/prd.md", state: "active", authority: true },
        { kind: "spec", path: "specs/spec.md", state: "active", authority: true },
        { kind: "result", path: "specs/result.md", state: "active", authority: true },
        { kind: "receipt", path: "specs/receipt.md", state: "historical", authority: false },
      ],
      ownership: structuredClone(OWNERSHIP),
      status: {
        machineStatePath: ".claude/pipeline-state.json",
        humanStatePath: "docs/state.md",
        phase: "implementation",
        resultStatus: "implementation-active",
        humanRequiredText: ["feature-x", "implementation"],
        backlogPath: "backlog/README.md",
        changelogPath: "CHANGELOG.md",
      },
    },
  };
  write(root, "specs/receipt.md", "receipt evidence\n");
  const writeResult = () => write(root, "specs/result.md", `# Result\n\n\`\`\`pipeline-result\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`);
  writeResult();
  write(root, ".claude/pipeline-state.json", JSON.stringify({
    activeFeature: { id: "feature-x", planPath: "specs/prd.md", phase: "implementation" },
    artifactAuthority: {
      prd: { path: "specs/prd.md", sha256: digest(root, "specs/prd.md") },
      spec: { path: "specs/spec.md", sha256: digest(root, "specs/spec.md") },
      result: { path: "specs/result.md", sha256: digest(root, "specs/result.md") },
    },
  }));
  return { root, result, writeResult };
}

const CLOSE_A = "a".repeat(64);
const CLOSE_B = "b".repeat(64);
const CLOSE_C = "c".repeat(64);
const CLOSE_D = "d".repeat(64);
const CLOSE_COMMIT = "1".repeat(40);
const CLOSE_TREE = "2".repeat(40);
const CLOSE_STATUS = Object.freeze({
  intent: "close-intent",
  "state-cas": "close-cas",
  verified: "close-verified",
  delivered: "close-delivered",
  readback: "close-readback",
  closed: "closed",
});

function closeTransition(phase = "intent", overrides = {}) {
  const finalVerify = ["verified", "delivered", "readback", "closed"].includes(phase)
    ? { commandSha256: CLOSE_A, resultSha256: CLOSE_B, candidateCommit: CLOSE_COMMIT, candidateTree: CLOSE_TREE }
    : null;
  const delivery = ["delivered", "readback", "closed"].includes(phase)
    ? { pushedOid: CLOSE_COMMIT, fetchedOid: ["readback", "closed"].includes(phase) ? CLOSE_COMMIT : null }
    : null;
  return {
    intentId: "close-intent-01",
    expectedRevision: 0,
    authorityDigests: { prdSha256: CLOSE_A, specSha256: CLOSE_B, resultSha256: CLOSE_C },
    graphSha256: CLOSE_D,
    packageBindingsSha256: CLOSE_A,
    // State-only output binding. `resultIntent()` removes it because an
    // embedded Result intent cannot honestly contain its own full-file hash.
    resultDigest: CLOSE_C,
    receiptId: "close-receipt-01",
    receiptSha256: CLOSE_C,
    candidateCommit: CLOSE_COMMIT,
    candidateTree: CLOSE_TREE,
    stage1Verify: { commandSha256: CLOSE_A, resultSha256: CLOSE_D, candidateCommit: CLOSE_COMMIT, candidateTree: CLOSE_TREE },
    phase,
    finalVerify,
    delivery,
    ...overrides,
  };
}

function resultIntent(overrides = {}) {
  const { resultDigest: _stateOnlyResultDigest, ...intent } = closeTransition("intent");
  return { ...intent, ...overrides, phase: "intent", finalVerify: null, delivery: null };
}

function applyCloseProjection(subject, phase, { machine = phase === "intent" ? undefined : closeTransition(phase), status = CLOSE_STATUS[phase] } = {}) {
  const intent = resultIntent({
    authorityDigests: {
      prdSha256: digest(subject.root, "specs/prd.md"),
      specSha256: digest(subject.root, "specs/spec.md"),
      resultSha256: digest(subject.root, "specs/result.md"),
    },
  });
  subject.result.artifactLifecycle.closeTransition = intent;
  subject.result.status = status;
  Object.assign(subject.result.artifactLifecycle.status, {
    lifecycleStatus: status,
    phase: status,
    resultStatus: status,
    humanRequiredText: [status],
  });
  write(subject.root, "docs/state.md", `Feature feature-x is ${status}.\n`);
  subject.writeResult();
  const statePath = ".claude/pipeline-state.json";
  const state = JSON.parse(readFileSync(join(subject.root, statePath), "utf8"));
  state.activeFeature.phase = status;
  if (machine === undefined) {
    delete state.closeTransition;
    // The Result-first intent is deliberately bound to the Result that existed
    // before the intent append, so a content hash need not be self-referential.
    state.artifactAuthority.result.sha256 = intent.authorityDigests.resultSha256;
  } else {
    state.closeTransition = {
      ...structuredClone(intent),
      phase: machine.phase,
      finalVerify: structuredClone(machine.finalVerify),
      delivery: structuredClone(machine.delivery),
      resultDigest: null,
    };
    state.closeTransition.resultDigest = digest(subject.root, "specs/result.md");
    state.artifactAuthority.result.sha256 = state.closeTransition.resultDigest;
  }
  write(subject.root, statePath, JSON.stringify(state));
  return intent;
}

{
  const { root } = fixture();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL01 accepts one active PRD, Spec, and Result with a bounded status projection", outcome.ok, outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, "specs/result.md", "```pipeline-result\n{}\n```\n\n```pipeline-result\n{}\n```\n");
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL02 rejects a Result with more than one pipeline-result block", !outcome.ok && outcome.findings.some((f) => f.includes("exactly one pipeline-result")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.push({ kind: "prd", path: "specs/other-prd.md", state: "active", authority: true });
  write(root, "specs/other-prd.md", "# competing\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL03 rejects competing active PRDs", !outcome.ok && outcome.findings.some((f) => f.includes("exactly one active PRD")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.push({ kind: "amendment", path: "specs/amendment.md", state: "active", authority: true });
  write(root, "specs/amendment.md", "# amendment\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL04 rejects an active standalone amendment", !outcome.ok && outcome.findings.some((f) => f.includes("active standalone amendment")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.push({ kind: "amendment", path: "specs/amendment.md", state: "historical", authority: false });
  write(root, "specs/amendment.md", "# amendment\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL05 rejects a historical amendment without its supersession binding", !outcome.ok && outcome.findings.some((f) => f.includes("must bind supersededBy")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.find((entry) => entry.kind === "receipt").authority = true;
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL06 rejects a receipt that claims authority", !outcome.ok && outcome.findings.some((f) => f.includes("evidence/history")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.find((entry) => entry.kind === "result").path = "specs/other-result.md";
  write(root, "specs/other-result.md", "# competing Result\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL07 binds lifecycle metadata to its own active Result", !outcome.ok && outcome.findings.some((f) => f.includes("carries artifactLifecycle")), outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, ".claude/pipeline-state.json", JSON.stringify({ activeFeature: { id: "feature-x", phase: "design" } }));
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL08 detects machine-state phase drift", !outcome.ok && outcome.findings.some((f) => f.includes("phase does not match")), outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, "docs/state.md", "Feature feature-x is paused.\n");
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL09 detects a stale human-state projection", !outcome.ok && outcome.findings.some((f) => f.includes("human state does not contain")), outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, "backlog/README.md", "Active task status lives here.\n");
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL10 rejects backlog status-authority drift", !outcome.ok && outcome.findings.some((f) => f.includes("Backlog does not declare")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.find((entry) => entry.kind === "prd").authority = false;
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL11 requires every active PRD/Spec/Result to explicitly claim authority", !outcome.ok && outcome.findings.some((f) => f.includes("active and must explicitly set authority=true")), outcome.findings.join("; "));
}
{
  const { root, result, writeResult } = fixture();
  result.artifactLifecycle.artifacts.push({ kind: "spec", path: "specs/old-spec.md", state: "historical", authority: true });
  write(root, "specs/old-spec.md", "# superseded\n");
  writeResult();
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL12 rejects historical PRD/Spec/Result authority claims", !outcome.ok && outcome.findings.some((f) => f.includes("historical/folded and must explicitly set authority=false")), outcome.findings.join("; "));
}
{
  const { root } = fixture();
  write(root, ".claude/pipeline-state.json", JSON.stringify({ activeFeature: { id: "feature-x", planPath: "specs/prd.md", phase: "implementation" } }));
  const outcome = checkArtifactLifecycle(root, "specs/result.md");
  check("AL13 requires canonical machine-state authority bindings", !outcome.ok && outcome.findings.some((f) => f.includes("artifactAuthority is required")), outcome.findings.join("; "));
}

for (const phase of ["intent", "state-cas", "verified", "delivered", "readback", "closed"]) {
  const subject = fixture();
  applyCloseProjection(subject, phase);
  const outcome = checkArtifactLifecycle(subject.root, "specs/result.md");
  check(`AL14 accepts the one derived ${CLOSE_STATUS[phase]} lifecycle status`, outcome.ok, outcome.findings.join("; "));
}

{
  const subject = fixture();
  applyCloseProjection(subject, "intent");
  const embedded = subject.result.artifactLifecycle.closeTransition;
  const machine = JSON.parse(readFileSync(join(subject.root, ".claude/pipeline-state.json"), "utf8"));
  const outcome = checkArtifactLifecycle(subject.root, "specs/result.md");
  check("AL14a accepts pre-append Result intent without a literal embedded full-file self-hash", outcome.ok
    && !Object.hasOwn(embedded, "resultDigest")
    && embedded.authorityDigests.resultSha256 === machine.artifactAuthority.result.sha256, outcome.findings.join("; "));
}

{
  const subject = fixture();
  applyCloseProjection(subject, "verified", { status: "close-delivered" });
  const outcome = checkArtifactLifecycle(subject.root, "specs/result.md");
  check("AL15 rejects contradictory Result, lifecycle, and machine status claims", !outcome.ok
    && outcome.findings.some((finding) => finding.includes("derived close lifecycle status")), outcome.findings.join("; "));
}

{
  const subject = fixture();
  const transition = closeTransition("state-cas");
  const machine = structuredClone(transition);
  machine.candidateCommit = "3".repeat(40);
  applyCloseProjection(subject, "state-cas", { machine });
  const state = JSON.parse(readFileSync(join(subject.root, ".claude/pipeline-state.json"), "utf8"));
  state.closeTransition.candidateCommit = "3".repeat(40);
  write(subject.root, ".claude/pipeline-state.json", JSON.stringify(state));
  const outcome = checkArtifactLifecycle(subject.root, "specs/result.md");
  check("AL16 rejects a Result intent/CAS state mismatch rather than choosing a second authority", !outcome.ok, outcome.findings.join("; "));
}

{
  const subject = fixture();
  const transition = closeTransition("verified", {
    finalVerify: { commandSha256: CLOSE_A, resultSha256: CLOSE_B, candidateCommit: "3".repeat(40), candidateTree: CLOSE_TREE },
  });
  applyCloseProjection(subject, "verified", { machine: transition });
  const outcome = checkArtifactLifecycle(subject.root, "specs/result.md");
  check("AL17 rejects stale final verification that names a different tracked candidate", !outcome.ok, outcome.findings.join("; "));
}

for (const [name, transition] of [
  ["delivery before verified", closeTransition("delivered", { finalVerify: null })],
  ["mismatched fetch-back", closeTransition("readback", { delivery: { pushedOid: CLOSE_COMMIT, fetchedOid: "3".repeat(40) } })],
  ["closed before readback", closeTransition("closed", { delivery: { pushedOid: CLOSE_COMMIT, fetchedOid: null } })],
]) {
  const subject = fixture();
  applyCloseProjection(subject, transition.phase, { machine: transition });
  const outcome = checkArtifactLifecycle(subject.root, "specs/result.md");
  check(`AL18 rejects ${name}`, !outcome.ok, outcome.findings.join("; "));
}

{
  const malformed = deriveCloseLifecycleStatus({ phase: "intent" }, undefined);
  const intent = resultIntent();
  const machine = closeTransition("state-cas", { resultDigest: CLOSE_D });
  machine.candidateCommit = "3".repeat(40);
  const contradictory = validateCloseLifecycleProjection(
    intent, machine,
    { lifecycleStatus: "close-intent", phase: "close-intent", resultStatus: "close-intent" },
    "close-intent", "close-intent",
  );
  check("AL19 lifecycle derivation is total and fails closed on malformed or contradictory input", !malformed.ok
    && contradictory.length > 0, `${malformed.reason}; ${contradictory.join("; ")}`);
}

{
  const legacy = deriveCloseLifecycleStatus(undefined, undefined);
  const machineOnly = deriveCloseLifecycleStatus(undefined, closeTransition("state-cas"));
  const resultOnlyCas = deriveCloseLifecycleStatus(closeTransition("state-cas"), undefined);
  check("AL20 accepts legacy neither but rejects machine-only and Result-only non-intent transitions", legacy.ok
    && legacy.status === "implementation-active" && !machineOnly.ok && !resultOnlyCas.ok,
  `${machineOnly.reason}; ${resultOnlyCas.reason}`);
}

{
  const immutableIntent = resultIntent();
  const machineTransition = closeTransition("delivered", { resultDigest: CLOSE_D });
  const authorityDrift = structuredClone(machineTransition);
  authorityDrift.authorityDigests.specSha256 = CLOSE_D;
  const deliveryCandidateDrift = closeTransition("delivered", {
    resultDigest: CLOSE_D, delivery: { pushedOid: "3".repeat(40), fetchedOid: null },
  });
  const readbackCandidateDrift = closeTransition("readback", {
    resultDigest: CLOSE_D, delivery: { pushedOid: CLOSE_COMMIT, fetchedOid: "3".repeat(40) },
  });
  check("AL21 rejects transition authority, delivery, and fetch-back candidate drift", !deriveCloseLifecycleStatus(immutableIntent, authorityDrift).ok
    && !deriveCloseLifecycleStatus(immutableIntent, deliveryCandidateDrift).ok
    && !deriveCloseLifecycleStatus(immutableIntent, readbackCandidateDrift).ok);
}

{
  const subject = fixture();
  applyCloseProjection(subject, "verified");
  const outcome = checkArtifactLifecycle(subject.root, "specs/result.md");
  check("AL22 accepts canonical human state with exactly the derived lifecycle marker", outcome.ok, outcome.findings.join("; "));
}

for (const contradictoryMarker of [
  "implementation-active", "close-intent", "close-cas", "close-delivered",
  "close-readback", "closed", "handoff",
]) {
  const subject = fixture();
  applyCloseProjection(subject, "verified");
  write(subject.root, "docs/state.md", `Feature feature-x is close-verified and ${contradictoryMarker}.\n`);
  const outcome = checkArtifactLifecycle(subject.root, "specs/result.md");
  check(`AL23 rejects human state that combines close-verified with ${contradictoryMarker}`, !outcome.ok, outcome.findings.join("; "));
}

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);

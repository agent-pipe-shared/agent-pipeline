// SPDX-License-Identifier: SUL-1.0

import test from "node:test";
import assert from "node:assert/strict";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createCloseCoordinator,
  advanceCloseCoordinator,
  COORDINATOR_PHASES,
  lifecycleDigest,
  storeCloseCoordinator,
  readCloseCoordinator,
  syncPublicationCloseDirectory,
} from "./publication-close-journal.mjs";
import { writePrivateJsonAtomic } from "../lib/private-boundary.mjs";
import { buildCleanupReceipt } from "../lib/close-cleanup-receipt.mjs";
import { invokingRunnerFromEnv, resolveOwnSessionDescriptor } from "../lib/own-session-descriptor.mjs";
import { CURRENT_APPROVAL_SCHEMA, PLAN_SUBMISSION_SCHEMA, sha256CanonicalJson } from "../lib/plan-spec-state-v2.mjs";

const h = (c, n = 64) => c.repeat(n);
const CLI = fileURLToPath(new URL("./close-coordinator.mjs", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
function executorReceipt(candidateOid, candidateTree, destinationRef = "refs/heads/main") {
  const body = {
    schema: "pipeline.publication-executor-result.v1",
    status: "closed",
    code: "PX-CLOSED",
    channel: "neutral-public",
    transactionId: "close-delivery",
    destinationDigest: h("9"),
    destinationRef,
    candidateOid,
    candidateTree,
    authorityRawSha256: h("8"),
    publicationReceiptDigest: h("a"),
    executorSha256: h("7"),
    pushAttempted: true,
    readback: {
      repositoryKind: "fresh-disposable",
      alternatesDisabled: true,
      oid: candidateOid,
      tree: candidateTree,
    },
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}
const childEnv = () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
};
function authority() {
  return {
    implementationResultSha256: null,
    pipelineStateSha256: h("1"),
    planSha256: h("2"),
    prdSha256: h("3"),
    specSha256: h("4"),
  };
}
function fresh() {
  return createCloseCoordinator({
    lifecycleId: `f-${Math.random().toString(16).slice(2)}`,
    featureId: "feature",
    activeFeature: { id: "feature", planPath: "specs/feature/plan.md", phase: "implementation" },
    authority: authority(),
  });
}
function step(s, phase, extra = {}) {
  const candidate = phase === "final-verify-green"
    ? { candidateOid: s.candidateOid, candidateTree: s.candidateTree }
    : {};
  const completionAuthority = phase === "feature-close-prepared" && s.authority.implementationResultSha256 === null
    ? { authority: { ...s.authority, implementationResultSha256: h("9"), pipelineStateSha256: h("8") } }
    : {};
  return advanceCloseCoordinator(s, {
    expectedRevision: s.revision,
    expectedStateSha256: lifecycleDigest(s),
    phase,
    inputDigest: h("a"),
    observedDigest: h("b"),
    operationSha256: h("f"),
    ...(phase === "feature-close-prepared" ? { architectureImpact: "architecture-conforms", featureCloseAudit: null } : {}),
    ...candidate,
    ...completionAuthority,
    ...extra,
  });
}
function publication(s, readbackReceiptDigest = null) {
  return {
    channel: "neutral-public",
    destinationDigest: h("5"),
    ref: "refs/heads/main",
    oid: s.candidateOid,
    tree: s.candidateTree,
    publicationReceiptDigest: h("6"),
    readbackReceiptDigest,
  };
}
function publicationAuthorization() {
  return {
    channel: "neutral-public",
    destinationDigest: h("5"),
    evidenceSha256: h("8"),
  };
}
test("active checkpoint preserves activeFeature", () => assert.deepEqual(step(fresh(), "checkpointed").activeFeature, { id: "feature", planPath: "specs/feature/plan.md", phase: "implementation" }));
test("completion separates closure completion from workflow terminality", () => {
  const local = JSON.parse(spawnSync(process.execPath, [CLI, "next", "closed-local"], { encoding: "utf8" }).stdout);
  assert.equal(local.schema, "pipeline.close-coordinator.next.v2");
  assert.deepEqual(local.next, ["release-eligible"]);
  assert.equal(local.terminal, false);
  assert.deepEqual(local.completion, {
    scope: "feature-closure", state: "complete", phase: "closed-local",
    next: ["release-eligible"], workflowTerminal: false,
  });
  const promoted = JSON.parse(spawnSync(process.execPath, [CLI, "next", "promoted"], { encoding: "utf8" }).stdout);
  assert.equal(promoted.terminal, true);
  assert.equal(promoted.completion.state, "complete");
  assert.equal(promoted.completion.workflowTerminal, true);
});
for (const [i, phase] of ["feature-close-prepared", "tracked-close-finalized", "candidate-frozen", "final-verify-green"].entries()) test(`ordered phase ${i}`, () => { let s = fresh(); for (const p of ["checkpointed", "feature-close-prepared", "tracked-close-finalized", "candidate-frozen", "final-verify-green"]) { if (p === "candidate-frozen") s = step(s, p, { candidateOid: h("c", 40), candidateTree: h("d", 40) }); else if (p !== "final-verify-green" || phase === p) s = step(s, p); if (p === phase) break; } assert.equal(s.phase, phase); });
test("candidate required", () => { let s = fresh(); for (const p of ["checkpointed", "feature-close-prepared", "tracked-close-finalized"]) s = step(s, p); assert.throws(() => step(s, "candidate-frozen"), /candidate/); });
test("candidate replacement denied", () => { let s = fresh(); for (const p of ["checkpointed", "feature-close-prepared", "tracked-close-finalized"]) s = step(s, p); s = step(s, "candidate-frozen", { candidateOid: h("c", 40), candidateTree: h("d", 40) }); assert.throws(() => step(s, "final-verify-green", { candidateOid: h("e", 40) }), /replacement/); });
test("publication authorization required", () => { let s = fresh(); for (const p of ["checkpointed", "feature-close-prepared", "tracked-close-finalized"]) s = step(s, p); s = step(s, "candidate-frozen", { candidateOid: h("c", 40), candidateTree: h("d", 40) }); s = step(s, "final-verify-green"); assert.throws(() => step(s, "publication-authorized"), /authorization/); });
test("publication exact candidate", () => { let s = fresh(); for (const p of ["checkpointed", "feature-close-prepared", "tracked-close-finalized"]) s = step(s, p); s = step(s, "candidate-frozen", { candidateOid: h("c", 40), candidateTree: h("d", 40) }); s = step(s, "final-verify-green"); s = step(s, "publication-authorized", { authorization: true, publicationAuthorization: publicationAuthorization() }); assert.throws(() => step(s, "published", { publication: { ...publication(s), oid: h("e", 40) } }), /mismatch/); });
test("cleanup uncertainty recoverable", () => { let s = fresh(); for (const p of ["checkpointed", "feature-close-prepared", "tracked-close-finalized"]) s = step(s, p); s = step(s, "candidate-frozen", { candidateOid: h("c", 40), candidateTree: h("d", 40) }); s = step(s, "final-verify-green"); s = step(s, "cleanup-complete", { cleanupStatus: "uncertain", cleanupEvidenceDigest: h("e") }); s = advanceCloseCoordinator(s, { expectedRevision: s.revision, expectedStateSha256: lifecycleDigest(s), phase: "cleanup-complete", inputDigest: h("a"), observedDigest: h("b"), operationSha256: h("c"), cleanupStatus: "complete", cleanupEvidenceDigest: h("f") }); assert.equal(s.cleanup.status, "complete"); });
test("local terminal", () => { let s = fresh(); for (const p of ["checkpointed", "feature-close-prepared", "tracked-close-finalized"]) s = step(s, p); s = step(s, "candidate-frozen", { candidateOid: h("c", 40), candidateTree: h("d", 40) }); s = step(s, "final-verify-green"); s = step(s, "cleanup-complete", { cleanupEvidenceDigest: h("e") }); assert.equal(step(s, "closed-local").phase, "closed-local"); });
test("release/promotion descendants require independent authorization", () => { let s = fresh(); for (const p of ["checkpointed", "feature-close-prepared", "tracked-close-finalized"]) s = step(s, p); s = step(s, "candidate-frozen", { candidateOid: h("c", 40), candidateTree: h("d", 40) }); s = step(s, "final-verify-green"); s = step(s, "cleanup-complete", { cleanupEvidenceDigest: h("e") }); s = step(s, "closed-local"); assert.throws(() => step(s, "release-eligible"), /authorization/); s = step(s, "release-eligible", { authorization: true }); assert.throws(() => step(s, "promoted"), /authorization/); assert.equal(step(s, "promoted", { authorization: true }).phase, "promoted"); });
test("delivery requires exact publication and readback receipts", () => {
  let s = fresh();
  for (const p of ["checkpointed", "feature-close-prepared", "tracked-close-finalized"]) s = step(s, p);
  s = step(s, "candidate-frozen", { candidateOid: h("c", 40), candidateTree: h("d", 40) });
  s = step(s, "final-verify-green");
  s = step(s, "publication-authorized", { authorization: true, publicationAuthorization: publicationAuthorization() });
  s = step(s, "published", { publication: publication(s) });
  assert.throws(() => step(s, "readback-confirmed", { publication: { ...publication(s), ref: "refs/heads/other", readbackReceiptDigest: h("7") } }), /mismatch/);
  s = step(s, "readback-confirmed", { publication: publication(s, h("7")) });
  s = step(s, "cleanup-complete", { cleanupEvidenceDigest: h("8") });
  assert.equal(step(s, "delivered").phase, "delivered");
});
test("authority and active-feature identities are closed", () => {
  assert.throws(() => createCloseCoordinator({ lifecycleId: "x", featureId: "feature", activeFeature: { id: "other", planPath: "x", phase: "implementation" }, authority: authority() }), /activeFeature/);
  assert.throws(() => createCloseCoordinator({ lifecycleId: "x", featureId: "feature", activeFeature: { id: "feature", planPath: "../escape", phase: "implementation" }, authority: authority() }), /activeFeature/);
  assert.throws(() => createCloseCoordinator({ lifecycleId: "x", featureId: "feature", activeFeature: { id: "feature", planPath: "plan.md", phase: "implementation" }, authority: {} }), /authority/);
});
test("architecture impact is required at feature-close preparation and remains durable", () => {
  let state = step(fresh(), "checkpointed");
  assert.throws(() => advanceCloseCoordinator(state, {
    expectedRevision: state.revision,
    expectedStateSha256: lifecycleDigest(state),
    phase: "feature-close-prepared",
    inputDigest: h("a"),
    observedDigest: h("b"),
    operationSha256: h("f"),
    authority: { ...state.authority, implementationResultSha256: h("9"), pipelineStateSha256: h("8") },
  }), /architecture impact/);
  state = step(state, "feature-close-prepared");
  assert.equal(state.architectureImpact, "architecture-conforms");
  assert.throws(() => advanceCloseCoordinator(state, {
    expectedRevision: state.revision,
    expectedStateSha256: lifecycleDigest(state),
    phase: "tracked-close-finalized",
    inputDigest: h("a"),
    observedDigest: h("b"),
    operationSha256: h("f"),
    architectureImpact: "no-architecture-impact",
  }), /architecture impact phase invalid/);
});
test("published close-coordinator schema tracks the executable phase contract", () => {
  const schema = JSON.parse(readFileSync(
    new URL("./close-coordinator.schema.json", import.meta.url),
    "utf8",
  ));
  assert.deepEqual(schema.properties.phase.enum, COORDINATOR_PHASES);
  assert.deepEqual(
    schema.properties.effects.items.properties.phase.enum,
    COORDINATOR_PHASES.slice(1),
  );
  assert.deepEqual(schema.required, [
    "schema", "lifecycleId", "revision", "priorStateSha256", "phase",
    "featureId", "activeFeature", "authority", "architectureImpact", "candidateOid", "candidateTree",
    "effects", "publicationAuthorization", "publication", "cleanup",
  ]);
  assert.deepEqual(schema.properties.effects.items.required, [
    "phase", "inputDigest", "observedDigest", "operationSha256",
  ]);
});
test("durable replay", () => { const dir = mkdtempSync(join(tmpdir(), "h5-")); const s = fresh(); const st = storeCloseCoordinator({ gitCommonDir: dir, coordinator: s, expectedRawSha256: null }); assert.equal(storeCloseCoordinator({ gitCommonDir: dir, coordinator: s, expectedRawSha256: st.rawDigest }).written, false); assert.equal(readCloseCoordinator(dir, s.lifecycleId).coordinator.phase, "active"); rmSync(dir, { recursive: true, force: true }); });
test("publication-close directory durability is typed only for native Windows limitations", () => {
  const problem = (code) => Object.assign(new Error(code), { code });
  assert.deepEqual(syncPublicationCloseDirectory("C:\\private", {
    platform: "win32",
    open: () => { throw problem("EPERM"); },
  }), { status: "unsupported", stage: "open", code: "EPERM" });
  let closed = false;
  assert.deepEqual(syncPublicationCloseDirectory("C:\\private", {
    platform: "win32",
    open: () => 7,
    fsync: () => { throw problem("EINVAL"); },
    close: (fd) => { assert.equal(fd, 7); closed = true; },
  }), { status: "unsupported", stage: "fsync", code: "EINVAL" });
  assert.equal(closed, true);
  assert.throws(() => syncPublicationCloseDirectory("C:\\private", {
    platform: "win32",
    open: () => { throw problem("ENOENT"); },
  }), /ENOENT/u);
  assert.throws(() => syncPublicationCloseDirectory("/private", {
    platform: "linux",
    open: () => { throw problem("EPERM"); },
  }), /EPERM/u);
});
for (const [name, args] of [["missing activate", []], ["wrong digest", ["--activate", "--plan-sha256", h("0")]], ["unknown phase", ["--activate"]]]) test(`CLI rejects ${name}`, () => { const r = spawnSync(process.execPath, [new URL("./close-coordinator.mjs", import.meta.url), "apply-transition", ...args], { encoding: "utf8" }); assert.notEqual(r.status, 0); });
for (let i = 0; i < 10; i++) test(`replay/CAS guard ${i}`, () => { const s = fresh(); assert.throws(() => advanceCloseCoordinator(s, { expectedRevision: 9, expectedStateSha256: h("0"), phase: "checkpointed", inputDigest: h("a"), observedDigest: h("b"), operationSha256: h("f") }), /CAS/); });

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: childEnv(),
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function invoke(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: childEnv(),
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  assert.notEqual(result.stdout, "", JSON.stringify({
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    stderr: result.stderr,
    argv: args,
  }));
  return JSON.parse(result.stdout);
}

function invokeAction(action, expectedStatus = 0) {
  const result = spawnSync(action.executable, action.argv, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: childEnv(),
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function processFixture(name, options = {}) {
  const root = mkdtempSync(join(tmpdir(), `h5-${name}-`));
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "specs", "feature"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  const paths = {
    prd: "specs/feature/prd.md",
    spec: "specs/feature/spec.md",
    result: "specs/feature/result.md",
    closeEvidence: "evidence/close.txt",
    closeRequest: "evidence/close-request.json",
    tracked: "evidence/tracked.json",
  };
  for (const [path, bytes] of [
    [paths.prd, "# PRD\n"],
    [paths.spec, "# Spec\n"],
    [paths.result, "# Result\n"],
    [paths.closeEvidence, "closed resources\n"],
  ]) writeFileSync(join(root, path), bytes);
  const prdSha256 = digest(readFileSync(join(root, paths.prd)));
  const specSha256 = digest(readFileSync(join(root, paths.spec)));
  const resultSha256 = digest(readFileSync(join(root, paths.result)));
  const closeEvidenceSha256 = digest(readFileSync(join(root, paths.closeEvidence)));
  const activeFeature = { id: "feature", planPath: paths.prd, phase: "implementation" };
  // These process cases exercise close mechanics for a current mini course.
  // Registered rigor-1 packages still require the real Critic/Verify audit.
  const profileSha256 = h("a");
  const planSubmission = { schema: PLAN_SUBMISSION_SCHEMA, featureId: activeFeature.id,
    planPath: paths.prd, planSha256: prdSha256, specPath: paths.spec, specSha256,
    profile: "mini", profileSha256, submittedBy: "fixture", submittedAt: "2026-10-24T00:00:00.000Z" };
  const state = {
    schema: "pipeline.state.v0",
    activeFeature,
    planApproved: true,
    planSubmission,
    planApproval: {
      schema: CURRENT_APPROVAL_SCHEMA,
      approvedBy: "fixture", approvedAt: "2026-10-24T00:01:00.000Z",
      submissionSha256: sha256CanonicalJson(planSubmission), profileSha256,
      priorInvalidationSha256: null, designApprovalBinding: null, designApproval: null,
      poGateAuthority: {
        schema: "pipeline.po-gate-authority.v2", humanFacing: "en",
        sourceSha256: h("b"), runtimeSha256: h("c"), receiptSha256: h("d"), repositoryFingerprint: h("e"),
        planPath: paths.prd,
        planSha256: prdSha256,
        specPath: paths.spec,
        specSha256,
      },
    },
    continuity: {
      revision: 7,
      authority: {
        prd: { path: paths.prd, sha256: prdSha256 },
        spec: { path: paths.spec, sha256: specSha256 },
        result: null,
      },
      queueHead: { nextAction: "work", dispatch: null },
      blocker: null,
      decisionTxn: null,
    },
  };
  writeJson(join(root, ".claude", "pipeline-state.json"), state);
  git(root, ["init", "-b", "main"]);
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=H5 Test", "-c", "user.email=h5@example.invalid", "commit", "-m", "fixture"]);

  const lifecycle = `close-${name}`;
  const refusedRestart = invoke(["plan-start", "--root", root, "--lifecycle", lifecycle, "--actor", "PO"], 2);
  assert.equal(refusedRestart.code, "CLOSE-INTENT");
  assert.equal(existsSync(join(root, ".git", "agent-pipeline")), false, "missing close intent must not create private state");
  const plan = invoke(["plan-start", "--root", root, "--lifecycle", lifecycle, "--actor", "PO", "--close-intent", "durable-stop"]);
  assert.equal(plan.closeIntent, "durable-stop");
  assert.ok(plan.nextAction.argv.includes("--close-intent"));
  assert.ok(plan.nextAction.argv.includes("durable-stop"));
  assert.equal(existsSync(join(root, ".git", "agent-pipeline")), false, "plan-start mutated private state");
  const started = invokeAction(plan.nextAction);
  assert.equal(started.status, "applied");
  assert.equal(invokeAction(plan.nextAction).status, "replayed");

  function transition(phase, extra = []) {
    const planned = invoke([
      "plan-transition", "--root", root, "--lifecycle", lifecycle,
      "--actor", "PO", "--phase", phase,
      ...(phase === "feature-close-prepared"
        ? ["--architecture-impact", "architecture-conforms"]
        : []),
      ...extra,
    ]);
    const applied = invokeAction(planned.nextAction);
    return { planned, applied };
  }

  transition("checkpointed");
  state.continuity.authority.result = { path: paths.result, sha256: resultSha256 };
  state.continuity.queueHead.nextAction = "close";
  writeJson(join(root, ".claude", "pipeline-state.json"), state);
  writeJson(join(root, paths.closeRequest), {
    schema: "pipeline.continuity-close.v0",
    featureId: activeFeature.id,
    expectedRevision: state.continuity.revision,
    result: state.continuity.authority.result,
    closeEvidence: { path: paths.closeEvidence, sha256: closeEvidenceSha256 },
  });
  if (options.beforePrepared) options.beforePrepared({ root, paths, state, lifecycle });
  if (options.expectPreparedRefusal) {
    const refused = invoke([
      "plan-transition", "--root", root, "--lifecycle", lifecycle, "--actor", "PO",
      "--phase", "feature-close-prepared", "--architecture-impact", "architecture-conforms",
      "--continuity-close-request", paths.closeRequest,
    ], 2);
    assert.equal(refused.code, options.expectPreparedRefusal);
    return { root, lifecycle, refused };
  }
  const prepared = transition("feature-close-prepared", [
    "--continuity-close-request", paths.closeRequest,
  ]);
  assert.deepEqual(
    prepared.applied.nextAction.argv.slice(-2),
    ["--continuity-close-request", paths.closeRequest],
  );
  assert.ok(prepared.applied.nextAction.argv.includes("architecture-conforms"));
  if (options.afterPrepared) options.afterPrepared({ prepared, invokeAction, root });

  const coordinatorSha256 = prepared.applied.stateSha256;
  const closedState = {
    schema: "pipeline.state.v0",
    planApproved: false,
    closedFeatures: [{
      id: activeFeature.id,
      planPath: activeFeature.planPath,
      phaseAtClose: activeFeature.phase,
      architectureImpact: "architecture-conforms",
      closedAt: "2026-07-29T12:00:00.000Z",
      closedBy: "PO",
      forCommit: git(root, ["rev-parse", "HEAD"]),
      coordinatorClose: {
        schema: "pipeline.close-coordinator-reference.v1",
        lifecycleId: lifecycle,
        stateSha256: coordinatorSha256,
        revision: 2,
        phase: "feature-close-prepared",
      },
    }],
  };
  writeJson(join(root, ".claude", "pipeline-state.json"), closedState);
  const closedStateSha256 = digest(readFileSync(join(root, ".claude", "pipeline-state.json")));
  writeJson(join(root, paths.tracked), {
    schema: "pipeline.close-tracked-effects.v1",
    resultSha256,
    backlogSha256: h("1"),
    handoverSha256: h("2"),
    historySha256: h("3"),
    telemetrySha256: h("4"),
    retrospectiveSha256: h("5"),
    pipelineStateSha256: closedStateSha256,
  });
  transition("tracked-close-finalized", ["--evidence", paths.tracked]);
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=H5 Test", "-c", "user.email=h5@example.invalid", "commit", "-m", "final tracked close"]);
  transition("candidate-frozen");
  const candidateOid = git(root, ["rev-parse", "HEAD"]);
  const candidateTree = git(root, ["rev-parse", "HEAD^{tree}"]);
  if (options.stopAfterFreeze) {
    return { root, lifecycle, transition, invoke, candidateOid, candidateTree, evidenceDirectory: started.evidenceDirectory, featureId: activeFeature.id };
  }
  const verifyPath = join(started.evidenceDirectory, "final-verification.json");
  writePrivateJsonAtomic(verifyPath, {
    schema: "pipeline.close-final-verification.v1",
    candidateOid,
    candidateTree,
    verifyStatus: "green",
    verifySha256: h("6"),
    securityStatus: "green",
    securitySha256: h("7"),
  });
  transition("final-verify-green", ["--evidence", verifyPath]);
  return {
    root,
    lifecycle,
    transition,
    prepared,
    candidateOid,
    candidateTree,
    evidenceDirectory: started.evidenceDirectory,
    trackedPath: join(root, paths.tracked),
  };
}

// Candidate 16a (consumer blocker): fixes found after the freeze (security remediation) need a new candidate. A freeze can be renewed to a
// successor commit; the close artefacts earlier phases bound must stay unchanged, and the renewal is one more recorded effect.
test("process: a frozen candidate can be renewed to a successor commit, and only then", () => {
  const f = processFixture("refreeze", { stopAfterFreeze: true });
  const commit = (message) => {
    git(f.root, ["add", "."]);
    git(f.root, ["-c", "user.name=H5 Test", "-c", "user.email=h5@example.invalid", "commit", "-m", message]);
    return git(f.root, ["rev-parse", "HEAD"]);
  };
  const planFreeze = (code = undefined) => f.invoke(["plan-transition", "--root", f.root, "--lifecycle", f.lifecycle, "--actor", "PO", "--phase", "candidate-frozen"], code);
  assert.equal(planFreeze(2).code, "CLOSE-REFREEZE", "nothing changed since the freeze: nothing to renew");
  writeFileSync(join(f.root, "security-fix.txt"), "dependency bumped\n");
  const fix = commit("fix: bump a dependency");
  const renewed = f.transition("candidate-frozen");
  assert.equal(renewed.applied.status, "applied");
  const inspected = f.invoke(["inspect", "--root", f.root, "--lifecycle", f.lifecycle]);
  assert.equal(inspected.coordinator.phase, "candidate-frozen");
  assert.equal(inspected.coordinator.candidateOid, fix);
  assert.notEqual(fix, f.candidateOid);
  assert.deepEqual(inspected.coordinator.effects.slice(-2).map((effect) => effect.phase), ["candidate-frozen", "candidate-frozen"], "both freezes stay in the history");
  assert.equal(f.invoke(["plan-transition", "--root", f.root, "--lifecycle", f.lifecycle, "--actor", "PO", "--phase", "candidate-frozen"], 2).code, "CLOSE-REFREEZE");
  mkdirSync(join(f.root, "specs", f.featureId), { recursive: true });
  writeFileSync(join(f.root, "specs", f.featureId, "late-edit.md"), "a bound artefact changed\n");
  commit("late edit of a bound artefact");
  const refused = planFreeze(2);
  assert.equal(refused.code, "CLOSE-REFREEZE");
  assert.match(refused.message, /close artefacts/u);
  assert.equal(f.invoke(["inspect", "--root", f.root, "--lifecycle", f.lifecycle]).coordinator.candidateOid, fix, "a refused renewal changes nothing");
});

test("process: after a renewed freeze the final Verify binds the new candidate, not the old one", () => {
  const f = processFixture("refreeze-verify", { stopAfterFreeze: true });
  writeFileSync(join(f.root, "security-fix.txt"), "dependency bumped\n");
  git(f.root, ["add", "."]);
  git(f.root, ["-c", "user.name=H5 Test", "-c", "user.email=h5@example.invalid", "commit", "-m", "fix: bump a dependency"]);
  f.transition("candidate-frozen");
  const oid = git(f.root, ["rev-parse", "HEAD"]), tree = git(f.root, ["rev-parse", "HEAD^{tree}"]);
  const evidence = (candidateOid, candidateTree, name) => {
    const path = join(f.evidenceDirectory, name);
    writePrivateJsonAtomic(path, { schema: "pipeline.close-final-verification.v1", candidateOid, candidateTree, verifyStatus: "green", verifySha256: h("6"), securityStatus: "green", securitySha256: h("7") });
    return path;
  };
  const stale = f.invoke(["plan-transition", "--root", f.root, "--lifecycle", f.lifecycle, "--actor", "PO", "--phase", "final-verify-green", "--evidence", evidence(f.candidateOid, f.candidateTree, "stale.json")], 2);
  assert.equal(stale.code, "CLOSE-VERIFY", "evidence for the earlier candidate is refused");
  assert.equal(f.transition("final-verify-green", ["--evidence", evidence(oid, tree, "renewed.json")]).applied.phase, "final-verify-green");
});

// AC-175 part A (D209/D210): the close course writes the generated audit index next to the close evidence on the
// feature-close-prepared transition, names it in the close result, and lists a missing source instead of refusing.
test("process: feature-close-prepared writes the audit index next to the close evidence and names it in the result", () => {
  const f = processFixture("audit-index");
  const named = f.prepared.applied.auditIndex;
  assert.ok(named, "the close result names the audit index");
  assert.equal(named.status, "written");
  assert.equal(named.file, "audit-index.json");
  const bytes = readFileSync(join(f.evidenceDirectory, "audit-index.json"));
  assert.equal(named.sha256, digest(bytes));
  const index = JSON.parse(bytes);
  assert.equal(index.schema, "pipeline.audit-index.v1");
  assert.deepEqual(index.sources.map((s) => s.path), ["specs/feature/prd.md", "specs/feature/result.md", "specs/feature/spec.md"]);
  assert.ok(index.sources.every((s) => s.status === "present" && /^[0-9a-f]{64}$/u.test(s.sha256)));
  assert.equal(index.commit.status, "present");
  assert.equal(index.complete, false, "the fixture has no Verify receipt or delivery course");
  assert.ok(index.missingSteps.some((m) => m.step === "gate:verify"), JSON.stringify(index.missingSteps));
  assert.equal(named.complete, false);
  assert.equal(named.missingSteps, index.missingSteps.length);
  const text = bytes.toString("utf8");
  assert.ok(!text.includes(f.root), "no absolute path in the index");
  assert.equal(index.manifest.schema, "pipeline.audit-index-manifest.v1");
});

test("process: a replayed feature-close-prepared apply still names the audit index and the close is never refused for a missing source", () => {
  let again;
  let first;
  processFixture("audit-index-replay", {
    afterPrepared({ prepared, invokeAction: replay, root }) {
      first = prepared.applied.auditIndex;
      // A source moves after the close was prepared: a re-collection would now record a different index under another digest.
      const prd = join(root, "specs/feature/prd.md");
      const original = readFileSync(prd);
      appendFileSync(prd, "edited after the close was prepared\n");
      try { again = replay(prepared.planned.nextAction); } finally { writeFileSync(prd, original); }
    },
  });
  assert.equal(again.status, "replayed");
  assert.deepEqual(again.auditIndex, first, "a replay reports the index the first apply wrote, with the same digest");
  assert.equal(again.auditIndex.status, "written");
  assert.equal(again.auditIndex.file, "audit-index.json");
});

test("process: registered package digest drift blocks close preparation before any transition", () => {
  const f = processFixture("package-drift", {
    beforePrepared({ root, paths }) {
      for (const name of ["acceptance.md", "candidate-evidence.md"]) writeFileSync(join(root, "specs/feature", name), `${name}\n`);
      const artifact = (kind, path, authority, mutability) => ({ class: kind, path, sha256: digest(readFileSync(join(root, path))), authority, mutability, retention: "active" });
      writeJson(join(root, "specs/feature/lifecycle.json"), {
        schema: "pipeline.feature-package.v1", feature: { id: "feature", rigor: 1 }, state: "implementing",
        artifacts: [
          artifact("prd", paths.prd, true, "mutable"), artifact("spec", paths.spec, true, "immutable"),
          artifact("acceptance", "specs/feature/acceptance.md", true, "mutable"),
          { ...artifact("result", paths.result, true, "append-only"), sha256: h("f") },
          artifact("candidate-evidence", "specs/feature/candidate-evidence.md", false, "immutable"),
        ], candidate: null, supersedes: null,
      });
    },
    expectPreparedRefusal: "CLOSE-PACKAGE",
  });
  assert.equal(f.refused.code, "CLOSE-PACKAGE");
});

// N31/N32 (D210): the refusal for a Continuity close request that is not bound to the close-ready State names the rule
// that failed (the three closeEvidence rules) and the skill section that carries the whole ordered route.
test("process: a close request whose closeEvidence is the Result is refused with the closeEvidence rules and the skill section named", () => {
  const f = processFixture("close-evidence-is-result", {
    beforePrepared({ root, paths, state }) {
      writeJson(join(root, paths.closeRequest), {
        schema: "pipeline.continuity-close.v0",
        featureId: state.activeFeature.id,
        expectedRevision: state.continuity.revision,
        result: state.continuity.authority.result,
        closeEvidence: state.continuity.authority.result,
      });
    },
    expectPreparedRefusal: "CLOSE-CONTINUITY",
  });
  assert.equal(f.refused.code, "CLOSE-CONTINUITY");
  assert.match(f.refused.message, /closeEvidence/u);
  assert.match(f.refused.message, /different from (?:the )?`?result/u);
  assert.match(f.refused.message, /unique across closed features/u);
  assert.match(f.refused.message, /regular repository-relative file/u);
  assert.match(f.refused.message, /close-feature skill/u);
  assert.match(f.refused.message, /not bound to the exact close-ready State/u, "the original wording stays, the rule text is appended");
});

test("process: local close is read-only planned, replay-safe, candidate-bound and never pushes", () => {
  const fixture = processFixture("local");
  const originalTracked = readFileSync(fixture.trackedPath);
  appendFileSync(fixture.trackedPath, "drift\n");
  const refused = invoke([
    "plan-transition", "--root", fixture.root, "--lifecycle", fixture.lifecycle,
    "--actor", "PO", "--phase", "cleanup-complete",
    "--evidence", join(fixture.evidenceDirectory, "missing.json"),
  ], 2);
  assert.equal(refused.code, "CLOSE-CANDIDATE-DRIFT");
  writeFileSync(fixture.trackedPath, originalTracked);
  const cleanupPath = join(fixture.evidenceDirectory, "cleanup.json");
  writePrivateJsonAtomic(cleanupPath, {
    schema: "pipeline.close-cleanup-receipt.v1",
    status: "uncertain",
    evidenceDigest: h("8"),
    candidateOid: fixture.candidateOid,
    candidateTree: fixture.candidateTree,
  });
  fixture.transition("cleanup-complete", ["--evidence", cleanupPath]);
  const uncertainTerminal = invoke([
    "plan-transition", "--root", fixture.root, "--lifecycle", fixture.lifecycle,
    "--actor", "PO", "--phase", "closed-local",
  ], 2);
  assert.equal(uncertainTerminal.code, "CLOSE-CLEANUP");
  assert.match(uncertainTerminal.message, /cleanup status is "[a-z-]+"/u, "the refusal names the status it saw");
  assert.match(uncertainTerminal.message, /write-cleanup-receipt --root <repository-root> --lifecycle <id>/u, "and the verb that writes the receipt");
  assert.match(uncertainTerminal.message, /session-cleanup\.mjs status/u, "and the command that lists the remaining sessions");
  writePrivateJsonAtomic(cleanupPath, {
    schema: "pipeline.close-cleanup-receipt.v1",
    status: "complete",
    evidenceDigest: h("9"),
    candidateOid: fixture.candidateOid,
    candidateTree: fixture.candidateTree,
  });
  const cleanup = fixture.transition("cleanup-complete", ["--evidence", cleanupPath]);
  assert.equal(invokeAction(cleanup.planned.nextAction).status, "replayed");
  fixture.transition("closed-local");
  const releasePath = join(fixture.evidenceDirectory, "release-authorization.json");
  writePrivateJsonAtomic(releasePath, {
    schema: "pipeline.close-release-eligible-authorization.v1",
    candidateOid: fixture.candidateOid,
    candidateTree: fixture.candidateTree,
    authorizedBy: "PO",
    authorizedAt: "2026-07-29T13:00:00.000Z",
    authorizationDigest: h("a"),
  });
  const releaseWithoutGate = invoke([
    "plan-transition", "--root", fixture.root, "--lifecycle", fixture.lifecycle,
    "--actor", "PO", "--phase", "release-eligible", "--evidence", releasePath,
  ], 2);
  assert.equal(releaseWithoutGate.code, "CLOSE-AUTHORIZATION");
  fixture.transition("release-eligible", ["--evidence", releasePath, "--authorized"]);
  const promotionPath = join(fixture.evidenceDirectory, "promotion-authorization.json");
  writePrivateJsonAtomic(promotionPath, {
    schema: "pipeline.close-promoted-authorization.v1",
    candidateOid: fixture.candidateOid,
    candidateTree: fixture.candidateTree,
    authorizedBy: "PO",
    authorizedAt: "2026-07-29T14:00:00.000Z",
    authorizationDigest: h("b"),
  });
  fixture.transition("promoted", ["--evidence", promotionPath, "--authorized"]);
  const inspected = invoke([
    "inspect", "--root", fixture.root, "--lifecycle", fixture.lifecycle,
  ]);
  assert.equal(inspected.coordinator.phase, "promoted");
  assert.equal(git(fixture.root, ["status", "--porcelain=v1"]), "");
  rmSync(fixture.root, { recursive: true, force: true });
});

// Candidate 16d: the producer for the cleanup receipt. The closing session's own descriptor cannot answer for itself (it is still running, so its
// owner status is `unavailable`); it is excluded and named, and only OTHER active descriptors decide complete versus uncertain.
test("cleanup receipt: the closing session's own descriptor is excluded and named, other sessions decide", () => {
  const oid = h("c", 40); const tree = h("d", 40);
  const own = { sessionId: "claude-11111111-aaaa", descriptorSha256: h("1"), status: "unavailable" };
  const other = { sessionId: "codex-22222222", descriptorSha256: h("2"), status: "live" };
  const alone = buildCleanupReceipt({ descriptors: [own], ownSessionId: own.sessionId, candidateOid: oid, candidateTree: tree });
  assert.equal(alone.receipt.status, "complete");
  assert.deepEqual(Object.keys(alone.receipt).sort(), ["candidateOid", "candidateTree", "evidenceDigest", "schema", "status"]);
  assert.equal(alone.receipt.evidenceDigest, alone.observationSha256);
  assert.deepEqual(alone.observation.excludedOwnSession, own);
  assert.deepEqual(alone.observation.otherActiveDescriptors, []);
  const none = buildCleanupReceipt({ descriptors: [], ownSessionId: null, candidateOid: oid, candidateTree: tree });
  assert.equal(none.receipt.status, "complete", "a project without any descriptor is complete, and says so in its observation");
  assert.equal(none.observation.excludedOwnSession, null);
  assert.equal(none.observation.ownSessionDerived, false);
  const crowded = buildCleanupReceipt({ descriptors: [other, own], ownSessionId: own.sessionId, candidateOid: oid, candidateTree: tree });
  assert.equal(crowded.receipt.status, "uncertain");
  assert.deepEqual(crowded.observation.otherActiveDescriptors, [other]);
  assert.deepEqual(crowded.observation.excludedOwnSession, own);
  const reordered = buildCleanupReceipt({ descriptors: [own, other], ownSessionId: own.sessionId, candidateOid: oid, candidateTree: tree });
  assert.equal(reordered.receipt.evidenceDigest, crowded.receipt.evidenceDigest, "the digest does not depend on listing order");
  // Without a derivable own session nothing is excluded: the descriptor counts, and the receipt cannot claim complete.
  const unknownOwn = buildCleanupReceipt({ descriptors: [own], ownSessionId: null, candidateOid: oid, candidateTree: tree });
  assert.equal(unknownOwn.receipt.status, "uncertain");
  // A different status of the same other session is a different observation.
  const changed = buildCleanupReceipt({ descriptors: [{ ...other, status: "not-live" }, own], ownSessionId: own.sessionId, candidateOid: oid, candidateTree: tree });
  assert.notEqual(changed.receipt.evidenceDigest, crowded.receipt.evidenceDigest);
  for (const bad of [
    { descriptors: "x" },
    { descriptors: [{ ...own, status: "dead" }] },
    { descriptors: [{ ...own, descriptorSha256: "zz" }] },
    { descriptors: [own, own] },
    { candidateOid: "abc" },
    { ownSessionId: "" },
  ]) {
    assert.throws(() => buildCleanupReceipt({ descriptors: [], ownSessionId: null, candidateOid: oid, candidateTree: tree, ...bad }), /invalid/u);
  }
});

test("process: write-cleanup-receipt produces the private receipt the coordinator accepts, and only from a phase that can use it", () => {
  const frozen = processFixture("receipt-phase", { stopAfterFreeze: true });
  const early = frozen.invoke(["write-cleanup-receipt", "--root", frozen.root, "--lifecycle", frozen.lifecycle], 2);
  assert.equal(early.code, "CLOSE-CLEANUP-PHASE");
  const fixture = processFixture("receipt");
  const written = invoke(["write-cleanup-receipt", "--root", fixture.root, "--lifecycle", fixture.lifecycle]);
  assert.equal(written.schema, "pipeline.close-coordinator.cleanup-receipt.v1");
  assert.equal(written.status, "complete");
  assert.equal(written.receiptPath, join(fixture.evidenceDirectory, "cleanup-receipt.json"));
  assert.deepEqual(written.otherActiveDescriptors, []);
  const receipt = JSON.parse(readFileSync(written.receiptPath, "utf8"));
  assert.equal(receipt.candidateOid, fixture.candidateOid);
  assert.equal(receipt.evidenceDigest, written.evidenceDigest);
  assert.equal(digest(canonical(JSON.parse(readFileSync(written.observationPath, "utf8")))), receipt.evidenceDigest, "the digest is that of the stored observation");
  fixture.transition("cleanup-complete", ["--evidence", written.receiptPath]);
  fixture.transition("closed-local");
  // Candidate 17 (Toolbox): after closed-local the producer refuses and says there is no way back, instead of only naming the phase.
  const late = invoke(["write-cleanup-receipt", "--root", fixture.root, "--lifecycle", fixture.lifecycle], 2);
  assert.equal(late.code, "CLOSE-CLEANUP-PHASE");
  assert.match(late.message, /closed-local/u);
  assert.match(late.message, /no way back/u);
  assert.match(late.message, /nothing was written/u);
  assert.equal(readFileSync(written.receiptPath, "utf8"), `${JSON.stringify(receipt, null, 2)}\n`, "the recorded receipt is untouched");
  rmSync(fixture.root, { recursive: true, force: true });
  rmSync(frozen.root, { recursive: true, force: true });
});

// Candidate 17 (runner neutrality): the closing session's own descriptor is derived for the runner that is closing. It used to be hard-coded to
// claude, so on Codex the own `codex-<id>` descriptor counted as foreign and the receipt could never become complete.
function runnerEnv(overrides) {
  const env = childEnv();
  for (const key of ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID", "ANTIGRAVITY_AGENT", "AI_AGENT"]) delete env[key];
  return { ...env, ...overrides };
}
function receiptAs(fixture, overrides) {
  const result = spawnSync(process.execPath, [CLI, "write-cleanup-receipt", "--root", fixture.root, "--lifecycle", fixture.lifecycle], { encoding: "utf8", shell: false, windowsHide: true, env: runnerEnv(overrides) });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("17 cleanup receipt: each runner names how its own session was derived, and Antigravity says it cannot", () => {
  const fixture = processFixture("receipt-runners");
  try {
    const claude = receiptAs(fixture, { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "11111111-aaaa-bbbb-cccc-222222222222" });
    assert.equal(claude.runner, "claude");
    assert.equal(claude.ownSessionDerivation, "observed");
    const codex = receiptAs(fixture, { CODEX_THREAD_ID: "33333333-aaaa-bbbb-cccc-444444444444" });
    assert.equal(codex.runner, "codex");
    assert.equal(codex.ownSessionDerivation, "observed");
    const codexBlind = receiptAs(fixture, {});
    assert.equal(codexBlind.runner, "codex", "without any marker the default is the same as session-cleanup's");
    assert.equal(codexBlind.ownSessionDerivation, "unavailable");
    assert.match(codexBlind.ownSessionReason, /did not expose a usable session id/u);
    const agy = receiptAs(fixture, { ANTIGRAVITY_AGENT: "1" });
    assert.equal(agy.runner, "antigravity");
    assert.equal(agy.ownSessionDerivation, "unavailable");
    assert.match(agy.ownSessionReason, /antigravity creates no session descriptor/u);
    // no descriptor exists in this fixture, so every runner is complete; what differs is that the observation says who derived what
    for (const written of [claude, codex, codexBlind, agy]) assert.equal(written.status, "complete");
    assert.equal(new Set([claude, codex, codexBlind, agy].map((written) => written.evidenceDigest)).size, 4, "the runner and the derivation are part of what the digest binds");
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("17 the invoking runner: an explicit valid runner wins, otherwise the ambient markers, otherwise codex", () => {
  assert.equal(invokingRunnerFromEnv({ CLAUDECODE: "1" }), "claude");
  assert.equal(invokingRunnerFromEnv({ ANTIGRAVITY_AGENT: "1" }), "antigravity");
  assert.equal(invokingRunnerFromEnv({ AI_AGENT: "antigravity" }), "antigravity");
  assert.equal(invokingRunnerFromEnv({}), "codex");
  assert.equal(invokingRunnerFromEnv({ CLAUDECODE: "1" }, "codex"), "codex", "an explicit runner beats the ambient marker");
  assert.equal(invokingRunnerFromEnv({}, "bogus"), null, "an unknown explicit runner is not silently replaced");
});

test("17 the own descriptor id is derived per runner and is never guessed", () => {
  const id = "11111111-aaaa-bbbb-cccc-222222222222";
  assert.deepEqual(resolveOwnSessionDescriptor({ runner: "claude", env: { CLAUDE_CODE_SESSION_ID: id } }),
    { runner: "claude", descriptorSessionId: `claude-${id}`, derivation: "observed", reason: "claude session id read from the process environment" });
  assert.equal(resolveOwnSessionDescriptor({ runner: "codex", env: { CODEX_THREAD_ID: id } }).descriptorSessionId, `codex-${id}`);
  assert.equal(resolveOwnSessionDescriptor({ runner: "codex", env: { CODEX_SESSION_ID: id } }).descriptorSessionId, `codex-${id}`);
  const conflict = resolveOwnSessionDescriptor({ runner: "codex", env: { CODEX_SESSION_ID: id, CODEX_THREAD_ID: "99999999-aaaa" } });
  assert.equal(conflict.descriptorSessionId, null, "two Codex variables that disagree derive nothing");
  assert.equal(conflict.derivation, "unavailable");
  assert.equal(resolveOwnSessionDescriptor({ runner: "claude", env: { CODEX_THREAD_ID: id } }).descriptorSessionId, null, "a Claude process never reads Codex variables");
  assert.equal(resolveOwnSessionDescriptor({ runner: "codex", env: { CLAUDE_CODE_SESSION_ID: id } }).descriptorSessionId, null, "a Codex process never reads Claude variables");
  const odd = resolveOwnSessionDescriptor({ runner: "claude", env: { CLAUDE_CODE_SESSION_ID: "abc_defghij.klm" } });
  assert.equal(odd.descriptorSessionId, null);
  assert.match(odd.reason, /does not form a session descriptor id/u, "a valid session identity that cannot form a descriptor id is reported, not silently dropped");
  const agy = resolveOwnSessionDescriptor({ runner: "antigravity", env: { CLAUDE_CODE_SESSION_ID: id, CODEX_THREAD_ID: id } });
  assert.equal(agy.descriptorSessionId, null);
  assert.match(agy.reason, /antigravity creates no session descriptor/u);
  assert.equal(resolveOwnSessionDescriptor({ runner: "other", env: { CLAUDE_CODE_SESSION_ID: id } }).descriptorSessionId, null);
  assert.equal(resolveOwnSessionDescriptor({}).descriptorSessionId, null);
});

test("17 cleanup receipt: an own session that could not be derived is a typed result, not 'other sessions remain'", () => {
  const oid = h("c", 40); const tree = h("d", 40);
  const stranger = { sessionId: "codex-22222222", descriptorSha256: h("2"), status: "unavailable" };
  const blind = { runner: "codex", derivation: "unavailable", reason: "codex did not expose a usable session id to this process" };
  const underived = buildCleanupReceipt({ descriptors: [stranger], ownSessionId: null, candidateOid: oid, candidateTree: tree, ownSession: blind });
  assert.equal(underived.receipt.status, "uncertain");
  assert.equal(underived.ownSessionCode, "CLOSE-CLEANUP-OWN-SESSION-UNDERIVED");
  assert.equal(underived.observation.ownSessionDerivation, "unavailable");
  const derived = buildCleanupReceipt({ descriptors: [stranger], ownSessionId: stranger.sessionId, candidateOid: oid, candidateTree: tree, ownSession: { runner: "codex", derivation: "observed", reason: "x" } });
  assert.equal(derived.receipt.status, "complete");
  assert.equal(derived.ownSessionCode, null);
  const foreign = buildCleanupReceipt({ descriptors: [stranger, { ...stranger, sessionId: "codex-33333333" }], ownSessionId: stranger.sessionId, candidateOid: oid, candidateTree: tree, ownSession: { runner: "codex", derivation: "observed", reason: "x" } });
  assert.equal(foreign.receipt.status, "uncertain");
  assert.equal(foreign.ownSessionCode, null, "a derived own session with a real foreign session left is the ordinary 'others remain' result");
  const nothing = buildCleanupReceipt({ descriptors: [], ownSessionId: null, candidateOid: oid, candidateTree: tree, ownSession: blind });
  assert.equal(nothing.ownSessionCode, null, "no descriptor at all is complete, nothing to be unsure about");
  // an old caller that says nothing about the runner keeps its exact observation shape
  const legacy = buildCleanupReceipt({ descriptors: [stranger], ownSessionId: null, candidateOid: oid, candidateTree: tree });
  assert.equal(Object.hasOwn(legacy.observation, "runner"), false);
  assert.equal(legacy.ownSessionCode, null);
});

test("process: drive names the missing input, plans without writing, applies one step, writes the cleanup receipt itself and stops at a human gate", () => {
  const f = processFixture("drive", { stopAfterFreeze: true });
  const drive = (extra, status = 0) => f.invoke(["drive", "--root", f.root, "--lifecycle", f.lifecycle, "--actor", "PO", ...extra], status);
  const phaseNow = () => f.invoke(["inspect", "--root", f.root, "--lifecycle", f.lifecycle]).coordinator.phase;

  const missing = drive([]);
  assert.equal(missing.status, "inputs-missing");
  assert.deepEqual(missing.missing, ["evidence"]);
  assert.equal(missing.phase, "candidate-frozen");
  assert.equal(missing.chain.remaining[0].phase, "final-verify-green");

  const verifyPath = join(f.evidenceDirectory, "drive-verify.json");
  writePrivateJsonAtomic(verifyPath, { schema: "pipeline.close-final-verification.v1", candidateOid: f.candidateOid, candidateTree: f.candidateTree, verifyStatus: "green", verifySha256: h("6"), securityStatus: "green", securitySha256: h("7") });
  const planned = drive(["--evidence", verifyPath]);
  assert.equal(planned.status, "planned");
  assert.match(planned.planSha256, /^[0-9a-f]{64}$/u);
  assert.equal(phaseNow(), "candidate-frozen", "a planned step changes nothing");

  const applied = drive(["--evidence", verifyPath, "--apply"]);
  assert.equal(applied.status, "applied");
  assert.equal(applied.phaseAfter, "final-verify-green");
  assert.equal(applied.chainAfter.current, "final-verify-green");
  assert.equal(phaseNow(), "final-verify-green");

  const gate = drive([]);
  assert.equal(gate.status, "human-gate", "the first branch after a green Verify is the publication authorization");
  assert.equal(gate.step.phase, "publication-authorized");
  assert.equal(drive(["--authorized"], 2).code, "CLOSE-ARGS", "the driver has no way to pass the human's authorization");
  assert.equal(drive(["--phase", "promoted"], 2).code, "CLOSE-ORDER");

  const would = drive(["--phase", "cleanup-complete"]);
  assert.equal(would.status, "would-write-cleanup-receipt");
  assert.equal(existsSync(join(f.evidenceDirectory, "cleanup-receipt.json")), false, "a read-only drive writes no receipt");
  const cleaned = drive(["--phase", "cleanup-complete", "--apply"]);
  assert.equal(cleaned.status, "applied");
  assert.equal(cleaned.cleanupReceipt.status, "complete");
  assert.equal(cleaned.phaseAfter, "cleanup-complete");

  assert.equal(drive(["--apply"]).phaseAfter, "closed-local");
  const release = drive([]);
  assert.equal(release.status, "human-gate");
  assert.equal(release.step.phase, "release-eligible");
  rmSync(f.root, { recursive: true, force: true });
});

test("process: authorization, failed publication, exact readback and cleanup stay distinct", () => {
  const fixture = processFixture("delivery");
  const authorizationPath = join(fixture.evidenceDirectory, "publication-authorization.json");
  writePrivateJsonAtomic(authorizationPath, {
    schema: "pipeline.close-publication-authorization.v1",
    candidateOid: fixture.candidateOid,
    candidateTree: fixture.candidateTree,
    channel: "neutral-public",
    destinationDigest: h("9"),
    authorizedBy: "PO",
    authorizedAt: "2026-07-29T12:00:00.000Z",
  });
  const withoutAuthorization = invoke([
    "plan-transition", "--root", fixture.root, "--lifecycle", fixture.lifecycle,
    "--actor", "PO", "--phase", "publication-authorized",
    "--evidence", authorizationPath,
  ], 2);
  assert.equal(withoutAuthorization.code, "CLOSE-AUTHORIZATION");
  fixture.transition("publication-authorized", ["--evidence", authorizationPath, "--authorized"]);
  const afterFailedPush = invoke([
    "inspect", "--root", fixture.root, "--lifecycle", fixture.lifecycle,
  ]);
  assert.equal(afterFailedPush.coordinator.phase, "publication-authorized");

  const publicationPath = join(fixture.evidenceDirectory, "publication.json");
  writePrivateJsonAtomic(publicationPath, executorReceipt(fixture.candidateOid, fixture.candidateTree));
  fixture.transition("published", ["--publication", publicationPath]);
  const readbackPath = join(fixture.evidenceDirectory, "readback.json");
  writePrivateJsonAtomic(readbackPath, executorReceipt(fixture.candidateOid, fixture.candidateTree, "refs/heads/other"));
  const mismatch = invoke([
    "plan-transition", "--root", fixture.root, "--lifecycle", fixture.lifecycle,
    "--actor", "PO", "--phase", "readback-confirmed",
    "--publication", readbackPath,
  ], 2);
  assert.equal(mismatch.code, "CLOSE-PUBLICATION");
  writeFileSync(readbackPath, `${JSON.stringify(executorReceipt(fixture.candidateOid, fixture.candidateTree), null, 2)}\n`, { mode: 0o600 });
  fixture.transition("readback-confirmed", ["--publication", readbackPath]);
  const cleanupPath = join(fixture.evidenceDirectory, "cleanup.json");
  writePrivateJsonAtomic(cleanupPath, {
    schema: "pipeline.close-cleanup-receipt.v1",
    status: "complete",
    evidenceDigest: h("c"),
    candidateOid: fixture.candidateOid,
    candidateTree: fixture.candidateTree,
  });
  fixture.transition("cleanup-complete", ["--evidence", cleanupPath]);
  fixture.transition("delivered");
  const inspected = invoke([
    "inspect", "--root", fixture.root, "--lifecycle", fixture.lifecycle,
  ]);
  assert.equal(inspected.coordinator.phase, "delivered");
  rmSync(fixture.root, { recursive: true, force: true });
});

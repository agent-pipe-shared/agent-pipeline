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
    "featureId", "activeFeature", "authority", "candidateOid", "candidateTree",
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

function processFixture(name) {
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
  const state = {
    schema: "pipeline.state.v0",
    activeFeature,
    planApproved: true,
    planApproval: {
      poGateAuthority: {
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
      "--actor", "PO", "--phase", phase, ...extra,
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
  const prepared = transition("feature-close-prepared", [
    "--continuity-close-request", paths.closeRequest,
  ]);
  assert.deepEqual(
    prepared.applied.nextAction.argv.slice(-2),
    ["--continuity-close-request", paths.closeRequest],
  );

  const coordinatorSha256 = prepared.applied.stateSha256;
  const closedState = {
    schema: "pipeline.state.v0",
    planApproved: false,
    closedFeatures: [{
      id: activeFeature.id,
      planPath: activeFeature.planPath,
      phaseAtClose: activeFeature.phase,
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
    candidateOid,
    candidateTree,
    evidenceDirectory: started.evidenceDirectory,
    trackedPath: join(root, paths.tracked),
  };
}

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

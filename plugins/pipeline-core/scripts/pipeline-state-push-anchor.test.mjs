#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pipeline-state-push-anchor.test.mjs -- pins WHICH key directory `approve-push` anchors the
 * repository-scoped (scratch) push proof to.
 *
 * `repoScopedPushKeyAnchor` in `pipeline-state.mjs` is module-private, so the only seam is the
 * `approve-push` CLI itself (run in-process through `run(argv, deps)`, the shape used by
 * `harness/scripts/pipeline-state-external-push-ledger.test.mjs` and
 * `pipeline-state-approve-push-argv-closure.test.mjs`). The anchor check runs before the
 * scratch JSON is parsed, so it is observable as the first refusal of an otherwise valid bundle.
 *
 * Ruling pinned here (dispatcher ruling 19, R7-6-P-Tb): the anchor is resolved through
 * `resolvePoKeyDirectory` with its tier order -- flag, PIPELINE_PO_APPROVAL_DIRECTORY, the
 * machine plane, then the legacy per-repository pointer (read-only fallback) -- and a resolved
 * directory grants no trust by itself: trust comes only from the pair check against the
 * `authority` scratch file. "Neither present" keeps CRITICAL-PROOF-LOCAL-ANCHOR-UNAVAILABLE.
 *
 * All five cases are GREEN since da20519dd (the anchor is resolved through resolvePoKeyDirectory).
 *
 * "Passes the anchor stage" is observed on a COMPLETE, validly signed bundle: the next stage
 * after the anchor pair check is the proof verification, which succeeds, so the observable is
 * exit 0 with the `Push approved by` line and neither anchor code on stderr.
 *
 * Hermetics: every key pair is generated in-process; the repository, the machine plane
 * (HOME/USERPROFILE) and both key directories live under os.tmpdir(); the real home, the real
 * machine plane and any real key directory are never read.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCriticalActionApprovalRequest, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { criticalPushScratchArtifactPaths } from "./po-human-approval.mjs";
import { run } from "./pipeline-state.mjs";
import { readFileSync } from "node:fs";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";
import { createSessionAuthorityParticipantPorts } from "../lib/session-authority-observers.mjs";
import { initializeSessionAuthorityRegistry } from "../lib/session-authority-registry.mjs";
import { nativeContractFixtureParent, prepareApprovedItemCourseFixture } from "../lib/test-item-approved-course-fixture.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../lib/worktree-lifecycle.mjs";

const NOW = "2026-10-08T00:00:00.000Z";
const CANDIDATE = { commit: "a".repeat(40), tree: "b".repeat(40) };
const REMOTE = "origin";
const DESTINATION = "refs/heads/main";
const UNAVAILABLE = "CRITICAL-PROOF-LOCAL-ANCHOR-UNAVAILABLE";
const MISMATCH = "CRITICAL-PROOF-LOCAL-ANCHOR-MISMATCH";
const SUCCESS_LINE = 'Push approved by "PO"';

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const PLAN_SHA = sha256("plan");
const SPEC_SHA = sha256("spec");

const roots = [];
function freshRoot(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `ps-push-anchor-${prefix}-`));
  roots.push(dir);
  return dir;
}
test.after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

/** An in-process Ed25519 identity plus a key directory holding only its public trust-policy.json. */
function makeKey(label) {
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const keyReference = `fixture-key-${label}`;
  const publicKeySha256 = sha256(publicKey);
  const directory = freshRoot(`keydir-${label}`);
  writeFileSync(join(directory, "trust-policy.json"), JSON.stringify({ keyReference, publicKeySha256 }));
  return { label, keyReference, publicKey, publicKeySha256, privateKey: keys.privateKey, directory };
}

/**
 * A temp git repository with a non-waived push gate, a threat-model artifact, a committed
 * critical-human-proof policy that requires `push`, and a COMPLETE scratch bundle (request,
 * authority, proof) written at the exact paths `criticalPushScratchArtifactPaths` names. The
 * bundle is authored by `signer`: authority carries the signer's pair, the proof is signed by it.
 * `plane` / `legacy` select the key directory the machine plane / the legacy per-repository
 * pointer names (either may be null = that tier absent).
 */
function buildFixture({ signer, plane = null, legacy = null }) {
  const dir = freshRoot("repo");
  const home = freshRoot("home");
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "fixture@example.invalid"]);
  git(dir, ["config", "user.name", "Fixture"]);
  writeFileSync(join(dir, "README.md"), "fixture\n");
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, "pipeline.user.yaml"), 'schema: "pipeline.user.v1"\ngates:\n  push_approval: "signature"\n');
  writeFileSync(join(dir, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    // The policy-level anchor is a separate, LATER stage; it carries the signer's pair so it
    // never masks the stage under test.
    trustAnchor: { keyReference: signer.keyReference, publicKeySha256: signer.publicKeySha256 },
  }));
  git(dir, ["add", "README.md", "pipeline.user.yaml", "project/critical-human-proof.json"]);
  git(dir, ["commit", "-q", "-m", "init"]);

  const threatModelBody = "fixture threat model\n";
  writeFileSync(join(dir, "project", "push-threat-model.md"), threatModelBody);
  const threatModel = { path: "project/push-threat-model.md", sha256: sha256(threatModelBody) };
  writeFileSync(join(dir, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "fixture-feature", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256: PLAN_SHA, specSha256: SPEC_SHA } },
  }, null, 2));

  const common = realpathSync(join(dir, ".git"));
  if (plane !== null) {
    mkdirSync(join(home, ".agent-pipeline"), { recursive: true });
    writeFileSync(join(home, ".agent-pipeline", "machine.json"), JSON.stringify({
      schema: "pipeline.machine-plane.v1",
      poKeyDirectory: plane.directory,
      pushApprovalDefault: "signature",
      routing: null,
      language: null,
      session: null,
      usage: null,
      updatedAt: NOW,
    }));
  }
  if (legacy !== null) {
    // QG-04 (d02409a8a; AC-150): the product's own writer creates this namespace owner-private (po-human-approval.mjs),
    // and stateCataloguePresent refuses a group/other-accessible one (SDC-PRIVATE-PATH) before the anchor is reached.
    mkdirSync(join(common, "agent-pipeline"), { recursive: true, mode: 0o700 });
    chmodSync(join(common, "agent-pipeline"), 0o700);
    writeFileSync(join(common, "agent-pipeline", "po-key-directory.json"), JSON.stringify({
      schema: "pipeline.po-key-directory.v1",
      poKeyDirectory: legacy.directory,
      updatedAt: NOW,
    }));
  }

  const subjectSha256 = criticalActionSubjectSha256({
    kind: "push",
    candidate: CANDIDATE,
    subject: { sourceCommit: CANDIDATE.commit, remote: REMOTE, destination: DESTINATION, threatModel },
  });
  const request = createCriticalActionApprovalRequest({
    candidate: CANDIDATE,
    featureId: "fixture-feature",
    planBytes: Buffer.from("plan"),
    specBytes: Buffer.from("spec"),
    action: { kind: "push", subjectSha256, expiresAt: "2099-01-01T00:00:00.000Z" },
  });
  const authority = { keyReference: signer.keyReference, publicKeySha256: signer.publicKeySha256 };
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: request.approvalIntent.sha256,
    keyReference: signer.keyReference,
    publicKey: signer.publicKey,
    signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), signer.privateKey).toString("base64"),
  };
  const paths = criticalPushScratchArtifactPaths(dir, common);
  mkdirSync(join(dir, "scratch"), { recursive: true });
  writeFileSync(paths.request, JSON.stringify(request));
  writeFileSync(paths.authority, JSON.stringify(authority));
  writeFileSync(paths.proof, JSON.stringify(proof));

  return {
    dir,
    home,
    argv: ["approve-push", "--by", "PO", "--remote", REMOTE, "--destination", DESTINATION,
      "--proof-request", paths.request, "--proof-authority", paths.authority, "--proof", paths.proof],
  };
}

/**
 * Runs `approve-push` in-process with the machine plane pointed at the fixture home
 * (os.homedir() reads HOME on POSIX and USERPROFILE on Windows) and the per-terminal
 * directory override cleared, so the tier order is the only thing selecting the anchor.
 */
function callApprove(fixture) {
  const names = ["HOME", "USERPROFILE", "PIPELINE_PO_APPROVAL_DIRECTORY"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.HOME = fixture.home;
  process.env.USERPROFILE = fixture.home;
  delete process.env.PIPELINE_PO_APPROVAL_DIRECTORY;
  const stdout = [];
  const stderr = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => stdout.push(args.join(" "));
  console.error = (...args) => stderr.push(args.join(" "));
  let code;
  try {
    code = run(fixture.argv, {
      dir: fixture.dir,
      now: () => NOW,
      gitHead: () => ({ ok: true, commit: CANDIDATE.commit }),
      gitCandidate: () => ({ ok: true, ...CANDIDATE }),
      env: { ...process.env, HOME: fixture.home, USERPROFILE: fixture.home },
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  }
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

function describeResult(result) {
  return `exit ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;
}

function assertPassesAnchorStage(result) {
  assert.ok(!result.stderr.includes(UNAVAILABLE), `unexpected ${UNAVAILABLE}\n${describeResult(result)}`);
  assert.ok(!result.stderr.includes(MISMATCH), `unexpected ${MISMATCH}\n${describeResult(result)}`);
  assert.equal(result.code, 0, `the complete bundle must get past the anchor stage and be approved\n${describeResult(result)}`);
  assert.ok(result.stdout.includes(SUCCESS_LINE), `expected the success line\n${describeResult(result)}`);
}

function assertRefusedWith(result, anchorCode, otherCode) {
  assert.equal(result.code, 2, `expected refusal exit 2\n${describeResult(result)}`);
  assert.ok(result.stderr.includes(`(${anchorCode})`), `expected ${anchorCode}\n${describeResult(result)}`);
  assert.ok(!result.stderr.includes(otherCode), `unexpected ${otherCode}\n${describeResult(result)}`);
  assert.ok(!result.stdout.includes(SUCCESS_LINE), `the success line must be unreachable\n${describeResult(result)}`);
}

test("R7-6-P: case 1 -- a machine-plane key directory alone anchors the push proof (no legacy pointer)", () => {
  const a = makeKey("a");
  const result = callApprove(buildFixture({ signer: a, plane: a }));
  assertPassesAnchorStage(result);
});

test("R7-6-P: case 2 -- with no machine plane the legacy per-repository pointer remains a read-only fallback anchor", () => {
  const b = makeKey("b");
  const result = callApprove(buildFixture({ signer: b, legacy: b }));
  assertPassesAnchorStage(result);
});

test("R7-6-P: case 3a -- plane = A and legacy = B: the plane wins, an authority carrying A's pair passes", () => {
  const a = makeKey("a");
  const b = makeKey("b");
  const result = callApprove(buildFixture({ signer: a, plane: a, legacy: b }));
  assertPassesAnchorStage(result);
});

test("R7-6-P: case 3b -- plane = A and legacy = B: an authority carrying B's pair is refused with LOCAL-ANCHOR-MISMATCH", () => {
  const a = makeKey("a");
  const b = makeKey("b");
  const result = callApprove(buildFixture({ signer: b, plane: a, legacy: b }));
  assertRefusedWith(result, MISMATCH, UNAVAILABLE);
});

test("R7-6-P: case 4 -- neither a machine plane nor a legacy pointer keeps LOCAL-ANCHOR-UNAVAILABLE", () => {
  const a = makeKey("a");
  const result = callApprove(buildFixture({ signer: a }));
  assertRefusedWith(result, UNAVAILABLE, MISMATCH);
});


// ---- K52: approve-push in signature mode while the session-authority catalogue exists (block-scoped helpers) ----
/*
 * pins `approve-push` in SIGNATURE mode while the
 * session-authority catalogue exists (K52, PO decision Option A, 2026-10-22).
 *
 * Before: with `.git/agent-pipeline/session-authority/catalogue.json` present, every shell-run
 * `approve-push` went to the State push producer route, which needs a requester bound by a
 * source-owned host process; a terminal or agent shell binds none, so the documented Layer-4 command
 * was refused with SDC-AUTHORITY-UNAVAILABLE (state-push-source-requester) and no route existed.
 * Now: only a waived (chat) push takes the producer route; signature mode falls through to the PF-54
 * in-flight gate and the legacy route, whose detached proof stays bound to the exact commit, remote
 * and destination. Real git candidates, no injected dependencies (an injected route stays refused
 * while a catalogue exists).
 */
{
const REMOTE = "origin";
const DESTINATION = "refs/heads/main";
const SUCCESS_LINE = 'Push approved by "PO"';
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const roots = [];
test.after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function captured(fn) {
  const stdout = [];
  const stderr = [];
  const saved = { log: console.log, error: console.error };
  console.log = (...args) => stdout.push(args.join(" "));
  console.error = (...args) => stderr.push(args.join(" "));
  let code;
  try { code = fn(); } finally { Object.assign(console, saved); }
  return { code, stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

/** A governed repository with an initialized catalogue and a complete, correctly signed push bundle. */
function buildFixture({ tamper = null } = {}) {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const dir = mkdtempSync(join(parent, "k52-approve-push-"));
  roots.push(dir);
  const home = mkdtempSync(join(tmpdir(), "k52-approve-push-home-"));
  roots.push(home);
  mkdirSync(join(dir, "evidence"), { mode: 0o700 });
  git(dir, ["init", "-q", "-b", "main"]);
  for (const [name, value] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"]]) git(dir, ["config", name, value]);
  writeFileSync(join(dir, "README.md"), "fixture\n");
  writeFileSync(join(dir, ".gitignore"), "scratch/\nevidence/\n.claude/\n");
  git(dir, ["add", "README.md", ".gitignore"]);
  git(dir, ["commit", "-q", "-m", "init"]);
  const controller = createGovernanceScopeController({ hostStateRoot: join(dir, "fixture-host") });
  const plan = controller.planDecision({ rootDir: dir, decision: "enroll", by: "fixture explicit course" });
  controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  prepareApprovedItemCourseFixture({ root: dir });
  writeFileSync(join(dir, "pipeline.user.yaml"), 'schema: "pipeline.user.v1"\ngates:\n  push_approval: "signature"\n');
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const keyReference = "fixture-key-k52";
  const publicKeySha256 = sha256(publicKey);
  const keyDir = mkdtempSync(join(tmpdir(), "k52-approve-push-key-"));
  roots.push(keyDir);
  writeFileSync(join(keyDir, "trust-policy.json"), JSON.stringify({ keyReference, publicKeySha256 }));
  mkdirSync(join(home, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(home, ".agent-pipeline", "machine.json"), JSON.stringify({
    schema: "pipeline.machine-plane.v1", poKeyDirectory: keyDir, pushApprovalDefault: "signature",
    routing: null, language: null, session: null, usage: null, updatedAt: "2026-10-22T00:00:00.000Z",
  }));
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"], trustAnchor: { keyReference, publicKeySha256 },
  }));
  const threatModelBody = "fixture threat model\n";
  writeFileSync(join(dir, "project", "push-threat-model.md"), threatModelBody);
  const threatModel = { path: "project/push-threat-model.md", sha256: sha256(threatModelBody) };
  const stateFile = join(dir, ".claude", "pipeline-state.json");
  const activeState = JSON.parse(readFileSync(stateFile, "utf8"));
  const featureId = activeState.activeFeature.id;
  const planBytes = readFileSync(join(dir, "specs", "unit", "prd_unit.md"));
  const specBytes = readFileSync(join(dir, "specs", "unit", "spec.md"));
  assert.equal(activeState.planApproval?.poGateAuthority?.planSha256, sha256(planBytes), "the fixture plan bytes are the approved plan");
  assert.equal(activeState.planApproval?.poGateAuthority?.specSha256, sha256(specBytes), "the fixture spec bytes are the approved spec");
  git(dir, ["add", "pipeline.user.yaml", "project/critical-human-proof.json", "project/push-threat-model.md"]);
  git(dir, ["commit", "-q", "-m", "fixture policy"]);
  const repository = inspectSignedDescriptorCustodyRepository(dir);
  initializeSessionAuthorityRegistry({ repository }, createSessionAuthorityParticipantPorts({ repository }));
  const candidate = { commit: git(dir, ["rev-parse", "HEAD"]), tree: git(dir, ["rev-parse", "HEAD^{tree}"]) };
  const signedDestination = tamper === "destination" ? "refs/heads/other" : DESTINATION;
  const signedCommit = tamper === "commit" ? "c".repeat(40) : candidate.commit;
  const subjectSha256 = criticalActionSubjectSha256({
    kind: "push", candidate: { commit: signedCommit, tree: candidate.tree },
    subject: { sourceCommit: signedCommit, remote: REMOTE, destination: signedDestination, threatModel },
  });
  const request = createCriticalActionApprovalRequest({
    candidate: { commit: signedCommit, tree: candidate.tree }, featureId,
    planBytes, specBytes,
    action: { kind: "push", subjectSha256, expiresAt: "2099-01-01T00:00:00.000Z" },
  });
  const proof = {
    schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference, publicKey,
    signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64"),
  };
  if (tamper === "forged") proof.signatureBase64 = Buffer.alloc(64, 7).toString("base64");
  const common = realpathSync(join(dir, ".git"));
  const paths = criticalPushScratchArtifactPaths(dir, common);
  mkdirSync(join(dir, "scratch"), { recursive: true });
  writeFileSync(paths.request, JSON.stringify(request));
  writeFileSync(paths.authority, JSON.stringify({ keyReference, publicKeySha256 }));
  if (tamper !== "missing") writeFileSync(paths.proof, JSON.stringify(proof));
  return {
    dir, home,
    argv: ["approve-push", "--by", "PO", "--remote", REMOTE, "--destination", DESTINATION,
      "--proof-request", paths.request, "--proof-authority", paths.authority, "--proof", paths.proof],
  };
}

function callApprove(fixture) {
  const names = ["HOME", "USERPROFILE", "PIPELINE_PO_APPROVAL_DIRECTORY"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.HOME = fixture.home;
  process.env.USERPROFILE = fixture.home;
  delete process.env.PIPELINE_PO_APPROVAL_DIRECTORY;
  try {
    return captured(() => run(fixture.argv, { dir: fixture.dir }));
  } finally {
    for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
}

const describeResult = (result) => `exit ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;

test("K52-1: with a catalogue present, signature-mode approve-push approves a correctly signed proof (the documented Layer-4 route works)", () => {
  const fixture = buildFixture();
  const result = callApprove(fixture);
  assert.ok(!result.stderr.includes("state-push-source-requester"), `the producer route must not be taken\n${describeResult(result)}`);
  assert.equal(result.code, 0, describeResult(result));
  assert.ok(result.stdout.includes(SUCCESS_LINE), describeResult(result));
  const state = JSON.parse(readFileSync(join(fixture.dir, ".claude", "pipeline-state.json"), "utf8"));
  assert.equal(state.pushApproval?.lastApproved?.forCommit, git(fixture.dir, ["rev-parse", "HEAD"]), "the approval is bound to the exact candidate commit");
});

for (const [tamper, label] of [["commit", "a proof signed for another commit"], ["destination", "a proof signed for another destination"],
  ["forged", "a forged signature"], ["missing", "a missing proof file"]]) {
  test(`K52-2: with a catalogue present, ${label} is still refused and records no approval`, () => {
    const fixture = buildFixture({ tamper });
    const result = callApprove(fixture);
    assert.notEqual(result.code, 0, describeResult(result));
    assert.ok(!result.stdout.includes(SUCCESS_LINE), describeResult(result));
    const state = JSON.parse(readFileSync(join(fixture.dir, ".claude", "pipeline-state.json"), "utf8"));
    assert.equal(state.pushApproval?.lastApproved, undefined, "no approval may be recorded");
  });
}
}

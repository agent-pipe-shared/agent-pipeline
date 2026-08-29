#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pipeline-state-decision-reference.test.mjs — H-AC-12 write-side coverage for
 * `pipeline-state.mjs`'s opt-in `--decision-reference` dual-evaluation in `approve-push` and
 * `approve-deploy`.
 *
 * SIBLING FILE, NOT AN EDIT TO `harness/scripts/pipeline-state.test.mjs` -- that file is
 * `.claude/guard-config.json` `protectedTestPaths` rule TP-5, and
 * `pipeline-state-external-push-ledger.test.mjs` already established the sibling pattern for
 * exactly this situation. This filename does not match TP-5's anchored regex.
 *
 * Reuses that sibling's fixture shape verbatim: `run(argv, deps)` with injected
 * `dir`/`now`/`gitHead`/`gitCandidate` plus a real Ed25519 approval-proof pair. `dir` is a REAL
 * git repository (one commit) because `discoverRepository(dir, ...)` -- which the new
 * dual-evaluation calls to derive the repository fingerprint -- is not behind that seam.
 *
 * Run: node harness/scripts/pipeline-state-decision-reference.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 *
 * Hermetics: every case runs in a fresh temp repository with HOME/USERPROFILE pointed at a
 * fresh temp directory, so nothing touches this machine's real home directory.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { createCriticalActionApprovalRequest, criticalActionSubjectSha256 } from "../../plugins/pipeline-core/lib/critical-action-approval-request.mjs";
import { discoverRepository } from "../../plugins/pipeline-core/lib/worktree-lifecycle.mjs";
import { derivePoGateRepositoryFingerprint } from "../../plugins/pipeline-core/lib/po-gate-authority.mjs";
import { run } from "./pipeline-state.mjs";

let passed = 0;
let failed = 0;
const fixtureRoots = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.stack || error.message}`);
  }
}

function freshRoot(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `ps-decref-${prefix}-`));
  fixtureRoots.push(dir);
  return dir;
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

function gitInit(dir) {
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "fixture@example.invalid"]);
  git(dir, ["config", "user.name", "Fixture"]);
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-q", "-m", "init"]);
}

const NOW = "2026-08-17T00:00:00.000Z";
const PLAN_SHA = createHash("sha256").update("plan").digest("hex");
const SPEC_SHA = createHash("sha256").update("spec").digest("hex");
const CANDIDATE = { commit: "a".repeat(40), tree: "b".repeat(40) };
const STATE_REL = join("project", "pipeline-state.json");
const REFERENCE_REL = "project/decision-reference.json";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function fingerprintFor(dir) {
  const repo = discoverRepository(dir);
  return derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
}

/** A well-formed `pipeline.human-decision-reference.v1`, bound as the case asks. */
function reference(dir, { commit = CANDIDATE.commit, tree = CANDIDATE.tree, fingerprint } = {}) {
  const bound = fingerprint ?? fingerprintFor(dir);
  return {
    schema: "pipeline.human-decision-reference.v1",
    decisionId: "DEC-PHX-HAC12-1",
    decisionDigest: "c".repeat(64),
    candidate: { commit, tree },
    checkpoint: {
      repositoryFingerprint: bound,
      streamId: "human",
      sequence: 3,
      eventDigest: "d".repeat(64),
      candidateCommit: commit,
      candidateTree: tree,
    },
  };
}

function writeReference(dir, value) {
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, REFERENCE_REL), JSON.stringify(value, null, 2));
}

/**
 * Builds a ready-to-consume approve-push proof bundle plus the local state/policy fixtures it
 * binds to (mirrors pipeline-state-external-push-ledger.test.mjs's `proofBundle`).
 */
function pushFixture(prefix) {
  const dir = freshRoot(prefix);
  gitInit(dir);
  const external = freshRoot(`${prefix}-external`);
  mkdirSync(join(dir, "project"), { recursive: true });
  mkdirSync(join(dir, "specs", "sprint-nova-epic", "implementation"), { recursive: true });
  const threatModelBody = "fixture threat model\n";
  writeFileSync(join(dir, "specs", "sprint-nova-epic", "implementation", "critical-action-authorization-threat-model.md"), threatModelBody);
  // approve-push resolves its bound threat-model artifact at the single fixed
  // project/push-threat-model.md path (resolvePushThreatModelArtifact,
  // PUSH_THREAT_MODEL_DEFAULT_PATH), BEFORE requiredKinds is even consulted -- an absent
  // artifact refuses byte-null with CRITICAL-PROOF-BOUND-ARTIFACT-UNAVAILABLE. Materialize it
  // here so approve-push reaches the point every PSDR* case actually exercises.
  writeFileSync(join(dir, "project", "push-threat-model.md"), threatModelBody);
  const threatModel = {
    path: "project/push-threat-model.md",
    sha256: createHash("sha256").update(threatModelBody).digest("hex"),
  };
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  const publicKeySha256 = createHash("sha256").update(publicKey).digest("hex");
  writeFileSync(join(dir, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push", "deploy", "publication"],
    trustAnchor: { keyReference: "test-key", publicKeySha256 },
  }));
  writeFileSync(join(dir, STATE_REL), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "fixture-feature", planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256: PLAN_SHA, specSha256: SPEC_SHA } },
  }, null, 2));
  const remote = "origin";
  const destination = "refs/heads/main";
  const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate: CANDIDATE, subject: { sourceCommit: CANDIDATE.commit, remote, destination, threatModel } });
  const request = createCriticalActionApprovalRequest({
    candidate: CANDIDATE, featureId: "fixture-feature", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"),
    action: { kind: "push", subjectSha256, expiresAt: "2099-01-01T00:00:00.000Z" },
  });
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: request.approvalIntent.sha256,
    keyReference: "test-key",
    publicKey,
    signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64"),
  };
  const requestPath = join(external, "request.json");
  const authorityPath = join(external, "authority.json");
  const proofPath = join(external, "proof.json");
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(authorityPath, JSON.stringify({ keyReference: "test-key", publicKeySha256 }));
  writeFileSync(proofPath, JSON.stringify(proof));
  return {
    dir,
    argv: ["approve-push", "--by", "PO", "--remote", remote, "--destination", destination,
      "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath],
  };
}

/** approve-deploy without a demanded deploy proof: `deploy` is simply not a required kind. */
function deployFixture(prefix) {
  const dir = freshRoot(prefix);
  gitInit(dir);
  mkdirSync(join(dir, "project"), { recursive: true });
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
  writeFileSync(join(dir, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push"],
    trustAnchor: { keyReference: "test-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") },
  }));
  writeFileSync(join(dir, STATE_REL), JSON.stringify({ schema: "pipeline.state.v0" }, null, 2));
  return { dir, argv: ["approve-deploy", "--env", "staging", "--artifact", "v1.2.3", "--by", "PO"] };
}

function call(dir, argv) {
  const home = freshRoot("home");
  const savedHome = process.env.HOME;
  const savedUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  const captured = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => captured.push(args.join(" "));
  console.error = (...args) => captured.push(args.join(" "));
  let code;
  try {
    code = run(argv, {
      dir, now: () => NOW,
      gitHead: () => ({ ok: true, commit: CANDIDATE.commit }),
      gitCandidate: () => ({ ok: true, ...CANDIDATE }),
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.env.HOME = savedHome;
    process.env.USERPROFILE = savedUserProfile;
  }
  return { code, output: captured.join("\n") };
}

function stateOf(dir) {
  return JSON.parse(readFileSync(join(dir, STATE_REL), "utf8"));
}

const DISAGREEMENT = "DECISION-REFERENCE-DISAGREEMENT";

// ---- PSDR01: approve-push WITHOUT --decision-reference -> prior behavior, byte-for-byte ------
// (regression witness: the recorded approval must not merely succeed, it must carry no new key
// beyond the pre-existing shape plus NVA-PUSHFOLD-1's unconditional `pendingAuditWrite` hint --
// in particular, no `decisionReference` key).
check("PSDR01 approve-push without --decision-reference records exactly the pre-existing record", () => {
  const { dir, argv } = pushFixture("push-absent");
  const { code, output } = call(dir, argv);
  assert.equal(code, 0, output);
  const approval = stateOf(dir).pushApproval.lastApproved;
  assert.equal(Object.hasOwn(approval, "decisionReference"), false);
  assert.deepEqual(Object.keys(approval).sort(),
    ["approvedAt", "approvedBy", "criticalProof", "destination", "forCommit", "pendingAuditWrite", "remote", "threatModel"]);
});

// ---- PSDR02: present and agreeing -> the transition proceeds and the reference is recorded ----
check("PSDR02 approve-push with an agreeing --decision-reference proceeds and records it", () => {
  const { dir, argv } = pushFixture("push-agree");
  const value = reference(dir);
  writeReference(dir, value);
  const { code, output } = call(dir, [...argv, "--decision-reference", REFERENCE_REL]);
  assert.equal(code, 0, output);
  assert.deepEqual(stateOf(dir).pushApproval.lastApproved.decisionReference, value);
});

// ---- PSDR03: present and disagreeing (different candidate commit) -> refused, zero mutation ---
check("PSDR03 approve-push with a --decision-reference bound to another commit is refused", () => {
  const { dir, argv } = pushFixture("push-wrong-commit");
  writeReference(dir, reference(dir, { commit: "f".repeat(40) }));
  const { code, output } = call(dir, [...argv, "--decision-reference", REFERENCE_REL]);
  assert.equal(code, 2);
  assert.match(output, new RegExp(DISAGREEMENT));
  assert.match(output, /legacy=true, decision-reference=false/);
  assert.match(output, /compatibility owner "pipeline"/);
  assert.equal(stateOf(dir).pushApproval, undefined); // nothing was written
});

// ---- PSDR04: present and disagreeing (different tree -- invisible to every legacy check) ------
check("PSDR04 approve-push with a --decision-reference bound to another tree is refused", () => {
  const { dir, argv } = pushFixture("push-wrong-tree");
  writeReference(dir, reference(dir, { tree: "e".repeat(40) }));
  const { code } = call(dir, [...argv, "--decision-reference", REFERENCE_REL]);
  assert.equal(code, 2);
  assert.equal(stateOf(dir).pushApproval, undefined);
});

// ---- PSDR05: present but malformed -> fails closed, never a silent "no reference supplied" ----
check("PSDR05 approve-push with a malformed --decision-reference fails closed", () => {
  const { dir, argv } = pushFixture("push-malformed");
  writeReference(dir, {});
  const { code, output } = call(dir, [...argv, "--decision-reference", REFERENCE_REL]);
  assert.equal(code, 2);
  assert.match(output, new RegExp(DISAGREEMENT));
  assert.equal(stateOf(dir).pushApproval, undefined);
});

// ---- PSDR06: absent reference file -> refused with its own code, never a pass-through ---------
// `safeRequestFile` already resolves a nonexistent repo-relative path to null, so this lands on
// DECISION-REFERENCE-FILE rather than -UNREADABLE (which covers a file that exists but does not
// parse as a JSON object). Either way it is a refusal, never a silent "no reference supplied".
check("PSDR06 approve-push with a missing --decision-reference file is refused", () => {
  const { dir, argv } = pushFixture("push-missing-file");
  const { code, output } = call(dir, [...argv, "--decision-reference", REFERENCE_REL]);
  assert.equal(code, 2);
  assert.match(output, /DECISION-REFERENCE-FILE/);
  assert.equal(stateOf(dir).pushApproval, undefined);
});

// ---- PSDR06b: reference file exists but is not JSON -> DECISION-REFERENCE-UNREADABLE ----------
check("PSDR06b approve-push with a non-JSON --decision-reference file is refused", () => {
  const { dir, argv } = pushFixture("push-unparsable");
  mkdirSync(join(dir, "project"), { recursive: true });
  writeFileSync(join(dir, REFERENCE_REL), "not json at all");
  const { code, output } = call(dir, [...argv, "--decision-reference", REFERENCE_REL]);
  assert.equal(code, 2);
  assert.match(output, /DECISION-REFERENCE-UNREADABLE/);
  assert.equal(stateOf(dir).pushApproval, undefined);
});

// ---- PSDR07: an unsafe reference path never leaves the repository -----------------------------
check("PSDR07 approve-push with an absolute --decision-reference path is refused", () => {
  const { dir, argv } = pushFixture("push-unsafe-path");
  const { code, output } = call(dir, [...argv, "--decision-reference", "/etc/passwd"]);
  assert.equal(code, 2);
  assert.match(output, /DECISION-REFERENCE-FILE/);
  assert.equal(stateOf(dir).pushApproval, undefined);
});

// ---- PSDR08: approve-deploy WITHOUT --decision-reference -> prior behavior, byte-for-byte -----
check("PSDR08 approve-deploy without --decision-reference records exactly the pre-existing entry", () => {
  const { dir, argv } = deployFixture("deploy-absent");
  const { code, output } = call(dir, argv);
  assert.equal(code, 0, output);
  const entry = stateOf(dir).deployApprovals[0];
  assert.deepEqual(Object.keys(entry).sort(), ["approvedAt", "approvedBy", "forArtifact", "forEnvironment"]);
});

// ---- PSDR09: approve-deploy present and agreeing ----------------------------------------------
check("PSDR09 approve-deploy with an agreeing --decision-reference proceeds and records it", () => {
  const { dir, argv } = deployFixture("deploy-agree");
  const value = reference(dir);
  writeReference(dir, value);
  const { code, output } = call(dir, [...argv, "--decision-reference", REFERENCE_REL]);
  assert.equal(code, 0, output);
  assert.deepEqual(stateOf(dir).deployApprovals[0].decisionReference, value);
});

// ---- PSDR10: approve-deploy present and disagreeing -> refused, zero mutation -----------------
check("PSDR10 approve-deploy with a disagreeing --decision-reference is refused", () => {
  const { dir, argv } = deployFixture("deploy-disagree");
  writeReference(dir, reference(dir, { fingerprint: "9".repeat(64) }));
  const { code, output } = call(dir, [...argv, "--decision-reference", REFERENCE_REL]);
  assert.equal(code, 2);
  assert.match(output, new RegExp(DISAGREEMENT));
  assert.match(output, /legacy=true, decision-reference=false/);
  assert.equal(stateOf(dir).deployApprovals, undefined);
});

for (const dir of fixtureRoots) rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

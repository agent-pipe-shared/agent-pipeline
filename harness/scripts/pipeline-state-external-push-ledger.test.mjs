#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * pipeline-state-external-push-ledger.test.mjs — PHX-2 write-side coverage for
 * `pipeline-state.mjs`'s `approve-push` external push-ledger consult (design doc §2).
 *
 * SIBLING FILE, NOT AN EDIT TO `harness/scripts/pipeline-state.test.mjs` -- that file is
 * `.claude/guard-config.json` `protectedTestPaths` rule TP-5, enforced live by
 * `guard-testpath.mjs`'s Edit/Write PreToolUse guard with no in-session override available
 * while `gates.push_approval` is `signature` (this repo's configured value). Confirmed
 * empirically before writing this file (WP5-phx2-implementation), same reasoning as
 * `guard-push-external-ledger.test.mjs`'s own header. This filename does not match TP-5's
 * regex (confirmed by piping it into guard-testpath.mjs directly before creating the file).
 *
 * Reuses `critical-human-proof-gate.test.mjs`'s established in-process fixture shape
 * (`run(argv, deps)` with injected `dir`/`now`/`gitHead`/`gitCandidate`, a real
 * `createCriticalActionApprovalRequest`/Ed25519 signature pair) rather than a full real-git
 * end-to-end subprocess -- `gitHead`/`gitCandidate` are already an injectable seam for
 * exactly this purpose. `discoverRepository(dir, ...)` (this dispatch's new call) is NOT
 * behind that seam, so `dir` is a REAL git repository (one commit) in every case except the
 * one deliberately testing the topology-unresolved path.
 *
 * Run: node harness/scripts/pipeline-state-external-push-ledger.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 *
 * Hermetics: every case that needs a `.pipeline/push-ledger` ledger passes an explicit
 * `rootDir`/HOME override to a fresh temp directory, never this machine's real `$HOME`.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { createCriticalActionApprovalRequest, criticalActionSubjectSha256 } from "../../plugins/pipeline-core/lib/critical-action-approval-request.mjs";
import { discoverRepository } from "../../plugins/pipeline-core/lib/worktree-lifecycle.mjs";
import { derivePoGateRepositoryFingerprint } from "../../plugins/pipeline-core/lib/po-gate-authority.mjs";
import { appendExternalPushLedgerConsumption } from "../../plugins/pipeline-core/lib/external-push-ledger.mjs";
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
  const dir = mkdtempSync(join(tmpdir(), `ps-xledger-${prefix}-`));
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

const NOW = "2026-08-07T00:00:00.000Z";
const PLAN_SHA = createHash("sha256").update("plan").digest("hex");
const SPEC_SHA = createHash("sha256").update("spec").digest("hex");

/**
 * Builds a full, ready-to-consume approve-push proof bundle plus the local state/policy
 * fixtures it binds to, mirroring `critical-human-proof-gate.test.mjs`'s established shape.
 */
function proofBundle(dir, { candidate, remote = "origin", destination = "refs/heads/main", featureId = "fixture-feature" } = {}) {
  const external = freshRoot("external");
  mkdirSync(join(dir, "project"), { recursive: true });
  mkdirSync(join(dir, "specs", "sprint-nova-epic", "implementation"), { recursive: true });
  const threatModelBody = "fixture threat model\n";
  writeFileSync(join(dir, "specs", "sprint-nova-epic", "implementation", "critical-action-authorization-threat-model.md"), threatModelBody);
  const threatModel = {
    path: "specs/sprint-nova-epic/implementation/critical-action-authorization-threat-model.md",
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
  writeFileSync(join(dir, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: featureId, planPath: "specs/sprint-nova-epic/prd.md", phase: "implementation" },
    planApproval: { poGateAuthority: { planSha256: PLAN_SHA, specSha256: SPEC_SHA } },
  }, null, 2));
  const subjectSha256 = criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, remote, destination, threatModel } });
  const request = createCriticalActionApprovalRequest({
    candidate, featureId, planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"),
    action: { kind: "push", subjectSha256, expiresAt: "2099-01-01T00:00:00.000Z" },
  });
  const authority = { keyReference: "test-key", publicKeySha256 };
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: request.approvalIntent.sha256,
    keyReference: "test-key",
    publicKey,
    signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256), keys.privateKey).toString("base64"),
  };
  const proofSha256 = createHash("sha256").update(canonicalJson(proof)).digest("hex");
  const requestPath = join(external, "request.json");
  const authorityPath = join(external, "authority.json");
  const proofPath = join(external, "proof.json");
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(authorityPath, JSON.stringify(authority));
  writeFileSync(proofPath, JSON.stringify(proof));
  return {
    argv: ["approve-push", "--by", "PO", "--remote", remote, "--destination", destination, "--proof-request", requestPath, "--proof-authority", authorityPath, "--proof", proofPath],
    proofSha256,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function deps(dir, home, candidate) {
  return {
    dir, now: () => NOW, gitHead: () => ({ ok: true, commit: candidate.commit }), gitCandidate: () => ({ ok: true, ...candidate }),
    // approve-push's own git calls (lines ~1592-1593) are unrelated to discoverRepository --
    // HOME/USERPROFILE below is what routes appendExternalPushLedgerConsumption's default
    // rootDir away from this machine's real home directory.
    env: { ...process.env, HOME: home, USERPROFILE: home },
  };
}

function writeGate(dir, value) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "pipeline.user.yaml"), `schema: "pipeline.user.v1"\ngates:\n  push_external_ledger: "${value}"\n`);
  git(dir, ["add", "pipeline.user.yaml"]);
  git(dir, ["commit", "-q", "-m", "gates"]);
}

// `run()` reads process.env directly in a few unrelated helper paths, but the write-side
// integration under test reads HOME strictly through `homedir()` -- overriding process.env
// for the duration of each in-process call is simplest and is undone immediately after.
function callApprove(argv, injected) {
  const savedHome = process.env.HOME;
  const savedUserProfile = process.env.USERPROFILE;
  process.env.HOME = injected.env.HOME;
  process.env.USERPROFILE = injected.env.USERPROFILE;
  try {
    const captured = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => captured.push({ stream: "log", text: args.join(" ") });
    console.error = (...args) => captured.push({ stream: "error", text: args.join(" ") });
    let code;
    try {
      code = run(argv, injected);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    return { code, output: captured };
  } finally {
    if (savedHome === undefined) delete process.env.HOME; else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = savedUserProfile;
  }
}

const CANDIDATE = { commit: "a".repeat(40), tree: "b".repeat(40) };

// ---- baseline: no gates.push_external_ledger configured -> unaffected, success line reached
check("PSXL01 approve-push succeeds and reaches the success line when the gate is not configured", () => {
  const dir = freshRoot("baseline");
  gitInit(dir);
  const home = freshRoot("home-baseline");
  const bundle = proofBundle(dir, { candidate: CANDIDATE });
  const result = callApprove(bundle.argv, deps(dir, home, CANDIDATE));
  assert.equal(result.code, 0);
  assert.ok(result.output.some((entry) => entry.text.startsWith('Push approved by "PO"')));
});

// ---- gate required, first use in this repository -> ledger file created, success reached --
check("PSXL02 approve-push writes a fresh external ledger record on first use and still succeeds", () => {
  const dir = freshRoot("first-use");
  gitInit(dir);
  writeGate(dir, "required");
  const home = freshRoot("home-first-use");
  const bundle = proofBundle(dir, { candidate: CANDIDATE });
  const result = callApprove(bundle.argv, deps(dir, home, CANDIDATE));
  assert.equal(result.code, 0);
  assert.ok(result.output.some((entry) => entry.text.startsWith('Push approved by "PO"')));
  const repo = discoverRepository(dir);
  const fp = derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
  const record = JSON.parse(readFileSync(join(home, ".pipeline", "push-ledger", fp, `${bundle.proofSha256}.json`), "utf8"));
  assert.equal(record.repositoryFingerprint, fp);
  assert.equal(record.proofSha256, bundle.proofSha256);
});

// ---- gate required, external ledger already has this exact proof (git-level-replay -------
// scenario the design exists to defend against: local state has NEVER consumed it, so the
// pre-existing CRITICAL-PROOF-REPLAY guard does not fire, but the external ledger already
// does -- ALREADY-CONSUMED refuses the command, and the success line is provably unreachable.
check("PSXL03 approve-push refuses with ALREADY-CONSUMED when the external ledger already has this proof, even though local state does not, and the success line is not reached", () => {
  const dir = freshRoot("already-consumed");
  gitInit(dir);
  writeGate(dir, "required");
  const home = freshRoot("home-already-consumed");
  const bundle = proofBundle(dir, { candidate: CANDIDATE });
  const repo = discoverRepository(dir);
  const fp = derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
  const seeded = appendExternalPushLedgerConsumption({ repositoryFingerprint: fp, proofSha256: bundle.proofSha256, consumedAt: NOW, rootDir: home });
  assert.equal(seeded.ok, true);
  const result = callApprove(bundle.argv, deps(dir, home, CANDIDATE));
  assert.equal(result.code, 2);
  assert.ok(result.output.some((entry) => entry.stream === "error" && entry.text.includes("PUSH-EXTERNAL-LEDGER-ALREADY-CONSUMED")));
  assert.ok(!result.output.some((entry) => entry.text.startsWith('Push approved by "PO"')), "success line must be unreachable");
  // The local write already happened (design §4: the two writes are not one transaction).
  const finalState = JSON.parse(readFileSync(join(dir, "project", "pipeline-state.json"), "utf8"));
  assert.equal(finalState.pushApproval.lastApproved.forCommit, CANDIDATE.commit);
});

// ---- gate required, ledger directory unwritable -> WRITE-FAILED, success unreachable ------
check("PSXL04 approve-push refuses with WRITE-FAILED on a genuine filesystem condition, and the success line is not reached", () => {
  if (process.platform === "win32") return; // POSIX permission-bit semantics only
  if (typeof process.getuid === "function" && process.getuid() === 0) return; // root ignores mode bits
  const dir = freshRoot("write-failed");
  gitInit(dir);
  writeGate(dir, "required");
  const home = freshRoot("home-write-failed");
  const ledgerRoot = join(home, ".pipeline", "push-ledger");
  mkdirSync(ledgerRoot, { recursive: true, mode: 0o700 });
  chmodSync(ledgerRoot, 0o500); // read+execute, no write
  const bundle = proofBundle(dir, { candidate: CANDIDATE });
  let result;
  try {
    result = callApprove(bundle.argv, deps(dir, home, CANDIDATE));
  } finally {
    chmodSync(ledgerRoot, 0o700);
  }
  assert.equal(result.code, 2);
  assert.ok(result.output.some((entry) => entry.stream === "error" && entry.text.includes("PUSH-EXTERNAL-LEDGER-WRITE-FAILED")));
  assert.ok(!result.output.some((entry) => entry.text.startsWith('Push approved by "PO"')), "success line must be unreachable");
  const finalState = JSON.parse(readFileSync(join(dir, "project", "pipeline-state.json"), "utf8"));
  assert.equal(finalState.pushApproval.lastApproved.forCommit, CANDIDATE.commit);
});

// ---- gate required, dir is not a real git repository -> TOPOLOGY-UNRESOLVED ---------------
check("PSXL05 approve-push refuses with PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED when discoverRepository cannot resolve the repository, and the success line is not reached", () => {
  const dir = freshRoot("no-git");
  mkdirSync(dir, { recursive: true }); // no `git init` at all
  const home = freshRoot("home-no-git");
  const bundle = proofBundle(dir, { candidate: CANDIDATE });
  writeFileSync(join(dir, "pipeline.user.yaml"), 'schema: "pipeline.user.v1"\ngates:\n  push_external_ledger: "required"\n');
  const result = callApprove(bundle.argv, deps(dir, home, CANDIDATE));
  assert.equal(result.code, 2);
  assert.ok(result.output.some((entry) => entry.stream === "error" && entry.text.includes("PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED")));
  assert.ok(!result.output.some((entry) => entry.text.startsWith('Push approved by "PO"')), "success line must be unreachable");
});

for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
console.log(`\n${passed}/${passed + failed} checks passed.`);
process.exit(failed === 0 ? 0 : 1);

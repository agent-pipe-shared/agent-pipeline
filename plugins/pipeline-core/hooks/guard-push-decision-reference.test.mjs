#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-push-decision-reference.test.mjs — H-AC-12 read-side coverage for `guard-push.mjs`'s
 * additive `decisionReference` dual-evaluation in check (c) (approval).
 *
 * SIBLING FILE, NOT AN EDIT TO `guard-push.test.mjs` -- the same reason
 * `guard-push-external-ledger.test.mjs` and `guard-push-v2.test.mjs` are siblings:
 * `guard-push.test.mjs` is `.claude/guard-config.json` `protectedTestPaths` rule TP-5. A new
 * file exercises the exact same real `guard-push.mjs` binary end-to-end, and touches no
 * protected suite at all.
 *
 * Run: node plugins/pipeline-core/hooks/guard-push-decision-reference.test.mjs
 * Exit: 0 = all cases pass · 1 = at least one case failed.
 *
 * Hermetics: every case gets a fresh temp repository and a fresh temp HOME for the spawned
 * guard, so nothing reads or writes this machine's real home directory.
 */
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { criticalActionSha256, criticalActionSubjectSha256 } from "../lib/critical-action-approval-request.mjs";
import { createPoApprovalIntent } from "../lib/po-approval-proof.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";

const GUARD = fileURLToPath(new URL("./guard-push.mjs", import.meta.url));
const ALL_DIRS = [];

function freshRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `guard-push-decref-${prefix}-`));
  ALL_DIRS.push(dir);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  writeFileSync(join(dir, "README.md"), "fixture\n");
  git("add", "README.md");
  git("commit", "-q", "-m", "init");
  return dir;
}

function gitAt(dir, ...args) {
  return spawnSync("git", args, { cwd: dir, encoding: "utf8" });
}

function writeFile(dir, relPath, body) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, typeof body === "string" ? body : JSON.stringify(body));
}

const STATE_REL = ".claude/pipeline-state.json";

/** The repository fingerprint can only be derived once the repo exists, so cases that need a
 * reference bound to it rewrite the already-written state record in place. */
function readState(dir) {
  return JSON.parse(readFileSync(join(dir, STATE_REL), "utf8"));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const PUSH_CMD = "git push origin main:refs/heads/feature-test";
const THREAT_MODEL_REL = "specs/fixture/threat-model.md";
const REMOTE = "origin";
const DESTINATION = "refs/heads/feature-test";

function pushKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { publicPem, privateKey, publicKeySha256: createHash("sha256").update(publicPem).digest("hex") };
}

function fingerprintFor(dir) {
  const repo = discoverRepository(dir);
  return derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot });
}

/**
 * A repository whose recorded approval is backed by a real Ed25519 signature over the actual
 * push this suite issues (mirrors guard-push-external-ledger.test.mjs's `signedPushRepo`).
 * `decisionReference` is applied to the approval record only when the case asks for it -- the
 * `undefined` default is the regression witness for "absent leaves the record untouched".
 */
function signedPushRepo(prefix, { decisionReference, forCommitOverride } = {}) {
  const dir = freshRepo(prefix);
  const key = pushKeypair();

  // The threat model file must be committed, not merely written, BEFORE `head`/`tree` are
  // captured below: guard-push.mjs's "Methodological Agent Guard" check (VFX-GUARDS
  // reconciliation) blocks any push while specs/, docs/, or backlog/ carries an uncommitted
  // file -- a rule this fixture predates. Committing it here, ahead of the head/tree capture,
  // keeps `head` equal to the real final HEAD the guard subprocess resolves at push time.
  const threatModelBody = "# fixture threat model\n";
  writeFile(dir, THREAT_MODEL_REL, threatModelBody);
  gitAt(dir, "add", THREAT_MODEL_REL);
  gitAt(dir, "commit", "-q", "-m", "threat model");
  const threatModel = { path: THREAT_MODEL_REL, sha256: createHash("sha256").update(threatModelBody).digest("hex") };

  const head = gitAt(dir, "rev-parse", "HEAD").stdout.trim();
  const tree = gitAt(dir, "rev-parse", `${head}^{tree}`).stdout.trim();
  writeFile(dir, ".claude/pipeline.yaml", "schema: pipeline.manifest.v0\ngates:\n  push:\n    mode: blocking\n    type: human\n    approval: required\n");
  writeFile(dir, "evidence/verify-latest.json", { exitCode: 0, commit: head });

  writeFile(dir, "project/critical-human-proof.json", {
    schema: "pipeline.critical-human-proof-policy.v1",
    requiredKinds: ["push", "deploy", "publication"],
    trustAnchor: { keyReference: "po-key-1", publicKeySha256: key.publicKeySha256 },
  });

  const candidate = { commit: head, tree };
  const action = {
    kind: "push",
    subjectSha256: criticalActionSubjectSha256({ kind: "push", candidate, subject: { sourceCommit: candidate.commit, remote: REMOTE, destination: DESTINATION, threatModel } }),
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  const intent = createPoApprovalIntent({
    kind: "critical-action", featureId: "fixture-feature", planSha256: "c".repeat(64), specSha256: "d".repeat(64),
    candidate, policyRevision: "critical-human-proof-v1", subjectSha256: criticalActionSha256(action), decision: "approved",
  });
  const proof = {
    schema: "pipeline.po-approval-proof.v1",
    intentSha256: intent.sha256,
    keyReference: "po-key-1",
    publicKey: key.publicPem,
    signatureBase64: sign(null, Buffer.from(intent.sha256, "utf8"), key.privateKey).toString("base64"),
  };
  const proofSha256 = createHash("sha256").update(canonicalJson(proof)).digest("hex");
  const lastApproved = {
    approvedBy: "po-test", approvedAt: "2026-08-17T06:00:00.000Z", forCommit: forCommitOverride ?? head,
    criticalProof: { proofSha256, intentSha256: intent.sha256, action, proof },
    remote: REMOTE, destination: DESTINATION, threatModel,
  };
  if (decisionReference !== undefined) lastApproved.decisionReference = decisionReference;
  writeFile(dir, ".claude/pipeline-state.json", {
    schema: "pipeline.state.v0",
    activeFeature: { id: "fixture-feature" },
    planApproval: { poGateAuthority: { planSha256: "c".repeat(64), specSha256: "d".repeat(64) } },
    pushApproval: { lastApproved },
    criticalProofConsumption: [{ proofSha256, kind: "push", consumedAt: "2026-08-17T06:00:00.000Z" }],
  });
  return { dir, head, tree };
}

/** A well-formed `pipeline.human-decision-reference.v1` bound to the given candidate/repo. */
function reference({ commit, tree, fingerprint }) {
  return {
    schema: "pipeline.human-decision-reference.v1",
    decisionId: "DEC-PHX-HAC12-1",
    decisionDigest: "a".repeat(64),
    candidate: { commit, tree },
    checkpoint: {
      repositoryFingerprint: fingerprint,
      streamId: "human",
      sequence: 7,
      eventDigest: "b".repeat(64),
      candidateCommit: commit,
      candidateTree: tree,
    },
  };
}

function runGuard(dir, home) {
  const res = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: PUSH_CMD } }),
    encoding: "utf8",
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, HOME: home, USERPROFILE: home },
    timeout: 15000,
  });
  return { code: res.status, stderr: res.stderr ?? "" };
}

let pass = 0;
const failures = [];
const DISAGREEMENT = "Push approval decision reference disagrees with the recorded approval";
const ALLOW = 0, BLOCK = 2;

function check(id, dir, expectExit, { stderrIncludes = [], stderrExcludes = [] } = {}) {
  const home = mkdtempSync(join(tmpdir(), "guard-push-decref-home-"));
  ALL_DIRS.push(home);
  const { code, stderr } = runGuard(dir, home);
  const problems = [];
  if (code !== expectExit) problems.push(`exit ${code} (expected ${expectExit}) -- stderr: ${stderr.trim().slice(0, 500)}`);
  for (const needle of stderrIncludes) {
    if (!stderr.includes(needle)) problems.push(`stderr missing "${needle}" -- got: ${stderr.trim().slice(0, 500)}`);
  }
  for (const needle of stderrExcludes) {
    if (stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
  }
  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${problems.join("; ")}`);
    console.log(`FAIL  ${id} -- ${problems.join("; ")}`);
  }
}

// ---- GPDR01: absent decisionReference -> prior behavior, byte-for-byte (regression witness) --
{
  const { dir } = signedPushRepo("absent");
  check("GPDR01 allow  signed push, no decisionReference on the record at all", dir, ALLOW, {
    stderrExcludes: [DISAGREEMENT, "decision-reference"],
  });
}

// ---- GPDR02: present and agreeing -> the transition proceeds ---------------------------------
{
  const { dir, head, tree } = signedPushRepo("agreeing");
  const state = readState(dir);
  state.pushApproval.lastApproved.decisionReference = reference({ commit: head, tree, fingerprint: fingerprintFor(dir) });
  writeFile(dir, STATE_REL, state);
  check("GPDR02 allow  decisionReference present, bound to this exact candidate and repository", dir, ALLOW, {
    stderrExcludes: [DISAGREEMENT],
  });
}

// ---- GPDR03: present, bound to a DIFFERENT commit -> blocked, distinct reason ----------------
{
  const { dir, tree } = signedPushRepo("wrong-commit");
  const fingerprint = fingerprintFor(dir);
  const state = readState(dir);
  state.pushApproval.lastApproved.decisionReference = reference({ commit: "f".repeat(40), tree, fingerprint });
  writeFile(dir, STATE_REL, state);
  check("GPDR03 block  decisionReference bound to a different candidate commit", dir, BLOCK, {
    stderrIncludes: [DISAGREEMENT, "legacy=true, decision-reference=false", 'compatibility owner "pipeline"'],
  });
}

// ---- GPDR04: present, bound to a DIFFERENT tree -> blocked (the legacy record binds the -----
// commit only, so this is a disagreement only the second reader can see).
{
  const { dir, head } = signedPushRepo("wrong-tree");
  const fingerprint = fingerprintFor(dir);
  const state = readState(dir);
  state.pushApproval.lastApproved.decisionReference = reference({ commit: head, tree: "e".repeat(40), fingerprint });
  writeFile(dir, STATE_REL, state);
  check("GPDR04 block  decisionReference bound to a different candidate tree", dir, BLOCK, {
    stderrIncludes: [DISAGREEMENT],
  });
}

// ---- GPDR05: present but malformed -> fail closed, never a crash and never a silent ---------
// fallback to the legacy verdict alone.
{
  const { dir } = signedPushRepo("malformed", { decisionReference: {} });
  check("GPDR05 block  malformed decisionReference fails closed", dir, BLOCK, {
    stderrIncludes: [DISAGREEMENT, "legacy=true, decision-reference=false"],
  });
}

// ---- GPDR06: disagreement in the OTHER direction -- the legacy record is stale, the ---------
// reference resolves. Both failures must be reported; the reference must not rescue the push.
{
  const { dir, head, tree } = signedPushRepo("stale-legacy", { forCommitOverride: "1".repeat(40) });
  const fingerprint = fingerprintFor(dir);
  const state = readState(dir);
  state.pushApproval.lastApproved.decisionReference = reference({ commit: head, tree, fingerprint });
  writeFile(dir, STATE_REL, state);
  check("GPDR06 block  stale legacy record + resolving reference disagree in the other direction", dir, BLOCK, {
    stderrIncludes: ["Push approval missing or stale", DISAGREEMENT, "legacy=false, decision-reference=true"],
  });
}

for (const dir of ALL_DIRS) rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
process.exit(0);

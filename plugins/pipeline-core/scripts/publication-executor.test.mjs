#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  approvePublicationAuthority,
  authorizePublicationAuthority,
  preparePublicationAuthority,
  readPublicationAuthority,
} from "../lib/publication-authority.mjs";
import { publicationDigest } from "../lib/publication-bundle.mjs";
import {
  executePublication,
  parsePublicationExecutorCli,
  publicationRemoteFingerprint,
  publicationRepositoryFingerprint,
  validatePublicationExecutorResult,
} from "./publication-executor.mjs";

const roots = [];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
const oid = (root, value) => git(root, "rev-parse", value).stdout.trim();

function fixture(name, overrides = {}) {
  const parent = mkdtempSync(join(tmpdir(), `publication-executor-${name}-`));
  roots.push(parent);
  const remote = join(parent, "remote.git");
  const root = join(parent, "work");
  mkdirSync(root);
  assert.equal(git(parent, "init", "--bare", "--quiet", remote).status, 0);
  assert.equal(git(root, "init", "--quiet", "-b", "main").status, 0);
  git(root, "config", "user.email", "publication@example.invalid");
  git(root, "config", "user.name", "Publication Fixture");
  writeFileSync(join(root, "base.txt"), "base\n");
  git(root, "add", "base.txt");
  git(root, "commit", "--quiet", "-m", "base");
  const base = oid(root, "HEAD");
  git(root, "remote", "add", "origin", remote);
  assert.equal(git(root, "push", "--quiet", "origin", `${base}:refs/heads/main`).status, 0);
  writeFileSync(join(root, "candidate.txt"), "candidate\n");
  git(root, "add", "candidate.txt");
  git(root, "commit", "--quiet", "-m", "candidate");
  const candidate = oid(root, "HEAD");
  const tree = oid(root, "HEAD^{tree}");
  const common = realpathSync(join(root, ".git"));
  const evidenceDirectory = join(root, "evidence");
  mkdirSync(evidenceDirectory);
  const evidence = {};
  for (const [key, marker] of [["identityProbe", "identity"], ["verifyEvidence", "verify"], ["securityEvidence", "security"]]) {
    const path = `evidence/${marker}.json`;
    const bytes = `${JSON.stringify({ schema: `fixture.${marker}.v1`, commit: candidate, tree })}\n`;
    writeFileSync(join(root, path), bytes);
    evidence[key] = { path, rawDigest: digest(bytes), commit: candidate, tree };
  }
  const pushUrl = git(root, "remote", "get-url", "--push", "--all", "origin").stdout.trim();
  const input = {
    channel: "private",
    transactionId: `tx-${name}`,
    repositoryFingerprint: publicationRepositoryFingerprint({ root: realpathSync(root), common }),
    sourceCommit: candidate,
    sourceTree: tree,
    remoteFingerprint: publicationRemoteFingerprint("origin", [pushUrl]),
    remoteName: "origin",
    destinationRef: "refs/heads/main",
    remotePreimageOid: base,
    candidateOid: candidate,
    candidateTree: tree,
    ancestry: { baseOid: base, candidateOid: candidate, descends: true },
    ...evidence,
    ...overrides,
  };
  for (const key of ["identityProbe", "verifyEvidence", "securityEvidence"]) {
    input[key] = { ...input[key], commit: input.candidateOid, tree: input.candidateTree };
  }
  let authority = preparePublicationAuthority({ gitCommonDir: common, input });
  authority = approvePublicationAuthority({
    gitCommonDir: common,
    transactionId: input.transactionId,
    channel: input.channel,
    expectedRawSha256: authority.rawDigest,
    expectedRevision: 0,
    expectedStateSha256: publicationDigest(authority.record.publication),
    approvalId: `po-${name}`,
    attribution: "PO",
    approvedAt: 100,
    expiresAt: 1000,
  });
  authority = authorizePublicationAuthority({
    gitCommonDir: common,
    transactionId: input.transactionId,
    channel: input.channel,
    expectedRawSha256: authority.rawDigest,
    expectedRevision: 1,
    expectedStateSha256: publicationDigest(authority.record.publication),
    now: 110,
    command: ["git", "push", "--porcelain", "origin", `${input.candidateOid}:${input.destinationRef}`],
  });
  return { parent, remote, root: realpathSync(root), common, base, candidate, tree, input, authority };
}

function selection(value) {
  return {
    rootDir: value.root,
    transactionId: value.input.transactionId,
    channel: value.input.channel,
    expectedAuthorityRawSha256: value.authority.rawDigest,
  };
}

let tests = 0;
function check(name, fn) {
  fn();
  tests += 1;
  console.log(`PASS  ${name}`);
}

check("fixed executor consumes, pushes once, and closes on exact fresh readback", () => {
  const value = fixture("success");
  let pushes = 0;
  let alternatesDisabled = false;
  let consumedBeforePush = false;
  const runGit = (args, options) => {
    if (args[0] === "push") {
      pushes += 1;
      consumedBeforePush = readPublicationAuthority({
        gitCommonDir: value.common,
        transactionId: value.input.transactionId,
      }).record.status === "executing";
    }
    if (String(options.cwd).includes("pipeline-publication-readback-") && args[0] === "fetch") {
      alternatesDisabled = options.env.GIT_ALTERNATE_OBJECT_DIRECTORIES === "";
    }
    return spawnSync("git", args, { ...options, encoding: "utf8" });
  };
  const result = executePublication(selection(value), { now: () => 150, runGit });
  assert.equal(result.status, "closed");
  assert.equal(result.pushAttempted, true);
  assert.equal(pushes, 1);
  assert.equal(consumedBeforePush, true);
  assert.equal(alternatesDisabled, true);
  assert.equal(oid(value.remote, "refs/heads/main"), value.candidate);
  assert.equal(validatePublicationExecutorResult(result), true);
  assert.throws(() => executePublication({ ...selection(value), expectedAuthorityRawSha256: result.authorityRawSha256 }, { now: () => 160 }), /push-authorized|authority/u);
});

check("already-published authority converges without another push", () => {
  const value = fixture("prepublished");
  assert.equal(git(value.root, "push", "--quiet", "origin", `${value.candidate}:refs/heads/main`).status, 0);
  const result = executePublication(selection(value), { now: () => 150 });
  assert.equal(result.status, "closed");
  assert.equal(result.pushAttempted, false);
});

check("changed preimage consumes the stale tuple and requires a fresh plan", () => {
  const value = fixture("stale");
  git(value.root, "checkout", "--quiet", "-b", "other", value.base);
  writeFileSync(join(value.root, "other.txt"), "other\n");
  git(value.root, "add", "other.txt");
  git(value.root, "commit", "--quiet", "-m", "other");
  const other = oid(value.root, "HEAD");
  assert.equal(git(value.root, "push", "--quiet", "origin", `${other}:refs/heads/main`).status, 0);
  git(value.root, "checkout", "--quiet", "main");
  const result = executePublication(selection(value), { now: () => 150 });
  assert.equal(result.status, "reapproval-required");
  assert.equal(result.pushAttempted, false);
  assert.equal(oid(value.remote, "refs/heads/main"), other);
});

check("crash after consume never retries a push and converges to reapproval", () => {
  const value = fixture("crash-consume");
  assert.throws(() => executePublication(selection(value), {
    now: () => 150,
    faultInjector(point) { if (point === "after-authority-consumed") throw new Error("synthetic crash"); },
  }), /synthetic crash/u);
  value.authority = readPublicationAuthority({ gitCommonDir: value.common, transactionId: value.input.transactionId });
  assert.equal(value.authority.record.status, "executing");
  let pushes = 0;
  const runGit = (args, options) => {
    if (args[0] === "push") pushes += 1;
    return spawnSync("git", args, { ...options, encoding: "utf8" });
  };
  const recovered = executePublication(selection(value), { now: () => 160, runGit });
  assert.equal(recovered.status, "reapproval-required");
  assert.equal(pushes, 0);
});

check("crash after transport converges by readback without retry", () => {
  const value = fixture("crash-push");
  assert.throws(() => executePublication(selection(value), {
    now: () => 150,
    faultInjector(point) { if (point === "after-push-before-readback") throw new Error("synthetic crash"); },
  }), /synthetic crash/u);
  value.authority = readPublicationAuthority({ gitCommonDir: value.common, transactionId: value.input.transactionId });
  let pushes = 0;
  const runGit = (args, options) => {
    if (args[0] === "push") pushes += 1;
    return spawnSync("git", args, { ...options, encoding: "utf8" });
  };
  const recovered = executePublication(selection(value), { now: () => 160, runGit });
  assert.equal(recovered.status, "closed");
  assert.equal(pushes, 0);
});

check("ambiguous transport result closes only after candidate readback", () => {
  const value = fixture("ambiguous");
  let pushes = 0;
  const runGit = (args, options) => {
    const result = spawnSync("git", args, { ...options, encoding: "utf8" });
    if (args[0] === "push") {
      pushes += 1;
      return { ...result, status: 128, stderr: "synthetic ambiguous transport" };
    }
    return result;
  };
  const result = executePublication(selection(value), { now: () => 150, runGit });
  assert.equal(result.status, "closed");
  assert.equal(pushes, 1);
});

check("ambiguous transport with unchanged preimage requires reapproval and never retries", () => {
  const value = fixture("ambiguous-preimage");
  let pushes = 0;
  const runGit = (args, options) => {
    if (args[0] === "push") {
      pushes += 1;
      return { status: 128, stdout: "", stderr: "synthetic authentication ambiguity" };
    }
    return spawnSync("git", args, { ...options, encoding: "utf8" });
  };
  const result = executePublication(selection(value), { now: () => 150, runGit });
  assert.equal(result.status, "reapproval-required");
  assert.equal(pushes, 1);
  assert.equal(oid(value.remote, "refs/heads/main"), value.base);
});

for (const [name, overrides, expected] of [
  ["repository", { repositoryFingerprint: "0".repeat(64) }, /repository fingerprint/u],
  ["remote", { remoteFingerprint: "0".repeat(64) }, /remote fingerprint/u],
  ["ref", { destinationRef: "refs/heads/other" }, /destination/u],
  ["candidate", { candidateOid: "f".repeat(40), ancestry: { baseOid: null, candidateOid: "f".repeat(40), descends: true }, remotePreimageOid: null }, /Git observation/u],
  ["tree", { candidateTree: "f".repeat(40) }, /candidate tree/u],
]) {
  check(`wrong ${name} binding is rejected before effect`, () => {
    const value = fixture(`wrong-${name}`, overrides);
    assert.throws(() => executePublication(selection(value), { now: () => 150 }), expected);
    assert.equal(oid(value.remote, "refs/heads/main"), value.base);
  });
}

check("evidence drift and expired approval are rejected before effect", () => {
  const evidence = fixture("wrong-evidence");
  writeFileSync(join(evidence.root, evidence.input.identityProbe.path), "tampered\n");
  assert.throws(() => executePublication(selection(evidence), { now: () => 150 }), /evidence digest/u);
  assert.equal(oid(evidence.remote, "refs/heads/main"), evidence.base);
  const expired = fixture("expired");
  assert.throws(() => executePublication(selection(expired), { now: () => 1001 }), /expired/u);
  assert.equal(oid(expired.remote, "refs/heads/main"), expired.base);
});

check("wrong authority CAS and approval digest fail closed", () => {
  const stale = fixture("wrong-cas");
  assert.throws(() => executePublication({ ...selection(stale), expectedAuthorityRawSha256: "0".repeat(64) }, { now: () => 150 }), /stale/u);
  const approval = fixture("wrong-approval");
  const raw = JSON.parse(readFileSync(approval.authority.path, "utf8"));
  raw.publication.approval.tupleDigest = "0".repeat(64);
  raw.publication.pushIntent.tupleDigest = "0".repeat(64);
  const bytes = `${JSON.stringify(raw, null, 2)}\n`;
  writeFileSync(approval.authority.path, bytes, { mode: 0o600 });
  assert.throws(() => executePublication({
    ...selection(approval),
    expectedAuthorityRawSha256: digest(bytes),
  }, { now: () => 150 }), /approval tuple drift/u);
});

check("CLI exposes no force, delete, tag, merge, implicit-source, or extra-refspec surface", () => {
  const value = fixture("closed-cli");
  for (const [flag, argument] of [
    ["--force", "true"],
    ["--delete", "refs/heads/main"],
    ["--tag", "v1.0.0"],
    ["--merge", "feature"],
    ["--refspec", `${value.candidate}:refs/heads/other`],
    ["--source", "HEAD"],
    ["--additional-refspec", `${value.candidate}:refs/tags/v1`],
  ]) {
    assert.throws(() => parsePublicationExecutorCli([
      "execute",
      "--root", value.root,
      "--transaction-id", value.input.transactionId,
      "--channel", value.input.channel,
      "--expected-authority-sha256", value.authority.rawDigest,
      flag, argument,
    ]), /fixed authority-selection flags/u);
  }
  assert.equal(oid(value.remote, "refs/heads/main"), value.base);
});

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`publication-executor: ${tests} tests passed`);

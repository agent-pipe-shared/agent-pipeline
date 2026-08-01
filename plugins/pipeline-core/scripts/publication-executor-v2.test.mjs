#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReleasePreflight } from "./release-preflight.mjs";
import { readPublicationAuthority } from "../lib/publication-authority.mjs";
import {
  applyPublicationAuthorization, executePublication, parseProductivePublicationCli,
  planPublicationAuthorization, preflightPublication, preparePublicationTransaction,
  readbackPublication,
} from "./publication-executor.mjs";

const roots = []; const h = (value) => createHash("sha256").update(value).digest("hex");
const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
const oid = (root, ref) => git(root, "rev-parse", ref).stdout.trim();

function releaseRecord(capability) {
  const digest = (c) => c.repeat(64); const candidate = capability.candidate;
  const documentation = { prd: { path: "evidence/prd.json", sha256: digest("1") }, spec: { path: "evidence/spec.json", sha256: digest("2") }, acceptance: { path: "evidence/acceptance.json", sha256: digest("3") }, result: { path: "evidence/result.json", sha256: digest("4") } };
  return createReleasePreflight({
    preflightId: "nova-release", candidate, base: { commit: capability.remotePreimage, tree: "b".repeat(40) },
    version: { decisionId: digest("5"), decisionSha256: digest("6"), targetVersion: "0.4.8", candidateVersion: "0.4.8" },
    repository: { headCommit: candidate.commit, headTree: candidate.tree, clean: true }, documentation,
    lifecycle: { featureId: "sprint-nova-epic", manifestPath: "specs/nova/lifecycle.json", manifestSha256: digest("7"), status: "prepared" },
    retention: { policySha256: digest("8"), records: Object.values(documentation).map((value) => ({ path: value.path, classification: "public", retentionClass: "active", archiveDigest: null, archiveProvenanceSha256: null })).sort((a, b) => a.path.localeCompare(b.path)) },
    consent: { decisionId: digest("9"), status: "approved", authoritySha256: digest("a"), evaluatedAt: "2026-08-01T10:00:00.000Z", expiresAt: "2026-08-02T10:00:00.000Z" },
    gates: { gg03: { required: true, binding: { schema: "pipeline.gg-03-binding.v1", operation: "protected-main-fast-forward", candidateCommit: candidate.commit, candidateTree: candidate.tree, authoritySha256: digest("c"), evidenceSha256: digest("d") } }, inventory: [{ id: "verify", kind: "local-final", status: "pending" }, { id: "security", kind: "local-final", status: "pending" }, { id: "critic", kind: "local-final", status: "pending" }, { id: "remote", kind: "external", status: "pending" }, { id: "human", kind: "external", status: "pending" }] },
    extensions: { schema: "pipeline.release-preflight-extension-input.v1", status: "registered", registrySha256: digest("e"), requirements: [{ id: "publication-capability-preflight", sha256: capability.recordSha256, status: "accepted" }] },
  });
}

function fixture(name, destinationRef = "refs/heads/release/nova", options = {}) {
  const parent = mkdtempSync(join(tmpdir(), `publication-v2-${name}-`)); roots.push(parent);
  const remote = join(parent, "remote.git"); const root = join(parent, "work"); mkdirSync(root);
  assert.equal(git(parent, "init", "--bare", "--quiet", remote).status, 0);
  assert.equal(git(root, "init", "--quiet", "-b", "main").status, 0);
  git(root, "config", "user.email", "publication@example.invalid"); git(root, "config", "user.name", "Publication Fixture");
  writeFileSync(join(root, "base.txt"), "base\n"); git(root, "add", "base.txt"); git(root, "commit", "--quiet", "-m", "base");
  const base = oid(root, "HEAD"); assert.equal(git(root, "remote", "add", "origin", remote).status, 0);
  assert.equal(git(root, "push", "--quiet", "origin", `${base}:${destinationRef}`).status, 0);
  writeFileSync(join(root, "candidate.txt"), "candidate\n"); git(root, "add", "candidate.txt"); git(root, "commit", "--quiet", "-m", "candidate");
  const candidate = oid(root, "HEAD"); const tree = oid(root, "HEAD^{tree}"); const physical = realpathSync(root);
  const capability = preflightPublication({ rootDir: physical, preflightId: `pf-${name}`, candidateOid: candidate, remoteName: "origin", destinationRef });
  assert.equal(capability.status, "ready");
  mkdirSync(join(root, "evidence"));
  for (const kind of ["identity", "verify", "security", "critic"]) writeFileSync(join(root, `evidence/${kind}.json`), `${JSON.stringify({ schema: "pipeline.publication-gate-evidence.v1", gate: kind, candidate: { commit: candidate, tree }, status: options.failedGate === kind ? "failed" : "passed", exitCode: options.failedGate === kind ? 1 : 0 })}\n`);
  writeFileSync(join(root, "evidence/preflight.json"), `${JSON.stringify(capability)}\n`);
  writeFileSync(join(root, "evidence/release.json"), `${JSON.stringify(releaseRecord(capability))}\n`);
  const authority = preparePublicationTransaction({ rootDir: physical, transactionId: `tx-${name}`, channel: "private", preflightPath: "evidence/preflight.json", identityPath: "evidence/identity.json", verifyPath: "evidence/verify.json", securityPath: "evidence/security.json", criticPath: "evidence/critic.json", releasePreflightPath: "evidence/release.json" });
  const plan = planPublicationAuthorization({ rootDir: physical, transactionId: `tx-${name}`, channel: "private", expectedAuthorityRawSha256: authority.rawDigest, approvalId: `po-${name}`, attribution: "PO", approvedAt: 100, expiresAt: 1000 });
  let reference; let applyError = null;
  try {
    reference = applyPublicationAuthorization({ rootDir: physical, transactionId: `tx-${name}`, channel: "private", expectedAuthorityRawSha256: authority.rawDigest, approvalId: `po-${name}`, attribution: "PO", approvedAt: 100, expiresAt: 1000, planSha256: plan.planSha256, activate: true }, { now: () => options.applyNow ?? 150, faultInjector: options.activationFault });
  } catch (error) {
    if (!options.allowApplyFailure) throw error;
    applyError = error;
  }
  return { parent, remote, root: physical, common: realpathSync(join(root, ".git")), base, candidate, tree, capability, authority, plan, reference, destinationRef, applyError };
}
const selection = (value) => ({ rootDir: value.root, transactionId: value.reference.transactionId, channel: value.reference.channel, expectedAuthorityRawSha256: value.reference.projectionRawSha256 });
let passed = 0; const check = (name, run) => { run(); passed += 1; console.log(`PASS ${name}`); };

check("CLI exposes exactly the closed productive operation set", () => {
  const root = "/physical/repository"; const sha = "a".repeat(64);
  assert.equal(parseProductivePublicationCli(["preflight", "--root", root, "--preflight-id", "pf", "--candidate", "b".repeat(40), "--remote-name", "origin", "--destination-ref", "refs/heads/release/nova"]).operation, "preflight");
  assert.equal(parseProductivePublicationCli(["prepare", "--root", root, "--transaction-id", "tx", "--channel", "private", "--preflight", "p.json", "--identity", "i.json", "--verify", "v.json", "--security", "s.json", "--critic", "c.json", "--release-preflight", "r.json"]).operation, "prepare");
  const authorization = ["--root", root, "--transaction-id", "tx", "--channel", "private", "--expected-authority-sha256", sha, "--approval-id", "po", "--attribution", "PO", "--approved-at", "100", "--expires-at", "1000"];
  assert.equal(parseProductivePublicationCli(["authorize-plan", ...authorization]).operation, "authorize-plan");
  assert.equal(parseProductivePublicationCli(["authorize-apply", ...authorization, "--plan-sha256", sha, "--activate"]).input.activate, true);
  assert.equal(parseProductivePublicationCli(["readback", "--root", root, "--transaction-id", "tx", "--channel", "private", "--expected-authority-sha256", sha]).operation, "readback");
  assert.throws(() => parseProductivePublicationCli(["push", "--root", root]), /unknown publication operation/u);
});

check("productive v2 preflight/prepare/plan/apply/execute publishes a non-main exact ref without force", () => {
  const value = fixture("success"); let pushArgs;
  const runGit = (args, options) => { if (args[0] === "push") pushArgs = args; return spawnSync("git", args, { ...options, encoding: "utf8" }); };
  const result = executePublication(selection(value), { now: () => 150, runGit });
  assert.equal(result.status, "closed"); assert.equal(result.destinationRef, value.destinationRef);
  assert.equal(pushArgs.some((arg) => arg.startsWith("--force")), false);
  assert.equal(oid(value.remote, value.destinationRef), value.candidate);
});

check("already-published v2 converges without a second push and fresh readback remains closed", () => {
  const value = fixture("published"); assert.equal(git(value.root, "push", "--quiet", "origin", `${value.candidate}:${value.destinationRef}`).status, 0);
  let pushes = 0; const runGit = (args, options) => { if (args[0] === "push") pushes += 1; return spawnSync("git", args, { ...options, encoding: "utf8" }); };
  const result = executePublication(selection(value), { now: () => 150, runGit }); assert.equal(result.status, "closed"); assert.equal(pushes, 0);
  assert.equal(readbackPublication({ ...selection(value), expectedAuthorityRawSha256: result.authorityRawSha256 }, { now: () => 160 }).status, "closed");
});

check("authorization apply uses the actual clock and remains atomic/retry-safe", () => {
  const expired = fixture("apply-expired", "refs/heads/release/nova", { applyNow: 1001, allowApplyFailure: true });
  assert.match(expired.applyError.message, /not active at apply time/u);
  assert.equal(readPublicationAuthority({ gitCommonDir: expired.common, transactionId: "tx-apply-expired" }).record.publication.phase, "prepared");
  const interrupted = fixture("apply-atomic", "refs/heads/release/nova", { allowApplyFailure: true, activationFault(point) { if (point === "before-authorization-durable-replace") throw new Error("synthetic activation crash"); } });
  assert.match(interrupted.applyError.message, /synthetic activation crash/u);
  assert.equal(readPublicationAuthority({ gitCommonDir: interrupted.common, transactionId: "tx-apply-atomic" }).record.publication.phase, "prepared");
  const reference = applyPublicationAuthorization({ rootDir: interrupted.root, transactionId: "tx-apply-atomic", channel: "private", expectedAuthorityRawSha256: interrupted.authority.rawDigest, approvalId: "po-apply-atomic", attribution: "PO", approvedAt: 100, expiresAt: 1000, planSha256: interrupted.plan.planSha256, activate: true }, { now: () => 150 });
  assert.equal(reference.phase, "push-authorized");
  assert.throws(() => applyPublicationAuthorization({ rootDir: interrupted.root, transactionId: "tx-apply-atomic", channel: "private", expectedAuthorityRawSha256: interrupted.authority.rawDigest, approvalId: "po-apply-atomic", attribution: "PO", approvedAt: 100, expiresAt: 1000, planSha256: interrupted.plan.planSha256, activate: true }, { now: () => 150 }), /stale|prepared/u);
});

check("prepare rejects failed gate outcomes, missing capability extension, and escaped preflight paths", () => {
  for (const gate of ["identity", "verify", "security", "critic"]) assert.throws(() => fixture(`failed-${gate}`, "refs/heads/release/nova", { failedGate: gate }), new RegExp(`${gate} evidence did not pass`, "iu"));
  const value = fixture("prepare-denials");
  const input = { rootDir: value.root, transactionId: "tx-escape", channel: "private", preflightPath: "../outside.json", identityPath: "evidence/identity.json", verifyPath: "evidence/verify.json", securityPath: "evidence/security.json", criticPath: "evidence/critic.json", releasePreflightPath: "evidence/release.json" };
  assert.throws(() => preparePublicationTransaction(input), /path is invalid|escaped/u);
  const bound = releaseRecord(value.capability); const unbound = { ...bound, extensions: { schema: "pipeline.release-preflight-extension-input.v1", status: "none", registrySha256: null, requirements: [] } };
  writeFileSync(join(value.root, "evidence/unbound-release.json"), `${JSON.stringify(createReleasePreflight({ preflightId: unbound.preflightId, candidate: unbound.candidate, base: unbound.base, version: unbound.version, repository: unbound.repository, documentation: unbound.documentation, lifecycle: unbound.lifecycle, retention: unbound.retention, consent: unbound.consent, gates: unbound.gates, extensions: unbound.extensions }))}\n`);
  assert.throws(() => preparePublicationTransaction({ ...input, transactionId: "tx-unbound", preflightPath: "evidence/preflight.json", releasePreflightPath: "evidence/unbound-release.json" }), /not bound/u);
});

check("stale preflight and stale execution preimage reject before publication", () => {
  const value = fixture("stale");
  git(value.root, "checkout", "--quiet", "-b", "other", value.base); writeFileSync(join(value.root, "other.txt"), "other\n"); git(value.root, "add", "other.txt"); git(value.root, "commit", "--quiet", "-m", "other");
  const other = oid(value.root, "HEAD"); git(value.root, "push", "--quiet", "origin", `${other}:${value.destinationRef}`); git(value.root, "checkout", "--quiet", "main");
  const result = executePublication(selection(value), { now: () => 150 }); assert.equal(result.status, "reapproval-required"); assert.equal(result.pushAttempted, false);
});

check("non-local provider read access remains typed unavailable without authoritative write and policy observations", () => {
  const value = fixture("non-local");
  const runGit = (args, options) => {
    if (args[0] === "remote" && args[1] === "get-url") return { status: 0, stdout: "https://example.invalid/owner/repository.git\n", stderr: "" };
    if (args[0] === "ls-remote") return { status: 0, stdout: `${value.base}\t${value.destinationRef}\n`, stderr: "" };
    return spawnSync("git", args, { ...options, encoding: "utf8" });
  };
  const result = preflightPublication({ rootDir: value.root, preflightId: "pf-network", candidateOid: value.candidate, remoteName: "origin", destinationRef: value.destinationRef }, { runGit });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.reasons, ["credentials-unavailable", "ref-permission-insufficient", "repository-policy-rejected"]);
});

check("ambiguous post-push transport converges only through fresh readback", () => {
  const value = fixture("ambiguous"); let pushes = 0;
  const runGit = (args, options) => { const result = spawnSync("git", args, { ...options, encoding: "utf8" }); if (args[0] === "push") { pushes += 1; return { ...result, status: 128, stderr: "sanitized synthetic ambiguity" }; } return result; };
  const result = executePublication(selection(value), { now: () => 150, runGit }); assert.equal(result.status, "closed"); assert.equal(pushes, 1);
});

check("replay, expiry, arbitrary refspec, force and missing activation are denied", () => {
  const value = fixture("denied");
  assert.throws(() => applyPublicationAuthorization({ rootDir: value.root, transactionId: value.reference.transactionId, channel: "private", expectedAuthorityRawSha256: value.authority.rawDigest, approvalId: "different", attribution: "PO", approvedAt: 100, expiresAt: 1000, planSha256: value.plan.planSha256, activate: false }), /activated plan/u);
  for (const extra of [["--force", "true"], ["--refspec", "x:y"], ["--delete", value.destinationRef]]) assert.throws(() => parseProductivePublicationCli(["readback", "--root", value.root, "--transaction-id", value.reference.transactionId, "--channel", "private", "--expected-authority-sha256", value.reference.projectionRawSha256, ...extra]), /fixed closed flags/u);
  assert.throws(() => executePublication(selection(value), { now: () => 1001 }), /expired/u);
  const closed = executePublication(selection(value), { now: () => 150 }); assert.equal(closed.status, "closed");
  assert.throws(() => executePublication(selection(value), { now: () => 160 }), /stale/u);
});

for (const root of roots) rmSync(root, { recursive: true, force: true });
console.log(`publication-executor-v2: ${passed} tests passed`);

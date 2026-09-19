// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCriticalActionApprovalRequest } from "../lib/critical-action-approval-request.mjs";
import { readLocalRepositoryFingerprint } from "../lib/governance-event-store.mjs";
import { createGovernanceExportOutbox } from "../lib/governance-export-outbox.mjs";
import { pushBatchMemberId, pushBatchSubjectSha256 } from "../lib/push-batch-contract.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { run } from "./push-batch-executor.mjs";

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const sha = (value) => createHash("sha256").update(value).digest("hex");
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value)}\n`);

const cases = [{ id: "PBE01", name: "executes the fixed local Git batch, journals both facts externally, and persists its outbox projection", run: async () => {
  const parent = mkdtempSync(join(tmpdir(), "push-batch-executor-")); const repo = join(parent, "repo"); const remote = join(parent, "remote.git"); const external = join(parent, "external");
  git(parent, ["init", "-q", repo]); git(repo, ["config", "user.email", "test@example.invalid"]); git(repo, ["config", "user.name", "Test"]); writeFileSync(join(repo, "file.txt"), "candidate\n"); git(repo, ["add", "file.txt"]); git(repo, ["commit", "-qm", "candidate"]); git(parent, ["init", "--bare", "-q", remote]); git(repo, ["remote", "add", "origin", remote]);
  const candidate = { commit: git(repo, ["rev-parse", "HEAD"]), tree: git(repo, ["rev-parse", "HEAD^{tree}"]) }; const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: repo }); const endpointSha256 = sha(remote);
  const started = new Date(Date.now() - 60_000).toISOString(); const expires = new Date(Date.now() + 3_600_000).toISOString(); const subject = { schema: "pipeline.push-batch-subject.v2", repository: { fingerprint, objectFormat: "sha1" }, candidate, authority: { featureId: "nova", planSha256: sha("plan"), specSha256: sha("spec") }, policy: { manifestSha256: sha("manifest"), proofPolicySha256: sha("proof-policy"), destinationPolicySha256: sha("destination-policy") }, threatModel: { path: "model.json", sha256: sha("model") }, previewBindingSha256: sha("preview"), nonce: "fixture", createdAt: started, expiresAt: expires, ordering: "listed-stop-on-non-success", destinations: [] };
  const member = { remote: "origin", endpointSha256, transportPolicySha256: sha("transport"), destinationRef: "refs/heads/test", expectedRemoteCommit: null, sourceCommit: candidate.commit, sourceTree: candidate.tree }; subject.destinations.push({ ordinal: 0, memberId: pushBatchMemberId({ repositoryFingerprint: fingerprint, member }), ...member });
  const action = { kind: "push", subjectSha256: pushBatchSubjectSha256(subject), expiresAt: subject.expiresAt }; const request = createCriticalActionApprovalRequest({ candidate, featureId: "nova", planBytes: Buffer.from("plan"), specBytes: Buffer.from("spec"), action }); const pair = generateKeyPairSync("ed25519"); const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }); const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "fixture", publicKey, signatureBase64: sign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), pair.privateKey).toString("base64") }; const trust = { keyReference: "fixture", publicKeySha256: sha(publicKey) };
  const paths = { subject: join(external, "subject.json"), request: join(external, "request.json"), trust: join(external, "trust.json"), proof: join(external, "proof.json"), outbox: join(external, "outbox.json"), profile: join(external, "profile.json"), journal: join(external, "journal") }; mkdirSync(external, { recursive: true }); json(paths.subject, subject); json(paths.request, request); json(paths.trust, trust); json(paths.proof, proof); json(paths.outbox, createGovernanceExportOutbox({ destinationProfile: "governance", policyRevision: sha("policy") })); json(paths.profile, { destinationProfile: "governance", policyRevision: sha("policy") });
  const result = await run(["--repo-root", repo, "--subject", paths.subject, "--request", paths.request, "--trust-policy", paths.trust, "--proof", paths.proof, "--journal-root", paths.journal, "--outbox", paths.outbox, "--export-profile", paths.profile]);
  assert.equal(result.status, "readback-verified"); assert.equal(git(repo, ["ls-remote", "--refs", "origin", "refs/heads/test"]).split(/\s+/u)[0], candidate.commit); const journalPath = join(paths.journal, `${action.subjectSha256}.ndjson`); assert.equal(existsSync(journalPath), true); assert.deepEqual(readFileSync(journalPath, "utf8").trim().split("\n").map((line) => JSON.parse(line).state), ["attempted", "readback-verified"]); assert.equal(JSON.parse(readFileSync(paths.outbox, "utf8")).entries.length, 1);
} }];
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

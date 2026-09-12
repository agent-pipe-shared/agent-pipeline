#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { admitCredentialLeaseUse, createAssumptionSet, createCredentialLease, evaluateLeaseAssumptions, revokeSyntheticCredentialLease, validateCredentialLease } from "./credential-lease.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const cases = [];
const injectedFailure = process.env.PIPELINE_CLS_TEST_INJECT_FAILURE ?? "";
const selfProbeChild = process.env.PIPELINE_CLS_TEST_SELF_PROBE_CHILD === "1";
function check(name, run) {
  const id = `CLS${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({
    id,
    name,
    run() {
      if (injectedFailure === id) assert.fail("intentional credential lease case-completion failure");
      return run();
    },
  });
}

const assumptions = createAssumptionSet({ assumptionSetId: "set", subjectSha256: A, assumptions: [{ name: "scope", value: "synthetic", source: "test" }], issuedBy: "test", issuedAt: 0, expiresAt: 100, stopConditions: ["authority-drift"], escalation: "po-gate", forbiddenAuthorities: ["approval", "credential-issuance", "delegation", "external-mutation", "merge", "release"] });
const lease = (issuedAt = 0, expiresAt = 200, disposition = "paused") => createCredentialLease({ leaseId: "lease", broker: "fake", subjectSha256: A, repository: B, operations: ["read"], targets: [A], issuedAt, expiresAt, revocationHandleSha256: B, credentialClass: { kind: "synthetic", assumptions, assumptionDisposition: disposition }, status: "active", readbackSha256: B });

check("creates a closed exact-root, secret-free active lease", () => {
  assert.equal(validateCredentialLease(lease()).ok, true);
  assert.throws(() => lease(-1), /BOUND:lease/);
  assert.throws(() => lease(10, 10), /BOUND:lease/);
  assert.equal(JSON.stringify(lease()).includes("secret"), false);
  assert.deepEqual(Object.keys(lease()).sort(), ["broker", "credentialClass", "expiresAt", "issuedAt", "leaseId", "operations", "readbackSha256", "recordSha256", "repository", "revocationHandleSha256", "schema", "status", "subjectSha256", "targets"]);
});

check("admits only an active lease within its issued interval and exact scope", () => {
  const use = { subjectSha256: A, repository: B, operations: ["read"], targets: [A], atMs: 1 };
  assert.equal(admitCredentialLeaseUse(lease(), use).ok, true);
  assert.equal(admitCredentialLeaseUse(lease(), { ...use, atMs: -1 }).code, "SHAPE:lease-use");
  assert.equal(admitCredentialLeaseUse(lease(10), use).code, "UNAVAILABLE:lease");
  assert.equal(admitCredentialLeaseUse(lease(), { ...use, operations: ["write"] }).code, "AUTHORITY:lease-scope");
  assert.equal(admitCredentialLeaseUse(lease(), { ...use, atMs: 200 }).code, "UNAVAILABLE:lease");
});

check("binds assumption disposition in the admitted lease", () => {
  assert.equal(evaluateLeaseAssumptions(lease(0, 200, "failed"), { atMs: 1, observedStopConditions: ["authority-drift"], expiryDisposition: "paused" }).disposition, "failed");
  assert.equal(evaluateLeaseAssumptions(lease(), { atMs: 100, observedStopConditions: [] }).disposition, "paused");
});

check("revokes deterministically and denies unrelated repository, credential, home, SSH and global-Git canaries", () => {
  for (const reason of ["success", "failure", "cancellation", "timeout", "recovery"]) {
    const revoked = revokeSyntheticCredentialLease(lease(), reason).lease;
    assert.equal(revoked.status, "revoked");
    assert.equal(validateCredentialLease(revoked).ok, true);
  }
  for (const operation of ["read-other-repository", "read-credential", "read-home", "read-ssh", "read-global-git"]) {
    assert.equal(admitCredentialLeaseUse(lease(), { subjectSha256: A, repository: B, operations: [operation], targets: [A], atMs: 1 }).code, "AUTHORITY:lease-scope");
  }
});

check("an early failed case still emits dispositions for the complete declared corpus", () => {
  if (selfProbeChild) return;
  const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    encoding: "utf8",
    env: {
      ...process.env,
      PIPELINE_CLS_TEST_INJECT_FAILURE: "CLS02",
      PIPELINE_CLS_TEST_SELF_PROBE_CHILD: "1",
      PIPELINE_VERIFY_CASE_COMPLETION_FD: "3",
      PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: "65536",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
  assert.notEqual(probe.status, 0, "the injected early case must fail");
  const records = String(probe.output[3]).trim().split("\n").map((line) => JSON.parse(line));
  const disposed = records.filter((record) => record.event === "DISPOSED");
  assert.equal(records[0].event, "DECLARED");
  assert.equal(records[0].caseCount, 5);
  assert.equal(disposed.length, 5);
  assert.equal(disposed.find((record) => record.id === "CLS02")?.disposition, "fail");
  assert.equal(disposed.find((record) => record.id === "CLS05")?.disposition, "pass");
  assert.deepEqual(records.at(-1).counts, { pass: 4, fail: 1, skip: 0, todo: 0 });
});

assert.equal(cases.length, 5, "the complete credential lease corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

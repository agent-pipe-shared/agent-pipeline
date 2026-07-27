#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXTERNAL_MUTATION_SCHEMA,
  GITLAB_FORGE_ADAPTER_VERSION,
  confirmExternalMutation,
  createExternalMutationRequest,
  expireExternalMutation,
  externalMutationDigest,
  mapGitLabForgeObservation,
  previewExternalMutation,
  reconcileExternalMutationRetry,
  recordExternalMutationOutcome,
  rejectExternalMutation,
  resolveGitLabTarget,
  validateExternalMutation,
  verifyExternalMutationReadback,
} from "./gitlab-forge-adapter.mjs";
import {
  hasObservedReadOnlyCapability,
  validateForgeCapabilityReport,
} from "../lib/forge-capability.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const clone = (value) => structuredClone(value);
const evidence = (kind, digest = A) => ({ kind, path: null, fileSha256: digest, recordSha256: null });

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name} -- ${error.message}`);
  }
}

const gitlabCom = resolveGitLabTarget({
  baseUrl: "https://gitlab.com",
  projectPath: "agent-pipeline/example",
  authenticationMode: "operator-local",
});
const selfManaged = resolveGitLabTarget({
  baseUrl: "https://forge.example.test",
  projectPath: "platform/agent-pipeline/example",
  authenticationMode: "credential-lease",
});

function observed(mode = "native") {
  return { mode, status: "observed", evidence: [evidence("synthetic-readback")] };
}

function unavailable() {
  return { mode: "unavailable", status: "unavailable", evidence: [] };
}

function gitlabObservation(target = gitlabCom.target) {
  return {
    reportId: "gitlab-synthetic-01",
    target,
    observations: {
      issuesRead: observed(),
      issuesWrite: { mode: "manual", status: "not-observed", evidence: [] },
      jobsRead: observed(),
      mergeRequestsRead: observed(),
      mergeRequestsWrite: unavailable(),
      pipelinesRead: observed(),
      pipelinesRetry: unavailable(),
      protectedBranchesRead: observed("emulated"),
    },
    governance: [
      { controlId: "approval-policy", mode: "emulated", status: "observed", tier: "advanced", evidence: [evidence("synthetic-governance", B)] },
    ],
    evidence: [evidence("synthetic-report", C)],
  };
}

function requestInput(target = gitlabCom.target) {
  return {
    mutationId: "gitlab-issue-update-01",
    provider: "gitlab",
    target: {
      provider: "gitlab",
      baseUrlClass: target.baseUrlClass,
      projectCoordinatesSha256: target.projectCoordinatesSha256,
      objectType: "issue",
      objectIdSha256: A,
    },
    beforeSha256: B,
    patch: { format: "merge-patch-sha256", patchSha256: C, expectedPostSha256: C },
    operation: "issue.update-content",
    idempotencyKey: D,
    capabilitySha256: A,
  };
}

check("B4G01 GitLab.com and explicit Self-Managed targets resolve distinctly", () => {
  assert.equal(gitlabCom.ok, true);
  assert.equal(gitlabCom.target.baseUrlClass, "gitlab-com");
  assert.equal(selfManaged.ok, true);
  assert.equal(selfManaged.target.baseUrlClass, "self-managed");
  assert.notEqual(gitlabCom.target.projectCoordinatesSha256, selfManaged.target.projectCoordinatesSha256);
  assert.equal(Object.isFrozen(gitlabCom.target), true);
});

check("B4G02 target resolution is deterministic and privacy-safe", () => {
  const replay = resolveGitLabTarget({
    baseUrl: "https://gitlab.com",
    projectPath: "agent-pipeline/example",
    authenticationMode: "operator-local",
  });
  assert.deepEqual(replay, gitlabCom);
  assert.doesNotMatch(JSON.stringify(replay.target), /agent-pipeline|example\.test|https:/u);
});

check("B4G03 ambiguous, non-canonical, insecure, or local hosts fail closed", () => {
  for (const baseUrl of [
    "http://gitlab.com",
    "https://gitlab.com/",
    "https://gitlab.com/path",
    "https://user@gitlab.com",
    "https://gitlab.com?token=x",
    "https://localhost",
    "https://127.0.0.1",
    "https://forge.local",
  ]) {
    assert.equal(resolveGitLabTarget({ baseUrl, projectPath: "group/project", authenticationMode: "none" }).ok, false, baseUrl);
  }
});

check("B4G04 project coordinates are explicit and never normalized or inferred", () => {
  for (const projectPath of [
    "project",
    "/group/project",
    "group/project/",
    "group//project",
    "group/../project",
    "group/%70roject",
    `group/${"a".repeat(507)}`,
  ]) {
    assert.equal(resolveGitLabTarget({ baseUrl: "https://gitlab.com", projectPath, authenticationMode: "none" }).ok, false, projectPath);
  }
});

check("B4G05 target input cannot carry a token or credential", () => {
  assert.equal(resolveGitLabTarget({
    baseUrl: "https://gitlab.com",
    projectPath: "group/project",
    authenticationMode: "operator-local",
    token: "forbidden",
  }).ok, false);
});

const capability = mapGitLabForgeObservation(gitlabObservation());

check("B4G06 GitLab extension maps to the common neutral contract", () => {
  assert.deepEqual(validateForgeCapabilityReport(capability), { ok: true, code: null });
  assert.equal(capability.provider, "gitlab");
  assert.equal(capability.baseUrlClass, "gitlab-com");
  assert.doesNotMatch(JSON.stringify(capability.cells), /merge|pipeline_id|gitlab/iu);
});

check("B4G07 read-only capability is observed without claiming issue closure", () => {
  assert.equal(hasObservedReadOnlyCapability(capability), true);
  assert.equal(Object.hasOwn(capability, "issueClosed"), false);
});

check("B4G08 weaker and unsupported controls remain explicit", () => {
  assert.deepEqual(
    capability.cells.find((cell) => cell.capabilityId === "branch-protection.observe"),
    { capabilityId: "branch-protection.observe", mode: "emulated", status: "observed", evidence: [evidence("synthetic-readback")] },
  );
  assert.equal(capability.cells.find((cell) => cell.capabilityId === "change-request.mutate").mode, "unavailable");
});

check("B4G09 provider extension input is closed", () => {
  assert.throws(() => mapGitLabForgeObservation({ ...gitlabObservation(), rawResponse: {} }), /^Error: SHAPE:/u);
  const value = gitlabObservation();
  value.observations.mergeRequestsRead.providerId = 7;
  assert.throws(() => mapGitLabForgeObservation(value), /^Error: BOUND:/u);
});

const requested = createExternalMutationRequest(requestInput());

check("B4M01 mutation request is exact, sealed, and contains no inline patch", () => {
  assert.equal(requested.schema, EXTERNAL_MUTATION_SCHEMA);
  assert.deepEqual(validateExternalMutation(requested), { ok: true, code: null });
  assert.equal(externalMutationDigest(requested), requested.recordSha256);
  assert.deepEqual(requested.patch, { format: "merge-patch-sha256", patchSha256: C, expectedPostSha256: C });
  assert.equal(Object.isFrozen(requested), true);
});

check("B4M02 unsafe operation classes are unsupported", () => {
  for (const operation of ["issue.delete", "issue.relabel", "project.transfer", "settings.update", "permissions.update", "batch.update"]) {
    assert.throws(() => createExternalMutationRequest({ ...requestInput(), operation }), /^Error: SHAPE:/u);
  }
});

check("B4M03 operation and exact object target must agree", () => {
  assert.throws(() => createExternalMutationRequest({
    ...requestInput(),
    target: { ...requestInput().target, objectType: "change-request" },
  }), /^Error: AUTHORITY:/u);
});

const previewed = previewExternalMutation(requested, { expiresAt: 1000 }).mutation;

check("B4M04 immutable preview binds all authority-bearing inputs", () => {
  assert.equal(previewed.state, "previewed");
  assert.equal(previewed.previousSha256, requested.recordSha256);
  for (const mutate of [
    (value) => { value.beforeSha256 = A; },
    (value) => { value.patch.patchSha256 = A; },
    (value) => { value.patch.expectedPostSha256 = A; },
    (value) => { value.idempotencyKey = A; },
    (value) => { value.capabilitySha256 = B; },
    (value) => { value.target.objectIdSha256 = B; },
  ]) {
    const value = clone(previewed);
    mutate(value);
    value.recordSha256 = externalMutationDigest(value);
    assert.equal(value.preview.previewSha256, previewed.preview.previewSha256);
    assert.match(validateExternalMutation(value).code, /^BOUND:/u);
  }
});

check("B4M05 exact matching confirmation is required before apply", () => {
  assert.equal(confirmExternalMutation(previewed, {
    authoritySha256: A,
    previewSha256: B,
    confirmedAt: 100,
  }).code, "AUTHORITY:mutation-preview");
  assert.equal(confirmExternalMutation(previewed, {
    authoritySha256: A,
    previewSha256: previewed.preview.previewSha256,
    confirmedAt: 1000,
  }).code, "STALE:mutation-preview");
});

const confirmed = confirmExternalMutation(previewed, {
  authoritySha256: A,
  previewSha256: previewed.preview.previewSha256,
  confirmedAt: 100,
}).mutation;

check("B4M06 confirmed record chains to the exact preview", () => {
  assert.equal(confirmed.state, "confirmed");
  assert.equal(confirmed.confirmation.previewSha256, previewed.preview.previewSha256);
  assert.equal(confirmed.previousSha256, previewed.recordSha256);
  assert.deepEqual(validateExternalMutation(confirmed), { ok: true, code: null });
});

const applied = recordExternalMutationOutcome(confirmed, {
  providerReceiptSha256: B,
  acceptedAt: 200,
  status: "accepted",
}).mutation;

check("B4M07 provider acceptance remains applied-unverified, never success", () => {
  assert.equal(applied.state, "applied-unverified");
  assert.equal(applied.readback, null);
  assert.deepEqual(validateExternalMutation(applied), { ok: true, code: null });
});

const verified = verifyExternalMutationReadback(applied, {
  observedSha256: C,
  expectedSha256: C,
  status: "matching",
  observedAt: 300,
});

check("B4M08 only exact matching readback reaches verified success", () => {
  assert.equal(verified.ok, true);
  assert.equal(verified.mutation.state, "readback-verified");
  assert.equal(verified.mutation.previousSha256, applied.recordSha256);
  assert.deepEqual(validateExternalMutation(verified.mutation), { ok: true, code: null });
});

check("B4M09 contradictory or mismatching readback cannot report success", () => {
  assert.equal(verifyExternalMutationReadback(applied, {
    observedSha256: B,
    expectedSha256: C,
    status: "matching",
    observedAt: 300,
  }).ok, false);
  const mismatch = verifyExternalMutationReadback(applied, {
    observedSha256: B,
    expectedSha256: C,
    status: "mismatch",
    observedAt: 300,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.mutation.state, "mismatch");
  const falseVerified = clone(verified.mutation);
  falseVerified.readback = null;
  falseVerified.recordSha256 = externalMutationDigest(falseVerified);
  assert.match(validateExternalMutation(falseVerified).code, /^READBACK:/u);
});

check("B4M09b expected post-state is fixed by the preview", () => {
  assert.equal(verifyExternalMutationReadback(applied, {
    observedSha256: B,
    expectedSha256: B,
    status: "matching",
    observedAt: 300,
  }).code, "BOUND:mutation-expected-post-state");
});

check("B4M10 partial and unknown outcomes stay typed non-success", () => {
  for (const [status, state] of [["partial", "partial"], ["unknown", "unknown"], ["rejected", "failed"]]) {
    const outcome = recordExternalMutationOutcome(confirmed, {
      providerReceiptSha256: B,
      acceptedAt: 200,
      status,
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.mutation.state, state);
    assert.match(outcome.code, /^UNAVAILABLE:/u);
  }
});

check("B4M11 rejection and expiry are explicit pre-apply terminal states", () => {
  assert.equal(rejectExternalMutation(requested).mutation.state, "rejected");
  assert.equal(rejectExternalMutation(previewed).mutation.state, "rejected");
  assert.equal(expireExternalMutation(previewed, 999).ok, false);
  assert.equal(expireExternalMutation(previewed, 1000).mutation.state, "expired");
  assert.equal(previewExternalMutation(requested, { expiresAt: Number.MAX_SAFE_INTEGER + 1 }).ok, false);
});

check("B4M12 retry reuses the key and reconciles remote state first", () => {
  const partial = recordExternalMutationOutcome(confirmed, {
    providerReceiptSha256: B,
    acceptedAt: 200,
    status: "partial",
  }).mutation;
  assert.equal(reconcileExternalMutationRetry(partial, {
    idempotencyKey: A,
    observedSha256: B,
    expectedSha256: C,
    observedAt: 400,
  }).code, "AUTHORITY:mutation-idempotency");
  assert.deepEqual(reconcileExternalMutationRetry(partial, {
    idempotencyKey: D,
    observedSha256: C,
    expectedSha256: C,
    observedAt: 400,
  }), { ok: true, code: "REPLAY:remote-already-matches", retry: false });
  assert.deepEqual(reconcileExternalMutationRetry(partial, {
    idempotencyKey: D,
    observedSha256: B,
    expectedSha256: C,
    observedAt: 400,
  }), { ok: true, code: "MUTATION:retry-admissible", retry: true });
  assert.equal(reconcileExternalMutationRetry(partial, {
    idempotencyKey: D,
    observedSha256: B,
    expectedSha256: B,
    observedAt: 400,
  }).code, "BOUND:mutation-expected-post-state");
});

check("B4M12b confirmation, provider receipt, and readback time are monotonic", () => {
  assert.equal(recordExternalMutationOutcome(confirmed, {
    providerReceiptSha256: B,
    acceptedAt: 99,
    status: "accepted",
  }).code, "BOUND:mutation-receipt-time");
  assert.equal(verifyExternalMutationReadback(applied, {
    observedSha256: C,
    expectedSha256: C,
    status: "matching",
    observedAt: 199,
  }).code, "BOUND:mutation-readback-time");
});

check("B4M13 root, nested shape, digest and provider binding fail closed", () => {
  const extra = { ...clone(requested), token: "forbidden" };
  assert.match(validateExternalMutation(extra).code, /^SHAPE:/u);
  const nested = clone(requested);
  nested.target.rawProjectPath = "private/group";
  nested.recordSha256 = externalMutationDigest(nested);
  assert.match(validateExternalMutation(nested).code, /^SHAPE:/u);
  const provider = clone(requested);
  provider.provider = "github";
  provider.recordSha256 = externalMutationDigest(provider);
  assert.match(validateExternalMutation(provider).code, /^SHAPE:/u);
  const digest = clone(requested);
  digest.recordSha256 = A;
  assert.match(validateExternalMutation(digest).code, /^CONFLICT:/u);
});

check("B4M14 schemas and offline adapter metadata are exact", () => {
  const schema = JSON.parse(readFileSync(new URL("./external-mutation.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$id, EXTERNAL_MUTATION_SCHEMA);
  assert.deepEqual(schema.required, Object.keys(requested));
  assert.equal(schema.$defs.nonNegativeSafeInteger.maximum, Number.MAX_SAFE_INTEGER);
  const verifiedRule = schema.allOf.find((rule) => rule.if?.properties?.state?.const === "readback-verified");
  assert.equal(verifiedRule.then.properties.preview.$ref, "#/$defs/preview");
  assert.equal(verifiedRule.then.properties.confirmation.$ref, "#/$defs/confirmation");
  assert.equal(verifiedRule.then.properties.remoteReceipt.allOf[1].properties.status.const, "accepted");
  assert.equal(verifiedRule.then.properties.readback.allOf[1].properties.status.const, "matching");
  const requestedRule = schema.allOf.find((rule) => rule.if?.properties?.state?.const === "requested");
  assert.equal(requestedRule.then.properties.readback.type, "null");
  assert.equal(requestedRule.then.properties.previousSha256.type, "null");
  const providerRule = schema.allOf.find((rule) => rule.if?.properties?.provider?.const === "gitlab");
  assert.deepEqual(providerRule.then.properties.target.properties.baseUrlClass.enum, ["gitlab-com", "self-managed"]);
  assert.equal(GITLAB_FORGE_ADAPTER_VERSION, "1.0.0");
});

console.log(`\ngitlab-forge-adapter: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}

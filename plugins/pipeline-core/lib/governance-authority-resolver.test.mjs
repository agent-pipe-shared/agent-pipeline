#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { requireGovernanceAuthority } from "./governance-authority-resolver.mjs";

const sha = "a".repeat(64); const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
const decision = { decisionId: "decision-1", event: "granted", outcome: "granted", authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed", scope: { repositoryFingerprint: sha, candidate, packageId: "sprint-phoenix-epic", action: "PLAN.APPROVE", environment: "local", artifacts: [{ path: "specs/sprint-phoenix-epic/spec.md", sha256: sha }] }, reasonCode: "SCOPE.ACCEPTED", policyDigest: sha, ruleDigest: sha, validity: { notBeforeEpochMs: 0, expiresAtEpochMs: 100, singleUse: true }, links: { requestDecisionId: "request-1", consumesDecisionId: null, revokesDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } };
test("resolver exposes only exact granted authority", () => {
  assert.equal(requireGovernanceAuthority({ decisions: [decision], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 1 }).granted, true);
  assert.deepEqual(requireGovernanceAuthority({ decisions: [decision], decisionId: "decision-1", repositoryFingerprint: sha, candidate: { ...candidate, tree: "d".repeat(40) }, nowEpochMs: 1 }), { granted: false, reason: "scope-mismatch" });
});

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { HumanGovernanceLedgerError, resolveHumanGovernanceAuthority, validateHumanGovernanceDecision } from "./human-governance-ledger.mjs";

const sha = "a".repeat(64);
const candidate = { commit: "b".repeat(40), tree: "c".repeat(40) };
function decision(overrides = {}) { return { decisionId: "decision-1", event: "granted", outcome: "granted", authorityClass: "product-owner", identityAssurance: "locally-attributed", timeAssurance: "locally-observed", scope: { repositoryFingerprint: sha, candidate, packageId: "sprint-phoenix-epic", action: "PLAN.APPROVE", environment: "local", artifacts: [{ path: "specs/sprint-phoenix-epic/spec.md", sha256: sha }] }, reasonCode: "SCOPE.ACCEPTED", policyDigest: sha, ruleDigest: sha, validity: { notBeforeEpochMs: 10, expiresAtEpochMs: 100, singleUse: true }, links: { requestDecisionId: "request-1", consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null }, ...overrides }; }

test("validates a closed portable grant and resolves matching authority", () => {
  const value = validateHumanGovernanceDecision(decision());
  assert.equal(value.decisionId, "decision-1");
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [value], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 50 }).status, "granted");
});

test("fails closed for repository/candidate drift, expiry, and consuming disposition", () => {
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [decision()], decisionId: "decision-1", repositoryFingerprint: "d".repeat(64), candidate, nowEpochMs: 50 }).reason, "scope-mismatch");
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [decision()], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 101 }).reason, "expired");
  const consumed = decision({ decisionId: "consume-1", event: "consumed", outcome: "consumed", links: { requestDecisionId: null, consumesDecisionId: "decision-1", revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } });
  assert.equal(resolveHumanGovernanceAuthority({ decisions: [decision(), consumed], decisionId: "decision-1", repositoryFingerprint: sha, candidate, nowEpochMs: 50 }).reason, "disposed");
});

test("rejects open payloads and invalid lifecycle link cardinality", () => {
  assert.throws(() => validateHumanGovernanceDecision({ ...decision(), privateReason: "no" }), (error) => error instanceof HumanGovernanceLedgerError && error.code === "HGL-SHAPE");
  assert.throws(() => validateHumanGovernanceDecision(decision({ links: { requestDecisionId: null, consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } })), (error) => error instanceof HumanGovernanceLedgerError && error.code === "HGL-LIFECYCLE");
});

test("requires one event-specific link and outcome for every authority lifecycle disposition", () => {
  const variants = [
    ["requested", "pending", null], ["denied", "denied", "requestDecisionId"], ["cancelled", "cancelled", "requestDecisionId"],
    ["revoked", "revoked", "revokesDecisionId"], ["expired", "expired", "expiresDecisionId"], ["corrected", "corrected", "correctsDecisionId"], ["superseded", "superseded", "supersedesDecisionId"],
  ];
  for (const [event, outcome, link] of variants) {
    const links = { requestDecisionId: null, consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null };
    if (link) links[link] = "decision-1";
    assert.equal(validateHumanGovernanceDecision(decision({ decisionId: `${event}-1`, event, outcome, links })).event, event);
  }
  assert.throws(() => validateHumanGovernanceDecision(decision({ event: "requested", outcome: "granted", links: { requestDecisionId: null, consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null } })), (error) => error.code === "HGL-OUTCOME");
});

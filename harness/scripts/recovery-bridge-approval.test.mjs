#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  RECOVERY_BRIDGE_DECISION_SCHEMA,
  recoveryBridgeDecisionDigest,
  validateRecoveryBridgeDecision,
} from "./pipeline-state.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const decision = {
  schema: RECOVERY_BRIDGE_DECISION_SCHEMA,
  decisionId: "rb-0123456789abcdef",
  decisionSha256: "0".repeat(64),
  featureId: "sprint-phoenix-epic",
  operation: "reconcile-mutable-design",
  manifest: "specs/sprint-phoenix-epic/lifecycle.json",
  artifactPath: "specs/sprint-phoenix-epic/RECOVERY.md",
  assurance: "operator-local-attested",
  manifestPreimageSha256: digest("manifest"),
  recoveryPostimageSha256: digest("recovery"),
  prdSha256: digest("prd"),
  specSha256: digest("spec"),
  approvedBy: "PO",
  approvedAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-10-30T00:00:00.000Z",
  approval: {
    what: "Reconcile the current Recovery record digest in the lifecycle manifest.",
    why: "The manifest must bind the current reviewed document before verification can be trusted.",
    scope: "Only the Phoenix lifecycle manifest and its writer receipt may change.",
    notAuthorized: "No product implementation, dispatch, remote action, or completion claim is authorized.",
  },
  status: "issued",
};
decision.decisionSha256 = recoveryBridgeDecisionDigest(decision);

assert.equal(validateRecoveryBridgeDecision(decision).ok, true);
assert.equal(validateRecoveryBridgeDecision({ ...decision, approval: { ...decision.approval, why: "Changed explanation after approval." } }).ok, false);

const legacy = { ...decision };
delete legacy.approval;
legacy.decisionSha256 = recoveryBridgeDecisionDigest(legacy);
assert.equal(validateRecoveryBridgeDecision(legacy).ok, true);

console.log("recovery-bridge approval tests passed");

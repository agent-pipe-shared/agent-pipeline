// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateChangeControlGate, validateChangeControlProfile } from "./change-control.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) }; const artifact = { path: "specs/release/result.md", sha256: "c".repeat(64) }; const window = { startsAtEpochMs: 10, endsAtEpochMs: 20 };
function profile(overrides = {}) { return { schema: "pipeline.change-control-profile.v1", profileId: "production-change", policySha256: "d".repeat(64), changeClass: "normal", candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), window, mandatory: true, ...overrides }; }
function local(overrides = {}) { return { granted: true, candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), emergencyAuthorized: false, ...overrides }; }
function receipt(overrides = {}) { return { schema: "pipeline.change-control-receipt.v1", profileId: "production-change", candidate, artifact, environment: "production", scopeSha256: "e".repeat(64), window, state: "approved", authenticated: true, ...overrides }; }
test("allows mandatory promotion only when independent local and external authority bind the exact same tuple", () => assert.deepEqual(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 15 }), { schema: "pipeline.change-control-gate.v1", status: "allowed", reason: "composed-authority" }));
test("blocks stale, unauthenticated, mismatched, unavailable, and outside-window external change state", () => {
  for (const externalReceipt of [null, receipt({ authenticated: false }), receipt({ state: "draft" }), receipt({ environment: "staging" })]) assert.equal(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt, nowEpochMs: 15 }).status, "blocked");
  assert.equal(evaluateChangeControlGate({ profile: profile(), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 21 }).reason, "outside-window");
});
test("requires explicit emergency authority and keeps not-required independent", () => {
  assert.equal(evaluateChangeControlGate({ profile: profile({ changeClass: "emergency" }), pipelineAuthority: local(), externalReceipt: receipt(), nowEpochMs: 15 }).reason, "emergency-authority");
  assert.equal(evaluateChangeControlGate({ profile: profile({ changeClass: "not-required", mandatory: false }), pipelineAuthority: local(), externalReceipt: null, nowEpochMs: 15 }).reason, "not-required");
  assert.throws(() => validateChangeControlProfile(profile({ changeClass: "not-required", mandatory: true })), (error) => error.code === "CC-PROFILE");
});

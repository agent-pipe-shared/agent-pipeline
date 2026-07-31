#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  comparePipelineVersions,
  evaluateRulesetUpdatePolicy,
  rulesetUpdatePolicyDigest,
  validateRulesetUpdatePolicy,
} from "./ruleset-update-policy.mjs";

const policy = (match) => ({
  schema: "pipeline.ruleset-update-policy.v1",
  policyId: "pipeline-core-security-update-policy",
  policyVersion: 1,
  entries: [{
    id: "security-example",
    disposition: "blocking",
    publicSecurityReason: "This fixture build is affected by a public security issue.",
    match,
  }],
});

test("exact policy match alone blocks and binds the policy digest", () => {
  const value = policy({
    type: "exact-loaded-builds",
    builds: [{ version: "0.4.6", commit: "a".repeat(40) }],
  });
  const result = evaluateRulesetUpdatePolicy(value, { version: "0.4.6", commit: "a".repeat(40) });
  assert.equal(result.status, "matched");
  assert.equal(result.blocking, true);
  assert.equal(result.policySha256, rulesetUpdatePolicyDigest(value));
  assert.equal(result.publicSecurityReason, value.entries[0].publicSecurityReason);
});

test("exact version with the wrong commit and ordinary drift are advisory", () => {
  const result = evaluateRulesetUpdatePolicy(policy({
    type: "exact-loaded-builds",
    builds: [{ version: "0.4.6", commit: "a".repeat(40) }],
  }), { version: "0.4.6", commit: "b".repeat(40) });
  assert.equal(result.status, "not-matched");
  assert.equal(result.blocking, false);
  assert.equal(result.disposition, "advisory");
});

test("minimum safe version uses SemVer precedence and invalid policy never blocks", () => {
  assert.equal(comparePipelineVersions("0.4.6", "0.4.7"), -1);
  assert.equal(comparePipelineVersions("0.4.7-partial.1", "0.4.7"), -1);
  assert.equal(
    comparePipelineVersions(
      "0.4.7-partial-auth+codex.20260730200000",
      "0.4.7-partial-auth+codex.20260730210932",
    ),
    -1,
  );
  assert.equal(evaluateRulesetUpdatePolicy(policy({
    type: "minimum-safe-version",
    version: "0.4.7",
  }), { version: "0.4.6", commit: null }).blocking, true);
  const invalid = policy({ type: "minimum-safe-version", version: "later" });
  assert.notEqual(validateRulesetUpdatePolicy(invalid).length, 0);
  assert.equal(evaluateRulesetUpdatePolicy(invalid, { version: "0.4.6" }).blocking, false);
});

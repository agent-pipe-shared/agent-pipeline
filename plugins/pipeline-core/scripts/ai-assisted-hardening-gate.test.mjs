// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAiHardeningGate } from "./ai-assisted-hardening-gate.mjs";

test("candidate gate applies CYB-5 controls to delivery metadata", () => {
  const result = evaluateAiHardeningGate({
    changedPaths: [".github/workflows/verify.yml", "plugins/pipeline-core/hooks/guard.mjs"],
    authorId: "delivery-agent", reviewerId: "pipeline-critic",
  });
  assert.equal(result.allowed, true);
  assert.equal(result.checks.input.authority, "none");
  assert.equal(result.checks.authority.allowed, true);
  assert.equal(result.checks.integrity.allowed, true);
  assert.equal(result.checks.review.required, true);
});

test("candidate gate rejects privileged untrusted CI and self-review", () => {
  const result = evaluateAiHardeningGate({
    changedPaths: [".github/workflows/verify.yml"], event: "pull_request", privileged: true,
    authorId: "delivery-agent", reviewerId: "delivery-agent",
  });
  assert.equal(result.allowed, false);
  assert.equal(result.checks.review.code, "AIH-INDEPENDENT-REVIEW-REQUIRED");
  assert.equal(result.checks.ci.code, "AIH-CI-ISOLATION-REQUIRED");
});

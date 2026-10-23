// SPDX-License-Identifier: SUL-1.0
/**
 * Pin for K120-NODE-TEST-CONTEXT-CHECK-VERDICT: the verdict of a governed delivery check must not depend on
 * the test-runner context of the process that happens to execute the product code.
 *
 * Observed 2026-10-23 (K119 baseline): `node --test native-goldfish-host-state.test.mjs` was 37/39, cases
 * NGHS09 and NGHS13 red, while the same cases passed when the file was run in a plain `node` process. Cause:
 * the outer `node --test` sets NODE_TEST_CONTEXT=child-v8 in its environment; `executeGovernedItemDeliveryChecks`
 * handed that environment (stripped only of GIT_*) to the check child, and a nested `node --test <check>` that
 * sees NODE_TEST_CONTEXT behaves as a reporter-less child of an outer runner: it exits 0 with EMPTY output even
 * though its test fails. The forged-failing check was then recorded as SQ-TARGETED-CHECKS-PASSED.
 *
 * Held contract: with NODE_TEST_CONTEXT=child-v8 inherited, a check whose test fails is recorded as failed
 * (SQ-TARGETED-CHECKS-FAILED, non-zero status, non-empty child output) and a passing check as passed. The pin
 * sets the variable itself, so it measures the same thing whether it runs under `node --test` or plain `node`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { devNull } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { nativeContractFixtureParent } from "../test-item-approved-course-fixture.mjs";
import { executeGovernedItemDeliveryChecks } from "../native-goldfish-host-state.mjs";
import { inspectSignedDescriptorCustodyRepository } from "../worktree-lifecycle.mjs";

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");
const roots = [];

function git(root, ...args) {
  const run = spawnSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", `core.hooksPath=${devNull}`, "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

function withContext(value, run) {
  const previous = process.env.NODE_TEST_CONTEXT;
  process.env.NODE_TEST_CONTEXT = value;
  try { return run(); } finally {
    if (previous === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = previous;
  }
}

function repositoryWithCheck(checkSource) {
  const parent = nativeContractFixtureParent();
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(parent, "governed-check-context-"));
  roots.push(root);
  assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
  git(root, "commit", "--allow-empty", "-q", "-m", "fixture");
  writeFileSync(join(root, "unit.test.cjs"), checkSource);
  writeFileSync(join(root, "dependency.txt"), "expected\n");
  git(root, "add", "unit.test.cjs", "dependency.txt");
  git(root, "commit", "-q", "-m", "targeted source");
  const itemDelivery = { schema: "pipeline.item-delivery-briefing.v1", sliceId: "ITEM-A", itemId: "AC-1",
    criterionLocator: { schema: "pipeline.critic-criterion-locator.v1", sourcePath: "specs/unit/spec.md", sourceSha256: "a".repeat(64), criterionId: "AC-1", startByte: 1, endByte: 20, excerptSha256: "b".repeat(64) },
    checks: [{ id: "unit", path: "unit.test.cjs", dependencies: ["dependency.txt"] }] };
  return { root, itemDelivery, candidate: inspectSignedDescriptorCustodyRepository(root).candidate };
}

test.after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

test("a failing nested node --test check is recorded as failed although NODE_TEST_CONTEXT is inherited", () => {
  const { root, itemDelivery, candidate } = repositoryWithCheck("const test=require('node:test');const assert=require('node:assert/strict');test('actual criterion',()=>assert.equal(1,2));\n");
  const observed = withContext("child-v8", () => executeGovernedItemDeliveryChecks({ root, itemDelivery, candidate }));
  assert.equal(observed.code, "SQ-TARGETED-CHECKS-FAILED", JSON.stringify(observed));
  assert.equal(observed.evidence.verdict, "failed");
  assert.notEqual(observed.evidence.results[0].status, 0);
  assert.notEqual(observed.evidence.results[0].stdoutSha256, EMPTY_SHA256, "the check child reported through its own reporter, not silently");
});

test("a passing nested node --test check is still recorded as passed under an inherited NODE_TEST_CONTEXT", () => {
  const { root, itemDelivery, candidate } = repositoryWithCheck("const test=require('node:test');const assert=require('node:assert/strict');test('actual criterion',()=>assert.equal(1,1));\n");
  const observed = withContext("child-v8", () => executeGovernedItemDeliveryChecks({ root, itemDelivery, candidate }));
  assert.equal(observed.code, "SQ-TARGETED-CHECKS-PASSED", JSON.stringify(observed));
  assert.equal(observed.evidence.results[0].status, 0);
  assert.notEqual(observed.evidence.results[0].stdoutSha256, EMPTY_SHA256);
});

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ROOT,
  REVIEW_RETRY_PLAN_INPUT_SCHEMA,
  checkReviewRetryPlan,
  reviewRetryInputArg,
} from "./check-review-retry-plan.mjs";
import {
  createReviewAbortEvent,
  sealReviewStageReceipt,
} from "../../plugins/pipeline-core/lib/review-retry-planner.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const CANDIDATE = { commit: "1".repeat(40), tree: "2".repeat(40) };
const POLICY = "review-policy.v1";
const ROUTE = { model: "claude-opus-5", effort: "xhigh" };
const STAGE = { id: "critic-docs", domain: "doc-surface", dependsOn: [], scopeSha256: A, policyVersion: POLICY, route: ROUTE, assurance: "bounded" };
const OTHER_STAGE = { id: "intake", domain: "intake-surface", dependsOn: [], scopeSha256: A, policyVersion: POLICY, route: ROUTE, assurance: "bounded" };

function receiptFor(stage) {
  return sealReviewStageReceipt({
    stage: stage.id, domain: stage.domain, candidate: CANDIDATE, scopeSha256: stage.scopeSha256,
    policyVersion: stage.policyVersion, route: { ...stage.route }, assurance: stage.assurance,
    attempt: 0, status: "completed", finding: "none", completedAt: "2026-08-18T00:00:00.000Z",
    freshnessWindowMs: 3600000, evidenceSha256: B,
  });
}

function validInput(overrides = {}) {
  return {
    schema: REVIEW_RETRY_PLAN_INPUT_SCHEMA,
    candidate: CANDIDATE,
    policyVersion: POLICY,
    stages: [OTHER_STAGE, STAGE],
    receipts: { [STAGE.id]: receiptFor(STAGE) },
    abort: createReviewAbortEvent({ stage: OTHER_STAGE.id, classification: "transport", domain: null, evidenceSha256: C, observedAt: "2026-08-18T00:05:00.000Z" }),
    evaluatedAt: "2026-08-18T00:10:00.000Z",
    maxAttemptsPerStage: 3,
    attempts: {},
    ...overrides,
  };
}

let root;

test.beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "review-retry-plan-check-"));
});

test.afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test("reviewRetryInputArg extracts the flag value and is absent by default", () => {
  assert.equal(reviewRetryInputArg([]), null);
  assert.equal(reviewRetryInputArg(["--other", "x"]), null);
  assert.equal(reviewRetryInputArg(["--review-retry-input", "evidence/foo.json"]), "evidence/foo.json");
});

test("DEFAULT_ROOT resolves to the repository root that contains this script under harness/scripts", () => {
  assert.equal(existsSync(join(DEFAULT_ROOT, "harness", "scripts", "check-review-retry-plan.mjs")), true);
  assert.equal(existsSync(join(DEFAULT_ROOT, "plugins", "pipeline-core", "lib", "review-retry-planner.mjs")), true);
});

test("a missing --review-retry-input path fails closed with a repository-relative-file finding", () => {
  const result = checkReviewRetryPlan(root, "does/not/exist.json");
  assert.equal(result.ok, false);
  assert.equal(result.plan, null);
  assert.match(result.findings[0], /existing non-symlink repository-relative file/);
});

test("an absolute or traversal-escaping path is rejected", () => {
  assert.equal(checkReviewRetryPlan(root, "/etc/passwd").ok, false);
  assert.equal(checkReviewRetryPlan(root, "../outside.json").ok, false);
});

test("a symlinked input file is rejected", () => {
  const target = join(root, "real.json");
  writeFileSync(target, JSON.stringify(validInput()));
  const link = join(root, "linked.json");
  symlinkSync(target, link);
  const result = checkReviewRetryPlan(root, "linked.json");
  assert.equal(result.ok, false);
});

test("malformed JSON fails closed", () => {
  writeFileSync(join(root, "input.json"), "{not json");
  const result = checkReviewRetryPlan(root, "input.json");
  assert.equal(result.ok, false);
  assert.match(result.findings[0], /not valid JSON/);
});

test("the wrong schema fails closed", () => {
  writeFileSync(join(root, "input.json"), JSON.stringify({ schema: "pipeline.something-else.v1" }));
  const result = checkReviewRetryPlan(root, "input.json");
  assert.equal(result.ok, false);
  assert.match(result.findings[0], new RegExp(REVIEW_RETRY_PLAN_INPUT_SCHEMA.replaceAll(".", "\\.")));
});

test("a schema-valid but semantically invalid planning request fails closed rather than throwing", () => {
  writeFileSync(join(root, "input.json"), JSON.stringify(validInput({ stages: "not-an-array" })));
  const result = checkReviewRetryPlan(root, "input.json");
  assert.equal(result.ok, false);
  assert.match(result.findings[0], /could not be planned/);
});

test("a valid planning request produces a valid, retained-evidence-shaped plan", () => {
  writeFileSync(join(root, "input.json"), JSON.stringify(validInput()));
  const result = checkReviewRetryPlan(root, "input.json");
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.plan.retained, [STAGE.id]);
  assert.deepEqual(result.plan.rerun, [OTHER_STAGE.id]);
  assert.equal(result.plan.claimAuthority, "none");
});

// Matches the sibling checkers' own convention (check-phase3-sdlc-coherence.test.mjs
// "checker invocation without --result is an explicit successful SKIP"): the CLI tail
// resolves paths against DEFAULT_ROOT (this real checkout), not against `cwd`, so only
// the argument-free SKIP path -- which touches no file -- is exercised as a real
// subprocess here. The present-argument paths are covered above via checkReviewRetryPlan
// directly against an isolated temp root.
test("CLI: no arguments SKIPs with exit 0 and touches no file", () => {
  const checkerPath = new URL("./check-review-retry-plan.mjs", import.meta.url);
  const run = spawnSync(process.execPath, [fileURLToPath(checkerPath)], { encoding: "utf8", timeout: 5000 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^SKIP review-retry plan/m);
  assert.equal(run.stderr, "");
});

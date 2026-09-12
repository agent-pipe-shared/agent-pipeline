#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  GOVERNANCE_REVIEW_RETRY_SCHEMA,
  GOVERNANCE_REVIEW_SOURCE_SCHEMA,
  GovernanceReviewActionError,
  buildGovernanceReviewAction,
  buildGovernanceReviewRetry,
  retryGovernanceReviewAction,
  writeGovernanceReviewAction,
} from "./governance-review-action.mjs";

const unavailable = Object.freeze({ state: "not-applicable" });
function source(overrides = {}) {
  return {
    schema: GOVERNANCE_REVIEW_SOURCE_SCHEMA,
    receiptSha256: "a".repeat(64),
    verdictSha256: "d".repeat(64),
    candidate: { commit: "b".repeat(40), tree: "c".repeat(40) },
    featureId: "nova-b",
    sessionId: "session-17",
    reviewPass: true,
    findingCount: 0,
    ...overrides,
  };
}
function code(expected) { return (error) => error instanceof GovernanceReviewActionError && error.code === expected; }

test("accepted pass and findings map to the two closed ADR-0083 review facts", () => {
  const pass = buildGovernanceReviewAction(source());
  assert.equal(pass.reasonCode, "REVIEW_PASSED");
  assert.match(pass.correlation.requestId, /^[a-f0-9]{64}$/u);
  assert.equal(buildGovernanceReviewAction(source({ findingCount: 1 })).reasonCode, "REVIEW_FINDINGS");
  assert.equal(buildGovernanceReviewAction(source({ reviewPass: false, findingCount: 1 })).reasonCode, "REVIEW_FINDINGS");
  assert.equal(buildGovernanceReviewAction(source({ featureId: unavailable, sessionId: unavailable })).correlation.sessionId.state, "not-applicable");
});

test("source is closed and rejects fabricated packet IDs or verdict summaries", () => {
  assert.throws(() => buildGovernanceReviewAction({ ...source(), runner: "codex" }), code("GRA-SOURCE-SHAPE"));
  assert.throws(() => buildGovernanceReviewAction(source({ receiptSha256: "session-report" })), code("GRA-SOURCE-DIGEST"));
  assert.throws(() => buildGovernanceReviewAction(source({ findingCount: -1 })), code("GRA-SOURCE-VERDICT"));
  assert.throws(() => buildGovernanceReviewAction(source({ reviewPass: false, findingCount: 0 })), code("GRA-SOURCE-VERDICT"));
});

test("receipt and verdict digest drift derive distinct action identities", () => {
  const baseline = buildGovernanceReviewAction(source());
  const receiptDrift = buildGovernanceReviewAction(source({ receiptSha256: "e".repeat(64) }));
  const verdictDrift = buildGovernanceReviewAction(source({ verdictSha256: "f".repeat(64) }));
  assert.notEqual(receiptDrift.correlation.requestId, baseline.correlation.requestId);
  assert.notEqual(verdictDrift.correlation.requestId, baseline.correlation.requestId);
  assert.notEqual(receiptDrift.eventId, verdictDrift.eventId);
});

test("create-only publication and identical-only retry retain the closed event", () => {
  const root = mkdtempSync(join(tmpdir(), "governance-review-action-"));
  try {
    const event = buildGovernanceReviewAction(source());
    const first = writeGovernanceReviewAction({ rootDir: root, eventOutPath: "evidence/review-action.json", event });
    assert.equal(first.status, "written");
    assert.throws(() => writeGovernanceReviewAction({ rootDir: root, eventOutPath: "evidence/review-action.json", event }), code("GRA-OUTPUT-EXISTS"));
    const retry = buildGovernanceReviewRetry({ eventOutPath: "evidence/review-action.json", event });
    assert.equal(retry.schema, GOVERNANCE_REVIEW_RETRY_SCHEMA);
    assert.equal(retryGovernanceReviewAction({ rootDir: root, retry }).status, "existing-identical");
    assert.deepEqual(JSON.parse(readFileSync(join(root, "evidence/review-action.json"), "utf8")), event);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("retry rejects a different action kind and escaping output path", () => {
  const review = buildGovernanceReviewAction(source());
  assert.throws(() => buildGovernanceReviewRetry({ eventOutPath: "../event.json", event: review }), code("GRA-RETRY-PATH"));
  assert.throws(() => buildGovernanceReviewRetry({ eventOutPath: "event.json", event: { ...review, kind: "gate" } }), code("GRA-RETRY-EVENT"));
});

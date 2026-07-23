// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { sha256Raw } from "./afk-assumption-mode.mjs";
import {
  AFK_PROJECTION_SCHEMA,
  afkGateStatus,
  createAfkEntryReceipt,
  createAfkReviewIntent,
  executeAfkReviewTransaction,
  validateAfkEntryReceipt,
  validateAfkReview,
} from "./afk-review.mjs";
import { classifyAfkWorkflowPreflight } from "./workflow-preflight.mjs";

const ACTIVATION = "a".repeat(32);
const REVIEWED_AT = "2026-07-18T21:00:00.000Z";
const FREEZE_HASH = "f".repeat(64);

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    },
  }).trim();
}

function repo() {
  const root = mkdtempSync(join(tmpdir(), "afk-review-"));
  execFileSync("git", ["init", "-b", "feat/batman", root]);
  git(root, "config", "user.name", "Review Test");
  git(root, "config", "user.email", "review@example.invalid");
  writeFileSync(join(root, "base.txt"), "base\n");
  git(root, "add", "base.txt");
  git(root, "commit", "-m", "base");
  const base = git(root, "rev-parse", "HEAD");
  const tree = git(root, "rev-parse", "HEAD^{tree}");
  const first = git(root, "commit-tree", tree, "-p", base, "-m", "first");
  const second = git(root, "commit-tree", tree, "-p", first, "-m", "second");
  git(root, "checkout", "--detach", base);
  git(root, "update-ref", `refs/agent-pipeline/afk/${ACTIVATION}`, second);
  return { root, base, first, second };
}

function entries(repository) {
  return [
    { entryId: "entry-1", sequence: 3, resultCommit: repository.first },
    { entryId: "entry-2", sequence: 5, resultCommit: repository.second },
  ];
}

function dispositions(first = "accept", second = "reject") {
  return [
    { entryId: "entry-1", sequence: 3, decision: first },
    { entryId: "entry-2", sequence: 5, decision: second },
  ];
}

function freeze(repository, cause = "explicit-review") {
  return {
    reviewId: "review-1",
    cause,
    ledgerSequence: 5,
    ledgerHeadSha256: "e".repeat(64),
    privateRefOid: repository.second,
    featureRef: "refs/heads/feat/batman",
    featureBaseOid: repository.base,
    frozenAt: REVIEWED_AT,
  };
}

function transaction(repository, overrides = {}) {
  const records = overrides.records ?? [];
  const outcome = executeAfkReviewTransaction({
    root: repository.root,
    activationId: ACTIVATION,
    freeze: freeze(repository),
    freezeRecordSha256: FREEZE_HASH,
    entries: entries(repository),
    dispositions: dispositions(),
    attributedBy: "po",
    reviewedAt: REVIEWED_AT,
    existingRecords: records,
    appendRecord(type, body) {
      records.push({ type, body });
      return { ok: true, sequence: records.length, headSha256: sha256Raw(type) };
    },
    linkedFeatureCheckouts: () => 0,
    ...overrides,
  });
  return { outcome, records };
}

test("review covers every frozen entry as one accepted prefix and rejected suffix", () => {
  const repository = repo();
  const planned = createAfkReviewIntent({
    activationId: ACTIVATION,
    reviewId: "review-1",
    attributedBy: "po",
    reviewedAt: REVIEWED_AT,
    freezeRecordSha256: FREEZE_HASH,
    featureBaseOid: repository.base,
    entries: entries(repository),
    dispositions: dispositions(),
  });
  assert.equal(planned.ok, true);
  assert.equal(planned.review.acceptedPrefixLength, 1);
  assert.equal(planned.review.promotionOid, repository.first);
  assert.equal(validateAfkReview(planned.review).ok, true);

  assert.equal(createAfkReviewIntent({
    activationId: ACTIVATION, reviewId: "review-1", attributedBy: "po", reviewedAt: REVIEWED_AT,
    freezeRecordSha256: FREEZE_HASH, featureBaseOid: repository.base, entries: entries(repository),
    dispositions: dispositions("reject", "accept"),
  }).code, "AFK-REVIEW-PREFIX-INVALID");
  assert.equal(createAfkReviewIntent({
    activationId: ACTIVATION, reviewId: "review-1", attributedBy: "po", reviewedAt: REVIEWED_AT,
    freezeRecordSha256: FREEZE_HASH, featureBaseOid: repository.base, entries: entries(repository),
    dispositions: dispositions().slice(0, 1),
  }).code, "AFK-REVIEW-INVALID");
});

test("review schema closes both PO review and per-entry receipt", () => {
  const schema = JSON.parse(readFileSync(new URL("../scripts/afk-review.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$defs.review.additionalProperties, false);
  assert.equal(schema.$defs.receipt.additionalProperties, false);
  assert.equal(schema.$defs.review.properties.schema.const, "pipeline.afk-review.v1");
  assert.equal(schema.$defs.receipt.properties.schema.const, "pipeline.afk-entry-receipt.v1");
});

test("zero, partial and all accepted prefixes choose exact promotion OIDs", () => {
  const repository = repo();
  for (const [vector, expected, count] of [
    [dispositions("reject", "reject"), repository.base, 0],
    [dispositions("accept", "reject"), repository.first, 1],
    [dispositions("accept", "accept"), repository.second, 2],
  ]) {
    const planned = createAfkReviewIntent({
      activationId: ACTIVATION, reviewId: "review-1", attributedBy: "po", reviewedAt: REVIEWED_AT,
      freezeRecordSha256: FREEZE_HASH, featureBaseOid: repository.base, entries: entries(repository), dispositions: vector,
    });
    assert.equal(planned.review.promotionOid, expected);
    assert.equal(planned.review.acceptedPrefixLength, count);
  }
});

test("promotion CAS moves only unchanged feature ref and retains rejected suffix privately", () => {
  const repository = repo();
  const { outcome, records } = transaction(repository);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "complete");
  assert.equal(git(repository.root, "rev-parse", "refs/heads/feat/batman"), repository.first);
  assert.equal(git(repository.root, "rev-parse", `refs/agent-pipeline/afk/${ACTIVATION}`), repository.second);
  assert.throws(() => git(repository.root, "merge-base", "--is-ancestor", repository.second, "refs/heads/feat/batman", "--"));
  assert.deepEqual(records.map((entry) => entry.type), [
    "review-freeze", "review-intent", "promotion-applied", "entry-receipt", "entry-receipt", "review-complete",
  ]);
  assert.deepEqual(records.filter((entry) => entry.type === "entry-receipt").map((entry) => entry.body.decision), ["accept", "reject"]);
});

test("lost acknowledgement after CAS resumes from review intent without a second decision", () => {
  const repository = repo();
  const records = [];
  assert.throws(() => transaction(repository, {
    records,
    fault(stage) { if (stage === "after-promotion") throw new Error("crash"); },
  }));
  assert.deepEqual(records.map((entry) => entry.type), ["review-freeze", "review-intent"]);
  assert.equal(git(repository.root, "rev-parse", "refs/heads/feat/batman"), repository.first);
  const resumed = transaction(repository, { records });
  assert.equal(resumed.outcome.ok, true);
  assert.equal(records.filter((entry) => entry.type === "review-intent").length, 1);
  assert.equal(records.at(-1).type, "review-complete");
});

test("missing suffix receipt regenerates deterministically after a crash", () => {
  const repository = repo();
  const records = [];
  assert.throws(() => transaction(repository, {
    records,
    fault(stage, context) {
      if (stage === "after-entry-receipt" && context.index === 0) throw new Error("crash");
    },
  }));
  assert.equal(records.filter((entry) => entry.type === "entry-receipt").length, 1);
  const firstDigest = records.find((entry) => entry.type === "entry-receipt").body.receiptSha256;
  const resumed = transaction(repository, { records });
  assert.equal(resumed.outcome.ok, true);
  assert.equal(records.filter((entry) => entry.type === "entry-receipt").length, 2);
  assert.equal(records.find((entry) => entry.type === "entry-receipt").body.receiptSha256, firstDigest);
});

test("feature, private-ref or linked-worktree drift blocks without history rewrite", () => {
  const privateDrift = repo();
  git(privateDrift.root, "update-ref", `refs/agent-pipeline/afk/${ACTIVATION}`, privateDrift.first, privateDrift.second);
  assert.equal(transaction(privateDrift).outcome.code, "AFK-PRIVATE-REF-FROZEN-HEAD-CONFLICT");
  assert.equal(git(privateDrift.root, "rev-parse", "refs/heads/feat/batman"), privateDrift.base);

  const featureDrift = repo();
  const other = git(featureDrift.root, "commit-tree", git(featureDrift.root, "rev-parse", `${featureDrift.base}^{tree}`), "-p", featureDrift.base, "-m", "other");
  git(featureDrift.root, "update-ref", "refs/heads/feat/batman", other, featureDrift.base);
  assert.equal(transaction(featureDrift).outcome.code, "AFK-FEATURE-REF-CONFLICT");
  assert.equal(git(featureDrift.root, "rev-parse", "refs/heads/feat/batman"), other);

  const checkedOut = repo();
  const blocked = transaction(checkedOut, { linkedFeatureCheckouts: () => 1 }).outcome;
  assert.equal(blocked.code, "AFK-FEATURE-REF-CHECKED-OUT");
  assert.equal(git(checkedOut.root, "rev-parse", "refs/heads/feat/batman"), checkedOut.base);
});

test("entry receipts are closed, deterministic and review-bound", () => {
  const repository = repo();
  const planned = createAfkReviewIntent({
    activationId: ACTIVATION, reviewId: "review-1", attributedBy: "po", reviewedAt: REVIEWED_AT,
    freezeRecordSha256: FREEZE_HASH, featureBaseOid: repository.base, entries: entries(repository), dispositions: dispositions(),
  });
  const made = createAfkEntryReceipt({ review: planned.review, entry: entries(repository)[0], decision: "accept" });
  assert.equal(made.ok, true);
  assert.equal(validateAfkEntryReceipt(made.receipt, planned.review).ok, true);
  const drift = structuredClone(made.receipt);
  drift.decision = "reject";
  assert.equal(validateAfkEntryReceipt(drift, planned.review).code, "AFK-ENTRY-RECEIPT-DIGEST-MISMATCH");
});

test("workflow classifier is off by absence, active only for worker, incomplete recovery-only and complete open", () => {
  assert.deepEqual(classifyAfkWorkflowPreflight({ operation: "push" }), {
    ok: true, status: "off", allowed: true, code: "AFK-GATE-OFF",
  });
  const projection = {
    schema: AFK_PROJECTION_SCHEMA,
    activationId: ACTIVATION,
    status: "active",
    ledgerSequence: 4,
    ledgerHeadSha256: "d".repeat(64),
    privateRefOid: "a".repeat(40),
    updatedAt: REVIEWED_AT,
  };
  const ledger = { ok: true, activationId: ACTIVATION, sequence: 4, headSha256: "d".repeat(64) };
  assert.equal(afkGateStatus({ projection, ledger, receipts: [], operation: "afk-worker" }).allowed, true);
  assert.equal(afkGateStatus({ projection, ledger, receipts: [], operation: "push" }).allowed, false);
  projection.status = "review-required";
  assert.equal(afkGateStatus({ projection, ledger, receipts: [], operation: "close" }).allowed, false);
  assert.equal(afkGateStatus({ projection, ledger, receipts: [], operation: "afk-review" }).allowed, true);
  projection.status = "complete";
  assert.equal(afkGateStatus({ projection, ledger, receipts: [], operation: "push" }).allowed, true);
  assert.equal(afkGateStatus({ projection: null, ledger, receipts: [], operation: "afk-status" }).code,
    "AFK-GATE-AUTHORITY-MISMATCH");
  assert.equal(classifyAfkWorkflowPreflight({ operation: "unknown" }).code, "AFK-GATE-OPERATION-INVALID");
});

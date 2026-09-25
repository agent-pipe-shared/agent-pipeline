#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { DEFAULT_LEGACY_RECONCILE_INDEX_PATH, LEGACY_RECONCILE_SCHEMA, evaluateRepositoryCriticSkipCoverage, evaluateReviewAdmission, readCommitChangedPaths, verifyCriticDispositionAddendumForRecord, walkDispatchRecords } from "./check-critic-skip-coverage.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../lib/critic-skip-decision.mjs";
import { CRITIC_DISPOSITION_ADDENDUM_SCHEMA, criticDispositionAddendumPath } from "../lib/critic-disposition-addendum.mjs";

const SHA = "a".repeat(40);
const trigger = (overrides = {}) => ({ schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false }, ...overrides });
const skip = () => ({ schema: CRITIC_SKIP_SCHEMA, trigger: trigger(), appliedRow: "T5" });
const required = () => ({ schema: CRITIC_REQUIRED_SCHEMA, trigger: trigger({ rigorLevel: 2 }), appliedRow: "T3" });
function fixture(files) {
  const base = mkdtempSync(join(tmpdir(), "check-critic-skip-coverage-"));
  mkdirSync(join(base, "evidence"), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(base, path)), { recursive: true });
    writeFileSync(join(base, path), content);
  }
  return base;
}
function v3(taskId, disposition) {
  return {
    schema: "pipeline.dispatch-record.v3", taskId, agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
    rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: SHA, resultSha256: null,
    outcome: "in-progress", commits: [], log: [], report: null, ...disposition,
  };
}
function v4(taskId, disposition) {
  return {
    schema: "pipeline.dispatch-record.v4", taskId, agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
    rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: SHA, resultSha256: null,
    outcome: "in-progress", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
    commits: [], log: [], report: null, ...disposition,
  };
}
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const evaluate = (root, paths = ["generated/output.json"], options = {}) => evaluateRepositoryCriticSkipCoverage({ root, readChangedPaths: () => paths, ...options });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const criticReceiptSha256 = "c".repeat(64);
const criticPacketId = "d".repeat(32);
const reviewCandidateCommit = "e".repeat(40);
const recordBlobOid = "b".repeat(40);
const boundReview = (recordBytes) => ({
  gitRead: (args) => args[1] === "--git-common-dir" ? ".git" : recordBlobOid,
  readGitBlob: () => Buffer.from(recordBytes),
  readBoundCriticReceipt: () => ({ packet: { request: { taskId: "UNDELIVERED" },
    references: [{ kind: "evidence", path: "evidence/dispatch-record-UNDELIVERED.json", candidateBlobOid: recordBlobOid }] },
  critic: { reviewPass: true, candidate: { commit: reviewCandidateCommit } }, criticReceiptSha256 }),
});
function reconcileIndex(entry) { return json({ schema: LEGACY_RECONCILE_SCHEMA, entries: [entry] }); }
function reconciledNoCommitRecord(taskId = "HISTORICAL") {
  return v3(taskId, { outcome: "partial-analysis-only", commits: [], criticRequired: required() });
}
function undelivered(taskId = "UNDELIVERED") {
  return v4(taskId, {
    runner: "antigravity", model: "gemini-3.8-flash-high", effort: "high",
    outcome: "completed-no-delivery", commits: [], report: null,
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "completed-undelivered" },
    observationIdentity: { dispatchId: taskId, attemptId: "attempt-1" },
    criticRequired: required(),
  });
}
function addendum(taskId, recordBytes, criticBytes) {
  return {
    schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA,
    recordPath: `evidence/dispatch-record-${taskId}.json`, recordSha256: sha256(recordBytes),
    taskId, candidateCommit: SHA,
    reviewCandidateCommit,
    criticPacketId, criticReceiptSha256,
    criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId, candidateCommit: SHA,
      path: `evidence/critic-${taskId}.md`, sha256: sha256(criticBytes) },
  };
}

test("immutable v4 undelivered record is covered by an exact byte-bound Critic addendum", () => {
  const taskId = "UNDELIVERED";
  const recordBytes = json(undelivered(taskId));
  const criticBytes = "Independent Critic review for UNDELIVERED.\n";
  const root = fixture({
    [`evidence/dispatch-record-${taskId}.json`]: recordBytes,
    [`evidence/critic-${taskId}.md`]: criticBytes,
    [criticDispositionAddendumPath(taskId)]: json(addendum(taskId, recordBytes, criticBytes)),
  });
  const bound = boundReview(recordBytes);
  const unbound = evaluate(root, [], { gitRead: bound.gitRead });
  assert.equal(unbound.ok, false);
  assert.match(unbound.readFindings.join("\n"), /consumed Critic receipt is unavailable/u);
  const result = evaluate(root, [], bound);
  assert.equal(result.ok, true);
  assert.equal(result.requiredRecordCount, 0);
  assert.equal(result.criticEvidenceRecordCount, 1);
  const review = evaluateReviewAdmission({ root, taskId: "NEXT", candidateCommit: SHA, readChangedPaths: () => [], ...bound });
  assert.equal(review.ok, false);
  assert.equal(review.coveredRecordCount, 1);
  assert.match(review.readFindings.join("\n"), /found 0/u);
});

test("immutable authored Agy v4 record can be resolved by the same independently bound Critic addendum", () => {
  const taskId = "UNDELIVERED";
  const authored = v4(taskId, { runner: "antigravity", model: "gemini-3.8-flash-high",
    effort: "high", outcome: "completed", candidateCommit: SHA,
    resultSha256: sha256("Implemented approved change."), commits: [SHA],
    report: { text: "Implemented approved change.", changedFiles: ["src.txt"] },
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
    criticRequired: required() });
  const recordBytes = json(authored);
  const criticBytes = "Independent review of authored Agy delivery.\n";
  const root = fixture({ [`evidence/dispatch-record-${taskId}.json`]: recordBytes,
    [`evidence/critic-${taskId}.md`]: criticBytes,
    [criticDispositionAddendumPath(taskId)]: json(addendum(taskId, recordBytes, criticBytes)) });
  const reviewed = evaluate(root, ["src.txt"], boundReview(recordBytes));
  assert.equal(reviewed.ok, true, reviewed.readFindings.join("\n"));
  assert.equal(reviewed.criticEvidenceRecordCount, 1);
  assert.equal(verifyCriticDispositionAddendumForRecord({ root, taskId, record: authored,
    recordBytes: Buffer.from(recordBytes), options: boundReview(recordBytes) }).code,
  "critic-addendum-bound");
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`),
    json({ ...authored, commits: [] }));
  assert.match(evaluate(root, ["src.txt"], boundReview(recordBytes)).readFindings.join("\n"),
    /authored-commit terminal record requires candidateCommit/u);
});

test("interrupted Agy v4 remains pending until exact independent Critic review", () => {
  const taskId = "UNDELIVERED";
  const report = "Host observation: Agy invocation interrupted before a validated Final Return.";
  const stopped = v4(taskId, {
    runner: "antigravity", model: "unknown", effort: "high", outcome: "stopped-without-commit",
    resultSha256: sha256(report), commits: [],
    log: [{ phase: "interrupted", toolUseCount: 1,
      note: `attempt:${"1".repeat(32)};reason:AGY-NONZERO-EXIT` }],
    report: { text: report, changedFiles: [] },
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "stopped-without-commit" },
    criticRequired: { schema: CRITIC_REQUIRED_SCHEMA,
      trigger: trigger({ riskFlag: true }), appliedRow: "T4", reason: "Independent review required." },
  });
  const recordBytes = json(stopped);
  const criticBytes = "Independent Critic review for interrupted invocation.\n";
  const root = fixture({ [`evidence/dispatch-record-${taskId}.json`]: recordBytes,
    [`evidence/critic-${taskId}.md`]: criticBytes });
  const pending = evaluate(root, []);
  assert.equal(pending.ok, false);
  assert.match(pending.readFindings.join("\n"), /Critic is required/u);
  writeFileSync(join(root, criticDispositionAddendumPath(taskId)),
    json(addendum(taskId, recordBytes, criticBytes)));
  const reviewed = evaluate(root, [], boundReview(recordBytes));
  assert.equal(reviewed.ok, true, reviewed.readFindings.join("\n"));
  assert.equal(reviewed.criticEvidenceRecordCount, 1);
});

test("Critic addendum checks the reviewed candidate's real Git blob and explicit packet reference", () => {
  const taskId = "UNDELIVERED";
  const recordPath = `evidence/dispatch-record-${taskId}.json`;
  const criticBytes = "Independent Critic review for UNDELIVERED.\n";
  const root = fixture({ "seed.txt": "base\n", [`evidence/critic-${taskId}.md`]: criticBytes });
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  const git = (...args) => execFileSync("git", args, { cwd: root, env: cleanEnv, encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", "seed.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "base");
  const candidateCommit = git("rev-parse", "HEAD");
  const recordBytes = json({ ...undelivered(taskId), candidateCommit });
  writeFileSync(join(root, recordPath), recordBytes);
  git("add", recordPath);
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "review candidate");
  const reviewCommit = git("rev-parse", "HEAD");
  const recordBlob = git("rev-parse", `${reviewCommit}:${recordPath}`);
  const entry = { ...addendum(taskId, recordBytes, criticBytes), candidateCommit, reviewCandidateCommit: reviewCommit,
    criticEvidence: { ...addendum(taskId, recordBytes, criticBytes).criticEvidence, candidateCommit } };
  writeFileSync(join(root, criticDispositionAddendumPath(taskId)), json(entry));
  const review = { packet: { request: { taskId }, references: [{ kind: "evidence", path: recordPath, candidateBlobOid: recordBlob }] },
    critic: { reviewPass: true, candidate: { commit: reviewCommit } }, criticReceiptSha256 };
  const passing = evaluate(root, [], { readBoundCriticReceipt: () => review });
  assert.equal(passing.ok, true, passing.readFindings.join("\n"));
  const unreferenced = evaluate(root, [], { readBoundCriticReceipt: () => ({ ...review, packet: { ...review.packet, references: [] } }) });
  assert.match(unreferenced.readFindings.join("\n"), /does not bind the exact immutable dispatch record/u);
});

test("Critic addendum rejects record drift, evidence drift, forged binding and orphan files", () => {
  const taskId = "UNDELIVERED";
  const recordBytes = json(undelivered(taskId));
  const criticBytes = "Independent Critic review for UNDELIVERED.\n";
  const entry = addendum(taskId, recordBytes, criticBytes);
  const path = criticDispositionAddendumPath(taskId);
  const root = fixture({
    [`evidence/dispatch-record-${taskId}.json`]: recordBytes,
    [`evidence/critic-${taskId}.md`]: criticBytes,
    [path]: json(entry),
  });
  const bound = boundReview(recordBytes);
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), `${recordBytes}\n`);
  assert.match(evaluate(root, []).readFindings.join("\n"), /does not bind an immutable Critic-required/u);
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), recordBytes);
  writeFileSync(join(root, `evidence/critic-${taskId}.md`), "changed\n");
  assert.match(evaluate(root, []).readFindings.join("\n"), /digest mismatch/u);
  writeFileSync(join(root, `evidence/critic-${taskId}.md`), criticBytes);
  writeFileSync(join(root, path), json({ ...entry, candidateCommit: "b".repeat(40) }));
  assert.match(evaluate(root, []).readFindings.join("\n"), /evidence binding|does not bind/u);
  writeFileSync(join(root, path), json(entry));
  const wrongReceipt = evaluate(root, [], { ...bound, readBoundCriticReceipt: () => ({ packet: { request: { taskId } },
    critic: { reviewPass: true, candidate: { commit: reviewCandidateCommit } }, criticReceiptSha256: "f".repeat(64) }) });
  assert.match(wrongReceipt.readFindings.join("\n"), /does not match a passed, consumed/u);
  const wrongTask = evaluate(root, [], { ...bound, readBoundCriticReceipt: () => ({ packet: { request: { taskId: "OTHER" } },
    critic: { reviewPass: true, candidate: { commit: reviewCandidateCommit } }, criticReceiptSha256 }) });
  assert.match(wrongTask.readFindings.join("\n"), /does not match a passed, consumed/u);
  const failedReview = evaluate(root, [], { ...bound, readBoundCriticReceipt: () => ({ packet: { request: { taskId } },
    critic: { reviewPass: false, candidate: { commit: reviewCandidateCommit } }, criticReceiptSha256 }) });
  assert.match(failedReview.readFindings.join("\n"), /does not match a passed, consumed/u);
  const noRecordReference = evaluate(root, [], { ...bound, readBoundCriticReceipt: () => ({ packet: { request: { taskId }, references: [] },
    critic: { reviewPass: true, candidate: { commit: reviewCandidateCommit } }, criticReceiptSha256 }) });
  assert.match(noRecordReference.readFindings.join("\n"), /does not bind the exact immutable dispatch record/u);
  const changedReviewBlob = evaluate(root, [], { ...bound, readGitBlob: () => Buffer.from("different") });
  assert.match(changedReviewBlob.readFindings.join("\n"), /does not bind the exact immutable dispatch record/u);
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), json(v4(taskId, { criticRequired: required() })));
  assert.match(evaluate(root, []).readFindings.join("\n"), /does not bind an immutable Critic-required/u);
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), recordBytes);
  writeFileSync(join(root, "evidence/dispatch-critic-addendum-ORPHAN.json"), json({ ...entry, taskId: "ORPHAN", recordPath: "evidence/dispatch-record-ORPHAN.json" }));
  assert.match(evaluate(root, []).readFindings.join("\n"), /orphan critic addendum/u);
});

test("walkDispatchRecords retains source paths and reports malformed JSON", () => {
  const root = fixture({ "evidence/dispatch-record-A.json": json({ taskId: "A" }), "evidence/dispatch-record-B.json": "{" });
  const result = walkDispatchRecords(root);
  assert.equal(result.filesScanned, 2);
  assert.deepEqual(result.records.map((entry) => entry.path), ["evidence/dispatch-record-A.json"]);
  assert.match(result.findings[0], /dispatch-record-B\.json/u);
});

test("v2 and unversioned dispatch records remain explicit pre-cutover legacy", () => {
  const v2 = v3("V2", {}); v2.schema = "pipeline.dispatch-record.v2";
  const root = fixture({
    "evidence/dispatch-record-OLD.json": json({ taskId: "OLD", outcome: "completed" }),
    "evidence/dispatch-record-V2.json": json(v2),
  });
  const result = evaluate(root);
  assert.equal(result.ok, true);
  assert.equal(result.legacyRecordCount, 2);
  assert.equal(result.applicableRecordCount, 0);
});

test("a byte-bound reconciliation preserves a truthful terminal no-commit record as legacy", () => {
  const recordPath = "evidence/dispatch-record-HISTORICAL.json";
  const recordBytes = json(reconciledNoCommitRecord());
  const evidencePath = "evidence/historical-HISTORICAL-report.md";
  const evidenceBytes = Buffer.from("Historical stop report; no commit was authored.\n");
  const indexBytes = reconcileIndex({
    recordPath, recordSha256: sha256(recordBytes), terminalKind: "read-only",
    disposition: { kind: "evidence", path: evidencePath, sha256: sha256(evidenceBytes) },
  });
  const root = fixture({ [recordPath]: recordBytes, [evidencePath]: evidenceBytes, [DEFAULT_LEGACY_RECONCILE_INDEX_PATH]: indexBytes });
  const result = evaluate(root);
  assert.equal(result.ok, true);
  assert.equal(result.reconciledLegacyRecordCount, 1);
  assert.equal(result.applicableRecordCount, 0);
});

test("historical no-commit reconciliation cannot hide a new v4 undelivered record", () => {
  const recordPath = "evidence/dispatch-record-AGY-UNDELIVERED.json";
  const record = v4("AGY-UNDELIVERED", {
    runner: "antigravity", model: "gemini-3.8-flash-high", effort: "high",
    outcome: "completed-no-delivery", commits: [], report: null,
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "completed-undelivered" },
    observationIdentity: { dispatchId: "AGY-UNDELIVERED", attemptId: "attempt-1" },
    criticRequired: required(),
  });
  const recordBytes = json(record);
  const evidencePath = "evidence/undelivered-note.md";
  const evidenceBytes = "This attempt did not deliver a commit.\n";
  const root = fixture({
    [recordPath]: recordBytes,
    [evidencePath]: evidenceBytes,
    [DEFAULT_LEGACY_RECONCILE_INDEX_PATH]: reconcileIndex({
      recordPath, recordSha256: sha256(recordBytes), terminalKind: "stopped-without-commit",
      disposition: { kind: "evidence", path: evidencePath, sha256: sha256(evidenceBytes) },
    }),
  });
  const result = evaluate(root);
  assert.equal(result.ok, false);
  assert.match(result.readFindings.join("\n"), /v4 record cannot be removed from coverage/u);
  const review = evaluateReviewAdmission({ root, taskId: "AGY-UNDELIVERED", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(review.ok, false);
  assert.match(review.readFindings.join("\n"), /v4 record cannot be removed from review admission/u);
});

test("legacy reconciliation fails closed on source drift, duplicate record paths, and disposition digest drift", () => {
  const recordPath = "evidence/dispatch-record-HISTORICAL.json";
  const recordBytes = json(reconciledNoCommitRecord());
  const evidencePath = "evidence/historical-HISTORICAL-report.md";
  const evidenceBytes = Buffer.from("Historical stop report; no commit was authored.\n");
  const entry = { recordPath, recordSha256: sha256(recordBytes), terminalKind: "read-only", disposition: { kind: "evidence", path: evidencePath, sha256: sha256(evidenceBytes) } };
  const root = fixture({ [recordPath]: recordBytes, [evidencePath]: evidenceBytes, [DEFAULT_LEGACY_RECONCILE_INDEX_PATH]: reconcileIndex(entry) });

  writeFileSync(join(root, recordPath), `${recordBytes}\n`);
  const sourceDrift = evaluate(root);
  assert.equal(sourceDrift.ok, false);
  assert.match(sourceDrift.readFindings.join("\n"), /recordSha256: SHA-256 digest mismatch/u);

  writeFileSync(join(root, recordPath), recordBytes);
  writeFileSync(join(root, DEFAULT_LEGACY_RECONCILE_INDEX_PATH), json({ schema: LEGACY_RECONCILE_SCHEMA, entries: [entry, entry] }));
  const duplicate = evaluate(root);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.readFindings.join("\n"), /duplicates an earlier reconciliation entry/u);

  writeFileSync(join(root, DEFAULT_LEGACY_RECONCILE_INDEX_PATH), reconcileIndex({ ...entry, disposition: { ...entry.disposition, sha256: "f".repeat(64) } }));
  const evidenceDrift = evaluate(root);
  assert.equal(evidenceDrift.ok, false);
  assert.match(evidenceDrift.readFindings.join("\n"), /disposition\.sha256: SHA-256 digest mismatch/u);
});

test("review admission also excludes only a valid byte-bound historical no-commit record", () => {
  const recordPath = "evidence/dispatch-record-HISTORICAL.json";
  const recordBytes = json(reconciledNoCommitRecord());
  const evidencePath = "evidence/historical-HISTORICAL-report.md";
  const evidenceBytes = Buffer.from("Historical stop report; no commit was authored.\n");
  const indexBytes = reconcileIndex({ recordPath, recordSha256: sha256(recordBytes), terminalKind: "read-only", disposition: { kind: "evidence", path: evidencePath, sha256: sha256(evidenceBytes) } });
  const root = fixture({
    [recordPath]: recordBytes, [evidencePath]: evidenceBytes, [DEFAULT_LEGACY_RECONCILE_INDEX_PATH]: indexBytes,
    "evidence/dispatch-record-TARGET.json": json(v4("TARGET", { criticRequired: required() })),
  });
  const result = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(result.ok, true);
  assert.equal(result.applicableRecordCount, 1);
});

test("each v3 dispatch may carry a structured skip decision", () => {
  const root = fixture({
    "evidence/dispatch-record-A.json": json(v3("A", { criticSkip: { ...skip(), reason: "fast path" } })),
    "evidence/dispatch-record-B.json": json(v3("B", { criticSkip: skip() })),
  });
  const result = evaluate(root);
  assert.equal(result.ok, true);
  assert.equal(result.skipRecordCount, 2);
});

test("required disposition remains valid but blocks coverage until evidence replaces it", () => {
  const root = fixture({
    "evidence/dispatch-record-A.json": json(v3("A", { criticRequired: required() })),
  });
  const pending = evaluate(root);
  assert.equal(pending.ok, false);
  assert.equal(pending.requiredRecordCount, 1);
  assert.match(pending.readFindings.join("\n"), /T3.*criticEvidence is missing/u);

  const bytes = Buffer.from("Critic PASS for A\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(root, "evidence", "critic-A.md"), bytes);
  writeFileSync(join(root, "evidence", "dispatch-record-A.json"), json(v3("A", {
    criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: "A", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: digest },
  })));
  const reviewed = evaluate(root);
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.requiredRecordCount, 0);
  assert.equal(reviewed.criticEvidenceRecordCount, 1);
});

test("review admission permits exactly its current pending target while retaining full corpus validation", () => {
  const root = fixture({
    "evidence/dispatch-record-TARGET.json": json(v4("TARGET", { criticRequired: required() })),
    "evidence/dispatch-record-COVERED.json": json(v4("COVERED", { criticSkip: skip() })),
  });
  const admitted = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.admittedCount, 1);
  assert.equal(admitted.coveredRecordCount, 1);
});

test("review admission rejects candidate drift, a second pending record, and malformed corpus evidence", () => {
  const root = fixture({
    "evidence/dispatch-record-TARGET.json": json(v4("TARGET", { criticRequired: required() })),
    "evidence/dispatch-record-OTHER.json": json(v4("OTHER", { criticRequired: required() })),
  });
  const extraPending = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(extraPending.ok, false);
  assert.match(extraPending.readFindings.join("\n"), /only the exact review target may remain pending/u);

  const drifted = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: "b".repeat(40), readChangedPaths: () => [] });
  assert.equal(drifted.ok, false);
  assert.match(drifted.readFindings.join("\n"), /found 0/u);

  writeFileSync(join(root, "evidence", "dispatch-record-BROKEN.json"), "{");
  const malformed = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(malformed.ok, false);
  assert.match(malformed.readFindings.join("\n"), /could not be read as valid JSON/u);
});

test("v4 pending, skipped and evidenced records remain actual coverage consumers, while malformed v4 fails closed", () => {
  const bytes = Buffer.from("Critic PASS for v4\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const pendingRoot = fixture({
    "evidence/dispatch-record-PENDING.json": json(v4("PENDING", { criticRequired: required() })),
    "evidence/dispatch-record-UNDELIVERED.json": json(v4("UNDELIVERED", {
      criticRequired: required(), outcome: "completed-no-delivery",
      outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "completed-undelivered" },
      observationIdentity: { dispatchId: "dispatch-1", attemptId: "attempt-1" },
    })),
    "evidence/dispatch-record-SKIPPED.json": json(v4("SKIPPED", { criticSkip: skip() })),
  });
  const pending = evaluate(pendingRoot);
  assert.equal(pending.ok, false);
  assert.equal(pending.applicableRecordCount, 3);
  assert.equal(pending.requiredRecordCount, 2);
  assert.equal(pending.skipRecordCount, 1);

  const coveredRoot = fixture({
    "evidence/critic-V4.md": bytes,
    "evidence/dispatch-record-SKIPPED.json": json(v4("SKIPPED", { criticSkip: skip() })),
    "evidence/dispatch-record-EVIDENCED.json": json(v4("EVIDENCED", {
      criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: "EVIDENCED", candidateCommit: SHA, path: "evidence/critic-V4.md", sha256: digest },
    })),
  });
  const covered = evaluate(coveredRoot);
  assert.equal(covered.ok, true);
  assert.equal(covered.applicableRecordCount, 2);
  assert.equal(covered.skipRecordCount, 1);
  assert.equal(covered.criticEvidenceRecordCount, 1);

  const malformed = v4("MALFORMED", { criticSkip: skip() });
  delete malformed.outcomeClassification;
  const malformedRoot = fixture({ "evidence/dispatch-record-MALFORMED.json": json(malformed) });
  const malformedResult = evaluate(malformedRoot);
  assert.equal(malformedResult.ok, false);
  assert.match(malformedResult.readFindings.join("\n"), /invalid v4 dispatch record/u);
});

test("false T5 decisions fail validation for A/G/S, high-risk and rigor triggers", () => {
  const variants = [
    trigger({ diff: { mechanical: false, architecture: true, guardrails: false, security: false } }),
    trigger({ diff: { mechanical: false, architecture: false, guardrails: true, security: false } }),
    trigger({ diff: { mechanical: false, architecture: false, guardrails: false, security: true } }),
    trigger({ riskClass: "high" }),
    trigger({ rigorLevel: 2 }),
    trigger({ rigorLevel: 1 }),
  ];
  for (const [index, triggerInput] of variants.entries()) {
    const root = fixture({ [`evidence/dispatch-record-A${index}.json`]: json(v3(`A${index}`, { criticSkip: { ...skip(), trigger: triggerInput } })) });
    const result = evaluate(root);
    assert.equal(result.ok, false);
    assert.match(result.readFindings.join("\n"), /appliedRow must equal evaluated row|not valid for trigger row/u);
  }
});

test("a v3 Critic reference must resolve and match its exact artifact digest", () => {
  const bytes = Buffer.from("Critic PASS for A\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const criticEvidence = { schema: "pipeline.critic-evidence-reference.v1", taskId: "A", candidateCommit: SHA, path: "backlog/evidence/critic-A.md", sha256: digest };
  const root = fixture({
    "backlog/evidence/critic-A.md": bytes,
    "evidence/dispatch-record-A.json": json(v3("A", { criticEvidence })),
  });
  const result = evaluate(root);
  assert.equal(result.ok, true);
  assert.equal(result.criticEvidenceRecordCount, 1);
});

test("a global critic-named file never exempts an unrelated v3 dispatch", () => {
  const root = fixture({
    "evidence/critic-report-some-other-task.json": "{}\n",
    "evidence/dispatch-record-A.json": json(v3("A", {})),
  });
  const result = evaluate(root);
  assert.equal(result.ok, false);
  assert.equal(result.criticEvidenceRecordCount, 0);
  assert.match(result.readFindings.join("\n"), /requires exactly one of criticSkip, criticRequired or criticEvidence/u);
});

test("one valid reference does not cover a second unrelated v3 dispatch", () => {
  const bytes = Buffer.from("Critic PASS for A\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const root = fixture({
    "evidence/critic-A.md": bytes,
    "evidence/dispatch-record-A.json": json(v3("A", { criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: "A", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: digest } })),
    "evidence/dispatch-record-B.json": json(v3("B", {})),
  });
  const result = evaluate(root);
  assert.equal(result.ok, false);
  assert.equal(result.criticEvidenceRecordCount, 1);
  assert.equal(result.applicableRecordCount, 2);
});

test("wrong task binding, candidate binding, missing artifact and digest mismatch fail closed", () => {
  const bytes = Buffer.from("Critic PASS\n");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const variants = [
    { taskId: "OTHER", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: digest },
    { taskId: "A", candidateCommit: "b".repeat(40), path: "evidence/critic-A.md", sha256: digest },
    { taskId: "A", candidateCommit: SHA, path: "evidence/missing.md", sha256: digest },
    { taskId: "A", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: "f".repeat(64) },
  ];
  for (const variant of variants) {
    const criticEvidence = { schema: "pipeline.critic-evidence-reference.v1", ...variant };
    const root = fixture({ "evidence/critic-A.md": bytes, "evidence/dispatch-record-A.json": json(v3("A", { criticEvidence })) });
    assert.equal(evaluate(root).ok, false);
  }
});

test("missing evidence directory is operationally not-ok", () => {
  const root = mkdtempSync(join(tmpdir(), "check-critic-skip-no-evidence-"));
  const result = evaluate(root);
  assert.equal(result.ok, false);
  assert.match(result.readFindings[0], /missing or unreadable/u);
});

test("actual commit paths reject false T5/T0 and allow generated lockfile T0", () => {
  const t0 = { schema: CRITIC_SKIP_SCHEMA, trigger: trigger({ diff: { mechanical: true, architecture: false, guardrails: false, security: false } }), appliedRow: "T0" };
  const falseT5Root = fixture({ "evidence/dispatch-record-A.json": json(v3("A", { criticSkip: skip() })) });
  const falseT5 = evaluate(falseT5Root, ["plugins/pipeline-core/hooks/guard-push.mjs"]);
  assert.equal(falseT5.ok, false);
  assert.match(falseT5.readFindings.join("\n"), /undeclared guardrails/u);

  const falseT0Root = fixture({ "evidence/dispatch-record-B.json": json(v3("B", { criticSkip: t0 })) });
  assert.match(evaluate(falseT0Root, ["src/runtime.mjs"]).readFindings.join("\n"), /outside conservative generated\/lockfile/u);

  const trueT0Root = fixture({ "evidence/dispatch-record-C.json": json(v3("C", { criticSkip: t0 })) });
  assert.equal(evaluate(trueT0Root, ["generated/client.mjs", "package-lock.json"]).ok, true);
});

test("empty commit paths preserve T5 admission and reject T0", () => {
  const t0 = { schema: CRITIC_SKIP_SCHEMA, trigger: trigger({ diff: { mechanical: true, architecture: false, guardrails: false, security: false } }), appliedRow: "T0" };
  const t5Root = fixture({ "evidence/dispatch-record-T5.json": json(v3("T5", { criticSkip: skip() })) });
  assert.equal(evaluate(t5Root, []).ok, true);

  const t0Root = fixture({ "evidence/dispatch-record-T0.json": json(v3("T0", { criticSkip: t0 })) });
  const result = evaluate(t0Root, []);
  assert.equal(result.ok, false);
  assert.match(result.readFindings.join("\n"), /T0 mechanical disposition includes a path outside conservative generated\/lockfile surfaces/u);
});

test("git path reader uses argv-only diff-tree and NUL-delimited output", () => {
  const calls = [];
  const paths = readCommitChangedPaths("/repo", [SHA], { execFile(command, args, options) {
    calls.push({ command, args, options });
    return Buffer.from("src/a.mjs\0hooks/guard.mjs\0");
  } });
  assert.deepEqual(paths, ["hooks/guard.mjs", "src/a.mjs"]);
  assert.equal(calls[0].command, "git");
  assert.deepEqual(calls[0].args.at(-1), SHA);
  assert.equal(calls[0].options.cwd, "/repo");
});

test("git path reader returns an empty array for a valid zero-path commit", () => {
  const calls = [];
  const paths = readCommitChangedPaths("/repo", [SHA], { execFile(command, args, options) {
    calls.push({ command, args, options });
    return Buffer.alloc(0);
  } });
  assert.deepEqual(paths, []);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.at(-1), SHA);
});

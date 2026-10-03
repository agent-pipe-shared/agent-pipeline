#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { DEFAULT_ABANDONED_V3_RECOVERY_INDEX_PATH, DEFAULT_LEGACY_RECONCILE_INDEX_PATH, LEGACY_RECONCILE_SCHEMA, createLocalDispatchEvidenceBinding, evaluateRepositoryCriticSkipCoverage, evaluateReviewAdmission, evaluateSignedQualityImportReviewAdmission, readCommitChangedPaths, verifyCriticDispositionAddendumForRecord, walkDispatchRecords } from "./check-critic-skip-coverage.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../lib/critic-skip-decision.mjs";
import { CRITIC_DISPOSITION_ADDENDUM_SCHEMA, criticDispositionAddendumPath, validateCriticDispositionAddendum } from "../lib/critic-disposition-addendum.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";

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
const boundReview = (recordBytes, taskId = "UNDELIVERED") => ({
  gitRead: (args) => args[1] === "--git-common-dir" ? ".git" : recordBlobOid,
  readGitBlob: () => Buffer.from(recordBytes),
  readBoundCriticReceipt: () => ({ packet: { request: { taskId },
    references: [{ kind: "evidence", path: `evidence/dispatch-record-${taskId}.json`, candidateBlobOid: recordBlobOid }] },
  critic: { reviewPass: true, candidate: { commit: reviewCandidateCommit } }, criticReceiptSha256 }),
});
function localDispatchSnapshot(taskId, recordBytes, overrides = {}) {
  const targetReviewCommit = overrides.reviewCandidateCommit ?? reviewCandidateCommit;
  const record = JSON.parse(recordBytes);
  const binding = {
    schema: "pipeline.local-dispatch-evidence.v1",
    taskId,
    recordPath: `evidence/dispatch-record-${taskId}.json`,
    recordSha256: sha256(recordBytes),
    sourceCandidateCommit: record.candidateCommit,
    reviewCandidateCommit: targetReviewCommit,
    ...overrides,
  };
  return { ...binding, snapshotId: sha256Canonical(binding) };
}
function boundLocalDispatchReview(recordBytes, taskId, localDispatchEvidence = localDispatchSnapshot(taskId, recordBytes), root = null) {
  const gitRead = root
    ? (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
    : (args) => args[1] === "--git-common-dir" ? ".git" : recordBlobOid;
  return {
    gitRead,
    readBoundCriticReceipt: () => ({
      packet: { request: { taskId }, candidate: { commit: localDispatchEvidence.reviewCandidateCommit }, references: [],
        coordinatorOnly: { localDispatchEvidence } },
      critic: { reviewPass: true, candidate: { commit: localDispatchEvidence.reviewCandidateCommit } }, criticReceiptSha256,
    }),
  };
}
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

function signedImportFixture({ stamp = true, changedPath = false, alterManifest = false, wrongPrefix = false, mismatchedTimestamps = false,
  timestamp = "20261002142748" } = {}) {
  const paths = [
    ["codex", "plugins/pipeline-core/.codex-plugin/plugin.json"],
    ["claude", "plugins/pipeline-core/.claude-plugin/plugin.json"],
    ["antigravity", "plugins/pipeline-core/plugin.json"],
  ];
  const initialFiles = { ".gitignore": "/evidence/\n", "source.txt": "base\n" };
  for (const [runner, path] of paths) {
    initialFiles[path] = json({ name: "pipeline-core", version: `0.7.0+${runner}.20261001120000.abcdef12` });
  }
  const root = fixture(initialFiles);
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const blob = (commit, path) => execFileSync("git", ["show", `${commit}:${path}`], { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("add", ".gitignore", "source.txt", ...paths.map(([, path]) => path));
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "base source");
  writeFileSync(join(root, "source.txt"), "integrated source\n");
  git("add", "source.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "signed import candidate");
  const integrationCommit = git("rev-parse", "HEAD");
  const baseCommit = git("rev-parse", `${integrationCommit}^`);
  const intentSha256 = "a".repeat(64);
  let candidateCommit = integrationCommit;
  if (stamp) {
    const prefix = wrongPrefix ? "ffffffff" : integrationCommit.slice(0, 8);
    for (const [runner, path] of paths) {
      const rawBefore = blob(integrationCommit, path);
      const before = JSON.parse(rawBefore);
      const versionTimestamp = mismatchedTimestamps && runner === "claude" ? "20261002142749" : timestamp;
      const after = `0.7.0+${runner}.${versionTimestamp}.${prefix}`;
      writeFileSync(join(root, path), rawBefore.replace(JSON.stringify(before.version), JSON.stringify(after)));
    }
    if (alterManifest) {
      const [runner, path] = paths[0];
      const value = JSON.parse(blob(integrationCommit, path));
      value.name = "different-package";
      const versionTimestamp = mismatchedTimestamps && runner === "claude" ? "20261002142749" : timestamp;
      value.version = `0.7.0+${runner}.${versionTimestamp}.${prefix}`;
      writeFileSync(join(root, path), json(value));
    }
    if (changedPath) writeFileSync(join(root, "outside-version-surface.txt"), "unexpected\n");
    git("add", "-A");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "stamp candidate");
    candidateCommit = git("rev-parse", "HEAD");
  }
  const anchor = { schema: "pipeline.signed-quality-import-review-anchor.v1", intentSha256,
    integrationCommit, baseCommit, candidateCommit, taskId: `signed-import-${intentSha256}` };
  return { root, anchor };
}

function abandonedRecoveryFiles() {
  const recordRows = [
    v3("ALF-ADOPTION-PROOF", { candidateCommit: null, criticRequired: required() }),
    v3("ALF-RECOVERY-PLAN", { criticRequired: required() }),
  ];
  const paths = recordRows.map((record) => `evidence/dispatch-record-${record.taskId}.json`);
  const bytes = recordRows.map(json);
  const observation = json({ schema: "pipeline.abandoned-v3-dispatch-recovery-observation.v1",
    observedAt: "2026-10-02T09:20:03Z", baseHead: SHA,
    records: recordRows.map((record, index) => ({ taskId: record.taskId, recordPath: paths[index],
      recordSha256: sha256(bytes[index]), schema: record.schema, outcome: record.outcome,
      candidateCommit: record.candidateCommit, commits: record.commits })),
    coordinatorQueue: { observedAt: "2026-10-02T09:20:03Z", dispatchesFound: false,
      taskIds: recordRows.map((record) => record.taskId), scope: "current coordinator queue snapshot only" },
    scope: "administrative-retirement-only; no worker-terminal, delivery, completion, or Critic-pass claim" });
  const entries = recordRows.map((record, index) => ({ taskId: record.taskId, recordPath: paths[index],
    recordSha256: sha256(bytes[index]), recordSchema: record.schema, outcome: record.outcome,
    candidateCommit: record.candidateCommit, commits: record.commits, disposition: "abandoned-no-delivery",
    observationPath: "evidence/alf-abandoned-v3-recovery-observation.json", observationSha256: sha256(observation) }));
  const index = json({ schema: "pipeline.abandoned-v3-dispatch-recovery-index.v1", entries });
  return Object.fromEntries([
    ["evidence/dispatch-record-ALF-ADOPTION-PROOF.json", bytes[0]],
    ["evidence/dispatch-record-ALF-RECOVERY-PLAN.json", bytes[1]],
    ["evidence/alf-abandoned-v3-recovery-observation.json", observation],
    [DEFAULT_ABANDONED_V3_RECOVERY_INDEX_PATH, index],
  ]);
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

test("immutable authored v3 record can be resolved by a consumed task-bound Critic receipt", () => {
  const taskId = "LEGACY-AUTHORED";
  const authored = v3(taskId, { candidateCommit: SHA, outcome: "completed", resultSha256: sha256("Done."),
    commits: [SHA], report: { text: "Done.", changedFiles: ["src.txt"] }, criticRequired: required() });
  const recordBytes = json(authored);
  const criticBytes = "Independent Critic review of authored v3 delivery.\n";
  const root = fixture({ [`evidence/dispatch-record-${taskId}.json`]: recordBytes,
    [`evidence/critic-${taskId}.md`]: criticBytes,
    [criticDispositionAddendumPath(taskId)]: json(addendum(taskId, recordBytes, criticBytes)) });
  const reviewed = evaluate(root, ["src.txt"], boundReview(recordBytes, taskId));
  assert.equal(reviewed.ok, true, reviewed.readFindings.join("\n"));
  assert.equal(reviewed.requiredRecordCount, 0);
  assert.equal(reviewed.criticEvidenceRecordCount, 1);

  for (const stale of [
    v3(taskId, { criticRequired: required() }),
    v3(taskId, { outcome: "completed", candidateCommit: SHA, resultSha256: sha256("No delivery."), commits: [],
      report: { text: "No delivery.", changedFiles: [] }, criticRequired: required() }),
  ]) {
    assert.throws(() => validateCriticDispositionAddendum(addendum(taskId, recordBytes, criticBytes), {
      recordPath: `evidence/dispatch-record-${taskId}.json`, recordBytes, record: stale,
    }), /authored v3\/v4/u);
  }
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

test("ignored historical dispatch records bind through the consumed private snapshot only", () => {
  const taskId = "HISTORICAL-AUTHORED";
  const root = fixture({ "source.txt": "reviewed source\n", "evidence/.keep": "" });
  writeFileSync(join(root, ".gitignore"), "/evidence/\n");
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", ".gitignore", "source.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "historical candidate");
  const candidateCommit = git("rev-parse", "HEAD");
  assert.doesNotThrow(() => git("check-ignore", "-q", `evidence/dispatch-record-${taskId}.json`));
  const record = v3(taskId, { candidateCommit, outcome: "completed", resultSha256: sha256("Done."),
    commits: [candidateCommit], report: { text: "Private implementation prose that must not be exported.", changedFiles: ["source.txt"] },
    criticRequired: required() });
  const recordBytes = json(record);
  const criticBytes = "Independent Critic review of the historical source range.\n";
  const recordPath = `evidence/dispatch-record-${taskId}.json`;
  writeFileSync(join(root, recordPath), recordBytes);
  writeFileSync(join(root, `evidence/critic-${taskId}.md`), criticBytes);
  const entry = { ...addendum(taskId, recordBytes, criticBytes), candidateCommit, reviewCandidateCommit: candidateCommit,
    criticEvidence: { ...addendum(taskId, recordBytes, criticBytes).criticEvidence, candidateCommit } };
  assert.throws(() => execFileSync("git", ["cat-file", "-e", `${candidateCommit}:${recordPath}`], { cwd: root, stdio: "ignore" }));
  const binding = localDispatchSnapshot(taskId, recordBytes, { reviewCandidateCommit: candidateCommit });
  assert.deepEqual(createLocalDispatchEvidenceBinding({ root, taskId, reviewCandidateCommit: candidateCommit }), binding);
  writeFileSync(join(root, criticDispositionAddendumPath(taskId)), json(entry));
  const valid = evaluate(root, ["source.txt"], boundLocalDispatchReview(recordBytes, taskId, binding, root));
  assert.equal(valid.ok, true, valid.readFindings.join("\n"));
  assert.equal(valid.criticEvidenceRecordCount, 1);

  for (const malformed of [
    localDispatchSnapshot("OTHER-TASK", recordBytes, { reviewCandidateCommit: candidateCommit }),
    localDispatchSnapshot(taskId, recordBytes, { reviewCandidateCommit: candidateCommit, sourceCandidateCommit: "f".repeat(40) }),
    localDispatchSnapshot(taskId, recordBytes, { reviewCandidateCommit: candidateCommit, recordSha256: "f".repeat(64) }),
    { ...localDispatchSnapshot(taskId, recordBytes, { reviewCandidateCommit: candidateCommit }), snapshotId: "f".repeat(64) },
    { ...localDispatchSnapshot(taskId, recordBytes, { reviewCandidateCommit: candidateCommit }), recordContent: record.report.text },
  ]) {
    const result = evaluate(root, ["source.txt"], boundLocalDispatchReview(recordBytes, taskId, malformed, root));
    assert.match(result.readFindings.join("\n"), /private local dispatch snapshot does not bind/u);
  }

  const exposed = localDispatchSnapshot(taskId, recordBytes, { reviewCandidateCommit: candidateCommit });
  const exposedBound = boundLocalDispatchReview(recordBytes, taskId, exposed, root);
  exposedBound.readBoundCriticReceipt = () => ({
    packet: { request: { taskId }, candidate: { commit: candidateCommit },
      references: [{ kind: "evidence", path: `evidence/dispatch-record-${taskId}.json`, candidateBlobOid: recordBlobOid }],
      coordinatorOnly: { localDispatchEvidence: exposed } },
    critic: { reviewPass: true, candidate: { commit: candidateCommit } }, criticReceiptSha256,
  });
  assert.match(evaluate(root, ["source.txt"], exposedBound).readFindings.join("\n"),
    /private local dispatch snapshot does not bind/u);

  const arbitraryPacketOnly = evaluate(root, ["source.txt"], { gitRead: (args) => args[1] === "--git-common-dir" ? ".git" : recordBlobOid });
  assert.notEqual(arbitraryPacketOnly.ok, true);
  assert.match(arbitraryPacketOnly.readFindings.join("\n"), /consumed Critic receipt is unavailable/u);
});

test("signed quality import admission rejects unsigned imports and requires clean version-only descendants", () => {
  const valid = signedImportFixture();
  const unsigned = evaluateSignedQualityImportReviewAdmission(valid);
  assert.equal(unsigned.ok, false);
  assert.equal(unsigned.code, "signed-import-not-authorized", JSON.stringify(unsigned));

  const exactImport = signedImportFixture({ stamp: false });
  const unsignedExact = evaluateSignedQualityImportReviewAdmission(exactImport);
  assert.equal(unsignedExact.code, "signed-import-not-authorized");

  const withExtraPath = signedImportFixture({ changedPath: true });
  assert.equal(evaluateSignedQualityImportReviewAdmission(withExtraPath).code, "signed-import-nonversion-path");

  const changedManifest = signedImportFixture({ alterManifest: true });
  assert.equal(evaluateSignedQualityImportReviewAdmission(changedManifest).code, "signed-import-nonversion-manifest-change");

  const wrongPrefix = signedImportFixture({ wrongPrefix: true });
  assert.equal(evaluateSignedQualityImportReviewAdmission(wrongPrefix).code, "signed-import-version-binding");

  const splitTimestamp = signedImportFixture({ mismatchedTimestamps: true });
  assert.equal(evaluateSignedQualityImportReviewAdmission(splitTimestamp).code, "signed-import-version-timestamp");

  const wrongTask = { ...valid, anchor: { ...valid.anchor, taskId: "ordinary-worker" } };
  assert.equal(evaluateSignedQualityImportReviewAdmission(wrongTask).code, "signed-import-anchor-shape");

  const wrongBase = { ...valid, anchor: { ...valid.anchor, baseCommit: "f".repeat(40) } };
  assert.equal(evaluateSignedQualityImportReviewAdmission(wrongBase).code, "signed-import-base-mismatch");

  const wrongCandidate = { ...valid, anchor: { ...valid.anchor, candidateCommit: valid.anchor.baseCommit } };
  assert.equal(evaluateSignedQualityImportReviewAdmission(wrongCandidate).code, "signed-import-candidate-ancestry");
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
  assert.equal(admitted.targetRecordCandidateCommit, SHA);
  assert.equal(admitted.candidateCommit, SHA);
  assert.equal(admitted.admittedByDescendant, false);
});

test("review admission allows a second structurally valid pending record but keeps coverage blocked", () => {
  const root = fixture({
    "evidence/dispatch-record-TARGET.json": json(v4("TARGET", { criticRequired: required() })),
    "evidence/dispatch-record-OTHER.json": json(v4("OTHER", { criticRequired: required() })),
  });
  const extraPending = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(extraPending.ok, true, extraPending.readFindings.join("\n"));
  assert.equal(extraPending.admittedCount, 1);
  assert.equal(extraPending.pendingRecordCount, 1);
  assert.deepEqual(extraPending.pendingRecordPaths, ["evidence/dispatch-record-OTHER.json"]);
  const coverage = evaluate(root);
  assert.equal(coverage.ok, false);
  assert.equal(coverage.requiredRecordCount, 2);

  writeFileSync(join(root, "evidence", "dispatch-critic-addendum-OTHER.json"), "{}\n");
  const malformedAddendum = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(malformedAddendum.ok, false);
  assert.match(malformedAddendum.readFindings.join("\n"), /invalid critic addendum/u);

  const drifted = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: "b".repeat(40), readChangedPaths: () => [] });
  assert.equal(drifted.ok, false);
  assert.match(drifted.readFindings.join("\n"), /found 0/u);
});

test("review admission follows the exact authored record candidate to its descendant review candidate", () => {
  const root = fixture({ "src/change.txt": "source change\n" });
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  const git = (...args) => execFileSync("git", args, { cwd: root, env: cleanEnv, encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", "src/change.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "authored source");
  const sourceCandidate = git("rev-parse", "HEAD");
  const recordPath = "evidence/dispatch-record-ANCESTOR-TARGET.json";
  const record = v3("ANCESTOR-TARGET", { outcome: "completed", candidateCommit: sourceCandidate,
    resultSha256: sha256("Completed delivery."), commits: [sourceCandidate],
    report: { text: "Completed delivery.", changedFiles: ["src/change.txt"] }, criticRequired: required() });
  writeFileSync(join(root, recordPath), json(record));
  git("add", recordPath);
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "persist dispatch record");
  const reviewCandidate = git("rev-parse", "HEAD");
  const admitted = evaluateReviewAdmission({ root, taskId: record.taskId,
    candidateCommit: reviewCandidate, readChangedPaths: () => [] });
  assert.equal(admitted.ok, true, admitted.readFindings.join("\n"));
  assert.equal(admitted.admittedByDescendant, true);
  assert.equal(admitted.targetRecordCandidateCommit, sourceCandidate);
  assert.equal(admitted.candidateCommit, reviewCandidate);

  const tree = git("rev-parse", `${reviewCandidate}^{tree}`);
  const unrelated = git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "commit-tree", tree, "-m", "unrelated root");
  const stale = evaluateReviewAdmission({ root, taskId: record.taskId,
    candidateCommit: unrelated, readChangedPaths: () => [] });
  assert.equal(stale.ok, false);
  assert.match(stale.readFindings.join("\n"), /not a descendant/u);
  const wrongTask = evaluateReviewAdmission({ root, taskId: "OTHER-TASK",
    candidateCommit: reviewCandidate, readChangedPaths: () => [] });
  assert.equal(wrongTask.ok, false);
});

test("review admission still rejects malformed corpus evidence while another record is pending", () => {
  const root = fixture({
    "evidence/dispatch-record-TARGET.json": json(v4("TARGET", { criticRequired: required() })),
    "evidence/dispatch-record-OTHER.json": json(v4("OTHER", { criticRequired: required() })),
  });
  writeFileSync(join(root, "evidence", "dispatch-record-BROKEN.json"), "{");
  const malformed = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(malformed.ok, false);
  assert.match(malformed.readFindings.join("\n"), /could not be read as valid JSON/u);
});

test("signed recovery index retires exactly two source-bound zero-commit v3 rows without covering authored reviews", () => {
  const files = abandonedRecoveryFiles();
  const authored = v4("AUTHORED", { outcome: "completed", resultSha256: sha256("Complete."), commits: [SHA],
    report: { text: "Complete.", changedFiles: [] },
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
    criticRequired: required() });
  files["evidence/dispatch-record-TARGET.json"] = json(v4("TARGET", { criticRequired: required() }));
  files["evidence/dispatch-record-AUTHORED.json"] = json(authored);
  const root = fixture(files);
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  const git = (...args) => execFileSync("git", args, { cwd: root, env: cleanEnv, encoding: "utf8" }).trim();
  const intentSha256 = "f".repeat(64);
  git("init", "-q");
  git("add", "evidence");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm",
    `signed-package fixture\n\nDispatch: quality-package-${intentSha256} (integration)\nAI-Assisted: true`);
  const ownerCommit = git("rev-parse", "HEAD");
  const noProof = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [],
    verifyQualityPackageIntegrationPostCommit: () => ({ ok: false, code: "missing-proof" }) });
  assert.equal(noProof.ok, false);
  assert.match(noProof.readFindings.join("\n"), /signed quality-package post-commit verification failed/u);

  const proof = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [],
    verifyQualityPackageIntegrationPostCommit: (input) => {
      assert.deepEqual(input, { repoRoot: root, commitSha: ownerCommit, intentSha256 });
      return { ok: true, code: "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED" };
    } });
  assert.equal(proof.ok, true, proof.readFindings.join("\n"));
  assert.equal(proof.administrativelyRetiredRecordCount, 2);
  assert.equal(proof.pendingRecordCount, 1);
  assert.deepEqual(proof.pendingRecordPaths, ["evidence/dispatch-record-AUTHORED.json"]);
  const coverage = evaluate(root, [], { verifyQualityPackageIntegrationPostCommit: () => ({
    ok: true, code: "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED" }) });
  assert.equal(coverage.ok, false);
  assert.equal(coverage.administrativelyRetiredRecordCount, 2);
  assert.equal(coverage.requiredRecordCount, 2, "the review target and authored pending record still require coverage");

  const adoptionPath = join(root, "evidence/dispatch-record-ALF-ADOPTION-PROOF.json");
  const adoptionBytes = files["evidence/dispatch-record-ALF-ADOPTION-PROOF.json"];
  writeFileSync(adoptionPath, "{\n");
  const malformedSource = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA,
    verifyQualityPackageIntegrationPostCommit: () => ({ ok: true, code: "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED" }) });
  assert.equal(malformedSource.ok, false);
  assert.match(malformedSource.readFindings.join("\n"), /recordSha256 does not match the current record|could not be read as valid JSON/u);
  writeFileSync(adoptionPath, adoptionBytes);
  writeFileSync(adoptionPath, json(v4("ALF-ADOPTION-PROOF", { criticRequired: required() })));
  const v4Substitution = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA,
    verifyQualityPackageIntegrationPostCommit: () => ({ ok: true, code: "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED" }) });
  assert.equal(v4Substitution.ok, false);
  assert.match(v4Substitution.readFindings.join("\n"), /recordSha256 does not match the current record|current source row is not the exact in-progress zero-commit v3/u);
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

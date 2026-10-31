#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { DEFAULT_ABANDONED_V3_RECOVERY_INDEX_PATH, DEFAULT_LEGACY_RECONCILE_INDEX_PATH, LEGACY_RECONCILE_SCHEMA, createLocalDispatchEvidenceBinding, evaluateRepositoryCriticSkipCoverage, evaluateReviewAdmission, evaluateSignedQualityImportReviewAdmission, readCommitChangedPaths, verifyCriticDispositionAddendumForRecord, walkDispatchRecords } from "./check-critic-skip-coverage.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../lib/critic-skip-decision.mjs";
import { CRITIC_DISPOSITION_ADDENDUM_SCHEMA, criticDispositionAddendumPath, validateCriticDispositionAddendum } from "../lib/critic-disposition-addendum.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";
import { compileCriticReviewLineage } from "../lib/critic-review-lineage.mjs";
import { ORCHESTRATOR_ATTESTATION_SCHEMA, ORCHESTRATOR_ATTESTED_ASSURANCE, reportSha256 } from "../lib/dispatch-record.mjs";

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
    assurance: null,
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
    log: [{ phase: "verify", toolUseCount: 1 }],
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

test("D173 the local dispatch evidence error without a source record carries a stable code and the old message", () => {
  const taskId = "D173-NO-SOURCE";
  const root = fixture({ "source.txt": "reviewed source\n", "evidence/.keep": "" });
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", "source.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "candidate");
  const reviewCandidateCommit = git("rev-parse", "HEAD");
  assert.throws(() => createLocalDispatchEvidenceBinding({ root, taskId, reviewCandidateCommit }),
    (error) => error.constructor === Error && error.code === "LDE-SOURCE-RECORD-MISSING"
      && error.message === "local dispatch evidence requires one exact source record");
});

test("D176 the admission refusal without a dispatch record names the expected record, its producer and the PO-decision route", () => {
  const root = fixture({ "evidence/.keep": "" });
  const result = evaluateReviewAdmission({ root, taskId: "NEXT", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(result.ok, false);
  const text = result.readFindings.join("\n");
  assert.match(text, /evidence\/dispatch-record-NEXT\.json/u);
  assert.match(text, /host/u);
  assert.match(text, /foreground/u);
  assert.match(text, /cannot be authored/u);
  assert.match(text, /attested-request/u);
});

test("D176 the admission refusal keeps its original prefix byte-identical", () => {
  const root = fixture({ "evidence/.keep": "" });
  const result = evaluateReviewAdmission({ root, taskId: "NEXT", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.ok(result.readFindings.some((f) => f.startsWith(`review admission requires exactly one matching target for NEXT@${SHA}; found 0`)));
});

test("D176 an admitted target carries no refusal suffix", () => {
  const root = fixture({ "evidence/dispatch-record-TARGET.json": json(v4("TARGET", { criticRequired: required() })) });
  const result = evaluateReviewAdmission({ root, taskId: "TARGET", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(result.ok, true, result.readFindings.join("\n"));
  assert.doesNotMatch(result.readFindings.join("\n"), /dispatch-record-TARGET|foreground/u);
});

test("D176 the suffix appears exactly once when the zero-target refusal comes with other findings", () => {
  const root = fixture({
    "evidence/dispatch-record-OTHER.json": json(v4("OTHER", { criticRequired: required() })),
    "evidence/dispatch-critic-addendum-OTHER.json": "{}\n",
  });
  const result = evaluateReviewAdmission({ root, taskId: "NEXT", candidateCommit: SHA, readChangedPaths: () => [] });
  assert.equal(result.ok, false);
  const text = result.readFindings.join("\n");
  assert.match(text, /invalid critic addendum/u);
  assert.equal(text.split("foreground").length - 1, 1);
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
  assert.equal(binding.assurance, null, "an authored-commit record binds assurance null");
  assert.equal(evaluate(root, ["source.txt"], boundLocalDispatchReview(recordBytes, taskId, localDispatchSnapshot(taskId, recordBytes, { reviewCandidateCommit: candidateCommit, assurance: "orchestrator-attested" }), root)).ok, true,
    "a closed attested-assurance binding is accepted by the binding check");

  for (const malformed of [
    localDispatchSnapshot(taskId, recordBytes, { reviewCandidateCommit: candidateCommit, assurance: "host-observed" }),
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

test("taskIds scopes the evaluation to the records those ids own and names the uncovered required ones", () => {
  const root = fixture({
    "evidence/dispatch-record-A.json": json(v3("A", { criticRequired: required() })),
    "evidence/dispatch-record-B.json": json(v3("B", { criticRequired: required() })),
  });
  const unscoped = evaluate(root);
  assert.equal(unscoped.requiredRecordCount, 2);
  assert.equal("requiredTaskIds" in unscoped, false, "without taskIds the result shape is unchanged");
  const scoped = evaluate(root, undefined, { taskIds: ["B"] });
  assert.equal(scoped.requiredRecordCount, 1);
  assert.equal(scoped.applicableRecordCount, 1);
  assert.deepEqual(scoped.requiredTaskIds, ["B"]);
  assert.doesNotMatch(scoped.readFindings.join("\n"), /dispatch-record-A/u, "an out-of-scope record raises no finding");
  const both = evaluate(root, undefined, { taskIds: new Set(["B", "A", "NOT-A-RECORD"]) });
  assert.deepEqual(both.requiredTaskIds, ["A", "B"], "ids are sorted and any iterable is accepted");
  const none = evaluate(root, undefined, { taskIds: [] });
  assert.deepEqual(none.requiredTaskIds, []);
  assert.equal(none.applicableRecordCount, 0);
});

test("taskIds reports a required record only until matching Critic evidence replaces it, and ownership is sliceId ?? taskId", () => {
  const bytes = Buffer.from("Critic PASS for A\n");
  const root = fixture({
    "evidence/dispatch-record-A.json": json(v3("A", {
      criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: "A", candidateCommit: SHA, path: "evidence/critic-A.md", sha256: sha256(bytes) },
    })),
    "evidence/critic-A.md": bytes,
    "evidence/dispatch-record-C.json": json({ ...v3("C", { criticRequired: required() }), sliceId: "S1" }),
  });
  const covered = evaluate(root, undefined, { taskIds: ["A"] });
  assert.deepEqual(covered.requiredTaskIds, []);
  assert.equal(covered.criticEvidenceRecordCount, 1);
  assert.equal(evaluate(root, undefined, { taskIds: ["C"] }).applicableRecordCount, 0, "a record owned by its sliceId is not selected by its taskId");
  assert.equal(evaluate(root, undefined, { taskIds: ["S1"] }).applicableRecordCount, 1, "a record is selected by its sliceId");
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
    log: [{ phase: "verify", toolUseCount: 1 }],
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

// D104: the repository no longer carries a recovery index. An absent index is the
// normal case; it retires nothing, produces no finding of its own, and every
// record stays subject to the ordinary per-record Critic disposition.
test("an absent abandoned-v3 recovery index is normal and retires no record", () => {
  const clean = fixture({ "evidence/dispatch-record-T5.json": json(v3("T5", { criticSkip: skip() })) });
  const none = evaluate(clean, []);
  assert.equal(none.ok, true, none.readFindings.join("\n"));
  assert.equal(none.administrativelyRetiredRecordCount, 0);
  assert.deepEqual(none.readFindings, []);

  // The two historical task IDs get no special treatment without the index.
  const named = fixture({
    "evidence/dispatch-record-ALF-ADOPTION-PROOF.json": json(v3("ALF-ADOPTION-PROOF", { candidateCommit: null, criticRequired: required() })),
    "evidence/dispatch-record-ALF-RECOVERY-PLAN.json": json(v3("ALF-RECOVERY-PLAN", { criticRequired: required() })),
  });
  const strict = evaluate(named, []);
  assert.equal(strict.ok, false);
  assert.equal(strict.administrativelyRetiredRecordCount, 0);
  assert.equal(strict.readFindings.filter((finding) => /ALF-ADOPTION-PROOF|ALF-RECOVERY-PLAN/u.test(finding)).length, 2);
  assert.doesNotMatch(strict.readFindings.join("\n"), /recovery index/u);
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

// D56 slice 4/5: review admission of the orchestrator-attested record kind (real validateDispatchRecord, no stub).
const DESCENDANT = "b".repeat(40);
const ancestryOk = () => "";
const TERMINAL_LOG = [{ phase: "done", toolUseCount: 3 }];
function deliveredV4(taskId, kind, overrides = {}) {
  const text = "Completed delivery.";
  return v4(taskId, { outcome: "completed", resultSha256: sha256(text), commits: [SHA], log: TERMINAL_LOG,
    report: { text, changedFiles: ["src/change.txt"] }, criticRequired: required(),
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind },
    ...(kind === "orchestrator-attested" ? { attestation: { schema: ORCHESTRATOR_ATTESTATION_SCHEMA,
      assurance: ORCHESTRATOR_ATTESTED_ASSURANCE, briefingSha256: "1".repeat(64), handbackSha256: "2".repeat(64) } } : {}),
    ...overrides });
}
const admit = (record, candidateCommit = SHA, options = {}) => evaluateReviewAdmission({
  root: fixture({ [`evidence/dispatch-record-${record.taskId}.json`]: json(record) }),
  taskId: record.taskId, candidateCommit, readChangedPaths: () => [], ...options });

test("CSC-A1 an attested terminal v4 record admits exactly once at its own candidate and reports its weaker assurance", () => {
  const result = admit(deliveredV4("ATT", "orchestrator-attested"));
  assert.equal(result.ok, true, result.readFindings.join("\n"));
  assert.equal(result.admittedCount, 1);
  assert.equal(result.admittedRecordKind, "orchestrator-attested");
  assert.equal(result.assurance, "orchestrator-attested");
});

test("CSC-A2 the attested record admits a later descendant candidate through the descendant branch", () => {
  const result = admit(deliveredV4("ATT", "orchestrator-attested"), DESCENDANT, { gitRead: ancestryOk });
  assert.equal(result.ok, true, result.readFindings.join("\n"));
  assert.equal(result.admittedByDescendant, true);
  assert.equal(result.targetRecordCandidateCommit, SHA);
  assert.equal(result.admittedRecordKind, "orchestrator-attested");
  assert.equal(result.assurance, "orchestrator-attested");
});

test("CSC-A3 an authored-commit v4 record admits as before and carries no assurance label", () => {
  const exact = admit(deliveredV4("AUT", "authored-commit"));
  assert.equal(exact.ok, true, exact.readFindings.join("\n"));
  assert.equal(exact.admittedRecordKind, "authored-commit");
  assert.equal(exact.assurance, null);
  const later = admit(deliveredV4("AUT", "authored-commit"), DESCENDANT, { gitRead: ancestryOk });
  assert.equal(later.ok, true, later.readFindings.join("\n"));
  assert.equal(later.admittedByDescendant, true);
  assert.equal(later.assurance, null);
});

test("CSC-A4 a v4 read-only record with criticRequired is not admitted at the exact candidate", () => {
  const text = "Read only analysis.";
  const result = admit(v4("RO", { outcome: "read-only-completed", resultSha256: sha256(text), commits: [], log: TERMINAL_LOG,
    report: { text, changedFiles: [] }, criticRequired: required(),
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "read-only" } }));
  assert.equal(result.ok, false);
  assert.equal(result.admittedCount, 0);
  assert.equal(result.applicableRecordCount, 1);
  assert.doesNotMatch(result.readFindings.join("\n"), /invalid v4 dispatch record/u);
  assert.match(result.readFindings.join("\n"), /does not deliver an authored commit/u);
  assert.equal(result.admittedRecordKind, null);
  assert.equal(result.assurance, null);
});

test("CSC-A5 a v4 stopped-without-commit record with criticRequired is not admitted at the exact candidate", () => {
  const text = "Stopped before any commit.";
  const result = admit(v4("STOP", { outcome: "stopped-without-commit", resultSha256: sha256(text), commits: [], log: TERMINAL_LOG,
    report: { text, changedFiles: [] }, criticRequired: required(),
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "stopped-without-commit" } }));
  assert.equal(result.ok, false);
  assert.equal(result.admittedCount, 0);
  assert.equal(result.applicableRecordCount, 1);
  assert.doesNotMatch(result.readFindings.join("\n"), /invalid v4 dispatch record/u);
  assert.match(result.readFindings.join("\n"), /does not deliver an authored commit/u);
  assert.equal(result.admittedRecordKind, null);
});

test("CSC-A6 the zero-target refusal keeps its pinned prefix and also names the attested route", () => {
  const result = evaluateReviewAdmission({ root: fixture({ "evidence/.keep": "" }), taskId: "NEXT", candidateCommit: SHA, readChangedPaths: () => [] });
  const text = result.readFindings.find((f) => f.startsWith(`review admission requires exactly one matching target for NEXT@${SHA}; found 0`));
  assert.ok(text, result.readFindings.join("\n"));
  assert.match(text, /orchestrator-attested/u);
  assert.match(text, /dispatch-record-write\.mjs/u);
  assert.match(text, /--attested-request/u);
  assert.equal(result.admittedRecordKind, null);
});

test("CSC-A7a delivered v3 record still admits with no label (documents D-2, no behaviour change)", () => {
  const text = "Completed delivery.";
  const record = v3("OLD", { outcome: "completed", resultSha256: sha256(text), commits: [SHA],
    report: { text, changedFiles: ["src/change.txt"] }, criticRequired: required() });
  const exact = admit(record);
  assert.equal(exact.ok, true, exact.readFindings.join("\n"));
  assert.equal(exact.admittedRecordKind, null);
  assert.equal(exact.assurance, null);
  const later = admit(record, DESCENDANT, { gitRead: ancestryOk });
  assert.equal(later.ok, true, later.readFindings.join("\n"));
  assert.equal(later.admittedByDescendant, true);
});

// N13 (Toolbox, 2026-10-29): the refusal must teach the descendant route, and name the task id that would be admitted.
test("CSC-N13a the zero-target refusal names the descendant route and the first delivery's task id rule", () => {
  const result = evaluateReviewAdmission({ root: fixture({ "evidence/.keep": "" }), taskId: "NEXT", candidateCommit: SHA, readChangedPaths: () => [] });
  const text = result.readFindings.find((f) => f.startsWith(`review admission requires exactly one matching target for NEXT@${SHA}; found 0`));
  assert.ok(text, result.readFindings.join("\n"));
  assert.match(text, /later Critic round carries the task id of its first delivery/u);
  assert.match(text, /descends from a delivered Goldfish record/u);
  assert.match(text, /do not invent a task id per round/u);
  assert.doesNotMatch(text, /descends from the delivered record of task id/u, "no suggestion without a delivered ancestor record");
});

test("CSC-N13b a fresh task id for round two is refused and the delivered record's task id is named", () => {
  const delivered = deliveredV4("FIRST", "orchestrator-attested");
  const result = evaluateReviewAdmission({
    root: fixture({ "evidence/dispatch-record-FIRST.json": json(delivered) }),
    taskId: "FIRST-critic-r2", candidateCommit: DESCENDANT, readChangedPaths: () => [], gitRead: ancestryOk });
  assert.equal(result.ok, false);
  assert.equal(result.admittedCount, 0);
  const text = result.readFindings.find((f) => f.startsWith(`review admission requires exactly one matching target for FIRST-critic-r2@${DESCENDANT}; found 0`));
  assert.ok(text, result.readFindings.join("\n"));
  assert.match(text, /descends from the delivered record of task id FIRST: use that task id for this round/u);
  const reused = evaluateReviewAdmission({
    root: fixture({ "evidence/dispatch-record-FIRST.json": json(delivered) }),
    taskId: "FIRST", candidateCommit: DESCENDANT, readChangedPaths: () => [], gitRead: ancestryOk });
  assert.equal(reused.ok, true, reused.readFindings.join("\n"));
  assert.equal(reused.admittedByDescendant, true);
});

test("CSC-A8 the zero-target refusal names the attested-request CLI and no longer defers a no-history range to a PO decision", () => {
  const result = evaluateReviewAdmission({ root: fixture({ "evidence/.keep": "" }), taskId: "NEXT", candidateCommit: SHA, readChangedPaths: () => [] });
  const text = result.readFindings.find((f) => f.startsWith(`review admission requires exactly one matching target for NEXT@${SHA}; found 0`));
  assert.ok(text, result.readFindings.join("\n"));
  assert.match(text, /node plugins\/pipeline-core\/scripts\/dispatch-record-write\.mjs --repo-root \. --attested-request <request\.json>/u);
  assert.doesNotMatch(text, /PO decision/u);
  assert.doesNotMatch(text, /writeOrchestratorAttestedDispatchRecord/u);
});

// ---------------------------------------------------------------------------------------------------------------
// N33 A+B (D212, backlog 2026-10-30-close-gate-rejects-critic-evidence-for-attested-records). Criterion: a Critic-
// required, orchestrator-attested record is satisfiable by an addendum (A), and a consumed, passed Critic course
// receipt whose reviewed range contains the record's commit satisfies it without task-id equality (B).
// ---------------------------------------------------------------------------------------------------------------
const N33_CRITIC_BYTES = "Independent Critic review (course receipt) for an attested delivery.\n";
function attestedDelivery(taskId, commit) {
  const text = "Orchestrator-committed hand-back.";
  return deliveredV4(taskId, "orchestrator-attested", { candidateCommit: commit, commits: [commit], resultSha256: reportSha256(text), report: { text, changedFiles: ["src/change.txt"] },
    log: [{ phase: "orchestrator-attested", toolUseCount: 0, note: "tool-use count and worker model not observed" }], outcome: "completed-orchestrator-attested" });
}
function n33Addendum(taskId, recordBytes, commit, reviewCommit) {
  return { schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA, recordPath: `evidence/dispatch-record-${taskId}.json`, recordSha256: sha256(recordBytes),
    taskId, candidateCommit: commit, reviewCandidateCommit: reviewCommit, criticPacketId, criticReceiptSha256,
    criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId, candidateCommit: commit, path: `evidence/critic-${taskId}.md`, sha256: sha256(N33_CRITIC_BYTES) } };
}
/** A real repository: base <- first <- second <- head on main, and a side commit on a branch off base. */
function courseRepository() {
  const root = fixture({ "evidence/.keep": "" });
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  const git = (...args) => execFileSync("git", args, { cwd: root, env: cleanEnv, encoding: "utf8" }).trim();
  const commit = (name) => {
    writeFileSync(join(root, name), `${name}\n`);
    git("add", name);
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", name);
    return git("rev-parse", "HEAD");
  };
  git("init", "-q", "-b", "main");
  const base = commit("base.txt"); const first = commit("first.txt"); const second = commit("second.txt"); const head = commit("head.txt");
  git("checkout", "-q", "-b", "side", base);
  const side = commit("side.txt");
  git("checkout", "-q", "main");
  return { root, base, first, second, head, side };
}
/** Writes one attested record plus its addendum; the reviewed Critic packet belongs to another task id (a feature-wide course). */
function writeAttested(root, taskId, commit, reviewCommit, { record = attestedDelivery(taskId, commit) } = {}) {
  const recordBytes = json(record);
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), recordBytes);
  writeFileSync(join(root, `evidence/critic-${taskId}.md`), N33_CRITIC_BYTES);
  writeFileSync(join(root, criticDispositionAddendumPath(taskId)), json(n33Addendum(taskId, recordBytes, commit, reviewCommit)));
  return recordBytes;
}
const courseReceiptReader = ({ base, head, taskId = "FEATURE-COURSE", reviewPass = true, receiptSha = criticReceiptSha256, range = { base, commit: head, diffSha256: "9".repeat(64) }, throwing = false }) => ({
  readBoundCriticReceipt: () => {
    if (throwing) throw Object.assign(new Error("no consumed receipt"), { code: "CVL-CRITIC-UNAVAILABLE" });
    return { packet: { request: { taskId }, candidate: { base, commit: head }, references: [] },
      critic: { reviewPass, candidate: { base, commit: head }, ...(range === null ? {} : { reviewRange: range }) }, criticReceiptSha256: receiptSha };
  },
});

test("N33A the addendum validator admits a v4 orchestrator-attested record with exactly one commit equal to the candidate (D212 A)", () => {
  const taskId = "ATT-VALID";
  const record = attestedDelivery(taskId, SHA);
  const recordBytes = Buffer.from(json(record));
  const entry = n33Addendum(taskId, recordBytes, SHA, reviewCandidateCommit);
  const context = { recordPath: `evidence/dispatch-record-${taskId}.json`, recordBytes, record };
  assert.equal(validateCriticDispositionAddendum(entry, context), entry);
  for (const refused of [
    { ...record, commits: [SHA, "b".repeat(40)] },
    { ...record, commits: ["b".repeat(40)] },
    { ...record, commits: [] },
  ]) assert.throws(() => validateCriticDispositionAddendum(entry, { ...context, record: refused }), /authored v3\/v4/u);
});

test("N33A an authored-commit record with two commits still refuses an addendum", () => {
  const taskId = "AUT-TWO";
  const record = deliveredV4(taskId, "authored-commit", { commits: [SHA, "b".repeat(40)], candidateCommit: SHA });
  const recordBytes = Buffer.from(json(record));
  assert.throws(() => validateCriticDispositionAddendum(n33Addendum(taskId, recordBytes, SHA, reviewCandidateCommit),
    { recordPath: `evidence/dispatch-record-${taskId}.json`, recordBytes, record }), /authored v3\/v4/u);
});

test("N33A an attested record is covered by an addendum with a task-id-matching receipt (equality stays sufficient)", () => {
  const taskId = "ATT-EQUAL";
  const record = attestedDelivery(taskId, SHA);
  const recordBytes = json(record);
  const root = fixture({ [`evidence/dispatch-record-${taskId}.json`]: recordBytes, [`evidence/critic-${taskId}.md`]: N33_CRITIC_BYTES,
    [criticDispositionAddendumPath(taskId)]: json(n33Addendum(taskId, recordBytes, SHA, reviewCandidateCommit)) });
  const result = evaluate(root, ["src/change.txt"], boundReview(recordBytes, taskId));
  assert.equal(result.ok, true, result.readFindings.join("\n"));
  assert.equal(result.criticEvidenceRecordCount, 1);
  assert.equal(result.requiredRecordCount, 0);
});

test("N33B two attested records are covered by one course receipt whose reviewed range contains both commits (D212 B)", () => {
  const repo = courseRepository();
  writeAttested(repo.root, "ATT-ONE", repo.first, repo.head);
  writeAttested(repo.root, "ATT-TWO", repo.second, repo.head);
  const options = courseReceiptReader({ base: repo.base, head: repo.head });
  const scoped = evaluate(repo.root, ["src/change.txt"], { ...options, taskIds: ["ATT-ONE", "ATT-TWO"] });
  assert.equal(scoped.ok, true, scoped.readFindings.join("\n"));
  assert.equal(scoped.criticEvidenceRecordCount, 2);
  assert.equal(scoped.requiredRecordCount, 0);
  assert.deepEqual(scoped.requiredTaskIds, []);
  // The push gate reads the same evidence through the single-record readback.
  for (const taskId of ["ATT-ONE", "ATT-TWO"]) {
    const bytes = Buffer.from(readFileSync(join(repo.root, `evidence/dispatch-record-${taskId}.json`)));
    assert.equal(verifyCriticDispositionAddendumForRecord({ root: repo.root, taskId, record: JSON.parse(bytes), recordBytes: bytes, options }).code, "critic-addendum-bound");
  }
});

test("N33B a course receipt that does not contain the record's commit still refuses", () => {
  const cases = [
    ["the commit is the range base (outside the half-open range)", (repo) => repo.base, (repo) => ({ base: repo.base, head: repo.head }), /not after the reviewed range base/u],
    ["the commit is older than the range base", (repo) => repo.first, (repo) => ({ base: repo.second, head: repo.head }), /not after the reviewed range base/u],
    ["the commit is not an ancestor of the reviewed candidate", (repo) => repo.side, (repo) => ({ base: repo.base, head: repo.head }), /unavailable or invalid/u],
  ];
  for (const [label, commitOf, receiptOf, reason] of cases) {
    const repo = courseRepository();
    writeAttested(repo.root, "ATT-OUT", commitOf(repo), repo.head);
    const result = evaluate(repo.root, ["src/change.txt"], { ...courseReceiptReader(receiptOf(repo)), taskIds: ["ATT-OUT"] });
    assert.equal(result.ok, false, label);
    assert.match(result.readFindings.join("\n"), reason, label);
    assert.deepEqual(result.requiredTaskIds, ["ATT-OUT"], label);
    assert.equal(result.criticEvidenceRecordCount, 0, label);
  }
});

test("N33B a failed, unconsumed, mis-digested or range-less course receipt still refuses", () => {
  const repo = courseRepository();
  writeAttested(repo.root, "ATT-RCPT", repo.first, repo.head);
  const base = { base: repo.base, head: repo.head };
  for (const [label, receipt, reason] of [
    ["failed", { ...base, reviewPass: false }, /does not match a passed, consumed, task-bound/u],
    ["unconsumed", { ...base, throwing: true }, /unavailable or invalid/u],
    ["wrong receipt digest", { ...base, receiptSha: "f".repeat(64) }, /does not match a passed, consumed, task-bound/u],
    ["no reviewed range", { ...base, range: null }, /names no reviewed range/u],
    ["range names another review commit", { ...base, range: { base: repo.base, commit: repo.second, diffSha256: "9".repeat(64) } }, /names no reviewed range/u],
  ]) {
    const result = evaluate(repo.root, ["src/change.txt"], { ...courseReceiptReader(receipt), taskIds: ["ATT-RCPT"] });
    assert.equal(result.ok, false, label);
    assert.match(result.readFindings.join("\n"), reason, label);
    assert.deepEqual(result.requiredTaskIds, ["ATT-RCPT"], label);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// N35 (D217 A+B, backlog 2026-10-31-close-addendum-ignores-residual-acceptance-and-course-chain). The consumer's Critic course
// ended through a PO residual acceptance of minor findings (every consumed receipt carries reviewPass false), and the two
// attested records lie only in the range of course round 1 while the later rounds are deltas that start at round 1's
// candidate. Criterion: (A) a failed receipt binds an addendum only through a valid PO residual acceptance; (B) a record is
// covered by the union of the reviewed ranges of the registered rounds of ONE course when the addendum names its LAST round.
// ---------------------------------------------------------------------------------------------------------------
const N35_RESIDUAL = Object.freeze({ basis: "po-acceptance-of-residual-minor-findings", mode: "chat", acceptanceSha256: "7".repeat(64), findings: [] });
const N35_PACKET_IDS = ["1".repeat(32), "2".repeat(32), "3".repeat(32)];
const n35H = (c) => c.repeat(64);
/** A real repository: pre <- genesis <- a <- b <- c1 <- c2 <- c3 <- registered (HEAD, the commit that registers the lineage). */
const N35_EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/** `emptyTreeGenesis`: the course starts with a ROOT-candidate review, whose base is the empty tree (a greenfield consumer's round 1). */
function n35Repository({ emptyTreeGenesis = false } = {}) {
  const root = fixture({ "evidence/.keep": "" });
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  const git = (...args) => execFileSync("git", args, { cwd: root, env: cleanEnv, encoding: "utf8" }).trim();
  const commit = (name, files = [name]) => {
    for (const file of files) { mkdirSync(dirname(join(root, file)), { recursive: true }); if (file === name) writeFileSync(join(root, file), `${name}\n`); }
    git("add", ...files);
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", name);
    return git("rev-parse", "HEAD");
  };
  git("init", "-q", "-b", "main");
  const pre = commit("pre.txt"); const genesis = commit("genesis.txt"); const a = commit("a.txt"); const b = commit("b.txt");
  const c1 = commit("c1.txt"); const c2 = commit("c2.txt"); const c3 = commit("c3.txt");
  const rounds = [{ base: emptyTreeGenesis ? N35_EMPTY_TREE : genesis, head: c1, mode: "full" }, { base: c1, head: c2, mode: "delta" }, { base: c2, head: c3, mode: "delta" }];
  const path = "src/example.mjs";
  const delta = { changedPaths: [path], changedBehaviorClaims: ["behavior-one"], priorReceipt: { id: "receipt-1", sha256: n35H("4") },
    pathInvariantMap: { [path]: ["INV-1"] }, pathInvariantMapSha256: sha256Canonical({ [path]: ["INV-1"] }), coordinatorImpactConfirmed: true,
    trustBoundaryChanged: false, impactAmbiguous: false };
  const history = [];
  rounds.forEach((round, index) => {
    const packet = { packetId: N35_PACKET_IDS[index], request: { projectId: "fixture", taskId: "FEATURE-COURSE", trigger: "T1" },
      candidate: { base: round.base, commit: round.head, tree: git("rev-parse", `${round.head}^{tree}`) },
      diff: { base: round.base, commit: round.head, path: ".git/review.diff", bytes: 1, sha256: n35H("5") },
      diffPaths: [path], bindings: { requestSha256: n35H("a"), diffPathsSha256: n35H("b"), governanceSha256: n35H("c") } };
    history.push(compileCriticReviewLineage({ packet, reviewId: `review-${index + 1}`, parent: history.at(-1) ?? null,
      packages: [{ id: "package", subjectSha256: n35H("d"), changedPaths: [path], integrationEdges: ["edge"] }],
      coverage: { changedPaths: [path], acceptanceIds: ["AC-1"], integrationEdges: ["edge"], complete: true, receiptSha256: n35H("e") },
      lane: { laneId: `lane-${index + 1}`, contextSha256: n35H((index + 3).toString(16)), evidenceSha256: n35H((index + 6).toString(16)) },
      verdict: { status: "findings", schemaValid: true, resultSha256: n35H("2"), failure: null },
      findings: [{ id: "finding-1", priorFindingId: index === 0 ? null : "finding-1", severity: "low", status: "open", evidenceSha256: n35H("3") }],
      correction: index === 0 ? null : { commit: round.head, deltaSha256: n35H("5"), impactSha256: sha256Canonical(["edge"]) },
      invalidation: { kind: "none", reason: null, evidenceSha256: null },
      reviewAttempt: index === 0 ? { round: 1, correctionCommits: 0, requestedMode: "full" }
        : { round: index + 1, correctionCommits: index, requestedMode: "delta", base: round.base, head: round.head, tree: packet.candidate.tree, ...delta } }));
  });
  const feature = "n35-feature";
  const artifacts = history.map((record, index) => {
    const text = `${JSON.stringify(record)}\n`;
    const evidencePath = `specs/${feature}/evidence/critic-review-${index + 1}.json`;
    mkdirSync(dirname(join(root, evidencePath)), { recursive: true });
    writeFileSync(join(root, evidencePath), text);
    return { class: "candidate-evidence", path: evidencePath, sha256: sha256(text), authority: false, mutability: "immutable", retention: "retain" };
  });
  writeFileSync(join(root, `specs/${feature}/lifecycle.json`), `${JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id: feature, rigor: 1 }, state: "approved", artifacts })}\n`);
  const registered = commit("registered", [`specs/${feature}`, "registered"]);
  return { root, pre, genesis, a, b, c1, c2, c3, registered, rounds, history };
}
/** Receipt reader that, like readBoundConsumedCriticReceipt, refuses a failed receipt unless the residual deps reached it. */
function n35Reader(repo, { round = 3, reviewPass = false, residualDeps = true, throwsFailed = true } = {}) {
  const { base, head } = repo.rounds[round - 1];
  const seen = [];
  return { seen, options: {
    loadResidualDeps: ({ criticPacketId }) => { seen.push(criticPacketId); return residualDeps ? { residualAcceptance: { junk: true }, verifyResidualAcceptanceFn: () => ({ authorized: true, mode: "chat" }) } : null; },
    readBoundCriticReceipt: (_input, deps) => {
      if (!reviewPass && deps?.residualAcceptance === undefined && throwsFailed) throw Object.assign(new Error("Critic findings remain unresolved"), { code: "CVL-CRITIC-FAILED" });
      return { packet: { request: { taskId: "FEATURE-COURSE" }, candidate: { base, commit: head }, references: [] },
        critic: { reviewPass, candidate: { base, commit: head }, reviewRange: { base, commit: head, diffSha256: "9".repeat(64) } },
        criticReceiptSha256, residual: reviewPass ? null : (deps?.residualAcceptance === undefined ? null : N35_RESIDUAL) };
    } } };
}
function n35Write(repo, taskId, commit, { packetId = N35_PACKET_IDS[2], reviewCommit = repo.c3 } = {}) {
  const record = attestedDelivery(taskId, commit);
  const recordBytes = json(record);
  writeFileSync(join(repo.root, `evidence/dispatch-record-${taskId}.json`), recordBytes);
  writeFileSync(join(repo.root, `evidence/critic-${taskId}.md`), N33_CRITIC_BYTES);
  writeFileSync(join(repo.root, criticDispositionAddendumPath(taskId)), json({ ...n33Addendum(taskId, recordBytes, commit, reviewCommit), criticPacketId: packetId }));
}

test("N35 two attested records in round 1 are covered by a course closed through a residual acceptance of its last round (D217 A+B)", () => {
  const repo = n35Repository();
  n35Write(repo, "ATT-ONE", repo.a); n35Write(repo, "ATT-TWO", repo.b);
  const { options, seen } = n35Reader(repo);
  const result = evaluate(repo.root, ["src/change.txt"], { ...options, taskIds: ["ATT-ONE", "ATT-TWO"] });
  assert.equal(result.ok, true, result.readFindings.join("\n"));
  assert.equal(result.criticEvidenceRecordCount, 2);
  assert.deepEqual(result.requiredTaskIds, []);
  assert.ok(seen.includes(N35_PACKET_IDS[2]), "the residual acceptance is loaded for the addendum's own Critic packet");
  for (const taskId of ["ATT-ONE", "ATT-TWO"]) { // the push gate reads the same evidence through the single-record readback
    const bytes = Buffer.from(readFileSync(join(repo.root, `evidence/dispatch-record-${taskId}.json`)));
    assert.equal(verifyCriticDispositionAddendumForRecord({ root: repo.root, taskId, record: JSON.parse(bytes), recordBytes: bytes, options }).code, "critic-addendum-bound");
  }
});

test("N35 a course that starts with a root-candidate review (empty-tree base) covers the records of its whole history and still refuses one after the last candidate (D217 B, whole chain)", () => {
  // A greenfield consumer's round 1 reviews the first commit onward against the EMPTY TREE (the preflight's base.commit is null). The
  // chain reader used to read that genesis base as "not a commit"/"not connected" and the close ended in CLOSE-CRITIC-EVIDENCE-MISSING.
  const repo = n35Repository({ emptyTreeGenesis: true });
  assert.equal(repo.history[0].diff.base, N35_EMPTY_TREE);
  n35Write(repo, "ATT-ROOT", repo.pre); n35Write(repo, "ATT-MID", repo.a);
  const { options } = n35Reader(repo);
  const result = evaluate(repo.root, ["src/change.txt"], { ...options, taskIds: ["ATT-ROOT", "ATT-MID"] });
  assert.equal(result.ok, true, result.readFindings.join("\n"));
  assert.equal(result.criticEvidenceRecordCount, 2);
  assert.deepEqual(result.requiredTaskIds, []);
  const after = n35Repository({ emptyTreeGenesis: true });
  n35Write(after, "ATT-OUT", after.registered);
  const outside = evaluate(after.root, ["src/change.txt"], { ...n35Reader(after).options, taskIds: ["ATT-OUT"] });
  assert.equal(outside.ok, false, "a record after the last candidate stays refused");
  assert.deepEqual(outside.requiredTaskIds, ["ATT-OUT"]);
});

test("N35 a failed receipt never binds without a PO residual acceptance, and the refusal names the accept route (D217 A, C)", () => {
  const repo = n35Repository();
  n35Write(repo, "ATT-NOACC", repo.a);
  for (const [label, overrides] of [["no private acceptance record (the receipt reader refuses the failed receipt)", { residualDeps: false }],
    ["a failed receipt returned with no verified residual", { residualDeps: false, throwsFailed: false }]]) {
    const { options } = n35Reader(repo, overrides);
    const result = evaluate(repo.root, ["src/change.txt"], { ...options, taskIds: ["ATT-NOACC"] });
    assert.equal(result.ok, false, label);
    const text = result.readFindings.join("\n");
    assert.match(text, /a failed receipt never binds without a PO residual acceptance/u, label);
    assert.match(text, /approve-residual-acceptance/u, label);
    assert.deepEqual(result.requiredTaskIds, ["ATT-NOACC"], label);
  }
});

test("N35 a record outside the union of the registered rounds, a broken chain, a middle round or no course still refuses (D217 B)", () => {
  const cases = [
    ["a record commit before the genesis base", (repo) => repo.pre, {}, {}, /not after the (?:reviewed range|course genesis) base/u],
    ["a record commit after the last candidate", (repo) => repo.registered, {}, {}, /unavailable or invalid/u],
    ["a record commit equal to the genesis base", (repo) => repo.genesis, {}, {}, /not after the (?:reviewed range|course genesis) base/u],
    ["a broken chain (a gap between two rounds)", (repo) => repo.a, { history: (repo) => repo.history.map((row, i) => (i === 1 ? { ...row, diff: { ...row.diff, base: repo.b } } : row)) }, {}, /chain/u],
    ["an addendum naming a middle round instead of the last", (repo) => repo.a, { round: 2 }, { packetId: N35_PACKET_IDS[1], reviewCommit: "c2" }, /last round/u],
    ["a single failed receipt without a course", (repo) => repo.a, { history: () => null }, {}, /no round of a registered Critic course/u],
  ];
  for (const [label, commitOf, reader, write, reason] of cases) {
    const repo = n35Repository();
    const { options } = n35Reader(repo, reader.round === undefined ? {} : { round: reader.round });
    n35Write(repo, "ATT-OUT", commitOf(repo), { ...write, reviewCommit: write.reviewCommit === "c2" ? repo.c2 : repo.c3 });
    const readCourseHistory = reader.history === undefined ? {} : { readCourseHistory: () => reader.history(repo) };
    const result = evaluate(repo.root, ["src/change.txt"], { ...options, ...readCourseHistory, taskIds: ["ATT-OUT"] });
    assert.equal(result.ok, false, label);
    assert.match(result.readFindings.join("\n"), reason, label);
    assert.deepEqual(result.requiredTaskIds, ["ATT-OUT"], label);
    assert.equal(result.criticEvidenceRecordCount, 0, label);
  }
});

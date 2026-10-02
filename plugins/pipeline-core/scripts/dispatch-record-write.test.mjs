// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportSha256, validateDispatchRecord } from "../lib/dispatch-record.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { VERDICT, verifyCommit } from "./dispatch-authorship-verify.mjs";
import { writeCriticDispositionAddendumObject, writeDispatchRecord, writeDispatchRecordObject } from "./dispatch-record-write.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../lib/critic-skip-decision.mjs";
import { CRITIC_DISPOSITION_ADDENDUM_SCHEMA, criticDispositionAddendumPath } from "../lib/critic-disposition-addendum.mjs";
import { evaluateRepositoryCriticSkipCoverage } from "./check-critic-skip-coverage.mjs";

const SHA = "a".repeat(40);
const RESULT_SHA = "d".repeat(64);
const cases = [];
function check(name, run) {
  cases.push({ id: `DRW${String(cases.length + 1).padStart(2, "0")}`, name, run });
}
const skip = { schema: CRITIC_SKIP_SCHEMA, trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T5", reason: "fast path" };
function record(overrides = {}) { return { schema: "pipeline.dispatch-record.v3", taskId: "NVA-WRITE-1", agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: "b".repeat(40), resultSha256: RESULT_SHA, outcome: "completed", commits: ["b".repeat(40)], log: [{ phase: "done", toolUseCount: 4 }], report: { text: "Done.", changedFiles: ["src/x.mjs"] }, criticSkip: skip, ...overrides }; }
function fixture(value = record(), target = `evidence/dispatch-record-${value.taskId}.json`) {
  const root = mkdtempSync(join(tmpdir(), "dispatch-record-write-"));
  mkdirSync(join(root, "evidence")); mkdirSync(join(root, "requests"));
  writeFileSync(join(root, "requests", "write.json"), `${JSON.stringify({ schema: "pipeline.dispatch-record-write-request.v1", target, record: value })}\n`);
  return root;
}

check("writer validates, atomically publishes exclusively, and returns matching readback digest", () => {
  const root = fixture();
  try {
    const receipt = writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" });
    const raw = readFileSync(join(root, receipt.target));
    const persisted = validateDispatchRecord(JSON.parse(raw));
    assert.deepEqual(persisted, record());
    assert.equal(receipt.bytes, raw.length); assert.match(receipt.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(receipt.taskId, persisted.taskId); assert.equal(receipt.candidateCommit, persisted.candidateCommit);
    assert.equal(receipt.resultSha256, persisted.resultSha256);
    const authorship = verifyCommit("b".repeat(40), {
      readCommitMessage: () => "feat(x): done\n\nDispatch: NVA-WRITE-1 (goldfish)\nAI-Assisted: true\n",
      readChangedPaths: () => ["src/x.mjs"], readRecord: () => persisted,
    });
    assert.equal(authorship.verdict, VERDICT.pass);
    assert.equal(authorship.classification, "bound");
    assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }), /already exists/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("writer persists no-delivery without manufacturing a commit or delivery path", () => {
  const value = record({ taskId: "NVA-NO-DELIVERY", outcome: "completed-no-delivery", commits: [], report: { text: "No delivery.", changedFiles: [], orchestratorAddedFiles: [] }, criticSkip: undefined, criticRequired: { schema: CRITIC_REQUIRED_SCHEMA, trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T3" } });
  const root = fixture(value);
  try {
    const receipt = writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" });
    const persisted = validateDispatchRecord(JSON.parse(readFileSync(join(root, receipt.target))));
    assert.equal(persisted.outcome, "completed-no-delivery");
    assert.deepEqual(persisted.commits, []);
    assert.deepEqual(persisted.report.changedFiles, []);
    const authorship = verifyCommit(value.candidateCommit, { readCommitMessage: () => "docs(x): diagnostic\n\nDispatch: NVA-NO-DELIVERY (goldfish)\nAI-Assisted: true\n", readChangedPaths: () => ["src/x.mjs"], readRecord: () => persisted });
    assert.equal(authorship.verdict, VERDICT.unverifiable);
    assert.equal(authorship.classification, "no-delivery-no-authorship");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("writer publishes a closed v4 read-only receipt without commit authorship", () => {
  const report = { text: "Read-only inspection completed.", changedFiles: [] };
  const value = record({ schema: "pipeline.dispatch-record.v4", taskId: "NVA-V4-READONLY", resultSha256: reportSha256(report.text), outcome: "read-only-completed", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "read-only" }, commits: [], report });
  const root = fixture(value);
  try {
    const receipt = writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" });
    assert.equal(receipt.schema, "pipeline.dispatch-record-write-receipt.v2");
    assert.deepEqual(receipt.outcomeClassification, value.outcomeClassification);
    assert.deepEqual(validateDispatchRecord(JSON.parse(readFileSync(join(root, receipt.target)))), value);
  } finally { rmSync(root, { recursive: true, force: true }); }
  const undelivered = record({
    schema: "pipeline.dispatch-record.v4", taskId: "NVA-V4-UNDELIVERED",
    outcome: "completed-no-delivery", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "completed-undelivered" },
    observationIdentity: { dispatchId: "dispatch-1", attemptId: "attempt-1" },
    resultSha256: null, commits: [], report: null,
  });
  delete undelivered.criticSkip;
  undelivered.criticRequired = { schema: CRITIC_REQUIRED_SCHEMA, trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T3" };
  const undeliveredRoot = fixture(undelivered);
  try {
    const receipt = writeDispatchRecord({ repoRoot: undeliveredRoot, requestPath: "requests/write.json" });
    assert.equal(receipt.schema, "pipeline.dispatch-record-write-receipt.v2");
    assert.equal(receipt.resultSha256, null);
    assert.deepEqual(receipt.observationIdentity, undelivered.observationIdentity);
    assert.deepEqual(validateDispatchRecord(JSON.parse(readFileSync(join(undeliveredRoot, receipt.target)))), undelivered);
    assert.throws(() => writeDispatchRecord({ repoRoot: undeliveredRoot, requestPath: "requests/write.json" }), /already exists/u);
  } finally { rmSync(undeliveredRoot, { recursive: true, force: true }); }
});
check("malformed, missing, computed and mismatched records fail before publication", () => {
  const cases = [
    [record({ schema: "pipeline.dispatch-record.v2" }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ criticSkip: undefined }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ effort: "" }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ model: "claude-opus-5" }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ modelOverride: { model: "claude-opus-5", effort: "high", rationale: "MP-05 reviewed exception" } }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ dispatcher: "/home/alice/private/dispatcher.txt" }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ dispatcher: "/root/private/dispatcher.txt" }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ report: { text: "from /private/var/folders/xy/result", changedFiles: ["src/x.mjs"] } }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ commits: [] }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ candidateCommit: SHA }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ resultSha256: null }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ resultSha256: "bad" }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ outcome: "completed", report: null }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record({ report: { text: "Done.", changedFiles: ["src/$FILE"] } }), "evidence/dispatch-record-NVA-WRITE-1.json"],
    [record(), "evidence/dispatch-record-OTHER.json"],
    [record(), "../dispatch-record-NVA-WRITE-1.json"],
  ];
  for (const [value, target] of cases) {
    const root = fixture(value, target);
    try {
      assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }));
      assert.equal(existsSync(join(root, "evidence", "dispatch-record-NVA-WRITE-1.json")), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

check("writer rejects no-delivery with top-level paths or closing committed claims before publication", () => {
  const value = record({ outcome: "completed-no-delivery", commits: [], report: { text: "No delivery.", changedFiles: [], orchestratorAddedFiles: [] }, criticSkip: undefined, criticRequired: { schema: CRITIC_REQUIRED_SCHEMA, trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T3" } });
  for (const extra of [
    { orchestratorAddedFiles: ["src/claimed-delivery.mjs"] },
    { closingAllowance: { schema: "pipeline.dispatch-closing-allowance.v1", taskId: value.taskId, committed: ["b".repeat(40)], verifiedGreen: [], remainsUndone: [], nextBriefingAdjustments: [] } },
  ]) {
    const root = fixture({ ...value, ...extra });
    try {
      assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }), error => error.code === "record-no-delivery");
      assert.equal(existsSync(join(root, "evidence/dispatch-record-NVA-WRITE-1.json")), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

check("request and target aliases are rejected without following them", (t) => {
  const root = fixture();
  try {
    try { symlinkSync(join(root, "requests", "write.json"), join(root, "request-link.json")); }
    catch { t.skip("symlinks unavailable"); return; }
    assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "request-link.json" }), /physical/u);
    rmSync(join(root, "evidence"), { recursive: true });
    mkdirSync(join(root, "real-evidence")); symlinkSync(join(root, "real-evidence"), join(root, "evidence"));
    assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }), /physical/u);
    assert.equal(existsSync(join(root, "real-evidence", "dispatch-record-NVA-WRITE-1.json")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("an existing target symlink and duplicate JSON keys are rejected before publication", (t) => {
  const root = fixture();
  try {
    const target = join(root, "evidence", "dispatch-record-NVA-WRITE-1.json");
    const foreign = join(root, "foreign.json"); writeFileSync(foreign, "unchanged\n");
    try { symlinkSync(foreign, target); } catch { t.skip("symlinks unavailable"); return; }
    assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }), /already exists/u);
    assert.equal(readFileSync(foreign, "utf8"), "unchanged\n");
    rmSync(target);
    const raw = readFileSync(join(root, "requests", "write.json"), "utf8");
    writeFileSync(join(root, "requests", "write.json"), raw.replace('"schema":"pipeline.dispatch-record-write-request.v1"', '"schema":"bad","schema":"pipeline.dispatch-record-write-request.v1"'));
    assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }), /duplicate JSON key/u);
    assert.equal(existsSync(target), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("exclusive publication race cannot overwrite another record", () => {
  const root = fixture();
  try {
    const target = join(root, "evidence", "dispatch-record-NVA-WRITE-1.json");
    assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }, {
      linkSync() { writeFileSync(target, "foreign\n", { flag: "wx" }); const error = new Error("exists"); error.code = "EEXIST"; throw error; },
    }));
    assert.equal(readFileSync(target, "utf8"), "foreign\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("unsupported directory fsync does not turn a durable file publication into a false failure", () => {
  const root = fixture();
  try {
    const receipt = writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }, {
      openDirectorySync() { const error = new Error("unsupported"); error.code = "EPERM"; throw error; },
    });
    assert.equal(existsSync(join(root, receipt.target)), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("a request-parent swap after inode pinning cannot redirect the read", (t) => {
  const root = fixture(); const external = mkdtempSync(join(tmpdir(), "dispatch-record-external-request-"));
  try {
    writeFileSync(join(external, "write.json"), "{\"schema\":\"attacker\"}\n");
    try {
      const receipt = writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }, {
        afterRequestDirectoryPinned() {
          renameSync(join(root, "requests"), join(root, "requests-pinned"));
          symlinkSync(external, join(root, "requests"));
        },
      });
      assert.equal(existsSync(join(root, receipt.target)), true);
      assert.equal(readFileSync(join(external, "write.json"), "utf8"), "{\"schema\":\"attacker\"}\n");
    } catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) t.skip("directory symlink swap unavailable"); else throw error; }
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});

check("a target-parent swap after inode pinning cannot redirect publication outside the repository", (t) => {
  const root = fixture(); const external = mkdtempSync(join(tmpdir(), "dispatch-record-external-target-"));
  try {
    try {
      writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }, {
        afterTargetDirectoryPinned() {
          renameSync(join(root, "evidence"), join(root, "evidence-pinned"));
          symlinkSync(external, join(root, "evidence"));
        },
      });
      assert.equal(existsSync(join(external, "dispatch-record-NVA-WRITE-1.json")), false);
      assert.equal(existsSync(join(root, "evidence-pinned", "dispatch-record-NVA-WRITE-1.json")), true);
    } catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) t.skip("directory symlink swap unavailable"); else throw error; }
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});

check("same-inode request mutation during descriptor read is detected before publication", () => {
  const root = fixture();
  try {
    assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }, {
      readFileSync(fd) {
        const raw = readFileSync(fd);
        const path = join(root, "requests", "write.json");
        const text = readFileSync(path, "utf8");
        writeFileSync(path, text.replace("completed", "corrupted"));
        return raw;
      },
    }), /changed while reading/u);
    assert.equal(existsSync(join(root, "evidence", "dispatch-record-NVA-WRITE-1.json")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("target replacement after hard-link admission is detected without reading the replacement", (t) => {
  const root = fixture(); const external = join(root, "external-secret.txt"); writeFileSync(external, "private-canary\n");
  try {
    const targetName = "dispatch-record-NVA-WRITE-1.json";
    try {
      assert.throws(() => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }, {
        syncDirectory() {
          rmSync(targetName);
          symlinkSync(external, targetName);
        },
      }), /readback failed/u);
      assert.equal(readFileSync(external, "utf8"), "private-canary\n");
    } catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) t.skip("target symlink replacement unavailable"); else throw error; }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("in-memory writer publishes Agy non-authoring observation but cannot bypass authored model binding", () => {
  const value = record({
    schema: "pipeline.dispatch-record.v4", taskId: "AGY-UNDELIVERED-1", runner: "antigravity",
    model: "gemini-3.8-flash-high", effort: "high", resultSha256: null,
    outcome: "completed-no-delivery", commits: [], report: null,
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "completed-undelivered" },
    observationIdentity: { dispatchId: "agy-dispatch-1", attemptId: "attempt-1" },
  });
  delete value.criticSkip;
  value.criticRequired = { schema: CRITIC_REQUIRED_SCHEMA, trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T4", reason: "An undelivered implementation attempt requires review." };
  const root = fixture(value);
  try {
    const target = `evidence/dispatch-record-${value.taskId}.json`;
    const receipt = writeDispatchRecordObject({ repoRoot: root, target, record: value });
    assert.equal(receipt.schema, "pipeline.dispatch-record-write-receipt.v2");
    assert.equal(receipt.outcomeClassification.kind, "completed-undelivered");
    assert.equal(receipt.resultSha256, null);
    assert.deepEqual(validateDispatchRecord(JSON.parse(readFileSync(join(root, target), "utf8"))), value);
    assert.throws(() => writeDispatchRecordObject({ repoRoot: root, target, record: value }), /already exists/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
  const authored = { ...value, outcome: "completed", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" }, candidateCommit: "b".repeat(40), commits: ["b".repeat(40)], resultSha256: reportSha256("Done."), report: { text: "Done.", changedFiles: ["src/x.mjs"] } };
  delete authored.observationIdentity;
  const authoredRoot = fixture(authored);
  try {
    assert.throws(() => writeDispatchRecordObject({ repoRoot: authoredRoot, target: `evidence/dispatch-record-${authored.taskId}.json`, record: authored }),
      error => error.code === "record-model" && /trusted host-observed model and consent binding/u.test(error.message));
  } finally { rmSync(authoredRoot, { recursive: true, force: true }); }
  const reportText = "Host observation: interrupted before Final Return.";
  const stopped = { ...value, taskId: "AGY-INTERRUPTED-1", model: "unknown",
    outcome: "stopped-without-commit", resultSha256: reportSha256(reportText),
    report: { text: reportText, changedFiles: [] },
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "stopped-without-commit" },
    log: [{ phase: "interrupted", toolUseCount: 1,
      note: `attempt:${"1".repeat(32)};reason:AGY-NONZERO-EXIT` }] };
  delete stopped.observationIdentity;
  const stoppedRoot = fixture(stopped);
  try {
    const target = `evidence/dispatch-record-${stopped.taskId}.json`;
    const receipt = writeDispatchRecordObject({ repoRoot: stoppedRoot, target, record: stopped });
    assert.equal(receipt.outcomeClassification.kind, "stopped-without-commit");
    assert.deepEqual(validateDispatchRecord(JSON.parse(readFileSync(join(stoppedRoot, target), "utf8"))), stopped);
    assert.throws(() => writeDispatchRecordObject({ repoRoot: stoppedRoot,
      target: "evidence/dispatch-record-UNSAFE-STOP.json", record: { ...stopped, taskId: "UNSAFE-STOP",
        criticRequired: undefined, criticSkip: skip } }));
  } finally { rmSync(stoppedRoot, { recursive: true, force: true }); }
});

function undeliveredFixture() {
  const value = record({
    schema: "pipeline.dispatch-record.v4", taskId: "AGY-ADDENDUM-1", runner: "antigravity",
    model: "gemini-3.8-flash-high", effort: "high", resultSha256: null,
    outcome: "completed-no-delivery", commits: [], report: null,
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "completed-undelivered" },
    observationIdentity: { dispatchId: "agy-dispatch-1", attemptId: "attempt-1" },
  });
  delete value.criticSkip;
  value.criticRequired = { schema: CRITIC_REQUIRED_SCHEMA, trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T4" };
  const root = fixture(value);
  const recordPath = `evidence/dispatch-record-${value.taskId}.json`;
  const recordReceipt = writeDispatchRecordObject({ repoRoot: root, target: recordPath, record: value });
  const criticPath = `evidence/critic-${value.taskId}.md`;
  const criticBytes = Buffer.from("Independent Critic reviewed the undelivered attempt.\n");
  writeFileSync(join(root, criticPath), criticBytes);
  const addendum = {
    schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA, recordPath, recordSha256: recordReceipt.sha256,
    taskId: value.taskId, candidateCommit: value.candidateCommit,
    reviewCandidateCommit: "e".repeat(40),
    criticPacketId: "d".repeat(32), criticReceiptSha256: "c".repeat(64),
    criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: value.taskId,
      candidateCommit: value.candidateCommit, path: criticPath, sha256: createHash("sha256").update(criticBytes).digest("hex") },
  };
  return { root, value, addendum, criticPath };
}

function deliveredV3AddendumFixture(overrides = {}) {
  const value = record({ taskId: "V3-DELIVERED-ADDENDUM", outcome: "completed",
    candidateCommit: "b".repeat(40), commits: ["a".repeat(40), "b".repeat(40)],
    criticSkip: undefined, ...overrides });
  delete value.criticSkip;
  value.criticRequired = { schema: CRITIC_REQUIRED_SCHEMA, trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA,
    rigorLevel: 2, riskClass: "low", riskFlag: true,
    diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T4" };
  const root = fixture(value);
  const recordPath = `evidence/dispatch-record-${value.taskId}.json`;
  const receipt = writeDispatchRecordObject({ repoRoot: root, target: recordPath, record: value });
  const criticPath = `evidence/critic-${value.taskId}.md`;
  const criticBytes = Buffer.from("Independent Critic reviewed the delivered v3 dispatch.\n");
  writeFileSync(join(root, criticPath), criticBytes);
  const addendum = { schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA, recordPath, recordSha256: receipt.sha256,
    taskId: value.taskId, candidateCommit: value.candidateCommit, reviewCandidateCommit: "e".repeat(40),
    criticPacketId: "d".repeat(32), criticReceiptSha256: "c".repeat(64),
    criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: value.taskId,
      candidateCommit: value.candidateCommit, path: criticPath,
      sha256: createHash("sha256").update(criticBytes).digest("hex") } };
  return { root, value, addendum, recordPath };
}

check("Critic addendum writer publishes exclusively and coverage reads the exact record bytes", () => {
  const { root, value, addendum } = undeliveredFixture();
  try {
    const receipt = writeCriticDispositionAddendumObject({ repoRoot: root, addendum });
    assert.equal(receipt.target, criticDispositionAddendumPath(value.taskId));
    assert.equal(receipt.recordSha256, addendum.recordSha256);
    const bytes = readFileSync(join(root, receipt.target));
    assert.equal(receipt.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(JSON.parse(bytes), addendum);
    const coverage = evaluateRepositoryCriticSkipCoverage({ root, readChangedPaths: () => [],
      gitRead: (args) => args[1] === "--git-common-dir" ? ".git" : "e".repeat(40) });
    assert.equal(coverage.ok, false, "a byte-bound file is not an independent Critic receipt");
    assert.match(coverage.readFindings.join("\n"), /consumed Critic receipt is unavailable/u);
    assert.throws(() => writeCriticDispositionAddendumObject({ repoRoot: root, addendum }), /already exists/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("Critic addendum writer rejects drift and cannot overwrite an occupied target", () => {
  const { root, value, addendum, criticPath } = undeliveredFixture();
  try {
    const target = join(root, criticDispositionAddendumPath(value.taskId));
    for (const invalid of [
      { ...addendum, recordSha256: "f".repeat(64) },
      { ...addendum, candidateCommit: "f".repeat(40) },
      { ...addendum, criticEvidence: { ...addendum.criticEvidence, taskId: "OTHER" } },
    ]) {
      assert.throws(() => writeCriticDispositionAddendumObject({ repoRoot: root, addendum: invalid }));
      assert.equal(existsSync(target), false);
    }
    writeFileSync(join(root, criticPath), "changed review bytes\n");
    assert.throws(() => writeCriticDispositionAddendumObject({ repoRoot: root, addendum }), /digest mismatch/u);
    assert.equal(existsSync(target), false);
    writeFileSync(join(root, criticPath), "Independent Critic reviewed the undelivered attempt.\n");
    writeFileSync(target, "foreign\n");
    assert.throws(() => writeCriticDispositionAddendumObject({ repoRoot: root, addendum }), /already exists/u);
    assert.equal(readFileSync(target, "utf8"), "foreign\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("public writer cannot publish authored Claude/Codex v4 without the private native host path", () => {
  const report = { text: "Native return was delivered.", changedFiles: ["src/native.mjs"] };
  const value = record({
    schema: "pipeline.dispatch-record.v4", taskId: "NATIVE-PUBLIC-1", runner: "codex",
    model: "gpt-6-luna", effort: "medium", candidateCommit: "b".repeat(40),
    resultSha256: reportSha256(report.text), outcome: "completed", commits: ["b".repeat(40)],
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
    report,
  });
  const root = fixture(value);
  try {
    assert.throws(() => writeDispatchRecordObject({ repoRoot: root,
      target: `evidence/dispatch-record-${value.taskId}.json`, record: value }),
    (error) => error.code === "record-host-observation");
    assert.equal(existsSync(join(root, `evidence/dispatch-record-${value.taskId}.json`)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("Critic addendum writer accepts a terminal delivered v3 record with candidateCommit last", () => {
  const { root, value, addendum } = deliveredV3AddendumFixture();
  try {
    const receipt = writeCriticDispositionAddendumObject({ repoRoot: root, addendum });
    assert.equal(receipt.recordSha256, addendum.recordSha256);
    assert.deepEqual(JSON.parse(readFileSync(join(root, receipt.target), "utf8")), addendum);
    assert.equal(receipt.candidateCommit, value.candidateCommit);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("Critic addendum writer refuses v3 in-progress and zero-commit sources", () => {
  const inProgress = deliveredV3AddendumFixture({ taskId: "V3-ADDENDUM-IN-PROGRESS",
    outcome: "in-progress", commits: [] });
  try {
    assert.throws(() => writeCriticDispositionAddendumObject({ repoRoot: inProgress.root, addendum: inProgress.addendum }), /delivered Critic-required/u);
    assert.equal(existsSync(join(inProgress.root, criticDispositionAddendumPath(inProgress.value.taskId))), false);
  } finally { rmSync(inProgress.root, { recursive: true, force: true }); }
  const zeroCommit = deliveredV3AddendumFixture({ taskId: "V3-ADDENDUM-ZERO-COMMIT" });
  try {
    const malformed = { ...zeroCommit.value, commits: [] };
    const malformedBytes = Buffer.from(`${JSON.stringify(malformed, null, 2)}\n`);
    writeFileSync(join(zeroCommit.root, zeroCommit.recordPath), malformedBytes);
    zeroCommit.addendum.recordSha256 = createHash("sha256").update(malformedBytes).digest("hex");
    assert.throws(() => writeCriticDispositionAddendumObject({ repoRoot: zeroCommit.root, addendum: zeroCommit.addendum }), /candidateCommit as the final commits entry/u);
    assert.equal(existsSync(join(zeroCommit.root, criticDispositionAddendumPath(zeroCommit.value.taskId))), false);
  } finally { rmSync(zeroCommit.root, { recursive: true, force: true }); }
});

assert.equal(cases.length, 19, "the complete dispatch-record writer corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});

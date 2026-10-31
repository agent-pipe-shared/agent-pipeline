// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { reportSha256, validateDispatchRecord } from "../lib/dispatch-record.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { VERDICT, verifyCommit } from "./dispatch-authorship-verify.mjs";
import { writeCriticDispositionAddendumObject, writeDispatchRecord, writeDispatchRecordObject, writeOrchestratorAttestedDispatchRecord } from "./dispatch-record-write.mjs";
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
    diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T3" };
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
    assert.throws(() => writeCriticDispositionAddendumObject({ repoRoot: inProgress.root, addendum: inProgress.addendum }),
      (error) => error instanceof TypeError && error.message === "critic addendum does not bind an immutable Critic-required authored v3/v4 record");
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

// D56 slice 2: the orchestrator-attested writer. The orchestrator committed the worker's delivery and says so; the generic
// writers never mint this kind, and the attested route reopens the Git objects before it publishes.
const ATT_KIND = { schema: "pipeline.dispatch-outcome-classification.v1", kind: "orchestrator-attested" };
const ATT_COMMIT = "c".repeat(40);
const ATT_BASE = "9".repeat(40);
function attestedRecord(overrides = {}) {
  const report = { text: "Orchestrator-committed hand-back.", changedFiles: ["src/x.mjs"] };
  const { criticSkip: _skip, ...rest } = record({ taskId: "NVA-ATT-1", candidateCommit: ATT_COMMIT, commits: [ATT_COMMIT] });
  return { ...rest, schema: "pipeline.dispatch-record.v4", outcome: "completed-orchestrator-attested", resultSha256: reportSha256(report.text), report,
    log: [{ phase: "orchestrator-attested", toolUseCount: 0, note: "tool-use count and worker model not observed" }],
    criticRequired: { schema: CRITIC_REQUIRED_SCHEMA, trigger: { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T3" },
    outcomeClassification: ATT_KIND,
    attestation: { schema: "pipeline.dispatch-orchestrator-attestation.v1", assurance: "orchestrator-attested", briefingSha256: "e".repeat(64), handbackSha256: "f".repeat(64) },
    ...overrides };
}
function gitReaders({ message = "feat(x): delivered\n\nDispatch: NVA-ATT-1 (goldfish)\nAI-Assisted: true\n", paths = ["src/x.mjs"], parents = { [ATT_COMMIT]: [ATT_BASE] } } = {}) {
  return {
    readCommitMessage: (commit) => { if (!parents[commit]) throw new Error("bad object"); return typeof message === "function" ? message(commit) : message; },
    readChangedPaths: (commit) => { if (!parents[commit]) throw new Error("bad object"); return typeof paths === "function" ? paths(commit) : paths; },
    readParents: (commit) => { if (!parents[commit]) throw new Error("bad object"); return parents[commit]; },
  };
}
function attestedRoot() { const root = mkdtempSync(join(tmpdir(), "dispatch-record-attested-")); mkdirSync(join(root, "evidence")); return root; }
function refusedWith(code, run) { assert.throws(run, (error) => error?.code === code, `expected ${code}`); }

check("attested writer: a Git-verified orchestrator delivery is published exclusively and reads back as the attested kind", () => {
  const root = attestedRoot();
  try {
    const value = attestedRecord();
    const receipt = writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: value }, gitReaders());
    const persisted = validateDispatchRecord(JSON.parse(readFileSync(join(root, receipt.target))));
    assert.deepEqual(persisted, value);
    assert.equal(persisted.outcomeClassification.kind, "orchestrator-attested");
    assert.equal(receipt.taskId, "NVA-ATT-1");
    assert.throws(() => writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: value }, gitReaders()), /already exists/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("attested writer: the generic object and request writers never mint the attested kind", () => {
  const root = attestedRoot();
  try {
    refusedWith("record-attestation-route", () => writeDispatchRecordObject({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: attestedRecord() }, gitReaders()));
    mkdirSync(join(root, "requests"));
    writeFileSync(join(root, "requests", "write.json"), `${JSON.stringify({ schema: "pipeline.dispatch-record-write-request.v1", target: "evidence/dispatch-record-NVA-ATT-1.json", record: attestedRecord() })}\n`);
    refusedWith("record-attestation-route", () => writeDispatchRecord({ repoRoot: root, requestPath: "requests/write.json" }, gitReaders()));
    assert.equal(existsSync(join(root, "evidence/dispatch-record-NVA-ATT-1.json")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("attested writer: a missing, duplicated or foreign Dispatch trailer is refused", () => {
  const root = attestedRoot();
  try {
    for (const message of ["feat(x): delivered\n\nAI-Assisted: true\n",
      "feat(x): delivered\n\nDispatch: NVA-ATT-1 (goldfish)\nDispatch: NVA-ATT-1 (goldfish)\nAI-Assisted: true\n",
      "feat(x): delivered\n\nDispatch: NVA-OTHER (goldfish)\nAI-Assisted: true\n"]) {
      refusedWith("record-attestation-git", () => writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: attestedRecord() }, gitReaders({ message })));
    }
    assert.equal(existsSync(join(root, "evidence/dispatch-record-NVA-ATT-1.json")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("attested writer: changed paths must equal the reported files, in either direction", () => {
  const root = attestedRoot();
  try {
    for (const paths of [["src/x.mjs", "src/extra.mjs"], []]) {
      refusedWith("record-attestation-scope", () => writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: attestedRecord() }, gitReaders({ paths })));
    }
    assert.equal(existsSync(join(root, "evidence/dispatch-record-NVA-ATT-1.json")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("attested writer: commits must form one linear chain, no merge, each commit readable", () => {
  const root = attestedRoot();
  try {
    const first = "d".repeat(40);
    const chain = attestedRecord({ commits: [first, ATT_COMMIT] });
    // wrong parent: the second commit does not descend from the first
    refusedWith("record-attestation-git", () => writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: chain }, gitReaders({ parents: { [first]: [ATT_BASE], [ATT_COMMIT]: [ATT_BASE] }, paths: ["src/x.mjs"] })));
    // merge commit
    refusedWith("record-attestation-git", () => writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: attestedRecord() }, gitReaders({ parents: { [ATT_COMMIT]: [ATT_BASE, first] } })));
    // unreadable object
    refusedWith("record-attestation-git", () => writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: attestedRecord() }, gitReaders({ parents: {} })));
    // a proper two-commit chain is accepted
    const good = writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: chain }, gitReaders({ parents: { [first]: [ATT_BASE], [ATT_COMMIT]: [first] }, paths: (commit) => (commit === first ? ["src/x.mjs"] : ["src/x.mjs"]) }));
    assert.equal(good.taskId, "NVA-ATT-1");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("attested writer: it refuses any record that is not the attested kind, and a hand-written authored commit still needs the host route", () => {
  const root = attestedRoot();
  try {
    refusedWith("record-attestation-route", () => writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-WRITE-1.json", record: record() }, gitReaders()));
    const authored = record({ schema: "pipeline.dispatch-record.v4", runner: "claude", taskId: "NVA-HAND-AUTHORED", resultSha256: reportSha256("Done."), outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" } });
    refusedWith("record-host-observation", () => writeDispatchRecordObject({ repoRoot: root, target: "evidence/dispatch-record-NVA-HAND-AUTHORED.json", record: authored }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// D56 slice 3: the Elephant-side CLI that RECONSTRUCTS the attested record from the briefing, the hand-back and the commits.
import * as writerModule from "./dispatch-record-write.mjs";
import { spawnSync } from "node:child_process";
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
function briefingBody(overrides = {}) {
  const block = { schema: "pipeline.native-goldfish-host-briefing.v3", dispatchId: "NVA-ATT-1", candidateCommit: ATT_BASE, runner: "claude",
    role: "pipeline-core:goldfish-implementor", agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium", rulesetSha: "0.6.2+local",
    allowedPaths: ["src/x.mjs"], criticDecision: attestedRecord().criticRequired, ...overrides };
  return `Read the obligations first.\n\n<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify(block)}\n-->\n\n### 1. Goal\nDo it.\n`;
}
function cliFixture({ briefing = briefingBody(), handback = "Delivered x.\n", request = {} } = {}) {
  const root = attestedRoot(); mkdirSync(join(root, "scratch"));
  writeFileSync(join(root, "scratch", "briefing.md"), briefing); writeFileSync(join(root, "scratch", "handback.txt"), handback);
  writeFileSync(join(root, "scratch", "attested-request.json"), JSON.stringify({ schema: "pipeline.dispatch-attested-request.v1", briefingPath: "scratch/briefing.md",
    handbackPath: "scratch/handback.txt", commits: [ATT_COMMIT], ...request }));
  return root;
}
const runCli = (root, dependencies = gitReaders()) => writerModule.runAttestedRequest({ repoRoot: root, attestedRequestPath: "scratch/attested-request.json" }, dependencies);

check("attested CLI: a briefing, a hand-back and one trailer-bearing commit reconstruct a record that validates as orchestrator-attested", () => {
  const root = cliFixture();
  try {
    const receipt = runCli(root);
    assert.equal(receipt.target, "evidence/dispatch-record-NVA-ATT-1.json");
    const persisted = validateDispatchRecord(JSON.parse(readFileSync(join(root, receipt.target))));
    assert.equal(persisted.outcomeClassification.kind, "orchestrator-attested");
    assert.equal(persisted.taskId, "NVA-ATT-1"); assert.equal(persisted.candidateCommit, ATT_COMMIT); assert.deepEqual(persisted.commits, [ATT_COMMIT]);
    assert.deepEqual(persisted.report.changedFiles, ["src/x.mjs"]); assert.equal(persisted.report.text, "Delivered x.\n");
    assert.equal(persisted.attestation.briefingSha256, sha256Hex(readFileSync(join(root, "scratch", "briefing.md"))));
    assert.equal(persisted.attestation.handbackSha256, sha256Hex(readFileSync(join(root, "scratch", "handback.txt"))));
    assert.equal(persisted.runner, "claude"); assert.deepEqual(persisted.criticRequired, attestedRecord().criticRequired);
    assert.deepEqual(persisted.log, [{ phase: "orchestrator-attested", toolUseCount: 0, note: "tool-use count and worker model not observed" }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
  const json = cliFixture({ handback: JSON.stringify({ report: "From the JSON hand-back." }) });
  try { assert.equal(validateDispatchRecord(JSON.parse(readFileSync(join(json, runCli(json).target)))).report.text, "From the JSON hand-back."); }
  finally { rmSync(json, { recursive: true, force: true }); }
});

check("attested CLI: a commit without the task trailer, or a briefing without the marker or for another task, is refused", () => {
  const root = cliFixture();
  try {
    refusedWith("record-attestation-git", () => runCli(root, gitReaders({ message: "feat(x): delivered\n\nAI-Assisted: true\n" })));
    assert.equal(existsSync(join(root, "evidence/dispatch-record-NVA-ATT-1.json")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
  const noMarker = cliFixture({ briefing: "no marker here\n" });
  try { refusedWith("attested-briefing", () => runCli(noMarker)); } finally { rmSync(noMarker, { recursive: true, force: true }); }
  const foreign = cliFixture({ briefing: briefingBody({ dispatchId: "NVA-OTHER" }) });
  try { refusedWith("record-attestation-git", () => runCli(foreign)); } finally { rmSync(foreign, { recursive: true, force: true }); }
});

check("attested CLI: the recorded digests are computed from the bytes, so a different hand-back cannot carry the same digest", () => {
  const a = cliFixture({ handback: "Delivered x.\n" }); const b = cliFixture({ handback: "Delivered x differently.\n" });
  try {
    const left = JSON.parse(readFileSync(join(a, runCli(a).target))); const right = JSON.parse(readFileSync(join(b, runCli(b).target)));
    assert.notEqual(left.attestation.handbackSha256, right.attestation.handbackSha256);
    assert.equal(left.attestation.briefingSha256, right.attestation.briefingSha256);
    assert.equal(right.attestation.handbackSha256, sha256Hex(Buffer.from("Delivered x differently.\n")));
  } finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
});

check("attested CLI: unknown request keys, absolute or out-of-tree paths, bad commits and both request flags together are refused", () => {
  for (const [request, code] of [[{ extra: 1 }, "attested-request-shape"], [{ briefingPath: "/etc/passwd" }, "attested-request-path"],
    [{ handbackPath: "src/handback.txt" }, "attested-request-path"], [{ briefingPath: "scratch/../src/b.md" }, "attested-request-path"],
    [{ commits: ["abc"] }, "attested-request-shape"], [{ commits: [] }, "attested-request-shape"]]) {
    const root = cliFixture({ request });
    try { refusedWith(code, () => runCli(root)); assert.equal(existsSync(join(root, "evidence/dispatch-record-NVA-ATT-1.json")), false); }
    finally { rmSync(root, { recursive: true, force: true }); }
  }
  refusedWith("usage", () => writerModule.parseArgs(["--repo-root", "r", "--request", "a.json", "--attested-request", "b.json"]));
  refusedWith("usage", () => writerModule.parseArgs(["--repo-root", "r"]));
  assert.deepEqual(writerModule.parseArgs(["--repo-root", "r", "--attested-request", "b.json"]), { repoRoot: "r", attestedRequestPath: "b.json" });
});

check("attested CLI: the existing host route CLI behaves as before", () => {
  assert.deepEqual(writerModule.parseArgs(["--repo-root", "r", "--request", "a.json"]), { repoRoot: "r", requestPath: "a.json" });
  const root = fixture();
  try {
    const run = spawnSync(process.execPath, [join(import.meta.dirname, "dispatch-record-write.mjs"), "--repo-root", root, "--request", "requests/write.json"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).taskId, "NVA-WRITE-1");
    const again = spawnSync(process.execPath, [join(import.meta.dirname, "dispatch-record-write.mjs"), "--repo-root", root, "--request", "requests/write.json"], { encoding: "utf8" });
    assert.equal(again.status, 2); assert.match(again.stderr, /DISPATCH-RECORD-WRITE-FAILED: target-exists/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("attested CLI: a second call for the same task is refused and the first record stays untouched", () => {
  const root = cliFixture();
  try {
    const first = runCli(root); const before = readFileSync(join(root, first.target));
    assert.throws(() => runCli(root), /already exists/u);
    assert.deepEqual(readFileSync(join(root, first.target)), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// N33 A+B+C (D212): the sanctioned addendum route. `--critic-addendum <request>` is the command the close gate's refusal names;
// the request file IS the addendum object. The route refuses an addendum that no consumed, passed Critic receipt binds BEFORE it
// publishes, because the publication is exclusive and a wrongly written addendum could never be replaced.
const N33_BASE = "1".repeat(40);
const N33_HEAD = "2".repeat(40);
function n33Fixture({ commits = [ATT_COMMIT] } = {}) {
  const root = attestedRoot();
  const value = attestedRecord({ commits, candidateCommit: commits.at(-1) });
  const parents = Object.fromEntries(commits.map((commit, index) => [commit, [index === 0 ? ATT_BASE : commits[index - 1]]]));
  const receipt = writeOrchestratorAttestedDispatchRecord({ repoRoot: root, target: "evidence/dispatch-record-NVA-ATT-1.json", record: value }, gitReaders({ parents }));
  const criticBytes = Buffer.from("Independent Critic review of the feature course.\n");
  writeFileSync(join(root, "evidence/critic-NVA-ATT-1.md"), criticBytes);
  const addendum = { schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA, recordPath: "evidence/dispatch-record-NVA-ATT-1.json", recordSha256: receipt.sha256,
    taskId: "NVA-ATT-1", candidateCommit: value.candidateCommit, reviewCandidateCommit: N33_HEAD, criticPacketId: "d".repeat(32), criticReceiptSha256: "c".repeat(64),
    criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: "NVA-ATT-1", candidateCommit: value.candidateCommit, path: "evidence/critic-NVA-ATT-1.md",
      sha256: createHash("sha256").update(criticBytes).digest("hex") } };
  mkdirSync(join(root, "scratch"), { recursive: true });
  writeFileSync(join(root, "scratch/addendum-request.json"), `${JSON.stringify(addendum)}\n`);
  return { root, value, addendum };
}
/** A course receipt of ANOTHER task whose reviewed range is (N33_BASE, N33_HEAD]; ATT_COMMIT lies inside it unless `outside` names it the base. */
function n33CoverageOptions({ outside = false } = {}) {
  return { coverageOptions: {
    gitRead: (args) => {
      if (args[1] === "--git-common-dir") return ".git";
      if (args[0] === "rev-parse") return N33_HEAD;
      if (args[0] === "merge-base" && outside && args[2] === ATT_COMMIT && args[3] === N33_BASE) return "";
      if (args[0] === "merge-base" && args[3] === N33_BASE) { throw Object.assign(new Error("not an ancestor"), { status: 1 }); }
      return "";
    },
    readBoundCriticReceipt: () => ({ packet: { request: { taskId: "FEATURE-COURSE" }, candidate: { base: N33_BASE, commit: N33_HEAD }, references: [] },
      critic: { reviewPass: true, candidate: { base: N33_BASE, commit: N33_HEAD }, reviewRange: { base: N33_BASE, commit: N33_HEAD, diffSha256: "9".repeat(64) } }, criticReceiptSha256: "c".repeat(64) }),
  } };
}

check("N33 addendum writer admits an orchestrator-attested one-commit record and refuses a two-commit one (D212 A)", () => {
  const { root, addendum } = n33Fixture();
  try {
    const receipt = writeCriticDispositionAddendumObject({ repoRoot: root, addendum });
    assert.equal(receipt.target, "evidence/dispatch-critic-addendum-NVA-ATT-1.json");
    assert.deepEqual(JSON.parse(readFileSync(join(root, receipt.target), "utf8")), addendum);
  } finally { rmSync(root, { recursive: true, force: true }); }
  const two = n33Fixture({ commits: ["8".repeat(40), ATT_COMMIT] });
  try {
    assert.throws(() => writeCriticDispositionAddendumObject({ repoRoot: two.root, addendum: two.addendum }), /authored v3\/v4/u);
    assert.equal(existsSync(join(two.root, criticDispositionAddendumPath("NVA-ATT-1"))), false);
  } finally { rmSync(two.root, { recursive: true, force: true }); }
});

check("N33 --critic-addendum is the third mutually exclusive mode and keeps the usage refusals", () => {
  assert.deepEqual(writerModule.parseArgs(["--repo-root", "r", "--critic-addendum", "scratch/a.json"]), { repoRoot: "r", criticAddendumPath: "scratch/a.json" });
  refusedWith("usage", () => writerModule.parseArgs(["--repo-root", "r", "--critic-addendum", "a.json", "--request", "b.json"]));
  refusedWith("usage", () => writerModule.parseArgs(["--repo-root", "r", "--critic-addendum", "a.json", "--attested-request", "b.json"]));
  refusedWith("usage", () => writerModule.parseArgs(["--repo-root", "r", "--critic-addendum", "a.json", "--critic-addendum", "b.json"]));
});

check("N33 --critic-addendum publishes an addendum a course receipt binds, and refuses one it does not bind without writing", () => {
  const bound = n33Fixture();
  try {
    const receipt = writerModule.runCriticAddendumRequest({ repoRoot: bound.root, criticAddendumPath: "scratch/addendum-request.json" }, n33CoverageOptions());
    assert.equal(receipt.schema, "pipeline.critic-disposition-addendum-write-receipt.v1");
    assert.equal(existsSync(join(bound.root, receipt.target)), true);
    refusedWith("target-exists", () => writerModule.runCriticAddendumRequest({ repoRoot: bound.root, criticAddendumPath: "scratch/addendum-request.json" }, n33CoverageOptions()));
  } finally { rmSync(bound.root, { recursive: true, force: true }); }
  const outside = n33Fixture();
  try {
    refusedWith("addendum-unbound", () => writerModule.runCriticAddendumRequest({ repoRoot: outside.root, criticAddendumPath: "scratch/addendum-request.json" }, n33CoverageOptions({ outside: true })));
    assert.equal(existsSync(join(outside.root, criticDispositionAddendumPath("NVA-ATT-1"))), false, "an unbound addendum must never be published");
  } finally { rmSync(outside.root, { recursive: true, force: true }); }
});

check("N33 --critic-addendum refuses an absolute, out-of-tree or non-JSON request path", () => {
  const { root } = n33Fixture();
  try {
    for (const path of ["/etc/passwd", "src/addendum.json", "scratch/../src/a.json"]) {
      refusedWith("attested-request-path", () => writerModule.runCriticAddendumRequest({ repoRoot: root, criticAddendumPath: path }, n33CoverageOptions()));
    }
    writeFileSync(join(root, "scratch/not-json.json"), "{ nope");
    refusedWith("addendum-shape", () => writerModule.runCriticAddendumRequest({ repoRoot: root, criticAddendumPath: "scratch/not-json.json" }, n33CoverageOptions()));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

assert.equal(cases.length, 35, "the complete dispatch-record writer corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});

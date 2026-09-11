// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateDispatchRecord } from "../lib/dispatch-record.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { VERDICT, verifyCommit } from "./dispatch-authorship-verify.mjs";
import { writeDispatchRecord } from "./dispatch-record-write.mjs";
import { CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../lib/critic-skip-decision.mjs";

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

assert.equal(cases.length, 10, "the complete dispatch-record writer corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});

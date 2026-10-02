#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for `dispatch-authorship-verify.mjs`.
 *
 * The acceptance criteria are behavioural, so the fixtures are behavioural: every case
 * writes a REAL `dispatch-record-<TASK_ID>.json` into a temporary evidence directory and
 * resolves it through the script's own `readRecordFile`, so the naming convention is under
 * test rather than assumed. Commits are synthetic — supplied through the injected readers —
 * because building a git fixture repository would test git, not the correspondence rule.
 * One smoke test at the end does exercise the real git-backed readers against this
 * repository's own HEAD, without pinning a verdict to mutable history.
 *
 * Run: node --test plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_EVIDENCE_DIR,
  ELEPHANT_GENERATOR_ALLOWLIST,
  ELEPHANT_STAGE0_MAX_PATHS,
  VERDICT,
  coveringPath,
  declaredCommits,
  declaredOrchestratorPaths,
  declaredPaths,
  exitCodeFor,
  gitDeps,
  isTerminalOutcome,
  missingBriefingFields,
  parseDispatchTrailer,
  readRecordFile,
  runGeneratorInIsolatedParentTree,
  verifyCommit,
} from "./dispatch-authorship-verify.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_SKIP_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../lib/critic-skip-decision.mjs";
import { authorizeQualityPackageCommit, qualityPackageIntentSha256, SIGNED_QUALITY_PACKAGE_SCHEMA } from "../lib/signed-quality-package.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const EVIDENCE = mkdtempSync(join(SCRATCH, "dispatch-authorship-"));
after(() => rmSync(EVIDENCE, { recursive: true, force: true }));

function writeRecord(taskId, record) {
  writeFileSync(join(EVIDENCE, `dispatch-record-${taskId}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

/** A synthetic commit: message plus changed paths, injected exactly where git would be. */
function commit({ message, paths = [], readBlobAtCommit, runAllowlistedGenerator }) {
  return {
    readCommitMessage: () => message,
    readChangedPaths: () => paths,
    readRecord: (taskId) => readRecordFile(EVIDENCE, taskId),
    readBlobAtCommit,
    runAllowlistedGenerator,
  };
}

const TRAILERS = "\n\nDispatch: DOD-A (goldfish)\nAI-Assisted: true\n";
const trigger = (overrides = {}) => ({ schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 0, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false }, ...overrides });
const skip = () => ({ schema: CRITIC_SKIP_SCHEMA, trigger: trigger(), appliedRow: "T5" });

test("(a) correct pre-v3 trailer record remains nonbinding", () => {
  writeRecord("DOD-A", {
    taskId: "DOD-A",
    outcome: "completed",
    commit: "abc1234",
    model: "claude-sonnet-5",
    rulesetSha: "cb16a3df",
    report: { changedFiles: ["src/thing.mjs - the change", "src/thing.test.mjs - its test"] },
  });
  const verdict = verifyCommit(
    "abc1234def",
    commit({ message: `feat(x): a thing\n\nWhy it matters.${TRAILERS}`, paths: ["src/thing.mjs", "src/thing.test.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "record-pre-v3-nonbinding");
  assert.equal(verdict.taskId, "DOD-A");
});

test("(b) trailer present, no record file -> FAIL record-missing", () => {
  const verdict = verifyCommit(
    "beef111",
    commit({ message: "feat(x): a thing\n\nDispatch: DOD-B-ABSENT (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-missing");
  assert.match(verdict.reason, /DOD-B-ABSENT/u);
});

test("(b2) a marked Agy host commit without its private record stays UNVERIFIABLE in a clone", () => {
  const message = "feat(agy): deliver\n\nDispatch: DOD-B-AGY (goldfish)\nAgy-Host-Observed: v1\nAI-Assisted: true\n";
  const verdict = verifyCommit("beef112", commit({ message, paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "agy-portable-export-required");
  for (const malformed of [
    message.replace("Agy-Host-Observed: v1", "Agy-Host-Observed: v2"),
    message.replace("Agy-Host-Observed: v1", "Agy-Host-Observed: v1\nAgy-Host-Observed: v1"),
    "feat(agy): deliver\n\nAgy-Host-Observed: v1\n\nDispatch: DOD-B-AGY (goldfish)\nAI-Assisted: true\n",
  ]) {
    assert.equal(verifyCommit("beef112", commit({ message: malformed, paths: ["src/thing.mjs"] })).classification,
      "record-missing");
  }
});

test("(c) record still in-progress -> FAIL record-not-terminal", () => {
  writeRecord("DOD-C", { taskId: "DOD-C", outcome: "in-progress", log: [], report: { changedFiles: ["src/thing.mjs - x"] } });
  const verdict = verifyCommit("cafe222", commit({ message: "feat(x): a thing\n\nDispatch: DOD-C (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-not-terminal");
});

test("(c2) a truncated record with no outcome at all is equally non-terminal", () => {
  writeRecord("DOD-C2", { taskId: "DOD-C2", log: [] });
  const verdict = verifyCommit("cafe333", commit({ message: "feat(x): a thing\n\nDispatch: DOD-C2 (goldfish)\nAI-Assisted: true\n", paths: ["a.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-not-terminal");
});

test("(d) no Dispatch trailer -> classified Elephant-direct, UNVERIFIABLE, never a missing-authorship FAIL", () => {
  const verdict = verifyCommit("d00d444", commit({ message: "docs(state): record a verdict\n\nWhy it matters.\n\nAI-Assisted: true\n", paths: ["docs/state.md"] }));
  assert.equal(verdict.classification, "elephant-direct-undeclared");
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.notEqual(verdict.verdict, VERDICT.fail, "an undeclared Elephant commit is not an authorship failure");
  assert.notEqual(verdict.verdict, VERDICT.pass, "silence must not mint a PASS -- that is failure shape 1 of the item");
  assert.match(verdict.reason, /stage-0 \(elephant\)/u);
});

test("(e) the new declared Elephant form PASSes without any record", () => {
  const verdict = verifyCommit(
    "e11e555",
    commit({ message: "chore(x): regenerate\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n", paths: ["templates/prompts/agent-obligations.md"] }),
  );
  assert.equal(verdict.verdict, VERDICT.pass);
  assert.equal(verdict.classification, "elephant-direct-declared");
  assert.equal(verdict.taskId, "stage-0");
});

test("(f) record naming a different commit -> FAIL (item failure shape 3)", () => {
  writeRecord("DOD-F", { taskId: "DOD-F", outcome: "done", commit: "e5a6a9b", report: { changedFiles: ["src/thing.mjs - x"] } });
  const verdict = verifyCommit("f00f666", commit({ message: "feat(x): a thing\n\nDispatch: DOD-F (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-names-different-commit");
});

test("(f2) a pre-v3 multi-commit dispatch remains nonbinding for every declared sha", () => {
  writeRecord("DOD-F2", {
    taskId: "DOD-F2",
    outcome: "done",
    commits: ["6ad81155", "8161c31a"],
    model: "claude-sonnet-5",
    rulesetSha: "cb16a3df",
    report: { changedFiles: ["src/thing.mjs - x"] },
  });
  const fixture = { message: "feat(x): a thing\n\nDispatch: DOD-F2 (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] };
  for (const sha of ["6ad81155f000aa", "8161c31af6c5bb"]) {
    assert.equal(verifyCommit(sha, commit(fixture)).classification, "record-pre-v3-nonbinding", sha);
  }
  const stranger = verifyCommit("deadbeef0000", commit(fixture));
  assert.equal(stranger.verdict, VERDICT.fail);
  assert.equal(stranger.classification, "record-names-different-commit");
});

test("declaredCommits reads both the singular and the plural field, and null when neither", () => {
  assert.deepEqual(declaredCommits({ commit: "abc1234" }), ["abc1234"]);
  assert.deepEqual(declaredCommits({ commits: ["abc1234", "def5678"] }), ["abc1234", "def5678"]);
  assert.equal(declaredCommits({ outcome: "done" }), null);
  assert.equal(declaredCommits({ commit: "   " }), null);
  assert.equal(declaredCommits({ commits: [] }), null);
});

test("(g) terminal record with no machine-readable paths -> UNVERIFIABLE, not PASS", () => {
  writeRecord("DOD-G", { taskId: "DOD-G", outcome: "success", report: "a prose report, as several real records carry" });
  const verdict = verifyCommit("a11a777", commit({ message: "feat(x): a thing\n\nDispatch: DOD-G (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "record-has-no-machine-readable-paths");
});

test("(h) declared paths that do not cover the diff -> FAIL, naming the uncovered paths", () => {
  writeRecord("DOD-H", { taskId: "DOD-H", outcome: "completed", report: { changedFiles: ["src/thing.mjs - x"] } });
  const verdict = verifyCommit(
    "b22b888",
    commit({ message: "feat(x): a thing\n\nDispatch: DOD-H (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs", "harness/scripts/verify.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-paths-do-not-cover");
  assert.deepEqual(verdict.uncovered, ["harness/scripts/verify.mjs"]);
});

test("(i) record whose own taskId denies the trailer -> FAIL (item failure shape 2, structural half)", () => {
  writeRecord("DOD-I", { taskId: "SETUP-4", outcome: "done", report: { changedFiles: ["src/thing.mjs - x"] } });
  const verdict = verifyCommit("c33c999", commit({ message: "feat(x): a thing\n\nDispatch: DOD-I (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-taskid-mismatch");
});

test("(j) a matching model cannot make a pre-v3 record binding", () => {
  writeRecord("DOD-J", {
    taskId: "DOD-J",
    agentType: "goldfish-implementor",
    model: "claude-sonnet-5",
    effort: "medium",
    rulesetSha: "cb16a3df",
    outcome: "completed",
    report: { changedFiles: ["src/thing.mjs - x"] },
  });
  const verdict = verifyCommit("j00j111", commit({ message: "feat(x): a thing\n\nDispatch: DOD-J (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "record-pre-v3-nonbinding");
});

test("(k) recorded model contradicts the dispatched agent's definition (2026-08-08 incident shape) -> downgraded to FAIL model-mismatch", () => {
  writeRecord("DOD-K", {
    taskId: "DOD-K",
    agentType: "goldfish-deep",
    model: "claude-opus-5",
    effort: "xhigh",
    outcome: "completed",
    report: { changedFiles: ["src/thing.mjs - x"] },
  });
  const verdict = verifyCommit("k00k222", commit({ message: "feat(x): a thing\n\nDispatch: DOD-K (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "model-mismatch");
  assert.equal(verdict.modelCheck.classification, "model-mismatch");
});

test("(l) a legacy record's self-declared modelOverride is never accepted as authorization", () => {
  writeRecord("DOD-L", {
    taskId: "DOD-L",
    agentType: "goldfish-deep",
    model: "claude-opus-5",
    effort: "xhigh",
    modelOverride: { model: "claude-opus-5", effort: "xhigh", rationale: "MP-05 criterion 1: guardrail rewrite" },
    rulesetSha: "cb16a3df",
    outcome: "completed",
    report: { changedFiles: ["src/thing.mjs - x"] },
  });
  const verdict = verifyCommit("l00l333", commit({ message: "feat(x): a thing\n\nDispatch: DOD-L (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "model-override-untrusted");
});

test("a directly written v2 modelOverride and malformed v2 record cannot mint PASS", () => {
  const sha = "d".repeat(40);
  const base = {
    schema: "pipeline.dispatch-record.v2", taskId: "DOD-V2", agentType: "goldfish-deep",
    model: "claude-opus-5", effort: "xhigh", rulesetSha: "0.6.2+local", dispatcher: "Elephant",
    candidateCommit: sha, resultSha256: "a".repeat(64), outcome: "completed", commits: [sha], log: [],
    report: { text: "Done.", changedFiles: ["src/thing.mjs"] },
  };
  const deps = commit({ message: "feat(x): done\n\nDispatch: DOD-V2 (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] });
  writeRecord("DOD-V2", { ...base, modelOverride: { model: "claude-opus-5", effort: "xhigh", rationale: "self declared" } });
  assert.equal(verifyCommit(sha, deps).classification, "record-v2-nonbinding");
  writeRecord("DOD-V2", { ...base, commits: [] });
  const malformed = verifyCommit(sha, deps);
  assert.equal(malformed.verdict, VERDICT.fail);
  assert.equal(malformed.classification, "record-v2-invalid");
});

test("v2 records remain readable but are explicitly nonbinding for a new delivery", () => {
  const sha = "e".repeat(40);
  const record = {
    schema: "pipeline.dispatch-record.v2", taskId: "DOD-V2-BIND", agentType: "goldfish-implementor",
    model: "claude-sonnet-5", effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant",
    candidateCommit: sha, resultSha256: "a".repeat(64), outcome: "completed", commits: [sha], log: [],
    report: { text: "Done.", changedFiles: ["src/thing.mjs"] },
  };
  writeRecord("DOD-V2-BIND", record);
  const deps = commit({ message: "feat(x): done\n\nDispatch: DOD-V2-BIND (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] });
  const matching = verifyCommit(sha, deps);
  assert.equal(matching.verdict, VERDICT.unverifiable);
  assert.equal(matching.classification, "record-v2-nonbinding");
  const other = verifyCommit("f".repeat(40), deps);
  assert.equal(other.verdict, VERDICT.unverifiable);
  assert.equal(other.classification, "record-v2-nonbinding");
});

test("unversioned, v1, evidence-v1 and v2 shapes are all nonbinding for new delivery", () => {
  const sha = "5".repeat(40);
  const depsFor = (taskId) => commit({ message: `feat(x): done\n\nDispatch: ${taskId} (goldfish)\nAI-Assisted: true\n`, paths: ["src/thing.mjs"] });
  for (const [taskId, schema] of [["PRE-NONE", undefined], ["PRE-V1", "pipeline.dispatch-record.v1"], ["PRE-EV1", "pipeline.dispatch-evidence.v1"]]) {
    const record = { taskId, outcome: "completed", model: "claude-sonnet-5", rulesetSha: "old", report: { changedFiles: ["src/thing.mjs"] } };
    if (schema !== undefined) record.schema = schema;
    writeRecord(taskId, record);
    const verdict = verifyCommit(sha, depsFor(taskId));
    assert.equal(verdict.verdict, VERDICT.unverifiable, taskId);
    assert.equal(verdict.classification, "record-pre-v3-nonbinding", taskId);
  }
});

test("v3 records bind authorship and carry exactly one Critic disposition", () => {
  const sha = "9".repeat(40);
  const base = {
    schema: "pipeline.dispatch-record.v3", taskId: "DOD-V3-BIND", agentType: "goldfish-implementor",
    model: "claude-sonnet-5", effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant",
    candidateCommit: sha, resultSha256: "a".repeat(64), outcome: "completed", commits: [sha], log: [],
    report: { text: "Done.", changedFiles: ["src/thing.mjs"] },
    criticSkip: skip(),
  };
  const deps = commit({ message: "feat(x): done\n\nDispatch: DOD-V3-BIND (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] });
  writeRecord("DOD-V3-BIND", base);
  assert.equal(verifyCommit(sha, deps).verdict, VERDICT.pass);
  writeRecord("DOD-V3-BIND", { ...base, criticSkip: undefined });
  const missing = verifyCommit(sha, deps);
  assert.equal(missing.verdict, VERDICT.fail);
  assert.equal(missing.classification, "record-v3-invalid");
});

test("v3 criticRequired is a valid pending lifecycle state but cannot mint authorship PASS", () => {
  const sha = "8".repeat(40);
  const record = {
    schema: "pipeline.dispatch-record.v3", taskId: "DOD-V3-REQUIRED", agentType: "goldfish-implementor",
    model: "claude-sonnet-5", effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant",
    candidateCommit: sha, resultSha256: "a".repeat(64), outcome: "completed", commits: [sha], log: [],
    report: { text: "Done.", changedFiles: ["src/thing.mjs"] },
    criticRequired: { schema: CRITIC_REQUIRED_SCHEMA, trigger: trigger({ rigorLevel: 2 }), appliedRow: "T3" },
  };
  writeRecord("DOD-V3-REQUIRED", record);
  const deps = commit({ message: "feat(x): done\n\nDispatch: DOD-V3-REQUIRED (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] });
  const pending = verifyCommit(sha, deps);
  assert.equal(pending.verdict, VERDICT.unverifiable);
  assert.equal(pending.classification, "critic-evidence-pending");
});

test("v4 authored records preserve required-pending and reject non-authoring outcomes", () => {
  const sha = "4".repeat(40);
  const report = { text: "Done.", changedFiles: ["src/thing.mjs"] };
  const authored = {
    schema: "pipeline.dispatch-record.v4", taskId: "DOD-V4-REQUIRED", agentType: "goldfish-implementor",
    model: "claude-sonnet-5", effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant",
    candidateCommit: sha, resultSha256: createHash("sha256").update(report.text, "utf8").digest("hex"), outcome: "completed",
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" }, commits: [sha], log: [], report,
    criticRequired: { schema: CRITIC_REQUIRED_SCHEMA, trigger: trigger({ rigorLevel: 2 }), appliedRow: "T3" },
  };
  const deps = commit({ message: "feat(x): done\n\nDispatch: DOD-V4-REQUIRED (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] });
  writeRecord("DOD-V4-REQUIRED", authored);
  assert.equal(verifyCommit(sha, deps).classification, "critic-evidence-pending");

  const readOnly = {
    ...authored,
    taskId: "DOD-V4-READONLY",
    outcome: "read-only-completed",
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "read-only" },
    commits: [],
    criticSkip: skip(),
  };
  delete readOnly.criticRequired;
  writeRecord("DOD-V4-READONLY", readOnly);
  const readOnlyDeps = commit({ message: "feat(x): done\n\nDispatch: DOD-V4-READONLY (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] });
  assert.equal(verifyCommit(sha, readOnlyDeps).classification, "record-outcome-does-not-attest-authorship");
  const undelivered = {
    ...authored, taskId: "DOD-V4-UNDELIVERED", outcome: "completed-no-delivery",
    outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "completed-undelivered" },
    observationIdentity: { dispatchId: "dispatch-1", attemptId: "attempt-1" },
    resultSha256: null, commits: [], report: null,
  };
  writeRecord("DOD-V4-UNDELIVERED", undelivered);
  const undeliveredDeps = commit({ message: "feat(x): done\n\nDispatch: DOD-V4-UNDELIVERED (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] });
  const undeliveredAuthorship = verifyCommit(sha, undeliveredDeps);
  assert.equal(undeliveredAuthorship.verdict, VERDICT.fail);
  assert.equal(undeliveredAuthorship.classification, "record-outcome-does-not-attest-authorship");
});

test("v4 authored Antigravity record cannot mint PASS from Claude frontmatter or a self-declared model", () => {
  const sha = "5".repeat(40);
  const report = { text: "Done.", changedFiles: ["src/thing.mjs"] };
  const authored = {
    schema: "pipeline.dispatch-record.v4", taskId: "DOD-V4-AGY", agentType: "goldfish-implementor",
    runner: "antigravity", model: "gemini-3.8-flash-high", effort: "high", rulesetSha: "0.7.0+local",
    dispatcher: "Elephant", candidateCommit: sha,
    resultSha256: createHash("sha256").update(report.text, "utf8").digest("hex"),
    outcome: "completed", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
    commits: [sha], log: [], report, criticSkip: skip(),
  };
  writeRecord("DOD-V4-AGY", authored);
  const deps = commit({
    message: "feat(agy): done\n\nDispatch: DOD-V4-AGY (goldfish)\nAI-Assisted: true\n",
    paths: ["src/thing.mjs"],
  });
  const verdict = verifyCommit(sha, deps);
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "runner-model-authority-unverified");
  assert.equal(verdict.modelCheck.classification, "runner-model-authority-required");
  const local = { ...deps, verifyAgyHostObservation: () => ({ ok: true,
    authority: "host-observed-local" }) };
  assert.equal(verifyCommit(sha, local).modelCheck.classification, "host-observed-local");
  assert.equal(verifyCommit(sha, { ...deps,
    verifyAgyHostObservation: () => { throw new Error("private reader failed"); } }).classification,
  "runner-model-authority-unverified");
  const required = { ...authored, criticRequired: { schema: CRITIC_REQUIRED_SCHEMA,
    trigger: trigger({ rigorLevel: 2 }), appliedRow: "T3" } };
  delete required.criticSkip;
  writeRecord("DOD-V4-AGY", required);
  assert.equal(verifyCommit(sha, local).classification, "critic-evidence-pending");
  const reviewed = { ...local, verifyCriticAddendum: () => ({ ok: true,
    code: "critic-addendum-bound" }) };
  assert.equal(verifyCommit(sha, reviewed).verdict, VERDICT.pass);
  assert.equal(verifyCommit(sha, { ...reviewed,
    verifyCriticAddendum: () => ({ ok: false, code: "critic-addendum-invalid" }) }).classification,
  "critic-addendum-invalid");
  assert.equal(verifyCommit(sha, { ...reviewed,
    verifyCriticAddendum: () => { throw new Error("private addendum reader failed"); } }).classification,
  "critic-addendum-invalid");
  let portableCalls = 0;
  const portable = { ...deps,
    verifyCriticAddendum: () => ({ ok: false, code: "critic-addendum-missing" }),
    verifyAgyPortableExport: () => { portableCalls += 1; return { ok: true, authority: "host-observed-portable" }; } };
  assert.equal(verifyCommit(sha, portable).verdict, VERDICT.pass);
  assert.equal(portableCalls, 1);
  const invalidAddendum = { ...portable,
    verifyCriticAddendum: () => ({ ok: false, code: "critic-addendum-invalid" }) };
  assert.equal(verifyCommit(sha, invalidAddendum).classification, "critic-addendum-invalid");
  assert.equal(portableCalls, 1, "a present invalid addendum must not be bypassed by the signed export");
});

test("native Claude/Codex authored records require exact host-observation markers and local evidence", () => {
  for (const runner of ["claude", "codex"]) {
    const sha = runner === "claude" ? "6".repeat(40) : "7".repeat(40);
    const taskId = `DOD-V4-${runner.toUpperCase()}`;
    const report = { text: "Host-validated native return.", changedFiles: ["src/native.mjs"] };
    const authored = {
      schema: "pipeline.dispatch-record.v4", taskId, agentType: "goldfish-implementor",
      runner, model: runner === "claude" ? "claude-sonnet-5" : "gpt-6-luna", effort: "medium",
      rulesetSha: "0.7.0+local", dispatcher: "Elephant", candidateCommit: sha,
      resultSha256: createHash("sha256").update(report.text, "utf8").digest("hex"),
      outcome: "completed", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
      commits: [sha], log: [], report, criticSkip: skip(),
    };
    writeRecord(taskId, authored);
    const marker = `Native-Host-Observed: v1 (${runner})`;
    const deps = commit({ message: `feat(${runner}): done\n\nDispatch: ${taskId} (goldfish)\n${marker}\nAI-Assisted: true\n`, paths: ["src/native.mjs"] });
    const unmarked = verifyCommit(sha, { ...deps,
      readCommitMessage: () => `feat(${runner}): done\n\nDispatch: ${taskId} (goldfish)\nAI-Assisted: true\n` });
    assert.equal(unmarked.verdict, VERDICT.unverifiable);
    assert.equal(unmarked.classification, "native-host-marker-required");
    const clone = verifyCommit(sha, { ...deps,
      verifyNativeHostObservation: () => ({ ok: false, code: "NGHO-OBSERVATION-MISSING" }) });
    assert.equal(clone.verdict, VERDICT.unverifiable, JSON.stringify(clone));
    assert.equal(clone.classification, "native-host-observation-required");
    const local = verifyCommit(sha, { ...deps,
      verifyNativeHostObservation: (_id, record) => record.runner === runner
        ? { ok: true, authority: "host-observed-local" } : { ok: false, code: "mismatch" } });
    assert.equal(local.verdict, VERDICT.pass);
    assert.equal(local.modelCheck.classification, "host-observed-local");
    const corrupt = verifyCommit(sha, { ...deps,
      verifyNativeHostObservation: () => ({ ok: false, code: "NGHO-GIT-READBACK" }) });
    assert.equal(corrupt.verdict, VERDICT.fail);
    assert.equal(corrupt.classification, "native-host-observation-invalid");
    assert.equal(verifyCommit(sha, { ...deps,
      readCommitMessage: () => deps.readCommitMessage().replace(marker, "Native-Host-Observed: v2 (" + runner + ")") }).classification,
    "native-host-marker-invalid");
  }
});

test("actual paths reject false T5 and T0 while honest T1 required/evidence is accepted", () => {
  const sha = "7".repeat(40);
  const base = {
    schema: "pipeline.dispatch-record.v3", taskId: "DOD-V3-PATHS", agentType: "goldfish-implementor",
    model: "claude-sonnet-5", effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant",
    candidateCommit: sha, resultSha256: "a".repeat(64), outcome: "completed", commits: [sha], log: [],
    report: { text: "Done.", changedFiles: ["plugins/pipeline-core/hooks/guard-push.mjs"] },
  };
  const deps = commit({ message: "fix(guard): done\n\nDispatch: DOD-V3-PATHS (goldfish)\nAI-Assisted: true\n", paths: ["plugins/pipeline-core/hooks/guard-push.mjs"] });

  writeRecord("DOD-V3-PATHS", { ...base, criticSkip: skip() });
  assert.equal(verifyCommit(sha, deps).classification, "critic-trigger-underdeclared");

  const t0 = { schema: CRITIC_SKIP_SCHEMA, trigger: trigger({ diff: { mechanical: true, architecture: false, guardrails: false, security: false } }), appliedRow: "T0" };
  writeRecord("DOD-V3-PATHS", { ...base, report: { text: "Done.", changedFiles: ["src/runtime.mjs"] }, criticSkip: t0 });
  const sourceDeps = commit({ message: "fix(core): done\n\nDispatch: DOD-V3-PATHS (goldfish)\nAI-Assisted: true\n", paths: ["src/runtime.mjs"] });
  assert.equal(verifyCommit(sha, sourceDeps).classification, "critic-mechanical-path-mismatch");

  const honestT1 = { schema: CRITIC_REQUIRED_SCHEMA, trigger: trigger({ diff: { mechanical: false, architecture: false, guardrails: true, security: false } }), appliedRow: "T1" };
  writeRecord("DOD-V3-PATHS", { ...base, criticRequired: honestT1 });
  assert.equal(verifyCommit(sha, deps).classification, "critic-evidence-pending");

  writeRecord("DOD-V3-PATHS", { ...base, criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId: "DOD-V3-PATHS", candidateCommit: sha, path: "evidence/critic-DOD-V3-PATHS.json", sha256: "b".repeat(64) } });
  assert.equal(verifyCommit(sha, deps).verdict, VERDICT.pass);
});

test("an honest T0 accepts only generated and lockfile paths", () => {
  const sha = "6".repeat(40);
  const mechanicalTrigger = trigger({ diff: { mechanical: true, architecture: false, guardrails: false, security: false } });
  writeRecord("DOD-V3-MECHANICAL", {
    schema: "pipeline.dispatch-record.v3", taskId: "DOD-V3-MECHANICAL", agentType: "goldfish-implementor",
    model: "claude-sonnet-5", effort: "medium", rulesetSha: "0.6.2+local", dispatcher: "Elephant",
    candidateCommit: sha, resultSha256: "a".repeat(64), outcome: "completed", commits: [sha], log: [],
    report: { text: "Done.", changedFiles: ["generated/client.mjs", "package-lock.json"] },
    criticSkip: { schema: CRITIC_SKIP_SCHEMA, trigger: mechanicalTrigger, appliedRow: "T0" },
  });
  const deps = commit({ message: "chore(gen): done\n\nDispatch: DOD-V3-MECHANICAL (goldfish)\nAI-Assisted: true\n", paths: ["generated/client.mjs", "package-lock.json"] });
  assert.equal(verifyCommit(sha, deps).verdict, VERDICT.pass);
});

test("(m) a record without agentType is explicitly pre-v3 and nonbinding", () => {
  writeRecord("DOD-M", {
    taskId: "DOD-M",
    model: "claude-sonnet-5",
    effort: "medium",
    rulesetSha: "cb16a3df",
    outcome: "completed",
    report: { changedFiles: ["src/thing.mjs - x"] },
  });
  const verdict = verifyCommit("m00m444", commit({ message: "feat(x): a thing\n\nDispatch: DOD-M (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "record-pre-v3-nonbinding");
});

test("a Dispatch: mentioned in the body prose is not authorship evidence", () => {
  const verdict = verifyCommit(
    "d44d000",
    commit({ message: "docs: explain\n\nThe rule is Dispatch: SHIP-2 (goldfish) on every commit.\n\nAI-Assisted: true\n", paths: ["docs/x.md"] }),
  );
  assert.equal(verdict.classification, "elephant-direct-undeclared");
});

test("a malformed Dispatch value FAILs rather than being read as a task id", () => {
  const verdict = verifyCommit("e55e111", commit({ message: "feat(x): a thing\n\nDispatch: elephant-stage0\nAI-Assisted: true\n", paths: ["a.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "trailer-malformed");
});

test("parseDispatchTrailer reads both sanctioned forms through one grammar", () => {
  assert.deepEqual(parseDispatchTrailer("x\n\nDispatch: NVA-BL-34 (goldfish)\nAI-Assisted: true\n"), {
    raw: "NVA-BL-34 (goldfish)",
    id: "NVA-BL-34",
    role: "goldfish",
    malformed: false,
  });
  assert.deepEqual(parseDispatchTrailer("x\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n"), {
    raw: "stage-0 (elephant)",
    id: "stage-0",
    role: "elephant",
    malformed: false,
  });
  assert.equal(parseDispatchTrailer("x\n\nAI-Assisted: true\n"), null);
});

test("terminality is a denylist: the corpus vocabulary all counts as terminal", () => {
  for (const outcome of ["completed", "success", "done", "completed-with-open-items", "completed-by-elephant-finish", "stopped-tool-budget"]) {
    assert.equal(isTerminalOutcome(outcome), true, outcome);
  }
  for (const outcome of ["in-progress", "In-Progress", "", "   ", null, undefined, 7]) {
    assert.equal(isTerminalOutcome(outcome), false, String(outcome));
  }
});

test("path coverage accepts a declared directory prefix but never a bare basename", () => {
  assert.equal(coveringPath("plugins/pipeline-core/lib/a.mjs", ["plugins/pipeline-core/lib"]), "plugins/pipeline-core/lib");
  assert.equal(coveringPath("plugins/pipeline-core/lib/a.mjs", ["a.mjs"]), null);
  assert.equal(coveringPath("src/a.mjs", ["src/a.mjs - because"]), null, "the rationale suffix is stripped by declaredPaths, not here");
});

test("declaredPaths distinguishes 'no path field' from 'an empty list'", () => {
  assert.equal(declaredPaths({ outcome: "done", report: "prose" }), null);
  assert.deepEqual(declaredPaths({ report: { changedFiles: [] } }), []);
  assert.deepEqual(declaredPaths({ report: { changedFiles: ["`src/a.mjs` - why", { path: "src/b.mjs" }] } }), ["src/a.mjs", "src/b.mjs"]);
});

test("orchestratorAddedFiles: declaredOrchestratorPaths extracts paths, and declaredPaths merges them", () => {
  assert.deepEqual(declaredOrchestratorPaths({ report: { changedFiles: ["src/a.mjs"] } }), []);
  assert.deepEqual(
    declaredOrchestratorPaths({ report: { changedFiles: ["src/a.mjs"], orchestratorAddedFiles: ["docs/state.md - update", { path: "docs/adr/0099.md" }] } }),
    ["docs/state.md", "docs/adr/0099.md"]
  );
  assert.deepEqual(
    declaredPaths({ report: { changedFiles: ["src/a.mjs"], orchestratorAddedFiles: ["docs/state.md"] } }),
    ["src/a.mjs", "docs/state.md"]
  );
  // Also top-level orchestratorAddedFiles
  assert.deepEqual(
    declaredPaths({ report: { changedFiles: ["src/a.mjs"] }, orchestratorAddedFiles: ["docs/state.md"] }),
    ["src/a.mjs", "docs/state.md"]
  );
});

test("orchestratorAddedFiles stay readable but cannot make pre-v3 evidence binding", () => {
  writeRecord("DOD-ORCH", {
    taskId: "DOD-ORCH",
    outcome: "completed",
    commit: "def5678",
    model: "claude-sonnet-5",
    rulesetSha: "cb16a3df",
    report: {
      changedFiles: ["src/feature.mjs - the feature"],
      orchestratorAddedFiles: ["docs/state.md - handover update"],
    },
  });
  const verdict = verifyCommit(
    "def5678901",
    commit({
      message: `feat(x): a feature\n\nWhy it matters.\n\nDispatch: DOD-ORCH (goldfish)\nAI-Assisted: true\nCommit-Act: orchestrator\n`,
      paths: ["src/feature.mjs", "docs/state.md"],
    }),
  );
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "record-pre-v3-nonbinding");
  assert.equal(verdict.taskId, "DOD-ORCH");
  assert.deepEqual(verdict.orchestratorAddedFiles, ["docs/state.md"]);
});

test("exit codes: 0 all pass, 1 any fail, 2 unverifiable-only, and --strict folds 2 into 1", () => {
  const pass = { verdict: VERDICT.pass };
  const fail = { verdict: VERDICT.fail };
  const unver = { verdict: VERDICT.unverifiable };
  assert.equal(exitCodeFor([pass, pass]), 0);
  assert.equal(exitCodeFor([pass, fail, unver]), 1);
  assert.equal(exitCodeFor([pass, unver]), 2);
  assert.equal(exitCodeFor([pass, unver], { strict: true }), 1);
});

test("(j) an Elephant trailer with an id other than stage-0 is UNVERIFIABLE, not a free PASS", () => {
  const verdict = verifyCommit(
    "f66f001",
    commit({ message: "feat(x): a thing\n\nDispatch: NVA-BL-99 (elephant)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "elephant-direct-nonstandard-id");
  assert.notEqual(verdict.verdict, VERDICT.pass, "an invented Elephant id must not mint a PASS with no record lookup");
});

test("(j2) a declared stage-0 commit over the size bound is UNVERIFIABLE and the count is named", () => {
  const many = Array.from({ length: ELEPHANT_STAGE0_MAX_PATHS + 1 }, (_unused, index) => `src/file-${index}.mjs`);
  const verdict = verifyCommit("f66f002", commit({ message: "chore(x): sweep\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n", paths: many }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "elephant-direct-oversized");
  assert.equal(verdict.pathCount, many.length);
  assert.match(verdict.reason, new RegExp(String(ELEPHANT_STAGE0_MAX_PATHS), "u"));
});

test("(j3) exactly at the bound still PASSes, so the bound is a bound and not an off-by-one", () => {
  const atBound = Array.from({ length: ELEPHANT_STAGE0_MAX_PATHS }, (_unused, index) => `src/file-${index}.mjs`);
  const verdict = verifyCommit("f66f003", commit({ message: "chore(x): sweep\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n", paths: atBound }));
  assert.equal(verdict.verdict, VERDICT.pass);
  assert.equal(verdict.classification, "elephant-direct-declared");
});

test("(k) two Dispatch trailers on one commit are surfaced, never silently resolved to the topmost", () => {
  const message = "feat(x): a thing\n\nDispatch: DOD-A (goldfish)\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n";
  const parsed = parseDispatchTrailer(message);
  assert.equal(parsed.ambiguous, true);
  assert.equal(parsed.count, 2);
  assert.equal(parsed.id, null, "no id may be picked out of two competing claims");
  const verdict = verifyCommit("f66f004", commit({ message, paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "trailer-ambiguous");
  assert.notEqual(verdict.taskId, "DOD-A", "the topmost trailer must not become the verdict's task id");
});

test("(k2) ambiguity is judged over the trailer block only: prose plus one real trailer stays unambiguous", () => {
  const message = "docs: explain\n\nThe rule is Dispatch: SHIP-2 (goldfish) on every commit.\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true\n";
  const parsed = parseDispatchTrailer(message);
  assert.equal(parsed.ambiguous, undefined);
  assert.equal(parsed.id, "stage-0");
  assert.equal(verifyCommit("f66f005", commit({ message, paths: ["docs/x.md"] })).verdict, VERDICT.pass);
});

test("(l) a task id that is not a safe filename fragment is refused before it reaches the filesystem", () => {
  const verdict = verifyCommit(
    "f77f001",
    commit({ message: "feat(x): a thing\n\nDispatch: ../../../../etc/passwd (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "trailer-taskid-unsafe");
  assert.match(verdict.reason, /safe filename fragment/u);
});

test("(l2) readRecordFile itself refuses an unsafe id rather than joining it into a path", () => {
  assert.throws(() => readRecordFile(EVIDENCE, "../../../../etc/passwd"), /unsafe task id/u);
  assert.throws(() => readRecordFile(EVIDENCE, "a/b"), /unsafe task id/u);
  assert.equal(readRecordFile(EVIDENCE, "NOT-WRITTEN-BY-ANY-TEST"), null, "a safe id that has no record is still a plain null");
});

// Direction 2 of `2026-08-09-the-dispatch-record-does-not-bind-to-the-commit-it-vouches-for.md`
// (write-ordering so the record survives truncation the way the commit does). The design
// appended to that item under the 2026-08-18 wave-2 dispatch NVA-W2-3 recommends a
// "commit-then-checkpoint" protocol: immediately after each `git commit`, the goldfish writes
// `commits`, `outcome` (an interim value NOT in `NON_TERMINAL_OUTCOMES`) and
// `report.changedFiles` into the dispatch record BEFORE composing the prose narrative, so a
// truncation between the commit and the final report still leaves a record this script can
// bind. These two tests are the evidence that the pattern needs ZERO changes to this checker
// (terminality is already a denylist, not an allowlist) and that skipping the outcome half of
// the checkpoint is not enough on its own.
test("(n) Direction 2 legacy checkpoint stays terminal but pre-v3 nonbinding", () => {
  writeRecord("DOD-N", {
    taskId: "DOD-N",
    outcome: "committed-pending-report",
    commits: ["n00n555"],
    model: "claude-sonnet-5",
    rulesetSha: "cb16a3df",
    report: { changedFiles: ["src/thing.mjs - the change"] },
  });
  const verdict = verifyCommit(
    "n00n555aaa",
    commit({ message: "feat(x): a thing\n\nDispatch: DOD-N (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "record-pre-v3-nonbinding");
  assert.equal(isTerminalOutcome("committed-pending-report"), true, "the denylist never listed this value, so it is terminal by construction");
});

test("(n2) Direction 2 counter-case: capturing the sha early is not enough while outcome stays on the denylist", () => {
  writeRecord("DOD-N2", {
    taskId: "DOD-N2",
    outcome: "in-progress",
    commits: ["n22n666"],
    report: { changedFiles: ["src/thing.mjs - the change"] },
  });
  const verdict = verifyCommit(
    "n22n666bbb",
    commit({ message: "feat(x): a thing\n\nDispatch: DOD-N2 (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "record-not-terminal", "sha binding alone does not rescue a record whose outcome never left the denylist");
});

// `2026-08-29-dispatch-evidence-record-shape-not-enforced-beyond-taskid-and-outcome.md`:
// a record only had to bind on taskId + terminal outcome to PASS -- nothing checked whether
// it actually carried the minimum shape of a genuine six-field-briefing dispatch record.
test("missingBriefingFields flags absent/empty model, rulesetSha and report independently", () => {
  assert.deepEqual(missingBriefingFields({}), ["model", "rulesetSha", "report"]);
  assert.deepEqual(missingBriefingFields({ model: "  ", rulesetSha: "", report: null }), ["model", "rulesetSha", "report"]);
  assert.deepEqual(missingBriefingFields({ model: "claude-sonnet-5", rulesetSha: "cb16a3df", report: { changedFiles: ["a.mjs"] } }), []);
  assert.deepEqual(missingBriefingFields({ model: "claude-sonnet-5", rulesetSha: "cb16a3df", report: "prose" }), []);
  assert.deepEqual(missingBriefingFields({ model: "claude-sonnet-5", rulesetSha: "cb16a3df", report: {} }), ["report"]);
});

test("(p) a bare {id, outcome, timestamp}-shaped record -> UNVERIFIABLE, never PASS", () => {
  writeRecord("DOD-P", { id: "DOD-P", outcome: "completed", timestamp: "2026-08-29T12:00:00Z" });
  const verdict = verifyCommit("p00p111", commit({ message: "feat(x): a thing\n\nDispatch: DOD-P (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.notEqual(verdict.verdict, VERDICT.pass, "a bare id/outcome/timestamp record must never mint a PASS");
});

test("(p2) a record with model + rulesetSha but missing ONLY report -> UNVERIFIABLE, not PASS", () => {
  writeRecord("DOD-P2", {
    taskId: "DOD-P2",
    outcome: "completed",
    model: "claude-sonnet-5",
    rulesetSha: "cb16a3df",
    commits: ["p22p222"],
  });
  const verdict = verifyCommit(
    "p22p222aaa",
    commit({ message: "feat(x): a thing\n\nDispatch: DOD-P2 (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }),
  );
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.notEqual(verdict.verdict, VERDICT.pass, "a record missing only `report` must never mint a PASS");
});

test("(p3) a record with valid path-covering report but missing model + rulesetSha -> UNVERIFIABLE record-missing-briefing-fields, not PASS", () => {
  writeRecord("DOD-P3", {
    taskId: "DOD-P3",
    outcome: "completed",
    commit: "p33p333",
    report: { changedFiles: ["src/thing.mjs - x"] },
  });
  const verdict = verifyCommit("p33p333bbb", commit({ message: "feat(x): a thing\n\nDispatch: DOD-P3 (goldfish)\nAI-Assisted: true\n", paths: ["src/thing.mjs"] }));
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "record-missing-briefing-fields");
  assert.deepEqual(verdict.missingFields, ["model", "rulesetSha"]);
  assert.notEqual(verdict.verdict, VERDICT.pass, "path coverage alone must not mint a PASS once model/rulesetSha are checked");
});

// Direction 3 Option B of the same item (`2026-08-09-the-dispatch-record-does-not-bind-to-
// the-commit-it-vouches-for.md`): `Dispatch: <generator-script-path> (elephant-generated)`
// is verified by MECHANICAL PROOF -- re-running the named script against the commit's parent
// tree and asserting byte-identical output -- never trusted as a claim. DoD (a)/(b)/(c) below
// use synthetic deps (fast, deterministic, no subprocess); DoD (d) below that uses a real,
// disposable git fixture repo to prove the sandboxing itself.
const GENERATOR_ID = "harness/scripts/generate-agent-obligations.mjs";
const GENERATOR_TRAILER = `Dispatch: ${GENERATOR_ID} (elephant-generated)\nAI-Assisted: true\n`;

test("(o) DoD-a: matching generator output -> PASS-equivalent (elephant-generated-verified), no record required", () => {
  let called = 0;
  const verdict = verifyCommit(
    "o00o111",
    commit({
      message: `chore(templates): regenerate\n\n${GENERATOR_TRAILER}`,
      paths: ["templates/prompts/agent-obligations.md"],
      readBlobAtCommit: () => "REGENERATED BYTES\n",
      runAllowlistedGenerator: () => {
        called += 1;
        return "REGENERATED BYTES\n";
      },
    }),
  );
  assert.equal(verdict.verdict, VERDICT.pass);
  assert.equal(verdict.classification, "elephant-generated-verified");
  assert.equal(verdict.taskId, GENERATOR_ID);
  assert.equal(called, 1, "the generator must actually be re-run, not merely trusted");
});

test("(o2) DoD-b: a byte mismatch between the re-run and the commit's own change is caught and classified FAIL, never a silent pass", () => {
  const verdict = verifyCommit(
    "o00o222",
    commit({
      message: `chore(templates): regenerate\n\n${GENERATOR_TRAILER}`,
      paths: ["templates/prompts/agent-obligations.md"],
      readBlobAtCommit: () => "WHAT THE COMMIT ACTUALLY LEFT\n",
      runAllowlistedGenerator: () => "WHAT THE GENERATOR PRODUCES NOW -- DIFFERENT\n",
    }),
  );
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "elephant-generated-mismatch");
});

test("(o3) DoD-c: a script NOT on the allowlist is rejected as UNVERIFIABLE and NEVER executed", () => {
  let executed = false;
  const verdict = verifyCommit(
    "o00o333",
    commit({
      message: "chore(x): sneaky\n\nDispatch: some/other/script.mjs (elephant-generated)\nAI-Assisted: true\n",
      paths: ["some/output.md"],
      readBlobAtCommit: () => {
        executed = true;
        return "x";
      },
      runAllowlistedGenerator: () => {
        executed = true;
        return "x";
      },
    }),
  );
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "elephant-generated-not-allowlisted");
  assert.equal(executed, false, "an unallowlisted id must never reach execution or blob reads");
  assert.notEqual(verdict.verdict, VERDICT.pass, "an unrecognised generator id must never mint a PASS");
});

test("(o4) a path traversal attempt in the id is refused by the allowlist Map lookup, never executed", () => {
  let executed = false;
  const verdict = verifyCommit(
    "o00o444",
    commit({
      message: "chore(x): sneaky\n\nDispatch: ../../../../etc/passwd (elephant-generated)\nAI-Assisted: true\n",
      paths: ["a.md"],
      runAllowlistedGenerator: () => {
        executed = true;
        return "x";
      },
    }),
  );
  assert.equal(verdict.verdict, VERDICT.unverifiable);
  assert.equal(verdict.classification, "elephant-generated-not-allowlisted");
  assert.equal(executed, false);
});

test("(o5) a prototype-pollution-shaped id (__proto__/constructor) resolves to nothing on the Map allowlist", () => {
  assert.equal(ELEPHANT_GENERATOR_ALLOWLIST.get("__proto__"), undefined);
  assert.equal(ELEPHANT_GENERATOR_ALLOWLIST.get("constructor"), undefined);
  for (const id of ["__proto__", "constructor", "hasOwnProperty"]) {
    const verdict = verifyCommit(
      `o00o555-${id}`,
      commit({ message: `chore(x): sneaky\n\nDispatch: ${id} (elephant-generated)\nAI-Assisted: true\n`, paths: ["a.md"] }),
    );
    assert.equal(verdict.verdict, VERDICT.unverifiable, id);
    assert.equal(verdict.classification, "elephant-generated-not-allowlisted", id);
  }
});

test("(o6) a commit touching a path the allowlisted generator does not produce -> FAIL, naming the uncovered path", () => {
  const verdict = verifyCommit(
    "o00o666",
    commit({
      message: `chore(templates): regenerate plus something else\n\n${GENERATOR_TRAILER}`,
      paths: ["templates/prompts/agent-obligations.md", "some/unrelated/file.mjs"],
      readBlobAtCommit: () => "x",
      runAllowlistedGenerator: () => "x",
    }),
  );
  assert.equal(verdict.verdict, VERDICT.fail);
  assert.equal(verdict.classification, "elephant-generated-paths-not-covered");
  assert.deepEqual(verdict.uncovered, ["some/unrelated/file.mjs"]);
});

test("(o7) DoD-a (real end-to-end): re-running the REAL generator against a REAL historical commit's parent tree, via the real gitDeps sandbox, reproduces the file it actually changed", () => {
  // 073014f1 is a real, single-file commit in this repository's own history: "chore(templates):
  // regenerate agent-agent-obligations.md after GF-078's head -N fix" -- it changes exactly
  // templates/prompts/agent-obligations.md. Its real message carries no `elephant-generated`
  // trailer (the form did not exist yet), so only `readCommitMessage` is overridden here; every
  // other reader/executor -- readChangedPaths, readBlobAtCommit, and the real sandboxed
  // runAllowlistedGenerator -- is the genuine gitDeps() implementation, exercising the real
  // `git worktree add`, the real generator script as it existed at that historical parent, and a
  // real byte-for-byte comparison. This is the strongest test in this file.
  const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const sha = "073014f158f886052dfb8b27ffae84e7ec95e33b";
  let stat;
  try {
    stat = execFileSync("git", ["cat-file", "-t", sha], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    stat = null;
  }
  if (stat !== "commit") {
    // History was rewritten/squashed in this checkout (e.g. a shallow clone) -- skip rather
    // than fail on an environment this test does not control. All the branch logic this
    // fixture exercises is still covered by the synthetic (o)/(o2)/(o3) tests above.
    return;
  }
  const deps = gitDeps({ repoRoot: REPO_ROOT, evidenceDir: EVIDENCE });
  const verdict = verifyCommit(sha, {
    ...deps,
    readCommitMessage: () => `chore(templates): regenerate\n\n${GENERATOR_TRAILER}`,
  });
  assert.equal(verdict.verdict, VERDICT.pass, verdict.reason);
  assert.equal(verdict.classification, "elephant-generated-verified");
});

test("(sandbox) DoD-d: a malicious-shaped generator cannot mutate the real working tree, and the sandbox is cleaned up", () => {
  const fixtureRoot = mkdtempSync(join(SCRATCH, "sandbox-fixture-"));
  execFileSync("git", ["init", "--quiet", fixtureRoot]);
  execFileSync("git", ["-C", fixtureRoot, "config", "user.email", "test@example.invalid"]);
  execFileSync("git", ["-C", fixtureRoot, "config", "user.name", "Test"]);

  const scriptRelPath = "scripts/malicious.mjs";
  mkdirSync(join(fixtureRoot, "scripts"), { recursive: true });
  const maliciousSource = [
    'import { writeFileSync } from "node:fs";',
    'import { dirname, join } from "node:path";',
    'import { fileURLToPath } from "node:url";',
    "const here = dirname(fileURLToPath(import.meta.url));",
    "// Attempt 1: write into whatever the CURRENT WORKING DIRECTORY is -- if the sandbox had a",
    "// bug and ran this with the real repo as cwd, this file would land there.",
    'writeFileSync(join(process.cwd(), "PWNED-CWD.txt"), "pwned");',
    "// Attempt 2: relative traversal from the script's own location -- if isolation held, this",
    "// stays inside the disposable temp-directory tree, nowhere near the fixture repo.",
    'writeFileSync(join(here, "..", "..", "PWNED-TRAVERSAL.txt"), "pwned");',
    'process.stdout.write("malicious-output");',
  ].join("\n");
  writeFileSync(join(fixtureRoot, scriptRelPath), maliciousSource, "utf8");
  execFileSync("git", ["-C", fixtureRoot, "add", "-A"]);
  execFileSync("git", ["-C", fixtureRoot, "commit", "--quiet", "-m", "parent"]);
  writeFileSync(join(fixtureRoot, "unrelated.txt"), "later\n", "utf8");
  execFileSync("git", ["-C", fixtureRoot, "add", "-A"]);
  execFileSync("git", ["-C", fixtureRoot, "commit", "--quiet", "-m", "child"]);

  const before = execFileSync("git", ["-C", fixtureRoot, "status", "--porcelain"], { encoding: "utf8" });
  assert.equal(before, "", "fixture repo must start clean");
  const sandboxDirsBefore = readdirSync(tmpdir()).filter((entry) => entry.startsWith("dispatch-authorship-sandbox-"));

  const stdout = runGeneratorInIsolatedParentTree({
    repoRoot: fixtureRoot,
    parentRef: "HEAD^",
    scriptRelPath,
    args: [],
  });
  assert.equal(stdout, "malicious-output", "the sandboxed script still runs to completion and its output is captured");

  const after = execFileSync("git", ["-C", fixtureRoot, "status", "--porcelain"], { encoding: "utf8" });
  assert.equal(after, "", "the fixture repo's real working tree must be untouched by the sandboxed run");
  assert.equal(existsSync(join(fixtureRoot, "PWNED-CWD.txt")), false, "a cwd-relative write must not land in the real repo");
  assert.equal(existsSync(join(fixtureRoot, "scripts", "PWNED-TRAVERSAL.txt")), false, "a traversal write must not land in the real repo either");
  const worktreeList = execFileSync("git", ["-C", fixtureRoot, "worktree", "list"], { encoding: "utf8" }).trim().split("\n");
  assert.equal(worktreeList.length, 1, "the sandbox worktree must be removed after the run -- no leftover registration");
  const sandboxDirsAfter = readdirSync(tmpdir()).filter((entry) => entry.startsWith("dispatch-authorship-sandbox-"));
  assert.equal(sandboxDirsAfter.length, sandboxDirsBefore.length, "the temp sandbox directory must be purged from disk, even though the script inside it misbehaved");

  rmSync(fixtureRoot, { recursive: true, force: true });
});

test("the real git-backed readers work against this repository's own HEAD", () => {
  const deps = gitDeps({ evidenceDir: DEFAULT_EVIDENCE_DIR });
  assert.equal(typeof deps.readCommitMessage("HEAD"), "string");
  assert.ok(Array.isArray(deps.readChangedPaths("HEAD")));
  const verdict = verifyCommit("HEAD", deps);
  assert.ok([VERDICT.pass, VERDICT.fail, VERDICT.unverifiable].includes(verdict.verdict));
  assert.equal(typeof verdict.reason, "string");
});

function signedIntegrationRepo({
  messageFor = (intent) => `chore: import package\n\nDispatch: quality-package-${intent} (integration)\nAI-Assisted: true\n`,
  beforeCommit = () => {},
} = {}) {
  const root = mkdtempSync(join(SCRATCH, "signed-integration-reader-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const publicKeySha256 = createHash("sha256").update(publicKey).digest("hex");
  mkdirSync(join(root, "project"));
  writeFileSync(join(root, "subject.txt"), "before\n");
  writeFileSync(join(root, "project", "critical-human-proof.json"), JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [],
    trustAnchors: [{ keyReference: "fixture", publicKeySha256 }],
  }));
  git("add", "subject.txt", "project/critical-human-proof.json"); git("commit", "-qm", "base");
  const record = {
    schema: SIGNED_QUALITY_PACKAGE_SCHEMA,
    baseCommit: git("rev-parse", "HEAD"),
    unifiedDiff: "diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n",
    expectedDigests: { "subject.txt": createHash("sha256").update("after\n").digest("hex") },
  };
  record.intentSha256 = qualityPackageIntentSha256(record);
  const proof = {
    schema: "pipeline.po-approval-proof.v1", intentSha256: record.intentSha256, keyReference: "fixture", publicKey,
    signatureBase64: sign(null, Buffer.from(record.intentSha256), keys.privateKey).toString("base64"),
  };
  writeFileSync(join(root, "subject.txt"), "after\n"); git("add", "subject.txt");
  assert.equal(authorizeQualityPackageCommit({ repoRoot: root, packageIntent: record, proof }).ok, true);
  const commonDir = git("rev-parse", "--path-format=absolute", "--git-common-dir");
  const authorization = join(commonDir, "agent-pipeline", "signed-quality-packages", "commit-authorizations", `${record.intentSha256}.json`);
  beforeCommit({ root, git, record, authorization });
  git("commit", "-m", messageFor(record.intentSha256));
  return { root, git, commitSha: git("rev-parse", "HEAD"), intentSha256: record.intentSha256, authorization, commonDir };
}

test("signed integration reader verifies the real commit and makes only the limited classification", () => {
  const item = signedIntegrationRepo();
  try {
    const verdict = verifyCommit(item.commitSha, gitDeps({ repoRoot: item.root, evidenceDir: EVIDENCE }));
    assert.equal(verdict.verdict, VERDICT.pass);
    assert.equal(verdict.classification, "signed-artifact-integration");
    assert.equal(verdict.reason, "QUALITY-PACKAGE-INTEGRATION-POSTCOMMIT-VERIFIED");
    assert.equal(Object.hasOwn(verdict, "taskId"), false);
    assert.equal(Object.hasOwn(verdict, "model"), false);
    assert.equal(Object.hasOwn(verdict, "review"), false);
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("signed integration reader maps safely absent authorization to UNVERIFIABLE", () => {
  const item = signedIntegrationRepo();
  try {
    rmSync(item.authorization);
    const verdict = verifyCommit(item.commitSha, gitDeps({ repoRoot: item.root, evidenceDir: EVIDENCE }));
    assert.equal(verdict.verdict, VERDICT.unverifiable);
    assert.equal(verdict.classification, "signed-artifact-integration");
    assert.equal(verdict.reason, "QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-ABSENT");
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("signed integration reader fails forged, wrong-intent and unsafe authorization", () => {
  for (const kind of ["forged", "wrong-intent", "unsafe"]) {
    const item = signedIntegrationRepo({ messageFor: (intent) => {
      const named = kind === "wrong-intent" ? `${"f".repeat(64)}` : intent;
      return `chore: import package\n\nDispatch: quality-package-${named} (integration)\nAI-Assisted: true\n`;
    } });
    try {
      if (kind === "forged") {
        const receipt = JSON.parse(readFileSync(item.authorization, "utf8"));
        receipt.proof.signatureBase64 = Buffer.alloc(64).toString("base64");
        writeFileSync(item.authorization, JSON.stringify(receipt), { mode: 0o600 });
      } else if (kind === "wrong-intent") {
        const wrong = join(dirname(item.authorization), `${"f".repeat(64)}.json`);
        writeFileSync(wrong, readFileSync(item.authorization), { mode: 0o600 });
      } else {
        rmSync(item.authorization);
        symlinkSync(join(item.root, "subject.txt"), item.authorization);
      }
      const verdict = verifyCommit(item.commitSha, gitDeps({ repoRoot: item.root, evidenceDir: EVIDENCE }));
      assert.equal(verdict.verdict, VERDICT.fail, kind);
      assert.equal(verdict.classification, "signed-artifact-integration", kind);
    } finally { rmSync(item.root, { recursive: true, force: true }); }
  }
});

test("body-prose integration marker stays outside plugin final-block recognition", () => {
  const item = signedIntegrationRepo({ messageFor: (intent) => `chore: mention package\n\nBody claim:\nDispatch: quality-package-${intent} (integration)\n\nThis is prose, not a final trailer.\n` });
  try {
    const verdict = verifyCommit(item.commitSha, gitDeps({ repoRoot: item.root, evidenceDir: EVIDENCE }));
    assert.equal(verdict.verdict, VERDICT.unverifiable);
    assert.equal(verdict.classification, "elephant-direct-undeclared");
  } finally { rmSync(item.root, { recursive: true, force: true }); }
});

test("malformed and duplicate integration final blocks fail explicitly", () => {
  for (const suffix of ["Dispatch: quality-package-abc (integration)\nAI-Assisted: true\n", `Dispatch: quality-package-${"a".repeat(64)} (integration)\nDispatch: quality-package-${"a".repeat(64)} (integration)\nAI-Assisted: true\n`]) {
    const item = signedIntegrationRepo({ messageFor: () => `chore: import package\n\n${suffix}` });
    try {
      const verdict = verifyCommit(item.commitSha, gitDeps({ repoRoot: item.root, evidenceDir: EVIDENCE }));
      assert.equal(verdict.verdict, VERDICT.fail);
      assert.equal(verdict.classification, "signed-artifact-integration");
    } finally { rmSync(item.root, { recursive: true, force: true }); }
  }
});

test("signed integration reader fails wrong-parent and postimage path, content or mode drift", () => {
  for (const kind of ["wrong-parent", "content-drift", "path-drift", "mode-drift"]) {
    const item = signedIntegrationRepo({ beforeCommit: ({ root, git }) => {
      if (kind === "wrong-parent") { git("restore", "--staged", "--source=HEAD", "--", "subject.txt"); git("commit", "--allow-empty", "-qm", "advance parent"); git("add", "subject.txt"); }
      if (kind === "content-drift") { writeFileSync(join(root, "subject.txt"), "drift\n"); git("add", "subject.txt"); }
      if (kind === "path-drift") { writeFileSync(join(root, "extra.txt"), "extra\n"); git("add", "extra.txt"); }
      if (kind === "mode-drift") git("update-index", "--chmod=+x", "subject.txt");
    } });
    try {
      const verdict = verifyCommit(item.commitSha, gitDeps({ repoRoot: item.root, evidenceDir: EVIDENCE }));
      assert.equal(verdict.verdict, VERDICT.fail, kind);
      assert.equal(verdict.classification, "signed-artifact-integration", kind);
    } finally { rmSync(item.root, { recursive: true, force: true }); }
  }
});

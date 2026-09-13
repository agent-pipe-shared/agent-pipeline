#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { VerifyEvidenceError, VERIFY_EVIDENCE_SCHEMA, produceVerifyEvidence } from "./verify-evidence-producer.mjs";
import { deriveGateEvidence } from "./publication-gate-evidence.mjs";
import { VERIFY_EVIDENCE_DEFAULT_PATH } from "../lib/verify-evidence-path.mjs";
import { prepareConsumerVerify, CONSUMER_VERIFY_ADAPTER_PATH } from "../lib/consumer-verify.mjs";
import { verifySuiteArtifactName } from "./verify-journal.mjs";
import { createPublicVerifyRunEvidence } from "../lib/verify-resume.mjs";
import { verifyEvidenceSatisfiesBoundary } from "../lib/verify-selection.mjs";
import { retryGovernanceVerificationAction } from "../lib/governance-verification-action.mjs";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: "utf8", ...options });
  assert.equal(isSuccessfulSpawn(result), true, result.stderr);
  return String(result.stdout ?? "");
}
function git(root, args) { return run("git", ["-C", root, ...args]).trim(); }

/** A minimal committed project: calibration naming `verify`, one commit, clean tree. */
function fixture(verifyCommand) {
  const root = mkdtempSync(join(tmpdir(), "verify-evidence-producer-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify({ project: "fixture-project", verify: verifyCommand }, null, 2)}\n`);
  writeFileSync(join(root, "README.md"), "# Fixture\n");
  writeFileSync(join(root, ".gitignore"), "/evidence/\n");
  prepareConsumerVerify({ rootDir: root });
  git(root, ["init", "-q"]);
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
  return root;
}
async function withFixture(verifyCommand, run) {
  const root = fixture(verifyCommand);
  try { await run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("a passing verify produces a consumable artifact bound to the exact commit and tree", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    const result = await produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" });
    assert.equal(result.status, "passed");
    const commit = git(root, ["rev-parse", "HEAD"]);
    const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
    assert.equal(result.evidence.schema, VERIFY_EVIDENCE_SCHEMA);
    assert.equal(result.evidence.commit, commit);
    assert.equal(result.evidence.tree, tree);
    assert.equal(result.evidence.candidate.commit, commit);
    assert.equal(result.evidence.candidate.tree, tree);
    assert.equal(result.evidence.exitCode, 0);
    assert.deepEqual(result.evidence.verifyRun, createPublicVerifyRunEvidence({
      ...result.evidence.verifyRun,
      resumePlanSha256: JSON.parse(readFileSync(join(root, ".git/agent-pipeline/verify/runs", result.evidence.verifyRun.runId, "resume-plan.json"), "utf8")).planSha256,
      registeredSuiteCount: 5, terminalReceiptCount: 5, terminalStatus: "passed",
      receiptReuse: "allowed",
    }));
    assert.deepEqual(result.evidence.steps.map(({ name, exitCode }) => ({ name, exitCode })), ["baseline-calibration", "baseline-manifest", "baseline-repository", "baseline-verify-contract", "configured-verify"].map((name) => ({ name, exitCode: 0 })));
    assert.equal(result.evidence.coverage, "project-calibrated");
    assert.equal(result.evidence.selection.mode, "candidate");
    const onDisk = JSON.parse(readFileSync(join(root, "evidence", "verify.json"), "utf8"));
    assert.deepEqual(onDisk, result.evidence);
  });
});

test("a failing verify command produces no artifact at all", async () => {
  await withFixture('node -e "process.exit(3)"', async (root) => {
    await assert.rejects(
      () => produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" }),
      (error) => error instanceof VerifyEvidenceError && error.code === "VEP-VERIFY-FAILED",
    );
    assert.equal(existsSync(join(root, "evidence", "verify.json")), false, "a failing verify must leave no evidence file");
  });
});

test("an explicit event output emits exactly one aggregate candidate-bound action after passing source readback", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    const result = await produceVerifyEvidence({
      rootDir: root,
      outPath: "evidence/verify.json",
      eventOutPath: "evidence/actions/verify.json",
    });
    assert.equal(result.status, "passed");
    assert.equal(result.actionEvent.kind, "verification");
    assert.equal(result.actionEvent.status, "completed");
    assert.equal(result.actionEvent.reasonCode, "VERIFICATION_PASSED");
    assert.equal(result.actionEvent.correlation.requestId, result.evidence.verifyRun.terminalSha256);
    assert.deepEqual(result.actionEvent.candidate, result.evidence.candidate);
    assert.deepEqual(result.actionEvent.correlation.featureId, { state: "not-applicable" });
    assert.deepEqual(result.actionEvent.correlation.sessionId, { state: "not-applicable" });
    assert.equal(Object.hasOwn(result.actionEvent, "runner"), false);
    assert.deepEqual(JSON.parse(readFileSync(join(root, "evidence/actions/verify.json"), "utf8")), result.actionEvent);
    assert.equal(readdirSync(join(root, "evidence/actions")).length, 1, "one terminal run emits one action artifact");
  });
});

test("an explicit event output maps terminal Verify failure without creating success evidence", async () => {
  await withFixture('node -e "process.exit(3)"', async (root) => {
    const result = await produceVerifyEvidence({
      rootDir: root,
      outPath: "evidence/verify.json",
      eventOutPath: "evidence/actions/verify.json",
    });
    assert.equal(result.status, "failed");
    assert.equal(result.evidence, null);
    assert.equal(result.actionEvent.status, "failed");
    assert.equal(result.actionEvent.reasonCode, "VERIFICATION_FAILED");
    assert.equal(existsSync(join(root, "evidence/verify.json")), false);
    assert.deepEqual(JSON.parse(readFileSync(join(root, "evidence/actions/verify.json"), "utf8")), result.actionEvent);
  });
});

test("event target preflight failure leaves prior source evidence untouched and never starts Verify", async () => {
  const outside = mkdtempSync(join(tmpdir(), "verify-event-outside-"));
  try {
    await withFixture('node -e "require(\'fs\').writeFileSync(\'.git/verify-ran\', \'yes\')"', async (root) => {
      mkdirSync(join(root, "evidence"));
      writeFileSync(join(root, "evidence/verify.json"), "prior source bytes\n");
      symlinkSync(outside, join(root, "event-alias"), "dir");
      await assert.rejects(
        () => produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json", eventOutPath: "event-alias/action.json" }),
        (error) => error.code === "GVA-OUTPUT-PATH",
      );
      assert.equal(readFileSync(join(root, "evidence/verify.json"), "utf8"), "prior source bytes\n");
      assert.equal(existsSync(join(root, ".git/verify-ran")), false);
      assert.equal(existsSync(join(outside, "action.json")), false);
    });
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("event source preflight failure is also zero mutation", async () => {
  await withFixture('node -e "require(\'fs\').writeFileSync(\'.git/verify-ran\', \'yes\')"', async (root) => {
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence/verify.json"), "prior source bytes\n");
    writeFileSync(join(root, "README.md"), "dirty candidate\n");
    await assert.rejects(
      () => produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json", eventOutPath: "evidence/actions/verify.json" }),
      (error) => error.code === "VEP-EVENT-SOURCE",
    );
    assert.equal(readFileSync(join(root, "evidence/verify.json"), "utf8"), "prior source bytes\n");
    assert.equal(existsSync(join(root, ".git/verify-ran")), false);
    assert.equal(existsSync(join(root, "evidence/actions/verify.json")), false);
  });
});

test("a post-source event path race returns typed retry data and does not roll back Verify evidence", async () => {
  const outside = mkdtempSync(join(tmpdir(), "verify-event-race-outside-"));
  try {
    const command = `node -e "require('fs').mkdirSync('evidence',{recursive:true});require('fs').symlinkSync('${outside}','evidence/actions','dir')"`;
    await withFixture(command, async (root) => {
      const result = await produceVerifyEvidence({
        rootDir: root,
        outPath: "evidence/verify.json",
        eventOutPath: "evidence/actions/verify.json",
      });
      assert.equal(result.status, "source-complete/event-unavailable");
      assert.equal(result.sourceStatus, "passed");
      assert.equal(existsSync(join(root, "evidence/verify.json")), true);
      assert.equal(existsSync(join(outside, "verify.json")), false);
      assert.deepEqual(result.eventRetry.event, result.actionEvent);
      unlinkSync(join(root, "evidence/actions"));
      const retried = retryGovernanceVerificationAction({ rootDir: root, retry: result.eventRetry });
      assert.equal(retried.status, "written");
      assert.deepEqual(JSON.parse(readFileSync(retried.outPath, "utf8")), result.actionEvent);
      assert.equal(retryGovernanceVerificationAction({ rootDir: root, retry: result.eventRetry }).status, "existing-identical");
    });
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("candidate drift suppresses a requested action as well as success evidence", async () => {
  await withFixture('node -e "require(\'fs\').writeFileSync(\'README.md\', \'drift\')"', async (root) => {
    await assert.rejects(
      () => produceVerifyEvidence({ rootDir: root, eventOutPath: "evidence/actions/verify.json" }),
      (error) => error.code === "VEP-DRIFT",
    );
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), false);
    assert.equal(existsSync(join(root, "evidence/actions/verify.json")), false);
  });
});

test("a dirty working tree is refused before the verify command runs, and the rejection is recorded explicitly", async () => {
  await withFixture('node -e "require(\'fs\').writeFileSync(\'ran.marker\', \'x\')"', async (root) => {
    writeFileSync(join(root, "README.md"), "# Fixture\n\nuncommitted change\n");
    const result = await produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" });
    assert.equal(result.status, "dirty");
    assert.equal(result.evidence.exitCode, 1);
    assert.deepEqual(result.evidence.steps, [{ name: "candidate-preflight", exitCode: 1 }]);
    assert.equal(existsSync(join(root, "evidence", "verify.json")), true, "the dirty rejection must still be recorded explicitly");
    assert.equal(existsSync(join(root, "ran.marker")), false, "the configured verify command must never run against a dirty tree");
  });
});

test("the produced artifact satisfies the real publication-gate-evidence consumer unmodified", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    const result = await produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json", mode: "release", base: "HEAD^1" });
    const derived = deriveGateEvidence({ rootDir: root, gate: "verify", sourcePath: "evidence/verify.json" });
    assert.equal(derived.evidence.gate, "verify");
    assert.equal(derived.evidence.status, "passed");
    assert.equal(derived.evidence.exitCode, 0);
    assert.equal(derived.evidence.candidate.commit, result.evidence.commit);
    assert.equal(derived.evidence.candidate.tree, result.evidence.tree);
  });
});

test("a calibration naming no verify command cannot produce success at any boundary", async () => {
  const root = mkdtempSync(join(tmpdir(), "verify-evidence-producer-"));
  try {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify({ project: "no-verify" }, null, 2)}\n`);
    writeFileSync(join(root, "README.md"), "# Baseline-only fixture\n");
    prepareConsumerVerify({ rootDir: root });
    git(root, ["init", "-q"]);
    git(root, ["add", "."]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
    for (const mode of ["work", "critic", "push", "candidate", "release"]) {
      await assert.rejects(
        () => produceVerifyEvidence({ rootDir: root, outPath: `evidence/${mode}.json`, mode }),
        (error) => error instanceof VerifyEvidenceError && error.code === "VEP-NO-COMMAND",
      );
      assert.equal(existsSync(join(root, "evidence", `${mode}.json`)), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("critic mode runs baseline and the changed project area without invoking unrelated or full commands", async () => {
  await withFixture('node -e "process.exit(9)"', async (root) => {
    const calibrationPath = join(root, ".claude", "pipeline.json");
    const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
    calibration.verifyImpact = {
      schema: "pipeline.project-verify-impact.v1",
      baseline: [{ id: "common", command: 'node -e "require(\'fs\').writeFileSync(\'.git/baseline-ran\', \'yes\')"' }],
      areas: [
        { id: "docs", paths: ["docs/**"], commands: [{ id: "docs", command: 'node -e "require(\'fs\').writeFileSync(\'.git/docs-ran\', \'yes\')"' }] },
        { id: "source", paths: ["src/**"], commands: [{ id: "source", command: 'node -e "process.exit(8)"' }] },
      ],
    };
    writeFileSync(calibrationPath, `${JSON.stringify(calibration, null, 2)}\n`);
    git(root, ["add", "."]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "impact policy"]);
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "guide.md"), "# Guide\n");
    git(root, ["add", "."]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "docs"]);
    const result = await produceVerifyEvidence({ rootDir: root, mode: "critic", base: "HEAD^1" });
    assert.equal(result.status, "passed");
    assert.equal(result.evidence.selection.execution, "impacted");
    assert.deepEqual(result.evidence.selection.matchedAreaIds, ["docs"]);
    assert.equal(result.evidence.selection.selectedSuiteIds.includes("project-docs"), true);
    assert.equal(result.evidence.selection.omittedSuiteIds.includes("project-source"), true);
    assert.equal(existsSync(join(root, ".git", "baseline-ran")), true);
    assert.equal(existsSync(join(root, ".git", "docs-ran")), true);
  });
});

test("push mode cannot turn an equal base into empty impacted evidence", async () => {
  await withFixture('node -e "require(\'fs\').writeFileSync(\'.git/full-ran\', \'yes\')"', async (root) => {
    const result = await produceVerifyEvidence({ rootDir: root, mode: "push", base: "HEAD" });
    assert.equal(result.evidence.selection.execution, "full");
    assert.equal(result.evidence.selection.fallbackReason, "invalid-base");
    assert.equal(result.evidence.selection.omittedSuiteIds.length, 0);
    assert.equal(existsSync(join(root, ".git", "full-ran")), true);
    assert.equal(verifyEvidenceSatisfiesBoundary(result.evidence, "push"), true);
  });
});

test("consumer full fallback preserves the changed and unmatched paths", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    const calibrationPath = join(root, ".claude", "pipeline.json");
    const calibration = JSON.parse(readFileSync(calibrationPath, "utf8"));
    calibration.verifyImpact = {
      schema: "pipeline.project-verify-impact.v1",
      baseline: [],
      areas: [{ id: "docs", paths: ["docs/**"], commands: [{ id: "docs", command: 'node -e "process.exit(0)"' }] }],
    };
    writeFileSync(calibrationPath, `${JSON.stringify(calibration, null, 2)}\n`);
    git(root, ["add", "."]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "impact policy"]);
    writeFileSync(join(root, "unknown.bin"), "changed\n");
    git(root, ["add", "unknown.bin"]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "unknown change"]);
    const result = await produceVerifyEvidence({ rootDir: root, mode: "candidate", base: "HEAD^1" });
    assert.equal(result.evidence.selection.execution, "full");
    assert.equal(result.evidence.selection.fallbackReason, "unclassified-change");
    assert.deepEqual(result.evidence.selection.changedPaths, ["unknown.bin"]);
    assert.deepEqual(result.evidence.selection.unmatchedPaths, ["unknown.bin"]);
    assert.equal(result.evidence.steps.some(({ name }) => name === "project-docs"), true);
    assert.equal(result.evidence.steps.some(({ name }) => name === "configured-verify"), true);
  });
});

test("a bare invocation with no --out resolves to the shared VERIFY_EVIDENCE_DEFAULT_PATH constant", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    const result = await produceVerifyEvidence({ rootDir: root });
    assert.equal(result.status, "passed");
    assert.equal(result.outPath, join(root, VERIFY_EVIDENCE_DEFAULT_PATH));
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), true);
  });
});

test("the CLI wrapper with no --out flag also resolves to the shared default path", async () => {
  await withFixture('node -e "process.exit(0)"', (root) => {
    const scriptPath = new URL("./verify-evidence-producer.mjs", import.meta.url).pathname;
    const stdout = run("node", [scriptPath, "--root", root]);
    const parsed = JSON.parse(stdout.slice(stdout.indexOf("{\n")));
    assert.equal(parsed.status, "passed");
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), true);
  });
});

test("the CLI wrapper exits 0 and writes evidence for a passing run", async () => {
  await withFixture('node -e "process.exit(0)"', (root) => {
    const scriptPath = new URL("./verify-evidence-producer.mjs", import.meta.url).pathname;
    const stdout = run("node", [scriptPath, "--root", root, "--out", "evidence/verify.json"]);
    const parsed = JSON.parse(stdout.slice(stdout.indexOf("{\n")));
    assert.equal(parsed.status, "passed");
    assert.equal(existsSync(join(root, "evidence", "verify.json")), true);
  });
});

test("the CLI exposes the explicit event boundary without changing the evidence default", async () => {
  await withFixture('node -e "process.exit(0)"', (root) => {
    const scriptPath = new URL("./verify-evidence-producer.mjs", import.meta.url).pathname;
    const stdout = run("node", [scriptPath, "--root", root, "--event-out", "evidence/actions/verify.json"]);
    const parsed = JSON.parse(stdout.slice(stdout.indexOf("{\n")));
    assert.equal(parsed.status, "passed");
    assert.equal(parsed.actionEvent.reasonCode, "VERIFICATION_PASSED");
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), true);
    assert.equal(existsSync(join(root, "evidence/actions/verify.json")), true);
  });
});

test("explicit preparation is idempotent, preserves conflicts and the configured command", async () => {
  await withFixture('node -e "process.exit(0)"', (root) => {
    const before = readFileSync(join(root, ".claude/pipeline.json"), "utf8");
    assert.equal(prepareConsumerVerify({ rootDir: root }).status, "unchanged");
    rmSync(join(root, CONSUMER_VERIFY_ADAPTER_PATH));
    assert.equal(prepareConsumerVerify({ rootDir: root }).status, "prepared");
    assert.equal(readFileSync(join(root, ".claude/pipeline.json"), "utf8"), before);
    writeFileSync(join(root, CONSUMER_VERIFY_ADAPTER_PATH), "// user owned\n");
    assert.throws(() => prepareConsumerVerify({ rootDir: root }), /VEP-ADAPTER-CONFLICT/u);
    assert.equal(readFileSync(join(root, CONSUMER_VERIFY_ADAPTER_PATH), "utf8"), "// user owned\n");
  });
});

test("output aliases cannot delete outside bytes even when configuration is invalid", async () => {
  const outside = mkdtempSync(join(tmpdir(), "consumer-outside-"));
  const victim = join(outside, "verify.json");
  try {
    await withFixture('node -e "process.exit(0)"', async (root) => {
      writeFileSync(victim, "outside owned bytes\n");
      symlinkSync(outside, join(root, "alias"), "dir");
      writeFileSync(join(root, ".claude/pipeline.json"), "invalid JSON");
      await assert.rejects(() => produceVerifyEvidence({ rootDir: root, outPath: "alias/verify.json" }), (error) => error.code === "VEP-PATH");
      assert.equal(readFileSync(victim, "utf8"), "outside owned bytes\n");
      rmSync(join(root, "alias"));
      symlinkSync(outside, join(root, "evidence"), "dir");
      writeFileSync(join(outside, "verify-latest.json"), "canonical outside bytes\n");
      await assert.rejects(() => produceVerifyEvidence({ rootDir: root }), (error) => error.code === "VEP-PATH");
      assert.equal(readFileSync(join(outside, "verify-latest.json"), "utf8"), "canonical outside bytes\n");
    });
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("unborn candidates are unavailable and a clean run never seeds a missing adapter", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    git(root, ["rm", CONSUMER_VERIFY_ADAPTER_PATH]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "remove adapter"]);
    await assert.rejects(() => produceVerifyEvidence({ rootDir: root }), /VEP-PREPARATION-REQUIRED/u);
    assert.equal(existsSync(join(root, CONSUMER_VERIFY_ADAPTER_PATH)), false);
    git(root, ["checkout", "--orphan", "unborn"]);
    await assert.rejects(() => produceVerifyEvidence({ rootDir: root }), /Git observation failed/u);
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), false);
  });
});

test("real product assertions stay fresh while eligible baselines resume with durable receipts", async () => {
  const command = 'node -e "require(\'assert\').equal(require(\'fs\').existsSync(\'.git/fail-product\'), false)"';
  await withFixture(command, async (root) => {
    const first = await produceVerifyEvidence({ rootDir: root });
    const second = await produceVerifyEvidence({ rootDir: root });
    assert.equal(second.evidence.command, command);
    assert.deepEqual(second.evidence.steps.filter((s) => s.reused).map((s) => s.name), ["baseline-calibration", "baseline-repository", "baseline-verify-contract"]);
    const runs = join(root, ".git/agent-pipeline/verify/runs");
    const run = join(runs, second.evidence.verifyRun.runId);
    assert.equal(readdirSync(join(run, "receipts")).length, 5);
    assert.match(readFileSync(join(run, "progress.jsonl"), "utf8"), /"state":"reused"/u);
    assert.match(readFileSync(join(run, "logs", `${verifySuiteArtifactName("baseline-manifest")}.log`), "utf8"), /"status":"absent"/u);
    writeFileSync(join(root, ".git/fail-product"), "fail");
    await assert.rejects(() => produceVerifyEvidence({ rootDir: root }), /VEP-VERIFY-FAILED|Required consumer Verify/u);
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), false);
    assert.equal(first.evidence.exitCode, 0);
  });
});

test("no-reuse re-executes eligible consumer receipts and marks public evidence", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    await produceVerifyEvidence({ rootDir: root });
    const fresh = await produceVerifyEvidence({ rootDir: root, reuseReceipts: false });
    assert.equal(fresh.evidence.verifyRun.receiptReuse, "disabled");
    assert.ok(fresh.evidence.steps.every((step) => step.reused === false));
    const planPath = join(root, ".git/agent-pipeline/verify/runs", fresh.evidence.verifyRun.runId, "resume-plan.json");
    const plan = JSON.parse(readFileSync(planPath, "utf8"));
    assert.ok(plan.reasons.some((reason) => reason.code === "reuse-disabled"));
  });
});

test("invalid manifests and the legacy placeholder fail closed at every boundary", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    writeFileSync(join(root, ".claude/pipeline.yaml"), "invalid: manifest\n");
    git(root, ["add", ".claude/pipeline.yaml"]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "manifest"]);
    await assert.rejects(() => produceVerifyEvidence({ rootDir: root }), /Required consumer Verify/u);
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), false);
  });
  await withFixture('node -e "console.log(\'the verify contract of this project is not configured\')"', async (root) => {
    for (const mode of ["work", "critic", "push", "candidate", "release"]) {
      await assert.rejects(
        () => produceVerifyEvidence({ rootDir: root, mode }),
        (error) => error instanceof VerifyEvidenceError && error.code === "VEP-NO-COMMAND",
      );
      assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), false);
    }
  });
});

test("candidate drift rejects success and a new candidate never reuses baseline receipts", async () => {
  await withFixture('node -e "require(\'fs\').writeFileSync(\'README.md\', \'drift\')"', async (root) => {
    await assert.rejects(() => produceVerifyEvidence({ rootDir: root }), /candidate commit or tree changed/u);
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), false);
  });
  await withFixture('node -e "process.exit(0)"', async (root) => {
    await produceVerifyEvidence({ rootDir: root });
    writeFileSync(join(root, "README.md"), "new candidate\n");
    git(root, ["add", "README.md"]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "candidate"]);
    const result = await produceVerifyEvidence({ rootDir: root });
    assert.ok(result.evidence.steps.every((s) => !s.reused));
  });
});

test("an external installed package works and implementation changes invalidate resume", async () => {
  const installed = mkdtempSync(join(tmpdir(), "consumer-installed-"));
  try {
    cpSync(new URL("../", import.meta.url), installed, { recursive: true });
    await withFixture('node -e "require(\'assert\').equal(2 + 2, 4)"', (root) => {
      const entry = join(installed, "scripts/verify-evidence-producer.mjs");
      run(process.execPath, [entry, "--root", root, "--mode", "release"]);
      const dependency = join(installed, "scripts/consumer-verify-check.mjs");
      writeFileSync(dependency, `${readFileSync(dependency, "utf8")}\n// changed installed implementation\n`);
      run(process.execPath, [entry, "--root", root, "--mode", "release", "--no-reuse"]);
      const evidence = JSON.parse(readFileSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH), "utf8"));
      assert.ok(evidence.steps.every((s) => !s.reused));
      assert.equal(evidence.verifyRun.receiptReuse, "disabled");
      assert.equal(deriveGateEvidence({ rootDir: root, gate: "verify", sourcePath: VERIFY_EVIDENCE_DEFAULT_PATH }).evidence.status, "passed");
    });
  } finally { rmSync(installed, { recursive: true, force: true }); }
});

test("an interrupted new attempt clears stale canonical success", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    await produceVerifyEvidence({ rootDir: root });
    const script = new URL("./verify-evidence-producer.mjs", import.meta.url).pathname;
    const child = spawn(process.execPath, [script, "--root", root], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("no journal progress")); }, 10000);
      child.stdout.once("data", () => { clearTimeout(timer); child.kill("SIGKILL"); });
      child.once("error", reject);
      child.once("close", (_code, signal) => { clearTimeout(timer); try { assert.equal(signal, "SIGKILL"); resolve(); } catch (error) { reject(error); } });
    });
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), false);
  });
});

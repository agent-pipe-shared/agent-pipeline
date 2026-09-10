#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { VerifyEvidenceError, VERIFY_EVIDENCE_SCHEMA, produceVerifyEvidence } from "./verify-evidence-producer.mjs";
import { deriveGateEvidence } from "./publication-gate-evidence.mjs";
import { VERIFY_EVIDENCE_DEFAULT_PATH } from "../lib/verify-evidence-path.mjs";
import { prepareConsumerVerify, CONSUMER_VERIFY_ADAPTER_PATH } from "../lib/consumer-verify.mjs";
import { verifySuiteArtifactName } from "./verify-journal.mjs";

function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }

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
    assert.deepEqual(result.evidence.steps.map(({ name, exitCode }) => ({ name, exitCode })), ["baseline-calibration", "baseline-manifest", "baseline-verify-contract", "configured-verify"].map((name) => ({ name, exitCode: 0 })));
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
    const result = await produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" });
    const derived = deriveGateEvidence({ rootDir: root, gate: "verify", sourcePath: "evidence/verify.json" });
    assert.equal(derived.evidence.gate, "verify");
    assert.equal(derived.evidence.status, "passed");
    assert.equal(derived.evidence.exitCode, 0);
    assert.equal(derived.evidence.candidate.commit, result.evidence.commit);
    assert.equal(derived.evidence.candidate.tree, result.evidence.tree);
  });
});

test("a calibration naming no verify command is refused, never defaulted", async () => {
  const root = mkdtempSync(join(tmpdir(), "verify-evidence-producer-"));
  try {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify({ project: "no-verify" }, null, 2)}\n`);
    git(root, ["init", "-q"]);
    git(root, ["add", "."]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
    await assert.rejects(
      () => produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" }),
      (error) => error instanceof VerifyEvidenceError && error.code === "VEP-NO-COMMAND",
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
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
    const stdout = execFileSync("node", [scriptPath, "--root", root], { encoding: "utf8" });
    const parsed = JSON.parse(stdout.slice(stdout.indexOf("{\n")));
    assert.equal(parsed.status, "passed");
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), true);
  });
});

test("the CLI wrapper exits 0 and writes evidence for a passing run", async () => {
  await withFixture('node -e "process.exit(0)"', (root) => {
    const scriptPath = new URL("./verify-evidence-producer.mjs", import.meta.url).pathname;
    const stdout = execFileSync("node", [scriptPath, "--root", root, "--out", "evidence/verify.json"], { encoding: "utf8" });
    const parsed = JSON.parse(stdout.slice(stdout.indexOf("{\n")));
    assert.equal(parsed.status, "passed");
    assert.equal(existsSync(join(root, "evidence", "verify.json")), true);
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
    assert.deepEqual(second.evidence.steps.filter((s) => s.reused).map((s) => s.name), ["baseline-calibration", "baseline-verify-contract"]);
    const runs = join(root, ".git/agent-pipeline/verify/runs");
    const run = join(runs, second.evidence.verifyRun.runId);
    assert.equal(readdirSync(join(run, "receipts")).length, 4);
    assert.match(readFileSync(join(run, "progress.jsonl"), "utf8"), /"state":"reused"/u);
    assert.match(readFileSync(join(run, "logs", `${verifySuiteArtifactName("baseline-manifest")}.log`), "utf8"), /"status":"absent"/u);
    writeFileSync(join(root, ".git/fail-product"), "fail");
    await assert.rejects(() => produceVerifyEvidence({ rootDir: root }), /VEP-VERIFY-FAILED|Required consumer Verify/u);
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), false);
    assert.equal(first.evidence.exitCode, 0);
  });
});

test("invalid present manifest and placeholders cannot yield success", async () => {
  await withFixture('node -e "process.exit(0)"', async (root) => {
    writeFileSync(join(root, ".claude/pipeline.yaml"), "invalid: manifest\n");
    git(root, ["add", ".claude/pipeline.yaml"]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "manifest"]);
    await assert.rejects(() => produceVerifyEvidence({ rootDir: root }), /Required consumer Verify/u);
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), false);
  });
  await withFixture('node -e "console.log(\'the verify contract of this project is not configured\')"', async (root) => {
    await assert.rejects(() => produceVerifyEvidence({ rootDir: root }), /Required consumer Verify/u);
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
      execFileSync(process.execPath, [entry, "--root", root]);
      const dependency = join(installed, "scripts/consumer-verify-check.mjs");
      writeFileSync(dependency, `${readFileSync(dependency, "utf8")}\n// changed installed implementation\n`);
      execFileSync(process.execPath, [entry, "--root", root]);
      const evidence = JSON.parse(readFileSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH), "utf8"));
      assert.ok(evidence.steps.every((s) => !s.reused));
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

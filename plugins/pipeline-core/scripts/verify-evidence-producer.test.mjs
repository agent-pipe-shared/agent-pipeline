#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { VerifyEvidenceError, VERIFY_EVIDENCE_SCHEMA, produceVerifyEvidence } from "./verify-evidence-producer.mjs";
import { deriveGateEvidence } from "./publication-gate-evidence.mjs";
import { VERIFY_EVIDENCE_DEFAULT_PATH } from "../lib/verify-evidence-path.mjs";

function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim(); }

/** A minimal committed project: calibration naming `verify`, one commit, clean tree. */
function fixture(verifyCommand) {
  const root = mkdtempSync(join(tmpdir(), "verify-evidence-producer-"));
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify({ project: "fixture-project", verify: verifyCommand }, null, 2)}\n`);
  writeFileSync(join(root, "README.md"), "# Fixture\n");
  git(root, ["init", "-q"]);
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
  return root;
}
function withFixture(verifyCommand, run) {
  const root = fixture(verifyCommand);
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("a passing verify produces a consumable artifact bound to the exact commit and tree", () => {
  withFixture('node -e "process.exit(0)"', (root) => {
    const result = produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" });
    assert.equal(result.status, "passed");
    const commit = git(root, ["rev-parse", "HEAD"]);
    const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
    assert.equal(result.evidence.schema, VERIFY_EVIDENCE_SCHEMA);
    assert.equal(result.evidence.commit, commit);
    assert.equal(result.evidence.tree, tree);
    assert.equal(result.evidence.candidate.commit, commit);
    assert.equal(result.evidence.candidate.tree, tree);
    assert.equal(result.evidence.exitCode, 0);
    assert.deepEqual(result.evidence.steps, [{ name: "configured-verify", exitCode: 0 }]);
    const onDisk = JSON.parse(readFileSync(join(root, "evidence", "verify.json"), "utf8"));
    assert.deepEqual(onDisk, result.evidence);
  });
});

test("a failing verify command produces no artifact at all", () => {
  withFixture('node -e "process.exit(3)"', (root) => {
    assert.throws(
      () => produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" }),
      (error) => error instanceof VerifyEvidenceError && error.code === "VEP-VERIFY-FAILED",
    );
    assert.equal(existsSync(join(root, "evidence", "verify.json")), false, "a failing verify must leave no evidence file");
  });
});

test("a dirty working tree is refused before the verify command runs, and the rejection is recorded explicitly", () => {
  withFixture('node -e "require(\'fs\').writeFileSync(\'ran.marker\', \'x\')"', (root) => {
    writeFileSync(join(root, "README.md"), "# Fixture\n\nuncommitted change\n");
    const result = produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" });
    assert.equal(result.status, "dirty");
    assert.equal(result.evidence.exitCode, 1);
    assert.deepEqual(result.evidence.steps, [{ name: "candidate-preflight", exitCode: 1 }]);
    assert.equal(existsSync(join(root, "evidence", "verify.json")), true, "the dirty rejection must still be recorded explicitly");
    assert.equal(existsSync(join(root, "ran.marker")), false, "the configured verify command must never run against a dirty tree");
  });
});

test("the produced artifact satisfies the real publication-gate-evidence consumer unmodified", () => {
  withFixture('node -e "process.exit(0)"', (root) => {
    const result = produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" });
    const derived = deriveGateEvidence({ rootDir: root, gate: "verify", sourcePath: "evidence/verify.json" });
    assert.equal(derived.evidence.gate, "verify");
    assert.equal(derived.evidence.status, "passed");
    assert.equal(derived.evidence.exitCode, 0);
    assert.equal(derived.evidence.candidate.commit, result.evidence.commit);
    assert.equal(derived.evidence.candidate.tree, result.evidence.tree);
  });
});

test("a calibration naming no verify command is refused, never defaulted", () => {
  const root = mkdtempSync(join(tmpdir(), "verify-evidence-producer-"));
  try {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify({ project: "no-verify" }, null, 2)}\n`);
    git(root, ["init", "-q"]);
    git(root, ["add", "."]);
    git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"]);
    assert.throws(
      () => produceVerifyEvidence({ rootDir: root, outPath: "evidence/verify.json" }),
      (error) => error instanceof VerifyEvidenceError && error.code === "VEP-NO-COMMAND",
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a bare invocation with no --out resolves to the shared VERIFY_EVIDENCE_DEFAULT_PATH constant", () => {
  withFixture('node -e "process.exit(0)"', (root) => {
    const result = produceVerifyEvidence({ rootDir: root });
    assert.equal(result.status, "passed");
    assert.equal(result.outPath, join(root, VERIFY_EVIDENCE_DEFAULT_PATH));
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), true);
  });
});

test("the CLI wrapper with no --out flag also resolves to the shared default path", () => {
  withFixture('node -e "process.exit(0)"', (root) => {
    const scriptPath = new URL("./verify-evidence-producer.mjs", import.meta.url).pathname;
    const stdout = execFileSync("node", [scriptPath, "--root", root], { encoding: "utf8" });
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.status, "passed");
    assert.equal(existsSync(join(root, VERIFY_EVIDENCE_DEFAULT_PATH)), true);
  });
});

test("the CLI wrapper exits 0 and writes evidence for a passing run", () => {
  withFixture('node -e "process.exit(0)"', (root) => {
    const scriptPath = new URL("./verify-evidence-producer.mjs", import.meta.url).pathname;
    const stdout = execFileSync("node", [scriptPath, "--root", root, "--out", "evidence/verify.json"], { encoding: "utf8" });
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.status, "passed");
    assert.equal(existsSync(join(root, "evidence", "verify.json")), true);
  });
});

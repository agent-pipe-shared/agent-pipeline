// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reproduceReviewedFinding, verifyReproductionGate } from "./gitleaks-reproduction-gate.mjs";

const VALUE = "playgame.example-studio.example";
const PATH = "src/game.js";
const RULE = "generic-api-key";
const fixture = () => {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-reproduction-"));
  mkdirSync(join(rootDir, "src"));
  writeFileSync(join(rootDir, PATH), `domain=${VALUE}\n`);
  const binaryPath = join(rootDir, "scanner-binary");
  writeFileSync(binaryPath, "synthetic binary identity");
  const spawnFn = (_command, args) => {
    const report = [{ File: join(rootDir, PATH), RuleID: RULE, StartLine: 1,
      StartColumn: 8, Secret: VALUE, Description: "Generic API Key" }];
    writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify(report));
    return { status: 0, stdout: "", stderr: "", error: null };
  };
  return { rootDir, binaryPath, spawnFn, path: PATH, rule: RULE, line: 1, column: 8,
    reviewedValue: VALUE };
};

test("reproduction binds exact local scanner report, binary, config and input without exposing value", async () => {
  const f = fixture();
  try {
    const result = await reproduceReviewedFinding(f);
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.gate.historicalIdentity, "unknown");
    assert.doesNotMatch(JSON.stringify(result.gate), /playgame\.example-studio/u);
    assert.equal((await verifyReproductionGate({ ...f, gate: result.gate })).ok, true);
    assert.equal((await verifyReproductionGate({ ...f, gate: null })).ok, false);
    assert.equal((await verifyReproductionGate({ ...f, gate: { ...result.gate, valueSha256: "0".repeat(64) } })).ok, false);
    assert.equal((await verifyReproductionGate({ ...f, gate: { ...result.gate, configSha256: "0".repeat(64) } })).ok, false);
    assert.equal((await verifyReproductionGate({ ...f, gate: { ...result.gate, binarySha256: "0".repeat(64) } })).ok, false);
    assert.equal((await verifyReproductionGate({ ...f, gate: { ...result.gate, reportSha256: "bad" } })).ok, false);
    writeFileSync(join(f.rootDir, PATH), "domain=changed.example\n");
    assert.equal((await verifyReproductionGate({ ...f, gate: result.gate })).ok, false);
  } finally { rmSync(f.rootDir, { recursive: true, force: true }); }
});

test("review must match one reproduced plain domain; credential-shaped value cannot enter gate", async () => {
  const f = fixture();
  try {
    assert.equal((await reproduceReviewedFinding({ ...f, reviewedValue: "other.example" })).ok, false);
    assert.equal((await reproduceReviewedFinding({ ...f, reviewedValue: "AKIAIOSFODNN7EXAMPLE" })).ok, false);
    assert.equal((await reproduceReviewedFinding({ ...f, path: "../elsewhere" })).ok, false);
  } finally { rmSync(f.rootDir, { recursive: true, force: true }); }
});

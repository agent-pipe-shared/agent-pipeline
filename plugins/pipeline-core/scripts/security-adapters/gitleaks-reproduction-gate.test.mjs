// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { REVIEWED_VALUE_REFUSAL, reproduceReviewedFinding, reviewedValueClass, verifyReproductionGate } from "./gitleaks-reproduction-gate.mjs";
import { parseArgv } from "../gitleaks-repair-ignore.mjs";

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

// Candidate 16b: a deliberately public value (a hex key published as the tracked file public/<key>.txt) is reviewable besides a plain
// domain; every other credential-shaped value stays refused, and the refusal text names what is accepted.
const KEY = "9f86d081884c7d659a2feaa0c55ad015";
const KEY_PATH = "app/api/indexnow/route.ts";
const gitIn = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
};
const keyFixture = ({ publicFile = "tracked", content = KEY } = {}) => {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-public-value-"));
  gitIn(rootDir, "init", "-q");
  mkdirSync(join(rootDir, "app/api/indexnow"), { recursive: true });
  mkdirSync(join(rootDir, "public"));
  writeFileSync(join(rootDir, KEY_PATH), `const key = "${KEY}";\n`);
  if (publicFile !== "none") writeFileSync(join(rootDir, "public", `${KEY}.txt`), `${content}\n`);
  gitIn(rootDir, "add", KEY_PATH);
  if (publicFile === "tracked") gitIn(rootDir, "add", `public/${KEY}.txt`);
  const binaryPath = join(rootDir, "scanner-binary");
  writeFileSync(binaryPath, "synthetic binary identity");
  const spawnFn = (_command, args) => {
    const report = [{ File: join(rootDir, KEY_PATH), RuleID: RULE, StartLine: 1, StartColumn: 14, Secret: KEY, Description: "Generic API Key" }];
    writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify(report));
    return { status: 0, stdout: "", stderr: "", error: null };
  };
  return { rootDir, binaryPath, spawnFn, path: KEY_PATH, rule: RULE, line: 1, column: 14, reviewedValue: KEY };
};

test("a hex key published as a tracked public/<key>.txt with exactly that content is reviewable and the gate verifies", async () => {
  const f = keyFixture();
  try {
    assert.equal(reviewedValueClass(f.rootDir, KEY), "public-key-file");
    const result = await reproduceReviewedFinding(f);
    assert.equal(result.ok, true, result.reason);
    assert.doesNotMatch(JSON.stringify(result.gate), new RegExp(KEY, "u"), "the value itself never enters the gate");
    assert.equal((await verifyReproductionGate({ ...f, gate: result.gate })).ok, true);
  } finally { rmSync(f.rootDir, { recursive: true, force: true }); }
});

test("the public-value class is closed: untracked, missing, differing or malformed keys stay refused with a text that names what is accepted", async () => {
  for (const [label, options] of [["untracked public file", { publicFile: "untracked" }], ["no public file", { publicFile: "none" }], ["public file with other content", { content: "something else" }]]) {
    const f = keyFixture(options);
    try {
      const refused = await reproduceReviewedFinding(f);
      assert.equal(refused.ok, false, label);
      assert.equal(refused.reason, REVIEWED_VALUE_REFUSAL, label);
    } finally { rmSync(f.rootDir, { recursive: true, force: true }); }
  }
  const f = keyFixture();
  try {
    for (const value of [KEY.slice(1), KEY.toUpperCase(), `${KEY}${"0".repeat(40)}`, "AKIAIOSFODNN7EXAMPLE", `../${KEY}`]) {
      assert.equal(reviewedValueClass(f.rootDir, value), null, `refused: ${value}`);
      assert.equal((await reproduceReviewedFinding({ ...f, reviewedValue: value })).ok, false, `refused: ${value}`);
    }
    assert.match(REVIEWED_VALUE_REFUSAL, /plain domain/u);
    assert.match(REVIEWED_VALUE_REFUSAL, /public\/<key>\.txt/u);
    assert.equal(reviewedValueClass(f.rootDir, "playgame.example-studio.example"), "domain", "the domain class is unchanged");
  } finally { rmSync(f.rootDir, { recursive: true, force: true }); }
});

test("the closed CLI accepts --reason and still refuses unknown or duplicate selectors", () => {
  const base = ["--prepare-gate", "--path", KEY_PATH, "--rule", RULE, "--line", "1", "--column", "14", "--gate-file", "scratch/g.json", "--reviewed-value-file", "scratch/v.txt"];
  assert.equal(parseArgv([...base, "--reason", "IndexNow key, public by protocol"]).reason, "IndexNow key, public by protocol");
  assert.throws(() => parseArgv([...base, "--reason", "a", "--reason", "b"]), /unknown or duplicate/u);
  assert.throws(() => parseArgv([...base, "--why", "x"]), /unknown or duplicate/u);
});

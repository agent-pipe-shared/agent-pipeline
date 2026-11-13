// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { REVIEWED_VALUE_REFUSAL, reproduceReviewedFinding, reproductionGateFactsStillMatch, reviewedValueClass, verifyReproductionGate } from "./gitleaks-reproduction-gate.mjs";
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
const KEY = ["9f86d081884c7d65", "9a2feaa0c55ad015"].join("");
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

// Candidate 28e (Codex test run, PO 2026-11-13): a public application identifier (a localStorage key name) that gitleaks reads as a
// generic API key had no review route. It is reviewable for generic-api-key only, in a closed shape, and only when the project's own
// tracked source holds it verbatim inside quotes; a copy in the Pipeline's own records (specs/, evidence, audit bundles) proves nothing.
const IDENTIFIER = "sampleapp.results.v1";
const RECORD_PATH = "specs/f/evidence/dispatch-projection.json";
const identifierFixture = ({ source = "tracked", rule = RULE } = {}) => {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-public-identifier-"));
  gitIn(rootDir, "init", "-q");
  mkdirSync(join(rootDir, "src/platform"), { recursive: true });
  mkdirSync(join(rootDir, "specs/f/evidence"), { recursive: true });
  writeFileSync(join(rootDir, RECORD_PATH), `{"text":"storageKey = '${IDENTIFIER}'."}\n`);
  gitIn(rootDir, "add", RECORD_PATH);
  if (source !== "none") writeFileSync(join(rootDir, "src/platform/results.js"), `var resultsNamespace = '${IDENTIFIER}';\n`);
  if (source === "tracked") gitIn(rootDir, "add", "src/platform/results.js");
  const binaryPath = join(rootDir, "scanner-binary");
  writeFileSync(binaryPath, "synthetic binary identity");
  const spawnFn = (_command, args) => {
    const report = [{ File: join(rootDir, RECORD_PATH), RuleID: rule, StartLine: 1, StartColumn: 10, Secret: IDENTIFIER, Description: "Generic API Key" }];
    writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify(report));
    return { status: 0, stdout: "", stderr: "", error: null };
  };
  return { rootDir, binaryPath, spawnFn, path: RECORD_PATH, rule, line: 1, column: 10, reviewedValue: IDENTIFIER };
};

test("C28e (Codex test run): a public identifier the tracked source holds verbatim is reviewable for generic-api-key and the gate verifies", async () => {
  const f = identifierFixture();
  try {
    assert.equal(reviewedValueClass(f.rootDir, IDENTIFIER, spawnSync, RULE, RECORD_PATH), "public-identifier");
    assert.equal(reviewedValueClass(f.rootDir, IDENTIFIER, spawnSync, RULE, "src/platform/results.js"), null, "a finding in source code is fixed in the code, never reviewed as a public identifier");
    assert.equal(reviewedValueClass(f.rootDir, IDENTIFIER, spawnSync, RULE), null, "without the finding's path the class does not apply");
    const result = await reproduceReviewedFinding(f);
    assert.equal(result.ok, true, result.reason);
    assert.doesNotMatch(JSON.stringify(result.gate), /sampleapp/u, "the value itself never enters the gate");
    assert.equal((await verifyReproductionGate({ ...f, gate: result.gate })).ok, true);
    assert.match(REVIEWED_VALUE_REFUSAL, /public identifier/u);
  } finally { rmSync(f.rootDir, { recursive: true, force: true }); }
});

test("C28e (Codex test run): the public-identifier class is closed: other rule, untracked or record-only source, and token shapes stay refused", async () => {
  for (const [label, options] of [["another rule", { rule: "aws-access-token" }], ["untracked source", { source: "untracked" }], ["only in the Pipeline's records", { source: "none" }]]) {
    const f = identifierFixture(options);
    try {
      const refused = await reproduceReviewedFinding(f);
      assert.equal(refused.ok, false, label);
      assert.equal(refused.reason, REVIEWED_VALUE_REFUSAL, label);
    } finally { rmSync(f.rootDir, { recursive: true, force: true }); }
  }
  const f = identifierFixture();
  try {
    for (const value of ["sampleapp", "Sampleapp.Results.V1", "k3j9x2q8.z7w4", "ab12cd34ef.results.v1", `${"a".repeat(30)}.${"b".repeat(30)}.v1`, "results.v1/../x", "1.2.3"]) {
      assert.equal(reviewedValueClass(f.rootDir, value, spawnSync, RULE, RECORD_PATH), null, `refused shape: ${value}`);
    }
    assert.equal(reviewedValueClass(f.rootDir, IDENTIFIER, spawnSync, null, RECORD_PATH), null, "without the rule the identifier class does not apply");
    assert.equal(reviewedValueClass(f.rootDir, IDENTIFIER, spawnSync, RULE, "specs/f/evidence/../../src/platform/results.js"), null, "a dot-dot path is no record");
  } finally { rmSync(f.rootDir, { recursive: true, force: true }); }
});

// Candidate 16c (consumer finding): on a working root the report holds every finding of the tree in a changing order. The gate binds only
// the selected finding, so a second scan with other, more, differently ordered findings still verifies, and a changed selected finding does not.
test("the gate binds the selected finding, not the whole report: unrelated and reordered findings do not invalidate it", async () => {
  const f = keyFixture();
  try {
    const selected = { File: join(f.rootDir, KEY_PATH), RuleID: RULE, StartLine: 1, StartColumn: 14, Secret: KEY, Description: "Generic API Key" };
    const noise = (n) => ({ File: join(f.rootDir, `.next/cache/${n}.json`), RuleID: "generic-api-key", StartLine: n, StartColumn: 3, Secret: `noise${n}`.padEnd(24, "x"), Description: "noise" });
    const scanWith = (report) => (_command, args) => {
      writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify(report));
      return { status: 0, stdout: "", stderr: "", error: null };
    };
    const first = await reproduceReviewedFinding({ ...f, spawnFn: scanWith([selected, noise(1)]) });
    assert.equal(first.ok, true, first.reason);
    const later = { ...f, spawnFn: scanWith([noise(3), noise(2), selected, noise(1), noise(4)]) };
    assert.equal((await verifyReproductionGate({ ...later, gate: first.gate })).ok, true, "other findings and another order do not matter");
    const again = await reproduceReviewedFinding(later);
    assert.equal(JSON.stringify(again.gate), JSON.stringify(first.gate), "the gate is reproducible byte for byte");
    assert.equal(reproductionGateFactsStillMatch({ gate: first.gate, rootDir: f.rootDir, binaryPath: f.binaryPath, reviewedValue: KEY,
      rawReport: JSON.stringify([noise(9), selected]) }), true, "the final readback accepts a raw report with other findings");
    assert.equal(reproductionGateFactsStillMatch({ gate: first.gate, rootDir: f.rootDir, binaryPath: f.binaryPath, reviewedValue: KEY,
      rawReport: JSON.stringify([noise(9)]) }), false, "the final readback refuses a report without the selected finding");
    const moved = { ...selected, StartLine: 2 };
    assert.equal((await verifyReproductionGate({ ...f, spawnFn: scanWith([moved, noise(1)]), gate: first.gate })).ok, false, "a moved selected finding is refused");
    const changedValue = { ...selected, Secret: KEY.replace("9f", "9e") };
    assert.equal((await verifyReproductionGate({ ...f, spawnFn: scanWith([changedValue]), gate: first.gate })).ok, false, "another value at the same place is refused");
  } finally { rmSync(f.rootDir, { recursive: true, force: true }); }
});

test("the closed CLI accepts --reason and still refuses unknown or duplicate selectors", () => {
  const base = ["--prepare-gate", "--path", KEY_PATH, "--rule", RULE, "--line", "1", "--column", "14", "--gate-file", "scratch/g.json", "--reviewed-value-file", "scratch/v.txt"];
  assert.equal(parseArgv([...base, "--reason", "IndexNow key, public by protocol"]).reason, "IndexNow key, public by protocol");
  assert.throws(() => parseArgv([...base, "--reason", "a", "--reason", "b"]), /unknown or duplicate/u);
  assert.throws(() => parseArgv([...base, "--why", "x"]), /unknown or duplicate/u);
});

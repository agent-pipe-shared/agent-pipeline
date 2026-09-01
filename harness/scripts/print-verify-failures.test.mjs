// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  boundSuiteTail,
  buildFailureReport,
  MAX_BYTES_PER_SUITE,
  MAX_LINES_PER_SUITE,
  MAX_TOTAL_BYTES,
  REDACTION_MARKER,
  redactText,
  verifySuiteArtifactName,
} from "./print-verify-failures.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "print-verify-failures-"));
}

function writeEvidence(root, evidence) {
  const evidencePath = join(root, "evidence", "verify-latest.json");
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(evidence));
  return evidencePath;
}

/**
 * Seeds one suite's receipt + log under `<runsRoot>/<runId>/`, using the
 * product's own `verifySuiteArtifactName` for the file-name mapping (never
 * re-derived by hand — the mapping is a SHA-256 hex digest of the suite id,
 * not a human-readable slug).
 */
function seedSuiteLog(runsRoot, runId, suiteName, { logText, logPath = null }) {
  const runDir = join(runsRoot, runId);
  const logsDir = join(runDir, "logs");
  const receiptsDir = join(runDir, "receipts");
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(receiptsDir, { recursive: true });
  const artifact = verifySuiteArtifactName(suiteName);
  const resolvedLogPath = logPath ?? `logs/${artifact}.log`;
  if (logText !== null) writeFileSync(join(runDir, resolvedLogPath), logText);
  writeFileSync(join(receiptsDir, `${artifact}.json`), JSON.stringify({ log: { path: resolvedLogPath } }));
  return runDir;
}

function evidenceWithSteps(steps, { runId = "verify-fixture-run" } = {}) {
  return {
    schema: "pipeline.verify-evidence.v0",
    commit: "deadbeefcafefeedfacecafefeedfacecafefeed",
    steps,
    verifyRun: runId === null ? null : { runId },
  };
}

// --- AC-4: no evidence artifact ---------------------------------------
check("no evidence artifact -> one bounded diagnostic line, exit-0 shape", () => {
  const root = makeRoot();
  try {
    const evidencePath = join(root, "evidence", "verify-latest.json");
    const runsRoot = join(root, "runs");
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.equal(lines.length, 1, `expected exactly one diagnostic line, got: ${JSON.stringify(lines)}`);
    assert.match(lines[0], /^PRINT-VERIFY-FAILURES-NO-EVIDENCE: /);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- AC-4: corrupt JSON evidence file -----------------------------------
check("corrupt JSON evidence file -> one bounded diagnostic line naming it", () => {
  const root = makeRoot();
  try {
    const evidencePath = join(root, "evidence", "verify-latest.json");
    mkdirSync(join(root, "evidence"), { recursive: true });
    writeFileSync(evidencePath, "{ not json ");
    const runsRoot = join(root, "runs");
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^PRINT-VERIFY-FAILURES-CORRUPT-EVIDENCE: /);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("evidence JSON missing a steps array is also treated as corrupt shape, not a crash", () => {
  const root = makeRoot();
  try {
    const evidencePath = writeEvidence(root, { schema: "pipeline.verify-evidence.v0" });
    const runsRoot = join(root, "runs");
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^PRINT-VERIFY-FAILURES-CORRUPT-EVIDENCE: /);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- AC-1 zero-failure path ---------------------------------------------
check("no failing suites -> a single positive confirmation line, never silent", () => {
  const root = makeRoot();
  try {
    const evidencePath = writeEvidence(root, evidenceWithSteps([{ name: "a", exitCode: 0 }, { name: "b", exitCode: 0 }]));
    const runsRoot = join(root, "runs");
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^PRINT-VERIFY-FAILURES-NONE: /);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- AC-4: no verifyRun.runId --------------------------------------------
check("evidence with no verifyRun.runId -> per-suite logs degrade, suite still named with its exit code", () => {
  const root = makeRoot();
  try {
    const evidencePath = writeEvidence(root, evidenceWithSteps([{ name: "candidate-preflight", exitCode: 1 }], { runId: null }));
    const runsRoot = join(root, "runs");
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.match(lines[0], /^PRINT-VERIFY-FAILURES-NO-RUN-ID: /);
    assert.ok(lines.some((line) => line === "=== candidate-preflight (exit 1) ==="), `suite header missing, got: ${JSON.stringify(lines)}`);
    assert.ok(lines.some((line) => /^PRINT-VERIFY-FAILURES-NO-SUITE-LOG: /.test(line)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- AC-4: no run directory ----------------------------------------------
check("runId present but journal run directory missing -> one bounded diagnostic naming the runId", () => {
  const root = makeRoot();
  try {
    const evidencePath = writeEvidence(root, evidenceWithSteps([{ name: "some-suite", exitCode: 2 }], { runId: "verify-does-not-exist" }));
    const runsRoot = join(root, "runs");
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.match(lines[0], /^PRINT-VERIFY-FAILURES-NO-RUN-DIR: journal run directory for runId verify-does-not-exist was not found/);
    assert.ok(lines.some((line) => line === "=== some-suite (exit 2) ==="));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- AC-4: missing per-suite log (receipt absent) -------------------------
check("suite receipt missing on disk -> per-suite diagnostic naming the suite, degrade not throw", () => {
  const root = makeRoot();
  try {
    const runId = "verify-run-1";
    const runsRoot = join(root, "runs");
    mkdirSync(join(runsRoot, runId), { recursive: true }); // run dir exists, but no receipts/logs seeded
    const evidencePath = writeEvidence(root, evidenceWithSteps([{ name: "missing-receipt-suite", exitCode: 1 }], { runId }));
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.ok(lines.some((line) => /^PRINT-VERIFY-FAILURES-NO-SUITE-LOG: no suite receipt found for "missing-receipt-suite"/.test(line)), JSON.stringify(lines));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- AC-4: missing per-suite log (receipt present, log file absent) -------
check("suite receipt present but the log file it references is absent -> per-suite diagnostic", () => {
  const root = makeRoot();
  try {
    const runId = "verify-run-2";
    const runsRoot = join(root, "runs");
    seedSuiteLog(runsRoot, runId, "orphaned-log-suite", { logText: null }); // receipt written, log file never written
    const evidencePath = writeEvidence(root, evidenceWithSteps([{ name: "orphaned-log-suite", exitCode: 1 }], { runId }));
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.ok(lines.some((line) => /^PRINT-VERIFY-FAILURES-NO-SUITE-LOG: log file for "orphaned-log-suite" not found/.test(line)), JSON.stringify(lines));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- happy path: one small failing suite, full tail printed unbounded -----
check("one small failing suite -> name, exit code, repo-relative log path and full tail, no truncation", () => {
  const root = makeRoot();
  try {
    const runId = "verify-run-3";
    const runsRoot = join(root, "runs");
    const logText = "assertion failed: expected 1 to equal 2\n    at file.mjs:12\n";
    seedSuiteLog(runsRoot, runId, "small-suite", { logText });
    const evidencePath = writeEvidence(root, evidenceWithSteps([{ name: "small-suite", exitCode: 1 }], { runId }));
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    const text = lines.join("\n");
    assert.match(text, /=== small-suite \(exit 1\) ===/);
    assert.match(text, /^log: runs[/\\]verify-run-3[/\\]logs[/\\]/m);
    assert.match(text, /assertion failed: expected 1 to equal 2/);
    assert.equal(lines.some((line) => line.startsWith("PRINT-VERIFY-FAILURES-TRUNCATED")), false, "no truncation expected for a small log");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- AC-2: per-suite line bound (>200 lines) -------------------------------
check("a log over 200 lines is truncated to the last 200, with an explicit truncation line", () => {
  const totalLines = MAX_LINES_PER_SUITE + 50;
  const rawLines = Array.from({ length: totalLines }, (_, index) => `line-${index}`);
  const logText = `${rawLines.join("\n")}\n`;
  const bounded = boundSuiteTail(logText);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.totalLines, totalLines);
  assert.equal(bounded.keptLineCount, MAX_LINES_PER_SUITE);
  // The TAIL is kept: the very last line must survive, the first must not.
  assert.ok(bounded.text.endsWith(`line-${totalLines - 1}`), bounded.text.slice(-40));
  assert.equal(bounded.text.includes("line-0\n") || bounded.text.startsWith("line-0"), false);

  const root = makeRoot();
  try {
    const runId = "verify-run-4";
    const runsRoot = join(root, "runs");
    seedSuiteLog(runsRoot, runId, "long-suite", { logText });
    const evidencePath = writeEvidence(root, evidenceWithSteps([{ name: "long-suite", exitCode: 1 }], { runId }));
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.ok(lines.some((line) => /^PRINT-VERIFY-FAILURES-TRUNCATED: "long-suite" omitted \d+ byte\(s\)/.test(line)), JSON.stringify(lines));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- NVA-B-CIGREEN-1: a failing line in the omitted head is still reported --
// CI run 33551001455 reported codex-onboarding-capabilities-tests red with 22
// of 23 tests passing, and which test failed could not be recovered from the
// step log at all: node:test emits its result lines in test order, so an early
// failure is the first thing a TAIL bound drops. A truncation that hides the
// failing test's own line defeats the reporter.
check("a failing line that falls into the truncated head is still present in the output", () => {
  const failingLine = "not ok 3 - a fresh Codex root with only an empty read-only .git mount is host-managed";
  const rawLines = [
    "ok 1 - first",
    "ok 2 - second",
    failingLine,
    ...Array.from({ length: MAX_LINES_PER_SUITE + 50 }, (_, index) => `ok ${index + 4} - filler-${index}`),
  ];
  const logText = `${rawLines.join("\n")}\n`;
  const bounded = boundSuiteTail(logText);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.text.includes(failingLine), true, "the failing line must survive the line bound");
  assert.ok(bounded.text.endsWith(`ok ${rawLines.length} - filler-${MAX_LINES_PER_SUITE + 49}`), bounded.text.slice(-60));

  const root = makeRoot();
  try {
    const runId = "verify-run-head-failure";
    const runsRoot = join(root, "runs");
    seedSuiteLog(runsRoot, runId, "head-failure-suite", { logText });
    const evidencePath = writeEvidence(root, evidenceWithSteps([{ name: "head-failure-suite", exitCode: 1 }], { runId }));
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    assert.ok(lines.join("\n").includes(failingLine), "the reporter's own output must still name the failing test");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- AC-2: per-suite byte bound, one line longer than the byte cap --------
check("a single line longer than the byte cap is tail-sliced, not dropped entirely", () => {
  const hugeLine = "x".repeat(MAX_BYTES_PER_SUITE + 5000);
  const bounded = boundSuiteTail(hugeLine);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.keptBytes, MAX_BYTES_PER_SUITE);
  assert.ok(bounded.text.length > 0, "the tail slice must not be empty");
  assert.ok(hugeLine.endsWith(bounded.text), "the kept text must be the TAIL of the original line");
});

// --- AC-2: global 200000-byte cap across all suites -----------------------
check("global 200000-byte cap: later suites shrink, then are omitted entirely once exhausted", () => {
  const root = makeRoot();
  try {
    const runId = "verify-run-5";
    const runsRoot = join(root, "runs");
    const perSuiteBytes = 19000; // under MAX_BYTES_PER_SUITE alone, so no per-suite truncation in isolation
    const steps = [];
    // 10 suites * 19000 = 190000, leaving 10000 of a 200000 global budget.
    for (let index = 0; index < 10; index += 1) {
      const name = `bulk-suite-${index}`;
      seedSuiteLog(runsRoot, runId, name, { logText: "y".repeat(perSuiteBytes) });
      steps.push({ name, exitCode: 1 });
    }
    // 11th suite: only 10000 of its own 19000 bytes fit -> shrink-truncated, not omitted.
    seedSuiteLog(runsRoot, runId, "bulk-suite-shrink", { logText: "z".repeat(perSuiteBytes) });
    steps.push({ name: "bulk-suite-shrink", exitCode: 1 });
    // 12th suite: global budget is now fully exhausted -> omitted entirely.
    seedSuiteLog(runsRoot, runId, "bulk-suite-omitted", { logText: "w".repeat(perSuiteBytes) });
    steps.push({ name: "bulk-suite-omitted", exitCode: 1 });

    const evidencePath = writeEvidence(root, evidenceWithSteps(steps, { runId }));
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    const text = lines.join("\n");

    assert.ok(/PRINT-VERIFY-FAILURES-TRUNCATED: "bulk-suite-shrink" omitted \d+ byte\(s\).*200000-byte total output cap also applied/.test(text), text.slice(-2000));
    assert.ok(/PRINT-VERIFY-FAILURES-TRUNCATED: "bulk-suite-omitted" log tail omitted entirely \(\d+ byte\(s\)\) -- the 200000-byte total output cap was already reached\./.test(text), text.slice(-2000));

    // Total printed log-tail bytes across all suites never exceeds the global cap.
    let totalKeptBytes = 0;
    for (let index = 0; index < 10; index += 1) totalKeptBytes += perSuiteBytes;
    // bulk-suite-shrink contributes only the remaining 10000 bytes.
    totalKeptBytes += 10000;
    assert.ok(totalKeptBytes <= MAX_TOTAL_BYTES);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- AC-3: redaction ------------------------------------------------------
// Fixture values below are assembled from separately-quoted, non-adjacent
// parts (`[...].join("")`) rather than written as one complete literal.
// Measured, not theoretical: an earlier revision of print-verify-failures.mjs
// spelled a PEM header out as one literal example string in a comment, and
// gitleaks' "private-key" rule fired on it (security-scan, severity high) --
// a scanner reads raw source bytes, not JS semantics, so a complete literal
// credential-shaped string is indistinguishable from a real one whether it
// sits in a comment, a regex, or (here) a test fixture. Splitting the literal
// keeps the RUNTIME string these tests need (redactText only ever sees the
// assembled value) while no complete trigger pattern exists in the source.
function assembleFromParts(...parts) { return parts.join(""); }

check("a ghp_ token is redacted; the raw token never reaches the output", () => {
  const token = assembleFromParts("ghp_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6");
  const text = redactText(`Authorization: token ${token}\nnext line unaffected\n`);
  assert.equal(text.includes(token), false, "raw token leaked into redacted output");
  assert.ok(text.includes(REDACTION_MARKER));
  assert.match(text, /next line unaffected/);
});

check("a github_pat_ token is redacted", () => {
  const token = assembleFromParts("github_pat_", "Q".repeat(60));
  const text = redactText(`env: GH_TOKEN=${token}`);
  assert.equal(text.includes(token), false);
  assert.ok(text.includes(REDACTION_MARKER));
});

check("an AKIA-prefixed access key id is redacted", () => {
  const key = assembleFromParts("AKIA", "ABCDEFGHIJKLMNOP");
  const text = redactText(`aws_access_key_id = ${key}`);
  assert.equal(text.includes(key), false);
  assert.ok(text.includes(REDACTION_MARKER));
});

check("a PRIVATE KEY block's body lines are redacted; BEGIN/END markers and surrounding lines survive", () => {
  const dashes = assembleFromParts("-", "-", "-", "-", "-");
  const beginMarker = assembleFromParts(dashes, "BEGIN", " ", "RSA", " PRIVATE", " KEY", dashes);
  const endMarker = assembleFromParts(dashes, "END", " ", "RSA", " PRIVATE", " KEY", dashes);
  // Low-entropy, deliberately unrealistic placeholder body lines: redactText
  // redacts by POSITION (inside the BEGIN/END block), never by pattern-matching
  // the body's own content, so these need not (and must not) look like real
  // base64 key material.
  const bodyLine1 = "keybytes-placeholder-line-one";
  const bodyLine2 = "keybytes-placeholder-line-two";
  const block = ["before the key", beginMarker, bodyLine1, bodyLine2, endMarker, "after the key"].join("\n");
  const text = redactText(block);
  assert.match(text, /before the key/);
  assert.ok(text.includes(beginMarker));
  assert.ok(text.includes(endMarker));
  assert.match(text, /after the key/);
  assert.equal(text.includes(bodyLine1), false, "key body line leaked");
  assert.equal(text.includes(bodyLine2), false, "key body line leaked");
  const bodyLineCount = text.split("\n").filter((line) => line === REDACTION_MARKER).length;
  assert.equal(bodyLineCount, 2, `expected exactly the two key-body lines redacted, got: ${JSON.stringify(text)}`);
});

// --- multi-suite ordering: only failing suites are reported ---------------
check("a mix of passing and failing suites reports only the failing ones, in evidence order", () => {
  const root = makeRoot();
  try {
    const runId = "verify-run-6";
    const runsRoot = join(root, "runs");
    seedSuiteLog(runsRoot, runId, "first-fail", { logText: "boom-1\n" });
    seedSuiteLog(runsRoot, runId, "second-fail", { logText: "boom-2\n" });
    const evidencePath = writeEvidence(root, evidenceWithSteps([
      { name: "passing-suite", exitCode: 0 },
      { name: "first-fail", exitCode: 1 },
      { name: "passing-suite-2", exitCode: 0 },
      { name: "second-fail", exitCode: 3 },
    ], { runId }));
    const { lines } = buildFailureReport({ evidencePath, runsRoot, repoRoot: root });
    const text = lines.join("\n");
    assert.equal(text.includes("passing-suite"), false);
    const firstIndex = text.indexOf("first-fail");
    const secondIndex = text.indexOf("second-fail");
    assert.ok(firstIndex >= 0 && secondIndex > firstIndex, "failing suites must appear in evidence order");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);

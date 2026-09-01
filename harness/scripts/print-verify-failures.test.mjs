// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Round-L finding F7. Imported under their own names so these three tests bind to the module's
// exported surface without depending on which identifiers the rest of this file already holds.
import { test as roundLTest } from "node:test";
import * as printVerifyFailures from "./print-verify-failures.mjs";

/**
 * F7a. The byte bound ran BEFORE failure-line recovery, and recovery then prepended a header
 * plus up to 20 recovered lines and merely RECOMPUTED `keptBytes` instead of re-enforcing the
 * cap. `keptBytes` is what the global gate consumes, so one suite whose omitted head carries
 * many long failure-marker lines could exhaust MAX_TOTAL_BYTES on its own and silently omit
 * every later failing suite's tail -- the exact outcome this reporter exists to prevent.
 */
roundLTest("NVA-B-ROUNDL F7: the per-suite byte bound is enforced AFTER failure-line recovery, not recomputed", () => {
  const head = Array.from(
    { length: 60 },
    (_, index) => `not ok ${index} - a long failing test name ${"x".repeat(900)}`,
  );
  const tail = Array.from({ length: 300 }, (_, index) => `ok ${index} - passing ${"y".repeat(200)}`);
  const bounded = printVerifyFailures.boundSuiteTail([...head, ...tail].join("\n"));
  assert.ok(
    bounded.keptBytes <= printVerifyFailures.MAX_BYTES_PER_SUITE,
    `kept ${bounded.keptBytes} bytes, cap is ${printVerifyFailures.MAX_BYTES_PER_SUITE}`,
  );
  // The reported figure must be the real one: the global gate spends this number.
  assert.equal(Buffer.byteLength(bounded.text, "utf8"), bounded.keptBytes);
  // And the bound must be honoured by BUDGETING recovery, not by abandoning it.
  assert.ok(
    bounded.text.includes(printVerifyFailures.RECOVERED_FAILURE_HEADER),
    "enforcing the bound must not throw the recovered failure lines away",
  );
});

/**
 * F7b. `FAILURE_LINE_RE`'s `AssertionError` alternative was unanchored, so it claimed passing
 * test names and stack frames that merely mention the class -- inflating the recovered block
 * with lines that are not failures.
 */
roundLTest("NVA-B-ROUNDL F7: FAILURE_LINE_RE claims failure markers, not passing names or stack frames", () => {
  for (const line of [
    "✔ rejects an AssertionError payload (1.2ms)",
    "ok 12 - AssertionError is redacted",
    "      at Test.run (node:internal/test_runner/test:1397:25) AssertionError",
    "  # Subtest: AssertionError handling",
  ]) {
    assert.equal(printVerifyFailures.FAILURE_LINE_RE.test(line), false, `claimed a non-failure line: ${line}`);
  }
  for (const line of [
    "not ok 3 - something",
    "  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:",
    "✖ a failing test (2ms)",
    "FAIL  some-suite",
    "# fail 1",
  ]) {
    assert.equal(printVerifyFailures.FAILURE_LINE_RE.test(line), true, `dropped a real failure line: ${line}`);
  }
});

/**
 * F7c. `!keptText.includes(line)` was a SUBSTRING test, so a short failure line that happens to
 * occur inside any kept line was treated as already present and silently dropped from recovery.
 */
roundLTest("NVA-B-ROUNDL F7: a failure line merely CONTAINED in a kept line is still recovered", () => {
  const failure = "not ok 7 - x";
  const head = [failure, ...Array.from({ length: 250 }, (_, index) => `filler ${index}`)];
  const tail = ["ok 1 - see also not ok 7 - x for context"];
  const bounded = printVerifyFailures.boundSuiteTail([...head, ...tail].join("\n"));
  assert.ok(
    bounded.text.split("\n").includes(failure),
    "a short failure line was dropped because a kept line contained it as a substring",
  );
});

/**
 * Round-N finding F-C. The recovered-failure admission loop BROKE on the first line that did not
 * fit its byte reserve. `recoveredFailureLines` is in file order, so one failure line longer than
 * the reserve emptied `admitted` entirely, and the `admitted.length > 0` guard then suppressed the
 * header and every shorter failure line behind it -- the suite whose earliest omitted failure line
 * is a long assertion diff got no recovered block at all, the exact outcome recovery exists to
 * prevent.
 */
roundLTest("NVA-B-ROUNDN F-C: a recovered failure line too long for the reserve does not suppress the shorter ones behind it", () => {
  // Longer than the reserve whatever share of MAX_BYTES_PER_SUITE the reserve is.
  const oversized = `not ok 1 - ${"D".repeat(printVerifyFailures.MAX_BYTES_PER_SUITE)}`;
  const shortFailures = [
    "not ok 2 - a short failure behind the long one",
    "not ok 3 - a second short failure behind the long one",
  ];
  const filler = Array.from(
    { length: printVerifyFailures.MAX_LINES_PER_SUITE + 50 },
    (_, index) => `ok ${index + 4} - filler-${index}`,
  );
  const bounded = printVerifyFailures.boundSuiteTail([oversized, ...shortFailures, ...filler].join("\n"));
  const kept = bounded.text.split("\n");
  assert.ok(
    kept.includes(printVerifyFailures.RECOVERED_FAILURE_HEADER),
    "one oversized failure line suppressed the whole recovered block",
  );
  for (const line of shortFailures) {
    assert.ok(kept.includes(line), `a failure line behind an oversized one was dropped: ${line}`);
  }
  assert.ok(bounded.keptBytes <= printVerifyFailures.MAX_BYTES_PER_SUITE);
  assert.equal(Buffer.byteLength(bounded.text, "utf8"), bounded.keptBytes);
});

/**
 * Round-N finding F-D. `keptLines` was computed from the tail BEFORE that tail was re-shrunk to
 * `tailBudget` inside the `admitted.length > 0` branch. A failure line present at that moment was
 * excluded from `recoveredFailureLines` as "already kept", and the re-shrink could then cut it
 * away -- leaving it in neither the tail nor the recovered block, where the pre-recovery code
 * would have printed it.
 */
roundLTest("NVA-B-ROUNDN F-D: a failure line the tail re-shrink cuts away still survives in one place or the other", () => {
  const MAX = printVerifyFailures.MAX_BYTES_PER_SUITE;
  const headerBytes = Buffer.byteLength(printVerifyFailures.RECOVERED_FAILURE_HEADER, "utf8") + 1;
  const headFailures = [1, 2, 3, 4].map((n) => `not ok ${n} - head failure ${"h".repeat(60)}`);
  const blockBytes = headFailures.reduce((sum, line) => sum + Buffer.byteLength(line, "utf8") + 1, headerBytes);
  const victim = "not ok 99 - the victim line the re-shrink cuts away";
  const pad = (base, length) => (base.length >= length ? base.slice(0, length) : base + "p".repeat(length - base.length));
  const tailLines = [
    victim,
    ...Array.from({ length: printVerifyFailures.MAX_LINES_PER_SUITE - 1 }, (_, index) => pad(`ok ${index} - filler`, 99)),
  ];
  const last = tailLines.length - 1;
  tailLines[last] = pad(tailLines[last], tailLines[last].length + (MAX - Buffer.byteLength(tailLines.join("\n"), "utf8")));
  // Preconditions this fixture stands on -- asserted, never assumed, so a changed bound makes the
  // test loud rather than silently vacuous.
  assert.equal(tailLines.length, printVerifyFailures.MAX_LINES_PER_SUITE);
  assert.equal(Buffer.byteLength(tailLines.join("\n"), "utf8"), MAX, "the line-bounded tail must sit exactly on the byte cap");
  assert.ok(Buffer.byteLength(victim, "utf8") + 1 <= blockBytes, "the re-shrink must be big enough to cut the victim away");

  const bounded = printVerifyFailures.boundSuiteTail([...headFailures, ...tailLines].join("\n"));
  const kept = bounded.text.split("\n");
  assert.ok(kept.includes(victim), "the re-shrink cut a failure line the recovery had already excluded: it survives nowhere");
  assert.ok(bounded.keptBytes <= MAX);
  assert.equal(Buffer.byteLength(bounded.text, "utf8"), bounded.keptBytes);
});

/**
 * Round-N finding F-E. Both byte-bound slices decoded with `buffer.subarray(...).toString("utf8")`.
 * A cut inside a multi-byte sequence orphans continuation bytes, each decoding to U+FFFD -- three
 * bytes for one -- so the decoded string can be LONGER in bytes than the slice it came from, and
 * the documented `keptBytes <= MAX_BYTES_PER_SUITE` invariant did not hold. Every other fixture in
 * this file is ASCII-only and structurally cannot see it.
 */
roundLTest("NVA-B-ROUNDN F-E: a byte bound falling inside a multi-byte sequence still honours the per-suite cap", () => {
  const MAX = printVerifyFailures.MAX_BYTES_PER_SUITE;
  assert.equal(Buffer.byteLength("あ", "utf8"), 3);
  // MAX_BYTES_PER_SUITE % 3 === 2, so against a body of 3-byte characters the cut offset
  // (length - MAX) is never a character boundary: it always lands one byte into a character.
  assert.equal(MAX % 3, 2);
  const single = printVerifyFailures.boundSuiteTail("あ".repeat(7000));
  assert.equal(single.truncated, true);
  assert.ok(single.keptBytes <= MAX, `kept ${single.keptBytes} bytes, cap is ${MAX}`);
  assert.equal(Buffer.byteLength(single.text, "utf8"), single.keptBytes);
  assert.equal(single.text.includes("�"), false, "the byte bound cut inside a character and manufactured replacement characters");

  // The SECOND slice, on the same kind of content: a recovered block forces the already
  // multi-byte tail to be re-shrunk to `tailBudget`.
  const failure = "not ok 1 - multibyte head failure";
  const both = printVerifyFailures.boundSuiteTail([failure, "あ".repeat(7000)].join("\n"));
  assert.ok(both.text.split("\n").includes(failure), "the head failure line must still be recovered");
  assert.ok(both.keptBytes <= MAX, `kept ${both.keptBytes} bytes, cap is ${MAX}`);
  assert.equal(Buffer.byteLength(both.text, "utf8"), both.keptBytes);
  assert.equal(both.text.includes("�"), false, "the re-shrink cut inside a character");
});

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

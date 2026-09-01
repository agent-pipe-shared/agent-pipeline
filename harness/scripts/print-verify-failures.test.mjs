// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
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

import {
  MAX_EVIDENCE_BYTES,
  MAX_PRIVATE_LOG_BYTES,
  PUBLIC_FAILURE_SCHEMA,
  PUBLIC_NOTICE_SCHEMA,
  REDACTION_MARKER,
  buildFailureReport,
  loadPublicSuiteInventory,
  runFailureReporter,
  verifySuiteArtifactName,
} from "./print-verify-failures.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "verify-public-report-"));
  const evidencePath = join(root, "evidence", "verify-latest.json");
  const runsRoot = join(root, "runs");
  const verifySourcePath = join(root, "verify.mjs");
  mkdirSync(join(root, "evidence"), { recursive: true });
  mkdirSync(runsRoot, { recursive: true });
  writeFileSync(verifySourcePath, [
    "const SCOPED_VERIFY_SUITES = Object.freeze([",
    "]);",
    "const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([",
    "]);",
    "const TEST_SUITES = [",
    '  { name: "unit-tests" },',
    '  { name: "security-tests" },',
    "];",
    "const PHASE_STEPS =",
    "  [];",
    "",
    "// pipeline.verify-manual-check-placeholder-detection",
  ].join("\n"));
  return { root, evidencePath, runsRoot, verifySourcePath };
}

function evidence(steps, runId = "run-1") {
  return { schema: "pipeline.verify-evidence.v0", steps, verifyRun: runId === null ? null : { runId } };
}

function seedLog(value, suite, content, runId = "run-1", receiptLogPath = null) {
  const artifact = verifySuiteArtifactName(suite);
  const run = join(value.runsRoot, runId);
  mkdirSync(join(run, "receipts"), { recursive: true });
  mkdirSync(join(run, "logs"), { recursive: true });
  const expected = `logs/${artifact}.log`;
  writeFileSync(join(run, "receipts", `${artifact}.json`), JSON.stringify({ log: { path: receiptLogPath ?? expected } }));
  writeFileSync(join(run, "logs", `${artifact}.log`), content);
}

function parsed(result) {
  return result.lines.map((entry) => JSON.parse(entry));
}

check("public failure contains only the positive allow-list and a digest reference", () => {
  const value = fixture();
  try {
    const privateLog = Buffer.from("private assertion and operator context\n");
    seedLog(value, "unit-tests", privateLog);
    writeFileSync(value.evidencePath, JSON.stringify(evidence([{ name: "unit-tests", exitCode: 3, durationMs: 91, reused: false }])));
    const [record] = parsed(buildFailureReport(value));
    assert.deepEqual(record, {
      schema: PUBLIC_FAILURE_SCHEMA,
      kind: "verify-suite",
      suite: "unit-tests",
      status: "failed",
      exitCode: 3,
      attribution: { source: "verify-evidence", stepIndex: 0 },
      privateEvidence: { availability: "available", referenceKind: "sha256", sha256: sha256(privateLog) },
      detail: REDACTION_MARKER,
    });
    assert.equal(JSON.stringify(record).includes("private assertion"), false);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("raw log values never cross the public boundary", () => {
  const value = fixture();
  try {
    const canaries = [
      "password=plain-text-value",
      "/home/operator/private/project/file.mjs",
      "operator@example.invalid",
      "session-correlation-987654",
      "arbitrary unclassified prose",
    ];
    seedLog(value, "security-tests", Buffer.from(canaries.join("\n")));
    writeFileSync(value.evidencePath, JSON.stringify(evidence([{ name: "security-tests", exitCode: 1 }])));
    const output = buildFailureReport(value).lines.join("\n");
    for (const canary of canaries) assert.equal(output.includes(canary), false, canary);
    assert.match(output, /\[REDACTED-UNCLASSIFIED\]/u);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("syntactically valid token or PII shaped names are not public without inventory authority", () => {
  const value = fixture();
  try {
    for (const unsafe of ["passwordtokenabc123", "andre-private-suite", "sessioncorrelation987654"]) {
      writeFileSync(value.evidencePath, JSON.stringify(evidence([{ name: unsafe, exitCode: 1 }])));
      const output = buildFailureReport(value).lines.join("\n");
      assert.equal(output.includes(unsafe), false);
      assert.deepEqual(JSON.parse(output), {
        schema: PUBLIC_NOTICE_SCHEMA,
        kind: "reporter-notice",
        code: "PVF-EVIDENCE-SHAPE",
        detail: REDACTION_MARKER,
      });
    }
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("duplicate suite rows fail closed before they can consume the public record budget", () => {
  const value = fixture();
  try {
    writeFileSync(value.evidencePath, JSON.stringify(evidence([
      { name: "unit-tests", exitCode: 1 },
      { name: "unit-tests", exitCode: 2 },
    ])));
    assert.deepEqual(parsed(buildFailureReport(value))[0], {
      schema: PUBLIC_NOTICE_SCHEMA,
      kind: "reporter-notice",
      code: "PVF-EVIDENCE-SHAPE",
      detail: REDACTION_MARKER,
    });
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("missing or ambiguous repository suite inventory fails closed with visible redaction", () => {
  const value = fixture();
  try {
    writeFileSync(value.verifySourcePath, 'const TEST_SUITES = [{ name: "unit-tests" }];\n');
    writeFileSync(value.evidencePath, JSON.stringify(evidence([{ name: "unit-tests", exitCode: 1 }])));
    assert.equal(loadPublicSuiteInventory(value.verifySourcePath), null);
    assert.deepEqual(parsed(buildFailureReport(value))[0], {
      schema: PUBLIC_NOTICE_SCHEMA,
      kind: "reporter-notice",
      code: "PVF-SUITE-INVENTORY-UNAVAILABLE",
      detail: REDACTION_MARKER,
    });
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("missing and malformed evidence use fixed notices without paths or parser messages", () => {
  const value = fixture();
  try {
    assert.equal(parsed(buildFailureReport(value))[0].code, "PVF-EVIDENCE-UNAVAILABLE");
    writeFileSync(value.evidencePath, "{ private parser canary");
    const output = buildFailureReport(value).lines.join("\n");
    assert.equal(JSON.parse(output).code, "PVF-EVIDENCE-INVALID");
    assert.match(output, /\[REDACTED-UNCLASSIFIED\]/u);
    assert.equal(output.includes("private parser canary"), false);
    assert.equal(output.includes(value.root), false);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("oversized evidence is unavailable without reading or echoing it", () => {
  const value = fixture();
  try {
    writeFileSync(value.evidencePath, "x".repeat(MAX_EVIDENCE_BYTES + 1));
    assert.equal(parsed(buildFailureReport(value))[0].code, "PVF-EVIDENCE-UNAVAILABLE");
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("oversized private logs are not read for a public digest", () => {
  const value = fixture();
  try {
    seedLog(value, "unit-tests", Buffer.from("placeholder"));
    const artifact = verifySuiteArtifactName("unit-tests");
    truncateSync(join(value.runsRoot, "run-1", "logs", `${artifact}.log`), MAX_PRIVATE_LOG_BYTES + 1);
    writeFileSync(value.evidencePath, JSON.stringify(evidence([{ name: "unit-tests", exitCode: 1 }])));
    assert.deepEqual(parsed(buildFailureReport(value))[0].privateEvidence, { availability: "unavailable" });
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("missing private evidence stays explicit and does not reveal the run identifier", () => {
  const value = fixture();
  try {
    const privateRunId = "private-session-123";
    writeFileSync(value.evidencePath, JSON.stringify(evidence([{ name: "unit-tests", exitCode: 1 }], privateRunId)));
    const output = buildFailureReport(value).lines.join("\n");
    assert.deepEqual(JSON.parse(output).privateEvidence, { availability: "unavailable" });
    assert.equal(output.includes(privateRunId), false);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("a forged receipt path is neither followed nor published", () => {
  const value = fixture();
  try {
    const canary = "outside private canary";
    writeFileSync(join(value.root, "outside.log"), canary);
    seedLog(value, "unit-tests", Buffer.from("ordinary"), "run-1", "../../outside.log");
    writeFileSync(value.evidencePath, JSON.stringify(evidence([{ name: "unit-tests", exitCode: 1 }])));
    const output = buildFailureReport(value).lines.join("\n");
    assert.deepEqual(JSON.parse(output).privateEvidence, { availability: "invalid" });
    assert.equal(output.includes(canary), false);
    assert.equal(output.includes("../../outside.log"), false);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("a symlinked private log is not read", () => {
  const value = fixture();
  try {
    const suite = "unit-tests";
    const artifact = verifySuiteArtifactName(suite);
    seedLog(value, suite, Buffer.from("replace me"));
    rmSync(join(value.runsRoot, "run-1", "logs", `${artifact}.log`));
    writeFileSync(join(value.root, "outside.log"), "symlink canary");
    symlinkSync(join(value.root, "outside.log"), join(value.runsRoot, "run-1", "logs", `${artifact}.log`));
    writeFileSync(value.evidencePath, JSON.stringify(evidence([{ name: suite, exitCode: 1 }])));
    const output = buildFailureReport(value).lines.join("\n");
    assert.deepEqual(JSON.parse(output).privateEvidence, { availability: "unavailable" });
    assert.equal(output.includes("symlink canary"), false);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

check("unexpected reporter errors disclose a fixed non-gating marker", () => {
  const secret = "internal error carried a private token";
  const result = runFailureReporter({
    resolvePaths: () => ({ repoRoot: "/unused", gitCommonDir: "/unused/.git" }),
    build: () => { throw new Error(secret); },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.complete, false);
  const output = result.lines.join("\n");
  assert.deepEqual(JSON.parse(output), {
    schema: PUBLIC_NOTICE_SCHEMA,
    kind: "reporter-notice",
    code: "PVF-REPORTER-FAILED",
    status: "incomplete",
    detail: REDACTION_MARKER,
  });
  assert.equal(output.includes(secret), false);
});

check("no failures emits a fixed typed completion notice", () => {
  const value = fixture();
  try {
    writeFileSync(value.evidencePath, JSON.stringify(evidence([{ name: "unit-tests", exitCode: 0 }])));
    assert.deepEqual(parsed(buildFailureReport(value))[0], {
      schema: PUBLIC_NOTICE_SCHEMA,
      kind: "reporter-notice",
      code: "PVF-NO-FAILURES",
      status: "complete",
      failingSuites: 0,
    });
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);

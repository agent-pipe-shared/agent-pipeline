#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * semgrep.test.mjs -- regression coverage for semgrep.mjs's CAPABILITY_CONTRACT_V2
 * descriptor (CYB-2D). Pure shape/value assertions on the new, additive, frozen data
 * descriptor, plus fixture-spawn pins (SEM-T) of run()'s degraded-coverage handling of
 * semgrep partial-parsing warnings (the rest of run()/isInstalled() stays covered by
 * security-scan.test.mjs).
 *
 * Run:  node --test plugins/pipeline-core/scripts/security-adapters/semgrep.test.mjs
 * Exit: 0 = all cases pass, non-zero = at least one case failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { name, CAPABILITY_CONTRACT_V2, run } from "./semgrep.mjs";

// ---------------------------------------------------------------------------
// SEM-T -- partial-parsing warnings are degraded coverage, not a scanner error.
//
// Pins PO decision 2026-10-06 "Semgrep", option "B: Warnung = Hinweis (Recommended)",
// verbatim: "`level: warn` partial-parsing entries become degraded coverage with a visible
// coverage note and keep the results; `error` entries and timeouts stay `scanner_error`."
//
// Rule under test: degraded ONLY when EVERY errors[] entry has `level === "warn"` AND a type
// naming `PartialParsing` (semgrep encodes `type` as a string or as an array whose first
// element is the name). Any other level, any other type (including Timeout) or an unreadable
// shape keeps the whole result `scanner_error`. Result stays PASS/FINDINGS exactly as today
// and gains `coverage: { status: "degraded", reason: "partial-parsing", files: [...] }` with
// paths relative to the scan root, never absolute. The separator inside a relative path is
// deliberately not pinned (compared after `\` -> `/`); relative-ness is.
//
// RED BY DESIGN: cases (a) and (b) fail against today's semgrep.mjs (it turns any non-empty
// errors[] into scanner_error); (c)-(i) pin behaviour that must stay and pass today. No real
// semgrep is spawned: spawnFn is an in-memory fixture, `config.binaryPath` skips PATH lookup.
//
// Fixture shape: the errors[] entry is modelled on one real entry captured on this host
// (semgrep 1.172.0, `--json`, one real file whose regex literal `/<!--[\s\S]*?-->/g` the JS
// parser rejects): { code: 3, level: "warn", type: ["PartialParsing", [{path,start,end}]],
// message, path, spans: [{file,start,end}] }, redacted to a placeholder message. The warn-level
// Timeout entry shape and the other degraded-ineligible shapes are MODELLED, not captured.
// ---------------------------------------------------------------------------
const SCAN_ROOT = path.resolve("semgrep-fixture-scan-root");
const FIXTURE_FILE = ["harness", "scripts", "check-product-capability-inventory.mjs"];
const FIXTURE_FILE_REPO_RELATIVE = FIXTURE_FILE.join("/");
const FIXTURE_RULE = "fixture.sem-t-sample-push-call";
const ENTRY_SPAN = { start: { line: 582, col: 36, offset: 0 }, end: { line: 583, col: 8, offset: 32 } };

function partialParsingEntry({ file, level = "warn", typeForm = "array" }) {
  return {
    code: 3,
    level,
    type: typeForm === "array" ? ["PartialParsing", [{ path: file, ...ENTRY_SPAN }]] : "PartialParsing",
    message: "Syntax error at line <file>:582:\n `/<!--[\\s\\S]*?-->/g, \"\");\n  const` was unexpected",
    path: file,
    spans: [{ file, ...ENTRY_SPAN }],
  };
}

function semgrepResult(file) {
  return {
    check_id: FIXTURE_RULE,
    path: file,
    start: { line: 592, col: 25, offset: 31994 },
    end: { line: 592, col: 41, offset: 32010 },
    extra: {
      message: "sem-t fixture finding",
      metadata: {},
      severity: "WARNING",
      fingerprint: "requires login",
      lines: "requires login",
      validation_state: "NO_VALIDATOR",
      engine_kind: "OSS",
    },
  };
}

async function runFixture(body) {
  let spawned = 0;
  const result = await run({
    rootDir: SCAN_ROOT,
    config: { binaryPath: "semgrep-fixture-binary" },
    timeoutMs: 5000,
    spawnFn: () => {
      spawned += 1;
      return { status: 0, stdout: JSON.stringify(body), stderr: "" };
    },
  });
  assert.equal(spawned, 1, "the injected spawnFn must be the only process boundary");
  return result;
}

function assertDegradedCoverage(result, expectedFiles) {
  assert.ok(result.coverage, "result.coverage is missing: a warn-level PartialParsing entry must surface as degraded coverage");
  assert.equal(result.coverage.status, "degraded");
  assert.equal(result.coverage.reason, "partial-parsing");
  assert.ok(Array.isArray(result.coverage.files), "coverage.files must be an array");
  for (const file of result.coverage.files) {
    assert.equal(typeof file, "string");
    assert.equal(path.posix.isAbsolute(file) || path.win32.isAbsolute(file), false, `coverage.files must be scan-root-relative, got: ${file}`);
    assert.equal(file.includes(SCAN_ROOT), false, `coverage.files must not embed the scan root, got: ${file}`);
  }
  assert.deepEqual(result.coverage.files.map((file) => file.replaceAll("\\", "/")), expectedFiles);
}

function assertScannerError(result) {
  assert.equal(result.status, "ERROR");
  assert.equal(result.classification, "scanner_error");
  assert.deepEqual(result.findings, []);
}

test("SEM-T (a): exit 0 + one finding + one warn/PartialParsing entry (array type, absolute path) -> FINDINGS kept, coverage degraded, file named repo-relative", async () => {
  const absolute = path.join(SCAN_ROOT, ...FIXTURE_FILE);
  const result = await runFixture({
    version: "1.172.0",
    results: [semgrepResult(absolute)],
    errors: [partialParsingEntry({ file: absolute, typeForm: "array" })],
    paths: { scanned: [absolute] },
  });
  assert.equal(result.status, "FINDINGS");
  assert.equal(result.classification, "findings");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule, FIXTURE_RULE);
  assert.equal(result.findings[0].severity, "medium");
  assertDegradedCoverage(result, [FIXTURE_FILE_REPO_RELATIVE]);
});

test("SEM-T (b): exit 0 + zero findings + one warn/PartialParsing entry (string type, relative path) -> PASS with degraded coverage", async () => {
  const relative = path.join(...FIXTURE_FILE);
  const result = await runFixture({
    version: "1.172.0",
    results: [],
    errors: [partialParsingEntry({ file: relative, typeForm: "string" })],
    paths: { scanned: [relative] },
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.classification, "success");
  assert.equal(result.findings.length, 0);
  assertDegradedCoverage(result, [FIXTURE_FILE_REPO_RELATIVE]);
});

test("SEM-T (c): an error-level entry (even of type PartialParsing) stays ERROR/scanner_error", async () => {
  const absolute = path.join(SCAN_ROOT, ...FIXTURE_FILE);
  const result = await runFixture({
    version: "1.172.0",
    results: [semgrepResult(absolute)],
    errors: [partialParsingEntry({ file: absolute, level: "error" })],
    paths: { scanned: [absolute] },
  });
  assertScannerError(result);
});

test("SEM-T (d): a warn-level Timeout entry stays ERROR/scanner_error", async () => {
  const absolute = path.join(SCAN_ROOT, ...FIXTURE_FILE);
  const result = await runFixture({
    version: "1.172.0",
    results: [semgrepResult(absolute)],
    errors: [{
      code: 3,
      level: "warn",
      type: "Timeout",
      rule_id: FIXTURE_RULE,
      message: "Timeout when running <rule> on <file>",
      path: absolute,
      spans: [{ file: absolute, ...ENTRY_SPAN }],
    }],
    paths: { scanned: [absolute] },
  });
  assertScannerError(result);
});

test("SEM-T (e): warn/PartialParsing mixed with an error-level entry stays ERROR/scanner_error", async () => {
  const absolute = path.join(SCAN_ROOT, ...FIXTURE_FILE);
  const other = path.join(SCAN_ROOT, "plugins", "pipeline-core", "lib", "other-fixture-file.mjs");
  const result = await runFixture({
    version: "1.172.0",
    results: [semgrepResult(absolute)],
    errors: [
      partialParsingEntry({ file: absolute, level: "warn" }),
      partialParsingEntry({ file: other, level: "error" }),
    ],
    paths: { scanned: [absolute, other] },
  });
  assertScannerError(result);
});

test("SEM-T (f): a non-array errors stays ERROR/scanner_error (existing behaviour kept)", async () => {
  const result = await runFixture({ version: "1.172.0", results: [], errors: {}, paths: { scanned: [] } });
  assertScannerError(result);
});

const UNELIGIBLE_ENTRIES = [
  ["warn level with another type (LexicalError)", { code: 3, level: "warn", type: "LexicalError", message: "<redacted>", path: path.join(...FIXTURE_FILE) }],
  ["warn level with the array-encoded Timeout type", { code: 3, level: "warn", type: ["Timeout", FIXTURE_RULE], message: "<redacted>", path: path.join(...FIXTURE_FILE) }],
  ["warn level with no type at all", { code: 3, level: "warn", message: "<redacted>", path: path.join(...FIXTURE_FILE) }],
  ["PartialParsing type with no level (unreadable shape)", { code: 3, type: ["PartialParsing", []], message: "<redacted>", path: path.join(...FIXTURE_FILE) }],
  ["a null entry (unreadable shape)", null],
  ["a string entry (unreadable shape)", "PartialParsing"],
];
for (const [label, entry] of UNELIGIBLE_ENTRIES) {
  test(`SEM-T (g): ${label} stays ERROR/scanner_error`, async () => {
    const result = await runFixture({ version: "1.172.0", results: [], errors: [entry], paths: { scanned: [] } });
    assertScannerError(result);
  });
}

// ---------------------------------------------------------------------------
// SEM-T2 -- pins for two review findings on the degraded-coverage change (b765974b0 / 28eac0677).
//
// S2 (out-of-root paths): `scanRootRelativePath` must return null -- so the whole entry is a
// scanner_error -- for a path that is not under the scan root, including the win32 flavours a
// host `relative()` happily "relativises": a UNC path and an extended-length path. The function
// is module-private and takes no injectable path module, so the two win32 flavours can only be
// observed through run() on a win32 host; they are SKIPPED (visibly, with this reason) elsewhere.
// The missing-path case is platform-neutral and always runs. RED BY DESIGN on win32: today both
// win32 flavours come back as a degraded-coverage file named "server/share/x.mjs" / "?/D:/other/x.mjs".
//
// S4 (descriptor honesty): the exit-zero entry of CAPABILITY_CONTRACT_V2.exitCodeMapping (key
// `completed`; the briefing called it "zero", no such key exists) says an errors[]-free body is
// "the only" completed scan and so contradicts the `partialParsing` key beside it. RED BY DESIGN.
// ---------------------------------------------------------------------------
const WIN32_ONLY_SKIP = process.platform === "win32"
  ? false
  : `win32-only: UNC/extended-length semantics need the host win32 path module (scanRootRelativePath has no injectable path module); skipped on ${process.platform}`;
const OUT_OF_ROOT_ENTRIES = [
  ["warn PartialParsing with no path at all (missing path)", { code: 3, level: "warn", type: ["PartialParsing", []], message: "<redacted>" }, false],
  ["warn PartialParsing naming a UNC path (\\\\server\\share\\x.mjs)", partialParsingEntry({ file: "\\\\server\\share\\x.mjs" }), WIN32_ONLY_SKIP],
  ["warn PartialParsing naming an extended-length path (\\\\?\\D:\\other\\x.mjs)", partialParsingEntry({ file: "\\\\?\\D:\\other\\x.mjs" }), WIN32_ONLY_SKIP],
];
for (const [label, entry, skip] of OUT_OF_ROOT_ENTRIES) {
  test(`SEM-T2 (S2): ${label} stays ERROR/scanner_error`, { skip }, async () => {
    const result = await runFixture({ version: "1.172.0", results: [], errors: [entry], paths: { scanned: [] } });
    assertScannerError(result);
    assert.equal(result.coverage, undefined, "an out-of-root path must never surface as degraded coverage");
  });
}

test("SEM-T2 (S4): CAPABILITY_CONTRACT_V2.exitCodeMapping's exit-zero entry names the warn-level partial-parsing exception it would otherwise contradict", () => {
  const mapping = CAPABILITY_CONTRACT_V2.exitCodeMapping;
  assert.equal(typeof mapping.partialParsing, "string", "the partialParsing key is the settled behaviour this test measures the exit-zero entry against");
  assert.equal(Object.hasOwn(mapping, "completed"), true, "the exit-zero entry is keyed `completed`");
  for (const key of ["completed", "zero"]) {
    if (Object.hasOwn(mapping, key)) {
      assert.match(mapping[key], /partial/i, `exitCodeMapping.${key} says an error-free body is the only completed scan without naming the warn-level partial-parsing exception`);
    }
  }
});

test("SEM-T (h): a clean run with an empty errors[] stays PASS with no degraded coverage", async () => {
  const result = await runFixture({ version: "1.172.0", results: [], errors: [], paths: { scanned: [] } });
  assert.equal(result.status, "PASS");
  assert.equal(result.classification, "success");
  assert.equal(result.findings.length, 0);
  assert.notEqual(result.coverage?.status, "degraded");
});

test("CAPABILITY_CONTRACT_V2 exists and is frozen", () => {
  assert.ok(CAPABILITY_CONTRACT_V2, "CAPABILITY_CONTRACT_V2 export is missing");
  assert.equal(Object.isFrozen(CAPABILITY_CONTRACT_V2), true);
});

test("CAPABILITY_CONTRACT_V2 fixed top-level fields match the documented v2 contract", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.contractVersion, "v2");
  assert.equal(CAPABILITY_CONTRACT_V2.kind, "capability");
  assert.equal(CAPABILITY_CONTRACT_V2.capabilityId, "cap.sast");
  assert.equal(CAPABILITY_CONTRACT_V2.controlRef, null);
  assert.equal(CAPABILITY_CONTRACT_V2.supportedEcosystems, null);
  assert.equal(CAPABILITY_CONTRACT_V2.toolVersionConstraint, null);
  assert.deepEqual(CAPABILITY_CONTRACT_V2.requiredInputs, ["rootDir"]);
  assert.equal(CAPABILITY_CONTRACT_V2.confidenceNormalization, null);
});

test("CAPABILITY_CONTRACT_V2.tool tracks the real `name` export, not a hardcoded duplicate string", () => {
  assert.equal(name, "semgrep");
  assert.equal(CAPABILITY_CONTRACT_V2.tool, name);
});

test("CAPABILITY_CONTRACT_V2.supportedEcosystems is an honest null + explanatory note (no invented ecosystem list)", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.supportedEcosystems, null);
  assert.equal(typeof CAPABILITY_CONTRACT_V2.supportedEcosystemsNote, "string");
  assert.match(CAPABILITY_CONTRACT_V2.supportedEcosystemsNote, /language\/rule-scoped/);
});

test("CAPABILITY_CONTRACT_V2.networkBehavior is honestly conditional on config.rulesDir, not a single unconditional value", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.networkBehavior, "network-optional");
  assert.equal(typeof CAPABILITY_CONTRACT_V2.networkBehaviorNote, "string");
  assert.match(CAPABILITY_CONTRACT_V2.networkBehaviorNote, /offline when config\.rulesDir/);
  assert.match(CAPABILITY_CONTRACT_V2.networkBehaviorNote, /'auto' fallback/);
  assert.match(CAPABILITY_CONTRACT_V2.networkBehaviorNote, /does not itself control or guarantee/);
});

test("CAPABILITY_CONTRACT_V2.requiredInputsNote documents config.rulesDir as optional with the real \"auto\" fallback", () => {
  assert.equal(typeof CAPABILITY_CONTRACT_V2.requiredInputsNote, "string");
  assert.match(CAPABILITY_CONTRACT_V2.requiredInputsNote, /config\.rulesDir is optional/);
  assert.match(CAPABILITY_CONTRACT_V2.requiredInputsNote, /"auto"/);
});

test("CAPABILITY_CONTRACT_V2.severityNormalization faithfully transcribes the real three-tier mapSemgrepSeverity() rule", () => {
  const sev = CAPABILITY_CONTRACT_V2.severityNormalization;
  assert.equal(sev.source, "extra.severity");
  assert.deepEqual(sev.mapping, { ERROR: "high", WARNING: "medium", INFO: "info" });
  assert.equal(sev.fallback.value, "medium");
  assert.match(sev.fallback.rule, /never silently dropped/);
  assert.match(sev.fallback.rule, /never crashes/);
});

test("CAPABILITY_CONTRACT_V2.coverageLimitations is a non-empty array of factual, code-grounded strings", () => {
  assert.ok(Array.isArray(CAPABILITY_CONTRACT_V2.coverageLimitations));
  assert.ok(CAPABILITY_CONTRACT_V2.coverageLimitations.length >= 1);
  for (const entry of CAPABILITY_CONTRACT_V2.coverageLimitations) {
    assert.equal(typeof entry, "string");
    assert.ok(entry.length > 0);
  }
  const joined = CAPABILITY_CONTRACT_V2.coverageLimitations.join(" ");
  assert.match(joined, /active rule set/);
  assert.match(joined, /'auto' registry mode/);
});

test("CAPABILITY_CONTRACT_V2.exitCodeMapping transcribes the real fail-closed exit-code/body policy", () => {
  const m = CAPABILITY_CONTRACT_V2.exitCodeMapping;
  assert.match(m.completed, /zero child exit/);
  assert.match(m.completed, /results\[\] array/);
  assert.match(m.completed, /no error payload/);
  assert.match(m.nonzero, /scanner_error/);
  assert.match(m.errorPayload, /scanner_error/);
  assert.match(m.errorPayload, /errors\[\] array/);
  assert.match(m.missingResults, /scanner_error/);
  assert.match(m.missingResults, /even if stdout otherwise looks like a clean report/);
});

test("CAPABILITY_CONTRACT_V2.timeoutContract matches run()'s real default and mechanism", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.defaultMs, 60000);
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.cancellable, true);
  assert.match(CAPABILITY_CONTRACT_V2.timeoutContract.mechanism, /spawnSync/);
  assert.match(CAPABILITY_CONTRACT_V2.timeoutContract.mechanism, /ETIMEDOUT/);
});

test("CAPABILITY_CONTRACT_V2.evidenceFields matches the real findings.map(...) object shape (same shape as gitleaks)", () => {
  assert.deepEqual(CAPABILITY_CONTRACT_V2.evidenceFields, ["tool", "severity", "rule", "path", "line", "msg"]);
});

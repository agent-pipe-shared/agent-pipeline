#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-suite-registration.test.mjs -- covers the PURE comparison/parsing functions of
 * check-suite-registration.mjs with synthetic inputs. No real filesystem walk and no real
 * verify.mjs read: `parseRegisteredSuiteFiles`/`parseTestSuitesBlock` (and, since
 * NVA-SUITEREGSCOPE-1, `parseScopedVerifySuiteFiles`/`parseScopedVerifySuitesBlock`,
 * `parseWindowsAssuranceVerifySuiteFiles`/`parseWindowsAssuranceVerifySuitesBlock`, and
 * `parseAllRegisteredSuiteFiles`) are exercised against a synthetic source snippet carrying
 * all three registration-array shapes, and `compareSuiteRegistration` against synthetic
 * enumerated/registered/opt-out sets. The real repo-state run (real filesystem, real
 * verify.mjs) is exercised separately, by hand, as this dispatch's DoD evidence -- not by
 * this suite.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  compareSuiteRegistration,
  normalizeRepoRelativePath,
  parseAllRegisteredSuiteFiles,
  parseRegisteredSuiteFiles,
  parseScopedVerifySuiteFiles,
  parseScopedVerifySuitesBlock,
  parseTestSuitesBlock,
  parseWindowsAssuranceVerifySuiteFiles,
  parseWindowsAssuranceVerifySuitesBlock,
  validateOptOutEntries,
} from "./check-suite-registration.mjs";

test("compareSuiteRegistration: a fully-covered set passes", () => {
  const result = compareSuiteRegistration({
    enumeratedPaths: ["plugins/pipeline-core/lib/a.test.mjs", "harness/scripts/b.test.mjs"],
    registeredPaths: ["plugins/pipeline-core/lib/a.test.mjs", "harness/scripts/b.test.mjs", "some/other/registered-but-not-enumerated.mjs"],
    optOut: [],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.unaccounted, []);
  assert.deepEqual(result.invalidOptOut, []);
});

test("compareSuiteRegistration: an unregistered-and-unlisted file fails and is named", () => {
  const result = compareSuiteRegistration({
    enumeratedPaths: ["plugins/pipeline-core/lib/a.test.mjs", "plugins/pipeline-core/lib/rogue.test.mjs"],
    registeredPaths: ["plugins/pipeline-core/lib/a.test.mjs"],
    optOut: [],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unaccounted, ["plugins/pipeline-core/lib/rogue.test.mjs"]);
});

test("compareSuiteRegistration: an opt-out entry without a reason is rejected as a usage error and does NOT silently suppress the finding", () => {
  const result = compareSuiteRegistration({
    enumeratedPaths: ["plugins/pipeline-core/lib/rogue.test.mjs"],
    registeredPaths: [],
    optOut: [{ path: "plugins/pipeline-core/lib/rogue.test.mjs", reason: "" }],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unaccounted, ["plugins/pipeline-core/lib/rogue.test.mjs"], "a bare path with no reason must not silently pass");
  assert.equal(result.invalidOptOut.length, 1);
  assert.equal(result.invalidOptOut[0].code, "OPT-OUT-REASON-MISSING");
});

test("compareSuiteRegistration: an opt-out entry WITH a reason suppresses the finding", () => {
  const result = compareSuiteRegistration({
    enumeratedPaths: ["plugins/pipeline-core/lib/deliberately-unregistered.test.mjs"],
    registeredPaths: [],
    optOut: [{ path: "plugins/pipeline-core/lib/deliberately-unregistered.test.mjs", reason: "example fixture, excluded on purpose" }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.unaccounted, []);
  assert.equal(result.suppressed.length, 1);
  assert.equal(result.suppressed[0].path, "plugins/pipeline-core/lib/deliberately-unregistered.test.mjs");
  assert.equal(result.suppressed[0].reason, "example fixture, excluded on purpose");
});

test("compareSuiteRegistration: a missing path or a non-object opt-out entry is also rejected, and never crashes", () => {
  const result = compareSuiteRegistration({
    enumeratedPaths: ["plugins/pipeline-core/lib/a.test.mjs"],
    registeredPaths: ["plugins/pipeline-core/lib/a.test.mjs"],
    optOut: [null, "not-an-object", { reason: "no path given" }, { path: "" , reason: "empty path" }],
  });
  assert.equal(result.ok, false, "invalid opt-out entries fail the run even when every enumerated file is otherwise registered");
  assert.equal(result.invalidOptOut.length, 4);
  const codes = result.invalidOptOut.map((entry) => entry.code).sort();
  assert.deepEqual(codes, ["OPT-OUT-ENTRY-NOT-AN-OBJECT", "OPT-OUT-ENTRY-NOT-AN-OBJECT", "OPT-OUT-PATH-MISSING", "OPT-OUT-PATH-MISSING"]);
});

test("compareSuiteRegistration: a stale opt-out entry (its named path IS registered) is a fatal finding, independent of the real repo's own list", () => {
  const result = compareSuiteRegistration({
    enumeratedPaths: ["plugins/pipeline-core/lib/a.test.mjs"],
    registeredPaths: ["plugins/pipeline-core/lib/a.test.mjs"],
    optOut: [{ path: "plugins/pipeline-core/lib/a.test.mjs", reason: "was unregistered once, no longer true" }],
  });
  assert.equal(result.ok, false, "a stale opt-out entry must fail the run even though the named suite is registered and every enumerated file is accounted for");
  assert.deepEqual(result.unaccounted, [], "the suite is registered, so it must not also appear as unaccounted");
  assert.equal(result.staleOptOut.length, 1);
  assert.equal(result.staleOptOut[0].path, "plugins/pipeline-core/lib/a.test.mjs", "the finding must name the stale entry's path");
  assert.equal(result.staleOptOut[0].reason, "was unregistered once, no longer true", "the finding must carry the entry's own reason text so a reader can see it is stale");
});

test("compareSuiteRegistration: a stale opt-out entry is detected even for a suite not present in enumeratedPaths at all", () => {
  const result = compareSuiteRegistration({
    enumeratedPaths: [],
    registeredPaths: ["plugins/pipeline-core/lib/gone-from-disk.test.mjs"],
    optOut: [{ path: "plugins/pipeline-core/lib/gone-from-disk.test.mjs", reason: "stale" }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.staleOptOut.length, 1, "detection must be independent of enumeratedPaths -- registeredPaths vs optOut alone is enough");
});

test("compareSuiteRegistration: a genuinely non-stale opt-out entry (its path is NOT registered) still passes, unaffected by the staleness check", () => {
  const result = compareSuiteRegistration({
    enumeratedPaths: ["plugins/pipeline-core/lib/still-unregistered.test.mjs"],
    registeredPaths: ["plugins/pipeline-core/lib/a.test.mjs"],
    optOut: [{ path: "plugins/pipeline-core/lib/still-unregistered.test.mjs", reason: "genuinely still excluded" }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.staleOptOut, []);
});

test("normalizeRepoRelativePath: strips a leading './' and normalizes backslashes", () => {
  assert.equal(normalizeRepoRelativePath("./plugins/pipeline-core/lib/a.test.mjs"), "plugins/pipeline-core/lib/a.test.mjs");
  assert.equal(normalizeRepoRelativePath("plugins\\pipeline-core\\lib\\a.test.mjs"), "plugins/pipeline-core/lib/a.test.mjs");
});

test("validateOptOutEntries: an empty/undefined list validates cleanly", () => {
  assert.deepEqual(validateOptOutEntries(undefined), { valid: new Map(), invalid: [] });
  assert.deepEqual(validateOptOutEntries([]), { valid: new Map(), invalid: [] });
});

const SYNTHETIC_VERIFY_SOURCE = `
const scriptDir = "/repo/harness/scripts";
const repoRoot = "/repo";
const hooksDir = "/repo/plugins/pipeline-core/hooks";
const libDir = "/repo/plugins/pipeline-core/lib";
const pluginScriptsDir = "/repo/plugins/pipeline-core/scripts";

const SOME_OTHER_ARRAY = [
  { name: "not-test-suites", file: join(repoRoot, "should-not-be-picked-up.test.mjs") },
];

const TEST_SUITES = [
  { name: "setup-tests", file: join(repoRoot, "setup.test.mjs") },
  { name: "lib-suite-tests", file: join(libDir, "example.test.mjs") },
  { name: "hooks-suite-tests", file: join(hooksDir, "example-hook.test.mjs") },
  { name: "scripts-suite-tests", file: join(pluginScriptsDir, "example-script.test.mjs") },
  { name: "harness-script-suite-tests", file: join(scriptDir, "example-harness-script.test.mjs") },
  { name: "skills-direct-tests", file: join(repoRoot, "plugins", "pipeline-core", "skills", "some-skill", "example-skill.test.mjs") },
  { name: "phase-with-args", file: join(scriptDir, "phase-example.mjs"), args: ["--result", "x"] },
];

const trailingUseOfBrackets = [];

const SCOPED_VERIFY_SUITES = Object.freeze([
  Object.freeze({
    name: "scoped-example-tests",
    file: "plugins/pipeline-core/lib/scoped-example.test.mjs",
  }),
]);

const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([
  Object.freeze({
    name: "windows-example-tests",
    file: "plugins/pipeline-core/lib/windows-example.test.mjs",
  }),
]);
`;

test("parseTestSuitesBlock: slices from the start marker to the true closing '\\n];' line, not an inline '[]'", () => {
  const block = parseTestSuitesBlock(SYNTHETIC_VERIFY_SOURCE);
  assert.ok(block.startsWith("["));
  assert.ok(block.endsWith("]"));
  assert.ok(block.includes("skills-direct-tests"));
  assert.ok(!block.includes("trailingUseOfBrackets"), "must stop at the array's own closing bracket, not a later unrelated one");
});

test("parseTestSuitesBlock: throws a named error when the start marker is absent", () => {
  assert.throws(() => parseTestSuitesBlock("const NOT_IT = [];"), /PARSE-TEST-SUITES-START-NOT-FOUND/);
});

test("parseRegisteredSuiteFiles: resolves all five directory-constant shapes and the direct multi-segment skills shape", () => {
  const files = parseRegisteredSuiteFiles(SYNTHETIC_VERIFY_SOURCE);
  assert.deepEqual(
    files.sort(),
    [
      "harness/scripts/example-harness-script.test.mjs",
      "harness/scripts/phase-example.mjs",
      "plugins/pipeline-core/hooks/example-hook.test.mjs",
      "plugins/pipeline-core/lib/example.test.mjs",
      "plugins/pipeline-core/scripts/example-script.test.mjs",
      "plugins/pipeline-core/skills/some-skill/example-skill.test.mjs",
      "setup.test.mjs",
    ].sort(),
    "must not pick up SOME_OTHER_ARRAY's entry, and must resolve the .mjs (non-.test.mjs) phase-example entry too",
  );
});

test("parseRegisteredSuiteFiles: fails closed on an unknown base identifier instead of guessing", () => {
  const source = `
const TEST_SUITES = [
  { name: "bogus", file: join(someUnknownDir, "x.test.mjs") },
];
`;
  assert.throws(() => parseRegisteredSuiteFiles(source), /PARSE-TEST-SUITES-UNRECOGNIZED-SHAPE/);
  assert.throws(() => parseRegisteredSuiteFiles(source), /someUnknownDir/);
});

test("parseRegisteredSuiteFiles: fails closed on a file: value that is not a join(...) call at all -- a bare identifier is not silently skipped", () => {
  const source = `
const TEST_SUITES = [
  { name: "setup-tests", file: join(repoRoot, "setup.test.mjs") },
  { name: "bogus", file: someHelperVariable },
];
`;
  assert.throws(() => parseRegisteredSuiteFiles(source), /PARSE-TEST-SUITES-UNRECOGNIZED-SHAPE/);
  assert.throws(() => parseRegisteredSuiteFiles(source), /file: value is not a recognized join\(\.\.\.\) call/);
  assert.throws(() => parseRegisteredSuiteFiles(source), /someHelperVariable/);
});

test("parseRegisteredSuiteFiles: fails closed on a file: value that calls a DIFFERENT function than join(...) -- not silently skipped", () => {
  const source = `
const TEST_SUITES = [
  { name: "bogus", file: resolvePath(repoRoot, "x.test.mjs") },
];
`;
  assert.throws(() => parseRegisteredSuiteFiles(source), /PARSE-TEST-SUITES-UNRECOGNIZED-SHAPE/);
  assert.throws(() => parseRegisteredSuiteFiles(source), /file: value is not a recognized join\(\.\.\.\) call/);
});

test("parseRegisteredSuiteFiles: fails closed on a join(...) call mixing a quoted segment with an unquoted/variable argument -- not silently truncated", () => {
  const source = `
const TEST_SUITES = [
  { name: "bogus", file: join(pluginScriptsDir, someVariableSegment, "x.test.mjs") },
];
`;
  assert.throws(() => parseRegisteredSuiteFiles(source), /PARSE-TEST-SUITES-UNRECOGNIZED-SHAPE/);
  assert.throws(() => parseRegisteredSuiteFiles(source), /join\(\.\.\.\) argument is not a fully-quoted string/);
  assert.throws(() => parseRegisteredSuiteFiles(source), /someVariableSegment/);
});

test("parseRegisteredSuiteFiles: fails closed on a join(...) call with an unquoted first extra segment followed by a quoted one (segments.length !== 0 trap)", () => {
  // Regression for the exact F1.2 sub-case: the old QUOTED_SEGMENT_RE scan found 1 quoted
  // segment (not 0), so `segments.length === 0` never tripped and the call silently
  // reconstructed a truncated path from only the quoted segment.
  const source = `
const TEST_SUITES = [
  { name: "bogus", file: join(libDir, computedSegment, "trailing.test.mjs") },
];
`;
  let thrown;
  try {
    parseRegisteredSuiteFiles(source);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "must throw rather than returning a truncated path");
  assert.match(thrown.message, /computedSegment/);
});

// NVA-SUITEREGSCOPE-1: SCOPED_VERIFY_SUITES and WINDOWS_ASSURANCE_VERIFY_SUITES are folded
// into `registeredSuites` by verify.mjs alongside TEST_SUITES, but use a different `file:`
// value shape (a plain quoted repo-relative string, not a `join(...)` call).

test("parseScopedVerifySuitesBlock: slices from the start marker to the true closing '\\n]);' line", () => {
  const block = parseScopedVerifySuitesBlock(SYNTHETIC_VERIFY_SOURCE);
  assert.ok(block.startsWith("["));
  assert.ok(block.endsWith("]"));
  assert.ok(block.includes("scoped-example-tests"));
  assert.ok(!block.includes("windows-example-tests"), "must not run into the following WINDOWS_ASSURANCE_VERIFY_SUITES array");
});

test("parseWindowsAssuranceVerifySuitesBlock: slices from the start marker to the true closing '\\n]);' line", () => {
  const block = parseWindowsAssuranceVerifySuitesBlock(SYNTHETIC_VERIFY_SOURCE);
  assert.ok(block.startsWith("["));
  assert.ok(block.endsWith("]"));
  assert.ok(block.includes("windows-example-tests"));
  assert.ok(!block.includes("scoped-example-tests"), "must not include the preceding SCOPED_VERIFY_SUITES array");
});

test("parseScopedVerifySuiteFiles: resolves the fully-quoted string-literal file: value directly, with no join(...) resolution", () => {
  const files = parseScopedVerifySuiteFiles(SYNTHETIC_VERIFY_SOURCE);
  assert.deepEqual(files, ["plugins/pipeline-core/lib/scoped-example.test.mjs"]);
});

test("parseWindowsAssuranceVerifySuiteFiles: resolves the fully-quoted string-literal file: value directly, with no join(...) resolution", () => {
  const files = parseWindowsAssuranceVerifySuiteFiles(SYNTHETIC_VERIFY_SOURCE);
  assert.deepEqual(files, ["plugins/pipeline-core/lib/windows-example.test.mjs"]);
});

test("parseScopedVerifySuiteFiles: throws a named PARSE-SCOPED-VERIFY-SUITES-START-NOT-FOUND error when the array is absent, rather than returning an empty list", () => {
  assert.throws(() => parseScopedVerifySuiteFiles("const NOT_IT = Object.freeze([]);"), /PARSE-SCOPED-VERIFY-SUITES-START-NOT-FOUND/);
});

test("parseScopedVerifySuiteFiles: throws a named PARSE-SCOPED-VERIFY-SUITES-END-NOT-FOUND error when no closing '\\n]);' terminator follows", () => {
  const source = `
const SCOPED_VERIFY_SUITES = Object.freeze([
  Object.freeze({ name: "unterminated", file: "x.test.mjs" }),
`;
  assert.throws(() => parseScopedVerifySuiteFiles(source), /PARSE-SCOPED-VERIFY-SUITES-END-NOT-FOUND/);
});

test("parseScopedVerifySuiteFiles: fails closed on a file: value that is not a fully-quoted string literal -- not silently skipped", () => {
  const source = `
const SCOPED_VERIFY_SUITES = Object.freeze([
  Object.freeze({ name: "bogus", file: someVariable }),
]);
`;
  assert.throws(() => parseScopedVerifySuiteFiles(source), /PARSE-SCOPED-VERIFY-SUITES-UNRECOGNIZED-SHAPE/);
  assert.throws(() => parseScopedVerifySuiteFiles(source), /file: value is not a fully-quoted string literal/);
  assert.throws(() => parseScopedVerifySuiteFiles(source), /someVariable/);
});

test("parseWindowsAssuranceVerifySuiteFiles: throws a named PARSE-WINDOWS-ASSURANCE-VERIFY-SUITES-START-NOT-FOUND error when the array is absent", () => {
  assert.throws(() => parseWindowsAssuranceVerifySuiteFiles("const NOT_IT = Object.freeze([]);"), /PARSE-WINDOWS-ASSURANCE-VERIFY-SUITES-START-NOT-FOUND/);
});

test("parseWindowsAssuranceVerifySuiteFiles: throws a named PARSE-WINDOWS-ASSURANCE-VERIFY-SUITES-END-NOT-FOUND error when no closing '\\n]);' terminator follows", () => {
  const source = `
const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([
  Object.freeze({ name: "unterminated", file: "x.test.mjs" }),
`;
  assert.throws(() => parseWindowsAssuranceVerifySuiteFiles(source), /PARSE-WINDOWS-ASSURANCE-VERIFY-SUITES-END-NOT-FOUND/);
});

test("parseWindowsAssuranceVerifySuiteFiles: fails closed on a file: value that is not a fully-quoted string literal -- not silently skipped", () => {
  const source = `
const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([
  Object.freeze({ name: "bogus", file: someVariable }),
]);
`;
  assert.throws(() => parseWindowsAssuranceVerifySuiteFiles(source), /PARSE-WINDOWS-ASSURANCE-VERIFY-SUITES-UNRECOGNIZED-SHAPE/);
  assert.throws(() => parseWindowsAssuranceVerifySuiteFiles(source), /file: value is not a fully-quoted string literal/);
  assert.throws(() => parseWindowsAssuranceVerifySuiteFiles(source), /someVariable/);
});

test("parseAllRegisteredSuiteFiles: combines TEST_SUITES, SCOPED_VERIFY_SUITES, and WINDOWS_ASSURANCE_VERIFY_SUITES into one repo-relative path list", () => {
  const files = parseAllRegisteredSuiteFiles(SYNTHETIC_VERIFY_SOURCE);
  assert.ok(files.includes("setup.test.mjs"), "must still include a TEST_SUITES entry");
  assert.ok(files.includes("plugins/pipeline-core/lib/scoped-example.test.mjs"), "must include the SCOPED_VERIFY_SUITES entry");
  assert.ok(files.includes("plugins/pipeline-core/lib/windows-example.test.mjs"), "must include the WINDOWS_ASSURANCE_VERIFY_SUITES entry");
});

test("compareSuiteRegistration: a file registered only via SCOPED_VERIFY_SUITES or only via WINDOWS_ASSURANCE_VERIFY_SUITES is recognized as registered, while a genuinely unregistered file is still reported", () => {
  const registeredPaths = parseAllRegisteredSuiteFiles(SYNTHETIC_VERIFY_SOURCE);
  const result = compareSuiteRegistration({
    enumeratedPaths: [
      "plugins/pipeline-core/lib/scoped-example.test.mjs",
      "plugins/pipeline-core/lib/windows-example.test.mjs",
      "plugins/pipeline-core/lib/rogue.test.mjs",
    ],
    registeredPaths,
    optOut: [],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unaccounted, ["plugins/pipeline-core/lib/rogue.test.mjs"], "only the genuinely-unregistered file must be reported");
});

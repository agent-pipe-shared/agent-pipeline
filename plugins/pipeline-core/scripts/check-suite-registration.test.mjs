#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-suite-registration.test.mjs -- covers the PURE comparison/parsing functions of
 * check-suite-registration.mjs with synthetic inputs. No real filesystem walk and no real
 * verify.mjs read: `parseRegisteredSuiteFiles`/`parseTestSuitesBlock` are exercised against
 * a synthetic `TEST_SUITES`-shaped source snippet, and `compareSuiteRegistration` against
 * synthetic enumerated/registered/opt-out sets. The real repo-state run (real filesystem,
 * real verify.mjs) is exercised separately, by hand, as this dispatch's DoD evidence -- not
 * by this suite.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  compareSuiteRegistration,
  normalizeRepoRelativePath,
  parseRegisteredSuiteFiles,
  parseTestSuitesBlock,
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

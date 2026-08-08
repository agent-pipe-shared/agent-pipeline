// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  checkVerifySuiteRegistration,
  EXCLUSIONS,
  parseExclusionDay,
  REQUIRED_EXCLUSION_FIELDS,
} from "./check-verify-suite-registration.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const checkerPath = join(here, "check-verify-suite-registration.mjs");

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

/**
 * Builds a temporary repository skeleton with the four directories verify.mjs's
 * base identifiers resolve to, plus a synthetic harness/scripts/verify.mjs whose
 * TEST_SUITES / SCOPED_VERIFY_SUITES / WINDOWS_ASSURANCE_VERIFY_SUITES arrays are
 * written in the checker's real, parsed textual form -- not a convenience stub.
 * The checker never executes verify.mjs (see its header), so this fixture text
 * need not be runnable JS beyond the three array literals themselves.
 */
function buildRoot() {
  const root = mkdtempSync(join(tmpdir(), "verify-suite-reg-"));
  mkdirSync(join(root, "harness", "scripts"), { recursive: true });
  mkdirSync(join(root, "plugins", "pipeline-core", "lib"), { recursive: true });
  mkdirSync(join(root, "plugins", "pipeline-core", "hooks"), { recursive: true });
  mkdirSync(join(root, "plugins", "pipeline-core", "scripts"), { recursive: true });
  return root;
}

function writeFile(root, relPath, content = "// fixture suite\n") {
  const full = join(root, ...relPath.split("/"));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function writeVerifyFixture(root, { testSuites = [], scoped = [], windows = [] } = {}) {
  const testEntries = testSuites
    .map(({ name, ident, segments }) => `  { name: "${name}", file: join(${ident}, ${segments.map((segment) => `"${segment}"`).join(", ")}) },`)
    .join("\n");
  const freeze = (list) => list
    .map(({ name, file }) => `  Object.freeze({\n    name: "${name}",\n    file: "${file}",\n  }),`)
    .join("\n");
  const text = [
    "const SCOPED_VERIFY_SUITES = Object.freeze([",
    freeze(scoped),
    "]);",
    "",
    "const WINDOWS_ASSURANCE_VERIFY_SUITES = Object.freeze([",
    freeze(windows),
    "]);",
    "",
    "const TEST_SUITES = [",
    testEntries,
    "];",
    "",
  ].join("\n");
  writeFileSync(join(root, "harness", "scripts", "verify.mjs"), text);
}

function verifyPathFor(root) { return join(root, "harness", "scripts", "verify.mjs"); }

// -- Fixture 1: an unregistered file is detected. ---------------------------
check("an unregistered *.test.mjs file under a registered root is detected", () => {
  const root = buildRoot();
  writeFile(root, "plugins/pipeline-core/lib/registered-one.test.mjs");
  writeFile(root, "plugins/pipeline-core/lib/unregistered-one.test.mjs");
  writeVerifyFixture(root, {
    testSuites: [{ name: "registered-one-tests", ident: "libDir", segments: ["registered-one.test.mjs"] }],
  });
  const result = checkVerifySuiteRegistration({ verifyPath: verifyPathFor(root), exclusions: {} });
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some((line) => line.startsWith("UNREGISTERED") && line.includes("plugins/pipeline-core/lib/unregistered-one.test.mjs")),
    `expected an UNREGISTERED finding naming unregistered-one.test.mjs, got: ${result.findings.join(" | ")}`,
  );
  assert.equal(result.unregisteredFiles.includes("plugins/pipeline-core/lib/unregistered-one.test.mjs"), true);
  rmSync(root, { recursive: true, force: true });
});

// -- Fixture 2: a registration entry naming a missing file is detected. -----
check("a registration entry naming a missing file is detected", () => {
  const root = buildRoot();
  writeVerifyFixture(root, {
    testSuites: [{ name: "ghost-tests", ident: "libDir", segments: ["ghost.test.mjs"] }],
  });
  const result = checkVerifySuiteRegistration({ verifyPath: verifyPathFor(root), exclusions: {} });
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some((line) => line.startsWith("MISSING-FILE") && line.includes("ghost-tests") && line.includes("ghost.test.mjs")),
    `expected a MISSING-FILE finding naming ghost-tests, got: ${result.findings.join(" | ")}`,
  );
  rmSync(root, { recursive: true, force: true });
});

// -- Fixture 3: a duplicate id is detected, and named in the message. -------
check("a duplicate suite name across arrays is detected and named", () => {
  const root = buildRoot();
  writeFile(root, "plugins/pipeline-core/lib/first.test.mjs");
  writeFile(root, "plugins/pipeline-core/hooks/second.test.mjs");
  writeVerifyFixture(root, {
    testSuites: [{ name: "dup-tests", ident: "libDir", segments: ["first.test.mjs"] }],
    scoped: [{ name: "dup-tests", file: "plugins/pipeline-core/hooks/second.test.mjs" }],
  });
  const result = checkVerifySuiteRegistration({ verifyPath: verifyPathFor(root), exclusions: {} });
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some((line) => line.startsWith("DUPLICATE-NAME") && line.includes('"dup-tests"')),
    `expected a DUPLICATE-NAME finding naming dup-tests, got: ${result.findings.join(" | ")}`,
  );
  rmSync(root, { recursive: true, force: true });
});

// -- Fixture 4: a declared exclusion is accepted. ----------------------------
check("a declared exclusion is accepted without a finding", () => {
  const root = buildRoot();
  writeFile(root, "harness/scripts/legacy.test.mjs");
  writeVerifyFixture(root, {});
  const result = checkVerifySuiteRegistration({
    verifyPath: verifyPathFor(root),
    exclusions: {
      "harness/scripts/legacy.test.mjs": { reason: "filed defect, R1.2-style", owner: "PO", expires: "2026-09-07" },
    },
    now: "2026-08-08",
  });
  assert.equal(result.ok, true);
  assert.equal(result.excludedCount, 1);
  assert.equal(result.findings.some((line) => line.includes("legacy.test.mjs")), false);
  rmSync(root, { recursive: true, force: true });
});

// -- Fixture 5: a well-formed fixture exits 0 (function level). -------------
function wellFormedRoot() {
  const root = buildRoot();
  writeFile(root, "harness/scripts/alpha.test.mjs");
  writeFile(root, "plugins/pipeline-core/lib/beta.test.mjs");
  writeFile(root, "plugins/pipeline-core/hooks/gamma.test.mjs");
  writeFile(root, "plugins/pipeline-core/scripts/delta.test.mjs");
  writeVerifyFixture(root, {
    testSuites: [
      { name: "alpha-tests", ident: "scriptDir", segments: ["alpha.test.mjs"] },
      { name: "delta-tests", ident: "pluginScriptsDir", segments: ["delta.test.mjs"] },
    ],
    scoped: [{ name: "beta-tests", file: "plugins/pipeline-core/lib/beta.test.mjs" }],
    windows: [{ name: "gamma-tests", file: "plugins/pipeline-core/hooks/gamma.test.mjs" }],
  });
  return root;
}

check("the checker exits 0 (well-formed, function level) on a well-formed fixture", () => {
  const root = wellFormedRoot();
  const result = checkVerifySuiteRegistration({ verifyPath: verifyPathFor(root), exclusions: {} });
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.equal(result.registeredCount, 4);
  assert.equal(result.unregisteredCount, 0);
  rmSync(root, { recursive: true, force: true });
});

// -- Process-level proof: the checker's own CLI exits 0 / non-zero for real. --
// AC-P2/AC-P3 ("demonstrated by deliberate break ... not asserted"): this
// spawns the real check-verify-suite-registration.mjs file as a child process
// against temporary-directory fixtures (never a real checkout file) and reads
// its actual exit code -- a check nobody has seen go red is not evidence.
check("CLI: exits 0 against a well-formed fixture root", () => {
  const root = wellFormedRoot();
  const result = spawnSync(process.execPath, [checkerPath, "--root", root], { encoding: "utf8" });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  rmSync(root, { recursive: true, force: true });
});

check("CLI: exits non-zero (deliberate break) against an unregistered-file fixture root", () => {
  const root = wellFormedRoot();
  // Deliberately break the fixture: add a suite with no registration entry.
  writeFile(root, "plugins/pipeline-core/lib/unregistered-break.test.mjs");
  const result = spawnSync(process.execPath, [checkerPath, "--root", root], { encoding: "utf8" });
  assert.notEqual(result.status, 0, `expected a non-zero exit, got ${result.status}`);
  assert.match(result.stderr, /UNREGISTERED .*unregistered-break\.test\.mjs/);
  rmSync(root, { recursive: true, force: true });
});

// -- Regression guard: the checker must not exempt its own two files. -------
check("the checker's own two files are not declared exclusions", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(EXCLUSIONS, "harness/scripts/check-verify-suite-registration.mjs"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(EXCLUSIONS, "harness/scripts/check-verify-suite-registration.test.mjs"), false);
});

check("EXCLUSIONS is seeded exactly from the classification report's red 7, each with reason, owner and expiry", () => {
  const expected = [
    "harness/lib/plan-spec-state-v2.test.mjs",
    "harness/scripts/recovery-bridge-approval.test.mjs",
    "plugins/pipeline-core/hooks/guard-git-phoenix.test.mjs",
    "plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs",
    "plugins/pipeline-core/lib/windows-assurance-verify-registration.test.mjs",
    "plugins/pipeline-core/scripts/afk-activation.test.mjs",
    "plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs",
  ];
  assert.deepEqual(Object.keys(EXCLUSIONS).sort(), expected);
  // QG-06 shape, checked per field so a failure names which field is missing where.
  // (Supersedes the original bare-`reason`-string assertion, which this strictly
  // subsumes: `reason` is still required to be a non-empty string.)
  for (const [path, entry] of Object.entries(EXCLUSIONS)) {
    for (const field of REQUIRED_EXCLUSION_FIELDS) {
      assert.equal(
        typeof entry[field] === "string" && entry[field].length > 0, true,
        `EXCLUSIONS["${path}"] is missing the required QG-06 field "${field}"`,
      );
    }
    assert.notEqual(parseExclusionDay(entry.expires), null, `EXCLUSIONS["${path}"].expires is not a YYYY-MM-DD day`);
  }
});

// -- QG-06: an exclusion is a debt with an owner AND an end date. ------------
// guardrails/quality-gates.md QG-06 requires reason, owner and expiry of any
// temporary exception, and requires that "at expiry it is promoted to blocking
// or deleted -- no third option, no silent extension". The checker's header
// claimed the first half long before the structure could hold it; these cases
// pin both halves, in both directions, against an injected day rather than the
// wall clock -- a gate whose verdict flips on an uncontrolled calendar cannot
// be shown to work on both sides of its own boundary.
const EXCLUDED_PATH = "harness/scripts/legacy.test.mjs";
const WELL_FORMED = Object.freeze({ reason: "red standalone (R1.2), filed", owner: "PO", expires: "2026-09-07" });

/** One unregistered fixture file, one declared exclusion for it, one comparison day. */
function exclusionRun(entry, now) {
  const root = buildRoot();
  writeFile(root, EXCLUDED_PATH);
  writeVerifyFixture(root, {});
  try {
    return checkVerifySuiteRegistration({
      verifyPath: verifyPathFor(root),
      exclusions: { [EXCLUDED_PATH]: entry },
      now,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function assertNotSuppressed(result, why) {
  assert.equal(result.ok, false, why);
  assert.equal(result.excludedCount, 0, `${why}: it must not be counted as an honoured exclusion`);
  assert.ok(
    result.findings.some((line) => line.startsWith("UNREGISTERED") && line.includes(EXCLUDED_PATH)),
    `${why}: the file must resurface as UNREGISTERED, never be silently suppressed -- got: ${result.findings.join(" | ")}`,
  );
}

check("QG-06: a well-formed exclusion (reason, owner, expiry) is honoured before its expiry day", () => {
  const result = exclusionRun(WELL_FORMED, "2026-08-08");
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
  assert.equal(result.excludedCount, 1);
  assert.deepEqual(result.malformedExclusions, []);
  assert.deepEqual(result.expiredExclusions, []);
});

for (const field of REQUIRED_EXCLUSION_FIELDS) {
  check(`QG-06: an exclusion missing "${field}" is a finding naming the file and that field, and does not suppress`, () => {
    const entry = { ...WELL_FORMED };
    delete entry[field];
    const result = exclusionRun(entry, "2026-08-08");
    assert.ok(
      result.findings.some((line) => line.startsWith("MALFORMED-EXCLUSION")
        && line.includes(EXCLUDED_PATH) && line.includes(`"${field}"`)),
      `expected a MALFORMED-EXCLUSION finding naming ${EXCLUDED_PATH} and "${field}", got: ${result.findings.join(" | ")}`,
    );
    assert.deepEqual(result.malformedExclusions, [EXCLUDED_PATH]);
    assertNotSuppressed(result, `an exclusion missing "${field}" is not a valid exclusion`);
  });
}

check("QG-06: an empty-string field counts as missing, not as present-but-blank", () => {
  const result = exclusionRun({ ...WELL_FORMED, owner: "   " }, "2026-08-08");
  assert.ok(
    result.findings.some((line) => line.startsWith("MALFORMED-EXCLUSION") && line.includes('"owner"')),
    `expected a MALFORMED-EXCLUSION finding for a blank owner, got: ${result.findings.join(" | ")}`,
  );
  assertNotSuppressed(result, "a blank owner names nobody");
});

check("QG-06: the pre-QG-06 bare reason string is rejected, not grandfathered", () => {
  const result = exclusionRun("red (R1.2): SyntaxError, no export foo", "2026-08-08");
  for (const field of REQUIRED_EXCLUSION_FIELDS) {
    assert.ok(
      result.findings.some((line) => line.startsWith("MALFORMED-EXCLUSION") && line.includes(`"${field}"`)),
      `expected the bare-string entry to be reported as missing "${field}", got: ${result.findings.join(" | ")}`,
    );
  }
  assertNotSuppressed(result, "a bare reason string carries no owner and no expiry");
});

for (const badDate of ["soon", "2026-9-7", "2026-02-30", "07.09.2026", "2026-09-07T00:00:00Z", "when R1.2 closes"]) {
  check(`QG-06: an unparseable expiry (${JSON.stringify(badDate)}) is a finding, not an open-ended exclusion`, () => {
    const result = exclusionRun({ ...WELL_FORMED, expires: badDate }, "2026-08-08");
    assert.ok(
      result.findings.some((line) => line.startsWith("MALFORMED-EXCLUSION")
        && line.includes(EXCLUDED_PATH) && line.includes('"expires"')),
      `expected a MALFORMED-EXCLUSION finding naming ${EXCLUDED_PATH} and "expires", got: ${result.findings.join(" | ")}`,
    );
    assertNotSuppressed(result, `an expiry of ${JSON.stringify(badDate)} cannot expire`);
  });
}

check("QG-06: parseExclusionDay rejects what Date() would silently reinterpret, and accepts a real day", () => {
  // Date.UTC(2026, 1, 30) rolls forward to March 2 rather than failing -- a
  // two-day silent extension if it were accepted.
  assert.equal(parseExclusionDay("2026-02-30"), null);
  assert.equal(parseExclusionDay("2026-13-01"), null);
  assert.equal(parseExclusionDay("2026-9-7"), null);
  assert.equal(parseExclusionDay(20260907), null);
  assert.equal(parseExclusionDay("2026-02-29"), null); // 2026 is not a leap year
  assert.equal(parseExclusionDay("2026-09-07"), Date.UTC(2026, 8, 7));
  assert.equal(parseExclusionDay("2024-02-29"), Date.UTC(2024, 1, 29)); // 2024 is
});

check("QG-06: an exclusion whose expiry has passed is a finding naming the file and the expiry date", () => {
  const result = exclusionRun(WELL_FORMED, "2026-09-08");
  const expiry = result.findings.find((line) => line.startsWith("EXPIRED-EXCLUSION"));
  assert.ok(expiry, `expected an EXPIRED-EXCLUSION finding, got: ${result.findings.join(" | ")}`);
  assert.ok(expiry.includes(EXCLUDED_PATH), `the finding must name the file, got: ${expiry}`);
  assert.ok(expiry.includes("2026-09-07"), `the finding must name the expiry date, got: ${expiry}`);
  assert.deepEqual(result.expiredExclusions, [EXCLUDED_PATH]);
  assertNotSuppressed(result, "an expired exclusion is promoted to blocking, not silently extended");
});

check("QG-06: an expiry in the future is accepted; the same entry one day past its expiry is not", () => {
  // Both sides of the boundary, one entry, only the day differs.
  assert.equal(exclusionRun(WELL_FORMED, "2026-09-06").ok, true, "the day before expiry is still valid");
  assert.equal(exclusionRun(WELL_FORMED, "2026-09-07").ok, true, "the exclusion is valid THROUGH its expiry day");
  assert.equal(exclusionRun(WELL_FORMED, "2026-09-08").ok, false, "the day after expiry is not");
});

check("QG-06: the comparison uses the injected day, not the process clock", () => {
  // An expiry long past by wall-clock time, judged against a day before it.
  const past = { ...WELL_FORMED, expires: "2020-01-01" };
  assert.equal(exclusionRun(past, "2019-12-31").ok, true, "injected day precedes the expiry, so it is not expired");
  assert.equal(exclusionRun(past, new Date("2020-01-02T00:00:00Z")).ok, false, "a Date is accepted as well as a string");
});

check("QG-06: exclusion validation runs even when verify.mjs cannot be read at all", () => {
  const root = buildRoot(); // built, but no verify.mjs is written into it
  const result = checkVerifySuiteRegistration({
    verifyPath: verifyPathFor(root),
    exclusions: { [EXCLUDED_PATH]: WELL_FORMED },
    now: "2026-09-08",
  });
  rmSync(root, { recursive: true, force: true });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((line) => line.startsWith("EXPIRED-EXCLUSION")));
  assert.ok(result.findings.some((line) => line.startsWith("READ-ERROR")));
});

check("QG-06: the real EXCLUSIONS table is self-clearing -- every entry expires on a stated day", () => {
  const days = Object.values(EXCLUSIONS).map((entry) => parseExclusionDay(entry.expires));
  assert.equal(days.every((day) => day !== null), true);
  const lastValidDay = new Date(Math.max(...days));
  const dayAfterLast = new Date(Math.max(...days) + 86_400_000);
  // Deterministic, wall-clock-independent proof of both directions on the REAL table:
  // honoured on the last declared day, every entry expired the day after it.
  const before = checkVerifySuiteRegistration({ exclusions: EXCLUSIONS, now: lastValidDay });
  assert.deepEqual(before.expiredExclusions, []);
  assert.deepEqual(before.malformedExclusions, []);
  const after = checkVerifySuiteRegistration({ exclusions: EXCLUSIONS, now: dayAfterLast });
  assert.deepEqual(after.expiredExclusions.sort(), Object.keys(EXCLUSIONS).sort());
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);

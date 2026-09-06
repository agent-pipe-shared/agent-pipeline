// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  checkVerifySuiteRegistration,
  duplicateSuiteIds,
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

/** Mirrors harness/scripts/verify-evidence-root.test.mjs's own minimal git wrapper. */
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

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

check("EXCLUSIONS is exactly the green suites parked on a closed maintenance window, each with reason, owner and expiry", () => {
  // Two classes, kept apart on purpose. A red suite is a defect that must not be
  // registered; a green suite waiting on a human signature is a scheduling fact.
  // Asserting them separately means the green one cannot quietly become the cover
  // for an eighth red one, which a flat seven-entry list would have allowed.
  //
  // afk-activation.test.mjs (formerly the sole red entry) and
  // harness/lib/plan-spec-state-v2.test.mjs, recovery-bridge-approval.test.mjs,
  // guard-git-phoenix.test.mjs, codex-isolated-critic-protected-preimage.test.mjs
  // (formerly green) are now registered in verify.mjs's TEST_SUITES and so are
  // no longer declared exclusions.
  const red = [];
  const greenAwaitingRegistration = [
    "harness/scripts/check-adr-consistency.test.mjs",
    "harness/scripts/check-critic-contract-citations.test.mjs",
    "harness/scripts/check-doc-reconciliation.test.mjs",
    "harness/scripts/print-verify-failures.test.mjs",
    "plugins/pipeline-core/hooks/guard-push-release-tag-ancestry.test.mjs",
    "plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs",
    "plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs",
  ];
  const expected = [...red, ...greenAwaitingRegistration].sort();
  assert.deepEqual(Object.keys(EXCLUSIONS).sort(), expected);
  for (const path of greenAwaitingRegistration) {
    assert.match(EXCLUSIONS[path].reason, /^GREEN, not red:/u);
  }
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

// -- duplicateSuiteIds: the RUNTIME counterpart of Class 3. ------------------
// Class 3 (DUPLICATE-NAME, above) reads verify.mjs's SOURCE TEXT. duplicateSuiteIds
// is a different mechanism on a different input: verify.mjs calls it on the already
// assembled runtime array (`[...TEST_SUITES, ...scopedTests, ...windowsAssuranceTests,
// ...phaseSteps]`) it is about to hand to runVerifyJournal, so a duplicate surfaces as
// a reported step instead of planVerifyResume() throwing before any suite runs
// (AC-P3/R1.4, specs/sprint-phoenix-epic/design/acp3-preplanning-patch.md). The two are
// tested separately on purpose; a green Class-3 case says nothing about this one.
function suiteEntry(name, file = `${name}.test.mjs`) { return { name, file }; }

check("duplicateSuiteIds: an empty registration array reports no duplicates", () => {
  assert.deepEqual(duplicateSuiteIds([]), []);
});

check("duplicateSuiteIds: a registration array with no repeated name reports no duplicates", () => {
  assert.deepEqual(duplicateSuiteIds([suiteEntry("alpha-tests"), suiteEntry("beta-tests"), suiteEntry("gamma-tests")]), []);
});

check("duplicateSuiteIds: one id registered twice is reported once, with count 2", () => {
  assert.deepEqual(
    duplicateSuiteIds([suiteEntry("alpha-tests"), suiteEntry("dup-tests"), suiteEntry("dup-tests")]),
    [{ id: "dup-tests", count: 2 }],
  );
});

check("duplicateSuiteIds: one id registered three times reports a count of 3, not two findings", () => {
  assert.deepEqual(
    duplicateSuiteIds([suiteEntry("dup-tests"), suiteEntry("alpha-tests"), suiteEntry("dup-tests"), suiteEntry("dup-tests")]),
    [{ id: "dup-tests", count: 3 }],
  );
});

check("duplicateSuiteIds: two distinct duplicated ids are both reported, sorted by id", () => {
  assert.deepEqual(
    duplicateSuiteIds([
      suiteEntry("zeta-tests"), suiteEntry("alpha-tests"), suiteEntry("solo-tests"),
      suiteEntry("zeta-tests"), suiteEntry("alpha-tests"), suiteEntry("zeta-tests"),
    ]),
    [{ id: "alpha-tests", count: 2 }, { id: "zeta-tests", count: 3 }],
  );
});

check("duplicateSuiteIds: entries sharing a name but naming different files are still duplicates", () => {
  // `name` is the field verify-journal.mjs threads through unchanged as the suite `id`
  // (`return { id: suite.name, ... }`) and is exactly what verify-resume.mjs:114 keys on.
  // Two different files under one name is the defect, not an accident of the file path.
  assert.deepEqual(
    duplicateSuiteIds([
      { name: "dup-tests", file: "/fixture/harness/scripts/first.test.mjs" },
      { name: "dup-tests", file: "/fixture/plugins/pipeline-core/lib/second.test.mjs" },
    ]),
    [{ id: "dup-tests", count: 2 }],
  );
});

check("duplicateSuiteIds: returns exactly the { id, count } shape the verify.mjs call site consumes", () => {
  // harness/scripts/verify.mjs ~596-601 reads `.length`, then per entry `duplicate.id`
  // (JSON.stringify'd into the VERIFY-REGISTRATION-DUPLICATE line) and `duplicate.count`.
  // Pinned here so a later "richer" return value cannot silently break that line.
  const result = duplicateSuiteIds([suiteEntry("dup-tests"), suiteEntry("dup-tests")]);
  assert.equal(result.length, 1);
  assert.deepEqual(Object.keys(result[0]).sort(), ["count", "id"]);
  assert.equal(typeof result[0].id, "string");
  assert.equal(typeof result[0].count, "number");
});

check("duplicateSuiteIds: a duplicate spanning two of verify.mjs's registration arrays is found", () => {
  // The exact assembly verify.mjs performs at ~591, phase steps included.
  const testSuites = [suiteEntry("alpha-tests"), suiteEntry("shared-tests")];
  const scopedTests = [suiteEntry("beta-tests")];
  const windowsAssuranceTests = [suiteEntry("shared-tests")];
  const phaseSteps = [{ name: "validate-manifest", file: "validate-manifest.mjs", dependsOn: [] }];
  assert.deepEqual(
    duplicateSuiteIds([...testSuites, ...scopedTests, ...windowsAssuranceTests, ...phaseSteps]),
    [{ id: "shared-tests", count: 2 }],
  );
});

// -- End-to-end fixture: verify.mjs's own duplicate path, run for real. ------
// AC-P3/R1.4 demanded this be demonstrated, not asserted. The checkout's
// harness/scripts/verify.mjs is TP-3-protected and is NEVER touched: the fixture copies
// it into a temp root, injects the duplicate into THAT copy's TEST_SUITES, and spawns it.
// "Did any suite run?" is answered by the child's own evidence artifact (its `steps` list and
// its `verifyRun` field), never by this file's opinion and never by the journal stub below --
// that stub's body is unreachable in the injectDuplicate:true case (the duplicate check
// short-circuits before the else branch that would call it); see JOURNAL_STUB_TRIPWIRE.
const VERIFY_REL_PATH = "harness/scripts/verify.mjs";
const REPO_ROOT = resolve(here, "..", "..");
const DUPLICATE_FIXTURE_ID = "phx-duplicate-registration-fixture-tests";
/** The copied verify.mjs STATICALLY imports runVerifyJournal from this path, so the file must
 *  EXIST or the child dies at module load (ERR_MODULE_NOT_FOUND) before writing any evidence.
 *  Its BODY runs only in the injectDuplicate:false (negative-control) case below, now that the
 *  fixture root carries real git topology (2026-08-19 fix): the duplicate check finds nothing,
 *  so the else branch calls runVerifyJournal, the stub throws this tripwire, and
 *  VERIFY-JOURNAL-FAILED: PHX-FIXTURE-JOURNAL-STUB-CALLED is what confirms the journal branch
 *  was actually entered (see the negative-control check below, which deliberately still does
 *  not pin the exact text -- only that some VERIFY-JOURNAL-FAILED line appears). In the
 *  injectDuplicate:true case the duplicate check short-circuits first, so the stub's body stays
 *  unreachable there. Before the git-topology fix, gitCommonDirectory() itself was unreachable
 *  from either case in a meaningful way: it is evaluated unconditionally at verify.mjs's module
 *  top level and threw VERIFY-GIT-COMMON-DIR-UNAVAILABLE in the then-non-Git temp root before
 *  any of this file's own registration/duplicate logic ran at all. */
const JOURNAL_STUB_REL_PATH = "plugins/pipeline-core/scripts/verify-journal.mjs";
const JOURNAL_STUB_TRIPWIRE = "PHX-FIXTURE-JOURNAL-STUB-CALLED";
/** Every module the copied verify.mjs imports, transitively — minus the journal, stubbed above.
 *  Enumerated by hand and therefore stale-able: assertReachedRegistration below surfaces the
 *  child's own stderr (which carries the ERR_MODULE_NOT_FOUND) rather than letting a missing
 *  module read as an unexplained failure. */
const FIXTURE_MODULES = Object.freeze([
  "harness/scripts/check-verify-suite-registration.mjs",
  "harness/scripts/manual-check-logic.mjs", // imported by verify.mjs for the manual-check step
  "harness/scripts/verify-evidence-writer.mjs",
  "plugins/pipeline-core/lib/project-authority.mjs",
  "plugins/pipeline-core/lib/scoped-verify-registration.mjs",
  "plugins/pipeline-core/lib/verify-resume.mjs",
  "plugins/pipeline-core/lib/windows-assurance-verify-registration.mjs",
  "plugins/pipeline-core/lib/worktree-lifecycle.mjs", // via project-authority.mjs
  "plugins/pipeline-core/lib/windows-private-state.mjs", // via worktree-lifecycle.mjs
  "plugins/pipeline-core/lib/nova-candidate-freeze.mjs",
  "plugins/pipeline-core/lib/review-economy.mjs", // via nova-candidate-freeze.mjs
]);
/** Authority files the two registration validators hash before verify plans anything. */
const FIXTURE_AUTHORITY = Object.freeze([
  "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md",
  "specs/2026-07-19-sprint-sentinel-epic/windows-trusted-tool-resolution-ac-matrix.md",
]);
/** Registration targets those validators lstat; absent, verify stops before the duplicate check. */
const FIXTURE_REGISTERED_TARGETS = Object.freeze([
  "plugins/pipeline-core/lib/scoped-verify-registration.test.mjs",
  "plugins/pipeline-core/lib/workflow-preflight.test.mjs",
  "plugins/pipeline-core/lib/interaction-continuity.test.mjs",
  "plugins/pipeline-core/lib/trusted-tool-resolution.test.mjs",
  "plugins/pipeline-core/lib/advisory-receipt-assurance.test.mjs",
  "plugins/pipeline-core/scripts/toolchain-preflight.test.mjs",
]);

function buildVerifyFixtureRoot({ injectDuplicate }) {
  const root = buildRoot();
  // Real git topology, not a bare tmpdir: the copied verify.mjs's own
  // gitCommonDirectory() call (`git rev-parse --git-common-dir`) must resolve, or
  // it throws VERIFY-GIT-COMMON-DIR-UNAVAILABLE before writing any evidence at all
  // (backlog 2026-08-19-verify-registration-check-fixtures-lack-real-git-topology.md).
  // Deliberately a fresh, UNCOMMITTED `git init` (never `git worktree add` off this
  // checkout): candidateIdentity()'s `git rev-parse HEAD` then fails (unborn HEAD),
  // so startedCandidate.status is "unavailable", not "dirty" -- verify.mjs only
  // takes its fast candidate-preflight exit on "dirty", so this keeps the fixture
  // reaching the registration/duplicate checks under test. It also keeps this
  // fixture root as its own primary root (gitCommonDirectory()'s parent), so
  // evidence still lands at THIS root's evidence/verify-latest.json, never at the
  // real checkout's shared evidence file.
  git(root, ["init", "--quiet"]);
  for (const relPath of [...FIXTURE_MODULES, ...FIXTURE_AUTHORITY]) {
    const target = join(root, ...relPath.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(REPO_ROOT, ...relPath.split("/")), target);
  }
  for (const relPath of FIXTURE_REGISTERED_TARGETS) writeFile(root, relPath);
  writeFile(root, JOURNAL_STUB_REL_PATH, `export function runVerifyJournal() { throw new Error(${JSON.stringify(JOURNAL_STUB_TRIPWIRE)}); }\n`);

  const source = readFileSync(join(REPO_ROOT, ...VERIFY_REL_PATH.split("/")), "utf8");
  const anchor = "const TEST_SUITES = [\n";
  assert.ok(source.includes(anchor), `fixture is stale: ${VERIFY_REL_PATH} no longer declares TEST_SUITES in the parsed form`);
  // One registration line, written twice — the shape a clean auto-merge produced on
  // 2026-08-08. The target need not exist: this path never reaches the journal.
  const line = `  { name: "${DUPLICATE_FIXTURE_ID}", file: join(scriptDir, "check-verify-suite-registration.mjs") },\n`;
  writeFile(root, VERIFY_REL_PATH, source.replace(anchor, anchor + (injectDuplicate ? line + line : "")));
  return root;
}

function runVerifyFixture({ injectDuplicate }) {
  const root = buildVerifyFixtureRoot({ injectDuplicate });
  try {
    const spawned = spawnSync(process.execPath, [join(root, ...VERIFY_REL_PATH.split("/"))], { cwd: root, encoding: "utf8" });
    const evidencePath = join(root, "evidence", "verify-latest.json");
    return {
      status: spawned.status,
      stderr: spawned.stderr ?? "",
      evidence: existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, "utf8")) : null,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Turns "a module went missing" and "the temp root is inside a repo" into named causes. */
function assertReachedRegistration(run) {
  assert.ok(run.evidence, `verify wrote no evidence at all; stderr: ${run.stderr}`);
  assert.notEqual(
    run.evidence.candidate.start.status, "dirty",
    "the fixture root looks like a dirty Git worktree, so verify stopped at candidate-preflight",
  );
  for (const blocked of ["windows-assurance-verify-registration", "scoped-verify-registration", "verify-running"]) {
    assert.equal(
      run.evidence.steps.some((step) => step.name === blocked), false,
      `verify never reached the duplicate check (stopped at ${blocked}); the fixture list is stale. stderr: ${run.stderr}`,
    );
  }
}

check("verify.mjs reports a duplicate registration as a failing step naming the id (AC-P3/R1.4)", () => {
  const run = runVerifyFixture({ injectDuplicate: true });
  assert.notEqual(run.status, 0, `expected a non-zero exit, got ${run.status}; stderr: ${run.stderr}`);
  assertReachedRegistration(run);
  assert.match(
    run.stderr,
    new RegExp(`VERIFY-REGISTRATION-DUPLICATE: suite id "${DUPLICATE_FIXTURE_ID}" is registered 2 times`),
    `stderr must name the duplicated id, got: ${run.stderr}`,
  );
  assert.deepEqual(run.evidence.steps, [{ name: "verify-suite-registration-duplicates", exitCode: 1 }]);
  assert.notEqual(run.evidence.exitCode, 0);
  // WHAT THE IMPLEMENTATION ACTUALLY DOES, pinned rather than wished for: the duplicate
  // check is the `if`, runVerifyJournal is its `else` (verify.mjs ~597-602), so on a
  // duplicate NO suite runs and the step list is exactly one entry long — the defect is
  // reported instead of thrown, but it is still reported INSTEAD OF running the corpus.
  // acp3-preplanning-patch.md's acceptance item 2 now states exactly that ("Zero suites
  // run, and the step list is exactly one entry", amended 2026-08-08 on PO decision, which
  // names this case). Document and gate agree; nothing is filed against this line any more.
  assert.equal(run.evidence.verifyRun, null);
  // The exact inverse of the negative control below, and failable for the same reason:
  // entering the else branch in this fixture always emits VERIFY-JOURNAL-FAILED.
  assert.equal(run.stderr.includes("VERIFY-JOURNAL-FAILED"), false, "the journal branch must not be entered at all");
  // No assertion on JOURNAL_STUB_TRIPWIRE here: the stub's body cannot run in this fixture
  // at all, so such an assertion could not fail and would read as coverage it does not give.
});

check("verify.mjs without a duplicate enters the journal branch — the duplicate step is discrimination, not a constant", () => {
  // The negative control for the case above: the same fixture with the duplicate line
  // omitted. It is what makes the case above evidence of DETECTION rather than of a
  // branch that fires unconditionally — without it, an `if (true)` would pass too.
  // Note what the else branch does here: `gitCommonDirectory()` is evaluated while
  // assembling runVerifyJournal's arguments and throws in a non-Git temp root, so the
  // journal stub is never called and the diagnostic reads VERIFY-GIT-COMMON-DIR-UNAVAILABLE
  // (observed under instrumentation, PHX-F2). The assertion below deliberately
  // does not pin that text: whatever the diagnostic is, the VERIFY-JOURNAL-FAILED line
  // and the `verify-journal` step can only be produced from inside that else branch,
  // which is precisely the discrimination being pinned.
  const run = runVerifyFixture({ injectDuplicate: false });
  assert.notEqual(run.status, 0, `the fixture journal cannot succeed, so a non-zero exit is expected; got ${run.status}`);
  assertReachedRegistration(run);
  assert.equal(run.stderr.includes("VERIFY-REGISTRATION-DUPLICATE"), false, `no duplicate was registered, got: ${run.stderr}`);
  assert.match(run.stderr, /VERIFY-JOURNAL-FAILED: /, `expected the journal branch to be entered, got: ${run.stderr}`);
  assert.deepEqual(run.evidence.steps, [{ name: "verify-journal", exitCode: 1 }]);
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);

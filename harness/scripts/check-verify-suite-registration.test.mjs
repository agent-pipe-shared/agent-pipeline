// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { checkVerifySuiteRegistration, EXCLUSIONS } from "./check-verify-suite-registration.mjs";

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
    exclusions: { "harness/scripts/legacy.test.mjs": "filed defect, R1.2-style" },
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

check("EXCLUSIONS is seeded exactly from the classification report's red 7, each with a reason", () => {
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
  assert.equal(Object.values(EXCLUSIONS).every((reason) => typeof reason === "string" && reason.length > 0), true);
});

process.stdout.write(`1..${passed}\n# pass ${passed}\n`);

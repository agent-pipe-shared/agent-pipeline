#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWindowsAssuranceVerifyRegistration } from "./windows-assurance-verify-registration.mjs";

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const TASK_ID = "pipeline.windows-assurance-verify-binding";
const AUTHORITY_PATH = "specs/2026-07-19-sprint-sentinel-epic/windows-trusted-tool-resolution-ac-matrix.md";
const AUTHORITY_SHA256 = "0b1a6c9256b7a517e95f401d6d86a75e5ce6d6ff87a61ded012ec7e672cf3a2e";
const SUITES = Object.freeze([
  Object.freeze({ name: "trusted-tool-resolution-tests", file: "plugins/pipeline-core/lib/trusted-tool-resolution.test.mjs" }),
  Object.freeze({ name: "advisory-receipt-assurance-tests", file: "plugins/pipeline-core/lib/advisory-receipt-assurance.test.mjs" }),
  Object.freeze({ name: "toolchain-preflight-tests", file: "plugins/pipeline-core/scripts/toolchain-preflight.test.mjs" }),
]);
const [TRUSTED_TOOL_RESOLUTION_SUITE, ADVISORY_RECEIPT_ASSURANCE_SUITE, TOOLCHAIN_PREFLIGHT_SUITE] = SUITES;

function entry(overrides = {}) {
  return {
    schema: "pipeline.windows-assurance-verify-registration.v1",
    taskId: TASK_ID,
    authority: { matrix: { path: AUTHORITY_PATH, sha256: AUTHORITY_SHA256 } },
    suites: SUITES.map((suite) => ({ ...suite })),
    ...overrides,
  };
}

/** Mirrors harness/scripts/verify-evidence-root.test.mjs's own minimal git wrapper. */
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return (r.stdout || "").trim();
}

function accepts(value) {
  try { return validateWindowsAssuranceVerifyRegistration(value)?.ok === true; } catch { return false; }
}

function rejects(value) {
  try { return validateWindowsAssuranceVerifyRegistration(value)?.ok === false; } catch { return false; }
}

check("WAVR01 accepts only the PO-approved three-suite Windows-assurance registration", accepts(entry()));

for (const field of ["schema", "taskId", "authority", "suites"]) {
  const { [field]: omitted, ...withoutField } = entry();
  check(`WAVR02 missing top-level ${field} fails closed`, rejects(withoutField));
}
check("WAVR03 extra top-level keys fail closed", rejects({ ...entry(), command: ["node", "other.test.mjs"] }));
check("WAVR04 wrong schema fails closed", rejects(entry({ schema: "pipeline.windows-assurance-verify-registration.v0" })));
check("WAVR05 wrong task binding fails closed", rejects(entry({ taskId: "pipeline.other-task" })));
check("WAVR06 noncanonical authority path fails closed", rejects(entry({ authority: { matrix: { path: "specs/other.md", sha256: AUTHORITY_SHA256 } } })));
check("WAVR07 noncanonical authority digest fails closed", rejects(entry({ authority: { matrix: { path: AUTHORITY_PATH, sha256: "a".repeat(64) } } })));
check("WAVR08 absolute authority paths fail closed", rejects(entry({ authority: { matrix: { path: `/${AUTHORITY_PATH}`, sha256: AUTHORITY_SHA256 } } })));
check("WAVR09 traversal authority paths fail closed", rejects(entry({ authority: { matrix: { path: "specs/../windows-trusted-tool-resolution-ac-matrix.md", sha256: AUTHORITY_SHA256 } } })));
check("WAVR10 extra authority keys fail closed", rejects(entry({ authority: { matrix: { path: AUTHORITY_PATH, sha256: AUTHORITY_SHA256, discover: true } } })));

check("WAVR11 absolute suite paths fail closed", rejects(entry({
  suites: [{ ...TRUSTED_TOOL_RESOLUTION_SUITE, file: `/${TRUSTED_TOOL_RESOLUTION_SUITE.file}` }, { ...ADVISORY_RECEIPT_ASSURANCE_SUITE }, { ...TOOLCHAIN_PREFLIGHT_SUITE }],
})));
check("WAVR12 traversal suite paths fail closed", rejects(entry({
  suites: [{ ...TRUSTED_TOOL_RESOLUTION_SUITE, file: "plugins/pipeline-core/lib/../trusted-tool-resolution.test.mjs" }, { ...ADVISORY_RECEIPT_ASSURANCE_SUITE }, { ...TOOLCHAIN_PREFLIGHT_SUITE }],
})));
check("WAVR13 arbitrary existing test targets fail closed", rejects(entry({
  suites: [{ name: "scoped-verify-registration-tests", file: "plugins/pipeline-core/lib/scoped-verify-registration.test.mjs" }, { ...ADVISORY_RECEIPT_ASSURANCE_SUITE }, { ...TOOLCHAIN_PREFLIGHT_SUITE }],
})));
for (const omittedSuite of SUITES) {
  check(`WAVR14 omitting authorized suite ${omittedSuite.name} fails closed`, rejects(entry({
    suites: SUITES.filter((suite) => suite !== omittedSuite).map((suite) => ({ ...suite })),
  })));
}
check("WAVR15 adding a fourth suite fails closed", rejects(entry({
  suites: [...SUITES.map((suite) => ({ ...suite })), { name: "other-tests", file: "plugins/pipeline-core/lib/other.test.mjs" }],
})));
check("WAVR16 reordering the canonical allowlist fails closed", rejects(entry({
  suites: [{ ...ADVISORY_RECEIPT_ASSURANCE_SUITE }, { ...TRUSTED_TOOL_RESOLUTION_SUITE }, { ...TOOLCHAIN_PREFLIGHT_SUITE }],
})));
check("WAVR17 suite command input fails closed", rejects(entry({
  suites: [{ ...TRUSTED_TOOL_RESOLUTION_SUITE, args: ["--watch"] }, { ...ADVISORY_RECEIPT_ASSURANCE_SUITE }, { ...TOOLCHAIN_PREFLIGHT_SUITE }],
})));

function authorityDriftFixture() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "windows-assurance-authority-drift-"));
  const registration = join(fixtureRoot, "plugins", "pipeline-core", "lib", "windows-assurance-verify-registration.mjs");
  const authority = join(fixtureRoot, AUTHORITY_PATH);
  const child = join(fixtureRoot, "validate-authority-drift.mjs");

  try {
    mkdirSync(dirname(registration), { recursive: true });
    mkdirSync(dirname(authority), { recursive: true });
    copyFileSync(join(repoRoot, "plugins", "pipeline-core", "lib", "windows-assurance-verify-registration.mjs"), registration);
    copyFileSync(join(repoRoot, AUTHORITY_PATH), authority);
    for (const suite of SUITES) {
      const target = join(fixtureRoot, suite.file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, "// fixture target\n");
    }
    writeFileSync(authority, `${readFileSync(authority, "utf8")}\nfixture tamper\n`);
    writeFileSync(child, `
import assert from "node:assert/strict";
import { validateWindowsAssuranceVerifyRegistration } from "./plugins/pipeline-core/lib/windows-assurance-verify-registration.mjs";
const result = validateWindowsAssuranceVerifyRegistration({
  schema: "pipeline.windows-assurance-verify-registration.v1",
  taskId: "pipeline.windows-assurance-verify-binding",
  authority: { matrix: { path: "specs/2026-07-19-sprint-sentinel-epic/windows-trusted-tool-resolution-ac-matrix.md", sha256: "0b1a6c9256b7a517e95f401d6d86a75e5ce6d6ff87a61ded012ec7e672cf3a2e" } },
  suites: [
    { name: "trusted-tool-resolution-tests", file: "plugins/pipeline-core/lib/trusted-tool-resolution.test.mjs" },
    { name: "advisory-receipt-assurance-tests", file: "plugins/pipeline-core/lib/advisory-receipt-assurance.test.mjs" },
    { name: "toolchain-preflight-tests", file: "plugins/pipeline-core/scripts/toolchain-preflight.test.mjs" },
  ],
});
assert.deepEqual(result, { ok: false, code: "WAVR-AUTHORITY-DRIFT" });
`);
    const result = spawnSync(process.execPath, [child], { cwd: fixtureRoot, encoding: "utf8" });
    return result.status === 0 && result.stderr === "";
  } catch {
    return false;
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

check("WAVR18 detects a tampered authority matrix from the validator fixture root", authorityDriftFixture());

/** Every LOCAL module the copied verify.mjs pulls in at load time, repo-relative.
 *  verify.mjs is TP-3-protected, so the fixture — never verify.mjs — carries this list, and the
 *  list is enumerated by hand and therefore stale-able: a module added to verify.mjs's import
 *  graph without an entry here kills the spawned child at import, before it can write any
 *  evidence. That must NOT read as "verify produced the wrong evidence" (precedent: commit
 *  aabfe7e, SVR28, same defect class) — assertFixtureReachedVerify below gives it its own name.
 *  The journal is stubbed (JOURNAL_STUB_SOURCE), so this list stops at verify.mjs's own imports
 *  plus their local dependencies; copying the real verify-journal.mjs would drag 18 further
 *  modules into the list for a function this fixture proves is never called. */
const FIXTURE_MODULES = Object.freeze([
  "harness/scripts/check-verify-suite-registration.mjs", // duplicateSuiteIds
  "harness/scripts/manual-check-logic.mjs", // imported by verify.mjs for the manual-check step
  "harness/scripts/verify-evidence-writer.mjs", // writeEvidenceAtomic (NVA-B-EVSLOTFIXTURE-1)
  "plugins/pipeline-core/lib/project-authority.mjs", // resolveAuthorityArtifactPath (ADR-0054)
  "plugins/pipeline-core/lib/scoped-verify-registration.mjs",
  "plugins/pipeline-core/lib/verify-resume.mjs",
  "plugins/pipeline-core/lib/windows-assurance-verify-registration.mjs",
  "plugins/pipeline-core/lib/worktree-lifecycle.mjs", // via project-authority.mjs
  "plugins/pipeline-core/lib/windows-private-state.mjs", // via worktree-lifecycle.mjs
  "plugins/pipeline-core/lib/nova-candidate-freeze.mjs",
  "plugins/pipeline-core/lib/review-economy.mjs", // via nova-candidate-freeze.mjs
]);
const JOURNAL_STUB_REL_PATH = "plugins/pipeline-core/scripts/verify-journal.mjs";
const JOURNAL_STUB_SOURCE = 'export function runVerifyJournal() { throw new Error("journal must not run after windows-assurance-registration failure"); }\n';
/** Targets of the SCOPED registration only. The three Windows-assurance targets (SUITES) are
 *  deliberately absent — their absence is what makes windows-assurance-verify-registration the
 *  first failing step, i.e. exactly the property WAVR19 pins. */
const FIXTURE_SCOPED_TARGETS = Object.freeze([
  "plugins/pipeline-core/lib/scoped-verify-registration.test.mjs",
  "plugins/pipeline-core/lib/workflow-preflight.test.mjs",
  "plugins/pipeline-core/lib/interaction-continuity.test.mjs",
]);

/** A fixture defect that must never be reported as a failed property. */
class FixtureCause extends Error {}

function boundedStderr(stderr, lines = 6) {
  return String(stderr ?? "").split("\n").filter(Boolean).slice(0, lines).join(" | ");
}

/** Separates "the fixture could not even run verify" from "verify ran and wrote wrong evidence".
 *  Without this the two are indistinguishable: both used to return a bare false. */
function assertFixtureReachedVerify(result, evidenceExists) {
  if (result.error) throw new FixtureCause(`WAVR19-CHILD-NOT-SPAWNED: ${result.error.message}`);
  if (/ERR_MODULE_NOT_FOUND|Cannot find (module|package)/.test(String(result.stderr ?? ""))) {
    throw new FixtureCause(
      `WAVR19-FIXTURE-MODULES-STALE: the copied verify.mjs imports a module FIXTURE_MODULES does not carry, so the child died at import. child stderr: ${boundedStderr(result.stderr)}`,
    );
  }
  if (!evidenceExists) {
    throw new FixtureCause(
      `WAVR19-NO-EVIDENCE: the child wrote no evidence artifact at all (exit ${result.status}). child stderr: ${boundedStderr(result.stderr)}`,
    );
  }
}

/** Runs a fixture so a named cause reaches the operator instead of an unexplained FAIL. */
function fixtureHolds(name, fixture) {
  try {
    return fixture() === true;
  } catch (error) {
    const cause = error instanceof FixtureCause ? error.message : `WAVR19-FIXTURE-THREW: ${error?.stack ?? error}`;
    console.error(`CAUSE ${name}: ${cause}`);
    return false;
  }
}

function windowsAssuranceRegistrationFailureFixture() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "windows-assurance-verify-registration-"));
  const writer = join(fixtureRoot, "harness", "scripts", "verify.mjs");
  const prd = join(fixtureRoot, "specs", "2026-07-19-sprint-sentinel-epic", "prd_sentinel-epic.md");
  const authority = join(fixtureRoot, AUTHORITY_PATH);
  const evidencePath = join(fixtureRoot, "evidence", "verify-latest.json");

  try {
    // Real git topology, not a bare tmpdir: the copied verify.mjs's own
    // gitCommonDirectory() call must resolve, or it throws
    // VERIFY-GIT-COMMON-DIR-UNAVAILABLE before writing any evidence at all
    // (backlog 2026-08-19-verify-registration-check-fixtures-lack-real-git-topology.md).
    // Deliberately a fresh, UNCOMMITTED `git init` (never `git worktree add` off this
    // checkout): candidateIdentity()'s `git rev-parse HEAD` then fails (unborn HEAD),
    // so startedCandidate.status is "unavailable", not "dirty" -- verify.mjs only
    // takes its fast candidate-preflight exit on "dirty", so this keeps the fixture
    // reaching the Windows-assurance registration check under test (WAVR19). It also
    // keeps this fixture root as its own primary root (gitCommonDirectory()'s
    // parent), so evidence still lands at THIS root's evidence/verify-latest.json,
    // never at the real checkout's shared evidence file.
    git(fixtureRoot, ["init", "--quiet"]);
    mkdirSync(dirname(writer), { recursive: true });
    mkdirSync(dirname(prd), { recursive: true });
    mkdirSync(dirname(authority), { recursive: true });
    copyFileSync(join(repoRoot, "harness", "scripts", "verify.mjs"), writer);
    for (const module of FIXTURE_MODULES) {
      const target = join(fixtureRoot, module);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(repoRoot, module), target);
    }
    const journalStub = join(fixtureRoot, JOURNAL_STUB_REL_PATH);
    mkdirSync(dirname(journalStub), { recursive: true });
    writeFileSync(journalStub, JOURNAL_STUB_SOURCE);
    copyFileSync(join(repoRoot, "specs", "2026-07-19-sprint-sentinel-epic", "prd_sentinel-epic.md"), prd);
    copyFileSync(join(repoRoot, AUTHORITY_PATH), authority);
    for (const suite of FIXTURE_SCOPED_TARGETS) {
      const target = join(fixtureRoot, suite);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, "// fixture target\n");
    }

    const result = spawnSync(process.execPath, [writer], { cwd: fixtureRoot, encoding: "utf8" });
    assertFixtureReachedVerify(result, existsSync(evidencePath));
    if (result.status === 0) return false;
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    return evidence.exitCode !== 0
      && evidence.steps.length === 1
      && evidence.steps[0].name === "windows-assurance-verify-registration"
      && evidence.steps[0].exitCode === 1;
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

check(
  "WAVR19 Verify fails before ordinary suites with a named Windows-assurance registration step",
  fixtureHolds("WAVR19", windowsAssuranceRegistrationFailureFixture),
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;

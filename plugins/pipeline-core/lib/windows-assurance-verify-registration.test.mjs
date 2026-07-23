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

function windowsAssuranceRegistrationFailureFixture() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "windows-assurance-verify-registration-"));
  const writer = join(fixtureRoot, "harness", "scripts", "verify.mjs");
  const scopedRegistration = join(fixtureRoot, "plugins", "pipeline-core", "lib", "scoped-verify-registration.mjs");
  const windowsRegistration = join(fixtureRoot, "plugins", "pipeline-core", "lib", "windows-assurance-verify-registration.mjs");
  const prd = join(fixtureRoot, "specs", "2026-07-19-sprint-sentinel-epic", "prd_sentinel-epic.md");
  const authority = join(fixtureRoot, AUTHORITY_PATH);
  const evidencePath = join(fixtureRoot, "evidence", "verify-latest.json");

  try {
    mkdirSync(dirname(writer), { recursive: true });
    mkdirSync(dirname(scopedRegistration), { recursive: true });
    mkdirSync(dirname(prd), { recursive: true });
    mkdirSync(dirname(authority), { recursive: true });
    copyFileSync(join(repoRoot, "harness", "scripts", "verify.mjs"), writer);
    copyFileSync(join(repoRoot, "plugins", "pipeline-core", "lib", "scoped-verify-registration.mjs"), scopedRegistration);
    copyFileSync(join(repoRoot, "plugins", "pipeline-core", "lib", "windows-assurance-verify-registration.mjs"), windowsRegistration);
    copyFileSync(join(repoRoot, "specs", "2026-07-19-sprint-sentinel-epic", "prd_sentinel-epic.md"), prd);
    copyFileSync(join(repoRoot, AUTHORITY_PATH), authority);
    for (const suite of [
      "plugins/pipeline-core/lib/scoped-verify-registration.test.mjs",
      "plugins/pipeline-core/lib/workflow-preflight.test.mjs",
      "plugins/pipeline-core/lib/interaction-continuity.test.mjs",
    ]) {
      const target = join(fixtureRoot, suite);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, "// fixture target\n");
    }

    const result = spawnSync(process.execPath, [writer], { cwd: fixtureRoot, encoding: "utf8" });
    if (result.status === 0 || !existsSync(evidencePath)) return false;
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    return evidence.exitCode !== 0
      && evidence.steps.length === 1
      && evidence.steps[0].name === "windows-assurance-verify-registration"
      && evidence.steps[0].exitCode === 1;
  } catch {
    return false;
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

check("WAVR19 Verify fails before ordinary suites with a named Windows-assurance registration step", windowsAssuranceRegistrationFailureFixture());

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;

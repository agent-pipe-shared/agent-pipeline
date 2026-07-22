#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateScopedVerifyRegistration } from "./scoped-verify-registration.mjs";

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

const TASK_ID = "pipeline.verify-gate-scoped-registration";
const PRD_PATH = "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md";
const PRD_SHA256 = "0c4b426c7b691b433cbc9a6963d8010e6c737efd00cb22c405a78b9d5743d5ca";
const SUITES = Object.freeze([
  Object.freeze({
    name: "scoped-verify-registration-tests",
    file: "plugins/pipeline-core/lib/scoped-verify-registration.test.mjs",
  }),
  Object.freeze({
    name: "workflow-preflight-tests",
    file: "plugins/pipeline-core/lib/workflow-preflight.test.mjs",
  }),
  Object.freeze({
    name: "interaction-continuity-tests",
    file: "plugins/pipeline-core/lib/interaction-continuity.test.mjs",
  }),
]);
const [SCOPED_SUITE, WORKFLOW_PREFLIGHT_SUITE, INTERACTION_CONTINUITY_SUITE] = SUITES;

function entry(overrides = {}) {
  return {
    schema: "pipeline.scoped-verify-registration.v1",
    taskId: TASK_ID,
    authority: { prd: { path: PRD_PATH, sha256: PRD_SHA256 } },
    suites: SUITES.map((suite) => ({ ...suite })),
    ...overrides,
  };
}

function accepts(value) {
  try {
    return validateScopedVerifyRegistration(value)?.ok === true;
  } catch {
    return false;
  }
}

function rejects(value) {
  try {
    return validateScopedVerifyRegistration(value)?.ok === false;
  } catch {
    return false;
  }
}

check("SVR01 accepts only the canonical three-suite SNT-7 registration bound to its PRD authority", accepts(entry()));

for (const field of ["schema", "taskId", "authority", "suites"]) {
  const { [field]: omitted, ...withoutField } = entry();
  check(`SVR02 missing top-level ${field} fails closed`, rejects(withoutField));
}
check("SVR03 extra top-level keys fail closed", rejects({ ...entry(), mutableRegistration: true }));
check("SVR04 wrong schema fails closed", rejects(entry({ schema: "pipeline.scoped-verify-registration.v0" })));

for (const field of ["prd"]) {
  const { [field]: omitted, ...withoutField } = entry().authority;
  check(`SVR05 missing authority ${field} fails closed`, rejects(entry({ authority: withoutField })));
}
check("SVR06 extra authority keys fail closed", rejects(entry({
  authority: { ...entry().authority, spec: { path: "specs/other.md", sha256: "a".repeat(64) } },
})));

for (const field of ["path", "sha256"]) {
  const { [field]: omitted, ...withoutField } = entry().authority.prd;
  check(`SVR07 missing PRD authority ${field} fails closed`, rejects(entry({
    authority: { prd: withoutField },
  })));
}
check("SVR08 extra PRD authority keys fail closed", rejects(entry({
  authority: { prd: { ...entry().authority.prd, mutable: false } },
})));
check("SVR09 wrong task binding fails closed", rejects(entry({ taskId: "pipeline.other-task" })));
check("SVR10 wrong PRD path binding fails closed", rejects(entry({
  authority: { prd: { ...entry().authority.prd, path: "specs/other-prd.md" } },
})));
check("SVR11 malformed PRD digest fails closed", rejects(entry({
  authority: { prd: { ...entry().authority.prd, sha256: "A".repeat(64) } },
})));

check("SVR12 absolute PRD paths fail closed", rejects(entry({
  authority: { prd: { ...entry().authority.prd, path: `/${PRD_PATH}` } },
})));
check("SVR13 traversal PRD paths fail closed", rejects(entry({
  authority: { prd: { ...entry().authority.prd, path: "specs/../prd_sentinel-epic.md" } },
})));
check("SVR14 absolute suite paths fail closed", rejects(entry({
  suites: [{ ...SCOPED_SUITE, file: `/${SCOPED_SUITE.file}` }, { ...WORKFLOW_PREFLIGHT_SUITE }, { ...INTERACTION_CONTINUITY_SUITE }],
})));
check("SVR15 traversal suite paths fail closed", rejects(entry({
  suites: [{ ...SCOPED_SUITE, file: "plugins/pipeline-core/lib/../scoped-verify-registration.test.mjs" }, { ...WORKFLOW_PREFLIGHT_SUITE }, { ...INTERACTION_CONTINUITY_SUITE }],
})));
check("SVR16 non-test suite targets fail closed", rejects(entry({
  suites: [{ ...SCOPED_SUITE, file: "plugins/pipeline-core/lib/scoped-verify-registration.mjs" }, { ...WORKFLOW_PREFLIGHT_SUITE }, { ...INTERACTION_CONTINUITY_SUITE }],
})));
check("SVR17 missing .test.mjs targets relative to the repository root fail closed", rejects(entry({
  suites: [{ ...SCOPED_SUITE, file: "plugins/pipeline-core/lib/missing-scoped-verify-target.test.mjs" }, { ...WORKFLOW_PREFLIGHT_SUITE }, { ...INTERACTION_CONTINUITY_SUITE }],
})));
check("SVR18 an arbitrary existing test path cannot replace an authorized SNT-7 suite", rejects(entry({
  suites: [
    { name: "runner-profile-migration-v2-tests", file: "plugins/pipeline-core/lib/runner-profile-migration-v2.test.mjs" },
    { ...WORKFLOW_PREFLIGHT_SUITE },
    { ...INTERACTION_CONTINUITY_SUITE },
  ],
})));

for (const omittedSuite of SUITES) {
  check(`SVR19 omitting authorized suite ${omittedSuite.name} fails closed`, rejects(entry({
    suites: SUITES.filter((suite) => suite !== omittedSuite).map((suite) => ({ ...suite })),
  })));
}
check("SVR20 adding a fourth otherwise-valid suite fails closed", rejects(entry({
  suites: [...SUITES.map((suite) => ({ ...suite })), {
    name: "runner-profile-migration-v2-tests",
    file: "plugins/pipeline-core/lib/runner-profile-migration-v2.test.mjs",
  }],
})));
check("SVR21 reordering the canonical allowlist fails closed", rejects(entry({
  suites: [{ ...WORKFLOW_PREFLIGHT_SUITE }, { ...SCOPED_SUITE }, { ...INTERACTION_CONTINUITY_SUITE }],
})));

const { name: suiteName, ...suiteWithoutName } = SCOPED_SUITE;
const { file: suiteFile, ...suiteWithoutFile } = SCOPED_SUITE;
check("SVR22 missing suite name fails closed", rejects(entry({
  suites: [suiteWithoutName, { ...WORKFLOW_PREFLIGHT_SUITE }, { ...INTERACTION_CONTINUITY_SUITE }],
})));
check("SVR23 missing suite file target fails closed", rejects(entry({
  suites: [suiteWithoutFile, { ...WORKFLOW_PREFLIGHT_SUITE }, { ...INTERACTION_CONTINUITY_SUITE }],
})));
check("SVR24 extra suite keys fail closed", rejects(entry({
  suites: [{ ...SCOPED_SUITE, enabled: true }, { ...WORKFLOW_PREFLIGHT_SUITE }, { ...INTERACTION_CONTINUITY_SUITE }],
})));
check("SVR25 an empty suite list fails closed", rejects(entry({ suites: [] })));
check("SVR26 a duplicate suite name fails closed", rejects(entry({
  suites: [{ ...SCOPED_SUITE }, { ...WORKFLOW_PREFLIGHT_SUITE, name: SCOPED_SUITE.name }, { ...INTERACTION_CONTINUITY_SUITE }],
})));
check("SVR27 a duplicate suite file fails closed", rejects(entry({
  suites: [{ ...SCOPED_SUITE }, { ...WORKFLOW_PREFLIGHT_SUITE, file: SCOPED_SUITE.file }, { ...INTERACTION_CONTINUITY_SUITE }],
})));

function scopedRegistrationFailureFixture() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "scoped-verify-registration-"));
  const writer = join(fixtureRoot, "harness", "scripts", "verify.mjs");
  const registration = join(fixtureRoot, "plugins", "pipeline-core", "lib", "scoped-verify-registration.mjs");
  const prd = join(fixtureRoot, PRD_PATH);
  const evidencePath = join(fixtureRoot, "evidence", "verify-latest.json");

  try {
    mkdirSync(dirname(writer), { recursive: true });
    mkdirSync(dirname(registration), { recursive: true });
    mkdirSync(dirname(prd), { recursive: true });
    copyFileSync(join(repoRoot, "harness", "scripts", "verify.mjs"), writer);
    copyFileSync(join(repoRoot, "plugins", "pipeline-core", "lib", "scoped-verify-registration.mjs"), registration);
    copyFileSync(join(repoRoot, PRD_PATH), prd);

    const result = spawnSync(process.execPath, [writer], { cwd: fixtureRoot, encoding: "utf8" });
    if (result.status === 0 || !existsSync(evidencePath)) return false;
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    return evidence.exitCode !== 0
      && evidence.steps.length === 1
      && evidence.steps[0].name === "scoped-verify-registration"
      && evidence.steps[0].exitCode === 1;
  } catch {
    return false;
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

check("SVR28 Verify writes only the failed scoped-registration evidence when its registered target is absent", scopedRegistrationFailureFixture());

function prdDriftFixture() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const fixtureRoot = mkdtempSync(join(tmpdir(), "scoped-verify-registration-prd-drift-"));
  const registration = join(fixtureRoot, "plugins", "pipeline-core", "lib", "scoped-verify-registration.mjs");
  const suiteTarget = join(fixtureRoot, SCOPED_SUITE.file);
  const prd = join(fixtureRoot, PRD_PATH);
  const child = join(fixtureRoot, "validate-prd-drift.mjs");

  try {
    mkdirSync(dirname(registration), { recursive: true });
    mkdirSync(dirname(suiteTarget), { recursive: true });
    mkdirSync(dirname(prd), { recursive: true });
    copyFileSync(join(repoRoot, "plugins", "pipeline-core", "lib", "scoped-verify-registration.mjs"), registration);
    copyFileSync(join(repoRoot, SCOPED_SUITE.file), suiteTarget);
    copyFileSync(join(repoRoot, PRD_PATH), prd);
    writeFileSync(prd, `${readFileSync(prd, "utf8")}\nfixture tamper\n`);
    writeFileSync(child, `
import assert from "node:assert/strict";
import { validateScopedVerifyRegistration } from "./plugins/pipeline-core/lib/scoped-verify-registration.mjs";
const result = validateScopedVerifyRegistration({
  schema: "pipeline.scoped-verify-registration.v1",
  taskId: "pipeline.verify-gate-scoped-registration",
  authority: { prd: { path: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md", sha256: "0c4b426c7b691b433cbc9a6963d8010e6c737efd00cb22c405a78b9d5743d5ca" } },
  suites: [
    { name: "scoped-verify-registration-tests", file: "plugins/pipeline-core/lib/scoped-verify-registration.test.mjs" },
    { name: "workflow-preflight-tests", file: "plugins/pipeline-core/lib/workflow-preflight.test.mjs" },
    { name: "interaction-continuity-tests", file: "plugins/pipeline-core/lib/interaction-continuity.test.mjs" },
  ],
});
assert.deepEqual(result, { ok: false, code: "SVR-PRD-DRIFT" });
`);

    const result = spawnSync(process.execPath, [child], { cwd: fixtureRoot, encoding: "utf8" });
    return result.status === 0 && result.stderr === "";
  } catch {
    return false;
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

check("SVR29 detects a tampered canonical PRD from the validator fixture root", prdDriftFixture());

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;

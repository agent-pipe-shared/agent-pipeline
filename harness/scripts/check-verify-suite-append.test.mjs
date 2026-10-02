// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkVerifySuiteAppend, evaluateSignedHistoryRestoration } from "./check-verify-suite-append.mjs";
import { evaluateVerifySuiteAppend } from "../../plugins/pipeline-core/lib/verify-suite-append-policy.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "verify-suite-append-history-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const registry = (suites) => JSON.stringify({ schema: "pipeline.verify-suites.v1", suites });
  const suite = (name) => ({ name, file: `${name}.test.mjs` });
  const writeRegistry = (names) => writeFileSync(join(root, "harness", "verify-suites.json"),
    registry(names.map(suite)));
  const writeConfig = (protectedTestPaths) => writeFileSync(join(root, "project", "guard-config.json"),
    JSON.stringify({ protectedTestPaths }));
  const tp13 = { id: "TP-13", pattern: "harness/verify-suites\\.json$" };
  const commit = (message) => { git("add", "."); git("-c", "user.name=Test", "-c",
    "user.email=test@example.invalid", "commit", "-m", message); };
  try {
    mkdirSync(join(root, "harness"));
    mkdirSync(join(root, "project"));
    git("init", "-q");
    writeRegistry(["a"]);
    writeConfig([]);
    commit("initial");
    return run({ root, git, writeRegistry, writeConfig, tp13, commit });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("uncommitted TP-13 checks the exact proposed append, not merely a valid JSON file", () => fixture((f) => {
  f.writeConfig([f.tp13]);
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).ok, true);
  f.writeRegistry(["a", "b"]);
  assert.deepEqual(checkVerifySuiteAppend({ rootDir: f.root }),
    { ok: true, code: "VSA-UNCOMMITTED-INTRODUCTION", checked: 1, appended: 1 });
  f.writeRegistry(["z", "b"]);
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
}));

test("every committed edit after TP-13 is checked, even if a later append masks a rewrite", () => fixture((f) => {
  f.writeConfig([f.tp13]);
  f.writeRegistry(["a", "b"]);
  f.commit("introduce protected append");
  f.writeRegistry(["a", "b", "c"]);
  f.commit("another append");
  assert.deepEqual(checkVerifySuiteAppend({ rootDir: f.root }),
    { ok: true, code: "VSA-HISTORY-APPEND-ONLY", checked: 2 });
  f.writeRegistry(["z", "b", "c", "d"]);
  f.commit("rewrite old registration");
  f.writeRegistry(["z", "b", "c", "d", "e"]);
  f.commit("later append");
  assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
}));

const OID = "a".repeat(40);
const entry = {
  schema: "pipeline.verify-suite-history-recovery-entry.v1",
  integrationCommit: OID,
  integrationParent: "c".repeat(40),
  integrationIntentSha256: "b".repeat(64),
  parentRegistryBlobOid: "d".repeat(40),
  defectRegistryBlobOid: "e".repeat(40),
  priorSuiteCount: 87,
  appendedSuiteCount: 21,
};
const prior = Array.from({ length: 87 }, (_, i) => ({
  name: "prior-" + String(i).padStart(3, "0"),
  file: "prior-" + String(i).padStart(3, "0") + ".test.mjs",
}));
const additions = Array.from({ length: 21 }, (_, i) => ({
  name: "new-" + String(i).padStart(3, "0"),
  file: "new-" + String(i).padStart(3, "0") + ".test.mjs",
}));
const registry = (suites) => JSON.stringify({ schema: "pipeline.verify-suites.v1", suites }, null, 2) + "\n";
const defectRows = [...prior.slice(0, 40), ...additions, ...prior.slice(40)];
const common = {
  entry,
  integrationCommit: entry.integrationCommit,
  integrationParent: entry.integrationParent,
  parentRegistryBlobOid: entry.parentRegistryBlobOid,
  defectRegistryBlobOid: entry.defectRegistryBlobOid,
  parentBytes: registry(prior),
  defectBytes: registry(defectRows),
  candidateBytes: registry([...prior, ...additions]),
  integrationVerified: true,
};
const evaluate = (overrides = {}) => evaluateSignedHistoryRestoration({ ...common, ...overrides });

test("exact signed b7 witness reconstructs the prefix accepted by the unchanged append policy", () => {
  const result = evaluate();
  assert.equal(result.code, "VSA-RECOVERY-VERIFIED");
  assert.equal(result.priorSuiteCount, 87);
  assert.equal(result.appendedSuiteCount, 21);
  assert.equal(evaluateVerifySuiteAppend({ beforeBytes: common.parentBytes, afterBytes: result.restoredBytes }).appended, 21);
});

test("missing public proof and wrong commit, parent, or registry preimage bindings fail closed", () => {
  assert.equal(evaluate({ integrationVerified: false }).code, "VSA-RECOVERY-AUTHORIZATION");
  assert.equal(evaluate({ integrationCommit: "f".repeat(40) }).code, "VSA-RECOVERY-AUTHORIZATION");
  assert.equal(evaluate({ integrationParent: "f".repeat(40) }).code, "VSA-RECOVERY-AUTHORIZATION");
  assert.equal(evaluate({ parentRegistryBlobOid: "f".repeat(40) }).code, "VSA-RECOVERY-AUTHORIZATION");
  assert.equal(evaluate({ defectRegistryBlobOid: "f".repeat(41) }).code, "VSA-RECOVERY-AUTHORIZATION");
});

test("changed or dropped historical row cannot qualify as ordering-only", () => {
  const altered = [...defectRows];
  altered[10] = { ...altered[10], invariantPinned: "changed" };
  assert.equal(evaluate({ defectBytes: registry(altered) }).code, "VSA-RECOVERY-NOT-ORDERING-ONLY");
  assert.equal(evaluate({ defectBytes: registry(defectRows.slice(1)) }).code, "VSA-RECOVERY-SHAPE");
});

test("candidate must restore original order and preserve b7 addition order without duplicate identities", () => {
  assert.equal(evaluate({ candidateBytes: registry([...prior, ...additions].reverse()) }).code, "VSA-RECOVERY-CANDIDATE-MISMATCH");
  assert.equal(evaluate({ candidateBytes: registry([...prior, ...additions.slice().reverse()]) }).code, "VSA-RECOVERY-CANDIDATE-MISMATCH");
  const duplicate = [...prior, ...additions, { name: prior[0].name, file: "other.test.mjs" }];
  assert.equal(evaluate({ candidateBytes: registry(duplicate) }).code, "VSA-RECOVERY-DUPLICATE-IDENTITY");
  const duplicateFile = [...prior, ...additions, { name: "other-name", file: prior[0].file }];
  assert.equal(evaluate({ candidateBytes: registry(duplicateFile) }).code, "VSA-RECOVERY-DUPLICATE-IDENTITY");
});

test("missing restoration and an unrelated historical commit are not accepted", () => {
  assert.equal(evaluate({ candidateBytes: registry(defectRows) }).code, "VSA-RECOVERY-CANDIDATE-MISMATCH");
  const sameShapeWrongRestoration = [{ name: "unrelated", file: "unrelated.test.mjs" }, ...prior.slice(1), ...additions];
  assert.equal(sameShapeWrongRestoration.length, prior.length + additions.length);
  assert.equal(evaluate({ candidateBytes: registry(sameShapeWrongRestoration) }).code, "VSA-RECOVERY-CANDIDATE-MISMATCH");
  assert.equal(evaluate({ integrationCommit: "f".repeat(40) }).code, "VSA-RECOVERY-AUTHORIZATION");
});

test("full history traversal refuses a rewrite when recovery is missing or invalid", () => {
  const invalidRecovery = JSON.stringify({
    schema: "pipeline.verify-suite-history-recovery.v1",
    entries: [{ ...entry, integrationCommit: "f".repeat(41) }],
  });
  for (const recoveryContents of [null, invalidRecovery]) fixture((f) => {
    f.writeConfig([f.tp13]);
    f.writeRegistry(["a", "b"]);
    f.commit("introduce protected append");
    f.writeRegistry(["z", "b", "c"]);
    f.commit("unrelated historical rewrite");
    f.writeRegistry(["z", "b", "c", "d"]);
    f.commit("later append that must not mask rewrite");
    if (recoveryContents !== null) {
      writeFileSync(join(f.root, "harness", "verify-suite-history-recovery.json"), recoveryContents);
    }
    assert.equal(checkVerifySuiteAppend({ rootDir: f.root }).code, "VSA-PRIOR-ENTRY-CHANGED");
  });
});

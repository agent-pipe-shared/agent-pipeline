// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validateCriticDiagnostic, inspectCriticVerifyDiagnostic } from "./critic-diagnostic-evidence.mjs";
import { produceCriticDiagnostic } from "./critic-diagnostic-producer.mjs";
import { planVerifySelection, verifyEvidenceSatisfiesBoundary } from "./verify-selection.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "critic-diagnostic-"));
  git(root, ["init", "-q"]);
  writeFileSync(join(root, "spec.md"), "Frozen specification\n");
  writeFileSync(join(root, "guard.md"), "Frozen guardrail\n");
  writeFileSync(join(root, ".gitignore"), "evidence/\n");
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  return { root, candidate: { commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) } };
}
const options = f => ({ root: f.root, specPath: "spec.md", guardrailPaths: ["guard.md"], command: [process.execPath, "-e", "console.log('actual targeted diagnostic'); process.exit(1)"], logPath: "evidence/targeted.log" });
test("producer captures real failed targeted result while full Verify remains explicitly not-run", () => {
  const f = fixture();
  try {
    const value = produceCriticDiagnostic(options(f));
    assert.equal(value.targeted.exitCode, 1);
    assert.equal(value.targeted.status, "failed");
    assert.equal(value.fullVerify.status, "not-run");
    assert.deepEqual(value.pending, ["full-verify"]);
    assert.match(readFileSync(join(f.root, value.targeted.log.path), "utf8"), /actual targeted diagnostic/u);
    assert.equal(validateCriticDiagnostic(value, f).targeted.status, "failed");
    for (const boundary of ["candidate", "push", "release"]) assert.equal(verifyEvidenceSatisfiesBoundary(value, boundary), false);
    for (const mutate of [v => { v.extra = true; }, v => { v.candidate.tree = "f".repeat(40); }, v => { v.spec.sha256 = "f".repeat(64); }, v => { v.guardrails[0].sha256 = "f".repeat(64); }, v => { v.targeted.exitCode = 0; }, v => { v.targeted.log.sha256 = "f".repeat(64); }, v => { v.pending = []; }, v => { v.targeted.log.path = "../escape"; }]) {
      const changed = structuredClone(value); mutate(changed);
      assert.throws(() => validateCriticDiagnostic(changed, f));
    }
    writeFileSync(join(f.root, value.targeted.log.path), "tampered");
    assert.throws(() => validateCriticDiagnostic(value, f), /CDI-DIGEST/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("failed canonical Verify diagnostics preserve selection validation and cannot qualify final boundaries", () => {
  const f = fixture();
  try {
    const value = { schema: "pipeline.verify-evidence.v0", ...f.candidate, exitCode: 1, steps: [{ name: "check", exitCode: 1 }], selection: planVerifySelection({ mode: "critic", candidateCommit: f.candidate.commit, registeredSuiteIds: ["check"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["check"], areas: [{ id: "all", paths: ["**"], suites: ["check"] }] } }) };
    assert.equal(inspectCriticVerifyDiagnostic(value, f.candidate).status, "failed");
    for (const boundary of ["critic", "candidate", "push", "release"]) assert.equal(verifyEvidenceSatisfiesBoundary(value, boundary), false);
    assert.throws(() => inspectCriticVerifyDiagnostic({ ...value, steps: [] }, f.candidate));
    assert.throws(() => inspectCriticVerifyDiagnostic({ ...value, selection: { ...value.selection, selectionSha256: "f".repeat(64) } }, f.candidate));
    mkdirSync(join(f.root, "evidence")); writeFileSync(join(f.root, "evidence/full.json"), JSON.stringify(value));
    const diagnostic = produceCriticDiagnostic({ ...options(f), fullVerifyPath: "evidence/full.json" });
    assert.equal(diagnostic.fullVerify.status, "failed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("CLI emits honest evidence and refuses missing execution, stale/dirty input and output overwrite", () => {
  const f = fixture();
  try {
    const script = resolve("plugins/pipeline-core/scripts/critic-diagnostic-evidence.mjs");
    const args = [script, "--root", f.root, "--spec", "spec.md", "--guardrail", "guard.md", "--log", "evidence/cli.log", "--out", "evidence/cli.json", "--", process.execPath, "-e", "process.exit(2)"];
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).releaseQualified, false);
    assert.equal(JSON.parse(readFileSync(join(f.root, "evidence/cli.json"))).targeted.exitCode, 2);
    assert.notEqual(spawnSync(process.execPath, args).status, 0);
    assert.throws(() => produceCriticDiagnostic({ ...options(f), command: ["pipeline-test-nonexistent-executable"] }));
    writeFileSync(join(f.root, "spec.md"), "dirty");
    assert.throws(() => produceCriticDiagnostic(options(f)), /CDI-DIRTY-CANDIDATE/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

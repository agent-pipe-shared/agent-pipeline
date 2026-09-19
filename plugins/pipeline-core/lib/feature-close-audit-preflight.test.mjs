// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { planFeatureCloseAudit } from "./feature-close-audit-preflight.mjs";
import { buildAuditBundle } from "./audit-bundle.mjs";
import { planVerifySelection } from "./verify-selection.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const pack = { schema: "pipeline.organization-policy-pack.v1", packId: "security-baseline", revision: "a".repeat(64), compatibility: { minimumCoreVersion: "0.4.0", maximumCoreVersion: "0.5.0" }, governanceFloors: { requireHumanDecisionLedger: true, allowExternalAuthority: false }, documentClasses: [{ class: "security", mode: "controlled-publication", approvalRequired: true }] };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "feature close audit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } }).trim();
  git(["init", "-q"]); git(["commit", "--allow-empty", "-qm", "candidate"]);
  const candidate = { commit: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]) };
  const featureId = "feature-fixture", base = `specs/${featureId}`;
  mkdirSync(join(root, base), { recursive: true });
  const evidence = { schema: "pipeline.verify-evidence.v0", ...candidate, candidate, exitCode: 0, selection: planVerifySelection({ mode: "candidate", candidateCommit: candidate.commit, registeredSuiteIds: ["test"], policy: { schema: "pipeline.verify-selection.v1", baseline: ["test"], areas: [{ id: "all", paths: ["**"], suites: ["test"] }] } }) };
  const artifacts = [["prd", "prd.md", "prd"], ["spec", "spec.md", "spec"], ["acceptance", "acceptance.md", "accepted"], ["result", "result.md", "completed result"], ["candidate-evidence", "candidate.json", JSON.stringify(evidence)]].map(([kind, file, bytes]) => {
    writeFileSync(join(root, base, file), bytes);
    return { class: kind, path: `${base}/${file}`, sha256: digest(bytes), authority: ["prd", "spec"].includes(kind), mutability: kind === "candidate-evidence" ? "immutable" : "mutable", retention: "active" };
  });
  const manifestPath = `${base}/lifecycle.json`;
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: featureId, rigor: 1 }, state: "completed", artifacts, candidate, supersedes: null };
  const save = () => writeFileSync(join(root, manifestPath), JSON.stringify(manifest)); save();
  return { root, git, manifest, save, options: { repositoryRoot: root, featureId, candidate, manifestPath, coreVersion: "0.4.7", packs: [pack] } };
}

test("read-only plan binds candidate, Result and policy; identical bundle retry is verified without overwrite", async t => {
  const f = fixture(t), plan = await planFeatureCloseAudit(f.options);
  assert.equal(plan.status, "build-required", JSON.stringify(plan));
  assert.equal(plan.outputPath, `audit-bundles/feature-fixture/${f.options.candidate.commit}`);
  assert.equal(plan.requiresAdditionalApproval, false);
  assert.equal(existsSync(join(f.root, "audit-bundles")), false);
  mkdirSync(join(f.root, "audit-bundles/feature-fixture"), { recursive: true });
  await buildAuditBundle({ repositoryRoot: f.root, outputPath: plan.outputPath, plan: plan.bundlePlan });
  const before = readFileSync(join(f.root, plan.outputPath, "manifest.json"));
  const replay = await planFeatureCloseAudit(f.options);
  assert.equal(replay.status, "reuse-verified", JSON.stringify(replay));
  assert.equal(replay.planSha256, plan.planSha256);
  assert.equal(replay.existingManifestSha256, digest(before));
  assert.deepEqual(readFileSync(join(f.root, plan.outputPath, "manifest.json")), before);
  writeFileSync(join(f.root, plan.outputPath, "README.md"), "tampered");
  assert.equal((await planFeatureCloseAudit(f.options)).code, "FCA-OUTPUT-COLLISION");
});

test("missing policy is actionable, no fabricated defaults or extra signature", async t => {
  const f = fixture(t), result = await planFeatureCloseAudit({ ...f.options, packs: [] });
  assert.equal(result.code, "FCA-POLICY-REQUIRED"); assert.match(result.remedy, /do not invent/u);
  assert.equal(result.requiresAdditionalApproval, false);
});

test("candidate changes, incomplete Result, stale or diagnostic Verify do not qualify", async t => {
  const f = fixture(t);
  for (const state of ["draft", "verifying"]) { f.manifest.state = state; f.save(); assert.equal((await planFeatureCloseAudit(f.options)).code, "FCA-PACKAGE"); }
  f.manifest.state = "completed"; f.save();
  const evidence = f.manifest.artifacts.find(a => a.class === "candidate-evidence");
  writeFileSync(join(f.root, evidence.path), "{}"); evidence.sha256 = digest("{}"); f.save();
  assert.equal((await planFeatureCloseAudit(f.options)).code, "FCA-QUALIFICATION");
  f.git(["commit", "--allow-empty", "-qm", "later candidate"]);
  assert.equal((await planFeatureCloseAudit(f.options)).code, "FCA-CANDIDATE-CHANGED");
});

test("unsafe feature/output paths, symlinks and interrupted output remain unmodified", async t => {
  const f = fixture(t);
  for (const featureId of ["../escape", "a/b", "C:drive", ".."]) assert.equal((await planFeatureCloseAudit({ ...f.options, featureId })).code, "FCA-FEATURE-ID");
  for (const outputPath of ["../escape", "/absolute", "a/../b", "C:/drive"]) assert.equal((await planFeatureCloseAudit({ ...f.options, outputPath })).code, "FCA-UNSAFE-PATH");
  mkdirSync(join(f.root, "partial")); writeFileSync(join(f.root, "partial/foreign.txt"), "keep");
  assert.equal((await planFeatureCloseAudit({ ...f.options, outputPath: "partial" })).status, "blocked");
  assert.equal(readFileSync(join(f.root, "partial/foreign.txt"), "utf8"), "keep");
  symlinkSync(join(f.root, "partial"), join(f.root, "alias"));
  assert.equal((await planFeatureCloseAudit({ ...f.options, outputPath: "alias/new" })).code, "FCA-SYMLINK");
});

test("existing internally consistent bundle with different policy is not reused", async t => {
  const f = fixture(t), plan = await planFeatureCloseAudit(f.options);
  mkdirSync(join(f.root, "audit-bundles/feature-fixture"), { recursive: true });
  await buildAuditBundle({ repositoryRoot: f.root, outputPath: plan.outputPath, plan: plan.bundlePlan });
  const alternate = { ...pack, revision: "b".repeat(64) };
  assert.equal((await planFeatureCloseAudit({ ...f.options, packs: [alternate] })).code, "FCA-OUTPUT-COLLISION");
});

test("missing package, empty Result and malformed policy remain preparation failures", async t => {
  const f = fixture(t);
  assert.equal((await planFeatureCloseAudit({ ...f.options, manifestPath: "specs/feature-fixture/missing.json" })).code, "FCA-PACKAGE");
  assert.equal((await planFeatureCloseAudit({ ...f.options, packs: [{}] })).status, "blocked");
  const result = f.manifest.artifacts.find(a => a.class === "result");
  writeFileSync(join(f.root, result.path), ""); result.sha256 = digest(""); f.save();
  assert.equal((await planFeatureCloseAudit(f.options)).code, "FCA-RESULT");
});

// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildEvidenceViewModel, buildEvidenceViewModelFromFeaturePackage } from "./evidence-view-model.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
function packageFixture({ corrupt = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "evidence-view-model-")); const id = "viewer-fixture"; const base = join(root, "specs", id); mkdirSync(base, { recursive: true });
  const files = [["prd.md", "prd"], ["spec.md", "spec"], ["acceptance.md", "acceptance"], ["result.md", "result"], ["evidence.json", "evidence"]];
  for (const [path, bytes] of files) writeFileSync(join(base, path), bytes);
  const artifacts = files.map(([path, bytes], index) => ({ class: ["prd", "spec", "acceptance", "result", "candidate-evidence"][index], path: `specs/${id}/${path}`, sha256: corrupt && index === 0 ? "f".repeat(64) : hash(bytes), authority: index < 2, mutability: index === 4 ? "immutable" : "mutable", retention: "active" }));
  writeFileSync(join(base, "lifecycle.json"), `${JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state: "completed", artifacts, candidate, supersedes: null })}\n`);
  return { root, manifest: `specs/${id}/lifecycle.json` };
}

test("renders only candidate-bound non-authoritative explicit evidence", () => {
  const model = buildEvidenceViewModel({ candidate, status: "pass", artifacts: [{ path: "specs/result.md", sha256: "c".repeat(64), state: "verified" }] });
  assert.equal(model.authority, "non-authoritative"); assert.equal(model.schema, "pipeline.evidence-view-model.v1");
});
test("rejects open or unbound explicit viewer input", () => {
  const input = { candidate, status: "pass", artifacts: [{ path: "specs/result.md", sha256: "c".repeat(64), state: "verified" }] };
  assert.throws(() => buildEvidenceViewModel({ ...input, approval: true })); assert.throws(() => buildEvidenceViewModel({ ...input, candidate: { commit: "bad", tree: "bad" } }));
});
test("projects only a valid complete feature package and keeps its success claim unknown", () => {
  const fixture = packageFixture(); const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest });
  assert.equal(model.schema, "pipeline.evidence-view-model.v2"); assert.equal(model.source.topology, "valid"); assert.equal(model.candidate.commit, candidate.commit); assert.equal(model.status, "unknown"); assert.equal(model.artifacts.length, 5); assert.equal(model.artifacts[0].state, "verified");
});
test("invalid topology is an invalid view with no candidate or artifact leak", () => {
  const fixture = packageFixture({ corrupt: true }); const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest });
  assert.equal(model.status, "invalid"); assert.equal(model.candidate.state, "unavailable"); assert.equal(model.artifacts.length, 0); assert.equal(model.notices[0].valueClass, "invalid");
});
// V-AC-08: the viewer represents the exact canonical lifecycle state, or a
// typed invalid/unavailable result -- never a nearby state it finds plausible.
function statefulFixture(state, { supersedes = null, withCandidate = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "evidence-view-state-")); const id = "viewer-fixture"; const base = join(root, "specs", id); mkdirSync(base, { recursive: true });
  const files = [["prd.md", "prd"], ["spec.md", "spec"], ["acceptance.md", "acceptance"], ["result.md", "result"], ["evidence.json", "evidence"]];
  for (const [path, bytes] of files) writeFileSync(join(base, path), bytes);
  const artifacts = files.map(([path, bytes], index) => ({ class: ["prd", "spec", "acceptance", "result", "candidate-evidence"][index], path: `specs/${id}/${path}`, sha256: hash(bytes), authority: index < 2, mutability: index === 4 ? "immutable" : "mutable", retention: "active" }));
  writeFileSync(join(base, "lifecycle.json"), `${JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state, artifacts, candidate: withCandidate ? candidate : null, supersedes })}\n`);
  return { root, manifest: `specs/${id}/lifecycle.json` };
}
test("V-AC-08 represents the exact canonical lifecycle state or a typed unavailable result", () => {
  for (const state of ["awaiting-approval", "approved", "implementing", "verifying", "completed"]) {
    const fixture = statefulFixture(state);
    const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest });
    assert.equal(model.feature.lifecycleState, state, state);
    assert.equal(model.source.topology, "valid", state);
    assert.equal(model.artifacts[0].lifecycleState, state, state);
  }
  for (const state of ["superseded", "retained"]) {
    const fixture = statefulFixture(state, { supersedes: "prior-feature" });
    const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest });
    assert.equal(model.feature.lifecycleState, state, state);
  }
  // `abandoned` is the one state that carries its own view status, and it is
  // still reported as itself rather than folded into a generic failure.
  const abandoned = buildEvidenceViewModelFromFeaturePackage(((fixture) => ({ rootDir: fixture.root, manifestPath: fixture.manifest }))(statefulFixture("abandoned")));
  assert.equal(abandoned.feature.lifecycleState, "abandoned");
  assert.equal(abandoned.status, "fail");
  // A state outside the canonical vocabulary is a typed invalid view, never a
  // nearby state and never a pass.
  const invented = statefulFixture("shipped");
  const rejected = buildEvidenceViewModelFromFeaturePackage({ rootDir: invented.root, manifestPath: invented.manifest });
  assert.equal(rejected.status, "invalid");
  assert.equal(rejected.feature.lifecycleState, "unavailable");
  assert.equal(rejected.candidate.state, "unavailable");
  assert.equal(rejected.artifacts.length, 0);
  // A missing package is unavailable, not absent-therefore-fine.
  const missing = buildEvidenceViewModelFromFeaturePackage({ rootDir: invented.root, manifestPath: "specs/nothing/lifecycle.json" });
  assert.equal(missing.status, "invalid");
  assert.equal(missing.feature.lifecycleState, "unavailable");
  // No lifecycle state ever produces a derived pass claim.
  for (const state of ["awaiting-approval", "approved", "implementing", "verifying", "completed"]) {
    const fixture = statefulFixture(state);
    assert.notEqual(buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest }).status, "pass", state);
  }
});
test("redacted package projection is deterministic and withholds artifact paths", () => {
  const fixture = packageFixture(); const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, sharing: "redacted" });
  assert.equal(model.source.manifest, null); assert.equal(model.artifacts[0].path, "artifact-1"); assert.equal(model.artifacts[0].sourcePath, null); assert.ok(model.notices.some((entry) => entry.valueClass === "redacted"));
});
test("projects explicitly supplied delivery observation without changing the candidate claim", () => {
  const fixture = packageFixture(); const exportObservation = { schema: "pipeline.governance-export-view-status.v1", destinationProfile: "audit", state: "retryable-failure", cursor: 2, lag: 3, receipt: { batchId: "batch-1", acknowledgementClass: "partial", terminalDisposition: "retryable-failure" } };
  const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation });
  assert.equal(model.status, "unknown"); assert.equal(model.exportStatus.state, "retryable-failure"); assert.equal(model.exportStatus.lag, 3);
  assert.throws(() => buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, exportObservation: { ...exportObservation, receipt: { raw: "forbidden" } } }), (error) => error.code === "EVM-EXPORT");
});

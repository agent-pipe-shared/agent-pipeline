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
test("redacted package projection is deterministic and withholds artifact paths", () => {
  const fixture = packageFixture(); const model = buildEvidenceViewModelFromFeaturePackage({ rootDir: fixture.root, manifestPath: fixture.manifest, sharing: "redacted" });
  assert.equal(model.source.manifest, null); assert.equal(model.artifacts[0].path, "artifact-1"); assert.equal(model.artifacts[0].sourcePath, null); assert.ok(model.notices.some((entry) => entry.valueClass === "redacted"));
});

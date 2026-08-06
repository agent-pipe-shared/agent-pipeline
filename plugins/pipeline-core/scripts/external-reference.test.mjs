// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { main } from "./external-reference.mjs";

const sha = (character) => character.repeat(64);
// The CLI resolves the artifact's canonical identity through the checkout's
// feature-package topology, so the fixture is a real package rather than a
// loose path.
const ARTIFACT = "specs/phoenix/prd_phoenix.md";
function featurePackage(root) {
  const bytes = "# Phoenix PRD\n";
  mkdirSync(join(root, "specs", "phoenix"), { recursive: true });
  writeFileSync(join(root, ARTIFACT), bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(root, "specs", "phoenix", "lifecycle.json"), `${JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id: "phoenix", rigor: 2 }, state: "draft", artifacts: [{ class: "prd", path: ARTIFACT, sha256, authority: true, mutability: "immutable", retention: "active" }], candidate: null, supersedes: null }, null, 2)}\n`);
  return sha256;
}
function input(root) {
  const artifactSha256 = featurePackage(root);
  const reference = { schema: "pipeline.external-reference.v1", systemClass: "issue-tracker", adapterProfile: "synthetic-issue", objectId: "issue-23", relation: "tracks", authorityDirection: "pipeline-to-external", pipelineArtifact: { path: ARTIFACT, sha256: artifactSha256 }, externalRevision: "rev-1", mode: "controlled-publication", freshness: { state: "fresh", observedAtEpochMs: 1 }, ownership: "pipeline-owned" };
  const capabilities = { schema: "pipeline.external-adapter-capabilities.v1", adapterProfile: "synthetic-issue", systemClass: "issue-tracker", operations: ["inspect", "preview", "apply", "readback", "reconcile"] };
  const desired = { requestId: "request-1", changes: [{ field: "summary", valueSha256: sha("b"), ownership: "pipeline-owned" }] };
  const inspection = { objectId: "issue-23", revision: "rev-1", state: "fresh" }; const preview = { previewDigest: sha("c") };
  for (const [name, value] of Object.entries({ "reference.json": reference, "capabilities.json": capabilities, "desired.json": desired, "inspection.json": inspection, "preview.json": preview })) writeFileSync(join(root, name), JSON.stringify(value));
}
test("previews one bounded external write using local synthetic observations", async () => {
  const root = mkdtempSync(join(tmpdir(), "external-reference-")); input(root);
  const result = await main(["preview", "--root", root, "--reference", "reference.json", "--capabilities", "capabilities.json", "--desired", "desired.json", "--inspection", "inspection.json", "--preview", "preview.json"]);
  assert.equal(result.status, "preview"); assert.equal(result.plan.requestId, "request-1");
  assert.equal(result.plan.pipelineArtifactIdentity.featureId, "phoenix");
  assert.equal(result.plan.pipelineArtifactIdentity.manifest, "specs/phoenix/lifecycle.json");
  assert.equal(result.plan.pipelineArtifactIdentity.lifecycleState, "draft");
});
test("refuses to preview a publication whose artifact no feature package binds", async () => {
  const root = mkdtempSync(join(tmpdir(), "external-reference-")); input(root);
  const reference = JSON.parse(readFileSync(join(root, "reference.json"), "utf8"));
  writeFileSync(join(root, "reference.json"), JSON.stringify({ ...reference, pipelineArtifact: { path: "specs/unbound.md", sha256: sha("a") } }));
  const result = await main(["preview", "--root", root, "--reference", "reference.json", "--capabilities", "capabilities.json", "--desired", "desired.json", "--inspection", "inspection.json", "--preview", "preview.json"]);
  assert.equal(result.status, "rejected"); assert.equal(result.reason, "canonical-identity");
});
test("reconciles read-only and rejects a path outside the checkout", async () => {
  const root = mkdtempSync(join(tmpdir(), "external-reference-")); input(root);
  const result = await main(["reconcile", "--root", root, "--reference", "reference.json", "--capabilities", "capabilities.json", "--inspection", "inspection.json"]);
  assert.equal(result.status, "current");
  await assert.rejects(main(["reconcile", "--root", root, "--reference", "../reference.json", "--capabilities", "capabilities.json", "--inspection", "inspection.json"]), (error) => error.code === "ERC-PATH");
});

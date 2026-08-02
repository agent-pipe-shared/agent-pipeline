// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { main } from "./external-reference.mjs";

const sha = (character) => character.repeat(64);
function input(root) {
  const reference = { schema: "pipeline.external-reference.v1", systemClass: "issue-tracker", adapterProfile: "synthetic-issue", objectId: "issue-23", relation: "tracks", authorityDirection: "pipeline-to-external", pipelineArtifact: { path: "specs/phoenix.md", sha256: sha("a") }, externalRevision: "rev-1", mode: "controlled-publication", freshness: { state: "fresh", observedAtEpochMs: 1 }, ownership: "pipeline-owned" };
  const capabilities = { schema: "pipeline.external-adapter-capabilities.v1", adapterProfile: "synthetic-issue", systemClass: "issue-tracker", operations: ["inspect", "preview", "apply", "readback", "reconcile"] };
  const desired = { requestId: "request-1", changes: [{ field: "summary", valueSha256: sha("b"), ownership: "pipeline-owned" }] };
  const inspection = { objectId: "issue-23", revision: "rev-1", state: "fresh" }; const preview = { previewDigest: sha("c") };
  for (const [name, value] of Object.entries({ "reference.json": reference, "capabilities.json": capabilities, "desired.json": desired, "inspection.json": inspection, "preview.json": preview })) writeFileSync(join(root, name), JSON.stringify(value));
}
test("previews one bounded external write using local synthetic observations", async () => {
  const root = mkdtempSync(join(tmpdir(), "external-reference-")); input(root);
  const result = await main(["preview", "--root", root, "--reference", "reference.json", "--capabilities", "capabilities.json", "--desired", "desired.json", "--inspection", "inspection.json", "--preview", "preview.json"]);
  assert.equal(result.status, "preview"); assert.equal(result.plan.requestId, "request-1");
});
test("reconciles read-only and rejects a path outside the checkout", async () => {
  const root = mkdtempSync(join(tmpdir(), "external-reference-")); input(root);
  const result = await main(["reconcile", "--root", root, "--reference", "reference.json", "--capabilities", "capabilities.json", "--inspection", "inspection.json"]);
  assert.equal(result.status, "current");
  await assert.rejects(main(["reconcile", "--root", root, "--reference", "../reference.json", "--capabilities", "capabilities.json", "--inspection", "inspection.json"]), (error) => error.code === "ERC-PATH");
});

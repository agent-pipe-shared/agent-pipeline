// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main } from "./evidence-viewer.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "evidence-viewer-")); const id = "viewer-cli"; const base = join(root, "specs", id); mkdirSync(base, { recursive: true }); const source = [["prd.md", "prd"], ["spec.md", "spec"], ["acceptance.md", "acceptance"], ["result.md", "result"], ["candidate.json", "candidate"]]; for (const [path, bytes] of source) writeFileSync(join(base, path), bytes);
  const artifacts = source.map(([path, bytes], index) => ({ class: ["prd", "spec", "acceptance", "result", "candidate-evidence"][index], path: `specs/${id}/${path}`, sha256: digest(bytes), authority: index < 2, mutability: index === 4 ? "immutable" : "mutable", retention: "active" }));
  writeFileSync(join(base, "lifecycle.json"), JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state: "completed", artifacts, candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, supersedes: null }));
  return { root, manifest: `specs/${id}/lifecycle.json` };
}
test("builds a new offline report with source links and a candidate-bound receipt", async () => {
  const input = fixture(); const receipt = await main(["build", "--root", input.root, "--manifest", input.manifest, "--output", "evidence/view.html"]); const report = join(input.root, "evidence/view.html");
  assert.equal(receipt.authority, "non-authoritative"); assert.equal(receipt.status, "unknown"); assert.equal(receipt.candidate.commit, "a".repeat(40)); assert.ok(existsSync(report)); assert.match(readFileSync(report, "utf8"), /\.\.\/specs\/viewer-cli\/prd\.md/); await assert.rejects(() => main(["build", "--root", input.root, "--manifest", input.manifest, "--output", "evidence/view.html"]), (error) => error.code === "EVC-OUTPUT-EXISTS");
});
test("creates a redacted report without canonical paths", async () => {
  const input = fixture(); await main(["build", "--root", input.root, "--manifest", input.manifest, "--output", "shared.html", "--sharing", "redacted"]); const html = readFileSync(join(input.root, "shared.html"), "utf8"); assert.match(html, /artifact-1/); assert.doesNotMatch(html, /specs\/viewer-cli\/prd\.md/);
});

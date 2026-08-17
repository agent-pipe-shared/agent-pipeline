// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main } from "./evidence-viewer.mjs";
import { buildEvidenceViewModelFromFeaturePackage } from "../lib/evidence-view-model.mjs";

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
test("renders a supplied local export observation without turning it into authority", async () => {
  const input = fixture(); writeFileSync(join(input.root, "export-status.json"), JSON.stringify({ schema: "pipeline.governance-export-view-status.v1", destinationProfile: "audit", state: "retryable-failure", cursor: 2, lag: 3, receipt: { batchId: "batch-1", acknowledgementClass: "partial", terminalDisposition: "retryable-failure" }, failureCount: null, quarantineCount: null, integrityGaps: null, recoveryState: null }));
  await main(["build", "--root", input.root, "--manifest", input.manifest, "--output", "export.html", "--export-status-file", "export-status.json"]);
  const html = readFileSync(join(input.root, "export.html"), "utf8"); assert.match(html, /Governance export observation/); assert.match(html, /retryable-failure/); assert.match(html, /non-authoritative transport observation/);
});
// V-AC-02: the CLI is the viewer's only path to a gate estimate. It loads an
// operator-supplied `{activeFeature, observation, evidence}` context, reads
// `gateEstimate` from the live State under the checkout root, and hands
// projectGateEstimate's result to the model, which renders it as its own
// `estimate` class. The CLI writes nothing and computes no range of its own.
const GATE_EVIDENCE_SHA = digest("estimate-evidence");
const ACTIVE_FEATURE = { id: "viewer-cli", planPath: "specs/viewer-cli/plan.md", phase: "design" };
function gateEstimateFixture({ withState = true } = {}) {
  const input = fixture();
  writeFileSync(join(input.root, "gate-estimate-context.json"), JSON.stringify({
    activeFeature: ACTIVE_FEATURE,
    observation: { ok: true, objectFormat: "sha1", sourceOid: "c".repeat(40) },
    evidence: {
      ok: true, path: "estimate-evidence.json", sha256: GATE_EVIDENCE_SHA,
      value: { schema: "pipeline.gate-estimate-evidence.v1", featureId: "viewer-cli", gate: "prd", observedAt: "2026-08-17T00:00:00.000Z", basis: [{ kind: "verify-run", reference: "evidence/verify.txt", digest: digest("verify") }], note: "coordinator-observed range" },
    },
  }));
  if (withState) {
    mkdirSync(join(input.root, ".claude"), { recursive: true });
    writeFileSync(join(input.root, ".claude", "pipeline-state.json"), JSON.stringify({
      activeFeature: ACTIVE_FEATURE,
      gateEstimate: { schema: "pipeline.gate-estimate.v1", id: "estimate-1", featureId: "viewer-cli", gate: "prd", objectFormat: "sha1", sourceOid: "c".repeat(40), evidence: { path: "estimate-evidence.json", sha256: GATE_EVIDENCE_SHA }, rangeMinutes: { min: 45, max: 120 }, recordedBy: "coordinator", recordedAt: "2026-08-17T00:00:00.000Z" },
    }));
  }
  return input;
}
test("V-AC-02 renders the live gate estimate as an estimate when the supplied context resolves", async () => {
  const input = gateEstimateFixture();
  await main(["build", "--root", input.root, "--manifest", input.manifest, "--output", "estimate.html", "--gate-estimate-context-file", "gate-estimate-context.json"]);
  const html = readFileSync(join(input.root, "estimate.html"), "utf8");
  assert.match(html, /Projected gate estimate/);
  assert.match(html, /data-value-class="estimate">prd</);
  assert.match(html, /data-value-class="estimate">45-120</);
  assert.match(html, /data-value-class="estimate">estimate<\/span> <code>EVM-GATE-ESTIMATE<\/code>/);
  // An estimate never becomes the report's own success claim.
  assert.match(html, /data-value-class="unknown">unknown</);
  assert.doesNotMatch(html, /data-value-class="fact">45-120</);
});
test("V-AC-02 reports an unresolvable gate estimate as unavailable instead of inventing one", async () => {
  const input = gateEstimateFixture({ withState: false });
  const receipt = await main(["build", "--root", input.root, "--manifest", input.manifest, "--output", "no-state.html", "--gate-estimate-context-file", "gate-estimate-context.json"]);
  const html = readFileSync(join(input.root, "no-state.html"), "utf8");
  assert.equal(receipt.status, "unknown");
  assert.match(html, /data-value-class="unavailable">unavailable</);
  assert.match(html, /CS-ETA-RECORD/);
  assert.doesNotMatch(html, /data-value-class="estimate"/);
  assert.doesNotMatch(html, /45-120/);
});
test("a missing, malformed, or escaping gate-estimate context is refused, and an absent flag stays not-applicable", async () => {
  const input = gateEstimateFixture();
  writeFileSync(join(input.root, "broken-context.json"), "{ not json");
  for (const [file, output] of [["absent-context.json", "a.html"], ["broken-context.json", "b.html"], ["../outside.json", "c.html"]]) {
    await assert.rejects(
      () => main(["build", "--root", input.root, "--manifest", input.manifest, "--output", output, "--gate-estimate-context-file", file]),
      (error) => error.code === "EVC-GATE-ESTIMATE",
      file,
    );
  }
  assert.equal(existsSync(join(input.root, "a.html")), false);
  await assert.rejects(() => main(["build", "--root", input.root, "--manifest", input.manifest, "--output", "d.html", "--gate-estimate-context-file"]), (error) => error.code === "EVC-ARGUMENT");
  await main(["build", "--root", input.root, "--manifest", input.manifest, "--output", "plain.html"]);
  const plain = readFileSync(join(input.root, "plain.html"), "utf8");
  assert.match(plain, /data-value-class="not-applicable">not-applicable</);
  assert.doesNotMatch(plain, /data-value-class="estimate"/);
});
// V-AC-07: modifying the generated viewer file must never alter canonical
// authority. This renderer/CLI pair emits no client-side script (see the
// `doesNotMatch(html, /<script/)` assertion in evidence-view-renderer.test.mjs),
// so the generated file is the only mutable "viewer file or UI state" this
// system has -- tampering it is the meaningful case to pin.
test("V-AC-07 leaves canonical authority unchanged when the generated viewer file is modified", async () => {
  const input = fixture();
  const manifestPath = join(input.root, input.manifest);
  const canonicalBefore = readFileSync(manifestPath, "utf8");
  await main(["build", "--root", input.root, "--manifest", input.manifest, "--output", "evidence/view.html"]);
  const reportPath = join(input.root, "evidence/view.html");
  writeFileSync(reportPath, readFileSync(reportPath, "utf8").replace("Derived summary", "FORGED: release approved"));
  assert.equal(readFileSync(manifestPath, "utf8"), canonicalBefore);
  const rebuilt = buildEvidenceViewModelFromFeaturePackage({ rootDir: input.root, manifestPath: input.manifest });
  assert.equal(rebuilt.candidate.commit, "a".repeat(40));
  assert.equal(rebuilt.status, "unknown");
  assert.notEqual(rebuilt.status, "pass");
});

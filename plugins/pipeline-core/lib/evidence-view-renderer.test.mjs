// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceViewModel } from "./evidence-view-model.mjs";
import { renderEvidenceView } from "./evidence-view-renderer.mjs";

test("renders an offline, accessible static report with candidate before summary", () => {
  const html = renderEvidenceView(buildEvidenceViewModel({ candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, status: "pass", artifacts: [{ path: "specs/<unsafe>.md", sha256: "c".repeat(64), state: "verified" }] }));
  assert.match(html, /Content-Security-Policy/); assert.match(html, /default-src 'none'/); assert.match(html, /Skip to report/); assert.match(html, /<nav aria-label="Report sections">/); assert.ok(html.indexOf("Exact candidate binding") < html.indexOf("Derived summary")); assert.match(html, /specs\/&lt;unsafe&gt;\.md/); assert.doesNotMatch(html, /<script/);
});
test("rejects an authority-bearing or unknown view shape", () => {
  assert.throws(() => renderEvidenceView({ schema: "pipeline.evidence-view-model.v2", authority: "authoritative", artifacts: [] }), /EVR-MODEL/);
});
test("renders export lag and receipts as a separate non-authoritative observation", () => {
  const model = { schema: "pipeline.evidence-view-model.v2", authority: "non-authoritative", source: { topology: "valid" }, feature: { id: "f", lifecycleState: "completed" }, candidate: { state: "fact", commit: "a".repeat(40), tree: "b".repeat(40) }, status: "unknown", sharing: "private", exportStatus: { state: "retryable-failure", destinationProfile: "audit", cursor: 2, lag: 3, receipt: { batchId: "batch-1", acknowledgementClass: "partial", terminalDisposition: "retryable-failure" } }, artifacts: [], notices: [] };
  const html = renderEvidenceView(model); assert.match(html, /Governance export observation/); assert.match(html, /retryable-failure/); assert.match(html, /Lag/); assert.match(html, /non-authoritative transport observation/);
});
// V-AC-09: the viewer conformance suite includes tampered, misplaced,
// orphaned, and legacy-layout fixtures with deterministic snapshots. pass,
// fail, unknown fixtures already exist elsewhere in this suite; this test
// adds the four the epic flagged as missing.
test("V-AC-09 includes tampered, misplaced, orphaned, and legacy-layout viewer-conformance fixtures with deterministic snapshots", () => {
  for (const status of ["tampered", "misplaced", "orphaned"]) {
    const html = renderEvidenceView(buildEvidenceViewModel({ candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, status, artifacts: [{ path: "specs/result.md", sha256: "c".repeat(64), state: status }] }));
    assert.match(html, new RegExp(`data-value-class="${status}">${status}<`));
  }
  const legacyHtml = renderEvidenceView(buildEvidenceViewModel({ candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, status: "pass", artifacts: [] }));
  assert.match(legacyHtml, /data-value-class="legacy">legacy<\/span> <code>EVM-V1<\/code>: Legacy explicit model; source topology was supplied by its caller\./);
});
// V-AC-02: only the value classes this model/renderer pair actually produce
// are pinned. `estimate`, `assumption`, and `human decision` are not
// produced anywhere in evidence-view-model.mjs, evidence-view-renderer.mjs,
// or evidence-viewer.mjs (verified by search; see evidence/phx-wp-v.txt) and
// are reported absent rather than asserted here.
test("V-AC-02 labels fact, unknown, unavailable, redacted, invalid, and not-applicable value classes visibly", () => {
  const model = {
    schema: "pipeline.evidence-view-model.v2",
    authority: "non-authoritative",
    source: { topology: "invalid" },
    feature: { id: null, lifecycleState: "unavailable" },
    candidate: { state: "unavailable" },
    status: "unknown",
    sharing: "private",
    exportStatus: { state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null },
    artifacts: [{ id: "artifact-1", path: "specs/a.md", sourcePath: "specs/a.md", sha256: "c".repeat(64), state: "verified", lifecycleState: null }],
    notices: [{ valueClass: "redacted", code: "EVR-TEST", message: "test notice" }],
  };
  const html = renderEvidenceView(model);
  assert.match(html, /data-value-class="fact">verified</);
  assert.match(html, /data-value-class="unknown">unknown</);
  assert.match(html, /data-value-class="unavailable">unavailable</);
  assert.match(html, /data-value-class="redacted">redacted</);
  assert.match(html, /data-value-class="invalid">invalid</);
  assert.match(html, /data-value-class="not-applicable">not-applicable</);
});
// V-AC-06: pins the exact CSP value, the skip-link's real keyboard focus
// target, and landmark/table accessibility structure. "Representative
// mobile/desktop snapshot checks" are not implemented anywhere in this
// suite -- reported absent, see evidence/phx-wp-v.txt.
test("V-AC-06 pins the exact content-security-policy value, the skip-link's keyboard focus target, and landmark/table accessibility structure", () => {
  const html = renderEvidenceView(buildEvidenceViewModel({ candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, status: "pass", artifacts: [] }));
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">/);
  assert.match(html, /<a class="skip-link" href="#content">Skip to report<\/a>/);
  assert.match(html, /<main id="content" tabindex="-1">/);
  for (const id of ["candidate", "summary", "exports", "artifacts", "notices"]) {
    assert.match(html, new RegExp(`<a href="#${id}">`));
    assert.match(html, new RegExp(`<section id="${id}" aria-labelledby="${id}-title">`));
  }
  assert.match(html, /<caption>Validated source artifacts and their exact lifecycle state<\/caption>/);
  assert.match(html, /<th scope="col">Artifact<\/th>/);
});

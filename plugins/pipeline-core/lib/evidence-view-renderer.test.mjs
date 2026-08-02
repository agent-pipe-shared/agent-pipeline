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

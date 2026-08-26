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
// are pinned. `human decision`, `assumption` and `estimate` are all produced
// now -- see the "approved lifecycle state" test below, the
// delivery-observation test, and the gate-estimate test at the end of this
// file. The estimate reaches the viewer through evidence-viewer.mjs's
// `--gate-estimate-context-file`, which projects this repo's coordinator gate
// ETA (`pipeline.gate-estimate.v1`, `rangeMinutes` in lib/gate-estimate.mjs,
// projected by projectGateEstimate) against the live State.
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
// V-AC-02: `human decision` is produced when a feature package's lifecycle
// state is exactly "approved" -- the one state feature-package-topology.mjs
// gates behind PO (human) authority specifically (`requiredAuthority: "po"`
// on the `approve` operation; every other admitted transition uses the
// general `lifecycle` authority). Labeled in both the summary section and
// each affected artifact row, and the CSS asset styles it distinctly.
test("V-AC-02 labels the approved lifecycle state as a human decision, in the summary and per-artifact rows, with distinct CSS", () => {
  const model = {
    schema: "pipeline.evidence-view-model.v2",
    authority: "non-authoritative",
    source: { topology: "valid" },
    feature: { id: "f", lifecycleState: "approved" },
    candidate: { state: "fact", commit: "a".repeat(40), tree: "b".repeat(40) },
    status: "unknown",
    sharing: "private",
    exportStatus: { state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null },
    artifacts: [{ id: "artifact-1", path: "specs/a.md", sourcePath: "specs/a.md", sha256: "c".repeat(64), state: "verified", lifecycleState: "approved" }],
    notices: [],
  };
  const html = renderEvidenceView(model);
  assert.equal(html.match(/data-value-class="human-decision">approved</g)?.length, 2);
  assert.match(html, /\.value-human-decision\{/);
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
// V-AC-06: "representative mobile/desktop snapshot checks" as a deterministic
// string-level snapshot -- the same technique the V-AC-09 test above already
// uses (assert.match(html, new RegExp(...)) against the rendered HTML). The
// renderer inlines evidence-viewer.css verbatim into a single <style> block
// (evidence-view-renderer.mjs, the CSS-inlining line); there is no separate
// mobile-render vs desktop-render code path, so the entire visual delta is
// literal, deterministic CSS text a UA evaluates against viewport width. This
// pins (a) the sole `@media(max-width:42rem){...}` breakpoint rule verbatim
// (the "mobile" state applied below that width) and (b) the exact default
// declarations that rule overrides -- body padding, dl grid-template-columns,
// th/td padding (the "desktop" baseline applied above that width, before the
// override). Both pinned in the same static HTML string is the representative
// mobile/desktop snapshot; there is no dynamic rendering step to add.
test("V-AC-06 pins representative mobile/desktop snapshot checks via deterministic CSS string assertions", () => {
  const html = renderEvidenceView(buildEvidenceViewModel({ candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, status: "pass", artifacts: [] }));
  // mobile: the sole breakpoint rule, verbatim
  assert.match(html, /@media\(max-width:42rem\)\{body\{padding:\.75rem\}table\{font-size:\.86rem\}th,td\{padding:\.35rem\}dl\{grid-template-columns:1fr\}\.candidate dd\{margin-bottom:\.65rem\}\}/);
  // desktop: the exact default declarations that breakpoint overrides
  assert.match(html, /body\{margin:0 auto;max-width:76rem;padding:1\.25rem\}/);
  assert.match(html, /dl\{display:grid;grid-template-columns:max-content 1fr;gap:\.4rem 1rem\}/);
  assert.match(html, /th,td\{border:1px solid #777;padding:\.55rem;text-align:left;vertical-align:top\}/);
});
// V-AC-02: `assumption` is the class for a value the report carries but cannot
// verify, and the delivery observation is exactly that -- evidence-view-model.mjs
// admits it on shape alone (no digest, no canonical source record, no
// exact-candidate binding), unlike the artifacts and the manifest, whose bytes
// feature-package-topology.mjs re-hashes. Present observation values are labelled
// assumption, absent ones stay unavailable, and the CSS asset styles the class
// distinctly.
test("V-AC-02 labels supplied delivery-observation values as assumptions, keeps absent ones unavailable, and styles the class distinctly", () => {
  const base = { schema: "pipeline.evidence-view-model.v2", authority: "non-authoritative", source: { topology: "valid" }, feature: { id: "f", lifecycleState: "completed" }, candidate: { state: "fact", commit: "a".repeat(40), tree: "b".repeat(40) }, status: "unknown", sharing: "private", artifacts: [] };
  const html = renderEvidenceView({ ...base, exportStatus: { state: "delivered", destinationProfile: "audit", cursor: 4, lag: 0, receipt: null }, notices: [{ valueClass: "assumption", code: "EVM-EXPORT-ASSUMED", message: "supplied premise" }] });
  assert.match(html, /data-value-class="assumption">audit</);
  assert.match(html, /data-value-class="assumption">4</);
  assert.match(html, /data-value-class="assumption">0</);
  assert.match(html, /data-value-class="assumption">assumption<\/span> <code>EVM-EXPORT-ASSUMED<\/code>/);
  assert.match(html, /\.value-assumption\{/);
  const absent = renderEvidenceView({ ...base, exportStatus: { state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null }, notices: [] });
  assert.doesNotMatch(absent, /data-value-class="assumption"/);
});
// E-AC-19: failure/quarantine counts and integrity gaps follow the exact same
// caller-supplied, unverified-premise discipline as the sibling exportStatus
// fields above (V-AC-02): present values are `assumption`, absent ones stay
// `unavailable`. `integrityGaps` additionally distinguishes "not observed"
// (`null`, renders `unavailable`) from "checked, none found" (`[]`, renders
// `assumption`/"none") -- the two must never collapse into each other.
test("E-AC-19 renders failure/quarantine counts and integrity gaps as assumptions when observed and unavailable when absent", () => {
  const base = { schema: "pipeline.evidence-view-model.v2", authority: "non-authoritative", source: { topology: "valid" }, feature: { id: "f", lifecycleState: "completed" }, candidate: { state: "fact", commit: "a".repeat(40), tree: "b".repeat(40) }, status: "unknown", sharing: "private", artifacts: [], notices: [] };
  const observed = renderEvidenceView({ ...base, exportStatus: { state: "quarantined", destinationProfile: "audit", cursor: 4, lag: 0, receipt: null, failureCount: 2, quarantineCount: 5, integrityGaps: ["EG-DIGEST-MISMATCH"], recoveryState: null } });
  assert.match(observed, /<dt>Failure count<\/dt><dd><span class="value value-assumption" data-value-class="assumption">2<\/span><\/dd>/);
  assert.match(observed, /<dt>Quarantine count<\/dt><dd><span class="value value-assumption" data-value-class="assumption">5<\/span><\/dd>/);
  assert.match(observed, /<dt>Integrity gaps<\/dt><dd><span class="value value-assumption" data-value-class="assumption">EG-DIGEST-MISMATCH<\/span><\/dd>/);
  const checkedNone = renderEvidenceView({ ...base, exportStatus: { state: "delivered", destinationProfile: "audit", cursor: 4, lag: 0, receipt: null, failureCount: 0, quarantineCount: 0, integrityGaps: [], recoveryState: null } });
  assert.match(checkedNone, /<dt>Integrity gaps<\/dt><dd><span class="value value-assumption" data-value-class="assumption">none<\/span><\/dd>/);
  const absent = renderEvidenceView({ ...base, exportStatus: { state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null, failureCount: null, quarantineCount: null, integrityGaps: null, recoveryState: null } });
  assert.match(absent, /<dt>Failure count<\/dt><dd><span class="value value-unavailable" data-value-class="unavailable">unavailable<\/span><\/dd>/);
  assert.match(absent, /<dt>Quarantine count<\/dt><dd><span class="value value-unavailable" data-value-class="unavailable">unavailable<\/span><\/dd>/);
  assert.match(absent, /<dt>Integrity gaps<\/dt><dd><span class="value value-unavailable" data-value-class="unavailable">unavailable<\/span><\/dd>/);
});
// E-AC-19: recovery state is the sixth item this criterion names, and follows
// the same caller-supplied, unverified-premise discipline as the sibling
// exportStatus fields above (V-AC-02): present is `assumption`, absent stays
// `unavailable`. An observed not-blocked value renders "not blocked" rather
// than an empty guidance list; an observed blocked value renders its real
// guidance strings, joined, never re-worded.
test("E-AC-19 renders recovery state as blocked/not-blocked assumptions and unavailable when absent", () => {
  const base = { schema: "pipeline.evidence-view-model.v2", authority: "non-authoritative", source: { topology: "valid" }, feature: { id: "f", lifecycleState: "completed" }, candidate: { state: "fact", commit: "a".repeat(40), tree: "b".repeat(40) }, status: "unknown", sharing: "private", artifacts: [], notices: [] };
  const notBlocked = renderEvidenceView({ ...base, exportStatus: { state: "delivered", destinationProfile: "audit", cursor: 4, lag: 0, receipt: null, failureCount: 0, quarantineCount: 0, integrityGaps: [], recoveryState: { blocked: false, guidance: null } } });
  assert.match(notBlocked, /<dt>Recovery state<\/dt><dd><span class="value value-assumption" data-value-class="assumption">not blocked<\/span><\/dd>/);
  const blocked = renderEvidenceView({ ...base, exportStatus: { state: "quarantined", destinationProfile: "audit", cursor: 1, lag: 1, receipt: null, failureCount: 1, quarantineCount: 1, integrityGaps: null, recoveryState: { blocked: true, guidance: ["Pending entries advance to acknowledged only via applyGovernanceExportDelivery.", "No mechanism currently moves a quarantined entry to acknowledged."] } } });
  assert.match(blocked, /<dt>Recovery state<\/dt><dd><span class="value value-assumption" data-value-class="assumption">blocked: Pending entries advance to acknowledged only via applyGovernanceExportDelivery\.; No mechanism currently moves a quarantined entry to acknowledged\.<\/span><\/dd>/);
  const absent = renderEvidenceView({ ...base, exportStatus: { state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null, failureCount: null, quarantineCount: null, integrityGaps: null, recoveryState: null } });
  assert.match(absent, /<dt>Recovery state<\/dt><dd><span class="value value-unavailable" data-value-class="unavailable">unavailable<\/span><\/dd>/);
});
// V-AC-02: `estimate` is rendered as its own visible class, distinct from both
// `fact` and `assumption`. A resolved projection shows the gate and the range
// under that class; an unresolved or inapplicable one shows only its own state
// word under the matching state-named class, so no number is ever displayed
// that a reader could mistake for a committed schedule.
test("V-AC-02 labels a resolved gate projection as an estimate and unresolved ones by their own state", () => {
  const base = { schema: "pipeline.evidence-view-model.v2", authority: "non-authoritative", source: { topology: "valid" }, feature: { id: "f", lifecycleState: "completed" }, candidate: { state: "fact", commit: "a".repeat(40), tree: "b".repeat(40) }, status: "unknown", sharing: "private", exportStatus: { state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null }, artifacts: [], notices: [] };
  const known = renderEvidenceView({ ...base, gateEstimate: { state: "known", featureId: "f", gate: "security", rangeMinutes: { min: 30, max: 90 }, source: { path: "specs/f/estimate.json", sha256: "d".repeat(64) }, code: "CS-ETA-KNOWN" }, notices: [{ valueClass: "estimate", code: "EVM-GATE-ESTIMATE", message: "projected range" }] });
  assert.match(known, /Projected gate estimate/);
  assert.match(known, /data-value-class="estimate">security</);
  assert.match(known, /data-value-class="estimate">30-90</);
  assert.match(known, /data-value-class="estimate">estimate<\/span> <code>EVM-GATE-ESTIMATE<\/code>/);
  assert.match(known, /specs\/f\/estimate\.json/);
  assert.doesNotMatch(known, /data-value-class="fact">30-90</);
  assert.doesNotMatch(known, /data-value-class="assumption"/);
  const unavailable = renderEvidenceView({ ...base, gateEstimate: { state: "unavailable", featureId: "f", gate: "security", rangeMinutes: null, source: null, code: "CS-ETA-EVIDENCE-DRIFT" } });
  assert.match(unavailable, /data-value-class="unavailable">unavailable</);
  assert.match(unavailable, /CS-ETA-EVIDENCE-DRIFT/);
  assert.doesNotMatch(unavailable, /data-value-class="estimate"/);
  assert.doesNotMatch(unavailable, />security</);
  const inapplicable = renderEvidenceView({ ...base, gateEstimate: { state: "not-applicable", featureId: null, gate: null, rangeMinutes: null, source: null, code: "CS-ETA-FEATURE" } });
  assert.match(inapplicable, /data-value-class="not-applicable">not-applicable</);
  assert.doesNotMatch(inapplicable, /data-value-class="estimate"/);
  // A model without the field at all still renders the section, never a blank
  // or a fabricated range.
  const legacy = renderEvidenceView(buildEvidenceViewModel({ candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, status: "pass", artifacts: [] }));
  assert.match(legacy, /Projected gate estimate/);
  assert.match(legacy, /data-value-class="not-applicable">not-applicable</);
  assert.match(legacy, /<a href="#estimate">Estimate<\/a>/);
  assert.match(legacy, /<section id="estimate" aria-labelledby="estimate-title">/);
});

// SPDX-License-Identifier: SUL-1.0
/** Static, keyboard-navigable and network-independent Evidence Viewer renderer. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const CSS = readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "..", "assets", "evidence-viewer.css"), "utf8");
function esc(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function value(value, valueClass = "fact") { return `<span class="value value-${esc(valueClass)}" data-value-class="${esc(valueClass)}">${esc(value)}</span>`; }
// V-AC-02: `approved` is the sole feature-package lifecycle state this repo's
// own feature-package-topology.mjs gates behind PO (human) authority
// specifically (`requiredAuthority: "po"` on the `approve` operation --
// every other admitted transition uses the general `lifecycle` authority).
// Reaching this exact value is therefore evidence a human decision occurred,
// not just an accurate report of current status the way every other state
// string is. Hyphenated (not "human decision" per the acceptance text's own
// wording) because the generic `value()` helper above splices `valueClass`
// straight into an HTML `class` attribute; an embedded space would tokenize
// into two separate class names ("value-human" and a bare, collision-prone
// "decision") instead of one selectable class.
function lifecycleValueClass(state) { return state === "approved" ? "human-decision" : "fact"; }
const ABSENT_ESTIMATE = Object.freeze({ state: "not-applicable", featureId: null, gate: null, rangeMinutes: null, source: null, code: "EVM-ESTIMATE-ABSENT" });
function candidateBlock(model) {
  if (model.candidate?.state === "unavailable") return `<p>${value("unavailable", "unavailable")}: no exact candidate binding.</p>`;
  const candidate = model.candidate;
  return `<dl class="candidate"><dt>Commit</dt><dd><code>${esc(candidate.commit)}</code></dd><dt>Tree</dt><dd><code>${esc(candidate.tree)}</code></dd></dl>`;
}
function artifactRows(model, sourceHref) {
  return model.artifacts.map((artifact, index) => {
    const id = artifact.id ?? `artifact-${index + 1}`;
    const source = artifact.sourcePath ? `<a href="${esc(sourceHref(artifact.sourcePath))}">${esc(artifact.path)}</a>` : esc(artifact.path);
    return `<tr id="${esc(id)}"><th scope="row">${source}</th><td>${value(artifact.lifecycleState ?? "not-applicable", artifact.lifecycleState ? lifecycleValueClass(artifact.lifecycleState) : "not-applicable")}</td><td>${value(artifact.state, artifact.state === "verified" ? "fact" : artifact.state)}</td><td><code>${esc(artifact.sha256)}</code></td></tr>`;
  }).join("");
}
function v1ToV2(model) {
  return { schema: "pipeline.evidence-view-model.v2", authority: model.authority, source: { manifest: null, manifestSha256: null, topology: "legacy" }, feature: { id: null, lifecycleState: "unavailable" }, candidate: { state: "fact", ...model.candidate }, status: model.status, sharing: "private", exportStatus: { state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null, failureCount: null, quarantineCount: null, integrityGaps: null, recoveryState: null }, gateEstimate: ABSENT_ESTIMATE, artifacts: model.artifacts.map((artifact, index) => ({ id: `artifact-${index + 1}`, ...artifact, sourcePath: artifact.path, valueClass: "fact", lifecycleState: "not-applicable" })), notices: [{ valueClass: "legacy", code: "EVM-V1", message: "Legacy explicit model; source topology was supplied by its caller." }] };
}
// V-AC-02: every value in this block comes from the caller-supplied delivery
// observation, which evidence-view-model.mjs validates for shape only (no
// digest, no canonical source record, no exact-candidate binding). A present
// value is therefore a declared, unverified premise -- `assumption` -- while an
// absent one stays `unavailable`. The state string keeps its own state-named
// class, the convention this renderer uses for every status-ish value
// (topology, report status, artifact integrity state).
function exportBlock(model) {
  const observed = model.exportStatus ?? { state: "unavailable", destinationProfile: null, cursor: null, lag: null, receipt: null, failureCount: null, quarantineCount: null, integrityGaps: null, recoveryState: null };
  const detail = observed.receipt === null ? "No delivery receipt is available." : `Batch ${esc(observed.receipt.batchId)}: ${esc(observed.receipt.acknowledgementClass)} / ${esc(observed.receipt.terminalDisposition)}.`;
  // The same caller-supplied, shape-validated-only premise as every other
  // field in this block (see the V-AC-02 comment above): present values are
  // `assumption`, absent ones stay `unavailable`. `integrityGaps` additionally
  // distinguishes "not observed" (`null`) from "checked, none found" (`[]`) --
  // both render, but only the former gets the `unavailable` class.
  const gapsObserved = observed.integrityGaps !== null && observed.integrityGaps !== undefined;
  const gapsText = gapsObserved ? (observed.integrityGaps.length === 0 ? "none" : observed.integrityGaps.join(", ")) : "unavailable";
  const failureObserved = observed.failureCount !== null && observed.failureCount !== undefined;
  const quarantineObserved = observed.quarantineCount !== null && observed.quarantineCount !== undefined;
  // E-AC-19: recovery state follows the same discipline as every sibling
  // field in this block -- present is `assumption`, absent stays
  // `unavailable`. When observed and not blocked, the text is explicitly
  // "not blocked" rather than an empty guidance list.
  const recoveryObserved = observed.recoveryState !== null && observed.recoveryState !== undefined;
  const recoveryText = recoveryObserved ? (observed.recoveryState.blocked ? `blocked: ${observed.recoveryState.guidance.join("; ")}` : "not blocked") : "unavailable";
  return `<dl><dt>State</dt><dd>${value(observed.state, observed.state)}</dd><dt>Destination profile</dt><dd>${value(observed.destinationProfile ?? "unavailable", observed.destinationProfile ? "assumption" : "unavailable")}</dd><dt>Cursor</dt><dd>${value(observed.cursor ?? "unavailable", observed.cursor === null ? "unavailable" : "assumption")}</dd><dt>Lag</dt><dd>${value(observed.lag ?? "unavailable", observed.lag === null ? "unavailable" : "assumption")}</dd><dt>Failure count</dt><dd>${value(failureObserved ? observed.failureCount : "unavailable", failureObserved ? "assumption" : "unavailable")}</dd><dt>Quarantine count</dt><dd>${value(quarantineObserved ? observed.quarantineCount : "unavailable", quarantineObserved ? "assumption" : "unavailable")}</dd><dt>Integrity gaps</dt><dd>${value(gapsText, gapsObserved ? "assumption" : "unavailable")}</dd><dt>Recovery state</dt><dd>${value(recoveryText, recoveryObserved ? "assumption" : "unavailable")}</dd><dt>Receipt</dt><dd>${detail}</dd></dl><p>${value("non-authoritative transport observation", "fact")}</p>`;
}

// V-AC-02: `estimate` is its own visible class. A gate estimate is a projected
// range the coordinator recorded (`pipeline.gate-estimate.v1`, projected by
// projectGateEstimate in lib/gate-estimate.mjs), so it is neither a `fact` --
// this projection re-hashes nothing about it -- nor an `assumption`, which is a
// premise the report relies on rather than a statement about the future. When
// the projection resolves to no range at all, the state word carries its own
// state-named class (`unavailable`, `not-applicable`), the convention this
// renderer already uses for every status-ish value, and no number is shown that
// a reader could mistake for a schedule.
function gateEstimateBlock(model) {
  const estimate = model.gateEstimate ?? ABSENT_ESTIMATE;
  const known = estimate.state === "known";
  const valueClass = known ? "estimate" : estimate.state;
  const basis = known
    ? `<code>${esc(estimate.source.path)}</code> <code>${esc(estimate.source.sha256)}</code>`
    : "No evidence-bound estimate record is available for this feature package.";
  return `<dl><dt>Next gate</dt><dd>${value(known ? estimate.gate : estimate.state, valueClass)}</dd><dt>Projected minutes to gate</dt><dd>${value(known ? `${estimate.rangeMinutes.min}-${estimate.rangeMinutes.max}` : estimate.state, valueClass)}</dd><dt>Basis</dt><dd>${basis}</dd><dt>Projection code</dt><dd><code>${esc(estimate.code)}</code></dd></dl><p>${value("projected estimate, not a commitment or a completion claim", "fact")}</p>`;
}

export function renderEvidenceView(input, { sourceHref = (path) => path } = {}) {
  if (!input || input.authority !== "non-authoritative" || !Array.isArray(input.artifacts) || !["pipeline.evidence-view-model.v1", "pipeline.evidence-view-model.v2"].includes(input.schema) || typeof sourceHref !== "function") throw new TypeError("EVR-MODEL");
  const model = input.schema === "pipeline.evidence-view-model.v1" ? v1ToV2(input) : input;
  const notices = model.notices.map((entry) => `<li>${value(entry.valueClass, entry.valueClass)} <code>${esc(entry.code)}</code>: ${esc(entry.message)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"><title>Pipeline Evidence Viewer</title><style>${CSS}</style></head><body><a class="skip-link" href="#content">Skip to report</a><header><h1>Evidence Viewer</h1><p>${value("non-authoritative projection", "fact")}</p><nav aria-label="Report sections"><a href="#candidate">Candidate</a><a href="#summary">Summary</a><a href="#exports">Exports</a><a href="#estimate">Estimate</a><a href="#artifacts">Artifacts</a><a href="#notices">Notices</a></nav></header><main id="content" tabindex="-1"><section id="candidate" aria-labelledby="candidate-title"><h2 id="candidate-title">Exact candidate binding</h2>${candidateBlock(model)}</section><section id="summary" aria-labelledby="summary-title"><h2 id="summary-title">Derived summary</h2><dl><dt>Feature</dt><dd>${value(model.feature?.id ?? "unavailable", model.feature?.id ? "fact" : "unavailable")}</dd><dt>Lifecycle state</dt><dd>${value(model.feature?.lifecycleState ?? "unavailable", model.feature?.lifecycleState === "unavailable" ? "unavailable" : lifecycleValueClass(model.feature?.lifecycleState))}</dd><dt>Topology</dt><dd>${value(model.source?.topology ?? "unavailable", model.source?.topology ?? "unavailable")}</dd><dt>Report status</dt><dd>${value(model.status, model.status === "pass" ? "fact" : model.status)}</dd></dl></section><section id="exports" aria-labelledby="exports-title"><h2 id="exports-title">Governance export observation</h2>${exportBlock(model)}</section><section id="estimate" aria-labelledby="estimate-title"><h2 id="estimate-title">Projected gate estimate</h2>${gateEstimateBlock(model)}</section><section id="artifacts" aria-labelledby="artifacts-title"><h2 id="artifacts-title">Canonical artifacts</h2><table><caption>Validated source artifacts and their exact lifecycle state</caption><thead><tr><th scope="col">Artifact</th><th scope="col">Lifecycle</th><th scope="col">Integrity</th><th scope="col">SHA-256</th></tr></thead><tbody>${artifactRows(model, sourceHref) || '<tr><td colspan="4">No trusted artifact metadata is available.</td></tr>'}</tbody></table></section><section id="notices" aria-labelledby="notices-title"><h2 id="notices-title">Limitations and state labels</h2><ul>${notices}</ul></section></main></body></html>`;
}

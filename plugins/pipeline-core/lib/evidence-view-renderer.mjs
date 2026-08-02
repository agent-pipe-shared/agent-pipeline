// SPDX-License-Identifier: SUL-1.0
/** Static, keyboard-navigable and network-independent Evidence Viewer renderer. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const CSS = readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "..", "assets", "evidence-viewer.css"), "utf8");
function esc(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function value(value, valueClass = "fact") { return `<span class="value value-${esc(valueClass)}" data-value-class="${esc(valueClass)}">${esc(value)}</span>`; }
function candidateBlock(model) {
  if (model.candidate?.state === "unavailable") return `<p>${value("unavailable", "unavailable")}: no exact candidate binding.</p>`;
  const candidate = model.candidate;
  return `<dl class="candidate"><dt>Commit</dt><dd><code>${esc(candidate.commit)}</code></dd><dt>Tree</dt><dd><code>${esc(candidate.tree)}</code></dd></dl>`;
}
function artifactRows(model, sourceHref) {
  return model.artifacts.map((artifact, index) => {
    const id = artifact.id ?? `artifact-${index + 1}`;
    const source = artifact.sourcePath ? `<a href="${esc(sourceHref(artifact.sourcePath))}">${esc(artifact.path)}</a>` : esc(artifact.path);
    return `<tr id="${esc(id)}"><th scope="row">${source}</th><td>${value(artifact.lifecycleState ?? "not-applicable", artifact.lifecycleState ? "fact" : "not-applicable")}</td><td>${value(artifact.state, artifact.state === "verified" ? "fact" : artifact.state)}</td><td><code>${esc(artifact.sha256)}</code></td></tr>`;
  }).join("");
}
function v1ToV2(model) {
  return { schema: "pipeline.evidence-view-model.v2", authority: model.authority, source: { manifest: null, manifestSha256: null, topology: "legacy" }, feature: { id: null, lifecycleState: "unavailable" }, candidate: { state: "fact", ...model.candidate }, status: model.status, sharing: "private", artifacts: model.artifacts.map((artifact, index) => ({ id: `artifact-${index + 1}`, ...artifact, sourcePath: artifact.path, valueClass: "fact", lifecycleState: "not-applicable" })), notices: [{ valueClass: "legacy", code: "EVM-V1", message: "Legacy explicit model; source topology was supplied by its caller." }] };
}

export function renderEvidenceView(input, { sourceHref = (path) => path } = {}) {
  if (!input || input.authority !== "non-authoritative" || !Array.isArray(input.artifacts) || !["pipeline.evidence-view-model.v1", "pipeline.evidence-view-model.v2"].includes(input.schema) || typeof sourceHref !== "function") throw new TypeError("EVR-MODEL");
  const model = input.schema === "pipeline.evidence-view-model.v1" ? v1ToV2(input) : input;
  const notices = model.notices.map((entry) => `<li>${value(entry.valueClass, entry.valueClass)} <code>${esc(entry.code)}</code>: ${esc(entry.message)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"><title>Pipeline Evidence Viewer</title><style>${CSS}</style></head><body><a class="skip-link" href="#content">Skip to report</a><header><h1>Evidence Viewer</h1><p>${value("non-authoritative projection", "fact")}</p><nav aria-label="Report sections"><a href="#candidate">Candidate</a><a href="#summary">Summary</a><a href="#artifacts">Artifacts</a><a href="#notices">Notices</a></nav></header><main id="content" tabindex="-1"><section id="candidate" aria-labelledby="candidate-title"><h2 id="candidate-title">Exact candidate binding</h2>${candidateBlock(model)}</section><section id="summary" aria-labelledby="summary-title"><h2 id="summary-title">Derived summary</h2><dl><dt>Feature</dt><dd>${value(model.feature?.id ?? "unavailable", model.feature?.id ? "fact" : "unavailable")}</dd><dt>Lifecycle state</dt><dd>${value(model.feature?.lifecycleState ?? "unavailable", model.feature?.lifecycleState === "unavailable" ? "unavailable" : "fact")}</dd><dt>Topology</dt><dd>${value(model.source?.topology ?? "unavailable", model.source?.topology ?? "unavailable")}</dd><dt>Report status</dt><dd>${value(model.status, model.status === "pass" ? "fact" : model.status)}</dd></dl></section><section id="artifacts" aria-labelledby="artifacts-title"><h2 id="artifacts-title">Canonical artifacts</h2><table><caption>Validated source artifacts and their exact lifecycle state</caption><thead><tr><th scope="col">Artifact</th><th scope="col">Lifecycle</th><th scope="col">Integrity</th><th scope="col">SHA-256</th></tr></thead><tbody>${artifactRows(model, sourceHref) || '<tr><td colspan="4">No trusted artifact metadata is available.</td></tr>'}</tbody></table></section><section id="notices" aria-labelledby="notices-title"><h2 id="notices-title">Limitations and state labels</h2><ul>${notices}</ul></section></main></body></html>`;
}

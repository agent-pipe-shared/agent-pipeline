// SPDX-License-Identifier: SUL-1.0
// CYB-3E -- pure immutable SBOM release bindings and audit references.
import { createHash } from "node:crypto";
import { canonicalJson, validateSbomManifest } from "./sbom-manifest.mjs";
const own = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const string = (value) => typeof value === "string" && value.trim() !== "";
const HEX = /^[a-f0-9]{64}$/;

function validRelease(entry) { return own(entry, ["release", "sbomDigest", "manifestDigest", "components", "delta"]) && string(entry.release) && HEX.test(entry.sbomDigest) && HEX.test(entry.manifestDigest) && Array.isArray(entry.components) && entry.components.every(string) && own(entry.delta, ["added", "removed"]); }

/** Append one immutable release binding from a validated complete SBOM record. */
export function bindSbomRelease(history, { release, manifest, validation }) {
  if (!Array.isArray(history) || !history.every(validRelease) || !string(release) || validateSbomManifest(manifest).valid !== true) return { ok: false, code: "SBOM-RELEASE-INPUT-INVALID" };
  if (history.some((entry) => entry.release === release)) return { ok: false, code: "SBOM-RELEASE-IMMUTABLE" };
  if (manifest?.lifecycle?.state !== "complete" || manifest?.freshness?.status !== "fresh" || manifest?.completeness?.status !== "complete" || validation?.valid !== true || !HEX.test(validation?.digest ?? "")) return { ok: false, code: "SBOM-RELEASE-PRECONDITION" };
  const prior = history.at(-1); const previous = new Set(prior?.components ?? []); const current = new Set(manifest.components.map((component) => component.id));
  const manifestDigest = createHash("sha256").update(canonicalJson(manifest)).digest("hex");
  const entry = Object.freeze({ release, sbomDigest: validation.digest, manifestDigest, components: [...current].sort(), delta: Object.freeze({ added: [...current].filter((id) => !previous.has(id)).sort(), removed: [...previous].filter((id) => !current.has(id)).sort() }) });
  return { ok: true, history: Object.freeze([...history, entry]), entry };
}

/** Return reference-only audit links; none can replace the authoritative SBOM. */
export function buildSbomAuditBundle(links) {
  if (!own(links, ["sbom", "policy", "completeness", "validation", "releaseBinding"]) || !Object.values(links).every((value) => own(value, ["schema", "digest"]) && string(value.schema) && HEX.test(value.digest))) return { ok: false, code: "SBOM-AUDIT-LINKS-INVALID" };
  return { ok: true, schema: "pipeline.sbom-audit-bundle.v1", authoritative: false, links: Object.freeze({ ...links }) };
}

// SPDX-License-Identifier: SUL-1.0
// CYB-3A -- pure, provider-neutral SBOM manifest boundary. No file, process or network I/O.
import { createHash } from "node:crypto";

export const SBOM_MANIFEST_SCHEMA = "pipeline.sbom-manifest.v1";
export const SBOM_FORMAT_PROFILES = Object.freeze({ "cyclonedx-json": "CycloneDX-1.6", "spdx-json": "SPDX-2.3" });
export const SBOM_LIFECYCLE_STATES = Object.freeze(["complete", "stale", "invalid", "partial", "unsupported", "unavailable", "not-applicable"]);

const HEX = /^[a-f0-9]{64}$/;
const ROOT = ["schema", "candidate", "sourceInputs", "adapter", "formats", "components", "completeness", "freshness", "privacy", "payload", "lifecycle"];
const CANDIDATE = ["repositoryFingerprint", "commit", "tree"];
const ADAPTER = ["id", "version", "configSha256"];
const FORMAT = ["format", "profile", "payloadSha256"];
const COMPONENT = ["id", "scope", "provenance", "relationships"];
const COMPLETENESS = ["status", "declared", "observed"];
const FRESHNESS = ["status", "candidateMatches", "sourceInputsMatch"];
const PRIVACY = ["classification", "exportPolicy"];
const PAYLOAD = ["canonicalSha256", "formats"];
const LIFECYCLE = ["state", "code"];
const own = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
const string = (value) => typeof value === "string" && value.trim() !== "";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const objectsWith = (value, fields) => Array.isArray(value) && value.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry) && fields.every((field) => string(entry[field])));

/** Stable JSON encoding with lexicographically ordered object keys. */
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("SBOM-CANONICAL-NONFINITE");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value === undefined || typeof value !== "object") throw new TypeError("SBOM-CANONICAL-TYPE");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function normalizedPayload(format, payload) {
  const copy = JSON.parse(JSON.stringify(payload));
  if (format === "cyclonedx-json") {
    delete copy.serialNumber;
    if (copy.metadata && typeof copy.metadata === "object") delete copy.metadata.timestamp;
  } else if (copy.creationInfo && typeof copy.creationInfo === "object") delete copy.creationInfo.created;
  return copy;
}

/**
 * Check the required fields of the two pinned JSON interchange profiles before
 * a payload can be digested. The portable core deliberately accepts no
 * profile/version aliases: adapters must emit CycloneDX 1.6 or SPDX 2.3.
 */
export function validateSbomPayload(format, payload) {
  if (!Object.hasOwn(SBOM_FORMAT_PROFILES, format) || payload === null || typeof payload !== "object" || Array.isArray(payload)) return { valid: false, code: "SBOM-PAYLOAD-FORMAT" };
  if (format === "cyclonedx-json") {
    const valid = payload.bomFormat === "CycloneDX" && payload.specVersion === "1.6" && Number.isInteger(payload.version) && payload.version >= 1 && objectsWith(payload.components, ["type", "name"]);
    return valid ? { valid: true } : { valid: false, code: "SBOM-CYCLONEDX-PROFILE" };
  }
  const valid = payload.spdxVersion === "SPDX-2.3" && payload.dataLicense === "CC0-1.0" && string(payload.SPDXID) && string(payload.name) && string(payload.documentNamespace) && payload.creationInfo !== null && typeof payload.creationInfo === "object" && !Array.isArray(payload.creationInfo) && objectsWith(payload.packages, ["SPDXID", "name"]);
  return valid ? { valid: true } : { valid: false, code: "SBOM-SPDX-PROFILE" };
}

/** Strip only prescribed volatile serial/timestamp values and bind the logical payload. */
export function canonicalizeSbomPayload(format, payload) {
  const profile = validateSbomPayload(format, payload);
  if (!profile.valid) return profile;
  const canonical = canonicalJson(normalizedPayload(format, payload));
  return { valid: true, canonical, sha256: digest(canonical) };
}

function closed(errors, value, fields, label) { if (!own(value, fields)) errors.push(`${label}: closed field set required`); }
function sha(value) { return typeof value === "string" && HEX.test(value); }

/** Validate the immutable closed manifest shape; malformed data never throws. */
export function validateSbomManifest(manifest) {
  const errors = [];
  closed(errors, manifest, ROOT, "$ ");
  if (!own(manifest, ROOT) || manifest.schema !== SBOM_MANIFEST_SCHEMA) errors.push("schema: expected pipeline.sbom-manifest.v1");
  closed(errors, manifest?.candidate, CANDIDATE, "candidate");
  for (const field of CANDIDATE) if (!string(manifest?.candidate?.[field])) errors.push(`candidate.${field}: non-empty string required`);
  if (!Array.isArray(manifest?.sourceInputs) || manifest.sourceInputs.length === 0 || !manifest.sourceInputs.every((entry) => own(entry, ["path", "sha256"]) && string(entry.path) && sha(entry.sha256))) errors.push("sourceInputs: non-empty closed digest list required");
  closed(errors, manifest?.adapter, ADAPTER, "adapter");
  if (!(string(manifest?.adapter?.id) && string(manifest?.adapter?.version) && sha(manifest?.adapter?.configSha256))) errors.push("adapter: id, version and config digest required");
  if (!Array.isArray(manifest?.formats) || manifest.formats.length !== 2 || !manifest.formats.every((entry) => own(entry, FORMAT) && SBOM_FORMAT_PROFILES[entry.format] === entry.profile && sha(entry.payloadSha256)) || Object.keys(SBOM_FORMAT_PROFILES).some((format) => !manifest.formats.some((entry) => entry.format === format))) errors.push("formats: exact pinned CycloneDX and SPDX bindings required");
  if (!Array.isArray(manifest?.components) || !manifest.components.every((entry) => own(entry, COMPONENT) && string(entry.id) && string(entry.scope) && string(entry.provenance) && Array.isArray(entry.relationships) && entry.relationships.every(string))) errors.push("components: closed component records required");
  closed(errors, manifest?.completeness, COMPLETENESS, "completeness");
  if (!(["complete", "partial", "unsupported"].includes(manifest?.completeness?.status) && Number.isInteger(manifest?.completeness?.declared) && Number.isInteger(manifest?.completeness?.observed) && manifest.completeness.declared >= manifest.completeness.observed && manifest.completeness.observed >= 0)) errors.push("completeness: invalid declaration");
  closed(errors, manifest?.freshness, FRESHNESS, "freshness");
  if (!(["fresh", "stale"].includes(manifest?.freshness?.status) && typeof manifest?.freshness?.candidateMatches === "boolean" && typeof manifest?.freshness?.sourceInputsMatch === "boolean")) errors.push("freshness: invalid declaration");
  if (manifest?.freshness?.status === "fresh" && (!manifest.freshness.candidateMatches || !manifest.freshness.sourceInputsMatch)) errors.push("freshness: fresh requires exact candidate and source-input matches");
  closed(errors, manifest?.privacy, PRIVACY, "privacy");
  if (!(["public", "private"].includes(manifest?.privacy?.classification) && ["public-redacted", "private-only"].includes(manifest?.privacy?.exportPolicy))) errors.push("privacy: invalid declaration");
  closed(errors, manifest?.payload, PAYLOAD, "payload");
  if (!(sha(manifest?.payload?.canonicalSha256) && own(manifest?.payload?.formats, Object.keys(SBOM_FORMAT_PROFILES)) && Object.entries(SBOM_FORMAT_PROFILES).every(([format, profile]) => manifest.payload.formats[format]?.profile === profile && sha(manifest.payload.formats[format]?.sha256)))) errors.push("payload: canonical and profile digests required");
  closed(errors, manifest?.lifecycle, LIFECYCLE, "lifecycle");
  if (!SBOM_LIFECYCLE_STATES.includes(manifest?.lifecycle?.state) || !string(manifest?.lifecycle?.code)) errors.push("lifecycle: stable state and code required");
  if (manifest?.lifecycle?.state === "complete" && (manifest?.completeness?.status !== "complete" || manifest?.freshness?.status !== "fresh")) errors.push("lifecycle: complete requires complete and fresh inputs");
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/** Validate profile payloads, their per-format digests and the aggregate record digest. */
export function validateSbomRecord(manifest, payloads) {
  const manifestResult = validateSbomManifest(manifest);
  if (!manifestResult.valid) return { valid: false, code: "SBOM-MANIFEST-INVALID", errors: manifestResult.errors };
  if (payloads === null || typeof payloads !== "object" || Array.isArray(payloads)) return { valid: false, code: "SBOM-PAYLOADS-INVALID" };
  const entries = [];
  for (const format of Object.keys(SBOM_FORMAT_PROFILES)) {
    const result = canonicalizeSbomPayload(format, payloads[format]);
    if (!result.valid) return { valid: false, code: result.code };
    const binding = manifest.formats.find((entry) => entry.format === format);
    if (result.sha256 !== binding.payloadSha256 || result.sha256 !== manifest.payload.formats[format].sha256) return { valid: false, code: "SBOM-PAYLOAD-DIGEST-MISMATCH" };
    entries.push(`${format}:${result.sha256}`);
  }
  const aggregate = digest(entries.sort().join("\n"));
  return aggregate === manifest.payload.canonicalSha256 ? { valid: true, digest: aggregate } : { valid: false, code: "SBOM-CANONICAL-DIGEST-MISMATCH" };
}

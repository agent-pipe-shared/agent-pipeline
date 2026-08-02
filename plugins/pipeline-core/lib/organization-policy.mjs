// SPDX-License-Identifier: SUL-1.0
/** Closed PHX-3 organization policy pack validation and fail-closed compatibility. */
const SHA = /^[a-f0-9]{64}$/u; const ID = /^[a-z][a-z0-9-]{2,63}$/u; const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/u;
const CLASSES = new Set(["architecture", "operations", "security", "privacy", "continuity", "recovery", "release", "change-management"]); const MODES = new Set(["reference-only", "projection", "controlled-publication"]);
function record(v) { return v !== null && typeof v === "object" && !Array.isArray(v); } function exact(v, keys) { return record(v) && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key)); }
export class OrganizationPolicyError extends Error { constructor(code) { super("Organization policy pack is invalid."); this.code = code; } }
function fail(code) { throw new OrganizationPolicyError(code); }
function compare(left, right) { return left.split(".").map(Number).reduce((result, part, index) => result || part - Number(right.split(".")[index]), 0); }
export function validateOrganizationPolicyPack(pack, { coreVersion } = {}) {
  if (!exact(pack, ["schema", "packId", "revision", "compatibility", "governanceFloors", "documentClasses"]) || pack.schema !== "pipeline.organization-policy-pack.v1" || !ID.test(pack.packId) || !SHA.test(pack.revision)) fail("OPP-SHAPE");
  if (!exact(pack.compatibility, ["minimumCoreVersion", "maximumCoreVersion"]) || !VERSION.test(pack.compatibility.minimumCoreVersion) || !VERSION.test(pack.compatibility.maximumCoreVersion) || compare(pack.compatibility.minimumCoreVersion, pack.compatibility.maximumCoreVersion) > 0) fail("OPP-COMPATIBILITY");
  if (coreVersion !== undefined && (!VERSION.test(coreVersion) || compare(coreVersion, pack.compatibility.minimumCoreVersion) < 0 || compare(coreVersion, pack.compatibility.maximumCoreVersion) > 0)) fail("OPP-CORE-VERSION");
  if (!exact(pack.governanceFloors, ["requireHumanDecisionLedger", "allowExternalAuthority"]) || pack.governanceFloors.requireHumanDecisionLedger !== true || pack.governanceFloors.allowExternalAuthority !== false || !Array.isArray(pack.documentClasses) || pack.documentClasses.length > 32) fail("OPP-FLOOR");
  const seen = new Set(); for (const entry of pack.documentClasses) { if (!exact(entry, ["class", "mode", "approvalRequired"]) || !CLASSES.has(entry.class) || !MODES.has(entry.mode) || typeof entry.approvalRequired !== "boolean" || seen.has(entry.class)) fail("OPP-DOCUMENT"); seen.add(entry.class); }
  return Object.freeze({ ...pack, compatibility: Object.freeze({ ...pack.compatibility }), governanceFloors: Object.freeze({ ...pack.governanceFloors }), documentClasses: Object.freeze(pack.documentClasses.map((entry) => Object.freeze({ ...entry }))) });
}

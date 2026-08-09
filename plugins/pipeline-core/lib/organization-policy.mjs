// SPDX-License-Identifier: SUL-1.0
/** Closed PHX-3 organization policy pack validation and fail-closed compatibility. */
const SHA = /^[a-f0-9]{64}$/u; const ID = /^[a-z][a-z0-9-]{2,63}$/u; const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/u;
export const CLASSES = new Set(["architecture", "operations", "security", "privacy", "continuity", "recovery", "release", "change-management"]); const MODES = new Set(["reference-only", "projection", "controlled-publication"]);
// WP-P-AC01: signaturePolicy's closed algorithm vocabulary. "none" is a real,
// distinct declared state (this pack is not signed), not an omission -- kept
// in the same closed set so a pack can say so explicitly rather than leaving
// the field out, while still failing closed if required=true pairs with it.
const SIGNATURE_ALGORITHMS = new Set(["ed25519", "none"]);
// targetBinding (P-AC-11) is an OPTIONAL, closed, provider-neutral reference:
// WHAT the entry's scope applies to, when a pack chooses to declare one.
// targetRef is an opaque bounded identifier (never a literal file path, URL,
// credential, or provider-specific field); a provider-specific layer outside
// this schema, not this file, resolves it. Optional (not mandatory) so every
// pre-existing three-key documentClasses entry (class/mode/approvalRequired)
// stays valid unchanged; a pack MAY add the fourth key to also scope a
// target -- any other shape (missing sub-field, extra field, wrong type,
// unknown targetClass) is rejected exactly like every other closed field.
const TARGET_CLASSES = new Set(["artifact", "repository-path-pattern", "external-system"]); export const TARGET_REF = /^[a-z][a-z0-9-]{2,63}$/u;
// WP-P-AC01: provenance, dependencies, and signaturePolicy are OPTIONAL
// pack-level fields, following the exact precedent targetBinding set above:
// keeping them optional (rather than mandatory) is what lets every
// pre-existing three-key documentClasses fixture and six-key pack fixture
// stay valid unchanged -- a P-AC-01 pack MAY declare any subset of the three;
// omitting all three is still a fully valid pack. Each is pack-scoped only
// (deliberately NOT folded into resolveEffectiveOrganizationPolicy's
// cross-pack merge below): provenance/signaturePolicy describe THIS pack's
// own origin and authenticity story, never a value that competes across
// packs, and dependencies is validated here as a well-formed declaration only
// (shape, no self-dependency, no duplicate target, valid version range) --
// resolving a dependency against which packs are actually present in an
// activation is a different concern than this function's per-pack inspection
// contract, and out of this dispatch's scope.
function record(v) { return v !== null && typeof v === "object" && !Array.isArray(v); } function exact(v, keys) { return record(v) && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key)); }
function hasTargetBinding(entry) { return record(entry) && Object.hasOwn(entry, "targetBinding"); }
function validTargetBinding(v) { return exact(v, ["targetClass", "targetRef"]) && TARGET_CLASSES.has(v.targetClass) && TARGET_REF.test(v.targetRef); }
function sameTargetBinding(left, right) { if (left === undefined && right === undefined) return true; if (left === undefined || right === undefined) return false; return left.targetClass === right.targetClass && left.targetRef === right.targetRef; }
function freezeDocumentEntry(entry) { return hasTargetBinding(entry) ? Object.freeze({ ...entry, targetBinding: Object.freeze({ ...entry.targetBinding }) }) : Object.freeze({ ...entry }); }
export class OrganizationPolicyError extends Error { constructor(code) { super("Organization policy pack is invalid."); this.code = code; } }
function fail(code) { throw new OrganizationPolicyError(code); }
function compare(left, right) { const rightParts = right.split(".").map(Number); return left.split(".").map(Number).reduce((result, part, index) => result || part - rightParts[index], 0); }
// WP-P-AC01: the closed key set grows by exactly the optional fields the
// candidate pack itself declares (Object.hasOwn) -- same technique
// documentClasses entries already use for targetBinding, generalized to
// three independent optional top-level fields instead of one.
function packKeys(pack) { const keys = ["schema", "packId", "revision", "compatibility", "governanceFloors", "documentClasses"]; if (record(pack) && Object.hasOwn(pack, "provenance")) keys.push("provenance"); if (record(pack) && Object.hasOwn(pack, "dependencies")) keys.push("dependencies"); if (record(pack) && Object.hasOwn(pack, "signaturePolicy")) keys.push("signaturePolicy"); return keys; }
function validProvenance(value) { return exact(value, ["publisherId", "publishedAtEpochMs"]) && ID.test(value.publisherId) && Number.isSafeInteger(value.publishedAtEpochMs) && value.publishedAtEpochMs >= 0; }
function validDependencies(pack, dependencies) { if (!Array.isArray(dependencies) || dependencies.length > 32) return false; const seen = new Set(); for (const dependency of dependencies) { if (!exact(dependency, ["packId", "minimumVersion", "maximumVersion"]) || !ID.test(dependency.packId) || dependency.packId === pack.packId || !VERSION.test(dependency.minimumVersion) || !VERSION.test(dependency.maximumVersion) || compare(dependency.minimumVersion, dependency.maximumVersion) > 0 || seen.has(dependency.packId)) return false; seen.add(dependency.packId); } return true; }
function validSignaturePolicy(value) { return exact(value, ["required", "algorithm"]) && typeof value.required === "boolean" && SIGNATURE_ALGORITHMS.has(value.algorithm) && !(value.required && value.algorithm === "none"); }
export function validateOrganizationPolicyPack(pack, { coreVersion } = {}) {
  if (!exact(pack, packKeys(pack)) || pack.schema !== "pipeline.organization-policy-pack.v1" || !ID.test(pack.packId) || !SHA.test(pack.revision)) fail("OPP-SHAPE");
  if (!exact(pack.compatibility, ["minimumCoreVersion", "maximumCoreVersion"]) || !VERSION.test(pack.compatibility.minimumCoreVersion) || !VERSION.test(pack.compatibility.maximumCoreVersion) || compare(pack.compatibility.minimumCoreVersion, pack.compatibility.maximumCoreVersion) > 0) fail("OPP-COMPATIBILITY");
  if (coreVersion !== undefined && (!VERSION.test(coreVersion) || compare(coreVersion, pack.compatibility.minimumCoreVersion) < 0 || compare(coreVersion, pack.compatibility.maximumCoreVersion) > 0)) fail("OPP-CORE-VERSION");
  if (!exact(pack.governanceFloors, ["requireHumanDecisionLedger", "allowExternalAuthority"]) || pack.governanceFloors.requireHumanDecisionLedger !== true || pack.governanceFloors.allowExternalAuthority !== false || !Array.isArray(pack.documentClasses) || pack.documentClasses.length > 32) fail("OPP-FLOOR");
  const seen = new Set(); for (const entry of pack.documentClasses) { const scoped = hasTargetBinding(entry); if (!exact(entry, scoped ? ["class", "mode", "approvalRequired", "targetBinding"] : ["class", "mode", "approvalRequired"]) || !CLASSES.has(entry.class) || !MODES.has(entry.mode) || typeof entry.approvalRequired !== "boolean" || (scoped && !validTargetBinding(entry.targetBinding)) || seen.has(entry.class)) fail("OPP-DOCUMENT"); seen.add(entry.class); }
  // WP-P-AC01: each check only runs when the pack actually declares the
  // optional field (Object.hasOwn) -- an absent field was already excluded
  // from the closed key set above, so there is nothing further to validate.
  if (Object.hasOwn(pack, "provenance") && !validProvenance(pack.provenance)) fail("OPP-PROVENANCE");
  if (Object.hasOwn(pack, "dependencies") && !validDependencies(pack, pack.dependencies)) fail("OPP-DEPENDENCIES");
  if (Object.hasOwn(pack, "signaturePolicy") && !validSignaturePolicy(pack.signaturePolicy)) fail("OPP-SIGNATURE");
  return Object.freeze({
    ...pack,
    compatibility: Object.freeze({ ...pack.compatibility }),
    governanceFloors: Object.freeze({ ...pack.governanceFloors }),
    documentClasses: Object.freeze(pack.documentClasses.map(freezeDocumentEntry)),
    ...(Object.hasOwn(pack, "provenance") ? { provenance: Object.freeze({ ...pack.provenance }) } : {}),
    ...(Object.hasOwn(pack, "dependencies") ? { dependencies: Object.freeze(pack.dependencies.map((dependency) => Object.freeze({ ...dependency }))) } : {}),
    ...(Object.hasOwn(pack, "signaturePolicy") ? { signaturePolicy: Object.freeze({ ...pack.signaturePolicy }) } : {}),
  });
}

/**
 * Resolve independently validated organization packs without last-write-wins.
 * A class mode is intentionally not merged: different modes describe different
 * publication boundaries, so silently choosing either one could weaken a
 * policy. Approval requirements are safely intersected as a logical OR.
 *
 * targetBinding (P-AC-11), when declared, follows mode's rule, not approval's:
 * it is a single scoping reference (targetClass + targetRef), not a boolean,
 * so there is no safe union -- two packs naming a different target (including
 * one declaring a target and another leaving it undeclared) for the same
 * document class describe two different publication boundaries, and silently
 * picking either one could scope permission onto a target the PO never
 * reviewed. A mismatch therefore fails closed exactly like mode, under the
 * same OPP-RESOLVE-CONFLICT code (both are "never merged, conflict is fatal"
 * scoping dimensions, unlike approval's safe OR); only an EXACT match
 * (including both sides leaving it undeclared) is admitted.
 *
 * revisions (P-AC-11 revision readback) is new, purely additive readback: for
 * the class this entry now represents, which pack(s) and which exact revision
 * of each contributed its effective mode/approvalRequired/targetBinding --
 * not just the flat, unordered packIds this file already returned. It never
 * gates a decision here (unlike mode/targetBinding/approval it carries no
 * conflict semantics of its own), so it is always safely appended, one entry
 * per contributing pack, then sorted deterministically for output.
 */
export function resolveEffectiveOrganizationPolicy({ coreVersion, packs } = {}) {
  if (!VERSION.test(coreVersion ?? "") || !Array.isArray(packs) || packs.length === 0 || packs.length > 32) fail("OPP-RESOLVE-INPUT");
  const packIds = new Set(); const seenRevisions = new Set(); const classes = new Map(); const bindings = [];
  for (const input of packs) {
    const pack = validateOrganizationPolicyPack(input, { coreVersion });
    if (packIds.has(pack.packId) || seenRevisions.has(pack.revision)) fail("OPP-RESOLVE-DUPLICATE");
    packIds.add(pack.packId); seenRevisions.add(pack.revision); bindings.push(frozenBinding(pack));
    for (const entry of pack.documentClasses) {
      const existing = classes.get(entry.class);
      if (existing && (existing.mode !== entry.mode || !sameTargetBinding(existing.targetBinding, entry.targetBinding))) fail("OPP-RESOLVE-CONFLICT");
      classes.set(entry.class, existing
        ? { class: entry.class, mode: entry.mode, approvalRequired: existing.approvalRequired || entry.approvalRequired, targetBinding: entry.targetBinding, packIds: [...existing.packIds, pack.packId], revisions: [...existing.revisions, { packId: pack.packId, revision: pack.revision }] }
        : { class: entry.class, mode: entry.mode, approvalRequired: entry.approvalRequired, targetBinding: entry.targetBinding, packIds: [pack.packId], revisions: [{ packId: pack.packId, revision: pack.revision }] });
    }
  }
  return Object.freeze({
    schema: "pipeline.effective-organization-policy.v1",
    coreVersion,
    governanceFloors: Object.freeze({ requireHumanDecisionLedger: true, allowExternalAuthority: false }),
    packs: Object.freeze(bindings.sort((left, right) => left.packId.localeCompare(right.packId))),
    documentClasses: Object.freeze([...classes.values()].sort((left, right) => left.class.localeCompare(right.class)).map((entry) => {
      const { targetBinding, packIds: entryPackIds, revisions: entryRevisions, ...rest } = entry;
      return Object.freeze({
        ...rest,
        ...(targetBinding !== undefined ? { targetBinding: Object.freeze({ ...targetBinding }) } : {}),
        packIds: Object.freeze([...entryPackIds].sort()),
        revisions: Object.freeze([...entryRevisions].sort((left, right) => left.packId.localeCompare(right.packId) || left.revision.localeCompare(right.revision)).map((revisionEntry) => Object.freeze({ ...revisionEntry }))),
      });
    })),
  });
}

function frozenBinding(pack) { return Object.freeze({ packId: pack.packId, revision: pack.revision, compatibility: Object.freeze({ ...pack.compatibility }) }); }

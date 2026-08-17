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
// F1 fix: ownedSections values name external-reference-adapter.mjs's own
// changes[].field values (validated there by its own ID pattern), NOT
// targetRef-shaped pack-level identifiers -- they are a different scoping
// dimension with a different legal character set (field names commonly carry
// uppercase letters, '.', '_', ':', and a leading digit, none of which
// TARGET_REF's slug shape admits). This file deliberately does not import
// from external-reference-adapter.mjs (wrong dependency direction: the
// policy model is the lower layer), so this pattern is a duplicate of that
// file's ID pattern, pinned equal by a test in organization-policy.test.mjs
// that fails if either one narrows and silently reopens the gap. The
// character set is purely structural (case/punctuation/length), so widening
// it admits no provider, vendor, or product name.
export const OWNED_SECTION_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
// WP-PAC11: the five remaining P-AC-11 scoping dimensions (owned
// fields/sections, lifecycle event, preview, retention, conflict policy),
// each OPTIONAL and closed, following targetBinding's own precedent exactly.
// lifecycleEvents reuses the epic's OWN canonical lifecycle-state vocabulary
// verbatim (acceptance.md V-AC-08: "proposed, active, completed, superseded,
// abandoned, or retained") rather than inventing a parallel one.
//
// F2 fix: this vocabulary is NOT disjoint from feature-package-topology.mjs's
// FEATURE_STATES -- four values are shared verbatim (completed, superseded,
// abandoned, retained; pinned in organization-policy.test.mjs so neither
// claim can drift silently again). The true reason external-reference-
// adapter.mjs still does not enforce lifecycleEvents against an artifact's
// binding.identity.lifecycleState is that the two vocabularies describe two
// different lifecycle AUTHORITIES, not one shared authority with gaps:
// LIFECYCLE_EVENTS is the epic's own V-AC-08 publication-event vocabulary
// (WHEN, in the epic's governance process, a publication event happens),
// while FEATURE_STATES is a feature package's OWN build/implementation
// lifecycle (plan-spec-state-v2.mjs's draft through implementing, plus
// verifying). Mapping every one of those build-phase states (draft,
// awaiting-approval, approved, implementing, verifying -- none of which
// lifecycleEvents can even represent) onto a publication-event decision is a
// product policy call this file has no authority to invent; wiring it in
// without that call would silently re-create F1's same unreachable-value
// defect one level up. lifecycleEvents therefore stays declared-but-
// unenforced here, the same posture this file already gives previewRequired
// and conflictPolicy, until a dispatch with that authority defines the
// mapping (tracked as a checklist gap, not resolved by this comment).
export const LIFECYCLE_EVENTS = new Set(["proposed", "active", "completed", "superseded", "abandoned", "retained"]);
// retention is deliberately a closed set of CATEGORICAL commitments, never a
// concrete duration/period: a literal "N days/years" value would be
// inventing a legal/product retention-schedule decision this dispatch has no
// authority to make, and could easily be read as an implicit P-AC-10
// compliance claim ("this satisfies retention regulation X") which this
// schema is expressly forbidden from carrying. The concrete schedule behind
// "retain-per-external-schedule" lives outside this portable policy schema,
// exactly like a provider-specific target lives outside targetRef.
const RETENTION = new Set(["retain-indefinitely", "retain-until-superseded", "retain-per-external-schedule"]);
// conflictPolicy reuses this exact vocabulary root from
// external-reference-adapter.mjs's own existing write-plan statuses
// ("rejected", "reconciliation-required") rather than inventing parallel
// terms; it is a declared disposition only -- this dispatch does not wire it
// into adapter behavior (out of this file's scope).
const CONFLICT_POLICIES = new Set(["reject", "require-reconciliation"]);
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
// WP-PAC11: a bounded, deduplicated array of opaque OWNED_SECTION_REF-shaped
// ids (see the F1-fix comment above OWNED_SECTION_REF's definition for why
// this is not targetRef-shaped) or of closed LIFECYCLE_EVENTS values; both
// close the "no free-form prose" requirement the same way targetBinding does
// for a single reference.
function validIdArray(value, { isMember, maxLength }) { if (!Array.isArray(value) || value.length > maxLength) return false; const seen = new Set(); for (const item of value) { if (!isMember(item) || seen.has(item)) return false; seen.add(item); } return true; }
function validOwnedSections(value) { return validIdArray(value, { isMember: (item) => typeof item === "string" && OWNED_SECTION_REF.test(item), maxLength: 32 }); }
function validLifecycleEvents(value) { return validIdArray(value, { isMember: (item) => LIFECYCLE_EVENTS.has(item), maxLength: LIFECYCLE_EVENTS.size }); }
// WP-PAC11: the closed key set grows by exactly the optional dimensions THIS
// entry itself declares (Object.hasOwn) -- same technique packKeys already
// generalizes for the pack-level optional fields below, applied here to the
// five new entry-level optional fields in addition to targetBinding. A
// pre-existing three-key or four-key entry validates unchanged.
function entryKeys(entry) {
  const keys = ["class", "mode", "approvalRequired"];
  if (hasTargetBinding(entry)) keys.push("targetBinding");
  if (record(entry) && Object.hasOwn(entry, "ownedSections")) keys.push("ownedSections");
  if (record(entry) && Object.hasOwn(entry, "lifecycleEvents")) keys.push("lifecycleEvents");
  if (record(entry) && Object.hasOwn(entry, "previewRequired")) keys.push("previewRequired");
  if (record(entry) && Object.hasOwn(entry, "retention")) keys.push("retention");
  if (record(entry) && Object.hasOwn(entry, "conflictPolicy")) keys.push("conflictPolicy");
  return keys;
}
function freezeDocumentEntry(entry) {
  return Object.freeze({
    ...entry,
    ...(hasTargetBinding(entry) ? { targetBinding: Object.freeze({ ...entry.targetBinding }) } : {}),
    ...(Object.hasOwn(entry, "ownedSections") ? { ownedSections: Object.freeze([...entry.ownedSections]) } : {}),
    ...(Object.hasOwn(entry, "lifecycleEvents") ? { lifecycleEvents: Object.freeze([...entry.lifecycleEvents]) } : {}),
  });
}
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
  const seen = new Set(); for (const entry of pack.documentClasses) {
    const scoped = hasTargetBinding(entry);
    if (
      !exact(entry, entryKeys(entry)) || !CLASSES.has(entry.class) || !MODES.has(entry.mode) || typeof entry.approvalRequired !== "boolean" ||
      (scoped && !validTargetBinding(entry.targetBinding)) ||
      (Object.hasOwn(entry, "ownedSections") && !validOwnedSections(entry.ownedSections)) ||
      (Object.hasOwn(entry, "lifecycleEvents") && !validLifecycleEvents(entry.lifecycleEvents)) ||
      (Object.hasOwn(entry, "previewRequired") && typeof entry.previewRequired !== "boolean") ||
      (Object.hasOwn(entry, "retention") && !RETENTION.has(entry.retention)) ||
      (Object.hasOwn(entry, "conflictPolicy") && !CONFLICT_POLICIES.has(entry.conflictPolicy)) ||
      seen.has(entry.class)
    ) fail("OPP-DOCUMENT");
    seen.add(entry.class);
  }
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
 *
 * WP-PAC11 (the five remaining P-AC-11 dimensions) split into the same two
 * families mode/targetBinding and approvalRequired already established:
 *  - retention has no safe partial order between its categorical commitments
 *    (see RETENTION's own comment above) -- it follows mode/targetBinding
 *    exactly: EXACT match only (undeclared vs declared is itself a
 *    mismatch), fails OPP-RESOLVE-CONFLICT otherwise.
 *  - ownedSections and lifecycleEvents are permission-narrowing SETS with a
 *    genuine subset lattice (unlike a single categorical value), so the safe
 *    combination is INTERSECTION: the effective set can never exceed what
 *    EVERY contributing pack individually sanctioned. An undeclared side is
 *    neutral (no additional restriction stated by that pack) and never
 *    narrows the other side.
 *  - previewRequired generalizes approvalRequired's own boolean OR exactly
 *    (never downgrades once any pack requires a preview).
 *  - conflictPolicy is a two-value ranked categorical, not a free lattice:
 *    "reject" is strictly the safer disposition (it never proceeds without a
 *    brand-new cycle), so it generalizes the OR rule to a ranked max instead.
 * For all four safely-combined fields, a side that never declared the field
 * at all is neutral and never blocks or weakens the other side's declaration.
 */
function sameOptional(left, right) { if (left === undefined && right === undefined) return true; if (left === undefined || right === undefined) return false; return left === right; }
function intersectOptional(left, right) { if (left === undefined && right === undefined) return undefined; if (left === undefined) return [...right].sort(); if (right === undefined) return [...left].sort(); const keep = new Set(right); return [...left].filter((value) => keep.has(value)).sort(); }
function orOptional(left, right) { if (left === undefined) return right; if (right === undefined) return left; return left || right; }
const CONFLICT_POLICY_RANK = new Map([["require-reconciliation", 0], ["reject", 1]]);
function strictestOptional(left, right) { if (left === undefined) return right; if (right === undefined) return left; return CONFLICT_POLICY_RANK.get(left) >= CONFLICT_POLICY_RANK.get(right) ? left : right; }
export function resolveEffectiveOrganizationPolicy({ coreVersion, packs } = {}) {
  if (!VERSION.test(coreVersion ?? "") || !Array.isArray(packs) || packs.length === 0 || packs.length > 32) fail("OPP-RESOLVE-INPUT");
  const packIds = new Set(); const seenRevisions = new Set(); const classes = new Map(); const bindings = [];
  for (const input of packs) {
    const pack = validateOrganizationPolicyPack(input, { coreVersion });
    if (packIds.has(pack.packId) || seenRevisions.has(pack.revision)) fail("OPP-RESOLVE-DUPLICATE");
    packIds.add(pack.packId); seenRevisions.add(pack.revision); bindings.push(frozenBinding(pack));
    for (const entry of pack.documentClasses) {
      const existing = classes.get(entry.class);
      if (existing && (existing.mode !== entry.mode || !sameTargetBinding(existing.targetBinding, entry.targetBinding) || !sameOptional(existing.retention, entry.retention))) fail("OPP-RESOLVE-CONFLICT");
      classes.set(entry.class, existing
        ? { class: entry.class, mode: entry.mode, approvalRequired: existing.approvalRequired || entry.approvalRequired, targetBinding: entry.targetBinding, ownedSections: intersectOptional(existing.ownedSections, entry.ownedSections), lifecycleEvents: intersectOptional(existing.lifecycleEvents, entry.lifecycleEvents), previewRequired: orOptional(existing.previewRequired, entry.previewRequired), retention: entry.retention, conflictPolicy: strictestOptional(existing.conflictPolicy, entry.conflictPolicy), packIds: [...existing.packIds, pack.packId], revisions: [...existing.revisions, { packId: pack.packId, revision: pack.revision }] }
        : { class: entry.class, mode: entry.mode, approvalRequired: entry.approvalRequired, targetBinding: entry.targetBinding, ownedSections: entry.ownedSections, lifecycleEvents: entry.lifecycleEvents, previewRequired: entry.previewRequired, retention: entry.retention, conflictPolicy: entry.conflictPolicy, packIds: [pack.packId], revisions: [{ packId: pack.packId, revision: pack.revision }] });
    }
  }
  return Object.freeze({
    schema: "pipeline.effective-organization-policy.v1",
    coreVersion,
    governanceFloors: Object.freeze({ requireHumanDecisionLedger: true, allowExternalAuthority: false }),
    packs: Object.freeze(bindings.sort((left, right) => left.packId.localeCompare(right.packId))),
    documentClasses: Object.freeze([...classes.values()].sort((left, right) => left.class.localeCompare(right.class)).map((entry) => {
      const { targetBinding, ownedSections, lifecycleEvents, previewRequired, retention, conflictPolicy, packIds: entryPackIds, revisions: entryRevisions, ...rest } = entry;
      return Object.freeze({
        ...rest,
        ...(targetBinding !== undefined ? { targetBinding: Object.freeze({ ...targetBinding }) } : {}),
        ...(ownedSections !== undefined ? { ownedSections: Object.freeze([...ownedSections]) } : {}),
        ...(lifecycleEvents !== undefined ? { lifecycleEvents: Object.freeze([...lifecycleEvents]) } : {}),
        ...(previewRequired !== undefined ? { previewRequired } : {}),
        ...(retention !== undefined ? { retention } : {}),
        ...(conflictPolicy !== undefined ? { conflictPolicy } : {}),
        packIds: Object.freeze([...entryPackIds].sort()),
        revisions: Object.freeze([...entryRevisions].sort((left, right) => left.packId.localeCompare(right.packId) || left.revision.localeCompare(right.revision)).map((revisionEntry) => Object.freeze({ ...revisionEntry }))),
      });
    })),
  });
}

function frozenBinding(pack) { return Object.freeze({ packId: pack.packId, revision: pack.revision, compatibility: Object.freeze({ ...pack.compatibility }) }); }

// SPDX-License-Identifier: SUL-1.0
//
// Exports (stable — CYB-1c/1e/1g import from this exact module path):
//   ASSURANCE_LEVELS          -> readonly ["baseline","elevated","critical"], low -> high
//                                (CYB-1F §5 enum, in ascending-strictness order)
//   MODULE_PRECEDENCE_ORDER   -> readonly [mod.ai-agent, ..., mod.docs-only], high -> low
//                                (CYB-1F §6 ratified total precedence order, verbatim)
//   resolveApplicableControls(input) -> ResolvedPolicy
//                                the L1 applicability resolver (pure function); throws
//                                a typed error on malformed/ambiguous input, never guesses
//
// Implements the CYB-1 feature-spec (cyb-1-feature-spec.md §3) rows AC2, AC3,
// AC4, AC10 only. Depends on CYB-1F §5 (assurance-level enum) and §6 (module
// registry + precedence), both frozen and RATIFIED
// (cyb-1f-schema-boundary-draft.md). Does NOT extend or re-open
// control-catalog-schema.mjs's closed §8 field set; this module's own
// "catalog entry" wrapper (below) carries the assurance-level/module
// metadata that §8 deliberately leaves unfrozen (cyb-1f-schema-boundary-draft.md
// §1 "deliberately leaves open ... reference-catalog instance").
//
// ---------------------------------------------------------------------------
// DESIGN DECISIONS (this task's genuine design latitude, per CYB-1b briefing
// field 1 — documented here so CYB-1c/1e/1g can build on this without
// re-deriving it from the diff):
//
// 1. Assurance-level declaration — a *threshold*, not a set membership list.
//    Each catalog entry (see CatalogEntry shape below) carries a single
//    `minAssuranceLevel` naming the LOWEST level at which that
//    control-version applies. It also applies at every level ranked at or
//    above that one. This directly encodes CYB-1F §5's "a level selects a
//    control subset" as an ordinal threshold rather than an independently
//    authored list per level, so `elevated ⊇ baseline ⊇` is a structural
//    property of the comparison (`requestedRank >= entryRank`), not
//    something a catalog author has to keep in sync by hand across three
//    parallel lists (AC2's composability requirement).
//    This metadata is NOT a new field on the CYB-1a control record — it
//    lives on the wrapper entry alongside the (unmodified) control object,
//    so control-catalog-schema.mjs's closed §8 field set stays untouched.
//
// 2. Module attribution — one entry per (control id, contributing module).
//    A `CatalogEntry` is `{ control, minAssuranceLevel, module }` where
//    `module` is one of the nine CYB-1F §6 `mod.*` ids, or `null` for a
//    universal/base control-version that is not module-scoped (applies
//    whenever its assurance-level threshold is met, regardless of which
//    modules are active). Module conflict (AC3) is expressed by supplying
//    TWO OR MORE entries that share the same `control.id` but declare
//    DIFFERENT `module` values (each module's own version of that control's
//    body — e.g. a stricter `severity`/`boundary`). At most one entry may
//    exist per (id, module) pair — a duplicate (id, module) pair is a
//    catalog-authoring bug and throws rather than being silently resolved
//    (this codebase's "never silent" precedent, matching
//    control-catalog-schema.mjs's own posture). When ≥2 different-module
//    entries for the same id are both in scope (their module activated,
//    their level threshold met), the winner is the one whose module ranks
//    HIGHEST in `MODULE_PRECEDENCE_ORDER` — never input/array order. A
//    universal (`module: null`) entry always loses to any in-scope
//    module-specific entry for the same id (implicit lowest precedence,
//    below `mod.docs-only`), since a module's own opinion is more specific
//    than the universal default.
//
// 3. Resolver input/output shape — a pure function, no fs/network, no
//    mutation of any input argument:
//
//      resolveApplicableControls({
//        assuranceLevel: 'baseline' | 'elevated' | 'critical',
//        activatedModules: string[],       // subset of the 9 mod.* ids; order irrelevant
//        applicabilityInputs: { [name: string]: unknown },
//                                           // a MAP, not an array: presence of the KEY is what
//                                           // is checked (via own-property, not truthiness) —
//                                           // a supplied `false`/`0`/`''` value still counts as
//                                           // "supplied". Kept as a value-carrying map (not a
//                                           // bare name array) so a future package can read
//                                           // the actual values without a shape change.
//        catalogEntries: Array<{ control, minAssuranceLevel, module }>,
//      }) -> {
//        assuranceLevel,
//        activatedModules,                 // echoed, canonicalized (sorted) — output is
//                                           // independent of the input arrays' order
//        resolvedControls: Array<{
//          id,                             // control.id of the winning entry
//          control,                        // the winning entry's control object, unmutated,
//                                          // by reference
//          contributingModule,             // string | null — which module's version won
//          applicability: 'applicable' | 'unknown',
//                                          // 'unknown' exactly when >=1 declared
//                                          // `control.applicability.requiredInputs` entry is
//                                          // absent from `applicabilityInputs` (AC4). This
//                                          // resolver deliberately does NOT interpret the
//                                          // free-form `applicability.expression` string as a
//                                          // boolean condition — no expression grammar is
//                                          // frozen anywhere (CYB-1F §8 calls the composite
//                                          // shape this module's own prose encoding, not an
//                                          // executable language) and none of AC2/AC3/AC4/AC10
//                                          // requires evaluating it; `requiredInputs` presence
//                                          // is the one machine-checkable gate those ACs name.
//          missingInputs: string[],        // empty when applicability === 'applicable'
//        }>,                               // sorted ascending by `id` — canonical, independent
//                                          // of catalogEntries input order; a control whose
//                                          // module isn't activated, or whose level threshold
//                                          // isn't met, is OMITTED from this array entirely
//                                          // (never included as a fake "not-applicable" row —
//                                          // that would blur AC10's "no irrelevant tooling" with
//                                          // AC4's typed `unknown`, which is a different case),
//        digest: 'sha256:<hex>',           // stable content hash over
//                                          // {assuranceLevel, activatedModules, resolvedControls}
//                                          // using a canonical (key-sorted) serialization —
//                                          // identical input always yields an identical digest
//                                          // (AC2), and it varies whenever the resolved output
//                                          // would (the "digest-bound output per exact
//                                          // candidate" requirement in spec.md §2 item 4).
//      }
//
// Malformed input (wrong JS type where an object/array is required) throws
// TypeError; a value outside a closed enum (assuranceLevel, module ids)
// throws RangeError; the (id, module) duplicate-entry invariant throws a
// plain Error. None of these is a "resolved result" — they are catalog/
// caller programming errors, surfaced loudly rather than guessed at.

import { createHash } from "node:crypto";

export const ASSURANCE_LEVELS = Object.freeze(["baseline", "elevated", "critical"]);
const ASSURANCE_LEVEL_RANK = new Map(ASSURANCE_LEVELS.map((level, index) => [level, index]));

// CYB-1F §6 ratified total precedence order, most-specific/highest-risk first.
export const MODULE_PRECEDENCE_ORDER = Object.freeze([
  "mod.ai-agent",
  "mod.sensitive-data",
  "mod.secrets-identity",
  "mod.iac-cloud",
  "mod.container-deploy",
  "mod.web-api",
  "mod.native-desktop",
  "mod.cli-lib",
  "mod.docs-only",
]);
const MODULE_PRECEDENCE_RANK = new Map(MODULE_PRECEDENCE_ORDER.map((moduleId, index) => [moduleId, index]));
// A universal (module: null) entry always loses to any real, in-scope module entry.
const UNIVERSAL_RANK = MODULE_PRECEDENCE_ORDER.length;

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function rankOfModule(moduleId) {
  return moduleId === null ? UNIVERSAL_RANK : MODULE_PRECEDENCE_RANK.get(moduleId);
}

// Deterministic, key-order-independent serialization used only for digesting
// (read-only: never mutates `value`, tolerates deeply frozen input).
function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// The L1 applicability resolver (AC2, AC3, AC4, AC10). Pure: performs no
// filesystem/network access and mutates none of `input`'s (nested) values.
export function resolveApplicableControls(input) {
  if (!isPlainObject(input)) {
    throw new TypeError("resolveApplicableControls: input must be a plain object");
  }
  const { assuranceLevel, activatedModules, applicabilityInputs, catalogEntries } = input;

  if (!ASSURANCE_LEVEL_RANK.has(assuranceLevel)) {
    throw new RangeError(`resolveApplicableControls: assuranceLevel must be one of ${ASSURANCE_LEVELS.join("|")} (CYB-1F §5), got ${JSON.stringify(assuranceLevel)}`);
  }
  if (!Array.isArray(activatedModules)) {
    throw new TypeError("resolveApplicableControls: activatedModules must be an array");
  }
  for (const moduleId of activatedModules) {
    if (!MODULE_PRECEDENCE_RANK.has(moduleId)) {
      throw new RangeError(`resolveApplicableControls: activatedModules contains an unregistered module id ${JSON.stringify(moduleId)} (CYB-1F §6)`);
    }
  }
  if (!isPlainObject(applicabilityInputs)) {
    throw new TypeError("resolveApplicableControls: applicabilityInputs must be a plain object map of input-name -> value");
  }
  if (!Array.isArray(catalogEntries)) {
    throw new TypeError("resolveApplicableControls: catalogEntries must be an array");
  }

  const activatedSet = new Set(activatedModules);
  const requestedRank = ASSURANCE_LEVEL_RANK.get(assuranceLevel);

  // Group entries by control id, enforcing the at-most-one-entry-per-
  // (id, module) invariant that makes precedence resolution unambiguous.
  const byId = new Map(); // control.id -> Map(moduleKey -> entry)
  catalogEntries.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new TypeError(`resolveApplicableControls: catalogEntries[${index}] must be a plain object`);
    }
    const { control, minAssuranceLevel, module } = entry;
    if (!isPlainObject(control) || !isNonEmptyString(control.id)) {
      throw new TypeError(`resolveApplicableControls: catalogEntries[${index}].control must be an object with a non-empty "id"`);
    }
    if (!ASSURANCE_LEVEL_RANK.has(minAssuranceLevel)) {
      throw new RangeError(`resolveApplicableControls: catalogEntries[${index}].minAssuranceLevel must be one of ${ASSURANCE_LEVELS.join("|")}, got ${JSON.stringify(minAssuranceLevel)}`);
    }
    if (module !== null && !MODULE_PRECEDENCE_RANK.has(module)) {
      throw new RangeError(`resolveApplicableControls: catalogEntries[${index}].module must be null or a registered mod.* id (CYB-1F §6), got ${JSON.stringify(module)}`);
    }
    const moduleKey = module === null ? "universal" : module;
    let variants = byId.get(control.id);
    if (!variants) {
      variants = new Map();
      byId.set(control.id, variants);
    }
    if (variants.has(moduleKey)) {
      throw new Error(`resolveApplicableControls: duplicate catalogEntries for control id ${JSON.stringify(control.id)} and module ${JSON.stringify(module)} — at most one entry per (id, module) pair is allowed; a differing body for the same id+module is a revision/content change, not a resolver-time conflict`);
    }
    variants.set(moduleKey, entry);
  });

  const resolvedControls = [];
  for (const [id, variants] of byId) {
    // Candidates: entries whose module is universal or activated, AND whose
    // minAssuranceLevel threshold is met by the requested level.
    const candidates = [];
    for (const entry of variants.values()) {
      const inScope = entry.module === null || activatedSet.has(entry.module);
      if (!inScope) continue;
      if (ASSURANCE_LEVEL_RANK.get(entry.minAssuranceLevel) > requestedRank) continue;
      candidates.push(entry);
    }
    if (candidates.length === 0) continue; // not activated / not yet in scope -> omitted entirely (AC10)

    // Precedence, not array/input order (AC3): lowest rank number wins.
    const winner = candidates.reduce((best, current) => (rankOfModule(current.module) < rankOfModule(best.module) ? current : best));

    const applicability = isPlainObject(winner.control.applicability) ? winner.control.applicability : null;
    const requiredInputs = applicability && Array.isArray(applicability.requiredInputs) ? applicability.requiredInputs : [];
    const missingInputs = requiredInputs.filter((name) => !hasOwn(applicabilityInputs, name));

    resolvedControls.push({
      id,
      control: winner.control,
      contributingModule: winner.module,
      applicability: missingInputs.length > 0 ? "unknown" : "applicable",
      missingInputs,
    });
  }

  // Canonical output order: independent of catalogEntries/activatedModules
  // input array order, so byte-identical calls stay byte-identical (AC2)
  // even if a caller happens to pass entries/modules in a different order.
  resolvedControls.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sortedActivatedModules = [...activatedModules].sort();

  const digestPayload = canonicalize({ assuranceLevel, activatedModules: sortedActivatedModules, resolvedControls });
  const digest = `sha256:${createHash("sha256").update(digestPayload).digest("hex")}`;

  return {
    assuranceLevel,
    activatedModules: sortedActivatedModules,
    resolvedControls,
    digest,
  };
}

// SPDX-License-Identifier: SUL-1.0
/** Closed PHX-3 lifecycle payload validation; lifecycle records are never authority. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9._:-]{0,127}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const KINDS = new Set(["dispatch", "status", "cancellation", "candidate-invalidation", "verification", "review", "gate", "recovery", "reconciliation"]);
const STATUSES = new Set(["proposed", "active", "completed", "failed", "cancelled", "unknown", "unavailable", "invalidated"]);

export class LifecycleGovernanceEventError extends Error {
  constructor(code) { super("Lifecycle governance event is invalid."); this.name = "LifecycleGovernanceEventError"; this.code = code; }
}
function fail(code) { throw new LifecycleGovernanceEventError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function nullableId(value) { return value === null || (typeof value === "string" && ID.test(value)); }

/**
 * Runner-specific detail is admissible only under a registered namespace, and
 * only as a value the registry itself enumerates.
 *
 * The earlier grammar here admitted any bounded identifier, reason code or
 * object id.  That is not a privacy boundary: `AKIAIOSFODNN7EXAMPLE` is a valid
 * identifier, `ghp_...` is a valid identifier, and a 64-hex object id is a valid
 * digest of arbitrary private text.  A field a provider controls, on a record
 * that is written once and later exported, cannot be closed by a shape test --
 * only by a vocabulary.  So every domain below is incapable of carrying entropy:
 * booleans, counts bounded by the registry, and listed values.  There is no open
 * string domain, deliberately.
 */
const REGISTRY_SCHEMA = "pipeline.lifecycle-extension-namespaces.v1";
const NAMESPACE = /^pipeline\.[a-z][a-z0-9-]{0,62}$/u;
const DOMAINS = new Set(["boolean", "count", "enum"]);
function loadRegistry() {
  const registry = JSON.parse(readFileSync(fileURLToPath(new URL("../config/lifecycle-extension-namespaces.json", import.meta.url)), "utf8"));
  const keys = Object.keys(registry).filter((key) => key !== "$comment");
  if (keys.length !== 2 || registry.schema !== REGISTRY_SCHEMA || !record(registry.namespaces)) throw new LifecycleGovernanceEventError("LGE-REGISTRY");
  for (const [namespace, entries] of Object.entries(registry.namespaces)) {
    if (!NAMESPACE.test(namespace) || !record(entries)) throw new LifecycleGovernanceEventError("LGE-REGISTRY");
    for (const [entry, spec] of Object.entries(entries)) {
      if (!ID.test(entry) || !record(spec) || !DOMAINS.has(spec.domain)) throw new LifecycleGovernanceEventError("LGE-REGISTRY");
      if (spec.domain === "boolean" && !exact(spec, ["domain"])) throw new LifecycleGovernanceEventError("LGE-REGISTRY");
      if (spec.domain === "count" && (!exact(spec, ["domain", "max"]) || !Number.isSafeInteger(spec.max) || spec.max < 1)) throw new LifecycleGovernanceEventError("LGE-REGISTRY");
      if (spec.domain === "enum" && (!exact(spec, ["domain", "values"]) || !Array.isArray(spec.values) || spec.values.length === 0
        || new Set(spec.values).size !== spec.values.length || !spec.values.every((value) => typeof value === "string" && (ID.test(value) || CODE.test(value))))) throw new LifecycleGovernanceEventError("LGE-REGISTRY");
    }
  }
  return Object.freeze(new Map(Object.entries(registry.namespaces).map(([namespace, entries]) => [namespace, Object.freeze(new Map(Object.entries(entries)))])));
}
const REGISTRY = loadRegistry();

/** The namespaces a durable lifecycle record may carry detail under. */
export const LIFECYCLE_EXTENSION_NAMESPACES = Object.freeze([...REGISTRY.keys()]);
export function isRegisteredLifecycleExtensionNamespace(value) { return REGISTRY.has(value); }

function admissible(spec, value) {
  if (spec.domain === "boolean") return typeof value === "boolean";
  if (spec.domain === "count") return Number.isSafeInteger(value) && value >= 0 && value <= spec.max;
  return typeof value === "string" && spec.values.includes(value);
}
function extensions(value) {
  if (!record(value)) return false;
  return Object.keys(value).every((namespace) => {
    const entries = REGISTRY.get(namespace);
    const detail = value[namespace];
    if (entries === undefined || !record(detail)) return false;
    // Unregistered keys are refused rather than dropped: silently discarding
    // them would let a producer believe detail was retained when it was not.
    return Object.keys(detail).every((entry) => entries.has(entry) && admissible(entries.get(entry), detail[entry]));
  });
}

/** Validates a portable, privacy-safe lifecycle payload with explicit correlation and invalidation links. */
export function validateLifecycleGovernanceEvent(event) {
  const keys = ["eventId", "kind", "status", "reasonCode", "correlation", "candidate", "invalidatesEventId", "supersedesEventId"];
  // `extensions` is additive: a payload that retains no runner detail keeps the
  // base shape byte-for-byte, so the field cannot become a silent requirement.
  const extended = record(event) && Object.hasOwn(event, "extensions");
  if (!exact(event, extended ? [...keys, "extensions"] : keys) || !ID.test(event.eventId) || !KINDS.has(event.kind) || !STATUSES.has(event.status) || !CODE.test(event.reasonCode)) fail("LGE-SHAPE");
  if (extended && !extensions(event.extensions)) fail("LGE-EXTENSIONS");
  if (!exact(event.correlation, ["packageId", "dispatchId", "attemptId", "workerId"]) || !Object.values(event.correlation).every((value) => typeof value === "string" && ID.test(value))) fail("LGE-CORRELATION");
  if (!exact(event.candidate, ["commit", "tree"]) || !OID.test(event.candidate.commit) || !OID.test(event.candidate.tree)) fail("LGE-CANDIDATE");
  if (!nullableId(event.invalidatesEventId) || !nullableId(event.supersedesEventId) || (event.invalidatesEventId !== null && event.supersedesEventId !== null)) fail("LGE-LINKS");
  if (event.kind === "candidate-invalidation" && (event.status !== "invalidated" || event.invalidatesEventId === null)) fail("LGE-INVALIDATION");
  if (event.kind !== "candidate-invalidation" && event.invalidatesEventId !== null) fail("LGE-INVALIDATION");
  return Object.freeze({
    ...event,
    correlation: Object.freeze({ ...event.correlation }),
    candidate: Object.freeze({ ...event.candidate }),
    ...(extended ? { extensions: Object.freeze(Object.fromEntries(Object.entries(event.extensions).map(([namespace, detail]) => [namespace, Object.freeze({ ...detail })]))) } : {}),
  });
}

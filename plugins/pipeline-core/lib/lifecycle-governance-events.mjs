// SPDX-License-Identifier: SUL-1.0
/** Closed PHX-3 lifecycle payload validation; lifecycle records are never authority. */

import { isRegisteredExtensionNamespace } from "./extension-namespaces.mjs";

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
 * only as bounded identifiers, reason codes, object ids, booleans and safe
 * integers.  A namespace is not an escape hatch for free text: admitting an
 * arbitrary JSON value here would reopen exactly the privacy boundary the rest
 * of this payload closes, on the one field a provider controls.
 */
const MAX_EXTENSION_NAMESPACES = 8;
const MAX_EXTENSION_ENTRIES = 16;
function extensionValue(value) {
  return value === null || typeof value === "boolean" || Number.isSafeInteger(value)
    || (typeof value === "string" && (ID.test(value) || CODE.test(value) || OID.test(value)));
}
function extensions(value) {
  if (!record(value)) return false;
  const namespaces = Object.keys(value);
  if (namespaces.length > MAX_EXTENSION_NAMESPACES || !namespaces.every(isRegisteredExtensionNamespace)) return false;
  return namespaces.every((namespace) => {
    const detail = value[namespace];
    if (!record(detail)) return false;
    const entries = Object.keys(detail);
    return entries.length <= MAX_EXTENSION_ENTRIES && entries.every((entry) => ID.test(entry) && extensionValue(detail[entry]));
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

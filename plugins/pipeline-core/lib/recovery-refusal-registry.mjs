// Recovery refusal registry (RV-7): maps each typed refusal code to what a
// recovery caller may do next.
//
// It covers the WT-ORPHAN-* codes that worktree-lifecycle.mjs produces and every
// LOC-* code that legacy-owner-custody.mjs produces; the registry test scans both
// producers, so a code added there without an entry here fails the suite. The
// attended CLI (RV-8..RV-11) registers its own codes here when it lands.
//
// Disposition meaning:
//   refuse      - input or authority is wrong; no attended action makes the same
//                 call succeed. prerequisite is null.
//   unavailable - an attended step makes the call succeed; prerequisite names it
//                 as { kind, action }.
//   handoff     - attended diagnostic required; prerequisite names it.

const entry = (rv, disposition, prerequisite) =>
  Object.freeze({
    rv,
    disposition,
    prerequisite: prerequisite === null ? null : Object.freeze({ ...prerequisite }),
  });

export const RECOVERY_REFUSAL_REGISTRY = Object.freeze({
  "WT-ORPHAN-ARCHIVE-AUDIT": entry("RV-5", "unavailable", {
    kind: "audit-log-writable",
    action: "Make the orphan archive audit log a valid, writable regular file, then retry the archive.",
  }),
  "WT-ORPHAN-ARCHIVE-TARGET-EXISTS": entry("RV-5", "refuse", null),
  "WT-ORPHAN-ARCHIVE-OWNER-OBSERVABLE": entry("RV-1", "unavailable", {
    kind: "owner-confirmed-ended",
    action: "Confirm the descriptor's owning session has ended, then retry the archive.",
  }),
  "WT-ORPHAN-ARCHIVE-AUTHORITY": entry("RV-5", "refuse", null),
  "WT-ORPHAN-ARCHIVE-OWN-SESSION": entry("RV-5", "refuse", null),
  "WT-ORPHAN-ARCHIVE-ARGUMENT": entry("RV-5", "refuse", null),
  // Raised after the archive copy was written; a retry then fails TARGET-EXISTS,
  // so a bare refuse would strand the operator. An attended look is required.
  "WT-ORPHAN-ARCHIVE-READBACK": entry("RV-5", "handoff", {
    kind: "attended-diagnostic",
    action: "Inspect the orphan archive copy already written for this descriptor against the original, then resolve the leftover state by hand; a plain retry fails because the archive target now exists.",
  }),

  // RV-2: classification of a legacy session-cleanup receipt.
  // A conflicting receipt admits only a signed archive disposition (preserve is forbidden for it).
  "LOC-STATUS-MISMATCH": entry("RV-2", "unavailable", {
    kind: "signed-custody-disposition",
    action: "Review the conflicting receipt, then act on it only through a human-signed legacy custody archive disposition.",
  }),
  "LOC-SCHEMA-MISMATCH": entry("RV-2", "unavailable", {
    kind: "signed-custody-disposition",
    action: "Review the conflicting receipt, then act on it only through a human-signed legacy custody archive disposition.",
  }),
  "LOC-DIGEST-MISMATCH": entry("RV-2", "unavailable", {
    kind: "signed-custody-disposition",
    action: "Review the conflicting receipt, then act on it only through a human-signed legacy custody archive disposition.",
  }),
  "LOC-COMPARE-FLAG-FALSE": entry("RV-2", "unavailable", {
    kind: "signed-custody-disposition",
    action: "Review the receipt whose comparison failed, then act on it only through a human-signed legacy custody archive disposition.",
  }),
  "LOC-COMPARE-FLAG-MISSING": entry("RV-2", "handoff", {
    kind: "attended-diagnostic",
    action: "A required comparison flag was not supplied, so the receipt cannot be classified; an attended operator must re-collect the comparison before any custody action.",
  }),
  "LOC-FIELD-MISSING": entry("RV-2", "handoff", {
    kind: "attended-diagnostic",
    action: "The receipt is absent or lacks a required field; an attended operator must inspect it, and only a signed bind-absence or archive disposition may act on it.",
  }),
  "LOC-RECEIPT-AMBIGUOUS": entry("RV-2", "handoff", {
    kind: "attended-diagnostic",
    action: "More than one candidate receipt exists for the session; an attended operator must decide which file is the receipt before any custody action.",
  }),
  "LOC-RECEIPT-OVERSIZE": entry("RV-2", "handoff", {
    kind: "attended-diagnostic",
    action: "The receipt is larger than the 1 MiB bound and was not read; an attended operator must inspect the file by hand.",
  }),

  // RV-3: the detached human proof and the package it signs.
  "LOC-SESSION-NOT-ENDED": entry("RV-3", "unavailable", {
    kind: "owner-confirmed-ended",
    action: "Confirm the owning session has ended, then build the authorization again with sessionEnded set to true.",
  }),
  "LOC-PACKAGE-INVALID": entry("RV-3", "refuse", null),
  "LOC-PROOF-INVALID": entry("RV-3", "refuse", null),
  "LOC-PROOF-SIGNER-MISMATCH": entry("RV-3", "refuse", null),
  "LOC-PROOF-BINDING-MISMATCH": entry("RV-3", "refuse", null),
  "LOC-PROOF-EXPIRED": entry("RV-3", "unavailable", {
    kind: "fresh-signed-authorization",
    action: "Build a new custody authorization with a later expiry and obtain a fresh detached human proof over it.",
  }),

  // RV-4: applying a signed disposition.
  "LOC-REPLAY-PRECONDITION": entry("RV-4", "unavailable", {
    kind: "replay-preconditions-defined",
    // A matching receipt admits only a signed preserve disposition (archive is forbidden for it).
    action: "Replay has no defined preconditions yet; use a signed preserve disposition instead.",
  }),
  // Raised after the signed archive copy was published and the original no longer matched the
  // signed bytes: the copy is orphaned (no audit line, original left in place), a bare refuse
  // would hide it, and a plain retry fails because the archive target now exists.
  "LOC-ARCHIVE-ORPHANED-COPY": entry("RV-4", "handoff", {
    kind: "attended-diagnostic",
    action: "The signed archive copy was already published but the original receipt no longer matches the signed bytes, so the original was left in place and no audit line was written; an attended operator must review the orphaned copy at its archive path (archived/<sessionId>.<sha256>.json under the signed archive destination) against the original before any retry.",
  }),
  "LOC-TARGET-UNSAFE": entry("RV-4", "handoff", {
    kind: "attended-diagnostic",
    action: "The receipt or archive destination is a symlink, a non-regular file or otherwise unsafe, and a step may have already written; an attended operator must inspect it before any retry.",
  }),
});

const UNKNOWN = Object.freeze({
  rv: null,
  disposition: "handoff",
  prerequisite: Object.freeze({
    kind: "attended-diagnostic",
    action: "Unregistered refusal code; an attended operator must diagnose it before any recovery is attempted.",
  }),
});

/** Never throws: an unknown or non-string code yields an attended diagnostic handoff. */
export function lookupRecoveryDisposition(code) {
  if (typeof code === "string" && Object.hasOwn(RECOVERY_REFUSAL_REGISTRY, code)) {
    return RECOVERY_REFUSAL_REGISTRY[code];
  }
  return UNKNOWN;
}

/** Codes matched by `pattern` (capture group 1) in `source` that are not registered; deduplicated. */
export function findUnregisteredCodes(source, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const missing = new Set();
  for (const match of String(source).matchAll(re)) {
    const code = match[1] ?? match[0];
    if (!Object.hasOwn(RECOVERY_REFUSAL_REGISTRY, code)) missing.add(code);
  }
  return [...missing];
}

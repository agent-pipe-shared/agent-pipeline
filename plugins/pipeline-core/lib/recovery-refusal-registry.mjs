// Recovery refusal registry (RV-7): maps each typed refusal code to what a
// recovery caller may do next.
//
// These dispositions are the FIRST CUT. They cover only the WT-ORPHAN-* codes
// that worktree-lifecycle.mjs produces today. The custody module (RV-2..RV-6)
// and the attended CLI (RV-8..RV-11) register their own codes in this registry
// when they land.
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
  "WT-ORPHAN-ARCHIVE-READBACK": entry("RV-5", "refuse", null),
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

// SPDX-License-Identifier: SUL-1.0
/**
 * Pure projection of PRD/Spec digest drift against a continuity object's recorded authority.
 * No filesystem access: the caller supplies observeSha256(repoRelativePath), which returns a
 * 64-hex digest or null (a throw is treated as null). Only recorded repo-relative paths and
 * digests are ever emitted; observer error text is never propagated.
 */

export const CONTINUITY_AUTHORITY_DRIFT_SCHEMA = "pipeline.continuity-authority-drift.v1";
export const CONTINUITY_AUTHORITY_DRIFT_CODE = "CONTINUITY-AUTHORITY-DRIFT";
export const CONTINUITY_AUTHORITY_DRIFT_ROUTE = "continuity-authority-revision-plan";

const HEX64 = /^[0-9a-f]{64}$/u;
const ROLES = ["prd", "spec"];

/**
 * The sanctioned recovery both the bootstrap advisory and the dispatch refusal name (same code, same route; no new
 * verb). `-plan` is read-only and takes exactly `--proposal-file <repo-relative-json>`; the human revision approval is
 * consumed by `-apply`, not here.
 */
export const CONTINUITY_AUTHORITY_DRIFT_RECOVERY_COMMAND =
  "node <plugin-root>/scripts/pipeline-state.mjs continuity-authority-revision-plan --proposal-file <repo-relative proposal json>";

/**
 * Dispatch-time reading of a drift projection (pure): the sources whose bytes no longer match the recorded digest
 * ("changed") and the ones that could not be compared ("unobservable"), each as `{ role, path }`. Anything that is not a
 * well-formed projection yields no sources, so a malformed value can never turn into a refusal.
 */
export function continuityAuthorityDriftSources(projection) {
  const artifacts = Array.isArray(projection?.artifacts) ? projection.artifacts : [];
  const pick = (state) => artifacts
    .filter((entry) => entry && entry.state === state && typeof entry.path === "string" && typeof entry.role === "string")
    .map((entry) => ({ role: entry.role, path: entry.path }));
  return { changed: pick("changed"), unobservable: pick("unobservable") };
}

/** The refusal text naming each drifted source and the sanctioned recovery; paths are the repo-relative ones State records. */
export function continuityAuthorityDriftRefusalText(changed, unobservable = []) {
  const list = changed.map((entry) => `${entry.role} ${entry.path}`).join(", ");
  const unseen = unobservable.length === 0 ? "" : ` (${unobservable.map((entry) => `${entry.role} ${entry.path}`).join(", ")} could not be compared at all)`;
  return `the continuity record binds source digests that no longer match the checkout: ${list} changed since they were recorded${unseen}; a dispatch built now would work from authority bytes the approved plan never saw. `
    + `repair: record the new authority through the recovery the bootstrap names (${CONTINUITY_AUTHORITY_DRIFT_CODE}, route ${CONTINUITY_AUTHORITY_DRIFT_ROUTE}): run ${CONTINUITY_AUTHORITY_DRIFT_RECOVERY_COMMAND} in the project root (read-only plan; its apply step takes the human revision approval), `
    + "or restore the recorded bytes of the changed file(s); then build this briefing again";
}

function observeSafely(observeSha256, path) {
  try {
    const value = observeSha256(path);
    return typeof value === "string" && HEX64.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function projectContinuityAuthorityDrift(continuity, observeSha256) {
  const artifacts = ROLES.map((role) => {
    const recorded = continuity.authority[role];
    const observed = observeSafely(observeSha256, recorded.path);
    const state = observed === null ? "unobservable" : observed === recorded.sha256 ? "match" : "changed";
    return { role, path: recorded.path, recordedSha256: recorded.sha256, observedSha256: observed, state };
  });
  const drift = artifacts.some((entry) => entry.state !== "match");
  return {
    schema: CONTINUITY_AUTHORITY_DRIFT_SCHEMA,
    status: drift ? "drift" : "current",
    featureId: continuity.featureId,
    revision: continuity.revision,
    artifacts,
    recovery: drift
      ? {
          kind: "repair-required",
          code: CONTINUITY_AUTHORITY_DRIFT_CODE,
          route: CONTINUITY_AUTHORITY_DRIFT_ROUTE,
          mutation: false,
          requiresConfirmation: false,
          guidance:
            "The PRD or Spec bytes no longer match the digests recorded in continuity; run the continuity authority revision plan with --proposal-file to record the new authority.",
        }
      : null,
  };
}

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

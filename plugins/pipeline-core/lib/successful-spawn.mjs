// SPDX-License-Identifier: SUL-1.0

/**
 * Node's WSL sandbox adapter can report EPERM after a child has completed
 * successfully. A numeric zero exit status is the conclusive completion
 * signal; only that exact EPERM shape may accompany it. All other errors,
 * missing statuses, and non-zero exits remain failures.
 */
export function isSuccessfulSpawn(result) {
  return hasExpectedSpawnStatus(result, [0]);
}

/**
 * A few closed commands define additional typed completion statuses.  They may
 * use this helper only with their documented finite status set; EPERM is still
 * tolerated solely as the WSL post-completion reporting defect.
 */
export function hasExpectedSpawnStatus(result, expectedStatuses) {
  return Array.isArray(expectedStatuses)
    && expectedStatuses.includes(result?.status)
    && (result.error === undefined || result.error === null || result.error?.code === "EPERM");
}

// SPDX-License-Identifier: SUL-1.0
/** Shared typed refusals for the behaviorally retired design course. */
export const DESIGN_COURSE_RETIRED = "DESIGN-COURSE-RETIRED";
export const DESIGN_ADVISORY_COURSE_RETIRED = "DESIGN-ADVISORY-COURSE-RETIRED";
export const DWP_PRESENT_RETIRED = "DWP-PRESENT-RETIRED";
export const DWP_APPROVAL_REQUEST_RETIRED = "DWP-APPROVAL-REQUEST-RETIRED";
export const RETIRED_DESIGN_ROUTE_HINT = "ask an Advisor on demand; run one review; present-plan --review-receipt";
export function retiredDesignResult(code) {
  return { ok: false, code, hint: RETIRED_DESIGN_ROUTE_HINT, implementationAuthority: false };
}

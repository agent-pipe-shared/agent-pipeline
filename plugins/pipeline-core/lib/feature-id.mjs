// SPDX-License-Identifier: SUL-1.0
// The one shape a feature id must have to walk the whole lifecycle: a lowercase letter, then 2 to 63 lowercase letters, digits or
// hyphens. It is the narrowest shape any step after set-feature checks (the design review receipt, the approval binding, the PO
// approval proof and the design consistency check take ^[a-z][a-z0-9-]{0,63}$; the feature close, the close-commit split, the
// audit preflight and the Semgrep baseline take ^[a-z][a-z0-9-]{2,63}$). The steps that START a feature (pipeline-state.mjs
// set-feature, bind-adr-proposals.mjs --feature) refuse any other id at once, naming the flag, so an id such as
// "2026-10-26-epic2" no longer passes the start and fails later in the design chain (Glossover finding G1, 2026-11-12).
export const FEATURE_ID = /^[a-z][a-z0-9-]{2,63}$/u;

export const FEATURE_ID_RULE = "a lowercase letter, then 2 to 63 lowercase letters, digits or hyphens (^[a-z][a-z0-9-]{2,63}$)";

export function featureIdProblem(flag, value) {
  if (typeof value === "string" && FEATURE_ID.test(value)) return null;
  const shown = typeof value === "string" ? JSON.stringify(value.slice(0, 80)) : String(value);
  const hint = typeof value === "string" && /^[0-9]/u.test(value)
    ? " It starts with a digit: put a word first (for example epic2-... instead of 2026-10-26-epic2-...)."
    : "";
  return `${flag} ${shown} is not a valid feature id: it must be ${FEATURE_ID_RULE}, the shape the design review receipt, the approval `
    + `binding and the feature close require.${hint} Choose the id together with the package folder: the feature package lives in `
    + `specs/<feature-id>/.`;
}

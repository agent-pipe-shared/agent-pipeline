// SPDX-License-Identifier: SUL-1.0
//
// R7-3d -- classification of every State field that names a path (spec 22.3,
// ruling 60). Keys are dotted State field paths with array indices elided.
//   tracked-required: an approval or gate binds the file by digest, so it must be
//                     tracked and clean (it travels to a second device).
//   device-local:     lives in the private store, never travels.
//   not-bound:        a plain pointer; no digest binds the file.
// A new path-naming State field must be added here (the ratchet fails otherwise).

export const BOUND_PATH_FIELD_CLASSIFICATION = Object.freeze({
  // closed-feature plan pointer; the close binds result and evidence digests, not this path
  "closedFeatures.planPath": "not-bound",
  // discarded-feature plan pointer; no digest is recorded beside it
  "discardedFeatures.planPath": "not-bound",
  // active-feature pointer; the digest lives in planSubmission and the authority record
  "activeFeature.planPath": "not-bound",
  // submission binds the plan by planSha256
  "planSubmission.planPath": "tracked-required",
  // submission binds the spec by specSha256
  "planSubmission.specPath": "tracked-required",
  // approval briefing scope binds the plan by planSha256
  "planApprovalBriefing.scope.planPath": "tracked-required",
  // approval briefing scope binds the spec by specSha256
  "planApprovalBriefing.scope.specPath": "tracked-required",
  // po-gate authority binds the plan by planSha256
  "planApproval.poGateAuthority.planPath": "tracked-required",
  // po-gate authority binds the spec by specSha256
  "planApproval.poGateAuthority.specPath": "tracked-required",
  // presentation binds the package by designWorkflowPackageSha256
  "planPresentation.designWorkflowPackagePath": "tracked-required",
  // approval binds the package by designWorkflowPackageSha256 and the signed intent
  "planApproval.designWorkflowPackagePath": "tracked-required",
  // transient scratch request file; no State digest binds it (its name merely echoes the package digest)
  "planPresentation.designWorkflowApprovalRequestPath": "not-bound",
  // historical Phoenix record: active-feature pointer, no digest beside it
  "phoenixEpicHistory.activeFeature.planPath": "not-bound",
  // historical Phoenix submission binds the plan by planSha256
  "phoenixEpicHistory.planSubmission.planPath": "tracked-required",
  // historical Phoenix submission binds the spec by specSha256
  "phoenixEpicHistory.planSubmission.specPath": "tracked-required",
  // historical Phoenix po-gate authority binds the plan by planSha256
  "phoenixEpicHistory.planApproval.poGateAuthority.planPath": "tracked-required",
  // historical Phoenix po-gate authority binds the spec by specSha256
  "phoenixEpicHistory.planApproval.poGateAuthority.specPath": "tracked-required",
});

const PRIVATE_STORE = /^\.git\/agent-pipeline(?:\/|$)/u;

// Classify a path VALUE: any private-store reference is device-local; every other
// path that reaches the bound-path machinery is tracked-required (fail safe).
export function classifyBoundPathReference(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/").replace(/^\.\//u, "");
  return PRIVATE_STORE.test(normalized) ? "device-local" : "tracked-required";
}

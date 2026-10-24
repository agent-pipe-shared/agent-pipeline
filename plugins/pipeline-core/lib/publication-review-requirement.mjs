// SPDX-License-Identifier: SUL-1.0
/** Resolve the existing feature review duty from validated State and package evidence. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateRigorHistory } from "./rigor-lifecycle.mjs";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";

const RANK = Object.freeze({ mini: 0, feature: 1, epic: 2 });
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const safePath = path => typeof path === "string" && path.startsWith("specs/")
  && !path.split("/").some(part => part === "" || part === "." || part === "..")
  && !/[\\:\x00-\x1f]/u.test(path);

/** `readSource` must read the exact candidate tree at publication; null means absent. */
export function resolvePublicationReviewRequirement(state, { rootDir, readSource } = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return { required: true, code: "REVIEW-STATE-UNAVAILABLE" };
  const featureId = state.activeFeature?.id ?? (Array.isArray(state.closedFeatures) ? state.closedFeatures.at(-1)?.id : null);
  if (typeof featureId !== "string" || !ID.test(featureId)) return { required: true, code: "REVIEW-FEATURE-UNAVAILABLE" };
  const read = readSource ?? (rootDir === undefined ? null : path => {
    if (!safePath(path)) return null;
    try { return readFileSync(join(rootDir, path)); } catch { return null; }
  });
  if (typeof read !== "function") return { required: true, code: "REVIEW-SOURCE-UNAVAILABLE" };
  let history;
  try { history = validateRigorHistory(state.rigorHistory); }
  catch { return { required: true, code: "REVIEW-RIGOR-HISTORY-INVALID" }; }
  const retained = history.filter(row => row.body.featureId === featureId).at(-1)?.body.observation.retainedProfile;
  if (retained !== undefined && !Object.hasOwn(RANK, retained)) return { required: true, code: "REVIEW-RETAINED-PROFILE-INVALID" };
  // A registered package has integer rigor 1 or 2, even for profile mini.
  // Malformed package bytes are unknown, and unknown never grants a waiver.
  let packageBytes;
  try { packageBytes = read(`specs/${featureId}/lifecycle.json`); }
  catch { return { required: true, code: "REVIEW-PACKAGE-UNAVAILABLE" }; }
  if (packageBytes !== null && packageBytes !== undefined) {
    try {
      const value = JSON.parse(Buffer.from(packageBytes).toString("utf8"));
      if (value?.feature?.id !== featureId || ![1, 2].includes(value?.feature?.rigor)) throw Error("package");
      return { required: true, code: "REVIEW-PACKAGE-REQUIRED" };
    } catch { return { required: true, code: "REVIEW-PACKAGE-INVALID" }; }
  }
  const submitted = state.planSubmission?.profile;
  if (submitted === undefined && retained === undefined) return { required: true, code: "REVIEW-PROFILE-UNAVAILABLE" };
  if (submitted !== undefined && !Object.hasOwn(RANK, submitted)) return { required: true, code: "REVIEW-PROFILE-INVALID" };
  if (retained !== undefined && RANK[retained] >= 1) return { required: true, code: "REVIEW-RETAINED-PROFILE-REQUIRED" };
  if (submitted === undefined) return { required: true, code: "REVIEW-APPROVAL-UNAVAILABLE" };
  if (RANK[submitted] >= 1) return { required: true, code: "REVIEW-PROFILE-REQUIRED" };
  const submission = state.planSubmission;
  if (!safePath(submission?.planPath) || !safePath(submission?.specPath)) return { required: true, code: "REVIEW-SOURCE-INVALID" };
  let plan, spec;
  try { plan = read(submission.planPath); spec = read(submission.specPath); }
  catch { return { required: true, code: "REVIEW-SOURCE-UNAVAILABLE" }; }
  const lifecycle = derivePlanLifecycle(state, {
    planSha256: plan == null ? null : sha256(plan),
    specSha256: spec == null ? null : sha256(spec),
  });
  if (!lifecycle.ok || lifecycle.approvalCurrent !== true || lifecycle.submissionCurrent !== true
    || state.planApproved !== true) return { required: true, code: "REVIEW-APPROVAL-UNAVAILABLE" };
  return { required: false, code: "REVIEW-LOW-RIGOR" };
}

export function requiresPublicationReview(state, options) {
  return resolvePublicationReviewRequirement(state, options).required;
}

// SPDX-License-Identifier: SUL-1.0
/**
 * Late binding of the PRD and the Spec (docs/adr/draft-late-binding-of-prd-and-spec-at-the-approval.md), build step 4:
 * the digest-bound seal plan and the refusals that replace the lock.
 *
 * A draft package (`continuity.authority.sealed === false`, paths only) is sealed by ONE prepared plan and the plan approval.
 * This module is the plan: it lists the digest of every PRD, Spec and design-input byte that will be sealed, the digest each
 * review bound, the design-input capture digest and the exact State revision, and it carries the plan digest that the one PO
 * signature covers (through the design approval binding). Pure: no file, no git, no clock; every observation arrives as data.
 *
 * Refusals are fail-closed and typed. Each carries `exits` (command names a reader can run next) and a `repair` sentence, so
 * no refusal state is a dead end:
 *   PSP-OUT-OF-SCOPE      no approval to seal at (no continuity authority, or a mini package): the bind at the end of
 *                         onboarding applies and nothing is needed.
 *   PSP-ALREADY-SEALED    the package is sealed already: nothing to do.
 *   PSP-AUTHORITY-INVALID the authority shape is not a draft or a sealed one.
 *   PSP-DOCUMENT-MISSING  a PRD or Spec file to be sealed is not readable.
 *   PSP-PROVENANCE        design-input.md differs from the capture record of the promotion.
 *   PSP-STALE-REVIEW      a review bound other bytes than the ones being sealed: names the review to re-request.
 *   PSP-NOT-PREPARED      no seal plan is prepared (exit prepare-seal).
 *   PSP-PLAN-INVALID      the stored plan is malformed or its digest does not match its content (exit prepare-seal).
 *   PSP-PLAN-STALE        the plan is for another feature, State revision or set of paths (exit prepare-seal).
 *   PSP-APPLY-DRIFT       a sealed byte differs from the plan since prepare (exit prepare-seal).
 */
import { createHash } from "node:crypto";

import { canonical } from "./po-approval-proof.mjs";
import { inSealScope, readAuthoritySeal } from "./authority-seal-reader.mjs";

export const SEAL_PLAN_SCHEMA = "pipeline.authority-seal-plan.v1";
/** The one place a prepared plan lives; a re-prepare replaces it (idempotent), so a stale or orphaned plan retires itself. */
export const SEAL_PLAN_PATH = "scratch/seal-plan.json";
export const DESIGN_INPUT_BASENAME = "design-input.md";

const SHA256 = /^[a-f0-9]{64}$/u;
const REVIEW_KINDS = Object.freeze({
  readiness: "re-request the readiness review for the current PRD and Spec",
  "design-advisory": "re-request the design advisory for the current PRD and Spec",
  "critic-preflight": "re-run the Critic preflight for the current Spec",
});

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isSha = (value) => typeof value === "string" && SHA256.test(value);
const documentRef = (value) => isRecord(value) && typeof value.path === "string" && value.path.length > 0 && isSha(value.sha256);
const nullableRef = (value) => value === null || documentRef(value);

function refuse(code, reason, exits, repair) {
  return Object.freeze({ ok: false, code, reason, exits: Object.freeze([...exits]), repair });
}

/** The sibling design input of a Spec path (the guard derives it the same way). */
export function designInputPathOf(specPath) {
  const slash = specPath.lastIndexOf("/");
  return slash < 0 ? DESIGN_INPUT_BASENAME : `${specPath.slice(0, slash)}/${DESIGN_INPUT_BASENAME}`;
}

/**
 * Read the bytes a draft package would seal. `readBytes(path)` returns a Buffer or null.
 * A draft `result`/`plan` entry whose file does not exist yet seals as null (a result exists only at close).
 */
export function readSealDocuments(paths, readBytes) {
  const out = {};
  for (const [name, required] of [["prd", true], ["spec", true], ["designInput", false], ["result", false], ["plan", false]]) {
    const path = paths[name];
    if (typeof path !== "string") {
      if (required) return refuse("PSP-DOCUMENT-MISSING", `the ${name} path is not registered`, ["reopen-design"], "register the package paths with set-feature, or reopen the design");
      out[name] = null;
      continue;
    }
    const bytes = readBytes(path);
    if (bytes === null || bytes === undefined) {
      if (required) return refuse("PSP-DOCUMENT-MISSING", `the ${name} file ${path} is not readable`, ["reopen-design"], `restore ${path}, then run prepare-seal again`);
      out[name] = null;
      continue;
    }
    out[name] = { path, sha256: sha256(bytes) };
  }
  return Object.freeze({ ok: true, documents: Object.freeze(out) });
}

/** Paths to read for a draft: the registered PRD and Spec, the optional result and plan, and the sibling design input. */
export function sealPaths(draftPaths) {
  return { prd: draftPaths.prd, spec: draftPaths.spec, designInput: designInputPathOf(draftPaths.spec), result: draftPaths.result ?? null, plan: draftPaths.plan ?? null };
}

function reviewFault(review, documents) {
  const compare = [["prd", review.prdSha256, documents.prd.sha256], ["spec", review.specSha256, documents.spec.sha256]];
  if (review.designInputSha256 !== null && review.designInputSha256 !== undefined) compare.push(["design input", review.designInputSha256, documents.designInput?.sha256 ?? null]);
  return compare.filter(([, bound, current]) => bound !== null && bound !== undefined && bound !== current).map(([name]) => name);
}

/**
 * Build the seal plan of a draft package.
 * @param {{ authority: object|null|undefined, featureId: string, revision: number, profile: string|null,
 *   documents: object, designInputCapture: {path:string, sha256:string}|null, reviews: Array<object> }} input
 */
export function buildSealPlan(input) {
  const { authority, featureId, revision, profile, documents, designInputCapture, reviews } = input;
  if (!isRecord(authority) || !inSealScope(profile)) {
    return refuse("PSP-OUT-OF-SCOPE", "this package has no PRD release to seal at", [], "nothing is needed: the bind at the end of onboarding applies to a package outside the PRD release scope (EL-19)");
  }
  const seal = readAuthoritySeal(authority);
  if (seal.status === "sealed") return refuse("PSP-ALREADY-SEALED", "the PRD and the Spec are sealed already", [], "nothing to do; use reopen-design --by <name> to change the sealed documents");
  if (seal.status !== "draft") return refuse("PSP-AUTHORITY-INVALID", seal.reason, ["reopen-design"], "reopen the design and register the package paths again");
  if (!Number.isSafeInteger(revision) || revision < 0) return refuse("PSP-AUTHORITY-INVALID", "the State revision is not readable", ["reopen-design"], "inspect the State");
  if (designInputCapture !== null && documents.designInput !== null && documents.designInput.sha256 !== designInputCapture.sha256) {
    return refuse("PSP-PROVENANCE", `${documents.designInput.path} differs from the bytes captured when the package was promoted`, ["reopen-design"],
      "restore design-input.md to the captured bytes, or reopen the design (reopen-design --by <name>) to record a new capture, then run prepare-seal again");
  }
  const stale = [];
  for (const review of reviews) {
    const faults = reviewFault(review, documents);
    if (faults.length > 0) stale.push({ kind: review.kind, ref: review.ref, faults });
  }
  if (stale.length > 0) {
    const first = stale[0];
    const exitName = `re-request:${first.kind}`;
    return Object.freeze({ ...refuse("PSP-STALE-REVIEW", `the ${first.kind} review (${first.ref}) bound other ${first.faults.join(", ")} bytes than the ones being sealed`, [exitName],
      `${REVIEW_KINDS[first.kind] ?? "re-request the review"}, then run prepare-seal again`), stale });
  }
  const body = {
    schema: SEAL_PLAN_SCHEMA,
    featureId,
    stateRevision: revision,
    documents: { prd: documents.prd, spec: documents.spec, designInput: documents.designInput, result: documents.result, plan: documents.plan },
    designInputCapture,
    reviews: reviews.map(({ kind, ref, prdSha256, specSha256, designInputSha256 }) => ({ kind, ref, prdSha256: prdSha256 ?? null, specSha256: specSha256 ?? null, designInputSha256: designInputSha256 ?? null })),
  };
  const planSha256 = sha256(Buffer.from(canonical(body), "utf8"));
  return Object.freeze({ ok: true, plan: Object.freeze({ ...body, planSha256 }), planSha256 });
}

/** Closed shape and digest check of a stored plan. */
export function validateSealPlan(plan) {
  const bad = () => refuse("PSP-PLAN-INVALID", "the stored seal plan is malformed or its digest does not match its content", ["prepare-seal"], "run prepare-seal again; it replaces the stored plan");
  if (!isRecord(plan) || plan.schema !== SEAL_PLAN_SCHEMA || !isSha(plan.planSha256) || typeof plan.featureId !== "string"
    || !Number.isSafeInteger(plan.stateRevision) || !isRecord(plan.documents) || !documentRef(plan.documents.prd) || !documentRef(plan.documents.spec)
    || !nullableRef(plan.documents.designInput) || !nullableRef(plan.documents.result) || !nullableRef(plan.documents.plan)
    || !(plan.designInputCapture === null || documentRef(plan.designInputCapture)) || !Array.isArray(plan.reviews)) return bad();
  const { planSha256, ...body } = plan;
  if (sha256(Buffer.from(canonical(body), "utf8")) !== planSha256) return bad();
  return Object.freeze({ ok: true, planSha256 });
}

/**
 * The gate of the plan approval (and of the presentation that the signature is made over): the stored plan must be the plan
 * for this feature, this State revision and these paths, and every sealed byte must still be the byte that was planned.
 * `documents` is read by the caller under the State writer lock when it is the apply step.
 */
export function checkSealPlanForApply({ plan, authority, featureId, revision, documents }) {
  if (plan === null || plan === undefined) return refuse("PSP-NOT-PREPARED", "no seal plan is prepared for this draft package", ["prepare-seal"], "run prepare-seal; the approval seals the PRD and the Spec with the plan it prints");
  const valid = validateSealPlan(plan);
  if (!valid.ok) return valid;
  const seal = readAuthoritySeal(authority);
  if (seal.status !== "draft") return refuse("PSP-AUTHORITY-INVALID", "the package is not a draft", ["reopen-design"], "inspect the State");
  if (plan.featureId !== featureId || plan.stateRevision !== revision || plan.documents.prd.path !== seal.paths.prd || plan.documents.spec.path !== seal.paths.spec) {
    return refuse("PSP-PLAN-STALE", "the prepared seal plan is not the plan for the current feature, State revision and paths", ["prepare-seal"], "run prepare-seal again; it replaces the stored plan");
  }
  const drift = [];
  for (const name of ["prd", "spec", "designInput", "result", "plan"]) {
    const planned = plan.documents[name]?.sha256 ?? null;
    const current = documents[name]?.sha256 ?? null;
    if (planned !== current) drift.push(name);
  }
  if (drift.length > 0) {
    return refuse("PSP-APPLY-DRIFT", `${drift.join(", ")} changed since the seal plan was prepared`, ["prepare-seal"], "run prepare-seal again for the current bytes (the signature covers the plan digest, so present and sign again after it)");
  }
  return Object.freeze({ ok: true, planSha256: plan.planSha256 });
}

/** The plan exists but the signed request was made before it: the PO signed a binding that does not cover this plan digest. */
export function sealPlanNotPresentedRefusal() {
  return refuse("PSP-NOT-PRESENTED", "the presented design approval request does not cover the current seal plan digest", ["present-plan"],
    "run present-plan --review-receipt again so the request the PO signs covers the prepared plan, then sign the new request");
}

export function unreadableReviewRefusal(ref) {
  return refuse("PSP-REVIEW-UNREADABLE", `the review record ${ref} is not a readable review receipt`, [], "pass a readable design review receipt (--review-receipt) or omit it; prepare-seal binds only the reviews it can read");
}

export function provenanceUnavailableRefusal(reason) {
  return refuse("PSP-PROVENANCE", reason, ["reopen-design"], "restore design-input.md to the captured bytes (or repair the private onboarding history), then run prepare-seal again; reopen-design --by <name> stays available");
}

/** The sealed `continuity.authority`: digests bound, the `sealed` marker removed (a sealed package is a package without the marker). */
export function sealedAuthorityFromPlan(plan) {
  const authority = { prd: { ...plan.documents.prd }, spec: { ...plan.documents.spec }, result: plan.documents.result === null ? null : { ...plan.documents.result } };
  if (plan.documents.plan !== null) authority.plan = { ...plan.documents.plan };
  return authority;
}

/** Digest bindings of the reviews that are readable as plain records (see `collectReviewBindings`). */
export function readinessBindingFromSources(ref, sources, designInputPath) {
  const designInput = designInputPath === null ? undefined : sources.companions.find((entry) => entry.path === designInputPath);
  return { kind: "readiness", ref, prdSha256: sources.prd.sha256, specSha256: sources.spec.sha256, designInputSha256: designInput?.sha256 ?? null };
}

export function advisoryBindingFromAdmission(ref, record) {
  const workflow = record?.admission?.workflow;
  if (!isRecord(workflow) || !isSha(workflow.designSha256) || !isSha(workflow.evidenceSha256)) return null;
  return { kind: "design-advisory", ref, prdSha256: workflow.designSha256, specSha256: workflow.evidenceSha256, designInputSha256: null };
}

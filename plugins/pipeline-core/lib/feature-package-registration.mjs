// SPDX-License-Identifier: SUL-1.0
/**
 * Sanctioned writer of `specs/<feature>/lifecycle.json` for a plan that the real
 * `pipeline-state.mjs approve-plan` approved (plan approval v9).
 *
 * Why this exists: `approve-plan` writes `manifestPath: specs/<feature>/lifecycle.json`
 * into the accepted delivery contract envelope, and `readAcceptedDeliveryContract`
 * resolves the envelope through that validated manifest
 * (`resolveCanonicalArtifactIdentity`) before any item-governed dispatch is admitted.
 * No production code created the manifest, so a consumer's first item dispatch was
 * refused `CAC-REGISTRATION-INVALID`.
 *
 * What a consumer's `specs/<feature>/` holds when this runs: the PRD, the Spec and
 * the accepted delivery contract envelope (what the design course and the real CLI
 * chain write). The closed topology also requires an `acceptance` and a `result`
 * artifact for every active state, and no shipped command creates either for a
 * consumer. This writer therefore creates a MISSING one (exclusively, `wx`, as a
 * Pipeline-owned, non-authoritative, immutable document that adds no criterion and
 * names only the Spec path and digest) and registers an EXISTING one exactly as
 * found, never rewriting it. A found file is authoritative only when the approval's
 * own source binding (the envelope's `request.binding.sources.companions`, path and
 * digest) binds it. The PRD and the Spec are never invented: they must exist.
 *
 * Every classification below is read from the closed rules in
 * `feature-package-topology.mjs` (classes, states, required keys, per-class
 * mutability); this module owns no copy of them. The function is deliberately
 * dependency-injected and side-effect-bounded (exclusive creates only, all undone on
 * any later failure) so that `approve-plan` can call it in a later, separately
 * signed change.
 *
 * Contract: never overwrites, never rewrites the envelope, never changes authority
 * state, never commits. Typed codes are FPR-*. The one amendment of an existing manifest
 * is `addCriticReviewUnit` (PF-34), which appends the review unit's entry and nothing else.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { CRITERION_ID_SOURCE } from "./critic-accepted-contract.mjs";
import { CRITIC_DIAGNOSTIC_SCHEMA, diagnosticEvidenceLocation, readDiagnosticArtifact, validateCriticDiagnostic } from "./critic-diagnostic-evidence.mjs";
import { FEATURE_PACKAGE_SCHEMA, FEATURE_STATES, featurePackageDigestRoute, validateFeaturePackage } from "./feature-package-topology.mjs";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";
import { compileRegisteredCriticReviewLineage } from "./critic-review-lineage.mjs";
import { COURSE_EVIDENCE_GAP_CODES, FEATURE_ID, courseEvidenceGapText, discardedFeatureIdsOfState, locateCourseEvidenceGap, prepareRegisteredCriticDeltaRequest, resolveRegisteredCriticCourseIdentity } from "./critic-course-admission.mjs";
import { administrationDocumentationOnlyCommit } from "./critic-evidence-carry.mjs";
import { readConsumedCourseClaimBinding } from "./critic-verify-lifecycle.mjs";
import { readConsumedCandidateResult } from "../scripts/critic-packet-preflight.mjs";
import { sha256Canonical } from "./review-economy.mjs";
import { SPEC_ADDENDUM_APPROVAL_FILE, SPEC_ADDENDUM_KIND, isSpecAddendumPath, readSpecAddenda, specAddendumApprovalPath } from "./spec-addendum.mjs";
import { criticalActionSubjectSha256 } from "./critical-action-approval-request.mjs";
import { readPrivateApprovals } from "./critical-action-authorization.mjs";
import { readdirSync } from "node:fs";

export const FEATURE_PACKAGE_REGISTRATION_SCHEMA = "pipeline.feature-package-registration.v1";
/** The CLI result names where the manifest's rigor level came from. */
export const RIGOR_SOURCE = "profile-mapping";

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
/** The only lifecycle statuses of a package whose plan is approved (all are members of FEATURE_STATES). */
const REGISTRABLE = Object.freeze(["approved", "implementing"]);
/** Codes the existing envelope reader returns BEFORE it looks at the registration. */
const READER_BEFORE_REGISTRATION = Object.freeze(["CAC-ENVELOPE-UNAVAILABLE", "CAC-REGISTRATION-INVALID"]);
/**
 * Submission profile (and the retained rigor floor of the State `rigorHistory`) -> the two manifest levels.
 * JUDGMENT CALL: no shipped source defines this mapping. Onboarding, `set-feature` and the calibration write
 * profile NAMES (mini, feature, epic) and the rigor-lifecycle journal; nothing writes an integer 1 or 2.
 */
const PROFILE_RANK = Object.freeze({ mini: 0, feature: 1, epic: 2 });
const PROFILE_RIGOR = Object.freeze({ mini: 1, feature: 1, epic: 2 });

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const refused = (code, reason, extra = {}) => ({ schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "refused", code, reason, ...extra });
// C30I-S7 (AC-110): a refusal for an invalid manifest whose findings are stale digests also names the sanctioned route to bind the manifest to the changed bytes (never a hand edit); any other invalidity keeps its text.
const withDigestRoute = (root, manifestPath, reason) => { const route = featurePackageDigestRoute(root, manifestPath); return route === null ? reason : `${reason}. ${route}`; };

/** A repository-relative, forward-slash path with no parent segment: the only kind this writer ever names. */
const repositoryRelative = (path) => typeof path === "string" && path !== "" && !isAbsolute(path) && !/^[A-Za-z]:/u.test(path)
  && !path.includes("\\") && !path.split("/").some((part) => part === ".." || part === "." || part === "");

/** `absent` only on ENOENT; a regular file is read; anything else (symlink, directory, unreadable) is `other`. */
function inspect(root, path) {
  try {
    const stat = lstatSync(join(root, path));
    return stat.isFile() && !stat.isSymbolicLink() ? { kind: "file", bytes: readFileSync(join(root, path)) } : { kind: "other" };
  } catch (error) { return { kind: error?.code === "ENOENT" ? "absent" : "other" }; }
}

/** Pipeline-owned pointer: the criteria are the approved Spec's. Names the Spec path and digest, nothing else. */
export function renderAcceptancePointer({ featureId, specPath, specSha256 }) {
  return [
    `# Acceptance pointer: ${featureId}`,
    "",
    "This file was generated by the Pipeline when the feature package was registered. It adds no acceptance criterion.",
    "",
    "The acceptance criteria of this feature are the criteria in the approved Spec:",
    "",
    `- Spec: \`${specPath}\``,
    `- Spec sha256 at registration: \`${specSha256}\``,
    "",
  ].join("\n");
}

/**
 * Pipeline-owned status record, explicitly not acceptance. It is append-only and bound by digest, so it must never claim a
 * state that goes stale: the Codex greenfield report (F3) found "implementation is in progress" still bound after the feature
 * was closed. It says what it is and where the live status is.
 */
export function renderResultRecord({ featureId }) {
  return [
    `# Result record: ${featureId}`,
    "",
    "This file was generated by the Pipeline when the feature package was registered.",
    "",
    `- Feature: \`${featureId}\``,
    "- Status: this record was written at registration and does not track progress. The lifecycle state in the feature manifest is the status.",
    "- This record is not acceptance. Acceptance is a separate decision and is not recorded here.",
    "",
  ].join("\n");
}

/**
 * PF-34: the Critic review unit of the feature course. Critic course admission
 * (`featureReviewUnit`, critic-course-admission.mjs) requires it as a non-authority, immutable,
 * retained `design` artifact of the manifest; no route created it. The whole feature is one
 * course, so its one logical work id is the feature; the criteria are the `AC-<n>` or `AC-E<epic>-<story>-<nn>` ids its Spec
 * names. A Spec that names none gets no unit, and the result says so.
 */
export const CRITIC_REVIEW_UNIT_SCHEMA = "pipeline.critic-review-unit.v1";
// The id grammar is the binding's own (CRITERION_ID_SOURCE); no leading letter/digit/hyphen, no trailing digit/hyphen,
// so AC-1 inside AC-12 or AC-E1-03-32 is never matched a second time.
// Built at first use, not at module load: the session Critic finalizer imports this module (D223) and a load-time read of the
// import below fails when the module graph is entered through critic-accepted-contract (an import cycle through the finalizer).
const reviewUnitCriterion = () => new RegExp(`(?<![A-Za-z0-9-])${CRITERION_ID_SOURCE}(?![0-9-])`, "gu");
export const criticReviewUnitPath = (featureId) => `specs/${featureId}/design/critic-review-unit.json`;
const REVIEW_UNIT_ARTIFACT = Object.freeze({ authority: false, mutability: "immutable", retention: "retain" });

/** The primary checkout's branch, which a reviewed candidate must be integrated into (critic-generic-batch.mjs). */
function primaryMainRef(root) {
  const common = spawnSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", shell: false, timeout: 10000 });
  if (common.status !== 0) return null;
  const primary = dirname(common.stdout.trim());
  const ref = spawnSync("git", ["-C", primary, "symbolic-ref", "HEAD"], { encoding: "utf8", shell: false, timeout: 10000 });
  const value = ref.status === 0 ? ref.stdout.trim() : "";
  return value.startsWith("refs/heads/") ? value : null;
}

/** The unit's bytes, or the reason none is written. */
export function renderCriticReviewUnit({ featureId, specPath, specBytes, mainRef }) {
  const criterionIds = [...new Set(String(specBytes ?? "").match(reviewUnitCriterion()) ?? [])].sort().slice(0, 128);
  if (criterionIds.length === 0) return { ok: false, reason: `the Spec ${specPath} names no criterion id (AC-<n> or AC-E<epic>-<story>-<nn>), which the review unit binds` };
  if (typeof mainRef !== "string") return { ok: false, reason: "the primary checkout is on no branch, which the review unit names as its delivery boundary" };
  const unit = {
    schema: CRITIC_REVIEW_UNIT_SCHEMA, kind: "independent-delivery",
    purpose: `The Critic review unit of the feature course ${featureId}: the feature package is reviewed as one course against its approved Spec.`,
    specPath, logicalWorkIds: [featureId], criterionIds, deliveryBoundary: { mainRef },
    singletonRationale: "the feature is reviewed as one course, so its one logical work id is the feature itself",
  };
  return { ok: true, bytes: Buffer.from(`${JSON.stringify(unit, null, 2)}\n`) };
}

/**
 * Rigor for the manifest. The effective profile is the higher of the submitted profile and the retained rigor floor
 * of this feature (the floor can only raise it); the level is then the profile mapping above. Never a constant.
 */
function resolveRigor(state) {
  const featureId = state.activeFeature?.id;
  const candidates = [];
  const submitted = state.planSubmission?.profile;
  if (Object.hasOwn(PROFILE_RANK, submitted)) candidates.push({ profile: submitted, from: "planSubmission.profile" });
  const history = Array.isArray(state.rigorHistory) ? state.rigorHistory.filter((row) => row?.body?.featureId === featureId) : [];
  const retained = history.at(-1)?.body?.observation?.retainedProfile;
  if (Object.hasOwn(PROFILE_RANK, retained)) candidates.push({ profile: retained, from: "rigorHistory.retainedProfile" });
  if (candidates.length === 0) return null;
  const top = candidates.reduce((best, row) => (PROFILE_RANK[row.profile] > PROFILE_RANK[best.profile] ? row : best));
  return { rigor: PROFILE_RIGOR[top.profile], source: RIGOR_SOURCE, basis: `state:${top.from}=${top.profile}` };
}

/** The candidate-evidence entries of a manifest that lists only earlier approvals of this feature, or null when it is anything else. */
// C28e (Claude test run 2026-11-13): after a Critic round the package also lists that round's evidence (diagnostic, lineage, Verify), so a
// re-approved design met FPR-MANIFEST-CONFLICT with no route. A package that has not reached verification (state approved or implementing,
// no candidate) is superseded by the new approval as well: every earlier candidate-evidence entry under the feature's directory is
// retained with its recorded digest, provided its file still holds exactly those bytes.
// The rebuild re-derives the PRD, the Spec, Acceptance, Result and the Critic review unit; every other entry of the superseded manifest
// (candidate evidence, threat model, supply chain, plans, further design files) is retained with its own fields and recorded digest, or the
// supersede is refused -- an entry is never dropped silently.
const SUPERSEDABLE_STATES = Object.freeze(["approved", "implementing"]);
const REDERIVED_CLASSES = new Set(["prd", "spec", "acceptance", "result"]);
// C30I-S3: a manifest that declares a predecessor (`supersedes`) is rebuilt only when the caller names that very predecessor again (`supersedes` argument), so the
// relation is carried over and never dropped or changed; without the argument the rebuild is refused exactly as before.
function supersededRegistrations(bytes, featureId, envelopePath, root = null, supersedes = null) {
  let manifest;
  try { manifest = JSON.parse(bytes.toString("utf8")); } catch { return null; }
  if (manifest?.schema !== FEATURE_PACKAGE_SCHEMA || manifest.feature?.id !== featureId || manifest.candidate !== null || manifest.supersedes !== supersedes || !Array.isArray(manifest.artifacts)) return null;
  const unitPath = criticReviewUnitPath(featureId);
  const kept = manifest.artifacts.filter((entry) => !REDERIVED_CLASSES.has(entry?.class) && !(entry?.class === "design" && entry.path === unitPath));
  const evidence = kept.filter((entry) => entry?.class === "candidate-evidence");
  const escaped = featureId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const earlier = new RegExp(`^specs/${escaped}/evidence/accepted-delivery-contract-[a-f0-9]{64}\\.json$`, "u");
  const approvalsOnly = evidence.length > 0 && evidence.every((entry) => typeof entry.path === "string" && earlier.test(entry.path) && entry.path !== envelopePath && SHA256.test(entry.sha256 ?? ""));
  if (approvalsOnly && kept.length === evidence.length) return kept;
  if (root === null || !evidence.some((entry) => typeof entry.path === "string" && earlier.test(entry.path))) return null;
  // A package with more than earlier approvals is superseded only before verification (state approved or implementing, no candidate).
  if (!approvalsOnly && !SUPERSEDABLE_STATES.includes(manifest.state)) return null;
  const own = new RegExp(`^specs/${escaped}/`, "u");
  const retained = kept.every((entry) => object(entry) && typeof entry.path === "string" && repositoryRelative(entry.path) && own.test(entry.path) && entry.path !== envelopePath
    && SHA256.test(entry.sha256 ?? "") && (() => { const seen = inspect(root, entry.path); return seen.kind === "file" && digest(seen.bytes) === entry.sha256; })());
  return retained ? kept : null;
}

/** Sources the PO's approval binds, from the envelope that was itself re-derived from the retained approval. */
function approvalBoundSources(envelope) {
  const bound = new Map();
  const companions = envelope?.request?.binding?.sources?.companions;
  if (Array.isArray(companions)) for (const entry of companions) if (object(entry) && typeof entry.path === "string" && SHA256.test(entry.sha256 ?? "")) bound.set(entry.path, entry.sha256);
  return bound;
}

/** C30I-S3: the `supersedes` an existing manifest of this feature declares (null or a feature id), or undefined when the bytes are no manifest of this feature. */
function declaredRelation(bytes, featureId) {
  try {
    const manifest = JSON.parse(bytes.toString("utf8"));
    return manifest?.schema === FEATURE_PACKAGE_SCHEMA && manifest.feature?.id === featureId ? (manifest.supersedes ?? null) : undefined;
  } catch { return undefined; }
}

/**
 * C30I-S3: the refusal of an optional `--supersedes <predecessor feature id>` input, or null when it may be written. The id grammar is the course admission's
 * (FEATURE_ID) narrowed by this module's own manifest id grammar (SAFE_ID, which the topology validator enforces on `supersedes`), and "discarded" is the
 * course admission's own reading of the State (discardedFeatureIdsOfState). Every refusal names its repair.
 */
function supersedesRefusal(supersedes, featureId, state) {
  if (typeof supersedes !== "string" || !FEATURE_ID.test(supersedes) || !SAFE_ID.test(supersedes)) {
    return refused("FPR-SUPERSEDES-PATTERN", `--supersedes must name the predecessor feature by its id (lowercase letters, digits and single hyphens, for example feature-a), not ${JSON.stringify(supersedes)}. Register without --supersedes when this feature has no discarded predecessor`);
  }
  if (supersedes === featureId) return refused("FPR-SUPERSEDES-SELF", `--supersedes names the feature itself (${featureId}); name the discarded predecessor, or register without --supersedes`);
  if (!discardedFeatureIdsOfState(state).includes(supersedes)) {
    return refused("FPR-SUPERSEDES-NOT-DISCARDED", `the State does not record ${supersedes} as discarded. Discard it first with the discard-feature route (pipeline-state.mjs discard-feature), or register without --supersedes when this feature is an ordinary one`);
  }
  return null;
}

/**
 * @param {object} input
 * @param {string} input.root absolute repository root
 * @param {object} input.state the parsed project authority State (read by the caller through its own resolver)
 * @param {Function} input.readAcceptedDeliveryContract the existing envelope reader (`scripts/pipeline-state.mjs`)
 * @param {string} [input.supersedes] C30I-S3: the discarded predecessor of a successor feature, written as the manifest's `supersedes` (absent or null: no relationship, as before)
 * @returns {object} `pipeline.feature-package-registration.v1`: status registered | already-registered | refused
 */
export function registerFeaturePackage({ root: rootInput, state, readAcceptedDeliveryContract, supersedes: supersedesInput } = {}) {
  if (typeof readAcceptedDeliveryContract !== "function" || !object(state)) return refused("FPR-ARGS", "root, state and the envelope reader are required");
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { return refused("FPR-ARGS", "root does not resolve to a directory"); }

  // 1. An approved v9 plan, read from the State the caller resolved, never from guessed paths.
  const approval = state.planApproval;
  const submission = state.planSubmission;
  const lifecycle = derivePlanLifecycle(state);
  const featureId = state.activeFeature?.id;
  const envelopePath = approval?.acceptedContract?.path;
  if (state.planApproved !== true || approval?.schema !== "pipeline.plan-approval.v9" || !lifecycle?.ok || lifecycle.approvalCurrent !== true
    || !REGISTRABLE.includes(lifecycle.status) || !FEATURE_STATES.includes(lifecycle.status)
    || !SAFE_ID.test(featureId ?? "") || submission?.featureId !== featureId
    || typeof envelopePath !== "string" || !SHA256.test(approval.acceptedContract.sha256 ?? "")) {
    return refused("FPR-NO-APPROVED-PLAN", "no current plan approval of the v9 accepted-contract shape exists for the active feature; run approve-plan first");
  }
  const manifestPath = `specs/${featureId}/lifecycle.json`;
  // C30I-S3: the optional predecessor is validated before the State, the envelope or the tree is touched further.
  const supersedes = supersedesInput === undefined || supersedesInput === null ? null : supersedesInput;
  if (supersedes !== null) {
    const rejected = supersedesRefusal(supersedes, featureId, state);
    if (rejected !== null) return rejected;
  }

  // 2. The envelope: the existing reader decides whether its bytes re-derive.
  const envelopeRead = repositoryRelative(envelopePath) ? inspect(root, envelopePath) : { kind: "other" };
  const envelopeBytes = envelopeRead.kind === "file" ? envelopeRead.bytes : null;
  if (!envelopeBytes || digest(envelopeBytes) !== approval.acceptedContract.sha256 || !envelopePath.endsWith(`-${approval.acceptedContract.sha256}.json`)) {
    return refused("FPR-ENVELOPE-UNAVAILABLE", "the retained accepted-contract envelope is missing or its bytes differ from the recorded digest", { envelopePath });
  }
  const observed = readAcceptedDeliveryContract({ dir: root, envelopePath });
  if (observed?.code === "CAC-ENVELOPE-UNAVAILABLE") {
    return refused("FPR-ENVELOPE-UNAVAILABLE", "the envelope bytes do not re-derive through the existing envelope reader", { envelopePath, readerCode: observed.code, ...(observed.detail ? { readerDetail: observed.detail } : {}) });
  }
  let envelope;
  try { envelope = JSON.parse(envelopeBytes.toString("utf8")); } catch { envelope = null; }
  if (envelope?.featureId !== featureId || envelope?.manifestPath !== manifestPath) {
    return refused("FPR-ENVELOPE-MISMATCH", "the envelope names a different feature or manifest path than the active feature", { envelopePath, manifestPath });
  }

  // 3. A manifest that already exists is never rewritten.
  const existingRead = inspect(root, manifestPath);
  const existing = existingRead.kind === "file" ? existingRead.bytes : null;
  let superseded = null;
  if (existingRead.kind !== "absent") {
    // C30I-S3: an approved manifest is never edited, so a flag that does not match the relation it already holds is refused with the supported route.
    const held = supersedes !== null && existing ? declaredRelation(existing, featureId) : undefined;
    if (held === null) return refused("FPR-SUPERSEDES-LATE", `${manifestPath} was registered without a predecessor (supersedes: null) and an approved manifest is never edited, so --supersedes cannot be added now. Name the discarded predecessor at review time instead: add --successor-of <feature id of the discarded predecessor> to the prepare-dispatch.mjs critic or critic-dispatch-preflight.mjs command of the first review round`, { manifestPath });
    if (typeof held === "string" && held !== supersedes) return refused("FPR-SUPERSEDES-CONFLICT", `${manifestPath} already declares supersedes ${held} and an approved manifest is never edited: rerun with --supersedes ${held}, or without the flag`, { manifestPath });
    if (observed?.code && !READER_BEFORE_REGISTRATION.includes(observed.code) || observed?.ok === true) {
      return { schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "already-registered", manifestPath, envelopePath, manifestSha256: digest(existing ?? Buffer.alloc(0)), readerCode: observed?.code ?? null };
    }
    // Antigravity greenfield 2026-11-08: after a reopen the old manifest blocked the new approval and the agent hand-edited it.
    // A manifest that lists only earlier approvals of this feature is superseded by the current one: rebuilt here, the earlier envelopes retained.
    superseded = observed?.code === "CAC-REGISTRATION-INVALID" && existing ? supersededRegistrations(existing, featureId, envelopePath, root, supersedes) : null;
    if (superseded === null) {
      const checked = existing ? validateFeaturePackage(root, manifestPath) : { ok: false, findings: ["FTP-MANIFEST: not a regular file"] };
      return refused("FPR-MANIFEST-CONFLICT", checked.ok
        ? "a valid manifest exists but does not register this envelope as candidate-evidence; it is never overwritten"
        : withDigestRoute(root, manifestPath, "a manifest exists but is invalid; it is never overwritten"), { manifestPath, envelopePath, findings: checked.findings });
    }
  }

  // 4. The PRD and the Spec are the design course's output: they must exist and are never invented.
  const entries = []; const missing = [];
  let specBytes = null; let specPath = null;
  for (const [kind, path] of [["prd", submission.planPath], ["spec", submission.specPath]]) {
    const seen = repositoryRelative(path) ? inspect(root, path) : { kind: "absent" };
    if (seen.kind !== "file") { missing.push({ class: kind, path: repositoryRelative(path) ? path : null }); continue; }
    if (kind === "spec") { specBytes = seen.bytes; specPath = path; }
    entries.push({ class: kind, path, bytes: seen.bytes, generated: false, authority: true, mutability: "mutable", retention: "active" });
  }
  if (missing.length > 0) {
    return refused("FPR-ARTIFACT-MISSING", "the approved plan's PRD and Spec must exist (the design course writes them; this command never invents them)", { missing, manifestPath });
  }

  // 5. Acceptance and Result: an existing file is registered as found; an absent one is generated (exclusive create, below).
  const bound = approvalBoundSources(envelope);
  const specSha256 = digest(specBytes);
  for (const [kind, mutability, render] of [
    ["acceptance", "mutable", () => renderAcceptancePointer({ featureId, specPath, specSha256 })],
    ["result", "append-only", () => renderResultRecord({ featureId })],
  ]) {
    const path = `specs/${featureId}/${kind}.md`;
    const seen = inspect(root, path);
    if (seen.kind === "other") return refused("FPR-ARTIFACT-INVALID", `${path} exists but is not a regular file; it is never replaced`, { path, manifestPath });
    if (seen.kind === "file") {
      entries.push({ class: kind, path, bytes: seen.bytes, generated: false, authority: bound.get(path) === digest(seen.bytes), mutability, retention: "active" });
    } else {
      entries.push({ class: kind, path, bytes: Buffer.from(render()), generated: true, authority: false, mutability: "immutable", retention: "active" });
    }
  }

  // PF-34: the Critic review unit, registered as found or generated; a Spec without criterion ids gets none.
  const unitPath = criticReviewUnitPath(featureId), unitSeen = inspect(root, unitPath);
  let reviewUnit;
  if (unitSeen.kind === "other") return refused("FPR-ARTIFACT-INVALID", `${unitPath} exists but is not a regular file; it is never replaced`, { path: unitPath, manifestPath });
  if (unitSeen.kind === "file") {
    // C28e (PO decision 2026-11-13): a unit this registrar generated for an earlier approval names that Spec's criterion ids. When the
    // approved Spec now names other ids and no Critic round has run yet, it is rendered anew, so the first round binds the approved ids.
    // Once a round is retained, the course is bound to the unit's bytes (the declaration commit, CCA/CGB-REVIEW-UNIT-BINDING) and every
    // later round must carry the same acceptance ids (CRL-V2-CARRY-COVERAGE): the unit is then kept and reported as bound to the course.
    // A unit of any other shape (a hand-written multi-item unit) is kept as found.
    const courseStarted = (superseded ?? []).some((entry) => entry.class === "candidate-evidence" && LINEAGE_FILE.test(entry.path));
    let found = null;
    try { found = JSON.parse(unitSeen.bytes.toString("utf8")); } catch { found = null; }
    const rendered = renderCriticReviewUnit({ featureId, specPath, specBytes, mainRef: primaryMainRef(root) });
    const fresh = rendered.ok ? JSON.parse(rendered.bytes.toString("utf8")) : null;
    const generatedShape = object(found) && found.schema === CRITIC_REVIEW_UNIT_SCHEMA && found.kind === "independent-delivery"
      && Array.isArray(found.logicalWorkIds) && found.logicalWorkIds.length === 1 && found.logicalWorkIds[0] === featureId && Array.isArray(found.criterionIds);
    const stale = fresh !== null && generatedShape
      && (found.specPath !== specPath || JSON.stringify([...found.criterionIds].sort()) !== JSON.stringify(fresh.criterionIds));
    if (stale && !courseStarted) {
      entries.push({ class: "design", path: unitPath, bytes: rendered.bytes, generated: true, replaces: unitSeen.bytes, ...REVIEW_UNIT_ARTIFACT });
      reviewUnit = { status: "re-rendered", path: unitPath, previousCriterionIds: found.criterionIds, criterionIds: fresh.criterionIds };
    } else if (stale) {
      entries.push({ class: "design", path: unitPath, bytes: unitSeen.bytes, generated: false, ...REVIEW_UNIT_ARTIFACT });
      reviewUnit = { status: "stale-bound-to-course", path: unitPath, criterionIds: found.criterionIds, approvedCriterionIds: fresh.criterionIds,
        reason: "a Critic round of this feature is retained; its course is bound to the review unit's bytes and acceptance ids, so the unit is kept. "
          + "Criteria the approved Spec added are not covered by this course: review them in a new feature (rigor 1, its own PRD and Spec) or ask the PO how to proceed." };
    } else {
      entries.push({ class: "design", path: unitPath, bytes: unitSeen.bytes, generated: false, ...REVIEW_UNIT_ARTIFACT });
      reviewUnit = { status: "found", path: unitPath };
    }
  } else {
    const rendered = renderCriticReviewUnit({ featureId, specPath, specBytes, mainRef: primaryMainRef(root) });
    if (rendered.ok) entries.push({ class: "design", path: unitPath, bytes: rendered.bytes, generated: true, ...REVIEW_UNIT_ARTIFACT });
    reviewUnit = rendered.ok ? { status: "generated", path: unitPath } : { status: "not-generated", path: unitPath, reason: rendered.reason };
  }

  const rigor = resolveRigor(state);
  if (!rigor) return refused("FPR-RIGOR-UNRESOLVED", "the State yields neither a submitted profile nor a retained rigor floor to map to a rigor level");

  const artifacts = entries.map((entry) => ({ class: entry.class, path: entry.path, sha256: digest(entry.bytes), authority: entry.authority, mutability: entry.mutability, retention: entry.retention }));
  for (const entry of superseded ?? []) {
    artifacts.push(entry.class === "candidate-evidence"
      ? { class: "candidate-evidence", path: entry.path, sha256: entry.sha256, authority: false, mutability: "immutable", retention: "retain" }
      : { class: entry.class, path: entry.path, sha256: entry.sha256, authority: entry.authority, mutability: entry.mutability, retention: entry.retention, ...(Object.hasOwn(entry, "amendment") ? { amendment: entry.amendment } : {}) });
  }
  artifacts.push({ class: "candidate-evidence", path: envelopePath, sha256: digest(envelopeBytes), authority: false, mutability: "immutable", retention: "retain" });
  const manifest = { schema: FEATURE_PACKAGE_SCHEMA, feature: { id: featureId, rigor: rigor.rigor }, state: lifecycle.status, artifacts, candidate: null, supersedes };
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);

  // 6. Exclusive creates only (never overwrite): the generated documents first, the manifest last. Any later failure undoes exactly what was created here.
  const created = [], createdDirectories = [], replaced = [];
  const rollback = () => {
    for (const path of created.reverse()) { try { unlinkSync(join(root, path)); } catch { /* a file this call just created */ } }
    for (const path of createdDirectories.reverse()) { try { rmdirSync(path); } catch { /* a directory this call just created */ } }
    for (const [path, previous] of replaced.reverse()) { try { writeFileSync(join(root, path), previous); } catch { /* the bytes are in Git */ } }
    if (superseded !== null) { try { writeFileSync(join(root, manifestPath), existing); } catch { /* the bytes are in Git */ } }
  };
  // A re-rendered review unit replaces the found file through a temporary file; the rollback writes the found bytes back.
  const replacing = new Map(entries.filter((entry) => entry.replaces).map((entry) => [entry.path, entry.replaces]));
  for (const [path, content] of [...entries.filter((entry) => entry.generated).map((entry) => [entry.path, entry.bytes]), [manifestPath, bytes]]) {
    try {
      const directory = dirname(join(root, path));
      if (!existsSync(directory)) { mkdirSync(directory, { mode: 0o755 }); createdDirectories.push(directory); }
      if (replacing.has(path)) {
        const temporary = `${join(root, path)}.registering-${process.pid}`;
        writeFileSync(temporary, content, { flag: "wx", mode: 0o644 });
        renameSync(temporary, join(root, path)); replaced.push([path, replacing.get(path)]);
      } else if (path === manifestPath && superseded !== null) {
        const temporary = `${join(root, path)}.registering-${process.pid}`;
        writeFileSync(temporary, content, { flag: "wx", mode: 0o644 });
        renameSync(temporary, join(root, path));
      } else {
        writeFileSync(join(root, path), content, { flag: "wx", mode: 0o644 }); created.push(path);
      }
    }
    catch (error) { rollback(); return refused("FPR-WRITE-FAILED", `${path} could not be created exclusively (${error?.code ?? "error"}); nothing this call created was kept`, { path, manifestPath }); }
  }
  const validated = validateFeaturePackage(root, manifestPath);
  if (!validated.ok) { rollback(); return refused("FPR-VALIDATION-FAILED", "the topology validator refused the written manifest; everything this call created was removed", { manifestPath, findings: validated.findings }); }
  const reread = readAcceptedDeliveryContract({ dir: root, envelopePath });
  if (reread?.code === "CAC-REGISTRATION-INVALID" || reread?.code === "CAC-ENVELOPE-UNAVAILABLE") {
    rollback();
    return refused("FPR-REGISTRATION-NOT-RESOLVED", "the existing envelope reader still refuses the registration; everything this call created was removed", { manifestPath, readerCode: reread.code, ...(reread.detail ? { readerDetail: reread.detail } : {}) });
  }
  const summary = (entry) => ({ class: entry.class, path: entry.path, sha256: digest(entry.bytes), authority: entry.authority, mutability: entry.mutability, retention: entry.retention });
  return {
    schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "registered", manifestPath, envelopePath,
    manifestSha256: digest(bytes), readerCode: reread?.code ?? null,
    rigor: rigor.rigor, rigorSource: rigor.source,
    generated: entries.filter((entry) => entry.generated).map(summary),
    found: entries.filter((entry) => !entry.generated && (entry.class === "acceptance" || entry.class === "result" || entry.class === "design")).map(summary),
    reviewUnit,
    choices: {
      design: "the Critic review unit: absent -> generated for the whole feature as one course, binding the Spec's AC-<n> ids (authority:false, immutable, retain); present -> registered as found, except a generated single-course unit whose criterion ids or Spec path no longer match the approved Spec, which is rendered anew before the first Critic round (reviewUnit.status re-rendered) and kept once a round is retained (stale-bound-to-course); a Spec with no criterion id gets none (reviewUnit names why)",
      state: `${lifecycle.status} (the plan lifecycle status; the topology requires prd, spec, acceptance, result and candidate-evidence for it)`,
      rigor: `${rigor.rigor} (${rigor.source}: ${rigor.basis}; judgment call, no shipped source defines the profile-to-level mapping)`,
      prd: "authority:true, mutable, active (the approved bytes are already bound by the signed envelope; the topology fixes no mutability for this class)",
      spec: "authority:true, mutable, active (as prd)",
      acceptance: "absent -> generated pointer to the approved Spec (authority:false, immutable, active); present -> registered as found, never rewritten (authority:true only when the approval's companion binding names this path and digest)",
      result: "absent -> generated status record (authority:false, immutable, active); present -> registered as found, never rewritten, append-only (authority:true only when the approval's companion binding names this path and digest)",
      envelope: "candidate-evidence, authority:false, immutable, retain (fixed by the topology)",
      candidate: "null (only verifying/completed require a candidate binding)",
      supersedes: supersedes === null
        ? "null (no relationship; only superseded/retained require one). A successor of a DISCARDED feature registers with --supersedes <predecessor feature id> (the State must record the predecessor as discarded); an already registered successor names it at review time with --successor-of"
        : `${supersedes} (the discarded predecessor named with --supersedes <predecessor feature id>; the State records it as discarded, and the Critic course admission reads it as the successor of a discarded feature)`,
    },
  };
}

/**
 * PF-34 (b): a feature registered before the review unit existed gets it through this one typed amendment: the unit
 * (registered as found, or generated as in registration) and its `design` entry appended to the manifest. Nothing
 * else of the manifest changes. A failure restores the manifest's bytes and removes what this call created.
 * A unit added after delivery may be reviewed from any base on the candidate history that already lists the feature
 * manifest (critic-course-admission.mjs reads the unit at the commit that introduced it); a course that already has
 * a retained review keeps its first base and cannot use the unit.
 */
export function addCriticReviewUnit({ root: rootInput, state, readAcceptedDeliveryContract } = {}) {
  if (typeof readAcceptedDeliveryContract !== "function" || !object(state)) return refused("FPR-ARGS", "root, state and the envelope reader are required");
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { return refused("FPR-ARGS", "root does not resolve to a directory"); }
  const featureId = state.activeFeature?.id;
  if (!SAFE_ID.test(featureId ?? "")) return refused("FPR-NO-APPROVED-PLAN", "no active feature; set-feature first");
  const manifestPath = `specs/${featureId}/lifecycle.json`, unitPath = criticReviewUnitPath(featureId);
  const manifestRead = inspect(root, manifestPath);
  if (manifestRead.kind !== "file") return refused("FPR-MANIFEST-MISSING", `no manifest ${manifestPath}; register the feature package first (register-feature-package.mjs --root <root>), which writes the review unit with it`, { manifestPath });
  const checked = validateFeaturePackage(root, manifestPath);
  if (!checked.ok) return refused("FPR-MANIFEST-CONFLICT", withDigestRoute(root, manifestPath, "the manifest does not validate; it is never amended"), { manifestPath, findings: checked.findings });
  let manifest;
  try { manifest = JSON.parse(manifestRead.bytes.toString("utf8")); } catch { return refused("FPR-MANIFEST-CONFLICT", "the manifest is not JSON", { manifestPath }); }
  if (manifest.artifacts.some((entry) => entry.path === unitPath)) return { schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "already-present", manifestPath, reviewUnitPath: unitPath };
  const specs = manifest.artifacts.filter((entry) => entry.class === "spec" && entry.authority === true);
  const envelopes = manifest.artifacts.filter((entry) => entry.class === "candidate-evidence");
  if (specs.length !== 1) return refused("FPR-MANIFEST-CONFLICT", "the manifest names no single authority Spec for the review unit to bind", { manifestPath });
  const specRead = inspect(root, specs[0].path);
  if (specRead.kind !== "file") return refused("FPR-ARTIFACT-MISSING", "the manifest's Spec is missing", { manifestPath, missing: [{ class: "spec", path: specs[0].path }] });
  const unitSeen = inspect(root, unitPath);
  if (unitSeen.kind === "other") return refused("FPR-ARTIFACT-INVALID", `${unitPath} exists but is not a regular file; it is never replaced`, { path: unitPath, manifestPath });
  let unitBytes = unitSeen.kind === "file" ? unitSeen.bytes : null;
  if (!unitBytes) {
    const rendered = renderCriticReviewUnit({ featureId, specPath: specs[0].path, specBytes: specRead.bytes, mainRef: primaryMainRef(root) });
    if (!rendered.ok) return refused("FPR-REVIEW-UNIT-UNAVAILABLE", rendered.reason, { manifestPath, path: unitPath });
    unitBytes = rendered.bytes;
  }
  const amended = { ...manifest, artifacts: [...manifest.artifacts, { class: "design", path: unitPath, sha256: digest(unitBytes), ...REVIEW_UNIT_ARTIFACT }] };
  const bytes = Buffer.from(`${JSON.stringify(amended, null, 2)}\n`);
  const createdDirectories = [];
  let unitCreated = false;
  const restore = () => {
    try { writeFileSync(join(root, manifestPath), manifestRead.bytes); } catch { /* the readback below reports a manifest it cannot restore */ }
    if (unitCreated) { try { unlinkSync(join(root, unitPath)); } catch { /* a file this call just created */ } }
    for (const path of createdDirectories.reverse()) { try { rmdirSync(path); } catch { /* a directory this call just created */ } }
  };
  try {
    if (unitSeen.kind === "absent") {
      const directory = dirname(join(root, unitPath));
      if (!existsSync(directory)) { mkdirSync(directory, { mode: 0o755 }); createdDirectories.push(directory); }
      writeFileSync(join(root, unitPath), unitBytes, { flag: "wx", mode: 0o644 }); unitCreated = true;
    }
    const temp = join(root, `${manifestPath}.review-unit-${process.pid}.tmp`);
    writeFileSync(temp, bytes, { flag: "wx", mode: 0o644 }); renameSync(temp, join(root, manifestPath));
  } catch (error) { restore(); return refused("FPR-WRITE-FAILED", `the review unit could not be added (${error?.code ?? "error"}); the manifest was restored`, { manifestPath, path: unitPath }); }
  const validated = validateFeaturePackage(root, manifestPath);
  if (!validated.ok) { restore(); return refused("FPR-VALIDATION-FAILED", "the topology validator refused the amended manifest; it was restored", { manifestPath, findings: validated.findings }); }
  if (envelopes.length === 1) {
    const reread = readAcceptedDeliveryContract({ dir: root, envelopePath: envelopes[0].path });
    if (reread?.code === "CAC-REGISTRATION-INVALID" || reread?.code === "CAC-ENVELOPE-UNAVAILABLE") {
      restore();
      return refused("FPR-REGISTRATION-NOT-RESOLVED", "the envelope reader refuses the amended manifest; it was restored", { manifestPath, readerCode: reread.code, ...(reread.detail ? { readerDetail: reread.detail } : {}) });
    }
  }
  return {
    schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "review-unit-added", manifestPath, reviewUnitPath: unitPath,
    reviewUnit: { status: unitSeen.kind === "file" ? "found" : "generated", path: unitPath, sha256: digest(unitBytes) },
    manifestSha256: digest(bytes), commitPaths: [manifestPath, unitPath],
    next: "commit both paths in one commit. The first Critic review of this feature course may start from any base on the candidate history that already lists the feature manifest, for example the commit that first added it. A course that already has a retained review keeps its first base and cannot use this unit",
  };
}

/**
 * D165-CDR: registers Critic diagnostic evidence (the diagnostic JSON and the members it names: the targeted log and,
 * when present, the full-verify evidence) as immutable, non-authority `candidate-evidence` entries of the feature
 * manifest. Critic course admission (`deterministic()`) reads only registered artifacts, so an unregistered
 * diagnostic is invisible to it. The diagnostic is validated against its own recorded candidate before anything is
 * written; the files must already exist under `specs/<feature>/evidence/`. Nothing else of the manifest changes.
 */
const DIAGNOSTIC_ARTIFACT = Object.freeze({ class: "candidate-evidence", authority: false, mutability: "immutable", retention: "retain" });
function gitOut(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 10000 });
  return result.status === 0 ? result.stdout.trim() : null;
}
export function addCriticDiagnosticEvidence({ root: rootInput, state, path: diagnosticRel, readAcceptedDeliveryContract } = {}) {
  if (!object(state) || typeof diagnosticRel !== "string") return refused("FPR-ARGS", "root, state and the diagnostic path are required");
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { return refused("FPR-ARGS", "root does not resolve to a directory"); }
  const featureId = state.activeFeature?.id;
  if (!SAFE_ID.test(featureId ?? "")) return refused("FPR-NO-APPROVED-PLAN", "no active feature; set-feature first");
  const manifestPath = `specs/${featureId}/lifecycle.json`, evidenceDir = `specs/${featureId}/evidence/`;
  const manifestRead = inspect(root, manifestPath);
  if (manifestRead.kind !== "file") return refused("FPR-MANIFEST-MISSING", `no manifest ${manifestPath}; register the feature package first (register-feature-package.mjs --root <root>)`, { manifestPath });
  const checked = validateFeaturePackage(root, manifestPath);
  let manifest;
  try { manifest = JSON.parse(manifestRead.bytes.toString("utf8")); } catch { return refused("FPR-MANIFEST-CONFLICT", "the manifest is not JSON", { manifestPath }); }
  if (!checked.ok) {
    // Other bytes at an already registered diagnostic path break the manifest's own digest binding; name that cause, never amend.
    const registered = Array.isArray(manifest?.artifacts) ? manifest.artifacts.find((entry) => entry?.path === diagnosticRel && entry.class === "candidate-evidence") : null;
    const present = registered ? inspect(root, diagnosticRel) : null;
    if (present?.kind === "file" && digest(present.bytes) !== registered.sha256) return refused("FPR-DIAG-IMMUTABLE", `${diagnosticRel} is registered with other bytes; registered evidence is never replaced`, { manifestPath, path: diagnosticRel });
    return refused("FPR-MANIFEST-CONFLICT", withDigestRoute(root, manifestPath, "the manifest does not validate; it is never amended"), { manifestPath, findings: checked.findings });
  }
  // A path under the feature's evidence directory, a regular file, no symlink on the way.
  const pathProblem = (path) => {
    if (!repositoryRelative(path) || diagnosticEvidenceLocation(path)?.featureId !== featureId) return `${path} is not a repository-relative path under ${evidenceDir}; produce the diagnostic with the producer flags --log and --out under ${evidenceDir}, and for members copy the full-verify evidence byte-identically there and pass it with --full-verify`;
    const seen = inspect(root, path);
    if (seen.kind !== "file") return `${path} is missing or is not a regular file`;
    try { if (realpathSync(join(root, path)) !== join(root, path)) return `${path} resolves through a link`; } catch { return `${path} does not resolve`; }
    return null;
  };
  const problem = pathProblem(diagnosticRel);
  if (problem) return refused("FPR-DIAG-PATH", problem, { manifestPath, path: diagnosticRel });
  const diagnosticBytes = inspect(root, diagnosticRel).bytes;
  let value;
  try { value = JSON.parse(diagnosticBytes.toString("utf8")); } catch { return refused("FPR-DIAG-SCHEMA", "the file is not JSON", { manifestPath, path: diagnosticRel }); }
  if (!object(value) || value.schema !== CRITIC_DIAGNOSTIC_SCHEMA) return refused("FPR-DIAG-SCHEMA", `the file is not a ${CRITIC_DIAGNOSTIC_SCHEMA} document`, { manifestPath, path: diagnosticRel });
  const recorded = value.candidate;
  const commit = object(recorded) && typeof recorded.commit === "string" && /^[a-f0-9]{40,64}$/u.test(recorded.commit) ? gitOut(root, ["rev-parse", "--verify", `${recorded.commit}^{commit}`]) : null;
  const tree = commit ? gitOut(root, ["rev-parse", `${commit}^{tree}`]) : null;
  if (!commit || commit !== recorded.commit || !tree || tree !== recorded.tree) return refused("FPR-DIAG-CANDIDATE", "the recorded candidate commit and tree do not resolve to a commit of this repository", { manifestPath, path: diagnosticRel });
  const members = [value.targeted?.log?.path, value.fullVerify?.evidence?.path].filter((path) => typeof path === "string");
  for (const path of members) {
    const memberProblem = pathProblem(path);
    if (memberProblem) return refused(inspect(root, path).kind === "absent" ? "FPR-DIAG-MEMBER" : "FPR-DIAG-PATH", memberProblem, { manifestPath, path });
  }
  try { validateCriticDiagnostic(value, { root, candidate: { commit, tree }, readArtifact: (path) => readDiagnosticArtifact(root, path) }); }
  catch (error) {
    const member = error?.code === "ENOENT" || error?.code === "CDI-ARTIFACT" || error?.code === "CDI-DIGEST";
    return refused(member ? "FPR-DIAG-MEMBER" : "FPR-DIAG-SCHEMA", `the diagnostic does not validate (${error?.code ?? "error"})`, { manifestPath, path: diagnosticRel });
  }
  const wanted = [diagnosticRel, ...members].map((path) => ({ path, bytes: inspect(root, path).bytes }));
  const additions = [];
  for (const { path, bytes } of wanted) {
    const existing = manifest.artifacts.find((entry) => entry.path === path);
    if (!existing) { additions.push({ ...DIAGNOSTIC_ARTIFACT, path, sha256: digest(bytes) }); continue; }
    if (existing.sha256 !== digest(bytes)) return refused("FPR-DIAG-IMMUTABLE", `${path} is registered with other bytes; registered evidence is never replaced`, { manifestPath, path });
  }
  if (additions.length === 0) return { schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "already-registered", manifestPath, diagnosticPath: diagnosticRel };
  const bytes = Buffer.from(`${JSON.stringify({ ...manifest, artifacts: [...manifest.artifacts, ...additions] }, null, 2)}\n`);
  const restore = () => { try { writeFileSync(join(root, manifestPath), manifestRead.bytes); } catch { /* the readback below reports a manifest it cannot restore */ } };
  const temp = join(root, `${manifestPath}.diagnostic-${process.pid}.tmp`);
  try { writeFileSync(temp, bytes, { flag: "wx", mode: 0o644 }); renameSync(temp, join(root, manifestPath)); }
  catch (error) { try { unlinkSync(temp); } catch { /* not created */ } restore(); return refused("FPR-WRITE-FAILED", `the diagnostic evidence could not be registered (${error?.code ?? "error"}); the manifest was restored`, { manifestPath }); }
  const validated = validateFeaturePackage(root, manifestPath);
  if (!validated.ok) { restore(); return refused("FPR-VALIDATION-FAILED", "the topology validator refused the amended manifest; it was restored", { manifestPath, findings: validated.findings }); }
  const envelopes = manifest.artifacts.filter((entry) => entry.class === "candidate-evidence" && typeof readAcceptedDeliveryContract === "function");
  if (envelopes.length === 1) {
    const reread = readAcceptedDeliveryContract({ dir: root, envelopePath: envelopes[0].path });
    if (reread?.code === "CAC-REGISTRATION-INVALID" || reread?.code === "CAC-ENVELOPE-UNAVAILABLE") {
      restore();
      return refused("FPR-REGISTRATION-NOT-RESOLVED", "the envelope reader refuses the amended manifest; it was restored", { manifestPath, readerCode: reread.code, ...(reread.detail ? { readerDetail: reread.detail } : {}) });
    }
  }
  return {
    schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "diagnostic-added", manifestPath, diagnosticPath: diagnosticRel,
    registered: additions.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
    manifestSha256: digest(bytes), commitPaths: [manifestPath, ...wanted.map((row) => row.path)],
    next: "commit commitPaths in one commit, then rerun critic-dispatch-preflight.mjs against that registration commit",
  };
}

/**
 * Registers a passing candidate-bound Verify evidence file (`--add-verify-evidence <path>`) as an immutable, non-authority
 * `candidate-evidence` entry of the feature manifest. The feature-close audit route needs such an entry (and a package candidate
 * the next `feature-package-plan --next-state verifying` derives from it); no other verb writes it. The file, produced by
 * `verify-evidence-producer.mjs --mode candidate --out specs/<feature>/evidence/...`, must already exist under `specs/<feature>/evidence/`; it must be a
 * `pipeline.verify-evidence.v0` with `exitCode` 0 whose candidate commit and tree resolve in this repository. Nothing else of the
 * manifest changes, and a path registered with other bytes is refused, never replaced.
 */
export function addVerifyEvidence({ root: rootInput, state, path: evidenceRel, readAcceptedDeliveryContract } = {}) {
  if (!object(state) || typeof evidenceRel !== "string") return refused("FPR-ARGS", "root, state and the Verify evidence path are required");
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { return refused("FPR-ARGS", "root does not resolve to a directory"); }
  const featureId = state.activeFeature?.id;
  if (!SAFE_ID.test(featureId ?? "")) return refused("FPR-NO-APPROVED-PLAN", "no active feature; set-feature first");
  const manifestPath = `specs/${featureId}/lifecycle.json`, packageDir = `specs/${featureId}/`;
  const manifestRead = inspect(root, manifestPath);
  if (manifestRead.kind !== "file") return refused("FPR-MANIFEST-MISSING", `no manifest ${manifestPath}; register the feature package first (register-feature-package.mjs --root <root>)`, { manifestPath });
  const checked = validateFeaturePackage(root, manifestPath);
  let manifest;
  try { manifest = JSON.parse(manifestRead.bytes.toString("utf8")); } catch { return refused("FPR-MANIFEST-CONFLICT", "the manifest is not JSON", { manifestPath }); }
  if (!checked.ok) {
    const registered = Array.isArray(manifest?.artifacts) ? manifest.artifacts.find((entry) => entry?.path === evidenceRel && entry.class === "candidate-evidence") : null;
    const present = registered ? inspect(root, evidenceRel) : null;
    if (present?.kind === "file" && digest(present.bytes) !== registered.sha256) return refused("FPR-VERIFY-IMMUTABLE", `${evidenceRel} is registered with other bytes; registered evidence is never replaced`, { manifestPath, path: evidenceRel });
    return refused("FPR-MANIFEST-CONFLICT", withDigestRoute(root, manifestPath, "the manifest does not validate; it is never amended"), { manifestPath, findings: checked.findings });
  }
  // Registered candidate evidence is read back by the course history (CCA-REGISTRATION-SHAPE requires specs/<feature>/evidence/), so a path
  // directly under the package directory would register here and then end the Critic carry-forward at push time (VEP-CVL-CARRY-RANGE).
  const evidenceDir = `${packageDir}evidence/`;
  if (!repositoryRelative(evidenceRel) || !evidenceRel.startsWith(evidenceDir)) return refused("FPR-VERIFY-PATH", `${evidenceRel} is not a repository-relative path under ${evidenceDir}; produce the evidence with verify-evidence-producer.mjs --out ${evidenceDir}<name>.json (the registered course reads candidate evidence only from there), then register it`, { manifestPath, path: evidenceRel });
  const seen = inspect(root, evidenceRel);
  if (seen.kind !== "file") return refused("FPR-VERIFY-PATH", `${evidenceRel} is missing or is not a regular file`, { manifestPath, path: evidenceRel });
  try { if (realpathSync(join(root, evidenceRel)) !== join(root, evidenceRel)) return refused("FPR-VERIFY-PATH", `${evidenceRel} resolves through a link`, { manifestPath, path: evidenceRel }); } catch { return refused("FPR-VERIFY-PATH", `${evidenceRel} does not resolve`, { manifestPath, path: evidenceRel }); }
  let value;
  try { value = JSON.parse(seen.bytes.toString("utf8")); } catch { return refused("FPR-VERIFY-SCHEMA", "the file is not JSON", { manifestPath, path: evidenceRel }); }
  if (!object(value) || value.schema !== "pipeline.verify-evidence.v0") return refused("FPR-VERIFY-SCHEMA", "the file is not a pipeline.verify-evidence.v0 document", { manifestPath, path: evidenceRel });
  if (value.exitCode !== 0) return refused("FPR-VERIFY-NOT-PASSING", "the Verify evidence did not pass (exitCode is not 0); only a passing run qualifies a candidate", { manifestPath, path: evidenceRel });
  const recorded = value.candidate;
  const commit = object(recorded) && typeof recorded.commit === "string" && /^[a-f0-9]{40,64}$/u.test(recorded.commit) ? gitOut(root, ["rev-parse", "--verify", `${recorded.commit}^{commit}`]) : null;
  const tree = commit ? gitOut(root, ["rev-parse", `${commit}^{tree}`]) : null;
  if (!commit || commit !== recorded.commit || !tree || tree !== recorded.tree || value.commit !== commit || value.tree !== tree) return refused("FPR-VERIFY-CANDIDATE", "the recorded candidate commit and tree do not resolve to a commit of this repository, or differ from the evidence's own commit and tree", { manifestPath, path: evidenceRel });
  const existing = manifest.artifacts.find((entry) => entry.path === evidenceRel);
  const evidenceSha256 = digest(seen.bytes);
  if (existing && existing.sha256 !== evidenceSha256) return refused("FPR-VERIFY-IMMUTABLE", `${evidenceRel} is registered with other bytes; registered evidence is never replaced`, { manifestPath, path: evidenceRel });
  if (existing) return { schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "already-registered", manifestPath, verifyEvidencePath: evidenceRel };
  const bytes = Buffer.from(`${JSON.stringify({ ...manifest, artifacts: [...manifest.artifacts, { ...DIAGNOSTIC_ARTIFACT, path: evidenceRel, sha256: evidenceSha256 }] }, null, 2)}\n`);
  const restore = () => { try { writeFileSync(join(root, manifestPath), manifestRead.bytes); } catch { /* the readback below reports a manifest it cannot restore */ } };
  const temp = join(root, `${manifestPath}.verify-${process.pid}.tmp`);
  try { writeFileSync(temp, bytes, { flag: "wx", mode: 0o644 }); renameSync(temp, join(root, manifestPath)); }
  catch (error) { try { unlinkSync(temp); } catch { /* not created */ } restore(); return refused("FPR-WRITE-FAILED", `the Verify evidence could not be registered (${error?.code ?? "error"}); the manifest was restored`, { manifestPath }); }
  const validated = validateFeaturePackage(root, manifestPath);
  if (!validated.ok) { restore(); return refused("FPR-VALIDATION-FAILED", "the topology validator refused the amended manifest; it was restored", { manifestPath, findings: validated.findings }); }
  const envelopes = manifest.artifacts.filter((entry) => entry.class === "candidate-evidence" && typeof readAcceptedDeliveryContract === "function");
  if (envelopes.length === 1) {
    const reread = readAcceptedDeliveryContract({ dir: root, envelopePath: envelopes[0].path });
    if (reread?.code === "CAC-REGISTRATION-INVALID" || reread?.code === "CAC-ENVELOPE-UNAVAILABLE") {
      restore();
      return refused("FPR-REGISTRATION-NOT-RESOLVED", "the envelope reader refuses the amended manifest; it was restored", { manifestPath, readerCode: reread.code, ...(reread.detail ? { readerDetail: reread.detail } : {}) });
    }
  }
  return {
    schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "verify-evidence-added", manifestPath, verifyEvidencePath: evidenceRel,
    registered: [{ path: evidenceRel, sha256: evidenceSha256 }], manifestSha256: digest(bytes),
    next: "do NOT commit until the close-feature audit plan has used this package: the package candidate must stay equal to HEAD (a commit in between makes that plan refuse with FCA-PACKAGE, and the package must then be registered again for the new HEAD; the close's own commits come after the plan). Run pipeline-state.mjs feature-package-plan --root <root> --manifest " + manifestPath + " --next-state verifying, then feature-package-apply with its digest, then the same for --next-state completed",
  };
}

/**
 * ADR-0095: registers one PO-approved Spec addendum (`--add-spec-addendum <approval record>`). The record is the file
 * `pipeline-state.mjs approve-spec-addendum` wrote; it must be named by its own digest, bind the package's approved Spec, match a
 * private approval of kind spec-addendum for the same subject digest and commit, and the addendum it names must hold the approved
 * bytes in the working tree and at the approved commit, which is an ancestor of HEAD. The addendum is added as an immutable
 * non-authority `design` entry and the record as `candidate-evidence`; nothing else of the manifest changes and nothing is committed.
 */
export function addSpecAddendum({ root: rootInput, state, approvalPath, readAcceptedDeliveryContract } = {}) {
  if (!object(state) || typeof approvalPath !== "string") return refused("FPR-ARGS", "root, state and the Spec addendum approval record path are required");
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { return refused("FPR-ARGS", "root does not resolve to a directory"); }
  const featureId = state.activeFeature?.id;
  if (!SAFE_ID.test(featureId ?? "")) return refused("FPR-NO-APPROVED-PLAN", "no active feature; set-feature first");
  const manifestPath = `specs/${featureId}/lifecycle.json`;
  const manifestRead = inspect(root, manifestPath);
  if (manifestRead.kind !== "file") return refused("FPR-MANIFEST-MISSING", `no manifest ${manifestPath}; register the feature package first (register-feature-package.mjs --root <root>)`, { manifestPath });
  let manifest;
  try { manifest = JSON.parse(manifestRead.bytes.toString("utf8")); } catch { return refused("FPR-MANIFEST-CONFLICT", "the manifest is not JSON", { manifestPath }); }
  const checked = validateFeaturePackage(root, manifestPath);
  if (!checked.ok) return refused("FPR-MANIFEST-CONFLICT", withDigestRoute(root, manifestPath, "the manifest does not validate; it is never amended"), { manifestPath, findings: checked.findings });
  const where = { manifestPath, path: approvalPath };
  if (!SPEC_ADDENDUM_APPROVAL_FILE.test(approvalPath) || !approvalPath.startsWith(`specs/${featureId}/evidence/`)) {
    return refused("FPR-SPEC-ADDENDUM-PATH", `${approvalPath} is not a Spec addendum approval record of this feature (specs/${featureId}/evidence/spec-addendum-approval-<sha256>.json, written by pipeline-state.mjs approve-spec-addendum)`, where);
  }
  const seen = inspect(root, approvalPath);
  if (seen.kind !== "file") return refused("FPR-SPEC-ADDENDUM-PATH", `${approvalPath} is missing or is not a regular file`, where);
  try { if (realpathSync(join(root, approvalPath)) !== join(root, approvalPath)) return refused("FPR-SPEC-ADDENDUM-PATH", `${approvalPath} resolves through a link`, where); } catch { return refused("FPR-SPEC-ADDENDUM-PATH", `${approvalPath} does not resolve`, where); }
  if (specAddendumApprovalPath(featureId, seen.bytes) !== approvalPath) return refused("FPR-SPEC-ADDENDUM-RECORD", `${approvalPath} is not named by the digest of its bytes; the record was changed after the approval`, where);
  let record;
  try { record = JSON.parse(seen.bytes.toString("utf8")); } catch { return refused("FPR-SPEC-ADDENDUM-RECORD", "the record is not JSON", where); }
  const subject = record?.subject;
  const addendumPath = object(subject) ? subject.addendumPath : null;
  if (!isSpecAddendumPath(addendumPath)) return refused("FPR-SPEC-ADDENDUM-RECORD", "the record names no Spec addendum", where);
  const recordSha256 = digest(seen.bytes);
  const registeredRecord = manifest.artifacts.find((entry) => entry.path === approvalPath);
  const registeredAddendum = manifest.artifacts.find((entry) => entry.path === addendumPath);
  if (registeredRecord && registeredRecord.sha256 === recordSha256 && registeredAddendum?.class === "design" && registeredAddendum.sha256 === subject.addendumSha256) {
    return { schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "already-registered", manifestPath, approvalPath, addendumPath };
  }
  if (registeredRecord || registeredAddendum) return refused("FPR-SPEC-ADDENDUM-DUPLICATE", `${registeredAddendum ? addendumPath : approvalPath} is already registered; an addendum is registered once, and a further correction is the next addendum`, where);
  // The record must bind its own subject: the subject digest is recomputed, never taken from the file.
  const candidate = record.candidate;
  if (!object(candidate) || typeof candidate.commit !== "string" || typeof candidate.tree !== "string"
    || criticalActionSubjectSha256({ kind: SPEC_ADDENDUM_KIND, candidate: { commit: candidate.commit, tree: candidate.tree }, subject }) !== record.subjectSha256) {
    return refused("FPR-SPEC-ADDENDUM-RECORD", "the record's subject digest does not bind its subject and candidate", where);
  }
  const head = gitOut(root, ["rev-parse", "HEAD"]);
  const approvedTree = gitOut(root, ["rev-parse", "--verify", "--quiet", `${candidate.commit}^{tree}`]);
  if (!head || approvedTree !== candidate.tree || spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", candidate.commit, head], { shell: false, timeout: 15000 }).status !== 0) {
    return refused("FPR-SPEC-ADDENDUM-CANDIDATE", `the approved commit ${candidate.commit} is not this repository's commit with the recorded tree, or not an ancestor of HEAD`, where);
  }
  const approvedBlob = spawnSync("git", ["-C", root, "show", `${candidate.commit}:${addendumPath}`], { shell: false, timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
  if (approvedBlob.status !== 0 || digest(approvedBlob.stdout) !== subject.addendumSha256) {
    return refused("FPR-SPEC-ADDENDUM-DIGEST", `${addendumPath} at the approved commit does not hold the approved bytes`, { ...where, addendumPath });
  }
  const addendumSeen = inspect(root, addendumPath);
  if (addendumSeen.kind !== "file" || digest(addendumSeen.bytes) !== subject.addendumSha256) {
    return refused("FPR-SPEC-ADDENDUM-DIGEST", `${addendumPath} in the working tree does not hold the approved bytes; an approved addendum is never edited, a further correction is the next addendum`, { ...where, addendumPath });
  }
  // The PO's approval itself lives in the private store; a committed record without it is not an approval.
  const common = gitOut(root, ["rev-parse", "--git-common-dir"]);
  let gitCommonDir = null;
  try { gitCommonDir = common ? realpathSync(resolve(root, common)) : null; } catch { gitCommonDir = null; }
  const approved = gitCommonDir !== null && readPrivateApprovals(gitCommonDir, SPEC_ADDENDUM_KIND).some((envelope) => envelope.forCommit === candidate.commit
    && envelope.approval?.subjectSha256 === record.subjectSha256 && envelope.approval.forTree === candidate.tree && envelope.approval.approvedBy === record.approvedBy
    && envelope.approval.approvedAt === record.approvedAt && (envelope.approval.criticalProof?.proofSha256 ?? null) === record.proofSha256);
  if (!approved) return refused("FPR-SPEC-ADDENDUM-UNAPPROVED", "no private PO approval of kind spec-addendum matches this record (subject digest, commit, label, time and proof); run pipeline-state.mjs approve-spec-addendum in this repository", where);
  const additions = [
    { class: "design", path: addendumPath, sha256: subject.addendumSha256, authority: false, mutability: "immutable", retention: "retain" },
    { ...DIAGNOSTIC_ARTIFACT, path: approvalPath, sha256: recordSha256 },
  ];
  const amended = { ...manifest, artifacts: [...manifest.artifacts, ...additions] };
  // The one reader of the briefing, the delta request and the close must accept the amended manifest and see this addendum applied.
  const read = readSpecAddenda({ root, featureId, manifest: amended });
  const mine = read.addenda.find((entry) => entry.approvalPath === approvalPath);
  if (!read.ok) return refused("FPR-SPEC-ADDENDUM-READ", "the Spec addendum reader refuses the amended manifest; it was not written", { ...where, findings: read.findings });
  if (mine?.status !== "applied") return refused("FPR-SPEC-ADDENDUM-SUPERSEDED", "the record binds a Spec that is no longer the package's approved Spec (the design was reopened and re-approved); write and approve a new addendum against the approved Spec", where);
  const bytes = Buffer.from(`${JSON.stringify(amended, null, 2)}\n`);
  const restore = () => { try { writeFileSync(join(root, manifestPath), manifestRead.bytes); } catch { /* the readback below reports a manifest it cannot restore */ } };
  const temp = join(root, `${manifestPath}.addendum-${process.pid}.tmp`);
  try { writeFileSync(temp, bytes, { flag: "wx", mode: 0o644 }); renameSync(temp, join(root, manifestPath)); }
  catch (error) { try { unlinkSync(temp); } catch { /* not created */ } restore(); return refused("FPR-WRITE-FAILED", `the Spec addendum could not be registered (${error?.code ?? "error"}); the manifest was restored`, { manifestPath }); }
  const validated = validateFeaturePackage(root, manifestPath);
  if (!validated.ok) { restore(); return refused("FPR-VALIDATION-FAILED", "the topology validator refused the amended manifest; it was restored", { manifestPath, findings: validated.findings }); }
  const envelopes = manifest.artifacts.filter((entry) => entry.class === "candidate-evidence" && typeof readAcceptedDeliveryContract === "function");
  if (envelopes.length === 1) {
    const reread = readAcceptedDeliveryContract({ dir: root, envelopePath: envelopes[0].path });
    if (reread?.code === "CAC-REGISTRATION-INVALID" || reread?.code === "CAC-ENVELOPE-UNAVAILABLE") {
      restore();
      return refused("FPR-REGISTRATION-NOT-RESOLVED", "the envelope reader refuses the amended manifest; it was restored", { manifestPath, readerCode: reread.code, ...(reread.detail ? { readerDetail: reread.detail } : {}) });
    }
  }
  return {
    schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "spec-addendum-added", manifestPath, approvalPath, addendumPath,
    registered: additions.map((entry) => ({ path: entry.path, sha256: entry.sha256 })), manifestSha256: digest(bytes),
    commitPaths: [manifestPath, approvalPath],
    next: `commit ${manifestPath} and ${approvalPath} in one commit; then hand the correction to the Goldfish with ${addendumPath} in its context. The next Critic round on this feature is a delta round that covers the addendum.`,
  };
}

/**
 * PF-94: registers the lineage record of a CONSUMED course round (`--add-review-lineage --packet <id>`). Everything but the
 * packet id is derived from the repository: the feature (the single registered feature course; C30J-J13: with several features that
 * hold a review unit, for example a retained discarded predecessor, the one whose course the consumed packet's course claim binds),
 * registrationCommit = HEAD,
 * the round candidate/base from the consumed packet, the parent from the registered history tail. The record is compiled by
 * compileRegisteredCriticReviewLineage, written as the immutable `critic-lineage-<sha>.json` and added to the manifest as
 * non-authority candidate-evidence. Nothing is committed. The optional `featureId` (`--feature <id>`) is a selector that is checked
 * against the same binding and refused when the claim binds another feature.
 */
const LINEAGE_FILE = /^specs\/[a-z0-9-]+\/evidence\/critic-lineage-[a-f0-9]{64}\.json$/u;
const DELTA_REQUEST_FILE = /^specs\/[a-z0-9-]+\/evidence\/critic-delta-request-[a-f0-9]{64}\.json$/u;
export function addCriticReviewLineage({ root: rootInput, packetId, readAcceptedDeliveryContract, dryRun = false, featureId: selector = null } = {}) {
  if (typeof packetId !== "string" || !/^[a-f0-9]{32}$/u.test(packetId)) return refused("FPR-ARGS", "--packet needs the 32-hex packet id of a consumed Critic round");
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { return refused("FPR-ARGS", "root does not resolve to a directory"); }
  const head = gitOut(root, ["rev-parse", "HEAD"]), common = gitOut(root, ["rev-parse", "--git-common-dir"]);
  if (!head || !common) return refused("FPR-ARGS", "root is not a git repository with a HEAD");
  let controlRoot;
  try { controlRoot = join(realpathSync(resolve(root, common)), "agent-pipeline", "critic-packets"); } catch { return refused("FPR-LINEAGE-NOT-CONSUMED", "no Critic owner store in this repository"); }
  let consumed;
  try { consumed = readConsumedCandidateResult({ controlRoot, packetId }); } catch { consumed = null; }
  if (!consumed?.packet || !consumed.receipt) return refused("FPR-LINEAGE-NOT-CONSUMED", `packet ${packetId} is not a consumed review in this repository's Critic owner store; finalize the round first (session-critic-finalizer)`);
  const packet = consumed.packet;
  const noClaim = `packet ${packetId} has no course claim: the round was finalized outside the feature course (for example with the caller-authored fallback). Use inspect-course-takeover and supersede-course-takeover for the work ids of the old batch, or rerun round 1 on the course path (critic-dispatch-preflight with the feature course context); a round outside the course cannot be registered as lineage`;
  // The single registered feature course: exactly one specs/<id>/lifecycle.json that lists a Critic review unit.
  let features = [];
  try { features = readdirSync(join(root, "specs")).filter((id) => SAFE_ID.test(id) && inspect(root, `specs/${id}/lifecycle.json`).kind === "file" && inspect(root, criticReviewUnitPath(id)).kind === "file"); } catch { features = []; }
  if (features.length === 0) return refused("FPR-LINEAGE-NO-COURSE-CLAIM", noClaim, { packetId });
  if (selector !== null && (typeof selector !== "string" || !features.includes(selector))) return refused("FPR-LINEAGE-FEATURE-SELECTOR", `--feature ${JSON.stringify(selector)} is not a feature that has a Critic review unit (${features.join(", ")}); name one of them: register-feature-package.mjs --root <root> --add-review-lineage --packet ${packetId} --feature <feature id>`, { packetId });
  // C30J-J13: everything below the choice of the feature is derived per feature; a feature whose course the consumed claim does not bind refuses (or compiles to nothing) by itself.
  const derive = (featureId) => {
  const manifestPath = `specs/${featureId}/lifecycle.json`;
  const manifestRead = inspect(root, manifestPath);
  const checked = validateFeaturePackage(root, manifestPath);
  if (!checked.ok) return refused("FPR-MANIFEST-CONFLICT", withDigestRoute(root, manifestPath, "the manifest does not validate; it is never amended"), { manifestPath, findings: checked.findings });
  let manifest;
  try { manifest = JSON.parse(manifestRead.bytes.toString("utf8")); } catch { return refused("FPR-MANIFEST-CONFLICT", "the manifest is not JSON", { manifestPath }); }
  // Idempotent replay: a registered lineage record of this packet is the answer, before anything is compiled.
  for (const entry of manifest.artifacts) {
    if (entry.class !== "candidate-evidence" || !LINEAGE_FILE.test(entry.path)) continue;
    const present = inspect(root, entry.path);
    let record = null;
    try { record = present.kind === "file" ? JSON.parse(present.bytes.toString("utf8")) : null; } catch { record = null; }
    if (record?.consumedResult?.packetId === packetId) return { schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "already-registered", manifestPath, lineagePath: entry.path, packetId };
  }
  const identityInput = { repoRoot: root, featureId, baseCommit: packet.candidate.base, candidateCommit: packet.candidate.commit, registrationCommit: head, acceptedReference: null };
  const resolved = resolveRegisteredCriticCourseIdentity(identityInput);
  if (!resolved.ok) return refused(String(resolved.code).startsWith("CCA-TRANSPORT") ? "FPR-LINEAGE-TRANSPORT" : "FPR-LINEAGE-COMPILE", `the course identity does not resolve (${resolved.code}); HEAD must be reachable from the round candidate through evidence-only commits only (registrations, or the tracked export of a consumed review), so the lineage of round N must be registered BEFORE the next correction commit; if correction commits already follow this round the lineage cannot be registered any more; retire the unregistered round with session-critic-finalizer inspect-course-takeover then supersede-course-takeover (it retires only the rounds above the registered lineage) and rerun that round as a delta from the last registered round`,{ compileCode: resolved.code, packetId });
  const claim = readConsumedCourseClaimBinding({ resolvedRepository: resolved.value.resolvedRepository, packetId, expectedCandidate: { commit: packet.candidate.commit, tree: packet.candidate.tree } });
  if (!claim.ok) return refused("FPR-LINEAGE-NO-COURSE-CLAIM", noClaim, { packetId, readerCode: claim.code ?? null });
  const history = resolved.value.registeredHistory;
  const round = history.length + 1;
  let unit;
  try { unit = JSON.parse(inspect(root, criticReviewUnitPath(featureId)).bytes.toString("utf8")); } catch { return refused("FPR-LINEAGE-COMPILE", "the review unit is not readable", { packetId }); }
  // The receipt carries no package, edge or coverage fields (only the reviewed range and the verdict), so those stay synthesized: one package over the whole packet diff. The synthesis claims the round reviewed exactly the packet diff; a receipt that says it reviewed another range contradicts that claim and is refused.
  const range = consumed.receipt.reviewRange;
  if (!range || range.base !== packet.candidate.base || range.commit !== packet.candidate.commit || range.diffSha256 !== packet.diff.sha256) return refused("FPR-LINEAGE-COVERAGE-CLAIM", `the consumed receipt of packet ${packetId} does not say it reviewed the packet diff (reviewRange differs from the packet candidate range), so the synthesized complete coverage would contradict it; rerun the round on the course path so the receipt covers the whole diff`, { packetId });
  const edges = ["feature-delivery"];
  // Round N > 1 names the delta request that was registered for exactly this round candidate (base and commit of the packet).
  let deltaRequestPath = null, deltaRequestRecord = null;
  // D204: the course base is the previous round's candidate; an effective full round (RE-DELTA-FALLBACK-FULL) has a packet base that is the course genesis base.
  const courseBase = history.length > 0 ? history.at(-1).record.candidate.commit : packet.candidate.base;
  if (history.length > 0) {
    // N44: a candidate can hold several registered requests (one per time the diagnostic set changed); the newest one binds the full set, so walk the manifest from its end.
    for (const entry of [...manifest.artifacts].reverse()) {
      if (entry.class !== "candidate-evidence" || !DELTA_REQUEST_FILE.test(entry.path)) continue;
      const present = inspect(root, entry.path);
      let record = null;
      try { record = present.kind === "file" ? JSON.parse(present.bytes.toString("utf8")) : null; } catch { record = null; }
      if (record?.schema === "pipeline.critic-delta-request.v1" && record.candidate?.commit === packet.candidate.commit && record.candidate?.base === courseBase) { deltaRequestPath = entry.path; deltaRequestRecord = record; break; }
    }
    if (deltaRequestPath === null) return refused("FPR-LINEAGE-COMPILE", `no delta request is registered for the round candidate ${packet.candidate.commit} (base ${packet.candidate.base}), so the lineage of round ${round} cannot compile (CCA-DELTA-REQUIRED); round 2 and later need the delta request first (register-feature-package.mjs --add-delta-request)`, { compileCode: "CCA-DELTA-REQUIRED", packetId });
  }
  const compiled = compileRegisteredCriticReviewLineage({
    courseRequest: { ...identityInput, baseCommit: courseBase, requestedMode: history.length === 0 ? "full" : "delta", criterionLocator: null, deltaRequestPath },
    packetId, reviewId: `review-${round}`, parentReviewId: history.at(-1)?.record?.reviewId ?? null,
    packages: [{ id: "feature-package", subjectSha256: packet.diff.sha256, changedPaths: [...packet.diffPaths], integrationEdges: edges }],
    coverage: { changedPaths: [...packet.diffPaths], acceptanceIds: [...unit.criterionIds].sort(), integrationEdges: edges, complete: true, receiptSha256: sha256Canonical(consumed.receipt) },
    correction: round === 1 ? null : { commit: packet.candidate.commit, deltaSha256: packet.diff.sha256, impactSha256: sha256Canonical(edges) },
    invalidation: deltaRequestRecord !== null && deltaRequestRecord.impactAmbiguous === true
      ? { kind: "full-review-required", reason: "impact-ambiguous", evidenceSha256: null }
      : { kind: "none", reason: null, evidenceSha256: null },
  });
  // A generic batch (the old, course-less route) already owns this unit's work ids: the compile conflicts and the round has no course claim by construction.
  if (!compiled.ok && compiled.code === "CGB-CONFLICT") return refused("FPR-LINEAGE-NO-COURSE-CLAIM", noClaim, { packetId, compileCode: compiled.code });
  if (!compiled.ok) return refused(String(compiled.code).startsWith("CCA-TRANSPORT") ? "FPR-LINEAGE-TRANSPORT" : "FPR-LINEAGE-COMPILE", `the lineage does not compile (${compiled.code}${String(compiled.code).startsWith("CRL-HISTORY-CHAIN:") ? ": the chain to the last registered round broke at the named condition; parent-review-id and previous-sha256 mean the parent is not the last registered round, review-id-repeated that the review id is not new, fresh-from, lane-id-equal and context-equal that the round is not an independent run after its parent" : ""}); the lineage of round N must be registered before the next correction commit${compiled.code === "CCA-DELTA-REQUIRED" ? "; round 2 and later need the delta request first" : ""}; if correction commits already follow this round the lineage cannot be registered any more; retire the unregistered round with session-critic-finalizer inspect-course-takeover then supersede-course-takeover (it retires only the rounds above the registered lineage) and rerun that round as a delta from the last registered round`,{ compileCode: compiled.code, packetId });
  return { ready: { featureId, manifestPath, manifestRead, manifest, round, artifact: compiled.value.artifact } };
  };
  const attempt = (id) => { try { return derive(id); } catch { return refused("FPR-LINEAGE-COMPILE", `the lineage of ${id} could not be derived`, { packetId }); } };
  const rerunWith = (id) => `register-feature-package.mjs --root <root> --add-review-lineage --packet ${packetId} --feature ${id}`;
  let chosen;
  if (selector !== null) {
    chosen = derive(selector);
    // A selector that contradicts the packet's own course claim is refused naming the feature the claim binds; it is never followed.
    const bound = chosen.status === "refused" ? features.filter((id) => id !== selector && attempt(id).status !== "refused") : [];
    if (bound.length > 0) return refused("FPR-LINEAGE-FEATURE-SELECTOR-CONTRADICTS", `--feature ${selector} contradicts the consumed packet ${packetId}: its course claim binds ${bound.join(", ")}, not ${selector}. Rerun with the bound feature: ${rerunWith(bound[0])}`, { packetId, boundFeatures: bound });
  } else if (features.length === 1) chosen = derive(features[0]);
  else {
    const outcomes = features.map((id) => [id, attempt(id)]);
    const bound = outcomes.filter(([, outcome]) => outcome.status !== "refused");
    if (bound.length !== 1) return refused("FPR-LINEAGE-FEATURE-AMBIGUOUS", `more than one feature has a review unit (${outcomes.map(([id, outcome]) => `${id}: ${outcome.status === "refused" ? outcome.code : "claim binds it"}`).join("; ")}) and the course claim of packet ${packetId} binds ${bound.length === 0 ? "none of them" : "more than one of them"}. Name the feature the round belongs to with the selector (it is checked against that claim; the refusal of that feature itself is then printed): ${features.map(rerunWith).join(" | ")}`, { packetId, features });
    chosen = bound[0][1];
  }
  // A refusal or an idempotent replay of the chosen feature answers by itself.
  if (chosen.ready === undefined) return chosen;
  const { featureId, manifestPath, manifestRead, manifest, round, artifact } = chosen.ready;
  // D223 guard: `dryRun` answers "would this write succeed right now" with the SAME derivation, and writes nothing.
  if (dryRun === true) return { schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "lineage-registrable", manifestPath, lineagePath: artifact.path, packetId, reviewId: `review-${round}`, commitPaths: [manifestPath, artifact.path] };
  const target = join(root, artifact.path), created = !existsSync(target);
  const restore = () => { try { writeFileSync(join(root, manifestPath), manifestRead.bytes); } catch { /* reported by the readback */ } if (created) { try { unlinkSync(target); } catch { /* not created */ } } };
  const temp = join(root, `${manifestPath}.lineage-${process.pid}.tmp`);
  try {
    mkdirSync(dirname(target), { recursive: true });
    if (created) writeFileSync(target, artifact.bytes, { flag: "wx", mode: 0o644 });
    const bytes = Buffer.from(`${JSON.stringify({ ...manifest, artifacts: [...manifest.artifacts, artifact.registration] }, null, 2)}\n`);
    writeFileSync(temp, bytes, { flag: "wx", mode: 0o644 }); renameSync(temp, join(root, manifestPath));
  } catch (error) { try { unlinkSync(temp); } catch { /* not created */ } restore(); return refused("FPR-WRITE-FAILED", `the lineage could not be registered (${error?.code ?? "error"}); the manifest was restored`, { manifestPath }); }
  const validated = validateFeaturePackage(root, manifestPath);
  if (!validated.ok) { restore(); return refused("FPR-VALIDATION-FAILED", "the topology validator refused the amended manifest; it was restored", { manifestPath, findings: validated.findings }); }
  const envelopes = manifest.artifacts.filter((entry) => entry.class === "candidate-evidence" && typeof readAcceptedDeliveryContract === "function");
  if (envelopes.length === 1) {
    const reread = readAcceptedDeliveryContract({ dir: root, envelopePath: envelopes[0].path });
    if (reread?.code === "CAC-REGISTRATION-INVALID" || reread?.code === "CAC-ENVELOPE-UNAVAILABLE") { restore(); return refused("FPR-REGISTRATION-NOT-RESOLVED", "the envelope reader refuses the amended manifest; it was restored", { manifestPath, readerCode: reread.code, ...(reread.detail ? { readerDetail: reread.detail } : {}) }); }
  }
  return {
    schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "lineage-added", manifestPath, lineagePath: artifact.path, packetId, reviewId: `review-${round}`,
    registered: [{ path: artifact.path, sha256: artifact.sha256 }], manifestSha256: digest(readFileSync(join(root, manifestPath))), commitPaths: [manifestPath, artifact.path],
    commitMessageHint: `chore(evidence): register Critic lineage review-${round} of ${featureId}`,
    next: "commit commitPaths in one evidence-only commit BEFORE any correction commit, then continue the course (delta request) against that registration commit",
  };
}

/**
 * D223 (slice 1): the commit-path guard. ONE core predicate; the commit-msg hook (every runner's `git commit` reaches it) is the thin
 * adapter. It refuses the commit being created while a finished Critic round has no registered lineage and the lineage can STILL be
 * registered, because a correction commit on top of an unregistered round makes the lineage unregisterable (the takeover recovery is
 * then the only route). It reads only the COMMITTED tree (HEAD), the STAGED index and the git-common-dir owner store (never the
 * gitignored project State, never the working tree for a decision other than "would the write succeed"), and fails OPEN on anything
 * it cannot read: a repository without a Critic course is never blocked.
 *   allow reasons: not-decidable | no-critic-course | no-consumed-round | lineage-registered | registration-commit | not-registrable
 *   refuse: CRL-LINEAGE-UNREGISTERED
 * "Registrable" is decided by `addCriticReviewLineage({ dryRun: true })`, the exact derivation of the write, so the guard never names
 * a repair that would itself be refused: a round whose lineage can no longer be registered (history older than this guard) is allowed.
 */
export const CRITIC_LINEAGE_COMMIT_CHECK_SCHEMA = "pipeline.critic-lineage-commit-check.v1";
export const CRITIC_LINEAGE_UNREGISTERED = "CRL-LINEAGE-UNREGISTERED";
const COMMIT_CHECK_PACKET_DIR = /^[a-f0-9]{32}$/u;
const COMMIT_CHECK_MAX_ROUNDS = 8;
const lineageCheckAllow = (reason, extra = {}) => ({ schema: CRITIC_LINEAGE_COMMIT_CHECK_SCHEMA, decision: "allow", reason, ...extra });
function committedOrStagedBlob(root, spec) {
  const shown = spawnSync("git", ["-C", root, "show", spec], { encoding: "buffer", shell: false, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  return shown.status === 0 ? shown.stdout : null;
}
/** True when the manifest at `prefix` (`HEAD:` committed, `:0:` staged) lists a lineage file at the same revision that records the packet. */
function lineageRowRegisteredAt(root, prefix, featureId, packetId) {
  const manifestBytes = committedOrStagedBlob(root, `${prefix}specs/${featureId}/lifecycle.json`);
  if (manifestBytes === null) return false;
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); } catch { return false; }
  for (const entry of Array.isArray(manifest?.artifacts) ? manifest.artifacts : []) {
    if (entry?.class !== "candidate-evidence" || typeof entry.path !== "string" || !LINEAGE_FILE.test(entry.path)) continue;
    const bytes = committedOrStagedBlob(root, `${prefix}${entry.path}`);
    if (bytes === null) continue;
    try { if (JSON.parse(bytes.toString("utf8"))?.consumedResult?.packetId === packetId) return true; } catch { /* an unreadable row registers nothing */ }
  }
  return false;
}
function decideCriticLineageCommit(rootInput) {
  const root = realpathSync(resolve(rootInput));
  if (!gitOut(root, ["rev-parse", "--verify", "--quiet", "HEAD"])) return lineageCheckAllow("not-decidable");
  const listing = spawnSync("git", ["-C", root, "ls-tree", "-r", "--name-only", "-z", "HEAD", "--", "specs"], { encoding: "utf8", shell: false, timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
  if (listing.status !== 0) return lineageCheckAllow("not-decidable");
  const tracked = new Set(listing.stdout.split("\0").filter((path) => path !== ""));
  const features = [...tracked].map((path) => /^specs\/([a-z0-9-]+)\/lifecycle\.json$/u.exec(path)?.[1]).filter((id) => id !== undefined && SAFE_ID.test(id) && tracked.has(criticReviewUnitPath(id)));
  if (features.length === 0) return lineageCheckAllow("no-critic-course");
  if (features.length > 1) return lineageCheckAllow("not-decidable", { detail: "more than one feature has a Critic review unit" });
  const featureId = features[0];
  const common = gitOut(root, ["rev-parse", "--git-common-dir"]);
  if (!common) return lineageCheckAllow("not-decidable");
  let controlRoot, names;
  try { controlRoot = join(realpathSync(resolve(root, common)), "agent-pipeline", "critic-packets"); names = readdirSync(controlRoot).filter((name) => COMMIT_CHECK_PACKET_DIR.test(name)); } catch { return lineageCheckAllow("no-consumed-round"); }
  const recent = names.map((name) => { try { return { name, mtimeMs: lstatSync(join(controlRoot, name)).mtimeMs }; } catch { return null; } })
    .filter((entry) => entry !== null).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, COMMIT_CHECK_MAX_ROUNDS);
  const consumed = [];
  for (const { name } of recent) {
    try { if (readConsumedCandidateResult({ controlRoot, packetId: name })?.receipt) consumed.push(name); } catch { /* not consumed or unreadable: not a finished round */ }
  }
  if (consumed.length === 0) return lineageCheckAllow("no-consumed-round");
  let headRegistered = false, indexRegistered = false;
  for (const packetId of consumed) {
    if (lineageRowRegisteredAt(root, "HEAD:", featureId, packetId)) { headRegistered = true; continue; }
    if (lineageRowRegisteredAt(root, ":0:", featureId, packetId)) { indexRegistered = true; continue; }
    const probe = addCriticReviewLineage({ root, packetId, dryRun: true });
    if (probe.status !== "lineage-registrable" && probe.status !== "already-registered") continue;
    const written = probe.status === "already-registered";
    const manifestPath = `specs/${featureId}/lifecycle.json`;
    const commitPaths = [manifestPath, probe.lineagePath];
    const register = `node <plugin-root>/scripts/register-feature-package.mjs --root <root> --add-review-lineage --packet ${packetId}`;
    const repair = `${written
      ? `The lineage of this round is already written in the working tree but neither committed nor staged: commit ${commitPaths.join(" and ")} (git add -f -- ${commitPaths.join(" ")}), together with or before this change. Running ${register} again is safe (it reports already-registered).`
      : `Register the lineage NOW: ${register}; then commit the manifest and the lineage file it names (${commitPaths.join(" and ")}).`} `
      + "This must happen BEFORE any correction commit: once a correction commit exists, the lineage can no longer be registered and the takeover recovery is the only route (session-critic-finalizer.mjs inspect-course-takeover, then supersede-course-takeover, then rerun round 1 on the course path; section \"Continuing a Critic course\" of the critic-review skill).";
    return { schema: CRITIC_LINEAGE_COMMIT_CHECK_SCHEMA, decision: "refuse", code: CRITIC_LINEAGE_UNREGISTERED, packetId, reviewId: probe.reviewId ?? null, featureId, written, commitPaths,
      detail: `the finished Critic round of packet ${packetId} has no registered lineage at HEAD and this commit does not carry it`, repair };
  }
  return lineageCheckAllow(indexRegistered ? "registration-commit" : headRegistered ? "lineage-registered" : "not-registrable");
}
export function checkCriticLineageBeforeCommit({ root: rootInput } = {}) {
  try { return decideCriticLineageCommit(rootInput); } catch { return lineageCheckAllow("not-decidable"); }
}

/**
 * PF-94: builds, writes and registers the canonical delta request of the NEXT Critic round (`--add-delta-request <input.json>`).
 * The operator supplies only the judgment (the five keys of DELTA_INPUT_KEYS); every commit id is derived: the feature (the single
 * registered feature course), baseCommit = the candidate of the registered lineage tail, candidateCommit = the newest commit that
 * is not evidence-only, registrationCommit = HEAD. The request is compiled by prepareRegisteredCriticDeltaRequest, written as the
 * immutable `critic-delta-request-<sha>.json` and added to the manifest as non-authority candidate-evidence. Nothing is committed.
 */
const DELTA_INPUT_KEYS = ["changedBehaviorClaims", "pathInvariantMap", "coordinatorImpactConfirmed", "impactAmbiguous"];
const DELTA_INPUT_SHAPE = '{"changedBehaviorClaims":["<claim-id>"],"pathInvariantMap":{"<each changed path>":["<invariant-id>"]},"coordinatorImpactConfirmed":true,"impactAmbiguous":false}';
// PO decision 2026-11-17 (AC-108): trustBoundaryChanged left the diff rounds. An input file that still carries it (written by an older build) is accepted, the value is carried into
// the registered request unchanged and has no effect: it never makes a round full and never needs --confirm-full-round.
const LEGACY_DELTA_INPUT_KEY = "trustBoundaryChanged";
// The three fields (and the invariant lists) below are the Coordinator's judgment: no tool fills, defaults or infers them (PO decision D223).
const DELTA_JUDGMENT_FIELDS = ["changedBehaviorClaims", "coordinatorImpactConfirmed", "impactAmbiguous"];
/** Writes the path skeleton ({"pathInvariantMap": {"<changed path>": []}}) at the missing input path and refuses; wx: never overwrites. */
function writeDeltaInputSkeleton({ root, inputPath, baseCommit, candidate }) {
  const names = gitOut(root, ["diff", "--name-only", "-z", baseCommit, candidate, "--"]);
  if (names === null) return refused("FPR-DELTA-INPUT-PATH", `${inputPath} does not exist and the changed paths of ${baseCommit}..${candidate} could not be read`, { inputPath });
  const changedPaths = names.split("\0").filter(Boolean).sort();
  const target = join(root, inputPath);
  try {
    mkdirSync(dirname(target), { recursive: true });
    if (realpathSync(dirname(target)) !== join(realpathSync(root), dirname(inputPath))) return refused("FPR-DELTA-INPUT-PATH", `${inputPath} resolves through a link`, { inputPath });
    writeFileSync(target, `${JSON.stringify({ pathInvariantMap: Object.fromEntries(changedPaths.map((path) => [path, []])) }, null, 2)}\n`, { flag: "wx", mode: 0o644 });
  } catch (error) { return refused("FPR-DELTA-INPUT-PATH", `${inputPath} does not exist and the path skeleton could not be written there (${error?.code ?? "error"})`, { inputPath }); }
  return refused("FPR-DELTA-INPUT-PATH", `${inputPath} did not exist: a path skeleton was written there (the ${changedPaths.length} changed path(s) of ${baseCommit}..${candidate}, each with an empty invariant list). The Coordinator completes it: fill pathInvariantMap with the invariant ids of every path, and add ${DELTA_JUDGMENT_FIELDS.join(", ")} - these ${DELTA_JUDGMENT_FIELDS.length} fields stay a Coordinator judgment and are never filled, defaulted or inferred by a tool. Mind the cost: impactAmbiguous set to true makes the next round a FULL round over the whole feature range (the verb then asks for --confirm-full-round). ${FULL_ROUND_GUIDANCE} Then rerun this command with the same path`, { inputPath, skeletonWritten: true, changedPaths, coordinatorJudgment: DELTA_JUDGMENT_FIELDS });
}
/** The manifest core of a commit: the manifest minus its candidate-evidence artifacts (the transport check's own definition), as a canonical digest; null when unreadable. */
function manifestCoreSha256(root, commit, manifestPath) {
  const raw = gitOut(root, ["show", `${commit}:${manifestPath}`]);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!object(parsed) || Array.isArray(parsed)) return null;
    return sha256Canonical({ ...parsed, artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts.filter((entry) => entry?.class !== "candidate-evidence") : parsed.artifacts });
  } catch { return null; }
}
function manifestCoreUnchanged(root, parent, commit, manifestPath) {
  const before = manifestCoreSha256(root, parent, manifestPath), after = manifestCoreSha256(root, commit, manifestPath);
  return before !== null && after !== null && before === after;
}
/** When `true` is factually right, and when it is not (shown with the refusal, the skeleton and the help text). */
const FULL_ROUND_GUIDANCE = "impactAmbiguous is true only when the changed paths' effect cannot be told even after reading them. A large or risky-looking diff is neither: the diff round exists for it.";
export function addCriticDeltaRequest({ root: rootInput, inputPath, readAcceptedDeliveryContract, confirmFullRound = false, featureId: selector = null, state = null } = {}) {
  if (typeof inputPath !== "string" || inputPath === "") return refused("FPR-ARGS", "--add-delta-request needs the repository-relative path of the input file");
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { return refused("FPR-ARGS", "root does not resolve to a directory"); }
  const head = gitOut(root, ["rev-parse", "HEAD"]);
  if (!head) return refused("FPR-ARGS", "root is not a git repository with a HEAD");
  const shapeRepair = (why) => refused("FPR-DELTA-INPUT-SHAPE", `${why}; the input file holds exactly these keys and nothing else: ${DELTA_INPUT_KEYS.join(", ")}; expected shape: ${DELTA_INPUT_SHAPE}`, { inputPath, expectedShape: DELTA_INPUT_SHAPE });
  // The input file: a repository-relative regular file, no link on the way (the same refusals as the diagnostic file).
  const seen = repositoryRelative(inputPath) ? inspect(root, inputPath) : { kind: "invalid" };
  // D223 (slice 3): an input file that does not exist yet is not a dead end. The checks below that need no input run first (feature, lineage,
  // correction commit); then a PATH SKELETON is written at the expected path and the verb refuses. An existing file is never touched.
  const absent = seen.kind === "absent";
  if (seen.kind !== "file" && !absent) return refused("FPR-DELTA-INPUT-PATH", `${inputPath} is not a repository-relative path to a regular file; write the input file (${DELTA_INPUT_KEYS.join(", ")}) and pass its repository-relative path`, { inputPath });
  if (!absent) { try { if (realpathSync(join(root, inputPath)) !== join(root, inputPath)) return refused("FPR-DELTA-INPUT-PATH", `${inputPath} resolves through a link`, { inputPath }); } catch { return refused("FPR-DELTA-INPUT-PATH", `${inputPath} does not resolve`, { inputPath }); } }
  let input = null;
  if (!absent) {
    try { input = JSON.parse(seen.bytes.toString("utf8")); } catch { return shapeRepair("the input file is not JSON"); }
    if (!object(input) || Array.isArray(input)) return shapeRepair("the input file is not a JSON object");
    const keys = Object.keys(input), missing = DELTA_INPUT_KEYS.filter((key) => !keys.includes(key)), extra = keys.filter((key) => !DELTA_INPUT_KEYS.includes(key) && key !== LEGACY_DELTA_INPUT_KEY);
    if (missing.length || extra.length) return shapeRepair(`missing keys [${missing.join(", ")}], unexpected keys [${extra.join(", ")}]`);
    const stringsOk = (value) => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item !== "");
    if (!stringsOk(input.changedBehaviorClaims)) return shapeRepair("changedBehaviorClaims must be a non-empty array of strings");
    if (!object(input.pathInvariantMap) || Array.isArray(input.pathInvariantMap) || !Object.values(input.pathInvariantMap).every(stringsOk)) return shapeRepair("pathInvariantMap must map each changed path to a non-empty array of invariant ids");
    for (const key of ["coordinatorImpactConfirmed", "impactAmbiguous"]) if (typeof input[key] !== "boolean") return shapeRepair(`${key} must be true or false`);
    if (Object.hasOwn(input, LEGACY_DELTA_INPUT_KEY) && typeof input[LEGACY_DELTA_INPUT_KEY] !== "boolean") return shapeRepair(`${LEGACY_DELTA_INPUT_KEY} is no longer supplied; if it is present it must be true or false and it is ignored`);
    // C30d (PO report on Claude Code, 2026-11-16): `true` in impactAmbiguous turns the next round into a FULL round over the whole feature range (RE-DELTA-FALLBACK-FULL),
    // several times the size and cost of the diff round, and a registered value cannot be taken back. The consequence is therefore stated BEFORE anything is written, and the
    // verb registers it only on the Coordinator's explicit flag. No tool changes the judgment itself (D223).
    if (input.impactAmbiguous === true && confirmFullRound !== true) {
      const field = "impactAmbiguous";
      return refused("FPR-DELTA-FULL-ROUND-UNCONFIRMED", `${field} is true: registering it makes the next Critic round an effective FULL round (RE-DELTA-FALLBACK-FULL) over the whole feature range from the course genesis base, not the diff of this correction, and the registered value cannot be taken back. Nothing was written. ${FULL_ROUND_GUIDANCE} If the full round is meant, rerun the same command with --confirm-full-round; otherwise set ${field} to false in ${inputPath} and rerun.`, { inputPath, field, consequence: "full-round" });
    }
  }
  // The single registered feature course.
  let features = [];
  try { features = readdirSync(join(root, "specs")).filter((id) => SAFE_ID.test(id) && inspect(root, `specs/${id}/lifecycle.json`).kind === "file" && inspect(root, criticReviewUnitPath(id)).kind === "file"); } catch { features = []; }
  // C30J-J13: with several features that hold a review unit, the features the State records as discarded (the PO's recorded decision; a discarded feature takes no further review round) are
  // left out; the manifest relation `supersedes` alone never retires a feature. The selector decides when that does not leave exactly one, and it never names a discarded feature. The chosen
  // feature must still hold a registered lineage (FPR-DELTA-NO-LINEAGE below), so a selector never reaches a feature without a round.
  const reviewUnitFeatures = features, discarded = discardedFeatureIdsOfState(state);
  const delta = (id) => `register-feature-package.mjs --root <root> --add-delta-request <input.json> --feature ${id}`;
  if (selector !== null) {
    if (typeof selector !== "string" || !features.includes(selector)) return refused("FPR-DELTA-FEATURE-SELECTOR", `--feature ${JSON.stringify(selector)} is not a feature that has a Critic review unit (${features.join(", ") || "none"}); name one of them: ${delta("<feature id>")}`);
    if (discarded.includes(selector)) return refused("FPR-DELTA-FEATURE-DISCARDED", `--feature ${selector}: the State records ${selector} as discarded, and a discarded feature takes no further review round. Name its successor${features.length > 1 ? `: ${features.filter((id) => !discarded.includes(id)).map(delta).join(" | ") || delta("<successor feature id>")}` : ""}`);
    features = [selector];
  } else if (features.length > 1) {
    const active = features.filter((id) => !discarded.includes(id));
    if (active.length >= 1) features = active;
  }
  if (features.length !== 1) return refused("FPR-DELTA-FEATURE", features.length === 0 ? "no feature has a Critic review unit; there is no registered feature course" : `more than one feature has a review unit (${reviewUnitFeatures.join(", ")}) and leaving out the features the State records as discarded does not leave exactly one (a successor's supersedes alone is not enough, the State's discard record is the evidence); name the feature of this course: ${reviewUnitFeatures.map(delta).join(" | ")}`);
  const featureId = features[0], manifestPath = `specs/${featureId}/lifecycle.json`;
  const manifestRead = inspect(root, manifestPath);
  const checked = validateFeaturePackage(root, manifestPath);
  if (!checked.ok) return refused("FPR-MANIFEST-CONFLICT", withDigestRoute(root, manifestPath, "the manifest does not validate; it is never amended"), { manifestPath, findings: checked.findings });
  let manifest;
  try { manifest = JSON.parse(manifestRead.bytes.toString("utf8")); } catch { return refused("FPR-MANIFEST-CONFLICT", "the manifest is not JSON", { manifestPath }); }
  // The registered history tail: the lineage record with the highest round.
  let tail = null;
  for (const entry of manifest.artifacts) {
    if (entry.class !== "candidate-evidence" || !LINEAGE_FILE.test(entry.path)) continue;
    const present = inspect(root, entry.path);
    let record = null;
    try { record = present.kind === "file" ? JSON.parse(present.bytes.toString("utf8")) : null; } catch { record = null; }
    const round = record?.course?.reviewRound, commit = record?.candidate?.commit;
    if (Number.isInteger(round) && typeof commit === "string" && /^[a-f0-9]{40,64}$/u.test(commit) && (!tail || round > tail.round)) tail = { round, commit };
  }
  if (!tail) return refused("FPR-DELTA-NO-LINEAGE", "no Critic lineage is registered for this feature yet, so there is no round to follow up; register the finished round first: register-feature-package.mjs --root <root> --add-review-lineage --packet <packetId>, commit it, then rerun this command", { manifestPath });
  // candidateCommit = the newest commit of HEAD's first-parent line that is not evidence-only (changes beyond this feature's manifest and evidence directory). The compile re-checks the range with the course's own evidence-only test.
  const listed = gitOut(root, ["rev-list", "--first-parent", "--parents", "-n", "512", head]);
  let candidate = null;
  for (const line of (listed ?? "").split("\n").filter(Boolean)) {
    const [oid, ...parents] = line.split(/\s+/u);
    const names = parents.length === 1 ? gitOut(root, ["diff", "--name-only", "-z", parents[0], oid, "--"]) : null;
    const paths = names === null ? null : names.split("\0").filter(Boolean);
    // N38 (PO decision 2026-11-01): a commit that changes the manifest CORE (the manifest without its candidate-evidence artifacts, the same core the transport
    // check compares), for example a feature-package-reconcile commit, is not evidence-only: it becomes the candidate. An unreadable manifest on either side fails toward the candidate.
    if (paths && paths.length > 0 && paths.every((path) => path === manifestPath || path.startsWith(`specs/${featureId}/evidence/`))
      && (!paths.includes(manifestPath) || manifestCoreUnchanged(root, parents[0], oid, manifestPath))) continue;
    // AC-108 (PO decision 2026-11-04): a commit that changes only administration and documentation paths is no correction either, so the
    // correction candidate is the newest commit with content; the course transport passes these commits over as well.
    if (parents.length === 1 && administrationDocumentationOnlyCommit(root, oid, { featureIds: [featureId] })) continue;
    candidate = oid; break;
  }
  if (!candidate || candidate === tail.commit) return refused("FPR-DELTA-NO-CORRECTION", `no correction commit exists since the candidate of round ${tail.round} (${tail.commit}); make the correction commit first, produce and register its diagnostic evidence, then rerun this command`, { manifestPath, baseCommit: tail.commit });
  if (absent) return writeDeltaInputSkeleton({ root, inputPath, baseCommit: tail.commit, candidate });
  const courseRequest = { repoRoot: root, featureId, baseCommit: tail.commit, candidateCommit: candidate, registrationCommit: head, requestedMode: "delta", acceptedReference: null, criterionLocator: null };
  const compiled = prepareRegisteredCriticDeltaRequest({ courseRequest, changedBehaviorClaims: input.changedBehaviorClaims, pathInvariantMap: input.pathInvariantMap, coordinatorImpactConfirmed: input.coordinatorImpactConfirmed, ...(Object.hasOwn(input, LEGACY_DELTA_INPUT_KEY) ? { [LEGACY_DELTA_INPUT_KEY]: input[LEGACY_DELTA_INPUT_KEY] } : {}), impactAmbiguous: input.impactAmbiguous, deterministicEvidencePaths: null });
  if (!compiled.ok) {
    const code = String(compiled.code);
    const extra2 = { compileCode: code, manifestPath };
    if (code === "CCA-DETERMINISTIC-UNAVAILABLE") return refused("FPR-DELTA-NO-DIAGNOSTIC", `no registered diagnostic evidence is bound to the candidate ${candidate}; produce it with scripts/critic-diagnostic-evidence.mjs (--log and --out under specs/${featureId}/evidence/), register it WITHOUT committing first with register-feature-package.mjs --root <root> --add-diagnostic-evidence <path>, commit the artifact, its log and the manifest in ONE evidence-only commit, then rerun this command. The diagnostic can be produced only while HEAD is the candidate: an evidence-only commit made after the correction commit (for example the export or the lineage of the previous round) leaves HEAD behind it, so produce the diagnostic right after the correction commit, before any such commit; if one already follows, the refusal CDI-DIRTY-CANDIDATE of the producer names the way out`, extra2);
    if (code === "CCA-REVIEW-BUDGET-EXHAUSTED") return refused("FPR-DELTA-BUDGET", "the round budget or the correction-commit budget of the course is exhausted; no further Critic round can be requested without the PO gate", extra2);
    if (code === "CCA-CORRECTION-RANGE") return refused("FPR-DELTA-NO-CORRECTION", "no correction commit exists since the last round", extra2);
    if (code.startsWith("CCA-TRANSPORT")) return refused("FPR-DELTA-TRANSPORT", `HEAD must be reachable from the candidate through evidence-only commits only (registrations, or the tracked export of a consumed review; ${code}); commit only the registration paths between the correction and this command. This command chose the candidate ${candidate} (the newest first-parent commit that is not evidence-only by the candidate-choice test: it changes beyond the manifest and specs/${featureId}/evidence/), the base ${tail.commit} and HEAD ${head}. A commit between ${candidate} and HEAD that is neither a registration nor a change outside the manifest core breaks the transport (a commit that changes the manifest core, for example a feature-package-reconcile commit, is itself taken as the candidate)`, { ...extra2, candidateCommit: candidate, baseCommit: tail.commit, headCommit: head });
    if (COURSE_EVIDENCE_GAP_CODES.includes(code)) {
      const gap = locateCourseEvidenceGap({ repoRoot: root, featureId, commit: head });
      return refused("FPR-DELTA-COURSE-GAP", courseEvidenceGapText(code, gap), { ...extra2, ...(gap === null ? {} : { gapCommit: gap.commit, gapPath: gap.path }) });
    }
    return refused("FPR-DELTA-COMPILE", `the delta request does not compile (${code})`, extra2);
  }
  const { descriptor, artifact } = compiled.value;
  const given = Object.keys(input.pathInvariantMap).sort(), derived = [...descriptor.changedPaths].sort();
  if (given.length !== derived.length || given.some((path, index) => path !== derived[index])) return refused("FPR-DELTA-MAP", `pathInvariantMap must have exactly the changed paths of ${tail.commit}..${candidate} as keys; the derived changed paths are: ${derived.join(", ")}`, { changedPaths: derived, baseCommit: tail.commit, candidateCommit: candidate, inputPath });
  const preflight = { candidateCommit: candidate, baseCommit: tail.commit, deltaRequestPath: artifact.path, registrationCommit: "<the commit that contains commitPaths>", arguments: ["--root", "<root>", "--spec", manifest.artifacts.find((entry) => entry.class === "spec" && entry.authority === true)?.path ?? "<the feature spec path>", "--evidence", "<the registered diagnostic evidence path of the candidate>", "--base", tail.commit, "--candidate", candidate, "--registration-commit", "<the commit that contains commitPaths>", "--delta-request", artifact.path] };
  if (manifest.artifacts.some((entry) => entry.path === artifact.path && entry.sha256 === artifact.sha256)) return { schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "already-registered", manifestPath, deltaRequestPath: artifact.path, preflight };
  const target = join(root, artifact.path), created = !existsSync(target);
  const restore = () => { try { writeFileSync(join(root, manifestPath), manifestRead.bytes); } catch { /* reported by the readback */ } if (created) { try { unlinkSync(target); } catch { /* not created */ } } };
  const temp = join(root, `${manifestPath}.delta-${process.pid}.tmp`);
  try {
    mkdirSync(dirname(target), { recursive: true });
    if (created) writeFileSync(target, artifact.bytes, { flag: "wx", mode: 0o644 });
    const bytes = Buffer.from(`${JSON.stringify({ ...manifest, artifacts: [...manifest.artifacts, artifact.registration] }, null, 2)}\n`);
    writeFileSync(temp, bytes, { flag: "wx", mode: 0o644 }); renameSync(temp, join(root, manifestPath));
  } catch (error) { try { unlinkSync(temp); } catch { /* not created */ } restore(); return refused("FPR-WRITE-FAILED", `the delta request could not be registered (${error?.code ?? "error"}); the manifest was restored`, { manifestPath }); }
  const validated = validateFeaturePackage(root, manifestPath);
  if (!validated.ok) { restore(); return refused("FPR-VALIDATION-FAILED", "the topology validator refused the amended manifest; it was restored", { manifestPath, findings: validated.findings }); }
  const envelopes = manifest.artifacts.filter((entry) => entry.class === "candidate-evidence" && typeof readAcceptedDeliveryContract === "function");
  if (envelopes.length === 1) {
    const reread = readAcceptedDeliveryContract({ dir: root, envelopePath: envelopes[0].path });
    if (reread?.code === "CAC-REGISTRATION-INVALID" || reread?.code === "CAC-ENVELOPE-UNAVAILABLE") { restore(); return refused("FPR-REGISTRATION-NOT-RESOLVED", "the envelope reader refuses the amended manifest; it was restored", { manifestPath, readerCode: reread.code, ...(reread.detail ? { readerDetail: reread.detail } : {}) }); }
  }
  return {
    schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "delta-request-added", manifestPath, deltaRequestPath: artifact.path, round: tail.round + 1,
    registered: [{ path: artifact.path, sha256: artifact.sha256 }], manifestSha256: digest(readFileSync(join(root, manifestPath))), commitPaths: [manifestPath, artifact.path],
    commitMessageHint: `chore(evidence): register the Critic delta request of round ${tail.round + 1} of ${featureId}`,
    // D204: a request that is impact-ambiguous is admitted as an effective FULL round of the same course.
    nextRoundMode: input.impactAmbiguous === true ? "full" : "delta",
    nextRoundReason: input.impactAmbiguous === true ? "impact-ambiguous" : null,
    ...(input.impactAmbiguous === true ? { nextRoundNote: "the next round is an effective FULL round (RE-DELTA-FALLBACK-FULL): it reviews the whole feature range from the course genesis base, because a diff cannot honestly cover this change; run the preflight with --delta-request as usual" } : {}),
    preflight,
    next: "commit commitPaths in one evidence-only commit (never the input file), then run critic-dispatch-preflight.mjs with the preflight arguments, replacing the registration commit by that commit",
  };
}

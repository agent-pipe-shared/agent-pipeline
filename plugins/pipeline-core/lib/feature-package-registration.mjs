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
import { FEATURE_PACKAGE_SCHEMA, FEATURE_STATES, validateFeaturePackage } from "./feature-package-topology.mjs";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";
import { compileRegisteredCriticReviewLineage } from "./critic-review-lineage.mjs";
import { prepareRegisteredCriticDeltaRequest, resolveRegisteredCriticCourseIdentity } from "./critic-course-admission.mjs";
import { readConsumedCourseClaimBinding } from "./critic-verify-lifecycle.mjs";
import { readConsumedCandidateResult } from "../scripts/critic-packet-preflight.mjs";
import { sha256Canonical } from "./review-economy.mjs";
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

/** Pipeline-owned status record: implementation in progress, explicitly not acceptance. */
export function renderResultRecord({ featureId }) {
  return [
    `# Result record: ${featureId}`,
    "",
    "This file was generated by the Pipeline when the feature package was registered.",
    "",
    `- Feature: \`${featureId}\``,
    "- Status: implementation is in progress.",
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
const REVIEW_UNIT_CRITERION = new RegExp(`(?<![A-Za-z0-9-])${CRITERION_ID_SOURCE}(?![0-9-])`, "gu");
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
  const criterionIds = [...new Set(String(specBytes ?? "").match(REVIEW_UNIT_CRITERION) ?? [])].sort().slice(0, 128);
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

/** Sources the PO's approval binds, from the envelope that was itself re-derived from the retained approval. */
function approvalBoundSources(envelope) {
  const bound = new Map();
  const companions = envelope?.request?.binding?.sources?.companions;
  if (Array.isArray(companions)) for (const entry of companions) if (object(entry) && typeof entry.path === "string" && SHA256.test(entry.sha256 ?? "")) bound.set(entry.path, entry.sha256);
  return bound;
}

/**
 * @param {object} input
 * @param {string} input.root absolute repository root
 * @param {object} input.state the parsed project authority State (read by the caller through its own resolver)
 * @param {Function} input.readAcceptedDeliveryContract the existing envelope reader (`scripts/pipeline-state.mjs`)
 * @returns {object} `pipeline.feature-package-registration.v1`: status registered | already-registered | refused
 */
export function registerFeaturePackage({ root: rootInput, state, readAcceptedDeliveryContract } = {}) {
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
  if (existingRead.kind !== "absent") {
    if (observed?.code && !READER_BEFORE_REGISTRATION.includes(observed.code) || observed?.ok === true) {
      return { schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "already-registered", manifestPath, envelopePath, manifestSha256: digest(existing ?? Buffer.alloc(0)), readerCode: observed?.code ?? null };
    }
    const checked = existing ? validateFeaturePackage(root, manifestPath) : { ok: false, findings: ["FTP-MANIFEST: not a regular file"] };
    return refused("FPR-MANIFEST-CONFLICT", checked.ok
      ? "a valid manifest exists but does not register this envelope as candidate-evidence; it is never overwritten"
      : "a manifest exists but is invalid; it is never overwritten", { manifestPath, envelopePath, findings: checked.findings });
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
    entries.push({ class: "design", path: unitPath, bytes: unitSeen.bytes, generated: false, ...REVIEW_UNIT_ARTIFACT });
    reviewUnit = { status: "found", path: unitPath };
  } else {
    const rendered = renderCriticReviewUnit({ featureId, specPath, specBytes, mainRef: primaryMainRef(root) });
    if (rendered.ok) entries.push({ class: "design", path: unitPath, bytes: rendered.bytes, generated: true, ...REVIEW_UNIT_ARTIFACT });
    reviewUnit = rendered.ok ? { status: "generated", path: unitPath } : { status: "not-generated", path: unitPath, reason: rendered.reason };
  }

  const rigor = resolveRigor(state);
  if (!rigor) return refused("FPR-RIGOR-UNRESOLVED", "the State yields neither a submitted profile nor a retained rigor floor to map to a rigor level");

  const artifacts = entries.map((entry) => ({ class: entry.class, path: entry.path, sha256: digest(entry.bytes), authority: entry.authority, mutability: entry.mutability, retention: entry.retention }));
  artifacts.push({ class: "candidate-evidence", path: envelopePath, sha256: digest(envelopeBytes), authority: false, mutability: "immutable", retention: "retain" });
  const manifest = { schema: FEATURE_PACKAGE_SCHEMA, feature: { id: featureId, rigor: rigor.rigor }, state: lifecycle.status, artifacts, candidate: null, supersedes: null };
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);

  // 6. Exclusive creates only (never overwrite): the generated documents first, the manifest last. Any later failure undoes exactly what was created here.
  const created = [], createdDirectories = [];
  const rollback = () => {
    for (const path of created.reverse()) { try { unlinkSync(join(root, path)); } catch { /* a file this call just created */ } }
    for (const path of createdDirectories.reverse()) { try { rmdirSync(path); } catch { /* a directory this call just created */ } }
  };
  for (const [path, content] of [...entries.filter((entry) => entry.generated).map((entry) => [entry.path, entry.bytes]), [manifestPath, bytes]]) {
    try {
      const directory = dirname(join(root, path));
      if (!existsSync(directory)) { mkdirSync(directory, { mode: 0o755 }); createdDirectories.push(directory); }
      writeFileSync(join(root, path), content, { flag: "wx", mode: 0o644 }); created.push(path);
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
      design: "the Critic review unit: absent -> generated for the whole feature as one course, binding the Spec's AC-<n> ids (authority:false, immutable, retain); present -> registered as found; a Spec with no criterion id gets none (reviewUnit names why)",
      state: `${lifecycle.status} (the plan lifecycle status; the topology requires prd, spec, acceptance, result and candidate-evidence for it)`,
      rigor: `${rigor.rigor} (${rigor.source}: ${rigor.basis}; judgment call, no shipped source defines the profile-to-level mapping)`,
      prd: "authority:true, mutable, active (the approved bytes are already bound by the signed envelope; the topology fixes no mutability for this class)",
      spec: "authority:true, mutable, active (as prd)",
      acceptance: "absent -> generated pointer to the approved Spec (authority:false, immutable, active); present -> registered as found, never rewritten (authority:true only when the approval's companion binding names this path and digest)",
      result: "absent -> generated status record (authority:false, immutable, active); present -> registered as found, never rewritten, append-only (authority:true only when the approval's companion binding names this path and digest)",
      envelope: "candidate-evidence, authority:false, immutable, retain (fixed by the topology)",
      candidate: "null (only verifying/completed require a candidate binding)",
      supersedes: "null (no relationship; only superseded/retained require one)",
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
  if (!checked.ok) return refused("FPR-MANIFEST-CONFLICT", "the manifest does not validate; it is never amended", { manifestPath, findings: checked.findings });
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
    return refused("FPR-MANIFEST-CONFLICT", "the manifest does not validate; it is never amended", { manifestPath, findings: checked.findings });
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
 * PF-94: registers the lineage record of a CONSUMED course round (`--add-review-lineage --packet <id>`). Everything but the
 * packet id is derived from the repository: the feature (the single registered feature course), registrationCommit = HEAD,
 * the round candidate/base from the consumed packet, the parent from the registered history tail. The record is compiled by
 * compileRegisteredCriticReviewLineage, written as the immutable `critic-lineage-<sha>.json` and added to the manifest as
 * non-authority candidate-evidence. Nothing is committed.
 */
const LINEAGE_FILE = /^specs\/[a-z0-9-]+\/evidence\/critic-lineage-[a-f0-9]{64}\.json$/u;
const DELTA_REQUEST_FILE = /^specs\/[a-z0-9-]+\/evidence\/critic-delta-request-[a-f0-9]{64}\.json$/u;
export function addCriticReviewLineage({ root: rootInput, packetId, readAcceptedDeliveryContract } = {}) {
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
  if (features.length > 1) return refused("FPR-LINEAGE-FEATURE-AMBIGUOUS", `more than one feature has a review unit (${features.join(", ")}); the lineage verb needs exactly one registered feature course`, { packetId });
  const featureId = features[0], manifestPath = `specs/${featureId}/lifecycle.json`;
  const manifestRead = inspect(root, manifestPath);
  const checked = validateFeaturePackage(root, manifestPath);
  if (!checked.ok) return refused("FPR-MANIFEST-CONFLICT", "the manifest does not validate; it is never amended", { manifestPath, findings: checked.findings });
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
  if (!resolved.ok) return refused(String(resolved.code).startsWith("CCA-TRANSPORT") ? "FPR-LINEAGE-TRANSPORT" : "FPR-LINEAGE-COMPILE", `the course identity does not resolve (${resolved.code}); HEAD must be reachable from the round candidate through evidence-only commits only, so the lineage of round N must be registered BEFORE the next correction commit; if correction commits already follow this round the lineage cannot be registered any more; retire the unregistered round with session-critic-finalizer inspect-course-takeover then supersede-course-takeover (it retires only the rounds above the registered lineage) and rerun that round as a delta from the last registered round`,{ compileCode: resolved.code, packetId });
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
  let deltaRequestPath = null;
  if (history.length > 0) {
    for (const entry of manifest.artifacts) {
      if (entry.class !== "candidate-evidence" || !DELTA_REQUEST_FILE.test(entry.path)) continue;
      const present = inspect(root, entry.path);
      let record = null;
      try { record = present.kind === "file" ? JSON.parse(present.bytes.toString("utf8")) : null; } catch { record = null; }
      if (record?.schema === "pipeline.critic-delta-request.v1" && record.candidate?.commit === packet.candidate.commit && record.candidate?.base === packet.candidate.base) { deltaRequestPath = entry.path; break; }
    }
    if (deltaRequestPath === null) return refused("FPR-LINEAGE-COMPILE", `no delta request is registered for the round candidate ${packet.candidate.commit} (base ${packet.candidate.base}), so the lineage of round ${round} cannot compile (CCA-DELTA-REQUIRED); round 2 and later need the delta request first (register-feature-package.mjs --add-delta-request)`, { compileCode: "CCA-DELTA-REQUIRED", packetId });
  }
  const compiled = compileRegisteredCriticReviewLineage({
    courseRequest: { ...identityInput, requestedMode: history.length === 0 ? "full" : "delta", criterionLocator: null, deltaRequestPath },
    packetId, reviewId: `review-${round}`, parentReviewId: history.at(-1)?.record?.reviewId ?? null,
    packages: [{ id: "feature-package", subjectSha256: packet.diff.sha256, changedPaths: [...packet.diffPaths], integrationEdges: edges }],
    coverage: { changedPaths: [...packet.diffPaths], acceptanceIds: [...unit.criterionIds].sort(), integrationEdges: edges, complete: true, receiptSha256: sha256Canonical(consumed.receipt) },
    correction: round === 1 ? null : { commit: packet.candidate.commit, deltaSha256: packet.diff.sha256, impactSha256: sha256Canonical(edges) },
    invalidation: { kind: "none", reason: null, evidenceSha256: null },
  });
  // A generic batch (the old, course-less route) already owns this unit's work ids: the compile conflicts and the round has no course claim by construction.
  if (!compiled.ok && compiled.code === "CGB-CONFLICT") return refused("FPR-LINEAGE-NO-COURSE-CLAIM", noClaim, { packetId, compileCode: compiled.code });
  if (!compiled.ok) return refused(String(compiled.code).startsWith("CCA-TRANSPORT") ? "FPR-LINEAGE-TRANSPORT" : "FPR-LINEAGE-COMPILE", `the lineage does not compile (${compiled.code}); the lineage of round N must be registered before the next correction commit${compiled.code === "CCA-DELTA-REQUIRED" ? "; round 2 and later need the delta request first" : ""}; if correction commits already follow this round the lineage cannot be registered any more; retire the unregistered round with session-critic-finalizer inspect-course-takeover then supersede-course-takeover (it retires only the rounds above the registered lineage) and rerun that round as a delta from the last registered round`,{ compileCode: compiled.code, packetId });
  const artifact = compiled.value.artifact;
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
 * PF-94: builds, writes and registers the canonical delta request of the NEXT Critic round (`--add-delta-request <input.json>`).
 * The operator supplies only the judgment (the five keys of DELTA_INPUT_KEYS); every commit id is derived: the feature (the single
 * registered feature course), baseCommit = the candidate of the registered lineage tail, candidateCommit = the newest commit that
 * is not evidence-only, registrationCommit = HEAD. The request is compiled by prepareRegisteredCriticDeltaRequest, written as the
 * immutable `critic-delta-request-<sha>.json` and added to the manifest as non-authority candidate-evidence. Nothing is committed.
 */
const DELTA_INPUT_KEYS = ["changedBehaviorClaims", "pathInvariantMap", "coordinatorImpactConfirmed", "trustBoundaryChanged", "impactAmbiguous"];
const DELTA_INPUT_SHAPE = '{"changedBehaviorClaims":["<claim-id>"],"pathInvariantMap":{"<each changed path>":["<invariant-id>"]},"coordinatorImpactConfirmed":true,"trustBoundaryChanged":false,"impactAmbiguous":false}';
export function addCriticDeltaRequest({ root: rootInput, inputPath, readAcceptedDeliveryContract } = {}) {
  if (typeof inputPath !== "string" || inputPath === "") return refused("FPR-ARGS", "--add-delta-request needs the repository-relative path of the input file");
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { return refused("FPR-ARGS", "root does not resolve to a directory"); }
  const head = gitOut(root, ["rev-parse", "HEAD"]);
  if (!head) return refused("FPR-ARGS", "root is not a git repository with a HEAD");
  const shapeRepair = (why) => refused("FPR-DELTA-INPUT-SHAPE", `${why}; the input file holds exactly these keys and nothing else: ${DELTA_INPUT_KEYS.join(", ")}; expected shape: ${DELTA_INPUT_SHAPE}`, { inputPath, expectedShape: DELTA_INPUT_SHAPE });
  // The input file: a repository-relative regular file, no link on the way (the same refusals as the diagnostic file).
  const seen = repositoryRelative(inputPath) ? inspect(root, inputPath) : { kind: "invalid" };
  if (seen.kind !== "file") return refused("FPR-DELTA-INPUT-PATH", `${inputPath} is not a repository-relative path to a regular file; write the input file (${DELTA_INPUT_KEYS.join(", ")}) and pass its repository-relative path`, { inputPath });
  try { if (realpathSync(join(root, inputPath)) !== join(root, inputPath)) return refused("FPR-DELTA-INPUT-PATH", `${inputPath} resolves through a link`, { inputPath }); } catch { return refused("FPR-DELTA-INPUT-PATH", `${inputPath} does not resolve`, { inputPath }); }
  let input;
  try { input = JSON.parse(seen.bytes.toString("utf8")); } catch { return shapeRepair("the input file is not JSON"); }
  if (!object(input) || Array.isArray(input)) return shapeRepair("the input file is not a JSON object");
  const keys = Object.keys(input), missing = DELTA_INPUT_KEYS.filter((key) => !keys.includes(key)), extra = keys.filter((key) => !DELTA_INPUT_KEYS.includes(key));
  if (missing.length || extra.length) return shapeRepair(`missing keys [${missing.join(", ")}], unexpected keys [${extra.join(", ")}]`);
  const stringsOk = (value) => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item !== "");
  if (!stringsOk(input.changedBehaviorClaims)) return shapeRepair("changedBehaviorClaims must be a non-empty array of strings");
  if (!object(input.pathInvariantMap) || Array.isArray(input.pathInvariantMap) || !Object.values(input.pathInvariantMap).every(stringsOk)) return shapeRepair("pathInvariantMap must map each changed path to a non-empty array of invariant ids");
  for (const key of ["coordinatorImpactConfirmed", "trustBoundaryChanged", "impactAmbiguous"]) if (typeof input[key] !== "boolean") return shapeRepair(`${key} must be true or false`);
  // The single registered feature course.
  let features = [];
  try { features = readdirSync(join(root, "specs")).filter((id) => SAFE_ID.test(id) && inspect(root, `specs/${id}/lifecycle.json`).kind === "file" && inspect(root, criticReviewUnitPath(id)).kind === "file"); } catch { features = []; }
  if (features.length !== 1) return refused("FPR-DELTA-FEATURE", features.length === 0 ? "no feature has a Critic review unit; there is no registered feature course" : `more than one feature has a review unit (${features.join(", ")}); the delta verb needs exactly one registered feature course`);
  const featureId = features[0], manifestPath = `specs/${featureId}/lifecycle.json`;
  const manifestRead = inspect(root, manifestPath);
  const checked = validateFeaturePackage(root, manifestPath);
  if (!checked.ok) return refused("FPR-MANIFEST-CONFLICT", "the manifest does not validate; it is never amended", { manifestPath, findings: checked.findings });
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
    if (paths && paths.length > 0 && paths.every((path) => path === manifestPath || path.startsWith(`specs/${featureId}/evidence/`))) continue;
    candidate = oid; break;
  }
  if (!candidate || candidate === tail.commit) return refused("FPR-DELTA-NO-CORRECTION", `no correction commit exists since the candidate of round ${tail.round} (${tail.commit}); make the correction commit first, produce and register its diagnostic evidence, then rerun this command`, { manifestPath, baseCommit: tail.commit });
  const courseRequest = { repoRoot: root, featureId, baseCommit: tail.commit, candidateCommit: candidate, registrationCommit: head, requestedMode: "delta", acceptedReference: null, criterionLocator: null };
  const compiled = prepareRegisteredCriticDeltaRequest({ courseRequest, changedBehaviorClaims: input.changedBehaviorClaims, pathInvariantMap: input.pathInvariantMap, coordinatorImpactConfirmed: input.coordinatorImpactConfirmed, trustBoundaryChanged: input.trustBoundaryChanged, impactAmbiguous: input.impactAmbiguous, deterministicEvidencePaths: null });
  if (!compiled.ok) {
    const code = String(compiled.code);
    const extra2 = { compileCode: code, manifestPath };
    if (code === "CCA-DETERMINISTIC-UNAVAILABLE") return refused("FPR-DELTA-NO-DIAGNOSTIC", `no registered diagnostic evidence is bound to the candidate ${candidate}; produce it with scripts/critic-diagnostic-evidence.mjs (--log and --out under specs/${featureId}/evidence/), commit it, register it with register-feature-package.mjs --root <root> --add-diagnostic-evidence <path>, commit the manifest, then rerun this command`, extra2);
    if (code === "CCA-REVIEW-BUDGET-EXHAUSTED") return refused("FPR-DELTA-BUDGET", "the round budget or the correction-commit budget of the course is exhausted; no further Critic round can be requested without the PO gate", extra2);
    if (code === "CCA-CORRECTION-RANGE") return refused("FPR-DELTA-NO-CORRECTION", "no correction commit exists since the last round", extra2);
    if (code.startsWith("CCA-TRANSPORT")) return refused("FPR-DELTA-TRANSPORT", `HEAD must be reachable from the candidate through evidence-only commits only (${code}); commit only the registration paths between the correction and this command`, extra2);
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
    preflight,
    next: "commit commitPaths in one evidence-only commit (never the input file), then run critic-dispatch-preflight.mjs with the preflight arguments, replacing the registration commit by that commit",
  };
}

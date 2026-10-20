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
import { FEATURE_PACKAGE_SCHEMA, FEATURE_STATES, validateFeaturePackage } from "./feature-package-topology.mjs";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";

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
 * course, so its one logical work id is the feature; the criteria are the `AC-<n>` ids its Spec
 * names. A Spec that names none gets no unit, and the result says so.
 */
export const CRITIC_REVIEW_UNIT_SCHEMA = "pipeline.critic-review-unit.v1";
const REVIEW_UNIT_CRITERION = /\bAC-[0-9]{1,6}\b/gu;
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
  if (criterionIds.length === 0) return { ok: false, reason: `the Spec ${specPath} names no AC-<n> criterion id, which the review unit binds` };
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
    return refused("FPR-ENVELOPE-UNAVAILABLE", "the envelope bytes do not re-derive through the existing envelope reader", { envelopePath, readerCode: observed.code });
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
    return refused("FPR-REGISTRATION-NOT-RESOLVED", "the existing envelope reader still refuses the registration; everything this call created was removed", { manifestPath, readerCode: reread.code });
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
 * The course's genesis base is its first review's base (critic-course-admission.mjs), so the commit that adds the
 * unit is the earliest base a Critic review of this course can use; a course that already has a retained review
 * keeps its first base and cannot use the unit.
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
      return refused("FPR-REGISTRATION-NOT-RESOLVED", "the envelope reader refuses the amended manifest; it was restored", { manifestPath, readerCode: reread.code });
    }
  }
  return {
    schema: FEATURE_PACKAGE_REGISTRATION_SCHEMA, status: "review-unit-added", manifestPath, reviewUnitPath: unitPath,
    reviewUnit: { status: unitSeen.kind === "file" ? "found" : "generated", path: unitPath, sha256: digest(unitBytes) },
    manifestSha256: digest(bytes), commitPaths: [manifestPath, unitPath],
    next: "commit both paths in one commit. That commit is the earliest base a Critic review of this feature course can use: start the course's first review from it. A course that already has a retained review keeps its first base and cannot use this unit",
  };
}

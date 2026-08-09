// SPDX-License-Identifier: SUL-1.0
/** Transactional local activation for an already resolved organization policy. */
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalSha256, canonicalizeJson, parseStrictJson } from "./governance-event.mjs";
import { CLASSES, OrganizationPolicyError, resolveEffectiveOrganizationPolicy, TARGET_REF } from "./organization-policy.mjs";

const ACTIVE_PATH = "governance/organization-policy-active.json";
const SHA = /^[a-f0-9]{64}$/u;
const ACTIVATION_ID = /^[a-z0-9][a-z0-9-]{7,127}$/u;
// WP-P-AC03: the closed vocabulary describing how a document class's
// external-system targetBinding changed between the prior active policy and
// this transition's newly resolved one -- see computeExternalEffects.
const EXTERNAL_EFFECTS = new Set(["activated", "modified", "deactivated"]);
function fail(code, message = "Organization policy activation is invalid.") { const error = new OrganizationPolicyError(code); error.message = message; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function safeRoot(value) { if (typeof value !== "string") fail("OPA-ROOT"); return resolve(value); }
function activePath(root) { return join(root, ACTIVE_PATH); }
async function readActive(root) {
  try { const entry = await lstat(activePath(root)); if (!entry.isFile() || entry.isSymbolicLink()) fail("OPA-ACTIVE-PATH"); const bytes = await readFile(activePath(root)); return { bytes, digest: createHash("sha256").update(bytes).digest("hex"), value: parseStrictJson(bytes) }; }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}
// WP-P-AC03: index a documentClasses list (either the prior active policy's,
// or the newly resolved effectivePolicy's) by class name, restricted to
// entries scoped to one targetBinding.targetClass. Never throws on a
// malformed/absent list -- both preview computations below run this against
// prior state that may not exist yet (a fresh activation has no prior file).
function targetBindingsByClass(documentClasses, targetClass) {
  const bindings = new Map();
  for (const entry of Array.isArray(documentClasses) ? documentClasses : []) {
    if (entry?.targetBinding?.targetClass === targetClass) bindings.set(entry.class, { targetRef: entry.targetBinding.targetRef, mode: entry.mode, approvalRequired: entry.approvalRequired });
  }
  return bindings;
}
// WP-P-AC03 (newlyRequiredArtifacts): a document class's artifact binding
// counts as "newly required" only when this transition introduces it or
// changes which artifact it points at -- an unchanged artifact binding is
// not newly required BY THIS transition, so it is deliberately excluded.
function computeNewlyRequiredArtifacts(priorDocumentClasses, effectiveDocumentClasses) {
  const prior = targetBindingsByClass(priorDocumentClasses, "artifact"); const next = targetBindingsByClass(effectiveDocumentClasses, "artifact");
  const result = []; for (const [className, binding] of next) { const priorBinding = prior.get(className); if (!priorBinding || priorBinding.targetRef !== binding.targetRef) result.push({ class: className, targetRef: binding.targetRef }); }
  return Object.freeze(result.sort((left, right) => left.class.localeCompare(right.class)).map((entry) => Object.freeze(entry)));
}
// WP-P-AC03 (externalEffects): every external-system-bound document class
// that differs between prior and next state, classified as activated (newly
// bound), modified (targetRef/mode/approval changed), or deactivated (the
// binding was removed). An unchanged binding produces no entry -- most
// transitions touch no external system at all, so this is often [].
function computeExternalEffects(priorDocumentClasses, effectiveDocumentClasses) {
  const prior = targetBindingsByClass(priorDocumentClasses, "external-system"); const next = targetBindingsByClass(effectiveDocumentClasses, "external-system");
  const classes = new Set([...prior.keys(), ...next.keys()]); const result = [];
  for (const className of classes) {
    const priorBinding = prior.get(className); const nextBinding = next.get(className);
    if (priorBinding && nextBinding) { if (priorBinding.targetRef !== nextBinding.targetRef || priorBinding.mode !== nextBinding.mode || priorBinding.approvalRequired !== nextBinding.approvalRequired) result.push({ class: className, targetRef: nextBinding.targetRef, effect: "modified" }); }
    else if (nextBinding) result.push({ class: className, targetRef: nextBinding.targetRef, effect: "activated" });
    else result.push({ class: className, targetRef: priorBinding.targetRef, effect: "deactivated" });
  }
  return Object.freeze(result.sort((left, right) => left.class.localeCompare(right.class)).map((entry) => Object.freeze(entry)));
}
// WP-P-AC03 (backfillRange): a document class entering controlled-publication
// mode for the first time (it was some other mode, or absent, before this
// transition) is the one case this schema currently carries that implies
// historical data now needs review/backfill under that stricter publication
// boundary. fromEpochMs anchors the range at the prior activation's own
// recorded timestamp (null when there was no prior activation) -- never a
// caller-supplied value. null (not-applicable) is the common case.
function computeBackfillRange(priorDocumentClasses, effectiveDocumentClasses, priorActivatedAtEpochMs) {
  const priorModes = new Map((Array.isArray(priorDocumentClasses) ? priorDocumentClasses : []).map((entry) => [entry.class, entry.mode]));
  const classes = (Array.isArray(effectiveDocumentClasses) ? effectiveDocumentClasses : []).filter((entry) => entry.mode === "controlled-publication" && priorModes.get(entry.class) !== "controlled-publication").map((entry) => entry.class).sort();
  if (classes.length === 0) return null;
  return Object.freeze({ classes: Object.freeze(classes), fromEpochMs: Number.isSafeInteger(priorActivatedAtEpochMs) ? priorActivatedAtEpochMs : null });
}
function validPreviewArtifact(entry) { return exact(entry, ["class", "targetRef"]) && CLASSES.has(entry.class) && TARGET_REF.test(entry.targetRef); }
function validExternalEffect(entry) { return exact(entry, ["class", "targetRef", "effect"]) && CLASSES.has(entry.class) && TARGET_REF.test(entry.targetRef) && EXTERNAL_EFFECTS.has(entry.effect); }
function validBackfillRange(value) { return value === null || (exact(value, ["classes", "fromEpochMs"]) && Array.isArray(value.classes) && value.classes.length > 0 && value.classes.length <= 32 && value.classes.every((className, index) => CLASSES.has(className) && (index === 0 || value.classes[index - 1] < className)) && (value.fromEpochMs === null || (Number.isSafeInteger(value.fromEpochMs) && value.fromEpochMs >= 0))); }
function assertPlan(plan) {
  if (!exact(plan, ["schema", "status", "activationId", "activePath", "expectedActiveSha256", "effectivePolicy", "effectivePolicySha256", "newlyRequiredArtifacts", "externalEffects", "backfillRange"]) || plan.schema !== "pipeline.organization-policy-activation-plan.v1" || plan.status !== "preview" || !ACTIVATION_ID.test(plan.activationId) || plan.activePath !== ACTIVE_PATH || !(plan.expectedActiveSha256 === null || SHA.test(plan.expectedActiveSha256)) || !SHA.test(plan.effectivePolicySha256) || canonicalSha256(plan.effectivePolicy) !== plan.effectivePolicySha256) fail("OPA-PLAN");
  // WP-P-AC03: these three preview fields are re-validated the same way the
  // rest of the plan is -- assertPlan is the trust boundary a caller-supplied
  // plan crosses before activateOrganizationPolicy persists anything, so a
  // hand-tampered preview (not one this module itself computed) must fail
  // closed here exactly like a tampered effectivePolicy already does above.
  if (!Array.isArray(plan.newlyRequiredArtifacts) || plan.newlyRequiredArtifacts.length > 64 || !plan.newlyRequiredArtifacts.every(validPreviewArtifact) || !Array.isArray(plan.externalEffects) || plan.externalEffects.length > 64 || !plan.externalEffects.every(validExternalEffect) || !validBackfillRange(plan.backfillRange)) fail("OPA-PREVIEW");
}
function assertAuthority(value, plan) {
  if (!exact(value, ["granted", "decisionId", "activationId", "effectivePolicySha256"]) || value.granted !== true || typeof value.decisionId !== "string" || !ACTIVATION_ID.test(value.activationId) || value.activationId !== plan.activationId || value.effectivePolicySha256 !== plan.effectivePolicySha256) fail("OPA-AUTHORITY");
  // Cyborg integration point: the caller-supplied resolver must additionally
  // bind a Cyborg-verified human-attestation receipt before returning granted.
  // This module never treats this local record or a Git commit as human proof.
}

/** Produce a deterministic write plan; it performs no mutation or authorization. */
export async function planOrganizationPolicyActivation({ repositoryRoot, coreVersion, packs, activationId = randomUUID() } = {}) {
  const root = safeRoot(repositoryRoot); if (!ACTIVATION_ID.test(activationId)) fail("OPA-ACTIVATION-ID");
  const effectivePolicy = resolveEffectiveOrganizationPolicy({ coreVersion, packs }); const active = await readActive(root);
  const priorDocumentClasses = active?.value?.effectivePolicy?.documentClasses;
  return Object.freeze({
    schema: "pipeline.organization-policy-activation-plan.v1", status: "preview", activationId, activePath: ACTIVE_PATH,
    expectedActiveSha256: active?.digest ?? null, effectivePolicy, effectivePolicySha256: canonicalSha256(effectivePolicy),
    newlyRequiredArtifacts: computeNewlyRequiredArtifacts(priorDocumentClasses, effectivePolicy.documentClasses),
    externalEffects: computeExternalEffects(priorDocumentClasses, effectivePolicy.documentClasses),
    backfillRange: computeBackfillRange(priorDocumentClasses, effectivePolicy.documentClasses, active?.value?.activatedAtEpochMs),
  });
}

/**
 * Apply exactly one plan after a trusted governance-authority resolver grants
 * this exact activation. A compare-and-swap preimage prevents lost updates.
 */
export async function activateOrganizationPolicy({ repositoryRoot, plan, authorize, nowEpochMs } = {}) {
  const root = safeRoot(repositoryRoot); assertPlan(plan); if (typeof authorize !== "function" || !Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) fail("OPA-REQUEST");
  const current = await readActive(root); if ((current?.digest ?? null) !== plan.expectedActiveSha256) fail("OPA-PREIMAGE");
  const authority = await authorize(Object.freeze({ activationId: plan.activationId, effectivePolicySha256: plan.effectivePolicySha256 })); assertAuthority(authority, plan);
  const record = Object.freeze({ schema: "pipeline.organization-policy-active.v1", activationId: plan.activationId, humanDecisionId: authority.decisionId, activatedAtEpochMs: nowEpochMs, effectivePolicy: plan.effectivePolicy, effectivePolicySha256: plan.effectivePolicySha256 });
  const bytes = `${canonicalizeJson(record)}\n`; const target = activePath(root); await mkdir(dirname(target), { recursive: true });
  const existing = await readActive(root); if ((existing?.digest ?? null) !== plan.expectedActiveSha256) fail("OPA-PREIMAGE");
  const temporary = join(dirname(target), `.organization-policy-${plan.activationId}.tmp`); await writeFile(temporary, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 }); await rename(temporary, target);
  const readback = await readActive(root); if (!readback || readback.value.effectivePolicySha256 !== plan.effectivePolicySha256 || readback.value.humanDecisionId !== authority.decisionId) fail("OPA-READBACK");
  return Object.freeze({ schema: "pipeline.organization-policy-activation-receipt.v1", status: "activated", activePath: ACTIVE_PATH, activeSha256: readback.digest, activationId: plan.activationId, effectivePolicySha256: plan.effectivePolicySha256, humanDecisionId: authority.decisionId });
}

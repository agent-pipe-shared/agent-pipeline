// SPDX-License-Identifier: SUL-1.0
/** Transactional local activation for an already resolved organization policy. */
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalSha256, canonicalizeJson, parseStrictJson } from "./governance-event.mjs";
import { OrganizationPolicyError, resolveEffectiveOrganizationPolicy } from "./organization-policy.mjs";

const ACTIVE_PATH = "governance/organization-policy-active.json";
const SHA = /^[a-f0-9]{64}$/u;
const ACTIVATION_ID = /^[a-z0-9][a-z0-9-]{7,127}$/u;
function fail(code, message = "Organization policy activation is invalid.") { const error = new OrganizationPolicyError(code); error.message = message; throw error; }
function exact(value, keys) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function safeRoot(value) { if (typeof value !== "string") fail("OPA-ROOT"); return resolve(value); }
function activePath(root) { return join(root, ACTIVE_PATH); }
async function readActive(root) {
  try { const entry = await lstat(activePath(root)); if (!entry.isFile() || entry.isSymbolicLink()) fail("OPA-ACTIVE-PATH"); const bytes = await readFile(activePath(root)); return { bytes, digest: createHash("sha256").update(bytes).digest("hex"), value: parseStrictJson(bytes) }; }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}
function assertPlan(plan) {
  if (!exact(plan, ["schema", "status", "activationId", "activePath", "expectedActiveSha256", "effectivePolicy", "effectivePolicySha256"]) || plan.schema !== "pipeline.organization-policy-activation-plan.v1" || plan.status !== "preview" || !ACTIVATION_ID.test(plan.activationId) || plan.activePath !== ACTIVE_PATH || !(plan.expectedActiveSha256 === null || SHA.test(plan.expectedActiveSha256)) || !SHA.test(plan.effectivePolicySha256) || canonicalSha256(plan.effectivePolicy) !== plan.effectivePolicySha256) fail("OPA-PLAN");
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
  return Object.freeze({ schema: "pipeline.organization-policy-activation-plan.v1", status: "preview", activationId, activePath: ACTIVE_PATH, expectedActiveSha256: active?.digest ?? null, effectivePolicy, effectivePolicySha256: canonicalSha256(effectivePolicy) });
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

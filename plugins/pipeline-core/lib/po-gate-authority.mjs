// SPDX-License-Identifier: SUL-1.0

/**
 * Repository-scoped PO-language and single-PRD authority.
 *
 * The module is deliberately read-only. Setup owns receipt publication and the
 * state writer owns approval mutation; this module only constructs/serializes a
 * closed local receipt and validates an observed filesystem snapshot.
 */
import { withOriginDeviceValues } from "./plan-approval-device-rebind.mjs";
import { PO_GATE_PROFILE_RECEIPT_SCHEMA, SHA256, PROFILE_REPAIR, sha256, fail, isCanonicalIso, normalizeAbsolute, configuredLanguage, resolvePoGateRepositoryTopology, deviceRebindFor, validatePoGateProfileSnapshot, validatePoGateAuthority } from "./po-gate-authority-read.mjs";
export { PO_GATE_PROFILE_RECEIPT_SCHEMA, PO_GATE_AUTHORITY_EVIDENCE_SCHEMA, PO_GATE_AUTHORITY_EVIDENCE_V2_SCHEMA, PO_GATE_PROFILE_RECEIPT_RELATIVE_PATH, PO_GATE_PRD_LANGUAGE_MARKER, PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER, PRD_LANGUAGE_MARKER, TECHNICAL_SPEC_MARKER, PRD_ACKNOWLEDGEMENT_MARKER, normalizeRepositoryPath, canonicalRepositoryPathIdentity, derivePoGateRepositoryFingerprint, derivePoGateRepositoryFingerprintLegacy, poGateReceiptFingerprintMatches, poGateProfileReceiptPath, validatePoGateProfileReceipt, serializePoGateProfileReceipt, parseGitWorktreeList, selectPrimaryWorktree, isSuccessfulGitEpermObservation, resolvePoGateRepositoryTopology, PO_GATE_ENVIRONMENT_UNAVAILABLE_CODE, validatePoGateAuthorityForRepository, poGateProfileProjectionPaths, validatePoGateAuthority } from "./po-gate-authority-read.mjs";


/**
 * Validate only the PO-facing language pair. Runner schema, routing and profile
 * migration deliberately remain outside this narrow repository authority.
 */
export function validatePoGateLanguageProjection(sourceBytes, runtimeBytes) {
  const humanFacing = configuredLanguage(sourceBytes, runtimeBytes);
  return humanFacing === null
    ? fail(
      "PO-PROFILE-PROJECTION-INVALID",
      "The canonical primary source/runtime PO-language projection is missing, unsupported or inconsistent.",
      PROFILE_REPAIR,
    )
    : { ok: true, code: "PO-PROFILE-PROJECTION-VALID", humanFacing };
}

/** Build the closed machine-local receipt after setup has validated its inputs. */
export function createPoGateProfileReceipt({
  repositoryFingerprint,
  primaryRoot,
  sourceBytes,
  runtimeBytes,
  updatedAt,
}) {
  const canonicalPrimaryRoot = normalizeAbsolute(primaryRoot);
  const projection = validatePoGateLanguageProjection(sourceBytes, runtimeBytes);
  const humanFacing = projection.ok ? projection.humanFacing : null;
  if (!SHA256.test(repositoryFingerprint) || canonicalPrimaryRoot === null || humanFacing === null || !isCanonicalIso(updatedAt)) {
    throw new TypeError("invalid PO-gate profile receipt input");
  }
  return {
    schema: PO_GATE_PROFILE_RECEIPT_SCHEMA,
    repositoryFingerprint,
    canonicalPrimaryRoot,
    sourceSha256: sha256(sourceBytes),
    runtimeSha256: sha256(runtimeBytes),
    humanFacing,
    updatedAt,
  };
}

/**
 * Validate only the machine-local PO profile receipt and its canonical primary
 * source/runtime projection. Feature state, PRDs and approval state are
 * deliberately outside this readback boundary, with one exception: when a
 * device-local rebind receipt (R7-5, lib/plan-approval-device-rebind.mjs) binds
 * the current plan approval to this clone, the two device-local fields are
 * reported with the approval's origin values, exactly as the full authority is.
 */
export function validatePoGateProfileForRepository({ repoRoot } = {}, deps = {}) {
  let topology;
  try {
    topology = deps.topology ?? resolvePoGateRepositoryTopology(repoRoot, deps);
  } catch {
    return fail("PO-PROFILE-AUTHORITY-UNAVAILABLE", "Repository topology or profile inputs are unavailable.", PROFILE_REPAIR);
  }
  let profile;
  try {
    profile = validatePoGateProfileSnapshot(topology);
  } catch {
    return fail("PO-PROFILE-AUTHORITY-UNAVAILABLE", "Repository topology or profile inputs are unavailable.", PROFILE_REPAIR);
  }
  if (!profile.ok) return profile;
  if (deps.deviceRebind !== false) {
    const full = validatePoGateAuthority({ ...topology, deviceRebind: false });
    const rebind = full.ok ? deviceRebindFor(profile.current, topology.gitCommonDir, full.value) : null;
    if (rebind) return { ok: true, code: "PO-PROFILE-AUTHORITY-VALID", value: withOriginDeviceValues(profile.value, rebind) };
  }
  return { ok: true, code: "PO-PROFILE-AUTHORITY-VALID", value: profile.value };
}

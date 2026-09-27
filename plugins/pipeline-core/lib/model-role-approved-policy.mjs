// SPDX-License-Identifier: SUL-1.0
/** Signed, version-stable exact-model approval; a later ordinary commit does not revoke it. */
import { createHash } from "node:crypto";
import { constants, lstatSync, openSync, readFileSync, closeSync, fstatSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parseStrictJson } from "./governance-event.mjs";
import { createPoApprovalIntent, canonical } from "./po-approval-proof.mjs";
import { readCriticalHumanProofPolicy, verifyAgainstTrustAnchors } from "./critical-human-proof-policy.mjs";
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { resolveModelRoleSession } from "./model-role-session.mjs";

export const MODEL_ROLE_POLICY_PATH = "project/model-role-approved-policy.v1.json";
const OID = /^[a-f0-9]{40}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const MAX_BYTES = 128 * 1024;
const fail = (code) => ({ ok: false, code });
const hash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const routeKey = (route) => `${route.runner}:${route.role}:${route.effort}`;
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

/** Bind both the active slots and each task-to-role mapping, not model names. */
export function modelRoleRouteSourceSha256(routeSource = registeredFunctionalTaskRoutes()) {
  if (!routeSource?.ok || !Array.isArray(routeSource.configuredRoutes)
    || !Array.isArray(routeSource.taskRoutes)) return null;
  return hash({ taskRoutes: routeSource.taskRoutes, configuredRoutes: routeSource.configuredRoutes });
}

export function createModelRolePolicyApprovalIntent({ routeSource, approvedPolicies,
  candidateAtApproval } = {}) {
  const sourceSha256 = modelRoleRouteSourceSha256(routeSource);
  if (!sourceSha256 || !Array.isArray(approvedPolicies)
    || !exact(candidateAtApproval, ["commit", "tree"])
    || !OID.test(candidateAtApproval.commit) || !OID.test(candidateAtApproval.tree)) {
    throw new TypeError("model-role policy approval subject is invalid");
  }
  const policySha256 = hash(approvedPolicies);
  return createPoApprovalIntent({ kind: "model-role-policy", featureId: "model-role-routes",
    planSha256: sourceSha256, specSha256: policySha256,
    candidate: candidateAtApproval, policyRevision: "model-roles-v1",
    subjectSha256: policySha256, decision: "approved" });
}

/** No current-HEAD comparison: a verified approval persists until superseded. */
export function verifyModelRoleApprovedPolicy({ bundle, routeSource = registeredFunctionalTaskRoutes(),
  trustAnchors, requiredRunner = null } = {}) {
  if (!exact(bundle, ["schema", "candidateAtApproval", "approvedPolicies", "approvalIntent", "proof"])
    || bundle.schema !== "pipeline.model-role-approved-policy.v1"
    || !Array.isArray(trustAnchors) || trustAnchors.length === 0
    || !routeSource?.ok || !Array.isArray(routeSource.configuredRoutes)
    || (requiredRunner !== null && !["codex", "claude", "antigravity"].includes(requiredRunner))
    || !Array.isArray(bundle.approvedPolicies)
    || bundle.approvedPolicies.length < 1
    || bundle.approvedPolicies.length > routeSource.configuredRoutes.length) {
    return fail("MODEL-ROLE-POLICY-SHAPE");
  }
  const requiredRoutes = requiredRunner === null ? routeSource.configuredRoutes
    : routeSource.configuredRoutes.filter((route) => route.runner === requiredRunner);
  if (requiredRoutes.length === 0) return fail("MODEL-ROLE-POLICY-ROUTES");
  const sourceKeys = new Set(routeSource.configuredRoutes.map(routeKey));
  const byKey = new Map();
  const policyByRole = new Map();
  for (const entry of bundle.approvedPolicies) {
    if (!exact(entry, ["runner", "role", "effort", "policy"]) || byKey.has(routeKey(entry))
      || !sourceKeys.has(routeKey(entry))) {
      return fail("MODEL-ROLE-POLICY-ROUTES");
    }
    const checked = resolveModelRoleSession({ runner: entry.runner, role: entry.role,
      effort: entry.effort, sessionId: "policy-check", candidateCommit: bundle.candidateAtApproval?.commit,
      observedAt: "2026-01-01T00:00:00.000Z", policy: entry.policy,
      availableModelIds: Array.isArray(entry.policy?.approved)
        ? entry.policy.approved.map((model) => model?.modelId) : [] });
    if (!checked.ok) return fail("MODEL-ROLE-POLICY-ENTRY");
    const roleKey = `${entry.runner}:${entry.role}`;
    const digest = hash(entry.policy);
    if (policyByRole.has(roleKey) && policyByRole.get(roleKey) !== digest) {
      return fail("MODEL-ROLE-POLICY-INCONSISTENT-ROLE");
    }
    policyByRole.set(roleKey, digest);
    byKey.set(routeKey(entry), entry);
  }
  if (requiredRoutes.some((route) => !byKey.has(routeKey(route)))) {
    return fail("MODEL-ROLE-POLICY-ROUTES");
  }
  let expected;
  try { expected = createModelRolePolicyApprovalIntent({ routeSource,
    approvedPolicies: bundle.approvedPolicies, candidateAtApproval: bundle.candidateAtApproval }); }
  catch { return fail("MODEL-ROLE-POLICY-INTENT"); }
  if (!exact(bundle.approvalIntent, ["value", "sha256"])
    || bundle.approvalIntent.sha256 !== expected.sha256
    || canonical(bundle.approvalIntent.value) !== canonical(expected.value)) {
    return fail("MODEL-ROLE-POLICY-INTENT");
  }
  const checked = verifyAgainstTrustAnchors({ intent: expected, anchors: trustAnchors, proof: bundle.proof });
  return checked.verified
    ? { ok: true, code: "MODEL-ROLE-POLICY-VERIFIED", approvedPolicies: structuredClone(bundle.approvedPolicies),
      sourceSha256: modelRoleRouteSourceSha256(routeSource), approvalSha256: expected.sha256,
      bundle: structuredClone(bundle) }
    : fail("MODEL-ROLE-POLICY-PROOF");
}

/** Host-only reader: absent/unsafe/unsigned policy never becomes an approval. */
export function readModelRoleApprovedPolicy({ rootDir, routeSource = registeredFunctionalTaskRoutes(),
  requiredRunner = null } = {}) {
  if (typeof rootDir !== "string" || !isAbsolute(rootDir)) return fail("MODEL-ROLE-POLICY-ROOT");
  const trust = readCriticalHumanProofPolicy(rootDir);
  const anchors = trust?.trustAnchors ?? (trust?.trustAnchor ? [trust.trustAnchor] : []);
  if (!trust?.ok || anchors.length === 0) return fail("MODEL-ROLE-POLICY-TRUST-UNAVAILABLE");
  let fd;
  try {
    if (realpathSync(rootDir) !== rootDir) return fail("MODEL-ROLE-POLICY-ROOT");
    const projectDir = join(rootDir, "project");
    const parent = lstatSync(projectDir);
    if (!parent.isDirectory() || parent.isSymbolicLink() || realpathSync(projectDir) !== projectDir) {
      return fail("MODEL-ROLE-POLICY-FILE-UNSAFE");
    }
    const path = join(rootDir, MODEL_ROLE_POLICY_PATH);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_BYTES) {
      return fail("MODEL-ROLE-POLICY-FILE-UNSAFE");
    }
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const pinned = fstatSync(fd);
    if (pinned.dev !== stat.dev || pinned.ino !== stat.ino || pinned.size !== stat.size) {
      return fail("MODEL-ROLE-POLICY-FILE-UNSAFE");
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    const named = lstatSync(path);
    if (bytes.length !== stat.size || after.dev !== pinned.dev || after.ino !== pinned.ino
      || after.size !== pinned.size || after.mtimeMs !== pinned.mtimeMs
      || named.dev !== pinned.dev || named.ino !== pinned.ino || named.isSymbolicLink()) {
      return fail("MODEL-ROLE-POLICY-FILE-UNSAFE");
    }
    return verifyModelRoleApprovedPolicy({ bundle: parseStrictJson(bytes), routeSource,
      trustAnchors: anchors, requiredRunner });
  } catch { return fail("MODEL-ROLE-POLICY-UNAVAILABLE"); }
  finally { if (fd !== undefined) closeSync(fd); }
}

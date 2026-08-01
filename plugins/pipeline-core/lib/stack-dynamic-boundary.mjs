// SPDX-License-Identifier: SUL-1.0
/** CYB-6 dynamic/fuzz harness admission boundary; pure and provider-neutral. */
import { createHash } from "node:crypto";

import { verifyPoApprovalProof } from "./po-approval-proof.mjs";

const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const oid = (value) => /^[a-f0-9]{40,64}$/u.test(value ?? "");
const safe = (value) => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/u.test(value);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const nonProduction = new Set(["development", "test", "staging"]);

function candidate(value) {
  return own(value, ["commit", "tree"]) && oid(value.commit) && oid(value.tree) && value.commit !== value.tree;
}
function scope(value) {
  return own(value, ["id", "paths"])
    && safe(value.id) && Array.isArray(value.paths) && value.paths.length > 0
    && new Set(value.paths).size === value.paths.length
    && value.paths.every((path) => typeof path === "string" && /^[a-zA-Z0-9._/-]+$/u.test(path)
      && !path.startsWith("/") && !path.split("/").includes(".."));
}
function target(value) {
  return own(value, ["id", "environment", "bindingSha256"])
    && safe(value.id) && nonProduction.has(value.environment)
    && /^[a-f0-9]{64}$/u.test(value.bindingSha256)
    && !/(?:prod|production|live)/iu.test(value.id);
}
function execution(value) {
  return own(value, ["network", "credential", "timeoutMs"])
    && value.network === "offline" && value.credential === "none"
    && Number.isInteger(value.timeoutMs) && value.timeoutMs >= 1 && value.timeoutMs <= 60000;
}
function validIntent(value) {
  return own(value, ["value", "sha256"])
    && /^[a-f0-9]{64}$/u.test(value.sha256)
    && own(value.value, ["schema", "candidate", "targetSha256", "scopeSha256", "execution"])
    && value.value.schema === "pipeline.dynamic-target-approval-intent.v1"
    && candidate(value.value.candidate) && /^[a-f0-9]{64}$/u.test(value.value.targetSha256)
    && /^[a-f0-9]{64}$/u.test(value.value.scopeSha256) && execution(value.value.execution)
    && value.sha256 === sha(canonical(value.value));
}

/**
 * Creates a candidate-, target- and scope-bound intent.  It is deliberately
 * not an authorization: a human-controlled external authority must sign its
 * digest before a dynamic run can proceed.
 */
export function createDynamicTargetAuthorization(input) {
  if (!own(input, ["candidate", "target", "scope", "execution"])
    || !candidate(input.candidate) || !target(input.target) || !scope(input.scope) || !execution(input.execution)) {
    return { ok: false, code: "DYNAMIC-BOUNDARY-INVALID" };
  }
  const value = {
    schema: "pipeline.dynamic-target-approval-intent.v1",
    candidate: structuredClone(input.candidate),
    targetSha256: sha(canonical(input.target)),
    scopeSha256: sha(canonical(input.scope)),
    execution: structuredClone(input.execution),
  };
  return { ok: true, intent: { value, sha256: sha(canonical(value)) } };
}

/**
 * Admits only an external proof over the exact intent. A local intent hash is
 * useful for transport and comparison, but is never a grant by itself.
 */
export function evaluateDynamicTargetAuthorization(input) {
  if (!own(input, ["candidate", "target", "scope", "execution", "intent", "approvalAuthority", "approvalProof"])
    || !candidate(input.candidate) || !target(input.target) || !scope(input.scope) || !execution(input.execution) || !validIntent(input.intent)) {
    return { allowed: false, code: "DYNAMIC-AUTHORIZATION-INVALID" };
  }
  const value = input.intent.value;
  if (canonical(input.candidate) !== canonical(value.candidate)) return { allowed: false, code: "DYNAMIC-CANDIDATE-MISMATCH" };
  if (sha(canonical(input.target)) !== value.targetSha256) return { allowed: false, code: "DYNAMIC-TARGET-MISMATCH" };
  if (sha(canonical(input.scope)) !== value.scopeSha256) return { allowed: false, code: "DYNAMIC-SCOPE-MISMATCH" };
  if (canonical(input.execution) !== canonical(value.execution)) return { allowed: false, code: "DYNAMIC-EXECUTION-BOUNDARY" };
  const proof = verifyPoApprovalProof({ intent: input.intent, trustPolicy: input.approvalAuthority, proof: input.approvalProof });
  return proof.verified
    ? { allowed: true, code: "DYNAMIC-AUTHORIZED", proofSha256: proof.proofSha256 }
    : { allowed: false, code: "DYNAMIC-EXTERNAL-AUTHORITY-REQUIRED", cause: proof.code };
}

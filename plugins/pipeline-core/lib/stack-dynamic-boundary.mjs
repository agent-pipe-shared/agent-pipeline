// SPDX-License-Identifier: SUL-1.0
/** CYB-6 dynamic/fuzz harness admission boundary; pure and provider-neutral. */
import { createHash } from "node:crypto";

const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const oid = (value) => /^[a-f0-9]{40,64}$/u.test(value ?? "");
const safe = (value) => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/u.test(value);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value);
const nonProduction = new Set(["development", "test", "staging"]);

function candidate(value) {
  return own(value, ["commit", "tree"]) && oid(value.commit) && oid(value.tree);
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

/** Creates a candidate-, target- and scope-bound authorization receipt. */
export function createDynamicTargetAuthorization(input) {
  if (!own(input, ["candidate", "target", "scope", "execution"])
    || !candidate(input.candidate) || !target(input.target) || !scope(input.scope)
    || !own(input.execution, ["network", "credential", "timeoutMs"])
    || input.execution.network !== "offline" || input.execution.credential !== "none"
    || !Number.isInteger(input.execution.timeoutMs) || input.execution.timeoutMs < 1 || input.execution.timeoutMs > 60000) {
    return { ok: false, code: "DYNAMIC-BOUNDARY-INVALID" };
  }
  const targetSha256 = sha(canonical(input.target));
  const scopeSha256 = sha(canonical(input.scope));
  const receipt = {
    schema: "pipeline.dynamic-target-authorization.v1",
    candidate: structuredClone(input.candidate),
    targetSha256,
    scopeSha256,
    execution: structuredClone(input.execution),
  };
  return { ok: true, receipt: { ...receipt, digest: sha(canonical(receipt)) } };
}

/**
 * Admits only the exact authorization preimage.  A mismatch has no fallback:
 * dynamic work must be re-authorized rather than silently widening scope.
 */
export function evaluateDynamicTargetAuthorization(input) {
  if (!own(input, ["candidate", "target", "scope", "receipt"]) || !candidate(input.candidate) || !target(input.target) || !scope(input.scope)
    || !own(input.receipt, ["schema", "candidate", "targetSha256", "scopeSha256", "execution", "digest"])
    || input.receipt.schema !== "pipeline.dynamic-target-authorization.v1"
    || !candidate(input.receipt.candidate) || !/^[a-f0-9]{64}$/u.test(input.receipt.targetSha256)
    || !/^[a-f0-9]{64}$/u.test(input.receipt.scopeSha256) || !/^[a-f0-9]{64}$/u.test(input.receipt.digest)
    || !own(input.receipt.execution, ["network", "credential", "timeoutMs"])) return { allowed: false, code: "DYNAMIC-AUTHORIZATION-INVALID" };
  const { digest, ...unsigned } = input.receipt;
  if (sha(canonical(unsigned)) !== digest) return { allowed: false, code: "DYNAMIC-AUTHORIZATION-TAMPERED" };
  if (canonical(input.candidate) !== canonical(input.receipt.candidate)) return { allowed: false, code: "DYNAMIC-CANDIDATE-MISMATCH" };
  if (sha(canonical(input.target)) !== input.receipt.targetSha256) return { allowed: false, code: "DYNAMIC-TARGET-MISMATCH" };
  if (sha(canonical(input.scope)) !== input.receipt.scopeSha256) return { allowed: false, code: "DYNAMIC-SCOPE-MISMATCH" };
  if (input.receipt.execution.network !== "offline" || input.receipt.execution.credential !== "none" || !Number.isInteger(input.receipt.execution.timeoutMs) || input.receipt.execution.timeoutMs < 1 || input.receipt.execution.timeoutMs > 60000) return { allowed: false, code: "DYNAMIC-EXECUTION-BOUNDARY" };
  return { allowed: true, code: "DYNAMIC-AUTHORIZED" };
}

// SPDX-License-Identifier: SUL-1.0
/** CYB-6 synthetic fuzz-reproducer contract: deterministic, candidate-bound, offline. */
import { createHash } from "node:crypto";
import { evaluateDynamicTargetAuthorization } from "./stack-dynamic-boundary.mjs";

const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const oid = (value) => /^[a-f0-9]{40,64}$/u.test(value ?? "");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value);
function candidate(value) { return own(value, ["commit", "tree"]) && oid(value.commit) && oid(value.tree); }
function tokens(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 16
    && new Set(value).size === value.length
    && value.every((item) => typeof item === "string" && /^[ -~]{1,64}$/u.test(item));
}

/**
 * Produces the shortest deterministic synthetic input for the supplied crash
 * predicate. The predicate is a set of required fragments, not executable
 * attacker-controlled code; therefore recording and replaying stays offline.
 */
export function minimizeSyntheticFuzzCrash(input) {
  if (!own(input, ["candidate", "input", "requiredTokens"])
    || !candidate(input.candidate) || typeof input.input !== "string" || input.input.length > 4096
    || !tokens(input.requiredTokens) || !input.requiredTokens.every((token) => input.input.includes(token))) {
    return { ok: false, code: "FUZZ-REPRODUCER-INVALID" };
  }
  const minimized = input.requiredTokens.join("");
  const core = {
    schema: "pipeline.synthetic-fuzz-reproducer.v1",
    candidate: structuredClone(input.candidate),
    inputSha256: sha(input.input),
    requiredTokensSha256: sha(canonical(input.requiredTokens)),
    minimized,
  };
  return { ok: true, reproducer: { ...core, digest: sha(canonical(core)) } };
}

/** Execute the bounded synthetic predicate and seal its result before replay evaluation. */
export function executeSyntheticFuzzReplay(input) {
  if (!own(input, ["candidate", "reproducer", "oracle", "authorization", "fixed"]) || !candidate(input.candidate) || typeof input.fixed !== "boolean" || !own(input.reproducer, ["schema", "candidate", "inputSha256", "requiredTokensSha256", "minimized", "digest"]) || !own(input.oracle, ["requiredTokens"]) || !tokens(input.oracle.requiredTokens) || !own(input.authorization, ["candidate", "target", "scope", "receipt"])) return { ok: false, code: "FUZZ-EXECUTION-INVALID" };
  const authorization = evaluateDynamicTargetAuthorization(input.authorization);
  if (!authorization.allowed || canonical(input.authorization.candidate) !== canonical(input.candidate) || canonical(input.reproducer.candidate) !== canonical(input.candidate) || sha(canonical(input.oracle.requiredTokens)) !== input.reproducer.requiredTokensSha256 || input.oracle.requiredTokens.join("") !== input.reproducer.minimized) return { ok: false, code: "FUZZ-EXECUTION-INVALID" };
  const unsigned = { schema: "pipeline.synthetic-fuzz-execution.v1", candidate: structuredClone(input.candidate), reproducerDigest: input.reproducer.digest, outcome: input.fixed ? "clean" : "reproduced" };
  return { ok: true, execution: { ...unsigned, digest: sha(canonical(unsigned)) } };
}

/** Replays one known synthetic crash against the exact candidate and predicate. */
export function replaySyntheticFuzzCrash(input) {
  if (!own(input, ["candidate", "reproducer", "oracle", "authorization", "execution"]) || !candidate(input.candidate)
    || !own(input.reproducer, ["schema", "candidate", "inputSha256", "requiredTokensSha256", "minimized", "digest"])
    || input.reproducer.schema !== "pipeline.synthetic-fuzz-reproducer.v1"
    || !candidate(input.reproducer.candidate) || !/^[a-f0-9]{64}$/u.test(input.reproducer.inputSha256)
    || !/^[a-f0-9]{64}$/u.test(input.reproducer.requiredTokensSha256) || !/^[a-f0-9]{64}$/u.test(input.reproducer.digest)
    || typeof input.reproducer.minimized !== "string"
    || !own(input.oracle, ["requiredTokens"]) || !tokens(input.oracle.requiredTokens)
    || !own(input.execution, ["schema", "candidate", "reproducerDigest", "outcome", "digest"]) || input.execution.schema !== "pipeline.synthetic-fuzz-execution.v1" || !candidate(input.execution.candidate) || !/^[a-f0-9]{64}$/u.test(input.execution.reproducerDigest) || !["clean", "reproduced"].includes(input.execution.outcome) || !/^[a-f0-9]{64}$/u.test(input.execution.digest)) {
    return { ok: false, code: "FUZZ-REPLAY-INVALID" };
  }
  const { digest, ...unsigned } = input.reproducer;
  if (sha(canonical(unsigned)) !== digest) return { ok: false, code: "FUZZ-REPLAY-TAMPERED" };
  if (canonical(input.candidate) !== canonical(input.reproducer.candidate)) return { ok: false, code: "FUZZ-REPLAY-CANDIDATE-MISMATCH" };
  if (sha(canonical(input.oracle.requiredTokens)) !== input.reproducer.requiredTokensSha256) return { ok: false, code: "FUZZ-REPLAY-ORACLE-MISMATCH" };
  if (input.oracle.requiredTokens.join("") !== input.reproducer.minimized) return { ok: false, code: "FUZZ-REPLAY-MINIMIZATION-MISMATCH" };
  if (!own(input.authorization, ["candidate", "target", "scope", "receipt"])) return { ok: false, code: "FUZZ-REPLAY-VERIFICATION-REQUIRED" };
  const authorization = evaluateDynamicTargetAuthorization(input.authorization);
  if (!authorization.allowed || canonical(input.authorization.candidate) !== canonical(input.candidate)) return { ok: false, code: "FUZZ-REPLAY-VERIFICATION-REQUIRED" };
  const { digest: executionDigest, ...executionUnsigned } = input.execution;
  if (sha(canonical(executionUnsigned)) !== executionDigest || canonical(input.execution.candidate) !== canonical(input.candidate) || input.execution.reproducerDigest !== input.reproducer.digest) return { ok: false, code: "FUZZ-REPLAY-EXECUTION-INVALID" };
  return { ok: true, reproduces: input.execution.outcome === "reproduced", code: input.execution.outcome === "clean" ? "FUZZ-REPLAY-CLEAN" : "FUZZ-REPLAY-REPRODUCED" };
}

// SPDX-License-Identifier: SUL-1.0
/** CYB-6 synthetic fuzz-reproducer contract: deterministic, candidate-bound, offline. */
import { createHash } from "node:crypto";

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

/** Replays one known synthetic crash against the exact candidate and predicate. */
export function replaySyntheticFuzzCrash(input) {
  if (!own(input, ["candidate", "reproducer", "oracle"]) || !candidate(input.candidate)
    || !own(input.reproducer, ["schema", "candidate", "inputSha256", "requiredTokensSha256", "minimized", "digest"])
    || input.reproducer.schema !== "pipeline.synthetic-fuzz-reproducer.v1"
    || !candidate(input.reproducer.candidate) || !/^[a-f0-9]{64}$/u.test(input.reproducer.inputSha256)
    || !/^[a-f0-9]{64}$/u.test(input.reproducer.requiredTokensSha256) || !/^[a-f0-9]{64}$/u.test(input.reproducer.digest)
    || typeof input.reproducer.minimized !== "string"
    || !own(input.oracle, ["requiredTokens", "fixed"]) || !tokens(input.oracle.requiredTokens) || typeof input.oracle.fixed !== "boolean") {
    return { ok: false, code: "FUZZ-REPLAY-INVALID" };
  }
  const { digest, ...unsigned } = input.reproducer;
  if (sha(canonical(unsigned)) !== digest) return { ok: false, code: "FUZZ-REPLAY-TAMPERED" };
  if (canonical(input.candidate) !== canonical(input.reproducer.candidate)) return { ok: false, code: "FUZZ-REPLAY-CANDIDATE-MISMATCH" };
  if (sha(canonical(input.oracle.requiredTokens)) !== input.reproducer.requiredTokensSha256) return { ok: false, code: "FUZZ-REPLAY-ORACLE-MISMATCH" };
  if (input.oracle.requiredTokens.join("") !== input.reproducer.minimized) return { ok: false, code: "FUZZ-REPLAY-MINIMIZATION-MISMATCH" };
  return { ok: true, reproduces: !input.oracle.fixed, code: input.oracle.fixed ? "FUZZ-REPLAY-CLEAN" : "FUZZ-REPLAY-REPRODUCED" };
}

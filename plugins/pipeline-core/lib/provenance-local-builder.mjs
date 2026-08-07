// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { evaluateProvenanceAppend, PROVENANCE_ENVELOPE_SCHEMA, REPRODUCIBILITY_STATES, validateProvenanceEnvelope } from "./provenance-envelope.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value) => typeof value === "string" && value.trim() !== "";
const canonicalRelative = (root, value) => {
  if (typeof value !== "string" || value === "" || isAbsolute(value) || value.includes("\\")) return null;
  const resolved = resolve(root, value); const normalized = relative(root, resolved);
  return resolved !== root && normalized !== "" && !normalized.startsWith(`..${sep}`) && !isAbsolute(normalized) ? normalized : null;
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function observedCandidate(root) {
  try {
    const commit = execFileSync("git", ["-C", root, "rev-parse", "--verify", "HEAD"], { encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["-C", root, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
    return /^[a-f0-9]{40,64}$/u.test(commit) && /^[a-f0-9]{40,64}$/u.test(tree) ? { commit, tree } : null;
  } catch { return null; }
}

function materialMatchesCandidate(root, path) {
  try { execFileSync("git", ["-C", root, "ls-files", "--error-unmatch", "--", path], { stdio: "ignore" }); } catch { return false; }
  return [[], ["--cached"]].every((mode) => spawnSync("git", ["-C", root, "diff", ...mode, "--quiet", "HEAD", "--", path], { stdio: "ignore" }).status === 0);
}

function boundFile(root, path) {
  const safe = canonicalRelative(root, path);
  if (!safe) return null;
  try {
    const stat = lstatSync(resolve(root, safe));
    return stat.isFile() && !stat.isSymbolicLink() ? { path: safe, bytes: readFileSync(resolve(root, safe)) } : null;
  } catch { return null; }
}

/** Deterministically binds explicit local inputs; it never runs build scripts. */
export function buildLocalProvenance(input) {
  if (!own(input, ["artifact", "builder", "candidate", "environment", "existing", "invocation", "materials", "reproducibility", "root"]) || !text(input.root) || !own(input.artifact, ["id", "path"]) || !text(input.artifact.id) || !text(input.artifact.path) || !own(input.builder, ["digest", "id"]) || !text(input.builder.id) || !SHA256.test(input.builder.digest) || !own(input.candidate, ["commit", "tree"]) || !/^[a-f0-9]{40,64}$/u.test(input.candidate.commit) || !/^[a-f0-9]{40,64}$/u.test(input.candidate.tree) || !own(input.environment, ["identitySha256", "kind"]) || !text(input.environment.kind) || !SHA256.test(input.environment.identitySha256) || !own(input.invocation, ["id", "parametersSha256"]) || !text(input.invocation.id) || !SHA256.test(input.invocation.parametersSha256) || !Array.isArray(input.materials) || input.materials.length === 0 || !input.materials.every(text) || !REPRODUCIBILITY_STATES.includes(input.reproducibility) || !Array.isArray(input.existing) || !input.existing.every((entry) => validateProvenanceEnvelope(entry).valid)) return { ok: false, code: "PROVENANCE-BUILDER-INPUT-INVALID" };
  const root = resolve(input.root);
  const observed = observedCandidate(root);
  if (!observed) return { ok: false, code: "PROVENANCE-BUILDER-CANDIDATE-UNAVAILABLE" };
  if (observed.commit !== input.candidate.commit || observed.tree !== input.candidate.tree) return { ok: false, code: "PROVENANCE-BUILDER-CANDIDATE-MISMATCH" };
  const artifact = boundFile(root, input.artifact.path);
  const materialFiles = input.materials.map((path) => boundFile(root, path));
  if (!artifact || materialFiles.some((file) => file === null) || new Set(materialFiles.map((file) => file.path)).size !== materialFiles.length || materialFiles.some((file) => !materialMatchesCandidate(root, file.path))) return { ok: false, code: "PROVENANCE-BUILDER-FILE-INVALID" };
  const envelope = {
    schema: PROVENANCE_ENVELOPE_SCHEMA,
    candidate: structuredClone(input.candidate),
    subject: { id: input.artifact.id, sha256: digest(artifact.bytes) },
    materials: materialFiles.map((file) => ({ id: file.path, kind: "source", sha256: digest(file.bytes) })).sort((left, right) => Buffer.compare(Buffer.from(left.id), Buffer.from(right.id))),
    builder: structuredClone(input.builder), invocation: structuredClone(input.invocation), environment: structuredClone(input.environment),
    assurance: "unverified", attestation: { keyReference: "external-required", signatureSha256: "0".repeat(64), status: "unverified" }, reproducibility: input.reproducibility,
  };
  if (!validateProvenanceEnvelope(envelope).valid) return { ok: false, code: "PROVENANCE-BUILDER-OUTPUT-INVALID" };
  const append = evaluateProvenanceAppend({ existing: input.existing, next: envelope });
  return append.allowed ? { ok: true, envelope } : { ok: false, code: append.code };
}

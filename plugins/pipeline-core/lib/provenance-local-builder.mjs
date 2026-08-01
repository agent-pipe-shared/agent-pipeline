// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { PROVENANCE_ENVELOPE_SCHEMA, validateProvenanceEnvelope } from "./provenance-envelope.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value) => typeof value === "string" && value.trim() !== "";
const canonicalRelative = (root, value) => typeof value === "string" && value !== "" && !isAbsolute(value) && !value.includes("\\") && resolve(root, value) !== root && !relative(root, resolve(root, value)).startsWith(`..${sep}`) && !isAbsolute(relative(root, resolve(root, value))) ? value : null;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

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
  if (!own(input, ["artifact", "builder", "candidate", "environment", "invocation", "materials", "root"]) || !text(input.root) || !own(input.artifact, ["id", "path"]) || !text(input.artifact.id) || !text(input.artifact.path) || !own(input.builder, ["digest", "id"]) || !text(input.builder.id) || !SHA256.test(input.builder.digest) || !own(input.candidate, ["commit", "tree"]) || !/^[a-f0-9]{40,64}$/u.test(input.candidate.commit) || !/^[a-f0-9]{40,64}$/u.test(input.candidate.tree) || !own(input.environment, ["identitySha256", "kind"]) || !text(input.environment.kind) || !SHA256.test(input.environment.identitySha256) || !own(input.invocation, ["id", "parametersSha256"]) || !text(input.invocation.id) || !SHA256.test(input.invocation.parametersSha256) || !Array.isArray(input.materials) || !input.materials.every(text)) return { ok: false, code: "PROVENANCE-BUILDER-INPUT-INVALID" };
  const root = resolve(input.root);
  const artifact = boundFile(root, input.artifact.path);
  const materialFiles = input.materials.map((path) => boundFile(root, path));
  if (!artifact || materialFiles.some((file) => file === null)) return { ok: false, code: "PROVENANCE-BUILDER-FILE-INVALID" };
  const envelope = {
    schema: PROVENANCE_ENVELOPE_SCHEMA,
    candidate: structuredClone(input.candidate),
    subject: { id: input.artifact.id, sha256: digest(artifact.bytes) },
    materials: materialFiles.map((file) => ({ id: file.path, kind: "source", sha256: digest(file.bytes) })).sort((left, right) => Buffer.compare(Buffer.from(left.id), Buffer.from(right.id))),
    builder: structuredClone(input.builder), invocation: structuredClone(input.invocation), environment: structuredClone(input.environment),
    assurance: "unverified", attestation: { keyReference: "external-required", signatureSha256: "0".repeat(64), status: "unverified" }, reproducibility: "not-assessed",
  };
  return validateProvenanceEnvelope(envelope).valid ? { ok: true, envelope } : { ok: false, code: "PROVENANCE-BUILDER-OUTPUT-INVALID" };
}

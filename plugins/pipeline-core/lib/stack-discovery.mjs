// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const FILES = Object.freeze(["package.json", "Dockerfile", "terraform.tf", ".github/workflows/ci.yml"]);
const own = (v, k) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === k.length && k.every((x) => Object.hasOwn(v, x));
const oid = (v) => /^[a-f0-9]{40,64}$/u.test(v ?? "");
const sha = (v) => createHash("sha256").update(v).digest("hex");
const candidateShape = (value) => own(value, ["commit", "tree"]) && oid(value.commit) && oid(value.tree) && value.commit !== value.tree;
const observations = (value) => Array.isArray(value) && value.every((item) => own(item, ["path", "sha256", "trust", "present"]) && FILES.includes(item.path) && /^[a-f0-9]{64}$/u.test(item.sha256) && item.trust === "untrusted" && item.present === true) && new Set(value.map((item) => item.path)).size === value.length;

/** Rechecks a discovery receipt before its observations can drive a capability decision. */
export function validateStackDiscovery(value) {
  if (!own(value, ["ok", "schema", "candidate", "observations", "digest"]) || value.ok !== true || value.schema !== "pipeline.stack-discovery.v1" || !candidateShape(value.candidate) || !observations(value.observations) || !/^[a-f0-9]{64}$/u.test(value.digest) || value.digest !== sha(JSON.stringify({ candidate: value.candidate, observations: value.observations }))) return { valid: false, code: "STACK-DISCOVERY-INVALID" };
  return { valid: true };
}

/** Observe one clean Git candidate locally; no network or setup command is used. */
export function observeStackCandidate(rootDir) {
  try {
    const root = resolve(rootDir);
    const dirty = execFileSync("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" });
    if (dirty !== "") return { ok: false, code: "STACK-DISCOVERY-DIRTY-WORKTREE" };
    const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["-C", root, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
    return candidateShape({ commit, tree }) ? { ok: true, candidate: { commit, tree } } : { ok: false, code: "STACK-DISCOVERY-CANDIDATE-UNAVAILABLE" };
  } catch { return { ok: false, code: "STACK-DISCOVERY-CANDIDATE-UNAVAILABLE" }; }
}

/**
 * Reads the committed blobs of a fixed metadata allowlist. A dirty checkout
 * is rejected before and after observation, so mutable working-tree files can
 * neither supply nor race candidate-bound discovery data.
 */
export function discoverStackMetadata({ root, candidate } = {}) {
  if (typeof root !== "string" || !candidateShape(candidate)) return { ok: false, code: "STACK-DISCOVERY-INVALID" };
  const base = resolve(root); const observed = observeStackCandidate(base);
  if (!observed.ok) return observed;
  if (candidate.commit !== observed.candidate.commit || candidate.tree !== observed.candidate.tree) return { ok: false, code: "STACK-DISCOVERY-CANDIDATE-MISMATCH" };
  const observations = [];
  for (const path of FILES) {
    try {
      const bytes = execFileSync("git", ["-C", base, "show", `${candidate.commit}:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      observations.push({ path, sha256: sha(bytes), trust: "untrusted", present: true });
    } catch { /* An absent allowlisted blob is not an observation. */ }
  }
  const after = observeStackCandidate(base);
  if (!after.ok || after.candidate.commit !== candidate.commit || after.candidate.tree !== candidate.tree) return { ok: false, code: "STACK-DISCOVERY-CANDIDATE-CHANGED" };
  return { ok: true, schema: "pipeline.stack-discovery.v1", candidate: structuredClone(candidate), observations, digest: sha(JSON.stringify({ candidate, observations })) };
}

// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FILES = Object.freeze(["package.json", "Dockerfile", "terraform.tf", ".github/workflows/ci.yml"]);
const own = (v, k) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === k.length && k.every((x) => Object.hasOwn(v, x));
const oid = (v) => /^[a-f0-9]{40,64}$/u.test(v ?? "");
const sha = (v) => createHash("sha256").update(v).digest("hex");
const observations = (value) => Array.isArray(value) && value.every((item) => own(item, ["path", "sha256", "trust", "present"]) && FILES.includes(item.path) && /^[a-f0-9]{64}$/u.test(item.sha256) && item.trust === "untrusted" && item.present === true) && new Set(value.map((item) => item.path)).size === value.length;

/** Rechecks a discovery receipt before its observations can drive a capability decision. */
export function validateStackDiscovery(value) {
  if (!own(value, ["ok", "schema", "candidate", "observations", "digest"]) || value.ok !== true || value.schema !== "pipeline.stack-discovery.v1" || !own(value.candidate, ["commit", "tree"]) || !oid(value.candidate.commit) || !oid(value.candidate.tree) || value.candidate.commit === value.candidate.tree || !observations(value.observations) || !/^[a-f0-9]{64}$/u.test(value.digest) || value.digest !== sha(JSON.stringify({ candidate: value.candidate, observations: value.observations }))) return { valid: false, code: "STACK-DISCOVERY-INVALID" };
  return { valid: true };
}

/** Strictly reads a fixed metadata allowlist; it never invokes package managers or scripts. */
export function discoverStackMetadata({ root, candidate } = {}) {
  if (typeof root !== "string" || !own(candidate, ["commit", "tree"]) || !oid(candidate.commit) || !oid(candidate.tree) || candidate.commit === candidate.tree) return { ok: false, code: "STACK-DISCOVERY-INVALID" };
  const base = resolve(root); const observations = [];
  for (const relative of FILES) {
    const path = join(base, relative);
    if (!existsSync(path)) continue;
    try {
      const bytes = readFileSync(path, "utf8");
      observations.push({ path: relative, sha256: sha(bytes), trust: "untrusted", present: true });
    } catch { return { ok: false, code: "STACK-DISCOVERY-READ-FAILED" }; }
  }
  return { ok: true, schema: "pipeline.stack-discovery.v1", candidate: structuredClone(candidate), observations, digest: sha(JSON.stringify({ candidate, observations })) };
}

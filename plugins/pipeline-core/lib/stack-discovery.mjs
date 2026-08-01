// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FILES = Object.freeze(["package.json", "Dockerfile", "terraform.tf", ".github/workflows/ci.yml"]);
const own = (v, k) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === k.length && k.every((x) => Object.hasOwn(v, x));
const oid = (v) => /^[a-f0-9]{40,64}$/u.test(v ?? "");
const sha = (v) => createHash("sha256").update(v).digest("hex");

/** Strictly reads a fixed metadata allowlist; it never invokes package managers or scripts. */
export function discoverStackMetadata({ root, candidate } = {}) {
  if (typeof root !== "string" || !own(candidate, ["commit", "tree"]) || !oid(candidate.commit) || !oid(candidate.tree)) return { ok: false, code: "STACK-DISCOVERY-INVALID" };
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

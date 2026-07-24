#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planFeaturePackageTransition, validateFeatureTopology } from "./feature-package-topology.mjs";

const root = mkdtempSync(join(tmpdir(), "feature-topology-"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const file = (path, bytes) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), bytes); return { path, sha256: hash(bytes) }; };
try {
  const id = "safe-feature"; const base = `specs/${id}`;
  const artifacts = [
    ["prd", "prd.md", true, "mutable", "active"], ["spec", "spec.md", true, "mutable", "active"], ["acceptance", "acceptance.md", true, "mutable", "active"], ["result", "result.md", true, "append-only", "retain"], ["candidate-evidence", "evidence/verify.json", false, "immutable", "retain"],
  ].map(([klass, name, authority, mutability, retention]) => ({ class: klass, ...file(`${base}/${name}`, `${klass}\n`), authority, mutability, retention }));
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id, rigor: 2 }, state: "verifying", artifacts, candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, supersedes: null };
  file(`${base}/lifecycle.json`, `${JSON.stringify(manifest)}\n`);
  assert.equal(validateFeatureTopology(root).ok, true);
  assert.equal(planFeaturePackageTransition(root, `${base}/lifecycle.json`, "completed").status, "preview");
  manifest.artifacts[1].sha256 = "0".repeat(64); writeFileSync(join(root, `${base}/lifecycle.json`), JSON.stringify(manifest));
  assert.match(validateFeatureTopology(root).findings.join("\n"), /digest does not bind/u);
  console.log("feature-package-topology: 3 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planFeaturePackageBootstrap, planFeaturePackageTransition, validateFeatureTopology } from "./feature-package-topology.mjs";

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
  const bootstrapId = "bootstrap-feature";
  const bootstrapBase = `specs/${bootstrapId}`;
  const bootstrapPrd = file(`${bootstrapBase}/prd.md`, "# Bootstrap PRD\n");
  const bootstrapManifest = {
    schema: "pipeline.feature-package.v1", feature: { id: bootstrapId, rigor: 1 }, state: "draft",
    artifacts: [{ class: "prd", ...bootstrapPrd, authority: true, mutability: "mutable", retention: "active" }], candidate: null, supersedes: null,
  };
  const bootstrapPath = `${bootstrapBase}/lifecycle.json`;
  const proposal = { targetState: "draft", manifestBytes: `${JSON.stringify(bootstrapManifest)}\n` };
  const first = planFeaturePackageBootstrap(root, bootstrapPath, proposal);
  const second = planFeaturePackageBootstrap(root, bootstrapPath, structuredClone(proposal));
  assert.equal(first.status, "bootstrap-preview");
  assert.deepEqual(first, second);
  assert.equal(first.receipt.manifestSha256, hash(proposal.manifestBytes));
  assert.equal(planFeaturePackageBootstrap(root, bootstrapPath, { ...proposal, targetState: "approved" }).reason, "invalid-bootstrap-proposal");
  assert.equal(planFeaturePackageBootstrap(root, bootstrapPath, { targetState: "draft" }).reason, "invalid-bootstrap-proposal");
  assert.equal(planFeaturePackageBootstrap(root, `${bootstrapBase}/other.json`, proposal).reason, "invalid-bootstrap-manifest");
  file(`${base}/Result.md`, "conflicting result envelope\n");
  assert.match(validateFeatureTopology(root).findings.join("\n"), /filesystem case-fold or Unicode-normalization collision/u);
  rmSync(join(root, `${base}/Result.md`));
  file(`${base}/ſpec.md`, "compatibility-conflicting spec envelope\n");
  assert.match(validateFeatureTopology(root).findings.join("\n"), /filesystem case-fold or Unicode-normalization collision/u);
  rmSync(join(root, `${base}/ſpec.md`));
  manifest.artifacts[1].sha256 = "0".repeat(64); writeFileSync(join(root, `${base}/lifecycle.json`), JSON.stringify(manifest));
  assert.match(validateFeatureTopology(root).findings.join("\n"), /digest does not bind/u);
  console.log("feature-package-topology: 11 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }

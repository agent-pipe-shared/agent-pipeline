#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planFeaturePackageBootstrap, planFeaturePackageTransition, validateFeaturePackage, validateFeatureTopology } from "./feature-package-topology.mjs";
import { readFileSync } from "node:fs";

const root = mkdtempSync(join(tmpdir(), "feature-topology-"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fileIn = (base, path, bytes) => { mkdirSync(join(base, path, ".."), { recursive: true }); writeFileSync(join(base, path), bytes); return { path, sha256: hash(bytes) }; };
const file = (path, bytes) => fileIn(root, path, bytes);
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
  const duplicateBootstrap = structuredClone(bootstrapManifest);
  duplicateBootstrap.artifacts.push(structuredClone(bootstrapManifest.artifacts[0]));
  const duplicatePreview = planFeaturePackageBootstrap(root, bootstrapPath, { targetState: "draft", manifestBytes: `${JSON.stringify(duplicateBootstrap)}\n` });
  assert.equal(duplicatePreview.status, "rejected");
  assert.match(duplicatePreview.findings.join("\n"), /exactly one artifact/u);
  file(`${bootstrapBase}/PRD.md`, "# Case collision\n");
  const collisionPreview = planFeaturePackageBootstrap(root, bootstrapPath, proposal);
  assert.equal(collisionPreview.status, "rejected");
  assert.match(collisionPreview.findings.join("\n"), /filesystem case-fold or Unicode-normalization collision/u);
  rmSync(join(root, `${bootstrapBase}/PRD.md`));
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
  console.log("feature-package-topology: 13 passed, 0 failed");
} finally { rmSync(root, { recursive: true, force: true }); }

// Regression guard: a clean forward-slash relative artifact path (the exact
// shape every real package uses) must validate OK on every platform,
// including native Windows, where a platform-default node:path normalize()
// would otherwise rewrite it to backslashes and reject it as unsafe.
const posixRoot = mkdtempSync(join(tmpdir(), "feature-topology-posix-path-"));
try {
  const id = "posix-path-feature"; const base = `specs/${id}`;
  const prd = fileIn(posixRoot, `${base}/prd.md`, "prd\n");
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state: "draft", artifacts: [{ class: "prd", path: prd.path, sha256: prd.sha256, authority: true, mutability: "mutable", retention: "active" }], candidate: null, supersedes: null };
  fileIn(posixRoot, `${base}/lifecycle.json`, `${JSON.stringify(manifest)}\n`);
  assert.equal(validateFeatureTopology(posixRoot).ok, true);
  console.log("feature-package-topology: forward-slash path regression, 1 passed, 0 failed");
} finally { rmSync(posixRoot, { recursive: true, force: true }); }

// PHX-WP-MANIFEST-AMENDMENT: an `immutable` entry's digest may only differ
// from the prior manifest's recorded value in the same write that supplies a
// matching `amendment` record.
const amendmentRoot = mkdtempSync(join(tmpdir(), "feature-topology-amendment-"));
try {
  const id = "amendment-feature"; const base = `specs/${id}`;
  const originalSha256 = hash("original evidence\n");
  const rebound = fileIn(amendmentRoot, `${base}/evidence/candidate.json`, "rebound evidence\n");
  const previousManifest = {
    schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state: "abandoned",
    artifacts: [{ class: "candidate-evidence", path: rebound.path, sha256: originalSha256, authority: false, mutability: "immutable", retention: "retain" }],
    candidate: null, supersedes: null,
  };
  const manifestPath = `${base}/lifecycle.json`;
  const unamended = {
    ...previousManifest,
    artifacts: [{ class: "candidate-evidence", path: rebound.path, sha256: rebound.sha256, authority: false, mutability: "immutable", retention: "retain" }],
  };
  fileIn(amendmentRoot, manifestPath, `${JSON.stringify(unamended)}\n`);
  const unamendedResult = validateFeaturePackage(amendmentRoot, manifestPath, previousManifest);
  assert.equal(unamendedResult.ok, false);
  assert.match(unamendedResult.findings.join("\n"), /immutable entry rebound without an amendment record/u);

  const wrongPrevious = {
    ...previousManifest,
    artifacts: [{
      class: "candidate-evidence", path: rebound.path, sha256: rebound.sha256, authority: false, mutability: "immutable", retention: "retain",
      amendment: { at: "2026-08-08", reason: "artifact renamed under the epic", previousSha256: "0".repeat(64) },
    }],
  };
  fileIn(amendmentRoot, manifestPath, `${JSON.stringify(wrongPrevious)}\n`);
  const wrongPreviousResult = validateFeaturePackage(amendmentRoot, manifestPath, previousManifest);
  assert.equal(wrongPreviousResult.ok, false);
  assert.match(wrongPreviousResult.findings.join("\n"), /amendment\.previousSha256 must equal the previously recorded digest/u);

  const amended = {
    ...previousManifest,
    artifacts: [{
      class: "candidate-evidence", path: rebound.path, sha256: rebound.sha256, authority: false, mutability: "immutable", retention: "retain",
      amendment: { at: "2026-08-08", reason: "artifact renamed under the epic", previousSha256: originalSha256 },
    }],
  };
  fileIn(amendmentRoot, manifestPath, `${JSON.stringify(amended)}\n`);
  const amendedResult = validateFeaturePackage(amendmentRoot, manifestPath, previousManifest);
  assert.equal(amendedResult.ok, true);
  console.log("feature-package-topology: immutable-entry amendment enforcement, 3 passed, 0 failed");
} finally { rmSync(amendmentRoot, { recursive: true, force: true }); }

// PHX-WP-MUTABLE-ARTIFACT-AUTOREBIND: a mutable-class artifact's drifted
// digest is auto-rebound (no PO ceremony, no FTP-ARTIFACT-2), with an
// on-manifest audit record; an immutable-class artifact's drift is NEVER
// auto-rebound and still requires the existing signed reconcile path.
const autoRebindRoot = mkdtempSync(join(tmpdir(), "feature-topology-autorebind-"));
try {
  const id = "autorebind-feature"; const base = `specs/${id}`;
  const acceptance = fileIn(autoRebindRoot, `${base}/acceptance.md`, "original acceptance text\n");
  const prd = fileIn(autoRebindRoot, `${base}/prd.md`, "original prd text\n");
  const manifest = {
    schema: "pipeline.feature-package.v1", feature: { id, rigor: 1 }, state: "draft",
    artifacts: [
      { class: "prd", ...prd, authority: true, mutability: "immutable", retention: "active" },
      { class: "acceptance", ...acceptance, authority: true, mutability: "mutable", retention: "active" },
    ],
    candidate: null, supersedes: null,
  };
  const manifestPath = `${base}/lifecycle.json`;
  fileIn(autoRebindRoot, manifestPath, `${JSON.stringify(manifest)}\n`);

  // Edit BOTH a mutable and an immutable artifact's bytes -- a routine PO
  // amendment to acceptance.md is exactly the triggering situation this WP
  // targets, and prd.md stands in for the immutable/authority artifact whose
  // drift must NOT be auto-rebound alongside it.
  fileIn(autoRebindRoot, `${base}/acceptance.md`, "amended acceptance text (EPIC-AC-05 disposition)\n");
  fileIn(autoRebindRoot, `${base}/prd.md`, "drifted prd text\n");

  // Default (no options): unchanged behavior -- both drifts are reported,
  // nothing is rewritten on disk.
  const beforeBytes = readFileSync(join(autoRebindRoot, manifestPath), "utf8");
  const defaultResult = validateFeaturePackage(autoRebindRoot, manifestPath);
  assert.equal(defaultResult.ok, false);
  const defaultDigestFindings = defaultResult.findings.filter((f) => /digest does not bind file bytes/u.test(f));
  assert.equal(defaultDigestFindings.length, 2);
  assert.deepEqual(defaultResult.rebinds, []);
  assert.equal(readFileSync(join(autoRebindRoot, manifestPath), "utf8"), beforeBytes);

  // options.autoRebindMutable: the mutable acceptance.md entry is silently no
  // longer silent -- it is rebound with an audit record and stops producing
  // FTP-ARTIFACT-2; the immutable prd.md entry is completely unaffected and
  // still fails FTP-ARTIFACT-2, still requiring the signed reconcile path.
  const rebindResult = validateFeaturePackage(autoRebindRoot, manifestPath, null, { autoRebindMutable: true });
  assert.equal(rebindResult.ok, false);
  const rebindDigestFindings = rebindResult.findings.filter((f) => /digest does not bind file bytes/u.test(f));
  assert.equal(rebindDigestFindings.length, 1);
  assert.match(rebindResult.findings.join("\n"), /FTP-ARTIFACT-0: digest does not bind file bytes/u);
  assert.equal(rebindResult.findings.some((f) => /FTP-ARTIFACT-1: digest does not bind file bytes/u.test(f)), false);
  assert.equal(rebindResult.rebinds.length, 1);
  assert.equal(rebindResult.rebinds[0].path, acceptance.path);
  assert.equal(rebindResult.rebinds[0].from, acceptance.sha256);

  const persisted = JSON.parse(readFileSync(join(autoRebindRoot, manifestPath), "utf8"));
  const persistedAcceptance = persisted.artifacts.find((a) => a.class === "acceptance");
  const persistedPrd = persisted.artifacts.find((a) => a.class === "prd");
  const newAcceptanceSha256 = hash(readFileSync(join(autoRebindRoot, `${base}/acceptance.md`)));
  assert.equal(persistedAcceptance.sha256, newAcceptanceSha256);
  assert.notEqual(persistedAcceptance.sha256, acceptance.sha256);
  assert.equal(persistedAcceptance.amendment.previousSha256, acceptance.sha256);
  assert.match(persistedAcceptance.amendment.reason, /auto-rebind/u);
  assert.equal(persistedPrd.sha256, prd.sha256, "immutable entry must be untouched by auto-rebind");
  assert.equal(Object.prototype.hasOwnProperty.call(persistedPrd, "amendment"), false, "immutable entry gets no auto-rebind amendment");

  // Re-running now (mutable entry already resynced) yields the noop shape:
  // no further rebinds, and the persisted mutable digest matches current bytes.
  const secondPass = validateFeaturePackage(autoRebindRoot, manifestPath, null, { autoRebindMutable: true });
  assert.deepEqual(secondPass.rebinds, []);
  console.log("feature-package-topology: mutable-only auto-rebind boundary, 6 passed, 0 failed");
} finally { rmSync(autoRebindRoot, { recursive: true, force: true }); }

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Generate the exact §7 continuity-authority-revision request for the CURRENT
 * State and the CURRENT HEAD candidate.
 *
 * Run this only while the feature is in `design` phase with `planApproved !==
 * true`, because that is what `authorityRevisionCommonBindings` requires.
 *
 * The old authority is taken from the recorded continuity binding and the new
 * one from `--next-spec`. Every one of the four artifacts must hash to its
 * stated digest at apply time — `hashBoundRepoFile` verifies each against the
 * live file — so a transition can re-point which document is authority, but it
 * can never express a change to a bound document's own bytes at the same path.
 * Commit the candidate first: the request binds HEAD's commit and tree.
 *
 * Usage:
 *   node make-authority-revision-proposal.mjs --next-spec <repo-relative-path> [--ttl-hours 24]
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256CanonicalJson } from "../../../harness/lib/plan-spec-state-v2.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const nextSpec = arg("--next-spec");
if (!nextSpec) throw new Error("--next-spec <repo-relative-path> is required");
const ttlHours = Number(arg("--ttl-hours", "24"));
if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > 168) throw new Error("--ttl-hours must be 1..168");

const FEATURE_ID = "sprint-phoenix-epic";
const digest = (relative) => createHash("sha256").update(readFileSync(join(repoRoot, relative))).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

const state = JSON.parse(readFileSync(join(repoRoot, "project", "pipeline-state.json"), "utf8"));
const continuity = state.continuity;
if (state.activeFeature?.id !== FEATURE_ID) throw new Error("active feature is not sprint-phoenix-epic");
if (state.activeFeature.phase !== "design") throw new Error(`phase is "${state.activeFeature.phase}"; reopen design first`);
if (state.planApproved === true) throw new Error("planApproved must not be true for an authority revision");

const oldAuthority = {
  prd: { path: continuity.authority.prd.path, sha256: continuity.authority.prd.sha256 },
  spec: { path: continuity.authority.spec.path, sha256: continuity.authority.spec.sha256 },
};
// Fail here rather than at apply time: both old artifacts must still hash to
// their recorded digests, or the transition is unrepresentable.
for (const [role, binding] of Object.entries(oldAuthority)) {
  const live = digest(binding.path);
  if (live !== binding.sha256) {
    throw new Error(`bound ${role} ${binding.path} drifted: recorded ${binding.sha256}, live ${live}. Restore the bound bytes before revising.`);
  }
}

const nextSpecSha256 = digest(nextSpec);
const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const suffix = process.argv.includes("--suffix") ? `-${arg("--suffix")}` : "";
const decisionSha256 = createHash("sha256")
  .update(`phoenix-authority-revision|${FEATURE_ID}|${oldAuthority.spec.path}@${oldAuthority.spec.sha256}|${nextSpec}@${nextSpecSha256}`)
  .digest("hex");

const request = {
  schema: "pipeline.continuity-authority-revision-request.v1",
  featureId: FEATURE_ID,
  expectedRevision: continuity.revision,
  preStateSha256: sha256CanonicalJson(state),
  oldAuthority,
  nextAuthority: {
    prd: { path: oldAuthority.prd.path, sha256: digest(oldAuthority.prd.path) },
    spec: { path: nextSpec, sha256: nextSpecSha256 },
  },
  decision: {
    id: `phoenix-authority-revision-${stamp}${suffix}`,
    sha256: decisionSha256,
    scope: { featureId: FEATURE_ID, phase: "design" },
  },
  candidate: { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") },
  evidence: { sha256: nextSpecSha256 },
  idempotencyKey: `phoenix-authority-revision-${stamp}${suffix}`,
  expiresAt: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
};

const target = join(here, `authority-revision-proposal-${stamp}${suffix}.json`);
writeFileSync(target, `${JSON.stringify(request)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ ok: true, proposal: target, from: oldAuthority.spec, to: request.nextAuthority.spec, candidate: request.candidate, expiresAt: request.expiresAt }, null, 2)}\n`);

// SPDX-License-Identifier: SUL-1.0
/**
 * ADR-0095: the feature close's Spec addendum gate. Read-only, at one commit (the close candidate).
 *
 * For every active feature package (lifecycle.json in an active state) and every `specs/<feature>/spec-addendum-<NN>.md` at the commit:
 *   - an addendum file the package's addendum reader does not return (never approved, never registered, or in a directory that is no
 *     package) is a finding: an unapproved addendum must not read like Spec authority in the delivered tree;
 *   - the reader must accept the package (SPEC-ADDENDUM-READ findings are findings here);
 *   - every APPLIED addendum must be covered by the course's last registered Critic round: its reviewed candidate holds the addendum
 *     with the approved bytes. A superseded addendum (its base Spec is no longer the approved one) is history and does not block.
 * No new record: "covered" is derived from the registered course lineage and the addendum digest.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolveRetainedCriticCourseRecords } from "./critic-course-admission.mjs";
import { readSpecAddenda, specAddendumNumber } from "./spec-addendum.mjs";

const ACTIVE = new Set(["awaiting-approval", "approved", "implementing", "verifying", "completed"]);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, args) => spawnSync("git", ["-C", root, ...args], { shell: false, timeout: 15000, maxBuffer: 64 * 1024 * 1024 });
function blobAt(root, commit, path) {
  const type = git(root, ["cat-file", "-t", `${commit}:${path}`]);
  if (type.status !== 0 || type.stdout.toString("utf8").trim() !== "blob") return null;
  const shown = git(root, ["show", `${commit}:${path}`]);
  return shown.status === 0 ? shown.stdout : null;
}

/** @returns {{ok: boolean, findings: string[], covered: {featureId: string, path: string, reviewedCommit: string}[]}} */
export function specAddendumCloseFindings({ root, candidateCommit }) {
  const listed = git(root, ["ls-tree", "-r", "--name-only", candidateCommit, "--", "specs"]);
  if (listed.status !== 0) return { ok: false, findings: [`the tree of ${candidateCommit} could not be listed`], covered: [] };
  const paths = listed.stdout.toString("utf8").split("\n").filter(Boolean);
  const packages = new Set(paths.map((path) => /^specs\/([^/]+)\/lifecycle\.json$/u.exec(path)?.[1]).filter(Boolean));
  const files = paths.map((path) => ({ path, featureId: path.split("/")[1] })).filter(({ path, featureId }) => specAddendumNumber(featureId, path) !== null);
  const findings = [], covered = [];
  for (const { path, featureId } of files) {
    if (!packages.has(featureId)) findings.push(`${path}: no feature package specs/${featureId}/lifecycle.json; an addendum belongs to a package and is approved and registered there`);
  }
  for (const featureId of [...packages].sort()) {
    let manifest;
    try { manifest = JSON.parse(blobAt(root, candidateCommit, `specs/${featureId}/lifecycle.json`).toString("utf8")); } catch { continue; }
    if (!ACTIVE.has(manifest?.state)) continue;
    const mine = files.filter((file) => file.featureId === featureId);
    const read = readSpecAddenda({ root, featureId, manifest, read: (path) => { const bytes = blobAt(root, candidateCommit, path); if (bytes === null) throw new Error("missing"); return bytes; } });
    if (!read.ok) findings.push(...read.findings.map((finding) => `specs/${featureId}: ${finding}`));
    const known = new Set(read.addenda.map((entry) => entry.path));
    for (const { path } of mine) if (!known.has(path)) findings.push(`${path}: not an approved, registered Spec addendum; approve it (pipeline-state.mjs approve-spec-addendum) and register it (register-feature-package.mjs --add-spec-addendum), or remove it`);
    if (read.applied.length === 0) continue;
    let last = null;
    try { last = resolveRetainedCriticCourseRecords({ repoRoot: root, featureId, candidateCommit }).history.at(-1) ?? null; } catch { last = null; }
    const reviewed = last?.candidate?.commit;
    for (const addendum of read.applied) {
      const bytes = typeof reviewed === "string" ? blobAt(root, reviewed, addendum.path) : null;
      if (bytes !== null && digest(bytes) === addendum.sha256) covered.push({ featureId, path: addendum.path, reviewedCommit: reviewed });
      else findings.push(`${addendum.path}: no registered Critic round of specs/${featureId} reviewed it (${typeof reviewed === "string" ? `the last registered round reviewed ${reviewed}` : "no registered round"}); run the delta round that covers the addendum and register its lineage`);
    }
  }
  return { ok: findings.length === 0, findings, covered };
}

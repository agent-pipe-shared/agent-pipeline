// SPDX-License-Identifier: SUL-1.0
/**
 * PF-31, PF-36, PF-40 (D56 (2)): files the Pipeline itself writes into the working tree.
 *
 * The governed slice queue (`specs/<feature>/slice-queue.json`) is written by a dispatch binding. An
 * older build also wrote the guard-override audit log into the tree on a signed push; a current build
 * writes it under the common Git directory (`lib/guard-override-ledger.mjs`), so in the tree it is only
 * that older build's leftover. Each then makes the tree dirty, and the
 * Pipeline's own clean-tree checks refused with a bare "commit or stash". The checks stay strict, so a
 * push candidate still binds every file; a refusal now recognizes these files and names the one
 * sanctioned command that commits exactly them, `scripts/commit-pipeline-owned.mjs`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEGACY_GUARD_AUDIT, NEUTRAL_GUARD_AUDIT, resolveAuthorityArtifactPath } from "./project-authority.mjs";

export const COMMIT_PIPELINE_OWNED_SCRIPT = fileURLToPath(new URL("../scripts/commit-pipeline-owned.mjs", import.meta.url));
const QUEUE = /^specs\/[A-Za-z0-9][A-Za-z0-9._-]*\/slice-queue\.json$/u;
const AUDIT = new Set([NEUTRAL_GUARD_AUDIT, LEGACY_GUARD_AUDIT]);

export function isPipelineOwnedPath(path) {
  return typeof path === "string" && (QUEUE.test(path) || AUDIT.has(path));
}

// D3: the feature package's own files, written by the close route before the signing ceremony. They are owned
// only when the caller supplies the repository root and the dirty bytes are exactly what State already binds:
// the Result file with the digest `continuity.authority.result` carries (the result bootstrap's canonical
// fence), the package manifest when it is a valid-shaped manifest of the feature State is closing (the signed
// reconcile's postimage). Any other edit of those paths is a person's work and stays foreign.
const FEATURE_FILE = /^(specs\/[A-Za-z0-9][A-Za-z0-9._-]*)\/(lifecycle\.json|result\.md)$/u;

function featurePackageFileOwned(root, path) {
  const match = FEATURE_FILE.exec(path);
  if (!match) return false;
  try {
    const state = JSON.parse(readFileSync(resolveAuthorityArtifactPath("state", { rootDir: root }).path, "utf8"));
    const authority = state?.continuity?.authority;
    const bytes = readFileSync(join(root, path));
    if (match[2] === "result.md") {
      return authority?.result?.path === path && authority.result.sha256 === createHash("sha256").update(bytes).digest("hex");
    }
    const manifest = JSON.parse(bytes.toString("utf8"));
    return manifest?.schema === "pipeline.feature-package.v1" && typeof authority?.prd?.path === "string"
      && dirname(authority.prd.path) === match[1] && manifest.feature?.id === state.continuity.featureId;
  } catch { return false; }
}

/** The paths of `git status --porcelain` (v1) output; a rename yields both its sides. A caller may have trimmed
 * the output, which drops the first line's leading blank status column, so one or two status columns are read. */
export function porcelainPaths(status) {
  const paths = [];
  for (const line of String(status ?? "").split("\n")) {
    const match = /^[ MADRCUT?!]{1,2} (.+)$/u.exec(line);
    if (!match) continue;
    paths.push(...match[1].replace(/^"(.*)"$/u, "$1").split(" -> "));
  }
  return paths;
}

/** owned: the Pipeline's own dirty files; others: everything else that is dirty. */
export function classifyDirtyTree(status, root = null) {
  const paths = porcelainPaths(status);
  const owned = (path) => isPipelineOwnedPath(path) || (typeof root === "string" && featurePackageFileOwned(root, path));
  return { owned: paths.filter(owned), others: paths.filter((path) => !owned(path)) };
}

/** The remedy a clean-tree refusal names, or null when the dirt is not only the Pipeline's own. */
export function pipelineOwnedRemedy(status, root) {
  const { owned, others } = classifyDirtyTree(status, root);
  if (!owned.length || others.length) return null;
  return `only the Pipeline's own state files are uncommitted (${owned.join(", ")}); commit exactly them with: node ${COMMIT_PIPELINE_OWNED_SCRIPT} --root ${root} --agent (an agent session: records the AI-Assisted provenance; a PO terminal commit uses --human instead)`;
}

/** D3: the remedy of a clean-tree refusal, never null for a dirty tree: the one command that commits the Pipeline's
 * own files, or, when other files are dirty, the command that lists them and the order to follow. */
export function cleanTreeRemedy(status, root) {
  const owned = pipelineOwnedRemedy(status, root);
  if (owned !== null) return owned;
  const { owned: own, others } = classifyDirtyTree(status, root);
  if (!others.length) return null;
  return `these uncommitted files are not the Pipeline's own (${others.join(", ")}): list them with \`git status --short\`, then commit or stash them`
    + (own.length ? `; afterwards commit the Pipeline's own files (${own.join(", ")}) with: node ${COMMIT_PIPELINE_OWNED_SCRIPT} --root ${root} --agent` : "");
}

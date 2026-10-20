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
import { fileURLToPath } from "node:url";
import { LEGACY_GUARD_AUDIT, NEUTRAL_GUARD_AUDIT } from "./project-authority.mjs";

export const COMMIT_PIPELINE_OWNED_SCRIPT = fileURLToPath(new URL("../scripts/commit-pipeline-owned.mjs", import.meta.url));
const QUEUE = /^specs\/[A-Za-z0-9][A-Za-z0-9._-]*\/slice-queue\.json$/u;
const AUDIT = new Set([NEUTRAL_GUARD_AUDIT, LEGACY_GUARD_AUDIT]);

export function isPipelineOwnedPath(path) {
  return typeof path === "string" && (QUEUE.test(path) || AUDIT.has(path));
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
export function classifyDirtyTree(status) {
  const paths = porcelainPaths(status);
  return { owned: paths.filter(isPipelineOwnedPath), others: paths.filter((path) => !isPipelineOwnedPath(path)) };
}

/** The remedy a clean-tree refusal names, or null when the dirt is not only the Pipeline's own. */
export function pipelineOwnedRemedy(status, root) {
  const { owned, others } = classifyDirtyTree(status);
  if (!owned.length || others.length) return null;
  return `only the Pipeline's own state files are uncommitted (${owned.join(", ")}); commit exactly them with: node ${COMMIT_PIPELINE_OWNED_SCRIPT} --root ${root} --agent (an agent session: records the AI-Assisted provenance; a PO terminal commit uses --human instead)`;
}

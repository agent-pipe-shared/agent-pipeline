// SPDX-License-Identifier: SUL-1.0
/**
 * authority-restore.mjs (lib) -- the read-only half of the typed self-revert for an edited, bound
 * authority document (PO decisions D31, D137 under AC-115; backlog
 * 2026-10-21-a-stale-plan-invalidation-reopens-the-authority-edit-lock.md).
 *
 * `scripts/authority-restore.mjs` applies a restore; this module only decides whether one is possible
 * (`planAuthorityRestore`) and words the pointer to it (`restoreAdvice`, `reopenDesignNextActionText`),
 * so that `pipeline-state.mjs inspect` can name the restore command as the first repair without
 * duplicating the decision. Nothing here writes.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * State-only mirror of the release conditions of `boundAuthorityDocumentPath()` (lib/guard/denial-route.mjs):
 * this module must not import anything under lib/guard (kernel import-cycle, GMWKC01), so `inspect` derives
 * "the approval is current" from State alone. `scripts/authority-restore.mjs` injects the guard's own predicate
 * for the actual restore, so a divergence can only make the advice absent or the restore refuse, never write.
 */
function stateBindsAuthority(state) {
  const invalidation = state.planInvalidation;
  if (invalidation !== null && typeof invalidation === "object") {
    const invalidatedAt = Date.parse(invalidation.invalidatedAt);
    if (!Number.isFinite(invalidatedAt)) return false;
    const newer = [state.planSubmission?.submittedAt, state.planApproval?.approvedAt]
      .map((value) => Date.parse(value)).some((at) => Number.isFinite(at) && at > invalidatedAt);
    if (!newer) return false;
  }
  return !(state.activeFeature?.phase === "design" && state.planApproved !== true);
}

export const AUTHORITY_RESTORE_SCHEMA = "pipeline.authority-restore.v1";
const SHA256_RE = /^[a-f0-9]{64}$/u;
const STATE_PATHS = [join(".claude", "pipeline-state.json"), join("project", "pipeline-state.json")];
const RESTORE_SCRIPT = fileURLToPath(new URL("../scripts/authority-restore.mjs", import.meta.url));

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function restoreRefusal(code, message, repair) {
  return { ok: false, schema: AUTHORITY_RESTORE_SCHEMA, status: "refused", code, message, repair, written: [] };
}

function readState(root) {
  for (const rel of STATE_PATHS) {
    let raw;
    try { raw = readFileSync(join(root, rel), "utf8"); } catch { continue; }
    try {
      const state = JSON.parse(raw);
      return state !== null && typeof state === "object" && !Array.isArray(state) ? state : null;
    } catch { return null; }
  }
  return null;
}

function safeRelativePath(root, value) {
  if (typeof value !== "string" || value === "" || isAbsolute(value) || /[\x00-\x1f\x7f\\]/u.test(value)) return null;
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return { rel: rel.split(/[\\/]/u).join("/"), absolute };
}

function workingBytes(absolute) {
  try {
    if (lstatSync(absolute).isSymbolicLink()) return { symlink: true };
    return { bytes: readFileSync(absolute) };
  } catch { return { missing: true }; }
}

function committedBytes(root, rev, rel) {
  const result = spawnSync("git", ["-C", root, "cat-file", "blob", `${rev}:${rel}`], { maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

/** Read-only plan: what is bound, what is edited, and whether the approved bytes can be restored. */
export function planAuthorityRestore(root, { commit = "HEAD", isBound = (state) => stateBindsAuthority(state) } = {}) {
  const state = readState(root);
  const authority = state?.continuity?.authority;
  const entries = [["prd", authority?.prd], ["spec", authority?.spec]];
  if (state === null || entries.some(([, e]) => typeof e?.path !== "string" || !SHA256_RE.test(e?.sha256 ?? ""))) {
    return restoreRefusal("AUTHORITY-RESTORE-NOT-BOUND",
      "Pipeline State records no approved PRD/Spec digest pair, so there are no approved bytes to restore.",
      "Nothing to restore here. If the documents are being designed, edit them normally; otherwise run `inspect` of pipeline-state.mjs.");
  }
  const documents = [];
  for (const [kind, entry] of entries) {
    const target = safeRelativePath(root, entry.path);
    if (target === null || !isBound(state, target.absolute)) {
      return restoreRefusal("AUTHORITY-RESTORE-NOT-BOUND",
        `The ${kind} (${entry.path}) is not a currently bound, approved authority document (design is open or an invalidation is newer than the approval).`,
        "The document is editable through the design route; restore applies only while the approval is current.");
    }
    const approved = entry.sha256;
    // A recorded approval binding must agree with the continuity digest; a disagreement means State itself is the problem.
    const gate = state.planApproval?.poGateAuthority;
    const gateDigest = kind === "prd" ? gate?.planSha256 : gate?.specSha256;
    if (typeof gateDigest === "string" && gateDigest !== approved) {
      return restoreRefusal("AUTHORITY-RESTORE-STATE-INCONSISTENT",
        `The approval binding (${gateDigest}) and the continuity digest (${approved}) of the ${kind} disagree.`,
        "Run `inspect` of pipeline-state.mjs and follow its named PO-authority route; restoring bytes cannot repair a disagreeing binding.");
    }
    const working = workingBytes(target.absolute);
    if (working.symlink) {
      return restoreRefusal("AUTHORITY-RESTORE-UNSAFE-TARGET", `${target.rel} is a symbolic link.`,
        "Replace the link with a regular file by hand, then run inspect again.");
    }
    const workingDigest = working.bytes === undefined ? null : sha256(working.bytes);
    const edited = workingDigest !== approved;
    const source = edited ? committedBytes(root, commit, target.rel) : null;
    documents.push({
      kind, path: target.rel, absolute: target.absolute, approvedSha256: approved, workingSha256: workingDigest, edited,
      sourceRev: commit, sourceSha256: source === null ? null : sha256(source), sourceBytes: source,
    });
  }
  const edited = documents.filter((d) => d.edited);
  if (edited.length === 0) {
    return restoreRefusal("AUTHORITY-RESTORE-NOTHING-EDITED",
      "Every bound document already matches its approved digest; there is nothing to restore.",
      "No action needed. To change an approved document, use the design route (`reopen-design`).");
  }
  const bad = edited.find((d) => d.sourceSha256 !== d.approvedSha256);
  if (bad !== undefined) {
    return restoreRefusal("AUTHORITY-RESTORE-SOURCE-MISMATCH",
      `The bytes of ${bad.path} at ${commit} ${bad.sourceSha256 === null ? "cannot be read" : `hash to ${bad.sourceSha256}`}, not the approved ${bad.approvedSha256}.`,
      `Name a commit that holds the approved bytes with --commit <full sha> (find it with: git log --format=%H -- ${bad.path}), or accept the edit through the design route (reopen-design, then submit-plan and approve-plan).`);
  }
  return { ok: true, schema: AUTHORITY_RESTORE_SCHEMA, status: "restorable", documents };
}

/**
 * The restore pointer, or null. Non-null only when the restore would actually succeed: a bound
 * document's working bytes differ from the approved digest AND its committed bytes (HEAD) equal it.
 * Every refusal of the plan (nothing edited, committed bytes differ, design open, ...) yields null,
 * so a repair that cannot work is never named.
 */
export function restoreAdvice({ root }) {
  let plan;
  try { plan = planAuthorityRestore(root); } catch { return null; }
  if (!plan.ok) return null;
  const paths = plan.documents.filter((d) => d.edited).map((d) => d.path);
  return { paths, command: `node ${RESTORE_SCRIPT} restore --root ${root}` };
}

const REOPEN_ONLY = "Current Plan/Spec authority is stale or unavailable. Use the returned sanctioned reopen-design action before resubmission or approval.";

/** The `inspect` nextActionText for a `reopen-design` lifecycle: the restore command first when it can work. */
export function reopenDesignNextActionText(root) {
  const advice = restoreAdvice({ root });
  if (advice === null) return REOPEN_ONLY;
  return `Current Plan/Spec authority is stale: ${advice.paths.join(", ")} differs from the approved digest, and the committed bytes at HEAD still match it. `
    + `First repair, no PO round trip: ${advice.command} (restores the approved bytes; Pipeline State is not written). `
    + "Only if the edit must stay, use the returned sanctioned reopen-design action before resubmission or approval.";
}

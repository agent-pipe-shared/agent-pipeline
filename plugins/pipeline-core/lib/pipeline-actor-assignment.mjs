// SPDX-License-Identifier: SUL-1.0

/**
 * One explicitly scoped Pipeline actor assignment: the attribution label a PO supplied once for the
 * lifecycle commands that only record WHO performed a step (`--by <name>`), kept root-bound in
 * repository-private state next to the first-answers receipt so a restart can offer it back instead of
 * asking again (W1-R2-IDENTITY-ACTOR-REUSE; AC-264, related AC-258; roles/elephant.md EL-36).
 *
 * What this record is NOT, by construction:
 *   - It is never signature or approval authority. The scope set below is closed and deliberately
 *     excludes every verb that records a human decision (approve-plan, approve-push, revoke-plan,
 *     discard-feature, the PO-authority acknowledgements, deploy approvals); a scope outside the set is
 *     refused rather than ignored, and the stored record states `authority: "attribution-only"`.
 *   - It is never invented. A label exists only when the PO supplied it; nothing here reads Git config,
 *     the environment or an account to guess one.
 *   - It is never public. The file lives under the repository's private Git state, is written 0600, and
 *     nothing in this module touches a tracked file, a Resume-Hint or the committed delivery contracts.
 */
import { existsSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readOnboardingIntakeCheckpoint } from "./onboarding-continuity.mjs";
import { resolveInitialAnswersState } from "./onboarding-initial-answers-state.mjs";
import { AUTHOR_IDENTITY_FIELD_MAX_BYTES, initialAnswersReceipt, intakeGitAuthor } from "./project-onboarding-v3-author-identity.mjs";

export const PIPELINE_ACTOR_ASSIGNMENT_SCHEMA = "pipeline.actor-assignment.v1";
export const PIPELINE_HELD_IDENTITY_CHOICE_SCHEMA = "pipeline.onboarding-held-identity-choice.v1";
export const PIPELINE_ACTOR_ASSIGNMENT_FILE = "pipeline-actor-assignment.json";
export const PIPELINE_ACTOR_AUTHORITY = "attribution-only";

// The lifecycle verbs the second Greenfield run asked a separate actor for ("submit/present" and
// "close/push"). Every one of them names the performer; none of them is a human decision.
export const PIPELINE_ACTOR_ATTRIBUTION_SCOPES = Object.freeze(["submit-plan", "present-plan", "close-feature", "push-init"]);

const DEFAULT_FS = Object.freeze({ existsSync, lstatSync, readFileSync });

function validLabel(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= AUTHOR_IDENTITY_FIELD_MAX_BYTES
    && !/[\r\n\0]/u.test(value);
}

/**
 * Validates a PO-supplied assignment. `scopes` defaults to the whole attribution set; any scope outside
 * that closed set (an approval verb, or an unknown one) refuses the whole assignment.
 */
export function normalizePipelineActorAssignment({ label, scopes } = {}) {
  if (!validLabel(label)) return { ok: false, code: "PIPELINE-ACTOR-LABEL-INVALID" };
  const requested = scopes === undefined || scopes === null ? PIPELINE_ACTOR_ATTRIBUTION_SCOPES : scopes;
  if (!Array.isArray(requested) || requested.length === 0
    || !requested.every((scope) => PIPELINE_ACTOR_ATTRIBUTION_SCOPES.includes(scope))) {
    return { ok: false, code: "PIPELINE-ACTOR-SCOPE-NOT-ATTRIBUTION" };
  }
  return { ok: true, assignment: { label: label.trim(), scopes: [...new Set(requested)].sort() } };
}

/** Path of the root-bound private assignment file; throws like the receipt resolver when state is malformed. */
export function pipelineActorAssignmentPath(root, repositoryCapability = "local") {
  return join(dirname(resolveInitialAnswersState(root, repositoryCapability).receipt), PIPELINE_ACTOR_ASSIGNMENT_FILE);
}

/** The stored assignment as `{ label, scopes, assignedAt }`, or null when absent, foreign-root or malformed. */
export function readPipelineActorAssignment(root, repositoryCapability = "local", fs = DEFAULT_FS) {
  try {
    const path = pipelineActorAssignmentPath(root, repositoryCapability);
    if (!fs.existsSync(path)) return null;
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return null;
    const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
    if (parsed?.schema !== PIPELINE_ACTOR_ASSIGNMENT_SCHEMA || parsed.root !== root
      || parsed.authority !== PIPELINE_ACTOR_AUTHORITY) return null;
    const normalized = normalizePipelineActorAssignment({ label: parsed.label, scopes: parsed.scopes });
    return normalized.ok ? { ...normalized.assignment, assignedAt: typeof parsed.assignedAt === "string" ? parsed.assignedAt : null } : null;
  } catch {
    return null;
  }
}

/**
 * Persists the assignment for `root`. Idempotent for an identical label and scope set (the original
 * `assignedAt` is kept); a different label or scope set replaces the record. The private directory must
 * already exist -- it is created by the first-answers receipt writer, never here.
 */
export function writePipelineActorAssignment({ root, repositoryCapability = "local", label, scopes, assignedAt = new Date().toISOString() } = {}) {
  const normalized = normalizePipelineActorAssignment({ label, scopes });
  if (!normalized.ok) return normalized;
  const existing = readPipelineActorAssignment(root, repositoryCapability);
  if (existing !== null && existing.label === normalized.assignment.label
    && existing.scopes.join("\n") === normalized.assignment.scopes.join("\n")) {
    return { ok: true, assignment: existing, written: false };
  }
  let path;
  try { path = pipelineActorAssignmentPath(root, repositoryCapability); }
  catch { return { ok: false, code: "PIPELINE-ACTOR-STATE-UNAVAILABLE" }; }
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify({
      schema: PIPELINE_ACTOR_ASSIGNMENT_SCHEMA,
      root,
      label: normalized.assignment.label,
      scopes: normalized.assignment.scopes,
      authority: PIPELINE_ACTOR_AUTHORITY,
      assignedAt,
    }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } catch {
    try { unlinkSync(temporary); } catch { /* nothing to clean up */ }
    return { ok: false, code: "PIPELINE-ACTOR-WRITE-FAILED" };
  }
  return { ok: true, assignment: { ...normalized.assignment, assignedAt }, written: true };
}

/**
 * The one joint choice offered back after a restart: the Git author (from the root-bound receipt, or the
 * typed intake record) together with the stored actor assignment, or null when neither is held. It is
 * driver output for the PO's own chat only; it is never persisted and never reaches a Resume-Hint.
 */
export function heldIdentityChoice(root, repositoryCapability = "local", fs = DEFAULT_FS) {
  let gitAuthor = null;
  try {
    const receipt = initialAnswersReceipt(root, fs, repositoryCapability);
    gitAuthor = receipt === null ? null : intakeGitAuthor({ status: "present", value: { values: { gitAuthor: { name: receipt.gitAuthorName, email: receipt.gitAuthorEmail } } } });
    if (gitAuthor === null) gitAuthor = intakeGitAuthor(readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability }));
  } catch { /* an unreadable source holds nothing */ }
  const actor = readPipelineActorAssignment(root, repositoryCapability, fs);
  if (gitAuthor === null && actor === null) return null;
  return {
    schema: PIPELINE_HELD_IDENTITY_CHOICE_SCHEMA,
    gitAuthor,
    pipelineActor: actor === null ? null : { label: actor.label, scopes: actor.scopes },
    authority: PIPELINE_ACTOR_AUTHORITY,
    guidance: "Show these held values to the PO once, together, as one choice to keep or change; do not ask for the Git author "
      + "or the actor label again, and not separately. The actor label is attribution only: it may fill --by for the listed "
      + "lifecycle verbs after the PO confirms it in this session, it never approves a plan, a push or a deploy, and it is "
      + "never a signature. Any other --by still needs a value the PO supplies.",
  };
}

// SPDX-License-Identifier: SUL-1.0

/**
 * Author-identity and first-answers-receipt readers of the V3 onboarding library,
 * extracted out of project-onboarding-v3.mjs (which sits on its architecture line
 * bound) so the pending-ask computation has room to change. Behaviour of every
 * extracted function is unchanged except unresolvedAuthorIdentityKeys(), which now also
 * treats a Git author held by the typed intake record as answered (D98). This module imports nothing from
 * project-onboarding-v3.mjs (no import cycle).
 */
import { isSuccessfulSpawn } from "./successful-spawn.mjs";
import { readOnboardingIntakeCheckpoint } from "./onboarding-continuity.mjs";
import { resolveInitialAnswersState } from "./onboarding-initial-answers-state.mjs";

export const PROJECT_ONBOARDING_INITIAL_ANSWERS_RECEIPT_SCHEMA = "pipeline.onboarding-initial-answers.v1";
// A generous single-line bound for a real name or email address -- the same
// role KICKOFF_GOAL_MAX_BYTES plays for the kickoff goal, kept local here
// rather than imported so this stays independent of onboarding-continuity.mjs.
export const AUTHOR_IDENTITY_FIELD_MAX_BYTES = 320;

function validAuthorValue(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= AUTHOR_IDENTITY_FIELD_MAX_BYTES && !/[\r\n\0]/u.test(value);
}

/**
 * The Git author a read intake checkpoint holds, as `{ name, email }`, or null when the record is
 * absent, not present, or does not hold BOTH a valid name and a valid email. Never invents a value.
 */
export function intakeGitAuthor(checkpoint) {
  const author = checkpoint?.status === "present" ? checkpoint.value?.values?.gitAuthor : null;
  return validAuthorValue(author?.name) && validAuthorValue(author?.email)
    ? { name: author.name, email: author.email } : null;
}

function intakeRecordHoldsGitAuthor(root, fs) {
  try {
    return intakeGitAuthor((fs.readOnboardingIntakeCheckpoint ?? readOnboardingIntakeCheckpoint)({
      rootDir: root, repositoryCapability: "local", spawn: fs.spawnSync,
    })) !== null;
  } catch {
    return false;
  }
}

/**
 * Ask — never invent — the repository's commit author when it is unresolved.
 *
 * BOTH 2026-08-09 greenfield runs lost a PO turn to `Author identity unknown` at
 * their first commit: onboarding initialized the repository and never looked at
 * whether anything could commit into it. The agent then hit it several steps
 * later, mid-implementation, where only the human could answer. A warn-only
 * diagnostic (2026-08-09) fixed the discovery timing but not the interruption:
 * it sat as one passive entry in the generic `diagnostics` array, next to dozens
 * of unrelated diagnostic kinds, easy to miss and never blocking or asking
 * anything (backlog: 2026-08-10-git-identity-warn-only-diagnostic-does-not-meet-
 * po-expectation.md). This asks instead, at the exact same point, using the same
 * `collect-input` shape `collectGoalAction()` already uses for the kickoff goal.
 *
 * This deliberately still does NOT set `user.name`/`user.email` itself. An
 * author identity is a claim about who a human is; a seed inventing one would
 * put a fabricated name in permanent history, which is worse than the stop it
 * prevents — that safety property carries over unchanged; only the delivery
 * mechanism (ask, not warn) changed.
 *
 * 2026-08-17 refinement (backlog: 2026-08-17-git-identity-must-be-set-
 * immediately-before-first-commit-not-at-setup-time.md): a live Codex
 * happy-path restart test showed the calling agent asking early as intended,
 * then also running `git config` immediately, before onboarding readiness --
 * the guidance below now explicitly defers the `git config` write until
 * immediately before the repository's first commit; the ask itself is
 * unchanged.
 *
 * Non-fatal by construction: an unreadable Git, a host-managed mount this seed
 * does not own, or any probe failure resolves to "nothing missing" rather than
 * a false alarm.
 */
export function unresolvedAuthorIdentityKeys(root, hostManaged, fs) {
  if (hostManaged) return [];
  // A complete root-bound answer is durable consent to hold these values,
  // not evidence that Git config has already been written. Use this same
  // reader for the initial side-channel ask AND the later intake ask.
  const receipt = initialAnswersReceipt(root, fs);
  if (validAuthorValue(receipt?.gitAuthorName) && validAuthorValue(receipt?.gitAuthorEmail)) return [];
  const configured = (key) => {
    try {
      // Only repository-local identity satisfies this check.  A global or
      // system value is surfaced separately as a proposed candidate with
      // provenance; it is never treated as repository consent.
      const probe = fs.spawnSync("git", ["config", "--get", "--local", key], { cwd: root, encoding: "utf8" });
      return isSuccessfulSpawn(probe) && String(probe.stdout ?? "").trim().length > 0;
    } catch {
      return true; // Unprobeable is not "missing" -- never ask on evidence we do not have.
    }
  };
  const missing = ["user.name", "user.email"].filter((key) => !configured(key));
  // D98 (ALF-K2-GITAUTHOR): a complete author the typed intake record already holds is an answered
  // question, not a pending ask; scripts/onboarding-init.mjs takes the receipt's author from the record.
  // A one-sided, absent or unreadable record holds nothing, so the caller keeps asking for both.
  if (missing.length > 0 && intakeRecordHoldsGitAuthor(root, fs)) return [];
  return missing;
}

// Read-only provenance for the identity a future commit would inherit. Git's
// author environment overrides author.* config, which overrides user.* config.
// A proposed value is never the PO's consent, even when it is repository-local.
export function gitIdentityProvenance(root, fs) {
  const result = {};
  for (const key of ["user.name", "user.email"]) {
    let selected = null;
    let unreadable = false;
    const environmentKey = key === "user.name" ? "GIT_AUTHOR_NAME" : "GIT_AUTHOR_EMAIL";
    const environmentValue = fs.environment?.[environmentKey];
    if (typeof environmentValue === "string" && environmentValue.length > 0) {
      const value = environmentValue.trim();
      selected = value.length > 0 && value.length <= AUTHOR_IDENTITY_FIELD_MAX_BYTES && !/[\r\n\0]/u.test(value)
        ? { value, source: "environment", scope: environmentKey }
        : { value: null, source: "unknown", scope: environmentKey };
    }
    for (const configKey of [key.replace(/^user\./u, "author."), key]) {
      if (selected !== null) break;
      for (const scope of ["local", "global", "system"]) {
        try {
          const probe = fs.spawnSync("git", ["config", `--${scope}`, "--get", configKey], { cwd: root, encoding: "utf8" });
          if (probe?.status === 0 && String(probe.stdout ?? "").trim().length > 0) {
            selected = { value: String(probe.stdout).trim(), source: "git-config", scope, configKey };
            break;
          }
          if (probe?.error) unreadable = true;
        } catch {
          unreadable = true;
        }
      }
    }
    if (selected === null && key === "user.email" && typeof fs.environment?.EMAIL === "string"
      && fs.environment.EMAIL.length > 0) {
      const value = fs.environment.EMAIL.trim();
      selected = value.length > 0 && value.length <= AUTHOR_IDENTITY_FIELD_MAX_BYTES && !/[\r\n\0]/u.test(value)
        ? { value, source: "environment", scope: "EMAIL" }
        : { value: null, source: "unknown", scope: "EMAIL" };
    }
    if (selected === null) {
      selected = { value: null, source: unreadable ? "unknown" : "absent", scope: null };
    }
    result[key] = selected;
  }
  return result;
}

export function initialAnswersReceipt(root, fs, repositoryCapability = "local") {
  try {
    const path = resolveInitialAnswersState(root, repositoryCapability).receipt;
    if (!fs.existsSync(path)) return null;
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) return null;
    const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
    if (parsed?.schema !== PROJECT_ONBOARDING_INITIAL_ANSWERS_RECEIPT_SCHEMA
      || parsed.root !== root
      || !["signature", "chat"].includes(parsed.pushApprovalPreference)
      || (parsed.language !== undefined && parsed.language !== null && !["de", "en"].includes(parsed.language))) return null;
    return parsed;
  } catch {
    return null;
  }
}

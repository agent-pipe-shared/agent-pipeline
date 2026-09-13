// SPDX-License-Identifier: SUL-1.0
/**
 * plan-authority-staging-guard — NVA-STAGINGBOLT-1 / WP-A4 (#102, AC-2, AC-4).
 *
 * WHY THIS FILE EXISTS
 *   A live greenfield project (2026-08-27) reached `phase: implementation` with
 *   `planApproved: true` while every authority pointer in its state named a
 *   document under the onboarding staging directory
 *   (`project/.onboarding-staging/prd_<id>.md` / `.../spec.md`). Those files'
 *   own generated banner says "this staging file is NOT yet bound as project
 *   authority" — but `pipeline-state.mjs`'s `submit-plan`/`approve-plan`
 *   writers never checked that, so a pre-authority draft was bound AS
 *   authority and every downstream gate then agreed with it, correctly,
 *   because everything was consistently bound to the same placeholder
 *   (backlog/items/2026-08-27-plan-approval-binds-a-staging-draft-as-project-authority.md).
 *
 *   This module is the smallest correct bolt: a plan path or spec path that
 *   resolves inside the staging directory, or whose file content carries the
 *   generated pre-authority banner line, is refused, with a typed reason
 *   naming the real promotion action to run instead. It is a refusal, not a
 *   migration — a project already in the bad state is unaffected beyond the
 *   refusal becoming legible for its NEXT submit-plan/approve-plan call.
 *
 * WHERE THE NAMES COME FROM
 *   The staging directory name is `INTAKE_STAGING_DIRNAME`
 *   (`lib/onboarding-continuity.mjs`) — never restated as a literal here, so
 *   the two can never drift. The named promotion action,
 *   `PLAN_AUTHORITY_PROMOTION_SUBCOMMAND`, is the internal command id
 *   `kickoff-promote-apply` `scripts/project-onboarding-v3.mjs` registers in
 *   its own `ONBOARDING_SUBCOMMANDS` table (the CLI form is
 *   `kickoff promote apply`) — the transaction that moves a reviewed staging
 *   PRD/Spec pair to `specs/<feature>/`
 *   (`applyOnboardingKickoffPromotion`/`planOnboardingKickoffPromotion` in
 *   `lib/onboarding-continuity.mjs`). `plan-authority-staging-guard.test.mjs`
 *   imports that real table and asserts the name is a member of it, rather
 *   than trusting the string here to stay honest on its own.
 */
import { join, resolve, sep } from "node:path";
import { readFileSync } from "node:fs";

import { INTAKE_STAGING_DIRNAME } from "./onboarding-continuity.mjs";

/** Typed refusal code shared by both the submit-plan and approve-plan writers. */
export const PLAN_BINDS_PRE_AUTHORITY_DRAFT = "PLAN-BINDS-PRE-AUTHORITY-DRAFT";

/** Backwards-compatibility aliases. */
export const PLAN_AUTHORITY_STAGING_CODE = PLAN_BINDS_PRE_AUTHORITY_DRAFT;
export const PLAN_AUTHORITY_STAGING_UNPROMOTED = PLAN_BINDS_PRE_AUTHORITY_DRAFT;

/** Pre-authority banner snippet/line checked in staging documents. */
export const PRE_AUTHORITY_BANNER_LINE =
  "do not hand-edit -- this staging file is NOT yet bound as project authority";

export const PRE_AUTHORITY_BANNER_SNIPPET =
  "this staging file is NOT yet bound as project authority";

/**
 * The real promotion action's internal command id, exactly as registered in
 * `ONBOARDING_SUBCOMMANDS` (`scripts/project-onboarding-v3.mjs`) — see the
 * header comment above for why this is not a re-derived value.
 */
export const PLAN_AUTHORITY_PROMOTION_SUBCOMMAND = "kickoff-promote-apply";

/** The human/agent-facing CLI invocation shape of that same action. */
export const PLAN_AUTHORITY_PROMOTION_CLI_INVOCATION =
  "node plugins/pipeline-core/scripts/project-onboarding-v3.mjs kickoff promote apply";

/**
 * True when `relativePath` (a repository-relative path string, as bound in a
 * PO-gate authority record) resolves inside the onboarding staging directory
 * under `rootDir`. Mirrors the resolve/join comparison
 * `hooks/guard-lifecycle-ready.mjs`'s `isBootstrapBindingStagingAuthoringWrite()`
 * already uses for the same directory, so the two never disagree about what
 * counts as "inside staging".
 */
export function pathIsInsideOnboardingStaging(rootDir, relativePath) {
  if (typeof relativePath !== "string" || relativePath === "") return false;
  const resolved = resolve(rootDir, relativePath);
  const stagingDirectory = join(rootDir, INTAKE_STAGING_DIRNAME);
  return resolved === stagingDirectory || resolved.startsWith(`${stagingDirectory}${sep}`);
}

/**
 * Refuse a plan-submission/plan-approval authority binding whose plan path or
 * spec path resolves inside the onboarding staging directory, or whose file
 * content carries the generated pre-authority banner line. Returns
 * `{ ok: true }` when neither is staged and neither carries the banner, else
 * `{ ok: false, code, message }` naming which path(s) triggered the refusal and
 * the exact promotion action to run instead.
 */
export function refusePlanAuthorityStagingPath({ rootDir, planPath, specPath, readFileFn = readFileSync }) {
  const staged = [];
  if (pathIsInsideOnboardingStaging(rootDir, planPath)) staged.push("plan");
  if (pathIsInsideOnboardingStaging(rootDir, specPath)) staged.push("spec");

  const banner = [];
  const checkBanner = (relPath, label) => {
    if (typeof relPath !== "string" || relPath === "") return;
    try {
      const fullPath = resolve(rootDir, relPath);
      const content = readFileFn(fullPath, "utf-8");
      if (typeof content === "string" && (
        content.includes(PRE_AUTHORITY_BANNER_SNIPPET)
        || content.includes(PRE_AUTHORITY_BANNER_LINE)
      )) {
        banner.push(label);
      }
    } catch {
      // Handled upstream: missing/unreadable file handled by poGateAuthority
    }
  };

  checkBanner(planPath, "plan");
  checkBanner(specPath, "spec");

  if (staged.length === 0 && banner.length === 0) return { ok: true };

  const reasons = [];
  if (staged.length > 0) {
    reasons.push(
      `the ${staged.join(" and ")} path resolves inside ${INTAKE_STAGING_DIRNAME}, the onboarding staging directory`
    );
  }
  if (banner.length > 0) {
    reasons.push(
      `the ${banner.join(" and ")} file carries a pre-authority staging banner`
    );
  }

  return {
    ok: false,
    code: PLAN_BINDS_PRE_AUTHORITY_DRAFT,
    message:
      `${reasons.join(" and ")} -- these files are explicitly marked as not yet bound as project authority. `
      + `Run \`${PLAN_AUTHORITY_PROMOTION_CLI_INVOCATION}\` (subcommand "${PLAN_AUTHORITY_PROMOTION_SUBCOMMAND}") `
      + "to promote them to specs/<feature>/ first.",
  };
}

// SPDX-License-Identifier: SUL-1.0
// Guard module "lifecycle-gate" (layer 5), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { ProjectOnboardingReadyError, requireProjectOnboardingReady } from "../project-onboarding-ready-gate.mjs";
import { isSessionCapabilityFailurePhase } from "../codex-onboarding-capabilities.mjs";
import { isBootstrapAcknowledgementMarkerMutation, isBootstrapBindingStagingAuthoringWrite } from "../onboarding-staging-authoring.mjs";
import { hasCodexExistingGitControlMount, readCodexHostRepositoryInitAdmission } from "../codex-host-layout.mjs";
import { rebaseAuthorityPermitsCommand, rebaseAuthorityPermitsPath } from "../rebase-authority.mjs";
import { writeTargetPath } from "../tool-write-target.mjs";
import { HOST_INIT_CROSS_VIEW_STATUSES, INTAKE_LIFECYCLE_STATUSES, LAUNCH_SCRIPT, REBASE_READINESS_LIFECYCLE_STATUSES, RESTART_RESUME_HINT_INPUT_PATH, SCRATCH_LIFECYCLE_STATUSES, WRITE_TOOLS } from "./constants.mjs";
import { exactReadyReceipt, verdict } from "./verdict.mjs";
import { blocked, externalRestartOnly } from "./denial-route.mjs";
import { isBootstrapBindingScratchWrite, isIntakeLifecycleScratchMkdir, isIntakeLifecycleScratchWrite, isPartialLifecycleIncidentReportWrite, isPartialLifecycleScratchDirCreate, isRestartResumeHintCapture, isRestartResumeHintInputWrite, isRestartResumeHintInspect, restartResumeHintNearMissWrite, w04IsNonAuthorityRecordWrite } from "./write-scope.mjs";
import { architectureAdoptionAuthorityVerdict, architectureFitnessAuthorityVerdict, minimumRigorObservation } from "./entry-gates.mjs";
import { rootIdentityMismatch } from "./sanctioned-args-onboarding.mjs";
import { isExactObservedInstalledPluginAttestationAction, isExactObservedOnboardingNextAction, isExactObservedRunnerPermissionsPlannerAction, isExactObservedRunnerPermissionsRepairAction, isSanctionedGhReadOnlyDiagnostic, isSanctionedLifecycleCommand } from "./command-catalogue.mjs";
import { activeRebaseAuthority, lifecycleRebaseAdmissionNotice } from "./rebase-lane.mjs";

export function evaluateAfterGrammarAdmission(input, root, toolName, dependencies) {
  // The exact resume-hint readback is passive and is itself needed to diagnose
  // which non-ready lifecycle status applies. Admit it by shape before asking
  // readiness, otherwise an earlier repository/runtime observation can make
  // the prescribed diagnostic unreachable.
  if (toolName === "Bash"
    && isRestartResumeHintInspect((input.tool_input.command ?? input.tool_input.CommandLine), root)) {
    return verdict(0);
  }
  if (toolName === "Bash" && (input.tool_input.command ?? input.tool_input.CommandLine).includes(LAUNCH_SCRIPT)) {
    return externalRestartOnly();
  }

  // A physically contained scratch file is a recovery surface in every lifecycle state,
  // including malformed or unavailable readiness observations. All earlier cross-root,
  // protected-path and shell checks have already run. This is restricted to ordinary
  // Write/Edit and a single, parsed mkdir shape; it grants no general shell mutation.
  if (!restartResumeHintNearMissWrite(input, root)
    && (isBootstrapBindingScratchWrite(input, root, dependencies)
    || (toolName === "Bash"
      && isIntakeLifecycleScratchMkdir((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies)))) {
    return verdict(0);
  }

  let receipt;
  try {
    receipt = (dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({
      rootDir: root,
      intent: "session",
      runner: dependencies.runner,
    });
  } catch (error) {
    dependencies.lifecycleReturnedDenial = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY" && error.intent === "session"
      ? {reason: error.code, status: error.lifecycleStatus} : null;
    // NVA-REBDEAD-1 (backlog/items/2026-09-02-the-rebase-authority-is-resolved-and-advertised-but-not-executable.md, decision 2): readiness for the resolved
    // rebase authority's own narrow surface is RE-BASED on orig-head, never lifted outright.
    // The resolver already proved orig-head is validly approved and implementing (Requirement
    // 1, lib/rebase-authority.mjs) before it ever named a conflict path or a permitted
    // command; an action already inside that narrow, deny-by-default surface therefore needs
    // no fresh observation of the CONFLICTED working tree, which is exactly the file this
    // authority exists to let a session repair -- that circularity is the whole defect. Scoped
    // twice over: to a genuine PORG-NOT-READY session-intent refusal (never a
    // PORG-INVALID-OBSERVATION/PORG-INTENT/PORG-RUNNER/PORG-OBSERVATION-UNAVAILABLE fault,
    // which all stay hard failures), and to the resolver's own conflictPaths/command
    // predicates -- never to "a rebase is active" (see activeRebaseAuthority()'s own header
    // and rebaseAuthorityPermitsPath()'s deny-by-default docstring). Neither predicate is
    // re-decided here; both are the resolver's, imported unmodified.
    // NVA-REBDEAD-F5B: widened to the MEASURED set of lifecycleStatus values an
    // unparseable-or-inconsistent lifecycle state file actually produces
    // (REBASE_READINESS_LIFECYCLE_STATUSES above; backlog/evidence/2026-09-02-nva-rebdead-f5-
    // lifecycle-status-measurement.json). The prior narrowing (8f1c0737) admitted only
    // "continuity-damaged", which excludes "continuity-observation-unavailable" -- the status
    // the live incident this whole package exists for (real conflict markers, an unparseable
    // state file) actually produces, re-opening the deadlock 10d11e58 closed. Read
    // "continuity-observation-unavailable" as a catch-all, not as "conflict markers"
    // specifically: per project-onboarding-v3.mjs:2905's own docstring it covers every
    // classification that is neither valid, damaged, nor absent-pristine, digest disagreements
    // included -- the admission surface named here is genuinely wider than "a rebase
    // conflict", bounded only by activeRebaseAuthority() and
    // rebaseAuthorityPermitsPath()'s deny-by-default conflictPaths membership below. No other
    // not-ready status, including restart-required, is swallowed here; restart-required keeps
    // its own narrower sibling exemption further down.
    const sessionNotReady = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && REBASE_READINESS_LIFECYCLE_STATUSES.has(error.lifecycleStatus);
    if (sessionNotReady) {
      const rebase = activeRebaseAuthority(root, dependencies);
      if (rebase !== null) {
        const admitted = WRITE_TOOLS.includes(toolName)
          ? rebaseAuthorityPermitsPath(rebase, writeTargetPath(input.tool_input, toolName))
          : toolName === "Bash"
            && rebaseAuthorityPermitsCommand(rebase, (input.tool_input.command ?? input.tool_input.CommandLine));
        if (admitted) {
          return verdict(0, `${lifecycleRebaseAdmissionNotice(
            rebase, "the onboarding-readiness gate", WRITE_TOOLS.includes(toolName) ? "write" : "command",
          )}\n`);
        }
      }
    }
    // Codex 0.145 may execute PreToolUse against the physical host Git
    // directory while the successful bootstrap command sees protected virtual
    // control mounts. Accept only the explicit host-init admission written by
    // the confirmed lifecycle action and bound to this root, stable authority,
    // and immutable kickoff history, and only when the native observation
    // failed with the two exact repository-control statuses produced by that
    // cross-view mismatch. App Server, runtime, continuity, malformed
    // observations, and unknown exceptions must never inherit this admission.
    // The prepared sprint:NONE follow-up owns replacing this narrow hotfix
    // fallback with one native cross-view session attestation.
    const crossViewRepositoryFailure = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && HOST_INIT_CROSS_VIEW_STATUSES.has(error.lifecycleStatus);
    if (crossViewRepositoryFailure) {
      try {
        const admission = (dependencies.readCodexHostRepositoryInitAdmissionFn
          ?? readCodexHostRepositoryInitAdmission)(root);
        if (admission?.gitVersion) return verdict(0);
      } catch {}
      try {
        const existingControlMount = (dependencies.hasCodexExistingGitControlMountFn
          ?? hasCodexExistingGitControlMount)(root);
        if (existingControlMount === true) return verdict(0);
      } catch {}
    }
    const restartRequired = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "restart-required";
    if (restartRequired && (isRestartResumeHintInputWrite(input, root)
      || (toolName === "Bash" && (isRestartResumeHintCapture((input.tool_input.command ?? input.tool_input.CommandLine), root)
        || isRestartResumeHintInspect((input.tool_input.command ?? input.tool_input.CommandLine), root))))) {
      return verdict(0);
    }
    // RESTART_LIFECYCLE_SCRATCH_WRITE (backlog: 2026-08-29-scratch-write-exemption-does-not-
    // cover-restart-required.md): the restart-required twin of intakeLifecycleScratchWrite
    // below -- a session stuck at restart-required could write NOTHING at all besides the one
    // fixed resume-hint-input path above, including its own scratch/ throwaway notes,
    // contradicting the pipeline-start skill's own claim that scratch/ is always safe and
    // leaving a stuck session with no route to persist even a diagnostic note about its own
    // stuck state. Reuses isIntakeLifecycleScratchWrite() / isIntakeLifecycleScratchMkdir()
    // unmodified -- "is this write inside scratch/" does not differ by status. Excludes a
    // restart-resume-hint near miss (restartResumeHintNearMissWrite(), which already returns
    // false unconditionally for non-write tools, so calling it here for a Bash mkdir is safe)
    // so the NVA-MICRO-1 near-miss diagnostic above is never silently swallowed by this wider,
    // generic scratch lane -- a write to `scratch/.resume-hint-input.json` must still surface
    // the specific "wrong directory" hint, not a bare verdict(0) that would make the operator
    // believe the write landed somewhere it is actually read from.
    const scratchLifecycleWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && SCRATCH_LIFECYCLE_STATUSES.has(error.lifecycleStatus)
      && !restartResumeHintNearMissWrite(input, root)
      && (isIntakeLifecycleScratchWrite(input, root, dependencies)
        || (toolName === "Bash" && isIntakeLifecycleScratchMkdir((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies)));
    if (scratchLifecycleWrite) return verdict(0);
    // NVA-BL-INTAKEBIND-1: the one narrow Edit/Write admission that lets a real
    // session perform the design's own intended staging-PRD/spec review step
    // (isBootstrapBindingStagingAuthoringWrite() above), gated on the exact
    // lifecycleStatus a repo sitting at checkpoint transactionState "generated"
    // observes.
    const bootstrapBindingStagingAuthoringWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "bootstrap-binding-required"
      && isBootstrapBindingStagingAuthoringWrite(input, root)
      && !isBootstrapAcknowledgementMarkerMutation(input);
    if (bootstrapBindingStagingAuthoringWrite) return verdict(0);
    const bootstrapBindingScratchWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "bootstrap-binding-required"
      && !restartResumeHintNearMissWrite(input, root)
      && isBootstrapBindingScratchWrite(input, root, dependencies);
    if (bootstrapBindingScratchWrite) return verdict(0);
    // ALFRED-W0-4 (backlog 2026-10-04-approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes):
    // an invalid OBSERVATION says nothing about the lifecycle, so it must not strand a session
    // that only wants to record a defect, a decision or a scratch note. Never keyed on a typed
    // lifecycleStatus (an invalid observation has none) and never for PORG-NOT-READY.
    const invalidObservationRecordWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-INVALID-OBSERVATION"
      && error.intent === "session"
      && WRITE_TOOLS.includes(toolName)
      && !restartResumeHintNearMissWrite(input, root)
      && w04IsNonAuthorityRecordWrite(input, toolName, root, dependencies);
    if (invalidObservationRecordWrite) return verdict(0);
    const exactObservedOnboardingNextAction = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && toolName === "Bash"
      && isExactObservedOnboardingNextAction((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies);
    if (exactObservedOnboardingNextAction) return verdict(0);
    const exactObservedInstalledPluginAttestationAction = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-INVALID-OBSERVATION"
      && error.intent === "session"
      && toolName === "Bash"
      && isExactObservedInstalledPluginAttestationAction((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies);
    if (exactObservedInstalledPluginAttestationAction) return verdict(0);
    const exactObservedRunnerPermissionsRecoveryAction = error instanceof ProjectOnboardingReadyError
      // A well-formed projection-drift observation is deliberately a non-ready
      // lifecycle state.  The old invalid-observation-only condition made the
      // exact recovery route below unreachable for the producer's normal
      // result, so the guard blocked the one repair it had just prescribed.
      // Retain the existing invalid-observation lane for its narrow historical
      // compatibility case, but admit PORG-NOT-READY only for this one typed
      // lifecycle state and only after the full observed-action equality check.
      && ((error.code === "PORG-NOT-READY" && error.lifecycleStatus === "projection-drift")
        || error.code === "PORG-INVALID-OBSERVATION")
      && error.intent === "session"
      && toolName === "Bash"
      && (isExactObservedRunnerPermissionsRepairAction((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies)
        || isExactObservedRunnerPermissionsPlannerAction((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies));
    if (exactObservedRunnerPermissionsRecoveryAction) return verdict(0);
    // NVA-LCREADONLY-1 (backlog: 2026-08-17-partial-lifecycle-blocks-read-only-diagnosis-
    // and-tmp-fallback.md): a session stuck at `partial` has no route at all today to
    // persist a report of its own stuck state -- the in-root write is refused by this very
    // gate as GUARD-LIFECYCLE-NOT-READY, and a `/tmp` fallback is refused separately as
    // GUARD-CROSS-REPO-MUTATION (a governed session may write only inside its own physical
    // project root). Additive to isReadOnlyDiagnosticCommand()'s existing read-only lane,
    // never a widening of it: this is the write side, narrowed to the one scratch-directory
    // creation and the one fixed incident-report file
    // (isPartialLifecycleScratchDirCreate() / isPartialLifecycleIncidentReportWrite()
    // above). Scoped to `lifecycleStatus === "partial"` only -- every OTHER PORG-NOT-READY
    // status is unaffected by THIS branch and keeps refusing both operations exactly as
    // before through it, and this is strictly additive: it never touches GUARDALLOW-1's
    // `plan-partial-authority` branch or any other existing allowlist entry. (restart-required
    // no longer belongs in that "every other status" set as of
    // RESTART_LIFECYCLE_SCRATCH_WRITE above: both `mkdir scratch` and a
    // `scratch/incident-report.md` write are now ALSO admitted at restart-required, via that
    // separate, more general scratch lane -- not via this partial-only one.)
    const partialLifecycleDiagnosisWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "partial"
      && ((toolName === "Bash" && isPartialLifecycleScratchDirCreate((input.tool_input.command ?? input.tool_input.CommandLine), root))
        || isPartialLifecycleIncidentReportWrite(input, root));
    if (partialLifecycleDiagnosisWrite) return verdict(0);
    // NVA-GF-SCRATCH (backlog: 2026-08-28-a-scratch-write-is-refused-during-intake-against-the-
    // documented-exemption.md): a fresh, not-yet-onboarded session sitting at `intake-required`
    // or `intake-design-questions-required` could write NOTHING at all, including its own
    // scratch/ throwaway notes -- contradicting the pipeline-start skill's own claim that
    // scratch/ is always safe, and giving a consumer project (no plugin source to read) no
    // route forward at all. Scoped to INTAKE_LIFECYCLE_STATUSES only -- every other
    // PORG-NOT-READY status is unaffected and keeps refusing both operations exactly as before.
    const intakeLifecycleScratchWrite = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && INTAKE_LIFECYCLE_STATUSES.has(error.lifecycleStatus)
      && (isIntakeLifecycleScratchWrite(input, root, dependencies)
        || (toolName === "Bash" && isIntakeLifecycleScratchMkdir((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies)));
    if (intakeLifecycleScratchWrite) return verdict(0);
    // NVA-MICRO-1 (backlog: 2026-08-09-restart-resume-hint-write-misses-the-project-
    // prefix.md): a restart-required write that already missed the exact admission above
    // (isRestartResumeHintInputWrite) but names the same basename gets the correct path
    // spelled out directly in the denial, instead of only the generic message -- named here,
    // never widening what is actually admitted (verdict(0) is still returned only from the
    // exact-match branch above).
    const restartResumeHintNearMissHint = restartRequired && restartResumeHintNearMissWrite(input, root)
      ? `This write's basename matches the one resume-hint input this gate admits during a `
        + `restart, but the path is wrong. The only path admitted is exactly `
        + `${RESTART_RESUME_HINT_INPUT_PATH} (relative to the project root).`
      : null;
    // NVA-T-READYKEYS: named separately from the "not ready" branch above -- an observation
    // that failed the ready-gate's own shape validation is a different cause from the
    // lifecycle genuinely reporting not-ready, and the two must not render identically.
    const invalidObservation = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-INVALID-OBSERVATION"
      && error.intent === "session";
    const sessionCapabilityFailurePhase = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "session-capability-unavailable"
      && isSessionCapabilityFailurePhase(error.sessionCapabilityFailurePhase)
      ? error.sessionCapabilityFailurePhase
      : null;
    // NVA-R15-ROOTADMIT: same discoverability fix as restartResumeHintNearMissHint above,
    // for a different near miss -- a recognised sanctioned-script invocation refused only
    // because its --root token resolves to a different physical location than this guard's
    // own root. Mutually exclusive with restartResumeHintNearMissHint by construction (one
    // fires only for WRITE_TOOLS, the other only for toolName === "Bash"), so a plain
    // fallback is enough -- never both truthy for the same denial.
    const rootMismatch = toolName === "Bash"
      ? rootIdentityMismatch((input.tool_input.command ?? input.tool_input.CommandLine), root)
      : null;
    const rootIdentityMismatchHint = rootMismatch
      ? `This command's shape is otherwise recognised, but its --root value `
        + `("${rootMismatch.typedValue}", resolving to ${rootMismatch.resolvedTyped}) is not `
        + `the same project root as this guard's own root (${rootMismatch.root}) -- the `
        + "refusal is a root-identity mismatch, not an unadmitted command shape."
      : null;
    return toolName === "Bash"
      && (isSanctionedLifecycleCommand((input.tool_input.command ?? input.tool_input.CommandLine), root)
        || isSanctionedGhReadOnlyDiagnostic((input.tool_input.command ?? input.tool_input.CommandLine), root))
      ? verdict(0)
      : blocked(
        "GUARD-LIFECYCLE-NOT-READY",
        error instanceof ProjectOnboardingReadyError
          && error.code === "PORG-NOT-READY"
          && error.intent === "session"
          ? error.lifecycleStatus
          : null,
        [],
        "",
        null,
        null,
        restartResumeHintNearMissHint ?? rootIdentityMismatchHint,
        invalidObservation,
        true,
        sessionCapabilityFailurePhase,
      );
  }
  if (!exactReadyReceipt(receipt)) return blocked();
  // D4 / AC-17: readiness proves the session can act, but not that the active
  // work package has a resolved architecture adoption disposition. Enforce at
  // the one command that grants implementation authority, after readiness so
  // an unready session retains its established recovery routes.
  if (toolName === "Bash") {
    const adoptionVerdict = architectureAdoptionAuthorityVerdict(
      root,
      input.tool_input.command ?? input.tool_input.CommandLine,
      dependencies,
    );
    if (adoptionVerdict !== null) return adoptionVerdict;
    const fitnessVerdict = architectureFitnessAuthorityVerdict(
      root,
      input.tool_input.command ?? input.tool_input.CommandLine,
      dependencies,
    );
    if (fitnessVerdict !== null) return fitnessVerdict;
    const rigorVerdict = minimumRigorObservation(
      root,
      input.tool_input.command ?? input.tool_input.CommandLine,
      dependencies,
    );
    if (rigorVerdict !== null) return rigorVerdict;
  }
  return verdict(0);
}

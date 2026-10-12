#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Codex implementation-write guard for already Pipeline-governed roots. */

import { readFileSync } from "node:fs";
import { isDirectInvocation, isDirectInvocation as isGovernanceHookEntry } from "../lib/entrypoint.mjs";
import { machinePlaneFilePath } from "../lib/machine-plane.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { VALID_RUNNERS } from "../lib/guard/constants.mjs";
import { blocked } from "../lib/guard/denial-route.mjs";
import { evaluateLifecycleReadyGuard } from "../lib/guard/evaluate.mjs";

export { BASE_GOVERNANCE_MARKERS, MANIFEST_FAILURE_WARNING, governanceMarkers } from "../lib/guard/constants.mjs";
export { ADMITTED_GRAMMAR_SHAPES } from "../lib/guard/grammar-denials.mjs";
export { isProjectWritePath, isRealpathedWithinBoundary } from "../lib/guard/path-containment.mjs";
export { isBoundedCatPipeline, isReadOnlyDiagnosticCommand, retryActionsForDeniedCommand } from "../lib/guard/shell-grammar.mjs";
export { isNarrowRepositoryRecoveryCommand, isSanctionedStartPreflightInvocation } from "../lib/guard/sanctioned-args-scripts.mjs";
export { claudeSessionMemoryDirectory, isClaudeSessionMemoryWritePath, isMachinePlaneWritePath, isRestartResumeHintCapture, isRestartResumeHintInputWrite, isRestartResumeHintInspect } from "../lib/guard/write-scope.mjs";
export { DISPATCH_RECORD_COLLISION_DENIAL_CODE, DISPATCH_RECORD_INTERIM_OUTCOME, DISPATCH_RECORD_OWNER_SCHEMA, EVIDENCE_HOST_PATH_DENIAL_CODE, checkDispatchRecordCollision, claimDispatchRecordOwnership, extractWritePayload, isEvidenceArtifactPath } from "../lib/guard/dispatch-record-lane.mjs";
export { GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS, gateStrengthShellNeedleFor, isMeaningfulGateStrengthShellNeedle, signedQualityPackageCommandAdmission } from "../lib/guard/gate-strength-lane.mjs";
export { isOutsideRootBoundedDiagnosticRead, isOutsideRootSingleCommandRead } from "../lib/guard/read-scope.mjs";
export { isSanctionedGhReadOnlyDiagnostic, isSanctionedLifecycleCommand } from "../lib/guard/command-catalogue.mjs";
export { isAgentPoPublicCommand, isForbiddenCrossRepositoryMutation, isHostOnlyClaudeCaptureInvocation, isHumanPoSigningCommand } from "../lib/guard/po-commands.mjs";
export { evaluateLifecycleReadyGuard } from "../lib/guard/evaluate.mjs";

// Repository admission precedes hook input hardening and all governed effects.
if (isGovernanceHookEntry(import.meta.url) && !observeGovernanceScope({ rootDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) process.exit(0);

// MACHPATH-1/AC-9: machinePlaneFilePath() is re-exported here so no existing test import
// changes -- lib/machine-plane.mjs is now the sole owner of that derivation (no second
// copy anywhere in this plugin). isMachinePlaneWritePath() below keeps its own guard-side
// admission logic (the exact-identity check, the existing-symlink refusal, the containment
// walk) unchanged; only where the path comes from moved.
export { machinePlaneFilePath };

/** Read an explicit `--runner <value>` from this process's own argv (ADR-0051). */
function runnerFromArgv(argv) {
  const index = argv.indexOf("--runner");
  return index === -1 ? null : (argv[index + 1] ?? null);
}

export function main(rawInput = undefined, dependencies = {}) {
  if (!observeGovernanceScope({ rootDir: dependencies.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) return 0;
  const writeError = dependencies.writeErrorFn ?? ((value) => process.stderr.write(value));
  let input;
  try {
    const raw = rawInput ?? readFileSync(0, "utf8");
    input = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    const result = blocked();
    writeError(result.stderr);
    return result.exitCode;
  }
  // Runner identity is threaded explicitly at this CLI boundary (ADR-0051):
  // read from this process's own argv, never from the ambient environment.
  // guard-lifecycle-ready.mjs has exactly two production callers --
  // codex-pretool-guard.mjs's boundedSpawn and guard-apply-patch.mjs's GUARDS
  // spawn list -- both of which always supply `--runner codex`. An absent or
  // invalid flag fails closed the same way any other unmet lifecycle
  // precondition does -- it never silently defaults (backlog:
  // ready-gate-env-var-runner-authority).
  const runner = dependencies.runner ?? runnerFromArgv(dependencies.argv ?? process.argv.slice(2));
  if (!VALID_RUNNERS.has(runner)) {
    const result = blocked();
    writeError(result.stderr);
    return result.exitCode;
  }
  const result = evaluateLifecycleReadyGuard(input, { ...dependencies, runner });
  if (result.stderr) {
    writeError(result.stderr);
  }
  return result.exitCode;
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main();

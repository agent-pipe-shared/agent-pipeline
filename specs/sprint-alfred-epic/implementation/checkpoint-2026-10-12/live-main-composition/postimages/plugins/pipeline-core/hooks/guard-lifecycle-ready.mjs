#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Codex implementation-write guard for already Pipeline-governed roots. */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { consumeSourceOwnedContinuityVerificationExchange, inspectSourceOwnedContinuityVerificationGuardContext, finishSourceOwnedContinuityVerificationGuardExchange } from "../lib/session-requester-bridge.mjs";
import { isSourceOwnedContinuityVerificationCommand } from "../lib/guard/command-catalogue.mjs";
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
if (isGovernanceHookEntry(import.meta.url) && !process.argv.slice(2).includes("--consume-owned-verification-guard")
  && !observeGovernanceScope({ rootDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) process.exit(0);

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

// Dedicated Controller entry. Caller stdin/dependencies cannot issue admission.
// The fixed FD number is transport syntax only; requester authentication is mandatory.
export async function runSourceOwnedContinuityVerificationGuard() {
  const argv = process.argv.slice(2);
  const exact = ["--runner", "codex", "--consume-owned-verification-guard", "--channel-fd", "4"];
  if (argv.length !== exact.length || exact.some((value, index) => argv[index] !== value)) {
    process.stderr.write("OSV-GUARD-INVOCATION-INVALID: fixed Controller guard invocation required.\n");
    return 2;
  }
  let guardContextHandle;
  let commandSha256;
  let finished = false;
  try {
    ({ guardContextHandle } = await consumeSourceOwnedContinuityVerificationExchange());
    const observed = inspectSourceOwnedContinuityVerificationGuardContext({ guardContextHandle });
    const dependencies = { projectDir: observed.repository, runner: "codex", sourceOwnedVerificationGuardContextHandle: guardContextHandle };
    commandSha256 = createHash("sha256").update(observed.command, "utf8").digest("hex");
    if (!observeGovernanceScope({ rootDir: observed.repository }).requiresEnforcement
      || !isSourceOwnedContinuityVerificationCommand(observed.command, observed.repository, dependencies)) throw new Error("OSV-GUARD-CONTEXT-INVALID");
    const input = { tool_name: "Bash", tool_input: { command: observed.command } };
    const result = evaluateLifecycleReadyGuard(input, dependencies);
    const exitCode = result.exitCode === 0 ? 0 : 2;
    if (result.stderr) process.stderr.write(result.stderr);
    finished = true;
    const acknowledged = await finishSourceOwnedContinuityVerificationGuardExchange({ guardContextHandle, decision: {
      exitCode, code: exitCode === 0 ? "OSV-GUARD-ADMITTED" : "OSV-GUARD-REFUSED", commandSha256,
    } });
    if (acknowledged?.status !== "acknowledged" || Object.keys(acknowledged).length !== 1) throw new Error("OSV-GUARD-ACK-INVALID");
    return exitCode;
  } catch {
    // Lost/failed acknowledgment cannot become local permission or another claim.
    if (guardContextHandle !== undefined && commandSha256 !== undefined && !finished) {
      finished = true;
      try { await finishSourceOwnedContinuityVerificationGuardExchange({ guardContextHandle, decision: {
        exitCode: 2, code: "OSV-GUARD-REFUSED", commandSha256,
      } }); } catch {}
    }
    process.stderr.write("OSV-GUARD-EXCHANGE-FAILED: authenticated owning verification could not be admitted.\n");
    return 2;
  }
}

if (isDirectInvocation(import.meta.url)) {
  if (process.argv.slice(2).includes("--consume-owned-verification-guard")) {
    runSourceOwnedContinuityVerificationGuard().then(code => { process.exitCode = code; }, () => { process.exitCode = 2; });
  } else process.exitCode = main();
}

// SPDX-License-Identifier: SUL-1.0
// Guard module "evaluate" (layer 6), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { inspectProjectOnboardingV3 } from "../project-onboarding-v3.mjs";
import { findResidualHostPath } from "../../scripts/capture-evidence.mjs";
import { isBootstrapAcknowledgementMarkerMutation } from "../onboarding-staging-authoring.mjs";
import { DEVPLAN_SHELL_DENIAL_CODE, hooksDisableSettingsWriteFinding, rebaseAuthorityAdmissionNotice, rebaseAuthorityDisclosure } from "../guard-devplan-policy.mjs";
import { rebaseAuthorityPermitsCommand, rebaseAuthorityPermitsPath } from "../rebase-authority.mjs";
import { TESTPATH_SHELL_DENIAL_CODE } from "../protected-test-paths.mjs";
import { writeTargetPath } from "../tool-write-target.mjs";
import { parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { observeGovernanceScope } from "../governance-scope.mjs";
import { CLAUDE_BASH_SHELL_DIALECT_PLATFORM, READ_TOOLS, SHELL_TOOLS, WRITE_TOOLS } from "./constants.mjs";
import { GRAMMAR_DENIAL_GUIDANCE, READ_COMMAND_UNSUPPORTED_CODE, READ_SCOPE_DENIAL_CODE, READ_SCOPE_DENIAL_GUIDANCE } from "./grammar-denials.mjs";
import { isProjectWritePath } from "./path-containment.mjs";
import { grammarRemediation, isReadOnlyDiagnosticCommand, isRejectedReadFamilyCommand, qp4OperandResolvesOutsideRoot, rejectedGrammarElement, retryActionsForDeniedCommand, win32QuotedDrivePathCommand } from "./shell-grammar.mjs";
import { CROSS_REPO_DENIAL_CODE, CROSS_REPO_DENIAL_GUIDANCE, bootstrapAcknowledgementMarkerBlocked, crossRepositoryMutationBlocked, verdict, withLifts } from "./verdict.mjs";
import { evaluateBootstrapReceiptGate, recordBootstrapPreflightReceipt } from "./bootstrap-receipt.mjs";
import { blocked, boundAuthorityDocumentPath, humanOverrideRoute, protectedAuthorityDocumentWriteOnly, protectedStateWriterOnly } from "./denial-route.mjs";
import { isNarrowRepositoryRecoveryCommand, isSanctionedStartPreflightInvocation } from "./sanctioned-args-scripts.mjs";
import { isClaudeSessionMemoryWritePath, isIntakeLifecycleScratchWrite, isMachinePlaneWritePath } from "./write-scope.mjs";
import { DISPATCH_RECORD_COLLISION_DENIAL_CODE, EVIDENCE_HOST_PATH_DENIAL_CODE, blockedDispatchRecordCollision, blockedEvidenceHostPath, checkDispatchRecordCollision, claimDispatchRecordOwnership, extractWritePayload, isEvidenceArtifactPath } from "./dispatch-record-lane.mjs";
import { gateStrengthShellRefusal, protectedTestPathShellBlocked, protectedTestPathShellFaultBlocked, protectedTestPathShellRefusalHit } from "./gate-strength-lane.mjs";
import { exactClaudeTaskOutputBashRead, exactClaudeTaskOutputPowerShellRead, isOutsideRootBoundedDiagnosticRead, isOutsideRootReadOnlyAndChain, isOutsideRootSingleCommandRead, readToolScopeVerdict, sessionReadScopeRoots } from "./read-scope.mjs";
import { externalPoSigningOnly, isForbiddenCrossRepositoryMutation, isHostOnlyClaudeCaptureInvocation, isHumanPoProfileChangeCommand, isHumanPoSigningCommand } from "./po-commands.mjs";
import { activeRebaseAuthority, lifecycleRebaseAdmissionNotice, rebaseAuthorityShapeBlocked, rebaseAuthorityShapeRefusal } from "./rebase-lane.mjs";
import { isFirstDenialThisScope, withLifecycleReturnedActionTelemetry } from "./denial-telemetry.mjs";
import { devPlanShellBlocked, devPlanShellFaultBlocked, devPlanShellRefusalHit } from "./devplan-shell-lane.mjs";
import { evaluateAfterGrammarAdmission } from "./lifecycle-gate.mjs";
import { powerShellScopeVerdict, sanctionedPowerShellNodeCall } from "./powershell-dialect.mjs";
import { envDumpClassifierErrorRefusal, envDumpShellRefusal } from "./env-dump-lane.mjs";

/**
 * NVA-B-REBWIRE-1 / Requirement 5, the half that is not a relief: EVERY refusal this guard
 * emits while an authorized rebase is in progress names the route forward.
 *
 * Attached at the single exit rather than at each of the ~20 refusal sites, for the reason the
 * item was filed: the live failure was not a wrong verdict, it was a correct verdict that named
 * no route, and a per-site opt-in would reintroduce that the first time a new denial is added.
 * "An empty `retryActions` array during an active rebase is itself a defect" is therefore a
 * property of the exit, not of any one caller.
 *
 * It cannot change a verdict: only `exitCode === 2` is touched, and only by appending. Every
 * failure mode of the resolution collapses to "append nothing", so a refusal is never softened,
 * and a session with no rebase in progress sees byte-identical output to before.
 */
function withRebaseAuthorityDisclosure(result, dependencies, memo) {
  if (result.exitCode !== 2) return result;
  try {
    const requestedRoot = dependencies.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    const root = (dependencies.realpathSyncFn ?? realpathSync)(resolve(requestedRoot));
    const active = activeRebaseAuthority(root, { ...dependencies, rebaseAuthorityMemo: memo });
    if (active === null) return result;
    return verdict(result.exitCode, `${result.stderr ?? ""}${rebaseAuthorityDisclosure(active)}`);
  } catch {
    return result;
  }
}

export function evaluateLifecycleReadyGuard(input, dependencies = {}) {
  if (!observeGovernanceScope({ rootDir: dependencies.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) return verdict(0);
  const memo = { resolved: false, value: null };
  const scoped = { ...dependencies, rebaseAuthorityMemo: memo };
  return withRebaseAuthorityDisclosure(evaluateLifecycleReadyGuardCore(input, scoped), dependencies, memo);
}

function evaluateLifecycleReadyGuardCore(input, dependencies = {}) {
  const toolName = String(input?.tool_name ?? "");
  // PowerShell is wired into the same PreToolUse matcher as Bash and was nevertheless
  // absent from this list, so every PowerShell call returned verdict(0) -- allow -- for
  // bootstrap admission, cross-repo mutation, the closed grammar and gate strength alike.
  // On the native-Windows platform ADR-0051 makes a hard requirement, `Set-Content
  // project/guard-config.json` was exactly the shell bypass efe452c set out to close.
  if (![...SHELL_TOOLS, ...WRITE_TOOLS, ...READ_TOOLS].includes(toolName)) return verdict(0);
  if (WRITE_TOOLS.includes(toolName)) {
    const filePath = writeTargetPath(input?.tool_input, toolName);
    if (filePath.trim() === "" || filePath.includes("\0")) return blocked();
  } else if (SHELL_TOOLS.includes(toolName)) {
    const command = (input?.tool_input?.command ?? input?.tool_input?.CommandLine);
    if (typeof command !== "string" || command.trim() === "" || command.includes("\0")) return blocked();
    // ENVDUMP-F: decided on the raw command text BEFORE every other Bash/PowerShell admission or denial (bootstrap, grammar,
    // operator, read-scope, parse), so a command that prints the process environment can neither be admitted nor be mislabelled
    // by a different refusal. No override route and no retry action: the code is deliberately outside the override lanes.
    // Fail closed (ruling 51): a classifier that throws cannot say the command is safe, and an uncaught exception here would
    // end the hook without a verdict, which does not block. Any exception is therefore the same GUARD-ENV-DUMP refusal.
    let envDump;
    try {
      envDump = envDumpShellRefusal(command, toolName);
    } catch {
      envDump = envDumpClassifierErrorRefusal();
    }
    if (envDump !== null) return envDump;
  }

  let root;
  try {
    const requestedRoot = dependencies.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    root = (dependencies.realpathSyncFn ?? realpathSync)(resolve(requestedRoot));
  } catch {
    return blocked();
  }

  // These event observers receive native host input. A ready lifecycle does
  // not allow an agent to invoke them with self-authored event JSON.
  if (SHELL_TOOLS.includes(toolName) && isHostOnlyClaudeCaptureInvocation(
    input.tool_input.command ?? input.tool_input.CommandLine, root, toolName,
  )) return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): GUARD-NATIVE-CAPTURE-HOST-ONLY: capture observers run only as native host hooks.\n");
  if (READ_TOOLS.includes(toolName)) return readToolScopeVerdict(input, root, dependencies);
  // A quoted marker in inert physical scratch is evidence, not PO authority.
  // Existing scratch identity rejects aliases and active plugin roots; every
  // later bootstrap, path and lifecycle check still applies.
  if (WRITE_TOOLS.includes(toolName) && isBootstrapAcknowledgementMarkerMutation(input)
    && !isIntakeLifecycleScratchWrite(input, root, dependencies)) {
    return bootstrapAcknowledgementMarkerBlocked();
  }
  // NVA-BOOTRECEIPT-1: a pure side effect, never a verdict of its own -- the sanctioned
  // preflight command is already admitted or refused by the unmodified logic below. This
  // only additionally records that it ran, for a resolved dispatched subagent, when the
  // command is EXACTLY the sanctioned invocation (never a looser match).
  if (toolName === "Bash"
    && isSanctionedStartPreflightInvocation((input.tool_input.command ?? input.tool_input.CommandLine), root)) {
    recordBootstrapPreflightReceipt(input, root, dependencies);
  }
  // The bootstrap-obligation gate itself: a dispatched subagent's first Edit/Write/
  // NotebookEdit is refused while no receipt exists for its agentId. Orthogonal to every
  // other WRITE_TOOLS check below (destination, cross-repo, protected State) -- deciding
  // it first, and returning outright on a denial, keeps this file's existing WRITE_TOOLS
  // branch entirely unmodified for every call this gate does not refuse.
  if (WRITE_TOOLS.includes(toolName)) {
    const receiptDenial = evaluateBootstrapReceiptGate(input, root, toolName, dependencies);
    if (receiptDenial !== null) return receiptDenial;
  }
  if (toolName === "Bash" && isHumanPoSigningCommand((input.tool_input.command ?? input.tool_input.CommandLine), root)) {
    return externalPoSigningOnly();
  }
  if (SHELL_TOOLS.includes(toolName) && isHumanPoProfileChangeCommand(
    input.tool_input.command ?? input.tool_input.CommandLine, root,
  )) return verdict(2, "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): PO-PROFILE-CHANGE-HUMAN-ONLY: profile acknowledgement changes require the existing attended human confirmation outside agent tools.\n");
  // Consumed-capability notices raised by the shell-lane test-path check below, carried onto
  // whatever verdict the remaining checks produce. Declared here rather than folded into
  // `lifts` further down because that array is created after the PowerShell early return, and
  // the test-path shell lane covers PowerShell too.
  const sessionRoots = toolName === "Bash" ? sessionReadScopeRoots(input, dependencies) : [];
  const shellLifts = [];
  if (toolName === "PowerShell"
    && exactClaudeTaskOutputPowerShellRead((input.tool_input.command ?? input.tool_input.CommandLine), root, input, dependencies)) {
    return verdict(0);
  }
  if (SHELL_TOOLS.includes(toolName)) {
    const gateStrength = gateStrengthShellRefusal((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies);
    if (gateStrength !== null) return gateStrength;
    // Second, and only when gate strength had nothing to say: the test-path authority gate's
    // shell lane. Ordered after its stricter sibling deliberately -- a command that weakens
    // the gate-strength config is refused on that ground with no lift, and must not be able
    // to reach a lane that offers one.
    const testPathHit = protectedTestPathShellRefusalHit((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies, toolName);
    if (testPathHit !== null && testPathHit.fault === true) {
      return protectedTestPathShellFaultBlocked(testPathHit.error);
    }
    if (testPathHit !== null) {
      const reason = `${TESTPATH_SHELL_DENIAL_CODE}: ${testPathHit.rule.id}: ${testPathHit.rule.reason}`;
      const route = humanOverrideRoute(
        TESTPATH_SHELL_DENIAL_CODE, reason, "command", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) return protectedTestPathShellBlocked(testPathHit, route.overrideGuidance);
      shellLifts.push(route.admitted);
    }
    // Third, and only when the two stricter siblings above had nothing to say: the dev-plan
    // lifecycle gate's shell lane (GUARD-DEVPLAN-SHELL). Same ordering discipline -- a command
    // already refused on a stricter sibling's ground must not also reach a lane that offers its
    // own lift.
    const shellCommand = (input.tool_input.command ?? input.tool_input.CommandLine);
    const sanctionedPowerShellLifecycleCall = toolName === "PowerShell"
      && sanctionedPowerShellNodeCall(shellCommand, root);
    const devPlanHit = sanctionedPowerShellLifecycleCall
      ? null
      : devPlanShellRefusalHit(shellCommand, root, dependencies, toolName, sessionRoots);
    if (devPlanHit !== null && devPlanHit.fault === true) {
      return devPlanShellFaultBlocked(devPlanHit.error);
    }
    if (devPlanHit?.lane === "governance-hook-settings") {
      return verdict(
        2,
        "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
          + "PIPELINE-HOOKS-SETTINGS-REQUIRES-CANONICAL-WRITER: a governed shell command cannot write the project hook settings file; "
          + "use only the exact observed settings allowlist merge action for approved runner permission changes.\n",
      );
    }
    if (devPlanHit !== null) {
      // NVA-B-REBWIRE-1: the ONE relief, consulted only once this lane has already decided to
      // refuse -- so it can turn a block into an allow and can never turn an allow into
      // anything. A lift rather than a return: every later check still runs.
      const rebase = activeRebaseAuthority(root, dependencies);
      const permitted = rebase !== null
        && rebaseAuthorityPermitsCommand(rebase, (input.tool_input.command ?? input.tool_input.CommandLine));
      if (permitted) {
        shellLifts.push(verdict(0, `${rebaseAuthorityAdmissionNotice(rebase, "command")}\n`));
      } else {
        const reason = `${DEVPLAN_SHELL_DENIAL_CODE}: ${devPlanHit.reason}`;
        const route = humanOverrideRoute(
          DEVPLAN_SHELL_DENIAL_CODE, reason, "command", root, toolName, input.tool_input, dependencies,
        );
        if (!route.admitted) return devPlanShellBlocked(devPlanHit, route.overrideGuidance);
        shellLifts.push(route.admitted);
      }
    }
    // Fourth: Requirement 4's own refusals, and only while an authority is actually resolved.
    // Ordered last in this block so a command already refused by a stricter sibling is never
    // re-described by this narrower one.
    if (toolName === "Bash") {
      const shape = rebaseAuthorityShapeRefusal(
        (input.tool_input.command ?? input.tool_input.CommandLine), root, activeRebaseAuthority(root, dependencies),
      );
      if (shape !== null) return withLifts(shellLifts, rebaseAuthorityShapeBlocked(shape));
    }
  }
  // PowerShell reaches the gate-strength check above and nothing else, deliberately.
  // Every decision below parses a POSIX command grammar; applying it to PowerShell would
  // mis-read ordinary Windows syntax and refuse work rather than protect it, and the
  // recovery lanes it gates are Bash-only, so a non-ready Windows operator would be left
  // with no returned action. The bootstrap-admission asymmetry for PowerShell is
  // pre-existing, is NOT closed here, and is recorded in docs/state.md.
  //
  // Consequence stated rather than hidden: `isReadOnlyDiagnosticCommand` is also a POSIX
  // parser, so a PowerShell command naming one of the five paths is refused even when it
  // only reads. That over-refuses on exactly five filenames and fails closed; a
  // PowerShell-aware read-only classifier is the proper fix.
  if (toolName === "PowerShell") return withLifts(shellLifts, powerShellScopeVerdict(input, root, dependencies));
  // ADR-0059 Decision 6: a consumed cross-repository capability clears ONLY the
  // cross-repository objection. Every later check still runs against the lifted action --
  // the writer-owned State refusal, the closed shell grammar, the LAUNCH_SCRIPT external
  // restart and the readiness gate above all -- exactly as NOVA-LCR-HGO-2 established for
  // the grammar lift. `lifts` carries the consumption notices so a capability spent on an
  // action a later check refuses is surfaced rather than silently swallowed; it is already
  // irreversibly consumed on disk by then, and there is no "un-consume" available here.
  const lifts = [...shellLifts];
  const crossRepoReason = `${CROSS_REPO_DENIAL_CODE}: ${CROSS_REPO_DENIAL_GUIDANCE}`;
  if (WRITE_TOOLS.includes(toolName)) {
    const target = writeTargetPath(input.tool_input, toolName);
    // MEMPATH-1: the CLI's own derived memory directory is admitted outright, never through
    // the human-override route -- it is not a lifted cross-repository exception, it is not a
    // cross-repository mutation in the first place. Falls through to the readiness gate
    // below exactly like any other admitted write; only the cross-repository objection and
    // the writer-owned-State check (meaningless for a target this far outside root) are
    // skipped.
    const memoryWrite = isClaudeSessionMemoryWritePath(target, input, dependencies);
    // MACHPATH-1: the second, narrower carve-out (specs/sprint-nova-epic/plans/
    // nova-setup-bootstrap.md SS6a) -- exactly one file, never a directory or a prefix. Same
    // treatment as memoryWrite immediately above: admitted outright, never through the
    // human-override route, and it skips the identical two checks for the identical reason.
    const machineWrite = !memoryWrite && isMachinePlaneWritePath(target, dependencies);
    if (!memoryWrite && !machineWrite && !isProjectWritePath(target, root, dependencies)) {
      const route = humanOverrideRoute(
        CROSS_REPO_DENIAL_CODE, crossRepoReason, "write", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) return crossRepositoryMutationBlocked(route.overrideGuidance);
      lifts.push(route.admitted);
    }
    if (!memoryWrite && !machineWrite) {
      const requested = resolve(root, target);
      if (requested === join(root, ".claude", "pipeline-state.json")
        || requested === join(root, "project", "pipeline-state.json")) {
        // NVA-REBDEAD-1 (backlog/items/2026-09-02-the-rebase-authority-is-resolved-and-advertised-but-not-executable.md, decision 1): the ONE relief, keyed
        // on `conflictPaths` membership -- never on "a rebase is active". A rebase conflicting
        // on the OTHER lifecycle state file must not make THIS one writable, so the resolved
        // authority's own predicate decides, not a fixed-path carve-out like memoryWrite/
        // machineWrite above. A lift rather than a return: the cross-repository check already
        // ran, and every later check -- the readiness kernel included -- still runs against
        // the lifted write exactly as the pre-existing dev-plan-shell relief does.
        const rebase = activeRebaseAuthority(root, dependencies);
        if (rebase === null || !rebaseAuthorityPermitsPath(rebase, requested)) {
          return withLifts(lifts, protectedStateWriterOnly());
        }
        lifts.push(verdict(0, `${lifecycleRebaseAdmissionNotice(rebase, "the protected-State writer-only refusal", "write")}\n`));
      }
      const boundAuthority = boundAuthorityDocumentPath(root, requested);
      if (boundAuthority !== null) {
        return withLifts(lifts, protectedAuthorityDocumentWriteOnly(boundAuthority));
      }
      const hooksDisableFinding = hooksDisableSettingsWriteFinding({
        filePath: requested,
        content: extractWritePayload(input.tool_input, toolName),
        projectDir: root,
        operation: toolName === "Edit" ? "edit" : "write",
      });
      if (hooksDisableFinding !== null) {
        return withLifts(lifts, verdict(
          2,
          "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
            + `${hooksDisableFinding.code}: ${hooksDisableFinding.reason}. `
            + "Use the exact observed settings allowlist merge action for approved runner permission changes.\n",
        ));
      }
      const relPath = relative(root, requested).replace(/\\/g, "/");
      if (isEvidenceArtifactPath(relPath)) {
        const payload = extractWritePayload(input.tool_input, toolName);
        const hit = findResidualHostPath(payload);
        if (hit !== null) {
          const reason = `${EVIDENCE_HOST_PATH_DENIAL_CODE}: Evidence artifact write into ${relPath} contains an absolute host path (${hit.name} at character offset ${hit.offset}).`;
          const route = humanOverrideRoute(
            EVIDENCE_HOST_PATH_DENIAL_CODE, reason, "write", root, toolName, input.tool_input, dependencies,
          );
          if (!route.admitted) {
            return withLifts(lifts, blockedEvidenceHostPath(relPath, hit, route.overrideGuidance));
          }
          lifts.push(route.admitted);
        }
        const collision = checkDispatchRecordCollision({
          relPath,
          requested,
          payload,
          root,
          input,
          dependencies,
        });
        if (collision !== null) {
          const reason = `${DISPATCH_RECORD_COLLISION_DENIAL_CODE}: ${collision.reason}`;
          const route = humanOverrideRoute(
            DISPATCH_RECORD_COLLISION_DENIAL_CODE, reason, "write", root, toolName, input.tool_input, dependencies,
          );
          if (!route.admitted) {
            return withLifts(lifts, blockedDispatchRecordCollision(relPath, collision, route.overrideGuidance));
          }
          lifts.push(route.admitted);
        }
        // ALFRED-RECCOL: the dispatched subagent that creates the record becomes its owner (a side effect only; the verdict is already decided).
        claimDispatchRecordOwnership({ relPath, requested, root, input, dependencies });
      }
    }
  }
  // NVA-B-READCONTAIN-2: computed once, Bash-only (avoids the extra realpath/stat work for
  // every Edit/Write/NotebookEdit call), and reused at every isReadOnlyDiagnosticCommand /
  // retryActionsForDeniedCommand call site below that has `input` in scope. Never a module-
  // level constant, unlike BOUNDED_PIPELINE_ADDITIONAL_ROOTS: both roots vary per invocation.
  if (toolName === "Bash"
    && isForbiddenCrossRepositoryMutation((input.tool_input.command ?? input.tool_input.CommandLine), root, dependencies)) {
    const route = humanOverrideRoute(
      CROSS_REPO_DENIAL_CODE, crossRepoReason, "command", root, toolName, input.tool_input, dependencies,
    );
    if (!route.admitted) return crossRepositoryMutationBlocked(route.overrideGuidance);
    lifts.push(route.admitted);
  }
  if (toolName === "Bash"
    && (isReadOnlyDiagnosticCommand((input.tool_input.command ?? input.tool_input.CommandLine), root, sessionRoots)
      || exactClaudeTaskOutputBashRead((input.tool_input.command ?? input.tool_input.CommandLine), root, input, dependencies))) {
    return withLifts(lifts, verdict(0));
  }
  if (toolName === "Bash"
    && isRejectedReadFamilyCommand((input.tool_input.command ?? input.tool_input.CommandLine), root)) {
    // ALFRED-QP4: label selection ONLY (both refuse, nothing is admitted here). The scope code requires a target that really resolves outside
    // the project root; every other rejected single read-family command is an unsupported command.
    let outsideRoot = false;
    try {
      const rejected = parseGuardCommand(
        win32QuotedDrivePathCommand(input.tool_input.command ?? input.tool_input.CommandLine), root,
        { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM },
      );
      outsideRoot = isOutsideRootSingleCommandRead(rejected, root) || qp4OperandResolvesOutsideRoot(rejected, root);
    } catch { outsideRoot = false; }
    return withLifts(lifts, blocked(outsideRoot ? READ_SCOPE_DENIAL_CODE : READ_COMMAND_UNSUPPORTED_CODE, null, []));
  }
  if (toolName === "Bash" && isNarrowRepositoryRecoveryCommand((input.tool_input.command ?? input.tool_input.CommandLine), root)) {
    return withLifts(lifts, verdict(0));
  }
  // A consumed grammar capability clears ONLY the shell-grammar objection captured in
  // `grammarLift` below -- the LAUNCH_SCRIPT and readiness checks in
  // evaluateAfterGrammarAdmission() stay outside HGO's authority (ADR-0059 Decision 5) and
  // are always evaluated next, whether or not a capability was just consumed here; a lifted
  // command is admitted only if that tail also admits it. consumeHumanGuardOverride()
  // (lib/human-guard-override.mjs, read-only to this dispatch) already marks the capability
  // irreversibly "consumed" on disk, with its own audit entry, the moment it matched, before
  // grammarOverrideRoute() even returns here -- there is no "un-consume" available to this
  // file. A capability spent on a command later refused downstream stays spent; its
  // consumption is surfaced in the denial below rather than left to vanish silently.
  if (toolName === "Bash") {
    const parsed = parseGuardCommand((input.tool_input.command ?? input.tool_input.CommandLine), root, { platform: CLAUDE_BASH_SHELL_DIALECT_PLATFORM });
    if (parsed.parseStatus !== "accepted") {
      // NVA-B-DENIALCODE-1 (backlog: 2026-09-06-suppressed-and-chained-outside-root-reads-
      // land-on-the-wrong-denial-code.md): the shared tokenizer denies a top-level `&&`
      // outright (guard-command-grammar.mjs's CONTROL set), so an `&&`-chained outside-root
      // read never reaches an "accepted" parse and would otherwise always print the generic
      // GUARD-PARSE-UNSUPPORTED code -- true of the SHAPE, false of the REASON when every
      // segment would already be admitted by isBoundedReadOnlyAndChain() except that one
      // segment's own read target resolves outside the project root.
      // isOutsideRootReadOnlyAndChain() answers exactly that question on the raw command
      // string (the only representation an `&&`-chain has here -- `parsed` itself carries no
      // segments/operators/redirects to classify for a denied parse) and returns false for
      // every other denied-parse shape (`;`-joined, an unbalanced quote, a raw control
      // character, or an `&&`-chain that fails for an unrelated reason), leaving this branch's
      // pre-existing behavior for all of those untouched.
      const andChainReadScope = isOutsideRootReadOnlyAndChain(
        (input.tool_input.command ?? input.tool_input.CommandLine), root,
      );
      const code = andChainReadScope ? READ_SCOPE_DENIAL_CODE : "GUARD-PARSE-UNSUPPORTED";
      const reason = andChainReadScope
        ? `${code}: ${READ_SCOPE_DENIAL_GUIDANCE}`
        : `${code}: ${GRAMMAR_DENIAL_GUIDANCE[code]}`;
      const route = humanOverrideRoute(
        code, reason, "command", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) {
        // NVA-B-DENIALTRIM: consulted (and marked seen) ONLY on an actual denial, never on
        // an admitted/lifted command -- computed here, inside this branch, not earlier.
        const firstOccurrence = isFirstDenialThisScope(input, root, code, dependencies);
        return withLifts(lifts, blocked(
          code,
          null,
          retryActionsForDeniedCommand((input.tool_input.command ?? input.tool_input.CommandLine), root, sessionRoots),
          firstOccurrence ? route.overrideGuidance : (route.repeatOverrideGuidance || route.overrideGuidance),
          rejectedGrammarElement(code, (input.tool_input.command ?? input.tool_input.CommandLine), parsed, root),
          grammarRemediation((input.tool_input.command ?? input.tool_input.CommandLine)),
          null,
          false,
          firstOccurrence,
        ));
      }
      lifts.push(route.admitted);
    } else if (parsed.operators.length > 0 || parsed.redirects.length > 0) {
      // NVA-BL-76 (restored by NVA-B-READCONTAIN-1): the read-scope refusal is decided
      // FIRST, because for this one shape the operator/redirect codes state a reason that is
      // demonstrably not the reason.
      // NVA-B-DENIALCODE-1: isOutsideRootSingleCommandRead() is unioned in here too -- a
      // single, un-piped command carrying its one admitted trailing `2>/dev/null` redirect
      // reaches THIS branch (redirects.length > 0), never the isOutsideRootSingleCommandRead()
      // branch below (which requires redirects.length === 0), so without this union that
      // shape's own read-scope classifier would never run at all. No overlap risk with the
      // piped sibling: isOutsideRootSingleCommandRead() returns false unconditionally whenever
      // parsed.segments.length !== 1, which every command reaching this branch via operators
      // (a `|`-joined pipeline) always is.
      const readScope = isOutsideRootBoundedDiagnosticRead(parsed, root)
        || isOutsideRootSingleCommandRead(parsed, root);
      const code = readScope
        ? READ_SCOPE_DENIAL_CODE
        : parsed.redirects.length > 0 ? "GUARD-REDIRECT-UNAPPROVED" : "GUARD-OPERATOR-UNAPPROVED";
      const reason = readScope
        ? `${code}: ${READ_SCOPE_DENIAL_GUIDANCE}`
        : `${code}: ${GRAMMAR_DENIAL_GUIDANCE[code]}`;
      const route = humanOverrideRoute(
        code, reason, "command", root, toolName, input.tool_input, dependencies,
      );
      if (!route.admitted) {
        // Intentional `[]`, not the GUARD-PARSE-UNSUPPORTED omission (backlog:
        // grammar-refusal-does-not-say-which-part-failed): every command reaching this
        // branch is `parsed.parseStatus === "accepted"` with an operator or redirect
        // present, so it contains at least one of `|&<>()` -- and
        // retryActionsForDeniedCommand() returns [] unconditionally on the first such
        // character it scans (its per-part policy only ever recovers `;`/newline-joined
        // segments). Measured empirically across `&&`, `|`, `>`, `2>&1`, `| tee`: [] in
        // every case. Calling it here would be dead code, not a fix.
        const firstOccurrence = isFirstDenialThisScope(input, root, code, dependencies);
        return withLifts(lifts, blocked(
          code, null, [], firstOccurrence ? route.overrideGuidance : (route.repeatOverrideGuidance || route.overrideGuidance), rejectedGrammarElement(code, (input.tool_input.command ?? input.tool_input.CommandLine), parsed),
          grammarRemediation((input.tool_input.command ?? input.tool_input.CommandLine)), null, false, firstOccurrence,
        ));
      }
      lifts.push(route.admitted);
    } else if (isOutsideRootSingleCommandRead(parsed, root)) {
      // pipeline.read-scope-single-command-root-check (restored by NVA-B-READCONTAIN-1): the
      // single-command sibling of the NVA-BL-76 branch just above -- a single, un-piped read
      // whose target resolves outside the project root is refused under the identical code
      // the piped shape already uses. An in-root single read still short-circuits at the
      // isReadOnlyDiagnosticCommand() fast path above and never reaches this branch.
      const code = READ_SCOPE_DENIAL_CODE;
      const reason = `${code}: ${READ_SCOPE_DENIAL_GUIDANCE}`;
      const route = humanOverrideRoute(code, reason, "command", root, toolName, input.tool_input, dependencies);
      if (!route.admitted) {
        const firstOccurrence = isFirstDenialThisScope(input, root, code, dependencies);
        return withLifts(lifts, blocked(code, null, [], route.overrideGuidance, null, null, null, false, firstOccurrence));
      }
      lifts.push(route.admitted);
    }
  }
  const inspect = dependencies.inspectProjectOnboardingV3Fn ?? inspectProjectOnboardingV3;
  let inspected = false, observed, inspectionError;
  const consistent = {...dependencies, inspectProjectOnboardingV3Fn(options) {
    if (!inspected) { inspected = true; try { observed = inspect(options); } catch (error) { inspectionError = error; } }
    if (inspectionError) throw inspectionError;
    return observed;
  }};
  const result = evaluateAfterGrammarAdmission(input, root, toolName, consistent);
  return withLifts(lifts, withLifecycleReturnedActionTelemetry(result, input, root, toolName, consistent));
}

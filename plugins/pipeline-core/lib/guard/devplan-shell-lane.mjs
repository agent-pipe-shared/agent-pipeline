// SPDX-License-Identifier: SUL-1.0
// Guard module "devplan-shell-lane" (layer 5), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { DEVPLAN_SHELL_DENIAL_CODE, devPlanGateVerdict, hooksDisableSettingsWriteFinding } from "../guard-devplan-policy.mjs";
import { extractShellWriteTargets } from "../protected-test-paths.mjs";
import { parseGuardCommand } from "../../hooks/guard-command-grammar.mjs";
import { SETTINGS_ALLOWLIST_MERGE_SCRIPT } from "./constants.mjs";
import { isReadOnlyDiagnosticCommand, simpleWords } from "./shell-grammar.mjs";
import { verdict } from "./verdict.mjs";
import { resolveSanctionedScriptInvocation } from "./sanctioned-args-scripts.mjs";
import { isExactObservedRunnerPermissionsPlannerAction, isExactObservedRunnerPermissionsRepairAction, isSanctionedLifecycleCommand } from "./command-catalogue.mjs";

/**
 * GUARD-DEVPLAN-SHELL -- the `Bash|PowerShell` lane of the Dev-Plan-Gate (`guard-devplan.mjs`),
 * built the identical way `GUARD-TESTPATH-SHELL` closes the same route-choice gap for the
 * protected-test-path gate, two functions up: extract every write-target CANDIDATE a shell
 * command's syntax shows it touching (`extractShellWriteTargets()`, the SAME extraction both
 * shell lanes share -- see that function's own header in `lib/protected-test-paths.mjs`), and
 * run the IDENTICAL decision function the Edit|Write lane calls (`devPlanGateVerdict()`,
 * `lib/guard-devplan-policy.mjs`) against each one, in order, stopping at the first "block".
 * Unlike the test-path lane, no rules-config loading step happens here: `devPlanGateVerdict()`
 * has no external rule set of its own -- it reads the manifest/State directly -- so there is no
 * "config unreadable, claim nothing" branch to mirror.
 *
 * A "warn" verdict (manifest/State readable-but-malformed, fail-open by policy) or "allow" is
 * non-blocking here exactly as in the Edit|Write lane -- only "block" produces a hit.
 *
 * GL-09 fail-closed contract (mirrors `protectedTestPathShellRefusalHit()`'s own doc comment
 * just above it): the whole extraction+verdict walk is one try/catch, so a throw anywhere in it
 * (a malformed command the extractor cannot classify, a corrupt manifest/State byte shape
 * `devPlanGateVerdict()` itself did not already contain to a "warn") returns a typed fault
 * sentinel rather than silently falling through as "nothing to check".
 *
 * @returns {null|{fault:true,error:Error}|{verdict:"block",reason:string,feature?:string,
 *   planPath?:string|null,lifecycleStatus?:string,candidate:string,lane:string}} the first
 *   "block" verdict for any candidate (carrying which candidate/lane produced it), or null when
 *   nothing blocks.
 */
export function devPlanShellRefusalHit(command, root, dependencies = {}, toolName = "Bash", sessionRoots = []) {
  if (typeof command !== "string" || command === "") return null;
  const isReadOnly = (dependencies.isReadOnlyDiagnosticCommandFn ?? isReadOnlyDiagnosticCommand)(command, root, sessionRoots);
  if (isReadOnly) return null;
  try {
    const extractFn = dependencies.extractShellWriteTargetsFn ?? extractShellWriteTargets;
    const verdictFn = dependencies.devPlanGateVerdictFn ?? devPlanGateVerdict;
    const extracted = [...extractFn({
      command,
      root,
      toolName,
      platform: dependencies.platform ?? process.platform,
    })];
    const targets = toolName === "PowerShell"
      ? powerShellDevPlanWriteTargets(command, root, extracted)
      : extracted;
    const words = toolName === "Bash" ? simpleWords(command, root) : null;
    const invocation = words !== null
      ? resolveSanctionedScriptInvocation(command, root, {
        platform: dependencies.platform ?? process.platform,
        ...(dependencies.processExecPath === undefined ? {} : { processExecPath: dependencies.processExecPath }),
      })
      : null;
    const canonicalSettingsWriter = toolName === "Bash" && invocation?.script === SETTINGS_ALLOWLIST_MERGE_SCRIPT
      && isExactObservedRunnerPermissionsRepairAction(command, root, dependencies);
    const canonicalSettingsPlanner = toolName === "Bash" && invocation?.script === SETTINGS_ALLOWLIST_MERGE_SCRIPT
      && isExactObservedRunnerPermissionsPlannerAction(command, root, dependencies);
    const opaqueScript = words === null ? null : opaqueScriptExecutionCandidate(words, root);
    if (opaqueScript !== null
      && !(invocation !== null && isSanctionedLifecycleCommand(command, root, dependencies))
      && !canonicalSettingsWriter && !canonicalSettingsPlanner) {
      targets.push({ candidate: opaqueScript, lane: "opaque-script-execution", forceLifecycleGate: true });
    }
    const npmInit = words !== null
      && ["npm", "npm.cmd", "npm.exe"].includes(basename(words[0]).toLowerCase())
      && words[1] === "init";
    if (npmInit && !targets.some((target) => target.lane === "package-manager-init")) {
      const args = words.slice(2);
      const manifestOnlyArgs = args.every((arg) => ["-y", "--yes"].includes(arg));
      targets.push(manifestOnlyArgs
        ? { candidate: "package.json", lane: "package-manager-init" }
        : { candidate: ".pipeline-opaque-package-init", lane: "opaque-package-manager", forceLifecycleGate: true });
    }
    if (words !== null) {
      const packageTarget = opaquePackageManagerCandidate(words);
      if (packageTarget !== null) targets.push({
        candidate: packageTarget,
        lane: "opaque-package-manager",
        forceLifecycleGate: true,
      });
    }
    for (const { candidate, lane, forceLifecycleGate = false } of targets) {
      if ((lane === "opaque-interpreter-code" && ["-e", "-D", ".", ".."].includes(candidate))
        || (lane === "powershell-write-cmdlet" && ["-Path", "-D"].includes(candidate))) {
        continue;
      }
      const settingsWrite = hooksDisableSettingsWriteFinding({
        filePath: candidate,
        content: '{"disableAllHooks":true}',
        projectDir: root,
        operation: "shell",
      });
      if (settingsWrite !== null && !canonicalSettingsWriter) {
        return {
          verdict: "block",
          reason: settingsWrite.reason,
          feature: null,
          planPath: null,
          lifecycleStatus: null,
          candidate,
          lane: "governance-hook-settings",
        };
      }
      const result = verdictFn({ filePath: candidate, projectDir: root, ...(forceLifecycleGate ? { forceLifecycleGate: true } : {}) });
      if (result.verdict === "block") return { ...result, candidate, lane };
    }
    return null;
  } catch (error) {
    return { fault: true, error };
  }
}

function opaqueScriptExecutionCandidate(words, root) {
  if (!Array.isArray(words) || words.length < 2) return null;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);
  let script = null;
  if (["node", "node.exe"].includes(executable)) {
    const first = args[0] ?? "";
    if (["--version", "-v", "--help", "-h"].includes(first)) return null;
    if (first === "--check") return null;
    if (first === "--test") return args[1] && !args[1].startsWith("-") ? args[1] : ".pipeline-opaque-execution";
    if (["-e", "--eval", "-p", "--print"].includes(first)) return ".pipeline-opaque-execution";
    if (!first.startsWith("-")) script = first;
    else return ".pipeline-opaque-execution";
  } else if (["python", "python3", "python.exe", "python3.exe"].includes(executable)) {
    const first = args[0] ?? "";
    if (["--version", "-V", "--help", "-h"].includes(first)) return null;
    script = first.startsWith("-") ? ".pipeline-opaque-execution" : first;
  } else if (["bash", "sh", "dash", "zsh"].includes(executable)) {
    const first = args[0] ?? "";
    if (["--version", "--help", "-h"].includes(first)) return null;
    script = first.startsWith("-") ? ".pipeline-opaque-execution" : first;
  }
  if (script === null || script === "") return null;
  const absolute = resolve(root, script);
  const rel = relative(root, absolute);
  const contained = rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  return contained ? script : ".pipeline-opaque-execution";
}

function opaquePackageManagerCandidate(words) {
  if (!Array.isArray(words) || words.length === 0) return null;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);
  const versionOrHelp = args.length === 1 && ["--version", "-v", "--help", "-h", "version", "help"].includes(args[0]);
  if (["npm", "npm.cmd", "npm.exe", "pnpm", "pnpm.cmd", "yarn", "yarn.cmd", "pip", "pip3", "pip.exe", "cargo"].includes(executable)) {
    if (versionOrHelp) return null;
    const query = (executable.startsWith("npm") && ["ls", "list", "view"].includes(args[0]))
      || (executable.startsWith("pnpm") && ["list", "ls", "view"].includes(args[0]))
      || (executable.startsWith("yarn") && ["list", "info", "why"].includes(args[0]))
      || (executable.startsWith("pip") && ["list", "show"].includes(args[0]))
      || (executable === "cargo" && args[0] === "--list");
    if (query && !args.some(arg => ["install", "add", "remove", "uninstall", "update", "upgrade", "exec", "init"].includes(arg))) return null;
    return "src/.pipeline-opaque-package-operation";
  }
  if (["npx", "npx.cmd", "npx.exe"].includes(executable)) {
    if (versionOrHelp) return null;
    return "src/.pipeline-opaque-package-operation";
  }
  return null;
}

function powerShellDevPlanWriteTargets(command, root, extracted) {
  const parsed = parseGuardCommand(command, root, { platform: "win32" });
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1) return extracted;
  const segment = parsed.segments[0];
  const executable = basename(segment.executable).toLowerCase();
  if (!new Set(["set-content", "add-content", "out-file", "clear-content", "remove-item", "new-item"]).has(executable)) {
    return extracted;
  }
  const args = segment.argv;
  let target = null;
  const valueFlags = new Set(["-value", "-encoding", "-nonewline", "-force", "-whatif", "-confirm", "-debug", "-verbose"]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const lower = arg.toLowerCase();
    if (["-path", "-literalpath", "-filepath"].includes(lower)) {
      if (args[index + 1] === undefined || args[index + 1].startsWith("-")) return extracted;
      target = args[index + 1];
      index += 1;
      continue;
    }
    if (valueFlags.has(lower)) {
      if (["-value", "-encoding"].includes(lower) && args[index + 1] !== undefined) index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    if (target === null) target = arg;
  }
  return target === null ? [] : [{ candidate: target, lane: "powershell-write-cmdlet" }];
}

/**
 * `hit.reason` is `devPlanGateVerdict()`'s own message text -- the EXACT bytes
 * `guard-devplan.mjs`'s Edit|Write lane has always emitted for this feature/lifecycle/plan
 * combination (`Feature "…" lifecycle is "…".` / `Plan: …` / `File: …` / `Why: …`). Embedded
 * verbatim rather than re-derived, so the shell lane can never drift into inventing its own
 * wording for a decision the Edit|Write lane already states authoritatively -- the same
 * one-owner discipline `lib/guard-devplan-policy.mjs`'s own header describes.
 */
export function devPlanShellBlocked(hit, overrideGuidance) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${DEVPLAN_SHELL_DENIAL_CODE}: ${hit.reason}\n`
      + `Detected as a shell write to a dev-plan-gated path (lane: ${hit.lane}).\n`
      + "Why: an implementing Goldfish MUST NOT write implementation before the plan is approved "
      + "(roles/goldfish.md GF-04-adjacent discipline, enforced here as a technical gate). This "
      + "gate is authority-bearing (guardrails/global.md GL-09) -- so which write tool you reach "
      + "for cannot decide whether it applies.\n"
      + "A genuine draft-phase write belongs under docs/, specs/, .claude/, backlog/ or scratch/, "
      + "or the active feature's own plan path while still in draft -- or wait for the sanctioned "
      + "lifecycle transition named in the Why line above.\n"
      + (overrideGuidance ?? ""),
  );
}

/** Fail-closed outcome for a classifier fault (GL-09) — see devPlanShellRefusalHit(). */
export function devPlanShellFaultBlocked(error) {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${DEVPLAN_SHELL_DENIAL_CODE}-FAULT: the shell classifier for the dev-plan lifecycle gate `
      + "raised while evaluating this command, so whether it writes a dev-plan-gated path could "
      + "not be determined.\n"
      + `Error: ${error instanceof Error ? error.message : String(error)}\n`
      + "Why: this gate is authority-bearing (guardrails/global.md GL-09), which MUST resolve "
      + "to its blocking outcome rather than pass a command through unseen when it cannot "
      + "complete its evaluation.\n"
      + "No override route is offered for a classifier fault -- fix the command shape (or the "
      + "classifier, if the fault is a real defect) and retry.\n",
  );
}

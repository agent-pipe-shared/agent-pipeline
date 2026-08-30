#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Translate provider-neutral guard exits into Codex PreToolUse denials. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, read, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isSanctionedLifecycleCommand } from "./guard-lifecycle-ready.mjs";
import {
  consumeHumanGuardOverride,
  humanGuardOverrideInternals,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { USER_SOURCE_PATH, readHumanApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
import { boundedOpaqueCopyCommand } from "../lib/project-onboarding-v3.mjs";
import { boundedCopySafeCommand, forcedQuote, placeholder } from "../lib/copy-safe-command.mjs";
import {
  nativeHookSessionId,
  rememberedNativeHookFailure,
  rememberNativeHookFailure,
} from "../lib/native-hook-failure-memory.mjs";
import { parseGuardCommand } from "./guard-command-grammar.mjs";
import { commandIsGitPush } from "../lib/git-cmd.mjs";

// Same pure, no-I/O reuse pattern as scripts/repair-map.mjs: the secret-eligibility
// screen lives once in eligibility() and is never reimplemented here (GF-060, F2).
const { eligibility } = humanGuardOverrideInternals;

const DEBUG_PREFIX = "[pipeline.codex-pretool.v1]";
const PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PIPELINE_START_SKILL = join(PLUGIN_ROOT, "skills", "pipeline-start", "SKILL.md");
const LIFECYCLE_GUARD = join(PLUGIN_ROOT, "hooks", "guard-lifecycle-ready.mjs");
const HOOK_STARTED_AT = Date.now();
// `apply_patch` delegates its path checks to two sequential legacy guards for
// every touched file.  The provider timeout therefore needs room for the
// complete bounded chain plus a final typed-recovery window; a 9s adapter
// budget made a multi-file patch impossible even when every guard was healthy.
const HOOK_BUDGET_MS = 42_000;
const STDIN_TIMEOUT_MS = 1_000;
const STDIN_MAX_BYTES = 1024 * 1024;
const NESTED_GUARD_BUDGETS = Object.freeze({
  "guard-apply-patch.mjs": { capMs: 36_000, reserveMs: 5_000 },
  default: { capMs: 8_000, reserveMs: 5_000 },
});
let completed = false;

function diagnostic(code, fields = {}) {
  const tokens = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${JSON.stringify(String(value).slice(0, 160))}`);
  process.stderr.write(`${DEBUG_PREFIX} code=${code}${tokens.length === 0 ? "" : ` ${tokens.join(" ")}`}\n`);
}

function humanOverrideFailureFields(error) {
  const git = String(error?.message ?? "").match(/\(operation=([A-Za-z0-9._=-]+), outcome=([A-Za-z0-9._=-]+)\)/u);
  return {
    name: error?.name,
    code: error?.code,
    ...(git ? { operation: git[1], outcome: git[2] } : {}),
  };
}

/**
 * NVA-CF-FORCEDQUOTE: the ONE renderer for an override/repair-ceremony
 * command line -- never a hand-assembled template-literal string. `script`
 * (the guard-human-override.mjs invocation path) and a designated `--repo`/
 * `--author-source-root` argv value are forced double-quoted via
 * forcedQuote() to stay byte-identical to this file's own pinned guidance
 * text (codex-pretool-guard.test.mjs); every other real value renders
 * through boundedCopySafeCommand()'s ordinary shellWord() path, and every
 * `<...>`/`"<...>"` human fill-in hint stays a placeholder() passthrough.
 */
function renderOverrideCommand(script, argv) {
  return boundedCopySafeCommand({ executable: process.execPath, argv: [forcedQuote(script), ...argv] }).command;
}

function deny(reason, debug = undefined) {
  if (completed) return;
  completed = true;
  if (debug) diagnostic(debug.code, debug.fields);
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  })}\n`);
  process.exit(0);
}

function remainingBudgetMs(reserveMs = 0) {
  return HOOK_BUDGET_MS - (Date.now() - HOOK_STARTED_AT) - reserveMs;
}

function timedOutSpawnResult() {
  const error = new Error("Codex PreToolUse hook budget is exhausted");
  error.code = "ETIMEDOUT";
  return { status: null, signal: "SIGTERM", error, stdout: "", stderr: "" };
}

function boundedSpawn(executable, args, options, { capMs, reserveMs }) {
  const available = remainingBudgetMs(reserveMs);
  if (available <= 0) return timedOutSpawnResult();
  return spawnSync(executable, args, {
    ...options,
    timeout: Math.max(1, Math.min(capMs, available)),
  });
}

function readStdinBounded(timeoutMs = STDIN_TIMEOUT_MS) {
  return new Promise((resolveInput, rejectInput) => {
    const chunks = [];
    let bytesRead = 0;
    let settled = false;
    const finish = (callback, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(result);
    };
    const timer = setTimeout(() => {
      const error = new Error("Codex PreToolUse input did not close in time");
      error.code = "HOOK-STDIN-TIMEOUT";
      finish(rejectInput, error);
    }, timeoutMs);
    const readNext = () => {
      if (settled) return;
      const buffer = Buffer.allocUnsafe(64 * 1024);
      read(0, buffer, 0, buffer.length, null, (error, count) => {
        if (settled) return;
        if (error) {
          finish(rejectInput, error);
          return;
        }
        if (count === 0) {
          finish(resolveInput, Buffer.concat(chunks, bytesRead).toString("utf8"));
          return;
        }
        bytesRead += count;
        if (bytesRead > STDIN_MAX_BYTES) {
          const oversized = new Error("Codex PreToolUse input exceeds its byte limit");
          oversized.code = "HOOK-STDIN-OVERSIZED";
          finish(rejectInput, oversized);
          return;
        }
        chunks.push(buffer.subarray(0, count));
        const value = Buffer.concat(chunks, bytesRead).toString("utf8");
        try {
          JSON.parse(value);
          finish(resolveInput, value);
        } catch {
          readNext();
        }
      });
    };
    readNext();
  });
}

// Codex reports a bare "hook exited with code 1" when an uncaught adapter
// exception escapes. Convert those into the normal, fail-closed hook response
// and leave a sanitized diagnostic for the next attended invocation.
process.on("uncaughtException", (error) => {
  deny("Codex PreToolUse guard failed internally; pipeline guards fail closed.", {
    code: "adapter-uncaught",
    fields: { name: error?.name, code: error?.code },
  });
});
process.on("unhandledRejection", (reason) => {
  deny("Codex PreToolUse guard failed internally; pipeline guards fail closed.", {
    code: "adapter-unhandled-rejection",
    fields: { name: reason?.name, code: reason?.code },
  });
});

let rawInput;
try { rawInput = await readStdinBounded(); }
catch (error) {
  deny("Codex PreToolUse input was unavailable within the hook budget; pipeline guards fail closed.", {
    code: "stdin-read-failed",
    fields: { name: error?.name, code: error?.code },
  });
}

let input;
try { input = JSON.parse(rawInput); }
catch { deny("Codex PreToolUse input is not valid JSON; pipeline guards fail closed."); }

const toolName = String(input?.tool_name ?? "");
const filePath = input?.tool_input?.file_path;
const command = String(input?.tool_input?.command ?? "");
const toolInputSha256 = createHash("sha256")
  .update(JSON.stringify(input?.tool_input ?? {}))
  .digest("hex");
// Codex supplies the session working directory in the native hook envelope and
// also launches the hook from that directory. CLAUDE_PROJECT_DIR belongs to
// the Claude compatibility surface and may be inherited from another process;
// using it here can make the guard inspect a different repository than the
// tool call it is deciding.
let projectRoot;
try {
  const nativeCwd = typeof input?.cwd === "string" && input.cwd.trim() !== ""
    ? input.cwd
    : process.cwd();
  projectRoot = realpathSync(resolve(nativeCwd));
} catch (error) {
  deny("Codex PreToolUse project root is unavailable; pipeline guards fail closed.", {
    code: "project-root-unavailable",
    fields: { name: error?.name, code: error?.code },
  });
}
// Same pure, no-I/O secret screen `eligibility()` already provides
// (lib/human-guard-override.mjs), shared by every external-operator guidance
// site in this file that discloses the literal command: never reimplement
// the secret detection, and never let the two sites drift on when disclosure
// is safe (GF-059/GF-064; backlog:
// cross-repository-boundary-guidance-still-omits-the-literal-command).
// Fails closed (`command`/`copyCommand` both null) on anything unexpected
// from the probe itself, matching every sibling external-operator route.
// Two caveats that apply at every call site, not just one:
// - eligibility()'s secret screen is pattern-based, not exhaustive: it matches
//   known credential shapes (gh*_ tokens, github_pat_, AKIA-style keys, PEM
//   private-key headers, token/password/secret=<value> assignments) but does
//   NOT catch every credential shape -- e.g. a bare `Authorization: Bearer
//   <JWT>`-style value is NOT flagged (`eligible: true`) and would be emitted
//   verbatim (Critic F2, GF-064). Closing that gap means widening the shared
//   regex, which is a separate change from this helper's job.
// - `tool === "Bash"` is a real, load-bearing restriction, not a formality:
//   Codex passes the full patch body in `tool_input.command` for an
//   apply_patch call (the same field eligibility() reads), so `rawCommand`
//   holds the ENTIRE patch body for apply_patch, not "". This gate is what
//   actually stops that body from being emitted verbatim here (Critic F3,
//   GF-064).
// `copyCommand` is a bounded, pre-quoted rendering of the same exact command
// (GF-094) so a relaying agent can copy it verbatim instead of re-quoting it;
// it is never an additional disclosure path -- gated by the exact same
// `commandIsSafe` conjunct as `command`, never independently.
function commandDisclosureFields(root, tool, toolInput, rawCommand) {
  let secretBearing = true;
  try {
    const probe = eligibility(root, tool, toolInput ?? {});
    secretBearing = probe.eligible === false && probe.code === "HGO-NONOVERRIDABLE-SECRET";
  } catch { /* fail closed: secretBearing stays true, disclosure stays hash-only */ }
  const commandIsSafe = tool === "Bash" && !secretBearing;
  return {
    command: commandIsSafe ? rawCommand : null,
    copyCommand: commandIsSafe ? boundedOpaqueCopyCommand(rawCommand) : null,
  };
}
const lifecycleGoverned = [
  ".agent-pipeline/core.lock.json",
  "pipeline.user.yaml",
  "project/pipeline.json",
  "project/pipeline.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
  ...loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path),
].some((marker) => existsSync(join(projectRoot, marker)));
const isLifecycleTool = toolName === "Bash" && isSanctionedLifecycleCommand(command, projectRoot);

/** Permit only the bootstrap's own immutable identity/read step. */
export function isBootstrapReadCommand(value, {
  pipelineStartSkill = PIPELINE_START_SKILL,
  platform = process.platform,
} = {}) {
  if (typeof value !== "string" || value.trim() === "") return false;
  const command = value.trim();
  if (/^pwd(?:\s+-P)?$/u.test(command)) return true;
  const parsed = parseGuardCommand(command, process.cwd(), { platform });
  if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return false;
  const { executable, argv } = parsed.segments[0];
  let target = null;
  if (executable === "sed" && argv.length === 3 && argv[0] === "-n"
    && /^\d+(?:,\d+)?p$/u.test(argv[1])) target = argv[2];
  if (executable === "cat" && (argv.length === 1 || (argv.length === 2 && argv[0] === "--"))) {
    target = argv.at(-1);
  }
  if (/^Get-Content$/iu.test(executable)
    && (argv.length === 2 || argv.length === 3)
    && /^-LiteralPath$/iu.test(argv[0])
    && (argv.length === 2 || /^-Raw$/iu.test(argv[2]))) target = argv[1];
  if (platform === "win32" && /^type$/iu.test(executable) && argv.length === 1) target = argv[0];
  if (!target) return false;
  try { return resolve(target) === resolve(pipelineStartSkill); }
  catch { return false; }
}

const lifecycleShouldRun = lifecycleGoverned
  && !isLifecycleTool
  && !isBootstrapReadCommand(command)
  && ["Bash", "Edit", "Write"].includes(toolName);
const supportedTools = new Set(["Bash", "apply_patch", "Edit", "Write"]);
if (!supportedTools.has(toolName)) {
  deny(`Unsupported or missing Codex tool_name ${JSON.stringify(toolName)}; pipeline guards fail closed.`);
}
if (toolName === "Bash" && (typeof input?.tool_input?.command !== "string" || input.tool_input.command.trim() === "")) {
  deny("Bash input has no unambiguous command; pipeline command guards fail closed.");
}
if (["Edit", "Write"].includes(toolName) && (typeof filePath !== "string" || filePath.trim() === "")) {
  deny(`${toolName} input has no unambiguous file_path; pipeline write guards fail closed.`);
}
const hookSessionId = nativeHookSessionId(input);

// Share the SAME push-detection decision guard-push.mjs itself uses
// (`commandIsGitPush` in lib/git-cmd.mjs) instead of a second, independently
// hand-maintained partial reimplementation that can drift from it (Critic F-1,
// NVA-A7FIX-1): a prior version here tested only the whole-string branch and silently
// lost detection for shapes like `git.exe -C repo push`, `sh -c "git push"`,
// `bash -c 'git push'`, and `ssh host "git push"` — all three of guard-push.mjs's own
// branches (whole-string, `directPush`, `shellWrapperPush`) are now covered identically
// by both callers (NVA-A7FIX-2).
const guardNames = toolName === "Bash"
  ? [
    ...( /\bgit(?:\.exe)?\b/iu.test(command) ? ["guard-git.mjs"] : []),
    ...(commandIsGitPush(command) ? ["guard-push.mjs"] : []),
    // The lifecycle tool validates its own typed arguments and plan digest.  Do
    // not make a bootstrap command depend on a second heavyweight hook process:
    // on Codex's nested sandbox that process can exhaust the hook's outer budget.
    // Lifecycle readiness is evaluated in this adapter process below.  Spawning
    // it recursively makes Codex's nested hook sandbox hit the outer timeout.
  ]
  : toolName === "apply_patch"
    ? ["guard-apply-patch.mjs"]
    : ["Edit", "Write"].includes(toolName)
      ? ["guard-testpath.mjs", "guard-devplan.mjs", "guard-gate-strength.mjs"]
      : [];

const denials = [];
const warnings = [];
for (const guardName of guardNames) {
  const memoryInput = {
    rootDir: projectRoot, sessionId: hookSessionId, toolName,
    toolInput: input?.tool_input ?? {}, guard: guardName,
  };
  const remembered = rememberedNativeHookFailure(memoryInput);
  if (remembered) {
    denials.push({ guard: guardName, reason: remembered.reason });
    diagnostic("native-hook-failure-suppressed", { guard: guardName, code: remembered.code });
    continue;
  }
  const guard = fileURLToPath(new URL(`./${guardName}`, import.meta.url));
  const result = boundedSpawn(process.execPath, [guard], {
    cwd: projectRoot,
    // Existing provider-neutral guards still consume CLAUDE_PROJECT_DIR.
    // Bind that compatibility variable to Codex's native, physical cwd rather
    // than forwarding a possibly stale inherited value.
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectRoot,
      PIPELINE_REQUIRE_TYPED_HUMAN_OVERRIDE: "1",
    },
    encoding: "utf8",
    input: rawInput,
  }, NESTED_GUARD_BUDGETS[guardName] ?? NESTED_GUARD_BUDGETS.default);
  const detail = String(result.stderr ?? "").trim();
  if (result.status === 2) denials.push({
    guard: guardName,
    reason: detail || `${guardName} denied the tool call.`,
  });
  else if (result.status === 1) warnings.push(detail || `${guardName} returned a warning.`);
  else if (result.status !== 0) {
    const failure = result.error?.code ?? result.error?.name ?? result.signal ?? `exit-${String(result.status)}`;
    diagnostic("nested-guard-failed", { guard: guardName, failure });
    const reason = `${guardName} failed unexpectedly (${failure}); pipeline guards fail closed.`;
    rememberNativeHookFailure(memoryInput, { code: failure, reason });
    denials.push({
      guard: guardName,
      reason,
    });
  }
}
if (lifecycleShouldRun) {
  const lifecycleGuard = "guard-lifecycle-ready.mjs";
  const lifecycleMemoryInput = {
    rootDir: projectRoot, sessionId: hookSessionId, toolName,
    toolInput: input?.tool_input ?? {}, guard: lifecycleGuard,
  };
  const remembered = rememberedNativeHookFailure(lifecycleMemoryInput);
  if (remembered) {
    denials.push({ guard: lifecycleGuard, reason: remembered.reason });
    diagnostic("native-hook-failure-suppressed", { guard: lifecycleGuard, code: remembered.code });
  } else {
  // Authoritative, not inferred (ADR-0051): guard-lifecycle-ready.mjs has
  // exactly two production callers -- this boundedSpawn and
  // guard-apply-patch.mjs's GUARDS spawn list -- both reachable only from
  // Codex-only entry points (guard-apply-patch.mjs is itself spawned only
  // from here). It appears in no hook configuration of either runner
  // (codex-hooks.json registers only codex-session-start-hint.mjs and
  // codex-pretool-guard.mjs), which is why `codex` is authoritative here
  // rather than inferred. A stray CLAUDECODE=1 inherited from the
  // propagated environment below must not silently reassign the runner the
  // spawned guard admits under.
  const lifecycle = boundedSpawn(process.execPath, [LIFECYCLE_GUARD, "--runner", "codex"], {
    cwd: projectRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    encoding: "utf8",
    input: rawInput,
  }, { capMs: 3_000, reserveMs: 1_500 });
  const detail = String(lifecycle.stderr ?? "").trim();
  if (lifecycle.status === 2) denials.push({
    guard: lifecycleGuard,
    reason: detail || "guard-lifecycle-ready denied the tool call.",
  });
  else if (lifecycle.status === 1) warnings.push(detail || "guard-lifecycle-ready returned a warning.");
  else if (lifecycle.status !== 0) {
    const failure = lifecycle.error?.code ?? lifecycle.error?.name
      ?? lifecycle.signal ?? `exit-${String(lifecycle.status)}`;
    diagnostic("lifecycle-guard-failed", { failure });
    const reason = `${lifecycleGuard} failed within the hook budget (${failure}); pipeline guards fail closed.`;
    rememberNativeHookFailure(lifecycleMemoryInput, { code: failure, reason });
    denials.push({
      guard: lifecycleGuard,
      reason,
    });
  }
  }
}
const GRAMMAR_DENIAL = /\bGUARD-(?:PARSE|OPERATOR|REDIRECT)-UNAPPROVED\b/u;
const grammarOnlyDenial = denials.length > 0
  && denials.every((entry) => entry.guard === "guard-lifecycle-ready.mjs"
    && GRAMMAR_DENIAL.test(entry.reason));
const crossRepositoryOnlyDenial = denials.length > 0
  && denials.every((entry) => entry.guard === "guard-lifecycle-ready.mjs"
    && /\bGUARD-CROSS-REPO-MUTATION\b/u.test(entry.reason));
if (denials.length > 0) {
  // Closed shell-grammar refusals have no side effect to reconcile and are
  // not authority decisions. Routing them through the one-time Human-override
  // ledger creates a misleading verify-audit/retry loop.
  if (grammarOnlyDenial) {
    deny(denials.map((entry) => entry.reason).join("\n"));
  }
  // A consumer session cannot attest or mutate the Codex plugin cache.  This
  // is an external authority boundary, not an effect that an in-repository
  // Human-override audit can reconcile.  Returning verify-audit here creates
  // an infinite retry loop without changing the allowed execution boundary.
  if (crossRepositoryOnlyDenial) {
    deny([
      denials.map((entry) => entry.reason).join("\n"),
      "Guard recovery route:",
      JSON.stringify({
        status: "external-operator-required",
        code: "HGO-EXTERNAL-PLUGIN-CACHE-BOUNDARY",
        nextAction: {
          kind: "external-operator",
          executionBoundary: "separate-session-rooted-at-plugin-cache",
          invocation: "user-copy-only",
          action: {
            toolName,
            toolInputSha256,
            repositoryRoot: projectRoot,
            ...commandDisclosureFields(projectRoot, toolName, input?.tool_input, command),
          },
          reason: "the Codex plugin cache is outside this repository's physical authority boundary",
        },
      }),
    ].join("\n"));
  }
  const overrideSpawn = (executable, args, options) => boundedSpawn(
    executable,
    args,
    options,
    // Repository identity needs several independent Git observations.  A
    // 300ms per-child cap made the audited escape hatch unavailable in large
    // or cold repositories even though the same Git operations succeeded
    // directly.  The global hook budget still bounds the complete adapter.
    { capMs: 2_000, reserveMs: 750 },
  );
  let consumed;
  try {
    consumed = consumeHumanGuardOverride({
      rootDir: projectRoot,
      pluginRoot: PLUGIN_ROOT,
      toolName,
      toolInput: input?.tool_input ?? {},
      denials,
      spawn: overrideSpawn,
    });
  } catch (error) {
    diagnostic("human-override-consume-failed", humanOverrideFailureFields(error));
    consumed = { status: "invalid", code: "HGO-ADAPTER-FAILURE" };
  }
  if (consumed.status === "consumed") {
    process.stderr.write(
      `[pipeline-human-override] exact one-time capability consumed; plan=${consumed.planSha256}.\n`,
    );
    completed = true;
    process.exit(0);
  }
  let overrideGuidance = "";
  if (consumed.status === "absent" || consumed.status === "replan") {
    try {
      const planned = recordHumanGuardDenial({
        rootDir: projectRoot,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput: input?.tool_input ?? {},
        denials,
        spawn: overrideSpawn,
      });
      // NVA-CROSSREPOGUIDANCE-1: name the repository the denial's ledger was actually
      // bound to, which recordHumanGuardDenial() now returns as `planned.root`. For a
      // "cross-repository-target" command that root is the TARGET repository, not this
      // coordinating session's `projectRoot`; the request only exists under that root, so
      // guidance naming `projectRoot` sends the human to a repository where
      // `guard-human-override.mjs plan` cannot find the request at all. Falls back to
      // `projectRoot` (the previous behaviour, and the correct value for every ordinary
      // in-root denial) if the field is ever missing.
      const overrideRepo = typeof planned.root === "string" && planned.root !== ""
        ? planned.root
        : projectRoot;
      if (planned.status === "planned") {
        const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
        // ADR-0059 Decision 4: name the exact next command for the CURRENTLY CONFIGURED
        // mode, not just the mode-common `plan` step -- otherwise the agent has a
        // digest but no route to actually clear the gate, and (in `signature` mode
        // especially) no signal that a human, not the agent, must act next. Fails
        // closed to `signature`'s continuation on any read error, exactly like
        // guard-testpath.mjs's own `readPushApprovalMode` usage.
        let approval = { mode: "signature", scope: "default", source: "default" };
        try { approval = readHumanApprovalMode(projectRoot, { legacyKind: "push", spawn: overrideSpawn }) ?? approval; }
        catch { /* fail closed */ }
        const approvalMode = approval.mode;
        const globalChat = approvalMode === "chat" && approval.scope === "global" && approval.source === USER_SOURCE_PATH;
        const continuation = approvalMode === "chat"
          ? [
            globalChat
              ? "Then (the committed global human approval is chat-attributed-unattested; no terminal ceremony, key, or proof is required):"
              : "Then (the human confirms in-session; this is attribution, not proof -- legacy gates.push_approval is \"chat\"): ",
            renderOverrideCommand(script, [
              "prepare-authorization", "--repo", forcedQuote(overrideRepo), "--request-sha256", planned.requestSha256,
              "--plan-sha256", placeholder("<plan-sha256-from-plan>"), "--reason", placeholder('"<human-reason>"'),
            ]),
            renderOverrideCommand(script, [
              "authorize", "--repo", forcedQuote(overrideRepo), "--request-sha256", planned.requestSha256,
              "--plan-sha256", placeholder("<plan-sha256>"), "--selection-sha256", placeholder("<selection-sha256>"),
              "--reason", placeholder('"<human-reason>"'), "--reason-sha256", placeholder("<reason-sha256>"), "--activate",
            ]),
          ].join("\n")
          : [
            `Then, in this session (pure digest computation against data already in the repository -- neither step needs the external key, ADR-0059 Decision 1):`,
            renderOverrideCommand(script, [
              "prepare-authorization", "--repo", forcedQuote(overrideRepo), "--request-sha256", planned.requestSha256,
              "--plan-sha256", placeholder("<plan-sha256-from-plan>"), "--reason", placeholder('"<fixed HGO_SIGNATURE_REASON text>"'),
            ]),
            renderOverrideCommand(script, [
              "emit-signature-digest", "--repo", forcedQuote(overrideRepo), "--request-sha256", planned.requestSha256,
              "--plan-sha256", placeholder("<plan-sha256>"),
            ]),
            `Then, outside this session (gates.push_approval is "${approvalMode}"; only the signature itself needs the external Ed25519 key; presence of a valid, correctly-bound signature IS the authorization -- there is no in-session activate step for this mode):`,
            renderOverrideCommand(script, [
              "authorize-by-signature", "--repo", forcedQuote(overrideRepo), "--request-sha256", planned.requestSha256,
              "--plan-sha256", placeholder("<plan-sha256>"), "--proof", placeholder("<external-proof.json>"),
            ]),
          ].join("\n");
        overrideGuidance = [
          "",
          "Human override available for this exact action (one use; audited; explicit confirmation required):",
          renderOverrideCommand(script, ["plan", "--repo", forcedQuote(overrideRepo), "--request-sha256", planned.requestSha256]),
          continuation,
        ].join("\n");
      } else if (planned.status === "author-repair-required") {
        const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
        overrideGuidance = [
          "",
          "Pipeline Author Repair is available for this exact source action (one use; audited; explicit confirmation required):",
          renderOverrideCommand(script, [
            "plan", "--repo", forcedQuote(overrideRepo), "--request-sha256", planned.requestSha256,
            "--author-source-root", forcedQuote(planned.candidateSourceRoot),
          ]),
        ].join("\n");
      } else if (new Set(["narrower-recovery-required", "external-operator-required"]).has(planned.status)) {
        overrideGuidance = [
          "",
          "Guard recovery route:",
          JSON.stringify(planned),
        ].join("\n");
      } else {
        overrideGuidance = [
          "",
          "Guard recovery route:",
          JSON.stringify({
            status: "effect-reconciliation-required",
            code: planned.code ?? "HGO-UNCLASSIFIED",
            nextAction: {
              kind: "typed-recovery",
              action: {
                executable: process.execPath,
                argv: [join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"), "verify-audit", "--repo", projectRoot],
                mutation: false,
                requiresConfirmation: false,
                executionBoundary: "local-process",
                expected: { schema: "pipeline.human-guard-override-audit-verification.v1", status: "valid" },
              },
              after: "retry the identical original action to obtain a fresh bound plan",
            },
          }),
        ].join("\n");
      }
    } catch (error) {
      diagnostic("human-override-plan-failed", humanOverrideFailureFields(error));
      const hostBoundary = error?.code === "HGO-GIT" || error?.code === "HGO-ROOT"
        || error?.code === "HGO-COMMON-DIR";
      // recordHumanGuardDenial() already runs eligibility() once, before the
      // topology() call that produced this exact error (lib/human-guard-override.mjs:
      // physicalRoot -> eligibility -> topology) -- but that result never reaches this
      // catch; the function throws before returning anything (Critic F2, GF-059). Re-run
      // the SAME pure, no-I/O secret screen rather than duplicate its detection regex
      // here (scripts/repair-map.mjs already reuses it identically). Fail closed to the
      // hash-only, safe state on any unexpected error from the probe itself -- exactly
      // the state every sibling external-operator route in this file already uses.
      let hostBoundaryAction = { toolName, toolInputSha256, repositoryRoot: projectRoot };
      if (hostBoundary) {
        // Shared with the HGO-EXTERNAL-PLUGIN-CACHE-BOUNDARY route above (line
        // ~423): commandDisclosureFields() (line ~209) is this file's single
        // secret screen + Bash-only gate for external-operator command
        // disclosure -- never a second, independently-maintained copy here
        // (Critic F1, NVA-A7CRITICFIX-1). Its doc comment carries the same
        // eligibility()-is-not-exhaustive caveat (Critic F2, GF-064) and the
        // same reasoning for why the Bash-only gate is load-bearing against a
        // full apply_patch body (Critic F3, GF-064), plus the copyCommand
        // rationale (GF-094) -- all still true for this call site, now stated
        // once instead of twice.
        hostBoundaryAction = {
          toolName,
          toolInputSha256,
          repositoryRoot: projectRoot,
          ...commandDisclosureFields(projectRoot, toolName, input?.tool_input, command),
        };
      }
      overrideGuidance = [
        "",
        "Guard recovery route:",
        JSON.stringify(hostBoundary
          ? {
            status: "external-operator-required",
            code: "HGO-EXTERNAL-REPOSITORY-OBSERVATION",
            nextAction: {
              kind: "external-operator",
              executionBoundary: "attended-host-terminal",
              invocation: "user-copy-only",
              action: hostBoundaryAction,
              reason: "the host repository preimage cannot be attested inside this guard process",
            },
          }
          : {
            status: "effect-reconciliation-required",
            code: "HGO-DECISION-RECORD-UNAVAILABLE",
            nextAction: {
              kind: "typed-recovery",
              action: {
                executable: process.execPath,
                argv: [join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"), "verify-audit", "--repo", projectRoot],
                mutation: false,
                requiresConfirmation: false,
                executionBoundary: "local-process",
                expected: { schema: "pipeline.human-guard-override-audit-verification.v1", status: "valid" },
              },
              after: "retry the identical original action to obtain a fresh bound plan",
            },
          }),
      ].join("\n");
    }
  } else {
    overrideGuidance = [
      "",
      "Human override rejected; override admission is not operation success.",
      "Guard recovery route:",
      JSON.stringify({
        status: "effect-reconciliation-required",
        code: consumed.code ?? "HGO-CAPABILITY-INVALID",
        nextAction: {
          kind: "typed-recovery",
          action: {
            executable: process.execPath,
            argv: [join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"), "verify-audit", "--repo", projectRoot],
            mutation: false,
            requiresConfirmation: false,
            executionBoundary: "local-process",
            expected: { schema: "pipeline.human-guard-override-audit-verification.v1", status: "valid" },
          },
          after: "retry the identical original action to obtain a fresh bound plan",
        },
      }),
    ].join("\n");
  }
  deny(`${denials.map((entry) => entry.reason).join("\n")}${overrideGuidance}`);
}
if (warnings.length > 0) process.stderr.write(`${warnings.join("\n")}\n`);
completed = true;

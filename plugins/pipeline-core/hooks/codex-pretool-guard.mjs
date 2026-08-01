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
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
import { parseGuardCommand } from "./guard-command-grammar.mjs";

const DEBUG_PREFIX = "[pipeline.codex-pretool.v1]";
const PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PIPELINE_START_SKILL = join(PLUGIN_ROOT, "skills", "pipeline-start", "SKILL.md");
const LIFECYCLE_GUARD = join(PLUGIN_ROOT, "hooks", "guard-lifecycle-ready.mjs");
const HOOK_STARTED_AT = Date.now();
const HOOK_BUDGET_MS = 9_000;
const STDIN_TIMEOUT_MS = 1_000;
const STDIN_MAX_BYTES = 1024 * 1024;
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

const guardNames = toolName === "Bash"
  ? [
    ...( /\bgit(?:\.exe)?\b/iu.test(command) ? ["guard-git.mjs"] : []),
    ...( /\bgit(?:\.exe)?(?:\s+-C\s+\S+)?\s+push\b/iu.test(command) ? ["guard-push.mjs"] : []),
    // The lifecycle tool validates its own typed arguments and plan digest.  Do
    // not make a bootstrap command depend on a second heavyweight hook process:
    // on Codex's nested sandbox that process can exhaust the hook's outer budget.
    // Lifecycle readiness is evaluated in this adapter process below.  Spawning
    // it recursively makes Codex's nested hook sandbox hit the outer timeout.
  ]
  : toolName === "apply_patch"
    ? ["guard-apply-patch.mjs"]
    : ["Edit", "Write"].includes(toolName)
      ? ["guard-testpath.mjs", "guard-devplan.mjs"]
      : [];

const denials = [];
const warnings = [];
for (const guardName of guardNames) {
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
  }, { capMs: 2_000, reserveMs: 4_000 });
  const detail = String(result.stderr ?? "").trim();
  if (result.status === 2) denials.push({
    guard: guardName,
    reason: detail || `${guardName} denied the tool call.`,
  });
  else if (result.status === 1) warnings.push(detail || `${guardName} returned a warning.`);
  else if (result.status !== 0) {
    const failure = result.error?.code ?? result.error?.name ?? result.signal ?? `exit-${String(result.status)}`;
    diagnostic("nested-guard-failed", { guard: guardName, failure });
    denials.push({
      guard: guardName,
      reason: `${guardName} failed unexpectedly (${failure}); pipeline guards fail closed.`,
    });
  }
}
if (lifecycleShouldRun) {
  const lifecycle = boundedSpawn(process.execPath, [LIFECYCLE_GUARD], {
    cwd: projectRoot,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
    encoding: "utf8",
    input: rawInput,
  }, { capMs: 3_000, reserveMs: 1_500 });
  const detail = String(lifecycle.stderr ?? "").trim();
  if (lifecycle.status === 2) denials.push({
    guard: "guard-lifecycle-ready.mjs",
    reason: detail || "guard-lifecycle-ready denied the tool call.",
  });
  else if (lifecycle.status === 1) warnings.push(detail || "guard-lifecycle-ready returned a warning.");
  else if (lifecycle.status !== 0) {
    const failure = lifecycle.error?.code ?? lifecycle.error?.name
      ?? lifecycle.signal ?? `exit-${String(lifecycle.status)}`;
    diagnostic("lifecycle-guard-failed", { failure });
    denials.push({
      guard: "guard-lifecycle-ready.mjs",
      reason: `guard-lifecycle-ready failed within the hook budget (${failure}); pipeline guards fail closed.`,
    });
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
          action: { toolName, toolInputSha256, repositoryRoot: projectRoot },
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
      if (planned.status === "planned") {
        const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
        overrideGuidance = [
          "",
          "Human override available for this exact action (one use; audited; explicit confirmation required):",
          `${process.execPath} ${JSON.stringify(script)} plan --repo ${JSON.stringify(projectRoot)} --request-sha256 ${planned.requestSha256}`,
        ].join("\n");
      } else if (planned.status === "author-repair-required") {
        const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
        overrideGuidance = [
          "",
          "Pipeline Author Repair is available for this exact source action (one use; audited; explicit confirmation required):",
          `${process.execPath} ${JSON.stringify(script)} plan --repo ${JSON.stringify(projectRoot)} --request-sha256 ${planned.requestSha256} --author-source-root ${JSON.stringify(planned.candidateSourceRoot)}`,
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
              action: { toolName, toolInputSha256, repositoryRoot: projectRoot },
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

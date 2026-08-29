#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Translate provider-neutral guard exits into Antigravity PreToolUse decisions. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, read, realpathSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { isSanctionedLifecycleCommand } from "./guard-lifecycle-ready.mjs";
import {
  consumeHumanGuardOverride,
  humanGuardOverrideInternals,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
// NVA-CF-BL19-COPYSAFEADOPT: sourced from the shared renderer module rather
// than project-onboarding-v3.mjs directly -- boundedOpaqueCopyCommand is the
// same function (re-exported there, unchanged), so this file's bounded-
// rendering output stays byte-identical. boundedCopySafeCommand/placeholder
// build the ceremony command lines below, replacing the hand-assembled
// `${process.execPath} ${JSON.stringify(script)} ...` templates the backlog
// item measured as one of the inconsistent emitters, mirroring the identical
// adoption already landed in guard-lifecycle-ready.mjs, guard-testpath.mjs
// and guard-gate-strength.mjs (NVA-W12-COPYSAFE).
import { boundedCopySafeCommand, boundedOpaqueCopyCommand, placeholder } from "../lib/copy-safe-command.mjs";
import {
  nativeHookSessionId,
  rememberedNativeHookFailure,
  rememberNativeHookFailure,
} from "../lib/native-hook-failure-memory.mjs";
import { parseGuardCommand } from "./guard-command-grammar.mjs";
import { commandIsGitPush } from "../lib/git-cmd.mjs";

const { eligibility } = humanGuardOverrideInternals;

const DEBUG_PREFIX = "[pipeline.agy-pretool.v1]";
const PLUGIN_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PIPELINE_START_SKILL = join(PLUGIN_ROOT, "skills", "pipeline-start", "SKILL.md");
const LIFECYCLE_GUARD = join(PLUGIN_ROOT, "hooks", "guard-lifecycle-ready.mjs");
const HOOK_STARTED_AT = Date.now();
const HOOK_BUDGET_MS = 42_000;
const STDIN_TIMEOUT_MS = 1_000;
const STDIN_MAX_BYTES = 1024 * 1024;
const NESTED_GUARD_BUDGETS = Object.freeze({
  "guard-lifecycle-ready.mjs": { capMs: 8_000, reserveMs: 5_000 },
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

export function allow() {
  if (completed) return;
  completed = true;
  process.stdout.write(`${JSON.stringify({ decision: "allow" })}\n`);
  process.exit(0);
}

export function deny(reason, debug = undefined) {
  if (completed) return;
  completed = true;
  if (debug) diagnostic(debug.code, debug.fields);
  process.stderr.write(`BLOCKED: ${reason}\n`);
  process.stdout.write(`${JSON.stringify({
    decision: "deny",
    reason,
  })}\n`);
  process.exit(2);
}

function remainingBudgetMs(reserveMs = 0) {
  return HOOK_BUDGET_MS - (Date.now() - HOOK_STARTED_AT) - reserveMs;
}

function timedOutSpawnResult() {
  const error = new Error("Antigravity PreToolUse hook budget is exhausted");
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
      const error = new Error("Antigravity PreToolUse input did not close in time");
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
          const oversized = new Error("Antigravity PreToolUse input exceeds its byte limit");
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

process.on("uncaughtException", (error) => {
  deny("Antigravity PreToolUse guard failed internally; pipeline guards fail closed.", {
    code: "adapter-uncaught",
    fields: { name: error?.name, code: error?.code },
  });
});
process.on("unhandledRejection", (reason) => {
  deny("Antigravity PreToolUse guard failed internally; pipeline guards fail closed.", {
    code: "adapter-unhandled-rejection",
    fields: { name: reason?.name, code: reason?.code },
  });
});

/** Normalize Antigravity / Cortex tool envelope into canonical tool_name & tool_input */
export function normalizeAntigravityToolInput(rawEnvelope) {
  if (!rawEnvelope || typeof rawEnvelope !== "object") {
    return { toolName: "", toolInput: {}, filePath: null, command: "", isReadOnly: false };
  }

  // Case 1: Antigravity toolCall envelope
  if (rawEnvelope.toolCall) {
    const name = String(rawEnvelope.toolCall.name ?? "");
    const args = rawEnvelope.toolCall.args ?? {};
    if (name === "run_command") {
      const command = String(args.CommandLine ?? args.command ?? "");
      return {
        toolName: "Bash",
        toolInput: { command, cwd: args.Cwd },
        filePath: null,
        command,
        isReadOnly: false,
      };
    }
    if (name === "write_to_file") {
      const filePath = String(args.TargetFile ?? args.file_path ?? "");
      return {
        toolName: "Write",
        toolInput: {
          file_path: filePath,
          content: args.CodeContent ?? args.content ?? "",
        },
        filePath,
        command: "",
        isReadOnly: false,
      };
    }
    if (name === "replace_file_content") {
      const filePath = String(args.TargetFile ?? args.file_path ?? "");
      return {
        toolName: "Edit",
        toolInput: {
          file_path: filePath,
          old_string: args.TargetContent ?? args.old_string ?? "",
          new_string: args.ReplacementContent ?? args.new_string ?? "",
        },
        filePath,
        command: "",
        isReadOnly: false,
      };
    }
    if (name === "invoke_subagent") {
      const subagentsRaw = Array.isArray(args.Subagents) ? args.Subagents : [];
      // D3 fix: carry every entry's type+prompt, not only index 0, so the Contamination Rule
      // check below can reach a Critic subagent sitting anywhere in a multi-subagent envelope.
      // Additive: kept OFF toolInput so canonicalPayload (built from toolInput, forwarded to
      // guard-dispatch.mjs) stays byte-identical to the existing single-subagent shape.
      const subagents = subagentsRaw.map((entry) => ({
        subagent_type: entry?.TypeName ?? entry?.Role ?? "",
        prompt: entry?.Prompt ?? "",
      }));
      const firstSubagent = subagentsRaw.length > 0 ? subagentsRaw[0] : null;
      return {
        toolName: "Task",
        toolInput: firstSubagent ? {
          subagent_type: firstSubagent.TypeName ?? firstSubagent.Role ?? "",
          prompt: firstSubagent.Prompt ?? "",
          ...args,
        } : args,
        filePath: null,
        command: "",
        isReadOnly: false,
        subagents,
      };
    }
    // Read-only or unmanaged tool calls in Antigravity
    const readOnlyTools = new Set([
      "view_file", "list_dir", "find_by_name", "grep_search", "read_url_content",
      "ask_question", "schedule", "manage_task", "send_message", "define_subagent",
      "manage_subagents", "generate_image",
    ]);
    return {
      toolName: name,
      toolInput: args,
      filePath: null,
      command: "",
      isReadOnly: readOnlyTools.has(name),
    };
  }

  // Case 2: Canonical tool_name / tool_input envelope
  const toolName = String(rawEnvelope.tool_name ?? "");
  const toolInput = rawEnvelope.tool_input ?? {};
  const filePath = typeof toolInput.file_path === "string" ? toolInput.file_path : null;
  const command = typeof toolInput.command === "string" ? toolInput.command : "";
  const isReadOnly = !["Bash", "apply_patch", "Edit", "Write", "Task", "Agent"].includes(toolName);
  return { toolName, toolInput, filePath, command, isReadOnly };
}

function commandDisclosureFields(root, tool, toolInput, rawCommand) {
  let secretBearing = true;
  try {
    const probe = eligibility(root, tool, toolInput ?? {});
    secretBearing = probe.eligible === false && probe.code === "HGO-NONOVERRIDABLE-SECRET";
  } catch { /* fail closed */ }
  const commandIsSafe = tool === "Bash" && !secretBearing;
  return {
    command: commandIsSafe ? rawCommand : null,
    copyCommand: commandIsSafe ? boundedOpaqueCopyCommand(rawCommand) : null,
  };
}

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

export async function runAntigravityPreToolGuard(rawInput) {
  let input;
  try { input = JSON.parse(rawInput); }
  catch { deny("Antigravity PreToolUse input is not valid JSON; pipeline guards fail closed."); }

  const normalized = normalizeAntigravityToolInput(input);

  // --- Antigravity Hardening Layer: Enforced Read-Only Critic ---
  // define_subagent is classified as a read-only tool call below (it defines
  // an agent, it does not itself act), so this check must run BEFORE that
  // isReadOnly short-circuit -- otherwise a critic subagent defined with write
  // tools enabled would never reach anything that could refuse it, defeating
  // ADR-0014's machine-enforced read-only Critic contract.
  if (normalized.toolName === "define_subagent") {
    const subagentInput = normalized.toolInput ?? {};
    if (String(subagentInput.name ?? "").toLowerCase().includes("critic")
      && subagentInput.enable_write_tools !== false) {
      deny("BLOCKED (Hardening Layer): Critic subagent must be defined with enable_write_tools: false to guarantee read-only isolation (ADR-0014).");
    }
  }

  if (normalized.isReadOnly) {
    allow();
    return;
  }

  const { toolName, toolInput, filePath, command } = normalized;
  const supportedTools = new Set(["Bash", "Edit", "Write", "Task", "Agent"]);
  if (!supportedTools.has(toolName)) {
    deny(`Unsupported or missing Antigravity tool_name ${JSON.stringify(toolName)}; pipeline guards fail closed.`);
  }
  if (toolName === "Bash" && command.trim() === "") {
    deny("Bash input has no unambiguous command; pipeline command guards fail closed.");
  }
  if (["Edit", "Write"].includes(toolName) && (typeof filePath !== "string" || filePath.trim() === "")) {
    deny(`${toolName} input has no unambiguous file_path; pipeline write guards fail closed.`);
  }

  const toolInputSha256 = createHash("sha256")
    .update(JSON.stringify(toolInput ?? {}))
    .digest("hex");

  let projectRoot;
  try {
    const rawCwd = (Array.isArray(input?.workspacePaths) && input.workspacePaths.length > 0)
      ? input.workspacePaths[0]
      : (typeof input?.cwd === "string" && input.cwd.trim() !== "" ? input.cwd : process.cwd());
    projectRoot = realpathSync(resolve(rawCwd));
  } catch (error) {
    deny("Antigravity PreToolUse project root is unavailable; pipeline guards fail closed.", {
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

  // --- Antigravity Hardening Layer: critic dispatch contamination + inline exec containment ---
  if (toolName === "Task") {
    // D3 fix: inspect EVERY subagent entry in the raw envelope, not only index 0 -- a
    // multi-subagent invoke_subagent call can carry the Critic at any position. Fall back to
    // the single-subagent toolInput shape (subagent_type/prompt) when the envelope never
    // populated `subagents` (e.g. the canonical tool_name/tool_input envelope), preserving the
    // existing single-subagent behaviour exactly.
    const subagentEntries = Array.isArray(normalized.subagents) && normalized.subagents.length > 0
      ? normalized.subagents
      : [{ subagent_type: toolInput.subagent_type, prompt: toolInput.prompt }];
    for (const entry of subagentEntries) {
      if (!String(entry?.subagent_type ?? "").toLowerCase().includes("critic")) continue;
      const prompt = entry?.prompt || "";
      // Disallow prose instructions (Paths Only Contamination Rule): a Critic
      // dispatch built from the template carries paths/refs, never conversational
      // steering -- roles/critic.md, templates/prompts/critic-review.md §2.
      // D2 fix: the trigger word must not be preceded by a hyphen, so a prompt naming
      // templates/prompts/critic-review.md is not denied purely because "review" sits between
      // "-" and ".".
      // F1 fix: D2's first attempt (`(?:^|\s)` instead of `\b`) over-corrected -- it also
      // stopped matching a trigger word preceded by markdown emphasis, a quote, or a bracket
      // (`- **review** the tests`, `"Review the diff."`). A negative lookbehind that excludes
      // only word-characters and the hyphen keeps the D2 fix (a hyphen still is not a boundary)
      // while restoring detection for every other non-word character that can precede a
      // trigger word in ordinary prose.
      if (/(?<![\w-])(you are|please|examine|look at|review)\b/i.test(prompt)) {
        deny("BLOCKED (Hardening Layer): Critic dispatch prompt contains prose. Only paths and refs are allowed (Contamination Rule).");
      }
    }
  }

  if (toolName === "Bash") {
    const trimCmd = command.trim();
    // Layer 1: OS-level / interpreter inline code execution containment.
    // D6 fix: also cover sh -c / bash -c, and node's --eval/-p/-pe forms (longer
    // alternatives first so -p does not shadow -pe before backtracking).
    // F6 fix: D6's `sh|bash` alternative matched a bare `-c` only, missing combined
    // single-dash flag clusters that still end in `c` (`bash -lc`, `sh -ec`, `sh -exc`) and
    // two more shell names entirely (`zsh -c`, `dash -c`). Match any `-`-flag cluster of the
    // named shells that ends in `c` instead of requiring `-c` verbatim; a bare `bash
    // script.sh` (no `-`-flag at all) still does not match.
    // delta-4 Critic F4 fix: F6's fix still required the `-*c` cluster immediately after the
    // shell name, so a long-form/unrelated flag first (`bash --login -c`, `bash -o pipefail
    // -c`) bypassed it. Allow any run of whitespace-separated tokens between the shell name
    // and the `-*c` cluster, not just direct adjacency; a bare `bash script.sh` (no `-`-flag
    // token anywhere) still does not match, since no token in that command matches `-[a-zA-Z]*c\b`.
    if (
      /\b(?:node|python3?|ruby|perl|php)\s+(?:--eval\b|-(?:pe|p|e|c)\b)/.test(trimCmd)
      || /\b(?:sh|bash|zsh|dash)\b(?:\s+\S+)*?\s+-[a-zA-Z]*c\b/.test(trimCmd)
    ) {
      deny("BLOCKED (Hardening Layer): Inline code execution (e.g. node -e, python -c) is blocked. Write code to a scratch file in the workspace first to respect filesystem containment guards.");
    }
  }
  // -----------------------------------------------------------------------

  const isLifecycleTool = toolName === "Bash" && isSanctionedLifecycleCommand(command, projectRoot);

  const hookSessionId = nativeHookSessionId(input);

  // Methodological Enforcement (Hard Block):
  const sessionBootstrapMarker = join(projectRoot, ".git", "agent-pipeline", "run", `session-${hookSessionId}`, "requires-bootstrap.lock");
  const isBootstrap = isBootstrapReadCommand(command);

  if (existsSync(sessionBootstrapMarker)) {
    if (toolName === "Bash" && isBootstrap) {
      try { rmSync(sessionBootstrapMarker, { force: true }); } catch (e) {}
    } else if (["Bash", "Edit", "Write"].includes(toolName)) {
      deny("BLOCKED (Hardening Layer): Mandatory Session Bootstrap. You must execute 'pipeline-start' before performing any implementation work in this session.");
    }
  }

  // PO Gate Hardening: Block agent from self-approving feature plans and push actions
  if (toolName === "Bash" && /(?:^|\s|\/)(?:pipeline-state(?:\.mjs)?)\s+approve-plan\b/u.test(command)) {
    deny("BLOCKED (PO Gate): Agent self-approval prohibited. 'approve-plan' is an explicit Human/PO decision. You must present the PRD and Technical Specification to the user in chat and request approval. The user must approve the plan by running: pipeline-state approve-plan --by <name>");
  }
  if (toolName === "Bash" && /(?:^|\s|\/)(?:pipeline-state(?:\.mjs)?)\s+approve-push\b/u.test(command)) {
    deny("BLOCKED (PO Gate): Agent self-approval prohibited. 'approve-push' is an explicit Human/PO decision. You must present the candidate commit and git status to the user in chat and request approval. The human operator must approve the push by running: pipeline-state approve-push --by <name> --remote <remote> --destination <destination> [--challenge <challenge>]");
  }

  const guardNames = toolName === "Bash"
    ? [
      ...( /\bgit(?:\.exe)?\b/iu.test(command) ? ["guard-git.mjs"] : []),
      ...(commandIsGitPush(command) ? ["guard-push.mjs"] : []),
    ]
    : ["Edit", "Write"].includes(toolName)
      ? ["guard-testpath.mjs", "guard-devplan.mjs", "guard-gate-strength.mjs", "guard-handover-size.mjs"]
      : toolName === "Task" || toolName === "Agent"
        ? ["guard-dispatch.mjs"]
        : [];

  const canonicalPayload = JSON.stringify({
    tool_name: toolName,
    tool_input: toolInput,
    cwd: projectRoot,
  });

  const denials = [];
  const warnings = [];

  // F2 fix: guard-dispatch.mjs previously only ever saw `canonicalPayload`, which is built
  // from `toolInput` alone -- and `toolInput.subagent_type`/`prompt` always derive from
  // Subagents[0] (see normalizeAntigravityToolInput above). With the Critic at index >= 1 of
  // a multi-subagent envelope, guard-dispatch.mjs never inspected that entry, even though the
  // local Contamination Rule check above (D3) already loops every entry. Run guard-dispatch.mjs
  // once per subagent entry when there is more than one, each with its own entry-shaped
  // payload; when there is only one entry (or no `subagents` array at all -- the canonical
  // tool_name/tool_input envelope shape), keep the exact single-invocation behaviour, same
  // payload, unchanged.
  const multiSubagentDispatch = (toolName === "Task" || toolName === "Agent")
    && Array.isArray(normalized.subagents) && normalized.subagents.length > 1;

  function runNestedGuard(guardName, payload, memoryToolInput) {
    const memoryInput = {
      rootDir: projectRoot, sessionId: hookSessionId, toolName,
      toolInput: memoryToolInput ?? {}, guard: guardName,
    };
    const remembered = rememberedNativeHookFailure(memoryInput);
    if (remembered) {
      denials.push({ guard: guardName, reason: remembered.reason });
      diagnostic("native-hook-failure-suppressed", { guard: guardName, code: remembered.code });
      return;
    }
    const guard = fileURLToPath(new URL(`./${guardName}`, import.meta.url));
    const result = boundedSpawn(process.execPath, [guard], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectRoot,
        PIPELINE_REQUIRE_TYPED_HUMAN_OVERRIDE: "1",
      },
      encoding: "utf8",
      input: payload,
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

  for (const guardName of guardNames) {
    if (guardName === "guard-dispatch.mjs" && multiSubagentDispatch) {
      for (const entry of normalized.subagents) {
        const entryToolInput = {
          ...toolInput,
          subagent_type: entry?.subagent_type,
          prompt: entry?.prompt,
        };
        const entryPayload = JSON.stringify({
          tool_name: toolName,
          tool_input: entryToolInput,
          cwd: projectRoot,
        });
        runNestedGuard(guardName, entryPayload, entryToolInput);
      }
      continue;
    }
    runNestedGuard(guardName, canonicalPayload, toolInput);
  }

  const lifecycleShouldRun = lifecycleGoverned
    && !isLifecycleTool
    && !isBootstrapReadCommand(command)
    && ["Bash", "Edit", "Write"].includes(toolName);

  if (lifecycleShouldRun) {
    const lifecycleGuard = "guard-lifecycle-ready.mjs";
    const lifecycleMemoryInput = {
      rootDir: projectRoot, sessionId: hookSessionId, toolName,
      toolInput: toolInput ?? {}, guard: lifecycleGuard,
    };
    const remembered = rememberedNativeHookFailure(lifecycleMemoryInput);
    if (remembered) {
      denials.push({ guard: lifecycleGuard, reason: remembered.reason });
      diagnostic("native-hook-failure-suppressed", { guard: lifecycleGuard, code: remembered.code });
    } else {
      const lifecycle = boundedSpawn(process.execPath, [LIFECYCLE_GUARD, "--runner", "antigravity"], {
        cwd: projectRoot,
        env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot },
        encoding: "utf8",
        input: canonicalPayload,
      }, { capMs: 4_000, reserveMs: 1_500 });
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
    if (grammarOnlyDenial) {
      deny(denials.map((entry) => entry.reason).join("\n"));
    }
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
              ...commandDisclosureFields(projectRoot, toolName, toolInput, command),
            },
            reason: "the target path is outside this repository's physical authority boundary",
          },
        }),
      ].join("\n"));
    }

    const overrideSpawn = (executable, args, options) => boundedSpawn(
      executable,
      args,
      options,
      { capMs: 2_000, reserveMs: 750 },
    );

    let consumed;
    try {
      consumed = consumeHumanGuardOverride({
        rootDir: projectRoot,
        pluginRoot: PLUGIN_ROOT,
        toolName,
        toolInput: toolInput ?? {},
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
      allow();
      return;
    }

    let overrideGuidance = "";
    if (consumed.status === "absent" || consumed.status === "replan") {
      try {
        const planned = recordHumanGuardDenial({
          rootDir: projectRoot,
          pluginRoot: PLUGIN_ROOT,
          toolName,
          toolInput: toolInput ?? {},
          denials,
          spawn: overrideSpawn,
        });
        const overrideRepo = typeof planned.root === "string" && planned.root !== ""
          ? planned.root
          : projectRoot;
        if (planned.status === "planned") {
          const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
          let approvalMode = "signature";
          try { approvalMode = readPushApprovalMode(projectRoot, { spawn: overrideSpawn })?.mode ?? "signature"; }
          catch { approvalMode = "signature"; }
          // NVA-CF-BL19-COPYSAFEADOPT: every ceremony command line built through the
          // shared renderer instead of a hand-assembled `${JSON.stringify(...)}`
          // template. A human fill-in slot like "<plan-sha256>" passes through
          // placeholder() verbatim -- never shellWord()-quoted like a literal
          // value. script/overrideRepo are ALSO passed through placeholder() here,
          // pre-rendered with JSON.stringify(); request-sha256 is the one real
          // value that goes through ordinary shellWord() quoting. Mirrors
          // guard-testpath.mjs's own ceremonyCommand() exactly.
          const ceremonyCommand = (subcommand, ...extraArgv) =>
            boundedCopySafeCommand({
              executable: process.execPath,
              argv: [
                placeholder(JSON.stringify(script)), subcommand, "--repo", placeholder(JSON.stringify(overrideRepo)),
                "--request-sha256", planned.requestSha256, ...extraArgv,
              ],
            }).command;
          const continuation = approvalMode === "chat"
            ? [
              `Then (the human confirms in-session; this is attribution, not proof -- gates.push_approval is "chat"):`,
              ceremonyCommand(
                "prepare-authorization", "--plan-sha256", placeholder("<plan-sha256-from-plan>"), "--reason", placeholder('"<human-reason>"'),
              ),
              ceremonyCommand(
                "authorize", "--plan-sha256", placeholder("<plan-sha256>"), "--selection-sha256", placeholder("<selection-sha256>"),
                "--reason", placeholder('"<human-reason>"'), "--reason-sha256", placeholder("<reason-sha256>"), "--activate",
              ),
            ].join("\n")
            : [
              `Then, in this session (pure digest computation against data already in the repository -- neither step needs the external key, ADR-0059 Decision 1):`,
              ceremonyCommand(
                "prepare-authorization", "--plan-sha256", placeholder("<plan-sha256-from-plan>"), "--reason", placeholder('"<fixed HGO_SIGNATURE_REASON text>"'),
              ),
              ceremonyCommand("emit-signature-digest", "--plan-sha256", placeholder("<plan-sha256>")),
              `Then, outside this session (gates.push_approval is "${approvalMode}"; only the signature itself needs the external Ed25519 key; presence of a valid, correctly-bound signature IS the authorization -- there is no in-session activate step for this mode):`,
              ceremonyCommand(
                "authorize-by-signature", "--plan-sha256", placeholder("<plan-sha256>"), "--proof", placeholder("<external-proof.json>"),
              ),
            ].join("\n");
          overrideGuidance = [
            "",
            "Human override available for this exact action (one use; audited; explicit confirmation required):",
            ceremonyCommand("plan"),
            continuation,
          ].join("\n");
        } else if (planned.status === "author-repair-required") {
          const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
          const authorRepairCommand = boundedCopySafeCommand({
            executable: process.execPath,
            argv: [
              placeholder(JSON.stringify(script)), "plan", "--repo", placeholder(JSON.stringify(overrideRepo)),
              "--request-sha256", planned.requestSha256, "--author-source-root", placeholder(JSON.stringify(planned.candidateSourceRoot)),
            ],
          }).command;
          overrideGuidance = [
            "",
            "Pipeline Author Repair is available for this exact source action (one use; audited; explicit confirmation required):",
            authorRepairCommand,
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
        let hostBoundaryAction = { toolName, toolInputSha256, repositoryRoot: projectRoot };
        if (hostBoundary) {
          hostBoundaryAction = {
            toolName,
            toolInputSha256,
            repositoryRoot: projectRoot,
            ...commandDisclosureFields(projectRoot, toolName, toolInput, command),
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
  allow();
}

if (isDirectInvocation(import.meta.url)) {
  let rawInput;
  try { rawInput = await readStdinBounded(); }
  catch (error) {
    deny("Antigravity PreToolUse input was unavailable within the hook budget; pipeline guards fail closed.", {
      code: "stdin-read-failed",
      fields: { name: error?.name, code: error?.code },
    });
  }

  await runAntigravityPreToolGuard(rawInput);
}

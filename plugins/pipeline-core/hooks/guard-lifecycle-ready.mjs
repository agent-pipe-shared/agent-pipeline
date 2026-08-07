#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/** Codex implementation-write guard for already Pipeline-governed roots. */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "../lib/project-onboarding-ready-gate.mjs";
import { inspectProjectOnboardingV3 } from "../lib/project-onboarding-v3.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../lib/runtime-projection-v3.mjs";
import {
  hasCodexExistingGitControlMount,
  readCodexHostRepositoryInitAdmission,
} from "../lib/codex-host-layout.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import {
  consumeHumanGuardOverride,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";
import { GATE_STRENGTH_PATHS } from "./guard-gate-strength.mjs";
import {
  isBoundedReadOnlyPipeline,
  parseGuardCommand,
} from "./guard-command-grammar.mjs";

// ADR-0059 Decision 3/4: the same generic, exact-command-bound Human-Guard-Override
// (HGO) route the other guards in this family already use for their own denials
// (guard-testpath.mjs, codex-pretool-guard.mjs). Reused here unmodified -- only the
// three closed-shell-grammar denial codes below are wired to it; GUARD-CROSS-REPO-MUTATION
// and GUARD-LIFECYCLE-NOT-READY stay outside HGO's authority (ADR-0059 Decision 5,
// this file's own header comments on crossRepositoryMutationBlocked()).
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const GOVERNANCE_MARKERS = [
  ".agent-pipeline/core.lock.json",
  "pipeline.user.yaml",
  "project/pipeline.json",
  "project/pipeline.yaml",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
  ...loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path),
].filter((value, index, values) => values.indexOf(value) === index);
const READY_RECEIPT_KEYS = ["intent", "schema", "status"];
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
const V3_BOOTSTRAP_AUTHORITY_SCRIPT = fileURLToPath(new URL("../scripts/v3-bootstrap-authority.mjs", import.meta.url));
const LAUNCH_SCRIPT = fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url));
const READBACK_SCRIPT = fileURLToPath(new URL("../scripts/codex-project-runtime-readback-host.mjs", import.meta.url));
const APP_SERVER_SCRIPT = fileURLToPath(new URL("../scripts/codex-app-server-health.mjs", import.meta.url));
const START_PREFLIGHT_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-start-preflight.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const SESSION_CAPABILITY_DIAGNOSE_SCRIPT = fileURLToPath(new URL("../scripts/session-capability-diagnose.mjs", import.meta.url));
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const PO_PROFILE_REPAIR_SCRIPT = fileURLToPath(new URL("../scripts/po-gate-profile-repair.mjs", import.meta.url));
const PROJECT_AUTHORITY_MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/project-authority-migration.mjs", import.meta.url));
const RESUME_HINT_SCRIPT = fileURLToPath(new URL("../scripts/resume-hint.mjs", import.meta.url));
const HUMAN_OVERRIDE_SCRIPT = fileURLToPath(new URL("../scripts/guard-human-override.mjs", import.meta.url));
const PRIVATE_OVERLAY_SCRIPT = fileURLToPath(new URL("../scripts/codex-private-overlay-activation.mjs", import.meta.url));
const PO_HUMAN_APPROVAL_SCRIPT = fileURLToPath(new URL("../scripts/po-human-approval.mjs", import.meta.url));
const PO_APPROVAL_GATE_SCRIPT = fileURLToPath(new URL("../scripts/po-approval-gate.mjs", import.meta.url));
const RESTART_RESUME_HINT_INPUT_PATH = "project/.resume-hint-input.json";
const HEX = /^[a-f0-9]{64}$/u;
const VALID_RUNNERS = new Set(["claude", "codex"]);
// Every write-capable tool this gate admits. NotebookEdit was absent from both this list
// and from every hooks.json matcher until 2026-08-06, so a .ipynb write returned verdict(0)
// -- allow -- without the session ever proving a ready bootstrap. Its target arrives as
// `notebook_path`, not `file_path`; see lib/tool-write-target.mjs.
const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];
// Both shells this hook is wired for. PowerShell was named in the matcher but in no
// decision, which made the whole gate a no-op on the runner that uses it.
const SHELL_TOOLS = ["Bash", "PowerShell"];
const HOST_INIT_CROSS_VIEW_STATUSES = new Set([
  "repository-mount-read-only",
  "repository-control-path-invalid",
]);
const CONTROLLING_NON_READY_STATUSES = new Set(
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
);

function verdict(exitCode, stderr = "") {
  return { exitCode, stderr };
}

function exactReadyReceipt(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(READY_RECEIPT_KEYS)
    && value.schema === "pipeline.project-onboarding-ready-gate.v1"
    && value.status === "ready"
    && value.intent === "session";
}

// Hoisted to module scope so grammarOverrideRoute() can build the identical, exact
// denial reason text blocked() itself prints -- the two must never drift apart, since
// the HGO request/capability is bound to this exact reason string.
const GRAMMAR_DENIAL_GUIDANCE = {
  "GUARD-PARSE-UNSUPPORTED": "The command is outside the closed Pipeline shell grammar.",
  "GUARD-OPERATOR-UNAPPROVED": "The command contains an unapproved shell operator.",
  "GUARD-REDIRECT-UNAPPROVED": "The command contains an unapproved shell redirection.",
};

function blocked(code = "GUARD-LIFECYCLE-NOT-READY", lifecycleStatus = null, retryActions = [], overrideGuidance = "") {
  const typedLifecycleStatus = code === "GUARD-LIFECYCLE-NOT-READY"
    && CONTROLLING_NON_READY_STATUSES.has(lifecycleStatus)
    ? lifecycleStatus
    : null;
  const grammarReason = GRAMMAR_DENIAL_GUIDANCE[code];
  if (grammarReason) {
    const retryEnvelope = {
      schema: "pipeline.guard-retry-actions.v1",
      retryActions,
    };
    return verdict(
      2,
      "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
        + `${code}: ${grammarReason}\n`
        + "Use one simple shell command per tool call; issue independent read-only commands as separate parallel tool calls.\n"
        + "Do not construct a new composed command with &&, ;, pipelines, redirects, or line continuation.\n"
        + "If typed retryActions are present, run only those exact read-only actions as separate tool calls.\n"
        + "Only bounded rg-to-rg and rg-to-head diagnostic pipelines are admitted as exceptions.\n"
        + `${JSON.stringify(retryEnvelope)}\n`
        + overrideGuidance,
    );
  }
  const guidance = typedLifecycleStatus === null
    ? [
      "Pipeline-governed project writes require an exact V4 ready result for session intent.",
      "Re-run the typed project-onboarding-v3 session inspection and use only its returned nextAction.",
    ]
    : [
      `Pipeline session readiness is ${typedLifecycleStatus}.`,
      "Re-run the typed project-onboarding-v3 inspection with intent session and use only its returned nextAction.",
    ];
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${code}: `
      + `${guidance[0]}\n`
      + `${guidance[1]}\n`,
  );
}

/**
 * ADR-0059 Decision 3: wire the three closed-shell-grammar denial codes into the
 * EXISTING, already-working generic HGO Bash class (`eligibility()`'s
 * `commandClass: "closed-shell-exact"`) -- no new classification logic, this file is a
 * CONSUMER of that machinery. Always attempt to consume a matching capability first
 * (harmless: it only ever succeeds against a genuinely armed, matching one, regardless
 * of mode); when nothing is consumed, attempt to record the denial and offer the
 * mode-appropriate next step (Decision 4). Offering the route is a convenience, never a
 * gate: an unusable store leaves the plain refusal exactly as it was -- same pattern as
 * guard-testpath.mjs's `overrideGuidance` block, adapted to this file's own message
 * shape. GUARD-CROSS-REPO-MUTATION and GUARD-LIFECYCLE-NOT-READY never call this
 * (ADR-0059 Decision 5; out of scope for this dispatch).
 *
 * The exact denial reason text is `${code}: ${GRAMMAR_DENIAL_GUIDANCE[code]}` -- the
 * SAME string blocked() itself prints for that code -- because the HGO request/capability
 * is bound to this exact reason string; a request planned for one code's reason will not
 * match a differently-worded denial for the same command.
 */
function grammarOverrideRoute(code, root, toolName, toolInput, dependencies = {}) {
  const denials = [{ guard: "guard-lifecycle-ready.mjs", reason: `${code}: ${GRAMMAR_DENIAL_GUIDANCE[code]}` }];
  const consumeFn = dependencies.consumeHumanGuardOverrideFn ?? consumeHumanGuardOverride;
  let consumed = { status: "absent" };
  try {
    consumed = consumeFn({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
  } catch {
    consumed = { status: "absent" }; // an unusable capability is not an authorization
  }
  if (consumed.status === "consumed") {
    return {
      admitted: verdict(
        0,
        `[pipeline-human-override] guard-lifecycle-ready ${code}: exact one-time capability consumed; plan=${consumed.planSha256}.\n`,
      ),
    };
  }
  let overrideGuidance = "";
  if (consumed.status === "absent" || consumed.status === "replan") {
    let approvalMode = "signature";
    const readModeFn = dependencies.readPushApprovalModeFn ?? readPushApprovalMode;
    try { approvalMode = readModeFn(root)?.mode ?? "signature"; } catch { approvalMode = "signature"; }
    try {
      const recordFn = dependencies.recordHumanGuardDenialFn ?? recordHumanGuardDenial;
      const planned = recordFn({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
      if (planned.status === "planned") {
        const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
        // ADR-0059 Decision 4: name the exact next command for the CURRENTLY CONFIGURED
        // mode -- mirrors guard-testpath.mjs's own continuation exactly in shape.
        const continuation = approvalMode === "chat"
          ? [
            `Then (the human confirms in-session; this is attribution, not proof):`,
            `${process.execPath} ${JSON.stringify(script)} prepare-authorization --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256-from-plan> --reason "<human-reason>"`,
            `${process.execPath} ${JSON.stringify(script)} authorize --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256> --selection-sha256 <selection-sha256> --reason "<human-reason>" --reason-sha256 <reason-sha256> --activate`,
          ].join("\n")
          : [
            `Then, outside this session (presence of a valid, correctly-bound Ed25519 ` +
              `signature IS the authorization -- there is no in-session activate step for this mode):`,
            `${process.execPath} ${JSON.stringify(script)} prepare-authorization --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256-from-plan> --reason "<fixed HGO_SIGNATURE_REASON text>"`,
            `${process.execPath} ${JSON.stringify(script)} authorize-by-signature --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256> --proof <external-proof.json>`,
          ].join("\n");
        overrideGuidance = [
          "",
          "Human override available for this exact command (one use; audited; the human confirms):",
          `${process.execPath} ${JSON.stringify(script)} plan --repo ${JSON.stringify(root)} --request-sha256 ${planned.requestSha256}`,
          continuation,
          "",
        ].join("\n");
      }
    } catch { /* no route offered; the plain grammar refusal stands unchanged */ }
  }
  return { admitted: null, overrideGuidance };
}

function externalRestartOnly() {
  return verdict(
    2,
    "EXTERNAL ACTION REQUIRED (guard-lifecycle-ready, plugin pipeline-core): "
      + "restart-process is external-terminal/user-copy-only and must never be executed through a Codex tool call.\n"
      + "Stop this session, show the exact lifecycle launch.copyCommand in a fenced code block, "
      + "and ask the user to run it in a real external terminal.\n",
  );
}

function protectedStateWriterOnly() {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + "Pipeline State is writer-owned and must not be edited directly.\n"
      + "Use the exact sanctioned State or digest-bound lifecycle writer action.\n",
  );
}

function crossRepositoryMutationBlocked() {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + "GUARD-CROSS-REPO-MUTATION: "
      + "A governed consumer session may write only inside its own physical project root.\n"
      + "Pipeline source, another repository, marketplace metadata, cachebuster updates, "
      + "and plugin installation require a separate session rooted at the exact target "
      + "plus their own explicit PO authorization.\n",
  );
}

/**
 * GS-1..GS-6 refuse an Edit or a Write. A shell command is neither.
 *
 * Measured 2026-08-06: `touch project/guard-config.json` was admitted with no guard
 * claiming it. `guard-gate-strength` is wired into exactly one PreToolUse entry, matcher
 * `Edit|Write|NotebookEdit`, so no Bash command can ever reach it -- and `node -e` is an
 * ordinary simple command under the closed grammar. An agent that wanted
 * `gates.push_approval: "chat"` therefore never needed the Edit tool at all, which is
 * precisely the property GS-1 was introduced to remove.
 *
 * Same shape as GS-6 one level up: the config decides a gate's strength, the installed
 * code decides whether the config is read -- and the shell decides everything, because it
 * was never asked.
 *
 * SHAPE. Substring, not token, matching: the path that matters can sit INSIDE a quoted
 * script argument (`node -e '...writeFileSync("pipeline.user.yaml", ...)'`), where token
 * matching sees one opaque word. That deliberately over-refuses -- a `git commit -m`
 * message merely naming one of these files is refused too. Over-refusal costs a `-F`
 * flag; under-refusal costs the gate. Read-only diagnostics are exempt via the existing
 * classifier, so `cat`, `rg`, `sha256sum` and `git diff` on these paths keep working.
 */
function gateStrengthShellRefusal(command, root) {
  if (typeof command !== "string" || command === "") return null;
  if (isReadOnlyDiagnosticCommand(command, root)) return null;
  // Scoped to the five configuration paths (GS-1..GS-5) deliberately. The live plugin
  // root (GS-6) is NOT a needle here: executing a plugin script by absolute path is the
  // normal bootstrap and recovery shape, so matching the root would refuse
  // `node <pluginRoot>/scripts/project-onboarding-v3.mjs inspect` -- the very command the
  // gate tells the operator to run. Shell WRITES into the enforcing plugin root are
  // already refused by GUARD-CROSS-REPO-MUTATION whenever the installed copy sits outside
  // the project root, which is the arrangement docs/claude-local-plugin-development.md
  // now prescribes; the residual case is recorded in docs/state.md rather than closed by
  // a rule that would break bootstrap.
  const needles = GATE_STRENGTH_PATHS.map((rule) => basename(rule.path));
  const haystack = command.replace(/\\/gu, "/").toLowerCase();
  const hit = needles.find((needle) => haystack.includes(needle.replace(/\\/gu, "/").toLowerCase()));
  if (hit === undefined) return null;
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + "GUARD-GATE-STRENGTH-SHELL: "
      + `This command names ${hit}, a file whose contents decide how strong a gate is, `
      + "and it is not a read-only diagnostic.\n"
      + "An agent that can weaken the gate authorizing its own actions has no gate, and the "
      + "Edit/Write refusal (GS-1..GS-6) is worth nothing if a shell command reaches the same "
      + "file. There is deliberately no in-session override.\n"
      + "Reading is unaffected: cat, rg, head, sha256sum and git diff/log/show on these paths "
      + "are admitted. To change one, the PO edits it outside an agent session.\n",
  );
}

function externalPoSigningOnly() {
  return verdict(
    2,
    "EXTERNAL ACTION REQUIRED (guard-lifecycle-ready, plugin pipeline-core): "
      + "PO setup and approve are human-terminal actions; the agent may prepare and verify only public request/proof artifacts.\n",
  );
}

/** Read an explicit `--runner <value>` from this process's own argv (ADR-0051). */
function runnerFromArgv(argv) {
  const index = argv.indexOf("--runner");
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function pathInside(root, target) {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Reject lexical escapes and escapes through an existing symlink ancestor. */
export function isProjectWritePath(filePath, root, dependencies = {}) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")) return false;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const realpath = dependencies.realpathSyncFn ?? realpathSync;
  const requested = resolve(root, filePath);
  if (!pathInside(root, requested)) return false;
  let ancestor = requested;
  try {
    while (ancestor !== root && !exists(ancestor)) ancestor = dirname(ancestor);
    return pathInside(root, realpath(ancestor));
  } catch {
    return false;
  }
}

function isRestartResumeHintInputWrite(input, root) {
  if (!WRITE_TOOLS.includes(String(input?.tool_name ?? ""))) return false;
  const filePath = writeTargetPath(input?.tool_input, String(input?.tool_name ?? ""));
  return filePath !== ""
    && resolve(root, filePath) === join(root, RESTART_RESUME_HINT_INPUT_PATH);
}

function simpleWords(command, root, options = {}) {
  const parsed = parseGuardCommand(command, root, options);
  if (parsed.parseStatus !== "accepted"
    || parsed.segments.length !== 1
    || parsed.operators.length !== 0
    || parsed.redirects.length !== 0) return null;
  return [parsed.segments[0].executable, ...parsed.segments[0].argv];
}

function exactRoot(args, root, index) {
  return args[index] === "--root" && args[index + 1] === root;
}

function isRestartResumeHintCapture(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  const platform = options.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = options.processExecPath ?? process.execPath;
  if (!words || ![...directNode, trustedNode].includes(words[0])) return false;
  const [script, ...args] = words.slice(1);
  return script === RESUME_HINT_SCRIPT
    && args[0] === "capture"
    && args[1] === "--root" && args[2] === root
    && args[3] === "--card-file" && args[4] === join(root, RESTART_RESUME_HINT_INPUT_PATH)
    && args[5] === "--consume-card" && args.length === 6;
}

/**
 * Keep fail-closed lifecycle states diagnosable without turning arbitrary
 * shell syntax into a write bypass.  Only one simple command is accepted; the
 * parser already rejects control operators, redirections and command
 * substitution.
 */
export function isReadOnlyDiagnosticCommand(command, root) {
  const parsed = parseGuardCommand(command, root);
  if (isBoundedReadOnlyPipeline(parsed, root)) return true;
  const words = simpleWords(command, root);
  if (!words || words.length === 0) return false;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);
  if (executable === "pwd") return args.length === 0 || (args.length === 1 && args[0] === "-P");
  if (["node", "node.exe"].includes(executable)) {
    return args.length === 2
      && args[0] === "--check"
      && !args[1].startsWith("-")
      && isProjectWritePath(args[1], root);
  }
  if (executable === "sha256sum") {
    const path = args.length === 1
      ? args[0]
      : args.length === 2 && args[0] === "--"
        ? args[1]
        : null;
    return typeof path === "string"
      && !path.startsWith("-")
      && isProjectWritePath(path, root);
  }
  if (executable === "shasum") {
    return args.length === 3
      && ["-a", "--algorithm"].includes(args[0])
      && args[1] === "256"
      && !args[2].startsWith("-")
      && isProjectWritePath(args[2], root);
  }
  if (["certutil", "certutil.exe"].includes(executable)) {
    return args.length === 3
      && args[0].toLowerCase() === "-hashfile"
      && !args[1].startsWith("-")
      && args[2].toUpperCase() === "SHA256"
      && isProjectWritePath(args[1], root);
  }
  if (["ls", "rg", "grep", "cat", "head", "tail", "wc", "stat", "file"].includes(executable)) {
    return !args.some((arg) => arg === "--files-with-matches" && executable === "grep");
  }
  if (executable === "sed") {
    return !args.some((arg) => /^-[^-]*[iew]/u.test(arg) || /^--(?:in-place|expression|file)(?:=|$)/u.test(arg));
  }
  if (executable === "find") {
    return !args.some((arg) => ["-delete", "-exec", "-execdir", "-fprint", "-fprintf", "-fls", "-ok", "-okdir"].includes(arg));
  }
  if (executable !== "git") return false;
  let index = 0;
  if (args[index] === "-C") index += 2;
  const subcommand = args[index];
  const subargs = args.slice(index + 1);
  if (["status", "diff", "log", "show", "rev-parse", "ls-files", "ls-tree", "for-each-ref"].includes(subcommand)) {
    return true;
  }
  if (subcommand === "branch") {
    return subargs.length === 0 || subargs.every((arg) =>
      arg === "--list" || arg === "--show-current" || arg === "--contains" || arg.startsWith("--format="));
  }
  if (subcommand === "remote") return subargs.length === 0 || (subargs.length === 1 && subargs[0] === "-v");
  // Fetch updates only remote-tracking/object state; it never changes the
  // index or working tree.  A stale or migration-required lifecycle must not
  // prevent an operator from observing the current upstream.  Destructive
  // adoption remains separately guarded at checkout/switch time.
  if (subcommand === "fetch") return true;
  return subcommand === "config"
    && subargs.length >= 2
    && ["--get", "--get-all", "--get-regexp"].includes(subargs[0]);
}

/**
 * Recover only independent semicolon- or physical-newline-separated
 * diagnostics. This is a correction hint, never an execution bypass: each
 * returned argv must pass the same closed single-command read-only policy on
 * its own. Quoted and escaped newlines are deliberately not normalized.
 */
export function retryActionsForDeniedCommand(command, root) {
  if (typeof command !== "string" || command.trim() === ""
    || /[\0`]/u.test(command) || /\$\s*\(/u.test(command)) return [];
  const parts = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) {
      if (char === "\r" || char === "\n") return [];
      escaped = false;
      continue;
    }
    if (quote !== "'" && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char === ";" || char === "\n" || char === "\r") {
      if (char === "\r" && command[index + 1] !== "\n") return [];
      parts.push(command.slice(start, index).trim());
      start = index + (char === "\r" ? 2 : 1);
      if (char === "\r") index += 1;
      continue;
    }
    if ("|&<>()".includes(char)) return [];
  }
  if (quote !== null || escaped || parts.length === 0) return [];
  parts.push(command.slice(start).trim());
  if (parts.some((part) => part === "")) return [];
  const actions = [];
  for (const part of parts) {
    const parsed = parseGuardCommand(part, root);
    if (parsed.parseStatus !== "accepted" || parsed.segments.length !== 1
      || parsed.operators.length !== 0 || parsed.redirects.length !== 0
      || !isReadOnlyDiagnosticCommand(part, root)) return [];
    actions.push({
      executable: parsed.segments[0].executable,
      argv: [...parsed.segments[0].argv],
      mutation: false,
      requiresConfirmation: false,
      executionBoundary: "separate-tool-call",
      expected: { exitCodes: [0, 1] },
    });
  }
  return actions;
}

function pipelineSourceRoot(root, exists = existsSync) {
  return exists(join(root, "plugins", "pipeline-core", ".codex-plugin", "plugin.json"))
    && exists(join(root, "harness", "scripts", "verify.mjs"));
}

function commandPath(value, root) {
  if (typeof value !== "string" || value === "" || value.startsWith("-")) return null;
  return resolve(root, value);
}

function hasExternalOutputRedirect(command, root) {
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (quote === "\"" && char === "\\") index += 1;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (char !== ">") continue;
    if (command[index + 1] === ">" || command[index + 1] === "&") continue;
    let cursor = index + 1;
    while (cursor < command.length && /\s/u.test(command[cursor])) cursor += 1;
    let target = "";
    while (cursor < command.length && !/\s/u.test(command[cursor])
      && !"|;&<>()".includes(command[cursor])) {
      target += command[cursor];
      cursor += 1;
    }
    const resolved = commandPath(target, root);
    if (resolved !== null && !pathInside(root, resolved)) return true;
  }
  return false;
}

function poApprovalArgs(command, root, scriptPath) {
  const words = simpleWords(command, root);
  if (!words || words.length < 3 || resolve(root, words[1]) !== scriptPath) return null;
  return words.slice(2);
}

function externalApprovalDirectory(args, root, index) {
  return args[index] === "--directory"
    && typeof args[index + 1] === "string"
    && isAbsolute(args[index + 1])
    && !pathInside(root, resolve(args[index + 1]));
}

/**
 * Preparation and verification handle public, candidate-bound artifacts only.
 * They are agent work.  Setup and signing remain excluded below because they
 * can access the human's private key or terminal passphrase prompt.
 */
export function isAgentPoPublicCommand(command, root) {
  const args = poApprovalArgs(command, root, PO_APPROVAL_GATE_SCRIPT);
  if (!args) return false;
  const feature = (index) => args[index] === "--feature-id" && ["cyb-4", "cyb-5"].includes(args[index + 1]);
  if (["prepare-all", "verify-all"].includes(args[0])) {
    return args[1] === "--repo-root" && args[2] === root
      && externalApprovalDirectory(args, root, 3) && args.length === 5;
  }
  if (["prepare", "verify"].includes(args[0])
    && args[1] === "--repo-root" && args[2] === root
    && externalApprovalDirectory(args, root, 3)) {
    return args.length === 5 || (feature(5) && args.length === 7);
  }
  return false;
}

function isHumanPoSigningCommand(command, root) {
  const args = poApprovalArgs(command, root, PO_HUMAN_APPROVAL_SCRIPT);
  return args !== null && ["setup", "approve", "approve-all"].includes(args[0]);
}

/**
 * Identify the concrete cross-repository mutation patterns involved in local
 * plugin development. Read-only commands remain handled by the diagnostic
 * allowlist; unknown commands do not gain mutation authority from this helper.
 */
export function isForbiddenCrossRepositoryMutation(command, root, dependencies = {}) {
  const parsed = parseGuardCommand(command, root);
  if (isAgentPoPublicCommand(command, root)) return false;
  if (poApprovalArgs(command, root, PO_APPROVAL_GATE_SCRIPT) !== null) return true;
  if (isBoundedReadOnlyPipeline(parsed, root)) return false;
  if (parsed.parseStatus !== "accepted" && hasExternalOutputRedirect(command, root)) return true;
  if (parsed.parseStatus === "accepted" && parsed.redirects.length > 0) {
    return parsed.redirects.some((redirect) => {
      if (redirect.fd === 2
        && (redirect.target === "/dev/null" || redirect.target.toLowerCase() === "nul")) return false;
      const target = commandPath(redirect.target, root);
      return target !== null && !pathInside(root, target);
    });
  }
  const words = simpleWords(command, root);
  if (!words || words.length === 0) return false;
  const exists = dependencies.existsSyncFn ?? existsSync;
  const executable = basename(words[0]).toLowerCase();
  const args = words.slice(1);

  if (/codex(?:\.exe)?$/iu.test(executable)) {
    const pluginIndex = args.indexOf("plugin");
    if (pluginIndex >= 0) {
      const operation = args[pluginIndex + 1];
      if (["add", "remove", "update", "install", "uninstall"].includes(operation)) return true;
      if (operation === "marketplace"
        && ["add", "remove", "update"].includes(args[pluginIndex + 2])) return true;
    }
  }

  if (["python", "python3", "py"].includes(executable)) {
    const scriptIndex = args.findIndex((arg) => basename(arg) === "update_plugin_cachebuster.py");
    if (scriptIndex >= 0) {
      const target = commandPath(args[scriptIndex + 1], root);
      return !pipelineSourceRoot(root, exists) || target === null || !pathInside(root, target);
    }
  }

  if (executable === "git") {
    const cIndex = args.indexOf("-C");
    if (cIndex >= 0) {
      const target = commandPath(args[cIndex + 1], root);
      if (target !== null && !pathInside(root, target)
        && !isReadOnlyDiagnosticCommand(command, root)) return true;
    }
  }

  const mutatingTargets = new Set([
    "cp", "mv", "rm", "mkdir", "rmdir", "touch", "chmod", "chown", "chgrp",
    "ln", "install", "truncate", "tee", "rsync",
  ]);
  if (mutatingTargets.has(executable)) {
    return args.some((arg) => {
      const target = commandPath(arg, root);
      return target !== null && isAbsolute(arg) && !pathInside(root, target);
    });
  }
  if (executable === "sed" && args.some((arg) => /^-[^-]*i/u.test(arg) || /^--in-place(?:=|$)/u.test(arg))) {
    return args.some((arg) => {
      const target = commandPath(arg, root);
      return target !== null && isAbsolute(arg) && !pathInside(root, target);
    });
  }
  return false;
}

/**
 * Strip an optional `--runner <claude|codex>` pair before the shape checks.
 *
 * ADR-0051 requires the invoking runner to be threaded explicitly, and the onboarding
 * CLI now honours it — but this allowlist predated that and accepted only the
 * runner-LESS forms. The effect was inverted enforcement: the guard refused the
 * identity-carrying command and permitted only the one that silently defaults the
 * runner, i.e. it pushed every caller onto the exact path ADR-0051 exists to prevent,
 * and the refusal it printed named a command it would itself deny.
 *
 * `lifecycleArgv(argv, runner, intent)` always appends `--runner <runner>` first and,
 * whenever `intent !== "onboarding"`, `--intent <intent>` afterward — so `--runner` is
 * not always the trailing pair; it can also sit second-to-last, with `--intent`
 * trailing. Scan the array for the first `--runner <claude|codex>` pair found
 * anywhere and remove it, so both shapes normalize correctly before the shape
 * checks run. Narrow by construction: only the two registered runner values,
 * only an exact `--runner <value>` pair, first match only.
 */
function withoutRunnerFlag(args) {
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === "--runner" && ["claude", "codex"].includes(args[i + 1])) {
      return [...args.slice(0, i), ...args.slice(i + 2)];
    }
  }
  return args;
}

function sanctionedOnboardingArgs(rawArgs, root) {
  const args = withoutRunnerFlag(rawArgs);
  if (args[0] === "inspect"
    && exactRoot(args, root, 1)
    && (args.length === 3
      || (args.length === 5 && args[3] === "--intent"
        && ["onboarding", "bootstrap", "session", "dispatch"].includes(args[4])))) return true;
  if (args[0] === "continuity" && args[1] === "inspect"
    && exactRoot(args, root, 2) && args.length === 4) return true;
  if (["plan", "plan-runtime", "plan-reinstall", "plan-repair", "plan-readback", "plan-source-recovery", "plan-manifest-repair"].includes(args[0])
    && exactRoot(args, root, 1)
    && (args.length === 3
      || (args.length === 5 && args[3] === "--intent"
        && ["onboarding", "bootstrap", "session", "dispatch"].includes(args[4])))) return true;
  if (["plan-source-recovery", "plan-manifest-repair"].includes(args[0])
    && exactRoot(args, root, 1) && args.length === 3) return true;
  if (args[0] === "apply-manifest-repair"
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6) return true;
  if (["apply-portable-seed", "apply-reinstall", "initialize-runtime", "apply-repair", "apply-readback"].includes(args[0])
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6) return true;
  if (args[0] === "kickoff" && args[1] === "plan"
    && exactRoot(args, root, 2) && args[4] === "--goal"
    && typeof args[5] === "string" && args[5].trim() !== "" && args.length === 6) return true;
  return args[0] === "kickoff" && args[1] === "apply"
    && exactRoot(args, root, 2) && args[4] === "--goal"
    && typeof args[5] === "string" && args[5].trim() !== ""
    && args[6] === "--plan-sha256" && HEX.test(args[7] ?? "")
    && args[8] === "--activate" && args.length === 9;
}

function sanctionedMigrationArgs(args, root) {
  if (["inspect", "plan"].includes(args[0]) && exactRoot(args, root, 1) && args.length === 3) return true;
  if (args[0] !== "apply" || !exactRoot(args, root, 1)) return false;
  return (args.length === 4 && args[3] === "--activate")
    || (args.length === 5 && args[3] === "--initialize-missing-runtime" && args[4] === "--activate");
}

function sanctionedSessionCleanupArgs(args, root) {
  if (["start", "status", "release-binding", "plan-recovery", "plan-human-recovery", "plan-privatization"].includes(args[0])) {
    return args[1] === "--repo" && args[2] === root && args.length === 3;
  }
  if (args[0] === "confirm-privatization") {
    return args[1] === "--repo" && args[2] === root
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--accept" && args.length === 6;
  }
  if (["apply-recovery", "apply-privatization"].includes(args[0])) {
    if (args[1] !== "--repo" || args[2] !== root
      || args[3] !== "--plan-sha256" || !HEX.test(args[4] ?? "")) return false;
    return (args[0] === "apply-recovery" && args[5] === "--activate" && args.length === 6)
      || (args[0] === "apply-privatization" && args[5] === "--activate" && args.length === 6);
  }
  return args[0] === "cleanup"
    && args[1] === "--repo" && args[2] === root
    && args[3] === "--session-descriptor"
    && /^[A-Za-z0-9._-]{1,80}$/u.test(args[4] ?? "")
    && args[5] === "--expected-descriptor-sha256"
    && HEX.test(args[6] ?? "")
    && args.length === 7;
}

/**
 * A partially initialized lifecycle must not strand Git's own reversible
 * operation state. This admits only the exact local abort; ordinary status,
 * diff and rev-parse readback already use the read-only diagnostic path.
 */
export function isNarrowRepositoryRecoveryCommand(command, root) {
  const words = simpleWords(command, root);
  if (!words) return false;
  let index = 0;
  if (basename(words[index]).toLowerCase() !== "git") return false;
  index += 1;
  if (words[index] === "-C") {
    const target = words[index + 1];
    if (typeof target !== "string" || resolve(root, target) !== root) return false;
    index += 2;
  }
  return words[index] === "rebase"
    && words[index + 1] === "--abort"
    && index + 2 === words.length;
}

function sanctionedPoAuthorityRebindArgs(args) {
  if (args[0] === "po-authority-decision-plan" && args.length === 1) return true;
  if (args[0] === "po-authority-decision-select") {
    return args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--planned-at"
      && typeof args[4] === "string" && Number.isFinite(Date.parse(args[4]))
      && new Date(args[4]).toISOString() === args[4]
      && args[5] === "--selection" && new Set(["prd", "spec"]).has(args[6])
      && args.length === 7;
  }
  if (args[0] === "po-authority-decision-apply") {
    return args[1] === "--plan-sha256" && HEX.test(args[2] ?? "")
      && args[3] === "--selection-digest" && HEX.test(args[4] ?? "")
      && args[5] === "--planned-at"
      && typeof args[6] === "string" && Number.isFinite(Date.parse(args[6]))
      && new Date(args[6]).toISOString() === args[6]
      && args[7] === "--selection" && args[8] === "spec"
      && args[9] === "--activate" && args.length === 10;
  }
  return args[0] === "po-authority-rebind-apply"
    && args[1] === "--plan-sha256"
    && HEX.test(args[2] ?? "")
    && args[3] === "--updated-at"
    && typeof args[4] === "string"
    && Number.isFinite(Date.parse(args[4]))
    && new Date(args[4]).toISOString() === args[4]
    && args[5] === "--activate"
    && args.length === 6;
}

/**
 * The rebind planner is read-only but must still be unavailable to every
 * unrelated partial lifecycle state. This narrowly admits its exact argv only
 * when the same inspection reports the diagnosis that the planner repairs.
 */
function isExactPoAuthorityRebindPlannerRecovery(command, root, dependencies = {}) {
  const words = simpleWords(command, root);
  if (!words || words.length !== 3
    || !["node", process.execPath].includes(words[0])
    || words[1] !== PIPELINE_STATE_SCRIPT
    || words[2] !== "po-authority-rebind-plan") return false;
  let observed;
  try {
    observed = (dependencies.inspectProjectOnboardingV3Fn ?? inspectProjectOnboardingV3)({
      rootDir: root,
      intent: "session",
    });
  } catch {
    return false;
  }
  return observed?.schema === "pipeline.project-onboarding.v4"
    && observed?.status === "partial"
    && observed?.root === root
    && observed?.intent === "session"
    && observed?.nextAction === null
    && Array.isArray(observed?.diagnostics)
    && observed.diagnostics.length === 1
    && observed.diagnostics[0]?.code === "po_authority_rebind_unavailable";
}

function sanctionedPipelineStateArgs(args) {
  const validBy = (value) => typeof value === "string"
    && value.trim() !== "" && Buffer.byteLength(value, "utf8") <= 500;
  if (args[0] === "plan-legacy-v2-revocation-recovery") {
    return args[1] === "--by" && validBy(args[2]) && args.length === 3;
  }
  // The plan is a safe diagnostic.  Applying recovery in a non-ready legacy
  // state deliberately remains denied so the central adapter can consume its
  // exact, one-time attended Human-override capability.  Merely spelling a
  // valid digest-bound argv is never Human authority.
  if (args[0] === "apply-legacy-v2-revocation-recovery") return false;
  if (args[0] === "reopen-design") {
    return args[1] === "--by" && validBy(args[2]) && args.length === 3;
  }
  if (args[0] === "submit-plan") {
    return args[1] === "--by" && validBy(args[2])
      && args[3] === "--profile" && new Set(["epic", "feature", "mini"]).has(args[4])
      && args.length === 5;
  }
  if (args[0] === "approve-plan") {
    return args[1] === "--by" && validBy(args[2]) && args.length === 3;
  }
  if (args[0] === "set-phase") {
    return args[1] === "--phase" && new Set(["design", "implementation"]).has(args[2])
      && args.length === 3;
  }
  return sanctionedPoAuthorityRebindArgs(args);
}

function sanctionedPoProfileRepairArgs(args, root) {
  if (args[0] === "plan") return exactRoot(args, root, 1) && args.length === 3;
  return args[0] === "apply"
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6;
}

function sanctionedProjectAuthorityMigrationArgs(args, root) {
  if (["inspect", "plan"].includes(args[0])) {
    return exactRoot(args, root, 1) && args.length === 3;
  }
  if (args[0] === "recover" && exactRoot(args, root, 1) && args.length === 3) return true;
  return ["apply", "recover"].includes(args[0])
    && exactRoot(args, root, 1)
    && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--activate" && args.length === 6;
}

function sanctionedHumanOverrideArgs(args, root) {
  const exactAuthorRoot = (index) => args[index] === "--author-source-root"
    && args[index + 1] === join(root, "plugins", "pipeline-core");
  if (args[0] === "plan") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
    return base && (args.length === 5 || (exactAuthorRoot(5) && args.length === 7));
  }
  if (args[0] === "prepare-authorization") {
    const base = args[1] === "--repo" && args[2] === root
      && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
      && args[7] === "--reason" && typeof args[8] === "string"
      && args[8].trim() !== "" && Buffer.byteLength(args[8], "utf8") <= 500;
    return base && (args.length === 9 || (exactAuthorRoot(9) && args.length === 11));
  }
  if (args[0] === "verify-audit") {
    return args[1] === "--repo" && args[2] === root && args.length === 3;
  }
  const base = args[0] === "authorize"
    && args[1] === "--repo" && args[2] === root
    && args[3] === "--request-sha256" && HEX.test(args[4] ?? "")
    && args[5] === "--plan-sha256" && HEX.test(args[6] ?? "")
    && args[7] === "--selection-sha256" && HEX.test(args[8] ?? "")
    && args[9] === "--reason" && typeof args[10] === "string"
    && args[10].trim() !== "" && Buffer.byteLength(args[10], "utf8") <= 500
    && args[11] === "--reason-sha256" && HEX.test(args[12] ?? "");
  return base && ((args[13] === "--activate" && args.length === 14)
    || (exactAuthorRoot(13) && args[15] === "--activate" && args.length === 16));
}

export function isSanctionedLifecycleCommand(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  const platform = options.platform ?? process.platform;
  const directNode = platform === "win32" ? ["node", "node.exe"] : ["node"];
  const trustedNode = options.processExecPath ?? process.execPath;
  if (!words || words.length < 2 || ![...directNode, trustedNode].includes(words[0])) return false;
  const [script, ...args] = words.slice(1);
  if (script === ONBOARDING_SCRIPT) return sanctionedOnboardingArgs(args, root);
  if (script === MIGRATION_SCRIPT) return sanctionedMigrationArgs(args, root);
  if (script === V3_BOOTSTRAP_AUTHORITY_SCRIPT) {
    return exactRoot(args, root, 0) && args.length === 2;
  }
  if (script === LAUNCH_SCRIPT) {
    return exactRoot(args, root, 0)
      && args[2] === "--barrier-sha256" && HEX.test(args[3] ?? "")
      && args[4] === "--activate" && args.length === 5;
  }
  if (script === READBACK_SCRIPT) return exactRoot(args, root, 0) && args.length === 2;
  if (script === START_PREFLIGHT_SCRIPT) return args.length === 0;
  if (script === SESSION_CAPABILITY_DIAGNOSE_SCRIPT) return args[0] === "--repo" && args[1] === root && args.length === 2;
  if (script === SESSION_CLEANUP_SCRIPT) return sanctionedSessionCleanupArgs(args, root);
  if (script === PIPELINE_STATE_SCRIPT) {
    return sanctionedPipelineStateArgs(args);
  }
  if (script === PO_PROFILE_REPAIR_SCRIPT) return sanctionedPoProfileRepairArgs(args, root);
  if (script === PROJECT_AUTHORITY_MIGRATION_SCRIPT) {
    return sanctionedProjectAuthorityMigrationArgs(args, root);
  }
  if (script === HUMAN_OVERRIDE_SCRIPT) return sanctionedHumanOverrideArgs(args, root);
  if (script === PRIVATE_OVERLAY_SCRIPT) {
    return args[0] === "route"
      && args[1] === "--project-root"
      && args[2] === root
      && args.length === 3;
  }
  if (script === HOST_REPOSITORY_INIT_SCRIPT) {
    if (args[0] === "plan") return exactRoot(args, root, 1) && args.length === 3;
    return args[0] === "apply"
      && exactRoot(args, root, 1)
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--activate" && args.length === 6;
  }
  return script === APP_SERVER_SCRIPT
    && ["--recover", "--doctor"].includes(args[0])
    && args.length === 1;
}

export function evaluateLifecycleReadyGuard(input, dependencies = {}) {
  const toolName = String(input?.tool_name ?? "");
  // PowerShell is wired into the same PreToolUse matcher as Bash and was nevertheless
  // absent from this list, so every PowerShell call returned verdict(0) -- allow -- for
  // bootstrap admission, cross-repo mutation, the closed grammar and gate strength alike.
  // On the native-Windows platform ADR-0051 makes a hard requirement, `Set-Content
  // project/guard-config.json` was exactly the shell bypass efe452c set out to close.
  if (![...SHELL_TOOLS, ...WRITE_TOOLS].includes(toolName)) return verdict(0);
  if (WRITE_TOOLS.includes(toolName)) {
    const filePath = writeTargetPath(input?.tool_input, toolName);
    if (filePath.trim() === "" || filePath.includes("\0")) return blocked();
  } else {
    const command = input?.tool_input?.command;
    if (typeof command !== "string" || command.trim() === "" || command.includes("\0")) return blocked();
  }

  let root;
  try {
    const requestedRoot = dependencies.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    root = (dependencies.realpathSyncFn ?? realpathSync)(resolve(requestedRoot));
  } catch {
    return blocked();
  }

  let governed;
  try {
    const exists = dependencies.existsSyncFn ?? existsSync;
    governed = GOVERNANCE_MARKERS.some((marker) => exists(join(root, marker)));
  } catch {
    return blocked();
  }
  if (!governed) return verdict(0);
  if (toolName === "Bash" && isHumanPoSigningCommand(input.tool_input.command, root)) {
    return externalPoSigningOnly();
  }
  if (SHELL_TOOLS.includes(toolName)) {
    const gateStrength = gateStrengthShellRefusal(input.tool_input.command, root);
    if (gateStrength !== null) return gateStrength;
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
  if (toolName === "PowerShell") return verdict(0);
  if (WRITE_TOOLS.includes(toolName)) {
    const target = writeTargetPath(input.tool_input, toolName);
    if (!isProjectWritePath(target, root, dependencies)) {
      return crossRepositoryMutationBlocked();
    }
    const requested = resolve(root, target);
    if (requested === join(root, ".claude", "pipeline-state.json")
      || requested === join(root, "project", "pipeline-state.json")) {
      return protectedStateWriterOnly();
    }
  }
  if (toolName === "Bash"
    && isForbiddenCrossRepositoryMutation(input.tool_input.command, root, dependencies)) {
    return crossRepositoryMutationBlocked();
  }
  if (toolName === "Bash" && isReadOnlyDiagnosticCommand(input.tool_input.command, root)) {
    return verdict(0);
  }
  if (toolName === "Bash" && isNarrowRepositoryRecoveryCommand(input.tool_input.command, root)) {
    return verdict(0);
  }
  if (toolName === "Bash") {
    const parsed = parseGuardCommand(input.tool_input.command, root);
    if (parsed.parseStatus !== "accepted") {
      const route = grammarOverrideRoute("GUARD-PARSE-UNSUPPORTED", root, toolName, input.tool_input, dependencies);
      if (route.admitted) return route.admitted;
      return blocked(
        "GUARD-PARSE-UNSUPPORTED",
        null,
        retryActionsForDeniedCommand(input.tool_input.command, root),
        route.overrideGuidance,
      );
    }
    if (parsed.operators.length > 0 || parsed.redirects.length > 0) {
      const code = parsed.redirects.length > 0 ? "GUARD-REDIRECT-UNAPPROVED" : "GUARD-OPERATOR-UNAPPROVED";
      const route = grammarOverrideRoute(code, root, toolName, input.tool_input, dependencies);
      if (route.admitted) return route.admitted;
      return blocked(code, null, [], route.overrideGuidance);
    }
  }
  if (toolName === "Bash" && input.tool_input.command.includes(LAUNCH_SCRIPT)) {
    return externalRestartOnly();
  }

  let receipt;
  try {
    receipt = (dependencies.requireProjectOnboardingReadyFn ?? requireProjectOnboardingReady)({
      rootDir: root,
      intent: "session",
      runner: dependencies.runner,
    });
  } catch (error) {
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
      || (toolName === "Bash" && isRestartResumeHintCapture(input.tool_input.command, root)))) {
      return verdict(0);
    }
    const exactPoAuthorityRebindRecovery = error instanceof ProjectOnboardingReadyError
      && error.code === "PORG-NOT-READY"
      && error.intent === "session"
      && error.lifecycleStatus === "partial"
      && toolName === "Bash"
      && isExactPoAuthorityRebindPlannerRecovery(input.tool_input.command, root, dependencies);
    if (exactPoAuthorityRebindRecovery) return verdict(0);
    return toolName === "Bash"
      && isSanctionedLifecycleCommand(input.tool_input.command, root)
      ? verdict(0)
      : blocked(
        "GUARD-LIFECYCLE-NOT-READY",
        error instanceof ProjectOnboardingReadyError
          && error.code === "PORG-NOT-READY"
          && error.intent === "session"
          ? error.lifecycleStatus
          : null,
      );
  }
  return exactReadyReceipt(receipt) ? verdict(0) : blocked();
}

export function main(rawInput = undefined, dependencies = {}) {
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

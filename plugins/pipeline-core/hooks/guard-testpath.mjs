#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-testpath — PreToolUse deny-guard protecting configured test paths from Edit/Write.
 *
 * Plugin: pipeline-core (Agent-Pipeline). Canon: guardrails/quality-gates.md QG-04,
 * roles/goldfish.md GF-04, harness/definition-of-done.md A4 — "an implementation
 * Goldfish MUST NOT modify, weaken, skip or delete the tests/checks that gate its
 * own implementation".
 *
 * WHY THIS FILE EXISTS
 *   Until now, test-path protection existed only as an instruction (briefing
 *   prohibitions field) plus after-the-fact Critic review of test diffs. This hook
 *   makes the same rule a deterministic, technical PreToolUse block for the Edit and
 *   Write tools, mirroring the git-guard union's "config, not fork" pattern.
 *
 * DESIGN
 *   - Same guard family as guard-git.mjs: config lives in the committed
 *     per-project file `.claude/guard-config.json`, field `protectedTestPaths`
 *     (sibling of `extraDenyPatterns`, same file — one config surface for the whole
 *     guard family, not a second config file).
 *   - FAIL-OPEN, NO CONFIG → NO-OP: consistent with the guard family's documented
 *     philosophy (guard-git.mjs header) — a missing/absent config blocks nothing,
 *     silently. This hook has NO built-in union of its own (unlike guard-git.mjs):
 *     it protects exactly the paths a project names, nothing more, nothing by
 *     default (the earlier "fail-open premise wrong" note applies to guard-git's
 *     own union rules, not to this project-config-only hook).
 *   - EXIT SEMANTICS (shared with guard-git.mjs): 0 allow, 2 block (stderr to the
 *     agent as plain-text reason), 1 allow + non-blocking WARN (broken config).
 *   - SCOPE: a blanket, always-active block per configured path — no task-type
 *     distinction (e.g. "is this Goldfish briefed to update tests right now?"). The
 *     backlog item flagged that distinction as an open design question ("Briefing marker,
 *     environment variable, or calibration field?") and it is still open.
 *   - OVERRIDE (PO decision, 2026-08-06): the audited v2 human-guard-override protocol —
 *     attended, bound to this exact tool call, single-use, carrying the human's stated
 *     reason, appended to the audit chain. It is attribution and an audit trail, not
 *     proof. Until then this guard had no override at all, which left the repository
 *     holding an authorization ("a genuine test change is its own briefed task") that
 *     nothing could exercise: the documented escape via the guard config is itself
 *     refused to an agent by GS-4.
 *
 * MATCHING
 *   - The write-capable tools are covered (hooks.json matcher
 *     `Edit|Write|NotebookEdit`); the target is read through
 *     `lib/tool-write-target.mjs`, because NotebookEdit names it `notebook_path`
 *     while Edit/Write use `file_path`, and reading only the latter fails OPEN.
 *   - `file_path` is normalized (backslashes -> forward slashes) before matching so
 *     patterns are Windows/POSIX independent; patterns are plain JS regex bodies
 *     matched case-insensitively against the normalized path — write a pattern that
 *     matches a path SUFFIX (e.g. `plugins/pipeline-core/hooks/guard-git\\.test\\.mjs$`)
 *     so it fires regardless of the absolute prefix (two machines, different roots).
 *
 * CONFIG SCHEMA (`.claude/guard-config.json`, field `protectedTestPaths`):
 *   { "protectedTestPaths": [ { "pattern": "<JS regex body, matched against the
 *                                            normalized file_path>",
 *                               "reason": "<optional agent-facing explanation>",
 *                               "id": "<optional explicit rule id>" } ] }
 *   Semantics (mirrors guard-git.mjs extraDenyPatterns exactly):
 *   - Each entry's rule id is its explicit "id" if given, else `TP-<n>` (1-based
 *     position in the protectedTestPaths list, counting skipped/invalid entries too).
 *   - Config file absent -> no-op (fail-safe, silent — the normal, expected case).
 *   - Config unreadable/invalid JSON, or an entry without a usable "pattern" ->
 *     that part is skipped, and the guard exits 1 with a WARN so a broken config is
 *     surfaced instead of silently losing test-path protection.
 *   - Missing "reason" is tolerated (a generic reason is generated); pattern still binds.
 *   Config is looked up under $CLAUDE_PROJECT_DIR (set by Claude Code for hooks),
 *   falling back to the process cwd — same lookup as guard-git.mjs.
 *
 * NOT COVERED (gate honesty, QG-05)
 *   - MultiEdit tool calls are NOT seen by this hook (accepted gap; add a matcher entry
 *     if that gap is ever exploited). NotebookEdit WAS in this list and no longer belongs:
 *     the matcher is Edit|Write|NotebookEdit and `notebook_path` is read via
 *     lib/tool-write-target.mjs. The stale sentence contradicted this file's own MATCHING
 *     block and was found by the T2 Critic (C4) — QG-05 asks the blind-spot statement to
 *     be accurate, and one that understates coverage still misleads the next reader.
 *   - Plain shell file writes WERE not seen either, and that was the accepted gap this
 *     entry used to record: a Bash/PowerShell redirect (`>`, `Set-Content` etc.) reaching a
 *     protected path was unguarded, and on 2026-08-08 a briefed dispatch that could not
 *     clear this gate wrote the same bytes through Bash/Node `fs` and reported it as a
 *     deviation. `guardrails/global.md` GL-09 classifies this gate as AUTHORITY-BEARING,
 *     which cannot coexist with coverage that depends on tool choice, so the gap is closed:
 *     the shell lane is enforced by `guard-lifecycle-ready.mjs` (`GUARD-TESTPATH-SHELL`),
 *     which is already `Bash|PowerShell`-wired and reads the SAME rules from
 *     `lib/protected-test-paths.mjs` that this hook reads — one definition, two lanes,
 *     exactly the arrangement `guard-gate-strength.mjs`/`GUARD-GATE-STRENGTH-SHELL` already
 *     uses for the sibling authority gate. That lane detects writes rather than name
 *     mentions (a protected suite is meant to be RUN), carries the same audited
 *     chat-or-signature human override, and names its own residual blind spots in
 *     `lib/protected-test-paths.mjs`'s header rather than here.
 *   - MultiEdit remains uncovered by any lane (accepted gap; add a matcher entry if it is
 *     ever exploited).
 *   - Task-type awareness (see SCOPE above): the guard still cannot tell whether this
 *     agent is briefed to change tests right now. The audited override answers that with
 *     a human decision per action instead of with inference. There is no hand-editing
 *     escape hatch named here (ADR-0059's 2026-08-08 companion instruction to Decision 6:
 *     never an unreachable-to-the-agent rule stated beside a hand-editing hint): a rule
 *     this guard denies is either covered by an active, signed Guard Maintenance Window
 *     (ADR-0058, checked first, silently, for GS-6/TP-* only) or reached through the
 *     audited human-guard-override ceremony below (chat- or signature-mode, matching
 *     whatever gates.push_approval is actually committed).
 *   - Obfuscation (symlinks, path traversal `..`, case-only path variants beyond the
 *     case-insensitive match already applied): not defended against — a regex guard
 *     is a tripwire, not a sandbox (same accepted trade-off as guard-git.mjs).
 *
 * MECHANICS
 *   Claude Code pipes the tool-input JSON to stdin: { tool_input: { file_path, ... } }.
 *   Wired via plugins/pipeline-core/hooks/hooks.json (PreToolUse, matcher
 *   Edit|Write|NotebookEdit).
 *
 * VERIFY: node plugins/pipeline-core/hooks/guard-testpath.test.mjs
 * Manual smoke (from the repo root; expect exit 0 — no config in this repo's own
 * .claude/guard-config.json today):
 *   printf '{"tool_input":{"file_path":"plugins/pipeline-core/hooks/guard-git.test.mjs"}}' | node plugins/pipeline-core/hooks/guard-testpath.mjs; echo $?
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import { windowCoversRule } from "../lib/guard-maintenance-window.mjs";
import {
  consumeHumanGuardOverride,
  humanGuardRouteUnavailableReason,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
// NVA-W12-COPYSAFE: sourced from the shared renderer module rather than
// project-onboarding-v3.mjs directly -- boundedOpaqueCopyCommand is the same
// function (re-exported there, unchanged); boundedCopySafeCommand/placeholder
// build the flat per-step command lines below, replacing the hand-assembled
// `${process.execPath} ${JSON.stringify(script)} ...` templates the backlog
// item measured as one of the inconsistent emitters (mirrors the identical
// adoption in guard-lifecycle-ready.mjs).
import { boundedCopySafeCommand, boundedOpaqueCopyCommand, placeholder } from "../lib/copy-safe-command.mjs";
import {
  loadProtectedTestPathRules,
  protectedTestPathRuleFor,
} from "../lib/protected-test-paths.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Renders each already-assembled ceremony command through boundedOpaqueCopyCommand()
 * (NVA-W4-01B) so a human whose terminal wraps a line mid-path or mid-digest still has a
 * copy-safe alternative -- appended AFTER the existing flat per-command chain, never
 * replacing it: the flat chain's own text stays exactly as printed today. Mirrors
 * guard-lifecycle-ready.mjs's own boundedCeremonyRenderingBlock() exactly, the same
 * near-byte-identical-duplicate arrangement this file's continuation text already uses. A
 * rendering failure for one step (or one shell within a step) never suppresses the flat
 * chain or the other steps.
 */
function boundedCeremonyRenderingBlock(steps) {
  const blocks = [];
  for (const { label, command } of steps) {
    let bounded;
    try {
      bounded = boundedOpaqueCopyCommand(command);
    } catch {
      continue;
    }
    const shells = [];
    if (bounded.posix) shells.push(`  posix:\n${bounded.posix}`);
    if (bounded.powershell) shells.push(`  powershell:\n${bounded.powershell}`);
    if (bounded.cmd) shells.push(`  cmd.exe:\n${bounded.cmd}`);
    if (shells.length === 0) continue;
    blocks.push(`Bounded copy-safe rendering of the ${label} step (max ${bounded.maxColumns} columns per line; use this if the line above wrapped when you copied it):\n${shells.join("\n")}`);
  }
  return blocks.join("\n\n");
}

// ---- read tool input (fail-open) --------------------------------------------------
let filePath = "";
let toolName = "";
let toolInput = {};
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  filePath = writeTargetPath(input?.tool_input, String(input?.tool_name ?? ""));
  toolName = String(input?.tool_name ?? "");
  toolInput = input?.tool_input ?? {};
} catch {
  process.exit(0); // fail-open: guard is a safety net, not a prison
}
if (!filePath) process.exit(0);

// ---- per-project config (config instead of fork) ----------------------------------
// The parsing itself now lives in lib/protected-test-paths.mjs so this write lane and the
// Bash/PowerShell shell lane in guard-lifecycle-ready.mjs cannot drift apart about which
// paths are protected — the same "one definition of what these paths are" arrangement
// guard-gate-strength.mjs already has with GATE_STRENGTH_PATHS. Semantics are unchanged.
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const { rules: PROTECTED_PATHS, warnings, configPath } = loadProtectedTestPathRules({ rootDir: projectDir });

// ---- verdict -------------------------------------------------------------------------
function emit(code, lines) {
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(code);
}

/**
 * The audited escape hatch (PO decision, 2026-08-06).
 *
 * This guard previously had NO override of any kind. That was deliberate, but it left the
 * repository with an authorization it could not exercise: a "briefed test-change task" is
 * a real, sanctioned reason to touch these files, and the only route was the PO editing
 * the guard config outside the session — which GS-4 refuses to the agent, so every such
 * change cost a human round trip with no record of why.
 *
 * It reuses the existing v2 `human-guard-override` protocol rather than inventing a
 * second mechanism: attended, bound to this exact tool call, single-use, carrying the
 * human's stated reason, and appended to the audit chain. Be precise about what that is
 * worth — it is attribution and an audit trail, NOT proof. The same distinction ADR-0056
 * draws between a signature and a chat approval applies here.
 *
 * Fail-closed everywhere: an override that cannot be read, validated or consumed leaves
 * the refusal exactly as it was.
 */
const matched = protectedTestPathRuleFor(PROTECTED_PATHS, filePath);
if (matched) {
  const denials = [{ guard: "guard-testpath.mjs", reason: `${matched.id}: ${matched.reason}` }];

  // GMW (ADR-0058): a valid, unexpired, correctly-scoped window is a real proof
  // regardless of push-approval mode -- unlike the chat-mode HGO branch below, this
  // check does not depend on `gates.push_approval`. It is a pure addition alongside
  // the existing overrideAdmitted/HGO logic, checked first and falling through
  // unchanged when the rule is not covered.
  try {
    const { covered, window } = windowCoversRule({ rootDir: projectDir, ruleId: matched.id });
    if (covered) {
      process.stderr.write(
        `[pipeline-guard-maintenance-window] ${matched.id} lifted: expires ${new Date(window.expiresAtMs).toISOString()}, reason: ${window.reason}\n`,
      );
      process.exit(0);
    }
  } catch { /* an unusable window is not a lift; the refusal below still stands */ }

  // Which clearances count is one setting, and it is not this guard's to decide
  // (ADR-0056). Reading it still matters -- the message below and the CLI continuation
  // it prints must name the CURRENTLY CONFIGURED mode's actual next step -- but it no
  // longer gates WHETHER an attempt to consume happens at all (ADR-0059 Decision 3):
  // consuming only ever succeeds against a genuinely armed, matching capability, and in
  // `signature` mode that capability can now only have been armed by a verified external
  // Ed25519 signature (`authorizeHumanGuardOverrideBySignature()`) -- the in-session
  // `activate: true` path stays refused for that mode by `authorizeHumanGuardOverride()`
  // itself (defense in depth, ADR-0059 Decision 1). So attempting to consume unconditionally
  // is harmless: it can never admit an edit an agent armed by itself.
  //
  // The setting lives in pipeline.user.yaml. An earlier version of this comment claimed
  // GS-1 refuses that file "through both the write lane and the shell lane", and that the
  // agent therefore could not reach `chat` by writing it. The second half was false, and
  // the T2 Critic found it: the shell lane matches the literal filename in the command
  // text, so a name assembled at runtime walks past it — and no string matching closes
  // that, since an interpreter fed inline code is opaque to a guard reading a command line.
  //
  // What makes this a gate is therefore NOT the shell lane. It is that readPushApprovalMode
  // ignores a working-tree copy that differs from the blob committed at that file's own
  // path, and returns the strongest mode instead. So an in-session WRITE cannot weaken this
  // gate -- but a write followed by a COMMIT can, and saying "can only strengthen, never
  // weaken" without that qualifier is the same overselling that produced C1 in this exact
  // spot. What the commit costs an agent is invisibility, not capability. Full reasoning on
  // committedUnchanged in critical-human-proof-policy.
  let approvalMode = "signature";
  try { approvalMode = readPushApprovalMode(projectDir)?.mode ?? "signature"; } catch { approvalMode = "signature"; }

  let consumed = { status: "absent" };
  try {
    consumed = consumeHumanGuardOverride({ rootDir: projectDir, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
  } catch (error) {
    // An unusable capability is not an authorization -- the refusal below still stands --
    // but the prior silent swallow here made a real internal exception indistinguishable
    // from "never attempted", which cost two live PO ceremonies their diagnosis. Surface it.
    process.stderr.write(`[pipeline-human-override] guard-testpath consumeHumanGuardOverride threw: ${error?.message ?? error}\n`);
    consumed = { status: "absent" };
  }
  if (consumed.status === "consumed") {
    process.stderr.write(
      `[pipeline-human-override] guard-testpath ${matched.id}: exact one-time capability consumed; plan=${consumed.planSha256}.\n`,
    );
    process.exit(0);
  }

  // Offering the route is a convenience, never a gate: if the request cannot be recorded
  // the refusal still stands, it just carries no copyable next step. Attempted unconditionally
  // now (Decision 3) -- both `chat` and `signature` mode have a real, working next step
  // (Decision 4), so there is no mode left to withhold it from.
  //
  // "No copyable next step" is not the same as saying nothing, and this guard used to
  // conflate them. The case that made it visible is this repository's own: a TP-7 write to
  // a `plugins/pipeline-core/**` path is classified as Pipeline-author repair, which needs
  // an explicit author source root and therefore never reaches `planned` -- so the refusal
  // printed no route AND no hint that one had been attempted, exactly like a rule that has
  // no override at all. Both no-route outcomes now render a bounded typed reason instead
  // (humanGuardRouteUnavailableReason(); see its header for the disclosure bound).
  let overrideGuidance = "";
  if (consumed.status === "absent" || consumed.status === "replan") {
    try {
      const planned = recordHumanGuardDenial({ rootDir: projectDir, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
      if (planned.status === "planned") {
        const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
        // NVA-W12-COPYSAFE: every ceremony command line built through the shared
        // renderer instead of a hand-assembled `${JSON.stringify(...)}` template.
        // A human fill-in slot like "<plan-sha256>" passes through placeholder()
        // verbatim -- never shellWord()-quoted like a literal value, which is
        // what the backlog item's mode targets. script/projectDir are ALSO
        // passed through placeholder() here, but pre-rendered with
        // JSON.stringify() -- the exact quoting this denial already used before
        // this change (pinned by this file's sibling guard-lifecycle-ready.mjs
        // test suite's own exact-text assertions) -- rather than shellWord()'s
        // conditional quoting, which would drop the surrounding quotes for an
        // already-safe path and change this denial's exact text for no reason
        // the backlog item asked for. request-sha256 is the one real value that
        // goes through ordinary shellWord() quoting.
        const ceremonyCommand = (subcommand, ...extraArgv) =>
          boundedCopySafeCommand({
            executable: process.execPath,
            argv: [
              placeholder(JSON.stringify(script)), subcommand, "--repo", placeholder(JSON.stringify(projectDir)),
              "--request-sha256", planned.requestSha256, ...extraArgv,
            ],
          }).command;
        const planCommand = ceremonyCommand("plan");
        const prepareAuthorizationChat = ceremonyCommand(
          "prepare-authorization", "--plan-sha256", placeholder("<plan-sha256-from-plan>"), "--reason", placeholder('"<human-reason>"'),
        );
        const authorizeChat = ceremonyCommand(
          "authorize", "--plan-sha256", placeholder("<plan-sha256>"), "--selection-sha256", placeholder("<selection-sha256>"),
          "--reason", placeholder('"<human-reason>"'), "--reason-sha256", placeholder("<reason-sha256>"), "--activate",
        );
        const prepareAuthorizationSignature = ceremonyCommand(
          "prepare-authorization", "--plan-sha256", placeholder("<plan-sha256-from-plan>"), "--reason", placeholder('"<fixed HGO_SIGNATURE_REASON text>"'),
        );
        const emitSignatureDigest = ceremonyCommand("emit-signature-digest", "--plan-sha256", placeholder("<plan-sha256>"));
        const authorizeBySignature = ceremonyCommand(
          "authorize-by-signature", "--plan-sha256", placeholder("<plan-sha256>"), "--proof", placeholder("<external-proof.json>"),
        );
        // ADR-0059 Decision 4: name the exact next command for the CURRENTLY CONFIGURED
        // mode, not just the mode-common `plan` step -- mirrors the continuation
        // codex-pretool-guard.mjs's own adapter prints, adapted to this guard's shorter
        // "for this exact edit" message shape.
        const continuation = approvalMode === "chat"
          ? [
            `Then (the human confirms in-session; this is attribution, not proof):`,
            prepareAuthorizationChat,
            authorizeChat,
          ].join("\n")
          : [
            `Then, in this session (pure digest computation against data already in the ` +
              `repository -- neither step needs the external key, ADR-0059 Decision 1):`,
            prepareAuthorizationSignature,
            emitSignatureDigest,
            `Then, outside this session (only the signature itself needs the external Ed25519 ` +
              `key; presence of a valid, correctly-bound signature IS the authorization -- ` +
              `there is no in-session activate step for this mode):`,
            authorizeBySignature,
          ].join("\n");
        // NVA-W4-01B: the same steps rendered again, bounded, appended AFTER the flat
        // chain above -- see boundedCeremonyRenderingBlock()'s own header.
        const ceremonySteps = approvalMode === "chat"
          ? [
            { label: "plan", command: planCommand },
            { label: "prepare-authorization", command: prepareAuthorizationChat },
            { label: "authorize", command: authorizeChat },
          ]
          : [
            { label: "plan", command: planCommand },
            { label: "prepare-authorization", command: prepareAuthorizationSignature },
            { label: "emit-signature-digest", command: emitSignatureDigest },
            { label: "authorize-by-signature", command: authorizeBySignature },
          ];
        const boundedBlock = boundedCeremonyRenderingBlock(ceremonySteps);
        overrideGuidance = [
          "",
          "Human override available for this exact edit (one use; audited; the human confirms):",
          planCommand,
          continuation,
          ...(boundedBlock ? ["", boundedBlock] : []),
        ].join("\n");
      } else {
        overrideGuidance = ["", humanGuardRouteUnavailableReason("edit", { planned })].join("\n");
      }
    } catch (error) {
      overrideGuidance = ["", humanGuardRouteUnavailableReason("edit", { error })].join("\n");
    }
  }

  emit(2, [
    `BLOCKED (guard-testpath, plugin pipeline-core): ${matched.reason}`,
    `Rule ID: ${matched.id}`,
    `File: ${filePath}`,
    `Why: an implementing Goldfish MUST NOT modify, weaken, skip or delete the tests/checks ` +
      `that gate its own implementation (QG-04 / roles/goldfish.md GF-04). A genuine test ` +
      `change is its own, explicitly briefed task.`,
    approvalMode === "chat"
      ? `Clearance: gates.push_approval is "chat", so an in-session audited override is ` +
        `admitted for this exact edit — see below. It is attribution, not proof.`
      : `Clearance: gates.push_approval is "${approvalMode}", so the in-session activation ` +
        `step is refused — a ready session could otherwise clear its own gate. A signed ` +
        `override is admitted instead: presence of a valid, correctly-bound external ` +
        `Ed25519 signature IS the authorization — see below for the exact next command.`,
    overrideGuidance,
  ]);
}

if (warnings.length > 0) {
  emit(1, [`[guard-testpath] WARN in ${configPath}: ${warnings.join("; ")}`, `Fail-open: nothing blocked; fix the guard-config.`]);
}

process.exit(0);

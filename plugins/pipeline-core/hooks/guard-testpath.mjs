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
 *   - Only Edit/Write are matched — MultiEdit/NotebookEdit tool calls are NOT seen by
 *     this hook (accepted gap; add a matcher entry if that gap is ever exploited).
 *   - Plain shell file writes are not seen either: `hooks.json` routes Bash/PowerShell
 *     tool calls only through `guard-git.mjs` (matcher `Bash|PowerShell`), which does
 *     NOT check test paths — a Bash/PowerShell redirect (`>`, `Set-Content` etc.)
 *     reaching a protected path is unguarded (accepted gap, same tripwire-not-a-sandbox
 *     framing as below).
 *   - Task-type awareness (see SCOPE above): the guard still cannot tell whether this
 *     agent is briefed to change tests right now. The audited override answers that with
 *     a human decision per action instead of with inference. The older escape hatches
 *     remain: a deliberate, git-tracked edit of the guard config to remove the entry, or
 *     the PO editing the file directly outside the session (the guard binds agents, not
 *     humans — same principle as guard-git.mjs).
 *   - Obfuscation (symlinks, path traversal `..`, case-only path variants beyond the
 *     case-insensitive match already applied): not defended against — a regex guard
 *     is a tripwire, not a sandbox (same accepted trade-off as guard-git.mjs).
 *
 * MECHANICS
 *   Claude Code pipes the tool-input JSON to stdin: { tool_input: { file_path, ... } }.
 *   Wired via plugins/pipeline-core/hooks/hooks.json (PreToolUse, matcher Edit|Write).
 *
 * VERIFY: node plugins/pipeline-core/hooks/guard-testpath.test.mjs
 * Manual smoke (from the repo root; expect exit 0 — no config in this repo's own
 * .claude/guard-config.json today):
 *   printf '{"tool_input":{"file_path":"plugins/pipeline-core/hooks/guard-git.test.mjs"}}' | node plugins/pipeline-core/hooks/guard-testpath.mjs; echo $?
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  consumeHumanGuardOverride,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import {
  LEGACY_GUARD_CONFIG,
  NEUTRAL_GUARD_CONFIG,
  resolveProjectAuthorityPaths,
} from "../lib/project-authority.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- read tool input (fail-open) --------------------------------------------------
let filePath = "";
let toolName = "";
let toolInput = {};
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  filePath = writeTargetPath(input?.tool_input);
  toolName = String(input?.tool_name ?? "");
  toolInput = input?.tool_input ?? {};
} catch {
  process.exit(0); // fail-open: guard is a safety net, not a prison
}
if (!filePath) process.exit(0);

// ---- normalize: backslashes -> forward slashes, matched case-insensitively --------
const normalizedPath = filePath.replace(/\\/g, "/");

// ---- per-project config (config instead of fork) ----------------------------------
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const authority = resolveProjectAuthorityPaths({ rootDir: projectDir });
const guardConfigRelPath = authority.status === "ready"
  ? authority.guardConfig
  : (existsSync(join(projectDir, NEUTRAL_GUARD_CONFIG)) ? NEUTRAL_GUARD_CONFIG : LEGACY_GUARD_CONFIG);
const configPath = join(projectDir, guardConfigRelPath);
const warnings = [];
/** @type {Array<{id: string, re: RegExp, reason: string}>} */
const PROTECTED_PATHS = [];
let rawConfig = null;
try {
  rawConfig = readFileSync(configPath, "utf8");
} catch {
  // File absent -> no protected paths at all. Fail-safe and silent: the normal case.
}
if (rawConfig !== null) {
  try {
    const cfg = JSON.parse(rawConfig);
    const list = cfg?.protectedTestPaths;
    if (list !== undefined && !Array.isArray(list)) {
      warnings.push('"protectedTestPaths" is not an array -> ignored');
    }
    for (const [i, entry] of (Array.isArray(list) ? list : []).entries()) {
      if (typeof entry?.pattern !== "string" || entry.pattern === "") {
        warnings.push(`protectedTestPaths[${i}]: missing/empty "pattern" -> entry skipped`);
        continue;
      }
      try {
        PROTECTED_PATHS.push({
          id: typeof entry?.id === "string" && entry.id !== "" ? entry.id : `TP-${i + 1}`,
          re: new RegExp(entry.pattern, "i"),
          reason:
            typeof entry?.reason === "string" && entry.reason !== ""
              ? entry.reason
              : `Protected test path matched: ${entry.pattern}`,
        });
      } catch (e) {
        warnings.push(`protectedTestPaths[${i}]: invalid regex (${e.message}) -> entry skipped`);
      }
    }
  } catch (e) {
    warnings.push(`unparseable JSON (${e.message}) -> no protected paths active`);
  }
}

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
const matched = PROTECTED_PATHS.find((rule) => rule.re.test(normalizedPath));
if (matched) {
  const denials = [{ guard: "guard-testpath.mjs", reason: `${matched.id}: ${matched.reason}` }];

  let consumed = { status: "absent" };
  try {
    consumed = consumeHumanGuardOverride({ rootDir: projectDir, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
  } catch {
    consumed = { status: "absent" }; // an unusable capability is not an authorization
  }
  if (consumed.status === "consumed") {
    process.stderr.write(
      `[pipeline-human-override] guard-testpath ${matched.id}: exact one-time capability consumed; plan=${consumed.planSha256}.\n`,
    );
    process.exit(0);
  }

  // Offering the route is a convenience, never a gate: if the request cannot be recorded
  // the refusal still stands, it just carries no copyable next step.
  let overrideGuidance = "";
  if (consumed.status === "absent" || consumed.status === "replan") {
    try {
      const planned = recordHumanGuardDenial({ rootDir: projectDir, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
      if (planned.status === "planned") {
        overrideGuidance = [
          "",
          "Human override available for this exact edit (one use; audited; the human confirms):",
          `${process.execPath} ${JSON.stringify(join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"))} plan --repo ${JSON.stringify(projectDir)} --request-sha256 ${planned.requestSha256}`,
        ].join("\n");
      }
    } catch { /* no route offered; the refusal below is unchanged */ }
  }

  emit(2, [
    `BLOCKED (guard-testpath, plugin pipeline-core): ${matched.reason}`,
    `Rule ID: ${matched.id}`,
    `File: ${filePath}`,
    `Why: an implementing Goldfish MUST NOT modify, weaken, skip or delete the tests/checks ` +
      `that gate its own implementation (QG-04 / roles/goldfish.md GF-04). A genuine test ` +
      `change is its own, explicitly briefed task — either take the audited override below, ` +
      `or the PO edits ${guardConfigRelPath} (or the test file itself) directly, outside ` +
      `this session.`,
    overrideGuidance,
  ]);
}

if (warnings.length > 0) {
  emit(1, [`[guard-testpath] WARN in ${configPath}: ${warnings.join("; ")}`, `Fail-open: nothing blocked; fix the guard-config.`]);
}

process.exit(0);

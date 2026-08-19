#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-handover-size — PreToolUse hard-size-gate for the project's live handover file.
 *
 * Plugin: pipeline-core (Agent-Pipeline). Canon: ADR-0064
 * (docs/adr/0064-handover-rotation-extraction-archive-hard-size-gate.md) Decision 1(b) —
 * "an independent hard size gate", ported/re-derived from Nova's ADR-0066. NOT wired into
 * hooks.json by this dispatch (TP-4 protected surface; a separate, already-planned
 * PO-signed ceremony wires it in after this file lands — see the ADR's own Follow-up).
 *
 * WHY THIS FILE EXISTS
 *   `handover-rotate.mjs --check-size` already implements the size-CHECKING logic, but
 *   nothing invokes it as an actual PreToolUse guard: a close-boundary-only rotation
 *   trigger (`close-block`/`close-feature`) does nothing for a single long-running open
 *   block that never closes for days at a time — exactly this repo's own recent history
 *   (many numbered checkpoints under one still-open block). This hook makes "the file is
 *   already over budget" a deterministic pre-write block instead of a fact only a rotation
 *   dry-run would ever surface, and only for the file project calibration actually names.
 *
 * DESIGN
 *   - Reads the calibrated handover file PATH from project calibration (`handover` in
 *     `project/pipeline.json`, falling back to `.claude/pipeline.json`, same candidate
 *     list `handover-rotate.mjs`'s own `readCalibratedMaxBytes` already uses) — a plain
 *     string in this repo's actual, established schema (confirmed against
 *     `project/pipeline.json` and `lib/onboarding-continuity.mjs`'s own direct
 *     `calibration.handover` string read), defaulting to `docs/state.md` (ADR-0012's
 *     canonical handover file) when calibration is absent/unreadable/malformed.
 *   - Only evaluates size when the tool call's write target IS that exact file (resolved
 *     to an absolute path, so a relative vs. absolute `file_path` from the tool cannot
 *     evade the match); every other target is fail-open no-op, same as every other guard
 *     in this family.
 *   - The actual budget check reuses `handover-rotate.mjs`'s own exported `runCli` in
 *     `--check-size` mode (imported directly, never shelled out to a child process) —
 *     single source of truth for the calibrated-max-bytes-reading + byte-length logic,
 *     no duplicated/drifting copy in this file. `runCli`'s own stdout (its
 *     `pipeline.handover-size-check.v1` JSON payload) is captured in-process rather than
 *     forwarded, so this guard's own stderr/exit-code contract stays the only thing an
 *     agent or the hook harness observes.
 *   - FAIL-OPEN (exit 0) on: unparseable/malformed stdin, a tool call that does not target
 *     the calibrated handover file, or ANY internal error reading/checking the file (a
 *     broken guard must never be a worse outcome than no guard — this hook has no
 *     "warn and allow" path distinct from allow, unlike guard-testpath's config-warning
 *     case, because there is no user-editable config surface here to warn about).
 *   - EXIT SEMANTICS (shared with the rest of the guard family, hooks.json's own
 *     documented convention): 0 allow, 2 block (stderr to the agent, plain text).
 *
 * MATCHING
 *   - Intended matcher (once wired): `Edit|Write|NotebookEdit`, mirroring every other
 *     write-shaped guard in this plugin. The target path is read via
 *     `lib/tool-write-target.mjs`'s `writeTargetPath()`, because `NotebookEdit` names its
 *     target `notebook_path` while `Edit`/`Write` use `file_path` — reading only the
 *     latter fails open on a `.md` file edited through `NotebookEdit` (unlikely for a
 *     Markdown handover file today, but the same helper every sibling guard already uses).
 *
 * NOT COVERED (gate honesty, QG-05)
 *   - This hook is NOT wired into `hooks.json` by this dispatch at all — it fires only
 *     when invoked directly (as this file's own test does) until the separate wiring
 *     ceremony lands. Until then it blocks nothing in a live session.
 *   - Plain shell writes (`Bash`/`PowerShell` redirects) are not seen by this hook, same
 *     accepted gap as every other Edit|Write|NotebookEdit-only guard in this family.
 *   - No override mechanism: unlike `guard-testpath.mjs`, this guard names no
 *     human-guard-override route. A genuine need to keep editing an over-budget handover
 *     file before rotation runs is answered by running the rotation dry-run and archiving,
 *     not by an audited bypass of a size fact.
 *
 * MECHANICS
 *   Claude Code pipes the tool-input JSON to stdin: { tool_name, tool_input: { file_path
 *   | notebook_path, ... } }.
 *
 * VERIFY: node plugins/pipeline-core/hooks/guard-handover-size.test.mjs
 * Manual smoke (from the repo root; reports this repo's OWN current docs/state.md status):
 *   printf '{"tool_name":"Edit","tool_input":{"file_path":"docs/state.md"}}' | \
 *     node plugins/pipeline-core/hooks/guard-handover-size.mjs; echo $?
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../scripts/handover-rotate.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";

const DEFAULT_HANDOVER_REL_PATH = "docs/state.md";

/**
 * The calibrated handover file's REPO-RELATIVE path, e.g. "docs/state.md". Mirrors the
 * candidate-file list `handover-rotate.mjs`'s own `readCalibratedMaxBytes` uses, reading
 * the sibling `handover` key (a plain path string in this repo's actual, established
 * calibration schema — NOT `handover.maxBytes`; see this dispatch's own report for the
 * calibration-shape finding).
 *
 * @param {string} projectDir
 * @returns {string}
 */
export function resolveCalibratedHandoverRelPath(projectDir) {
  const candidates = [
    join(projectDir, "project", "pipeline.json"),
    join(projectDir, ".claude", "pipeline.json"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, "utf8"));
      const v = j?.handover;
      if (typeof v === "string" && v !== "") return v;
    } catch {
      // fall through to next candidate / default
    }
  }
  return DEFAULT_HANDOVER_REL_PATH;
}

/**
 * Runs `handover-rotate.mjs`'s own `--check-size` logic in-process (never a child
 * process) and returns its parsed `pipeline.handover-size-check.v1` payload, or `null`
 * on ANY failure (file missing, unreadable, unparseable output, thrown error) — a null
 * result is this function's caller's cue to fail open.
 *
 * @param {string} projectDir
 * @param {string} handoverRelPath
 * @returns {{ bytes: number, maxBytes: number, over: boolean } | null}
 */
export function checkHandoverSize(projectDir, handoverRelPath) {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let captured = "";
  process.stdout.write = (chunk) => {
    captured += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    return true;
  };
  try {
    runCli(["--check-size", "--file", handoverRelPath], projectDir);
  } catch {
    return null;
  } finally {
    process.stdout.write = originalWrite;
  }
  try {
    const payload = JSON.parse(captured.trim());
    if (
      payload
      && payload.schema === "pipeline.handover-size-check.v1"
      && typeof payload.bytes === "number"
      && typeof payload.maxBytes === "number"
      && typeof payload.over === "boolean"
    ) {
      return payload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pure decision function, exported so the test file can cover the deny/allow shape
 * without going through stdin/exit(). Returns `{ decision: "allow" | "deny", lines?, exitCode }`.
 *
 * @param {{ toolName: string, toolInput: Record<string, unknown>, projectDir: string }} args
 */
export function decide({ toolName, toolInput, projectDir }) {
  const filePath = writeTargetPath(toolInput, toolName);
  if (!filePath) return { decision: "allow", exitCode: 0 };

  const handoverRelPath = resolveCalibratedHandoverRelPath(projectDir);
  const handoverAbsPath = resolve(projectDir, handoverRelPath).toLowerCase();
  const targetAbsPath = resolve(projectDir, filePath).toLowerCase();
  if (targetAbsPath !== handoverAbsPath) return { decision: "allow", exitCode: 0 };

  const result = checkHandoverSize(projectDir, handoverRelPath);
  if (result === null) return { decision: "allow", exitCode: 0 }; // internal error -> fail open

  if (!result.over) return { decision: "allow", exitCode: 0 };

  return {
    decision: "deny",
    exitCode: 2,
    lines: [
      `BLOCKED (guard-handover-size, plugin pipeline-core): the handover file is already ` +
        `over its configured byte budget.`,
      `File: ${handoverRelPath}`,
      `Current size: ${result.bytes} bytes`,
      `Configured budget: ${result.maxBytes} bytes`,
      `Why: ADR-0064 Decision 1(b) — a hard size gate independent of close-boundary ` +
        `rotation, so a single long-running open block cannot grow this file unbounded ` +
        `between closes.`,
      `Remedy: run ` +
        `\`node plugins/pipeline-core/scripts/handover-rotate.mjs --dry-run\` ` +
        `(writes a rotation preview; never modifies the source file) to see what an ` +
        `extraction-acknowledged rotation would archive, then get the affected sections ` +
        `acknowledged/rotated before growing this file further. If this exact edit IS the ` +
        `rotation/archival work itself, that is a separately briefed task, not this guard's ` +
        `concern to distinguish.`,
    ],
  };
}

function emit(code, lines) {
  process.stderr.write(lines.filter(Boolean).join("\n") + "\n");
  process.exit(code);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let toolName = "";
  let toolInput = {};
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    toolName = String(input?.tool_name ?? "");
    toolInput = input?.tool_input ?? {};
  } catch {
    process.exit(0); // fail-open: malformed/unparseable stdin
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let verdict;
  try {
    verdict = decide({ toolName, toolInput, projectDir });
  } catch {
    process.exit(0); // fail-open: any internal error reading/checking the file
  }

  if (verdict.decision === "deny") emit(verdict.exitCode, verdict.lines);
  process.exit(0);
}

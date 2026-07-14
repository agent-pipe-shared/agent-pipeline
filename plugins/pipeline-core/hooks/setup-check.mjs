#!/usr/bin/env node
/**
 * setup-check — SessionStart hook: detects whether the Shareable Edition's personalization
 * step (`node setup.mjs`) has run at all, and reminds the collegue if not.
 *
 * AP2 P3a briefing ("SessionStart-Setup-Erkennung"): a collegue who clones the repo and
 * starts a Claude-Code session directly (skipping SETUP.md) still gets told, at session
 * start, that `pipeline.user.yaml` needs `node setup.mjs` run against it -- the safety net
 * for the "just clone and go" path (PRD AP2-PRD.md §6).
 *
 * DEDUP (mandatory briefing step 1): grepped this repo for "setup-check" and
 * "pipeline.user.yaml" before writing this file -- zero hits outside setup.mjs itself
 * (this delivery's sibling file) and this hook. No prior setup-detection hook anywhere --
 * nothing to extend. `staleness-check.mjs` is the only other startup|resume|clear
 * SessionStart hook; it answers a DIFFERENT question (is the installed PLUGIN stale)
 * and is left untouched -- this is an additional, independent hook in the SAME matcher
 * group, not a duplicate.
 *
 * DETECTION LOGIC (mirrors setup.mjs's own default markers, see that file's
 * `buildDefaultAnswers()`): "not set up" is exactly two cases --
 *   1. `pipeline.user.yaml` does not exist at the project root at all.
 *   2. It exists AND parses AND its `setup.intent` is still the literal committed
 *      default `"unconfigured"`.
 * Every OTHER state (file present, parses, neither marker is the default) is "set up" --
 * silent, no message. This is a coarse, cheap signal (this hook does NOT run schema
 * validation -- that is setup.mjs's job at write time) that only ever flags the two
 * unambiguous default-marker strings, never invents a heuristic on top of them.
 *
 * FAIL-OPEN BY DESIGN (mirrors post-compact-reground.mjs / staleness-check.mjs)
 *   `pipeline.user.yaml` present but UNPARSEABLE (malformed YAML outside the yaml-lite
 *   strict subset, or missing/malformed `setup` block) -> treated as "cannot confirm
 *   default markers" -> SILENT, never a guess-based nag. Only a definitively MISSING file
 *   or a definitively-matched literal default marker ever produces output. Any read/parse
 *   error anywhere in the chain -> silent, exit code 0 -- this hook NEVER blocks.
 *
 * OUTPUT CONTRACT (SessionStart hook JSON shape, mirrors post-compact-reground.mjs's
 * active case): inactive (setup already done, or ambiguous) -> nothing on stdout,
 * exit code 0. Active (missing file or default markers) -> `{ systemMessage,
 * hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }` JSON on
 * stdout (message duplicated in both fields), exit code 0.
 *
 * MECHANICS: no stdin contract needed (SessionStart hooks receive session/env info this
 * hook does not gate on -- same as staleness-check.mjs). Reads `pipeline.user.yaml` from
 * `CLAUDE_PROJECT_DIR` (falls back to `process.cwd()`). Wired into
 * `plugins/pipeline-core/hooks/hooks.json`'s SessionStart `startup|resume|clear` matcher,
 * alongside staleness-check.mjs (TP-4-protected file, edited via a Node fs script, not the
 * Edit tool -- see that file's own $comment for the full rationale/history).
 *
 * ARCHITECTURE: pure exported resolver functions (`isStillDefault`, `buildSetupIncompleteMessage`,
 * `decideOutput`) take explicit parameters and do no I/O; `run()` is the only function that
 * touches the real filesystem/environment and always returns exit code 0.
 *
 * VERIFY: node plugins/pipeline-core/hooks/setup-check.test.mjs
 * Manual smoke (from the repo root; exits 0, stdout empty once pipeline.user.yaml has been
 * personalized):
 *   node plugins/pipeline-core/hooks/setup-check.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { parseYaml } from "../lib/yaml-lite.mjs";

export const DEFAULT_SETUP_INTENT = "unconfigured";

// ---- detection (pure) ---------------------------------------------------------------------
/**
 * @param {object|null} parsed - already-parsed pipeline.user.yaml, or null/non-object
 * @returns {boolean} true only when the setup block is present and carries the literal
 *   unconfigured intent marker -- never a guess on ambiguous input.
 */
export function isStillDefault(parsed) {
  const setup = parsed && typeof parsed === "object" ? parsed.setup : null;
  if (!setup || typeof setup !== "object") return false;
  return setup.intent === DEFAULT_SETUP_INTENT;
}

// ---- message builder (pure) ----------------------------------------------------------------
/** @param {"missing"|"default-markers"} reason */
export function buildSetupIncompleteMessage(reason) {
  const detail =
    reason === "missing"
      ? "pipeline.user.yaml is still missing (fresh clone)."
      : "pipeline.user.yaml still carries the unconfigured setup intent.";
  return [
    "Setup not complete — run `node setup.mjs` (see SETUP.md).",
    `- ${detail}`,
    "- setup.mjs writes pipeline.user.yaml and then automatically compiles the runtime configs (.claude/settings.json, pipeline.json, pipeline.yaml).",
  ].join("\n");
}

// ---- output decision (pure) ------------------------------------------------------------------
/**
 * @param {{fileExists: boolean, parsed: object|null}} args
 * @returns {{stdout: string, json: boolean, payload?: object}}
 */
export function decideOutput({ fileExists, parsed }) {
  let reason = null;
  if (!fileExists) reason = "missing";
  else if (isStillDefault(parsed)) reason = "default-markers";

  if (!reason) return { stdout: "", json: false };

  const message = buildSetupIncompleteMessage(reason);
  const payload = {
    systemMessage: message,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message },
  };
  return { stdout: JSON.stringify(payload) + "\n", json: true, payload };
}

/**
 * Resolve the hook output for one project root. Kept separate from `run()` so
 * the same filesystem path is testable where process spawning is unavailable.
 * @param {string} rootDir
 * @returns {{stdout: string, json: boolean, payload?: object}}
 */
export function decideFromProjectDir(rootDir) {
  const userYamlPath = join(rootDir, "pipeline.user.yaml");
  const fileExists = existsSync(userYamlPath);
  let parsed = null;
  if (fileExists) {
    try {
      const raw = readFileSync(userYamlPath, "utf8");
      const value = parseYaml(raw);
      parsed = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      parsed = null; // malformed/outside yaml-lite's strict subset -> ambiguous, fail-open
    }
  }
  return decideOutput({ fileExists, parsed });
}

// ---- CLI entrypoint: real environment, always exit 0 ------------------------------------------
export function run() {
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const { stdout } = decideFromProjectDir(rootDir);
  if (stdout) process.stdout.write(stdout);
  // Do not call process.exit(): under a piped hook runner that can truncate the
  // JSON written immediately above. Let Node drain stdout while retaining the
  // hook's fail-open exit contract.
  process.exitCode = 0;
}

// Only auto-run when executed directly (`node setup-check.mjs`), never on import
// (the test file imports the functions above without triggering the real CLI/exit).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

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
 *   2. It exists AND parses AND its `identity.owner_name` is still the literal committed
 *      default `"Your Name"`, OR its `identity.repo_owner` is still the literal committed
 *      default `"your-org"` (either marker alone is enough -- a collegue who only changed
 *      one of the two identity fields has still not really finished personalizing).
 * Every OTHER state (file present, parses, neither marker is the default) is "set up" --
 * silent, no message. This is a coarse, cheap signal (this hook does NOT run schema
 * validation -- that is setup.mjs's job at write time) that only ever flags the two
 * unambiguous default-marker strings, never invents a heuristic on top of them.
 *
 * FAIL-OPEN BY DESIGN (mirrors post-compact-reground.mjs / staleness-check.mjs)
 *   `pipeline.user.yaml` present but UNPARSEABLE (malformed YAML outside the yaml-lite
 *   strict subset, or missing/malformed `identity` block) -> treated as "cannot confirm
 *   default markers" -> SILENT, never a guess-based nag. Only a definitively MISSING file
 *   or a definitively-matched literal default marker ever produces output. Any read/parse
 *   error anywhere in the chain -> silent, `process.exit(0)` -- this hook NEVER blocks.
 *
 * OUTPUT CONTRACT (SessionStart hook JSON shape, mirrors post-compact-reground.mjs's
 * active case): inactive (setup already done, or ambiguous) -> nothing on stdout,
 * `process.exit(0)`. Active (missing file or default markers) -> `{ systemMessage,
 * hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }` JSON on
 * stdout (message duplicated in both fields), `process.exit(0)`.
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
 * touches the real filesystem/environment and always calls `process.exit(0)`.
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

export const DEFAULT_OWNER_NAME = "Your Name";
export const DEFAULT_REPO_OWNER = "your-org";

// ---- detection (pure) ---------------------------------------------------------------------
/**
 * @param {object|null} parsed - already-parsed pipeline.user.yaml, or null/non-object
 * @returns {boolean} true only when the identity block is present AND carries at least one
 *   of the two literal committed default marker values -- never a guess on ambiguous input.
 */
export function isStillDefault(parsed) {
  const identity = parsed && typeof parsed === "object" ? parsed.identity : null;
  if (!identity || typeof identity !== "object") return false;
  return identity.owner_name === DEFAULT_OWNER_NAME || identity.repo_owner === DEFAULT_REPO_OWNER;
}

// ---- message builder (pure) ----------------------------------------------------------------
/** @param {"missing"|"default-markers"} reason */
export function buildSetupIncompleteMessage(reason) {
  const detail =
    reason === "missing"
      ? "pipeline.user.yaml is still missing (fresh clone)."
      : "pipeline.user.yaml still carries the default markers (owner_name/repo_owner unchanged).";
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

// ---- CLI entrypoint: real environment, always exit 0 ------------------------------------------
export function run() {
  const rootDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
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

  const { stdout } = decideOutput({ fileExists, parsed });
  if (stdout) process.stdout.write(stdout);
  process.exit(0); // NEVER blocks, regardless of outcome
}

// Only auto-run when executed directly (`node setup-check.mjs`), never on import
// (the test file imports the functions above without triggering the real CLI/exit).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
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
 * SCOPE DECLARATION (SETUPSTATUS-1). A greenfield session read this hook's "setup not
 * complete" alongside `pipeline-start-preflight`'s `ready` in the same moment and had no
 * basis to choose between them. The two never measured the same thing: this hook reads
 * `pipeline.user.yaml` (project personalization), the preflight resolves the loaded plugin
 * distribution's identity, and neither is derived from the other. Adopting the preflight's
 * projection here (route A) was rejected -- it costs a `claude|codex plugin list --json`
 * subprocess with a 5 s timeout plus a home-directory registry read on EVERY SessionStart,
 * and it would answer a question that is not the one this hook exists to answer. Instead
 * this hook states what it is: a point-in-time observation of one file, non-authoritative,
 * naming the step expected to change it (`resolvingSteps`). It remains purely informational
 * -- it never gates, never changes exit status, and onboarding never depends on it.
 * `reconcileSetupObservation` is the checkable contract between the two statements.
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

import { isDirectInvocation } from "../lib/entrypoint.mjs";
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

// ---- declared scope of this observation (SETUPSTATUS-1) -------------------------------------
/**
 * What this hook is able to observe -- deliberately narrow: one file, at one moment.
 * `pipeline-start-preflight` declares its own, DIFFERENT scope in its `statusScope` field
 * (`plugin-distribution-identity`); the two readiness sources are disjoint and neither is
 * derived from the other. `reconcileSetupObservation` below turns that from a matter of
 * wording into something a test can check.
 */
export const OBSERVATION_SCHEMA = "pipeline.setup-check-observation.v1";
export const OBSERVATION_SCOPE = "project-personalization";

/**
 * The steps that are expected to change this hook's answer -- named, never implied. Both the
 * machine-readable observation and the human-facing message are built from this one list, so
 * the declaration and the prose cannot drift apart.
 *
 * REACHABILITY (backlog item 2026-08-08-an-installing-consumer-is-never-asked-any-setup-decision.md,
 * Direction 3): `node setup.mjs` is correct advice ONLY for the source-repo-collegue audience
 * this hook's file header names -- someone who cloned the Pipeline SOURCE checkout (where
 * `setup.mjs` lives at the repo root and SETUP.md tells them to run it). It is never reachable
 * for a marketplace-installed CONSUMER project: only `./plugins/pipeline-core` ships via the
 * marketplace (`.claude-plugin/marketplace.json`), `setup.mjs` is not part of that shipped tree,
 * and no shipped consumer code path (`project-onboarding-v3.mjs`, `machine-plane.mjs`, or any
 * other library under `plugins/pipeline-core/lib/`) ever writes a `setup:` key into
 * `pipeline.user.yaml` at all -- confirmed by direct grep, zero hits outside this file, its own
 * test, and unrelated migration-test fixtures. So a consumer's onboarding-generated
 * `pipeline.user.yaml` can never carry the literal `unconfigured` marker `isStillDefault` keys
 * on, and this `default-markers` branch never fires for that audience in practice. The message
 * naming `node setup.mjs` is therefore accurate for every audience it is actually reachable by;
 * it just never reaches the "installing consumer" audience the backlog item worried about, since
 * that audience cannot produce the literal marker this branch keys on. See
 * `setup-check.test.mjs`'s "onboarding-generated pipeline.user.yaml never carries default
 * markers" case for the regression proof.
 * @param {"missing"|"default-markers"} reason
 * @returns {string[]}
 */
export function resolvingSteps(reason) {
  const setupStep =
    reason === "missing"
      ? "`node setup.mjs` (see SETUP.md) — writes pipeline.user.yaml, then compiles the runtime configs (.claude/settings.json, pipeline.json, pipeline.yaml)."
      : "`node setup.mjs` (see SETUP.md) — replaces the unconfigured setup intent, then compiles the runtime configs (.claude/settings.json, pipeline.json, pipeline.yaml).";
  if (reason !== "missing") return [setupStep];
  return [
    setupStep,
    "the onboarding authority-seed step — writes pipeline.user.yaml itself during a greenfield run, often seconds after this message.",
  ];
}

/**
 * The machine-readable form of exactly what the message below says.
 * @param {"missing"|"default-markers"} reason
 */
export function buildObservation(reason) {
  return {
    schema: OBSERVATION_SCHEMA,
    scope: OBSERVATION_SCOPE,
    status: "personalization-incomplete",
    kind: "point-in-time",
    authoritative: false,
    blocking: false,
    observed: reason,
    resolvedBy: resolvingSteps(reason),
  };
}

// ---- message builder (pure) ----------------------------------------------------------------
/** @param {"missing"|"default-markers"} reason */
export function buildSetupIncompleteMessage(reason) {
  const detail =
    reason === "missing"
      ? "pipeline.user.yaml is still missing (fresh clone)."
      : "pipeline.user.yaml still carries the unconfigured setup intent.";
  return [
    "Setup observation (point-in-time, not a gate): project personalization has not run yet.",
    `- ${detail}`,
    "- Resolved by:",
    ...resolvingSteps(reason).map((step) => `  - ${step}`),
    "- Scope: this hook looks only at pipeline.user.yaml, at this moment. It is not the pipeline-start readiness verdict — `pipeline-start-preflight` answers a different question (plugin distribution identity) and can correctly report `ready` while personalization has not run.",
  ].join("\n");
}

// ---- reconciliation with the start preflight (pure, no I/O, no import of the preflight) ------
/**
 * Can one human hold BOTH statements at once without either of them being wrong?
 *
 * The defect this answers: a greenfield session saw this hook report setup as incomplete and
 * `pipeline-start-preflight` report `ready` in the same moment, with nothing telling the
 * operator that the two were answering different questions.
 *
 * Deliberately NOT a comparison of words. Three cases:
 *   - the hook stayed silent            -> nothing can contradict anything;
 *   - the preflight declares the SAME scope (should the two ever be put on one source)
 *                                       -> the verdicts must then be identical;
 *   - the scopes are disjoint           -> reconcilable only while this hook declares itself
 *                                          a point-in-time, non-authoritative, non-blocking
 *                                          observation that names what will change it.
 * A preflight that does not declare its scope is NOT reconcilable: an undeclared "ready" is
 * precisely what the operator mistook for a verdict about setup.
 *
 * @param {{preflight?: object|null, observation?: object|null}} args
 * @returns {{reconcilable: boolean, basis: string, detail?: string}}
 */
export function reconcileSetupObservation({ preflight, observation } = {}) {
  if (observation === null || observation === undefined) {
    return { reconcilable: true, basis: "hook-silent" };
  }
  const preflightScope =
    typeof preflight?.statusScope === "string" && preflight.statusScope !== ""
      ? preflight.statusScope
      : null;
  if (preflightScope === null) {
    return {
      reconcilable: false,
      basis: "undeclared-preflight-scope",
      detail: "the start preflight did not declare what its status ranges over",
    };
  }
  if (preflightScope === observation.scope) {
    return preflight.status === observation.status
      ? { reconcilable: true, basis: "same-scope-identical" }
      : {
          reconcilable: false,
          basis: "same-scope-conflict",
          detail: "both components claim one scope and report different statuses",
        };
  }
  const declared =
    observation.kind === "point-in-time"
    && observation.authoritative === false
    && observation.blocking === false
    && Array.isArray(observation.resolvedBy)
    && observation.resolvedBy.length > 0;
  return declared
    ? { reconcilable: true, basis: "declared-snapshot-disjoint-scope" }
    : {
        reconcilable: false,
        basis: "undeclared-second-verdict",
        detail: "a second component reporting on a different scope without declaring itself a non-authoritative point-in-time observation that names its resolving step",
      };
}

// ---- output decision (pure) ------------------------------------------------------------------
/**
 * @param {{fileExists: boolean, parsed: object|null}} args
 * @returns {{stdout: string, json: boolean, payload?: object, observation: object|null}}
 */
export function decideOutput({ fileExists, parsed }) {
  let reason = null;
  if (!fileExists) reason = "missing";
  else if (isStillDefault(parsed)) reason = "default-markers";

  if (!reason) return { stdout: "", json: false, observation: null };

  const message = buildSetupIncompleteMessage(reason);
  const payload = {
    systemMessage: message,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message },
  };
  // `observation` stays OFF the wire on purpose: the emitted SessionStart JSON keeps exactly
  // its historical two-field shape (no new key for a runner to reject), and the declaration
  // the operator reads is the message itself. The object is the same declaration in
  // machine-readable form, for the reconciliation contract and its tests.
  return { stdout: JSON.stringify(payload) + "\n", json: true, payload, observation: buildObservation(reason) };
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
if (isDirectInvocation(import.meta.url)) {
  run();
}

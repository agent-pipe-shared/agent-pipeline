#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-onboarding-consent-lock — PreToolUse deny-guard closing the window
 * between "PO consented to Agent Pipeline" and "onboarding actually
 * complete" (PHX-WP-ONBOARDING-CONSENT-LOCK).
 *
 * Backlog: backlog/items/2026-08-07-technical-lock-for-pipeline-consent-before-onboarding-complete.md
 * -- accepted 2026-08-18, PO-deprioritized ("not relevant right now, but
 * interesting hardening for the backlog").
 *
 * WHY THIS FILE EXISTS
 *   Enforcement between consent and completed onboarding previously rested
 *   entirely on prose (pipeline-start SKILL.md's "One onboarding consent,
 *   not a chain of prompts") and the agent's own discipline. A session that
 *   drifted out of the bootstrap chain for any reason -- a plugin-
 *   registration conflict, a transient tool failure, an over-generalized
 *   PO instruction -- had nothing technical stopping it from starting
 *   unguarded Write/Edit implementation. This hook makes the marker
 *   in ../lib/onboarding-consent-marker.mjs a deterministic PreToolUse
 *   block, the same "config/marker, not agent discipline" shape as the
 *   rest of this guard family.
 *
 * DESIGN
 *   - Marker file, `.agent-pipeline/onboarding-consent.json`, read via
 *     `readConsentMarker`/`isConsentLockBlocking` (../lib/onboarding-
 *     consent-marker.mjs). Absent marker (the common case: no consent has
 *     been recorded yet, or onboarding already completed) -> no-op.
 *   - Present, blocking marker -> every Edit/Write/NotebookEdit is refused,
 *     no path exemption. During the consent window nothing legitimate
 *     should be reaching the Edit/Write tool at all: the onboarding CLI
 *     itself writes through direct Node fs calls inside a spawned process
 *     (invoked via Bash), never through this tool, so this hook does not
 *     need to distinguish "project files" from "onboarding files" the way
 *     guard-devplan.mjs must.
 *   - Marker clearing happens elsewhere (lib module + its two admitted
 *     reasons); this hook only ever reads the marker, never writes it.
 *   - EXIT SEMANTICS (shared with the guard family): 0 allow, 2 block
 *     (stderr to the agent as plain text).
 *   - FAIL-OPEN on anything this hook cannot parse or observe: a broken
 *     hook or an unreadable marker location must not become a work
 *     stoppage on its own (the marker's own "present but corrupt ->
 *     blocking" fail-CLOSED rule lives in the lib module, not here --
 *     this hook only fails open on ITS OWN I/O, e.g. an unreadable stdin
 *     payload or a missing tool_input).
 *
 * NOT COVERED (gate honesty)
 *   - No override wired directly into this hook: the marker can only be
 *     cleared by calling ../lib/onboarding-consent-marker.mjs's
 *     `clearConsentMarker` (via ../scripts/onboarding-consent.mjs
 *     override-clear, or by project-onboarding-v3.mjs's own completion
 *     path) before the next tool call -- there is deliberately no
 *     in-session HGO/GMW route for this guard in this dispatch (Forbidden
 *     section, PHX-WP-ONBOARDING-CONSENT-LOCK briefing).
 *   - Plain shell file writes (Bash/PowerShell redirects) are not seen by
 *     this hook at all -- matcher is Edit|Write|NotebookEdit only, same
 *     accepted gap guard-testpath.mjs documents for itself.
 *
 * MECHANICS
 *   Claude Code pipes the tool-input JSON to stdin:
 *   { tool_name, tool_input: { file_path | notebook_path, ... } }.
 *   Wired via plugins/pipeline-core/hooks/hooks.json (PreToolUse, matcher
 *   Edit|Write|NotebookEdit).
 *
 * VERIFY: node plugins/pipeline-core/hooks/guard-onboarding-consent-lock.test.mjs
 */
import { readFileSync } from "node:fs";

import { readConsentMarker } from "../lib/onboarding-consent-marker.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";

// ---- read tool input (fail-open) --------------------------------------------------
let filePath = "";
let toolName = "";
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  toolName = String(input?.tool_name ?? "");
  filePath = writeTargetPath(input?.tool_input, toolName);
} catch {
  process.exit(0); // fail-open: a guard that cannot read its input has no opinion
}
if (!filePath) process.exit(0);

// ---- root resolution (same convention as guard-testpath.mjs) ----------------------
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// ---- verdict ------------------------------------------------------------------------
let marker;
try {
  marker = readConsentMarker({ rootDir: projectDir });
} catch {
  process.exit(0); // an unobservable marker location is not this hook's business
}

if (marker.status !== "consent-given-onboarding-incomplete") process.exit(0);

process.stderr.write(
  [
    "BLOCKED (guard-onboarding-consent-lock, plugin pipeline-core): CONSENT-GIVEN-ONBOARDING-INCOMPLETE",
    "Agent Pipeline consent was given for this repository but onboarding has not yet",
    "completed. Write/Edit is refused until project-onboarding-v3.mjs reaches a genuine",
    "ready result (which clears this marker automatically), or until an explicit,",
    "PO-confirmed override clears it:",
    '  node "<pluginRoot>/scripts/onboarding-consent.mjs" override-clear --root "<repoRoot>" --reason "<reason>"',
    `Marker file: ${projectDir}/.agent-pipeline/onboarding-consent.json`,
    "",
  ].join("\n"),
);
process.exit(2);

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Refuse agent edits to the configuration that decides how strong a gate is.
 *
 * WHY. The PO asked what stops an agent from simply writing
 * `gates.push_approval: "chat"` into `pipeline.user.yaml` and pushing on its own
 * authority. The measured answer was: nothing. `guard-testpath`, `guard-devplan` and
 * `guard-lifecycle-ready` all returned exit 0 for that Edit, and the file was in fact
 * edited during the session that asked the question. A review had recorded the path as
 * protected because `human-guard-override.mjs` lists it in a function called
 * `protectedPath()` — but that function only classifies what an *override* may touch;
 * it is not a PreToolUse gate and never refused anything.
 *
 * An agent that can weaken its own gate has no gate. This closes that, for the small
 * closed set of files whose contents decide a gate's strength rather than a project's
 * ordinary configuration:
 *
 *   pipeline.user.yaml              gates.push_approval, gates.*  (ADR-0056)
 *   project/critical-human-proof.json   requiredKinds / waivedKinds (ADR-0055)
 *   project/pipeline.yaml           gates.push.approval          (ADR-0054 reconciliation)
 *   project/guard-config.json       the protected-path lists themselves
 *   <live plugin root>/**          the installed guard code that is enforcing right now (GS-6)
 *
 * SHAPE. Deliberately the same as `guard-testpath`: refuse, name the rule, and point at
 * the one sanctioned escape — the PO edits the file directly, outside an agent session.
 * There is no in-session override, because an in-session override for "may I weaken my
 * own gate" is the same hole with an extra step.
 *
 * SCOPE, and it is narrower than it looks. This hook is wired for write TOOLS only
 * (`Edit|Write|NotebookEdit`, asserted by GST07), so it never sees a shell command.
 * Measured 2026-08-06: `touch project/guard-config.json` was admitted with nothing
 * claiming it, and `node -e` is an ordinary simple command under the closed grammar — so
 * for a while the Edit refusal below could simply be stepped around. The shell lane is
 * enforced by `guard-lifecycle-ready.mjs` (`GUARD-GATE-STRENGTH-SHELL`), which is already
 * Bash-wired and already owns the read-only classifier, and which imports
 * `GATE_STRENGTH_PATHS` from here so there is one definition of what these paths are.
 * Neither half is sufficient alone; GST13..GST16 cover the shell one.
 *
 * FAIL-OPEN on malformed input and on an unreadable repository, like its siblings: a
 * guard is a safety net, not a prison. It fails CLOSED only on the thing it exists for
 * — a write to a listed path.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { writeTargetPath } from "../lib/tool-write-target.mjs";

export const GATE_STRENGTH_PATHS = Object.freeze([
  Object.freeze({
    id: "GS-1",
    path: "pipeline.user.yaml",
    reason: "pipeline.user.yaml carries gates.push_approval — it decides whether a human clears the push gate with a detached signature or in-session (ADR-0056).",
  }),
  Object.freeze({
    id: "GS-2",
    path: "project/critical-human-proof.json",
    reason: "critical-human-proof.json decides which actions demand a detached Ed25519 proof, and carries the reasoned waivers that stand it down (ADR-0055).",
  }),
  Object.freeze({
    id: "GS-3",
    path: "project/pipeline.yaml",
    reason: "the project manifest carries gates.push.approval — it decides whether the push gate blocks at all.",
  }),
  Object.freeze({
    id: "GS-4",
    path: "project/guard-config.json",
    reason: "guard-config.json carries the protected-path lists every other guard reads, including this one's siblings.",
  }),
  Object.freeze({
    id: "GS-5",
    path: ".claude/pipeline.yaml",
    reason: "the legacy-tier manifest carries gates.push.approval for projects that never migrated (ADR-0054).",
  }),
  // GS-7 (not GS-6: that id is the live-plugin rule below and renumbering would break every
  // reference to it). GS-3 got its legacy sibling as GS-5 but GS-4 never got one, so on a
  // legacy-tier project an Edit to .claude/guard-config.json was not a gate-strength path at
  // all -- while the shell lane, which matches on basename, refused the very same file. The
  // write lane was the weaker of the two, which is the wrong way round. Found by the T1
  // Critic on 511d7d7 (F5).
  Object.freeze({
    id: "GS-7",
    path: ".claude/guard-config.json",
    reason: "the legacy-tier guard config carries the same protected-path lists as GS-4 for projects that never migrated (ADR-0054).",
  }),
]);

export const LIVE_PLUGIN_RULE = Object.freeze({
  id: "GS-6",
  reason: "this file is inside the installed plugin that is enforcing the guards right now, and a guard script is re-read on every invocation — editing it disarms the gate inside this same session.",
});

/**
 * GS-6, the same hole one level down: the config above decides a gate's strength, but the
 * INSTALLED guard code decides whether the config is read at all. `hooks.json` is loaded once
 * at session start, so rewiring it does not take effect until the next session — but a guard
 * *script* is re-read on every invocation, so writing `process.exit(0)` into the installed
 * `guard-push.mjs` disarms the push gate immediately, inside the same session. Measured: with a
 * ready lifecycle, no guard in the family claimed a write into the installed plugin root.
 *
 * Refused here is the copy that is CURRENTLY ENFORCING — the plugin root this guard is itself
 * running from. That deliberately leaves a source checkout's own `plugins/pipeline-core/`
 * writable, because in a development session the enforcing copy is the installed one and the
 * repository copy is ordinary product source under Verify, Critic and the PO gate.
 */
export function livePluginRoots() {
  const roots = new Set();
  const own = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  roots.add(own);
  const declared = process.env.CLAUDE_PLUGIN_ROOT;
  if (typeof declared === "string" && declared !== "") {
    const candidate = resolve(declared);
    // A declared root is only honoured when it actually looks like this plugin; an empty or
    // over-broad value (`/`, a home directory) must not turn this guard into a blanket refusal.
    if (existsSync(join(candidate, "hooks")) && existsSync(join(candidate, ".claude-plugin", "plugin.json"))) {
      roots.add(candidate);
    }
  }
  return [...roots];
}

/** True when `absolute` lies inside one of the currently-enforcing plugin roots. */
export function insideLivePlugin(absolute, roots = livePluginRoots()) {
  return roots.some((root) => {
    const rel = relative(root, absolute);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  });
}

/** Repository-relative, forward-slashed, case-insensitive — matching the sibling guards. */
export function gateStrengthRuleFor(filePath, projectDir) {
  if (typeof filePath !== "string" || filePath.length === 0) return null;
  const root = resolve(projectDir);
  const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  const rel = relative(root, absolute);
  if (rel.startsWith(`..${sep}`) || rel === "") return null;
  const normalized = rel.split(sep).join("/").toLowerCase();
  return GATE_STRENGTH_PATHS.find((rule) => rule.path.toLowerCase() === normalized) ?? null;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("guard-gate-strength.mjs")) {
  let filePath = "";
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    filePath = writeTargetPath(input?.tool_input, String(input?.tool_name ?? ""));
  } catch {
    process.exit(0); // fail-open: malformed input is not this guard's business
  }
  if (!filePath) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let matched = null;

  // GS-6 first, and independently of the marker check below: the live plugin root is Pipeline
  // code by definition, wherever it sits and whatever the surrounding project looks like.
  try {
    const absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(projectDir, filePath);
    if (insideLivePlugin(absolute)) matched = LIVE_PLUGIN_RULE;
  } catch { /* fall through to the path rules */ }

  if (matched === null) {
    try { matched = gateStrengthRuleFor(filePath, projectDir); } catch { process.exit(0); }
    if (matched === null) process.exit(0);

    // Only defend a repository the Pipeline actually governs; elsewhere these are
    // ordinary filenames.
    const governed = ["pipeline.user.yaml", "project/pipeline.yaml", ".claude/pipeline.yaml", "project/guard-config.json", ".claude/guard-config.json"]
      .some((marker) => existsSync(join(resolve(projectDir), marker)));
    if (!governed) process.exit(0);
  }

  process.stderr.write([
    `BLOCKED (guard-gate-strength, plugin pipeline-core): ${matched.reason}`,
    `Rule ID: ${matched.id}`,
    `File: ${filePath}`,
    "Why: an agent that can weaken the gate that authorizes its own actions has no gate. " +
      "This file decides a gate's strength, so it is not agent-writable — there is deliberately " +
      "no in-session override, because an in-session override for this is the same hole with an " +
      "extra step. Escape hatch: the PO edits this file directly, outside an agent session" +
      (matched.id === "GS-6"
        ? "; guard code itself is changed in a source checkout, reviewed, and then installed."
        : "."),
  ].join("\n") + "\n");
  process.exit(2);
}

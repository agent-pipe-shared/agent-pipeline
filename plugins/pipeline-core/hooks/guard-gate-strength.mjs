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
 *
 * SHAPE. Deliberately the same as `guard-testpath`: refuse, name the rule, and point at
 * the one sanctioned escape — the PO edits the file directly, outside an agent session.
 * There is no in-session override, because an in-session override for "may I weaken my
 * own gate" is the same hole with an extra step.
 *
 * FAIL-OPEN on malformed input and on an unreadable repository, like its siblings: a
 * guard is a safety net, not a prison. It fails CLOSED only on the thing it exists for
 * — a write to a listed path.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

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
]);

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
    filePath = String(input?.tool_input?.file_path ?? "");
  } catch {
    process.exit(0); // fail-open: malformed input is not this guard's business
  }
  if (!filePath) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let matched = null;
  try { matched = gateStrengthRuleFor(filePath, projectDir); } catch { process.exit(0); }
  if (matched === null) process.exit(0);

  // Only defend a repository the Pipeline actually governs; elsewhere these are
  // ordinary filenames.
  const governed = ["pipeline.user.yaml", "project/pipeline.yaml", ".claude/pipeline.yaml", "project/guard-config.json"]
    .some((marker) => existsSync(join(resolve(projectDir), marker)));
  if (!governed) process.exit(0);

  process.stderr.write([
    `BLOCKED (guard-gate-strength, plugin pipeline-core): ${matched.reason}`,
    `Rule ID: ${matched.id}`,
    `File: ${filePath}`,
    "Why: an agent that can weaken the gate that authorizes its own actions has no gate. " +
      "This file decides a gate's strength, so it is not agent-writable — there is deliberately " +
      "no in-session override, because an in-session override for this is the same hole with an " +
      "extra step. Escape hatch: the PO edits this file directly, outside an agent session.",
  ].join("\n") + "\n");
  process.exit(2);
}

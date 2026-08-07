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
 * the sanctioned escape. GS-1..GS-5/GS-7 (the write-lane paths above) route through the
 * same audited `lib/human-guard-override.mjs` family every sibling guard already uses
 * (ADR-0059 Decision 3): always attempt to consume a genuinely armed capability first,
 * and on failure offer whichever route matches the repository's own COMMITTED
 * `gates.push_approval` -- chat or signed. Admitting a CHAT-armed capability here is not
 * a new hole: `authorizeHumanGuardOverride()`'s own unconditional, path-independent
 * `HGO-SIGNATURE-MODE-REQUIRED` check (ADR-0059 Decision 1) already refuses to arm ANY
 * chat-mode capability, for ANY file, unless the repository's COMMITTED mode is already
 * "chat" -- reachable only through a real, prior, deliberate human commit (ADR-0056
 * Decision 4's accepted "chosen for ergonomics" downgrade), never something a ready
 * agent session can bootstrap from "signature" by itself. A SIGNED capability is always
 * admissible regardless of the committed mode, exactly like everywhere else in HGO. The
 * PO editing the file directly, outside an agent session, remains available too. GS-6
 * (the live plugin root below) is the one exception: it keeps its own separate, narrower
 * Guard Maintenance Window lift (ADR-0058) rather than HGO, because a time-boxed window
 * is the right shape for "the PO is actively developing guard code" and the wrong shape
 * for a one-shot config edit (ADR-0058 Decision 2).
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
import { isNeverLiftableKernelPath, windowCoversRule } from "../lib/guard-maintenance-window.mjs";
import { readPushApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import {
  consumeHumanGuardOverride,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  let toolName = "";
  let toolInput = {};
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    toolName = String(input?.tool_name ?? "");
    toolInput = input?.tool_input ?? {};
    filePath = writeTargetPath(toolInput, toolName);
  } catch {
    process.exit(0); // fail-open: malformed input is not this guard's business
  }
  if (!filePath) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let matched = null;
  let absolute = null;
  let matchedLivePluginRoot = null;

  // GS-6 first, and independently of the marker check below: the live plugin root is Pipeline
  // code by definition, wherever it sits and whatever the surrounding project looks like.
  try {
    absolute = isAbsolute(filePath) ? resolve(filePath) : resolve(projectDir, filePath);
    const roots = livePluginRoots();
    if (insideLivePlugin(absolute, roots)) {
      matched = LIVE_PLUGIN_RULE;
      matchedLivePluginRoot = roots.find((root) => insideLivePlugin(absolute, [root])) ?? null;
    }
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

  // GMW (ADR-0058): the ONLY new allow path for this file, and only for GS-6. The
  // hardcoded kernel is checked FIRST and unconditionally, before any window lookup
  // -- a path in NEVER_LIFTABLE_KERNEL_PATHS is refused even under an active,
  // correctly-scoped, unexpired window that claims to cover it. GS-1..GS-5/GS-7 are
  // untouched by this block (ADR-0058 Decision 2); it fires only when `matched` is
  // the live-plugin rule set above.
  if (matched === LIVE_PLUGIN_RULE) {
    try {
      const isKernel = isNeverLiftableKernelPath(filePath, { rootDir: projectDir, livePluginRoot: matchedLivePluginRoot });
      if (!isKernel) {
        const { covered, window } = windowCoversRule({ rootDir: projectDir, ruleId: "GS-6" });
        if (covered) {
          process.stderr.write(
            `[pipeline-guard-maintenance-window] GS-6 lifted: expires ${new Date(window.expiresAtMs).toISOString()}, reason: ${window.reason}\n`,
          );
          process.exit(0);
        }
      }
    } catch { /* an unusable window is not a lift; the refusal below still stands */ }
  }

  // ADR-0059 Decision 3, and the corrected follow-up decision on this guard specifically
  // (2026-08-07): GS-1..GS-5/GS-7 get the SAME lift shape every other HGO-routed guard
  // already has -- always attempt to consume first (harmless: it only ever succeeds
  // against a genuinely armed, matching capability), and on failure offer the
  // MODE-APPROPRIATE next step, mirroring guard-testpath.mjs's own denial-message shape.
  // Never GS-6: that rule keeps its own separate GMW mechanism above, untouched.
  let overrideGuidance = "";
  if (matched !== LIVE_PLUGIN_RULE) {
    let approvalMode = "signature";
    try { approvalMode = readPushApprovalMode(projectDir)?.mode ?? "signature"; } catch { approvalMode = "signature"; }

    const denials = [{ guard: "guard-gate-strength.mjs", reason: `${matched.id}: ${matched.reason}` }];
    let consumed = { status: "absent" };
    try {
      consumed = consumeHumanGuardOverride({ rootDir: projectDir, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
    } catch {
      consumed = { status: "absent" }; // an unusable capability is not an authorization
    }
    if (consumed.status === "consumed") {
      process.stderr.write(
        `[pipeline-human-override] guard-gate-strength ${matched.id}: exact one-time capability consumed; plan=${consumed.planSha256}.\n`,
      );
      process.exit(0);
    }

    if (consumed.status === "absent" || consumed.status === "replan") {
      try {
        const planned = recordHumanGuardDenial({ rootDir: projectDir, pluginRoot: PLUGIN_ROOT, toolName, toolInput, denials });
        if (planned.status === "planned") {
          const script = join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs");
          const continuation = approvalMode === "chat"
            ? [
              `Then (the human confirms in-session; this is attribution, not proof):`,
              `${process.execPath} ${JSON.stringify(script)} prepare-authorization --repo ${JSON.stringify(projectDir)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256-from-plan> --reason "<human-reason>"`,
              `${process.execPath} ${JSON.stringify(script)} authorize --repo ${JSON.stringify(projectDir)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256> --selection-sha256 <selection-sha256> --reason "<human-reason>" --reason-sha256 <reason-sha256> --activate`,
            ].join("\n")
            : [
              `Then, outside this session (presence of a valid, correctly-bound Ed25519 ` +
                `signature IS the authorization -- there is no in-session activate step for this mode):`,
              `${process.execPath} ${JSON.stringify(script)} prepare-authorization --repo ${JSON.stringify(projectDir)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256-from-plan> --reason "<fixed HGO_SIGNATURE_REASON text>"`,
              `${process.execPath} ${JSON.stringify(script)} authorize-by-signature --repo ${JSON.stringify(projectDir)} --request-sha256 ${planned.requestSha256} --plan-sha256 <plan-sha256> --proof <external-proof.json>`,
            ].join("\n");
          overrideGuidance = [
            "",
            "Human override available for this exact edit (one use; audited; the human confirms):",
            `${process.execPath} ${JSON.stringify(script)} plan --repo ${JSON.stringify(projectDir)} --request-sha256 ${planned.requestSha256}`,
            continuation,
          ].join("\n");
        }
      } catch { /* no route offered; the refusal below is unchanged */ }
    }
  }

  process.stderr.write([
    `BLOCKED (guard-gate-strength, plugin pipeline-core): ${matched.reason}`,
    `Rule ID: ${matched.id}`,
    `File: ${filePath}`,
    "Why: an agent that can weaken the gate that authorizes its own actions has no gate. " +
      "This file decides a gate's strength, so it is not agent-writable" +
      (matched.id === "GS-6"
        ? " -- there is deliberately no in-session override at all for this rule, because an " +
          "in-session override for 'may I disarm the gate that is enforcing right now' is the " +
          "same hole with an extra step. Escape hatch: the PO edits this file directly, outside " +
          "an agent session; guard code itself is changed in a source checkout, reviewed, and " +
          "then installed."
        : " in-session by default -- a human-authorized override (chat- or signature-mode, " +
          "matching whatever gates.push_approval is actually committed) can admit one exact, " +
          "audited edit, exactly like every other guard this override family already covers " +
          "(ADR-0059). Escape hatch: the PO edits this file directly, outside an agent session, " +
          "or authorizes the override below."),
    overrideGuidance,
  ].join("\n") + "\n");
  process.exit(2);
}

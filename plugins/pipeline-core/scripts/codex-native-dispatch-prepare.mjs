#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Agent-run Codex prepare route for a governed Goldfish dispatch (candidate 20d, G20-63).
 *
 *   node <plugin-root>/scripts/codex-native-dispatch-prepare.mjs prepare --root <repository-root> --briefing scratch/<briefing>.md
 *
 * WHY. MEASURED 2026-11-08 (Codex CLI 0.167.0): Codex never runs a PreToolUse hook for the spawn_agent tool, so hooks/guard-dispatch.mjs
 * never admitted a Codex Goldfish: no briefing route record, no governed slice queue row, no native pending state. A Codex child
 * therefore was never host-committed, no slice was integrated, and the next module stayed DBG-MODULE-NOT-RUNNABLE. SubagentStart and
 * SubagentStop DO fire on Codex, and they already bind and host-commit a child that has a pending state (hooks/native-goldfish-host.mjs).
 * This command is the missing admission: the Elephant runs it ONCE per dispatch, from the generated briefing file, before spawn_agent.
 *
 * WHAT IT DOES. It builds the hook input Codex would have sent for that spawn_agent call (tool_name spawn_agent, agent_type from the
 * briefing's own binding, message = the briefing bytes, the Codex session id, a deterministic prepared-dispatch token as tool_use_id) and
 * runs hooks/guard-dispatch.mjs on it as a child process, exactly as the Antigravity adapter runs its nested guards. The admission is
 * therefore the guard's own, not a copy: the same carrier, generated-briefing, route-record, second-writer, scope, governed-queue and
 * native-pending checks, the same codes, the same repair texts, the same records, the same hook-observed session owner. A refusal is
 * the guard's refusal (exit 2, its code and text) and, like in the hook, leaves no state behind. On success it reads the pending state
 * back (an exit 0 of the guard alone does not prove one was written) and prints the spawn_agent arguments to use.
 *
 * HONEST LIMITS. (1) The session id is the one the Codex runtime exposes to its shell (CODEX_SESSION_ID or CODEX_THREAD_ID, the source
 * lib/model-role-host-identity.mjs already uses); that it equals the session_id of the later SubagentStart payload is provable only in a
 * real Codex run. (2) The SubagentStart payload has no field that could carry the prepared token, so the binding stays the existing
 * rule: exactly one unclaimed pending state of this session whose agent type and model match, inside the bind window. The token is
 * informational and names the state. (3) The prepared state is idempotent: a second prepare of the same briefing, and a later PreToolUse
 * admission of it (should a future Codex fire the hook), reuse it and write no second queue row or pending state.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { resolveModelRoleHostSessionIdentity } from "../lib/model-role-host-identity.mjs";
import { DISPATCH_ADMISSION_BRIEFING_RUNNERS, parseNativeGoldfishBriefing } from "../lib/native-goldfish-host-return.mjs";
import { NATIVE_GOLDFISH_CODEX_PREPARED_START_BINDING_TTL_MS, findUnclaimedCodexPending } from "../lib/native-goldfish-host-state.mjs";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";

export const CODEX_PREPARE_SCHEMA = "pipeline.codex-native-dispatch-prepare.v1";
const GUARD = fileURLToPath(new URL("../hooks/guard-dispatch.mjs", import.meta.url));
const BRIEFING_FILE = /^scratch\/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}\.md$/u;
const MAX_BRIEFING_BYTES = 1024 * 1024;
// The guard's own admission budget is 300 s (guard-dispatch ADMISSION_BUDGET_MS); the child gets a little more.
const GUARD_TIMEOUT_MS = 330_000;
const clean = (text, max) => String(text).replace(/[\u0000-\u001f\u007f]+/gu, " ").trim().slice(0, max);
// The one digest definition of the briefing text (guard-dispatch briefingSha256): CRLF normalised to LF, nothing else.
const briefingDigest = (text) => createHash("sha256").update(text.replace(/\r\n/gu, "\n"), "utf8").digest("hex");
const rejected = (code, reason, repair) => ({ schema: CODEX_PREPARE_SCHEMA, status: "rejected", code, reason, ...(repair ? { repair } : {}), modelCalls: 0 });

function readBriefing(root, relativePath) {
  const fail = (reason) => rejected("CODEX-PREPARE-BRIEFING-FILE", reason,
    "write the briefing with node <plugin-root>/scripts/dispatch-briefing.mjs build --package <package.json> --out scratch/<briefing>.md and pass that repository-relative path");
  if (typeof relativePath !== "string" || !BRIEFING_FILE.test(relativePath) || relativePath.split("/").some((part) => part === "." || part === "..")) {
    return { rejection: fail("--briefing must be a repository-relative scratch/*.md path") };
  }
  try {
    const lexical = resolve(root, relativePath);
    const rel = relative(root, lexical);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return { rejection: fail("the briefing path leaves the repository") };
    const info = lstatSync(lexical);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > MAX_BRIEFING_BYTES || realpathSync(lexical) !== lexical) {
      return { rejection: fail("the briefing is not a regular, unlinked file of bounded size") };
    }
    return { text: readFileSync(lexical, "utf8") };
  } catch { return { rejection: fail("the briefing file cannot be read") }; }
}

/**
 * Prepares ONE governed Codex Goldfish dispatch. `spawn` and `env` are seams for tests; the defaults are the real ones.
 * Returns a closed result object: status "prepared" (use result.spawn_agent), "not-applicable" (an ungoverned repository: nothing to
 * prepare) or "rejected" (the guard's or this command's code, reason and repair; no state was left).
 */
export function prepareCodexNativeDispatch({ root, briefing, env = process.env, spawn = spawnSync } = {}) {
  let physicalRoot;
  try { physicalRoot = realpathSync(resolve(root)); } catch { return rejected("CODEX-PREPARE-ROOT", "--root is not a readable directory", "pass the repository root"); }
  const read = readBriefing(physicalRoot, briefing);
  if (read.rejection) return read.rejection;
  const text = read.text;
  const parsed = parseNativeGoldfishBriefing(text, { runners: DISPATCH_ADMISSION_BRIEFING_RUNNERS });
  // A briefing without a valid Codex binding names no worker type; the guard then refuses it with its own carrier or marker code.
  const agentType = parsed.ok && typeof parsed.binding.nativeAgentType === "string" ? parsed.binding.nativeAgentType : "default";
  if (!observeGovernanceScope({ rootDir: physicalRoot }).requiresEnforcement) {
    return { schema: CODEX_PREPARE_SCHEMA, status: "not-applicable", code: "CODEX-PREPARE-NOT-GOVERNED",
      reason: "this repository is not enrolled in Pipeline governance, so no admission applies and no state was written",
      spawn_agent: { agent_type: agentType, message: text }, modelCalls: 0 };
  }
  const identity = resolveModelRoleHostSessionIdentity({ runner: "codex", env });
  if (!identity.ok) {
    return rejected("CODEX-PREPARE-SESSION-UNAVAILABLE", `the Codex session id is unavailable (${identity.code})`,
      "run this command from the Codex session's own shell (it exposes CODEX_THREAD_ID); the pending state is bound to that session, and a shell outside it cannot prepare a dispatch for it");
  }
  // Each prepare names its pending state with a fresh token (the briefing digest and the time), so a state whose bind window passed never
  // collides with the next prepare; a reused state keeps the token it was written with, and that one is reported below.
  const freshToken = `prepared-codex-${createHash("sha256").update(`${briefingDigest(text)}\0${Date.now()}`).digest("hex")}`;
  const hookInput = { hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_use_id: freshToken, session_id: identity.sessionId, cwd: physicalRoot,
    tool_input: { agent_type: agentType, message: text } };
  const ran = spawn(process.execPath, [GUARD], { cwd: physicalRoot, input: JSON.stringify(hookInput), encoding: "utf8", timeout: GUARD_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024, env: { ...env, CLAUDE_PROJECT_DIR: physicalRoot } });
  const stderr = String(ran.stderr ?? "");
  if (ran.error || ran.status === null || (ran.status !== 0 && ran.status !== 1 && ran.status !== 2)) {
    return rejected("CODEX-PREPARE-GUARD-FAILED", `the dispatch admission did not complete (${clean(ran.error?.code ?? ran.error?.name ?? ran.signal ?? `exit ${ran.status}`, 60)})`,
      "run the same command again; if it repeats, inspect the session authority with node <plugin-root>/scripts/session-authority-repair.mjs inspect --root <repository-root>");
  }
  if (ran.status === 2) {
    const code = /BLOCKED \(guard-dispatch[^)]*\): ([A-Za-z0-9][A-Za-z0-9._-]{0,63}):/u.exec(stderr)?.[1] ?? "CODEX-PREPARE-GUARD-REFUSED";
    return rejected(code, clean(stderr, 1500), "the refusal text carries its own repair; fix the briefing or the state it names, then run prepare again (a refusal leaves no state)");
  }
  // Exit 0 does not prove a pending state exists: the guard also admits a dispatch whose native preparation failed with a WARNING.
  const commonDir = resolveGitCommonDir(physicalRoot);
  const dispatchId = parsed.ok ? parsed.binding.dispatchId : null;
  const pending = typeof commonDir === "string" && dispatchId !== null ? findUnclaimedCodexPending({ commonDir, sessionId: identity.sessionId, dispatchId }) : null;
  if (!pending?.ok) {
    return rejected("CODEX-PREPARE-NOT-PREPARED", `the admission ran but left no pending state for this session${stderr.trim() === "" ? "" : `: ${clean(stderr, 800)}`}`,
      "name the cause above, fix it and run prepare again; do not call spawn_agent without a prepared state, its work would not be host-committed");
  }
  const bindWindowSeconds = Math.round(NATIVE_GOLDFISH_CODEX_PREPARED_START_BINDING_TTL_MS / 1000);
  const warnings = stderr.trim() === "" ? [] : [clean(stderr, 1500)];
  const preparedToken = pending.toolUseId;
  return { schema: CODEX_PREPARE_SCHEMA, status: "prepared", dispatchId, preparedToken, bindWindowSeconds,
    spawn_agent: { agent_type: agentType, message: text }, ...(warnings.length > 0 ? { warnings } : {}),
    next: `Call spawn_agent now with exactly spawn_agent.agent_type and spawn_agent.message (the verified briefing bytes) within ${bindWindowSeconds} seconds of this preparation; the SubagentStart hook binds the started child to the prepared state and the SubagentStop hook host-commits its work. If the window passes first, run prepare again (it reuses the prepared state while the window is open).`,
    modelCalls: 0 };
}

function argvRequest(argv) {
  if (argv.length !== 5 || argv[0] !== "prepare" || argv[1] !== "--root" || argv[3] !== "--briefing") return null;
  return { root: argv[2], briefing: argv[4] };
}

if (isDirectInvocation(import.meta.url)) {
  const request = argvRequest(process.argv.slice(2));
  const result = request === null
    ? rejected("CODEX-PREPARE-ARGUMENTS", "expected exactly: prepare --root <repository-root> --briefing scratch/<briefing>.md",
      "node <plugin-root>/scripts/codex-native-dispatch-prepare.mjs prepare --root <repository-root> --briefing scratch/<briefing>.md")
    : prepareCodexNativeDispatch(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.status === "rejected" ? 2 : 0);
}

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-dispatch-budget.mjs -- NVA-BUDGETGUARD-1: makes the dispatch tool
 * budget (`templates/prompts/goldfish-task.md` field 6, "closing allowance
 * of five") a mechanically enforced limit instead of briefing text a
 * subagent must self-police. Evidence this is not theoretical
 * (2026-08-27, this repository): three dispatches ran past their stated
 * budget (62, 53, 50 tool uses against a stated ~40-45 allowance), one of
 * them cut off mid-sentence by the harness's own `maxTurns` with no report
 * emitted, and one dispatch's own final report claimed compliance ("34
 * logged at closing checkpoint") while the runtime recorded 62 --
 * self-reported budget compliance is inaccurate, not merely unenforced.
 *
 * NOT wired into `hooks.json` by this dispatch (TP-4 protected, no
 * in-session override for this class of protected file --
 * `templates/prompts/agent-obligations.md` §2). Built and unit-tested
 * only. CORRECTION (2026-08-27): this header used to describe wiring as
 * "a separate, signed maintenance-window ceremony". That route does not
 * exist. `plugins/pipeline-core/hooks/hooks.json` is on
 * `NEVER_LIFTABLE_KERNEL_PATHS` (`lib/guard-maintenance-window.mjs`), so no
 * maintenance window -- signed or not -- can lift it; `GMW40` is the test
 * that proves a TP-scoped window matching a kernel path still refuses. The
 * real route is the attended operator tool
 * `harness/scripts/wire-dispatch-budget-hook.mjs`, run outside the session
 * by the PO, which is the "explicit PO approval" hooks.json's own
 * `$comment` names. Mirrors
 * `guard-lifecycle-ready.mjs`'s PreToolUse input contract (stdin JSON,
 * `tool_name`/`tool_input`, exit 0 allow / 2 block) and
 * `guard-handover-size.mjs`'s "not yet wired, mirror the shape not the
 * module" posture, WITHOUT importing from either -- `writeTargetPath()` is
 * imported from its own owning shared utility module, which both of those
 * guards also import from; that is reuse, not the drift this convention
 * exists to avoid.
 *
 * ## ALFRED-BUDGET-20261005 behaviour (PO decision 2026-10-05)
 * - Checkpoint notice: at about 80 % of the working cap a budget-bearing
 *   role gets an allow verdict carrying `additionalContext` telling it to
 *   commit what is green, write an interim report and hand back.
 * - Critic notes lane: the Critic's closing lane also admits its own
 *   `scratch/dispatch/<subdir>/critic-notes.md` (that exact file name only).
 * - Grant store: an orchestrator-written, digest-chained per-agent grant
 *   adds working calls; any dispatched agent touching it is refused.
 *
 * ## Identity chain (empirically confirmed 2026-08-27 against this
 * dispatch's own live session directory, not merely assumed from the
 * briefing that described it):
 * - A dispatched subagent's PreToolUse payload carries `transcript_path`,
 *   an absolute path whose PARENT DIRECTORY IS NAMED `subagents` --
 *   `<session-dir>/subagents/agent-<id>.jsonl`. The orchestrating
 *   (top-level) session's own transcript sits directly at
 *   `<projects-dir>/<session-id>.jsonl`, never under a `subagents/`
 *   directory -- confirmed by direct listing of this dispatch's own
 *   session directory, not inferred. This one structural fact (parent
 *   dirname === "subagents") is what distinguishes a dispatched subagent
 *   call from the orchestrator, and is checked FIRST, before anything
 *   else -- the orchestrator must never be limited.
 * - The sibling `agent-<id>.meta.json` exists for every transcript in that
 *   directory. Its REAL observed shape (read directly from a live file in
 *   this session, 2026-08-27) was:
 *     {"agentType":"pipeline-core:<agent-name>","description":"...",
 *      "toolUseId":"...","spawnDepth":1}
 *   -- four keys. This DIFFERS from the briefing's stated shape (which
 *   also named a fifth key, `model`): no `model` key was present on the
 *   sample this guard's design was checked against. This does not change
 *   the design below, because the budget is derived from `agentType` (via
 *   the dispatched agent's own `maxTurns` frontmatter) and never from a
 *   `model` field -- but it is exactly the kind of shape mismatch this
 *   dispatch was asked to surface rather than silently paper over, and is
 *   reported in NVA-BUDGETGUARD-1's closing report.
 * - The one live `spawnDepth` sample observed was `1`. This guard requires
 *   `spawnDepth` to be a finite number >= 1 to treat a call as a resolved
 *   dispatched subagent; any other shape falls to the unresolved branch
 *   below rather than being force-fit.
 *
 * ## Budget arithmetic
 * `guard-dispatch.mjs` validates the briefing's exact numeric base cap before
 * launch and stores it under the parent Dispatch tool-use id. On the first
 * authenticated child call this guard resolves that id from Claude's measured
 * child meta file, binds the cap into the agent-id counter, and consumes the
 * pending record. Later calls read only the bound counter. `maxTurns` is still
 * read live from the selected agent definition of THIS guard's own plugin
 * (`resolveAgentPluginRoot`; never the project root, so a consumer repository
 * without `plugins/pipeline-core/` is enforced too) and must match the
 * preflighted tier; CLOSING_ALLOWANCE and SAFETY_MARGIN come from the shared policy core:
 *
 *   workingCap = min(baseCalls,
 *                    max(0, maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN)))
 *
 * At maxTurns = 50, workingCap is 35; at maxTurns = 80, it is 65.
 * The shared core permits only closing acts during the next five counted
 * attempts, then denies every further call, including closing-shaped calls.
 * This adapter recognizes the permitted shapes below and persists nextCount
 * even for denied attempts, so those attempts also consume the fixed reserve.
 * Neither repeating a closing shape nor retrying a denial renews the reserve.
 *
 * ## TR-G-F behaviour (toil rows T49 and T37, 2026-10-09)
 * - Closing acts after the working cap are the dispatch record, `git add`, `git commit` and now also the
 *   read-only commit-flow producer `goldfish-commit-command-flow.mjs`, spelled `node <script> <args>` with the
 *   script path equal to `<plugin root this guard resolves>/scripts/goldfish-commit-command-flow.mjs` and no shell
 *   control character in the arguments. It is counted like every closing act and the shared core still ends the
 *   allowance after five counted attempts, so it can neither renew nor extend it. Nothing else becomes admitted.
 * - A first-call binding miss (`DBB-PENDING-BINDING-MISSING`: no pending binding exists for this child, for example
 *   a second child of the same role launched under ONE parent Dispatch call after the first consumed the binding)
 *   is refused with its own text, which names the re-dispatch action instead of offering a counter repair. The
 *   binding stays one per role per parent call and is consumed by its child; binding a second child would need a
 *   change to `lib/dispatch-budget-binding.mjs` and would contradict the consumption pins of this suite.
 *
 * ## Parallel tool calls of one agent (Spec 22.11 R7-11, PO decision #26)
 * The counter lock is per agent (`<agentId>.json.binding.lock`), so parallel
 * dispatches of different agents never contend. Parallel tool calls of ONE
 * agent do: `acquireDispatchBudgetCounterLockWithWait` therefore waits (bounded
 * backoff, 5 ms growing to at most 100 ms, at most `COUNTER_LOCK_WAIT_BOUND_MS`
 * in total) while a LIVE owner holds the lock, instead of failing the call with
 * `counter-lock-busy`. Every call that obtains the lock, at once or after
 * waiting, is counted exactly once; a call that outwaits the bound is refused
 * with `counter-lock-timeout` (naming the holder age, path-redacted) and is
 * never counted. Dead-owner reclaim and the malformed/unsafe/ambiguous codes
 * stay exactly those of the single-attempt `acquireDispatchBudgetCounterLock`,
 * which is unchanged and never waited for; a holder that exits between another
 * caller's read and its liveness probe surfaces there as the transient
 * `counter-lock-changed` or `counter-lock-recovery-busy`, which the wait retries
 * inside the same bound and backoff, whereas malformed/unsafe/ambiguous lock state
 * still fails closed at once.
 *
 * R7-11-F3 (after the R7-11d-T3 pins), bullet 1 amended by R7-11-F4B (R7-11d-T4/T5 pins):
 * - A benign race exit of dead-owner recovery (the recovery lock vanished after the
 *   EEXIST link, or ENOENT/EEXIST during the stale-recovery takeover or the main-lock
 *   republish) returns `counter-lock-recovery-raced`, which the wait retries, so the
 *   losing parallel call is admitted and counted once. Any other error during
 *   recovery (EACCES, EPERM, EIO, ...) returns `counter-lock-recovery-failed`, which
 *   fails closed at once with no counter change and never a raw fs message as the code.
 * - The hook refuses a `counter-lock-timeout` under its own typed code
 *   `DISPATCH-BUDGET-COUNTER-LOCK-TIMEOUT` (path-free, "retry the same call", no
 *   trusted-host-path repair) because a timeout is contention, not corrupt state.
 * - Without an injected `dependencies.now` the wait bound runs on a monotonic
 *   clock (`performance.now()`), so a wall clock stepping backwards mid-wait cannot
 *   stretch the bound; the holder age still reads wall-clock `Date.now()` minus the
 *   lock file's wall-clock mtime.
 *
 * ## Storage
 * Per-subagent counters persist as one JSON file each under
 * `<git-common-dir>/agent-pipeline/dispatch-budget/<agentId>.json` --
 * local, untracked runtime state, resolved via `git rev-parse
 * --path-format=absolute --git-common-dir`. Never a tracked path, never
 * `scratch/` (agent-writable -- a limited agent could erase its own
 * counter there, defeating the whole guard).
 * Every budget-bearing counter read/modify/write, including first binding, is
 * serialized by `<agentId>.json.binding.lock`. The owner record binds hostname,
 * Linux boot id, PID and `/proc` process start time; a live owner is waited for
 * (bounded, see above), an ambiguous owner blocks, while a provably dead owner
 * is reclaimed through a separate recovery
 * lock and inode/content readback. On native Windows (no `/proc`) the owner
 * record binds hostname, a boot epoch derived from `os.uptime()`, PID and a
 * process start epoch derived from `process.uptime()`; liveness of a foreign
 * PID is probed with `process.kill(pid, 0)` (ESRCH dead, EPERM/success live).
 * Mixed-platform owner/reader pairs stay ambiguous. A pending dispatch whose child never makes
 * its first tool call remains an orphan in `pending/`; safe bounded cleanup
 * needs a dispatch-lifecycle signal and is deliberately a follow-on rather
 * than a TTL guess in this hook.
 *
 * ## Fail-open-but-visible for unattested legacy identity
 * Any point at which the identity chain or the budget cannot be resolved
 * (malformed/missing `transcript_path`, missing/unparseable meta.json,
 * `spawnDepth` not a number >=1, `agentType` not resolving to a known
 * agent definition file, that file missing/malformed `maxTurns`, or the
 * git common dir itself unresolvable) allows the call (verdict 0). Where a
 * common dir COULD be resolved, one complete JSON observation is atomically
 * claimed per session/reason below `unresolved-observations/`; the historical
 * readable `unresolved.jsonl` is retained and never truncated. Session and
 * reason path components are digest-derived, while the diagnostic JSON records
 * the branch, reason, root/common dir, transcript path and instant.
 * Budget-bearing children with authenticated `agent_id`/`agent_type` fail
 * closed on missing/conflicting binding or counter-lock state. These legacy
 * unresolved-identity branches remain fail-open so an orchestrator or an
 * unsupported runner shape is not silently classified as a Claude child.
 * The bound is per session/reason only, never a finite global-retention claim
 * across unlimited sessions; absent, null, blank, or malformed session IDs all
 * share the explicit fallback-session bucket for each reason.
 *
 * Two further branches used to return an allow verdict with nothing recorded
 * at all -- NVA-BUDGETROOT-1 closes both:
 * - `identity.kind === "orchestrator"` fires on EVERY orchestrating-session
 *   tool call, so an append-only log there would grow without limit for a
 *   long session. The bound is one marker file per session, keyed off the
 *   session's own transcript filename, under
 *   `<git-common-dir>/agent-pipeline/dispatch-budget/orchestrator-seen/`:
 *   the first call for a given session writes it, every later call for the
 *   SAME session sees the file already exists and writes nothing further.
 * - `commonDir === null` means there is no guard-owned location left to
 *   write to at all (every sink above lives under the common dir that failed
 *   to resolve). `scratch/` was considered and rejected for the same reason
 *   the counter itself never lives there (see Storage below): it is
 *   agent-writable, so a diagnostic log placed there would be exactly as
 *   erasable as having none. This branch is instead surfaced on the guard's
 *   own stderr -- the one channel guaranteed to exist for a PreToolUse hook
 *   regardless of git state -- without changing the exit code.
 */
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { hostname, uptime } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { writeTargetPath } from "../lib/tool-write-target.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { consumePendingDispatchBudgetBinding, readAgentMaxTurns, resolvePendingDispatchBudgetBinding } from "../lib/dispatch-budget-binding.mjs";
import { dispatchBudgetContractForRole } from "../lib/dispatch-policy.mjs";
import {
  CLOSING_ALLOWANCE,
  DENIAL_CODE,
  INVALID_INPUT_CODE,
  SAFETY_MARGIN,
  classifyDispatchBudgetCaller,
  decideDispatchBudgetCall,
  dispatchCheckpointDecision,
  dispatchWorkingCap,
  isValidGrantAgentId,
  validateGrantRecord,
} from "../lib/dispatch-budget-core.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { isDirectInvocation as isGovernanceHookEntry } from "../lib/entrypoint.mjs";
// Repository admission precedes hook input hardening and all governed effects.
if (isGovernanceHookEntry(import.meta.url) && !observeGovernanceScope({ rootDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) process.exit(0);


const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];
export { CLOSING_ALLOWANCE, DENIAL_CODE, INVALID_INPUT_CODE, SAFETY_MARGIN };
/** The hook's own refusal code for a bounded counter-lock wait that timed out (contention, not invalid budget state). */
export const COUNTER_LOCK_TIMEOUT_CODE = "DISPATCH-BUDGET-COUNTER-LOCK-TIMEOUT";
const DISPATCH_RECORD_PATTERN = /^evidence\/dispatch-record-.*\.json$/u;
const GIT_CLOSING_VERB_PATTERN = /^git\s+(add|commit)\b/u;

function verdict(exitCode, stderr = "") {
  return { exitCode, stderr };
}

function blocked({ agentId, agentType, maxTurns, baseCalls, workingCap, count, smallRole = false }) {
  const remainingClosingCalls = Math.max(0, workingCap + CLOSING_ALLOWANCE - count);
  const continuation = remainingClosingCalls > 0
    ? `The working budget is exhausted; ${remainingClosingCalls} closing-call ${remainingClosingCalls === 1 ? "slot remains" : "slots remain"}.\n`
      + `Within that remaining allowance, only these acts are permitted: (1) write/update evidence/dispatch-record-*.json, (2) \`git add\` your own paths, (3) \`git commit\` your own paths${closingNotesClause(agentType)}, plus the read-only commit-flow producer \`goldfish-commit-command-flow.mjs\` from the plugin scripts directory (it is counted like any closing call).\n`
      + "Stop working and emit the closing report when finished.\n"
    : `The closing allowance of ${CLOSING_ALLOWANCE} tool calls is exhausted. No further tool calls are permitted for this dispatch.\n`
      + "Emit the closing report without another tool call.\n";
  return verdict(
    2,
    "BLOCKED (guard-dispatch-budget, plugin pipeline-core): "
      + `${DENIAL_CODE}: this dispatch (${agentType}, agent ${agentId}) has counted ${count} tool-call attempts against a working cap of ${workingCap} `
      + (smallRole
        ? `(small-role lane: baseCalls=${baseCalls} is maxTurns=${maxTurns} minus the fixed ${CLOSING_ALLOWANCE}-closing reserve, no ${SAFETY_MARGIN}-safety reserve).\n`
        : `(effective cap min(baseCalls=${baseCalls}, maxTurns=${maxTurns} minus the fixed ${CLOSING_ALLOWANCE}-closing + ${SAFETY_MARGIN}-safety reserve)).\n`)
      + continuation,
  );
}

const PENDING_BINDING_MISSING_CODE = "DBB-PENDING-BINDING-MISSING";

/**
 * TR-G-F (toil row T37): a first-call binding miss is not corrupt counter state. No counter exists for this child
 * (the binding lookup runs only while the counter file is absent, and the consume-race path removes the counter it
 * just created), so there is nothing to repair; the one action that works is to re-dispatch the task as its own
 * Dispatch call so that its launch records a binding for it.
 */
function pendingBindingMissingBlocked({ agentId, agentType }) {
  return verdict(
    2,
    "BLOCKED (guard-dispatch-budget, plugin pipeline-core): "
      + `${INVALID_INPUT_CODE}: this dispatch (${agentType}, agent ${agentId}) has invalid budget state (${PENDING_BINDING_MISSING_CODE}).\n`
      + "No budget was bound to this child: its launch recorded no pending binding for this role, or a sibling child of the same role under the same parent Dispatch call already consumed it. "
      + "No budget counter was written for this child, so every further call it makes is refused the same way and there is nothing to repair.\n"
      + "Stop and report this to the dispatcher. The action is to re-dispatch this task as its own Dispatch call (one child per role per Dispatch call), so that the launch records a fresh budget binding for it.\n",
  );
}

function invalidBudgetInputBlocked({ agentId, agentType, reason }) {
  if (reason === PENDING_BINDING_MISSING_CODE) return pendingBindingMissingBlocked({ agentId, agentType });
  return verdict(
    2,
    "BLOCKED (guard-dispatch-budget, plugin pipeline-core): "
      + `${INVALID_INPUT_CODE}: this dispatch (${agentType}, agent ${agentId}) has invalid budget state (${reason}).\n`
      + "The persisted counter was left unchanged; repair or remove it through the trusted host path before continuing.\n",
  );
}

/**
 * A bounded counter-lock wait that timed out is contention, not corrupt state: its own typed code,
 * no path, no host-path repair, and the one repair that works -- retry the same call. The holder
 * age is named only when the wait actually saw one.
 */
function counterLockTimeoutBlocked({ agentId, agentType, reason }) {
  return verdict(
    2,
    "BLOCKED (guard-dispatch-budget, plugin pipeline-core): "
      + `${COUNTER_LOCK_TIMEOUT_CODE}: this dispatch (${agentType}, agent ${agentId}) could not take its budget counter lock within the bounded wait (${reason}).\n`
      + "This call was not counted and the persisted counter was left unchanged; retry the same call (the lock is released when the holder's own call completes).\n",
  );
}

/**
 * pipeline.identity-attestation-fail-closed-fallback (2026-08-29): the one
 * caller-visible signal that lets an authority-bearing gate built on top of
 * this identity resolver (evaluateBootstrapReceiptGate in
 * guard-lifecycle-ready.mjs, GL-09) tell "genuinely ambiguous -- may still be
 * the orchestrator's own quirky payload" apart from "a transcript_path field
 * IS present and is simply not usable". The audited defect (17 live
 * occurrences in one run, `docs/pipeline-audit-claude-session.md` §3.1) was
 * that both shapes collapsed into the same `kind: "unresolved"` and every
 * caller that fails open on "unresolved" therefore fails open on BOTH,
 * including the second shape, which is never a legitimate orchestrator
 * payload (an orchestrator's transcript sits directly under the session
 * directory; it is never a truthy relative or non-string value).
 *
 * This constant, `agentId` and `agentType` are a fixed sentinel identity,
 * never emitted by any real dispatch (a real subagent's `agentId` always
 * derives from its own `agent-<id>.jsonl` transcript stem). No code in this
 * repository ever writes a bootstrap-preflight receipt or a dispatch-budget
 * counter keyed to this sentinel -- `recordBootstrapPreflightReceipt`
 * (guard-lifecycle-ready.mjs) only writes for `identity.kind === "subagent"`,
 * and this sentinel's `kind` is deliberately NOT `"subagent"` -- so a
 * receipt-gated caller's existing, unmodified "no receipt for this agentId"
 * branch denies it every time, by construction, without that caller's own
 * code needing to change at all.
 */
export const INVALID_TRANSCRIPT_PATH_SENTINEL_AGENT_ID = "pipeline.identity-attestation-fail-closed-fallback";
export const INVALID_TRANSCRIPT_PATH_SENTINEL_AGENT_TYPE = "unattested-invalid-transcript-path";

/**
 * Distinguishes a dispatched subagent's PreToolUse payload from the
 * orchestrating session's own, and resolves as much of its identity as the
 * payload actually supports. See the identity-chain doc block above for
 * what was empirically confirmed. Never throws.
 */
export function subagentIdentity(input, dependencies = {}) {
  const transcriptPath = input?.transcript_path;
  // Genuinely absent (or blank) is ambiguous -- a real orchestrator payload
  // observed on the Windows runner (the audited defect) carried no usable
  // transcript_path at all, so this shape alone stays "unresolved" and
  // every existing caller's fail-open-on-ambiguity behaviour is unchanged.
  // `null` is included here (NVA-CF-NULLTID, 2026-08-29): a JSON-serialized
  // `transcript_path: null` (a host that emits null rather than omitting the
  // key entirely) is a legitimate "absent" encoding, not a malformed one --
  // it must route the same as undefined/blank-string. Before this fix it
  // fell through to the `typeof transcriptPath !== "string"` check below and
  // landed in the fail-CLOSED "invalid-identity" lane with the fixed
  // sentinel agentId, which guard-lifecycle-ready.mjs's bootstrap-receipt
  // gate can never clear (no receipt is ever written for a non-"subagent"
  // kind) -- permanently blocking every Edit/Write/NotebookEdit for that
  // session with no recovery route. Genuinely malformed values (a non-null,
  // non-string, or a non-absolute string) still fall through to the
  // fail-closed "invalid-identity" branch below unchanged.
  if (
    transcriptPath === undefined
    || transcriptPath === null
    || (typeof transcriptPath === "string" && transcriptPath.trim() === "")
  ) {
    return { kind: "unresolved", reason: "transcript-path-missing-or-relative" };
  }
  // PRESENT but not a usable absolute path (wrong type, or a relative
  // string) is never a legitimate orchestrator shape -- see the sentinel
  // doc block above for why this must not share "unresolved"'s fail-open
  // fate on an authority-bearing caller.
  if (typeof transcriptPath !== "string" || !isAbsolute(transcriptPath)) {
    return {
      kind: "invalid-identity",
      reason: "transcript-path-present-but-not-absolute",
      agentId: INVALID_TRANSCRIPT_PATH_SENTINEL_AGENT_ID,
      agentType: INVALID_TRANSCRIPT_PATH_SENTINEL_AGENT_TYPE,
      transcriptPath,
    };
  }
  const dir = dirname(transcriptPath);
  if (basename(dir) !== "subagents") {
    return { kind: "orchestrator" };
  }
  const base = basename(transcriptPath);
  const stemMatch = base.match(/^(agent-.+)\.jsonl$/u);
  if (!stemMatch) {
    return { kind: "unresolved", reason: "unexpected-transcript-filename", transcriptPath };
  }
  const stem = stemMatch[1];
  const agentId = stem.slice("agent-".length);
  const metaPath = join(dir, `${stem}.meta.json`);
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  if (!existsSyncFn(metaPath)) {
    return { kind: "unresolved", reason: "meta-file-missing", agentId, metaPath };
  }
  let meta;
  try {
    meta = JSON.parse(readFileSyncFn(metaPath, "utf8"));
  } catch {
    return { kind: "unresolved", reason: "meta-file-unparseable", agentId, metaPath };
  }
  if (typeof meta.spawnDepth !== "number" || !Number.isFinite(meta.spawnDepth) || meta.spawnDepth < 1) {
    return { kind: "unresolved", reason: "spawn-depth-not-a-dispatch", agentId, meta };
  }
  if (typeof meta.agentType !== "string" || meta.agentType.trim() === "") {
    return { kind: "unresolved", reason: "agent-type-missing", agentId, meta };
  }
  return { kind: "subagent", agentId, agentType: meta.agentType, meta };
}

/** `git rev-parse --path-format=absolute --git-common-dir`, or null if it cannot be resolved. */
export function resolveGitCommonDir(rootDir, dependencies = {}) {
  const execFileSyncFn = dependencies.execFileSyncFn ?? execFileSync;
  try {
    const out = execFileSyncFn("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: rootDir,
      encoding: "utf8",
      // Discard the child's stderr. Without this it is INHERITED, and in a
      // PreToolUse hook stderr is the channel the guard speaks to the agent
      // on -- so a non-repository cwd would print `fatal: not a git
      // repository` to the agent on a branch where this function has already
      // decided to FAIL OPEN and allow the call. A guard that prints `fatal:`
      // while permitting is worse than one that says nothing: it reads as a
      // denial or a broken tool. The failure is still reported, through the
      // null return and the caller's own observation line.
      stdio: ["ignore", "pipe", "ignore"],
    });
    const trimmed = String(out).trim();
    return trimmed === "" ? null : trimmed;
  } catch {
    return null;
  }
}

// The plugin this guard itself ships in (hooks/ -> plugin root). Computed defensively: a
// module-load throw here would take down every importer of the guard.
const GUARD_PLUGIN_ROOT = (() => {
  try { return fileURLToPath(new URL("..", import.meta.url)); }
  catch { return null; }
})();

/**
 * Where agent definitions are resolved from -- the ONE place the guard answers that question
 * (the maxTurns read and the budget-contract lookup both call it, so they cannot disagree).
 * Resolution order:
 *   1. `dependencies.pluginRoot`: an explicitly injected plugin root (test seam) always wins.
 *   2. The plugin this guard ships in (module-relative): the installed plugin that Claude
 *      actually dispatches with. It exists in a consumer repository, which has no
 *      `plugins/pipeline-core/` under its project root, and it cannot drift from the hook that
 *      is enforcing the cap the way a checkout's copy of the definition can.
 */
export function resolveAgentPluginRoot(rootDir, dependencies = {}) {
  const injected = dependencies?.pluginRoot;
  if (typeof injected === "string" && injected !== "") return injected;
  return GUARD_PLUGIN_ROOT;
}

/**
 * Reads `maxTurns` live from `<plugin root>/agents/<name>.md`'s own YAML frontmatter (plugin
 * root: `resolveAgentPluginRoot`), where `<name>` is `agentType` with any `<host>:` prefix
 * stripped (e.g. `pipeline-core:goldfish-deep` -> `goldfish-deep`). Returns null (never throws)
 * when the agent definition cannot be found or its `maxTurns` cannot be read as a positive
 * integer.
 */
export function resolveMaxTurns(agentType, rootDir, dependencies = {}) {
  const pluginRoot = resolveAgentPluginRoot(rootDir, dependencies);
  if (typeof pluginRoot !== "string" || pluginRoot === "") return null;
  return readAgentMaxTurns(agentType, pluginRoot, {
    existsSyncFn: dependencies.existsSyncFn,
    readFileSyncFn: dependencies.readFileSyncFn,
  });
}

/**
 * The options every budget-contract lookup in this guard passes to the policy: the SAME plugin
 * root and fs seams `resolveMaxTurns` reads with (and, when a caller injected its own
 * `resolveMaxTurnsFn`, that resolver itself). The contract's maxTurns and the guard's resolved
 * maxTurns therefore come from one source, so `budget-tier-max-turns-conflict` cannot arise from
 * two readers disagreeing; only a genuine installed-copy-vs-checkout drift
 * (`pending-binding-tier-conflict`) can still separate a binding from this guard.
 */
function budgetContractOptions(rootDir, options) {
  const contractOptions = {
    pluginRoot: resolveAgentPluginRoot(rootDir, options),
    existsSyncFn: options.existsSyncFn,
    readFileSyncFn: options.readFileSyncFn,
  };
  if (typeof options.resolveMaxTurnsFn === "function") {
    contractOptions.readMaxTurnsFn = (role) => options.resolveMaxTurnsFn(role, rootDir, options);
  }
  return contractOptions;
}

/**
 * The exact permitted-after-cap shape set (DoD): a write/update of
 * `evidence/dispatch-record-*.json`, a Bash call whose command begins
 * with `git add` / `git commit` AND is one simple git command (TR-G-F3, Ruling 138 F2; see `isSingleGitClosingCommand`:
 * a chain, a redirect, a pipe or a substitution after the cap is never a closing act), or the one read-only
 * commit-flow producer call (TR-G-F, toil row T49; see `isCommitFlowProducerCommand`). Ownership of the exact paths inside a
 * `git add`/`git commit` call is not something a PreToolUse payload lets
 * this guard verify; the other guards in the union (guard-git.mjs,
 * guard-testpath.mjs) already own that narrower question.
 */
// ALFRED-BUDGET-20261005: the dispatching Critic hands back through its own
// `scratch/dispatch/<subdir>/critic-notes.md` (critic-review.md CR-06-D). Exact
// shape only: one safe subdirectory segment (never `.`/`..`, no separators) and
// that one file name, admitted for the Critic agent type alone.
const CRITIC_NOTES_PATTERN = /^scratch\/dispatch\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/critic-notes\.md$/u;
export const GRANT_REFUSAL_CODE = "DISPATCH-BUDGET-GRANT-ORCHESTRATOR-ONLY";

function isCriticAgentType(agentType) {
  return normalizedAgentType(agentType) === "critic";
}

function closingNotesClause(agentType) {
  return isCriticAgentType(agentType)
    ? ", (4) write your own scratch/dispatch/<subdir>/critic-notes.md (that exact file name only)"
    : "";
}

/**
 * Does this call write to, or run the script that writes, the orchestrator's
 * budget-grant store? Only the orchestrator may; a dispatched agent granting
 * itself budget would turn the cap into a suggestion.
 */
function touchesGrantStore(input) {
  const toolName = String(input?.tool_name ?? "");
  let text = "";
  if (WRITE_TOOLS.includes(toolName)) {
    text = String(writeTargetPath(input?.tool_input, toolName) ?? "");
  } else if (toolName === "Bash") {
    const command = input?.tool_input?.command ?? input?.tool_input?.CommandLine;
    text = typeof command === "string" ? command : "";
  }
  const normalized = text.replaceAll("\\", "/").toLowerCase();
  return /dispatch-budget-grant\.mjs(?![a-z0-9._-])/u.test(normalized) || normalized.includes("dispatch-budget/grants");
}

function grantRefused({ agentId, agentType }) {
  return verdict(
    2,
    "BLOCKED (guard-dispatch-budget, plugin pipeline-core): "
      + `${GRANT_REFUSAL_CODE}: this dispatch (${agentType}, agent ${agentId}) touched the dispatch-budget grant store or its grant script. `
      + "Only the orchestrating session may grant budget; end your turn with your interim report and let the dispatcher decide.\n",
  );
}

function grantPath(counterFilePath, agentId) {
  return join(dirname(counterFilePath), "grants", `${agentId}.json`);
}

const MAX_GRANT_FILE_BYTES = 32768;

/**
 * Calls the orchestrator granted this exact agent id, or 0. Any unreadable,
 * oversized, malformed or non-verifying record grants nothing (the safe direction).
 */
function readGrantedCalls(counterFilePath, agentId, dependencies) {
  if (!isValidGrantAgentId(agentId)) return 0;
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  try {
    const path = grantPath(counterFilePath, agentId);
    if (!existsSyncFn(path)) return 0;
    const text = readFileSyncFn(path, "utf8");
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_GRANT_FILE_BYTES) return 0;
    const checked = validateGrantRecord(JSON.parse(text), agentId);
    return checked.ok ? checked.totalExtra : 0;
  } catch {
    return 0;
  }
}

/** PreToolUse stdout whose `additionalContext` reaches the model on an `allow`; `permissionDecisionReason` would be user-only. */
function checkpointNoticeStdout({ agentType, count, workingCap, remaining }) {
  const critic = isCriticAgentType(agentType);
  const calls = `${remaining} call${remaining === 1 ? "" : "s"}`;
  const steps = critic
    ? "(1) start no new review work; (2) write your interim notes (done / remaining / next step) into your own scratch/dispatch/<subdir>/critic-notes.md; (3) end your turn with that hand-back."
    : "(1) commit what is already green now (never a known-red regression); (2) write an interim report (done / remaining / next step) into your dispatch record, evidence/dispatch-record-<TASK_ID>.json (log + report); (3) end your turn with that hand-back.";
  const additionalContext = `DISPATCH-BUDGET-CHECKPOINT: ${calls} of your working budget remain after this call (counted call ${count} of ${workingCap}). `
    + "Do not start new work. Hand back to the dispatcher now: "
    + `${steps} `
    + "The dispatcher decides: grant more budget and continue you, or dispatch a follow-up that builds on your interim report. "
    + "Do not spend the closing allowance on further work.";
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", additionalContext } })}\n`;
}

const COMMIT_FLOW_PRODUCER_SCRIPT = "goldfish-commit-command-flow.mjs";
// `node` or `node.exe`, then the script as the very next token: double-quoted, single-quoted or bare.
const PRODUCER_COMMAND_PATTERN = /^node(?:\.exe)?\s+(?:"([^"]+)"|'([^']+)'|([^\s"']+))(?:\s|$)/u;
// Any shell control or substitution character in the arguments means the call is not ONE plain `node <script> <args>`.
const PRODUCER_ARGS_CONTROL_PATTERN = /[;&|<>`$()\r\n]/u;

/**
 * The form two script paths are compared in. TR-G-F3 (Ruling 138, F1): the backslash is a path separator on win32
 * ONLY, so it is mapped to "/" there and nowhere else, exactly as lower-casing is win32-only. On a POSIX host a
 * backslash is an ordinary file-name character: `<plugin root>/scripts\goldfish-commit-command-flow.mjs` is a
 * different path from `<plugin root>/scripts/goldfish-commit-command-flow.mjs` and must not compare equal. Trailing
 * slashes (after the win32 conversion) are dropped on every platform.
 */
function comparableScriptPath(value) {
  const win32 = process.platform === "win32";
  const slashed = (win32 ? String(value).replaceAll("\\", "/") : String(value)).replace(/\/+$/u, "");
  return win32 ? slashed.toLowerCase() : slashed;
}

/**
 * TR-G-F (toil row T49): is this Bash command exactly one plain call of the read-only commit-flow producer shipped
 * in THIS guard's plugin (the root `resolveAgentPluginRoot` answers, the same one the maxTurns read uses)? The script
 * path must equal `<plugin root>/scripts/goldfish-commit-command-flow.mjs` once separators are normalised (win32
 * only, see `comparableScriptPath`; a copy of
 * the script elsewhere is a different program), and the arguments may carry no shell control character, so a chained
 * second command, a redirect or a substitution is never admitted through this lane. Whether the call is admitted at
 * all is still the shared core's decision: it counts the attempt and ends the allowance after five.
 */
function isCommitFlowProducerCommand(command, pluginRoot) {
  if (typeof command !== "string" || typeof pluginRoot !== "string" || pluginRoot === "") return false;
  const match = PRODUCER_COMMAND_PATTERN.exec(command);
  if (match === null) return false;
  if (PRODUCER_ARGS_CONTROL_PATTERN.test(command.slice(match[0].length))) return false;
  const scriptPath = match[1] ?? match[2] ?? match[3];
  return comparableScriptPath(scriptPath) === comparableScriptPath(join(pluginRoot, "scripts", COMMIT_FLOW_PRODUCER_SCRIPT));
}

/**
 * TR-G-F3 (Ruling 138, F2): is this Bash command ONE simple `git add` / `git commit`? The verb pattern tests only the
 * start of the command, so on its own `git add -- x && <other>` or `git commit -F f -- p | <other>` would be admitted
 * after the working cap. The same control-character refusal the producer lane applies (`;`, `&`, `|`, `<`, `>`,
 * backtick, `$`, parentheses, CR, LF) is applied to the WHOLE git command, so a chain, a redirect, a pipe or a
 * substitution is never a closing act. This only narrows what was admitted: plain `git add -- <p>` and
 * `git commit -F <f> -- <p>` are unchanged. A path or message that itself contains one of those characters (a
 * parenthesised directory, `git commit -m "feat(x): y"`) is refused too, the safe direction; use `-F <file>`.
 */
function isSingleGitClosingCommand(command) {
  return typeof command === "string" && GIT_CLOSING_VERB_PATTERN.test(command) && !PRODUCER_ARGS_CONTROL_PATTERN.test(command);
}

function isClosingAct(input, rootDir, agentType, dependencies = {}) {
  const toolName = String(input?.tool_name ?? "");
  if (WRITE_TOOLS.includes(toolName)) {
    const filePath = writeTargetPath(input?.tool_input, toolName);
    if (filePath === "") return false;
    const rel = (isAbsolute(filePath) ? relative(rootDir, filePath) : filePath).replaceAll("\\", "/");
    return DISPATCH_RECORD_PATTERN.test(rel) || (isCriticAgentType(agentType) && CRITIC_NOTES_PATTERN.test(rel));
  }
  if (toolName === "Bash") {
    const command = input?.tool_input?.command ?? input?.tool_input?.CommandLine;
    if (typeof command !== "string") return false;
    const trimmed = command.trim();
    return isSingleGitClosingCommand(trimmed) || isCommitFlowProducerCommand(trimmed, resolveAgentPluginRoot(rootDir, dependencies));
  }
  return false;
}

function counterPath(commonDir, agentId) {
  return join(commonDir, "agent-pipeline", "dispatch-budget", `${agentId}.json`);
}

function loadCounter(path, seed, dependencies) {
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  if (existsSyncFn(path)) {
    try {
      const parsed = JSON.parse(readFileSyncFn(path, "utf8"));
      if (Number.isSafeInteger(parsed?.count) && parsed.count >= 0) return parsed;
      return { schema: "pipeline.dispatch-budget-counter.v1", ...seed, count: parsed?.count };
    } catch {
      // Preserve an invalid sentinel so policy denies instead of silently
      // resetting a corrupt persisted count and granting a fresh budget.
      return { schema: "pipeline.dispatch-budget-counter.v1", ...seed, count: undefined };
    }
  }
  return { schema: "pipeline.dispatch-budget-counter.v1", ...seed, count: 0 };
}

function saveCounter(path, counter, dependencies) {
  const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
  const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
  mkdirSyncFn(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSyncFn(path, `${JSON.stringify(counter, null, 2)}\n`, "utf8");
}

const COUNTER_LOCK_SCHEMA = "pipeline.dispatch-budget-counter-lock.v1";

function processStart(pid, dependencies = {}) {
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const text = readFileSyncFn(`/proc/${pid}/stat`, "utf8");
  const close = text.lastIndexOf(")");
  if (close < 0) throw new Error("invalid proc stat");
  const fields = text.slice(close + 2).trim().split(/\s+/u);
  if (fields.length < 20 || !/^[0-9]+$/u.test(fields[19])) throw new Error("invalid proc start");
  return fields[19];
}

// Native Windows has no /proc. Boot and process-start identities are epochs
// in whole seconds derived from wall clock minus uptime; they are compared
// with tolerances because both derivations jitter by rounding and clock skew.
const WIN32_BOOT_TOLERANCE_SECONDS = 300;
const WIN32_PROCESS_START_TOLERANCE_SECONDS = 2;
const WIN32_BOOT_ID_PATTERN = /^w32boot-([0-9]{1,15})$/u;

/** Wall clock in seconds; `epochNowFn` returns milliseconds since the Unix epoch (Date.now shape). */
function win32EpochSeconds(dependencies = {}) {
  const epochNowFn = dependencies.epochNowFn ?? (() => Date.now());
  const value = Number(epochNowFn()) / 1000;
  if (!Number.isFinite(value) || value <= 0) throw new Error("counter-lock-owner-ambiguous");
  return value;
}

function win32BootSeconds(dependencies = {}) {
  const uptimeFn = dependencies.uptimeFn ?? uptime;
  const seconds = Number(uptimeFn());
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("counter-lock-owner-ambiguous");
  return Math.round(win32EpochSeconds(dependencies) - seconds);
}

function win32ProcessStartSeconds(dependencies = {}) {
  const processUptimeFn = dependencies.processUptimeFn ?? (() => process.uptime());
  const seconds = Number(processUptimeFn());
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("counter-lock-owner-ambiguous");
  return Math.round(win32EpochSeconds(dependencies) - seconds);
}

function win32CounterLockOwner(dependencies = {}) {
  const hostnameFn = dependencies.hostnameFn ?? hostname;
  const pid = dependencies.pid ?? process.pid;
  const hostId = String(hostnameFn()).toLowerCase();
  const bootId = `w32boot-${win32BootSeconds(dependencies)}`;
  const processStartValue = String(win32ProcessStartSeconds(dependencies));
  if (!/^[A-Za-z0-9._-]{1,120}$/u.test(hostId)
    || !WIN32_BOOT_ID_PATTERN.test(bootId)
    || !/^[0-9]+$/u.test(processStartValue)
    || !Number.isSafeInteger(pid) || pid < 1) throw new Error("counter-lock-owner-ambiguous");
  return { platform: "win32", hostId, bootId, pid, processStart: processStartValue, nonce: randomUUID().replaceAll("-", "") };
}

function win32CounterLockOwnerState(record, dependencies = {}) {
  let hostId;
  let bootSeconds;
  try {
    hostId = String((dependencies.hostnameFn ?? hostname)()).toLowerCase();
    bootSeconds = win32BootSeconds(dependencies);
  } catch { return "ambiguous"; }
  if (record.owner.hostId !== hostId) return "ambiguous";
  const ownerBoot = WIN32_BOOT_ID_PATTERN.exec(record.owner.bootId);
  if (!ownerBoot) return "ambiguous";
  if (Math.abs(Number(ownerBoot[1]) - bootSeconds) > WIN32_BOOT_TOLERANCE_SECONDS) return "dead";
  if (record.owner.pid === (dependencies.pid ?? process.pid)) {
    let ownStart;
    try { ownStart = win32ProcessStartSeconds(dependencies); } catch { return "ambiguous"; }
    return Math.abs(Number(record.owner.processStart) - ownStart) <= WIN32_PROCESS_START_TOLERANCE_SECONDS ? "live" : "dead";
  }
  const killFn = dependencies.killFn ?? ((pid, signal) => process.kill(pid, signal));
  try {
    killFn(record.owner.pid, 0);
    return "live";
  } catch (error) {
    if (error?.code === "ESRCH") return "dead";
    if (error?.code === "EPERM") return "live";
    return "ambiguous";
  }
}

function localCounterLockOwner(dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  const hostnameFn = dependencies.hostnameFn ?? hostname;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const pid = dependencies.pid ?? process.pid;
  if (platform === "win32") return win32CounterLockOwner(dependencies);
  if (platform !== "linux") throw new Error("counter-lock-owner-ambiguous");
  const hostId = hostnameFn().toLowerCase();
  const bootId = readFileSyncFn("/proc/sys/kernel/random/boot_id", "utf8").trim().toLowerCase();
  const processStartValue = processStart(pid, dependencies);
  if (!/^[A-Za-z0-9._-]{1,120}$/u.test(hostId)
    || !/^[A-Za-z0-9._-]{1,120}$/u.test(bootId)
    || !/^[0-9]+$/u.test(processStartValue)) throw new Error("counter-lock-owner-ambiguous");
  return { platform, hostId, bootId, pid, processStart: processStartValue, nonce: randomUUID().replaceAll("-", "") };
}

function counterLockBytes(owner) {
  return Buffer.from(`${JSON.stringify({ schema: COUNTER_LOCK_SCHEMA, owner })}\n`, "utf8");
}

function counterLockIdentity(path, dependencies = {}, expectedBytes = null) {
  const lstatSyncFn = dependencies.lstatSyncFn ?? lstatSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const info = lstatSyncFn(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("counter-lock-unsafe");
  // publishCounterLock() first hard-links the complete private inode into the
  // public name and then removes the private name. A competing process may be
  // scheduled in that bounded interval and observe nlink=2. That is contention,
  // not malformed persisted state. Keep every other link count fail-closed as
  // unsafe: only the publisher's exact two-name transition is retryable.
  if (info.nlink === 2) throw new Error("counter-lock-publishing");
  if (info.nlink !== 1) throw new Error("counter-lock-unsafe");
  const bytes = Buffer.from(readFileSyncFn(path));
  if (bytes.length === 0 || bytes.length > 4096 || (expectedBytes !== null && !bytes.equals(expectedBytes))) {
    throw new Error("counter-lock-malformed");
  }
  return { dev: String(info.dev), ino: String(info.ino), bytes };
}

function sameCounterLockIdentity(path, identity, dependencies = {}) {
  try {
    const current = counterLockIdentity(path, dependencies, identity.bytes);
    return current.dev === identity.dev && current.ino === identity.ino;
  } catch { return false; }
}

function readCounterLock(path, dependencies = {}) {
  const identity = counterLockIdentity(path, dependencies);
  let value;
  try { value = JSON.parse(identity.bytes.toString("utf8")); } catch { throw new Error("counter-lock-malformed"); }
  const owner = value?.owner;
  if (!identity.bytes.equals(counterLockBytes(owner))
    || value?.schema !== COUNTER_LOCK_SCHEMA
    || Object.keys(value).sort().join(",") !== "owner,schema"
    || owner === null || typeof owner !== "object" || Array.isArray(owner)
    || Object.keys(owner).sort().join(",") !== "bootId,hostId,nonce,pid,platform,processStart"
    || (owner.platform !== "linux" && owner.platform !== "win32")
    || !/^[A-Za-z0-9._-]{1,120}$/u.test(owner.hostId ?? "")
    || !/^[A-Za-z0-9._-]{1,120}$/u.test(owner.bootId ?? "")
    || !Number.isSafeInteger(owner.pid) || owner.pid < 1
    || !/^[0-9]+$/u.test(owner.processStart ?? "")
    || !/^[a-f0-9]{32}$/u.test(owner.nonce ?? "")) throw new Error("counter-lock-malformed");
  return { owner, identity };
}

function readStableCounterLock(path, dependencies = {}) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { return readCounterLock(path, dependencies); }
    catch (error) {
      lastError = error;
      // Atomic hard-link publication has one bounded transitional instant with
      // nlink=2 before the private temporary name is removed. Wait only for
      // that publisher; persistent malformed state remains fail-closed.
      if (attempt < 7) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
    }
  }
  throw lastError;
}

function counterLockOwnerState(record, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  if (platform === "win32" && record.owner.platform === "win32") return win32CounterLockOwnerState(record, dependencies);
  if (platform !== "linux" || record.owner.platform !== "linux") return "ambiguous";
  let hostId;
  let bootId;
  try {
    hostId = (dependencies.hostnameFn ?? hostname)().toLowerCase();
    bootId = (dependencies.readFileSyncFn ?? readFileSync)("/proc/sys/kernel/random/boot_id", "utf8").trim().toLowerCase();
  } catch { return "ambiguous"; }
  if (record.owner.hostId !== hostId) return "ambiguous";
  if (record.owner.bootId !== bootId) return "dead";
  try { return processStart(record.owner.pid, dependencies) === record.owner.processStart ? "live" : "dead"; }
  catch (error) { return error?.code === "ENOENT" ? "dead" : "ambiguous"; }
}

function publishCounterLock(path, dependencies = {}) {
  const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
  const linkSyncFn = dependencies.linkSyncFn ?? linkSync;
  const unlinkSyncFn = dependencies.unlinkSyncFn ?? unlinkSync;
  let temporary = `${path}.${process.pid}-${randomUUID()}.tmp`;
  const bytes = counterLockBytes(localCounterLockOwner(dependencies));
  try {
    writeFileSyncFn(temporary, bytes, { flag: "wx", mode: 0o600 });
    linkSyncFn(temporary, path);
    unlinkSyncFn(temporary);
    temporary = null;
    return { path, identity: counterLockIdentity(path, dependencies, bytes) };
  } finally {
    if (temporary !== null) try { unlinkSyncFn(temporary); } catch { /* best effort */ }
  }
}

export function releaseDispatchBudgetCounterLock(lock, dependencies = {}) {
  if (!lock || !sameCounterLockIdentity(lock.path, lock.identity, dependencies)) return false;
  const renameSyncFn = dependencies.renameSyncFn ?? renameSync;
  const unlinkSyncFn = dependencies.unlinkSyncFn ?? unlinkSync;
  const quarantine = `${lock.path}.release.${process.pid}-${randomUUID()}`;
  renameSyncFn(lock.path, quarantine);
  if (!sameCounterLockIdentity(quarantine, lock.identity, dependencies)) return false;
  unlinkSyncFn(quarantine);
  return true;
}

/**
 * Classifies an exception thrown during dead-owner recovery (Spec 22.11 R7-11d). ENOENT or EEXIST
 * means another caller got there first -- a benign race the wait retries as
 * `counter-lock-recovery-raced`. Anything else (EACCES, EPERM, EIO, ...) is a genuine failure:
 * `counter-lock-recovery-failed`, never retried, and never the raw fs message as the reason code.
 */
function counterLockRecoveryErrorResult(error) {
  const benign = error?.code === "ENOENT" || error?.code === "EEXIST";
  return { status: "rejected", code: benign ? "counter-lock-recovery-raced" : "counter-lock-recovery-failed" };
}

export function acquireDispatchBudgetCounterLock(path, dependencies = {}) {
  const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const renameSyncFn = dependencies.renameSyncFn ?? renameSync;
  const unlinkSyncFn = dependencies.unlinkSyncFn ?? unlinkSync;
  mkdirSyncFn(dirname(path), { recursive: true, mode: 0o700 });
  try { return { status: "acquired", lock: publishCounterLock(path, dependencies), recovered: false }; }
  catch (error) { if (error?.code !== "EEXIST") return { status: "rejected", code: error?.message ?? "counter-lock-publish" }; }

  let observed;
  try { observed = readStableCounterLock(path, dependencies); }
  catch (error) {
    // An owner may release the public name, or a publisher may still hold its
    // private hard link, throughout the bounded stable-read retries. Both are
    // ordinary contention and must remain retryable by the caller. Persisted
    // malformed/unsafe lock state still fails closed under its existing code.
    if (error?.code === "ENOENT" || error?.message === "counter-lock-publishing") {
      return { status: "rejected", code: "counter-lock-busy" };
    }
    return { status: "rejected", code: "counter-lock-malformed" };
  }
  const state = counterLockOwnerState(observed, dependencies);
  if (state === "live") return { status: "rejected", code: "counter-lock-busy" };
  if (state !== "dead") return { status: "rejected", code: "counter-lock-owner-ambiguous" };

  const recoveryPath = `${path}.recovery`;
  let recovery;
  try { recovery = publishCounterLock(recoveryPath, dependencies); }
  catch (error) {
    if (error?.code === "EEXIST") {
      if (!existsSyncFn(recoveryPath)) return { status: "rejected", code: "counter-lock-recovery-raced" };
      let recoveryObserved;
      try { recoveryObserved = readStableCounterLock(recoveryPath, dependencies); }
      catch { return { status: "rejected", code: "counter-lock-recovery-malformed" }; }
      const recoveryState = counterLockOwnerState(recoveryObserved, dependencies);
      if (recoveryState !== "dead") return { status: "rejected", code: recoveryState === "live" ? "counter-lock-recovery-busy" : "counter-lock-owner-ambiguous" };
      const staleRecovery = `${recoveryPath}.dead.${process.pid}-${randomUUID()}`;
      try {
        renameSyncFn(recoveryPath, staleRecovery);
        if (!sameCounterLockIdentity(staleRecovery, recoveryObserved.identity, dependencies)) return { status: "rejected", code: "counter-lock-recovery-changed" };
        unlinkSyncFn(staleRecovery);
        recovery = publishCounterLock(recoveryPath, dependencies);
      } catch (takeoverError) { return counterLockRecoveryErrorResult(takeoverError); }
    } else return { status: "rejected", code: "counter-lock-recovery-failed" };
  }
  const quarantine = `${path}.dead.${process.pid}-${randomUUID()}`;
  let published = null;
  try {
    const current = readStableCounterLock(path, dependencies);
    if (!sameCounterLockIdentity(path, observed.identity, dependencies)
      || !current.identity.bytes.equals(observed.identity.bytes)
      || counterLockOwnerState(current, dependencies) !== "dead") return { status: "rejected", code: "counter-lock-changed" };
    renameSyncFn(path, quarantine);
    if (!sameCounterLockIdentity(quarantine, observed.identity, dependencies)) return { status: "rejected", code: "counter-lock-changed" };
    published = publishCounterLock(path, dependencies);
    unlinkSyncFn(quarantine);
    return { status: "acquired", lock: published, recovered: true };
  } catch (error) {
    // A lock this attempt published but could not finish recovering must not stay held: the retry of a benign race would otherwise wait on its own live lock.
    if (published !== null) try { releaseDispatchBudgetCounterLock(published, dependencies); } catch { /* best effort */ }
    return counterLockRecoveryErrorResult(error);
  }
  finally { releaseDispatchBudgetCounterLock(recovery, dependencies); }
}

/**
 * Total wait ceiling of `acquireDispatchBudgetCounterLockWithWait` (Spec 22.11
 * R7-11d): a few seconds, a positive integer, measured on the injectable clock
 * from the first attempt.
 */
export const COUNTER_LOCK_WAIT_BOUND_MS = 3000;
const COUNTER_LOCK_BACKOFF_INITIAL_MS = 5;
const COUNTER_LOCK_BACKOFF_MAX_MS = 100;
// Outcomes the wait variant retries: a live owner or the publishing transition
// (`counter-lock-busy`) and the transient races of dead-owner recovery, produced
// when the observed holder exits or the lock is replaced under another caller's
// read, including `counter-lock-recovery-raced` (the benign race exits of dead-owner
// recovery: ENOENT/EEXIST because a winner got there first). Everything else
// (malformed, unsafe, ambiguous, recovery-changed, and recovery-failed, a genuine
// EACCES/EPERM/EIO-style failure during recovery) fails closed at once.
const COUNTER_LOCK_TRANSIENT_CODES = new Set([
  "counter-lock-busy",
  "counter-lock-changed",
  "counter-lock-recovery-busy",
  "counter-lock-recovery-raced",
]);

/** Default wait clock: monotonic (immune to wall-clock steps); the injected `dependencies.now` replaces it in tests. */
function monotonicNowMs() {
  return performance.now();
}

function synchronousSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** The lock file's mtime in epoch ms, or null when it cannot be read (e.g. released meanwhile). */
function counterLockMtimeMs(path, dependencies) {
  try {
    const info = (dependencies.lstatSyncFn ?? lstatSync)(path);
    return Number.isFinite(info?.mtimeMs) ? info.mtimeMs : null;
  } catch { return null; }
}

/**
 * Bounded-wait variant of `acquireDispatchBudgetCounterLock` (Spec 22.11
 * R7-11): repeats the single attempt (`dependencies.acquireDispatchBudgetCounterLockFn`
 * when supplied, else the real one) while it reports `counter-lock-busy`, i.e.
 * a live owner or the retryable publishing transition, or one of the transient
 * dead-owner-recovery race outcomes `counter-lock-changed`,
 * `counter-lock-recovery-busy` and `counter-lock-recovery-raced`, sleeping with a
 * bounded backoff between attempts. Every other outcome -- acquired (including
 * dead-owner recovery), malformed, unsafe, ambiguous, and the genuine recovery
 * failure `counter-lock-recovery-failed` (EACCES/EPERM/EIO) -- is returned at once,
 * exactly as the single attempt produced it, with no sleep. Once
 * `COUNTER_LOCK_WAIT_BOUND_MS` has elapsed it returns `{ status: "rejected", code:
 * "counter-lock-timeout", holderAgeMs }`, where `holderAgeMs` is now minus the
 * lock file's mtime (omitted when no lock file exists and no live holder was seen
 * during the wait, i.e. only race outcomes occurred); a live holder's lock is
 * never taken over or deleted.
 *
 * Injectable and SYNCHRONOUS (the hook is synchronous): `dependencies.now()`
 * (ms; default the monotonic `performance.now()`, so the bound cannot be stretched
 * by a wall-clock step) and `dependencies.sleep(ms)` (default a real
 * `Atomics.wait`). The holder age compares the lock file's wall-clock mtime with
 * wall-clock `Date.now()`, or with the injected `now` reading when one is injected.
 * The hook forwards its own options object as `dependencies`.
 */
export function acquireDispatchBudgetCounterLockWithWait(path, dependencies = {}) {
  const attempt = dependencies.acquireDispatchBudgetCounterLockFn ?? acquireDispatchBudgetCounterLock;
  const injectedNow = dependencies.now ?? null;
  const nowFn = injectedNow ?? monotonicNowMs;
  const sleepFn = dependencies.sleep ?? synchronousSleep;
  const startedAt = Number(nowFn());
  let backoffMs = COUNTER_LOCK_BACKOFF_INITIAL_MS;
  let lastChance = false;
  let sawBusy = false;
  for (;;) {
    const result = attempt(path, dependencies);
    if (result?.status !== "rejected" || !COUNTER_LOCK_TRANSIENT_CODES.has(result.code)) return result;
    if (result.code === "counter-lock-busy") sawBusy = true;
    const current = Number(nowFn());
    const elapsedMs = current - startedAt;
    if (!(elapsedMs < COUNTER_LOCK_WAIT_BOUND_MS)) {
      const mtimeMs = counterLockMtimeMs(path, dependencies);
      if (mtimeMs !== null) {
        // mtime is wall-clock: age it against wall-clock `Date.now()`, never the monotonic reading (an injected `now` keeps its own reading).
        const wallNowMs = injectedNow === null ? Number(Date.now()) : current;
        return { status: "rejected", code: "counter-lock-timeout", holderAgeMs: Math.max(0, Math.floor(wallNowMs) - Math.floor(mtimeMs)) };
      }
      // The lock vanished between the last attempt and the age read: one more
      // attempt, then give up. After a live holder was seen the wait itself is the
      // best available age; after only race outcomes there is no holder to age.
      if (lastChance) {
        return sawBusy
          ? { status: "rejected", code: "counter-lock-timeout", holderAgeMs: Math.max(0, Math.floor(elapsedMs)) }
          : { status: "rejected", code: "counter-lock-timeout" };
      }
      lastChance = true;
      continue;
    }
    sleepFn(Math.max(1, Math.min(backoffMs, Math.ceil(COUNTER_LOCK_WAIT_BOUND_MS - elapsedMs))));
    backoffMs = Math.min(backoffMs * 2, COUNTER_LOCK_BACKOFF_MAX_MS);
  }
}

/** The text a refused lock acquisition shows the agent: the code, plus the holder age for a timeout (never a path). */
function counterLockRefusalReason(acquired) {
  return acquired.code === "counter-lock-timeout" && Number.isFinite(acquired.holderAgeMs)
    ? `counter-lock-timeout: lock held for ${acquired.holderAgeMs} ms by a live holder`
    : acquired.code;
}

function initializeBoundCounter(path, seed, pendingContext, dependencies) {
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const unlinkSyncFn = dependencies.unlinkSyncFn ?? unlinkSync;
  try {
    if (existsSyncFn(path)) return { status: "prepared", counter: loadCounter(path, seed, dependencies) };
    saveCounter(path, { schema: "pipeline.dispatch-budget-counter.v1", ...seed, count: 0 }, dependencies);
    const expected = `${JSON.stringify({ schema: "pipeline.dispatch-budget-counter.v1", ...seed, count: 0 }, null, 2)}\n`;
    if (readFileSyncFn(path, "utf8") !== expected) throw new Error("counter readback mismatch");
    const consumed = (dependencies.consumePendingDispatchBudgetBindingFn ?? consumePendingDispatchBudgetBinding)(pendingContext, dependencies);
    if (consumed.status !== "consumed") {
      unlinkSyncFn(path);
      return { status: "rejected", code: consumed.code };
    }
    return { status: "prepared", counter: loadCounter(path, seed, dependencies) };
  } catch {
    try { unlinkSyncFn(path); } catch { /* no published counter */ }
    return { status: "rejected", code: "counter-binding-initialize" };
  }
}

/**
 * Small-role lane (operator hotfix, 2026-10-03): a role WITHOUT a budget contract
 * whose maxTurns leaves no working cap after the fixed closing + safety reserve
 * (dispatchWorkingCap(maxTurns) < 1, e.g. consult-advisor 10, plan-verifier 15)
 * is still counted and capped, but without the safety reserve:
 * baseCalls = maxTurns - CLOSING_ALLOWANCE, closing allowance preserved, so
 * working + closing calls never exceed maxTurns. The shared core always
 * subtracts both reserves, so the lane is evaluated against the policy tier
 * maxTurns + SAFETY_MARGIN, whose working cap is exactly that baseCalls; the
 * counter keeps the real maxTurns. maxTurns <= CLOSING_ALLOWANCE keeps the
 * existing refusal (null). Budgeted roles never take this lane.
 */
function smallRolePolicyMaxTurns(maxTurns) {
  const workingCap = dispatchWorkingCap(maxTurns);
  if (workingCap === null || workingCap >= 1 || maxTurns - CLOSING_ALLOWANCE < 1) return null;
  return maxTurns + SAFETY_MARGIN;
}

function advanceCounter({ path, counter, identity, maxTurns, baseCalls, rootDir, input, nowFn, dependencies, policyMaxTurns = maxTurns }) {
  const workingCap = Math.min(baseCalls, dispatchWorkingCap(policyMaxTurns));
  const bindingMatches = counter.agentId === identity.agentId
    && counter.agentType === identity.agentType
    && counter.maxTurns === maxTurns
    && counter.baseCalls === baseCalls
    && counter.workingCap === workingCap;
  if (!bindingMatches) {
    return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: "counter-binding-mismatch" });
  }
  // The small-role lane already spends maxTurns - CLOSING_ALLOWANCE, so it has no headroom to grant.
  const grantedCalls = policyMaxTurns === maxTurns ? readGrantedCalls(path, identity.agentId, dependencies) : 0;
  const preliminaryBudget = decideDispatchBudgetCall({ maxTurns: policyMaxTurns, baseCalls, currentCount: counter.count, isClosingAct: false, grantedCalls });
  if (preliminaryBudget.decision === "invalid-input") {
    return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: preliminaryBudget.reason });
  }
  const budget = preliminaryBudget.decision === "exhausted" && isClosingAct(input, rootDir, identity.agentType, dependencies)
    ? decideDispatchBudgetCall({ maxTurns: policyMaxTurns, baseCalls, currentCount: counter.count, isClosingAct: true, grantedCalls })
    : preliminaryBudget;
  counter.count = budget.nextCount;
  counter.updatedAt = nowFn();
  saveCounter(path, counter, dependencies);
  if (budget.allowed) {
    // Checkpoint notice (PO decision 2026-10-05): only budget-bearing roles, only working calls.
    const contract = (dependencies.dispatchBudgetContractForRoleFn ?? dispatchBudgetContractForRole)(identity.agentType, budgetContractOptions(rootDir, dependencies));
    const checkpoint = contract.applicable
      ? dispatchCheckpointDecision({ workingCap: budget.workingCap, nextCount: budget.nextCount, decision: budget.decision })
      : { notice: false };
    if (!checkpoint.notice) return verdict(0);
    return {
      exitCode: 0,
      stderr: "",
      stdout: checkpointNoticeStdout({
        agentType: identity.agentType, count: budget.nextCount, workingCap: budget.workingCap, remaining: checkpoint.remainingWorkingCalls,
      }),
    };
  }
  return blocked({
    agentId: identity.agentId, agentType: identity.agentType, maxTurns, baseCalls,
    workingCap: budget.workingCap, count: counter.count, smallRole: policyMaxTurns !== maxTurns,
  });
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function unresolvedObservationPath(commonDir, record) {
  const sessionId = record.sessionId;
  const sessionBucket = typeof sessionId === "string" && sessionId.trim() !== ""
    ? `session-${digest(sessionId).slice(0, 32)}`
    : "fallback-session";
  const reasonBucket = `reason-${digest(String(record.reason ?? "unknown")).slice(0, 32)}`;
  return join(commonDir, "agent-pipeline", "dispatch-budget", "unresolved-observations", sessionBucket, `${reasonBucket}.json`);
}

function recordUnresolved(commonDir, record, dependencies) {
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
  const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
  const linkSyncFn = dependencies.linkSyncFn ?? linkSync;
  const unlinkSyncFn = dependencies.unlinkSyncFn ?? unlinkSync;
  let temporary = null;
  try {
    const path = unresolvedObservationPath(commonDir, record);
    const dir = dirname(path);
    if (existsSyncFn(path)) return; // cheap repeat path; link below still closes races
    mkdirSyncFn(dir, { recursive: true, mode: 0o700 });
    temporary = join(dir, `.observation-${process.pid}-${randomUUID()}.json`);
    const { sessionId, ...diagnostic } = record;
    const observation = {
      schema: "pipeline.dispatch-budget-unresolved-observation.v1",
      ...diagnostic,
      sessionBucket: basename(dirname(path)),
    };
    // The hard-link claim publishes a complete JSON diagnostic atomically. A
    // concurrent claimant gets EEXIST; a crash before the link leaves only a
    // disposable temporary file, never an empty suppressor.
    writeFileSyncFn(temporary, `${JSON.stringify(observation)}\n`, "utf8");
    try {
      linkSyncFn(temporary, path);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  } catch {
    // best-effort observability only -- never let a logging failure change the fail-open verdict
  } finally {
    if (temporary !== null) {
      try { unlinkSyncFn(temporary); } catch { /* best-effort cleanup */ }
    }
  }
}

/** One line on the guard's own stderr -- see the Fail-open-but-visible doc block above for why this is the only channel left when `commonDir` itself could not be resolved. Never affects the exit code. */
function observationLine(record) {
  return `OBSERVE (guard-dispatch-budget): ${JSON.stringify(record)}\n`;
}

/**
 * Bounded sink for the orchestrator branch (DoD b, NVA-BUDGETROOT-1): one
 * marker file per session, keyed off the session's own transcript filename.
 * `existsSync` is checked before every write, so a session that makes 500
 * tool calls still produces exactly one file, not 500 -- the bound.
 */
function orchestratorMarkerPath(commonDir, transcriptPath) {
  const stem = typeof transcriptPath === "string" && transcriptPath.trim() !== ""
    ? basename(transcriptPath).replace(/\.jsonl$/u, "")
    : "unknown-session";
  return join(commonDir, "agent-pipeline", "dispatch-budget", "orchestrator-seen", `${stem}.json`);
}

function recordOrchestratorObservation(commonDir, record, dependencies) {
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
  const writeFileSyncFn = dependencies.writeFileSyncFn ?? writeFileSync;
  try {
    const path = orchestratorMarkerPath(commonDir, record.transcriptPath);
    if (existsSyncFn(path)) return; // already recorded once for this session -- the bound
    mkdirSyncFn(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSyncFn(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  } catch {
    // best-effort observability only -- never let a logging failure change the fail-open verdict
  }
}

/**
 * @param {object} input the PreToolUse hook payload (`tool_name`, `tool_input`, `transcript_path`, ...)
 * @param {object} [options]
 * @param {string} [options.rootDir] highest-precedence project-root override (tests only). Absent that,
 *   resolution mirrors the working siblings that already resolve a project root this way --
 *   `guard-lifecycle-ready.mjs` (`dependencies.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()`)
 *   and `guard-testpath.mjs` (`process.env.CLAUDE_PROJECT_DIR || process.cwd()`), both of which read
 *   `CLAUDE_PROJECT_DIR` -- the variable the host sets for hooks -- before falling back to the guard
 *   process's own `process.cwd()`. `guard-push.mjs`'s host-declared payload `cwd` (`declaredCwd`,
 *   `resolveShellCwd()`) is deliberately NOT part of this chain: that field answers a narrower question
 *   (the exact directory ONE push command executes in) which `guard-push.mjs`'s own
 *   `fallbackProjectDir()` -- its equivalent of a project-root resolver -- already excludes for the same
 *   reason ("never anchors the critical-proof boundary... to a declared push target"). `rootDir` here
 *   serves that same project-root role (locating the git common dir and an agent definition file), so it
 *   follows `fallbackProjectDir()`'s precedent rather than inventing a combined order no sibling uses.
 * @param {() => string} [options.nowFn] clock override (tests only)
 * @param {object} [options] also doubles as the dependency-injection bag for every helper above (tests only)
 */
/**
 * pipeline.dispatch-budget-discriminator-is-agent-id (2026-09-06, NVA-B-BUDGETGUARD-2):
 * THIS guard's own identity step -- deliberately NOT `subagentIdentity()` above, which stays
 * exported and UNCHANGED because guard-lifecycle-ready.mjs's GL-09 bootstrap-receipt gate
 * also imports and relies on it; that caller is out of this dispatch's scope and was not
 * touched or re-verified here. CORRECTION to this file's own "Identity chain" header block
 * above: measured 2026-09-06 against two live goldfish dispatches
 * (backlog/evidence/2026-09-06-dispatch-budget-guard-discriminator-measured.md), no real
 * PreToolUse payload -- subagent or orchestrator alike -- ever carries a
 * `.../subagents/agent-<id>.jsonl` transcript_path; every payload carries the PARENT
 * session's own transcript_path and session_id. `subagentIdentity()`'s discriminator was
 * therefore never true in practice, and this guard's counter never moved. The real
 * discriminator is the payload's key set: a subagent payload carries `agent_id` (and
 * `agent_type`) that an orchestrator payload does not. The orchestrator exemption stays
 * INSIDE this guard (the branch below), never folded into the matcher -- that separation is
 * what keeps the hook safe to widen.
 *
 * pipeline.dispatch-budget-partial-identity-is-visible (2026-09-07, NVA-B-BUDGETVIS-1, F1
 * backlog/evidence/2026-09-06-nva-b-guardfix-critic-round1.md): the discriminator above is a
 * two-way read (has a usable `agent_id` string, or does not) with no positive orchestrator-only
 * fact to check against -- per the same measurement, the orchestrator payload's ENTIRE
 * distinguishing fact is the clean absence of both `agent_id` and `agent_type`. A payload that
 * carries neither a usable `agent_id` nor that clean absence -- `agent_type` present with no
 * `agent_id` key at all, or an `agent_id` key present but blank or not a string -- is therefore
 * neither measured shape: it is partial or malformed dispatch-identity evidence, exactly the
 * class a host or runner variation could plausibly produce. Before this fix such a payload fell
 * straight into the orchestrator branch below, silently exempt and merged into that branch's
 * once-per-session marker with no way to tell it apart from a genuine orchestrator call
 * afterward. It now returns `kind: "unresolved"` instead, which routes through
 * `evaluateDispatchBudgetGuard`'s EXISTING `identity.kind === "unresolved"` branch into
 * `recordUnresolved()`'s bounded per-session/reason observation -- no change to the allow verdict
 * (still exit 0), and no restoration of the transcript-path-keyed reasons that branch used to carry
 * before `6372b984` (those tested a discriminator the 2026-09-06 measurement disproved; this is a
 * new reason keyed on the payload's actual key set, not a revival of the old one). The two
 * measured shapes are untouched: a payload with a usable `agent_id` is still `subagent`; a payload
 * with neither an `agent_id` key nor an `agent_type` key is still `orchestrator`, exactly as
 * before, including every legacy fixture already pinned in the test suite that never carries
 * either key. `agent_id: null` remains malformed because the measured orchestrator shape omits
 * that key; this differs from `transcript_path: null`, which the shared lifecycle resolver treats
 * as absent. The budget-local classifier does not consume transcript-path identity.
 */
function dispatchBudgetCallerIdentity(input) {
  const isObjectInput = typeof input === "object" && input !== null;
  const hasAgentIdKey = isObjectInput && Object.prototype.hasOwnProperty.call(input, "agent_id");
  const hasAgentTypeKey = isObjectInput && Object.prototype.hasOwnProperty.call(input, "agent_type");
  return classifyDispatchBudgetCaller({
    agentIdPresent: hasAgentIdKey,
    agentId: hasAgentIdKey ? input.agent_id : undefined,
    agentTypePresent: hasAgentTypeKey,
    agentType: hasAgentTypeKey ? input.agent_type : undefined,
  });
}

function normalizedAgentType(value) {
  if (typeof value !== "string") return null;
  return value.startsWith("pipeline-core:") ? value.slice("pipeline-core:".length) : value;
}

export function resolveParentDispatchToolUseId(input, identity, dependencies = {}) {
  const transcriptPath = input?.transcript_path;
  if (typeof transcriptPath !== "string" || !isAbsolute(transcriptPath) || !transcriptPath.endsWith(".jsonl")) {
    return { status: "rejected", code: "parent-transcript-path-unusable" };
  }
  const agentId = identity?.agentId;
  if (typeof agentId !== "string" || agentId.trim() === "" || agentId.includes("/") || agentId.includes("\\")) {
    return { status: "rejected", code: "agent-id-unusable" };
  }
  const sessionDir = transcriptPath.slice(0, -".jsonl".length);
  const metaPath = join(sessionDir, "subagents", `agent-${agentId}.meta.json`);
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  if (!existsSyncFn(metaPath)) return { status: "rejected", code: "agent-meta-missing", metaPath };
  let meta;
  try { meta = JSON.parse(readFileSyncFn(metaPath, "utf8")); }
  catch { return { status: "rejected", code: "agent-meta-unparseable", metaPath }; }
  if (!Number.isFinite(meta?.spawnDepth) || meta.spawnDepth < 1
    || normalizedAgentType(meta.agentType) !== normalizedAgentType(identity.agentType)
    || typeof meta.toolUseId !== "string" || meta.toolUseId.trim() === "") {
    return { status: "rejected", code: "agent-meta-binding-invalid", metaPath };
  }
  return { status: "prepared", toolUseId: meta.toolUseId, metaPath };
}

export function evaluateDispatchBudgetGuard(input, options = {}) {
  if (!observeGovernanceScope({ rootDir: options.rootDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) return verdict(0);
  const rootDir = options.rootDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const nowFn = options.nowFn ?? (() => new Date().toISOString());
  const rawTranscriptPath = input?.transcript_path;

  const identity = dispatchBudgetCallerIdentity(input);
  const commonDir = (options.resolveGitCommonDirFn ?? resolveGitCommonDir)(rootDir, options);

  if (commonDir === null) {
    // No guard-owned location survives to write to -- see the Fail-open-but-visible
    // doc block above. Fail open, but say so on stderr rather than silently.
    return verdict(0, observationLine({
      branch: "common-dir-unresolved", identityKind: identity.kind,
      root: rootDir, commonDir: null, transcriptPath: rawTranscriptPath, at: nowFn(),
    }));
  }

  if (identity.kind === "orchestrator") {
    recordOrchestratorObservation(commonDir, {
      branch: "orchestrator", root: rootDir, commonDir, transcriptPath: rawTranscriptPath, at: nowFn(),
    }, options);
    return verdict(0); // never limited, by construction
  }

  // Grant store: orchestrator-only. Any non-orchestrator identity (resolved subagent,
  // partial or malformed identity) touching it is refused before anything is counted.
  if (touchesGrantStore(input)) {
    return grantRefused({ agentId: identity.agentId ?? "unresolved", agentType: identity.agentType ?? "unresolved" });
  }

  if (identity.kind === "unresolved") {
    recordUnresolved(commonDir, {
      ...identity, branch: "unresolved-identity", root: rootDir, commonDir, transcriptPath: rawTranscriptPath, sessionId: input?.session_id, at: nowFn(),
    }, options);
    return verdict(0);
  }

  if (identity.kind === "invalid-identity") {
    // pipeline.dispatch-budget-invalid-identity-fails-closed (2026-08-29,
    // NVA-R7-INVALIDIDENTITY): before this branch existed, a present-but-
    // unusable transcript_path fell through to resolveMaxTurns() with the
    // FIXED sentinel agentType (INVALID_TRANSCRIPT_PATH_SENTINEL_AGENT_TYPE),
    // which never resolves (no agent definition file is ever named
    // "unattested-invalid-transcript-path"), routing into the SAME
    // recordUnresolved(...) call as a genuinely ambiguous identity -- kind
    // "unresolved", branch "max-turns-unresolved", reason
    // "max-turns-unresolvable". That reason is actively misleading: it reads
    // exactly like "we resolved a real subagent identity but its agentType
    // has no definition file", when what actually happened is the identity
    // itself was never resolved at all. This is the concrete shape of
    // "discards information" from the backlog finding -- not merely that the
    // call was admitted, but that the record of it actively obscured what
    // was detected.
    //
    // Chosen behaviour: keep admitting the call (exitCode 0, unchanged) but
    // record it under its OWN branch and the identity's TRUE reason, never
    // silently merged into -- or made to look like -- a resolved-but-
    // undefined agent type. "Fails closed" here closes the OBSERVABILITY
    // gap, not the gate: a budget/turn-counting guard blocking every tool
    // call outright (Read included) on an unreadable identity is a much
    // heavier, disproportionate act for a mechanism whose entire job is
    // counting turns, not gating authority -- and it would directly
    // contradict this file's own "Fail-open-but-visible" design (a guard
    // that fails closed on its own confusion halts every dispatch in the
    // repository), a design this specific identity shape does not
    // invalidate: a present-but-not-absolute transcript_path is still, from
    // THIS guard's narrow budget-counting purpose, an identity it cannot
    // attribute a working cap to, however positively detected the
    // malformation is. Unconditional denial was rejected for a second,
    // independent reason: it would strand a flagged dispatch with no route
    // left to even write its own evidence/dispatch-record-*.json, unlike the
    // sibling guard-lifecycle-ready.mjs receipt gate's unconditional
    // "deny-no-receipt" (which this guard deliberately does NOT copy) --
    // that gate's job is a binary readiness attestation with no notion of a
    // "closing act" to protect, so full denial costs it nothing equivalent.
    // Never touches the real per-agentId counter file for this identity: the
    // sentinel agentId is FIXED and shared across every invalid-identity
    // occurrence session-wide, so loading/saving a counter keyed on it would
    // create one shared, racy file across unrelated dispatches instead of
    // the one-counter-file-per-real-dispatch invariant the rest of this
    // guard relies on.
    recordUnresolved(commonDir, {
      ...identity, branch: "invalid-identity", root: rootDir, commonDir, transcriptPath: rawTranscriptPath, at: nowFn(),
    }, options);
    return verdict(0);
  }

  const maxTurns = (options.resolveMaxTurnsFn ?? resolveMaxTurns)(identity.agentType, rootDir, options);
  if (maxTurns === null) {
    recordUnresolved(commonDir, {
      kind: "unresolved", reason: "max-turns-unresolvable", agentId: identity.agentId, agentType: identity.agentType,
      branch: "max-turns-unresolved", root: rootDir, commonDir, transcriptPath: rawTranscriptPath, sessionId: input?.session_id, at: nowFn(),
    }, options);
    return verdict(0);
  }

  const contract = (options.dispatchBudgetContractForRoleFn ?? dispatchBudgetContractForRole)(identity.agentType, budgetContractOptions(rootDir, options));
  const path = counterPath(commonDir, identity.agentId);
  const existsSyncFn = options.existsSyncFn ?? existsSync;
  let baseCalls = dispatchWorkingCap(maxTurns);
  let counter;
  if (contract.applicable) {
    if (contract.maxTurns !== maxTurns) {
      return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: "budget-tier-max-turns-conflict" });
    }
    const lockPath = `${path}.binding.lock`;
    // A hook-level stub short-circuits the wait; otherwise parallel tool calls of this one agent wait (bounded) for the lock.
    const acquired = (options.acquireDispatchBudgetCounterLockFn ?? acquireDispatchBudgetCounterLockWithWait)(lockPath, options);
    if (acquired.status !== "acquired") {
      const reason = counterLockRefusalReason(acquired);
      return acquired.code === "counter-lock-timeout"
        ? counterLockTimeoutBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason })
        : invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason });
    }
    try {
      options.afterCounterLockAcquiredFn?.();
      if (existsSyncFn(path)) {
        counter = loadCounter(path, {}, options);
        baseCalls = counter.baseCalls;
      } else {
        const parent = (options.resolveParentDispatchToolUseIdFn ?? resolveParentDispatchToolUseId)(input, identity, options);
        if (parent.status !== "prepared") {
          return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: parent.code });
        }
        const pendingContext = { commonDir, toolUseId: parent.toolUseId, agentType: identity.agentType };
        const pending = (options.resolvePendingDispatchBudgetBindingFn ?? resolvePendingDispatchBudgetBinding)(pendingContext, options);
        if (pending.status !== "prepared") {
          return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: pending.code });
        }
        if (pending.binding.maxTurns !== maxTurns) {
          return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: "pending-binding-tier-conflict" });
        }
        baseCalls = pending.binding.baseCalls;
        const workingCap = Math.min(baseCalls, dispatchWorkingCap(maxTurns));
        const initialized = initializeBoundCounter(path, {
          agentId: identity.agentId, agentType: identity.agentType, maxTurns, baseCalls, workingCap,
        }, { ...pendingContext, binding: pending.binding }, options);
        if (initialized.status !== "prepared") {
          return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: initialized.code });
        }
        counter = initialized.counter;
      }
      return advanceCounter({ path, counter, identity, maxTurns, baseCalls, rootDir, input, nowFn, dependencies: options });
    } finally {
      (options.releaseDispatchBudgetCounterLockFn ?? releaseDispatchBudgetCounterLock)(acquired.lock, options);
    }
  }
  // Non-budgeted role: small-role lane when maxTurns leaves no working cap (see smallRolePolicyMaxTurns).
  const policyMaxTurns = smallRolePolicyMaxTurns(maxTurns) ?? maxTurns;
  if (policyMaxTurns !== maxTurns) baseCalls = maxTurns - CLOSING_ALLOWANCE;
  const workingCap = Math.min(baseCalls, dispatchWorkingCap(policyMaxTurns));
  counter ??= loadCounter(path, {
    agentId: identity.agentId, agentType: identity.agentType, maxTurns, baseCalls, workingCap,
  }, options);
  return advanceCounter({ path, counter, identity, maxTurns, baseCalls, rootDir, input, nowFn, dependencies: options, policyMaxTurns });
}

if (isDirectInvocation(import.meta.url)) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { raw += chunk; });
  process.stdin.on("end", () => {
    let input;
    try {
      input = JSON.parse(raw || "{}");
    } catch {
      process.exit(0); // malformed hook input is not this guard's decision to make -- fail open
      return;
    }
    const result = evaluateDispatchBudgetGuard(input);
    if (result.stderr) process.stderr.write(result.stderr);
    // Flush stdout before exiting: process.exit() can truncate a pending pipe write.
    if (result.stdout) process.stdout.write(result.stdout, () => process.exit(result.exitCode));
    else process.exit(result.exitCode);
  });
}

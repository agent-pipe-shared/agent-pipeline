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
 * read live from the selected agent definition and must match the preflighted
 * tier; CLOSING_ALLOWANCE and SAFETY_MARGIN come from the shared policy core:
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
 * ## Storage
 * Per-subagent counters persist as one JSON file each under
 * `<git-common-dir>/agent-pipeline/dispatch-budget/<agentId>.json` --
 * local, untracked runtime state, resolved via `git rev-parse
 * --path-format=absolute --git-common-dir`. Never a tracked path, never
 * `scratch/` (agent-writable -- a limited agent could erase its own
 * counter there, defeating the whole guard).
 * Every budget-bearing counter read/modify/write, including first binding, is
 * serialized by `<agentId>.json.binding.lock`. The owner record binds hostname,
 * Linux boot id, PID and `/proc` process start time; live or ambiguous owners
 * block, while a provably dead owner is reclaimed through a separate recovery
 * lock and inode/content readback. A pending dispatch whose child never makes
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
import { hostname } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

import { writeTargetPath } from "../lib/tool-write-target.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { consumePendingDispatchBudgetBinding, resolvePendingDispatchBudgetBinding } from "../lib/dispatch-budget-binding.mjs";
import { dispatchBudgetContractForRole } from "../lib/dispatch-policy.mjs";
import {
  CLOSING_ALLOWANCE,
  DENIAL_CODE,
  INVALID_INPUT_CODE,
  SAFETY_MARGIN,
  classifyDispatchBudgetCaller,
  decideDispatchBudgetCall,
  dispatchWorkingCap,
} from "../lib/dispatch-budget-core.mjs";

const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];
export { CLOSING_ALLOWANCE, DENIAL_CODE, INVALID_INPUT_CODE, SAFETY_MARGIN };
const DISPATCH_RECORD_PATTERN = /^evidence\/dispatch-record-.*\.json$/u;
const GIT_CLOSING_VERB_PATTERN = /^git\s+(add|commit)\b/u;

function verdict(exitCode, stderr = "") {
  return { exitCode, stderr };
}

function blocked({ agentId, agentType, maxTurns, baseCalls, workingCap, count }) {
  const remainingClosingCalls = Math.max(0, workingCap + CLOSING_ALLOWANCE - count);
  const continuation = remainingClosingCalls > 0
    ? `The working budget is exhausted; ${remainingClosingCalls} closing-call ${remainingClosingCalls === 1 ? "slot remains" : "slots remain"}.\n`
      + "Within that remaining allowance, only these acts are permitted: (1) write/update evidence/dispatch-record-*.json, (2) `git add` your own paths, (3) `git commit` your own paths.\n"
      + "Stop working and emit the closing report when finished.\n"
    : `The closing allowance of ${CLOSING_ALLOWANCE} tool calls is exhausted. No further tool calls are permitted for this dispatch.\n`
      + "Emit the closing report without another tool call.\n";
  return verdict(
    2,
    "BLOCKED (guard-dispatch-budget, plugin pipeline-core): "
      + `${DENIAL_CODE}: this dispatch (${agentType}, agent ${agentId}) has counted ${count} tool-call attempts against a working cap of ${workingCap} `
      + `(effective cap min(baseCalls=${baseCalls}, maxTurns=${maxTurns} minus the fixed ${CLOSING_ALLOWANCE}-closing + ${SAFETY_MARGIN}-safety reserve)).\n`
      + continuation,
  );
}

function invalidBudgetInputBlocked({ agentId, agentType, reason }) {
  return verdict(
    2,
    "BLOCKED (guard-dispatch-budget, plugin pipeline-core): "
      + `${INVALID_INPUT_CODE}: this dispatch (${agentType}, agent ${agentId}) has invalid budget state (${reason}).\n`
      + "The persisted counter was left unchanged; repair or remove it through the trusted host path before continuing.\n",
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

/**
 * Reads `maxTurns` live from `plugins/pipeline-core/agents/<name>.md`'s own
 * YAML frontmatter, where `<name>` is `agentType` with any `<host>:` prefix
 * stripped (e.g. `pipeline-core:goldfish-deep` -> `goldfish-deep`). Returns
 * null (never throws) when the agent definition cannot be found or its
 * `maxTurns` cannot be read as a positive integer.
 */
export function resolveMaxTurns(agentType, rootDir, dependencies = {}) {
  if (typeof agentType !== "string") return null;
  const name = agentType.includes(":") ? agentType.slice(agentType.indexOf(":") + 1) : agentType;
  if (!/^[a-zA-Z0-9_-]+$/u.test(name)) return null;
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const defPath = join(rootDir, "plugins", "pipeline-core", "agents", `${name}.md`);
  if (!existsSyncFn(defPath)) return null;
  let content;
  try {
    content = readFileSyncFn(defPath, "utf8");
  } catch {
    return null;
  }
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/u);
  const scope = frontmatterMatch ? frontmatterMatch[1] : content;
  const turnsMatch = scope.match(/^maxTurns:\s*(\d+)\s*$/mu);
  if (!turnsMatch) return null;
  const value = Number(turnsMatch[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * The exact permitted-after-cap shape set (DoD): a write/update of
 * `evidence/dispatch-record-*.json`, or a Bash call whose command begins
 * with `git add` / `git commit`. Ownership of the exact paths inside a
 * `git add`/`git commit` call is not something a PreToolUse payload lets
 * this guard verify; the other guards in the union (guard-git.mjs,
 * guard-testpath.mjs) already own that narrower question.
 */
function isClosingAct(input, rootDir) {
  const toolName = String(input?.tool_name ?? "");
  if (WRITE_TOOLS.includes(toolName)) {
    const filePath = writeTargetPath(input?.tool_input, toolName);
    if (filePath === "") return false;
    const rel = (isAbsolute(filePath) ? relative(rootDir, filePath) : filePath).replaceAll("\\", "/");
    return DISPATCH_RECORD_PATTERN.test(rel);
  }
  if (toolName === "Bash") {
    const command = input?.tool_input?.command ?? input?.tool_input?.CommandLine;
    if (typeof command !== "string") return false;
    return GIT_CLOSING_VERB_PATTERN.test(command.trim());
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

function localCounterLockOwner(dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  const hostnameFn = dependencies.hostnameFn ?? hostname;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  const pid = dependencies.pid ?? process.pid;
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
    || owner.platform !== "linux"
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
      } catch { return { status: "rejected", code: "counter-lock-recovery-raced" }; }
    } else return { status: "rejected", code: error?.message ?? "counter-lock-recovery-publish" };
  }
  const quarantine = `${path}.dead.${process.pid}-${randomUUID()}`;
  try {
    const current = readStableCounterLock(path, dependencies);
    if (!sameCounterLockIdentity(path, observed.identity, dependencies)
      || !current.identity.bytes.equals(observed.identity.bytes)
      || counterLockOwnerState(current, dependencies) !== "dead") return { status: "rejected", code: "counter-lock-changed" };
    renameSyncFn(path, quarantine);
    if (!sameCounterLockIdentity(quarantine, observed.identity, dependencies)) return { status: "rejected", code: "counter-lock-changed" };
    const lock = publishCounterLock(path, dependencies);
    unlinkSyncFn(quarantine);
    return { status: "acquired", lock, recovered: true };
  } catch { return { status: "rejected", code: "counter-lock-recovery-raced" }; }
  finally { releaseDispatchBudgetCounterLock(recovery, dependencies); }
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

function advanceCounter({ path, counter, identity, maxTurns, baseCalls, rootDir, input, nowFn, dependencies }) {
  const workingCap = Math.min(baseCalls, dispatchWorkingCap(maxTurns));
  const bindingMatches = counter.agentId === identity.agentId
    && counter.agentType === identity.agentType
    && counter.maxTurns === maxTurns
    && counter.baseCalls === baseCalls
    && counter.workingCap === workingCap;
  if (!bindingMatches) {
    return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: "counter-binding-mismatch" });
  }
  const preliminaryBudget = decideDispatchBudgetCall({ maxTurns, baseCalls, currentCount: counter.count, isClosingAct: false });
  if (preliminaryBudget.decision === "invalid-input") {
    return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: preliminaryBudget.reason });
  }
  const budget = preliminaryBudget.decision === "exhausted" && isClosingAct(input, rootDir)
    ? decideDispatchBudgetCall({ maxTurns, baseCalls, currentCount: counter.count, isClosingAct: true })
    : preliminaryBudget;
  counter.count = budget.nextCount;
  counter.updatedAt = nowFn();
  saveCounter(path, counter, dependencies);
  if (budget.allowed) return verdict(0);
  return blocked({
    agentId: identity.agentId, agentType: identity.agentType, maxTurns, baseCalls,
    workingCap: budget.workingCap, count: counter.count,
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

  if (identity.kind === "unresolved") {
    recordUnresolved(commonDir, {
      ...identity, branch: "unresolved-identity", root: rootDir, commonDir, transcriptPath: rawTranscriptPath, sessionId: input?.session_id, at: nowFn(),
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

  const contract = (options.dispatchBudgetContractForRoleFn ?? dispatchBudgetContractForRole)(identity.agentType);
  const path = counterPath(commonDir, identity.agentId);
  const existsSyncFn = options.existsSyncFn ?? existsSync;
  let baseCalls = dispatchWorkingCap(maxTurns);
  let counter;
  if (contract.applicable) {
    if (contract.maxTurns !== maxTurns) {
      return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: "budget-tier-max-turns-conflict" });
    }
    const lockPath = `${path}.binding.lock`;
    const acquired = (options.acquireDispatchBudgetCounterLockFn ?? acquireDispatchBudgetCounterLock)(lockPath, options);
    if (acquired.status !== "acquired") {
      return invalidBudgetInputBlocked({ agentId: identity.agentId, agentType: identity.agentType, reason: acquired.code });
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
  const workingCap = Math.min(baseCalls, dispatchWorkingCap(maxTurns));
  counter ??= loadCounter(path, {
    agentId: identity.agentId, agentType: identity.agentType, maxTurns, baseCalls, workingCap,
  }, options);
  return advanceCounter({ path, counter, identity, maxTurns, baseCalls, rootDir, input, nowFn, dependencies: options });
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
    process.exit(result.exitCode);
  });
}

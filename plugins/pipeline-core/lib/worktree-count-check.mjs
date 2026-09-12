#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Pre/post `git worktree list` count comparison around an
 * `isolation: "worktree"`-flagged dispatch (Agent tool or Workflow-embedded
 * `agent()`/`parallel()` call).
 *
 * WHY. `isolation: "worktree"` is currently pure prose discipline (CLAUDE.md's
 * Environment note, workflow-dispatch.md): the Elephant is told to run
 * `git worktree list` right after launching and treat an unchanged count as a
 * hard stop. Nothing mechanically checks that this happened, and nothing at
 * all detects the underlying defect this repo has already hit live
 * (2026-08-25, backlog
 * 2026-08-25-workflow-tool-isolation-worktree-never-created-a-worktree-this-session.md):
 * `isolation: "worktree"` requested and silently not granted, three parallel
 * dispatches racing the same shared checkout, one retry's self-heal step
 * detaching the Elephant's own live HEAD. "A rule agents keep violating needs
 * a guard, not another paragraph of prompt" (same item, 2026-08-29 note) is
 * the standing principle this module exists to serve for that specific rule.
 *
 * WHAT THIS MODULE IS. A standalone, dependency-injectable library of pure(ish)
 * functions: no hook wiring, no stdin/stdout/exit-code contract of its own.
 * It is written so a thin PreToolUse hook wrapper (mirroring
 * hooks/guard-dispatch.mjs + lib/dispatch-policy.mjs's split) can call
 * `registerWorktreeIsolationLaunch` on a Task|Agent|Workflow tool call and
 * `resolveWorktreeIsolationLaunch` on every subsequent tool call in the same
 * orchestrator transcript, without this module itself needing hooks.json
 * wiring (hooks.json is TP-4 protected; wiring it in is a separate ceremony).
 *
 * DESIGN, IN ONE PASS.
 *   1. On a dispatch-tool PreToolUse event, `countWorktreeIsolatedDispatches`
 *      inspects the raw tool_input for `isolation: "worktree"` -- a top-level
 *      field on a direct Agent/Task call, or a same-object field on one or
 *      more `agent()`/`parallel()` calls embedded in a Workflow `script`
 *      string (regex-windowed, same static-extraction posture as
 *      guard-dispatch.mjs's own `extractWorkflowDispatches`: it only claims
 *      the statically-obvious case and is fail-open on anything dynamic).
 *   2. If that count is > 0, `registerWorktreeIsolationLaunch` records a
 *      baseline: the CURRENT `git worktree list` count, plus how many
 *      isolated dispatches were declared, keyed to the orchestrating
 *      session's own transcript (never the dispatched subagent's -- this
 *      check runs entirely in the orchestrator's PreToolUse stream, because
 *      a dispatched goldfish/critic has no access to the Agent/Workflow tool
 *      at all, see workflow-dispatch.md's "Only the Elephant orchestrates").
 *   3. On the NEXT PreToolUse event in that same transcript -- any tool,
 *      including the following dispatch call if the Elephant fires two in a
 *      row with no intervening tool use -- `resolveWorktreeIsolationLaunch`
 *      reads the pending baseline and compares
 *      the worktree count observed AT THAT MOMENT against it. Because
 *      PreToolUse fires before the CURRENT tool executes, this moment's count
 *      is exactly the count as it stood right after the PRIOR tool (the
 *      dispatch) actually finished -- the "post-launch" observation the
 *      backlog item's Predicate note asks for, without needing a PostToolUse
 *      hook (this repository has never wired one; see NVA-W7-WORKTREECOUNT's
 *      dispatch record for the confirmation that PostToolUse/SubagentStop
 *      appear nowhere in this codebase today).
 *   4. Resolution atomically publishes and reads back a sanitized terminal
 *      verdict in the same git-common worktree-count-check lane before it
 *      removes the pending baseline. A raw pending file masks older success,
 *      including when malformed; persistence failure retains that pending
 *      marker and can never manufacture a current success receipt.
 *
 * HONEST LIMITS.
 *   - This is a COUNT delta, not a per-dispatch identity check. It cannot
 *     confirm that the increase it observes is THIS dispatch's own worktree
 *     specifically (that is the separate, already-shipped containment check:
 *     compare `git rev-parse --show-toplevel` against the briefed expected
 *     worktree path, CLAUDE.md's Environment note / workflow-dispatch.md).
 *     A worktree added or removed by unrelated activity in the same window
 *     can produce a false "isolated" or a false "not-isolated" reading. This
 *     is the same trade the backlog item's own Predicate note accepts: "an
 *     unchanged count is the observable signal that isolation was not
 *     granted" -- a coarse but real signal, not a proof.
 *   - Only ONE baseline is tracked per orchestrator transcript at a time (a
 *     single pending-baseline slot, consumed by the next tool call). A
 *     `parallel()` Workflow call that embeds several `isolation: "worktree"`
 *     `agent()` calls in ONE PreToolUse event is still handled correctly --
 *     `expectedDispatchCount` records how many were declared in that single
 *     event, and the delta is compared against it (see
 *     `evaluateWorktreeCountDelta`) -- but two SEPARATE dispatch-tool calls
 *     fired back-to-back with no intervening tool use will have the first
 *     one's baseline resolved (against whatever the count is right before the
 *     second call fires) before the second one's baseline is registered; see
 *     `evaluateWorktreeCountCheckEvent`'s resolve-then-register ordering.
 *   - Fail-open throughout, matching every other guard in this plugin: an
 *     unreadable `git worktree list`, a missing/malformed baseline file, or
 *     an unresolvable `commonDir` all return `null`/`{ verdict: "unobservable" }`
 *     rather than throwing. A broken check must never become a work stoppage,
 *     and this check is advisory (surfaces a mismatch), never a hard block --
 *     it cannot un-launch a dispatch that already ran.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import { parseWorktreePorcelain } from "./worktree-lifecycle.mjs";

export const WORKTREE_COUNT_CHECK_SCHEMA = "pipeline.worktree-count-check.v1";
export const WORKTREE_COUNT_VERDICT_SCHEMA = "pipeline.worktree-count-verdict.v1";

const DISPATCH_KEY = /^[a-f0-9]{32}$/u;
const RECEIPT_DIGEST = /^[a-f0-9]{64}$/u;
const TERMINAL_VERDICTS = new Set(["isolated", "not-isolated", "partial", "unobservable"]);

// ---------------------------------------------------------------------------
// Step 1: how many isolation:"worktree" dispatches does this tool_input declare?
// ---------------------------------------------------------------------------

const WORKFLOW_AGENT_TYPE_RE = /agentType\s*:\s*(['"])((?:(?!\1)[\s\S])*?)\1/g;
const WORKFLOW_ISOLATION_WORKTREE_RE = /isolation\s*:\s*(['"])worktree\1/;
const WORKFLOW_WINDOW_RADIUS = 500;

/**
 * Regex-windowed count of `agent()`/`parallel()` calls inside a Workflow
 * `script` string body that carry `isolation: "worktree"` in the same
 * object literal. Deliberately the same posture as guard-dispatch.mjs's
 * `extractWorkflowDispatches`: a static heuristic that claims only the
 * obvious case (an `agentType` field with an `isolation: 'worktree'` field
 * within +/-500 chars of it), never a JS parser, fail-open (undercounts,
 * never overcounts) on anything ambiguous.
 */
function countWorktreeIsolatedDispatchesInScript(script) {
  if (typeof script !== "string" || script === "") return 0;
  let count = 0;
  let match;
  WORKFLOW_AGENT_TYPE_RE.lastIndex = 0;
  while ((match = WORKFLOW_AGENT_TYPE_RE.exec(script)) !== null) {
    const windowStart = Math.max(0, match.index - WORKFLOW_WINDOW_RADIUS);
    const windowEnd = Math.min(script.length, WORKFLOW_AGENT_TYPE_RE.lastIndex + WORKFLOW_WINDOW_RADIUS);
    const window = script.slice(windowStart, windowEnd);
    if (WORKFLOW_ISOLATION_WORKTREE_RE.test(window)) count += 1;
  }
  return count;
}

/**
 * How many isolation:"worktree" dispatches this ONE PreToolUse tool_input
 * declares -- 0 or 1 for a direct Agent/Task call, 0..N for a Workflow call.
 * Both `subagent_type` and the camelCase `subagentType` spelling are accepted
 * for the direct-call case, matching guard-dispatch.mjs's own handling of the
 * runtime-name split.
 */
export function countWorktreeIsolatedDispatches(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return 0;
  const subagentType = toolInput.subagent_type ?? toolInput.subagentType;
  const isDirectDispatch = typeof subagentType === "string" && subagentType !== "";
  if (isDirectDispatch) {
    return toolInput.isolation === "worktree" ? 1 : 0;
  }
  if (typeof toolInput.script === "string" && toolInput.script !== "") {
    return countWorktreeIsolatedDispatchesInScript(toolInput.script);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Step 2: how many worktrees actually exist right now?
// ---------------------------------------------------------------------------

/**
 * Live `git worktree list` count at `startPath`. Reuses
 * `parseWorktreePorcelain` from worktree-lifecycle.mjs (the existing,
 * already-tested porcelain parser) rather than re-deriving worktree-count
 * parsing a second time; deliberately does NOT reuse that module's heavier
 * `discoverRepository` (physical-path/symlink assertions meant for the
 * lifecycle module's mutation-safety guarantees, not needed for a read-only
 * advisory count and would turn an ordinary git-not-available or
 * not-a-repo condition into a thrown error instead of a fail-open `ok:
 * false`).
 */
export function countLiveWorktrees(startPath, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  let result;
  try {
    result = spawn("git", ["worktree", "list", "--porcelain", "-z"], {
      cwd: startPath,
      encoding: "utf8",
    });
  } catch (error) {
    return { ok: false, count: null, error: error?.message ?? String(error) };
  }
  if (!result || result.error || result.status !== 0) {
    const detail = result?.error?.message ?? (String(result?.stderr || "").trim() || "git worktree list failed");
    return { ok: false, count: null, error: detail };
  }
  try {
    const records = parseWorktreePorcelain(result.stdout);
    return { ok: true, count: records.length };
  } catch (error) {
    return { ok: false, count: null, error: error?.message ?? String(error) };
  }
}

// ---------------------------------------------------------------------------
// Baseline persistence -- one pending record per orchestrator transcript.
// ---------------------------------------------------------------------------

/**
 * Stable, filename-safe key for the orchestrator's own transcript, so a
 * baseline recorded at launch time and resolved at the next tool call can
 * find each other without carrying any transcript content into the key.
 * Returns null for anything that is not a non-empty string -- the caller
 * treats that as "nothing to key this check on" and skips it (fail open).
 */
export function dispatchKeyForTranscript(transcriptPath) {
  if (typeof transcriptPath !== "string" || transcriptPath.trim() === "") return null;
  return createHash("sha256").update(transcriptPath).digest("hex").slice(0, 32);
}

function baselinePath(commonDir, dispatchKey) {
  return join(commonDir, "agent-pipeline", "worktree-count-checks", `${dispatchKey}.json`);
}

function verdictPath(commonDir, dispatchKey) {
  return join(commonDir, "agent-pipeline", "worktree-count-checks", `${dispatchKey}.verdict.json`);
}

/** Atomic, mode-0600 write -- write-temp-then-rename, matching this plugin's other local-state writers. */
function writeBaselineAtomic(path, record) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const temporary = `${path}.${process.pid}.${Math.random().toString(16).slice(2, 8)}.tmp`;
  writeFileSync(temporary, bytes, { mode: 0o600 });
  renameSync(temporary, path);
}

function receiptDigest(record) {
  const unsigned = { ...record };
  delete unsigned.receiptSha256;
  return createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
}

function validIsoInstant(value) {
  if (typeof value !== "string" || value.length !== 24) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validCount(value, nullable = false) {
  return (nullable && value === null) || (Number.isSafeInteger(value) && value >= 0);
}

function validVerdictRelation(record) {
  if (record.verdict === "unobservable") return record.currentCount === null && record.delta === null;
  if (!validCount(record.currentCount) || !Number.isSafeInteger(record.delta)) return false;
  if (record.delta !== record.currentCount - record.baselineCount) return false;
  if (record.verdict === "not-isolated") return record.delta <= 0;
  if (record.verdict === "partial") return record.delta > 0 && record.delta < record.expectedDispatchCount;
  return record.delta >= record.expectedDispatchCount && record.expectedDispatchCount > 0;
}

/**
 * Validate one terminal observation. The receipt contains counts, timestamps and
 * a transcript-derived digest only; repository, transcript and host paths are
 * never persisted.
 */
export function validateWorktreeCountVerdict(record, expectedDispatchKey = null) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  if (Object.keys(record).sort().join("\0") !== [
    "schema", "status", "dispatchKey", "baselineCount", "expectedDispatchCount",
    "currentCount", "delta", "verdict", "recordedAt", "resolvedAt", "receiptSha256",
  ].sort().join("\0")) return false;
  if (record.schema !== WORKTREE_COUNT_VERDICT_SCHEMA || record.status !== "terminal") return false;
  if (!DISPATCH_KEY.test(record.dispatchKey) || (expectedDispatchKey !== null && record.dispatchKey !== expectedDispatchKey)) return false;
  if (!validCount(record.baselineCount) || !validCount(record.expectedDispatchCount) || record.expectedDispatchCount < 1) return false;
  if (!TERMINAL_VERDICTS.has(record.verdict) || !validVerdictRelation(record)) return false;
  if (!validIsoInstant(record.recordedAt) || !validIsoInstant(record.resolvedAt)) return false;
  if (Date.parse(record.resolvedAt) < Date.parse(record.recordedAt)) return false;
  return RECEIPT_DIGEST.test(record.receiptSha256) && receiptDigest(record) === record.receiptSha256;
}

/** Read the latest durable terminal verdict for one orchestrator transcript. */
export function readWorktreeCountVerdict({ commonDir, dispatchKey }) {
  if (typeof commonDir !== "string" || commonDir === "" || !DISPATCH_KEY.test(dispatchKey)) return null;
  // A pending baseline is newer authority than the preceding terminal receipt.
  // Check raw existence rather than successful parsing: a malformed pending
  // file must also mask old success instead of making it authoritative again.
  if (existsSync(baselinePath(commonDir, dispatchKey))) return null;
  const path = verdictPath(commonDir, dispatchKey);
  if (!existsSync(path)) return null;
  try {
    const record = JSON.parse(readFileSync(path, "utf8"));
    return validateWorktreeCountVerdict(record, dispatchKey) ? record : null;
  } catch {
    return null;
  }
}

export function clearWorktreeCountVerdict({ commonDir, dispatchKey }) {
  if (typeof commonDir !== "string" || commonDir === "" || !DISPATCH_KEY.test(dispatchKey)) return;
  try {
    unlinkSync(verdictPath(commonDir, dispatchKey));
  } catch {
    // Missing or already consumed terminal evidence is not an error.
  }
}

/**
 * Atomically publish and read back one bounded terminal verdict. A write or
 * readback failure returns null, so callers cannot turn absent evidence into a
 * successful isolation claim.
 */
export function recordWorktreeCountVerdict({
  commonDir,
  dispatchKey,
  baselineCount,
  expectedDispatchCount,
  currentCount,
  delta,
  verdict,
  recordedAt,
  resolvedAt = new Date(),
}) {
  let resolvedAtIso;
  try {
    resolvedAtIso = resolvedAt.toISOString();
  } catch {
    return null;
  }
  const unsigned = {
    schema: WORKTREE_COUNT_VERDICT_SCHEMA,
    status: "terminal",
    dispatchKey,
    baselineCount,
    expectedDispatchCount,
    currentCount,
    delta,
    verdict,
    recordedAt,
    resolvedAt: resolvedAtIso,
  };
  const record = { ...unsigned, receiptSha256: receiptDigest(unsigned) };
  if (!validateWorktreeCountVerdict(record, dispatchKey)) return null;
  try {
    writeBaselineAtomic(verdictPath(commonDir, dispatchKey), record);
  } catch {
    return null;
  }
  let readback;
  try {
    const candidate = JSON.parse(readFileSync(verdictPath(commonDir, dispatchKey), "utf8"));
    readback = validateWorktreeCountVerdict(candidate, dispatchKey) ? candidate : null;
  } catch {
    readback = null;
  }
  return readback && readback.receiptSha256 === record.receiptSha256 ? readback : null;
}

export function recordWorktreeCountBaseline({ commonDir, dispatchKey, baselineCount, expectedDispatchCount, now = new Date() }) {
  const path = baselinePath(commonDir, dispatchKey);
  const record = {
    schema: WORKTREE_COUNT_CHECK_SCHEMA,
    dispatchKey,
    baselineCount,
    expectedDispatchCount,
    recordedAt: now.toISOString(),
  };
  writeBaselineAtomic(path, record);
  return record;
}

/** Returns null on anything missing, unreadable or shaped wrong -- fail open, never throws. */
export function readWorktreeCountBaseline({ commonDir, dispatchKey }) {
  const path = baselinePath(commonDir, dispatchKey);
  if (!existsSync(path)) return null;
  let record;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  const valid = record && typeof record === "object"
    && record.schema === WORKTREE_COUNT_CHECK_SCHEMA
    && record.dispatchKey === dispatchKey
    && Number.isInteger(record.baselineCount) && record.baselineCount >= 0
    && Number.isInteger(record.expectedDispatchCount) && record.expectedDispatchCount >= 0;
  return valid ? record : null;
}

/** Single-shot consumption: a baseline is deleted the moment it is read for resolution. */
export function clearWorktreeCountBaseline({ commonDir, dispatchKey }) {
  const path = baselinePath(commonDir, dispatchKey);
  try {
    unlinkSync(path);
  } catch {
    // Already gone (or never existed) -- nothing to clean up.
  }
}

// ---------------------------------------------------------------------------
// Step 3: baseline vs. current count -> verdict.
// ---------------------------------------------------------------------------

/**
 * `delta <= 0` (count unchanged or shrank) is exactly the "not isolated"
 * signal the backlog item's Predicate note names as the honest candidate.
 * `expectedDispatchCount` lets a `parallel()` round that declared several
 * isolated dispatches in one Workflow call distinguish "none of them got a
 * worktree" from "some but not all did" -- both are real signals worth
 * keeping apart, since a partial failure is a different debugging story
 * than a total one.
 */
export function evaluateWorktreeCountDelta({ baselineCount, expectedDispatchCount, currentCount }) {
  const delta = currentCount - baselineCount;
  if (delta <= 0) return { verdict: "not-isolated", delta };
  if (expectedDispatchCount > 0 && delta < expectedDispatchCount) return { verdict: "partial", delta };
  return { verdict: "isolated", delta };
}

// ---------------------------------------------------------------------------
// The two hook-shaped entry points.
// ---------------------------------------------------------------------------

/**
 * Call on a PreToolUse event for the dispatch tool itself (Task|Agent|Workflow).
 * Records a fresh baseline if -- and only if -- this call declares at least
 * one isolation:"worktree" dispatch. Returns null (nothing recorded) when it
 * does not, or when the live worktree count cannot be observed. NEVER blocks
 * or influences whether the dispatch launches -- this is bookkeeping only,
 * always called with the intent to allow the tool call through regardless of
 * its return value.
 */
export function registerWorktreeIsolationLaunch({ toolInput, commonDir, dispatchKey, countLiveWorktrees: countFn = countLiveWorktrees, startPath, now }) {
  if (!commonDir || !dispatchKey) return null;
  const expectedDispatchCount = countWorktreeIsolatedDispatches(toolInput);
  if (expectedDispatchCount === 0) return null;
  const live = countFn(startPath);
  if (!live.ok) return null;
  const baseline = recordWorktreeCountBaseline({ commonDir, dispatchKey, baselineCount: live.count, expectedDispatchCount, now });
  // Baseline first, then old verdict: at every observable point the new pending
  // launch either masks or has removed the preceding terminal success.
  clearWorktreeCountVerdict({ commonDir, dispatchKey });
  return baseline;
}

/**
 * Call on ANY PreToolUse event in the same orchestrator transcript (including
 * the next dispatch call, if the Elephant fires two dispatches back-to-back
 * with no intervening tool use -- see `evaluateWorktreeCountCheckEvent` for
 * the ordering that makes that safe). Resolves any pending baseline for
 * `dispatchKey` and removes it only after terminal receipt readback succeeds;
 * returns null when there was nothing pending.
 */
export function resolveWorktreeIsolationLaunch({
  commonDir,
  dispatchKey,
  countLiveWorktrees: countFn = countLiveWorktrees,
  recordWorktreeCountVerdict: recordVerdict = recordWorktreeCountVerdict,
  startPath,
  now = new Date(),
}) {
  if (!commonDir || !dispatchKey) return null;
  const baseline = readWorktreeCountBaseline({ commonDir, dispatchKey });
  if (!baseline) return null;
  const live = countFn(startPath);
  if (!live.ok) {
    const receipt = recordVerdict({
      commonDir, dispatchKey,
      baselineCount: baseline.baselineCount,
      expectedDispatchCount: baseline.expectedDispatchCount,
      currentCount: null,
      delta: null,
      verdict: "unobservable",
      recordedAt: baseline.recordedAt,
      resolvedAt: now,
    });
    if (receipt !== null) clearWorktreeCountBaseline({ commonDir, dispatchKey });
    return { ...baseline, currentCount: null, delta: null, verdict: "unobservable", receipt };
  }
  const { verdict, delta } = evaluateWorktreeCountDelta({
    baselineCount: baseline.baselineCount,
    expectedDispatchCount: baseline.expectedDispatchCount,
    currentCount: live.count,
  });
  const receipt = recordVerdict({
    commonDir, dispatchKey,
    baselineCount: baseline.baselineCount,
    expectedDispatchCount: baseline.expectedDispatchCount,
    currentCount: live.count,
    delta,
    verdict,
    recordedAt: baseline.recordedAt,
    resolvedAt: now,
  });
  if (receipt !== null) clearWorktreeCountBaseline({ commonDir, dispatchKey });
  if (receipt === null && verdict === "isolated") {
    return { ...baseline, currentCount: live.count, delta, verdict: "unobservable", observedVerdict: verdict, receipt: null };
  }
  return { ...baseline, currentCount: live.count, verdict, delta, receipt };
}

/**
 * Combined, single-pass entry point matching the shape a future PreToolUse
 * hook wrapper would call once per event: resolve any older pending baseline
 * FIRST (against the count as it stands right now, i.e. right after whatever
 * tool ran previously), THEN register a new baseline if THIS event is itself
 * a fresh isolation:"worktree" dispatch. This ordering is what makes two
 * back-to-back dispatch calls with no intervening tool use resolve correctly
 * instead of the second call's registration silently overwriting the first
 * call's still-pending baseline.
 *
 * `transcriptPath` is the ORCHESTRATOR's own transcript (the session doing
 * the dispatching), never the dispatched subagent's -- see this module's
 * top-of-file DESIGN note for why that is the correct scope.
 */
export function evaluateWorktreeCountCheckEvent({ toolInput, transcriptPath, commonDir, startPath, countLiveWorktrees: countFn = countLiveWorktrees, now }) {
  const dispatchKey = dispatchKeyForTranscript(transcriptPath);
  if (!dispatchKey || !commonDir) return { resolved: null, registered: null };
  const resolved = resolveWorktreeIsolationLaunch({ commonDir, dispatchKey, countLiveWorktrees: countFn, startPath, now });
  const registered = registerWorktreeIsolationLaunch({ toolInput, commonDir, dispatchKey, countLiveWorktrees: countFn, startPath, now });
  return { resolved, registered };
}

/** Human-readable warning line for a hook to write to stderr on a mismatch. */
export function formatWorktreeIsolationMismatch(resolved) {
  if (!resolved) return "";
  if (resolved.verdict === "not-isolated") {
    return [
      "WORKTREE-ISOLATION-MISMATCH (worktree-count-check, plugin pipeline-core):",
      `a dispatch declared isolation: "worktree" but the live worktree count did`,
      `not increase (baseline ${resolved.baselineCount}, observed ${resolved.currentCount}).`,
      "This is the exact signal for the 2026-08-25 incident (backlog",
      "2026-08-25-workflow-tool-isolation-worktree-never-created-a-worktree-this-session.md):",
      "isolation was requested and was not granted. Treat this as a hard stop for",
      "launching further isolation: \"worktree\" dispatches this session -- serialize",
      "remaining work through the shared tree instead, per",
      "plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md.",
    ].join("\n");
  }
  if (resolved.verdict === "partial") {
    return [
      "WORKTREE-ISOLATION-PARTIAL (worktree-count-check, plugin pipeline-core):",
      `a Workflow call declared ${resolved.expectedDispatchCount} isolation: "worktree"`,
      `dispatches but the worktree count only increased by ${resolved.delta}`,
      `(baseline ${resolved.baselineCount}, observed ${resolved.currentCount}). At least one`,
      "of those dispatches likely landed in the shared checkout instead of its own",
      "worktree -- verify with git worktree list before trusting any of that round's results.",
    ].join("\n");
  }
  return "";
}

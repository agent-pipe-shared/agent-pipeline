#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-slicing.mjs -- NVA-B-SLICINGBUILD-2: the slicing-nudge mechanism from
 * `docs/adr/0080-parallel-dispatch-slicing-enforcement.md` (increment 1).
 * A `PreToolUse` hook, orchestrator-only, that delivers a non-blocking
 * default-to-parallel nudge through `hookSpecificOutput.additionalContext`
 * (confirmed empirically, on this runner, to reach the model on a
 * `PreToolUse` exit-0 response -- see the ADR's addendum) and records one
 * line per evaluated call to a machine-readable ledger.
 *
 * CORRECTED NVA-B-SLICINGFANOUT-1 (2026-09-06): the ledger's `fanout` field
 * was permanently `false` for every `Task`/`Agent` call under the
 * not-yet-written transcript timing, and even under the already-written
 * timing could only ever be `true` for the LAST-processed sibling of a
 * fan-out pair, never the first -- see the "LEDGER `fanout` FIELD" note
 * below `evaluateTriggerA` for the fix and its two disclosed residuals. The
 * run reset itself (`classifyGroup`/`computeTrailingSingleRun`) was already
 * correct and is untouched by this fix.
 *
 * NOT WIRED into `hooks.json` by this dispatch -- that file is TP-4 and on
 * `NEVER_LIFTABLE_KERNEL_PATHS`; wiring it is an attended PO operator-tool
 * run outside any session, the same route `guard-dispatch-budget.mjs`'s own
 * header names. Built and unit-tested only, exactly like
 * `guard-dispatch-budget.mjs` before its own wiring dispatch.
 *
 * NEVER BLOCKING. Every path returns exit 0. This mechanism is a delivered
 * default, not a gate -- Decision 5 of the ADR explicitly rejects a hard
 * block, on three independent grounds (the guard cannot prove a batch was
 * slice-able; EL-16 makes a dispatch block a block on all execution work;
 * the 2026-08-07 incident record shows what a *wrong* push toward parallel
 * costs). Nothing here ever returns a non-zero exit or a `deny` verdict.
 *
 * FAIL-OPEN ON ANYTHING UNPARSEABLE, matching every sibling guard's posture.
 * `evaluateSlicingGuard` is wrapped in a top-level try/catch that reduces any
 * unexpected exception to a silent allow -- a slicing nudge is never worth
 * denying, or even visibly failing, a tool call over.
 *
 * TWO TRIGGERS (ADR Decision 4), each fired at most once per run/batch,
 * sharing ONE threshold constant (`SLICING_THRESHOLD`, currently 3 -- PSP-0's
 * N; corrected 2026-09-06 from
 * an earlier "2nd" that contradicted PSP-0's "N=2 is permitted but never
 * nudged for"). No second threshold and no timestamp window are introduced
 * anywhere in this file -- the ADR's "Open parameter" section measured a
 * timestamp window directly and found the same-turn/cross-turn populations
 * overlap (6.2-36.8s vs. 13.6s+), so no width could ever separate them.
 *
 * - Trigger A (retrospective backstop): after three COMPLETED consecutive
 *   turns that each contained exactly one dispatch call (`Task`/`Agent`),
 *   with no intervening fan-out, the nudge fires on the NEXT dispatch call
 *   (`Task`, `Agent`, or `Workflow`). This is field 1 of the briefing's exact
 *   wording, and it differs from a literal reading of the ADR's Decision 4
 *   text ("the 3rd consecutive single-dispatch call ... fires"), which would
 *   fire ON the 3rd call itself rather than on the call after it -- reported
 *   as a briefing-vs-ADR difference rather than silently resolved (dispatch
 *   NVA-B-SLICINGBUILD-2's closing report). Field 1 is authoritative and is
 *   what this file implements: the run is computed from history EXCLUDING
 *   the in-flight call (which may itself still grow into a fan-out later in
 *   the same turn), so the 3rd single can only be counted once it is a
 *   COMPLETED, already-recorded turn -- which is necessarily one call later
 *   than the call that produced it. Fires on EXACT equality with
 *   `SLICING_THRESHOLD`, never `>=` -- ADR Decision 4: "Fires once per run;
 *   any recognized fan-out resets the run" and "A nudge on every dispatch
 *   becomes ambient noise." Since the run length is recomputed fresh from
 *   history on every call and grows by exactly one between consecutive
 *   non-resetting calls, exact equality crosses the threshold exactly once
 *   per run with no separate rate-limit state needed (see the comment at the
 *   comparison itself for the one accepted cold-start edge case).
 * - Trigger B (prospective): a `TodoWrite` call whose `tool_input.todos`
 *   array (Claude Code's documented shape -- `{content, status, activeForm}`
 *   per item; no repository precedent for this shape was found to check
 *   against, so this is read from general tool-schema knowledge and
 *   defensively: a malformed or absent `todos` array is treated as zero
 *   pending, never thrown on) has >= `SLICING_THRESHOLD` items whose
 *   `status === "pending"`. Rate-limited per batch hash -- computed from the
 *   sorted set of pending item texts -- by scanning this SESSION's own
 *   ledger file for a prior `event: "todo-plan"` record carrying the same
 *   `batchHash` and `advisoryEmitted: true`. One batch never nudges twice.
 *
 * FAN-OUT RECOGNITION (resets trigger A's run). Three recognizers, per the
 * ADR's Decision 3/4, the briefing's restatement, and NVA-B-SLICINGRUNNER-1
 * (runner neutrality, ADR-0051):
 * - `Task`/`Agent`: dispatch `tool_use` blocks in the transcript are grouped
 *   by their row's `message.id` (an IDENTITY match, not a timestamp window --
 *   the ADR measured that a window cannot separate same-turn from cross-turn
 *   gaps at all). A message carrying >= 2 such blocks is a fan-out.
 * - `Workflow`: a `Workflow` tool_use block ALWAYS resets the run, regardless
 *   of what `extractWorkflowDispatches()` recovers from its script (0, 1, or
 *   more) -- `extractWorkflowDispatches()` is regex-based and deliberately
 *   under-recovers `${...}`-interpolated prompts, so a low recovered count is
 *   not evidence of a small fan-out. The classifier below never consults the
 *   recovered count for the reset decision; it is used ONLY as an additional
 *   `workflowRecoveredCount` field on the ledger record, exactly the "you may
 *   call it for the ledger record" carve-out in the briefing.
 * - `invoke_subagent` (the Antigravity runner's native dispatch tool): its
 *   `tool_input.Subagents` array carries the fan-out width directly, with no
 *   transcript grouping, no timing, and no in-flight ambiguity -- structurally
 *   simpler than `Task`/`Agent`. >= 2 entries recovered by the exported
 *   `extractAntigravityDispatches()` (guard-dispatch.mjs, never a second local
 *   copy of that parsing) is a fan-out, recognized unconditionally from THIS
 *   call's own shape alone, exactly like `Workflow` above -- never from
 *   transcript history. Codex has no dispatch/subagent tool at all in this
 *   Claude-compatible guard surface, so it needs no recognizer here. Codex
 *   native dispatch/lifecycle observations are handled separately by
 *   `codex-slicing-hint.mjs`; keeping that native channel out of this safety
 *   adapter preserves the supported-tool set and every existing decision.
 *
 * IN-FLIGHT-TURN EXCLUSION (the correctness crux). The transcript's LATEST
 * `message.id` group may be the turn currently producing THIS hook's own
 * PreToolUse call, which has one dispatch call recorded so far and may still
 * grow into a fan-out later in the same turn. Counting it as "single" would
 * be exactly the false positive this mechanism must not create. It is
 * excluded by IDENTITY, not timing: if the latest group contains a block
 * whose `name`/`input` match this invocation's own `tool_name`/`tool_input`
 * (compared via a canonical-JSON sha256 hash, `sha256Hex()` below -- the
 * same sorted-key-stringify pattern `lib/human-guard-override.mjs` uses,
 * reimplemented locally because it is not exported there), that group is
 * dropped from the run computation entirely. This holds under either
 * transcript write-timing per the ADR's own caveat -- no timing probe is
 * needed, and none is implemented. NOTE: this exclusion feeds the RUN LENGTH
 * only (`computeTrailingSingleRun`), never the ledger's `fanout` field --
 * see the next section.
 *
 * LEDGER `fanout` FIELD (CORRECTED NVA-B-SLICINGFANOUT-1). `fanout` is
 * `true` for a `Workflow` call by tool name alone (unconditional, per the
 * ADR), and otherwise derived from `classifyGroup` on the LAST group of
 * `excludeInFlightGroup`'s returned `groups` -- i.e. the last COMPLETED
 * group, after the in-flight group (if matched) has been dropped -- NOT from
 * `inFlightSiblingCount`. The prior expression (`inFlightSiblingCount >= 2`)
 * was permanently `false` for every `Task`/`Agent` call under the
 * not-yet-written timing (a sibling that has not yet been transcribed cannot
 * be matched by identity), and even under the already-written timing was
 * only ever `true` for the LAST-processed sibling of a fan-out pair -- the
 * first sibling's own group cannot yet contain a block that has not been
 * decided. The ADR (the "Open parameter" resolution) already establishes
 * that fan-out recognition is retrospective by design and must not require
 * the in-flight call to be visible; classifying the last COMPLETED group
 * honors that under both timings uniformly, at the cost of two disclosed
 * trade-offs rather than silently accepting the old zero-signal:
 * - The fan-out is recognized on the FIRST ORDINARY dispatch call that
 *   follows a completed `Task`/`Agent` fan-out, not on the fan-out's own
 *   constituent calls (which, per the paragraph above, cannot see each other
 *   reliably under both timings). That following call's own `tool`/
 *   `agentType` land on the ledger record, not the fan-out's. `Workflow`
 *   does not share this asymmetry -- it self-records immediately, by name.
 * - Under the not-yet-written timing, a fan-out of 3 or more siblings can be
 *   recognized TWICE: once on its own last sibling (which, by then, sees the
 *   OTHER N-1 >= 2 siblings already committed) and again on the very next
 *   ordinary call (which still sees that same completed group as the last
 *   one). This is a bounded over-count, not an unbounded one, and fixing it
 *   needs a group-identity field on the ledger record to tell "the same
 *   fan-out, seen twice" apart from "two separate fan-outs" -- out of scope
 *   here: `pipeline.dispatch-slicing-ledger.v1`'s shape is the ADR's, not
 *   this file's, to extend.
 *
 * LEDGER. One JSON line per evaluated orchestrator call, appended to
 * `.git/agent-pipeline/dispatch-slicing/<session-id>.jsonl` (git-common-dir
 * resolved via the SAME `resolveGitCommonDir()` this file imports from
 * `guard-dispatch-budget.mjs`, never a second implementation). This location
 * is already confirmed admitted by ADR-0063's "Plugin-owned private runtime
 * state" row (checked by dispatch NVA-B-SLICINGBUILD-1; not re-litigated
 * here). The ledger doubles as trigger B's own rate-limit state -- no
 * separate "seen batches" file is kept. A ledger write is best-effort: it
 * never affects the exit code, and a `commonDir === null` (unresolvable git
 * common dir) skips the write silently, exactly like `guard-dispatch-budget.mjs`'s
 * own posture for its own unresolved-root branches.
 *
 * ORCHESTRATOR-ONLY, ALWAYS. Uses the exported `subagentIdentity()` from
 * `guard-dispatch-budget.mjs` as the ONLY discriminator (per the briefing:
 * "do not invent a second one"). Any non-`"orchestrator"` identity kind
 * (`subagent`, `unresolved`, `invalid-identity`) short-circuits to a silent
 * allow with no ledger write and no nudge, before either trigger is even
 * inspected.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { resolveGitCommonDir, subagentIdentity } from "./guard-dispatch-budget.mjs";
import { extractAntigravityDispatches, extractWorkflowDispatches } from "./guard-dispatch.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

// PSP-0's N, and the single threshold this file uses everywhere a count is
// compared. Both triggers read this SAME constant -- never a second, locally
// tuned number. See the header for why (briefing field 1; ADR Decision 4).
export const SLICING_THRESHOLD = 3;

export const NUDGE_CHANNEL = "PreToolUse.additionalContext";

const TASK_AGENT_TOOL_NAMES = new Set(["Task", "Agent"]);
const WORKFLOW_TOOL_NAME = "Workflow";
export const DISPATCH_TOOL_NAMES = new Set([...TASK_AGENT_TOOL_NAMES, WORKFLOW_TOOL_NAME]);

// The Antigravity runner's native subagent-dispatch tool (NVA-B-SLICINGRUNNER-1). Deliberately
// NOT added to `DISPATCH_TOOL_NAMES` above -- that set is asserted elsewhere to name exactly
// Task/Agent/Workflow, and its `message.id`-grouping consumers (groupDispatchMessages,
// classifyGroup) stay untouched by this package. `invoke_subagent`'s fan-out is instead
// recognized directly from THIS call's own `tool_input.Subagents` array (see evaluateTriggerA),
// routed there by an explicit OR-check in evaluateSlicingGuard below.
const ANTIGRAVITY_TOOL_NAME = "invoke_subagent";

const LEDGER_SCHEMA = "pipeline.dispatch-slicing-ledger.v1";
export const LEDGER_EVENT_TODO_PLAN = "todo-plan";
export const LEDGER_EVENT_DISPATCH = "dispatch";
export const LEDGER_EVENT_FANOUT = "fanout";

/**
 * Sorted-key canonical JSON stringify -- the same shape as
 * `lib/human-guard-override.mjs`'s local `canonical()`, reimplemented here
 * because that module does not export it and this file must not import from
 * (or edit) it. Used only for the in-flight identity hash and trigger B's
 * batch hash, never for anything security-bearing.
 */
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 hex digest of a canonicalized value. Never throws outward -- a value
 * this cannot stringify (a BigInt, a value with a circular reference) is
 * caught by every caller and treated as "no match" / "no dedup key", per this
 * file's fail-open posture. */
export function sha256Hex(value) {
  const payload = typeof value === "string" ? value : canonicalize(value);
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Reads a JSONL transcript file into an array of parsed row objects. A line
 * that fails to parse is skipped, never fatal. Returns null (never throws)
 * when the file itself cannot be read -- missing, permission error, not a
 * file -- which callers treat as "no history available", not as a crash.
 */
export function readTranscriptRows(path, dependencies = {}) {
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  let raw;
  try {
    raw = readFileSyncFn(path, "utf8");
  } catch {
    return null;
  }
  const rows = [];
  for (const line of String(raw).split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // one malformed line must never invalidate the rest of the transcript
    }
  }
  return rows;
}

/**
 * Groups every `Task`/`Agent`/`Workflow` `tool_use` block found across the
 * rows by its row's `message.id`, preserving first-appearance order --
 * mirroring `backlog/evidence/2026-09-06-fanout-msgid-grouping.mjs`'s own
 * method exactly, including accumulating a single `message.id`'s blocks
 * across more than one row rather than assuming they all land on one line.
 * A row with no array `message.content` or no non-empty string `message.id`
 * is skipped, never fatal.
 */
export function groupDispatchMessages(rows) {
  const order = [];
  const byId = new Map();
  for (const row of rows ?? []) {
    const content = row?.message?.content;
    const msgId = row?.message?.id;
    if (!Array.isArray(content) || typeof msgId !== "string" || msgId === "") continue;
    for (const block of content) {
      if (!block || typeof block !== "object" || block.type !== "tool_use") continue;
      if (!DISPATCH_TOOL_NAMES.has(block.name)) continue;
      if (!byId.has(msgId)) { byId.set(msgId, []); order.push(msgId); }
      byId.get(msgId).push({ toolName: block.name, input: block.input });
    }
  }
  return order.map((msgId) => ({ msgId, blocks: byId.get(msgId) }));
}

/**
 * "single" (exactly one Task/Agent block, no Workflow block), "reset" (a
 * Workflow block present, REGARDLESS of what it would recover -- or two or
 * more Task/Agent blocks, the message.id fan-out), or "ignore" (a group with
 * zero dispatch blocks, which should not occur given `groupDispatchMessages`
 * only ever creates a group when it finds at least one, but handled rather
 * than assumed away).
 */
export function classifyGroup(group) {
  const blocks = group?.blocks ?? [];
  if (blocks.some((b) => b.toolName === WORKFLOW_TOOL_NAME)) return "reset";
  const taskAgentCount = blocks.filter((b) => TASK_AGENT_TOOL_NAMES.has(b.toolName)).length;
  if (taskAgentCount >= 2) return "reset";
  if (taskAgentCount === 1) return "single";
  return "ignore";
}

/**
 * Drops the LATEST group from `groups` iff it is the in-flight turn -- one of
 * its blocks matches this invocation's own `tool_name`/`tool_input` by a
 * canonical-hash identity comparison. Never inspects any group other than the
 * last one: an earlier group that happens to carry a byte-identical dispatch
 * call is a real (if unusual) historical turn, not the in-flight one, and
 * must not be dropped. Returns the possibly-shortened group list plus
 * `inFlightSiblingCount` (the in-flight group's own block count, 0 when no
 * match was found).
 *
 * CORRECTED NVA-B-SLICINGFANOUT-1: `inFlightSiblingCount` does NOT feed the
 * ledger's `fanout` field (it did before this fix, and that was the defect --
 * see `evaluateTriggerA`'s header note on where `fanout` is derived now).
 * `inFlightSiblingCount` can only ever be >= 2 when the CURRENT call's own
 * content is ALREADY matched into the last transcript group, which requires
 * BOTH the already-written timing AND this call being the LAST-processed
 * sibling of the pair -- a structural ceiling, not a bug in this function.
 * It is retained on the return value for its own direct callers/tests
 * (`excludeInFlightGroup`'s suite) and as a diagnostic, not because anything
 * in this module still consumes it for the fan-out verdict.
 */
export function excludeInFlightGroup(groups, currentToolName, currentToolInput) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return { groups: groups ?? [], inFlightSiblingCount: 0 };
  }
  const last = groups[groups.length - 1];
  let currentHash;
  try {
    currentHash = sha256Hex(currentToolInput);
  } catch {
    return { groups, inFlightSiblingCount: 0 }; // failed hash -> cannot match -> fail open, drop nothing
  }
  const matched = last.blocks.some((b) => {
    if (b.toolName !== currentToolName) return false;
    try {
      return sha256Hex(b.input) === currentHash;
    } catch {
      return false;
    }
  });
  if (!matched) return { groups, inFlightSiblingCount: 0 };
  return { groups: groups.slice(0, -1), inFlightSiblingCount: last.blocks.length };
}

/** Length of the trailing run of consecutive "single" groups, scanning from
 * the end. Stops at the first "reset" (or "ignore") group encountered. */
export function computeTrailingSingleRun(groups) {
  let run = 0;
  for (let i = (groups?.length ?? 0) - 1; i >= 0; i -= 1) {
    if (classifyGroup(groups[i]) === "single") { run += 1; continue; }
    break;
  }
  return run;
}

/** Every `status === "pending"` entry of `toolInput.todos`. A non-array,
 * absent, or malformed `todos` value yields an empty list, never a throw. */
function pendingTodosOf(toolInput) {
  const todos = toolInput?.todos;
  if (!Array.isArray(todos)) return [];
  return todos.filter((t) => t && typeof t === "object" && t.status === "pending");
}

/** Hash of the sorted set of pending item texts -- order-insensitive, so
 * reordering an unchanged pending set does not read as a new batch. */
export function computeBatchHash(pendingTodos) {
  const texts = pendingTodos
    .map((t) => (typeof t.content === "string" ? t.content : ""))
    .sort();
  return sha256Hex(texts);
}

function resolveSessionId(input) {
  if (typeof input?.session_id === "string" && input.session_id !== "") return input.session_id;
  const transcriptPath = input?.transcript_path;
  if (typeof transcriptPath === "string" && transcriptPath !== "") {
    return basename(transcriptPath).replace(/\.jsonl$/u, "");
  }
  return "unknown-session";
}

function resolveAgentTypeHint(toolInput) {
  const v = toolInput?.subagent_type ?? toolInput?.subagentType;
  return typeof v === "string" && v !== "" ? v : null;
}

export function ledgerPath(commonDir, sessionId) {
  return join(commonDir, "agent-pipeline", "dispatch-slicing", `${sessionId}.jsonl`);
}

export function readLedgerRecords(path, dependencies = {}) {
  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;
  if (!existsSyncFn(path)) return [];
  let raw;
  try {
    raw = readFileSyncFn(path, "utf8");
  } catch {
    return [];
  }
  const records = [];
  for (const line of String(raw).split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // a corrupt ledger line must never crash the guard or the read
    }
  }
  return records;
}

function appendLedgerRecord(commonDir, sessionId, record, dependencies) {
  if (commonDir === null || commonDir === undefined) return; // nothing to write to -- best-effort only
  try {
    const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
    const appendFileSyncFn = dependencies.appendFileSyncFn ?? appendFileSync;
    const path = ledgerPath(commonDir, sessionId);
    mkdirSyncFn(dirname(path), { recursive: true, mode: 0o700 });
    appendFileSyncFn(path, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // best-effort observability only -- never let a logging failure change the never-blocking verdict
  }
}

function buildLedgerRecord({
  nowFn, sessionId, event, tool, agentType, fanout, pendingCount, batchHash, advisoryEmitted,
  workflowRecoveredCount,
}) {
  return {
    schema: LEDGER_SCHEMA,
    ts: nowFn(),
    sessionId,
    event,
    tool,
    agentType: agentType ?? null,
    fanout: Boolean(fanout),
    pendingCount: pendingCount ?? null,
    batchHash: batchHash ?? null,
    advisoryEmitted: Boolean(advisoryEmitted),
    channel: advisoryEmitted ? NUDGE_CHANNEL : null,
    workflowRecoveredCount: workflowRecoveredCount ?? null,
  };
}

function nudgeStdout(text) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      additionalContext: text,
    },
  });
}

function triggerAMessage(runLength) {
  return `Slicing default: ${runLength} consecutive single-dispatch turns with no fan-out recognized in between. `
    + "If the remaining work is >=3 independent work packages with disjoint declared write scopes, no dependency "
    + "edge between them, and a safe commit surface (worktree isolation, at most one committing slice, or a "
    + "sequenced round), consider dispatching the next batch in parallel (an Agent-tool fan-out or the Workflow "
    + "tool) instead of one more sequential dispatch. This is a nudge, never a requirement: proceeding "
    + "sequentially needs no justification.";
}

function triggerBMessage(pendingCount) {
  return `Slicing default: a TodoWrite batch with ${pendingCount} pending items was just recorded. `
    + "If these are independent work packages with disjoint declared write scopes, no dependency edge between "
    + "them, and a safe commit surface, consider dispatching them in parallel (an Agent-tool fan-out or the "
    + "Workflow tool) rather than one at a time. This is a nudge, never a requirement: sequential work needs no "
    + "justification.";
}

function evaluateTriggerB({ toolInput, sessionId, commonDir, nowFn, options }) {
  const pending = pendingTodosOf(toolInput);
  const pendingCount = pending.length;
  let advisoryEmitted = false;
  let batchHash = null;

  if (pendingCount >= SLICING_THRESHOLD) {
    batchHash = computeBatchHash(pending);
    const priorRecords = commonDir === null || commonDir === undefined
      ? []
      : (options.readLedgerRecordsFn ?? readLedgerRecords)(ledgerPath(commonDir, sessionId), options);
    const alreadyFired = priorRecords.some(
      (r) => r?.event === LEDGER_EVENT_TODO_PLAN && r?.batchHash === batchHash && r?.advisoryEmitted === true,
    );
    advisoryEmitted = !alreadyFired;
  }

  const record = buildLedgerRecord({
    nowFn, sessionId, event: LEDGER_EVENT_TODO_PLAN, tool: "TodoWrite", agentType: null,
    fanout: false, pendingCount, batchHash, advisoryEmitted,
  });
  (options.appendLedgerRecordFn ?? appendLedgerRecord)(commonDir, sessionId, record, options);

  if (!advisoryEmitted) return { exitCode: 0, stdout: "" };
  return { exitCode: 0, stdout: nudgeStdout(triggerBMessage(pendingCount)) };
}

function evaluateTriggerA({ input, toolName, toolInput, sessionId, commonDir, nowFn, options }) {
  const transcriptPath = input?.transcript_path;
  let runLength = 0;
  // Whether the LAST *completed* group (after in-flight exclusion) is itself
  // a recognized fan-out/Workflow reset -- see the "LEDGER `fanout` FIELD"
  // header note (NVA-B-SLICINGFANOUT-1) for why this replaces
  // `inFlightSiblingCount >= 2` rather than supplementing it.
  let lastCompletedGroupIsReset = false;

  if (typeof transcriptPath === "string" && transcriptPath !== "") {
    const rows = (options.readTranscriptRowsFn ?? readTranscriptRows)(transcriptPath, options);
    if (rows !== null) {
      const groups = groupDispatchMessages(rows);
      const excluded = excludeInFlightGroup(groups, toolName, toolInput);
      runLength = computeTrailingSingleRun(excluded.groups);
      lastCompletedGroupIsReset = classifyGroup(excluded.groups[excluded.groups.length - 1]) === "reset";
    }
    // rows === null (unreadable/malformed transcript) -> fail open: runLength stays 0, no nudge
  }
  // missing/non-string transcript_path -> fail open: runLength stays 0, no nudge

  let workflowRecoveredCount = null;
  if (toolName === WORKFLOW_TOOL_NAME) {
    const script = typeof toolInput?.script === "string" ? toolInput.script : "";
    try {
      workflowRecoveredCount = (options.extractWorkflowDispatchesFn ?? extractWorkflowDispatches)(script).length;
    } catch {
      workflowRecoveredCount = null; // observability only -- never let this affect the verdict
    }
  }

  // ANTIGRAVITY FAN-OUT (NVA-B-SLICINGRUNNER-1). The Antigravity runner's native
  // `invoke_subagent` call carries its own fan-out width directly in THIS call's
  // `tool_input.Subagents` array -- unlike Task/Agent, this needs no transcript
  // grouping, no timing, and no in-flight ambiguity: the array length IS the fan-out
  // width. Recognized unconditionally by structural shape of this call alone, exactly
  // like the `toolName === WORKFLOW_TOOL_NAME` check above -- never by consulting
  // transcript history (`lastCompletedGroupIsReset`, computed above, is untouched by
  // this addition). Reuses the exported `extractAntigravityDispatches`
  // (guard-dispatch.mjs) rather than a second, locally written copy of that parsing
  // logic, so a malformed entry (missing `TypeName`) does not inflate the recognized
  // width -- the same fail-open-on-garbage posture as every other count in this file.
  let isAntigravityFanout = false;
  if (toolName === ANTIGRAVITY_TOOL_NAME) {
    try {
      const subagents = Array.isArray(toolInput?.Subagents) ? toolInput.Subagents : [];
      isAntigravityFanout = (options.extractAntigravityDispatchesFn ?? extractAntigravityDispatches)(subagents).length >= 2;
    } catch {
      isAntigravityFanout = false; // fail open -- never let a parse failure manufacture a fan-out
    }
  }

  // Exact equality, not >=: ADR Decision 4 -- "Fires once per run; any recognized
  // fan-out resets the run" and "Rate limiting is part of the trigger, not a
  // refinement. A nudge on every dispatch becomes ambient noise." Since runLength
  // is recomputed fresh from history on every call and grows by exactly one
  // between consecutive non-resetting calls (this hook fires on every dispatch
  // call once wired), it crosses SLICING_THRESHOLD exactly once per run -- so
  // "fires once per run" needs no separate rate-limit state, unlike trigger B's
  // ledger-backed dedup. (A cold-start edge case is accepted, not hidden: if the
  // hook starts observing a session whose history already exceeds the threshold
  // -- e.g. wired mid-session -- runLength can start above SLICING_THRESHOLD and
  // this run's one nudge is silently skipped rather than firing late; that is the
  // safe direction, a missed nudge, not a repeated one. A second, narrower
  // edge case (NVA-B-SLICINGFANOUT-1, item c): under the not-yet-written
  // timing, if the in-flight call's own content is byte-identical to the
  // IMMEDIATELY PRECEDING historical single, `excludeInFlightGroup` wrongly
  // matches and drops that real historical group -- since it only ever
  // inspects the LAST group -- undercounting this call's runLength by one
  // and overcounting a later call's by one once the real row lands. Net
  // effect: the run's one nudge is silently skipped (e.g. 2, then a jump to
  // 4), never firing at exactly 3. Unaffected under the already-written
  // timing, where the in-flight call's own row is the one that legitimately
  // matches and the real preceding single survives untouched.)
  const advisoryEmitted = runLength === SLICING_THRESHOLD;
  const fanout = toolName === WORKFLOW_TOOL_NAME || isAntigravityFanout || lastCompletedGroupIsReset;

  const record = buildLedgerRecord({
    nowFn, sessionId, event: fanout ? LEDGER_EVENT_FANOUT : LEDGER_EVENT_DISPATCH, tool: toolName,
    agentType: resolveAgentTypeHint(toolInput), fanout, pendingCount: null, batchHash: null,
    advisoryEmitted, workflowRecoveredCount,
  });
  (options.appendLedgerRecordFn ?? appendLedgerRecord)(commonDir, sessionId, record, options);

  if (!advisoryEmitted) return { exitCode: 0, stdout: "" };
  return { exitCode: 0, stdout: nudgeStdout(triggerAMessage(runLength)) };
}

/**
 * Top-level evaluator. `input` is the raw PreToolUse hook payload
 * (`tool_name`, `tool_input`, `transcript_path`, `session_id`, ...).
 * `options` doubles as the dependency-injection bag for every helper above
 * (tests only) AND carries `rootDir`/`nowFn` overrides, mirroring
 * `evaluateDispatchBudgetGuard`'s own convention in `guard-dispatch-budget.mjs`.
 * Always returns `{ exitCode: 0, stdout }` -- NEVER blocking, by construction;
 * wrapped in a top-level try/catch so ANY unexpected exception reduces to a
 * silent allow, matching every sibling guard's fail-open posture.
 */
export function evaluateSlicingGuard(input, options = {}) {
  try {
    const rootDir = options.rootDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    const nowFn = options.nowFn ?? (() => new Date().toISOString());

    const identity = (options.subagentIdentityFn ?? subagentIdentity)(input, options);
    if (identity.kind !== "orchestrator") {
      return { exitCode: 0, stdout: "" }; // orchestrator-only, per design -- silent otherwise
    }

    const toolName = typeof input?.tool_name === "string" ? input.tool_name : "";
    const toolInput = input?.tool_input;
    const sessionId = resolveSessionId(input);
    const commonDir = (options.resolveGitCommonDirFn ?? resolveGitCommonDir)(rootDir, options);

    if (toolName === "TodoWrite") {
      return evaluateTriggerB({ toolInput, sessionId, commonDir, nowFn, options });
    }
    // `invoke_subagent` (Antigravity's native dispatch tool, NVA-B-SLICINGRUNNER-1) is
    // deliberately NOT a member of `DISPATCH_TOOL_NAMES` (see that constant's own
    // comment) but is routed through the SAME trigger-A evaluator as Task/Agent/
    // Workflow -- evaluateTriggerA is what recognizes its Subagents-array fan-out.
    // Codex native observations are evaluated by codex-slicing-hint.mjs, not by this
    // Claude-compatible safety guard; this preserves the adapter's supported tool set.
    if (DISPATCH_TOOL_NAMES.has(toolName) || toolName === ANTIGRAVITY_TOOL_NAME) {
      return evaluateTriggerA({ input, toolName, toolInput, sessionId, commonDir, nowFn, options });
    }
    return { exitCode: 0, stdout: "" }; // a tool this hook has no opinion on
  } catch {
    return { exitCode: 0, stdout: "" }; // the ultimate fail-open net -- never worth denying a tool call over
  }
}

if (isDirectInvocation(import.meta.url)) {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0); // unreadable input -> no opinion; a broken hook must not stop work
  }
  const result = evaluateSlicingGuard(input);
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.exitCode);
}

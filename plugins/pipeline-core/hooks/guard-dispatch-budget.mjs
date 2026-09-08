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
 * ## Budget arithmetic (derived from the dispatched agent's own
 * definition, never from briefing text -- CLOSING_ALLOWANCE and
 * SAFETY_MARGIN below are this guard's own fixed constants; `maxTurns` is
 * read live from the agent's frontmatter file on every call, so a future
 * change to that value is picked up automatically with no edit here):
 *
 *   workingCap = maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN)
 *              = maxTurns - 15
 *
 * For this repository's `goldfish-deep` / `goldfish-implementor` /
 * `goldfish-mechanic` (`maxTurns: 50` today), that is workingCap = 35,
 * matching NVA-BUDGETGUARD-1's own dispatch metadata ("<=35 tool uses,
 * plus +5 closing = 40") exactly, and leaving a 10-call margin before the
 * harness's own hard `maxTurns` cutoff -- the cliff three dispatches fell
 * off on 2026-08-27. CLOSING_ALLOWANCE documents intent (the closing acts
 * are inherently few and self-terminating: one dispatch-record write, one
 * `git add`, one `git commit`); this guard does not additionally hard-cap
 * the COUNT of closing calls once the working cap is crossed -- it caps
 * the SHAPE, exactly the permitted set below, for as long as the subagent
 * keeps trying only those shapes.
 *
 * ## Storage
 * Per-subagent counters persist as one JSON file each under
 * `<git-common-dir>/agent-pipeline/dispatch-budget/<agentId>.json` --
 * local, untracked runtime state, resolved via `git rev-parse
 * --path-format=absolute --git-common-dir`. Never a tracked path, never
 * `scratch/` (agent-writable -- a limited agent could erase its own
 * counter there, defeating the whole guard).
 *
 * ## Fail-open-but-visible
 * Any point at which the identity chain or the budget cannot be resolved
 * (malformed/missing `transcript_path`, missing/unparseable meta.json,
 * `spawnDepth` not a number >=1, `agentType` not resolving to a known
 * agent definition file, that file missing/malformed `maxTurns`, or the
 * git common dir itself unresolvable) allows the call (verdict 0). Where a
 * common dir COULD be resolved, one complete JSON observation is atomically
 * claimed per session/reason below `unresolved-observations/`; the historical
 * readable `unresolved.jsonl` is retained and never truncated. Session and
 * reason path components are digest-derived, while the diagnostic JSON records
 * the branch, reason, root/common dir, transcript path and instant. This guard
 * never fails closed on its own confusion -- that would halt every dispatch.
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
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

import { writeTargetPath } from "../lib/tool-write-target.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];
export const DENIAL_CODE = "DISPATCH-BUDGET-EXHAUSTED";
export const CLOSING_ALLOWANCE = 5;
export const SAFETY_MARGIN = 10;
const DISPATCH_RECORD_PATTERN = /^evidence\/dispatch-record-.*\.json$/u;
const GIT_CLOSING_VERB_PATTERN = /^git\s+(add|commit)\b/u;

function verdict(exitCode, stderr = "") {
  return { exitCode, stderr };
}

function blocked({ agentId, agentType, maxTurns, workingCap, count }) {
  return verdict(
    2,
    "BLOCKED (guard-dispatch-budget, plugin pipeline-core): "
      + `${DENIAL_CODE}: this dispatch (${agentType}, agent ${agentId}) has used ${count} tool calls against a working cap of ${workingCap} `
      + `(derived from its own maxTurns=${maxTurns} frontmatter minus a fixed ${CLOSING_ALLOWANCE}-closing + ${SAFETY_MARGIN}-safety reserve).\n`
      + "Only these acts remain permitted: (1) write/update evidence/dispatch-record-*.json, (2) `git add` your own paths, (3) `git commit` your own paths.\n"
      + "Stop working: restore live state, commit what is green, finalize the dispatch record, and emit the closing report.\n",
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
  return Number.isFinite(value) && value > 0 ? value : null;
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
      if (typeof parsed.count === "number") return parsed;
    } catch {
      // a corrupt counter file must never crash the guard -- fall through to a fresh one
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
  const agentId = input?.agent_id;
  if (typeof agentId === "string" && agentId.trim() !== "") {
    const agentType = typeof input?.agent_type === "string" ? input.agent_type : undefined;
    return { kind: "subagent", agentId, agentType };
  }
  const isObjectInput = typeof input === "object" && input !== null;
  const hasAgentIdKey = isObjectInput && Object.prototype.hasOwnProperty.call(input, "agent_id");
  const hasAgentTypeKey = isObjectInput && Object.prototype.hasOwnProperty.call(input, "agent_type");
  if (hasAgentIdKey || hasAgentTypeKey) {
    const agentIdRaw = hasAgentIdKey ? input.agent_id : undefined;
    const agentTypeRaw = hasAgentTypeKey ? input.agent_type : undefined;
    const reason = !hasAgentIdKey
      ? "agent-type-without-agent-id"
      : (typeof agentIdRaw === "string" && agentIdRaw.trim() === "")
        ? "agent-id-present-but-blank"
        : "agent-id-present-but-not-a-string";
    return { kind: "unresolved", reason, agentIdRaw, agentTypeRaw };
  }
  return { kind: "orchestrator" };
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

  const workingCap = Math.max(0, maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN));
  const path = counterPath(commonDir, identity.agentId);
  const counter = loadCounter(path, {
    agentId: identity.agentId, agentType: identity.agentType, maxTurns, workingCap,
  }, options);
  counter.count += 1;
  counter.updatedAt = nowFn();
  saveCounter(path, counter, options);

  if (counter.count <= workingCap) return verdict(0);
  if (isClosingAct(input, rootDir)) return verdict(0);

  return blocked({
    agentId: identity.agentId, agentType: identity.agentType, maxTurns, workingCap, count: counter.count,
  });
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

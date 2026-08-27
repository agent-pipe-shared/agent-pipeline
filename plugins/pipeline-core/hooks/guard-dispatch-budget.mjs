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
 * only; wiring is a separate, signed maintenance-window ceremony. Mirrors
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
 * common dir COULD be resolved, one line is appended to
 * `<git-common-dir>/agent-pipeline/dispatch-budget/unresolved.jsonl`
 * recording the reason and whatever fields were available, so the gap is
 * measurable, never silent. This guard never fails closed on its own
 * confusion -- that would halt every dispatch in the repository.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
 * Distinguishes a dispatched subagent's PreToolUse payload from the
 * orchestrating session's own, and resolves as much of its identity as the
 * payload actually supports. See the identity-chain doc block above for
 * what was empirically confirmed. Never throws.
 */
export function subagentIdentity(input, dependencies = {}) {
  const transcriptPath = input?.transcript_path;
  if (typeof transcriptPath !== "string" || transcriptPath.trim() === "" || !isAbsolute(transcriptPath)) {
    return { kind: "unresolved", reason: "transcript-path-missing-or-relative" };
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

function recordUnresolved(commonDir, record, dependencies) {
  const mkdirSyncFn = dependencies.mkdirSyncFn ?? mkdirSync;
  const appendFileSyncFn = dependencies.appendFileSyncFn ?? appendFileSync;
  try {
    const dir = join(commonDir, "agent-pipeline", "dispatch-budget");
    mkdirSyncFn(dir, { recursive: true, mode: 0o700 });
    appendFileSyncFn(join(dir, "unresolved.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // best-effort observability only -- never let a logging failure change the fail-open verdict
  }
}

/**
 * @param {object} input the PreToolUse hook payload (`tool_name`, `tool_input`, `transcript_path`, ...)
 * @param {object} [options]
 * @param {string} [options.rootDir] the project root; defaults to `process.cwd()`
 * @param {() => string} [options.nowFn] clock override (tests only)
 * @param {object} [options] also doubles as the dependency-injection bag for every helper above (tests only)
 */
export function evaluateDispatchBudgetGuard(input, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const nowFn = options.nowFn ?? (() => new Date().toISOString());

  const identity = subagentIdentity(input, options);
  if (identity.kind === "orchestrator") return verdict(0); // never limited, by construction

  const commonDir = (options.resolveGitCommonDirFn ?? resolveGitCommonDir)(rootDir, options);
  if (commonDir === null) return verdict(0); // nowhere safe to persist or record -- fail open, silently

  if (identity.kind === "unresolved") {
    recordUnresolved(commonDir, { ...identity, at: nowFn() }, options);
    return verdict(0);
  }

  const maxTurns = (options.resolveMaxTurnsFn ?? resolveMaxTurns)(identity.agentType, rootDir, options);
  if (maxTurns === null) {
    recordUnresolved(commonDir, {
      kind: "unresolved", reason: "max-turns-unresolvable", agentId: identity.agentId, agentType: identity.agentType, at: nowFn(),
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

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * FANOUT slice S5: the Claude `Stop` adapter of the fan-out governor (NOT wired; wiring is slice S8).
 *
 * Design: specs/sprint-alfred-epic/design/fanout-enforcement-design.md section 3.3 and row S5.
 *
 * Pure plumbing, no policy: parse the Stop payload, load the slice queue, read the session ledger,
 * call `evaluateFanoutStop`, substitute `<plugin-root>`, append `telemetry.events` and emit what the
 * governor decided. Two output shapes, nothing else; every other outcome, and every error, is exit 0
 * with nothing on stdout (fail open):
 *   block     `{"decision":"block","reason":...}`, only when the governor's EFFECTIVE decision is a block
 *             AND its `block` event was durably appended first (see below).
 *   advisory  `{"systemMessage":...,"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":...}}`,
 *             the shape and channel `hooks/stop-suggest.mjs` already uses (design 3.3 "Modes"). It carries the
 *             governor's non-block text: the FANOUT-ADVISORY line of `advisory` mode and the FANOUT-NO-QUEUE
 *             line of `advisory` and `enforce` mode. `shadow` and `off` never emit it; the adapter checks the
 *             governor's resolved `telemetry.mode` itself, so a policy slip there cannot reach the model.
 *             Whether the host surfaces `additionalContext` on a `Stop` event is inherited from the sibling
 *             hook and not measured here.
 *
 * Durable-append precondition (governor Critic F1): a block is issued only after the `block` event of the
 * same governor result was appended to the ledger. Rule 9's loop bounds count recorded `block` events, so a
 * block that could not be recorded (a ledger the adapter can read but not append to, e.g. FANOUT-FILE-UNSAFE
 * on a non-private file) would defeat them. A refused append, or a block result with no `block` event,
 * therefore returns nothing at all: fail open, no output of any kind.
 *
 * Cost (design 3.6, 8 "native Windows"): the hook is one short Node process, and THIS ADAPTER SPAWNS NOTHING ITSELF:
 * it does not import `node:child_process`, and the git common dir comes ONLY from the config's absolute `commonDir`
 * (there is no `git rev-parse` fallback). With no `queuePath`, or a `queuePath` without an absolute string
 * `commonDir`, it returns silently (fail open) at once, before any state resolution, governor call or ledger access.
 * Two routes below the adapter can still spawn. They are documented here, not changed here:
 *   - `observeGovernanceScope`, called only when the config carries no boolean `requiresEnforcement`, spawns git
 *     transitively (lib/governance-scope.mjs:256-258 -> lib/worktree-lifecycle.mjs:255-277). A config that carries
 *     the boolean never reaches it; the S8 wiring is expected to supply it.
 *   - The ledger (`readEvents`, `liveSlices`, `appendEvent`), on native Windows: its private-state hardening
 *     (lib/fanout-ledger.mjs -> lib/private-boundary.mjs -> lib/windows-private-state.mjs) spawns the fixed Windows
 *     PowerShell (`powershell.exe`), never git. Measured by the SF22 tripwire on one enforce-mode evaluation:
 *     4 `spawnSync powershell.exe` calls, every one inside the ledger. It is a Windows-only code path by
 *     construction (`process.platform === "win32"` in lib/private-boundary.mjs, and the fixed PowerShell paths exist
 *     only there); it has been measured on native Windows only.
 *
 * Configuration input (open PO question Q7: no default queue location is decided here): one JSON
 * object in the env var `PIPELINE_FANOUT_CONFIG`. Its keys are the governor's `resolveFanoutConfig`
 * input (mode, target, ...) plus three adapter-only keys:
 *   queuePath  the slice queue file (relative to the payload `cwd`); REQUIRED, absent => fan-out is not
 *              configured for this project and the hook is silent (the S7 dispatch guard behaves the same).
 *              A queuePath whose file does not exist is the governor's "absent queue" (FANOUT-NO-QUEUE).
 *   commonDir  the absolute git common dir; REQUIRED together with `queuePath`. Absent, not a string or not
 *              absolute => fail open silently. The adapter never derives it (no `git rev-parse`).
 *   (requiresEnforcement defaults to `observeGovernanceScope({ rootDir: cwd }).requiresEnforcement`
 *    when the config does not carry a boolean; that default spawns git transitively, see Cost above)
 *   (implementationPhaseActive defaults, only while the queue file is absent, to design 3.10's "implementation
 *    phase active": `activeFeature.phase === "implementation"` in the feature state file, the neutral
 *    `project/pipeline-state.json` when present else the legacy `.claude/pipeline-state.json`, the same
 *    fallback `stop-suggest.mjs` applies. `resolveProjectAuthorityPaths` is deliberately not called: it
 *    may spawn git. An unreadable or malformed state is "not implementing".)
 * Test seams: `PIPELINE_FANOUT_TEST_THROW=1` makes the adapter throw before calling the governor (proves the
 * fail-open path; never set in production); `decideStop` options `evaluate`, `append` and `config` inject the
 * governor, the ledger append and the configuration for in-process callers. There is no spawn seam: there is
 * nothing to inject.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { appendEvent, liveSlices, readEvents } from "../lib/fanout-ledger.mjs";
import { PLUGIN_ROOT_PLACEHOLDER, evaluateFanoutStop } from "../lib/fanout-governor.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { LEGACY_STATE, NEUTRAL_STATE } from "../lib/project-authority.mjs";
import { loadSliceQueue } from "../lib/slice-queue.mjs";

const RUNNER = "claude";
const MAX_RECORD_BYTES = 1024 * 1024;
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function readConfig() {
  const raw = process.env.PIPELINE_FANOUT_CONFIG;
  if (raw === undefined || raw === "") return {};
  const parsed = JSON.parse(raw);
  if (!isObject(parsed)) throw new Error("config");
  return parsed;
}

/** Design 3.10: is the feature in its implementation phase? Any unreadable or malformed state is "no". */
function readImplementationPhaseActive(cwd) {
  for (const relative of [NEUTRAL_STATE, LEGACY_STATE]) {
    const path = join(cwd, relative);
    try {
      const info = statSync(path);
      if (!info.isFile()) continue;
      if (info.size > MAX_RECORD_BYTES) return false;
      const state = JSON.parse(readFileSync(path, "utf8"));
      return isObject(state) && isObject(state.activeFeature) && state.activeFeature.phase === "implementation";
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      return false;
    }
  }
  return false;
}

/** Dispatch records of the queue's slices, in the shape `readyAndLive` consumes. Unreadable ones are skipped. */
function readRecords(evidenceDir, sliceIds) {
  const records = [];
  for (const id of sliceIds) {
    try {
      const path = join(evidenceDir, `dispatch-record-${id}.json`);
      const info = statSync(path);
      if (!info.isFile() || info.size > MAX_RECORD_BYTES) continue;
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (!isObject(parsed) || parsed.taskId !== id || typeof parsed.outcome !== "string") continue;
      records.push({ taskId: parsed.taskId, outcome: parsed.outcome, outcomeClassification: parsed.outcomeClassification, mtimeMs: Math.round(info.mtimeMs) });
    } catch { /* no usable record for this slice */ }
  }
  return records;
}

/**
 * Returns the Stop-hook stdout text ("" for nothing). Throws on any fault; `run` turns that into
 * silence. `options.evaluate`, `options.append` and `options.config` are injectable for in-process callers.
 */
export function decideStop(input, options = {}) {
  if (!isObject(input)) return "";
  const evaluate = options.evaluate ?? evaluateFanoutStop;
  const append = options.append ?? appendEvent;
  const config = options.config ?? readConfig();
  // Early exit BEFORE any state resolution, governor call or ledger access: with no queuePath fan-out is
  // not configured here, and the governor could say nothing (design 3.6, 8 "native Windows").
  if (!isObject(config) || typeof config.queuePath !== "string" || config.queuePath === "") return "";
  // The git common dir comes ONLY from the config's absolute `commonDir`; this adapter never spawns `git` to
  // derive it (design 3.6). A configured queue without one fails open silently, still before any governor or
  // ledger access.
  if (typeof config.commonDir !== "string" || !isAbsolute(config.commonDir)) return "";
  const commonDir = config.commonDir;
  const cwd = typeof input.cwd === "string" && isAbsolute(input.cwd) ? input.cwd : (process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const sessionId = input.session_id;
  if (typeof sessionId !== "string" || sessionId === "") return "";
  const now = Date.now();

  const queue = loadSliceQueue(resolve(cwd, config.queuePath), isObject(config.queueOptions) ? config.queueOptions : {});
  const sliceIds = Array.isArray(queue?.raw?.slices)
    ? queue.raw.slices.map((slice) => slice?.id).filter((id) => typeof id === "string")
    : [];
  const evidenceDir = join(cwd, "evidence");
  const events = readEvents(commonDir, RUNNER, sessionId).events;
  const live = liveSlices({ commonDir, runner: RUNNER, sessionId, evidenceDir, sliceIds: sliceIds.filter((id) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id)), now });
  const ledger = { events, live, records: readRecords(evidenceDir, sliceIds) };

  const requiresEnforcement = typeof config.requiresEnforcement === "boolean"
    ? config.requiresEnforcement
    : observeGovernanceScope({ rootDir: cwd }).requiresEnforcement === true;
  // Only an absent queue file consults the phase (governor rule 4); every other queue state ignores it.
  const implementationPhaseActive = typeof config.implementationPhaseActive === "boolean"
    ? config.implementationPhaseActive
    : (queue?.status === "absent" ? readImplementationPhaseActive(cwd) : false);
  if (process.env.PIPELINE_FANOUT_TEST_THROW === "1") throw new Error("test seam");
  const { queuePath: _q, commonDir: _c, ...governorConfig } = config;
  const result = evaluate({ input, queue, ledger, config: { ...governorConfig, requiresEnforcement, implementationPhaseActive }, now });

  // Record first: a block that could not be recorded would escape the anti-loop counters, so it is not issued.
  // A refused or failed append (e.g. FANOUT-FILE-UNSAFE) fails the whole evaluation open: nothing is emitted.
  let blockRecorded = false;
  for (const event of Array.isArray(result?.telemetry?.events) ? result.telemetry.events : []) {
    try {
      append(commonDir, RUNNER, sessionId, event, { now });
    } catch {
      return "";
    }
    if (event?.type === "block") blockRecorded = true;
  }
  if (typeof result?.reason !== "string" || result.reason === "") return "";
  const reason = result.reason.split(PLUGIN_ROOT_PLACEHOLDER).join(PLUGIN_ROOT);
  if (result.decision === "block") {
    return blockRecorded ? `${JSON.stringify({ decision: "block", reason })}\n` : "";
  }
  // Non-block text is advisory output, and only `advisory` / `enforce` may produce it.
  const mode = result?.telemetry?.mode;
  if (result.decision !== "allow" || (mode !== "advisory" && mode !== "enforce")) return "";
  return `${JSON.stringify({ systemMessage: reason, hookSpecificOutput: { hookEventName: "Stop", additionalContext: reason } })}\n`;
}

/** Real hook boundary: always exits 0, writes nothing on any error. */
export function run() {
  let stdout = "";
  try {
    stdout = decideStop(JSON.parse(readFileSync(0, "utf8")));
  } catch {
    stdout = "";
  }
  if (stdout) process.stdout.write(stdout);
  process.exit(0);
}

if (isDirectInvocation(import.meta.url)) run();

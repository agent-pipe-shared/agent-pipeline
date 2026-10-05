#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * FANOUT slice S5: the Claude `Stop` adapter of the fan-out governor (NOT wired; wiring is slice S8).
 *
 * Design: specs/sprint-alfred-epic/design/fanout-enforcement-design.md section 3.3 and row S5.
 *
 * Pure plumbing, no policy: parse the Stop payload, load the slice queue, read the session ledger,
 * call `evaluateFanoutStop`, substitute `<plugin-root>`, append `telemetry.events` and emit
 * `{"decision":"block","reason":...}` when (and only when) the governor's EFFECTIVE decision is a
 * block. Every other outcome, and every error, is: exit 0 with nothing on stdout (fail open).
 * Advisory text is not emitted (the Stop output shape only carries a block decision).
 *
 * Configuration input (open PO question Q7: no default queue location is decided here): one JSON
 * object in the env var `PIPELINE_FANOUT_CONFIG`. Its keys are the governor's `resolveFanoutConfig`
 * input (mode, target, ...) plus three adapter-only keys:
 *   queuePath  the slice queue file (relative to the payload `cwd`); absent => "no queue" is passed
 *   commonDir  absolute git common dir override; default `git rev-parse --git-common-dir` in `cwd`
 *   (requiresEnforcement defaults to `observeGovernanceScope({ rootDir: cwd }).requiresEnforcement`
 *    when the config does not carry a boolean)
 * Test seam: `PIPELINE_FANOUT_TEST_THROW=1` makes the adapter throw before calling the governor
 * (proves the fail-open path; never set in production).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { appendEvent, liveSlices, readEvents } from "../lib/fanout-ledger.mjs";
import { PLUGIN_ROOT_PLACEHOLDER, evaluateFanoutStop } from "../lib/fanout-governor.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
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

function resolveCommonDir(cwd, config) {
  if (config.commonDir !== undefined) {
    if (typeof config.commonDir !== "string" || !isAbsolute(config.commonDir)) throw new Error("commonDir");
    return config.commonDir;
  }
  const out = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
  }).trim();
  if (out === "" || !isAbsolute(out)) throw new Error("commonDir");
  return out;
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
 * silence. `options.evaluate` is injectable for in-process callers.
 */
export function decideStop(input, options = {}) {
  if (!isObject(input)) return "";
  const evaluate = options.evaluate ?? evaluateFanoutStop;
  const config = options.config ?? readConfig();
  const cwd = typeof input.cwd === "string" && isAbsolute(input.cwd) ? input.cwd : (process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const sessionId = input.session_id;
  if (typeof sessionId !== "string" || sessionId === "") return "";
  const commonDir = resolveCommonDir(cwd, config);
  const now = Date.now();

  const queue = typeof config.queuePath === "string" && config.queuePath !== ""
    ? loadSliceQueue(resolve(cwd, config.queuePath), isObject(config.queueOptions) ? config.queueOptions : {})
    : undefined;
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
  if (process.env.PIPELINE_FANOUT_TEST_THROW === "1") throw new Error("test seam");
  const { queuePath: _q, commonDir: _c, ...governorConfig } = config;
  const result = evaluate({ input, queue, ledger, config: { ...governorConfig, requiresEnforcement }, now });

  // Record first: a block that could not be recorded would escape the anti-loop counters, so it is not issued.
  for (const event of Array.isArray(result?.telemetry?.events) ? result.telemetry.events : []) {
    appendEvent(commonDir, RUNNER, sessionId, event, { now });
  }
  if (result?.decision !== "block" || typeof result.reason !== "string" || result.reason === "") return "";
  const reason = result.reason.split(PLUGIN_ROOT_PLACEHOLDER).join(PLUGIN_ROOT);
  return `${JSON.stringify({ decision: "block", reason })}\n`;
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

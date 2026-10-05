// SPDX-License-Identifier: SUL-1.0
/**
 * FANOUT slice S4: the slice-queue CLI.
 *
 * Design: specs/sprint-alfred-epic/design/fanout-enforcement-design.md sections 3.1,
 * 3.2, 3.5, 3.9, 3.10 and 6 (row "S4 CLI").
 *
 *   slice-queue.mjs <verb> [<id> [<dep>]] --queue <path> [flags]
 *   verbs: validate | next | add | defer | hold | depend | pause | reap | finish | report
 *
 * `--queue` is explicit (absolute, or relative to the working directory): the default
 * location is an open PO question, so none is hard-coded. Stdout is ONE JSON document;
 * the exit code is typed: 0 ok, 2 usage (SQ-USAGE), 3 invalid queue or refused
 * mutation (the library's SQ-* codes), 4 queue/slice not found (SQ-NOT-FOUND), 5 I/O or
 * ledger failure (SQ-IO / FANOUT-*).
 *
 * Mutations edit the RAW queue, re-validate the result with `validateSliceQueue`, and
 * only then write it atomically (temp file in the same directory + rename). A refused
 * mutation never creates a temp file and never touches the queue.
 *
 * Ledger access (reap, finish, pause, `next`'s live set, report) needs a session:
 * `--session <id> [--runner claude] [--common-dir <git-common-dir>]` (the common dir
 * defaults to `git rev-parse --git-common-dir`). Reasons are persisted as SHA-256 only.
 *
 * Library gaps handled locally (libraries untouched): the queue library has no
 * mutation or serialisation helper, and nothing loads dispatch records for
 * `readyAndLive`; both are done here. Protected patterns are NOT injected (the
 * library then warns SQ-WARN-PROTECTED-UNCHECKED).
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { appendEvent, FANOUT_FINISH_HOWS, FanoutLedgerError, liveSlices, readEvents } from "../lib/fanout-ledger.mjs";
import { COMMIT_MODES, loadSliceQueue, LOAD_CLASSES, readyAndLive, SLICE_QUEUE_SCHEMA, SLICE_TIERS, validateSliceQueue } from "../lib/slice-queue.mjs";

export const CLI_SCHEMA = "pipeline.slice-queue-cli.v1";
export const EXIT = Object.freeze({ OK: 0, USAGE: 2, INVALID: 3, NOT_FOUND: 4, IO: 5 });
const MAX_PAUSE_MS = 4 * 60 * 60_000;
const MAX_RECORD_BYTES = 1024 * 1024;
const sha256 = (text) => createHash("sha256").update(String(text)).digest("hex");

class CliError extends Error {
  constructor(code, exit, message, extra = {}) {
    super(message);
    this.code = code;
    this.exit = exit;
    this.extra = extra;
  }
}
const usage = (message) => new CliError("SQ-USAGE", EXIT.USAGE, message);

// ------------------------------------------------------------------ arguments

const COMMON = ["queue", "now"];
const LEDGER = ["session", "runner", "common-dir"];
const VERBS = {
  validate: { positional: 0, flags: [...COMMON], repeatable: [] },
  next: { positional: 0, flags: [...COMMON, ...LEDGER, "limit", "evidence-dir", "stale-after-minutes"], repeatable: [] },
  add: {
    positional: 0,
    flags: [...COMMON, "init-feature", "id", "title", "state", "hold-reason", "tier", "tier-reason", "commit-mode", "load-class", "briefing", "estimated-tool-calls", "write-scope", "read-scope", "depends-on"],
    repeatable: ["write-scope", "read-scope", "depends-on"],
  },
  defer: { positional: 1, flags: [...COMMON, ...LEDGER, "reason"], repeatable: [] },
  hold: { positional: 1, flags: [...COMMON, ...LEDGER, "po-question", "external-reason"], repeatable: [] },
  depend: { positional: 2, flags: [...COMMON], repeatable: [] },
  pause: { positional: 0, flags: [...COMMON, ...LEDGER, "by", "reason", "until"], repeatable: [] },
  reap: { positional: 1, flags: [...COMMON, ...LEDGER, "reason"], repeatable: [] },
  finish: { positional: 1, flags: [...COMMON, ...LEDGER, "how"], repeatable: [] },
  report: { positional: 0, flags: [...COMMON, ...LEDGER, "evidence-dir", "stale-after-minutes"], repeatable: [] },
};

export function parseArguments(argv) {
  const [verb, ...rest] = argv;
  if (typeof verb !== "string" || !Object.hasOwn(VERBS, verb)) throw usage(`verb must be one of ${Object.keys(VERBS).join("|")}`);
  const spec = VERBS[verb];
  const positional = [];
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    let name = token.slice(2);
    let value;
    const eq = name.indexOf("=");
    if (eq !== -1) {
      value = name.slice(eq + 1);
      name = name.slice(0, eq);
    }
    if (!spec.flags.includes(name)) throw usage(`${verb}: unknown flag --${name.slice(0, 40)}`);
    if (value === undefined) {
      value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw usage(`${verb}: --${name} needs a value`);
      index += 1;
    }
    if (spec.repeatable.includes(name)) flags[name] = [...(flags[name] ?? []), ...value.split(",").map((part) => part.trim()).filter(Boolean)];
    else if (Object.hasOwn(flags, name)) throw usage(`${verb}: --${name} given twice`);
    else flags[name] = value;
  }
  if (positional.length !== spec.positional) throw usage(`${verb}: expected ${spec.positional} positional argument(s), got ${positional.length}`);
  if (verb !== "pause" && flags.queue === undefined) throw usage(`${verb}: --queue <path> is required`);
  return { verb, positional, flags };
}

function nowMs(flags) {
  if (flags.now === undefined) return Date.now();
  const parsed = Date.parse(flags.now);
  if (!Number.isFinite(parsed)) throw usage("--now must be an ISO-8601 timestamp");
  return parsed;
}
function requireText(flags, name, verb) {
  const value = flags[name];
  if (typeof value !== "string" || value.trim() === "") throw usage(`${verb}: --${name} is required`);
  return value.trim();
}

// ------------------------------------------------------------------ queue file

function loadRaw(path, { allowAbsent = false } = {}) {
  const loaded = loadSliceQueue(path, { platform: process.platform });
  if (loaded.status === "absent") {
    if (allowAbsent) return null;
    throw new CliError("SQ-NOT-FOUND", EXIT.NOT_FOUND, "slice queue file does not exist", { path: displayPath(path) });
  }
  return loaded;
}
const displayPath = (path) => path;

function invalidQueue(loaded) {
  return new CliError(loaded.errors[0]?.code ?? "SQ-SCHEMA", EXIT.INVALID, "slice queue is invalid", { errors: loaded.errors, warnings: loaded.warnings });
}

/** Temp file + rename in the same directory. A failure removes the temp file. */
export function writeQueueAtomic(path, queue) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temp = join(directory, `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(queue, null, 2)}\n`, { flag: "wx" });
    renameSync(temp, path);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch { /* already gone */ }
    throw new CliError("SQ-IO", EXIT.IO, `could not write the slice queue (${error?.code ?? "error"})`);
  }
}

/** Validates the mutated raw queue; refuses (exit 3) without writing when it is not valid. */
function commit(path, mutated, extra) {
  const validation = validateSliceQueue(mutated, { platform: process.platform });
  if (!validation.ok) throw new CliError(validation.errors[0].code, EXIT.INVALID, "the change would make the queue invalid; nothing was written", { errors: validation.errors, warnings: validation.warnings });
  writeQueueAtomic(path, mutated);
  return { warnings: validation.warnings, ...extra };
}

function findSlice(queue, id) {
  const found = queue.slices.find((item) => item?.id === id);
  if (found === undefined) throw new CliError("SQ-NOT-FOUND", EXIT.NOT_FOUND, `no slice ${String(id).slice(0, 60)} in the queue`, { sliceId: id });
  return found;
}

// ------------------------------------------------------------------ ledger plumbing

function ledgerTarget(flags, { required, verb }) {
  if (flags.session === undefined) {
    if (required) throw usage(`${verb}: --session <id> is required (the ledger is per session)`);
    return null;
  }
  let commonDir = flags["common-dir"];
  if (commonDir === undefined) {
    const git = spawnSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8", timeout: 30_000 });
    if (git.status !== 0 || typeof git.stdout !== "string" || git.stdout.trim() === "") throw new CliError("SQ-IO", EXIT.IO, "cannot resolve the git common directory; pass --common-dir");
    commonDir = resolve(git.stdout.trim());
  }
  return { commonDir: resolve(commonDir), runner: flags.runner ?? "claude", sessionId: flags.session };
}
function ledgerAppend(target, event, now) {
  try {
    return appendEvent(target.commonDir, target.runner, target.sessionId, event, { now }).event;
  } catch (error) {
    if (error instanceof FanoutLedgerError) throw new CliError(error.code, error.code === "FANOUT-EVENT-INVALID" || error.code === "FANOUT-ARGUMENT" ? EXIT.USAGE : EXIT.IO, error.message);
    throw new CliError("SQ-IO", EXIT.IO, `ledger write failed (${error?.code ?? "error"})`);
  }
}
function ledgerCall(run) {
  try {
    return run();
  } catch (error) {
    if (error instanceof CliError) throw error;
    if (error instanceof FanoutLedgerError) throw new CliError(error.code, error.code === "FANOUT-ARGUMENT" ? EXIT.USAGE : EXIT.IO, error.message);
    throw new CliError("SQ-IO", EXIT.IO, `ledger read failed (${error?.code ?? "error"})`);
  }
}

function loadRecords(evidenceDir, sliceIds) {
  const records = [];
  for (const id of sliceIds) {
    const path = join(evidenceDir, `dispatch-record-${id}.json`);
    try {
      const info = statSync(path);
      if (!info.isFile() || info.size > MAX_RECORD_BYTES) continue;
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed?.taskId !== id || typeof parsed.outcome !== "string") continue;
      records.push({ taskId: id, outcome: parsed.outcome, outcomeClassification: parsed.outcomeClassification, mtimeMs: Math.round(info.mtimeMs) });
    } catch { /* an absent or unreadable record is simply no record */ }
  }
  return records;
}

function staleMinutes(flags) {
  if (flags["stale-after-minutes"] === undefined) return undefined;
  const value = Number(flags["stale-after-minutes"]);
  if (!Number.isFinite(value) || value <= 0) throw usage("--stale-after-minutes must be a positive number");
  return value;
}

function deriveStatus(flags, loaded) {
  const now = nowMs(flags);
  const sliceIds = loaded.raw.slices.map((item) => item?.id).filter((id) => typeof id === "string");
  const evidenceDir = resolve(flags["evidence-dir"] ?? "evidence");
  const records = loadRecords(evidenceDir, sliceIds);
  const target = ledgerTarget(flags, { required: false, verb: "next" });
  const stale = staleMinutes(flags);
  const live = target === null
    ? []
    : ledgerCall(() => liveSlices({ ...target, evidenceDir, sliceIds, now, ...(stale === undefined ? {} : { staleAfterMinutes: stale }) }));
  const status = readyAndLive({ queue: loaded.raw, records, live, now }, { platform: process.platform, ...(stale === undefined ? {} : { staleAfterMinutes: stale }) });
  return { status, target, now };
}

// ------------------------------------------------------------------ verbs

function verbValidate({ flags }) {
  const loaded = loadRaw(resolve(flags.queue));
  if (loaded.status !== "valid") throw invalidQueue(loaded);
  return { status: "valid", errors: [], warnings: loaded.warnings, slices: loaded.queue.slices.length };
}

function verbNext({ flags }) {
  const loaded = loadRaw(resolve(flags.queue));
  if (loaded.status !== "valid") throw invalidQueue(loaded);
  let limit = null;
  if (flags.limit !== undefined) {
    limit = Number(flags.limit);
    if (!Number.isSafeInteger(limit) || limit < 1) throw usage("--limit must be a positive integer");
  }
  const { status } = deriveStatus(flags, loaded);
  const ready = limit === null ? status.ready : status.ready.slice(0, limit);
  return {
    next: ready[0] ?? null,
    ready,
    live: status.live,
    silent: status.silent,
    held: status.held,
    blocked: status.blocked,
    foreignLive: status.foreignLive,
    counts: status.counts,
    warnings: status.warnings,
  };
}

function verbAdd({ flags }) {
  const path = resolve(flags.queue);
  const loaded = loadRaw(path, { allowAbsent: true });
  let raw;
  if (loaded === null) {
    if (flags["init-feature"] === undefined) throw new CliError("SQ-NOT-FOUND", EXIT.NOT_FOUND, "slice queue file does not exist; pass --init-feature <feature> to create it");
    raw = { schema: SLICE_QUEUE_SCHEMA, feature: flags["init-feature"], slices: [] };
  } else {
    if (loaded.status !== "valid") throw invalidQueue(loaded);
    if (flags["init-feature"] !== undefined) throw usage("add: --init-feature is only for a queue that does not exist yet");
    raw = structuredClone(loaded.raw);
  }
  const id = requireText(flags, "id", "add");
  const title = requireText(flags, "title", "add");
  if (!flags["write-scope"]?.length) throw usage("add: at least one --write-scope is required");
  const state = flags.state ?? "ready";
  const entry = {
    id,
    title,
    state,
    ...(flags["hold-reason"] === undefined ? {} : { holdReason: flags["hold-reason"] }),
    ...(flags["depends-on"] === undefined ? {} : { dependsOn: flags["depends-on"] }),
    writeScope: flags["write-scope"],
    ...(flags["read-scope"] === undefined ? {} : { readScope: flags["read-scope"] }),
    tier: flags.tier ?? raw.defaults?.tier ?? "implementor",
    ...(flags["tier-reason"] === undefined ? {} : { tierReason: flags["tier-reason"] }),
    commitMode: flags["commit-mode"] ?? raw.defaults?.commitMode ?? "diff-only",
    loadClass: flags["load-class"] ?? raw.defaults?.loadClass ?? "light",
    ...(flags.briefing === undefined ? {} : { briefing: { ref: flags.briefing } }),
  };
  if (flags["estimated-tool-calls"] !== undefined) {
    const estimate = Number(flags["estimated-tool-calls"]);
    if (!Number.isSafeInteger(estimate)) throw usage("--estimated-tool-calls must be an integer");
    entry.estimatedToolCalls = estimate;
  }
  for (const [name, allowed, value] of [["tier", SLICE_TIERS, entry.tier], ["commit-mode", COMMIT_MODES, entry.commitMode], ["load-class", LOAD_CLASSES, entry.loadClass]]) {
    if (!allowed.includes(value)) throw usage(`add: --${name} must be one of ${allowed.join("|")}`);
  }
  raw.slices.push(entry);
  return commit(path, raw, { added: id, created: loaded === null });
}

function declare(verb, { positional, flags }, state, holdReason, kind) {
  const path = resolve(flags.queue);
  const loaded = loadRaw(path);
  if (loaded.status !== "valid") throw invalidQueue(loaded);
  const raw = structuredClone(loaded.raw);
  const entry = findSlice(raw, positional[0]);
  entry.state = state;
  entry.holdReason = holdReason;
  const result = commit(path, raw, { sliceId: entry.id, state });
  const target = ledgerTarget(flags, { required: false, verb });
  if (target !== null) result.event = ledgerAppend(target, { type: "declined", sliceId: entry.id, kind, reasonSha256: sha256(holdReason) }, nowMs(flags));
  return result;
}
const verbDefer = (parsed) => declare("defer", parsed, "deferred", requireText(parsed.flags, "reason", "defer"), "defer");
function verbHold(parsed) {
  const { flags } = parsed;
  if ((flags["po-question"] === undefined) === (flags["external-reason"] === undefined)) throw usage("hold: give exactly one of --po-question or --external-reason");
  if (flags["po-question"] !== undefined) return declare("hold", parsed, "hold-po", requireText(flags, "po-question", "hold"), "hold");
  return declare("hold", parsed, "blocked-external", requireText(flags, "external-reason", "hold"), "hold");
}

function verbDepend({ positional, flags }) {
  const [id, dep] = positional;
  const path = resolve(flags.queue);
  const loaded = loadRaw(path);
  if (loaded.status !== "valid") throw invalidQueue(loaded);
  const raw = structuredClone(loaded.raw);
  const entry = findSlice(raw, id);
  findSlice(raw, dep);
  entry.dependsOn = [...new Set([...(entry.dependsOn ?? []), dep])];
  return commit(path, raw, { sliceId: id, dependsOn: entry.dependsOn });
}

function verbPause({ flags }) {
  const by = flags.by;
  if (by !== "po" && by !== "elephant") throw usage("pause: --by must be po or elephant");
  const reason = requireText(flags, "reason", "pause");
  const now = nowMs(flags);
  const until = Date.parse(flags.until ?? "");
  if (!Number.isFinite(until) || !/Z$/u.test(flags.until)) throw usage("pause: --until must be an ISO-8601 UTC timestamp");
  if (until <= now) throw usage("pause: --until must be in the future");
  if (until - now > MAX_PAUSE_MS) throw usage("pause: a pause is at most 4 hours");
  const target = ledgerTarget(flags, { required: true, verb: "pause" });
  const event = ledgerAppend(target, { type: "pause", by, untilAt: new Date(until).toISOString(), reasonSha256: sha256(reason) }, now);
  return { event };
}

function knownSlice(flags, id) {
  const loaded = loadRaw(resolve(flags.queue));
  if (loaded.status !== "valid") throw invalidQueue(loaded);
  findSlice(loaded.raw, id);
}

function verbReap({ positional, flags }) {
  const reason = requireText(flags, "reason", "reap");
  const target = ledgerTarget(flags, { required: true, verb: "reap" });
  knownSlice(flags, positional[0]);
  return { sliceId: positional[0], event: ledgerAppend(target, { type: "finish", sliceId: positional[0], how: "reap", reasonSha256: sha256(reason) }, nowMs(flags)) };
}

function verbFinish({ positional, flags }) {
  const how = flags.how ?? "elephant";
  if (!FANOUT_FINISH_HOWS.includes(how) || how === "reap") throw usage(`finish: --how must be one of ${FANOUT_FINISH_HOWS.filter((item) => item !== "reap").join("|")} (use the reap verb for reap)`);
  const target = ledgerTarget(flags, { required: true, verb: "finish" });
  knownSlice(flags, positional[0]);
  return { sliceId: positional[0], event: ledgerAppend(target, { type: "finish", sliceId: positional[0], how }, nowMs(flags)) };
}

const MINUTE_MS = 60_000;
function summariseLedger(events, now) {
  const counts = Object.fromEntries(["launch", "finish", "stop-eval", "block", "declined", "pause", "defied"].map((type) => [type, 0]));
  for (const event of events) counts[event.type] += 1;
  const evals = events.filter((event) => event.type === "stop-eval");
  let idleSlotMs = 0;
  let readyMs = 0;
  let ratioMs = 0;
  for (let index = 0; index < evals.length - 1; index += 1) {
    const current = evals[index];
    const span = Math.max(0, Date.parse(evals[index + 1].at) - Date.parse(current.at));
    if (current.ready > 0) {
      idleSlotMs += Math.max(0, current.target - current.live) * span;
      if (current.target > 0) {
        readyMs += span;
        ratioMs += (current.live / current.target) * span;
      }
    }
  }
  const pauseMinutes = { po: 0, elephant: 0 };
  for (const event of events) if (event.type === "pause") pauseMinutes[event.by] += Math.max(0, Math.min(Date.parse(event.untilAt), Math.max(now, Date.parse(event.at))) - Date.parse(event.at)) / MINUTE_MS;
  return {
    events: counts,
    slotIdleMinutesWithReady: Math.round(idleSlotMs / MINUTE_MS),
    meanLiveOverTargetWhileReady: readyMs === 0 ? null : Math.round((ratioMs / readyMs) * 1000) / 1000,
    blocks: counts.block,
    defied: counts.defied,
    declaredDefers: events.filter((event) => event.type === "declined").length,
    pauseMinutes: { po: Math.round(pauseMinutes.po), elephant: Math.round(pauseMinutes.elephant) },
    slicesLaunched: new Set(events.filter((event) => event.type === "launch").map((event) => event.sliceId)).size,
  };
}

function verbReport({ flags }) {
  const loaded = loadRaw(resolve(flags.queue));
  if (loaded.status !== "valid") throw invalidQueue(loaded);
  const { status, target, now } = deriveStatus(flags, loaded);
  const ledger = target === null ? null : ledgerCall(() => {
    const read = readEvents(target.commonDir, target.runner, target.sessionId);
    return { skippedLines: read.skipped, ...summariseLedger(read.events, now) };
  });
  return { queue: { feature: loaded.queue.feature, size: loaded.queue.slices.length, counts: status.counts, ready: status.ready.length }, ledger };
}

const HANDLERS = { validate: verbValidate, next: verbNext, add: verbAdd, defer: verbDefer, hold: verbHold, depend: verbDepend, pause: verbPause, reap: verbReap, finish: verbFinish, report: verbReport };

/** Runs the CLI; returns `{ exit, output }` (never throws, never writes). */
export function runCli(argv) {
  let verb = null;
  try {
    const parsed = parseArguments(argv);
    verb = parsed.verb;
    return { exit: EXIT.OK, output: { schema: CLI_SCHEMA, verb, ok: true, ...HANDLERS[verb](parsed) } };
  } catch (error) {
    if (error instanceof CliError) return { exit: error.exit, output: { schema: CLI_SCHEMA, verb, ok: false, code: error.code, message: error.message, ...error.extra } };
    return { exit: EXIT.IO, output: { schema: CLI_SCHEMA, verb, ok: false, code: "SQ-IO", message: `unexpected failure (${error?.code ?? error?.name ?? "error"})` } };
  }
}

if (isDirectInvocation(import.meta.url)) {
  const { exit, output } = runCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = exit;
}

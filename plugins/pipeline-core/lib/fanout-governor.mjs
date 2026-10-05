// SPDX-License-Identifier: SUL-1.0
/**
 * FANOUT slice S3: the fan-out stop governor (pure decision core).
 *
 * Design: specs/sprint-alfred-epic/design/fanout-enforcement-design.md section 3.3
 * (rule table, block text, modes), 3.6 (load and tier caps), 4 (failure modes) and
 * 6 (row "S3 governor").
 *
 * PURE: no hook wiring, no file access, no clock of its own beyond the injected
 * `now`. Every observation is INJECTED by an adapter:
 *   input    the parsed Stop-hook payload (`agent_id`/`agent_type` identify a subagent,
 *            `stop_hook_active` is the host's continuation flag)
 *   queue    a `loadSliceQueue()` result (`status`, `raw`, `errors`, `mtimeMs`)
 *   ledger   `{ events, live, records, heartbeats?, stateWritable?, error? }`: the
 *            session's `readEvents().events`, `liveSlices()` entries, dispatch-record
 *            like `{ taskId, outcome, ... }` objects (what `readyAndLive` consumes) and
 *            the adapter's own verdict on the private state directory
 *   config   `resolveFanoutConfig()` input (every number is a tunable, see below)
 *   now      milliseconds, or a function returning them (read ONCE)
 * and the result is `{ decision, reasonCode, reason?, telemetry }`. `decision` is the
 * EFFECTIVE verdict for the adapter: "block" only in `enforce` mode on rule 10.
 * `reason` is present only when text is meant to reach the model (the block reason in
 * `enforce`, an advisory line in `advisory`). `telemetry.wouldDecision` is what the
 * rules decided before the mode filter (the shadow-mode acceptance data) and
 * `telemetry.events` are ledger events (`stop-eval`, `block`, `defied`) the adapter
 * appends as returned. The function NEVER throws: any fault is FANOUT-FAILOPEN.
 *
 * Open PO questions are NOT decided here, they are inputs with the design's defaults:
 * Q1 (hard block): default mode is `shadow`, `enforce` is opt-in; Q2 (target/ceiling):
 * `target` 4, `maxTarget` 6, both tunable; Q6 (pause authority): `pauseAuthorities`
 * defaults to both, tunable.
 *
 * Privacy / prompt-injection rule: the only text that can reach the model is built from
 * fixed strings, validated slice ids, enum values, counters, validated briefing paths
 * and `SQ-*` error codes. Slice titles, hold reasons, tier reasons and validator
 * messages never leave this module.
 *
 * Judgement calls where the design is silent (strictest reading chosen):
 *   - Rule 1 also covers an unusable ledger argument (not an object, `stateWritable ===
 *     false`, a truthy `error`, or a non-array `events`/`live`/`records`/`heartbeats`).
 *   - Rule 2: a clean orchestrator payload carries NEITHER `agent_id` nor `agent_type`
 *     (the measured discriminator of guard-dispatch-budget). Anything else, including a
 *     blank or non-string `agent_id`, is not a clean orchestrator and is never governed.
 *   - Rule 3: `config.requiresEnforcement` is the injected result of
 *     `observeGovernanceScope(...).requiresEnforcement`; only a literal `true` governs.
 *   - Rule 4: an unusable queue never blocks. An absent queue earns an advisory line only
 *     while `config.implementationPhaseActive` is true; an invalid, stale or age-unknown
 *     queue always earns one (advisory/enforce modes only). A queue the loader called
 *     valid but that fails re-validation here counts as invalid. An unknown queue age is
 *     treated like a stale one (never a block on an infrastructure uncertainty).
 *   - Rule 5: a pause ends at min(`untilAt`, recorded-at + `maxPauseMinutes`); the cap is
 *     a hard maximum of 240 min that config can only lower. Pauses by an authority not
 *     in `pauseAuthorities` are ignored.
 *   - Rule 6: the queue deadline and `config.cutoffAt` (ISO string or ms) end enforcement
 *     once `now` has reached them.
 *   - Rule 8: `slots = max(0, min(effectiveTarget - live, loadUnitsFree))`. Live slices
 *     the queue does not know (`foreignLive`) hold one slot and one load unit. The ready
 *     slices are then packed in queue order against the free load units, the tier caps
 *     and the WSL test-slot cap; a block that could not start any ready slice for such a
 *     cap is FANOUT-FULL, because a block must convert into dispatches. The queue has no
 *     field saying which briefings run WSL tests, so every test-heavy slice counts
 *     against `wslTestSlots` (default 2 on win32/WSL, off elsewhere).
 *   - Rule 9: "3rd consecutive block without a launch" = 2 `block` events since the last
 *     `launch` event (ledger file order); `stop_hook_active === true` counts only when
 *     OUR block is the last thing recorded (a continuation caused by another hook with no
 *     block of ours is not our loop). The sub-cause is `telemetry.defiedBy`
 *     (FANOUT-DEFIED-BLOCKS | -ACTIVE | -CAP) and feeds the `defied` event.
 *   - Rules 1-4 log nothing (`events: []`): live/ready are not known there and a
 *     subagent's turn end must not spam the ledger. Rules 5-10 log one `stop-eval`.
 *   - Advisory mode labels its text FANOUT-ADVISORY instead of FANOUT-BLOCK.
 */
import { DEFAULT_STALE_AFTER_MINUTES, SLICE_TIERS, readyAndLive } from "./slice-queue.mjs";

export const FANOUT_MODES = Object.freeze(["off", "shadow", "advisory", "enforce"]);
/** Reason codes in rule order: `FANOUT_RULES[n - 1]` is the code of rule n. */
export const FANOUT_RULES = Object.freeze([
  "FANOUT-FAILOPEN",
  "FANOUT-NOT-ORCHESTRATOR",
  "FANOUT-OFF",
  "FANOUT-NO-QUEUE",
  "FANOUT-PAUSED",
  "FANOUT-CUTOFF",
  "FANOUT-NO-READY",
  "FANOUT-FULL",
  "FANOUT-DEFIED",
  "FANOUT-BLOCK",
]);
/** Host-stability weights (design 3.6). */
export const LOAD_WEIGHTS = Object.freeze({ light: 1, "test-heavy": 2 });
/** The 3rd consecutive block without a launch is the one that is NOT issued. */
export const MAX_CONSECUTIVE_BLOCKS = 3;
/** The adapter substitutes the real plugin root; the governor never knows a host path. */
export const PLUGIN_ROOT_PLACEHOLDER = "<plugin-root>";
/** A pause can never be longer than this, whatever the configuration says. */
export const HARD_MAX_PAUSE_MINUTES = 240;
export const DEFAULT_FANOUT_CONFIG = Object.freeze({
  mode: "shadow",
  target: 4,
  maxTarget: 6,
  maxLoadUnitsConstrained: 4,
  maxLoadUnitsOther: 6,
  wslTestSlots: 2,
  tierCaps: Object.freeze({ critic: 1, deep: 2 }),
  staleAfterMinutes: DEFAULT_STALE_AFTER_MINUTES,
  staleQueueHours: 48,
  maxBlocksPerSession: 12,
  maxPauseMinutes: HARD_MAX_PAUSE_MINUTES,
  pauseAuthorities: Object.freeze(["po", "elephant"]),
});

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const LIST_LIMIT = 5;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SAFE_REF = /^[A-Za-z0-9._@+/-]{1,200}$/u;
const SAFE_QUEUE_CODE = /^SQ-[A-Z0-9-]{1,40}$/u;
const SAFE_FAULT = /^[A-Z][A-Z0-9_-]{0,63}$/u;
const PAUSE_AUTHORITIES = Object.freeze(["po", "elephant"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const safeId = (value) => (typeof value === "string" && SAFE_ID.test(value) ? value : "(invalid-id)");
const safeRef = (value) => (typeof value === "string" && SAFE_REF.test(value) && !value.includes("..") ? value : null);
const safeTier = (value) => (SLICE_TIERS.includes(value) ? value : "unknown");
const safeLoad = (value) => (Object.hasOwn(LOAD_WEIGHTS, value) ? value : "light");
const weightOf = (loadClass) => LOAD_WEIGHTS[safeLoad(loadClass)];
const intIn = (value, min, max) => (Number.isSafeInteger(value) && value >= min && value <= max ? value : null);
const positive = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);
const minutes = (value) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

function faultError(code) {
  return Object.assign(new Error("fanout fault"), { code });
}
function faultOf(error) {
  try {
    const code = error?.code;
    return typeof code === "string" && SAFE_FAULT.test(code) ? code : "EXCEPTION";
  } catch {
    return "EXCEPTION";
  }
}
function resolveNow(now) {
  const value = now === undefined ? Date.now() : typeof now === "function" ? now() : now;
  if (typeof value !== "number" || !Number.isFinite(value)) throw faultError("NOW");
  return value;
}

// ------------------------------------------------------------------ configuration

/**
 * Resolves the injected configuration. Anything unusable falls back to the design's
 * default (never to a stricter or looser mode than `shadow`). Returns a plain object:
 * `mode`, `modeDefaulted`, `requiresEnforcement`, `implementationPhaseActive`,
 * `platform`, `isWsl`, `target`, `maxTarget`, `effectiveTarget`, `maxLoadUnits`,
 * `wslTestSlots` (`null` = no cap), `tierCaps` (`null` = no cap for that tier),
 * `staleAfterMinutes`, `staleQueueHours`, `maxBlocksPerSession`, `maxPauseMinutes`,
 * `pauseAuthorities`, `cutoffMs`, `queueOptions`.
 */
export function resolveFanoutConfig(config) {
  const source = config === undefined || config === null ? {} : config;
  if (!isObject(source)) throw faultError("CONFIG");
  const mode = FANOUT_MODES.includes(source.mode) ? source.mode : DEFAULT_FANOUT_CONFIG.mode;
  const platform = typeof source.platform === "string" && source.platform !== "" ? source.platform : process.platform;
  const isWsl = source.isWsl === true;
  const constrained = platform === "win32" || isWsl;
  const target = intIn(source.target, 0, 1000) ?? DEFAULT_FANOUT_CONFIG.target;
  const maxTarget = intIn(source.maxTarget, 0, 1000) ?? DEFAULT_FANOUT_CONFIG.maxTarget;
  let wslTestSlots = constrained ? DEFAULT_FANOUT_CONFIG.wslTestSlots : null;
  if (source.wslTestSlots === null) wslTestSlots = null;
  else if (intIn(source.wslTestSlots, 0, 1000) !== null) wslTestSlots = source.wslTestSlots;
  const tierCaps = { ...DEFAULT_FANOUT_CONFIG.tierCaps };
  if (isObject(source.tierCaps)) {
    for (const tier of SLICE_TIERS) {
      if (!Object.hasOwn(source.tierCaps, tier)) continue;
      const value = source.tierCaps[tier];
      if (value === null) tierCaps[tier] = null;
      else if (intIn(value, 0, 1000) !== null) tierCaps[tier] = value;
    }
  }
  const authorities = Array.isArray(source.pauseAuthorities) && source.pauseAuthorities.every((by) => PAUSE_AUTHORITIES.includes(by))
    ? [...new Set(source.pauseAuthorities)]
    : [...DEFAULT_FANOUT_CONFIG.pauseAuthorities];
  const cutoff = typeof source.cutoffAt === "number" ? source.cutoffAt : typeof source.cutoffAt === "string" ? Date.parse(source.cutoffAt) : Number.NaN;
  return {
    mode,
    modeDefaulted: source.mode !== undefined && !FANOUT_MODES.includes(source.mode),
    requiresEnforcement: source.requiresEnforcement === true,
    implementationPhaseActive: source.implementationPhaseActive === true,
    platform,
    isWsl,
    target,
    maxTarget,
    effectiveTarget: Math.min(target, maxTarget),
    maxLoadUnits: intIn(source.maxLoadUnits, 1, 1000) ?? (constrained ? DEFAULT_FANOUT_CONFIG.maxLoadUnitsConstrained : DEFAULT_FANOUT_CONFIG.maxLoadUnitsOther),
    wslTestSlots,
    tierCaps,
    staleAfterMinutes: positive(source.staleAfterMinutes) ?? DEFAULT_FANOUT_CONFIG.staleAfterMinutes,
    staleQueueHours: positive(source.staleQueueHours) ?? DEFAULT_FANOUT_CONFIG.staleQueueHours,
    maxBlocksPerSession: intIn(source.maxBlocksPerSession, 1, 1000) ?? DEFAULT_FANOUT_CONFIG.maxBlocksPerSession,
    maxPauseMinutes: intIn(source.maxPauseMinutes, 1, HARD_MAX_PAUSE_MINUTES) ?? DEFAULT_FANOUT_CONFIG.maxPauseMinutes,
    pauseAuthorities: authorities,
    cutoffMs: Number.isFinite(cutoff) ? cutoff : null,
    queueOptions: isObject(source.queueOptions) ? source.queueOptions : {},
  };
}

// ------------------------------------------------------------------ results

function failOpen(mode, fault) {
  return {
    decision: "allow",
    reasonCode: FANOUT_RULES[0],
    telemetry: { mode, rule: 1, reasonCode: FANOUT_RULES[0], wouldDecision: "allow", fault, events: [] },
  };
}
function modeHint(config) {
  try {
    return FANOUT_MODES.includes(config?.mode) ? config.mode : DEFAULT_FANOUT_CONFIG.mode;
  } catch {
    return DEFAULT_FANOUT_CONFIG.mode;
  }
}
function quiet(rule, cfg, extra = {}, reason = undefined) {
  const reasonCode = FANOUT_RULES[rule - 1];
  const result = {
    decision: "allow",
    reasonCode,
    telemetry: { mode: cfg.mode, ...(cfg.modeDefaulted ? { modeDefaulted: true } : {}), rule, reasonCode, wouldDecision: "allow", ...extra, events: [] },
  };
  if (reason !== undefined) result.reason = reason;
  return result;
}

// ------------------------------------------------------------------ rule 1 / rule 4 helpers

function ledgerFault(ledger) {
  if (!isObject(ledger)) return "LEDGER";
  if (ledger.stateWritable === false) return "STATE-UNWRITABLE";
  if (ledger.error !== undefined && ledger.error !== null && ledger.error !== false) return "LEDGER-ERROR";
  for (const key of ["events", "live", "records", "heartbeats"]) {
    if (ledger[key] !== undefined && !Array.isArray(ledger[key])) return "LEDGER-SHAPE";
  }
  return null;
}
function errorCodes(list) {
  if (!Array.isArray(list)) return [];
  const codes = [];
  for (const item of list) {
    const code = isObject(item) ? item.code : null;
    if (typeof code === "string" && SAFE_QUEUE_CODE.test(code) && !codes.includes(code)) codes.push(code);
  }
  return codes.slice(0, LIST_LIMIT);
}
function assessQueue(queue, cfg, nowMs) {
  const info = isObject(queue) ? queue : null;
  const status = info === null ? "absent" : info.status;
  if (status === "absent") return { state: "absent" };
  if (status !== "valid" || !isObject(info.raw)) return { state: "invalid", codes: errorCodes(info?.errors) };
  const mtime = info.mtimeMs;
  if (typeof mtime !== "number" || !Number.isFinite(mtime)) return { state: "age-unknown" };
  const ageMs = nowMs - mtime;
  if (ageMs > cfg.staleQueueHours * HOUR_MS) return { state: "stale", ageHours: Math.floor(ageMs / HOUR_MS) };
  return { state: "ok", ageHours: Math.max(0, Math.floor(ageMs / HOUR_MS)) };
}
function noQueueText(assessment, cfg) {
  const root = PLUGIN_ROOT_PLACEHOLDER;
  if (assessment.state === "absent") {
    return `FANOUT-NO-QUEUE: no slice queue is declared for the active feature, so fan-out is not governed. Declare slices: node ${root}/scripts/slice-queue.mjs add`;
  }
  if (assessment.state === "invalid") {
    const codes = Array.isArray(assessment.codes) && assessment.codes.length > 0 ? ` (${assessment.codes.join(", ")})` : "";
    return `FANOUT-NO-QUEUE: the slice queue is invalid${codes}, so fan-out is not governed until it validates. Run: node ${root}/scripts/slice-queue.mjs validate`;
  }
  if (assessment.state === "stale") {
    return `FANOUT-NO-QUEUE: the slice queue was last edited ${assessment.ageHours} h ago (limit ${cfg.staleQueueHours} h), so fan-out is not governed. Touch or re-declare it: node ${root}/scripts/slice-queue.mjs validate`;
  }
  return "FANOUT-NO-QUEUE: the age of the slice queue could not be read, so fan-out is not governed.";
}
function noQueue(cfg, assessment) {
  const wantsLine = (cfg.mode === "advisory" || cfg.mode === "enforce") && (assessment.state !== "absent" || cfg.implementationPhaseActive);
  const queue = { state: assessment.state, ...(Array.isArray(assessment.codes) ? { errorCodes: assessment.codes } : {}), ...(assessment.ageHours === undefined ? {} : { ageHours: assessment.ageHours }) };
  return quiet(4, cfg, { queue }, wantsLine ? noQueueText(assessment, cfg) : undefined);
}

// ------------------------------------------------------------------ rule 8 / 10 helpers

/** Packs the ready slices, in queue order, into the free slots without breaking a cap. */
function planDispatch(ready, byId, slots, free, liveEntries, cfg) {
  const tierLive = {};
  let heavyLive = 0;
  for (const entry of liveEntries) {
    tierLive[entry.tier] = (tierLive[entry.tier] ?? 0) + 1;
    if (entry.loadClass === "test-heavy") heavyLive += 1;
  }
  const plan = [];
  const deferred = [];
  const plannedTier = {};
  let plannedUnits = 0;
  let plannedHeavy = 0;
  for (const id of ready) {
    if (plan.length >= slots) break;
    const slice = byId.get(id);
    const weight = weightOf(slice?.loadClass);
    const tierCap = cfg.tierCaps[slice?.tier];
    if (plannedUnits + weight > free) deferred.push({ sliceId: id, cap: "load" });
    else if (typeof tierCap === "number" && (tierLive[slice.tier] ?? 0) + (plannedTier[slice.tier] ?? 0) >= tierCap) deferred.push({ sliceId: id, cap: "tier" });
    else if (slice?.loadClass === "test-heavy" && cfg.wslTestSlots !== null && heavyLive + plannedHeavy >= cfg.wslTestSlots) deferred.push({ sliceId: id, cap: "wsl-test" });
    else {
      plan.push(id);
      plannedUnits += weight;
      plannedTier[slice?.tier] = (plannedTier[slice?.tier] ?? 0) + 1;
      if (slice?.loadClass === "test-heavy") plannedHeavy += 1;
    }
  }
  return { plan, deferred };
}
function blockedPhrase(reason) {
  const list = (value) => (Array.isArray(value) ? value.map(safeId).join(", ") : "");
  switch (reason?.code) {
    case "dependency": return `waits on ${list(reason.waitsOn)}`;
    case "dependency-cancelled": return `depends on cancelled ${list(reason.waitsOn)}`;
    case "scope-overlap": return `scope overlaps live ${list(reason.with)}`;
    case "protected-live": return `waits for live protected ${list(reason.with)}`;
    case "commit-live": return `waits for live self-commit ${list(reason.with)}`;
    default: return "cannot start yet";
  }
}
function deferredPhrase(item, byId, cfg) {
  const slice = byId.get(item.sliceId);
  if (item.cap === "tier") return `${safeId(item.sliceId)} waits for a free ${safeTier(slice?.tier)} slot (cap ${cfg.tierCaps[slice?.tier]})`;
  if (item.cap === "wsl-test") return `${safeId(item.sliceId)} waits for a free test slot (cap ${cfg.wslTestSlots})`;
  return `${safeId(item.sliceId)} waits for load capacity`;
}
/** The model-facing text of design 3.3, built only from validated ids, enums, counters and refs. */
function renderText(header, facts) {
  const { slots, ready, live, target, used, cap, plan, byId, silent, blocked, deferred, cfg } = facts;
  const root = PLUGIN_ROOT_PLACEHOLDER;
  const refs = plan.map((id) => safeRef(byId.get(id)?.briefingRef)).filter((ref) => ref !== null);
  const dispatch = plan.map((id) => `${safeId(id)} (${safeTier(byId.get(id)?.tier)}, ${safeLoad(byId.get(id)?.loadClass)})`).join(", ");
  const text = [
    `${header}: ${slots} free slot(s), ${ready} ready slice(s), live ${live}/${target} (${used}/${cap} load units).`,
    `Dispatch now, in ONE message: ${dispatch}${refs.length > 0 ? `   briefings: ${refs.join(", ")}` : ""}`,
  ];
  if (silent.length > 0) {
    text.push(`Silent live slice(s): ${silent.slice(0, LIST_LIMIT).map((item) => `${safeId(item.sliceId)} idle ${item.silentMinutes} min`).join(", ")} -> check diff activity.`);
  }
  const why = [
    ...blocked.map((item) => `${safeId(item.sliceId)} ${(Array.isArray(item.reasons) ? item.reasons : []).map(blockedPhrase).join(" and ") || "cannot start yet"}`),
    ...deferred.map((item) => deferredPhrase(item, byId, cfg)),
  ];
  if (why.length > 0) {
    const shown = why.slice(0, LIST_LIMIT);
    if (why.length > LIST_LIMIT) shown.push(`(+${why.length - LIST_LIMIT} more)`);
    text.push(`Not startable and why: ${shown.join("; ")}.`);
  }
  text.push(
    "If you disagree with a slice, declare it instead of stopping silently:",
    `  node ${root}/scripts/slice-queue.mjs defer <id> --reason "<one line>"   (or hold <id> --po-question, or depend <id> <dep>)`,
  );
  return text.join("\n");
}

// ------------------------------------------------------------------ the governor

function evaluate(args) {
  if (!isObject(args)) throw faultError("ARGUMENTS");
  const { input, queue, ledger } = args;
  const cfg = resolveFanoutConfig(args.config);
  const nowMs = resolveNow(args.now);
  const mode = cfg.mode;

  // rule 1: unusable input or state fails open
  if (!isObject(input)) return failOpen(mode, "INPUT");
  const fault = ledgerFault(ledger);
  if (fault !== null) return failOpen(mode, fault);

  // rule 2: only the orchestrator is governed (a clean payload carries neither identity key)
  const hasId = Object.hasOwn(input, "agent_id");
  const hasType = Object.hasOwn(input, "agent_type");
  if (hasId || hasType) {
    return quiet(2, cfg, { identity: hasId && typeof input.agent_id === "string" && input.agent_id.trim() !== "" ? "subagent" : "unresolved" });
  }
  // rule 3: consumer opt-in / mode off
  if (!cfg.requiresEnforcement || mode === "off") return quiet(3, cfg, { identity: "orchestrator" });

  // rule 4: no usable queue
  const assessment = assessQueue(queue, cfg, nowMs);
  if (assessment.state !== "ok") return noQueue(cfg, assessment);
  const derived = readyAndLive(
    { queue: queue.raw, records: ledger.records ?? [], live: ledger.live ?? [], heartbeats: ledger.heartbeats ?? [], now: nowMs },
    { ...cfg.queueOptions, platform: cfg.platform, staleAfterMinutes: cfg.staleAfterMinutes },
  );
  if (!derived.valid) return noQueue(cfg, { state: "invalid", codes: errorCodes(derived.errors) });

  // counters
  const byId = new Map(derived.slices.map((summary) => [summary.id, summary]));
  const liveEntries = derived.live;
  const foreignCount = derived.foreignLive.length;
  const liveCount = liveEntries.length + foreignCount;
  const used = liveEntries.reduce((sum, entry) => sum + weightOf(entry.loadClass), 0) + foreignCount;
  const free = Math.max(0, cfg.maxLoadUnits - used);
  const slots = Math.max(0, Math.min(cfg.effectiveTarget - liveCount, free));
  const ready = derived.ready;
  const { plan, deferred } = planDispatch(ready, byId, slots, free, liveEntries, cfg);
  const silent = derived.silent.map((item) => ({ sliceId: safeId(item.sliceId), silentMinutes: minutes(item.silentMinutes) }));
  const events = Array.isArray(ledger.events) ? ledger.events : [];
  let blocks = 0;
  let sinceLaunch = 0;
  let lastBlock = -1;
  events.forEach((event, index) => {
    if (!isObject(event)) return;
    if (event.type === "launch") sinceLaunch = 0;
    else if (event.type === "block") {
      blocks += 1;
      sinceLaunch += 1;
      lastBlock = index;
    }
  });
  const launchAfterBlock = lastBlock >= 0 && events.slice(lastBlock + 1).some((event) => isObject(event) && event.type === "launch");

  const finish = (rule, decision, wouldDecision, reason, extraTelemetry = {}, extraEvents = []) => {
    const reasonCode = FANOUT_RULES[rule - 1];
    const result = {
      decision,
      reasonCode,
      telemetry: {
        mode,
        ...(cfg.modeDefaulted ? { modeDefaulted: true } : {}),
        rule,
        reasonCode,
        wouldDecision,
        identity: "orchestrator",
        queue: { state: "ok", ageHours: assessment.ageHours },
        live: liveCount,
        foreignLive: foreignCount,
        target: cfg.effectiveTarget,
        ready: ready.length,
        slots,
        loadUnits: { used, cap: cfg.maxLoadUnits, free },
        plan,
        deferred,
        silent,
        blocksThisSession: blocks,
        blocksSinceLaunch: sinceLaunch,
        ...extraTelemetry,
        events: [{ type: "stop-eval", live: liveCount, target: cfg.effectiveTarget, ready: ready.length, decision: wouldDecision, reason: reasonCode, mode }, ...extraEvents],
      },
    };
    if (reason !== undefined) result.reason = reason;
    return result;
  };

  // rule 5: explicit, unexpired pause
  let pause = null;
  for (const event of events) {
    if (!isObject(event) || event.type !== "pause" || !cfg.pauseAuthorities.includes(event.by)) continue;
    const at = Date.parse(event.at);
    const until = Date.parse(event.untilAt);
    if (!Number.isFinite(at) || !Number.isFinite(until)) continue;
    const end = Math.min(until, at + cfg.maxPauseMinutes * MINUTE_MS);
    if (end > nowMs && (pause === null || end > pause.end)) pause = { by: event.by, end };
  }
  if (pause !== null) return finish(5, "allow", "allow", undefined, { pause: { by: pause.by, minutesLeft: Math.ceil((pause.end - nowMs) / MINUTE_MS) } });

  // rule 6: deadline or session cut-off reached
  const deadline = Date.parse(queue.queue?.limits?.deadline ?? queue.raw?.limits?.deadline);
  if ((Number.isFinite(deadline) && nowMs >= deadline) || (cfg.cutoffMs !== null && nowMs >= cfg.cutoffMs)) return finish(6, "allow", "allow");

  // rule 7: nothing ready (this is also the "waiting only on the PO" escape)
  if (ready.length === 0) return finish(7, "allow", "allow");

  // rule 8: no free slot, or no ready slice that fits the caps
  if (slots === 0 || plan.length === 0) return finish(8, "allow", "allow");

  // rule 9: anti-loop
  let defiedBy = null;
  if (sinceLaunch >= MAX_CONSECUTIVE_BLOCKS - 1) defiedBy = "FANOUT-DEFIED-BLOCKS";
  else if (input.stop_hook_active === true && lastBlock >= 0 && !launchAfterBlock) defiedBy = "FANOUT-DEFIED-ACTIVE";
  else if (blocks >= cfg.maxBlocksPerSession) defiedBy = "FANOUT-DEFIED-CAP";
  if (defiedBy !== null) return finish(9, "allow", "allow", undefined, { defiedBy }, [{ type: "defied", reasonCode: defiedBy, blocks }]);

  // rule 10: block (effective only in enforce), advise, or just log what would have happened
  const facts = { slots, ready: ready.length, live: liveCount, target: cfg.effectiveTarget, used, cap: cfg.maxLoadUnits, plan, byId, silent, blocked: derived.blocked, deferred, cfg };
  if (mode === "enforce") {
    const block = { type: "block", reasonCode: FANOUT_RULES[9], live: liveCount, target: cfg.effectiveTarget, ready: ready.length };
    return finish(10, "block", "block", renderText("FANOUT-BLOCK", facts), {}, [block]);
  }
  if (mode === "advisory") return finish(10, "allow", "block", renderText("FANOUT-ADVISORY", facts));
  return finish(10, "allow", "block", undefined);
}

/**
 * Evaluates one turn end against the ten rules of design 3.3. Never throws: a fault
 * of any kind is the fail-open decision. See the file header for the input contract.
 */
export function evaluateFanoutStop(args) {
  try {
    return evaluate(args);
  } catch (error) {
    try {
      return failOpen(modeHint(args?.config), faultOf(error));
    } catch {
      return failOpen(DEFAULT_FANOUT_CONFIG.mode, "EXCEPTION");
    }
  }
}

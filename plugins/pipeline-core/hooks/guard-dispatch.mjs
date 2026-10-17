#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * PreToolUse gate on subagent dispatch: is the briefing built from its template?
 *
 * WHY. Every other role contract in this repository is prose that depends on the
 * dispatching agent choosing to open the template. On 2026-08-06 one did not, and the
 * resulting Critic review was steered by the dispatcher's own hypotheses — see
 * ../lib/dispatch-policy.mjs for the full account. The templates were correct; nothing
 * required using them. This is the reader they were missing.
 *
 * SCOPE. Statically identified dispatch packets are checked before launch: shipped roles
 * need a role name and prompt, Workflow uses the plugin-qualified shipped role name, and
 * Critic/Goldfish families additionally satisfy their briefing contracts. Unrelated host
 * roles pass untouched because this plugin has no contract for them.
 *
 * EXIT SEMANTICS, matching the sibling guards: 0 allow, 2 block, 1 allow with a warning.
 * Blocking rather than warning is deliberate. A warning on a dispatch is read after the
 * subagent has already spent its budget on a contaminated briefing, which is exactly too
 * late to be useful.
 *
 * FAIL-OPEN on unreadable hook input and dynamically constructed Workflow scripts. Once a
 * native dispatch packet is statically identified, missing required packet fields fail
 * closed before a runner or model starts.
 *
 * HONEST LIMIT, repeated here because it belongs where an operator will read it: this is a
 * structural check. It matches phrases and required fields, so it catches the accident —
 * which is the failure that actually happened — and not a dispatcher who rewords the same
 * steer. It is not a substitute for reading the template.
 *
 * WORKFLOW-TOOL AWARENESS. A direct Agent-tool dispatch arrives as a discrete `tool_input`
 * with `subagent_type`/`prompt`. A Workflow-tool `agent()`/`parallel()`/`pipeline()` call
 * carries the same 6-field briefing shape, but embedded inside a `script` string parameter
 * rather than a discrete field — this is the gap backlog item
 * 2026-08-18-guard-dispatch-has-no-workflow-tool-awareness.md disclosed after NVA-WFDISP-1.
 * `extractWorkflowDispatches` recovers the common case: a static `agentType`/`prompt` pair
 * written as adjacent object-literal fields, prompt as a template/single/double-quoted string
 * literal with no `${...}` interpolation. Anything built programmatically (concatenation, a
 * helper function, interpolation) is NOT statically resolvable here and is deliberately left
 * alone (fail-open, same posture as the rest of this file) rather than guessed at — a false
 * positive on a script that never dispatches a Goldfish/Critic role is worse than a miss.
 *
 * ANTIGRAVITY RUNNER AWARENESS. The Antigravity runner's native `invoke_subagent` tool call
 * uses neither of the two shapes above: its payload is `{ Subagents: [{ TypeName: "...",
 * Prompt: "..." }, ...] }` — capitalized keys, array-wrapped, one entry per dispatched
 * subagent. Before this was recognized, that shape fell through every branch below to the
 * unconditional `process.exit(0)`, admitting an Antigravity dispatch with zero checks
 * regardless of contamination — backlog
 * 2026-08-25-guard-dispatch-fails-open-on-the-antigravity-subagents-payload-shape.md.
 * `extractAntigravityDispatches` reads `TypeName`/`Prompt` per array entry and checks each one
 * exactly like a direct Agent-tool dispatch. The pure extractor keeps ignoring malformed
 * entries for its other consumers; this hook rejects an empty or malformed native envelope
 * before invoking the extractor.
 *
 * BRIEFING ROUTE BINDING (ALF-C-P19-05C, AC-127, V-10 of
 * pipeline.claude-windows-greenfield-lifecycle-not-walkable; PO decision #19). This guard demands the
 * full briefing INLINE in the Agent/Task prompt, while a route digest used to name a briefing FILE,
 * so a dispatch could carry a different briefing than the one its route named. The digest is now
 * bound to the text actually received: when `evidence/dispatch-route-<sliceId>.json` exists for the
 * `Slice:` the briefing names, the guard hashes the canonical inline briefing with
 * `briefingSha256` and refuses a mismatch typed (DISPATCH-BRIEFING-DIGEST-MISMATCH, naming expected
 * and observed digests). A record that exists but cannot be verified refuses typed too
 * (DISPATCH-BRIEFING-ROUTE-INVALID); no record, or no `Slice:` line, changes nothing. The route
 * record producer calls `buildBriefingRoute`, which calls the same `briefingSha256`, so the two
 * sides cannot drift. Canonical form: CRLF normalised to LF, nothing else stripped or altered.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import {
  persistPendingAdvisorProhibitionBindings,
  prepareAdvisorProhibitionBindings,
} from "../lib/advisor-prohibition-binding.mjs";
import { persistPendingDispatchBudgetBindings } from "../lib/dispatch-budget-binding.mjs";
import { dispatchBudgetBinding, dispatchFindings, fanoutDispatchFindings, parseDispatchSlice } from "../lib/dispatch-policy.mjs";
// Circular by design: the producer imports this module's route exports, and this module calls the producer only at hook
// run time (recordAdmittedBriefingRoutes), never while either module is evaluating. Function declarations are hoisted.
import { recordDispatchBriefingRoute } from "../lib/dispatch-briefing-route-record.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { appendEvent, liveSlices } from "../lib/fanout-ledger.mjs";
import { loadSliceQueue, normalizeScope, readyAndLive, scopesOverlap } from "../lib/slice-queue.mjs";
import { prepareNativeGoldfishHostState, resolveGovernedItemQueue, prepareGovernedItemQueue } from "../lib/native-goldfish-host-state.mjs";
import { parseNativeGoldfishBriefing } from "../lib/native-goldfish-host-return.mjs";
import { enterClaudeHookSessionOwner } from "../lib/claude-hook-session-owner.mjs";
import { resolveGitCommonDir } from "./guard-dispatch-budget.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { isDirectInvocation as isGovernanceHookEntry } from "../lib/entrypoint.mjs";
// Repository admission precedes hook input hardening and all governed effects.
if (isGovernanceHookEntry(import.meta.url) && !observeGovernanceScope({ rootDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() }).requiresEnforcement) process.exit(0);


// Recover `{ agentType: '...', prompt: `...` }`-shaped dispatches embedded in a Workflow
// script body. Regex-based, not a JS parser: it only claims the statically-obvious case.
// Exported so another module (a Workflow-dispatch preflight, a test) can recover the same
// embedded dispatches without importing this file for its side effects -- see the
// `isDirectInvocation` gate below, which is what makes that safe.
export function extractWorkflowDispatches(script) {
  const found = [];
  const agentTypeRe = /agentType\s*:\s*(['"])((?:(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = agentTypeRe.exec(script)) !== null) {
    const agentType = m[2];
    const windowEnd = Math.min(script.length, agentTypeRe.lastIndex + 4000);
    const window = script.slice(agentTypeRe.lastIndex, windowEnd);
    const promptOpen = /prompt\s*:\s*([`'"])/.exec(window);
    if (!promptOpen) continue; // no prompt field nearby -> not a dispatch call, skip
    const quote = promptOpen[1];
    let i = promptOpen.index + promptOpen[0].length;
    let body = null;
    while (i < window.length) {
      if (window[i] === "\\") { i += 2; continue; }
      if (window[i] === quote) { body = window.slice(promptOpen.index + promptOpen[0].length, i); break; }
      i += 1;
    }
    if (body === null) continue; // unterminated within window -> cannot resolve, fail open
    if (body.includes("${")) continue; // built dynamically -> not statically verifiable, fail open
    found.push({ subagentType: agentType, prompt: body });
  }
  return found;
}

// Recover `{ TypeName: '...', Prompt: '...' }`-shaped entries from the Antigravity runner's
// native `invoke_subagent` payload: `toolInput.Subagents` is an array, one entry per dispatched
// subagent. An entry with no string `TypeName` carries nothing to check against a role template
// and is skipped, not guessed at -- same fail-open posture as the rest of this file.
//
// Exported (NVA-B-SLICINGRUNNER-1) so a second consumer -- guard-slicing.mjs's Antigravity
// fan-out recognizer -- can recover the same entries without a second, locally written copy of
// this parsing logic. Same one-word enabling change, same shape, as `extractWorkflowDispatches`
// above (adc165bb): the top-level hook body stays gated behind `isDirectInvocation` below, so
// importing this module for the export alone still does not execute it.
export function extractAntigravityDispatches(subagents) {
  const found = [];
  for (const entry of subagents) {
    if (!entry || typeof entry !== "object") continue;
    const subagentType = typeof entry.TypeName === "string" ? entry.TypeName : "";
    const prompt = typeof entry.Prompt === "string" ? entry.Prompt : "";
    if (subagentType === "") continue;
    found.push({ subagentType, prompt });
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// A caller's prompt cannot turn a writable Goldfish capability into read-only.
export function requiresGovernedItemAdmission(policy) {
  return policy?.role === "goldfish";
}

// ---------------------------------------------------------------------------------------------
// Briefing route binding (see the header). ONE canonical form and ONE digest function, shared by the
// route record producer (`buildBriefingRoute`) and the guard (`evaluateBriefingRoute`): both sides call
// `briefingSha256`, so they cannot drift. Exported without side effects: importing this module never
// runs the hook body (isDirectInvocation gate below).
export const BRIEFING_ROUTE_SCHEMA = "pipeline.dispatch-briefing-route.v1";
const BRIEFING_ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const BRIEFING_ROUTE_DIGEST = /^[a-f0-9]{64}$/u;
const BRIEFING_ROUTE_MAX_BYTES = 4096;

/** The canonical briefing text: CRLF normalised to LF, nothing else stripped or altered. */
export function canonicalBriefing(prompt) {
  return typeof prompt === "string" ? prompt.replace(/\r\n/gu, "\n") : "";
}

/** sha256 (lowercase hex) over the UTF-8 bytes of the canonical briefing: the one digest definition. */
export function briefingSha256(prompt) {
  return createHash("sha256").update(canonicalBriefing(prompt), "utf8").digest("hex");
}

/** Repo-relative location of the route record of a slice, under the project root. */
export function briefingRoutePath(root, sliceId) {
  return join(root, "evidence", `dispatch-route-${sliceId}.json`);
}

/**
 * Provenance of a record the guard itself wrote when it admitted a Goldfish briefing (V-10, PO decision
 * 2026-10-17: latest admission wins). A record written by a route producer (role-dispatch-preflight) carries
 * no `origin` and stays authoritative: only a record with this origin may be superseded by a later admission.
 */
export const BRIEFING_ROUTE_ORIGIN_ADMISSION = "admission";

/**
 * The route record a producer writes for a dispatch: it binds `sliceId` to the digest of the briefing
 * text that will actually be sent inline. Throws on an unusable slice id or an empty briefing. The default
 * record has exactly three keys; the guard's own admission record adds one more, `origin: "admission"`.
 */
export function buildBriefingRoute({ sliceId, briefing, origin } = {}) {
  if (typeof sliceId !== "string" || !BRIEFING_ROUTE_ID.test(sliceId)) throw new TypeError("buildBriefingRoute: sliceId must be a safe slice id");
  if (typeof briefing !== "string" || briefing === "") throw new TypeError("buildBriefingRoute: briefing must be the non-empty text actually sent");
  if (origin !== undefined && origin !== BRIEFING_ROUTE_ORIGIN_ADMISSION) throw new TypeError("buildBriefingRoute: origin, when given, must be \"admission\"");
  const record = { schema: BRIEFING_ROUTE_SCHEMA, sliceId, briefingSha256: briefingSha256(briefing) };
  return origin === undefined ? record : { ...record, origin };
}

/**
 * Judges ONE inline briefing against the route record of the slice it names. Pure apart from reading
 * that one bounded file; never throws.
 *   none      no `Slice:` line, no usable root, or no route record for the slice: nothing to enforce
 *   match     the canonical inline briefing hashes to the digest the route record carries
 *   mismatch  it does not; `expected` and `observed` are both digests
 *   invalid   a route record exists but cannot be verified (unreadable, oversized, not a regular file,
 *             not an exact v1 record of this slice): refused rather than treated as "no route"
 */
export function evaluateBriefingRoute({ prompt, root } = {}) {
  try {
    const sliceId = parseDispatchSlice(prompt).sliceId;
    if (sliceId === null || typeof root !== "string" || root === "") return { status: "none" };
    const path = briefingRoutePath(root, sliceId);
    const shown = `evidence/dispatch-route-${sliceId}.json`;
    const invalid = (reason) => ({ status: "invalid", sliceId, path: shown, reason });
    let info;
    try {
      info = lstatSync(path);
    } catch (error) {
      return error?.code === "ENOENT" || error?.code === "ENOTDIR" ? { status: "none" } : invalid("the route record cannot be inspected");
    }
    if (!info.isFile() || info.size > BRIEFING_ROUTE_MAX_BYTES) return invalid("the route record is not a regular file of bounded size");
    let record;
    try {
      record = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return invalid("the route record is not readable JSON");
    }
    const keys = record !== null && typeof record === "object" && !Array.isArray(record) ? Object.keys(record).sort().join(",") : null;
    const admission = keys === "briefingSha256,origin,schema,sliceId"; // the one optional extra key
    const exact = keys === "briefingSha256,schema,sliceId" || admission;
    if (!exact || record.schema !== BRIEFING_ROUTE_SCHEMA || record.sliceId !== sliceId
      || (admission && record.origin !== BRIEFING_ROUTE_ORIGIN_ADMISSION)
      || typeof record.briefingSha256 !== "string" || !BRIEFING_ROUTE_DIGEST.test(record.briefingSha256)) {
      return invalid(`the route record is not an exact ${BRIEFING_ROUTE_SCHEMA} record of this slice`);
    }
    const observed = briefingSha256(prompt);
    const provenance = admission ? { origin: BRIEFING_ROUTE_ORIGIN_ADMISSION } : {};
    return observed === record.briefingSha256
      ? { status: "match", sliceId, digest: observed, ...provenance }
      : { status: "mismatch", sliceId, path: shown, expected: record.briefingSha256, observed, ...provenance };
  } catch {
    return { status: "invalid", sliceId: null, path: "evidence/dispatch-route-*.json", reason: "the route check itself faulted" };
  }
}

function briefingRouteRefusal(route) {
  return route.status === "mismatch"
    ? [
        `BLOCKED (guard-dispatch, plugin pipeline-core): DISPATCH-BRIEFING-DIGEST-MISMATCH: the briefing inline in this dispatch is not the briefing its route names (slice ${route.sliceId}).`,
        `  expected: ${route.expected}`,
        `  observed: ${route.observed}`,
        `  route record: ${route.path}`,
        "The digest binds the text actually sent (CRLF normalised to LF, nothing else). Dispatch the briefing the route names, or issue a new route record for the briefing you intend to send.",
        "",
      ].join("\n")
    : [
        `BLOCKED (guard-dispatch, plugin pipeline-core): DISPATCH-BRIEFING-ROUTE-INVALID: ${route.reason} (${route.path}).`,
        "A route record that exists but cannot be verified is not treated as \"no route\". Repair or remove it, then dispatch again.",
        "",
      ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Admission recording (ALF-C-V10-WIRE3, AC-127; PO decision 2026-10-17: latest admission wins). The guard is the one
// admission point every transport passes through, so it records the route digest of each Goldfish briefing it admits,
// with `origin: "admission"`. Rules:
//   - a record WITHOUT origin was written by a route producer (role-dispatch-preflight); it stays authoritative, so a
//     tampered briefing after a preflight record is refused DISPATCH-BRIEFING-DIGEST-MISMATCH;
//   - a record WITH origin "admission" is superseded by a later admitted Goldfish briefing of the same slice (the
//     latest admission wins); only a dispatch that is itself recorded may supersede it;
//   - two different briefings of one slice in ONE call are refused DISPATCH-BRIEFING-DIGEST-MISMATCH;
//   - a refused briefing writes no record: the plan runs in the early route check, the writes happen last.
const shownRoutePath = (sliceId) => `evidence/dispatch-route-${sliceId}.json`;

/** The per-slice digest plan of ONE call: a second, different digest for the same slice is a typed mismatch. Never writes. */
export function planAdmittedBriefingRoutes({ dispatches } = {}) {
  try {
    const bySlice = new Map();
    for (const dispatch of Array.isArray(dispatches) ? dispatches : []) {
      const prompt = dispatch?.prompt;
      if (typeof prompt !== "string") continue;
      const sliceId = parseDispatchSlice(prompt).sliceId;
      if (typeof sliceId !== "string" || !BRIEFING_ROUTE_ID.test(sliceId)) continue; // names no single, safe slice: nothing is bound
      const digest = briefingSha256(prompt);
      const seen = bySlice.get(sliceId);
      if (seen === undefined) bySlice.set(sliceId, { sliceId, digest, prompt });
      else if (seen.digest !== digest) {
        return { ok: false, route: { status: "mismatch", sliceId, path: shownRoutePath(sliceId), expected: seen.digest, observed: digest } };
      }
    }
    return { ok: true, plan: [...bySlice.values()] };
  } catch {
    return { ok: false, route: { status: "invalid", sliceId: null, path: "evidence/dispatch-route-*.json", reason: "the route plan itself faulted" } };
  }
}

/**
 * Write-ability precheck of the evidence target of every slice the call would record. It runs in the early route
 * check, before any admission effect, so a structurally unwritable target (the `evidence` entry is not a real
 * directory, or the record entry is not a regular file) refuses with nothing left behind. Never writes.
 * `{ ok: true }` or `{ ok: false, fault: { code, sliceId, path } }`.
 */
export function precheckAdmittedBriefingRouteTargets({ dispatches, root } = {}) {
  const planned = planAdmittedBriefingRoutes({ dispatches });
  if (!planned.ok) return { ok: true }; // a conflict is reported by the plan itself
  const lstatOrNull = (path) => {
    try { return lstatSync(path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  };
  for (const entry of planned.plan) {
    const path = shownRoutePath(entry.sliceId);
    try {
      const dir = lstatOrNull(join(root, "evidence"));
      if (dir !== null && !dir.isDirectory()) return { ok: false, fault: { code: "DBRR-EVIDENCE-DIR", sliceId: entry.sliceId, path: "evidence" } };
      const target = lstatOrNull(briefingRoutePath(root, entry.sliceId));
      if (target !== null && !target.isFile()) return { ok: false, fault: { code: "DBRR-TARGET", sliceId: entry.sliceId, path } };
    } catch {
      return { ok: false, fault: { code: "DBRR-WRITE", sliceId: entry.sliceId, path } };
    }
  }
  return { ok: true };
}

function briefingRouteWriteFault(fault, { admitted }) {
  const head = `(guard-dispatch, plugin pipeline-core): DISPATCH-BRIEFING-ROUTE-UNWRITABLE: ${fault.code}: the admission record of slice ${fault.sliceId} cannot be written at ${fault.path}.`;
  return admitted
    ? `WARNING ${head} The dispatch is admitted without a route record; the slice stays unbound until the evidence path is fixed.\n`
    : `BLOCKED ${head} Make \`evidence\` a real directory and the record entry a regular file (or remove what blocks it), then dispatch again; nothing was admitted or persisted.\n`;
}

/**
 * Records the route of each distinct slice the call admits, with origin "admission". Every slice is judged first
 * (nothing is written for a call any slice of which is refused); the writes then snapshot the prior bytes and restore
 * them if a later slice cannot be written. `{ ok: true, recorded }` or `{ ok: false, route }` (a typed
 * mismatch/invalid result, ready for briefingRouteRefusal). A slice already bound to exactly this text is left untouched.
 */
export function recordAdmittedBriefingRoutes({ dispatches, root, record = recordDispatchBriefingRoute } = {}) {
  // `record` is the per-slice writer. It defaults to the production writer; it is a parameter only so the multi-slice
  // rollback below (a LATER slice failing after an earlier one was written) can be driven by a test: no filesystem
  // state lets a slice pass the judgement above and then fail its write portably.
  const planned = planAdmittedBriefingRoutes({ dispatches });
  if (!planned.ok) return planned;
  const writes = [];
  for (const entry of planned.plan) {
    const existing = evaluateBriefingRoute({ prompt: entry.prompt, root });
    if (existing.status === "invalid" || (existing.status === "mismatch" && existing.origin !== BRIEFING_ROUTE_ORIGIN_ADMISSION)) return { ok: false, route: existing };
    if (existing.status !== "match") writes.push(entry);
  }
  const done = [];
  const undo = () => {
    for (const { target, previous } of done.reverse()) {
      try {
        if (previous === null) rmSync(target, { force: true });
        else writeFileSync(target, previous);
      } catch { /* best effort: the refusal below is the signal */ }
    }
  };
  for (const entry of writes) {
    const target = briefingRoutePath(root, entry.sliceId);
    let previous = null;
    try {
      const info = lstatSync(target);
      if (info.isFile() && info.size <= BRIEFING_ROUTE_MAX_BYTES) previous = readFileSync(target);
    } catch { /* no record yet */ }
    done.push({ target, previous });
    const recorded = record({ root, prompt: entry.prompt, origin: BRIEFING_ROUTE_ORIGIN_ADMISSION });
    if (recorded.status === "refused") {
      undo();
      // `fault` marks a record-WRITE fault (not an unverifiable existing record): the caller words it as such.
      return { ok: false, fault: { code: recorded.code, sliceId: entry.sliceId, path: shownRoutePath(entry.sliceId) },
        route: { status: "invalid", sliceId: entry.sliceId, path: shownRoutePath(entry.sliceId), reason: `the route record could not be written (${recorded.code})` } };
    }
  }
  return { ok: true, recorded: writes.map((entry) => entry.sliceId) };
}

// FANOUT slice S7: the dispatch-time slice-scope check (design:
// specs/sprint-alfred-epic/design/fanout-enforcement-design.md 3.4), SHADOW by default.
//
// Strictly additive. It runs only after every existing check admitted the packet, it is inactive
// unless `PIPELINE_FANOUT_CONFIG` carries a `queuePath` and a mode other than `off`, and it blocks
// ONLY in mode `enforce`, on ANY of its findings (FANOUT-NO-SLICE, -SLICE-NOT-READY, -DEP-BLOCKED,
// -SCOPE-NOT-CONTAINED, -SCOPE-UNDECLARED, -SCOPE-OVERLAP). Every fault inside it (config, queue,
// ledger, git) fails open to an inactive plan: a broken fan-out check must not stop a dispatch.
// A fault in the derived slice status alone (`readyAndLive`) leaves `sliceStatus` undefined, so the
// state/dependency checks fall back to the declared queue state and the live set.
//
// Config, cwd and common-dir resolution mirror stop-fanout.mjs (which does not export its
// resolvers), so the Stop adapter and this hook read the same queue and the same session ledger.
//
// RECORDING CHANNEL. A dispatch-time finding is appended as a `stop-eval` event whose `reason` is
// the FANOUT-* code, never as a `block` event: the governor's anti-loop counters read `launch` and
// `block` events only (lib/fanout-governor.mjs), and a dispatch refusal must not feed the Stop
// hook's own block budget. `ready` is 0 (nothing is evaluated for readiness here) and `target` is
// the configured target when it is a valid count, else 0 (not evaluated at dispatch time).
//
// LAUNCH. A `launch` event is appended for every dispatch that names a queue slice, but only at
// process exit with code 0 (see the call site), so a dispatch that any later existing check
// refused never occupies a slot.
const FANOUT_MODES = ["off", "shadow", "advisory", "enforce"];
const FANOUT_SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const FANOUT_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+@-]{0,127}$/u;
const FANOUT_MODEL = /\b(?:claude|gpt|o[0-9]|gemini|sonnet|opus|haiku|fable|codex)[-a-z0-9.]*/i;
const FANOUT_MAX_RECORD_BYTES = 1024 * 1024;
const FANOUT_GLOB = /[*?[\]{}]/u;

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fanoutToken = (value) => (typeof value === "string" && FANOUT_TOKEN.test(value) && !/^[A-Za-z]:/u.test(value) && !value.includes("..") ? value : "unknown");
const inactiveFanoutPlan = () => ({ active: false, mode: "off", findings: [], block: false, findingEvents: [], launchEvents: [] });

function fanoutModelOf(prompt) {
  const text = typeof prompt === "string" ? prompt : "";
  const line = /^.*\bModel\/effort\b.*$/imu.exec(text)?.[0] ?? "";
  return fanoutToken(FANOUT_MODEL.exec(line)?.[0] ?? FANOUT_MODEL.exec(text)?.[0]);
}

/**
 * Dispatch records of the queue's slices, in the shape `readyAndLive` consumes. Mirrors
 * `readRecords` in stop-fanout.mjs (which does not export it). `sliceIds` must already be safe ids.
 * Unreadable, oversized or mismatching records are skipped.
 */
function readFanoutRecords(evidenceDir, sliceIds) {
  const records = [];
  for (const id of sliceIds) {
    try {
      const path = join(evidenceDir, `dispatch-record-${id}.json`);
      const info = statSync(path);
      if (!info.isFile() || info.size > FANOUT_MAX_RECORD_BYTES) continue;
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (!isPlainObject(parsed) || parsed.taskId !== id || typeof parsed.outcome !== "string") continue;
      records.push({ taskId: parsed.taskId, outcome: parsed.outcome, outcomeClassification: parsed.outcomeClassification, mtimeMs: Math.round(info.mtimeMs) });
    } catch { /* no usable record for this slice */ }
  }
  return records;
}

// Shape of ONE canonical scope alternative (the output of `normalizeScope`): its path segments, and
// whether it names a directory subtree (trailing `/`, trailing `/**`, the root `./`, or a name with no
// glob character and no extension: the same rule slice-queue.mjs compiles with) or a single file/pattern.
function fanoutScopeShape(canonical) {
  if (canonical === "./") return { segs: [], dir: true, literalFile: false };
  const segs = canonical.split("/").filter((segment) => segment !== "");
  let dir = canonical.endsWith("/");
  if (segs[segs.length - 1] === "**") {
    segs.pop();
    dir = true;
  }
  const last = segs[segs.length - 1] ?? "";
  if (!dir && !FANOUT_GLOB.test(last) && last.indexOf(".", 1) === -1) dir = true;
  return { segs, dir, literalFile: !dir && !FANOUT_GLOB.test(canonical) };
}

// Structural cover: does queued shape `q` contain every path of declared shape `d`? A queued file or
// pattern covers only an identical one; a queued directory covers any shape whose leading segments it
// matches one-for-one (a queued `*` segment covers any single, non-`**` segment). Anything else is "no".
function fanoutShapeCovers(q, d) {
  if (!q.dir) return !d.dir && q.segs.length === d.segs.length && q.segs.every((seg, index) => seg === d.segs[index]);
  if (q.segs.length > d.segs.length) return false;
  if (!d.dir && q.segs.length === d.segs.length) return false; // a file is never the directory itself
  return q.segs.every((seg, index) => seg === d.segs[index] || (seg === "*" && d.segs[index] !== "**"));
}

/**
 * Is every declared scope path inside the queue entry's `writeScope`? Both sides go through
 * `normalizeScope`; a scope it cannot normalise (escape, drive letter, empty, ...) is NOT contained,
 * and so is an empty list on either side. A queued directory contains what lies under it (exact
 * match, `./` prefix, directory prefix, `/**` suffix); a declared literal file is also judged against
 * glob entries by `scopesOverlap` (a single file overlaps a pattern exactly when the pattern matches
 * it). A declared directory or glob that no queued entry structurally covers is NOT contained: this
 * errs towards refusing what it cannot judge. Never throws.
 */
export function scopeWithin(declared, queued) {
  try {
    const declaredList = Array.isArray(declared) ? declared : [];
    const queuedList = Array.isArray(queued) ? queued : [];
    if (declaredList.length === 0 || queuedList.length === 0) return false;
    const queuedCanonical = [];
    for (const raw of queuedList) {
      const normalized = normalizeScope(raw);
      if (!normalized.ok) return false;
      queuedCanonical.push(...normalized.alternatives);
    }
    const queuedShapes = queuedCanonical.map(fanoutScopeShape);
    for (const raw of declaredList) {
      const normalized = normalizeScope(raw);
      if (!normalized.ok) return false;
      for (const alternative of normalized.alternatives) {
        const shape = fanoutScopeShape(alternative);
        const inside = queuedShapes.some((queuedShape) => fanoutShapeCovers(queuedShape, shape))
          || (shape.literalFile && scopesOverlap([alternative], queuedCanonical));
        if (!inside) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Plans the fan-out recording and the (enforce-only) block for ONE hook call. Never throws.
 * `entries` is `[{ dispatch: { subagentType, prompt, transport }, role }]` (role from
 * `dispatchFindings`). A call carrying several dispatches is evaluated pairwise: entry N sees the
 * ledger's live slices plus the slices named by entries 0..N-1 of the same call.
 * @returns {{active: boolean, mode: string, findings: object[], block: boolean,
 *   findingEvents: object[], launchEvents: object[], commonDir?: string, runner?: string, sessionId?: string}}
 */
export function observeFanoutDispatches({ input, entries, env = process.env, now } = {}) {
  try {
    const raw = env?.PIPELINE_FANOUT_CONFIG;
    if (typeof raw !== "string" || raw === "") return inactiveFanoutPlan();
    const config = JSON.parse(raw);
    if (!isPlainObject(config) || typeof config.queuePath !== "string" || config.queuePath === "") return inactiveFanoutPlan();
    const mode = FANOUT_MODES.includes(config.mode) ? config.mode : "shadow";
    if (mode === "off") return inactiveFanoutPlan();
    const sessionId = input?.session_id;
    if (typeof sessionId !== "string" || sessionId === "" || !Array.isArray(entries) || entries.length === 0) return inactiveFanoutPlan();

    const cwd = typeof input.cwd === "string" && isAbsolute(input.cwd) ? input.cwd : (env.CLAUDE_PROJECT_DIR || process.cwd());
    let commonDir;
    if (config.commonDir !== undefined) {
      if (typeof config.commonDir !== "string" || !isAbsolute(config.commonDir)) throw new Error("commonDir");
      commonDir = config.commonDir;
    } else {
      commonDir = resolveGitCommonDir(cwd);
      if (typeof commonDir !== "string" || !isAbsolute(commonDir)) throw new Error("commonDir");
    }
    const transport = entries[0]?.dispatch?.transport;
    const runner = transport === "codex" ? "codex" : transport === "antigravity" ? "antigravity" : "claude";

    const queueOptions = isPlainObject(config.queueOptions) ? config.queueOptions : {};
    const loaded = loadSliceQueue(resolve(cwd, config.queuePath), queueOptions);
    if (loaded.status !== "valid" || !Array.isArray(loaded.queue?.slices)) return inactiveFanoutPlan();
    const sliceIds = loaded.queue.slices.map((slice) => slice?.id).filter((id) => typeof id === "string" && FANOUT_SAFE_ID.test(id));
    const evidenceDir = join(cwd, "evidence");
    const ledgerEntries = liveSlices({ commonDir, runner, sessionId, evidenceDir, sliceIds, now });
    const ledgerLive = ledgerEntries.map((entry) => entry.sliceId);
    // Derived status per slice (done / cancelled / held / live / blocked-with-reasons / ready). Any fault
    // here leaves `sliceStatus` undefined: the checks that need it are skipped, the rest still run.
    let sliceStatus;
    try {
      const derived = readyAndLive({ queue: loaded.raw, records: readFanoutRecords(evidenceDir, sliceIds), live: ledgerEntries, now: now ?? Date.now() }, queueOptions);
      if (derived?.valid === true && Array.isArray(derived.slices)) {
        sliceStatus = Object.fromEntries(derived.slices.map((slice) => [slice.id, { status: slice.status, reasons: slice.reasons }]));
      }
    } catch {
      sliceStatus = undefined;
    }
    const target = Number.isSafeInteger(config.target) && config.target >= 0 && config.target <= 1_000_000 ? config.target : 0;

    const findings = [];
    const findingEvents = [];
    const launchEvents = [];
    const inCall = [];
    entries.forEach((entry, index) => {
      const dispatch = entry?.dispatch;
      if (!isPlainObject(dispatch)) return;
      const liveSliceIds = [...new Set([...ledgerLive, ...inCall])];
      const result = fanoutDispatchFindings({
        role: entry.role, prompt: dispatch.prompt, queue: loaded.queue, liveSliceIds, overlaps: scopesOverlap, contains: scopeWithin, sliceStatus, mode,
      });
      for (const finding of result.findings) {
        findings.push({ ...finding, index });
        findingEvents.push({
          type: "stop-eval",
          live: liveSliceIds.length,
          target,
          ready: 0,
          decision: mode === "enforce" ? "block" : "allow",
          reason: finding.code,
          mode,
        });
      }
      if (result.sliceId === null) return;
      inCall.push(result.sliceId);
      const slice = loaded.queue.slices.find((candidate) => candidate?.id === result.sliceId);
      launchEvents.push({
        type: "launch",
        sliceId: result.sliceId,
        agentType: fanoutToken(dispatch.subagentType),
        model: fanoutModelOf(dispatch.prompt),
        writeScopeHash: createHash("sha256").update(JSON.stringify([...result.writeScope].sort())).digest("hex"),
        commitMode: slice?.commitMode,
      });
    });
    return {
      active: true,
      mode,
      findings,
      block: mode === "enforce" && findings.length > 0,
      findingEvents,
      launchEvents,
      commonDir,
      runner,
      sessionId,
    };
  } catch {
    return inactiveFanoutPlan();
  }
}

/** Appends each event on its own; one that cannot be written never stops a dispatch. Returns the count written. */
export function recordFanoutEvents(plan, events, now) {
  let recorded = 0;
  for (const event of Array.isArray(events) ? events : []) {
    try {
      appendEvent(plan.commonDir, plan.runner, plan.sessionId, event, { now });
      recorded += 1;
    } catch { /* a ledger that cannot be written never blocks a dispatch */ }
  }
  return recorded;
}

// Gate the entire hook body on being the process entrypoint (matching
// guard-dispatch-budget.mjs's shape). Importing this module for `extractWorkflowDispatches`
// must never itself read stdin, parse it, or call `process.exit` -- see `../lib/entrypoint.mjs`'s
// header for the 2026-08-06 incident (a naive entrypoint check left six hooks dead through a
// symlinked marketplace root) this gate must not reproduce.
if (isDirectInvocation(import.meta.url)) {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0); // unreadable input -> no opinion; a broken hook must not stop work
  }

  const toolInput = input?.tool_input;
  if (!toolInput || typeof toolInput !== "object") process.exit(0);
  // T6-A: a Claude Task/Agent call binds this hook process to its own hook-observed session owner.
  if (["Task", "Agent"].includes(input?.tool_name)) {
    enterClaudeHookSessionOwner({ root: input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), input });
  }

  // The subagent tool is `Task` in Claude Code and `Agent` in some runners; both are accepted
  // rather than guessing one, because a matcher that names the wrong tool is a silent no-op —
  // the failure class this repository already paid for with NotebookEdit.
  const codexDispatch = input?.tool_name === "spawn_agent";
  const subagentType = toolInput.subagent_type ?? toolInput.subagentType ?? toolInput.agent_type ?? (codexDispatch ? "default" : "");
  const prompt = toolInput.prompt ?? toolInput.message ?? "";

  let dispatches;
  if (Array.isArray(toolInput.Subagents)) {
    // Antigravity runner's native invoke_subagent shape: capitalized, array-wrapped.
    const malformed = toolInput.Subagents.length === 0 || toolInput.Subagents.some((entry) => !entry || typeof entry !== "object"
      || typeof entry.TypeName !== "string" || entry.TypeName.trim() === ""
      || typeof entry.Prompt !== "string" || entry.Prompt.trim() === "");
    dispatches = malformed
      ? [{ subagentType: "", prompt: "", transport: "antigravity" }]
      : extractAntigravityDispatches(toolInput.Subagents).map((dispatch) => ({ ...dispatch, transport: "antigravity" }));
    if (dispatches.length === 0) process.exit(0);
  } else if (typeof subagentType === "string" && subagentType !== "" && typeof prompt === "string") {
    dispatches = [{ subagentType, prompt, transport: codexDispatch ? "codex" : "direct" }];
  } else if (["Task", "Agent"].includes(input?.tool_name)) {
    dispatches = [{ subagentType, prompt, transport: "direct" }];
  } else if (typeof toolInput.script === "string" && toolInput.script !== "") {
    // Workflow-tool call: no discrete subagent_type/prompt field, but the script may carry
    // one or more embedded agent()/parallel()/pipeline() dispatches worth checking the same way.
    dispatches = extractWorkflowDispatches(toolInput.script).map((dispatch) => ({ ...dispatch, transport: "workflow" }));
    if (dispatches.length === 0) process.exit(0);
  } else {
    process.exit(0);
  }

  const codexV2Marker = "<!-- pipeline-native-goldfish-host-commit:v2";
  const itemV3Marker = "<!-- pipeline-native-goldfish-host-commit:v3";
  const markedV2 = dispatches.filter((dispatch) => dispatch.prompt.includes(codexV2Marker) || input?.tool_name === "spawn_agent" && dispatch.prompt.includes(itemV3Marker));
  let policyDispatches = dispatches;
  if (markedV2.length > 0) {
    const parsed = markedV2.length === 1 && dispatches.length === 1 && input?.tool_name === "spawn_agent"
      ? parseNativeGoldfishBriefing(markedV2[0].prompt) : { ok: false, code: "NGHR-BRIEFING-TRANSPORT" };
    if (!parsed.ok || toolInput.agent_type !== parsed.binding?.nativeAgentType || Object.hasOwn(toolInput, "agentType")
      || typeof toolInput.message !== "string" || Object.hasOwn(toolInput, "prompt")) {
      const code = !parsed.ok ? parsed.code : "NGHR-NATIVE-AGENT-TYPE";
      process.stderr.write(`BLOCKED (guard-dispatch): ${code}: the version 2 native Goldfish binding requires one Codex worker packet and a valid functional Pipeline role.\n`);
      process.exit(2);
    }
    policyDispatches = [{ ...markedV2[0], subagentType: parsed.binding.role }];
  }

  const evaluated = policyDispatches.map((dispatch) => ({
    dispatch,
    policy: dispatchFindings(dispatch),
    budget: dispatchBudgetBinding(dispatch),
  }));
  const blocked = evaluated.map(({ policy }) => policy).filter((result) => result.findings.length > 0);
  const routeRoot = resolve(process.env.CLAUDE_PROJECT_DIR || (typeof input.cwd === "string" && isAbsolute(input.cwd) ? input.cwd : process.cwd()));
  if (blocked.length === 0) {
    // V-10: bind the route digest to the briefing actually received. It runs before any admission
    // effect (item reservation, budget/prohibition binding, fan-out launch), so a refused briefing
    // leaves nothing behind. No route record for the named slice: nothing changes.
    for (const { dispatch, policy } of evaluated) {
      const route = evaluateBriefingRoute({ prompt: dispatch.prompt, root: routeRoot });
      // A mismatch against the guard's own admission record is not a refusal for a Goldfish briefing: it is the
      // latest admission and supersedes the record at the end of this hook. A producer record (no origin) and
      // every dispatch that is not itself recorded keep the typed refusal.
      const supersedes = route.status === "mismatch" && route.origin === BRIEFING_ROUTE_ORIGIN_ADMISSION
        && requiresGovernedItemAdmission(policy);
      if ((route.status === "mismatch" && !supersedes) || route.status === "invalid") {
        process.stderr.write(briefingRouteRefusal(route));
        process.exit(2);
      }
    }
    // Two different briefings of one slice in one call: refused here, before any effect.
    const conflict = planAdmittedBriefingRoutes({
      dispatches: evaluated.filter(({ policy }) => requiresGovernedItemAdmission(policy)).map(({ dispatch }) => ({ prompt: dispatch.prompt })),
    });
    if (!conflict.ok) {
      process.stderr.write(briefingRouteRefusal(conflict.route));
      process.exit(2);
    }
    // The record is written last, so a structurally unwritable evidence target is refused HERE, before any effect.
    const writable = precheckAdmittedBriefingRouteTargets({
      dispatches: evaluated.filter(({ policy }) => requiresGovernedItemAdmission(policy)).map(({ dispatch }) => ({ prompt: dispatch.prompt })),
      root: routeRoot,
    });
    if (!writable.ok) {
      process.stderr.write(briefingRouteWriteFault(writable.fault, { admitted: false }));
      process.exit(2);
    }
  }
  const productive = evaluated.filter(({ policy }) => requiresGovernedItemAdmission(policy));
  let itemGovernanceRequired = false;
  if (productive.length > 0) {
    const courseRoot=input.cwd??process.env.CLAUDE_PROJECT_DIR??process.cwd();
    let governed=resolveGovernedItemQueue({root:courseRoot});
    if(productive.length===1) {
      const parsed=parseNativeGoldfishBriefing(productive[0].dispatch.prompt);
      if(parsed.ok&&parsed.binding.itemDelivery)governed=prepareGovernedItemQueue({root:courseRoot,itemDelivery:parsed.binding.itemDelivery,
        candidate:{commit:parsed.binding.candidateCommit,tree:parsed.binding.candidateTree},writeScope:parsed.binding.allowedPaths});
    }
    itemGovernanceRequired=governed.status==='required';
    const unsupported = governed.status === "required" && productive.some(({ dispatch }) =>
      !["direct", "codex"].includes(dispatch.transport)
      || !parseNativeGoldfishBriefing(dispatch.prompt).ok);
    if (governed.status === "refused" || unsupported) {
      process.stderr.write(`BLOCKED (guard-dispatch): ${unsupported ? "SQ-NATIVE-ITEM-ADMISSION-REQUIRED" : governed.code}: ${governed.repair ?? "Use the authenticated native item admission; this transport has no qualified item reservation adapter."}\n`);
      process.exit(2);
    }
  }
  if (blocked.length === 0) {
    // FANOUT slice S7: shadow by default; inactive without PIPELINE_FANOUT_CONFIG. Findings are
    // recorded now; the `launch` events only if every later existing check also admits the dispatch.
    const fanout = observeFanoutDispatches({
      input,
      entries: evaluated.map(({ dispatch, policy }) => ({ dispatch, role: policy.role })),
      env: process.env,
    });
    if (fanout.active) {
      recordFanoutEvents(fanout, fanout.findingEvents);
      if (fanout.block) {
        process.stderr.write([
          "BLOCKED (guard-dispatch, plugin pipeline-core): this dispatch failed the fan-out slice check before launch (mode enforce).",
          "",
          ...fanout.findings.map((f, i) => `  ${i + 1}. ${f.code}\n     ${f.why}`),
          "",
          "Wait for the live slice(s) to finish, order the slices with dependsOn, or correct the `Slice:` and `Write scope:` lines of the dispatch metadata, then dispatch again.",
          "",
        ].join("\n"));
        process.exit(2);
      }
      process.once("exit", (code) => {
        if (code === 0) recordFanoutEvents(fanout, fanout.launchEvents);
      });
    }
    const toolUseId = input?.tool_use_id ?? input?.toolUseId;
    const bindingCapableTool = ["Task", "Agent", "Workflow"].includes(input?.tool_name)
      && !dispatches.some((dispatch) => dispatch.transport === "antigravity");
    const advisorBinding = bindingCapableTool
      ? prepareAdvisorProhibitionBindings(dispatches)
      : { status: "not-applicable" };
    if (advisorBinding.status === "rejected") {
      process.stderr.write(`BLOCKED (guard-dispatch, plugin pipeline-core): ${advisorBinding.code}: ${advisorBinding.message ?? "the Advisor prohibition cannot be assigned to one exact child before launch."}\n`);
      process.exit(2);
    }
    if (advisorBinding.status === "prepared") {
      if (typeof toolUseId !== "string" || toolUseId.trim() === "") {
        process.stderr.write("BLOCKED (guard-dispatch, plugin pipeline-core): APB-PARENT-TOOL-USE-ID-MISSING: a prohibition-bearing dispatch requires the host tool-use id before launch.\n");
        process.exit(2);
      }
      const rootDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
      const commonDir = resolveGitCommonDir(rootDir);
      const persisted = commonDir === null
        ? { status: "rejected", code: "APB-PENDING-WRITE" }
        : persistPendingAdvisorProhibitionBindings({ commonDir, toolUseId, bindings: advisorBinding.bindings });
      if (persisted.status !== "prepared") {
        process.stderr.write(`BLOCKED (guard-dispatch, plugin pipeline-core): ${persisted.code}: the Advisor prohibition could not be bound to this dispatch before launch.\n`);
        process.exit(2);
      }
    }
    const budgetBindings = evaluated
      .filter(({ budget }) => budget.status === "prepared")
      .map(({ dispatch, budget }) => ({
        agentType: dispatch.subagentType,
        baseCalls: budget.baseCalls,
        maxTurns: budget.maxTurns,
        effectiveCap: budget.effectiveCap,
      }));
    if (bindingCapableTool && budgetBindings.length > 0) {
      if (typeof toolUseId !== "string" || toolUseId.trim() === "") {
        process.stderr.write("BLOCKED (guard-dispatch, plugin pipeline-core): DBB-PARENT-TOOL-USE-ID-MISSING: a budget-bearing dispatch requires the host tool-use id before launch.\n");
        process.exit(2);
      }
      const rootDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
      const commonDir = resolveGitCommonDir(rootDir);
      const persisted = commonDir === null
        ? { status: "rejected", code: "DBB-PENDING-BINDING-WRITE" }
        : persistPendingDispatchBudgetBindings({ commonDir, toolUseId, bindings: budgetBindings });
      if (persisted.status !== "prepared") {
        process.stderr.write(`BLOCKED (guard-dispatch, plugin pipeline-core): ${persisted.code}: the validated tool budget could not be bound to this dispatch before launch.\n`);
        process.exit(2);
      }
    }
    const nativeMarker = "<!-- pipeline-native-goldfish-host-commit:v1";
    const markedNative = dispatches.filter((dispatch) => dispatch.prompt.includes(nativeMarker) || dispatch.prompt.includes(codexV2Marker) || dispatch.prompt.includes(itemV3Marker));
    if (markedNative.length > 0) {
      const nativeRunner = ["Task", "Agent"].includes(input?.tool_name) ? "claude"
        : input?.tool_name === "spawn_agent" ? "codex" : null;
      if (!nativeRunner || dispatches.length !== 1) {
        process.stderr.write("WARNING (guard-dispatch): marked native host-commit route is not a single direct Claude Task or Codex spawn_agent; child changes will not be host-committed.\n");
      } else {
        const rootDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
        const prepared = prepareNativeGoldfishHostState({ root: rootDir, runner: nativeRunner, input });
        if (!prepared.ok) {
          // Claude runtimes without a run_in_background parameter cannot launch in the foreground;
          // item admission and the budget binding already ran, so fall back to an uncommitted child.
          // That fallback is for a runtime that carries NO such key at all: NGHS-CLAUDE-FOREGROUND-REQUIRED
          // also fires for an explicit run_in_background: true, a runtime that does have the parameter and
          // chose to launch in the background, and that stays BLOCKED for an item-governed dispatch.
          const claudeBackgroundOnly = nativeRunner === "claude" && prepared.code === "NGHS-CLAUDE-FOREGROUND-REQUIRED"
            && !Object.hasOwn(toolInput, "run_in_background");
          if (markedV2.length > 0 || (itemGovernanceRequired && !claudeBackgroundOnly)) {
            process.stderr.write(`BLOCKED (guard-dispatch): ${prepared.code}: version 2 native host binding failed before launch.\n`);
            process.exit(2);
          }
          process.stderr.write(`WARNING (guard-dispatch): native host-commit preparation failed (${prepared.code}); dispatch continues, the child must leave changes uncommitted, and no authorship record will be claimed.\n`);
        }
      }
    }
    // V-10, last step before admitting: record the route digest of every Goldfish briefing this call admits
    // (origin "admission"; the latest admission of a slice wins). Every earlier refusal of this hook has already
    // exited, so a refused briefing writes no record; a conflict inside the call was refused in the route check.
    const admitted = recordAdmittedBriefingRoutes({
      dispatches: evaluated.filter(({ policy }) => requiresGovernedItemAdmission(policy)).map(({ dispatch }) => ({ prompt: dispatch.prompt })),
      root: routeRoot,
    });
    if (!admitted.ok && admitted.fault) {
      // A record-write fault the precheck could not see (a transient write/readback error) arrives after the admission
      // effects persisted: refusing now would leave them behind, so the dispatch is admitted with a typed warning.
      process.stderr.write(briefingRouteWriteFault(admitted.fault, { admitted: true }));
    } else if (!admitted.ok) {
      process.stderr.write(briefingRouteRefusal(admitted.route));
      process.exit(2);
    }
    process.exit(0);
  }

  const { role, findings } = blocked[0];
  const template = role === "critic" ? "templates/prompts/critic-review.md"
    : role === "goldfish" ? "templates/prompts/goldfish-task.md"
      : "the shipped role registry";
  const guidance = role === "critic" || role === "goldfish"
    ? [
        `Correct the packet using ${template} and dispatch that. The template already forbids`,
        "every pattern listed above, in those words. A review steered by the dispatcher's own",
        "hypotheses is not an independent review, and an incomplete briefing is not dispatchable.",
        "",
        "This check is structural. It cannot see a steer written in fresh prose — read the template.",
      ]
    : [
        "Correct the role and prompt fields using the shipped role registry, then dispatch again.",
      ];
  const receipt = {
    schema: "pipeline.role-dispatch-preflight.v1",
    status: "rejected",
    phase: "packet",
    findings: findings.map(({ code }) => code),
    modelCalls: 0,
  };
  process.stderr.write([
    `BLOCKED (guard-dispatch, plugin pipeline-core): this ${role} dispatch failed before launch against ${template}.`,
    JSON.stringify(receipt),
    "",
    ...findings.map((f, i) => `  ${i + 1}. ${f.code}\n     ${f.why}`),
    "",
    ...guidance,
    "",
  ].join("\n"));
  process.exit(2);
}

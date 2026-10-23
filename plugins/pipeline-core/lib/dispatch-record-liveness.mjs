// SPDX-License-Identifier: SUL-1.0
//
// ALF-K13 / PO decision D110 (backlog item parallel-work-in-one-checkout-is-unsafe, "Observed again 2026-10-05"): the LIVENESS READBACK of an
// open dispatch record's owner. There is NO second liveness mechanism and NO new persisted field: the signal is the session-owner runtime
// judgement the pipeline already makes (PID plus process start identity, `inspectSessionOwnerRuntime`), reached through what a record
// already carries:
//
//   open record (evidence/dispatch-record-<id>.json, outcome non-terminal or the interim `committed-pending-report`)
//     -> its v2 landed owner claim (sessionId + ownerNonceSha256, under <git-common-dir>/agent-pipeline/dispatch-record-owner/)
//     -> the session descriptor named by that sessionId (ownerRuntime {pid, processStartId})
//     -> inspectSessionOwnerRuntime: live -> alive; not-live, reused -> gone; unavailable, unobserved -> unjudgeable.
//
// "Dead only on proof", like the registry lock: a record with only a v1 claim (it carries no PID), a Claude hook identity descriptor
// (ownerRuntime is null by design), a missing descriptor, a session whose nonce is not the claim's, an unreadable claim or an unobservable
// process is `unjudgeable`, never `gone`.
//
// READ-ONLY by construction: it opens files for reading only, takes no lock, retires and heals nothing, and creates no registry state.
// No kernel-list path imports this module (it imports kernel modules, not the other way round).
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { isSafeTaskId, isTerminalOutcome } from "./dispatch-record.mjs";
import { DISPATCH_RECORD_INTERIM_OUTCOME, DISPATCH_RECORD_OWNER_SCHEMA, LANDED_DISPATCH_RECORD_OWNER_SCHEMA } from "./guard/dispatch-record-lane.mjs";
import { inspectSessionOwnerRuntime, inspectSignedDescriptorCustodyRepository, loadSessionDescriptor } from "./worktree-lifecycle.mjs";

export const DISPATCH_RECORD_LIVENESS_SCHEMA = "pipeline.dispatch-record-liveness.v1";
export const DISPATCH_RECORD_LIVENESS_VERDICTS = Object.freeze(["alive", "gone", "unjudgeable"]);

const RECORD_FILE = /^dispatch-record-([A-Za-z0-9._-]+)\.json$/u;
const READ_LIMIT = 1048576;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

// inspectSessionOwnerRuntime status -> verdict and reason. Every status the inspector can return is listed; anything else is unjudgeable.
const OWNER_STATUS = Object.freeze({
  live: ["alive", "owner-process-live"],
  "not-live": ["gone", "owner-process-gone"],
  reused: ["gone", "owner-pid-reused"],
  unavailable: ["unjudgeable", "owner-runtime-unavailable"],
  unobserved: ["unjudgeable", "owner-unobserved"],
});

function readSmallFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > READ_LIMIT) throw new Error("not a small regular file");
  return readFileSync(path, "utf8");
}

/** The claim as the guard wrote it, judged leniently: this is a diagnostic, and anything it cannot trust is `invalid`, never `gone`. */
function readClaim(commonDir, taskId) {
  const path = join(commonDir, "agent-pipeline", "dispatch-record-owner", `${taskId}.json`);
  let text;
  try { text = readSmallFile(path); } catch (error) { return error?.code === "ENOENT" ? { kind: "none" } : { kind: "invalid" }; }
  let claim;
  try { claim = JSON.parse(text); } catch { return { kind: "invalid" }; }
  if (claim === null || typeof claim !== "object" || Array.isArray(claim) || claim.taskId !== taskId) return { kind: "invalid" };
  if (claim.schema === LANDED_DISPATCH_RECORD_OWNER_SCHEMA) {
    if (typeof claim.sessionId !== "string" || !SESSION_ID.test(claim.sessionId) || !SHA256.test(String(claim.ownerNonceSha256))) return { kind: "invalid" };
    return { kind: "landed-v2", sessionId: claim.sessionId, ownerNonceSha256: claim.ownerNonceSha256 };
  }
  if (claim.schema === DISPATCH_RECORD_OWNER_SCHEMA) return { kind: "attempted-v1" };
  return { kind: "invalid" };
}

function judgeOwner(root, claim, options) {
  const inspect = options.inspectOwnerFn ?? inspectSessionOwnerRuntime;
  const inspectOptions = options.platform === undefined ? {} : { platform: options.platform };
  let loaded;
  try { loaded = (options.loadSessionDescriptorFn ?? loadSessionDescriptor)(root, claim.sessionId, inspectOptions); }
  catch (error) { return ["unjudgeable", error?.code === "WT-SESSION-MISSING" ? "descriptor-missing" : "descriptor-unreadable"]; }
  // A session id is only a name: the claim binds the INCARNATION by the nonce digest, so a reused name is not this owner.
  if (createHash("sha256").update(Buffer.from(String(loaded.ownerNonce))).digest("hex") !== claim.ownerNonceSha256) return ["unjudgeable", "session-nonce-mismatch"];
  let owner;
  try { owner = inspect(root, claim.sessionId, { ...inspectOptions, expectedDescriptorSha256: loaded.descriptorSha256 }); }
  catch { return ["unjudgeable", "owner-inspection-failed"]; }
  return OWNER_STATUS[owner?.status] ?? ["unjudgeable", "owner-status-unknown"];
}

function openRecordOutcome(path) {
  let record;
  try { record = JSON.parse(readSmallFile(path)); } catch { return { readable: false }; }
  if (record === null || typeof record !== "object") return { readable: false };
  const outcome = typeof record.outcome === "string" ? record.outcome : null;
  const open = !isTerminalOutcome(outcome) || String(outcome).trim().toLowerCase() === DISPATCH_RECORD_INTERIM_OUTCOME;
  return { readable: true, open, outcome };
}

/**
 * One typed entry per OPEN dispatch record of the checkout at `root`. `options.task` narrows to one task id. `options.platform`,
 * `options.inspectOwnerFn` and `options.loadSessionDescriptorFn` are test seams of the existing inspector, not new mechanisms.
 */
export function readDispatchRecordLiveness(root, options = {}) {
  const primary = realpathSync(root);
  const { commonDir } = inspectSignedDescriptorCustodyRepository(primary);
  const evidence = join(primary, "evidence");
  let names = [];
  try { if (statSync(evidence).isDirectory()) names = readdirSync(evidence).sort(); } catch { names = []; }
  const records = [];
  for (const name of names) {
    const match = RECORD_FILE.exec(name);
    if (!match || !isSafeTaskId(match[1]) || (options.task !== undefined && options.task !== match[1])) continue;
    const taskId = match[1];
    const read = openRecordOutcome(join(evidence, name));
    const base = { taskId, record: `evidence/${name}` };
    if (!read.readable) { records.push({ ...base, outcome: null, claimKind: "unknown", verdict: "unjudgeable", reason: "record-unreadable" }); continue; }
    if (!read.open) continue;
    const claim = readClaim(commonDir, taskId);
    const entry = { ...base, outcome: read.outcome, claimKind: claim.kind };
    if (claim.kind === "landed-v2") {
      const [verdict, reason] = judgeOwner(primary, claim, options);
      records.push({ ...entry, sessionId: claim.sessionId, verdict, reason });
    } else if (claim.kind === "attempted-v1") records.push({ ...entry, verdict: "unjudgeable", reason: "claim-v1-has-no-owner-process" });
    else if (claim.kind === "none") records.push({ ...entry, verdict: "unjudgeable", reason: "no-owner-claim" });
    else records.push({ ...entry, verdict: "unjudgeable", reason: "claim-invalid" });
  }
  const counts = { alive: 0, gone: 0, unjudgeable: 0 };
  for (const entry of records) counts[entry.verdict] += 1;
  return { schema: DISPATCH_RECORD_LIVENESS_SCHEMA, status: "inspected", readOnly: true, records, counts };
}

const LIVENESS_SCRIPT = fileURLToPath(new URL("../scripts/dispatch-record-liveness.mjs", import.meta.url));
const WRITER_SCRIPT = fileURLToPath(new URL("../scripts/dispatch-record-write.mjs", import.meta.url));
const plain = (text) => String(text).replace(/[\u0000-\u001f\u007f]+/gu, " ").trim().slice(0, 200);

/**
 * ALF-K39 / D110: the guard-side use of the readback. Before a dispatch that would start a SECOND WRITER in the checkout at `root` is
 * admitted, every open dispatch record of that checkout is consulted. An `alive` owner refuses (self-describing, one runnable repair);
 * `gone` never blocks (a stale record is not a lock); `unjudgeable` never blocks and is announced, never a silent pass. A record of the
 * dispatch being admitted (`ownTaskIds`) is never held against it, and a dispatch isolated in its own worktree writes in another checkout.
 * Returns `{ refusal, advisory }` (strings, empty when none); never throws, and an unreadable readback is itself an advisory.
 */
export function secondWriterAdmission({ root, ownTaskIds = [], isolated = false, readFn = readDispatchRecordLiveness, ...seams } = {}) {
  if (isolated) return { refusal: "", advisory: "" };
  let records;
  try { records = readFn(root, seams).records.filter((entry) => !ownTaskIds.includes(entry.taskId)); }
  catch (error) {
    return { refusal: "", advisory: `WARNING (guard-dispatch): GUARD-DISPATCH-SECOND-WRITER-UNJUDGED: the open dispatch records of this checkout could not be read (${plain(error?.message)}), so this dispatch is admitted without a second-writer check. Re-check with: node ${LIVENESS_SCRIPT} --root ${root}\n` };
  }
  const alive = records.filter((entry) => entry.verdict === "alive");
  const unjudged = records.filter((entry) => entry.verdict === "unjudgeable");
  const describe = (entry) => `${entry.record} (outcome ${entry.outcome ?? "unreadable"}${entry.sessionId ? `, owner session ${entry.sessionId}` : ""}, ${entry.reason})`;
  const refusal = alive.length === 0 ? "" : [
    `BLOCKED (guard-dispatch, plugin pipeline-core): GUARD-DISPATCH-SECOND-WRITER: this dispatch would start a second writer in a checkout where an open dispatch record is owned by a process that is still alive: ${alive.map(describe).join("; ")}.`,
    `A second writer would overwrite that dispatch's files (backlog 2026-10-04-parallel-work-in-one-checkout-is-unsafe). Repair, one of: wait until that dispatch finishes and dispatch again (re-check with: node ${LIVENESS_SCRIPT} --root ${root}); or, if you know it is abandoned, finalize its record with a terminal outcome through the sanctioned writer (node ${WRITER_SCRIPT} --repo-root ${root} --request <repo-relative request json>); or isolate this dispatch in its own worktree.`, "",
  ].join("\n");
  const advisory = unjudged.length === 0 ? "" : `WARNING (guard-dispatch): GUARD-DISPATCH-SECOND-WRITER-UNJUDGED: open dispatch record(s) of this checkout whose owner cannot be judged alive or gone: ${unjudged.map(describe).join("; ")}. This dispatch is admitted (an unjudgeable owner never blocks); check them with: node ${LIVENESS_SCRIPT} --root ${root}\n`;
  return { refusal, advisory };
}

// ---------------------------------------------------------------------------------------------------------------------
// K93 / PO decision (K12 S2, row 25): the write-scope overlap of dispatches is refused WITHOUT a slice queue. Two sources of
// parties are judged by their declared write scopes alone: the dispatches of ONE tool call (the parallel batch) and the
// dispatches that may still be writing in this checkout (an open dispatch record whose owner is alive or unjudgeable; the same
// readback as above). The overlap predicate is the pure `scopesOverlap` of slice-queue.mjs. The default is enforce; the explicit
// switch PIPELINE_FANOUT_SCOPE_MODE=shadow admits with a warning. A scope that cannot be read warns only. Read-only by
// construction (file reads, no lock), and neutral across runners and operating systems (no shell syntax in a message).
export const SCOPE_OVERLAP_SWITCH = "PIPELINE_FANOUT_SCOPE_MODE";
const SCOPE_SCAN_LIMIT = 500;
const BRIEFING_MARKER = "<!-- pipeline-native-goldfish-host-commit:v";
const shownPaths = (paths) => (paths.length <= 5 ? paths.join(", ") : `${paths.slice(0, 5).join(", ")} and ${paths.length - 5} more`);

/** `enforce` unless the environment names `shadow` explicitly; any other value enforces. */
export const scopeOverlapMode = (env = process.env) => (env?.[SCOPE_OVERLAP_SWITCH] === "shadow" ? "shadow" : "enforce");

// The briefing parsers (`parseNativeGoldfishBriefing`, `parseDispatchSlice`) are injected by the caller, not imported: this module
// is reached from the import cycle through project-onboarding-v3 (via scripts/dispatch-briefing.mjs), and importing them here changes
// the initialisation order (a temporal-dead-zone fault in project-onboarding-ready-gate, observed while building K93). For the same
// reason hooks/guard-dispatch.mjs does not import this module: it spawns scripts/dispatch-record-liveness.mjs (K104).
/** The allowed paths of every generated briefing directly under scratch/, by dispatch id (read-only, bounded, never throws). */
function briefedWriteScopes(root, parseBriefing) {
  const scopes = new Map();
  try {
    const dir = realpathSync(join(root, "scratch"));
    if (dir !== join(realpathSync(root), "scratch")) return scopes;
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".md")).sort().slice(0, SCOPE_SCAN_LIMIT)) {
      try {
        const info = lstatSync(join(dir, name));
        if (!info.isFile() || info.isSymbolicLink() || info.size > READ_LIMIT) continue;
        const text = readFileSync(join(dir, name), "utf8");
        const parsed = text.includes(BRIEFING_MARKER) ? parseBriefing(text) : null;
        if (parsed?.ok && !scopes.has(parsed.binding.dispatchId)) scopes.set(parsed.binding.dispatchId, [...parsed.binding.allowedPaths]);
      } catch { /* a file that is not a briefing is not a source of scopes */ }
    }
  } catch { /* no scratch directory */ }
  return scopes;
}

/**
 * D76: the dispatches that may still be writing in this checkout, each with its write scope when it can be read. A dispatch
 * is running while its record (evidence/dispatch-record-<id>.json) is open and its owner is not provably gone (alive, or
 * unjudgeable, which is the usual Claude case). Its scope is the governed queue row's write scope, else the allowed paths of
 * its generated briefing under scratch/; `writeScope` is null when neither exists. A checkout whose records cannot be read
 * has no running dispatch to judge. Shared by this guard and scripts/dispatch-briefing.mjs (one reading of "running").
 * `queueRowFn(root, id)` (the governed queue row of an id, or null) is injected by the caller: this module must not import the
 * governed-queue module (an import cycle through guard-dispatch would initialise modules in a different order).
 */
export function readRunningDispatches(root, { readFn = readDispatchRecordLiveness, queueRowFn = () => null, parseBriefing = () => null } = {}) {
  let records;
  try { records = readFn(root).records.filter((entry) => entry.verdict !== "gone"); } catch { return []; }
  if (records.length === 0) return [];
  const briefed = briefedWriteScopes(root, parseBriefing);
  return records.map((entry) => {
    let row = null;
    try { row = queueRowFn(root, entry.taskId); } catch { row = null; }
    return { dispatchId: entry.taskId, verdict: entry.verdict, record: entry.record, writeScope: row?.writeScope ?? briefed.get(entry.taskId) ?? null };
  });
}

/**
 * Judges the write scopes of `dispatches` ([{ prompt }], the Goldfish dispatches of one call) against each other and against
 * `running` (readRunningDispatches). `declare(prompt)` returns `{ id, scope }` (a path list, "none", or null); `overlaps(a, b)` is `scopesOverlap` of slice-queue.mjs (injected, like `declare`, to keep this module free of imports that join the guard's import cycle). `isolated` (the call runs in its own worktree) judges nothing. Returns strings, empty
 * when there is nothing to say: `refusal` (enforce, an overlap), `warning` (shadow overlap, and unreadable scopes). Never throws.
 */
export function scopeOverlapAdmission({ dispatches = [], running = [], mode = "enforce", isolated = false, declare = () => ({ id: null, scope: null }), overlaps } = {}) {
  if (isolated) return { refusal: "", warning: "" };
  try {
    const parties = [];
    dispatches.forEach((dispatch, index) => {
      const declared = declare(dispatch?.prompt);
      if (declared.scope === "none") return; // read-only: nothing to overwrite
      parties.push({ id: declared.id, name: declared.id ?? `dispatch #${index + 1} of this call`, where: "this call", scope: Array.isArray(declared.scope) ? declared.scope : null });
    });
    if (parties.length === 0) return { refusal: "", warning: "" };
    const own = new Set(parties.map((party) => party.id).filter(Boolean));
    const others = running.filter((entry) => !own.has(entry.dispatchId)).map((entry) => ({
      id: entry.dispatchId, name: plain(entry.dispatchId), running: true, where: `open dispatch record ${plain(entry.record ?? "")}, owner ${plain(entry.verdict ?? "unknown")}`,
      scope: Array.isArray(entry.writeScope) && entry.writeScope.length > 0 ? entry.writeScope : null,
    }));
    const conflicts = [];
    const unreadable = [];
    const note = (party) => { if (!unreadable.includes(party)) unreadable.push(party); };
    parties.forEach((first, index) => {
      for (const second of [...parties.slice(index + 1), ...others]) {
        if (first.scope === null || second.scope === null) { if (first.scope === null) note(first); if (second.scope === null) note(second); continue; }
        const paths = [];
        for (const mine of first.scope) for (const theirs of second.scope) {
          const shown = mine === theirs ? mine : `${mine} (against ${theirs})`;
          if (!paths.includes(shown) && overlaps([mine], [theirs])) paths.push(shown);
        }
        if (paths.length > 0) conflicts.push({ first: second.running ? second : first, second: second.running ? first : second, paths });
      }
    });
    let text = "";
    if (conflicts.length > 0) {
      const lead = conflicts[0];
      const switchText = mode === "shadow"
        ? `Mode: shadow (set explicitly through ${SCOPE_OVERLAP_SWITCH}=shadow); this call is admitted. Unset ${SCOPE_OVERLAP_SWITCH} to enforce.`
        : `Mode: enforce (the default). To admit such an overlap with a warning instead, set the environment variable ${SCOPE_OVERLAP_SWITCH}=shadow for the hook.`;
      text = [
        `GUARD-DISPATCH-SCOPE-OVERLAP: dispatches would write the same paths in one checkout, and two dispatches writing the same paths overwrite each other:`,
        ...conflicts.map((c) => `  - ${c.first.name} (${c.first.where}) and ${c.second.name} (${c.second.where}) both write: ${shownPaths(c.paths)}`),
        `Repair, one of:`,
        `  1. Sequence them: send ${lead.second.name} in a later call, after ${lead.first.name} has finished (a terminal dispatch record).`,
        `  2. Narrow one allowed-path list (the "Write scope:" line, or the --path list of the generated briefing) of ${lead.first.name} or ${lead.second.name} until the two lists no longer share a path.`,
        `  3. Where the runner offers isolation, run ${lead.second.name} in its own worktree: set isolation: "worktree" on that dispatch call (a call with that setting is not checked here; it writes in another checkout).`,
        ...(conflicts.some((c) => c.first.running) ? [`  4. If a running dispatch above is abandoned, finalize its dispatch record with a terminal outcome through the sanctioned dispatch-record writer (scripts/dispatch-record-write.mjs).`] : []),
        switchText,
      ].join("\n");
    }
    const unknown = unreadable.length === 0 ? "" : `GUARD-DISPATCH-SCOPE-UNKNOWN: the write scope of ${unreadable.map((party) => party.name).join(", ")} could not be read (no "Write scope:" line, generated briefing or governed queue row), so this call was not checked against ${unreadable.length === 1 ? "it" : "them"}; confirm the scopes are disjoint before dispatching.`;
    return {
      refusal: mode === "enforce" && text !== "" ? `BLOCKED (guard-dispatch, plugin pipeline-core): ${text}\n` : "",
      warning: [mode === "enforce" ? "" : text, unknown].filter(Boolean).map((line) => `WARNING (guard-dispatch): ${line}\n`).join(""),
    };
  } catch (error) {
    return { refusal: "", warning: `WARNING (guard-dispatch): GUARD-DISPATCH-SCOPE-UNJUDGED: the write-scope overlap check could not run (${plain(error?.message)}); this call is admitted without it.\n` };
  }
}

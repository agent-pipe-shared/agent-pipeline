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

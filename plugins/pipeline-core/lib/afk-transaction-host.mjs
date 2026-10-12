import {authorityRepositoryFromRoot} from './session-authority-domain-owner.mjs';
import {withAfkAuthorityLifetime,executeSourceOwnedAfkProjectionLifetime,readSourceOwnedAfkProjectionPhysicalSnapshot} from './afk-ledger.mjs';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readAuthoritySourceFile} from './session-authority-domain-owner.mjs';
import {readSourceOwnedOnboardingAfkAdmission,settleSourceOwnedOnboardingAfkProjection,observeSourceOwnedControlledMethodAfkHostCheckpoint} from './onboarding-continuity.mjs';
// SPDX-License-Identifier: SUL-1.0
import { hostname } from "node:os";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { canonicalJson, sha256Canonical, validateActivationReceipt } from "./afk-assumption-mode.mjs";
import {
  acquireAfkWriterLock,
  appendAfkLedgerRecord,
  createAfkWriterOwner,
  loadAfkLedger,
  releaseAfkWriterLock,
} from "./afk-ledger.mjs";
import {
  applyAfkEntryPlan,
  executeAfkEntryTransaction,
  observeAfkGitAuthority,
  reconcileAfkActivation,
} from "./afk-git-adapter.mjs";
import { executeAfkReviewTransaction } from "./afk-review.mjs";
import { GIT_NULL_DEVICE } from "./git-null-device.mjs";

const HEX32 = /^[0-9a-f]{32}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_HOST = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

function fail(code, detail = null, mutation = "none") {
  return { ok: false, code, detail, mutation };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, "--no-optional-locks", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE,
      GIT_TERMINAL_PROMPT: "0",
      GIT_PAGER: "cat",
    },
  }).trim();
}

function gitCommonDir(root) {
  const value = git(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return realpathSync(isAbsolute(value) ? value : resolve(root, value));
}

function processStart(pid) {
  const text = readFileSync(`/proc/${pid}/stat`, "utf8");
  const close = text.lastIndexOf(")");
  if (close < 0) throw new Error("invalid proc stat");
  const fields = text.slice(close + 2).trim().split(/\s+/u);
  if (fields.length < 20 || !/^[0-9]+$/u.test(fields[19])) throw new Error("invalid proc start");
  return fields[19];
}

function localIdentity(activationId, recordedAt) {
  const hostId = hostname().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim().toLowerCase();
  if (!SAFE_HOST.test(hostId) || !SAFE_HOST.test(bootId)) throw new Error("host identity unavailable");
  return createAfkWriterOwner({
    hostId,
    bootId,
    pid: process.pid,
    processStart: processStart(process.pid),
    activationId,
    acquiredAt: recordedAt,
  }).owner;
}

function inspectOwnerAgainst(owner, local) {
  if (owner.hostId !== local.hostId) return { sameHost: false, sameBoot: false, dead: false };
  if (owner.bootId !== local.bootId) return { sameHost: true, sameBoot: false, dead: false };
  try {
    const observedStart = processStart(owner.pid);
    return { sameHost: true, sameBoot: true, dead: observedStart !== owner.processStart };
  } catch (error) {
    if (error?.code === "ENOENT") return { sameHost: true, sameBoot: true, dead: true };
    return { sameHost: true, sameBoot: true, dead: false };
  }
}

function projection(activationId, status, ledger, privateRefOid, updatedAt) {
  return {
    schema: "pipeline.afk-projection.v1",
    activationId,
    status,
    ledgerSequence: ledger.sequence,
    ledgerHeadSha256: ledger.headSha256,
    privateRefOid,
    updatedAt,
  };
}

function recordList(ledger) {
  return ledger.frames.map(({ record }) => record);
}

function findRecords(ledger, type) {
  return ledger.frames.filter(({ record }) => record.type === type);
}

function acquireHostLock({ root, activationId, recordedAt, onRecovery }) {
  const commonDir = gitCommonDir(root);
  const owner = localIdentity(activationId, recordedAt);
  const lock = acquireAfkWriterLock({
    gitCommonDir: commonDir,
    activationId,
    owner,
    inspectOwner: (existing) => inspectOwnerAgainst(existing, owner),
    appendRecoveryRecord: (body) => onRecovery(commonDir, body),
    observedAt: recordedAt,
  });
  return { commonDir, lock };
}

function append(commonDir, activationId, type, body, recordedAt) {
  const current = loadAfkLedger(commonDir, activationId);
  if (!current.ok) return current;
  return appendAfkLedgerRecord({
    gitCommonDir: commonDir,
    activationId,
    type,
    body,
    recordedAt,
    expectedHeadSha256: current.headSha256,
  });
}

function hostLock(root, activationId, recordedAt) {
  const acquired = acquireHostLock({
    root,
    activationId,
    recordedAt,
    onRecovery(commonDir, body) {
      return append(commonDir, activationId, "lock-recovered", body, recordedAt);
    },
  });
  const row=ownedAfkHostScope.getStore();
  if (row) {
    ownedAfkCurrent(row.admissionHandle);
    if (row.phase!=='executing'||row.lock||root!==row.binding.repository.primaryRoot||activationId!==row.binding.activationId) ownedAfkRefuse();
    row.lock=acquired.lock;
  }
  return acquired;
}

function releaseWithOutcome(lock, outcome) {
  const released = releaseAfkWriterLock(lock);
  if (!released.ok && outcome.ok) return fail("AFK-WRITER-LOCK-RELEASE-FAILED", null, "unknown");
  return outcome;
}

function wallClock(receipt, recordedAt) {
  const now = Date.parse(recordedAt);
  if (!Number.isFinite(now) || new Date(now).toISOString() !== recordedAt) return fail("AFK-CLOCK-INVALID");
  if (now < Date.parse(receipt.lastWallClock)) return fail("AFK-CLOCK-ROLLBACK");
  if (now >= Date.parse(receipt.expiresAt)) return fail("AFK-REVIEW-REQUIRED");
  return { ok: true };
}

function requireProjectionWriter(refreshProjection) {
  return typeof refreshProjection === "function"
    ? { ok: true }
    : fail("AFK-PROJECTION-WRITER-UNAVAILABLE");
}

function executeAfkActivationHostTransactionUnregistered({
  root,
  receipt,
  recordedAt,
  refreshProjection,
}) {
  if (!validateActivationReceipt(receipt).ok || !HEX32.test(receipt.activationId)
    || !requireProjectionWriter(refreshProjection).ok) return fail("AFK-PROJECTION-WRITER-UNAVAILABLE");
  let acquired;
  try { acquired = hostLock(root, receipt.activationId, recordedAt); } catch { return fail("AFK-HOST-LOCK-OBSERVATION-FAILED"); }
  if (!acquired.lock.ok) return acquired.lock;
  let outcome;
  try {
    const ledger = loadAfkLedger(acquired.commonDir, receipt.activationId);
    if (!ledger.ok) outcome = ledger;
    else {
      const intents = findRecords(ledger, "activation-intent");
      const ready = findRecords(ledger, "activation-ready");
      if (intents.length > 1 || ready.length > 1
        || (intents.length === 1 && canonicalJson(intents[0].record.body.receipt) !== canonicalJson(receipt))) {
        outcome = fail("AFK-ACTIVATION-LEDGER-CONFLICT");
      } else if (ready.length === 1) {
        const observed = observeAfkGitAuthority(root, `refs/agent-pipeline/afk/${receipt.activationId}`);
        if (!observed.ok || observed.refOid !== receipt.base.commit) outcome = fail("AFK-GIT-REF-CONFLICT");
        else {
          const current = loadAfkLedger(acquired.commonDir, receipt.activationId);
          refreshProjection(projection(receipt.activationId, "active", current, receipt.base.commit, recordedAt));
          outcome = { ok: true, status: "duplicate", mutation: "none", receipt };
        }
      } else {
        outcome = reconcileAfkActivation({
          root,
          receipt,
          recordedAt,
          intentAlreadyRecorded: intents.length === 1,
          appendRecord: (type, body, time) => append(acquired.commonDir, receipt.activationId, type, body, time),
          refreshProjection: () => {
            const current = loadAfkLedger(acquired.commonDir, receipt.activationId);
            refreshProjection(projection(receipt.activationId, "active", current, receipt.base.commit, recordedAt));
          },
        });
      }
    }
  } catch {
    outcome = fail("AFK-ACTIVATION-HOST-FAILED", null, "unknown");
  }
  return releaseWithOutcome(acquired.lock, outcome);
}

function completedEntry(ledger, intent) {
  return findRecords(ledger, "entry-applied").find(({ record }) => record.body.entryId === intent.body.entryId);
}

function executeAfkEntryHostTransactionUnregistered({
  root,
  request,
  proposal,
  recordedAt,
  refreshProjection,
}) {
  if (!HEX32.test(request?.activationId ?? "") || !requireProjectionWriter(refreshProjection).ok) {
    return fail("AFK-PROJECTION-WRITER-UNAVAILABLE");
  }
  let acquired;
  try { acquired = hostLock(root, request.activationId, recordedAt); } catch { return fail("AFK-HOST-LOCK-OBSERVATION-FAILED"); }
  if (!acquired.lock.ok) return acquired.lock;
  let outcome;
  try {
    let ledger = loadAfkLedger(acquired.commonDir, request.activationId);
    if (!ledger.ok) outcome = ledger;
    else {
      const activationIntents = findRecords(ledger, "activation-intent");
      const activationReady = findRecords(ledger, "activation-ready");
      const activationReceipt = activationIntents[0]?.record.body.receipt;
      if (activationIntents.length !== 1 || activationReady.length !== 1
        || !validateActivationReceipt(activationReceipt).ok
        || activationReceipt.receiptSha256 !== request.activationReceiptSha256) {
        outcome = fail("AFK-ENTRY-AUTHORITY-INVALID");
      } else if (!wallClock(activationReceipt, recordedAt).ok) {
        outcome = wallClock(activationReceipt, recordedAt);
      } else {
        const intents = findRecords(ledger, "entry-intent");
        const sameSequence = intents.filter(({ record }) => record.body.proposal.sequence === request.sequence);
        const matching = sameSequence.find(({ record }) => record.body.requestSha256 === request.requestSha256
          && record.body.resultSha256 === proposal.resultSha256);
        if (sameSequence.length > 1 || (sameSequence.length === 1 && matching === undefined)) {
          outcome = fail("AFK-ENTRY-SEQUENCE-CONFLICT");
        } else if (matching !== undefined) {
          const existingApplied = completedEntry(ledger, matching.record);
          const applied = applyAfkEntryPlan({ root, activationId: request.activationId, intent: matching.record.body });
          if (!applied.ok) outcome = applied;
          else {
            if (existingApplied === undefined) {
              const body = {
                entryId: matching.record.body.entryId,
                privateRef: applied.privateRef,
                parentCommit: matching.record.body.parentCommit,
                resultCommit: matching.record.body.resultCommit,
                resultTree: matching.record.body.resultTree,
              };
              const recorded = append(acquired.commonDir, request.activationId, "entry-applied", body, recordedAt);
              if (!recorded.ok) throw new Error("applied record failed");
            } else if (existingApplied.record.body.resultCommit !== matching.record.body.resultCommit) {
              outcome = fail("AFK-ENTRY-APPLIED-CONFLICT");
            }
            if (outcome === undefined) {
              ledger = loadAfkLedger(acquired.commonDir, request.activationId);
              refreshProjection(projection(request.activationId, "active", ledger, matching.record.body.resultCommit, recordedAt));
              outcome = { ok: true, status: "duplicate", mutation: existingApplied ? "none" : "wal", intent: matching.record.body };
            }
          }
        } else if (intents.length >= activationReceipt.budgets.entries) {
          outcome = fail("AFK-ENTRY-BUDGET-EXHAUSTED");
        } else {
          outcome = executeAfkEntryTransaction({
            root,
            request,
            proposal,
            entryId: `entry-${String(request.sequence).padStart(6, "0")}`,
            gitTimestamp: `${Math.floor(Date.parse(recordedAt) / 1000)} +0000`,
            recordedAt,
            appendRecord: (type, body, time) => append(acquired.commonDir, request.activationId, type, body, time),
            refreshProjection: () => {
              const current = loadAfkLedger(acquired.commonDir, request.activationId);
              const privateRef = observeAfkGitAuthority(root, `refs/agent-pipeline/afk/${request.activationId}`);
              refreshProjection(projection(request.activationId, "active", current, privateRef.refOid, recordedAt));
            },
          });
        }
      }
    }
  } catch {
    outcome = fail("AFK-ENTRY-HOST-FAILED", null, "unknown");
  }
  return releaseWithOutcome(acquired.lock, outcome);
}

function linkedFeatureCheckouts(root, featureRef) {
  const raw = execFileSync("git", ["-C", root, "worktree", "list", "--porcelain", "-z"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: GIT_NULL_DEVICE },
  });
  return raw.split("\0").filter((line) => line === `branch ${featureRef}`).length;
}

function executeAfkReviewHostTransactionUnregistered({ root, activationId, reviewInput, refreshProjection }) {
  if (!HEX32.test(activationId ?? "") || !reviewInput || !SAFE_HOST.test(reviewInput.reviewId ?? "")
    || !Array.isArray(reviewInput.dispositions) || !requireProjectionWriter(refreshProjection).ok) {
    return fail("AFK-REVIEW-HOST-INVALID");
  }
  const recordedAt = reviewInput.reviewedAt;
  let acquired;
  try { acquired = hostLock(root, activationId, recordedAt); } catch { return fail("AFK-HOST-LOCK-OBSERVATION-FAILED"); }
  if (!acquired.lock.ok) return acquired.lock;
  let outcome;
  try {
    let ledger = loadAfkLedger(acquired.commonDir, activationId);
    const activationIntents = ledger.ok ? findRecords(ledger, "activation-intent") : [];
    const receipt = activationIntents[0]?.record.body.receipt;
    const privateAuthority = observeAfkGitAuthority(root, `refs/agent-pipeline/afk/${activationId}`);
    if (!ledger.ok || activationIntents.length !== 1 || !validateActivationReceipt(receipt).ok || !privateAuthority.ok) {
      outcome = fail("AFK-REVIEW-AUTHORITY-INVALID");
    } else {
      const intents = findRecords(ledger, "entry-intent").map(({ record }) => record.body);
      const applied = new Map(findRecords(ledger, "entry-applied").map(({ record }) => [record.body.entryId, record.body]));
      const entries = intents.map((intent) => ({
        entryId: intent.entryId,
        sequence: intent.proposal.sequence,
        resultCommit: intent.resultCommit,
      })).sort((left, right) => left.sequence - right.sequence);
      if (entries.some((entry) => applied.get(entry.entryId)?.resultCommit !== entry.resultCommit)) {
        outcome = fail("AFK-REVIEW-PENDING-ENTRY");
      } else {
        const freezes = findRecords(ledger, "review-freeze").filter(({ record }) => record.body.reviewId === reviewInput.reviewId);
        let freeze;
        let freezeRecordSha256;
        if (freezes.length > 1) outcome = fail("AFK-REVIEW-FREEZE-CONFLICT");
        else if (freezes.length === 1) {
          freeze = freezes[0].record.body;
          freezeRecordSha256 = freezes[0].recordHash;
        } else {
          freeze = {
            reviewId: reviewInput.reviewId,
            cause: reviewInput.cause,
            ledgerSequence: ledger.sequence,
            ledgerHeadSha256: ledger.headSha256,
            privateRefOid: privateAuthority.refOid,
            featureRef: receipt.feature.ref,
            featureBaseOid: receipt.base.commit,
            frozenAt: recordedAt,
          };
          const preview = {
            schema: "pipeline.afk-ledger-record.v1",
            activationId,
            sequence: ledger.sequence + 1,
            type: "review-freeze",
            previousHash: ledger.headSha256,
            recordedAt,
            body: freeze,
          };
          freezeRecordSha256 = sha256Canonical(preview);
        }
        if (outcome === undefined) {
          outcome = executeAfkReviewTransaction({
            root,
            activationId,
            freeze,
            freezeRecordSha256,
            entries,
            dispositions: reviewInput.dispositions,
            attributedBy: reviewInput.attributedBy,
            reviewedAt: recordedAt,
            existingRecords: recordList(ledger),
            appendRecord: (type, body, time) => append(acquired.commonDir, activationId, type, body, time),
            linkedFeatureCheckouts: (featureRef) => linkedFeatureCheckouts(root, featureRef),
            refreshProjection: ({ review }) => {
              ledger = loadAfkLedger(acquired.commonDir, activationId);
              refreshProjection(projection(activationId, "complete", ledger, privateAuthority.refOid, recordedAt), review);
            },
          });
        }
      }
    }
  } catch {
    outcome = fail("AFK-REVIEW-HOST-FAILED", null, "unknown");
  }
  return releaseWithOutcome(acquired.lock, outcome);
}

export function executeAfkActivationHostTransaction(input){return withAfkAuthorityLifetime({repository:authorityRepositoryFromRoot(input?.root),identity:{activationId:input?.activationId??input?.receipt?.activationId??input?.request?.activationId??null,kind:'executeAfkActivationHostTransaction'}},()=>executeAfkActivationHostTransactionUnregistered(input));}
export function executeAfkEntryHostTransaction(input){return withAfkAuthorityLifetime({repository:authorityRepositoryFromRoot(input?.root),identity:{activationId:input?.activationId??input?.receipt?.activationId??input?.request?.activationId??null,kind:'executeAfkEntryHostTransaction'}},()=>executeAfkEntryHostTransactionUnregistered(input));}
export function executeAfkReviewHostTransaction(input){return withAfkAuthorityLifetime({repository:authorityRepositoryFromRoot(input?.root),identity:{activationId:input?.activationId??input?.receipt?.activationId??input?.request?.activationId??null,kind:'executeAfkReviewHostTransaction'}},()=>executeAfkReviewHostTransactionUnregistered(input));}

// Fixed owning route: wire selectors cannot create this synchronous scope.
const ownedAfkHostScope = new AsyncLocalStorage();
const ownedAfkAttempts = new WeakMap(), ownedAfkSettledResults = new WeakMap();
const OWNED_AFK_CODES = new Set(['SDC-AUTHORITY-UNAVAILABLE','SDC-AUTHORITY-CAS','SDC-AUTHORITY-HELD','SDC-PRIVATE-PATH','SDC-LOCK-HELD']);
const OWNED_AFK_STATE = new Set(['unchanged','committed','durability-unknown','indeterminate']);
const ownedAfkSame = (a,b) => canonicalJson(a) === canonicalJson(b);
function ownedAfkRefuse(code='SDC-AUTHORITY-UNAVAILABLE') {
  const error=new Error('owned AFK transaction unavailable');
  error.code=code; throw error;
}
function ownedAfkAdmission(admissionHandle) {
  const value=readSourceOwnedOnboardingAfkAdmission({admissionHandle});
  if (!value || Object.keys(value).sort().join(',')!=='activationId,input,kind,repository,stateDisposition'
      || !HEX32.test(value.activationId??'') || !['activate','entry','review'].includes(value.kind)
      || !OWNED_AFK_STATE.has(value.stateDisposition)
      || !ownedAfkSame(authorityRepositoryFromRoot(value.repository?.primaryRoot),value.repository)) ownedAfkRefuse();
  return value;
}
function ownedAfkCurrent(admissionHandle) {
  const row=ownedAfkAttempts.get(admissionHandle);
  if (!row || ownedAfkHostScope.getStore()!==row || row.closed) ownedAfkRefuse();
  const fresh=ownedAfkAdmission(admissionHandle);
  if (!ownedAfkSame(row.binding,{repository:fresh.repository,kind:fresh.kind,activationId:fresh.activationId,input:fresh.input})) ownedAfkRefuse('SDC-AUTHORITY-CAS');
  return row;
}
export function isCurrentSourceOwnedAfkProjectionAttempt({admissionHandle,repository,activationId}) {
  try { const row=ownedAfkCurrent(admissionHandle); return ownedAfkSame(row.binding.repository,repository)&&row.binding.activationId===activationId; }
  catch { return false; }
}
function ownedAfkObservation(row) {
  const before=readSourceOwnedAfkProjectionPhysicalSnapshot({admissionHandle:row.admissionHandle});
  const ledger=loadAfkLedger(row.binding.repository.commonDir,row.binding.activationId);
  const ref=observeAfkGitAuthority(row.binding.repository.primaryRoot,`refs/agent-pipeline/afk/${row.binding.activationId}`);
  const after=readSourceOwnedAfkProjectionPhysicalSnapshot({admissionHandle:row.admissionHandle});
  if (!ledger.ok || !ref.ok || !ownedAfkSame(before,after)) ownedAfkRefuse('SDC-AUTHORITY-CAS');
  return {snapshot:after,ledger,ref};
}
function ownedAfkWriter(row) {
  if (!row.lock?.ok || row.lock.path!==resolve(row.binding.repository.commonDir,'agent-pipeline','afk',row.binding.activationId,'writer.lock')) ownedAfkRefuse();
  const read=readAuthoritySourceFile({namespaceId:'writer-recovery-locks',filePath:row.lock.path,semantic:({value})=>value});
  if (!ownedAfkSame(read.value,row.lock.owner)) ownedAfkRefuse('SDC-AUTHORITY-CAS');
  return read.sourceFact;
}
function ownedAfkCapture(row,value) {
  ownedAfkCurrent(row.admissionHandle);
  if (row.phase!=='executing' || row.capture) ownedAfkRefuse();
  const writer=ownedAfkWriter(row),observed=ownedAfkObservation(row);
  const intents=findRecords(observed.ledger,'activation-intent'),ready=findRecords(observed.ledger,'activation-ready');
  const receipt=intents[0]?.record.body.receipt;
  const status=observed.ledger.frames.at(-1)?.record.type==='review-complete'?'complete':'active';
  const updatedAt=row.binding.kind==='review'?row.binding.input.reviewInput?.reviewedAt:row.binding.input.recordedAt;
  if (intents.length!==1 || ready.length!==1 || !validateActivationReceipt(receipt).ok
      || receipt.activationId!==row.binding.activationId || observed.ref.refOid===null
      || (row.binding.kind==='activate'&&!ownedAfkSame(receipt,row.binding.input.receipt))
      || (row.binding.kind==='entry'&&receipt.receiptSha256!==row.binding.input.request?.activationReceiptSha256)
      || (row.binding.kind==='review')!==(status==='complete')
      || !ownedAfkSame(value,projection(row.binding.activationId,status,observed.ledger,observed.ref.refOid,updatedAt))
      || !ownedAfkSame(writer,ownedAfkWriter(row))) ownedAfkRefuse('SDC-AUTHORITY-CAS');
  row.capture={projection:structuredClone(value),snapshot:observed.snapshot,ref:observed.ref};
}
function ownedAfkVerifyPostHost(row) {
  const observed=ownedAfkObservation(row);
  if (!row.capture || !ownedAfkSame(row.capture.ref,observed.ref)
      || observed.ledger.sequence!==row.capture.projection.ledgerSequence
      || observed.ledger.headSha256!==row.capture.projection.ledgerHeadSha256) ownedAfkRefuse('SDC-AUTHORITY-CAS');
  const generations=snapshot=>snapshot.memberships.find(m=>m.namespaceId==='activation-generations')?.sourceFacts;
  if (!ownedAfkSame(generations(row.capture.snapshot),generations(observed.snapshot))) ownedAfkRefuse('SDC-AUTHORITY-CAS');
  if (row.postHost && !ownedAfkSame(row.postHost,observed.snapshot)) ownedAfkRefuse('SDC-AUTHORITY-CAS');
  return observed.snapshot;
}
export function executeSourceOwnedAfkHostEffect({admissionHandle}) {
  const row=ownedAfkCurrent(admissionHandle);
  if (row.phase!=='prepared') ownedAfkRefuse();
  row.before=readSourceOwnedAfkProjectionPhysicalSnapshot({admissionHandle});
  row.beforeRef=observeAfkGitAuthority(row.binding.repository.primaryRoot,`refs/agent-pipeline/afk/${row.binding.activationId}`);
  if (!row.beforeRef.ok) ownedAfkRefuse();
  row.phase='executing'; row.attempted=true;
  const args={root:row.binding.repository.primaryRoot,activationId:row.binding.activationId,...structuredClone(row.binding.input),refreshProjection:value=>ownedAfkCapture(row,value)};
  const result=row.binding.kind==='activate'?executeAfkActivationHostTransactionUnregistered(args)
    :row.binding.kind==='entry'?executeAfkEntryHostTransactionUnregistered(args):executeAfkReviewHostTransactionUnregistered(args);
  row.hostResult=result;
  const after=readSourceOwnedAfkProjectionPhysicalSnapshot({admissionHandle});
  const ref=observeAfkGitAuthority(row.binding.repository.primaryRoot,`refs/agent-pipeline/afk/${row.binding.activationId}`);
  row.hostEffects=ref.ok&&ownedAfkSame(row.before,after)&&ownedAfkSame(row.beforeRef,ref)?'none':'retained';
  if (!result?.ok || !row.capture) ownedAfkRefuse('SDC-AUTHORITY-HELD');
  row.postHost=ownedAfkVerifyPostHost(row); row.phase='host-settled';
  return result;
}
export function readSourceOwnedAfkProjectionSettlement({repository,activationId,ledgerHeadSha256}) {
  const row=ownedAfkHostScope.getStore();
  if (!row || row.closed || row.phase!=='projecting') return null;
  ownedAfkCurrent(row.admissionHandle);
  if (!ownedAfkSame(row.binding.repository,repository)||row.binding.activationId!==activationId
      || row.capture?.projection.ledgerHeadSha256!==ledgerHeadSha256) ownedAfkRefuse('SDC-AUTHORITY-CAS');
  ownedAfkVerifyPostHost(row);
  return Object.freeze(structuredClone(row.capture.projection));
}
export function settleSourceOwnedAfkHostProjection({admissionHandle,hostResult}) {
  const row=ownedAfkCurrent(admissionHandle);
  if (row.phase!=='host-settled'||row.hostResult!==hostResult) ownedAfkRefuse();
  observeSourceOwnedControlledMethodAfkHostCheckpoint({admissionHandle});
  ownedAfkVerifyPostHost(row); row.phase='projecting';
  const settled=settleSourceOwnedOnboardingAfkProjection({admissionHandle});
  if (settled&&typeof settled.then==='function') ownedAfkRefuse('SDC-AUTHORITY-HELD');
  if (settled?.status!=='completed'||settled.entry!=='afk-project'||settled.exitCode!==0
      || !settled.statePreimage||!settled.statePostimage||!settled.memberRef||typeof settled.assurance!=='string') {
    if (OWNED_AFK_STATE.has(settled?.stateDisposition)) row.stateDisposition=settled.stateDisposition;
    ownedAfkRefuse(OWNED_AFK_CODES.has(settled?.code)?settled.code:'SDC-AUTHORITY-HELD');
  }
  ownedAfkCurrent(admissionHandle); ownedAfkVerifyPostHost(row);
  row.finalResult=Object.freeze({status:'completed',kind:row.binding.kind,hostResult:structuredClone(hostResult),
    statePreimage:settled.statePreimage,statePostimage:settled.statePostimage,memberRef:settled.memberRef,assurance:settled.assurance});
  row.phase='settled'; ownedAfkSettledResults.set(row.finalResult,row);
  return row.finalResult;
}
export function isSettledSourceOwnedAfkProjectionResult(result,{repository,activationId}) {
  try { const row=ownedAfkSettledResults.get(result); return !!row&&ownedAfkCurrent(row.admissionHandle)===row
    &&row.phase==='settled'&&ownedAfkSame(row.binding.repository,repository)&&row.binding.activationId===activationId; }
  catch { return false; }
}
export function executeSourceOwnedAfkHostTransaction(request) {
  let row;
  try {
    if (!request||Object.keys(request).join(',')!=='admissionHandle'||ownedAfkHostScope.getStore()) ownedAfkRefuse();
    const previous=ownedAfkAttempts.get(request.admissionHandle);
    if(previous) {
      if(previous.closed!==true||previous.phase!=='settled'||!previous.finalResult
          ||ownedAfkSettledResults.get(previous.finalResult)!==previous) ownedAfkRefuse();
      const before=ownedAfkAdmission(request.admissionHandle);
      if(before.stateDisposition!=='committed'
          ||!ownedAfkSame(previous.binding,{repository:before.repository,kind:before.kind,activationId:before.activationId,input:before.input}))
        ownedAfkRefuse('SDC-AUTHORITY-CAS');
      const after=ownedAfkAdmission(request.admissionHandle);
      if(!ownedAfkSame(before,after)) ownedAfkRefuse('SDC-AUTHORITY-CAS');
      // The actual one-use gate refused before any second host or State call.
      // Fresh original admission readbacks authenticate the settled State image.
      return Object.freeze({status:'unavailable',code:'SDC-AUTHORITY-UNAVAILABLE',attempted:false,hostEffects:'none',stateDisposition:'unchanged'});
    }
    const admission=ownedAfkAdmission(request.admissionHandle);
    row={admissionHandle:request.admissionHandle,binding:{repository:admission.repository,kind:admission.kind,activationId:admission.activationId,input:admission.input},
      phase:'prepared',closed:false,attempted:false,hostEffects:'none',stateDisposition:admission.stateDisposition};
    ownedAfkAttempts.set(request.admissionHandle,row);
    return ownedAfkHostScope.run(row,()=>{
      try {
        const result=executeSourceOwnedAfkProjectionLifetime({admissionHandle:row.admissionHandle});
        if (result&&typeof result.then==='function') ownedAfkRefuse('SDC-AUTHORITY-HELD');
        if (row.phase!=='settled'||!row.finalResult) ownedAfkRefuse('SDC-AUTHORITY-HELD');
        return row.finalResult;
      } catch (error) {
        try { row.stateDisposition=ownedAfkAdmission(row.admissionHandle).stateDisposition; } catch { if (!['durability-unknown','indeterminate'].includes(row.stateDisposition)) row.stateDisposition='indeterminate'; }
        return Object.freeze({status:'unavailable',code:OWNED_AFK_CODES.has(error?.code)?error.code:'SDC-AUTHORITY-UNAVAILABLE',
          attempted:row.attempted,hostEffects:row.attempted&&row.hostEffects==='none'&&row.phase==='executing'?'unknown':row.hostEffects,stateDisposition:row.stateDisposition});
      } finally { row.closed=true; }
    });
  } catch (error) {
    return Object.freeze({status:'unavailable',code:OWNED_AFK_CODES.has(error?.code)?error.code:'SDC-AUTHORITY-UNAVAILABLE',attempted:false,hostEffects:'none',stateDisposition:'indeterminate'});
  }
}

export function readSourceOwnedAfkProjectionSettlementSelector({admissionHandle}) {
  const row=ownedAfkHostScope.getStore();
  if (!row||row.closed||row.phase!=='projecting') return null;
  if (row.admissionHandle!==admissionHandle) ownedAfkRefuse();
  ownedAfkCurrent(admissionHandle); ownedAfkVerifyPostHost(row);
  return Object.freeze({repository:structuredClone(row.binding.repository),activationId:row.binding.activationId,ledgerHeadSha256:row.capture.projection.ledgerHeadSha256});
}

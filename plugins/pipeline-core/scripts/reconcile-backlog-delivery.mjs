#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only admission wrapper for the pure backlog reconciliation planner.
 *
 * This first slice deliberately has no apply switch: it observes the exact
 * authority/input bytes and emits a planner preview, or a domain-prefixed
 * rejection.  Transaction, receipt, and projection writes remain outside this
 * command until their durable protocol is available.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, planBacklogDeliveryReconciliation } from "../lib/backlog-delivery-reconciliation.mjs";
import { checkBacklogState, DEFAULT_ROOT, loadBacklogState } from "./check-backlog-state.mjs";
import { projectBacklog, renderBacklogItem, transitionHash } from "../lib/backlog-state.mjs";

const PATH = /^(?!\/)(?!.*\\)(?!.*\/\/)(?!.*\/$)(?!\.{1,2}$)(?!\.{1,2}\/)(?!.*\/\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const RECEIPT_SCHEMA = "pipeline.backlog-reconciliation-receipt.v1";
const LOCK_SCHEMA = "pipeline.backlog-transaction-lock.v1";
const TRANSACTION_SCHEMA = "pipeline.backlog-state-transaction.v2";
const LOCK_PATH = "backlog/.state-transaction.lock";
const TRANSACTION_PATH = "backlog/.state-transaction.json";
const RECEIPTS_DIR = "backlog/receipts";

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function semanticDigest(schema, value) { return sha256(`${schema}\0${canonicalJson(value)}`); }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function reject(findings) { return { ok: false, findings: [...new Set(findings)].sort(), preview: null }; }
function finding(domain, message) { return `${domain}: ${message}`; }

function safePath(root, repoPath) {
  if (typeof repoPath !== "string" || !PATH.test(repoPath)) return null;
  const target = resolve(root, repoPath);
  return relative(root, target).startsWith("..") ? null : target;
}

function observeFile(root, repoPath, label, { readFile = readFileSync } = {}) {
  const target = safePath(root, repoPath);
  if (!target) return { ok: false, finding: finding("UNAVAILABLE", `${label} path is invalid`) };
  try {
    if (!lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) return { ok: false, finding: finding("UNAVAILABLE", `${label} is not a regular repository file`) };
    const raw = Buffer.from(readFile(target));
    return { ok: true, raw, sha256: sha256(raw) };
  } catch {
    return { ok: false, finding: finding("UNAVAILABLE", `${label} is missing or unreadable`) };
  }
}

function readJson(root, repoPath, label, deps) {
  const observed = observeFile(root, repoPath, label, deps);
  if (!observed.ok) return observed;
  try { return { ...observed, value: JSON.parse(observed.raw.toString("utf8")) }; }
  catch { return { ok: false, finding: finding("UNAVAILABLE", `${label} is not valid JSON`) }; }
}

function checkObservedDigest(root, reference, label, findings, deps) {
  if (!plain(reference) || typeof reference.path !== "string" || !SHA.test(reference.fileSha256 ?? "")) {
    findings.push(finding("UNAVAILABLE", `${label} reference is malformed`));
    return;
  }
  const observed = observeFile(root, reference.path, label, deps);
  if (!observed.ok) findings.push(observed.finding);
  else if (observed.sha256 !== reference.fileSha256) findings.push(finding("STALE", `${label} digest does not match the observed file`));
}

function checkAuthority(root, intent, findings, deps) {
  const authority = intent?.authority;
  if (!plain(authority) || typeof authority.receiptPath !== "string" || !SHA.test(authority.receiptSha256 ?? "")) {
    findings.push(finding("AUTHORITY", "delivery intent authority reference is malformed"));
    return;
  }
  const observed = observeFile(root, authority.receiptPath, "authority receipt", deps);
  if (!observed.ok) findings.push(observed.finding);
  else if (observed.sha256 !== authority.receiptSha256) findings.push(finding("STALE", "authority receipt digest does not match the observed file"));
}

function gitOid(root, expression) {
  try {
    const value = execFileSync("git", ["rev-parse", expression], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return OID.test(value) ? value : null;
  } catch { return null; }
}

function receiptIndex(root) {
  const directory = join(root, "backlog", "receipts");
  if (!existsSync(directory)) return [];
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.json$/u.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name))
      .flatMap((entry) => {
        try {
          const value = JSON.parse(readFileSync(join(directory, entry.name), "utf8"));
          return typeof value.idempotencyKey === "string" && typeof value.intentSha256 === "string"
            ? [{ idempotencyKey: value.idempotencyKey, intentSha256: value.intentSha256, receiptPath: `backlog/receipts/${entry.name}` }]
            : [];
        } catch { return []; }
      });
  } catch { return []; }
}

/** Build only the planner's immutable read-state from the canonical checker. */
export function readCanonicalBacklogState(root = DEFAULT_ROOT, { allowUnreachableHistory = false, ignoreTransaction = false } = {}) {
  let loaded = checkBacklogState(root, { ignoreTransaction });
  let repairReadAccepted = false;
  if (!loaded.ok && allowUnreachableHistory) {
    const repairRead = loadBacklogState(root, { ignoreTransaction });
    const onlyUnreachableHistory = repairRead.findings.length > 0 && repairRead.findings.every((entry) => /^ledger event \d+: evidence\.commit is not a reachable local Git commit$/u.test(entry));
    if (onlyUnreachableHistory) { loaded = repairRead; repairReadAccepted = true; }
  }
  if (!loaded.ok && !repairReadAccepted) return { ok: false, findings: loaded.findings.map((entry) => finding("UNAVAILABLE", `canonical backlog state rejected: ${entry}`)), state: null };
  const commit = gitOid(root, "HEAD");
  const tree = gitOid(root, "HEAD^{tree}");
  if (!commit || !tree) return { ok: false, findings: [finding("UNAVAILABLE", "canonical Git commit/tree are unavailable")], state: null };

  const itemFileSha256 = [];
  for (const item of loaded.items) {
    const observed = observeFile(root, item.path, item.path);
    if (!observed.ok) return { ok: false, findings: [observed.finding], state: null };
    itemFileSha256.push({ id: item.metadata.id, sha256: observed.sha256 });
  }
  itemFileSha256.sort((left, right) => left.id.localeCompare(right.id));
  const index = observeFile(root, "backlog/index.json", "backlog index");
  const status = observeFile(root, "backlog/STATUS.md", "backlog STATUS");
  const ledger = observeFile(root, "backlog/transitions.ndjson", "backlog ledger");
  if (![index, status, ledger].every((entry) => entry.ok)) return { ok: false, findings: [index, status, ledger].filter((entry) => !entry.ok).map((entry) => entry.finding), state: null };
  const ledgerHead = loaded.events.at(-1)?.entryHash;
  if (!SHA.test(ledgerHead ?? "")) return { ok: false, findings: [finding("UNAVAILABLE", "canonical backlog ledger has no usable head")], state: null };
  const backlogSubtree = sha256(canonicalJson({ itemFileSha256, ledgerSha256: ledger.sha256, indexFileSha256: index.sha256, statusFileSha256: status.sha256 }));
  return {
    ok: true,
    findings: [],
    state: {
      repository: "self",
      writerAuthority: "canonical-backlog-single-writer",
      commit,
      tree,
      ledgerHead,
      indexFileSha256: index.sha256,
      statusFileSha256: status.sha256,
      backlogSubtree,
      itemFileSha256,
      nextSequence: loaded.events.length + 1,
      occupiedIds: loaded.items.map((item) => item.metadata.id).sort(),
      occupiedPaths: loaded.items.map((item) => item.path).sort(),
      receipts: receiptIndex(root),
      items: loaded.items.map((item) => ({ id: item.metadata.id, status: item.metadata.status })),
      events: loaded.events,
      item: null,
    },
  };
}

/**
 * Read, bind, and preview a delivery operation.  This function never writes.
 * `deps` exists solely to make the filesystem boundary independently testable.
 */
export function previewBacklogDelivery(root = DEFAULT_ROOT, { intentPath, bindingPath } = {}, deps = {}) {
  const findings = [];
  if (!safePath(root, intentPath)) findings.push(finding("UNAVAILABLE", "--intent must name a safe repository-relative JSON file"));
  if (!safePath(root, bindingPath)) findings.push(finding("UNAVAILABLE", "--binding must name a safe repository-relative JSON file"));
  if (findings.length) return reject(findings);
  const intentRecord = readJson(root, intentPath, "delivery intent", deps);
  const bindingRecord = readJson(root, bindingPath, "Spec binding", deps);
  if (!intentRecord.ok) findings.push(intentRecord.finding);
  if (!bindingRecord.ok) findings.push(bindingRecord.finding);
  if (findings.length) return reject(findings);
  const intent = intentRecord.value;
  const binding = bindingRecord.value;

  checkAuthority(root, intent, findings, deps);
  checkObservedDigest(root, intent?.specification, "specification", findings, deps);
  if (Array.isArray(intent?.evidence)) intent.evidence.forEach((entry, index) => checkObservedDigest(root, entry, `evidence[${index}]`, findings, deps));
  else findings.push(finding("UNAVAILABLE", "delivery intent evidence is malformed"));
  if (findings.length) return reject(findings);

  const readState = deps.readState ?? readCanonicalBacklogState;
  const current = readState(root, { allowUnreachableHistory: intent?.operation === "amend-evidence" });
  if (!current?.ok || !plain(current.state)) return reject([...(current?.findings ?? []), finding("UNAVAILABLE", "canonical backlog state is unavailable")]);
  const item = current.state.items?.find((entry) => entry?.id === intent?.item?.id) ?? current.state.item;
  let amendment = null;
  let amendmentTarget = null;
  if (intent?.operation === "amend-evidence") {
    const reference = Array.isArray(intent.evidence) ? intent.evidence.find((entry) => entry?.kind === "amendment-intent") : null;
    const amendmentRecord = reference ? readJson(root, reference.path, "amendment intent", deps) : null;
    if (!reference || !amendmentRecord?.ok || amendmentRecord.sha256 !== reference.fileSha256) return reject([amendmentRecord?.finding ?? finding("UNAVAILABLE", "amend-evidence requires an exact amendment-intent evidence record")]);
    const value = amendmentRecord.value;
    const keys = ["schema", "id", "at", "actor", "reason", "evidence"];
    if (!plain(value) || Object.keys(value).sort().join(",") !== keys.sort().join(",") || value.schema !== "pipeline.backlog-evidence-amendment-intent.v1" || value.id !== intent.item.id || !plain(value.evidence)) return reject([finding("BOUND", "amendment intent is malformed or does not bind the delivery item")]);
    amendment = value.evidence;
    amendmentTarget = current.state.events?.[amendment.targetSequence - 1] ?? null;
  }
  return planBacklogDeliveryReconciliation({ intent, binding, state: { ...current.state, item, amendment, amendmentTarget } });
}

function receiptPathFor(intent) { return `${RECEIPTS_DIR}/${intent.idempotencyKey}.json`; }
function textImage(bytes) {
  const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, "utf8");
  return { exists: true, sha256: sha256(raw), bytesBase64: raw.toString("base64") };
}
function missingImage() { return { exists: false, sha256: null, bytesBase64: null }; }
function imageBytes(image) { return image.exists ? Buffer.from(image.bytesBase64, "base64") : null; }
function validImage(image) {
  return plain(image) && Object.keys(image).sort().join(",") === "bytesBase64,exists,sha256"
    && ((image.exists === false && image.sha256 === null && image.bytesBase64 === null)
      || (image.exists === true && SHA.test(image.sha256 ?? "") && typeof image.bytesBase64 === "string"
        && sha256(Buffer.from(image.bytesBase64, "base64")) === image.sha256));
}
function readImage(root, repoPath, fs) {
  const target = safePath(root, repoPath);
  if (!target) throw new Error(`unsafe transaction path ${repoPath}`);
  if (!fs.existsSync(target)) return missingImage();
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`transaction target ${repoPath} is not a regular file`);
  return textImage(fs.readFileSync(target));
}
function sameImage(left, right) {
  return Boolean(left && right) && left.exists === right.exists && left.sha256 === right.sha256 && left.bytesBase64 === right.bytesBase64;
}
function atomicWrite(target, bytes, fs) {
  fs.mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.reconcile-${process.pid}-${randomBytes(8).toString("hex")}`;
  fs.writeFileSync(temporary, bytes, { flag: "wx" });
  fs.renameSync(temporary, target);
}
function restoreImage(root, entry, fs) {
  const target = safePath(root, entry.path);
  if (!target) throw new Error(`unsafe transaction path ${entry.path}`);
  if (!entry.pre.exists) {
    if (fs.existsSync(target)) fs.rmSync(target);
  } else atomicWrite(target, imageBytes(entry.pre), fs);
}
function validTransaction(record) {
  if (!plain(record)) return false;
  if (Object.keys(record).sort().join(",") !== "createdAt,expectedLedgerHead,idempotencyKey,intendedLedgerHead,operationSha256,ownerNonce,phase,receiptPath,receiptSha256,schema,targets,transactionId"
    || record.schema !== TRANSACTION_SCHEMA || !SHA.test(record.transactionId ?? "") || !SHA.test(record.idempotencyKey ?? "")
    || !SHA.test(record.ownerNonce ?? "") || !SHA.test(record.operationSha256 ?? "")
    || !SHA.test(record.expectedLedgerHead ?? "") || !SHA.test(record.intendedLedgerHead ?? "")
    || !["prepared", "applying", "receipt-installed", "committed"].includes(record.phase)
    || !(record.receiptPath === null || (typeof record.receiptPath === "string" && PATH.test(record.receiptPath)))
    || !(record.receiptSha256 === null || SHA.test(record.receiptSha256 ?? ""))
    || !Array.isArray(record.targets) || record.targets.length === 0) return false;
  const paths = record.targets.map((entry) => entry?.path);
  return new Set(paths).size === paths.length && paths.every((path, index) => typeof path === "string" && PATH.test(path)
    && (index === 0 || paths[index - 1].localeCompare(path) < 0))
    && record.targets.every((entry) => plain(entry) && Object.keys(entry).sort().join(",") === "path,post,pre"
      && validImage(entry.pre) && validImage(entry.post));
}
function validLock(lock) {
  return plain(lock) && Object.keys(lock).sort().join(",") === "bootSha256,heartbeatMonotonicMs,leaseDurationMs,leaseRevision,ownerNonce,pid,processStartToken,schema"
    && lock.schema === LOCK_SCHEMA && SHA.test(lock.ownerNonce ?? "") && Number.isSafeInteger(lock.pid)
    && typeof lock.processStartToken === "string" && typeof lock.bootSha256 === "string"
    && Number.isSafeInteger(lock.leaseRevision) && Number.isFinite(lock.heartbeatMonotonicMs)
    && Number.isSafeInteger(lock.leaseDurationMs) && lock.leaseDurationMs > 0;
}
function readJsonFile(root, repoPath, fs) {
  const target = safePath(root, repoPath);
  if (!target || !fs.existsSync(target)) return null;
  try { return JSON.parse(fs.readFileSync(target, "utf8")); } catch { return null; }
}
function removeOwnedLock(root, ownerNonce, fs) {
  const target = safePath(root, LOCK_PATH);
  const lock = readJsonFile(root, LOCK_PATH, fs);
  if (lock && lock.ownerNonce === ownerNonce && fs.existsSync(target)) fs.rmSync(target);
}
function writeJournal(root, journal, fs) {
  atomicWrite(safePath(root, TRANSACTION_PATH), `${JSON.stringify(journal)}\n`, fs);
}
function receiptRecord(intent, preview, appliedAt) {
  const core = {
    schema: RECEIPT_SCHEMA,
    receiptId: "",
    intentId: intent.intentId,
    idempotencyKey: intent.idempotencyKey,
    intentSha256: preview.intentSha256,
    status: "applied",
    preSnapshot: preview.preSnapshot,
    postSnapshot: preview.postSnapshot,
    targets: preview.targets,
    eventSequences: preview.events.map((event) => event.sequence),
    appliedAt,
    recordSha256: "",
  };
  core.receiptId = semanticDigest(`${RECEIPT_SCHEMA}:id`, Object.fromEntries(Object.entries(core).filter(([key]) => key !== "receiptId" && key !== "recordSha256")));
  core.recordSha256 = semanticDigest(RECEIPT_SCHEMA, Object.fromEntries(Object.entries(core).filter(([key]) => key !== "recordSha256")));
  return core;
}
function validReceipt(receipt, intentSha256, idempotencyKey) {
  if (!plain(receipt) || receipt.schema !== RECEIPT_SCHEMA || receipt.status !== "applied"
    || receipt.idempotencyKey !== idempotencyKey || receipt.intentSha256 !== intentSha256
    || !SHA.test(receipt.receiptId ?? "") || !SHA.test(receipt.recordSha256 ?? "")) return false;
  return receipt.recordSha256 === semanticDigest(RECEIPT_SCHEMA, Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "recordSha256")));
}
function rejectApply(findings) { return { ok: false, applied: false, replayed: false, receipt: null, findings: [...new Set(findings)].sort() }; }

function readDeliveryIntent(root, intentPath, fs) {
  const record = readJson(root, intentPath, "delivery intent", { readFile: fs.readFileSync });
  return record.ok ? record.value : null;
}

function materializationFinding(message) { return finding("BOUND", `canonical materialization ${message}`); }

/**
 * Derive canonical target bytes from a checked initialize/assign preview.
 * This is deliberately not a generic postimage input: callers cannot use the
 * durable writer to install arbitrary bytes.  Evidence amendments are a
 * separate adapter because they bind an immutable historical target record.
 */
export function materializeBacklogDelivery(root = DEFAULT_ROOT, { intentPath, bindingPath, preview } = {}, deps = {}) {
  const fs = { readFileSync, ...deps.fs };
  const intent = readDeliveryIntent(root, intentPath, fs);
  if (!intent) return { ok: false, findings: [finding("UNAVAILABLE", "delivery intent is unavailable")], postimages: null };
  if (!plain(preview) || preview.status !== "preview") return { ok: false, findings: [finding("STALE", "an exact preview is required before materialization")], postimages: null };
  if (!["initialize", "assign", "amend-evidence"].includes(intent.operation)) return { ok: false, findings: [materializationFinding("operation is unsupported")], postimages: null };
  let current = deps.currentState ?? checkBacklogState(root, deps.checkOptions ?? {});
  let repairReadAccepted = false;
  if (!current.ok && intent.operation === "amend-evidence") {
    const repairRead = loadBacklogState(root, deps.checkOptions ?? {});
    const onlyUnreachableHistory = repairRead.findings.length > 0 && repairRead.findings.every((entry) => /^ledger event \d+: evidence\.commit is not a reachable local Git commit$/u.test(entry));
    if (onlyUnreachableHistory) { current = repairRead; repairReadAccepted = true; }
  }
  if (!current.ok && !repairReadAccepted) return { ok: false, findings: current.findings.map((entry) => finding("UNAVAILABLE", `canonical backlog state rejected: ${entry}`)), postimages: null };
  const fresh = previewBacklogDelivery(root, { intentPath, bindingPath }, { readState: deps.readState, readFile: fs.readFileSync });
  if (!fresh.ok || fresh.preview.previewSha256 !== preview.previewSha256 || canonicalJson(fresh.preview) !== canonicalJson(preview)) return { ok: false, findings: [...(fresh.findings ?? []), finding("CAS", "preview no longer matches canonical state")], postimages: null };

  const existing = current.items.find((entry) => entry.metadata.id === intent.item.id);
  let items;
  let changed;
  let from;
  let to;
  let amendment = null;
  if (intent.operation === "initialize") {
    if (existing) return { ok: false, findings: [finding("CONFLICT", "initializer item is already present")], postimages: null };
    const body = Buffer.from(intent.item.draft.bodyBase64, "base64").toString("utf8");
    changed = { path: intent.item.path, metadata: { ...intent.item.draft.metadata }, body };
    items = [...current.items, changed]; from = null; to = "open";
  } else if (intent.operation === "assign") {
    if (!existing || existing.metadata.status !== "open") return { ok: false, findings: [finding("CAS", "assignment item is no longer open")], postimages: null };
    changed = { ...existing, metadata: { ...existing.metadata, status: "in_progress" } };
    items = current.items.map((entry) => entry.metadata.id === intent.item.id ? changed : entry); from = "open"; to = "in_progress";
  } else {
    if (!existing) return { ok: false, findings: [finding("CAS", "amendment item is unavailable")], postimages: null };
    const amendmentRecord = intent.evidence.find((entry) => entry.kind === "amendment-intent");
    try { amendment = JSON.parse(fs.readFileSync(safePath(root, amendmentRecord.path), "utf8")); } catch { return { ok: false, findings: [finding("UNAVAILABLE", "amendment intent is unreadable")], postimages: null }; }
    if (!plain(amendment) || amendment.id !== intent.item.id || !plain(amendment.evidence)) return { ok: false, findings: [finding("BOUND", "amendment intent does not bind the delivery item")], postimages: null };
    const evidence = amendment.evidence;
    const target = current.events[evidence.targetSequence - 1];
    if (!target || target.entryHash !== evidence.targetEntryHash || target?.evidence?.commit !== evidence.targetCommit || target.id !== intent.item.id) return { ok: false, findings: [finding("BOUND", "amendment intent does not bind one exact historical event")], postimages: null };
    changed = existing;
    if (existing?.metadata.status === "closed") changed = { ...existing, metadata: { ...existing.metadata, closure_commit: evidence.replacementCommit, closure_evidence: evidence.reference } };
    items = current.items.map((entry) => entry.metadata.id === intent.item.id ? changed : entry);
    from = existing?.metadata.status; to = from;
  }
  const event = {
    schema: "pipeline.backlog-transition.v2", sequence: current.events.length + 1, id: intent.item.id, from, to,
    at: amendment?.at ?? intent.createdAt.slice(0, 10), actor: amendment?.actor ?? "backlog-reconciliation",
    reason: intent.operation === "initialize"
      ? "Initialize the reviewed canonical backlog item under the bound backlog-intake authority."
      : intent.operation === "assign" ? "Assign the initialized canonical backlog item under the bound implementation-activation authority."
        : amendment.reason,
    evidence: amendment?.evidence ?? { kind: "backlog-delivery-intent", commit: intent.candidate?.commit ?? fresh.preview.preSnapshot.commit, reference: intentPath },
    previousHash: current.events.at(-1)?.entryHash ?? null, entryHash: "",
  };
  event.entryHash = transitionHash(event);
  const events = [...current.events, event];
  const projection = projectBacklog(items, events);
  const bytes = new Map([
    [changed.path, renderBacklogItem(changed)],
    ["backlog/transitions.ndjson", `${events.map((entry) => JSON.stringify(entry)).join("\n")}\n`],
    ["backlog/index.json", projection.indexText],
    ["backlog/STATUS.md", projection.statusText],
  ]);
  const planned = preview.targets.map((target) => target.path).sort();
  if (planned.join("\n") !== [...bytes.keys()].sort().join("\n")) return { ok: false, findings: [materializationFinding("target set differs from the approved preview")], postimages: null };
  return { ok: true, findings: [], postimages: [...bytes].map(([path, bytes]) => ({ path, bytes })), event };
}

/**
 * Recover a previously interrupted reconciliation transaction.  Non-committed
 * journals always roll back; target bytes alone never establish success.
 */
export function recoverBacklogDelivery(root = DEFAULT_ROOT, deps = {}) {
  const fs = { existsSync, lstatSync, readFileSync, mkdirSync, renameSync, rmSync, writeFileSync, ...deps.fs };
  const transaction = readJsonFile(root, TRANSACTION_PATH, fs);
  if (transaction === null) return { ok: true, recovered: false, committed: false, findings: [] };
  if (!validTransaction(transaction)) return { ok: false, recovered: false, committed: false, findings: [finding("DURABILITY", "reconciliation transaction journal is malformed")] };
  if (deps.proveOwnerGone !== true && deps.proveOwnerGone?.(transaction) !== true) return { ok: false, recovered: false, committed: false, findings: [finding("DURABILITY", "interrupted reconciliation owner is not proven gone")] };
  try {
    const receipt = transaction.receiptPath ? readJsonFile(root, transaction.receiptPath, fs) : null;
    const committed = transaction.phase === "committed" && receipt && validReceipt(receipt, transaction.operationSha256, transaction.idempotencyKey)
      && transaction.receiptSha256 === sha256(fs.readFileSync(safePath(root, transaction.receiptPath)));
    if (committed) {
      fs.rmSync(safePath(root, TRANSACTION_PATH));
      removeOwnedLock(root, transaction.ownerNonce, fs);
      return { ok: true, recovered: false, committed: true, receipt, findings: [] };
    }
    for (const entry of [...transaction.targets].reverse()) restoreImage(root, entry, fs);
    fs.rmSync(safePath(root, TRANSACTION_PATH));
    removeOwnedLock(root, transaction.ownerNonce, fs);
    return { ok: true, recovered: true, committed: false, findings: [] };
  } catch (error) {
    return { ok: false, recovered: false, committed: false, findings: [finding("DURABILITY", `reconciliation recovery failed: ${error.message}`)] };
  }
}

/**
 * Atomically install a materialized, already-previewed reconciliation intent.
 * The caller supplies postimages from the canonical single-writer projection;
 * this adapter owns only CAS, journalling, receipt installation, and recovery.
 */
export function applyBacklogDelivery(root = DEFAULT_ROOT, { intentPath, bindingPath, preview, postimages } = {}, deps = {}) {
  const fs = { existsSync, lstatSync, readFileSync, mkdirSync, renameSync, rmSync, writeFileSync, ...deps.fs };
  const now = deps.now ?? (() => new Date().toISOString());
  const intentRecord = readJson(root, intentPath, "delivery intent", { readFile: fs.readFileSync });
  if (!intentRecord.ok) return rejectApply([intentRecord.finding]);
  const intent = intentRecord.value;
  const intentSha256 = semanticDigest("pipeline.backlog-delivery-intent.v1", intent);
  const existing = readJsonFile(root, receiptPathFor(intent), fs);
  if (existing !== null) {
    if (!validReceipt(existing, intentSha256, intent.idempotencyKey)) return rejectApply([finding("CONFLICT", "idempotency receipt conflicts with the delivery intent")]);
    if (deps.readback && deps.readback(existing) !== true) return rejectApply([finding("READBACK", "idempotency receipt post-state readback failed")]);
    return { ok: true, applied: true, replayed: true, receipt: existing, findings: [] };
  }
  if (!plain(preview) || preview.status !== "preview" || preview.intentSha256 !== intentSha256 || !SHA.test(preview.previewSha256 ?? "")) return rejectApply([finding("STALE", "an exact already-previewed reconciliation preview is required")]);
  if (!Array.isArray(postimages) || postimages.length === 0 || postimages.some((entry) => !plain(entry) || typeof entry.path !== "string" || typeof entry.bytes !== "string")) return rejectApply([finding("UNAVAILABLE", "canonical postimages are unavailable")]);
  const plannedPaths = preview.targets.map((entry) => entry.path).sort();
  if (postimages.map((entry) => entry.path).sort().join("\n") !== plannedPaths.join("\n")) return rejectApply([finding("BOUND", "canonical postimages do not exactly cover preview targets")]);
  const lock = {
    schema: LOCK_SCHEMA, ownerNonce: randomBytes(32).toString("hex"), pid: process.pid,
    processStartToken: "unavailable", bootSha256: "unavailable", leaseRevision: 1,
    heartbeatMonotonicMs: Math.floor(performance.now()), leaseDurationMs: 30_000,
  };
  try {
    fs.mkdirSync(dirname(safePath(root, LOCK_PATH)), { recursive: true });
    fs.writeFileSync(safePath(root, LOCK_PATH), `${JSON.stringify(lock)}\n`, { flag: "wx" });
  } catch {
    return rejectApply([finding("CONFLICT", "reconciliation transaction lock is busy or unavailable")]);
  }
  try {
    const fresh = previewBacklogDelivery(root, { intentPath, bindingPath }, { readState: deps.readState, readFile: fs.readFileSync });
    if (!fresh.ok || fresh.preview.previewSha256 !== preview.previewSha256 || canonicalJson(fresh.preview) !== canonicalJson(preview)) return rejectApply([...(fresh.findings ?? []), finding("CAS", "preview no longer matches the locked canonical state")]);
    const targets = postimages.toSorted((left, right) => left.path.localeCompare(right.path)).map((postimage) => ({ path: postimage.path, pre: readImage(root, postimage.path, fs), post: textImage(postimage.bytes) }));
    const receipt = receiptRecord(intent, preview, now());
    const receiptPath = receiptPathFor(intent);
    targets.push({ path: receiptPath, pre: readImage(root, receiptPath, fs), post: textImage(`${JSON.stringify(receipt)}\n`) });
    targets.sort((left, right) => left.path.localeCompare(right.path));
    const journal = {
      schema: TRANSACTION_SCHEMA,
      transactionId: semanticDigest(`${TRANSACTION_SCHEMA}:id`, { idempotencyKey: intent.idempotencyKey, ownerNonce: lock.ownerNonce, previewSha256: preview.previewSha256 }),
      idempotencyKey: intent.idempotencyKey, ownerNonce: lock.ownerNonce, operationSha256: intentSha256,
      phase: "prepared", expectedLedgerHead: preview.preSnapshot.ledgerHead, intendedLedgerHead: preview.postSnapshot.ledgerHead,
      targets, receiptPath: null, receiptSha256: null, createdAt: now(),
    };
    writeJournal(root, journal, fs);
    journal.phase = "applying";
    writeJournal(root, journal, fs);
    for (const entry of targets.filter((entry) => entry.path !== receiptPath)) atomicWrite(safePath(root, entry.path), imageBytes(entry.post), fs);
    for (const entry of targets.filter((entry) => entry.path !== receiptPath)) if (!sameImage(readImage(root, entry.path, fs), entry.post)) throw new Error(`postimage readback failed for ${entry.path}`);
    atomicWrite(safePath(root, receiptPath), imageBytes(targets.find((entry) => entry.path === receiptPath).post), fs);
    if (!sameImage(readImage(root, receiptPath, fs), targets.find((entry) => entry.path === receiptPath).post)) throw new Error("receipt readback failed");
    journal.phase = "receipt-installed"; journal.receiptPath = receiptPath; journal.receiptSha256 = sha256(fs.readFileSync(safePath(root, receiptPath)));
    writeJournal(root, journal, fs);
    if (deps.readback && deps.readback(receipt) !== true) throw new Error("independent post-state readback failed");
    journal.phase = "committed";
    writeJournal(root, journal, fs);
    fs.rmSync(safePath(root, TRANSACTION_PATH));
    removeOwnedLock(root, lock.ownerNonce, fs);
    return { ok: true, applied: true, replayed: false, receipt, findings: [] };
  } catch (error) {
    // Keep the journal and owned lock: only recovery can choose rollback after
    // an interrupted write.  In particular, no applied receipt is returned.
    return rejectApply([finding("DURABILITY", `reconciliation apply interrupted: ${error.message}`)]);
  } finally {
    // Rejections before a durable journal are not interrupted operations and
    // must not strand the exclusive lock.
    if (!fs.existsSync(safePath(root, TRANSACTION_PATH))) removeOwnedLock(root, lock.ownerNonce, fs);
  }
}

function parseCli(argv) {
  const options = { root: DEFAULT_ROOT, intentPath: null, bindingPath: null, previewSha256: null, apply: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--apply") options.apply = true;
    else if (["--root", "--intent", "--binding", "--preview-sha256"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) return { ok: false, error: `${argument} requires a value` };
      if (argument === "--root") options.root = resolve(value);
      if (argument === "--intent") options.intentPath = value;
      if (argument === "--binding") options.bindingPath = value;
      if (argument === "--preview-sha256") options.previewSha256 = value;
      index += 1;
    } else return { ok: false, error: `unsupported argument ${argument}` };
  }
  if (options.apply && !SHA.test(options.previewSha256 ?? "")) return { ok: false, error: "--apply requires --preview-sha256 <64-lowercase-hex> from an exact current preview" };
  return { ok: true, options };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsed = parseCli(process.argv.slice(2));
  if (!parsed.ok) { console.error(`reconcile-backlog-delivery: ${parsed.error}`); process.exitCode = 2; }
  else if (parsed.options.help) console.log("Usage: node reconcile-backlog-delivery.mjs --intent <repo-path> --binding <repo-path> [--root <directory>]\n       node reconcile-backlog-delivery.mjs --apply --preview-sha256 <64-lowercase-hex> --intent <repo-path> --binding <repo-path> [--root <directory>]\nThe first form emits a read-only preview. --apply requires its exact current preview digest, rematerializes canonical bytes, and rechecks CAS under the transaction lock.");
  else {
    const result = previewBacklogDelivery(parsed.options.root, parsed.options);
    if (!result.ok) {
      console.log(JSON.stringify(result));
      process.exitCode = 2;
    } else if (!parsed.options.apply) console.log(JSON.stringify(result));
    else if (result.preview.previewSha256 !== parsed.options.previewSha256) {
      console.log(JSON.stringify(rejectApply([finding("STALE", "provided preview digest does not match the current preview")])))
      process.exitCode = 2;
    } else {
      const materialized = materializeBacklogDelivery(parsed.options.root, { ...parsed.options, preview: result.preview });
      if (!materialized.ok) {
        console.log(JSON.stringify(rejectApply(materialized.findings)));
        process.exitCode = 2;
      } else {
        const applied = applyBacklogDelivery(parsed.options.root, { ...parsed.options, preview: result.preview, postimages: materialized.postimages }, {
          // This repeats planner admission while the exclusive lock is held.
        // An ordered repair may leave another independently-authorized
        // unreachable historical target pending.  Its receipt is an applied
        // operation, not a claim that the whole ledger is already strict-green;
        // the repair-tolerant reader still validates every projection and every
        // non-reachability invariant.  Ordinary operations require the strict
        // readback unchanged.
        readback: () => result.preview === undefined
          ? false
          : result.preview.events.every((event) => event.id !== undefined) && result.preview.reasons[0]?.startsWith("amend-evidence:")
            ? readCanonicalBacklogState(parsed.options.root, { allowUnreachableHistory: true, ignoreTransaction: true }).ok
            : checkBacklogState(parsed.options.root, { ignoreTransaction: true }).ok,
        });
        console.log(JSON.stringify(applied));
        if (!applied.ok) process.exitCode = 2;
      }
    }
  }
}

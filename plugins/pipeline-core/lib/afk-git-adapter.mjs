// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  canonicalJson,
  isNormalizedRepoPath,
  sha256Raw,
  validateActivationReceipt,
} from "./afk-assumption-mode.mjs";
import { validateAfkWorkerRequest } from "./afk-capability-worker.mjs";
import { AFK_LEDGER_ZERO_HASH, validateAfkLedgerRecord } from "./afk-ledger.mjs";

export const AFK_GIT_IDENTITY = Object.freeze({
  name: "Agent Pipeline AFK",
  email: "afk@agent-pipeline.invalid",
});

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const PRIVATE_REF = /^refs\/agent-pipeline\/afk\/[0-9a-f]{32}$/u;
const FEATURE_REF = /^refs\/heads\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/u;
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function fail(code, detail = null, mutation = "none") {
  return { ok: false, code, detail, mutation };
}

function oidLength(format) {
  return format === "sha1" ? 40 : format === "sha256" ? 64 : 0;
}

function validOid(value, format) {
  return typeof value === "string" && value.length === oidLength(format) && /^[0-9a-f]+$/u.test(value);
}

function hashGitObject(type, bytes, format) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return createHash(format).update(Buffer.from(`${type} ${payload.length}\0`, "ascii")).update(payload).digest("hex");
}

function trustedEnvironment(extra = {}) {
  const nullPath = process.platform === "win32" ? "NUL" : "/dev/null";
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullPath,
    GIT_CONFIG_COUNT: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: nullPath,
    SSH_ASKPASS: nullPath,
    GIT_PAGER: "cat",
    PAGER: "cat",
    GIT_EDITOR: ":",
    GIT_SEQUENCE_EDITOR: ":",
    GIT_OPTIONAL_LOCKS: "0",
    ...extra,
  };
}

function runGit(root, args, { input = null, env = {}, accepted = [0] } = {}) {
  const outcome = spawnSync("git", [
    "-C", root,
    "-c", "core.hooksPath=/dev/null",
    "-c", "core.fsmonitor=false",
    "-c", "filter.lfs.required=false",
    ...args,
  ], {
    encoding: null,
    shell: false,
    input,
    timeout: 15_000,
    maxBuffer: MAX_GIT_OUTPUT,
    env: trustedEnvironment(env),
  });
  if (outcome.error || !accepted.includes(outcome.status)) {
    const error = new Error("trusted Git plumbing failed");
    error.status = outcome.status;
    throw error;
  }
  return outcome.stdout ?? Buffer.alloc(0);
}

function outputLine(bytes) {
  return bytes.toString("utf8").trim();
}

export function observeAfkGitAuthority(root, ref) {
  if (!PRIVATE_REF.test(ref) && !FEATURE_REF.test(ref)) return fail("AFK-GIT-REF-INVALID");
  try {
    const objectFormat = outputLine(runGit(root, ["rev-parse", "--show-object-format"]));
    const observed = runGit(root, ["rev-parse", "--verify", ref], { accepted: [0, 128] });
    const refOid = observed.length === 0 ? null : outputLine(observed);
    if (!new Set(["sha1", "sha256"]).has(objectFormat)
      || (refOid !== null && !validOid(refOid, objectFormat))) return fail("AFK-GIT-OBSERVATION-INVALID");
    return { ok: true, objectFormat, refOid };
  } catch {
    return fail("AFK-GIT-OBSERVATION-FAILED");
  }
}

function readObject(root, oid, expectedType = null) {
  const type = outputLine(runGit(root, ["cat-file", "-t", oid]));
  if (expectedType !== null && type !== expectedType) throw new Error("Git object type mismatch");
  const bytes = runGit(root, ["cat-file", type, oid]);
  return { type, bytes };
}

function parseTree(bytes, format) {
  const rawOidBytes = oidLength(format) / 2;
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    const nul = bytes.indexOf(0x00, space + 1);
    if (space < 1 || nul < space + 2 || nul + rawOidBytes > bytes.length) throw new Error("invalid Git tree");
    const mode = bytes.subarray(offset, space).toString("ascii");
    const nameBytes = bytes.subarray(space + 1, nul);
    const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    if (!name || name.includes("/") || name === "." || name === ".." || name.includes("\0")) throw new Error("unsafe tree name");
    entries.push({ mode, name, oid: bytes.subarray(nul + 1, nul + 1 + rawOidBytes).toString("hex") });
    offset = nul + 1 + rawOidBytes;
  }
  return entries;
}

function loadTree(root, treeOid, format) {
  const entries = new Map();
  for (const entry of parseTree(readObject(root, treeOid, "tree").bytes, format)) {
    if (entry.mode === "40000") {
      entries.set(entry.name, { ...entry, kind: "tree", entries: loadTree(root, entry.oid, format) });
    } else {
      entries.set(entry.name, { ...entry, kind: "leaf" });
    }
  }
  return entries;
}

function treeSortKey(entry) {
  return Buffer.from(entry.kind === "tree" ? `${entry.name}/` : entry.name, "utf8");
}

function compareBuffers(left, right) {
  return Buffer.compare(left, right);
}

function serializeTree(entries, format) {
  const ordered = [...entries.values()].sort((left, right) => compareBuffers(treeSortKey(left), treeSortKey(right)));
  return Buffer.concat(ordered.map((entry) => Buffer.concat([
    Buffer.from(`${entry.mode} ${entry.name}\0`, "utf8"),
    Buffer.from(entry.oid, "hex"),
  ])));
}

function calculateTrees(entries, format) {
  for (const entry of entries.values()) {
    if (entry.kind === "tree") {
      const calculated = calculateTrees(entry.entries, format);
      entry.oid = calculated.oid;
      entry.bytes = calculated.bytes;
    }
  }
  const bytes = serializeTree(entries, format);
  return { oid: hashGitObject("tree", bytes, format), bytes };
}

function navigate(entries, parts, create) {
  let cursor = entries;
  for (const component of parts) {
    let entry = cursor.get(component);
    if (entry === undefined && create) {
      entry = { mode: "40000", name: component, oid: null, kind: "tree", entries: new Map() };
      cursor.set(component, entry);
    }
    if (!entry || entry.kind !== "tree") throw new Error("path prefix is not a tree");
    cursor = entry.entries;
  }
  return cursor;
}

function validateProposal(request, proposal) {
  return exactKeys(proposal, [
    "activationId", "requestSha256", "sequence", "finding", "recommendation", "options", "writes", "resultSha256",
  ]) && proposal.activationId === request.activationId && proposal.requestSha256 === request.requestSha256
    && proposal.sequence === request.sequence && object(proposal.finding) && typeof proposal.recommendation === "string"
    && Array.isArray(proposal.options) && Array.isArray(proposal.writes) && SHA256.test(proposal.resultSha256);
}

function prepareWrites(entries, proposal, format) {
  const planned = [];
  for (const write of proposal.writes) {
    if (!isNormalizedRepoPath(write.path)) throw new Error("unsafe write path");
    const parts = write.path.split("/");
    const parent = navigate(entries, parts.slice(0, -1), write.operation === "put");
    const name = parts.at(-1);
    const existing = parent.get(name) ?? null;
    if (existing !== null && existing.kind !== "leaf") throw new Error("write targets tree");
    if (write.operation === "delete") {
      if (existing === null || !new Set(["100644", "100755"]).has(existing.mode)
        || existing.mode !== write.baseMode || existing.oid !== write.baseBlobOid) throw new Error("delete base mismatch");
      parent.delete(name);
      planned.push({ ...write, resultBlobOid: null });
      continue;
    }
    const bytes = Buffer.from(write.resultContentBase64, "base64");
    if (bytes.toString("base64") !== write.resultContentBase64 || sha256Raw(bytes) !== write.resultSha256) {
      throw new Error("put content mismatch");
    }
    if (existing === null) {
      if (write.baseMode !== null || write.baseBlobOid !== null || write.resultMode !== "100644") throw new Error("new-file base mismatch");
    } else if (!new Set(["100644", "100755"]).has(existing.mode)
      || existing.mode !== write.baseMode || existing.oid !== write.baseBlobOid || existing.mode !== write.resultMode) {
      throw new Error("put base mismatch");
    }
    const resultBlobOid = hashGitObject("blob", bytes, format);
    parent.set(name, { mode: write.resultMode, name, oid: resultBlobOid, kind: "leaf" });
    planned.push({ ...write, resultBlobOid });
  }
  return planned;
}

function commitBytes({ tree, parent, identity, gitTimestamp, message }) {
  return Buffer.from([
    `tree ${tree}`,
    `parent ${parent}`,
    `author ${identity.name} <${identity.email}> ${gitTimestamp}`,
    `committer ${identity.name} <${identity.email}> ${gitTimestamp}`,
    "",
    message,
  ].join("\n"), "utf8");
}

export function planAfkEntry({ root, request, proposal, entryId, gitTimestamp, identity = AFK_GIT_IDENTITY }) {
  if (!validateAfkWorkerRequest(request).ok || !validateProposal(request, proposal)
    || !SAFE_ID.test(entryId ?? "") || !/^[0-9]+ \+0000$/u.test(gitTimestamp ?? "")
    || !exactKeys(identity, ["name", "email"])) return fail("AFK-ENTRY-PLAN-INVALID");
  const format = request.current.objectFormat;
  if (!validOid(request.current.commit, format) || !validOid(request.current.tree, format)) return fail("AFK-ENTRY-PLAN-INVALID");
  try {
    const observedFormat = outputLine(runGit(root, ["rev-parse", "--show-object-format"]));
    const parentTree = outputLine(runGit(root, ["rev-parse", "--verify", `${request.current.commit}^{tree}`]));
    if (observedFormat !== format || parentTree !== request.current.tree) return fail("AFK-GIT-AUTHORITY-DRIFT");
    const tree = loadTree(root, request.current.tree, format);
    const writes = prepareWrites(tree, proposal, format);
    const calculatedTree = calculateTrees(tree, format);
    const message = `afk(${request.activationId}): apply entry ${request.sequence}\n`;
    const rawCommit = commitBytes({
      tree: calculatedTree.oid,
      parent: request.current.commit,
      identity,
      gitTimestamp,
      message,
    });
    const body = {
      entryId,
      request,
      proposal,
      requestSha256: request.requestSha256,
      resultSha256: proposal.resultSha256,
      parentCommit: request.current.commit,
      parentTree: request.current.tree,
      resultTree: calculatedTree.oid,
      resultCommit: hashGitObject("commit", rawCommit, format),
      objectFormat: format,
      identity,
      gitTimestamp,
      message,
      writes,
    };
    const probe = validateAfkLedgerRecord({
      schema: "pipeline.afk-ledger-record.v1",
      activationId: request.activationId,
      sequence: 1,
      type: "entry-intent",
      previousHash: AFK_LEDGER_ZERO_HASH,
      recordedAt: new Date(0).toISOString(),
      body,
    });
    return probe.ok ? { ok: true, body } : fail("AFK-ENTRY-PLAN-INVALID");
  } catch {
    return fail("AFK-ENTRY-PLAN-FAILED");
  }
}

function indexInfo(intent) {
  const zero = "0".repeat(oidLength(intent.objectFormat));
  return Buffer.concat(intent.writes.map((write) => Buffer.from(
    write.operation === "delete"
      ? `0 ${zero}\t${write.path}\0`
      : `${write.resultMode} ${write.resultBlobOid}\t${write.path}\0`,
    "utf8",
  )));
}

function commitEnvironment(intent) {
  const [seconds, timezone] = intent.gitTimestamp.split(" ");
  return {
    GIT_AUTHOR_NAME: intent.identity.name,
    GIT_AUTHOR_EMAIL: intent.identity.email,
    GIT_AUTHOR_DATE: `@${seconds} ${timezone}`,
    GIT_COMMITTER_NAME: intent.identity.name,
    GIT_COMMITTER_EMAIL: intent.identity.email,
    GIT_COMMITTER_DATE: `@${seconds} ${timezone}`,
  };
}

export function applyAfkEntryPlan({ root, activationId, intent, fault = null }) {
  const privateRef = `refs/agent-pipeline/afk/${activationId}`;
  if (!PRIVATE_REF.test(privateRef) || !object(intent) || !OID.test(intent.parentCommit ?? "")
    || !OID.test(intent.resultCommit ?? "")) return fail("AFK-ENTRY-INTENT-INVALID");
  const observed = observeAfkGitAuthority(root, privateRef);
  if (!observed.ok || observed.objectFormat !== intent.objectFormat) return fail("AFK-GIT-AUTHORITY-DRIFT");
  if (observed.refOid === intent.resultCommit) {
    try {
      const tree = outputLine(runGit(root, ["rev-parse", "--verify", `${intent.resultCommit}^{tree}`]));
      return tree === intent.resultTree
        ? { ok: true, status: "duplicate", mutation: "none", privateRef, resultCommit: intent.resultCommit, resultTree: tree }
        : fail("AFK-GIT-RESULT-CONFLICT");
    } catch { return fail("AFK-GIT-RESULT-CONFLICT"); }
  }
  if (observed.refOid !== intent.parentCommit) return fail("AFK-GIT-REF-CONFLICT");
  const indexDirectory = mkdtempSync(join(tmpdir(), "agent-pipeline-afk-index-"));
  const indexPath = join(indexDirectory, "index");
  const env = { GIT_INDEX_FILE: indexPath };
  let objectMutation = false;
  try {
    for (const write of intent.writes) {
      if (write.operation !== "put") continue;
      const oidOutput = outputLine(runGit(root, ["hash-object", "-w", "--stdin", "--no-filters"], {
        input: Buffer.from(write.resultContentBase64, "base64"),
      }));
      objectMutation = true;
      if (oidOutput !== write.resultBlobOid) return fail("AFK-GIT-BLOB-MISMATCH", write.path, "objects");
    }
    fault?.("after-blobs", intent);
    runGit(root, ["read-tree", intent.parentTree], { env });
    runGit(root, ["update-index", "-z", "--index-info"], { env, input: indexInfo(intent) });
    const tree = outputLine(runGit(root, ["write-tree"], { env }));
    objectMutation = true;
    if (tree !== intent.resultTree) return fail("AFK-GIT-TREE-MISMATCH", null, "objects");
    fault?.("after-tree", intent);
    const commit = outputLine(runGit(root, ["commit-tree", intent.resultTree, "-p", intent.parentCommit], {
      input: Buffer.from(intent.message, "utf8"),
      env: commitEnvironment(intent),
    }));
    objectMutation = true;
    if (commit !== intent.resultCommit) return fail("AFK-GIT-COMMIT-MISMATCH", null, "objects");
    fault?.("after-commit", intent);
    runGit(root, ["update-ref", privateRef, intent.resultCommit, intent.parentCommit]);
    fault?.("after-ref", intent);
    return { ok: true, status: "applied", mutation: "objects+private-ref", privateRef, resultCommit: commit, resultTree: tree };
  } catch {
    const after = observeAfkGitAuthority(root, privateRef);
    if (after.ok && after.refOid === intent.resultCommit) {
      return { ok: true, status: "applied-unconfirmed", mutation: "objects+private-ref", privateRef, resultCommit: intent.resultCommit, resultTree: intent.resultTree };
    }
    return fail("AFK-GIT-APPLY-FAILED", null, objectMutation ? "objects" : "none");
  } finally {
    rmSync(indexDirectory, { recursive: true, force: true });
  }
}

export function executeAfkEntryTransaction({
  root,
  request,
  proposal,
  entryId,
  gitTimestamp,
  recordedAt,
  appendRecord,
  refreshProjection = null,
  fault = null,
}) {
  if (typeof appendRecord !== "function") return fail("AFK-ENTRY-TRANSACTION-INVALID");
  const planned = planAfkEntry({ root, request, proposal, entryId, gitTimestamp });
  if (!planned.ok) return planned;
  let intent;
  try { intent = appendRecord("entry-intent", planned.body, recordedAt); } catch { return fail("AFK-ENTRY-INTENT-PUBLISH-FAILED"); }
  if (!intent || intent.ok !== true) return fail(intent?.code ?? "AFK-ENTRY-INTENT-PUBLISH-FAILED");
  fault?.("after-intent", planned.body);
  const applied = applyAfkEntryPlan({ root, activationId: request.activationId, intent: planned.body, fault });
  if (!applied.ok) return { ...applied, mutation: applied.mutation === "none" ? "wal" : `wal+${applied.mutation}` };
  const appliedBody = {
    entryId,
    privateRef: applied.privateRef,
    parentCommit: planned.body.parentCommit,
    resultCommit: planned.body.resultCommit,
    resultTree: planned.body.resultTree,
  };
  let recorded;
  try { recorded = appendRecord("entry-applied", appliedBody, recordedAt); } catch { return fail("AFK-ENTRY-APPLIED-UNRECORDED", null, "wal+objects+private-ref"); }
  if (!recorded || recorded.ok !== true) return fail(recorded?.code ?? "AFK-ENTRY-APPLIED-UNRECORDED", null, "wal+objects+private-ref");
  if (typeof refreshProjection === "function") {
    try { refreshProjection(recorded); } catch { return fail("AFK-PROJECTION-REFRESH-FAILED", null, "wal+objects+private-ref"); }
  }
  return { ok: true, status: applied.status, mutation: "wal+objects+private-ref", intent: planned.body, applied: appliedBody };
}

export function reconcileAfkActivation({
  root,
  receipt,
  appendRecord,
  recordedAt,
  refreshProjection = null,
  intentAlreadyRecorded = false,
}) {
  const checked = validateActivationReceipt(receipt);
  if (!checked.ok || typeof appendRecord !== "function") return fail("AFK-ACTIVATION-TRANSACTION-INVALID");
  const privateRef = `refs/agent-pipeline/afk/${receipt.activationId}`;
  const observed = observeAfkGitAuthority(root, privateRef);
  if (!observed.ok || observed.objectFormat !== receipt.base.objectFormat) return fail("AFK-GIT-AUTHORITY-DRIFT");
  if (!intentAlreadyRecorded) {
    let intent;
    try {
      intent = appendRecord("activation-intent", { receipt, privateRef, expectedPrivateRefOid: null }, recordedAt);
    } catch { return fail("AFK-ACTIVATION-INTENT-PUBLISH-FAILED"); }
    if (!intent?.ok) return fail(intent?.code ?? "AFK-ACTIVATION-INTENT-PUBLISH-FAILED");
  }
  if (observed.refOid !== null && observed.refOid !== receipt.base.commit) return fail("AFK-GIT-REF-CONFLICT", null, "wal");
  try {
    if (observed.refOid === null) runGit(root, ["update-ref", privateRef, receipt.base.commit, "0".repeat(oidLength(receipt.base.objectFormat))]);
  } catch { return fail("AFK-ACTIVATION-REF-FAILED", null, "wal"); }
  const body = { receiptSha256: receipt.receiptSha256, privateRef, privateRefOid: receipt.base.commit };
  let ready;
  try { ready = appendRecord("activation-ready", body, recordedAt); } catch { return fail("AFK-ACTIVATION-READY-UNRECORDED", null, "wal+private-ref"); }
  if (!ready?.ok) return fail(ready?.code ?? "AFK-ACTIVATION-READY-UNRECORDED", null, "wal+private-ref");
  if (typeof refreshProjection === "function") {
    try { refreshProjection(ready); } catch { return fail("AFK-PROJECTION-REFRESH-FAILED", null, "wal+private-ref"); }
  }
  return { ok: true, status: "active", mutation: "wal+private-ref", privateRef };
}

export function compareAndSwapAfkFeatureRef({ root, featureRef, baseOid, promotionOid }) {
  if (!FEATURE_REF.test(featureRef) || !OID.test(baseOid) || !OID.test(promotionOid)
    || baseOid.length !== promotionOid.length) return fail("AFK-PROMOTION-INVALID");
  const observed = observeAfkGitAuthority(root, featureRef);
  if (!observed.ok) return observed;
  if (observed.refOid === promotionOid) return { ok: true, status: "duplicate", moved: baseOid !== promotionOid, mutation: "none" };
  if (observed.refOid !== baseOid) return fail("AFK-FEATURE-REF-CONFLICT");
  if (baseOid === promotionOid) return { ok: true, status: "unchanged", moved: false, mutation: "none" };
  try {
    runGit(root, ["update-ref", featureRef, promotionOid, baseOid]);
    return { ok: true, status: "applied", moved: true, mutation: "feature-ref" };
  } catch { return fail("AFK-FEATURE-REF-CAS-FAILED"); }
}

export function afkIntentDigest(intent) {
  return sha256Raw(Buffer.from(canonicalJson(intent), "utf8"));
}

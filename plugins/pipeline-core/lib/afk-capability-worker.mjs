// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";

import {
  SUPPORTED_ADAPTER,
  SUPPORTED_PROVIDER,
  SUPPORTED_TOOLS,
  canonicalJson,
  isNormalizedRepoPath,
  validateActivationReceipt,
} from "./afk-assumption-mode.mjs";

export const AFK_WORKER_REQUEST_SCHEMA = "pipeline.afk-worker-request.v1";
export const AFK_WORKER_RESULT_SCHEMA = "pipeline.afk-worker-result.v1";

const SHA256 = /^[0-9a-f]{64}$/u;
const HEX32 = /^[0-9a-f]{32}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MODES = new Set(["100644", "100755"]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function fail(code, detail = null) {
  return { ok: false, code, detail, mutation: "none" };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function safeText(value, maximum = 2048) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value.trim() === value && !value.includes("\0");
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function oid(value, objectFormat) {
  const length = objectFormat === "sha1" ? 40 : objectFormat === "sha256" ? 64 : 0;
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/u.test(value);
}

function sortedUnique(values, key = (value) => value) {
  return Array.isArray(values) && values.every((value, index) => index === 0 || key(values[index - 1]) < key(value));
}

function within(root, path) {
  return path === root || path.startsWith(`${root}/`);
}

function allowed(path, roots) {
  return roots.some((root) => within(root, path));
}

function prefixConflict(paths) {
  return paths.some((path, index) => index > 0 && path.startsWith(`${paths[index - 1]}/`));
}

function validCurrent(value) {
  return exactKeys(value, ["commit", "tree", "objectFormat"])
    && (value.objectFormat === "sha1" || value.objectFormat === "sha256")
    && oid(value.commit, value.objectFormat) && oid(value.tree, value.objectFormat);
}

function validSnapshot(value, objectFormat) {
  return exactKeys(value, ["path", "mode", "blobOid", "sha256"])
    && isNormalizedRepoPath(value.path) && MODES.has(value.mode)
    && oid(value.blobOid, objectFormat) && SHA256.test(value.sha256);
}

function validRequestShape(value) {
  if (!exactKeys(value, [
    "schema", "activationId", "activationReceiptSha256", "sequence", "dispatchId",
    "attempt", "privateRef", "current", "prior", "readSnapshot", "pathAllowlist",
    "budgets", "adapter", "requestSha256",
  ])) return false;
  if (value.schema !== AFK_WORKER_REQUEST_SCHEMA || !HEX32.test(value.activationId)
    || !SHA256.test(value.activationReceiptSha256) || !safeId(value.dispatchId)
    || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || !Number.isSafeInteger(value.attempt) || value.attempt < 1
    || !/^refs\/agent-pipeline\/afk\/[0-9a-f]{32}$/u.test(value.privateRef)
    || !validCurrent(value.current)) return false;
  if (value.prior !== null && (!exactKeys(value.prior, ["entryId", "resultSha256"])
    || !safeId(value.prior.entryId) || !SHA256.test(value.prior.resultSha256))) return false;
  if (!sortedUnique(value.readSnapshot, (entry) => entry.path)
    || !value.readSnapshot.every((entry) => validSnapshot(entry, value.current.objectFormat))) return false;
  if (!exactKeys(value.pathAllowlist, ["read", "write"])
    || !sortedUnique(value.pathAllowlist.read) || !sortedUnique(value.pathAllowlist.write)
    || value.pathAllowlist.read.length === 0 || value.pathAllowlist.write.length === 0
    || ![...value.pathAllowlist.read, ...value.pathAllowlist.write].every(isNormalizedRepoPath)) return false;
  if (!value.readSnapshot.every((entry) => allowed(entry.path, value.pathAllowlist.read))) return false;
  if (!exactKeys(value.budgets, ["files", "bytes"])
    || !Number.isSafeInteger(value.budgets.files) || value.budgets.files < 1
    || !Number.isSafeInteger(value.budgets.bytes) || value.budgets.bytes < 1) return false;
  if (!exactKeys(value.adapter, ["provider", "id", "sha256", "tools"])
    || value.adapter.provider !== SUPPORTED_PROVIDER || value.adapter.id !== SUPPORTED_ADAPTER
    || !SHA256.test(value.adapter.sha256)
    || JSON.stringify(value.adapter.tools) !== JSON.stringify(SUPPORTED_TOOLS)) return false;
  if (!SHA256.test(value.requestSha256)) return false;
  const { requestSha256, ...preceding } = value;
  return requestSha256 === digest(preceding);
}

export function validateAfkWorkerRequest(value) {
  return validRequestShape(value)
    ? { ok: true, value }
    : fail("AFK-WORKER-REQUEST-INVALID");
}

export function createAfkWorkerRequest({
  receipt,
  sequence,
  dispatchId,
  attempt,
  current,
  prior = null,
  readSnapshot,
  adapterSha256,
}) {
  const activation = validateActivationReceipt(receipt);
  if (!activation.ok || !validCurrent(current)
    || receipt.surface.provider !== SUPPORTED_PROVIDER
    || receipt.surface.adapterId !== SUPPORTED_ADAPTER
    || receipt.surface.adapterSha256 !== adapterSha256
    || JSON.stringify(receipt.surface.tools) !== JSON.stringify(SUPPORTED_TOOLS)) {
    return fail("AFK-WORKER-AUTHORITY-INVALID");
  }
  const preceding = {
    schema: AFK_WORKER_REQUEST_SCHEMA,
    activationId: receipt.activationId,
    activationReceiptSha256: receipt.receiptSha256,
    sequence,
    dispatchId,
    attempt,
    privateRef: `refs/agent-pipeline/afk/${receipt.activationId}`,
    current,
    prior,
    readSnapshot,
    pathAllowlist: receipt.pathAllowlist,
    budgets: { files: receipt.budgets.files, bytes: receipt.budgets.bytes },
    adapter: {
      provider: receipt.surface.provider,
      id: receipt.surface.adapterId,
      sha256: receipt.surface.adapterSha256,
      tools: receipt.surface.tools,
    },
  };
  const request = { ...preceding, requestSha256: digest(preceding) };
  return validRequestShape(request)
    ? { ok: true, request }
    : fail("AFK-WORKER-REQUEST-INVALID");
}

function decodeContent(value) {
  if (typeof value !== "string" || value.length === 0 || !BASE64.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  return bytes.toString("base64") === value ? bytes : null;
}

function validOption(value) {
  return exactKeys(value, ["id", "title", "reason", "effect", "rejectionConsequence", "recommended"])
    && safeId(value.id) && safeText(value.title, 256) && safeText(value.reason)
    && safeText(value.effect) && safeText(value.rejectionConsequence)
    && typeof value.recommended === "boolean";
}

function validateWrite(write, request, snapshots) {
  if (!exactKeys(write, [
    "operation", "path", "baseMode", "baseBlobOid", "resultMode",
    "resultContentBase64", "resultSha256",
  ]) || !new Set(["put", "delete"]).has(write.operation)
    || !isNormalizedRepoPath(write.path) || !allowed(write.path, request.pathAllowlist.write)) return null;
  const base = snapshots.get(write.path) ?? null;
  if (write.operation === "delete") {
    if (base === null || write.baseMode !== base.mode || write.baseBlobOid !== base.blobOid
      || write.resultMode !== null || write.resultContentBase64 !== null || write.resultSha256 !== null) return null;
    return { bytes: 0 };
  }
  const content = decodeContent(write.resultContentBase64);
  if (content === null || !SHA256.test(write.resultSha256) || sha256(content) !== write.resultSha256) return null;
  if (base === null) {
    if (write.baseMode !== null || write.baseBlobOid !== null || write.resultMode !== "100644") return null;
  } else if (write.baseMode !== base.mode || write.baseBlobOid !== base.blobOid || write.resultMode !== base.mode) {
    return null;
  }
  return { bytes: content.length };
}

export function validateAfkWorkerResult(value, request) {
  if (!validRequestShape(request)) return fail("AFK-WORKER-REQUEST-INVALID");
  if (!exactKeys(value, [
    "schema", "activationId", "requestSha256", "sequence", "dispatchId", "attempt",
    "current", "finding", "options", "recommendation", "provisionalChoice", "writes",
    "resultSha256",
  ]) || value.schema !== AFK_WORKER_RESULT_SCHEMA
    || value.activationId !== request.activationId || value.requestSha256 !== request.requestSha256
    || value.sequence !== request.sequence || value.dispatchId !== request.dispatchId
    || value.attempt !== request.attempt || canonicalJson(value.current) !== canonicalJson(request.current)
    || !exactKeys(value.finding, ["id", "failureSignature"])
    || !safeId(value.finding.id) || !SHA256.test(value.finding.failureSignature)
    || !sortedUnique(value.options, (entry) => entry.id) || value.options.length < 2 || value.options.length > 8
    || !value.options.every(validOption) || value.options.filter((entry) => entry.recommended).length !== 1
    || !safeId(value.recommendation) || value.provisionalChoice !== value.recommendation
    || value.options.find((entry) => entry.recommended)?.id !== value.recommendation
    || !sortedUnique(value.writes, (entry) => entry.path) || value.writes.length > request.budgets.files
    || prefixConflict(value.writes.map((entry) => entry.path)) || !SHA256.test(value.resultSha256)) {
    return fail("AFK-WORKER-RESULT-INVALID");
  }
  const snapshots = new Map(request.readSnapshot.map((entry) => [entry.path, entry]));
  let totalBytes = 0;
  for (const write of value.writes) {
    const checked = validateWrite(write, request, snapshots);
    if (checked === null) return fail("AFK-WORKER-WRITE-INVALID", write?.path ?? null);
    totalBytes += checked.bytes;
  }
  if (totalBytes > request.budgets.bytes) return fail("AFK-WORKER-BUDGET-EXCEEDED");
  const { resultSha256, ...preceding } = value;
  if (resultSha256 !== digest(preceding)) return fail("AFK-WORKER-RESULT-DIGEST-MISMATCH");
  return {
    ok: true,
    result: value,
    proposal: {
      activationId: value.activationId,
      requestSha256: value.requestSha256,
      sequence: value.sequence,
      finding: value.finding,
      recommendation: value.recommendation,
      options: value.options,
      writes: value.writes,
      resultSha256: value.resultSha256,
    },
    totalBytes,
  };
}

export function createAfkWorkerResult(input, request) {
  if (!validRequestShape(request) || !object(input)) return fail("AFK-WORKER-RESULT-INVALID");
  const preceding = {
    schema: AFK_WORKER_RESULT_SCHEMA,
    activationId: request.activationId,
    requestSha256: request.requestSha256,
    sequence: request.sequence,
    dispatchId: request.dispatchId,
    attempt: request.attempt,
    current: request.current,
    finding: input.finding,
    options: input.options,
    recommendation: input.recommendation,
    provisionalChoice: input.provisionalChoice,
    writes: input.writes,
  };
  const result = { ...preceding, resultSha256: digest(preceding) };
  return validateAfkWorkerResult(result, request);
}

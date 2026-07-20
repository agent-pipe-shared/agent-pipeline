// SPDX-License-Identifier: Apache-2.0

/**
 * Pure private wire validation for the document-renderer stdio contract.
 *
 * This module neither launches a renderer nor opens, stages, writes, or names
 * an output file.  It handles only caller-supplied bytes, so private request
 * coordinates cannot cross any public CLI/logging boundary here.
 */
import { isAbsolute, resolve } from "node:path";

import { DOCUMENT_CLASS_IDS, DOCUMENT_HOOK_EVENTS } from "../lib/document-hooks.mjs";

export const DOCUMENT_RENDERER_REQUEST_SCHEMA = "pipeline.document-renderer-request.v1";
export const DOCUMENT_RENDERER_RESPONSE_SCHEMA = "pipeline.document-renderer-response.v1";
export const DOCUMENT_RENDERER_OUTPUT_MODE = "framed-stdout-v1";
export const DOCUMENT_RENDERER_MAX_HEADER_BYTES = 65_536;
export const DOCUMENT_RENDERER_MAX_PAYLOAD_BYTES = 268_435_456;

const REQUEST_ID = /^drq_[a-z2-7]{25}[aeimquy4]$/u;
const BINDING_ID = /^dh_[a-z2-7]{25}[aeimquy4]$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const REQUEST_KEYS = ["schema", "requestId", "repoFingerprint", "classId", "bindingId", "event", "candidateCommit", "candidateTree", "dataPath", "dataSha256", "templatePath", "templateSha256", "outputMode", "deadlineAt"];
const RESPONSE_KEYS = ["schema", "requestId", "status", "rendererSha256", "outputSha256", "errorClass"];
const FAILED_ERRORS = new Set(["data-invalid", "template-invalid", "render-failed", "output-invalid", "timeout"]);
const UTF8 = new TextDecoder("utf-8", { fatal: true });

export class DocumentRenderProtocolError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.name = "DocumentRenderProtocolError"; this.code = code; }
}

function fail(code, message) { throw new DocumentRenderProtocolError(code, message); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) { return object(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function scalar(value) { return typeof value === "string" && Buffer.from(value, "utf8").toString("utf8") === value; }
function canonicalIso(value) { return scalar(value) && ISO.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function canonicalAbsolutePath(value) { return scalar(value) && !value.includes("\0") && isAbsolute(value) && resolve(value) === value; }

/** Canonical compact JSON: lexicographic object keys and no non-JSON values. */
export function canonicalRendererJson(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    if (!scalar(value)) fail("DRP-JSON", "renderer JSON contains a non-scalar string");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("DRP-JSON", "renderer JSON contains an unsafe number");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalRendererJson).join(",")}]`;
  if (!object(value) || Object.getPrototypeOf(value) !== Object.prototype) fail("DRP-JSON", "renderer JSON contains a non-plain value");
  return `{${Object.keys(value).sort().map((key) => `${canonicalRendererJson(key)}:${canonicalRendererJson(value[key])}`).join(",")}}`;
}

export function validateRendererRequest(value) {
  if (!exactKeys(value, REQUEST_KEYS) || value.schema !== DOCUMENT_RENDERER_REQUEST_SCHEMA
    || !REQUEST_ID.test(value.requestId ?? "") || !SHA256.test(value.repoFingerprint ?? "")
    || !DOCUMENT_CLASS_IDS.includes(value.classId) || !BINDING_ID.test(value.bindingId ?? "")
    || !DOCUMENT_HOOK_EVENTS.includes(value.event) || !OID.test(value.candidateCommit ?? "") || !OID.test(value.candidateTree ?? "")
    || !canonicalAbsolutePath(value.dataPath) || !SHA256.test(value.dataSha256 ?? "")
    || !canonicalAbsolutePath(value.templatePath) || !SHA256.test(value.templateSha256 ?? "")
    || value.outputMode !== DOCUMENT_RENDERER_OUTPUT_MODE || !canonicalIso(value.deadlineAt)) {
    fail("DRP-REQUEST", "renderer request has an invalid closed shape");
  }
  return JSON.parse(canonicalRendererJson(value));
}

export function validateRendererResponse(value, { requestId } = {}) {
  if (!exactKeys(value, RESPONSE_KEYS) || value.schema !== DOCUMENT_RENDERER_RESPONSE_SCHEMA
    || !REQUEST_ID.test(value.requestId ?? "") || (requestId !== undefined && value.requestId !== requestId)
    || !["rendered", "failed"].includes(value.status) || !SHA256.test(value.rendererSha256 ?? "")) {
    fail("DRP-RESPONSE", "renderer response has an invalid closed shape");
  }
  if (value.status === "rendered") {
    if (!SHA256.test(value.outputSha256 ?? "") || value.errorClass !== null) fail("DRP-RESPONSE", "rendered response has invalid result fields");
  } else if (value.outputSha256 !== null || !FAILED_ERRORS.has(value.errorClass)) {
    fail("DRP-RESPONSE", "failed response has invalid result fields");
  }
  return JSON.parse(canonicalRendererJson(value));
}

/** Encode the sole private stdin request body; it has no public writer. */
export function encodeRendererRequest(value) {
  return Buffer.from(canonicalRendererJson(validateRendererRequest(value)), "utf8");
}

/** Encode a closed renderer stdout frame for test fixtures and private callers. */
export function encodeRendererResponseFrame(response, payload = Buffer.alloc(0), options = {}) {
  const valid = validateRendererResponse(response, options);
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (valid.status === "failed" && body.length !== 0) fail("DRP-PAYLOAD", "failed renderer response must have an empty payload");
  if (body.length > DOCUMENT_RENDERER_MAX_PAYLOAD_BYTES) fail("DRP-PAYLOAD", "renderer payload exceeds its fixed maximum");
  const header = Buffer.from(canonicalRendererJson(valid), "utf8");
  if (header.length > DOCUMENT_RENDERER_MAX_HEADER_BYTES) fail("DRP-HEADER", "renderer response header exceeds its fixed maximum");
  const prefix = Buffer.allocUnsafe(12);
  prefix.writeUInt32BE(header.length, 0);
  prefix.writeBigUInt64BE(BigInt(body.length), 4);
  return Buffer.concat([prefix.subarray(0, 4), header, prefix.subarray(4), body]);
}

/**
 * Parse exactly one closed stdout frame.  A caller may stream the returned
 * payload only after this validation; this parser itself performs no writes.
 */
export function parseRendererResponseFrame(bytes, { requestId } = {}) {
  const source = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (source.length < 12) fail("DRP-FRAME", "renderer stdout ended before a complete frame header");
  const headerLength = source.readUInt32BE(0);
  if (headerLength > DOCUMENT_RENDERER_MAX_HEADER_BYTES) fail("DRP-HEADER", "renderer response header exceeds its fixed maximum");
  const headerEnd = 4 + headerLength;
  if (source.length < headerEnd + 8) fail("DRP-FRAME", "renderer stdout ended before its payload length");
  let headerText;
  try { headerText = UTF8.decode(source.subarray(4, headerEnd)); } catch { fail("DRP-HEADER", "renderer response header is not UTF-8"); }
  let parsed;
  try { parsed = JSON.parse(headerText); } catch { fail("DRP-HEADER", "renderer response header is not JSON"); }
  let response;
  try { response = validateRendererResponse(parsed, { requestId }); } catch (error) {
    if (error instanceof DocumentRenderProtocolError) throw error;
    fail("DRP-RESPONSE", "renderer response is invalid");
  }
  if (canonicalRendererJson(response) !== headerText) fail("DRP-HEADER", "renderer response header is not canonical JSON");
  const declared = source.readBigUInt64BE(headerEnd);
  if (declared > BigInt(DOCUMENT_RENDERER_MAX_PAYLOAD_BYTES)) fail("DRP-PAYLOAD", "renderer payload exceeds its fixed maximum");
  const payloadLength = Number(declared);
  const payloadStart = headerEnd + 8;
  const payloadEnd = payloadStart + payloadLength;
  if (source.length < payloadEnd) fail("DRP-FRAME", "renderer stdout ended before its declared payload");
  if (source.length !== payloadEnd) fail("DRP-TRAILING", "renderer stdout contains trailing bytes");
  if (response.status === "failed" && payloadLength !== 0) fail("DRP-PAYLOAD", "failed renderer response must have an empty payload");
  return { response, payload: Buffer.from(source.subarray(payloadStart, payloadEnd)) };
}

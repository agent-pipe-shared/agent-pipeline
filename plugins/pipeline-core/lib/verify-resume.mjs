#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

export const VERIFY_PROGRESS_SCHEMA = "pipeline.verify-progress.v1";
export const VERIFY_SUITE_RECEIPT_SCHEMA = "pipeline.verify-suite-receipt.v1";
export const VERIFY_RESUME_PLAN_SCHEMA = "pipeline.verify-resume-plan.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const REASONS = new Set(["missing-receipt", "corrupt-receipt", "not-successful", "suite-identity-drift", "candidate-drift", "suite-implementation-drift", "declared-input-drift", "environment-contract-drift", "verify-policy-drift", "missing-log", "corrupt-log", "truncated-log", "dependency-invalidated"]);
const ROOT_RECEIPT_KEYS = ["schema", "runId", "candidate", "suite", "implementationSha256", "inputs", "environmentContractSha256", "policySha256", "status", "exitCode", "log", "startedAt", "completedAt", "receiptSha256"];

function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key)); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function digestJson(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function candidate(value) { return exact(value, ["commit", "tree"]) && OID.test(value.commit) && OID.test(value.tree); }
function safePath(value) { return typeof value === "string" && value.length > 0 && value.length <= 512 && !value.startsWith("/") && !value.includes("\\") && !value.split("/").some((part) => part === "" || part === "." || part === ".."); }
function digestRef(value) { return exact(value, ["kind", "path", "sha256"]) && ID.test(value.kind) && value.path === null && SHA256.test(value.sha256); }
function fileRef(value) { return exact(value, ["path", "fileSha256"]) && safePath(value.path) && SHA256.test(value.fileSha256); }
function inputSet(value) {
  return exact(value, ["files", "nonFiles"])
    && Array.isArray(value.files) && value.files.length > 0 && value.files.length <= 256
    && value.files.every(fileRef) && value.files.every((ref, index) => index === 0 || value.files[index - 1].path < ref.path)
    && Array.isArray(value.nonFiles) && value.nonFiles.length > 0 && value.nonFiles.length <= 256
    && value.nonFiles.every(digestRef) && value.nonFiles.every((ref, index) => index === 0 || value.nonFiles[index - 1].kind < ref.kind);
}
function logRef(value) { return exact(value, ["path", "fileSha256", "byteLength", "truncated"]) && safePath(value.path) && SHA256.test(value.fileSha256) && Number.isSafeInteger(value.byteLength) && value.byteLength >= 0 && typeof value.truncated === "boolean"; }
function iso(value) { if (typeof value !== "string") return false; const time = Date.parse(value); return Number.isFinite(time) && new Date(time).toISOString() === value; }
function sortedUnique(values) { return Array.isArray(values) && values.length <= 256 && values.every((value, index) => ID.test(value) && (index === 0 || values[index - 1] < value)); }
function validSuite(suite) { return exact(suite, ["id", "implementationSha256", "inputs", "environmentContractSha256", "dependsOn"]) && ID.test(suite.id) && SHA256.test(suite.implementationSha256) && inputSet(suite.inputs) && SHA256.test(suite.environmentContractSha256) && sortedUnique(suite.dependsOn); }

export function verifySuiteReceiptSha256(receipt) { const { receiptSha256: omitted, ...body } = receipt ?? {}; return digestJson(body); }

export function validateVerifySuiteReceipt(receipt) {
  if (!exact(receipt, ROOT_RECEIPT_KEYS) || receipt.schema !== VERIFY_SUITE_RECEIPT_SCHEMA) return { ok: false, code: "VERIFY-RECEIPT-SHAPE" };
  if (!ID.test(receipt.runId) || !candidate(receipt.candidate) || !ID.test(receipt.suite)) return { ok: false, code: "VERIFY-RECEIPT-IDENTITY" };
  if (!SHA256.test(receipt.implementationSha256) || !inputSet(receipt.inputs)) return { ok: false, code: "VERIFY-RECEIPT-INPUTS" };
  if (!SHA256.test(receipt.environmentContractSha256) || !SHA256.test(receipt.policySha256)) return { ok: false, code: "VERIFY-RECEIPT-POLICY" };
  if (receipt.status !== "completed" || !Number.isSafeInteger(receipt.exitCode) || receipt.exitCode < 0 || !logRef(receipt.log)) return { ok: false, code: "VERIFY-RECEIPT-TERMINAL" };
  if (!iso(receipt.startedAt) || !iso(receipt.completedAt) || Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) return { ok: false, code: "VERIFY-RECEIPT-TIME" };
  if (!SHA256.test(receipt.receiptSha256) || verifySuiteReceiptSha256(receipt) !== receipt.receiptSha256) return { ok: false, code: "VERIFY-RECEIPT-DIGEST" };
  return { ok: true, code: null };
}

export function sealVerifySuiteReceipt(fields) {
  const receipt = { schema: VERIFY_SUITE_RECEIPT_SCHEMA, ...structuredClone(fields), receiptSha256: "0".repeat(64) };
  receipt.receiptSha256 = verifySuiteReceiptSha256(receipt);
  const checked = validateVerifySuiteReceipt(receipt);
  if (!checked.ok) throw new TypeError(checked.code);
  return Object.freeze(receipt);
}

function firstDrift(suite, receipt, context) {
  const valid = validateVerifySuiteReceipt(receipt);
  if (!valid.ok) return "corrupt-receipt";
  if (receipt.exitCode !== 0) return "not-successful";
  if (receipt.suite !== suite.id) return "suite-identity-drift";
  if (receipt.candidate.commit !== context.candidate.commit || receipt.candidate.tree !== context.candidate.tree) return "candidate-drift";
  if (receipt.implementationSha256 !== suite.implementationSha256) return "suite-implementation-drift";
  if (digestJson(receipt.inputs) !== digestJson(suite.inputs)) return "declared-input-drift";
  if (receipt.environmentContractSha256 !== suite.environmentContractSha256) return "environment-contract-drift";
  if (receipt.policySha256 !== context.policySha256) return "verify-policy-drift";
  const log = context.logs?.[suite.id];
  if (!logRef(log)) return "missing-log";
  if (receipt.log.truncated || log.truncated) return "truncated-log";
  if (digestJson(log) !== digestJson(receipt.log)) return "corrupt-log";
  return null;
}

function assertAcyclic(suites) {
  const byId = new Map(suites.map((suite) => [suite.id, suite]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new TypeError("Verify dependency cycle is invalid");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const suite of suites) visit(suite.id);
}

export function verifyResumePlanSha256(plan) { const { planSha256: omitted, ...body } = plan ?? {}; return digestJson(body); }

export function createPublicVerifyRunEvidence({ runId, policySha256, resumePlanSha256, terminalSha256, registeredSuiteCount, terminalReceiptCount, terminalStatus }) {
  if (!ID.test(runId) || ![policySha256, resumePlanSha256, terminalSha256].every((value) => SHA256.test(value))
    || !Number.isSafeInteger(registeredSuiteCount) || registeredSuiteCount < 1
    || !Number.isSafeInteger(terminalReceiptCount) || terminalReceiptCount < 0 || terminalReceiptCount > registeredSuiteCount
    || !["passed", "failed"].includes(terminalStatus)) throw new TypeError("Verify run evidence is invalid");
  return Object.freeze({
    runId,
    policySha256,
    resumePlanSha256,
    terminalSha256,
    registeredSuiteCount,
    terminalReceiptCount,
    status: terminalStatus === "passed" && terminalReceiptCount === registeredSuiteCount ? "passed" : "failed",
  });
}

export function planVerifyResume({ runId, candidate: currentCandidate, suites, receipts = {}, logs = {}, policySha256 }) {
  if (!ID.test(runId) || !candidate(currentCandidate) || !Array.isArray(suites) || suites.length === 0 || !SHA256.test(policySha256)) throw new TypeError("Verify registration is invalid");
  const ids = new Set();
  for (const suite of suites) { if (!validSuite(suite) || ids.has(suite.id)) throw new TypeError("Verify suite registration is invalid"); ids.add(suite.id); }
  for (const suite of suites) if (suite.dependsOn.some((id) => !ids.has(id) || id === suite.id)) throw new TypeError("Verify dependency registration is invalid");
  assertAcyclic(suites);

  const reasons = new Map();
  for (const suite of suites) reasons.set(suite.id, receipts[suite.id] === undefined ? { code: "missing-receipt", dependency: null } : { code: firstDrift(suite, receipts[suite.id], { candidate: currentCandidate, logs, policySha256 }), dependency: null });
  let changed = true;
  while (changed) {
    changed = false;
    for (const suite of suites) {
      if (reasons.get(suite.id).code !== null) continue;
      const dependency = suite.dependsOn.find((id) => reasons.get(id).code !== null);
      if (dependency) { reasons.set(suite.id, { code: "dependency-invalidated", dependency }); changed = true; }
    }
  }

  const reusable = [];
  const rerun = [];
  const invalidated = [];
  const reasonList = [];
  for (const suite of suites) {
    const reason = reasons.get(suite.id);
    if (reason.code === null) reusable.push(suite.id);
    else {
      if (!REASONS.has(reason.code)) throw new TypeError("Verify invalidation reason is not registered");
      rerun.push(suite.id);
      reasonList.push({ suite: suite.id, code: reason.code, dependency: reason.dependency });
      if (reason.code !== "missing-receipt") invalidated.push(suite.id);
    }
  }
  const plan = { schema: VERIFY_RESUME_PLAN_SCHEMA, runId, candidate: { commit: currentCandidate.commit, tree: currentCandidate.tree }, policySha256, reusable: reusable.sort(), rerun: rerun.sort(), invalidated: invalidated.sort(), reasons: reasonList.sort((a, b) => a.suite.localeCompare(b.suite)), planSha256: "0".repeat(64) };
  plan.planSha256 = verifyResumePlanSha256(plan);
  return Object.freeze(plan);
}

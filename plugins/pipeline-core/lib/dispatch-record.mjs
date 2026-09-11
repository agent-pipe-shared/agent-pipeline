// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";

export const DISPATCH_RECORD_SCHEMA = "pipeline.dispatch-record.v2";
export const NON_TERMINAL_OUTCOMES = Object.freeze(["in-progress", "in progress", "started", "pending", "running"]);
export const SAFE_TASK_ID = /^[A-Za-z0-9._-]+$/u;
const FULL_COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/@-]{0,255}$/u;
const PRIVATE_ABSOLUTE_PATH = /(?<![A-Za-z0-9_%])(?:\/(?:home|Users|mnt\/[A-Za-z]|tmp|var\/tmp|root|private\/var)(?:\/[^\s"'`<>]*)?(?=$|[\s"'`<>,;:)\]])|[A-Za-z]:[\\/][^\s"'`<>]+|\\\\[^\s"'`<>]+)/iu;
const TOP_LEVEL_KEYS = Object.freeze([
  "schema", "taskId", "agentType", "model", "effort", "rulesetSha", "dispatcher", "candidateCommit",
  "resultSha256", "outcome", "commits", "log", "report", "modelOverride", "criticSkip", "orchestratorAddedFiles",
]);

function fail(code, message) {
  const error = new Error(message); error.code = code; throw error;
}
function exactKeys(value, allowed, label, required = allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("record-shape", `${label} must be an object`);
  const keys = Object.keys(value);
  const unknown = keys.filter((key) => !allowed.includes(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) fail("record-shape", `${label} is not closed (unknown=${unknown.join(",") || "none"}; missing=${missing.join(",") || "none"})`);
}
function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > 1024 || /[\0\r\n]/u.test(value)) fail("record-field", `${label} is invalid`);
  return value;
}
function durableText(value, label) {
  nonempty(value, label);
  if (PRIVATE_ABSOLUTE_PATH.test(value)) fail("record-private-path", `${label} contains a private absolute path`);
}
function denyPrivateAbsolutePaths(value, label, seen = new WeakSet()) {
  if (typeof value === "string") {
    if (PRIVATE_ABSOLUTE_PATH.test(value)) fail("record-private-path", `${label} contains a private absolute path`);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail("record-shape", `${label} is cyclic`);
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => denyPrivateAbsolutePaths(entry, `${label}[${index}]`, seen));
  else Object.entries(value).forEach(([key, entry]) => denyPrivateAbsolutePaths(entry, `${label}.${key}`, seen));
  seen.delete(value);
}
export function isSafeTaskId(value) { return typeof value === "string" && SAFE_TASK_ID.test(value); }
export function isTerminalOutcome(outcome) {
  if (typeof outcome !== "string") return false;
  const normalized = outcome.trim().toLowerCase();
  return normalized !== "" && !NON_TERMINAL_OUTCOMES.includes(normalized);
}
export function isNonEmptyValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}
export function declaredCommits(record) {
  const raw = record?.commits ?? record?.commit;
  const list = (Array.isArray(raw) ? raw : [raw]).filter((entry) => typeof entry === "string" && entry.trim() !== "");
  return list.length > 0 ? list : null;
}
function pathText(entry) {
  const text = typeof entry === "string" ? entry : entry?.path;
  if (typeof text !== "string") return null;
  const token = text.trim().replace(/^[`'"]+/u, "").split(/[\s`'",]+/u)[0];
  return token ? token.replace(/[.,;:]+$/u, "") : null;
}
export function declaredOrchestratorPaths(record) {
  const list = record?.report?.orchestratorAddedFiles ?? record?.orchestratorAddedFiles;
  return Array.isArray(list) ? list.map(pathText).filter(Boolean) : [];
}
export function declaredPaths(record) {
  const changed = record?.report?.changedFiles ?? record?.changedFiles;
  if (!Array.isArray(changed)) return null;
  const orchestrator = record?.report?.orchestratorAddedFiles ?? record?.orchestratorAddedFiles;
  return [changed, orchestrator].filter(Array.isArray).flatMap((list) => list.map(pathText).filter(Boolean));
}
export function coveringPath(commitPath, declared) {
  const target = commitPath.replace(/^\.\//u, "");
  return declared.find((entry) => {
    const candidate = entry.replace(/^\.\//u, "").replace(/\/$/u, "");
    return candidate === target || target.startsWith(`${candidate}/`);
  }) ?? null;
}
export function missingBriefingFields(record) {
  const missing = [];
  if (typeof record?.model !== "string" || record.model.trim() === "") missing.push("model");
  if (typeof record?.rulesetSha !== "string" || record.rulesetSha.trim() === "") missing.push("rulesetSha");
  if (!isNonEmptyValue(record?.report)) missing.push("report");
  return missing;
}

export function normalizeDispatchRecordPath(value, label = "dispatch record path") {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || value.trim() !== value
    || value.startsWith("/") || value.includes("\\") || /[\0\r\n`$*?{}[\]()]/u.test(value)) fail("record-path", `${label} is not a literal repository-relative path`);
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) fail("record-path", `${label} is not normalized`);
  return value;
}
function strictPathEntry(entry, label) {
  if (typeof entry === "string") {
    const match = /^(\S+?)(?:\s+-\s+.+)?$/u.exec(entry);
    if (!match) fail("record-path", `${label} string is malformed`);
    normalizeDispatchRecordPath(match[1], label);
    return;
  }
  exactKeys(entry, ["path"], label);
  normalizeDispatchRecordPath(entry.path, label);
}
function strictPathList(value, label) {
  if (!Array.isArray(value) || value.length > 512) fail("record-path", `${label} must be a bounded array`);
  value.forEach((entry, index) => strictPathEntry(entry, `${label}[${index}]`));
  const paths = value.map(pathText);
  if (new Set(paths).size !== paths.length) fail("record-path", `${label} contains duplicate paths`);
}

export function validateDispatchRecord(record) {
  const required = TOP_LEVEL_KEYS.slice(0, 13);
  exactKeys(record, TOP_LEVEL_KEYS, "dispatch record", required);
  // This record is durable evidence. Apply the privacy invariant to every
  // persisted string before field-specific syntax and compatibility checks so
  // no newly added or annotation-bearing string lane can bypass it.
  denyPrivateAbsolutePaths(record, "dispatch record");
  if (record.schema !== DISPATCH_RECORD_SCHEMA) fail("record-schema", `dispatch record schema must be ${DISPATCH_RECORD_SCHEMA}`);
  if (!isSafeTaskId(record.taskId)) fail("record-task-id", "dispatch record taskId is unsafe");
  for (const [key, value] of [["agentType", record.agentType], ["model", record.model], ["effort", record.effort], ["rulesetSha", record.rulesetSha], ["dispatcher", record.dispatcher]]) nonempty(value, key);
  if (!SAFE_TOKEN.test(record.agentType) || !SAFE_TOKEN.test(record.effort)) fail("record-field", "agentType or effort is invalid");
  if (!FULL_COMMIT.test(record.candidateCommit)) fail("record-commit", "candidateCommit must be a full lowercase commit SHA");
  if (record.resultSha256 !== null && (typeof record.resultSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.resultSha256))) fail("record-result", "resultSha256 must be null or a lowercase SHA-256 digest");
  if (typeof record.outcome !== "string" || !/^[a-z][a-z0-9-]*$/u.test(record.outcome)) fail("record-outcome", "outcome must be a lowercase slug");
  if (!Array.isArray(record.commits) || record.commits.length > 256 || record.commits.some((sha) => !FULL_COMMIT.test(sha)) || new Set(record.commits).size !== record.commits.length) fail("record-commit", "commits must be unique full lowercase commit SHAs");
  if (isTerminalOutcome(record.outcome) && (record.commits.length === 0 || record.commits.at(-1) !== record.candidateCommit)) {
    fail("record-commit-binding", "terminal dispatch record requires candidateCommit as the final commits entry");
  }
  if (isTerminalOutcome(record.outcome) && record.resultSha256 === null) fail("record-result", "terminal dispatch record requires resultSha256");
  if (!Array.isArray(record.log) || record.log.length > 2048) fail("record-log", "log must be a bounded array");
  record.log.forEach((entry, index) => {
    exactKeys(entry, ["phase", "toolUseCount", "note"], `log[${index}]`, ["phase", "toolUseCount"]);
    nonempty(entry.phase, `log[${index}].phase`);
    if (!Number.isSafeInteger(entry.toolUseCount) || entry.toolUseCount < 0) fail("record-log", `log[${index}].toolUseCount is invalid`);
    if (Object.hasOwn(entry, "note")) durableText(entry.note, `log[${index}].note`);
  });
  if (record.report !== null) {
    exactKeys(record.report, ["text", "changedFiles", "orchestratorAddedFiles"], "report", ["text", "changedFiles"]);
    durableText(record.report.text, "report.text");
    strictPathList(record.report.changedFiles, "report.changedFiles");
    if (Object.hasOwn(record.report, "orchestratorAddedFiles")) strictPathList(record.report.orchestratorAddedFiles, "report.orchestratorAddedFiles");
  } else if (isTerminalOutcome(record.outcome)) fail("record-report", "terminal dispatch record requires report");
  if (Object.hasOwn(record, "orchestratorAddedFiles")) strictPathList(record.orchestratorAddedFiles, "orchestratorAddedFiles");
  if (Object.hasOwn(record, "modelOverride")) {
    exactKeys(record.modelOverride, ["model", "effort", "rationale"], "modelOverride");
    nonempty(record.modelOverride.model, "modelOverride.model"); nonempty(record.modelOverride.effort, "modelOverride.effort"); durableText(record.modelOverride.rationale, "modelOverride.rationale");
  }
  if (Object.hasOwn(record, "criticSkip")) {
    exactKeys(record.criticSkip, ["schema", "reason"], "criticSkip", ["schema"]);
    if (record.criticSkip.schema !== "pipeline.critic-skip-decision.v1") fail("record-field", "criticSkip schema is invalid");
    if (Object.hasOwn(record.criticSkip, "reason")) nonempty(record.criticSkip.reason, "criticSkip.reason");
  }
  return structuredClone(record);
}

export function dispatchRecordSha256(record) {
  const canonical = `${JSON.stringify(validateDispatchRecord(record), null, 2)}\n`;
  return createHash("sha256").update(canonical).digest("hex");
}

#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure validation/preview boundary for project-scoped GitHub issue work.
 * Authentication and the actual gh API call remain outside this module. This
 * keeps credentials out of the pipeline and makes every mutation previewable
 * and read-back verifiable.
 */
export const ISSUE_OPERATIONS_SCHEMA = "pipeline.github-issue-operations.v1";
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const ISSUE_NUMBER = /^[1-9][0-9]*$/u;
const LABEL = /^(?!\s)[^\r\n]{1,100}$/u;
const OPERATIONS = new Set(["create", "edit"]);
const EDITABLE_FIELDS = new Set(["title", "body", "labels"]);

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function fail(code, detail = null) {
  return { ok: false, code, detail };
}

export function validateIssueRepository(repository) {
  return typeof repository === "string" && REPOSITORY.test(repository)
    ? { ok: true, repository }
    : fail("GHO-TARGET-INVALID");
}

function validateFields(fields, { operation }) {
  if (fields === null || typeof fields !== "object" || Array.isArray(fields) || Object.keys(fields).length === 0) return fail("GHO-FIELDS-EMPTY");
  for (const key of Object.keys(fields)) {
    if (!EDITABLE_FIELDS.has(key)) return fail("GHO-FIELD-UNSUPPORTED", key);
    if (key === "title" && (typeof fields[key] !== "string" || fields[key].trim().length === 0 || fields[key].length > 256)) return fail("GHO-TITLE-INVALID");
    if (key === "body" && (typeof fields[key] !== "string" || fields[key].length > 65536)) return fail("GHO-BODY-INVALID");
    if (key === "labels" && (!Array.isArray(fields[key]) || fields[key].some((label) => typeof label !== "string" || !LABEL.test(label)) || new Set(fields[key]).size !== fields[key].length)) return fail("GHO-LABELS-INVALID");
  }
  if (operation === "create" && (!Object.hasOwn(fields, "title") || !Object.hasOwn(fields, "body"))) return fail("GHO-CREATE-REQUIRED");
  return { ok: true };
}

/** Build the exact, serializable mutation shown to a user before gh writes. */
export function createIssueMutationPreview(input = {}) {
  if (!exactKeys(input, ["repository", "operation", "issueNumber", "fields"])) return fail("GHO-PREVIEW-SHAPE");
  const target = validateIssueRepository(input.repository);
  if (!target.ok) return target;
  if (!OPERATIONS.has(input.operation)) return fail("GHO-OPERATION-UNSUPPORTED");
  if (input.operation === "create" && input.issueNumber !== null) return fail("GHO-CREATE-NUMBER");
  if (input.operation === "edit" && !(typeof input.issueNumber === "number" && Number.isSafeInteger(input.issueNumber) && ISSUE_NUMBER.test(String(input.issueNumber)))) return fail("GHO-EDIT-NUMBER");
  const fields = validateFields(input.fields, { operation: input.operation });
  if (!fields.ok) return fields;
  return {
    ok: true,
    preview: { schema: ISSUE_OPERATIONS_SCHEMA, repository: input.repository, operation: input.operation, issueNumber: input.issueNumber, fields: structuredClone(input.fields) },
  };
}

function sortedLabels(labels) { return [...labels].sort((left, right) => left.localeCompare(right)); }

/** Require exact target and exact changed fields before reporting a mutation. */
export function validateIssueReadback({ preview, readback } = {}) {
  if (!preview || preview.schema !== ISSUE_OPERATIONS_SCHEMA || !readback || typeof readback !== "object") return fail("GHO-READBACK-SHAPE");
  if (readback.repository !== preview.repository) return fail("GHO-READBACK-TARGET");
  if (!(typeof readback.issueNumber === "number" && Number.isSafeInteger(readback.issueNumber) && readback.issueNumber > 0)) return fail("GHO-READBACK-NUMBER");
  if (preview.operation === "edit" && readback.issueNumber !== preview.issueNumber) return fail("GHO-READBACK-NUMBER");
  for (const key of Object.keys(preview.fields)) {
    if (key === "labels") {
      if (!Array.isArray(readback.labels) || JSON.stringify(sortedLabels(readback.labels)) !== JSON.stringify(sortedLabels(preview.fields.labels))) return fail("GHO-READBACK-LABELS");
    } else if (readback[key] !== preview.fields[key]) return fail(`GHO-READBACK-${key.toUpperCase()}`);
  }
  return { ok: true, issueNumber: readback.issueNumber };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  if (process.argv.includes("--schema")) console.log(JSON.stringify({ schema: ISSUE_OPERATIONS_SCHEMA, operations: [...OPERATIONS], editableFields: [...EDITABLE_FIELDS] }, null, 2));
  else { console.error("Usage: node plugins/pipeline-core/scripts/github-issue-operations.mjs --schema"); process.exitCode = 2; }
}

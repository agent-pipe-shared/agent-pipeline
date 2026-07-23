#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { createIssueMutationPreview, validateIssueReadback, validateIssueRepository, ISSUE_OPERATIONS_SCHEMA } from "./github-issue-operations.mjs";

const base = { repository: "example-org/example-app", operation: "create", issueNumber: null, fields: { title: "Fix login", body: "Details", labels: ["bug"] } };

test("target and preview are explicit and serializable", () => {
  assert.equal(validateIssueRepository("example-org/example-app").ok, true);
  const result = createIssueMutationPreview(base);
  assert.equal(result.ok, true);
  assert.equal(result.preview.schema, ISSUE_OPERATIONS_SCHEMA);
  assert.deepEqual(validateIssueReadback({ preview: result.preview, readback: { repository: "example-org/example-app", issueNumber: 7, title: "Fix login", body: "Details", labels: ["bug"] } }), { ok: true, issueNumber: 7 });
});

test("missing, malformed, or unsupported targets and writes fail closed", () => {
  assert.equal(validateIssueRepository("https://github.com/example-org/example-app").code, "GHO-TARGET-INVALID");
  assert.equal(createIssueMutationPreview({ ...base, operation: "delete" }).code, "GHO-OPERATION-UNSUPPORTED");
  assert.equal(createIssueMutationPreview({ ...base, fields: { title: "x", milestone: 1 } }).code, "GHO-FIELD-UNSUPPORTED");
  assert.equal(createIssueMutationPreview({ ...base, fields: { body: "x" } }).code, "GHO-CREATE-REQUIRED");
});

test("edit requires a positive issue number and only approved fields", () => {
  assert.equal(createIssueMutationPreview({ repository: base.repository, operation: "edit", issueNumber: 7, fields: { title: "Updated" } }).ok, true);
  assert.equal(createIssueMutationPreview({ repository: base.repository, operation: "edit", issueNumber: 0, fields: { title: "Updated" } }).code, "GHO-EDIT-NUMBER");
});

test("readback target, issue number, field values, and labels are bound exactly", () => {
  const result = createIssueMutationPreview(base);
  assert.equal(validateIssueReadback({ preview: result.preview, readback: { repository: "other-org/example-app", issueNumber: 7, title: "Fix login", body: "Details", labels: ["bug"] } }).code, "GHO-READBACK-TARGET");
  assert.equal(validateIssueReadback({ preview: result.preview, readback: { repository: base.repository, issueNumber: 7, title: "Changed", body: "Details", labels: ["bug"] } }).code, "GHO-READBACK-TITLE");
  assert.equal(validateIssueReadback({ preview: result.preview, readback: { repository: base.repository, issueNumber: 7, title: "Fix login", body: "Details", labels: ["bug", "extra"] } }).code, "GHO-READBACK-LABELS");
});

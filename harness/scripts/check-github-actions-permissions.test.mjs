#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkRepository } from "./check-github-actions-permissions.mjs";

function fixture(workflow, policy = { schema: "pipeline.github-actions-permissions.v1", jobWriteExceptions: [], checkoutCredentialExceptions: [] }) {
  const root = mkdtempSync(join(tmpdir(), "actions-permissions-"));
  mkdirSync(join(root, ".github/workflows"), { recursive: true }); mkdirSync(join(root, "governance"));
  writeFileSync(join(root, ".github/workflows/test.yml"), workflow);
  writeFileSync(join(root, "governance/github-actions-permissions.json"), JSON.stringify(policy));
  return root;
}
const good = `name: test\non:\n  push:\njobs:\n  build:\n    permissions:\n      contents: read\n    steps:\n      - uses: actions/checkout@abc\n        with:\n          persist-credentials: false\n`;
assert.equal(checkRepository(fixture(good), "2026-07-23").length, 0);
const missing = good.replace("    permissions:\n      contents: read\n", "");
assert.ok(checkRepository(fixture(missing), "2026-07-23").some((e) => e.code === "PERMISSIONS_MISSING"));
assert.ok(checkRepository(fixture(good.replace("permissions:\n      contents: read", "permissions: write-all")), "2026-07-23").some((e) => e.code === "JOB_PERMISSION_BROAD"));
assert.ok(checkRepository(fixture(good.replace("on:\n  push:", "on:\n  push:\npermissions: write-all")), "2026-07-23").some((e) => e.code === "ROOT_PERMISSION_BROAD"));
assert.ok(checkRepository(fixture(good.replace("permissions:\n      contents: read", "permissions:\n      contents: write")), "2026-07-23").some((e) => e.code === "JOB_WRITE_UNEXPLAINED"));
assert.ok(checkRepository(fixture(good.replace("persist-credentials: false", "persist-credentials: true")), "2026-07-23").some((e) => e.code === "CHECKOUT_CREDENTIALS_UNEXPLAINED"));
const write = `name: test\non:\n  push:\njobs:\n  publish:\n    permissions:\n      contents: write\n    steps:\n      - run: publish\n`;
const policy = { schema: "pipeline.github-actions-permissions.v1", jobWriteExceptions: [{ workflow: ".github/workflows/test.yml", job: "publish", permissions: ["contents"], justification: "publish release", owner: "team", expires: "2026-12-31" }], checkoutCredentialExceptions: [] };
assert.equal(checkRepository(fixture(write, policy), "2026-07-23").length, 0);
assert.ok(checkRepository(fixture(write, { ...policy, jobWriteExceptions: [] }), "2026-07-23").some((e) => e.code === "JOB_WRITE_UNEXPLAINED"));
assert.ok(checkRepository(fixture(write, { ...policy, jobWriteExceptions: [{ ...policy.jobWriteExceptions[0], expires: "2020-01-01" }] }), "2026-07-23").some((e) => e.code === "JOB_ENTRY_FIELDS_INVALID"));
assert.ok(checkRepository(fixture(write, { ...policy, jobWriteExceptions: [{ ...policy.jobWriteExceptions[0], workflow: "*" }] }), "2026-07-23").some((e) => e.code === "JOB_ENTRY_FIELDS_INVALID"));
assert.ok(checkRepository(fixture(write, { ...policy, jobWriteExceptions: [policy.jobWriteExceptions[0], policy.jobWriteExceptions[0]] }), "2026-07-23").some((e) => e.code === "POLICY_DUPLICATE_ENTRY"));
const prWrite = write.replace("  push:", "  pull_request:");
assert.ok(checkRepository(fixture(prWrite, policy), "2026-07-23").some((e) => e.code === "PR_JOB_WRITE_FORBIDDEN"));
const checkoutPolicy = { schema: "pipeline.github-actions-permissions.v1", jobWriteExceptions: [], checkoutCredentialExceptions: [{ workflow: ".github/workflows/test.yml", job: "build", justification: "legacy", owner: "team", expires: "2026-12-31" }] };
assert.ok(checkRepository(fixture(good, checkoutPolicy), "2026-07-23").some((e) => e.code === "UNUSED_POLICY_ENTRY"));
console.log("check-github-actions-permissions tests passed");

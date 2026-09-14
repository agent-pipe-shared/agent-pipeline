// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { checkCloneProvisioning } from "./check-clone-provisioning.mjs";

test("checkCloneProvisioning returns well-formed report against current root", () => {
  const report = checkCloneProvisioning(process.cwd());
  assert.equal(report.schema, "pipeline.clone-provisioning-report.v1");
  assert.ok(["ready", "provisioning-required"].includes(report.status));
  assert.equal(report.checks.length, 3);
  assert.deepEqual(report.checks.map((c) => c.id).sort(), ["po-profile-receipt", "pre-push-hook", "private-state-directory"]);
});

test("checkCloneProvisioning handles non-git root cleanly", () => {
  const report = checkCloneProvisioning("/tmp");
  assert.equal(report.schema, "pipeline.clone-provisioning-report.v1");
  assert.equal(report.status, "provisioning-required");
  assert.ok(report.checks.every((c) => c.status === "absent"));
});

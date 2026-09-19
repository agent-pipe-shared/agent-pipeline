// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { assessPushHookBackstop, checkCloneProvisioning, projectHookProvisioning } from "./check-clone-provisioning.mjs";

test("checkCloneProvisioning returns well-formed report against current root", () => {
  const report = checkCloneProvisioning(process.cwd());
  assert.equal(report.schema, "pipeline.clone-provisioning-report.v1");
  assert.ok(["ready", "provisioning-required"].includes(report.status));
  assert.equal(report.checks.length, 5);
  assert.deepEqual(report.checks.map((c) => c.id).sort(), ["commit-msg-hook", "po-profile-receipt", "pre-commit-hook", "pre-push-hook", "private-state-directory"]);
  for (const hook of report.checks.filter((check) => check.id.endsWith("-hook"))) {
    assert.ok(["current", "install", "decline", "foreign-owner", "unresolved"].includes(hook.status), hook.id);
  }
});

test("checkCloneProvisioning handles non-git root cleanly", () => {
  const report = checkCloneProvisioning("/tmp");
  assert.equal(report.schema, "pipeline.clone-provisioning-report.v1");
  assert.equal(report.status, "provisioning-required");
  assert.ok(report.checks.every((c) => c.status === "unresolved" || c.status === "absent"));
});

test("hook projection preserves ownership and makes only managed plans current", () => {
  const spec = (status) => ({ id: "fixture-hook", name: "fixture", installer: "fixture.mjs", planInstall: () => ({ status, hookPath: "/repo/hooks/fixture", detail: "fixture detail" }) });
  assert.equal(projectHookProvisioning({ spec: spec("ready"), rootDir: "/repo" }).status, "install");
  assert.equal(projectHookProvisioning({ spec: spec("ready-to-upgrade"), rootDir: "/repo" }).status, "current");
  const stale = projectHookProvisioning({
    spec: { ...spec("ready-to-upgrade"), planInstall: () => ({ status: "ready-to-upgrade", hookPath: "/repo/hooks/fixture", current: false }) },
    rootDir: "/repo",
  });
  assert.equal(stale.status, "install");
  assert.equal(projectHookProvisioning({ spec: spec("declined"), rootDir: "/repo" }).status, "decline");
  const foreign = projectHookProvisioning({ spec: spec("foreign-hook-present"), rootDir: "/repo" });
  assert.equal(foreign.status, "foreign-owner");
  assert.equal(foreign.repairAction, null, "a foreign hook must never be offered to an overwriting installer");
  assert.equal(projectHookProvisioning({ spec: spec("repository-unresolved"), rootDir: "/repo" }).status, "unresolved");
});

test("blocking push is backed only by a current generated pre-push hook", () => {
  const load = () => ({ gates: { push: { mode: "blocking" } } });
  for (const status of ["install", "decline", "foreign-owner", "unresolved"]) {
    const result = assessPushHookBackstop("/repo", { load, project: () => ({ status, repairAction: status === "install" ? "install" : null }) });
    assert.equal(result.backed, false, status);
    assert.equal(result.code, "UNBACKED_GATE", status);
  }
  const ready = assessPushHookBackstop("/repo", { load, project: () => ({ status: "current", repairAction: null }) });
  assert.equal(ready.backed, true);
  assert.equal(ready.code, null);
});

// SPDX-License-Identifier: SUL-1.0
// Pin for backlog item pipeline.mandatory-hook-readiness-returned-refusal-skips-rollback (ALF-C-P2-10, AC-210).
// Acceptance: a commit-msg installer that RETURNS a refusal (plan/install race) is a failed install exactly like a
// throw: the pre-commit hook installed by the same call is rolled back through the removal route, a
// MandatoryHookReadinessApplyError carries the refusal as cause, and no mixed state / readback-failed is reached.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { applyMandatoryHookReadiness, inspectMandatoryHookReadiness } from "../../scripts/clone-hook-readiness.mjs";
import { applyInstall as realApplyCommitMsg } from "../../scripts/commit-msg-hook-install.mjs";

const SCRATCH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "scratch");
const AMBIENT = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
const FOREIGN = "#!/bin/sh\n# a hook this installer did not write\nexit 0\n";

/** Throwaway repository under the repo's scratch/ with hooksPath pinned inside it. */
function withRepository(run) {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "chrb-pin-"));
  const previous = new Map(AMBIENT.map((n) => [n, process.env[n]]));
  try {
    for (const n of AMBIENT) delete process.env[n];
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    const gitDir = join(realpathSync.native(root), ".git");
    execFileSync("git", ["-C", root, "config", "--local", "core.hooksPath", join(gitDir, "hooks").replaceAll("\\", "/")], { stdio: "ignore" });
    return run({ root, hookFile: (name) => join(gitDir, "hooks", name) });
  } finally {
    for (const [n, v] of previous) { if (v === undefined) delete process.env[n]; else process.env[n] = v; }
    rmSync(root, { recursive: true, force: true });
  }
}

function thrown(run) {
  try { run(); } catch (error) { return error; }
  assert.fail("expected the call to throw");
}
const statuses = (r) => Object.fromEntries(r.required.map((e) => [e.id, e.status]));
const bothInstall = { "pre-commit-hook": "install", "commit-msg-hook": "install" };
const mustNotRun = (what) => () => { throw new Error(`${what} must not run`); };

test("returned refusal rolls pre-commit back: typed error, refusal as cause, pre-call state restored", () => withRepository(({ root, hookFile }) => {
  assert.deepEqual(statuses(inspectMandatoryHookReadiness(root)), bothInstall);
  const refusal = { status: "refused-foreign-hook", detail: "race" };
  let preCommitPresent = false;
  const error = thrown(() => applyMandatoryHookReadiness(root, {
    applyCommitMsg() { preCommitPresent = existsSync(hookFile("pre-commit")); return refusal; },
  }));
  assert.equal(preCommitPresent, true);
  assert.equal(error.name, "MandatoryHookReadinessApplyError");
  assert.equal(error.code, "HOOK-READINESS-APPLY-ROLLED-BACK");
  assert.equal(error.failedHook, "commit-msg-hook");
  assert.match(error.message, /refused-foreign-hook/);
  assert.match(error.message, /rolled back/);
  assert.equal(error.cause, refusal);
  assert.deepEqual(error.rollback, { hook: "pre-commit-hook", status: "rolled-back" });
  assert.equal(existsSync(hookFile("pre-commit")), false);
  const after = inspectMandatoryHookReadiness(root);
  assert.equal(after.status, "provisioning-required");
  assert.deepEqual(statuses(after), bothInstall);
  assert.deepEqual(error.readinessAfter, { status: "provisioning-required", code: "HOOK-READINESS-INSTALL-REQUIRED" });
}));

test("returned refusal from the REAL commit-msg installer (foreign hook planted mid-call) rolls back", () => withRepository(({ root, hookFile }) => {
  const error = thrown(() => applyMandatoryHookReadiness(root, {
    applyCommitMsg(args) { writeFileSync(hookFile("commit-msg"), FOREIGN, { mode: 0o755 }); return realApplyCommitMsg(args); },
  }));
  assert.equal(error.code, "HOOK-READINESS-APPLY-ROLLED-BACK");
  assert.match(String(error.cause?.status), /^refused/, "the real installer returned (did not throw) a refusal");
  assert.equal(existsSync(hookFile("pre-commit")), false, "pre-commit installed by this call is gone");
  assert.equal(readFileSync(hookFile("commit-msg"), "utf8"), FOREIGN, "the foreign hook is left untouched");
}));

test("returned refusal never leaves the readback-failed mixed state (result is a throw, not a returned verdict)", () => withRepository(({ root }) => {
  const error = thrown(() => applyMandatoryHookReadiness(root, { applyCommitMsg: () => ({ status: "refused-foreign-hook" }) }));
  assert.notEqual(error.code, "HOOK-READINESS-READBACK-FAILED");
  assert.equal(inspectMandatoryHookReadiness(root).status, "provisioning-required");
}));

test("returned result without a recognisable status counts as failed install and rolls back", () => {
  for (const bad of [undefined, null, {}, { status: "weird" }]) {
    withRepository(({ root, hookFile }) => {
      const error = thrown(() => applyMandatoryHookReadiness(root, { applyCommitMsg: () => bad }));
      assert.equal(error.code, "HOOK-READINESS-APPLY-ROLLED-BACK");
      assert.equal(existsSync(hookFile("pre-commit")), false);
    });
  }
});

test("rollback refused after a returned refusal (hook modified meanwhile): ROLLBACK-FAILED, modified hook kept", () => withRepository(({ root, hookFile }) => {
  const refusal = { status: "refused-foreign-hook" };
  const tampered = "#!/bin/sh\n# edited by a human after the install\n";
  const error = thrown(() => applyMandatoryHookReadiness(root, {
    applyCommitMsg() { writeFileSync(hookFile("pre-commit"), tampered); return refusal; },
  }));
  assert.equal(error.code, "HOOK-READINESS-APPLY-ROLLBACK-FAILED");
  assert.equal(error.cause, refusal);
  assert.equal(error.rollback.status, "failed");
  assert.equal(error.rollback.result.status, "refused-modified-hook");
  assert.equal(readFileSync(hookFile("pre-commit"), "utf8"), tampered);
}));

test("pre-commit not installed by this call: a returned refusal triggers no removal (APPLY-FAILED, not-needed)", () => withRepository(({ root }) => {
  const refusal = { status: "refused-foreign-hook" };
  const error = thrown(() => applyMandatoryHookReadiness(root, {
    applyPreCommit: () => ({ status: "refused-foreign-hook" }),
    removePreCommit: mustNotRun("removePreCommit"),
    applyCommitMsg: () => refusal,
  }));
  assert.equal(error.code, "HOOK-READINESS-APPLY-FAILED");
  assert.equal(error.cause, refusal);
  assert.deepEqual(error.rollback, { hook: "pre-commit-hook", status: "not-needed" });
  assert.doesNotMatch(error.message, /was rolled back/);
}));

test("applied statuses are not treated as refusals: installed and upgraded never roll back", () => {
  for (const status of ["installed", "upgraded"]) {
    withRepository(({ root }) => {
      const result = applyMandatoryHookReadiness(root, {
        applyPreCommit: () => ({ status: "installed" }),
        applyCommitMsg: () => ({ status }),
        removePreCommit: mustNotRun("removePreCommit"),
      });
      assert.deepEqual(result.installResults.map((e) => e.id), ["pre-commit-hook", "commit-msg-hook"]);
    });
  }
});

test("real installs both succeed: ready, no rollback (default path unchanged)", () => withRepository(({ root }) => {
  const result = applyMandatoryHookReadiness(root);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.installResults.map((e) => e.result.status), ["installed", "installed"]);
}));

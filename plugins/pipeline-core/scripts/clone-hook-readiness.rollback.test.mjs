// SPDX-License-Identifier: SUL-1.0
// HOOKREFRESH-S5: applyMandatoryHookReadiness is all-or-nothing. If the second mandatory hook
// (commit-msg) cannot be installed after the first (pre-commit) was, the first is removed again
// through its installer's own removal path and a typed error names both hooks and the outcome.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, openSync as openCompletionDescriptor, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join, resolve, sep } from "node:path";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { applyMandatoryHookReadiness, inspectMandatoryHookReadiness } from "./clone-hook-readiness.mjs";
import { applyInstall as installPreCommitForReal } from "./pre-commit-hook-install.mjs";

const completionCases = [];
function test(name, run) {
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  completionCases.push({ id: "CHRB" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}

const AMBIENT_GIT_VARIABLES = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
const FOREIGN_HOOK = "#!/bin/sh\n# a hook this installer did not write\nexit 0\n";

/** A throwaway repository whose hooks directory is pinned INSIDE it, so no machine-level
 * core.hooksPath can ever redirect a hook write outside the temporary directory. */
function withRepository(run) {
  const root = mkdtempSync(join(tmpdir(), "clone-hook-readiness-rollback-"));
  const previous = new Map(AMBIENT_GIT_VARIABLES.map((name) => [name, process.env[name]]));
  try {
    for (const name of AMBIENT_GIT_VARIABLES) delete process.env[name];
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    const gitDir = join(realpathSync.native(root), ".git");
    execFileSync("git", ["-C", root, "config", "--local", "core.hooksPath", join(gitDir, "hooks").replaceAll("\\", "/")], { stdio: "ignore" });
    const ctx = { root, hookFile: (name) => join(gitDir, "hooks", name) };
    const before = inspectMandatoryHookReadiness(root);
    for (const entry of before.required) {
      assert.ok(resolve(entry.path).toLowerCase().startsWith((gitDir + sep).toLowerCase()), "hook path must stay inside the temporary repository");
    }
    return run(ctx);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

function thrown(run) {
  try {
    run();
  } catch (error) {
    return error;
  }
  assert.fail("expected the call to throw");
}

function statuses(readiness) {
  return Object.fromEntries(readiness.required.map((entry) => [entry.id, entry.status]));
}

const mustNotRun = (what) => () => { throw new Error(`${what} must not run`); };
const simulatedFault = () => Object.assign(new Error("simulated commit-msg install fault"), { code: "SIMULATED-INSTALL-FAULT" });

test("second install throws: pre-commit is removed again and the typed error names commit-msg and the rollback", () => withRepository(({ root, hookFile }) => {
  assert.deepEqual(statuses(inspectMandatoryHookReadiness(root)), { "pre-commit-hook": "install", "commit-msg-hook": "install" });
  const fault = simulatedFault();
  let preCommitPresentWhenSecondRan = false;
  const error = thrown(() => applyMandatoryHookReadiness(root, {
    applyCommitMsg() {
      preCommitPresentWhenSecondRan = existsSync(hookFile("pre-commit"));
      throw fault;
    },
  }));
  assert.equal(preCommitPresentWhenSecondRan, true, "the first hook really was installed by this call");
  assert.equal(error.code, "HOOK-READINESS-APPLY-ROLLED-BACK");
  assert.equal(error.failedHook, "commit-msg-hook");
  assert.match(error.message, /commit-msg-hook/);
  assert.match(error.message, /rolled back/);
  assert.equal(error.cause, fault, "the original failure stays reachable as cause");
  assert.deepEqual(error.rollback, { hook: "pre-commit-hook", status: "rolled-back" });
  assert.equal(existsSync(hookFile("pre-commit")), false);
  const after = inspectMandatoryHookReadiness(root);
  assert.equal(after.status, "provisioning-required", "the next readiness read is the pre-call install state, not blocked");
  assert.deepEqual(statuses(after), { "pre-commit-hook": "install", "commit-msg-hook": "install" });
  assert.notEqual(after.nextAction, null, "a repair route is still offered");
  assert.deepEqual(error.readinessAfter, { status: "provisioning-required", code: "HOOK-READINESS-INSTALL-REQUIRED" });
}));

test("rollback refused by the installer (hook modified meanwhile): both hooks named, original cause kept, modified hook left alone", () => withRepository(({ root, hookFile }) => {
  const fault = simulatedFault();
  const tampered = "#!/bin/sh\n# edited by a human after the install\n";
  const error = thrown(() => applyMandatoryHookReadiness(root, {
    applyCommitMsg() {
      writeFileSync(hookFile("pre-commit"), tampered);
      throw fault;
    },
  }));
  assert.equal(error.code, "HOOK-READINESS-APPLY-ROLLBACK-FAILED");
  assert.equal(error.failedHook, "commit-msg-hook");
  assert.match(error.message, /commit-msg-hook/);
  assert.match(error.message, /pre-commit-hook/);
  assert.match(error.message, /rollback failed/);
  assert.doesNotMatch(error.message, /was rolled back/);
  assert.equal(error.cause, fault);
  assert.equal(error.rollback.hook, "pre-commit-hook");
  assert.equal(error.rollback.status, "failed");
  assert.equal(error.rollback.result.status, "refused-modified-hook");
  assert.equal(readFileSync(hookFile("pre-commit"), "utf8"), tampered, "the installer's own removal never deletes a modified hook");
  assert.equal(error.readinessAfter?.status, "blocked", "the half-applied state is reported honestly");
}));

test("rollback itself throws: both hooks named, original cause preserved, rollback error reachable", () => withRepository(({ root }) => {
  const fault = simulatedFault();
  const rollbackFault = Object.assign(new Error("simulated removal fault"), { code: "SIMULATED-REMOVAL-FAULT" });
  const error = thrown(() => applyMandatoryHookReadiness(root, {
    applyPreCommit: () => ({ status: "installed" }),
    removePreCommit() { throw rollbackFault; },
    applyCommitMsg() { throw fault; },
  }));
  assert.equal(error.code, "HOOK-READINESS-APPLY-ROLLBACK-FAILED");
  assert.match(error.message, /commit-msg-hook/);
  assert.match(error.message, /pre-commit-hook/);
  assert.match(error.message, /rollback failed/);
  assert.match(error.message, /SIMULATED-REMOVAL-FAULT/);
  assert.doesNotMatch(error.message, /was rolled back/);
  assert.equal(error.cause, fault, "the ORIGINAL failure is the cause, not the rollback failure");
  assert.equal(error.rollback.status, "failed");
  assert.equal(error.rollback.error, rollbackFault);
}));

test("both installs succeed: default behaviour is unchanged (ready, two installed results, no rollback)", () => withRepository(({ root }) => {
  const result = applyMandatoryHookReadiness(root);
  assert.equal(result.status, "ready");
  assert.equal(result.code, null);
  assert.deepEqual(result.installResults.map((entry) => [entry.id, entry.result.status]), [
    ["pre-commit-hook", "installed"],
    ["commit-msg-hook", "installed"],
  ]);
  assert.deepEqual(statuses(inspectMandatoryHookReadiness(root)), { "pre-commit-hook": "current", "commit-msg-hook": "current" });
}));

test("both injected installs return: the readback verdict is unchanged and the removal seam is never used", () => withRepository(({ root }) => {
  const result = applyMandatoryHookReadiness(root, {
    applyPreCommit: () => ({ status: "installed" }),
    applyCommitMsg: () => ({ status: "installed" }),
    removePreCommit: mustNotRun("removePreCommit"),
  });
  assert.equal(result.status, "readback-failed");
  assert.equal(result.code, "HOOK-READINESS-READBACK-FAILED");
  assert.deepEqual(result.installResults.map((entry) => entry.id), ["pre-commit-hook", "commit-msg-hook"]);
}));

test("a foreign pre-commit hook that existed before the call is never touched or removed", () => withRepository(({ root, hookFile }) => {
  writeFileSync(hookFile("pre-commit"), FOREIGN_HOOK, { mode: 0o755 });
  assert.equal(inspectMandatoryHookReadiness(root).status, "blocked");
  const result = applyMandatoryHookReadiness(root, {
    applyPreCommit: mustNotRun("applyPreCommit"),
    applyCommitMsg: mustNotRun("applyCommitMsg"),
    removePreCommit: mustNotRun("removePreCommit"),
  });
  assert.equal(result.status, "refused");
  assert.equal(readFileSync(hookFile("pre-commit"), "utf8"), FOREIGN_HOOK);
}));

test("an already-installed pre-commit hook of ours is never removed when commit-msg is the missing one", () => withRepository(({ root, hookFile }) => {
  const installed = installPreCommitForReal({ rootDir: root });
  assert.equal(installed.status, "installed");
  const hookBytes = readFileSync(hookFile("pre-commit"), "utf8");
  const before = inspectMandatoryHookReadiness(root);
  assert.deepEqual(statuses(before), { "pre-commit-hook": "current", "commit-msg-hook": "install" });
  const result = applyMandatoryHookReadiness(root, {
    applyPreCommit: mustNotRun("applyPreCommit"),
    applyCommitMsg: mustNotRun("applyCommitMsg"),
    removePreCommit: mustNotRun("removePreCommit"),
  });
  assert.equal(result.status, "refused");
  assert.equal(readFileSync(hookFile("pre-commit"), "utf8"), hookBytes);
  assert.equal(statuses(inspectMandatoryHookReadiness(root))["pre-commit-hook"], "current");
}));

test("pre-commit was not installed by this call: a failing second install triggers no removal at all", () => withRepository(({ root }) => {
  const fault = simulatedFault();
  const error = thrown(() => applyMandatoryHookReadiness(root, {
    applyPreCommit: () => ({ status: "refused-foreign-hook" }),
    removePreCommit: mustNotRun("removePreCommit"),
    applyCommitMsg() { throw fault; },
  }));
  assert.equal(error.code, "HOOK-READINESS-APPLY-FAILED");
  assert.equal(error.failedHook, "commit-msg-hook");
  assert.equal(error.cause, fault);
  assert.deepEqual(error.rollback, { hook: "pre-commit-hook", status: "not-needed" });
  assert.doesNotMatch(error.message, /was rolled back/);
}));

test("second install RETURNS a refusal instead of throwing: it rolls back exactly like a throw, with the refusal as cause", () => {
  // The only reachable shape is a plan/install race: the commit-msg installer re-plans and refuses.
  withRepository(({ root, hookFile }) => {
    assert.deepEqual(statuses(inspectMandatoryHookReadiness(root)), { "pre-commit-hook": "install", "commit-msg-hook": "install" });
    const refusal = { status: "refused-foreign-hook", detail: "a commit-msg hook appeared between plan and install" };
    let preCommitPresentWhenSecondRan = false;
    const error = thrown(() => applyMandatoryHookReadiness(root, {
      applyCommitMsg() {
        preCommitPresentWhenSecondRan = existsSync(hookFile("pre-commit"));
        return refusal;
      },
    }));
    assert.equal(preCommitPresentWhenSecondRan, true, "the first hook really was installed by this call");
    assert.equal(error.name, "MandatoryHookReadinessApplyError");
    assert.equal(error.code, "HOOK-READINESS-APPLY-ROLLED-BACK");
    assert.equal(error.failedHook, "commit-msg-hook");
    assert.match(error.message, /commit-msg-hook/);
    assert.match(error.message, /refused-foreign-hook/);
    assert.match(error.message, /rolled back/);
    assert.equal(error.cause, refusal, "the returned refusal is reachable as cause");
    assert.deepEqual(error.rollback, { hook: "pre-commit-hook", status: "rolled-back" });
    assert.equal(existsSync(hookFile("pre-commit")), false);
    const after = inspectMandatoryHookReadiness(root);
    assert.equal(after.status, "provisioning-required", "not the one-installed-one-missing wedge");
    assert.deepEqual(statuses(after), { "pre-commit-hook": "install", "commit-msg-hook": "install" });
    assert.notEqual(after.nextAction, null, "a repair route is still offered");
    assert.deepEqual(error.readinessAfter, { status: "provisioning-required", code: "HOOK-READINESS-INSTALL-REQUIRED" });
  });
  // The same code family as the throw path: the installer refuses to remove a hook modified meanwhile.
  withRepository(({ root, hookFile }) => {
    const refusal = { status: "refused-foreign-hook" };
    const tampered = "#!/bin/sh\n# edited by a human after the install\n";
    const error = thrown(() => applyMandatoryHookReadiness(root, {
      applyCommitMsg() {
        writeFileSync(hookFile("pre-commit"), tampered);
        return refusal;
      },
    }));
    assert.equal(error.code, "HOOK-READINESS-APPLY-ROLLBACK-FAILED");
    assert.equal(error.cause, refusal);
    assert.equal(error.rollback.status, "failed");
    assert.equal(error.rollback.result.status, "refused-modified-hook");
    assert.equal(readFileSync(hookFile("pre-commit"), "utf8"), tampered, "a modified hook is never deleted");
  });
  // A pre-commit hook this call did not install is never removed, whatever shape the second failure takes.
  withRepository(({ root }) => {
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
  });
});

if (completionCases.length !== 9) throw new Error("case completion count drift: expected 9, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });

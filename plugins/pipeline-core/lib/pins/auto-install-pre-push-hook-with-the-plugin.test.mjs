// SPDX-License-Identifier: SUL-1.0
/**
 * AC-116 / PO decision 13 (pipeline.auto-install-pre-push-hook-with-the-plugin), slice ALF-C-P18-03C.
 *
 * The clone path (`applyMandatoryHookReadiness`) must also install the pre-push backstop, but pre-push is NOT a
 * readiness gate: readiness still gates only on pre-commit and commit-msg.
 *   - a missing pre-push is installed; a current one is left alone;
 *   - a foreign pre-push is never overwritten, is reported as a non-blocking finding, readiness stays ready;
 *   - a pre-push install failure (thrown or returned) is reported and never rolls back or fails the gating hooks.
 * Cases marked REAL drive the genuine installers in a throw-away repository. Native Windows refuses the real hook apply
 * with PB-WINDOWS-ASSURANCE: those cases then end in a typed host skip (owner Coordinator, due 2026-10-19, Linux/WSL
 * run, PO decision K7); the seam-driven cases run everywhere.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MANDATORY_HOOK_IDS, NON_GATING_INSTALLED_HOOK_IDS, assessMandatoryHookReadiness, applyMandatoryHookGate } from "../../scripts/check-clone-provisioning.mjs";
import { applyMandatoryHookReadiness, inspectMandatoryHookReadiness } from "../../scripts/clone-hook-readiness.mjs";
import { applyInstall as realPrePush } from "../../scripts/pre-push-hook-install.mjs";

const AMBIENT = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
const FOREIGN = "#!/bin/sh\n# a foreign pre-push hook that is not ours\nexit 0\n";
const HOST_SKIP = Object.freeze({ code: "PB-WINDOWS-ASSURANCE", owner: "Coordinator", due: "2026-10-19", run: "Linux/WSL", decision: "K7" });

function withRepository(run) {
  const root = mkdtempSync(join(tmpdir(), "pre-push-clone-pin-"));
  const previous = new Map(AMBIENT.map((name) => [name, process.env[name]]));
  try {
    for (const name of AMBIENT) delete process.env[name];
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    const gitDir = join(realpathSync.native(root), ".git");
    execFileSync("git", ["-C", root, "config", "--local", "core.hooksPath", join(gitDir, "hooks").replaceAll("\\", "/")], { stdio: "ignore" });
    return run({ root, hookFile: (name) => join(gitDir, "hooks", name) });
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

const mustNotRun = (what) => () => { throw new Error(`${what} must not run`); };
const ok = () => ({ status: "installed" });
const ids = (list) => list.map((entry) => entry.id);
const nonGatingStatus = (observed) => Object.fromEntries((observed.nonGating ?? []).map((entry) => [entry.id, entry.status]));
const checks = (preCommit, commitMsg, prePush) => ({ checks: [
  { id: "pre-push-hook", status: prePush, path: "fixture", repairAction: null },
  { id: "pre-commit-hook", status: preCommit, path: "fixture", repairAction: null },
  { id: "commit-msg-hook", status: commitMsg, path: "fixture", repairAction: null },
] });

/** True when the real installers are refused by native Windows assurance; the caller then ends in a typed skip. */
function windowsAssuranceRefusal(run) {
  try {
    const outcome = run();
    return JSON.stringify(outcome ?? {}).includes(HOST_SKIP.code);
  } catch (error) {
    return `${error?.code ?? ""} ${error?.message ?? ""}`.includes(HOST_SKIP.code);
  }
}
function hostSkip(t, why) { t.skip(`typed host skip ${JSON.stringify({ ...HOST_SKIP, why })}`); }

test("assessment and apply agree: the gating set is exactly pre-commit + commit-msg, the installed set adds pre-push", () => {
  assert.deepEqual([...MANDATORY_HOOK_IDS], ["pre-commit-hook", "commit-msg-hook"]);
  assert.deepEqual([...NON_GATING_INSTALLED_HOOK_IDS], ["pre-push-hook"]);
  // The pre-push state never changes the verdict.
  for (const prePush of ["current", "install", "refresh", "foreign-owner", "decline", "unresolved"]) {
    const ready = assessMandatoryHookReadiness(checks("current", "current", prePush));
    assert.equal(ready.status, "ready", `pre-push=${prePush} must not gate a ready pair`);
    assert.equal(applyMandatoryHookGate("ready", ready), "ready");
    assert.deepEqual(ready.required.map((entry) => entry.id), MANDATORY_HOOK_IDS);
    assert.equal(ready.nonGating[0].id, "pre-push-hook");
    assert.equal(ready.nonGating[0].status, prePush, "reported, not hidden");
    const missing = assessMandatoryHookReadiness(checks("install", "install", prePush));
    assert.equal(missing.status, "provisioning-required", `pre-push=${prePush} must not alter the missing-pair verdict`);
  }
  // A report without any pre-push observation keeps the original shape (no nonGating key).
  assert.equal("nonGating" in assessMandatoryHookReadiness({ checks: checks("current", "current", "x").checks.slice(1) }), false);
  // Apply on a fresh repo installs gating hooks, then the non-gating one, and lists them separately.
  withRepository(({ root }) => {
    const calls = [];
    const result = applyMandatoryHookReadiness(root, {
      applyPreCommit() { calls.push("pre-commit"); return ok(); },
      applyCommitMsg() { calls.push("commit-msg"); return ok(); },
      applyPrePush() { calls.push("pre-push"); return ok(); },
    });
    assert.deepEqual(calls, ["pre-commit", "commit-msg", "pre-push"], "a fresh clone gets pre-push through the clone path, after the gating hooks");
    assert.deepEqual(ids(result.installResults), MANDATORY_HOOK_IDS, "installResults stays the gating set");
    assert.deepEqual(result.nonGatingInstallResults.map((entry) => [entry.id, entry.outcome]), [["pre-push-hook", "installed"]]);
    assert.deepEqual(ids(result.required), MANDATORY_HOOK_IDS);
  });
});

test("pre-push failure (thrown or returned) is reported and never rolls back or fails the gating hooks", () => {
  for (const failure of ["throw", "return"]) withRepository(({ root }) => {
    const calls = [];
    const result = applyMandatoryHookReadiness(root, {
      applyPreCommit() { calls.push("pre-commit"); return ok(); },
      applyCommitMsg() { calls.push("commit-msg"); return ok(); },
      removePreCommit: mustNotRun("removePreCommit"),
      applyPrePush() {
        calls.push("pre-push");
        if (failure === "throw") throw Object.assign(new Error("simulated pre-push fault"), { code: "SIMULATED-PRE-PUSH-FAULT" });
        return { status: "refused-foreign-hook" };
      },
    });
    assert.deepEqual(calls, ["pre-commit", "commit-msg", "pre-push"], failure);
    assert.deepEqual(ids(result.installResults), MANDATORY_HOOK_IDS, `${failure}: gating results kept`);
    const [entry] = result.nonGatingInstallResults;
    assert.equal(entry.outcome, "failed", failure);
    assert.match(entry.failure, failure === "throw" ? /SIMULATED-PRE-PUSH-FAULT/ : /refused-foreign-hook/);
  });
});

test("a failing gating install still stops before pre-push (no non-gating install on a failed pair)", () => withRepository(({ root }) => {
  let prePushCalls = 0;
  assert.throws(() => applyMandatoryHookReadiness(root, {
    applyPreCommit: ok,
    removePreCommit: () => ({ status: "removed" }),
    applyCommitMsg() { throw new Error("simulated commit-msg fault"); },
    applyPrePush() { prePushCalls += 1; return ok(); },
  }), (error) => error.code === "HOOK-READINESS-APPLY-ROLLED-BACK");
  assert.equal(prePushCalls, 0);
}));

test("REAL fresh clone: the clone path installs pre-commit, commit-msg and pre-push; readiness ready; second apply is a no-op", (t) => withRepository(({ root, hookFile }) => {
  if (windowsAssuranceRefusal(() => applyMandatoryHookReadiness(root))) return hostSkip(t, "real hook apply refused on native Windows");
  if (!existsSync(hookFile("pre-commit"))) return hostSkip(t, "no real hook was written on this host");
  assert.equal(inspectMandatoryHookReadiness(root).status, "ready");
  for (const name of ["pre-commit", "commit-msg", "pre-push"]) assert.equal(existsSync(hookFile(name)), true, `${name} installed`);
  const observed = inspectMandatoryHookReadiness(root);
  assert.equal(nonGatingStatus(observed)["pre-push-hook"], "current");
  const bytes = readFileSync(hookFile("pre-push"), "utf8");
  const again = applyMandatoryHookReadiness(root, { applyPrePush: mustNotRun("applyPrePush"), applyPreCommit: mustNotRun("applyPreCommit"), applyCommitMsg: mustNotRun("applyCommitMsg") });
  assert.equal(again.status, "ready");
  assert.equal(readFileSync(hookFile("pre-push"), "utf8"), bytes, "a current pre-push is left alone");
}));

test("REAL current pre-push is untouched; missing pre-push beside a ready pair is installed (ready path)", (t) => withRepository(({ root, hookFile }) => {
  if (windowsAssuranceRefusal(() => applyMandatoryHookReadiness(root, { applyPrePush: ok }))) return hostSkip(t, "real hook apply refused on native Windows");
  if (!existsSync(hookFile("pre-commit")) || !existsSync(hookFile("commit-msg"))) return hostSkip(t, "no real hook was written on this host");
  assert.equal(existsSync(hookFile("pre-push")), false, "precondition: gating pair ready, pre-push missing");
  const result = applyMandatoryHookReadiness(root);
  assert.equal(result.status, "ready");
  assert.equal(existsSync(hookFile("pre-push")), true);
  assert.equal(result.nonGatingInstallResults[0].outcome, "installed");
  const bytes = readFileSync(hookFile("pre-push"), "utf8");
  assert.equal(realPrePush({ rootDir: root }).status !== "refused-foreign-hook", true);
  assert.equal(readFileSync(hookFile("pre-push"), "utf8"), bytes);
}));

test("REAL foreign pre-push is preserved and reported; readiness stays ready; the gating hooks are installed", (t) => withRepository(({ root, hookFile }) => {
  writeFileSync(hookFile("pre-push"), FOREIGN, { mode: 0o755 });
  const before = inspectMandatoryHookReadiness(root);
  assert.equal(nonGatingStatus(before)["pre-push-hook"], "foreign-owner", "the foreign hook is reported as a finding");
  if (windowsAssuranceRefusal(() => applyMandatoryHookReadiness(root, { applyPrePush: mustNotRun("applyPrePush") }))) return hostSkip(t, "real hook apply refused on native Windows");
  if (!existsSync(hookFile("pre-commit"))) return hostSkip(t, "no real hook was written on this host");
  const after = inspectMandatoryHookReadiness(root);
  assert.equal(after.status, "ready", "a foreign pre-push never blocks readiness");
  assert.equal(nonGatingStatus(after)["pre-push-hook"], "foreign-owner");
  assert.equal(readFileSync(hookFile("pre-push"), "utf8"), FOREIGN, "never overwritten");
  // Ready path with a foreign pre-push: the installer seam is never consulted.
  assert.equal(applyMandatoryHookReadiness(root, { applyPrePush: mustNotRun("applyPrePush") }).status, "ready");
}));

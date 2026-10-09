// SPDX-License-Identifier: SUL-1.0
/**
 * HOOKREFRESH-T6-20261009 (Ruling 84, finding F1) -- RED pins for PARTIAL provisioning of the two mandatory hooks.
 *
 * The defect (older than HOOKREFRESH): `assessMandatoryHookReadiness` maps `refresh` to `current` and then classifies
 * `current + install` as `blocked / HOOK-READINESS-STATE-UNSUPPORTED`, and the coordinator `applyMandatoryHookReadiness`
 * is all-or-nothing (it refuses any non-`install` entry with HOOK-READINESS-PLAN-DRIFT). "One mandatory hook installed
 * and current, the other missing" is therefore a dead end, with or without staleness.
 *
 * Ruling 84 F1: `current + install` (no foreign, decline or unresolved entry) is `provisioning-required`; the
 * coordinator installs ONLY the `install` entries and its rollback removes only what THIS call installed; the
 * stale+missing mix therefore goes provisioning first, then refresh -- two typed hops, each `expected` reachable.
 *
 * Reading guide: cases labelled RED fail today on the stated Ruling 84 reason (the reason is in the failing assertion's
 * message). Cases labelled GREEN pass today and bound the fix: the widening must not leak to foreign/decline/unresolved
 * entries, and the stale-hook fixture technique used by the two-hop case is itself proven here.
 *
 * Fixture technique for a stale hook: install the pre-commit hook for real, then rewrite its install marker's
 * `pluginLibDir` to a value that is neither the current plugin lib nor a runtime snapshot path; the installer's own
 * currentness read (`assessHookCurrentness`) then reports `updateRequired`, which projects to `refresh`.
 * All writes stay inside a throw-away repository (hooksPath pinned inside its .git).
 *
 * Existing case NOT touched and affected by the fix: clone-hook-readiness.rollback.test.mjs "an already-installed
 * pre-commit hook of ours is never removed when commit-msg is the missing one" (CHRB007) pins the OLD behaviour for
 * this exact shape (`status === "refused"`, `applyCommitMsg` must not run). It goes red when the fix lands; see the
 * T6 report -- it needs a test-only re-point slice (QG-04).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyMandatoryHookGate, assessMandatoryHookReadiness, checkCloneProvisioning } from "./check-clone-provisioning.mjs";
import { applyMandatoryHookReadiness, inspectMandatoryHookReadiness } from "./clone-hook-readiness.mjs";
import { applyInstall as installPreCommit } from "./pre-commit-hook-install.mjs";
import { applyInstall as installCommitMsg } from "./commit-msg-hook-install.mjs";
import { refreshMandatoryHooks } from "./refresh-mandatory-hooks.mjs";

const AMBIENT_GIT_VARIABLES = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
const COORDINATOR_EXPECTED = Object.freeze({ schema: "pipeline.mandatory-hook-readiness.v1", status: "ready" });
const REFRESH_EXPECTED = Object.freeze({ schema: "pipeline.mandatory-hook-refresh.v1", status: "ready" });
const STALE_PLUGIN_LIB = "stale-older-plugin-snapshot/lib";

const mustNotRun = (what) => () => { throw new Error(`${what} must not run`); };

function withRepository(run) {
  const root = mkdtempSync(join(tmpdir(), "clone-hook-readiness-partial-"));
  const previous = new Map(AMBIENT_GIT_VARIABLES.map((name) => [name, process.env[name]]));
  try {
    for (const name of AMBIENT_GIT_VARIABLES) delete process.env[name];
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    const gitDir = join(realpathSync.native(root), ".git");
    execFileSync("git", ["-C", root, "config", "--local", "core.hooksPath", join(gitDir, "hooks").replaceAll("\\", "/")], { stdio: "ignore" });
    return run({ root, gitDir, hookFile: (name) => join(gitDir, "hooks", name) });
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

const statuses = (readiness) => Object.fromEntries(readiness.required.map((entry) => [entry.id, entry.status]));
const hooks = (preCommit, commitMsg) => ({
  checks: [
    { id: "pre-commit-hook", status: preCommit, path: "fixture hook", repairAction: null },
    { id: "commit-msg-hook", status: commitMsg, path: "fixture hook", repairAction: null },
  ],
});

/** Make the really-installed pre-commit hook read as stale (`refresh`); returns the marker path. */
function makeStale(gitDir) {
  const markerFile = join(gitDir, "agent-pipeline", "pre-commit-hook", "install-marker.json");
  const marker = JSON.parse(readFileSync(markerFile, "utf8"));
  marker.pluginLibDir = STALE_PLUGIN_LIB;
  writeFileSync(markerFile, `${JSON.stringify(marker, null, 2)}\n`);
  return markerFile;
}

// ---------------------------------------------------------------------------------------------------------------
// Pure assessment
// ---------------------------------------------------------------------------------------------------------------

test("RED F1 (a): current+install and refresh+install, in either order, read provisioning-required (today: blocked / HOOK-READINESS-STATE-UNSUPPORTED)", () => {
  for (const [preCommit, commitMsg] of [["current", "install"], ["install", "current"], ["refresh", "install"], ["install", "refresh"]]) {
    const readiness = assessMandatoryHookReadiness(hooks(preCommit, commitMsg));
    const label = `${preCommit}+${commitMsg}`;
    assert.equal(readiness.status, "provisioning-required",
      `${label}: Ruling 84 F1 -- a partly provisioned pair with no foreign/decline/unresolved entry is provisioning-required, not a dead end`);
    assert.equal(readiness.code, "HOOK-READINESS-INSTALL-REQUIRED", label);
    assert.equal(applyMandatoryHookGate("ready", readiness), "hook-provisioning-required", label);
  }
});

test("GREEN control F1 (b): the widening does not leak -- foreign, decline and unresolved entries still block or stay unresolved", () => {
  const cases = [
    [["foreign-owner", "install"], "blocked", "HOOK-READINESS-OWNER-OR-DECLINE"],
    [["install", "foreign-owner"], "blocked", "HOOK-READINESS-OWNER-OR-DECLINE"],
    [["decline", "install"], "blocked", "HOOK-READINESS-OWNER-OR-DECLINE"],
    [["install", "decline"], "blocked", "HOOK-READINESS-OWNER-OR-DECLINE"],
    [["unresolved", "install"], "unresolved", "HOOK-READINESS-REPOSITORY-UNRESOLVED"],
    [["install", "unresolved"], "unresolved", "HOOK-READINESS-REPOSITORY-UNRESOLVED"],
    [["install", "install"], "provisioning-required", "HOOK-READINESS-INSTALL-REQUIRED"],
    [["current", "current"], "ready", null],
    [["refresh", "current"], "ready", null],
  ];
  for (const [[preCommit, commitMsg], status, code] of cases) {
    const readiness = assessMandatoryHookReadiness(hooks(preCommit, commitMsg));
    assert.equal(readiness.status, status, `${preCommit}+${commitMsg}`);
    assert.equal(readiness.code, code, `${preCommit}+${commitMsg}`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Real repository: inspect, apply, rollback
// ---------------------------------------------------------------------------------------------------------------

test("RED F1 (c): a really installed pre-commit hook beside a missing commit-msg hook inspects as provisioning-required with the coordinator action", () => withRepository(({ root }) => {
  assert.equal(installPreCommit({ rootDir: root }).status, "installed");
  const observed = inspectMandatoryHookReadiness(root);
  assert.deepEqual(statuses(observed), { "pre-commit-hook": "current", "commit-msg-hook": "install" }, "precondition: the fixture is the partial state");
  assert.equal(observed.status, "provisioning-required", "Ruling 84 F1: current+install must offer provisioning, not block");
  assert.equal(observed.code, "HOOK-READINESS-INSTALL-REQUIRED");
  assert.equal(observed.nextAction?.mutation, true);
  assert.equal(observed.nextAction?.requiresConfirmation, true);
  assert.ok(observed.nextAction?.argv.includes("--apply"));
  assert.deepEqual(observed.nextAction?.expected, COORDINATOR_EXPECTED);
}));

test("RED F1 (d): apply installs ONLY the install entry (commit-msg); the current pre-commit hook and its marker stay byte-identical", () => withRepository(({ root, gitDir, hookFile }) => {
  assert.equal(installPreCommit({ rootDir: root }).status, "installed");
  const markerFile = join(gitDir, "agent-pipeline", "pre-commit-hook", "install-marker.json");
  const hookBefore = readFileSync(hookFile("pre-commit"), "utf8");
  const markerBefore = readFileSync(markerFile, "utf8");
  const result = applyMandatoryHookReadiness(root, {
    applyPreCommit: mustNotRun("applyPreCommit"),
    removePreCommit: mustNotRun("removePreCommit"),
  });
  assert.equal(result.status, "ready",
    "Ruling 84 F1: today the coordinator refuses (HOOK-READINESS-PLAN-DRIFT / not provisioning-required) and installs nothing");
  assert.equal(existsSync(hookFile("commit-msg")), true, "the missing commit-msg hook was installed");
  assert.equal(readFileSync(hookFile("pre-commit"), "utf8"), hookBefore, "the current hook is byte-identical");
  assert.equal(readFileSync(markerFile, "utf8"), markerBefore, "the current hook's install marker is byte-identical");
  assert.deepEqual(statuses(inspectMandatoryHookReadiness(root)), { "pre-commit-hook": "current", "commit-msg-hook": "current" });
}));

test("RED F1 (e): mirror -- a really installed commit-msg hook beside a missing pre-commit hook: only pre-commit is installed", () => withRepository(({ root, hookFile }) => {
  assert.equal(installCommitMsg({ rootDir: root }).status, "installed");
  const hookBefore = readFileSync(hookFile("commit-msg"), "utf8");
  const result = applyMandatoryHookReadiness(root, { applyCommitMsg: mustNotRun("applyCommitMsg") });
  assert.equal(result.status, "ready", "Ruling 84 F1: today the coordinator refuses and installs nothing");
  assert.equal(existsSync(hookFile("pre-commit")), true, "the missing pre-commit hook was installed");
  assert.equal(readFileSync(hookFile("commit-msg"), "utf8"), hookBefore, "the current commit-msg hook is byte-identical");
}));

test("RED F1 (f): rollback removes only what THIS call installed -- a pre-existing current pre-commit hook survives a failing commit-msg install", () => withRepository(({ root, hookFile }) => {
  assert.equal(installPreCommit({ rootDir: root }).status, "installed");
  const hookBefore = readFileSync(hookFile("pre-commit"), "utf8");
  const fault = Object.assign(new Error("simulated commit-msg install fault"), { code: "SIMULATED-INSTALL-FAULT" });
  let commitMsgCalls = 0;
  let outcome;
  try {
    outcome = {
      returned: applyMandatoryHookReadiness(root, {
        applyPreCommit: mustNotRun("applyPreCommit"),
        removePreCommit: mustNotRun("removePreCommit"),
        applyCommitMsg() { commitMsgCalls += 1; throw fault; },
      }),
    };
  } catch (error) {
    outcome = { error };
  }
  assert.equal(commitMsgCalls, 1,
    `Ruling 84 F1: today the coordinator returns ${JSON.stringify(outcome.returned?.status)} without ever trying the missing commit-msg install`);
  assert.ok(outcome.error, "a failing install is a typed error");
  assert.equal(outcome.error.code, "HOOK-READINESS-APPLY-FAILED", "pre-commit was not installed by this call, so nothing is rolled back");
  assert.equal(outcome.error.cause, fault);
  assert.equal(outcome.error.rollback?.status, "not-needed");
  assert.equal(existsSync(hookFile("pre-commit")), true, "the pre-existing hook was not removed");
  assert.equal(readFileSync(hookFile("pre-commit"), "utf8"), hookBefore);
}));

// ---------------------------------------------------------------------------------------------------------------
// Two hops, real repository: stale pre-commit + missing commit-msg
// ---------------------------------------------------------------------------------------------------------------

test("RED F1 (g): stale pre-commit + missing commit-msg -> provisioning hop, then refresh hop, each `expected` reached", () => withRepository(({ root, gitDir }) => {
  assert.equal(installPreCommit({ rootDir: root }).status, "installed");
  const markerFile = makeStale(gitDir);
  const staleMarker = readFileSync(markerFile, "utf8");
  const first = inspectMandatoryHookReadiness(root);
  assert.deepEqual(statuses(first), { "pre-commit-hook": "refresh", "commit-msg-hook": "install" }, "precondition: stale beside missing");

  // Hop 1: provisioning. Its own `expected` must be reached by running that very action.
  assert.equal(first.status, "provisioning-required",
    "Ruling 84 F1: the stale+missing mix is provisioning-required (today blocked / HOOK-READINESS-STATE-UNSUPPORTED)");
  assert.deepEqual(first.nextAction?.expected, COORDINATOR_EXPECTED);
  const provisioned = applyMandatoryHookReadiness(root);
  assert.equal(provisioned.schema, COORDINATOR_EXPECTED.schema);
  assert.equal(provisioned.status, COORDINATOR_EXPECTED.status);
  assert.equal(readFileSync(markerFile, "utf8"), staleMarker, "hop 1 must not refresh the stale hook (that is hop 2's job)");

  // Hop 2: ready, with the stale hook listed for refresh.
  const between = assessMandatoryHookReadiness(checkCloneProvisioning(root));
  assert.equal(between.status, "ready");
  assert.deepEqual(between.refreshAvailable, ["pre-commit-hook"]);
  const refreshed = refreshMandatoryHooks(root);
  assert.equal(refreshed.schema, REFRESH_EXPECTED.schema);
  assert.equal(refreshed.status, REFRESH_EXPECTED.status);
  assert.deepEqual(refreshed.results.find((entry) => entry.id === "pre-commit-hook"), { id: "pre-commit-hook", status: "refreshed" });

  // Hop 3: nothing left to do.
  const done = assessMandatoryHookReadiness(checkCloneProvisioning(root));
  assert.equal(done.status, "ready");
  assert.equal(done.refreshAvailable, undefined);
  assert.notEqual(readFileSync(markerFile, "utf8"), staleMarker, "the refresh rebound the marker to the current plugin");
}));

test("GREEN control F1 (h): the stale-marker fixture technique -- stale pre-commit beside a current commit-msg is ready+refreshAvailable and the helper reaches ready", () => withRepository(({ root, gitDir }) => {
  assert.equal(installPreCommit({ rootDir: root }).status, "installed");
  assert.equal(installCommitMsg({ rootDir: root }).status, "installed");
  const markerFile = makeStale(gitDir);
  const staleMarker = readFileSync(markerFile, "utf8");
  assert.deepEqual(statuses(inspectMandatoryHookReadiness(root)), { "pre-commit-hook": "refresh", "commit-msg-hook": "current" });
  const before = assessMandatoryHookReadiness(checkCloneProvisioning(root));
  assert.equal(before.status, "ready");
  assert.deepEqual(before.refreshAvailable, ["pre-commit-hook"]);
  const refreshed = refreshMandatoryHooks(root);
  assert.equal(refreshed.status, REFRESH_EXPECTED.status);
  assert.equal(refreshed.schema, REFRESH_EXPECTED.schema);
  assert.notEqual(readFileSync(markerFile, "utf8"), staleMarker);
  assert.equal(assessMandatoryHookReadiness(checkCloneProvisioning(root)).refreshAvailable, undefined);
}));

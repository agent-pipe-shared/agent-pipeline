// SPDX-License-Identifier: SUL-1.0
/**
 * HOOKREFRESH-T6-20261009 (Ruling 84, finding F3) -- pins for scripts/refresh-mandatory-hooks.mjs.
 *
 * No test imported this module before (Critic HOOKREFRESH F3). Every case below describes behaviour the helper
 * ALREADY has (committed in HOOKREFRESH-F1d), so every case is expected GREEN today; these are characterization
 * pins that keep the fix dispatch (HOOKREFRESH-F2) from regressing the refresh helper. None of them is RED.
 *
 * The behaviour is driven through the helper's own `dependencies` seams (`plans`, `applies`,
 * `checkCloneProvisioning`), so no real hook is ever written, plus one real-fixture load in a throw-away repository.
 *
 * Reading guide: loading this file is itself a pin -- a missing `applyInstall` named export in any of the three
 * installer modules is a link-time SyntaxError for the helper (Ruling 70 R5), which fails the whole file here.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MANDATORY_HOOK_REFRESH_SCHEMA, main, refreshMandatoryHooks } from "./refresh-mandatory-hooks.mjs";

const PRE_COMMIT = "pre-commit-hook";
const COMMIT_MSG = "commit-msg-hook";
const PRE_PUSH = "pre-push-hook";
const ALL = [PRE_COMMIT, COMMIT_MSG, PRE_PUSH];
const UPGRADE = Object.freeze({ status: "ready-to-upgrade", updateRequired: true });

/** A clone-provisioning report carrying only the two mandatory hook checks the readiness assessment reads. */
function report(preCommit = "current", commitMsg = "current") {
  return {
    checks: [
      { id: PRE_COMMIT, status: preCommit, path: "fixture hook pre-commit", repairAction: null },
      { id: COMMIT_MSG, status: commitMsg, path: "fixture hook commit-msg", repairAction: null },
    ],
  };
}

/** Every `dependencies` seam of the helper, for all three hooks, with call recording. */
function seams({ plans = {}, applies = {}, provisioning = report() } = {}) {
  const applyCalls = [];
  const dependencies = { plans: {}, applies: {}, checkCloneProvisioning: () => provisioning };
  for (const id of ALL) {
    dependencies.plans[id] = () => plans[id] ?? { status: "ready" };
    dependencies.applies[id] = () => {
      applyCalls.push(id);
      return (applies[id] ?? (() => ({ status: "upgraded" })))();
    };
  }
  return { dependencies, applyCalls };
}

test("GREEN (existing behaviour): only ready-to-upgrade AND updateRequired === true is applied", () => {
  const { dependencies, applyCalls } = seams({
    plans: {
      [PRE_COMMIT]: UPGRADE,
      [COMMIT_MSG]: { status: "ready-to-upgrade", updateRequired: false },
      [PRE_PUSH]: { status: "ready-to-upgrade" },
    },
  });
  const result = refreshMandatoryHooks("/repo", dependencies);
  assert.deepEqual(applyCalls, [PRE_COMMIT], "only the stale hook may be applied");
  assert.deepEqual(result.results, [
    { id: PRE_COMMIT, status: "refreshed" },
    { id: COMMIT_MSG, status: "current" },
    { id: PRE_PUSH, status: "current" },
  ]);
  assert.equal(result.schema, MANDATORY_HOOK_REFRESH_SCHEMA);
  assert.equal(result.schema, "pipeline.mandatory-hook-refresh.v1");
  assert.equal(result.status, "ready");
});

test("GREEN (existing behaviour): an installer `installed` result also counts as refreshed", () => {
  const { dependencies } = seams({
    plans: { [PRE_COMMIT]: UPGRADE },
    applies: { [PRE_COMMIT]: () => ({ status: "installed" }) },
  });
  assert.deepEqual(refreshMandatoryHooks("/repo", dependencies).results[0], { id: PRE_COMMIT, status: "refreshed" });
});

test("GREEN (existing behaviour): `ready` (absent), `declined`, foreign and every other plan status is skipped and its apply is never called", () => {
  for (const planStatus of [
    "ready",
    "declined",
    "foreign-hook-present",
    "modified-or-unreadable-managed-install",
    "orphan-managed-file",
    "unreadable-managed-state",
    "repository-unresolved",
  ]) {
    // updateRequired: true is deliberate -- only the ready-to-upgrade plan status may ever lead to an apply.
    const plan = { status: planStatus, updateRequired: true };
    const { dependencies, applyCalls } = seams({ plans: { [PRE_COMMIT]: plan, [COMMIT_MSG]: plan, [PRE_PUSH]: plan } });
    const result = refreshMandatoryHooks("/repo", dependencies);
    assert.deepEqual(applyCalls, [], `${planStatus}: apply must never be called`);
    assert.deepEqual(result.results.map((entry) => entry.status), ALL.map(() => `skipped-${planStatus}`), planStatus);
  }
  const { dependencies, applyCalls } = seams({ plans: { [PRE_COMMIT]: () => undefined } });
  dependencies.plans[PRE_COMMIT] = () => undefined;
  const result = refreshMandatoryHooks("/repo", dependencies);
  assert.deepEqual(applyCalls, []);
  assert.equal(result.results[0].status, "skipped-unknown", "a plan that yields nothing is skipped, not applied");
});

test("GREEN (existing behaviour): one throwing apply never aborts the others; the result status is `failed`", () => {
  const { dependencies, applyCalls } = seams({
    plans: { [PRE_COMMIT]: UPGRADE, [COMMIT_MSG]: UPGRADE, [PRE_PUSH]: UPGRADE },
    applies: {
      [PRE_COMMIT]: () => { throw Object.assign(new Error("simulated apply fault"), { code: "SIM-APPLY-FAULT" }); },
      [PRE_PUSH]: () => { throw new Error("a fault without a code"); },
    },
  });
  const result = refreshMandatoryHooks("/repo", dependencies);
  assert.deepEqual(applyCalls, ALL, "every stale hook is attempted even after an earlier one threw");
  assert.deepEqual(result.results, [
    { id: PRE_COMMIT, status: "failed", code: "SIM-APPLY-FAULT" },
    { id: COMMIT_MSG, status: "refreshed" },
    { id: PRE_PUSH, status: "failed", code: "HOOK-REFRESH-APPLY-FAILED" },
  ]);
  assert.equal(result.status, "failed", "a failed hook wins even when the readback is ready");
});

test("GREEN (existing behaviour): a refused or unrecognisable apply result is a failure, not a silent success", () => {
  const { dependencies } = seams({
    plans: { [PRE_COMMIT]: UPGRADE, [COMMIT_MSG]: UPGRADE },
    applies: { [PRE_COMMIT]: () => ({ status: "refused-foreign-hook" }), [COMMIT_MSG]: () => undefined },
  });
  const result = refreshMandatoryHooks("/repo", dependencies);
  assert.ok(result.results[0].status.startsWith("refused-"), result.results[0].status);
  assert.equal(result.results[1].status, "refused-unknown");
  assert.equal(result.status, "failed");
});

test("GREEN (existing behaviour): the result status is `ready` only when nothing failed AND the mandatory readback is ready, else `pending`", () => {
  const ready = refreshMandatoryHooks("/repo", seams({ plans: { [PRE_COMMIT]: UPGRADE } }).dependencies);
  assert.equal(ready.status, "ready");
  assert.equal(ready.readiness.status, "ready");
  assert.equal(ready.readiness.code, null);
  assert.deepEqual(ready.readiness.required.map((entry) => entry.id), [PRE_COMMIT, COMMIT_MSG]);

  const pending = refreshMandatoryHooks("/repo", seams({ provisioning: report("install", "install") }).dependencies);
  assert.equal(pending.status, "pending", "nothing failed, but a mandatory hook is still missing");
  assert.equal(pending.readiness.status, "provisioning-required");
  assert.equal(pending.readiness.code, "HOOK-READINESS-INSTALL-REQUIRED");

  const failedBeatsPending = refreshMandatoryHooks("/repo", seams({
    plans: { [PRE_COMMIT]: UPGRADE },
    applies: { [PRE_COMMIT]: () => { throw new Error("simulated"); } },
    provisioning: report("install", "install"),
  }).dependencies);
  assert.equal(failedBeatsPending.status, "failed");
});

test("GREEN (existing behaviour): the CLI rejects unknown arguments, prints one JSON line, and exits 0 only when ready", () => {
  const lines = [];
  const io = { log: (line) => lines.push(line) };
  const { dependencies } = seams();
  for (const argv of [["--bogus"], ["--root"], ["--root", "/repo", "--apply"], ["positional"]]) {
    assert.throws(() => main(argv, io, dependencies), (error) => error?.code === "HOOK-REFRESH-CLI", JSON.stringify(argv));
  }
  assert.deepEqual(lines, [], "a rejected invocation prints nothing");

  assert.equal(main(["--root", "/repo"], io, dependencies), 0);
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.schema, "pipeline.mandatory-hook-refresh.v1");
  assert.equal(parsed.status, "ready");

  assert.equal(main(["--root", "/repo"], io, seams({ provisioning: report("install", "install") }).dependencies), 2);
  assert.equal(JSON.parse(lines[1]).status, "pending");
});

const AMBIENT_GIT_VARIABLES = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];

/** A throwaway repository whose hooks directory is pinned INSIDE it, so no machine-level hooksPath can leak a write. */
function withRepository(run) {
  const root = mkdtempSync(join(tmpdir(), "refresh-mandatory-hooks-"));
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

test("GREEN (existing behaviour): real-fixture load -- the module imports and, in a repository with no hooks, applies nothing", async () => {
  const loaded = await import("./refresh-mandatory-hooks.mjs");
  assert.equal(typeof loaded.refreshMandatoryHooks, "function", "the module links (proves the three applyInstall bindings, Ruling 70 R5)");
  assert.equal(typeof loaded.main, "function");
  withRepository(({ root, hookFile }) => {
    const result = refreshMandatoryHooks(root);
    assert.deepEqual(result.results, ALL.map((id) => ({ id, status: "skipped-ready" })),
      "an absent hook is `ready` to install and must be skipped by a refresh");
    assert.equal(result.status, "pending");
    assert.equal(result.readiness.status, "provisioning-required");
    for (const name of ["pre-commit", "commit-msg", "pre-push"]) {
      assert.equal(existsSync(hookFile(name)), false, `${name}: a refresh must never install an absent hook`);
    }
  });
});

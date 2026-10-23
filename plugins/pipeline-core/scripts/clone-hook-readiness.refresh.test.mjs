// SPDX-License-Identifier: SUL-1.0
/**
 * K103 (PO decision 2026-10-23, tiles batch 7 row 10: "the installer refreshes the hook snapshots as part of its apply").
 *
 * The mismatch: `clone-hook-readiness.mjs --apply` (the `hook-provisioning-required` action) installed the missing hook
 * and then stopped, with a stale mandatory hook still stale; the next start preflight reported `hook-refresh-required`
 * and the Elephant had to run `refresh-mandatory-hooks.mjs` as an extra hop. The apply now ends by refreshing the stale
 * hooks through the same routine (`refreshMandatoryHooks`), idempotently, and a failed refresh is a typed, non-ready result.
 *
 * Fixture technique: as in clone-hook-readiness.partial.test.mjs (install for real, rewrite the marker's `pluginLibDir`),
 * on a frozen copy of the plugin root, inside a throw-away repository.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIVE_PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FROZEN_PLUGIN_ROOT = mkdtempSync(join(tmpdir(), "clone-hook-readiness-refresh-plugin-"));
after(() => { rmSync(FROZEN_PLUGIN_ROOT, { recursive: true, force: true, maxRetries: 3 }); });
cpSync(LIVE_PLUGIN_ROOT, FROZEN_PLUGIN_ROOT, { recursive: true });
assert.notEqual(realpathSync.native(FROZEN_PLUGIN_ROOT), realpathSync.native(LIVE_PLUGIN_ROOT), "the plugin copy must not be the live plugin root");
const frozenModule = (name) => import(pathToFileURL(join(FROZEN_PLUGIN_ROOT, "scripts", name)).href);

const { assessMandatoryHookReadiness, checkCloneProvisioning } = await frozenModule("check-clone-provisioning.mjs");
const { applyMandatoryHookReadiness, inspectMandatoryHookReadiness } = await frozenModule("clone-hook-readiness.mjs");
const { applyInstall: installPreCommit } = await frozenModule("pre-commit-hook-install.mjs");
const { applyInstall: installCommitMsg } = await frozenModule("commit-msg-hook-install.mjs");

const AMBIENT_GIT_VARIABLES = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
const STALE_PLUGIN_LIB = "stale-older-plugin-snapshot/lib";

function withRepository(run) {
  const root = mkdtempSync(join(tmpdir(), "clone-hook-readiness-refresh-"));
  const previous = new Map(AMBIENT_GIT_VARIABLES.map((name) => [name, process.env[name]]));
  try {
    for (const name of AMBIENT_GIT_VARIABLES) delete process.env[name];
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    const gitDir = join(realpathSync.native(root), ".git");
    execFileSync("git", ["-C", root, "config", "--local", "core.hooksPath", join(gitDir, "hooks").replaceAll("\\", "/")], { stdio: "ignore" });
    return run({ root, gitDir });
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

/** Make the really-installed pre-commit hook read as stale (`refresh`); returns the marker path. */
function makeStale(gitDir) {
  const markerFile = join(gitDir, "agent-pipeline", "pre-commit-hook", "install-marker.json");
  const marker = JSON.parse(readFileSync(markerFile, "utf8"));
  marker.pluginLibDir = STALE_PLUGIN_LIB;
  writeFileSync(markerFile, `${JSON.stringify(marker, null, 2)}\n`);
  return markerFile;
}

const staleList = (root) => assessMandatoryHookReadiness(checkCloneProvisioning(root)).refreshAvailable;

test("K103 (a): apply installs the missing hook AND refreshes the stale one, so no refresh is left for the next preflight", () => withRepository(({ root, gitDir }) => {
  assert.equal(installPreCommit({ rootDir: root }).status, "installed");
  const markerFile = makeStale(gitDir);
  const staleMarker = readFileSync(markerFile, "utf8");
  assert.equal(inspectMandatoryHookReadiness(root).status, "provisioning-required", "precondition: stale pre-commit beside a missing commit-msg");

  const applied = applyMandatoryHookReadiness(root);
  assert.equal(applied.status, "ready");
  assert.notEqual(readFileSync(markerFile, "utf8"), staleMarker, "the apply rebound the stale hook's marker to the current plugin");
  assert.equal(staleList(root), undefined, "a following preflight sees no stale mandatory hook (it would otherwise be hook-refresh-required)");
  assert.equal(applied.refreshResult?.schema, "pipeline.mandatory-hook-refresh.v1");
  assert.equal(applied.refreshResult?.status, "ready");
  assert.deepEqual(applied.refreshResult?.results.find((entry) => entry.id === "pre-commit-hook"), { id: "pre-commit-hook", status: "refreshed" });
}));

test("K103 (b): apply on an already-ready repository with a stale hook refreshes it, and a second apply is a no-op", () => withRepository(({ root, gitDir }) => {
  assert.equal(installPreCommit({ rootDir: root }).status, "installed");
  assert.equal(installCommitMsg({ rootDir: root }).status, "installed");
  const markerFile = makeStale(gitDir);
  const staleMarker = readFileSync(markerFile, "utf8");
  assert.deepEqual(staleList(root), ["pre-commit-hook"], "precondition: ready, one stale mandatory hook");

  const first = applyMandatoryHookReadiness(root);
  assert.equal(first.status, "ready");
  assert.equal(first.refreshResult?.status, "ready");
  assert.notEqual(readFileSync(markerFile, "utf8"), staleMarker);
  assert.equal(staleList(root), undefined);

  const markerAfterFirst = readFileSync(markerFile, "utf8");
  const second = applyMandatoryHookReadiness(root);
  assert.equal(second.status, "ready");
  assert.equal(second.refreshResult, undefined, "nothing stale: no refresh is run and none is reported");
  assert.equal(readFileSync(markerFile, "utf8"), markerAfterFirst, "idempotent: the refreshed marker is byte-identical after a second apply");
}));

test("K103 (c): a refresh that fails is a typed, non-ready result naming the cause, never a silent ready", () => withRepository(({ root, gitDir }) => {
  assert.equal(installPreCommit({ rootDir: root }).status, "installed");
  assert.equal(installCommitMsg({ rootDir: root }).status, "installed");
  makeStale(gitDir);

  const failed = applyMandatoryHookReadiness(root, {
    refreshMandatoryHooks: () => ({ schema: "pipeline.mandatory-hook-refresh.v1", root, status: "failed", results: [{ id: "pre-commit-hook", status: "failed", code: "HOOK-REFRESH-APPLY-FAILED" }], readiness: { status: "ready" } }),
  });
  assert.equal(failed.status, "refresh-failed");
  assert.equal(failed.code, "HOOK-READINESS-REFRESH-FAILED");
  assert.equal(failed.refreshResult?.status, "failed");
  assert.match(failed.reason ?? "", /refresh-mandatory-hooks\.mjs --root/, "the result names the runnable repair");

  const thrown = applyMandatoryHookReadiness(root, { refreshMandatoryHooks: () => { throw Object.assign(new Error("boom"), { code: "HOOK-REFRESH-PLAN-BOOM" }); } });
  assert.equal(thrown.status, "refresh-failed");
  assert.equal(thrown.code, "HOOK-READINESS-REFRESH-FAILED");
  assert.equal(thrown.refreshResult?.status, "failed");
  assert.equal(thrown.refreshResult?.code, "HOOK-REFRESH-PLAN-BOOM");
}));

test("K103 (d): control -- nothing stale means the refresh routine is never called", () => withRepository(({ root }) => {
  assert.equal(installPreCommit({ rootDir: root }).status, "installed");
  assert.equal(installCommitMsg({ rootDir: root }).status, "installed");
  const applied = applyMandatoryHookReadiness(root, { refreshMandatoryHooks: () => { throw new Error("must not run"); } });
  assert.equal(applied.status, "ready");
  assert.equal(applied.refreshResult, undefined);
}));

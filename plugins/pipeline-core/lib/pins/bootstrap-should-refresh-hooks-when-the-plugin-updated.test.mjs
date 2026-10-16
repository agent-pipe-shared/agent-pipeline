// SPDX-License-Identifier: SUL-1.0
/**
 * ALF-C-P19-03 / AC-117 -- regression pin for backlog item
 * pipeline.bootstrap-should-refresh-hooks-when-the-plugin-updated.
 *
 * Original acceptance (Description / Proposal / "Recurrence 2026-10-08 (late)" sharpened proposal):
 *   P1  bootstrap detects that the plugin updated (an installed hook rendered from an older plugin snapshot)
 *   P2  and the AGENT refreshes the hooks itself: the Elephant's preflight is non-ready with ONE typed refresh
 *       action covering all stale hooks (enforcement, not advice); Goldfish/Critic stay unaffected
 *   P3  an agent-operable install route exists: refresh-mandatory-hooks.mjs really upgrades stale managed hooks,
 *       reads back "ready", and never installs missing / touches foreign, tampered or declined hooks
 *   P4  the preflight runs the model-role bootstrap and returns it as a required readback field (`unavailable`
 *       is legal, absent is not)
 *   P5  one pin per point -- this file; each case below is tied to its point and is shown able to fail (RED
 *       mutants of a scratch mirror of the production module, never an in-place edit).
 *
 * Fixtures live under the repository's scratch/ (never the OS temp dir). The preflight is driven through its
 * documented injection seams; the hook installers, projection and refresh script run for real against scratch
 * git repositories. Directory-mode and directory-symlink cases are not needed for this item.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";

import { observePipelineStartPreflight, pipelineStartPreflightExitCode } from "../../scripts/pipeline-start-preflight.mjs";
import { refreshMandatoryHooks } from "../../scripts/refresh-mandatory-hooks.mjs";
import * as preCommit from "../../scripts/pre-commit-hook-install.mjs";
import * as commitMsg from "../../scripts/commit-msg-hook-install.mjs";
import { inspectGitHookSourceSnapshot } from "../git-hook-runtime-snapshot.mjs";
import { checkCloneProvisioning } from "../../scripts/check-clone-provisioning.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const scriptsDir = resolve(here, "..", "..", "scripts");
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const work = mkdtempSync(join(scratchBase, "bshr-pin-"));
after(() => rmSync(work, { recursive: true, force: true }));

let counter = 0;
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const AMBIENT = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !AMBIENT.includes(k.toUpperCase())));
function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: cleanEnv() });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

// ---- real-repo fixtures (installers run for real) -------------------------------------------------------------
function freshRepo(label) {
  const dir = join(work, `${label}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "--local", "core.hooksPath", join(realpathSync.native(dir), ".git", "hooks").replaceAll("\\", "/"));
  return dir;
}
function fixtureLib(label) {
  const root = join(work, `plugin-${label}-${++counter}`);
  mkdirSync(join(root, "lib"), { recursive: true });
  writeFileSync(join(root, "protected-baseline.json"), "{}\n");
  writeFileSync(join(root, "lib", "governance-scope.mjs"), `export const fixture = ${JSON.stringify(label)};\n`);
  return join(root, "lib");
}
const digestOf = (lib) => inspectGitHookSourceSnapshot({ pluginLibDir: lib }).manifestSha256;
function paths(dir, name) {
  const commonDir = git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const state = join(commonDir, "agent-pipeline", `${name}-hook`);
  return {
    hookPath: git(dir, "rev-parse", "--path-format=absolute", "--git-path", `hooks/${name}`),
    state, implPath: join(state, "impl.mjs"), markerPath: join(state, "install-marker.json"),
  };
}
/** A managed hook exactly as the installer's own planInstall accepts it, recorded against `recordedLib`. */
function installManaged(mod, name, dir, recordedLib) {
  const p = paths(dir, name);
  const shim = `#!/bin/sh\n# fixture shim (${name})\n`;
  const impl = `// fixture implementation (${name})\n`;
  mkdirSync(dirname(p.hookPath), { recursive: true });
  mkdirSync(p.state, { recursive: true });
  writeFileSync(p.hookPath, shim);
  writeFileSync(p.implPath, impl);
  writeFileSync(p.markerPath, `${JSON.stringify({
    schema: mod.MARKER_SCHEMA, installerVersion: mod.INSTALLER_VERSION, installedAt: "2026-01-01T00:00:00.000Z",
    hookPath: p.hookPath, implPath: p.implPath, pluginLibDir: recordedLib, hookSha256: sha256(shim), implSha256: sha256(impl),
  }, null, 2)}\n`);
  return p;
}
const staleAgainst = (dir, name, mod, newLib) =>
  installManaged(mod, name, dir, join(paths(dir, name).state, `runtime-${digestOf(fixtureLib("old"))}`, "lib"));

// ---- preflight harness (documented injection seams, as the adjacent enforcement suite) -----------------------
const manifest = JSON.stringify({ version: "0.4.5+test" });
const pluginList = () => JSON.stringify({
  installed: [{ pluginId: "pipeline-core@agent-pipeline", name: "pipeline-core", marketplaceName: "agent-pipeline", version: "0.4.5+test",
    installed: true, enabled: true, source: { source: "local", path: "/cache/agent-pipeline/plugins/pipeline-core" },
    marketplaceSource: { sourceType: "git", source: "https://github.com/agent-pipe-shared/agent-pipeline.git" } }],
  available: [],
});
const PRE_COMMIT = "pre-commit-hook", COMMIT_MSG = "commit-msg-hook", PRE_PUSH = "pre-push-hook";
const provisioning = ({ preCommit: pc = "current", commitMsg: cm = "current", prePush: pp = "current" } = {}) => {
  const checks = [[PRE_COMMIT, pc], [COMMIT_MSG, cm], [PRE_PUSH, pp]].map(([id, status]) => ({
    id, status, path: join(work, ".git", "hooks", id), repairAction: status === "current" ? null : `node plugins/pipeline-core/scripts/${id}-install.mjs --install`,
  }));
  checks.push({ id: "po-profile-receipt", status: "present", path: join(work, "r.json"), repairAction: null });
  checks.push({ id: "private-state-directory", status: "present", path: join(work, ".git", "agent-pipeline"), repairAction: null });
  const refreshAvailable = checks.filter((c) => c.status === "refresh").map((c) => c.id);
  const usable = (c) => ["present", "current", "refresh"].includes(c.status);
  return { schema: "pipeline.clone-provisioning-report.v1", status: checks.every(usable) ? "ready" : "provisioning-required", checks, ...(refreshAvailable.length ? { refreshAvailable } : {}) };
};
const modelReady = { ok: true, code: "MODEL-ROLE-BOOTSTRAP-READY", status: "ready" };
const modelUnavailable = { ok: false, code: "MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE", status: "unavailable" };

async function runWith(observe, { role, hooks, modelRole = modelReady, provisioningFn } = {}) {
  const calls = [];
  const result = await observe({
    env: {}, pluginList: pluginList(), read: () => manifest, cwd: work,
    checkCloneProvisioningFn: provisioningFn ?? (() => provisioning(hooks)),
    observeGovernanceScopeFn: ({ rootDir }) => ({ schema: "pipeline.governance-scope.v1", state: "active", root: rootDir, scopeKey: "a".repeat(64), repositoryKind: "git", provenance: { kind: "isolated-unit-capability", refs: [] }, diagnostics: [], requiresEnforcement: true, hintAllowed: false }),
    observeAntigravityLoadedTopologyFn: ({ loadedPluginRoot }) => ({ schema: "pipeline.antigravity-loaded-topology.v1", status: "current", loadedKind: "direct", loadedPluginRoot, executingGuardAssurance: "not-established-by-topology" }),
    observe: () => ({ schema: "pipeline.public-core-observation.v1", status: "ready", candidate: { repository: "https://github.com/agent-pipe-shared/agent-pipeline.git", branch: "main", commit: "a".repeat(40), tree: "b".repeat(40) }, plugin: { name: "pipeline-core", version: "0.4.5+test", manifestSha256: "c".repeat(64), contentSha256: "d".repeat(64) } }),
    inspectEffectiveArchitectureDecisionsFn: () => ({ schema: "pipeline.architecture-effective-decisions.v1", area: "project", status: "advisory", code: "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING", projectionSha256: "a".repeat(64), decisions: [], activeExceptions: [], findings: [] }),
    requireProjectOnboardingReadyFn: () => {},
    runModelRoleBootstrapFn: async (args) => { calls.push(args); if (modelRole instanceof Error) throw modelRole; return modelRole; },
    ...(role === undefined ? {} : { role }),
  });
  return { result, calls };
}
const run = (opts) => runWith(observePipelineStartPreflight, opts);

// ---- the contract assertions, reusable against production and against RED mutants ------------------------------
function assertStaleHookEnforced(result, expectedCovered) {
  assert.notEqual(result.status, "ready", "a stale mandatory hook must make the Elephant's preflight non-ready");
  assert.equal(result.status, "hook-refresh-required");
  assert.notEqual(pipelineStartPreflightExitCode(result), 0);
  const a = result.nextAction;
  assert.equal(a?.kind, "command");
  assert.equal(a.mutation, true);
  assert.equal(basename(a.argv[0]), "refresh-mandatory-hooks.mjs");
  assert.ok(a.argv.includes("--root"));
  assert.deepEqual(a.expected, { schema: "pipeline.mandatory-hook-refresh.v1", status: "ready" });
  assert.deepEqual([...a.refreshes].sort(), expectedCovered);
}

// ===== P1 + P2 : detection and enforcement in the preflight ====================================================
test("P1/P2: Elephant, all hooks stale after a plugin update -> hook-refresh-required, ONE action covers all", async () => {
  const base = await run({ role: "elephant", hooks: {} });
  assert.equal(base.result.status, "ready", "precondition: current hooks are ready");
  const { result } = await run({ role: "elephant", hooks: { preCommit: "refresh", commitMsg: "refresh", prePush: "refresh" } });
  assert.deepEqual(result.mandatoryHookReadiness.refreshAvailable, [PRE_COMMIT, COMMIT_MSG]);
  assertStaleHookEnforced(result, [COMMIT_MSG, PRE_COMMIT, PRE_PUSH]);
});

test("P1/P2: a single stale mandatory hook is covered alone; an absent role is the Elephant", async () => {
  for (const role of ["elephant", undefined]) {
    const { result } = await run({ role, hooks: { commitMsg: "refresh" } });
    assertStaleHookEnforced(result, [COMMIT_MSG]);
  }
});

test("P2 control: Goldfish and Critic are unaffected; advisory pre-push alone stays ready", async () => {
  for (const role of ["goldfish", "critic"]) {
    const base = await run({ role, hooks: {} });
    const { result } = await run({ role, hooks: { preCommit: "refresh", commitMsg: "refresh" } });
    assert.equal(result.status, "ready");
    assert.equal(pipelineStartPreflightExitCode(result), 0);
    assert.deepEqual(result.nextAction, base.result.nextAction);
  }
  const { result } = await run({ role: "elephant", hooks: { prePush: "refresh" } });
  assert.equal(result.status, "ready");
});

test("P2: stale hook beside a missing one goes provisioning first, then refresh, then ready (two-hop, no dead end)", async () => {
  const first = (await run({ role: "elephant", hooks: { preCommit: "refresh", commitMsg: "install" } })).result;
  assert.equal(first.status, "hook-provisioning-required");
  assert.equal(basename(first.nextAction.argv[0]), "clone-hook-readiness.mjs");
  const second = (await run({ role: "elephant", hooks: { preCommit: "refresh" } })).result;
  assertStaleHookEnforced(second, [PRE_COMMIT]);
  const third = (await run({ role: "elephant", hooks: {} })).result;
  assert.equal(third.status, "ready");
  assert.equal(pipelineStartPreflightExitCode(third), 0);
});

test("P1/P2 end-to-end: a really stale scratch repo (real installers + real projection) drives the real preflight to refresh", async () => {
  const dir = freshRepo("e2e");
  const newLib = fixtureLib("new");
  staleAgainst(dir, "pre-commit", preCommit, newLib);
  staleAgainst(dir, "commit-msg", commitMsg, newLib);
  // real projection of the real installers' plans against the "loaded" plugin tree newLib
  const real = (root) => {
    const rep = checkCloneProvisioning(root, { pluginLibDir: newLib });
    return rep;
  };
  const probe = real(dir);
  const ids = probe.checks.filter((c) => c.status === "refresh").map((c) => c.id).sort();
  assert.ok(ids.includes(PRE_COMMIT) && ids.includes(COMMIT_MSG),
    `precondition: real projection reads both hooks as refresh, got ${JSON.stringify(probe.checks.map((c) => [c.id, c.status]))}`);
  const { result } = await run({ role: "elephant", provisioningFn: () => probe });
  assert.equal(result.status, "hook-refresh-required");
  assert.ok(result.nextAction.refreshes.includes(PRE_COMMIT) && result.nextAction.refreshes.includes(COMMIT_MSG));
});

// ===== P3 : agent-operable refresh route =========================================================================
// Host limitation (PO decision K7): on native Windows the real hook apply is refused with PB-WINDOWS-ASSURANCE
// (private-directory hardening is unavailable), so a real apply cannot be observed here. Cases that need it are
// skipped with a typed reason; the Linux/WSL run closes them. Owner: Coordinator, due 2026-10-19.
const HOST_LIMITATION = "host-limitation PB-WINDOWS-ASSURANCE: real hook apply needs private-directory hardening, unavailable on native Windows; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)";
const realApplyBlockedByHost = (result) => result.results.some((r) => r.code === "PB-WINDOWS-ASSURANCE");

test("P3 (seam): real plans select exactly the stale managed hooks for apply; readback gates ready", () => {
  const dir = freshRepo("refresh-seam");
  staleAgainst(dir, "pre-commit", preCommit, null);
  staleAgainst(dir, "commit-msg", commitMsg, null);
  const applied = [];
  const spy = (id) => () => { applied.push(id); return { status: "upgraded" }; };
  const result = refreshMandatoryHooks(dir, {
    applies: { [PRE_COMMIT]: spy(PRE_COMMIT), [COMMIT_MSG]: spy(COMMIT_MSG), [PRE_PUSH]: spy(PRE_PUSH) },
    checkCloneProvisioning: () => provisioning({}),
  });
  assert.deepEqual(applied.sort(), [COMMIT_MSG, PRE_COMMIT], "only the stale managed hooks are applied (pre-push is absent, never installed)");
  const byId = Object.fromEntries(result.results.map((r) => [r.id, r.status]));
  assert.equal(byId[PRE_COMMIT], "refreshed");
  assert.equal(byId[COMMIT_MSG], "refreshed");
  assert.notEqual(byId[PRE_PUSH], "refreshed");
  assert.equal(result.status, "ready");
  const failing = refreshMandatoryHooks(dir, { applies: { [PRE_COMMIT]: () => { throw Object.assign(new Error("x"), { code: "BOOM" }); } }, checkCloneProvisioning: () => provisioning({}) });
  assert.equal(failing.status, "failed", "one failing hook is reported, not swallowed");
});

test("P3: refresh-mandatory-hooks really upgrades stale managed hooks and reads back ready; second run is a no-op", (t) => {
  const dir = freshRepo("refresh");
  const pcBefore = staleAgainst(dir, "pre-commit", preCommit, null);
  const cmBefore = staleAgainst(dir, "commit-msg", commitMsg, null);
  const markerBefore = [readFileSync(pcBefore.markerPath, "utf8"), readFileSync(cmBefore.markerPath, "utf8")];
  const result = refreshMandatoryHooks(dir);
  if (realApplyBlockedByHost(result)) { t.skip(HOST_LIMITATION); return; }
  assert.equal(result.schema, "pipeline.mandatory-hook-refresh.v1");
  const byId = Object.fromEntries(result.results.map((r) => [r.id, r.status]));
  assert.equal(byId[PRE_COMMIT], "refreshed", JSON.stringify(result));
  assert.equal(byId[COMMIT_MSG], "refreshed", JSON.stringify(result));
  assert.equal(result.status, "ready");
  assert.equal(result.readiness.status, "ready");
  assert.notEqual(readFileSync(pcBefore.markerPath, "utf8"), markerBefore[0], "the marker must be rewritten against the loaded plugin");
  assert.notEqual(readFileSync(cmBefore.markerPath, "utf8"), markerBefore[1]);
  const again = refreshMandatoryHooks(dir);
  assert.equal(again.status, "ready");
  assert.equal(again.results.find((r) => r.id === PRE_COMMIT).status, "current");
  assert.equal(again.results.find((r) => r.id === COMMIT_MSG).status, "current");
});

test("P3: refresh never installs a missing hook and never touches a foreign, tampered or declined one", () => {
  const dir = freshRepo("safety");
  const missing = paths(dir, "pre-commit");
  const foreign = paths(dir, "commit-msg");
  mkdirSync(dirname(foreign.hookPath), { recursive: true });
  writeFileSync(foreign.hookPath, "#!/bin/sh\necho human hook\n");
  const result = refreshMandatoryHooks(dir);
  assert.equal(existsSync(missing.hookPath), false, "a missing hook must not be created by a refresh");
  assert.equal(readFileSync(foreign.hookPath, "utf8"), "#!/bin/sh\necho human hook\n");
  assert.notEqual(result.status, "ready");
  assert.ok(result.results.every((r) => r.status !== "refreshed"), JSON.stringify(result));

  const tampered = freshRepo("tamper");
  const t = staleAgainst(tampered, "pre-commit", preCommit, null);
  writeFileSync(t.hookPath, "#!/bin/sh\necho tampered\n");
  const tr = refreshMandatoryHooks(tampered);
  assert.equal(readFileSync(t.hookPath, "utf8"), "#!/bin/sh\necho tampered\n");
  assert.notEqual(tr.results.find((r) => r.id === PRE_COMMIT).status, "refreshed");
});

test("P3: the CLI entry prints one JSON line and exits 0 only on ready (real process)", (t) => {
  const dir = freshRepo("cli");
  staleAgainst(dir, "pre-commit", preCommit, null);
  staleAgainst(dir, "commit-msg", commitMsg, null);
  const r = spawnSync(process.execPath, [join(scriptsDir, "refresh-mandatory-hooks.mjs"), "--root", dir], { encoding: "utf8", env: cleanEnv() });
  const lines = r.stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length, 1, r.stderr);
  const out = JSON.parse(lines[0]);
  assert.equal(out.schema, "pipeline.mandatory-hook-refresh.v1");
  assert.equal(r.status, out.status === "ready" ? 0 : 2, "exit code mirrors the readback status");
  if (out.results.some((x) => x.code === "PB-WINDOWS-ASSURANCE")) { assert.equal(out.status, "failed"); t.skip(HOST_LIMITATION); }
  else assert.equal(out.status, "ready", r.stdout);
  const bad = spawnSync(process.execPath, [join(scriptsDir, "refresh-mandatory-hooks.mjs"), "--bogus"], { encoding: "utf8", env: cleanEnv() });
  assert.equal(bad.status, 2);
});

// ===== P4 : model-role readback ==================================================================================
test("P4: every ready envelope carries modelRoleBootstrap, run once by the preflight, read-only; unavailable is legal", async () => {
  for (const role of [undefined, "elephant", "goldfish", "critic"]) {
    const { result, calls } = await run({ role, hooks: {}, modelRole: modelReady });
    assert.equal(result.status, "ready");
    assert.deepEqual(result.modelRoleBootstrap, { status: "ready", code: "MODEL-ROLE-BOOTSTRAP-READY" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].readOnly, true);
  }
  const unavailable = (await run({ role: "elephant", hooks: {}, modelRole: modelUnavailable })).result;
  assert.equal(unavailable.status, "ready");
  assert.deepEqual(unavailable.modelRoleBootstrap, { status: "unavailable", code: "MODEL-ROLE-BOOTSTRAP-STORE-UNAVAILABLE" });
  const thrown = (await run({ role: "elephant", hooks: {}, modelRole: new Error("boom") })).result;
  assert.equal(thrown.modelRoleBootstrap.status, "unavailable");
  assert.equal(typeof thrown.modelRoleBootstrap.code, "string");
});

test("P4: the readback is also present on a non-ready (hook-refresh-required) envelope", async () => {
  const { result } = await run({ role: "elephant", hooks: { preCommit: "refresh" } });
  assert.equal(result.status, "hook-refresh-required");
  assert.ok(result.modelRoleBootstrap && typeof result.modelRoleBootstrap.status === "string");
});

// ===== P5 : RED -- each point can fail (scratch mirrors of production, mutated) ==================================
/** Load a mutated copy of a production script from scratch/, rewriting relative imports to absolute URLs. */
async function loadMutant(file, mutate) {
  const original = readFileSync(join(scriptsDir, file), "utf8");
  const mutated = mutate(original);
  assert.notEqual(mutated, original, `mutation must change ${file} (otherwise the RED proof is vacuous)`);
  const rewritten = mutated.replace(/(from\s+|import\s*\(\s*)"(\.{1,2}\/[^"]+)"/gu,
    (_m, head, spec) => `${head}"${pathToFileURL(resolve(scriptsDir, spec)).href}"`);
  const out = join(work, `mutant-${++counter}-${file}`);
  writeFileSync(out, rewritten);
  return import(pathToFileURL(out).href);
}

test("RED P1/P2: advice-only preflight (stale hooks no longer escalate) is caught by the enforcement assertions", async () => {
  const mutant = await loadMutant("pipeline-start-preflight.mjs", (s) => s.replace("if (!staleReady) return unchanged;", "return unchanged;"));
  const { result } = await runWith(mutant.observePipelineStartPreflight, { role: "elephant", hooks: { preCommit: "refresh", commitMsg: "refresh" } });
  assert.equal(result.status, "ready", "mutant behaves like the 2026-10-08 failure: confirmation line unblocked");
  assert.throws(() => assertStaleHookEnforced(result, [COMMIT_MSG, PRE_COMMIT]), assert.AssertionError);
});

test("RED P1/P2: a refresh that leaks to Goldfish would be caught by the control", async () => {
  const mutant = await loadMutant("pipeline-start-preflight.mjs", (s) => s.replace(
    'if (role === "goldfish" || role === "critic" || baseStatus !== "ready") return unchanged;', 'if (baseStatus !== "ready") return unchanged;'));
  const { result } = await runWith(mutant.observePipelineStartPreflight, { role: "goldfish", hooks: { preCommit: "refresh" } });
  assert.notEqual(result.status, "ready", "mutant gates the Goldfish");
});

test("RED P4: a preflight that drops the model-role readback is caught", async () => {
  const mutant = await loadMutant("pipeline-start-preflight.mjs", (s) => s.replace(
    "return { ...envelope, modelRoleBootstrap: modelRoleBootstrapField(value) }", "return { ...envelope }").replace(
    "const attach = (value) => ({ ...envelope, modelRoleBootstrap: modelRoleBootstrapField(value) });", "const attach = () => ({ ...envelope });"));
  const { result } = await runWith(mutant.observePipelineStartPreflight, { role: "elephant", hooks: {} });
  assert.equal(result.modelRoleBootstrap, undefined, "mutant omits the field the pin requires");
});

test("RED P3: a refresh script that never applies leaves the hooks stale and is caught by the readback assertions", async () => {
  const mutant = await loadMutant("refresh-mandatory-hooks.mjs", (s) => s.replace(
    'if (plan?.status !== "ready-to-upgrade" || plan.updateRequired !== true) {', "if (true) {"));
  const dir = freshRepo("red-refresh");
  staleAgainst(dir, "pre-commit", preCommit, null);
  staleAgainst(dir, "commit-msg", commitMsg, null);
  const result = mutant.refreshMandatoryHooks(dir);
  assert.notEqual(result.results.find((r) => r.id === PRE_COMMIT).status, "refreshed");
  assert.throws(() => assert.equal(result.results.find((r) => r.id === PRE_COMMIT).status, "refreshed"), assert.AssertionError);
});

test("RED P3: a refresh that also installs over a foreign hook is caught", async () => {
  const mutant = await loadMutant("refresh-mandatory-hooks.mjs", (s) => s.replace(
    'if (plan?.status !== "ready-to-upgrade" || plan.updateRequired !== true) {', "if (false) {"));
  const foreignPlan = () => ({ status: "foreign-hook-present" });
  const plans = { [PRE_COMMIT]: foreignPlan, [COMMIT_MSG]: foreignPlan, [PRE_PUSH]: foreignPlan };
  const applyCalls = [];
  const applies = Object.fromEntries([PRE_COMMIT, COMMIT_MSG, PRE_PUSH].map((id) => [id, () => { applyCalls.push(id); return { status: "installed" }; }]));
  const deps = { plans, applies, checkCloneProvisioning: () => provisioning({}) };
  mutant.refreshMandatoryHooks(work, deps);
  assert.ok(applyCalls.length > 0, "mutant reaches apply for a foreign hook");
  applyCalls.length = 0;
  refreshMandatoryHooks(work, deps);
  assert.deepEqual(applyCalls, [], "production never applies over a foreign hook");
});

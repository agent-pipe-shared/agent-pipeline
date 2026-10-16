// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.agy-imported-plugin-snapshot-shadows-registered-plugin (ALF-C-P19-01, AC-110).
// Acceptance points exercised through the real modules (injection seams only for the agy CLI):
//  P1 the topology observer enumerates managed copy + import manifest + global/workspace registries + hook wiring,
//     and never claims an executing path;
//  P2 a stale managed snapshot is detected by content digest, not by version stamp;
//  P3 one source per scope: other-scope conflicts, malformed surfaces and unknown CLI versions fail closed;
//  P4 remediation goes through agy's own lifecycle (uninstall/validate/install), is idempotent, preserves
//     foreign entries, and a CLI failure stops with the partial state reported;
//  P5 preflight turns a stale snapshot into a host-boundary action and a lock-version mismatch into a distinct reason.
// Not verifiable here (external agy CLI, PO decisions, spikes S1-S6): actual CLI load precedence.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, utimesSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";
import { observeAntigravityPluginTopology, observeAntigravityLoadedTopology, planAntigravityTopologyRefresh } from "../antigravity-plugin-topology.mjs";
import { createAntigravityRefreshHost } from "../antigravity-topology-refresh-host.mjs";
import { createGovernanceScopeController } from "../governance-scope.mjs";
import { observePipelineStartPreflight, observeAntigravityHardEnforcement } from "../../scripts/pipeline-start-preflight.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
// Host fact (native Windows): fixtures live under the repository's scratch/, not the OS temp dir.
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const made = [];
after(() => { for (const p of made) rmSync(p, { recursive: true, force: true }); });

const put = (path, v) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, JSON.stringify(v) + "\n"); };
function pluginTree(path, { name = "agent-pipeline-core", marker = "current" } = {}) {
  mkdirSync(join(path, "hooks"), { recursive: true });
  put(join(path, "plugin.json"), { name, version: "0.7.0" });
  put(join(path, "hooks.json"), { "pipeline-core": { PreInvocation: [{ type: "command", command: "node hooks/antigravity-start-hint.mjs" }] } });
  writeFileSync(join(path, "hooks", "antigravity-start-hint.mjs"), "// metadata fixture " + marker + "\n");
  return path;
}
// The incident shape: global registry -> current source, PLUS a stale same-version managed snapshot with import entry.
function incident(cliVersion = "1.2.12") {
  const base = mkdtempSync(join(scratchBase, "pin-agy-"));
  made.push(base);
  const configRoot = join(base, "gemini"), workspaceRoot = join(base, "workspace"), approvedSourceRoot = join(base, "source");
  const old = join(configRoot, "config", "plugins", "agent-pipeline-core"), foreign = join(base, "foreign");
  pluginTree(approvedSourceRoot); pluginTree(old, { marker: "stale" }); pluginTree(foreign, { name: "foreign-plugin" });
  mkdirSync(join(workspaceRoot, ".agents"), { recursive: true });
  const imports = join(configRoot, "config", "import_manifest.json"), global = join(configRoot, "config", "plugins.json"), local = join(workspaceRoot, ".agents", "plugins.json");
  put(imports, { imports: [{ name: "agent-pipeline-core", source: "antigravity" }, { name: "foreign-plugin", source: "claude" }], preserved: "import-key" });
  const unrelated = { path: foreign, enabled: false };
  put(global, { entries: [{ path: approvedSourceRoot }, unrelated], custom: { keep: true } });
  put(local, { entries: [unrelated] });
  const calls = []; let failAt = null;
  const runCli = (argv) => {
    calls.push([...argv]);
    if (argv[0] === "--version") return { status: "ok", version: cliVersion };
    if (argv.includes(failAt)) return { status: "failed" };
    if (argv[1] === "uninstall") { rmSync(old, { recursive: true }); const v = JSON.parse(readFileSync(imports)); put(imports, { ...v, imports: v.imports.filter((x) => x.name !== "agent-pipeline-core") }); }
    if (argv[1] === "install") { cpSync(approvedSourceRoot, old, { recursive: true }); const v = JSON.parse(readFileSync(imports)); put(imports, { ...v, imports: [...v.imports, { name: "agent-pipeline-core", source: "antigravity" }] }); }
    return { status: "ok" };
  };
  const args = { configRoot, workspaceRoot, approvedSourceRoot, scope: "global", globalChangeApproved: true, runCli, writeInstalledReceipt: () => ({ status: "written" }) };
  return { base, configRoot, workspaceRoot, approvedSourceRoot, old, foreign, imports, global, local, args, calls, setFailure: (v) => { failAt = v; } };
}
const topo = (f) => observeAntigravityPluginTopology({ configRoot: f.configRoot, workspaceRoot: f.workspaceRoot, approvedSourceRoot: f.approvedSourceRoot });

test("P1 observer enumerates every Pipeline source of the incident and never claims an executing path", () => {
  const f = incident();
  put(join(f.configRoot, "config", "external-hooks.json"), { hooks: [{ type: "command", command: "node \"" + join(f.old, "hooks", "antigravity-start-hint.mjs") + "\"" }] });
  const o = topo(f);
  assert.equal(o.schema, "pipeline.antigravity-plugin-topology.v1");
  assert.equal(o.source.status, "observed");
  assert.equal(o.managed.candidates.length, 1);
  assert.equal(o.managed.candidates[0].root, f.old);
  assert.deepEqual(o.importState.entries, [{ name: "agent-pipeline-core", source: "antigravity" }]);
  assert.equal(o.registries.global.entries.filter((e) => e.status === "observed").length, 1);
  assert.equal(o.registries.global.entries.find((e) => e.status === "observed").root, f.approvedSourceRoot);
  const wired = o.wiring.find((w) => w.path.endsWith("external-hooks.json") && w.path.includes("gemini"));
  assert.equal(wired.status, "observed");
  assert.equal(wired.ownership, "unclassified");
  assert.equal(o.executingPath, "unknown", "topology is a physical diagnostic, never loaded-path proof");
});

test("P2 stale same-version managed snapshot is detected by content digest, loaded kind reported, no executing-guard claim", () => {
  const f = incident();
  const o = topo(f);
  assert.equal(o.managed.candidates[0].version, o.source.version, "version stamps are equal; only content differs");
  assert.notEqual(o.managed.candidates[0].content.sha256, o.source.content.sha256);
  const loaded = observeAntigravityLoadedTopology({ loadedPluginRoot: f.old, configRoot: f.configRoot, workspaceRoot: f.workspaceRoot });
  assert.equal(loaded.status, "refresh-required");
  assert.equal(loaded.loadedKind, "managed-copy");
  assert.equal(loaded.managedContentMismatch, true);
  assert.equal(loaded.executingGuardAssurance, "not-established-by-topology");
  const direct = observeAntigravityLoadedTopology({ loadedPluginRoot: f.approvedSourceRoot, configRoot: f.configRoot, workspaceRoot: f.workspaceRoot });
  assert.equal(direct.status, "refresh-required", "a current direct root still does not hide the stale shadow copy");
  assert.equal(direct.managedContentMismatch, true);
});

test("P2 RED mirror: a digest-blind variant of the loaded-topology observer would call the stale snapshot current", async () => {
  const src = readFileSync(join(here, "..", "antigravity-plugin-topology.mjs"), "utf8");
  const needle = "const mismatches=copies.filter(c=>c.content.sha256!==observation.source.content.sha256);";
  assert.ok(src.includes(needle), "mirror anchor must exist in production source");
  const mirror = src.replace(needle, "const mismatches=[];").replace("'./governance-event.mjs'", JSON.stringify(pathToFileURL(join(here, "..", "governance-event.mjs")).href).replace(/"/g, "'"));
  const dir = mkdtempSync(join(scratchBase, "pin-agy-mirror-")); made.push(dir);
  const file = join(dir, "mirror.mjs"); writeFileSync(file, mirror);
  const mutant = await import(pathToFileURL(file).href);
  const f = incident();
  const args = { loadedPluginRoot: f.approvedSourceRoot, configRoot: f.configRoot, workspaceRoot: f.workspaceRoot };
  // Variant that ignores the stale copy: the shadow is reported as current -> the real assertions above are meaningful.
  assert.equal(mutant.observeAntigravityLoadedTopology(args).status, "current");
  assert.equal(observeAntigravityLoadedTopology(args).status, "refresh-required");
});

test("P3 workspace and global sources for the same plugin at once are held, never silently merged", () => {
  const f = incident();
  const second = pluginTree(join(f.base, "second-copy"));
  put(f.global, { entries: [{ path: second }] });
  put(f.local, { entries: [{ path: f.approvedSourceRoot }] });
  rmSync(f.old, { recursive: true }); put(f.imports, { imports: [] });
  const plan = planAntigravityTopologyRefresh({ observation: topo(f), scope: "workspace", cliVersion: "1.2.12" });
  assert.equal(plan.status, "held");
  assert.equal(plan.reason, "AT-OTHER-SCOPE-PIPELINE-CONFLICT");
  assert.deepEqual(plan.actions, []);
});

test("P3 malformed import manifest or unknown CLI version: held, no agy mutation, bytes untouched", () => {
  const f = incident();
  writeFileSync(f.imports, "not json");
  const before = [f.imports, f.global, f.local].map((p) => readFileSync(p));
  const held = planAntigravityTopologyRefresh({ observation: topo(f), scope: "global", globalChangeApproved: true, cliVersion: "1.2.12" });
  assert.equal(held.status, "held"); assert.equal(held.reason, "AT-UNVERIFIABLE-SURFACE");
  const r = createAntigravityRefreshHost(f.args).refresh();
  assert.notEqual(r.status, "refreshed");
  assert.equal(f.calls.some((a) => ["uninstall", "install"].includes(a[1])), false);
  assert.deepEqual([f.imports, f.global, f.local].map((p) => readFileSync(p)), before);
  assert.equal(existsSync(f.old), true);
  const g = incident();
  assert.equal(planAntigravityTopologyRefresh({ observation: topo(g), scope: "global", globalChangeApproved: true, cliVersion: "unknown" }).reason, "AT-CLI-CAPABILITY-UNOBSERVED");
  assert.equal(planAntigravityTopologyRefresh({ observation: topo(g), scope: "global", globalChangeApproved: true, cliVersion: "1.2.11" }).reason, "AT-CLI-CAPABILITY-UNOBSERVED");
});

test("P4 incident refresh uses agy's own lifecycle in order, preserves foreign entries, reads back, and is idempotent", () => {
  const f = incident();
  const host = createAntigravityRefreshHost(f.args), r = host.refresh();
  assert.equal(r.status, "refreshed", JSON.stringify(r));
  assert.equal(r.requiresFreshExecutingSession, true);
  assert.deepEqual(f.calls.map((a) => a[1]), [undefined, "uninstall", "validate", "install"], "uninstall -> validate -> install, never raw deletion");
  const o = topo(f);
  assert.equal(o.managed.candidates.length, 1);
  assert.equal(o.managed.candidates[0].content.sha256, o.source.content.sha256, "readback: managed copy equals approved source");
  const imported = JSON.parse(readFileSync(f.imports));
  assert.equal(imported.preserved, "import-key"); assert.ok(imported.imports.some((e) => e.name === "foreign-plugin"));
  assert.deepEqual(JSON.parse(readFileSync(f.global)).entries[1], { path: f.foreign, enabled: false });
  assert.equal(observeAntigravityLoadedTopology({ loadedPluginRoot: f.old, configRoot: f.configRoot, workspaceRoot: f.workspaceRoot }).status, "current");
  const n = f.calls.length, r2 = host.refresh();
  assert.equal(r2.status, "refreshed"); assert.equal(r2.changed, false);
  assert.equal(f.calls.length, n + 1, "converged topology: only the read-only version probe");
});

// Incident point: the hand-wired global hooks surface must converge to the approved source while foreign commands stay byte-identical.
// KNOWN RED ON NATIVE WINDOWS (blocked finding): wiring() in lib/antigravity-topology-refresh-host.mjs matches ownership with
// c.path.startsWith(root+'/'), but roots/paths built by path.join are backslash-separated there, so the owned command is
// classified pipeline-shaped-but-unproved and the whole refresh is refused (ATR-WIRING-OWNERSHIP-UNVERIFIABLE). Fail-closed, yet
// the incident cannot be remediated on Windows. Fix needs: separator-aware prefix match in that function (outside this write scope).
test("P4 hand-wired hooks surface converges to the approved source, foreign command untouched", () => {
  const f = incident();
  const wire = join(f.configRoot, "config", "external-hooks.json");
  put(wire, { hooks: [{ type: "command", command: "node \"" + join(f.old, "hooks", "antigravity-start-hint.mjs") + "\"" }, { type: "command", command: "foreign-check --safe" }], foreign: { keep: true } });
  const r = createAntigravityRefreshHost(f.args).refresh();
  assert.equal(r.status, "refreshed", JSON.stringify(r));
  const hooks = JSON.parse(readFileSync(wire));
  assert.equal(hooks.hooks[0].command, "node \"" + join(f.approvedSourceRoot, "hooks", "antigravity-start-hint.mjs") + "\"");
  assert.equal(hooks.hooks[1].command, "foreign-check --safe"); assert.deepEqual(hooks.foreign, { keep: true });
});

// Separator-aware containment (ALF-C-P19-01B): a native-separator owned path inside the root is accepted; a sibling whose name
// merely starts with the root's name is not owned, and its pipeline-shaped command is held (fail closed), bytes untouched.
test("P4 wiring containment accepts a native-separator owned path and refuses a sibling-prefix path", () => {
  const ok = incident();
  const okWire = join(ok.configRoot, "config", "external-hooks.json");
  put(okWire, { hooks: [{ type: "command", command: "node \"" + ok.old.split("/").join(sep) + sep + ["hooks", "antigravity-start-hint.mjs"].join(sep) + "\"" }] });
  const accepted = createAntigravityRefreshHost(ok.args).refresh();
  assert.equal(accepted.status, "refreshed", JSON.stringify(accepted));
  assert.equal(JSON.parse(readFileSync(okWire)).hooks[0].command, "node \"" + join(ok.approvedSourceRoot, "hooks", "antigravity-start-hint.mjs") + "\"");
  const bad = incident();
  const badWire = join(bad.configRoot, "config", "external-hooks.json");
  put(badWire, { hooks: [{ type: "command", command: "node \"" + bad.old + "x" + sep + join("hooks", "antigravity-start-hint.mjs") + "\"" }] });
  const before = readFileSync(badWire);
  const refused = createAntigravityRefreshHost(bad.args).refresh();
  assert.equal(refused.status, "refused", JSON.stringify(refused));
  assert.equal(refused.reason, "ATR-WIRING-OWNERSHIP-UNVERIFIABLE");
  assert.deepEqual(readFileSync(badWire), before);
});

test("P4 workspace intent never retires the global stale copy without explicit approval", () => {
  const f = incident();
  const before = readFileSync(f.global);
  const r = createAntigravityRefreshHost({ ...f.args, scope: "workspace", globalChangeApproved: false }).refresh();
  assert.equal(r.reason, "ATR-GLOBAL-SCOPE");
  assert.deepEqual(readFileSync(f.global), before);
  assert.equal(existsSync(f.old), true);
  assert.equal(f.calls.length, 1);
});

test("P4 CLI failure mid-lifecycle stops with partial state reported and nothing else deleted", () => {
  const f = incident(); f.setFailure("install");
  const globalBefore = readFileSync(f.global), localBefore = readFileSync(f.local);
  const r = createAntigravityRefreshHost(f.args).refresh();
  assert.equal(r.status, "partial");
  assert.deepEqual(r.completed, ["uninstall", "validate"]);
  assert.equal(f.calls.length, 4, "no further CLI calls or compensation after the failure");
  assert.deepEqual(readFileSync(f.global), globalBefore); assert.deepEqual(readFileSync(f.local), localBefore);
  assert.equal(existsSync(f.foreign), true);
  f.setFailure(null);
  assert.equal(createAntigravityRefreshHost(f.args).refresh().status, "refreshed", "a new explicit invocation recovers");
});

// Preflight fixture (mirrors the adjacent integration test's seams; real preflight, real topology).
function preflightFixture() {
  const base = mkdtempSync(join(scratchBase, "pin-agy-pf-")); made.push(base);
  const cfg = join(base, "gemini"), work = join(base, "workspace"), source = join(base, "source"), copy = join(cfg, "config", "plugins", "agent-pipeline-core");
  mkdirSync(join(cfg, "config", "plugins"), { recursive: true }); mkdirSync(join(work, ".agents"), { recursive: true });
  mkdirSync(join(source, "scripts"), { recursive: true });
  pluginTree(source);
  put(join(cfg, "config", "plugins.json"), { entries: [{ path: source }] });
  const controller = createGovernanceScopeController({ hostStateRoot: join(base, "private-scope") });
  const plan = controller.planDecision({ rootDir: work, decision: "enroll", by: "Fixture Owner" });
  controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  return { base, cfg, work, source, copy };
}

test("P5 preflight reports a stale managed snapshot as a host-boundary refresh action, not a self-mutation", () => {
  const f = preflightFixture();
  cpSync(f.source, f.copy, { recursive: true });
  writeFileSync(join(f.copy, "hooks", "antigravity-start-hint.mjs"), "// stale same-version bytes\n");
  put(join(f.cfg, "config", "import_manifest.json"), { imports: [{ name: "agent-pipeline-core" }] });
  const controller = createGovernanceScopeController({ hostStateRoot: join(f.base, "private-scope") });
  const r = observePipelineStartPreflight({
    env: { ANTIGRAVITY_AGENT: "1" }, cwd: f.work,
    scriptUrl: pathToFileURL(join(f.source, "scripts", "pipeline-start-preflight.mjs")).href,
    antigravityConfigRoot: f.cfg,
    observeGovernanceScopeFn: () => controller.observe({ rootDir: f.work }),
    pluginList: () => JSON.stringify({ installed: [] }),
    observeAntigravityHardEnforcementFn: () => ({ observed: true }),
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "not-checked" }),
    requireProjectOnboardingReadyFn: () => ({ status: "ready" }),
    observeArchitectureAdoptionOrientationFn: () => ({ status: "not-required" }),
    inspectEffectiveArchitectureDecisionsFn: () => ({ status: "advisory", projectionSha256: "a".repeat(64), decisions: [], activeExceptions: [], findings: [] }),
  });
  assert.equal(r.status, "antigravity-topology-refresh-required");
  assert.equal(r.antigravityTopology.managedContentMismatch, true);
  assert.equal(r.nextAction.executionBoundary, "host");
  assert.equal(r.nextAction.requiresConfirmation, true);
});

test("P5 a fresh lock from a different build yields the distinct lock-version-mismatch reason, not a generic not-observed", () => {
  const work = mkdtempSync(join(scratchBase, "pin-agy-lock-")); made.push(work);
  const run = join(work, ".git", "agent-pipeline", "run"), now = Date.UTC(2026, 8, 28, 12, 0, 0), mtime = (now - 1000) / 1000;
  const lock = (id, value) => { const dir = join(run, "session-" + id); mkdirSync(dir, { recursive: true }); const p = join(dir, "requires-bootstrap.lock"); writeFileSync(p, JSON.stringify(value)); utimesSync(p, mtime, mtime); return p; };
  lock("old", { version: "0.6.2", locked: true });
  const observe = () => observeAntigravityHardEnforcement({ rootDir: work, currentVersion: "0.7.0", now });
  let r = observe();
  assert.equal(r.observed, false);
  assert.equal(r.reason, "antigravity-lock-version-mismatch");
  assert.deepEqual(r.recordedVersions, ["0.6.2"]);
  assert.equal(r.currentVersion, "0.7.0");
  assert.equal(r.evidenceClass, "mutable-lock-metadata", "a lock is mutable metadata, never executed-path proof");
  lock("current", { version: "0.7.0" });
  r = observe();
  assert.equal(r.observed, true);
});

// ALF-C-P19-01C: every observer verdict (registered only / imported snapshot only / both with shadowing snapshot / neither)
// pinned through the real observers and the host's prepare(), with the typed reason codes the host actually emits.
// Finding (D): the host and the topology observer emit ATR-* / AT-* codes only; the IPA-AGY-* family lives solely in
// install-agy.mjs (IPA-AGY-SOURCE-UNAVAILABLE) and is outside this item's write scope, so no IPA-AGY code is asserted here.
const kinds = (plan) => plan.actions.map((a) => (a.kind === "cli" ? a.argv[1] : a.kind));
const registerOnly = (f) => { rmSync(f.old, { recursive: true }); put(f.imports, { imports: [{ name: "foreign-plugin", source: "claude" }] }); };
const loadedOf = (f, root) => observeAntigravityLoadedTopology({ loadedPluginRoot: root, configRoot: f.configRoot, workspaceRoot: f.workspaceRoot });

test("P6 verdict registered-only: current loaded topology, host plans install without uninstall", () => {
  const f = incident(); registerOnly(f);
  const o = topo(f);
  assert.equal(o.managed.candidates.length, 0); assert.equal(o.importState.entries.length, 0);
  assert.equal(o.registries.global.entries.filter((e) => e.status === "observed").length, 1);
  const loaded = loadedOf(f, f.approvedSourceRoot);
  assert.equal(loaded.status, "current"); assert.equal(loaded.loadedKind, "direct"); assert.equal(loaded.managedContentMismatch, false);
  const plan = createAntigravityRefreshHost(f.args).prepare();
  assert.equal(plan.status, "prepared", JSON.stringify(plan));
  assert.deepEqual(kinds(plan), ["validate", "install"]);
});

test("P6 verdict imported-snapshot-only: no registered plugin, loaded topology unverifiable, host plans uninstall/install and registry rebind", () => {
  const f = incident();
  put(f.global, { entries: [{ path: f.foreign, enabled: false }] });
  const o = topo(f);
  assert.equal(o.managed.candidates.length, 1); assert.equal(o.importState.entries.length, 1);
  assert.equal(o.registries.global.entries.filter((e) => e.status === "observed").length, 0);
  const loaded = loadedOf(f, f.old);
  assert.equal(loaded.status, "unavailable"); assert.equal(loaded.reason, "AT-TOPOLOGY-UNVERIFIABLE", "snapshot with no registered plugin has no unambiguous source");
  const plan = createAntigravityRefreshHost(f.args).prepare();
  assert.equal(plan.status, "prepared", JSON.stringify(plan));
  assert.deepEqual(kinds(plan), ["uninstall", "validate", "install", "owned-registry-rebind"]);
  const noApproval = createAntigravityRefreshHost({ ...f.args, globalChangeApproved: false }).prepare();
  assert.equal(noApproval.status, "refused"); assert.equal(noApproval.reason, "ATR-GLOBAL-SCOPE");
});

test("P6 verdict both, snapshot shadows registered plugin: refresh-required and the host plans lifecycle without a registry rebind", () => {
  const f = incident();
  const loaded = loadedOf(f, f.approvedSourceRoot);
  assert.equal(loaded.status, "refresh-required"); assert.equal(loaded.managedContentMismatch, true);
  const plan = createAntigravityRefreshHost(f.args).prepare();
  assert.equal(plan.status, "prepared", JSON.stringify(plan));
  assert.deepEqual(kinds(plan), ["uninstall", "validate", "install"]);
  const noApproval = createAntigravityRefreshHost({ ...f.args, globalChangeApproved: false }).prepare();
  assert.equal(noApproval.status, "refused"); assert.equal(noApproval.reason, "ATR-GLOBAL-SCOPE", "stale shadow never retired without explicit approval");
});

test("P6 verdict neither: loaded topology unverifiable, host plans install plus registry rebind", () => {
  const f = incident(); registerOnly(f); put(f.global, { entries: [{ path: f.foreign, enabled: false }] });
  const o = topo(f);
  assert.equal(o.managed.candidates.length, 0); assert.equal(o.importState.entries.length, 0);
  assert.equal(o.registries.global.entries.filter((e) => e.status === "observed").length, 0);
  const loaded = loadedOf(f, f.approvedSourceRoot);
  assert.equal(loaded.status, "unavailable"); assert.equal(loaded.reason, "AT-TOPOLOGY-UNVERIFIABLE");
  const plan = createAntigravityRefreshHost(f.args).prepare();
  assert.equal(plan.status, "prepared", JSON.stringify(plan));
  assert.deepEqual(kinds(plan), ["validate", "install", "owned-registry-rebind"]);
});

test("P6 every refused verdict carries a typed ATR-* reason, never the untyped fallback and never an IPA-AGY code", () => {
  const ambiguous = incident(); rmSync(ambiguous.old, { recursive: true });
  put(ambiguous.imports, { imports: [{ name: "agent-pipeline-core", source: "antigravity" }] });
  const unverifiable = incident(); writeFileSync(unverifiable.imports, "not json");
  const oldCli = incident("1.2.11");
  const conflict = incident(); const second = pluginTree(join(conflict.base, "second-copy"));
  put(conflict.global, { entries: [{ path: second }] }); put(conflict.local, { entries: [{ path: conflict.approvedSourceRoot }] });
  const expected = [[ambiguous, "ATR-MANAGED-IMPORT-AMBIGUOUS"], [unverifiable, "ATR-TOPOLOGY-UNVERIFIABLE"], [oldCli, "ATR-CLI-CAPABILITY"], [conflict, "ATR-OTHER-SCOPE-CONFLICT"]];
  for (const [f, reason] of expected) {
    const plan = createAntigravityRefreshHost({ ...f.args, ...(f === conflict ? { scope: "workspace", globalChangeApproved: false } : {}) }).prepare();
    assert.equal(plan.status, "refused", reason); assert.equal(plan.reason, reason);
    assert.doesNotMatch(plan.reason, /IPA-AGY|ATR-UNAVAILABLE/);
  }
});

test("HOST-LIMITATION skip: directory-mode/symlink aliasing cases (owner Coordinator, due 2026-10-19, Linux/WSL run, PO decision K7)", { skip: process.platform === "win32" ? "host-limitation: directory symlinks unavailable on native Windows; owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)" : false }, () => {
  const f = incident();
  const alias = join(f.workspaceRoot, "plugins", "pipeline-core");
  mkdirSync(join(alias, ".."), { recursive: true });
  symlinkSync(f.approvedSourceRoot, alias, "dir");
  put(f.local, { entries: [{ path: "plugins/pipeline-core" }] });
  assert.equal(topo(f).registries.workspace.status, "unavailable", "aliased workspace registry entry fails closed");
});

// SPDX-License-Identifier: SUL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installerUsageLines, postInstallGuidanceLines, refreshAntigravityInstallation, resolveAntigravityInstallerAttestationSource, selectPluginSource, updateAutonomousSettings, updatePluginRegistry, verifyAntigravityInstallerSource } from "./install-agy.mjs";
import * as installerModule from "./install-agy.mjs";
import { resolveAntigravityRegistryInstalledRoot } from "./scripts/installed-plugin-attestation-host.mjs";
import { observePipelineStartPreflight } from "./scripts/pipeline-start-preflight.mjs";
import { createGovernanceScopeController } from "./lib/governance-scope.mjs";

test("Agy release-tag checkout creates a named branch without changing the tag commit", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-release-tag-checkout-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source");
  const installed = join(root, "installed");
  mkdirSync(source);
  execFileSync("git", ["-C", source, "init", "--initial-branch", "main"]);
  writeFileSync(join(source, "plugin.json"), JSON.stringify({ name: "agent-pipeline-core", version: "0.7.0" }));
  execFileSync("git", ["-C", source, "add", "plugin.json"]);
  execFileSync("git", ["-C", source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"]);
  execFileSync("git", ["-C", source, "tag", "v0.7.0"]);
  execFileSync("git", ["clone", "--branch", "v0.7.0", "--depth", "1", source, installed]);
  const git = (args) => execFileSync("git", ["-C", installed, ...args], { encoding: "utf8" }).trim();
  const tagCommit = git(["rev-parse", "HEAD"]);
  assert.throws(() => git(["symbolic-ref", "--short", "HEAD"]),
    "a tag checkout alone strands the source observer at detached HEAD");
  git(["switch", "-c", "pipeline-release-v0.7.0"]);
  assert.equal(git(["symbolic-ref", "--short", "HEAD"]), "pipeline-release-v0.7.0");
  assert.equal(git(["rev-parse", "HEAD"]), tagCommit);
  assert.equal(git(["describe", "--tags", "--exact-match"]), "v0.7.0");
  const setup = readFileSync(new URL("../../SETUP.md", import.meta.url), "utf8");
  const agyEntry = readFileSync(new URL("../../GEMINI.md", import.meta.url), "utf8");
  const onboarding = readFileSync(new URL("../../docs/v3-consumer-onboarding.md", import.meta.url), "utf8");
  assert.match(setup, /https:\/\/github\.com\/agent-pipe-shared\/agent-pipeline(?:\.git)?/u);
  assert.match(setup, /Before `v0\.7\.0` is published, use the installation instructions at the\s+already-approved release tag/u);
  assert.doesNotMatch(setup, /\[version-independent Agy installation path\]\(GEMINI\.md/u,
    "the pre-release instruction must not loop back to GEMINI.md");
  assert.match(agyEntry, /SETUP\.md#antigravity-agy-workspace-local-binding/u);
  assert.match(setup, /git -C "\$pipeline_release_dir" switch -c pipeline-release-v0\.7\.0/u);
  assert.match(setup, /\$pipelineReleaseDir = Join-Path \$env:LOCALAPPDATA/u);
  assert.match(setup, /git -C \$pipelineReleaseDir switch -c pipeline-release-v0\.7\.0/u);
  assert.match(setup, /node \(Join-Path \$pipelineReleaseDir 'plugins\/pipeline-core\/install-agy\.mjs'\)/u);
  assert.match(onboarding, /\.\.\/SETUP\.md#antigravity-agy-workspace-local-binding/u,
    "consumer onboarding links to the single maintained GitHub installation procedure");
});

test("Agy installer guidance verifies the host PATH without normalizing sudo or yolo", () => {
  const guidance = postInstallGuidanceLines("linux").join("\n");
  assert.match(guidance, /command -v node/u);
  const windowsGuidance = postInstallGuidanceLines("win32").join("\n");
  assert.match(windowsGuidance, /where\.exe node/u);
  assert.doesNotMatch(windowsGuidance, /command -v node/u);
  assert.match(guidance, /fully restart Antigravity/u);
  assert.match(guidance, /pipeline-start/u);
  assert.match(guidance, /grants no plan, release, remote, or human authority/u);
  assert.doesNotMatch(guidance, /sudo\s+ln/u);
  assert.doesNotMatch(guidance, /--yolo/u);
  assert.doesNotMatch(guidance, /SILENTLY FAIL OPEN/u);
});

test("Agy installer checks Git source before a managed copy can be bound or refreshed", () => {
  const input = { configRoot: "/config", workspaceRoot: "/empty-project", sourcePluginRoot: "/source/plugins/pipeline-core", scope: "workspace" };
  let calls = 0;
  const observeSource = (_runner, roots) => {
    calls += 1;
    assert.equal(roots.sourcePluginRoot, input.sourcePluginRoot);
    assert.equal(roots.installedPluginRoot, input.sourcePluginRoot);
    return { status: "ready" };
  };
  const empty = { source: { status: "observed" }, managed: { status: "absent", candidates: [] } };
  assert.deepEqual(verifyAntigravityInstallerSource(input, { observeTopology: () => empty, observeSource }), { status: "direct-root" });
  assert.equal(calls, 0, "an exact direct root needs no external receipt");
  const managed = { source: { status: "observed" }, managed: { status: "observed", candidates: [{ status: "observed" }] } };
  assert.deepEqual(verifyAntigravityInstallerSource(input, { observeTopology: () => managed, observeSource }), { status: "attestable-source" });
  assert.equal(calls, 1);
  assert.deepEqual(verifyAntigravityInstallerSource({ ...input, scope: "global" }, { observeTopology: () => empty, observeSource }), { status: "attestable-source" });
  assert.equal(calls, 2);
  assert.deepEqual(verifyAntigravityInstallerSource(input, { observeTopology: () => managed, observeSource: () => ({ status: "rejected" }) }),
    { status: "rejected", reason: "ATR-SOURCE-ATTESTATION-UNAVAILABLE" });
  const marketplace = "/marketplace/plugins/pipeline-core";
  const copied = { ...input, sourcePluginRoot: marketplace, attestationSourceRoot: input.sourcePluginRoot, scope: "global" };
  let copyChecks = 0;
  const verifyCopy = (_runner, roots) => {
    copyChecks += 1;
    assert.deepEqual(roots, { sourcePluginRoot: input.sourcePluginRoot, installedPluginRoot: marketplace });
    return { status: "ready" };
  };
  assert.deepEqual(verifyAntigravityInstallerSource(copied, { observeTopology: () => empty, observeSource: verifyCopy }), { status: "attestable-source" });
  assert.deepEqual(verifyAntigravityInstallerSource({ ...copied, scope: "workspace" }, { observeTopology: () => empty, observeSource: verifyCopy }), { status: "attestable-source" });
  assert.equal(copyChecks, 2, "gitless direct copies must be validated too");
  const rejected = refreshAntigravityInstallation({ configRoot: input.configRoot, workspaceRoot: input.workspaceRoot, approvedSourceRoot: marketplace, attestationSourceRoot: input.sourcePluginRoot, scope: "global", globalChangeApproved: true }, {
    observeTopology: () => empty,
    observeSource: () => ({ status: "rejected" }),
    runCli: () => { throw new Error("source mismatch must refuse before invoking CLI"); },
    writeInstalledReceipt: () => { throw new Error("source mismatch must never write a receipt"); },
  });
  assert.equal(rejected.status, "refused");
  assert.equal(rejected.reason, "ATR-SOURCE-ATTESTATION-UNAVAILABLE");
});

test("Agy optional autonomous settings preserve unrelated keys and refuse malformed input", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-installer-settings-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const targetFile = join(root, "settings.json");
  const original = '{"custom":{"keep":true},"terminalSandbox":false}\n';
  writeFileSync(targetFile, original);
  updateAutonomousSettings({ targetFile });
  assert.deepEqual(JSON.parse(readFileSync(targetFile, "utf8")), {
    custom: { keep: true }, terminalSandbox: true,
    toolExecutionPolicy: "always-proceed", artifactReviewMode: "always-proceed",
  });
  for (const bytes of ["{broken", "[]", "null", Buffer.from([0x7b, 0x22, 0x80, 0x22, 0x3a, 0x31, 0x7d])]) {
    writeFileSync(targetFile, bytes);
    assert.throws(() => updateAutonomousSettings({ targetFile }), /Malformed Antigravity settings/u);
    assert.deepEqual(readFileSync(targetFile), Buffer.from(bytes));
  }
  assert.deepEqual(readdirSync(root), ["settings.json"], "failed updates leave no temporary files");
});

test("Agy optional autonomous settings never follow file or parent aliases", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-installer-settings-alias-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const actual = join(root, "actual");
  const alias = join(root, "alias");
  mkdirSync(actual);
  const outside = join(root, "outside.json");
  writeFileSync(outside, '{"keep":true}\n');
  symlinkSync(outside, join(actual, "settings.json"));
  assert.throws(() => updateAutonomousSettings({ targetFile: join(actual, "settings.json") }), /Unsafe Antigravity settings target/u);
  symlinkSync(actual, alias);
  assert.throws(() => updateAutonomousSettings({ targetFile: join(alias, "settings.json") }), /Unsafe Antigravity settings parent/u);
  assert.equal(readFileSync(outside, "utf8"), '{"keep":true}\n');
});

test("Agy installer defaults to the approved script directory and makes local development explicit", () => {
  assert.deepEqual(selectPluginSource({ answer: "", scriptDir: "/approved/plugin", marketplaceRoot: "/local/marketplace", marketplaceAvailable: true }), {
    kind: "approved-directory",
    pluginRoot: "/approved/plugin",
  });
  assert.deepEqual(selectPluginSource({ answer: "2", scriptDir: "/approved/plugin", marketplaceRoot: "/local/marketplace", marketplaceAvailable: true }), {
    kind: "local-marketplace",
    pluginRoot: "/local/marketplace/plugins/pipeline-core",
  });
  assert.throws(() => selectPluginSource({ answer: "2", scriptDir: "/approved/plugin", marketplaceRoot: "/missing", marketplaceAvailable: false }),
    /Local development marketplace is unavailable; no plugin was registered/u);
  assert.throws(() => selectPluginSource({ answer: "99", scriptDir: "/approved/plugin", marketplaceRoot: "/local/marketplace", marketplaceAvailable: true }),
    /Invalid plugin source selection; no plugin was registered/u);
  assert.match(installerUsageLines().join("\n"), /approved Agent-Pipeline plugin directory/u);
  assert.match(installerUsageLines().join("\n"), /explicit pre-release development choice/u);
  assert.match(installerUsageLines().join("\n"), /does not prove GitHub origin or release authenticity/u);
});

test("Agy installer shows an invalid source choice as a refusal before touching the consumer registry", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-installer-source-choice-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./install-agy.mjs", import.meta.url))],
    { cwd: root, input: "99\n", encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Source approval is your decision: this installer does not prove GitHub origin or release authenticity/u);
  assert.match(result.stderr, /Installation refused: Invalid plugin source selection; no plugin was registered/u);
  assert.equal(existsSync(join(root, ".agents", "plugins.json")), false);
});

test("Agy source install writes a receipt readable by the first preflight in an empty non-Git workspace", (t) => {
  const base = mkdtempSync(join(tmpdir(), "agy-first-preflight-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, "home");
  const configRoot = join(home, ".gemini");
  const workspaceRoot = join(base, "empty-workspace");
  const sourceRepo = join(base, "source");
  const sourcePluginRoot = join(sourceRepo, "plugins", "pipeline-core");
  const installedPluginRoot = join(configRoot, "config", "plugins", "agent-pipeline-core");
  const receiptDirectory = join(configRoot, "agent-pipeline", "installed-plugin-attestations");
  mkdirSync(workspaceRoot);
  mkdirSync(join(configRoot, "config", "plugins"), { recursive: true });
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  t.after(() => { if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome; });
  mkdirSync(join(sourcePluginRoot, "hooks"), { recursive: true });
  mkdirSync(join(sourcePluginRoot, "skills", "critic-review"), { recursive: true });
  mkdirSync(join(sourcePluginRoot, "scripts"), { recursive: true });
  writeFileSync(join(sourcePluginRoot, "plugin.json"), '{"name":"agent-pipeline-core","version":"0.7.0","description":"Synthetic test plugin"}\n');
  writeFileSync(join(sourcePluginRoot, "hooks.json"), '{"pipeline-core":{"PreInvocation":[{"type":"command","command":"node hooks/antigravity-start-hint.mjs"}]}}\n');
  for (const path of ["hooks/antigravity-pretool-guard.mjs", "hooks/antigravity-start-hint.mjs", "skills/critic-review/SKILL.md", "scripts/pipeline-start-preflight.mjs"]) {
    writeFileSync(join(sourcePluginRoot, path), "// synthetic fixture\n");
  }
  execFileSync("git", ["-C", sourceRepo, "init", "--initial-branch", "main"]);
  execFileSync("git", ["-C", sourceRepo, "remote", "add", "origin", "https://example.invalid/synthetic-pipeline.git"]);
  execFileSync("git", ["-C", sourceRepo, "add", "."]);
  execFileSync("git", ["-C", sourceRepo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"]);
  assert.equal(existsSync(join(workspaceRoot, ".git")), false);
  assert.equal(existsSync(join(workspaceRoot, ".agents")), false);

  const controller = createGovernanceScopeController({ hostStateRoot: join(base, "scope-state") });
  const plan = controller.planDecision({ rootDir: workspaceRoot, decision: "enroll", by: "Fixture Owner" });
  controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 });
  const marketplaceRoot = join(base, "marketplace", "plugins", "pipeline-core");
  cpSync(sourcePluginRoot, marketplaceRoot, { recursive: true });
  assert.equal(existsSync(join(base, "marketplace", ".git")), false);
  assert.equal(verifyAntigravityInstallerSource({ configRoot, workspaceRoot, sourcePluginRoot: marketplaceRoot, attestationSourceRoot: sourcePluginRoot, scope: "global" }).status, "attestable-source");
  const runCli = (argv) => {
    if (argv[0] === "--version") return { status: "ok", version: "1.2.12" };
    if (argv[1] === "install") {
      cpSync(marketplaceRoot, installedPluginRoot, { recursive: true });
      writeFileSync(join(configRoot, "config", "import_manifest.json"), '{"imports":[{"name":"agent-pipeline-core"}]}\n');
    }
    return { status: "ok" };
  };
  const result = refreshAntigravityInstallation({
    configRoot, workspaceRoot, approvedSourceRoot: marketplaceRoot, attestationSourceRoot: sourcePluginRoot, scope: "global", globalChangeApproved: true,
  }, { runCli });
  assert.equal(result.status, "refreshed", JSON.stringify(result));
  assert.equal(existsSync(join(workspaceRoot, ".git")), false);
  assert.equal(existsSync(join(installedPluginRoot, ".git")), false);
  assert.equal(readdirSync(receiptDirectory).some((name) => name.endsWith(".source.json")), true);
  assert.equal(readdirSync(receiptDirectory).some((name) => name.endsWith(".json") && !name.endsWith(".source.json")), true);

  const preflight = observePipelineStartPreflight({
    env: { ANTIGRAVITY_AGENT: "1" }, cwd: workspaceRoot,
    scriptUrl: pathToFileURL(join(installedPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href,
    antigravityConfigRoot: configRoot,
    observeGovernanceScopeFn: () => controller.observe({ rootDir: workspaceRoot }),
    pluginList: () => JSON.stringify({ installed: [] }),
    observeAntigravityHardEnforcementFn: () => ({ observed: true }),
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "not-checked" }),
    requireProjectOnboardingReadyFn: () => ({ status: "ready" }),
    observeArchitectureAdoptionOrientationFn: () => ({ status: "not-required" }),
    inspectEffectiveArchitectureDecisionsFn: () => ({ status: "advisory", projectionSha256: "a".repeat(64), decisions: [], activeExceptions: [], findings: [] }),
  });
  assert.equal(preflight.antigravityTopology.loadedKind, "managed-copy");
  assert.equal(preflight.installedPluginAttestation.status, "verified", JSON.stringify(preflight.installedPluginAttestation));
  assert.notEqual(preflight.status, "plugin-attestation-required");
  writeFileSync(join(marketplaceRoot, "hooks", "antigravity-pretool-guard.mjs"), "// changed marketplace copy\n");
  assert.equal(verifyAntigravityInstallerSource({ configRoot, workspaceRoot, sourcePluginRoot: marketplaceRoot, attestationSourceRoot: sourcePluginRoot, scope: "global" }).status, "rejected",
    "a copy changed after approval must not inherit the Git source identity");
});

// ALF-AGY1: a gitless copy cannot name its own Git source. Discovery therefore also
// considers the repository of the invoking directory as a LOCATOR. Every fixture
// owns its repositories (own git init) in a temp root outside the checkout.
function syntheticCheckout(base, name, marker) {
  const repo = join(base, name);
  const pluginRoot = join(repo, "plugins", "pipeline-core");
  mkdirSync(join(pluginRoot, "hooks"), { recursive: true });
  mkdirSync(join(pluginRoot, "skills", "critic-review"), { recursive: true });
  mkdirSync(join(pluginRoot, "scripts"), { recursive: true });
  writeFileSync(join(pluginRoot, "plugin.json"), '{"name":"agent-pipeline-core","version":"0.7.0","description":"Synthetic test plugin"}\n');
  writeFileSync(join(pluginRoot, "hooks.json"), '{"pipeline-core":{"PreInvocation":[{"type":"command","command":"node hooks/antigravity-start-hint.mjs"}]}}\n');
  for (const path of ["hooks/antigravity-pretool-guard.mjs", "hooks/antigravity-start-hint.mjs", "skills/critic-review/SKILL.md", "scripts/pipeline-start-preflight.mjs"]) {
    writeFileSync(join(pluginRoot, path), `// synthetic fixture ${marker}\n`);
  }
  execFileSync("git", ["-C", repo, "init", "--initial-branch", "main"], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "remote", "add", "origin", "https://example.invalid/synthetic-pipeline.git"], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "add", "."], { stdio: "ignore" });
  execFileSync("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"], { stdio: "ignore" });
  return { repo, pluginRoot };
}

function discoveryFixture(t) {
  const base = mkdtempSync(join(tmpdir(), "agy-installer-cwd-discovery-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const source = syntheticCheckout(base, "source", "approved");
  const other = syntheticCheckout(base, "other", "different bytes");
  const marketplaceRoot = join(base, "marketplace", "plugins", "pipeline-core");
  cpSync(source.pluginRoot, marketplaceRoot, { recursive: true });
  assert.equal(existsSync(join(base, "marketplace", ".git")), false, "the selected marketplace copy is gitless");
  const notARepository = join(base, "not-a-repository");
  mkdirSync(notARepository);
  return { base, source, other, marketplaceRoot, notARepository };
}

test("Agy installer discovery finds the Git source from the invoking directory when its own directory is gitless", (t) => {
  const f = discoveryFixture(t);
  const selected = { sourcePluginRoot: f.marketplaceRoot, discoveryPluginRoot: f.marketplaceRoot };
  const resolved = resolveAntigravityInstallerAttestationSource({ ...selected, cwd: join(f.source.repo, "plugins") });
  assert.equal(resolved.status, "attestable-source", JSON.stringify(resolved));
  assert.equal(realpathSync(resolved.attestationSourceRoot), realpathSync(f.source.pluginRoot));
  const control = resolveAntigravityInstallerAttestationSource({ ...selected, cwd: f.notARepository });
  assert.equal(control.status, "rejected", "the invoking directory is what supplied the locator");
  assert.equal(control.reason, "ATR-SOURCE-CANDIDATE-UNAVAILABLE");
  assert.ok(control.reasonCodes.includes("ATR-SOURCE-CANDIDATE-DISCOVERY-UNAVAILABLE"), JSON.stringify(control));
});

test("Agy installer discovery never accepts a locator whose bytes differ and names the repair", (t) => {
  const f = discoveryFixture(t);
  const resolved = resolveAntigravityInstallerAttestationSource({ sourcePluginRoot: f.marketplaceRoot, discoveryPluginRoot: f.marketplaceRoot, cwd: f.other.repo });
  assert.equal(resolved.status, "rejected", JSON.stringify(resolved));
  assert.equal(resolved.reason, "ATR-SOURCE-CANDIDATE-UNAVAILABLE");
  assert.ok(resolved.reasonCodes.includes("SNT-A2-GIT-UNAVAILABLE"), "the gitless copy itself stays a refused candidate");
  assert.ok(resolved.reasonCodes.includes("SNT-A2-CONTENT-MISMATCH"), "a checkout with different bytes is observed and refused, never trusted as a locator");
  assert.equal(Object.hasOwn(resolved, "attestationSourceRoot"), false);
  for (const text of [resolved.guidance, installerModule.describeInstallerSourceRefusal(resolved)]) {
    assert.match(text, /approved Git source checkout/u);
    assert.match(text, /byte-for-byte/u);
    assert.match(text, /refreshing that copy/u);
  }
  const line = installerModule.describeInstallerSourceRefusal(resolved);
  assert.ok(line.startsWith("ATR-SOURCE-CANDIDATE-UNAVAILABLE: "), line);
  assert.ok(line.includes("SNT-A2-CONTENT-MISMATCH"), line);
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "agy-installer-upgrade-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const oldRoot = join(root, "old", "plugins", "pipeline-core");
  const newRoot = join(root, "new", "plugins", "pipeline-core");
  const otherRoot = join(root, "other-plugin");
  for (const path of [oldRoot, newRoot, otherRoot]) mkdirSync(path, { recursive: true });
  for (const path of [oldRoot, newRoot]) {
    writeFileSync(join(path, "plugin.json"), JSON.stringify({ name: "agent-pipeline-core", version: "0.7.0" }));
    writeFileSync(join(path, "hooks.json"), "{}\n");
  }
  const registryFile = join(root, ".agents", "plugins.json");
  mkdirSync(join(root, ".agents"));
  const configRoot = join(root, "gemini");
  mkdirSync(join(configRoot, "config", "plugins"), { recursive: true });
  writeFileSync(join(otherRoot, "plugin.json"), JSON.stringify({ name: "foreign-plugin", version: "1" }));
  return { oldRoot, newRoot, otherRoot, registryFile, root, configRoot };
}

test("Agy upgrade replaces the old physical root and survives its removal", (t) => {
  const { oldRoot, newRoot, otherRoot, registryFile, root, configRoot } = fixture(t);
  const unrelated = { path: otherRoot, enabled: false };
  writeFileSync(registryFile, JSON.stringify({ entries: [{ path: oldRoot }, unrelated], custom: { keep: true } }, null, 2));

  updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot });
  const bytes = readFileSync(registryFile, "utf8");
  assert.deepEqual(JSON.parse(bytes), { entries: [unrelated, { path: newRoot }], custom: { keep: true } });
  rmSync(join(oldRoot, "plugin.json"));
  rmSync(oldRoot, { recursive: true });
  const readback = readFileSync(registryFile, "utf8");
  assert.equal(readback, bytes);
  assert.equal(resolveAntigravityRegistryInstalledRoot({ installedPluginRoot: newRoot, configRoot, workspaceRoot: root }), newRoot);
  assert.equal(resolveAntigravityRegistryInstalledRoot({ installedPluginRoot: oldRoot, configRoot, workspaceRoot: root }), null);
  updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot });
  assert.equal(readFileSync(registryFile, "utf8"), bytes);
});

test("Agy upgrade refuses an unverifiable deleted Pipeline-shaped registration", (t) => {
  const { newRoot, otherRoot, registryFile, root } = fixture(t);
  const ambiguous = join(root, "retired", "plugins", "pipeline-core");
  const bytes = `${JSON.stringify({ entries: [{ path: ambiguous }, { path: otherRoot, enabled: false }] }, null, 2)}\n`;
  writeFileSync(registryFile, bytes);
  assert.throws(
    () => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }),
    /Unverifiable existing Pipeline registration/u,
  );
  assert.equal(readFileSync(registryFile, "utf8"), bytes);
  mkdirSync(ambiguous, { recursive: true });
  writeFileSync(join(ambiguous, "plugin.json"), "not json\n");
  assert.throws(
    () => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }),
    /Unverifiable existing Pipeline registration/u,
  );
  assert.equal(readFileSync(registryFile, "utf8"), bytes);
  writeFileSync(join(ambiguous, "plugin.json"), JSON.stringify({ name: "different-plugin" }));
  updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot });
  assert.deepEqual(JSON.parse(readFileSync(registryFile, "utf8")).entries, [
    { path: ambiguous }, { path: otherRoot, enabled: false }, { path: newRoot },
  ]);
});

test("Agy installer refuses malformed existing registry without changing bytes", (t) => {
  const { newRoot, registryFile } = fixture(t);
  for (const bytes of ["{invalid", '{"entries":{}}', '{"entries":[null]}', Buffer.from([0x7b, 0x22, 0x80, 0x22, 0x3a, 0x31, 0x7d])]) {
    writeFileSync(registryFile, bytes);
    assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }));
    assert.deepEqual(readFileSync(registryFile), Buffer.from(bytes));
  }
});

test("Agy installer rejects unsafe new roots and resolver retains exact non-symlink binding", (t) => {
  const { newRoot, registryFile, root, configRoot } = fixture(t);
  const alias = join(root, "alias");
  symlinkSync(newRoot, alias);
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: alias }));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: `${root}/new/../new/plugins/pipeline-core` }));
  writeFileSync(registryFile, JSON.stringify({ entries: [{ path: alias }] }));
  assert.equal(resolveAntigravityRegistryInstalledRoot({ installedPluginRoot: newRoot, configRoot, workspaceRoot: root }), null);
  writeFileSync(registryFile, JSON.stringify({ entries: [{ path: newRoot }] }));
  assert.equal(resolveAntigravityRegistryInstalledRoot({ installedPluginRoot: newRoot, configRoot, workspaceRoot: root }), newRoot);
});

test("Agy installer rejects directories without a valid physical Pipeline manifest before registry publication", (t) => {
  const { oldRoot, newRoot, registryFile } = fixture(t);
  const original = '{"entries":[]}\n';
  writeFileSync(registryFile, original);
  rmSync(join(newRoot, "plugin.json"));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  writeFileSync(join(newRoot, "plugin.json"), JSON.stringify({ name: "other-plugin", version: "0.7.0" }));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  writeFileSync(join(newRoot, "plugin.json"), "not json\n");
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  rmSync(join(newRoot, "plugin.json"));
  symlinkSync(join(oldRoot, "plugin.json"), join(newRoot, "plugin.json"));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  rmSync(join(newRoot, "plugin.json"));
  writeFileSync(join(newRoot, "plugin.json"), JSON.stringify({ name: "agent-pipeline-core", version: "" }));
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unverifiable Pipeline source manifest/u);
  assert.equal(readFileSync(registryFile, "utf8"), original);
});

// AM-W-T (Critic AM-D1, ruling 50; design note agy-snapshot-central-2026-10-08 sections 3-4): pins that the installer is a
// caller of the per-user central agy snapshot. Test-only; expected RED until the AM-W wiring slice lands.
import { readFileSync as amWReadFileSync } from "node:fs";
import amWTest from "node:test";
import amWAssert from "node:assert/strict";

function amWCodeOf(url) {
  return amWReadFileSync(url, "utf8").split(/\r?\n/u).filter((line) => !/^\s*(?:\/\/|\/\*|\*)/u.test(line)).join("\n");
}

amWTest("AM-W-T: the installer accepts source kind central-snapshot as choice 3, after approved-directory 1 and local-marketplace 2", () => {
  const selected = selectPluginSource({ answer: "3", scriptDir: "/approved/plugin", marketplaceRoot: "/local/marketplace", marketplaceAvailable: true });
  amWAssert.equal(selected.kind, "central-snapshot");
});

amWTest("AM-W-T: install-agy.mjs calls installAgyFromCentralSnapshot imported from the central refresh module (structural stand-in)", () => {
  const code = amWCodeOf(new URL("./install-agy.mjs", import.meta.url));
  amWAssert.match(code, /\binstallAgyFromCentralSnapshot\s*\(/u);
  amWAssert.match(code, /from\s+["']\.\/lib\/agy-central-refresh\.mjs["']/u);
});

amWTest("AM-W-T: selecting central-snapshot runs installAgyFromCentralSnapshot with global scope against a fixture-bound config root", (t) => {
  t.todo("missing seam: runInteractiveInstaller() reads process.stdin, process.cwd() and the user home directly and exposes no way to inject installAgyFromCentralSnapshot, a home function or a CLI runner; a subprocess drive would resolve the real agy CLI by PATH. The wiring slice must export an injectable entry (for example runCentralSnapshotInstall({ deps, runCli, installAgyFromCentralSnapshot })) before this call can be pinned without touching a real home or a real agy installation.");
});

test("Agy installer never follows registry-file or parent aliases while updating", (t) => {
  const { newRoot, registryFile, root } = fixture(t);
  const unrelatedFile = join(root, "unrelated.json");
  const original = '{"entries":[],"marker":"keep"}\n';
  writeFileSync(unrelatedFile, original);
  symlinkSync(unrelatedFile, registryFile);
  assert.throws(() => updatePluginRegistry({ targetFile: registryFile, corePluginPath: newRoot }), /Unsafe plugin registry target/u);
  assert.equal(readFileSync(unrelatedFile, "utf8"), original);
  assert.deepEqual(readdirSync(join(root, ".agents")), ["plugins.json"]);

  rmSync(registryFile);
  const aliasParent = join(root, "alias-agents");
  symlinkSync(join(root, ".agents"), aliasParent);
  assert.throws(() => updatePluginRegistry({ targetFile: join(aliasParent, "plugins.json"), corePluginPath: newRoot }), /Unsafe plugin registry parent/u);
  assert.deepEqual(readdirSync(join(root, ".agents")), []);
});

// AC-110 (1): developer --refresh prints the plan first, changes nothing without confirmation, and ends in a readback.
function refreshHarness({ plan, answer = true, remediation = { status: "refreshed" } } = {}) {
  const calls = [], printed = [];
  const deps = {
    prepare: () => { calls.push("prepare"); return plan ?? { status: "prepared", actions: [{ kind: "cli", argv: ["plugin", "validate", "SRC"] }, { kind: "cli", argv: ["plugin", "uninstall", "agent-pipeline-core"] }, { kind: "cli", argv: ["plugin", "install", "SRC"] }] }; },
    sync: () => { calls.push("sync"); },
    remediate: () => { calls.push("remediate"); return remediation; },
    readback: () => { calls.push("readback"); return { lines: ["=== Readback (physical diagnostic) ==="] }; },
    confirm: async () => { calls.push("confirm"); return answer; },
    print: (line) => printed.push(line),
  };
  return { calls, printed, deps };
}

test("Agy --refresh prints the exact plan before any change, then syncs, remediates and reads back in order", async () => {
  const h = refreshHarness();
  const r = await installerModule.runDeveloperRefresh({ ...h.deps, syncFrom: "A", syncTo: "B" });
  assert.equal(r.status, "refreshed");
  assert.deepEqual(h.calls, ["prepare", "confirm", "sync", "remediate", "readback"]);
  const text = h.printed.join("\n");
  assert.match(text, /nothing has been changed yet/u);
  assert.match(text, /agy plugin uninstall agent-pipeline-core/u);
  assert.match(text, /not proof of what is loaded|never proof of what is loaded/u);
  assert.ok(h.printed.findIndex((l) => /nothing has been changed yet/u.test(l)) < h.printed.findIndex((l) => /Readback/u.test(l)));
});

test("Agy --refresh without confirmation changes nothing and names the repair", async () => {
  const h = refreshHarness({ answer: false });
  const r = await installerModule.runDeveloperRefresh({ ...h.deps, syncFrom: "A", syncTo: "B" });
  assert.equal(r.status, "declined");
  assert.equal(r.exitCode, 1);
  assert.deepEqual(h.calls, ["prepare", "confirm"]);
  assert.match(h.printed.join("\n"), /Repair:/u);
});

test("Agy --refresh --yes skips only the question; a refused plan changes nothing", async () => {
  const h = refreshHarness();
  assert.equal((await installerModule.runDeveloperRefresh({ ...h.deps, yes: true })).status, "refreshed");
  assert.equal(h.calls.includes("confirm"), false);
  assert.equal(h.calls.includes("sync"), false, "no sync step when the approved directory is used in place");
  const refused = refreshHarness({ plan: { status: "refused", reason: "ATR-CLI-CAPABILITY" } });
  const r = await installerModule.runDeveloperRefresh({ ...refused.deps, yes: true });
  assert.equal(r.status, "refused");
  assert.deepEqual(refused.calls, ["prepare"]);
});

test("Agy --yes without --refresh is refused with a repair, before any interactive prompt", () => {
  const parsed = installerModule.parseInstallerArguments(["--yes"]);
  assert.match(parsed.error, /--yes is accepted only together with --refresh/u);
  assert.match(parsed.error, /Repair:/u);
  assert.deepEqual(installerModule.parseInstallerArguments(["--refresh", "--yes"]), { help: false, refresh: true, yes: true });
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("./install-agy.mjs", import.meta.url)), "--yes"], { encoding: "utf8", timeout: 20000, input: "" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Repair:/u);
});

test("Agy --refresh readback reports the physical topology and never claims a loaded path", () => {
  const lines = installerModule.readbackLines({ source: { content: { sha256: "a" } }, managed: { candidates: [{ content: { sha256: "b" } }] }, importState: { entries: [{}] } }).join("\n");
  assert.match(lines, /managed copies: 1 \(content b\)/u);
  assert.match(lines, /import manifest entries: 1/u);
  assert.match(lines, /not proof of what is loaded/u);
  assert.match(installerUsageLines().join("\n"), /--refresh/u);
});

test("Agy marketplace sync replaces the copy with path APIs and refuses an unsafe target", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agy-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const from = join(root, "src"), to = join(root, "m", "plugins", "pipeline-core");
  mkdirSync(from, { recursive: true }); mkdirSync(to, { recursive: true });
  writeFileSync(join(from, "plugin.json"), "{}");
  writeFileSync(join(to, "stale.txt"), "old");
  installerModule.syncMarketplaceCopy({ from, to });
  assert.deepEqual(readdirSync(to), ["plugin.json"]);
  assert.throws(() => installerModule.syncMarketplaceCopy({ from, to: join(root, "elsewhere") }), /Unsafe marketplace copy target/u);
});

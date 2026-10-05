// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { verifyInstalledPluginAttestation } from "../lib/installed-plugin-attestation.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import {
  HOST_RESULT_SCHEMA,
  INSTALLED_PLUGIN_PROTECTED_PATHS_BY_PROVIDER,
  installedPluginAttestationSetupCommand,
  readInstalledPluginAttestationSetup,
  readExternalInstalledPluginReceipt,
  resolveAntigravityRegistryInstalledRoot,
  verifyLocalDevelopmentInstalledPluginReceipt,
  writeClaudeRegistryInstalledPluginReceipt,
  writeCodexRegistryInstalledPluginReceipt,
  writeLocalDevelopmentInstalledPluginReceipt,
} from "./installed-plugin-attestation-host.mjs";
import { observePipelineStartPreflight } from "./pipeline-start-preflight.mjs";
import { observeAntigravityLoadedTopologyWithWiring } from "../lib/antigravity-topology-refresh-host.mjs";
import { observePublicCoreIdentity } from "../lib/public-core-observation.mjs";
import { planGovernanceScopeDecision, applyGovernanceScopeDecision } from "../lib/governance-scope.mjs";

const cases = [];
function check(name, run) {
  cases.push({ id: `IPH${String(cases.length + 1).padStart(2, "0")}`, name, run });
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fixture(provider = "codex") {
  const base = mkdtempSync(join(tmpdir(), "ipa-host-"));
  const sourceRoot = join(base, "source");
  const sourcePluginRoot = join(sourceRoot, "plugins", "pipeline-core");
  const antigravityConfigRoot = join(base, "antigravity-config");
  const antigravityWorkspaceRoot = join(base, "antigravity-workspace");
  const installedPluginRoot = provider === "antigravity"
    ? join(antigravityConfigRoot, "config", "plugins", "agent-pipeline-core")
    : join(base, "installed", "pipeline-core", "1.2.3-test.1");
  const receiptDirectory = join(base, "host", "receipts");
  const manifest = `${JSON.stringify({
    name: "pipeline-core", version: "1.2.3-test.1", description: "fixture",
    hooks: "./hooks/codex-hooks.json", author: { name: "fixture" }, license: "SUL-1.0",
    interface: { displayName: "Fixture" },
  }, null, 2)}\n`;
  for (const root of [sourcePluginRoot, installedPluginRoot]) {
    mkdirSync(join(root, ".codex-plugin"), { recursive: true });
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    mkdirSync(join(root, "hooks"), { recursive: true });
    mkdirSync(join(root, "agents"), { recursive: true });
    mkdirSync(join(root, "skills", "critic-review"), { recursive: true });
    writeFileSync(join(root, ".codex-plugin", "plugin.json"), manifest);
    writeFileSync(join(root, ".claude-plugin", "plugin.json"), `${JSON.stringify({ name: "pipeline-core", version: "1.2.3-test.1", description: "fixture", author: { name: "fixture" }, license: "SUL-1.0" })}\n`);
    writeFileSync(join(root, "plugin.json"), `${JSON.stringify({ name: "agent-pipeline-core", version: "1.2.3-test.1", description: "fixture" })}\n`);
    writeFileSync(join(root, "hooks.json"), "{}\n");
    writeFileSync(join(root, "hooks", "codex-hooks.json"), "{}\n");
    writeFileSync(join(root, "hooks", "codex-pretool-guard.mjs"), "export const guard = true;\n");
    writeFileSync(join(root, "hooks", "guard-lifecycle-ready.mjs"), "export const guard = true;\n");
    writeFileSync(join(root, "hooks", "antigravity-pretool-guard.mjs"), "export const guard = true;\n");
    writeFileSync(join(root, "hooks", "antigravity-start-hint.mjs"), "export const start = true;\n");
    writeFileSync(join(root, "agents", "critic.md"), "critic\n");
    writeFileSync(join(root, "skills", "critic-review", "SKILL.md"), "review\n");
  }
  git(sourceRoot, ["init", "--initial-branch=feature/fixture"]);
  git(sourceRoot, ["remote", "add", "origin", "https://example.test/owner/plugin.git"]);
  git(sourceRoot, ["add", "."]);
  git(sourceRoot, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"]);
  if (provider === "antigravity") {
    mkdirSync(join(antigravityWorkspaceRoot, ".agents"), { recursive: true });
    writeFileSync(join(antigravityWorkspaceRoot, ".agents", "plugins.json"), `${JSON.stringify({ entries: [{ path: sourcePluginRoot }] })}\n`);
    writeFileSync(join(antigravityConfigRoot, "config", "import_manifest.json"), `${JSON.stringify({ imports: [{ name: "agent-pipeline-core", source: sourcePluginRoot }] })}\n`);
  }
  const protectedPaths = INSTALLED_PLUGIN_PROTECTED_PATHS_BY_PROVIDER[provider];
  const input = {
    provider, plugin: { name: "pipeline-core", version: "1.2.3-test.1" },
    sourcePluginRoot, installedPluginRoot, protectedPaths,
  };
  return { base, sourceRoot, sourcePluginRoot, installedPluginRoot, receiptDirectory, protectedPaths, input, antigravityConfigRoot, antigravityWorkspaceRoot, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

check("post-install readback is runner-neutral and writes path-free receipts that the core verifies", (t) => {
 for (const provider of ["codex", "claude", "antigravity"]) {
  const repo = fixture(provider); t.after(repo.cleanup);
  const result = writeLocalDevelopmentInstalledPluginReceipt(repo.input, { receiptDirectory: repo.receiptDirectory });
  assert.equal(result.status, "written", JSON.stringify(result));
  assert.equal(result.schema, HOST_RESULT_SCHEMA);
  const names = readdirSync(repo.receiptDirectory);
  assert.equal(names.length, 2);
  const receiptName = names.find((name) => !name.endsWith(".source.json"));
  const raw = readFileSync(join(repo.receiptDirectory, receiptName), "utf8");
  assert.equal(raw.includes(repo.base), false, "durable receipt must contain no host path");
  assert.equal(raw.includes("password"), false);
  const verified = verifyInstalledPluginAttestation({
    provider, plugin: repo.input.plugin, installedPluginRoot: repo.installedPluginRoot,
    source: { class: "local-development", sourcePluginRoot: repo.sourcePluginRoot }, protectedPaths: repo.protectedPaths,
  }, { readExternalReceipt: (request) => readExternalInstalledPluginReceipt(request, { receiptDirectory: repo.receiptDirectory }) });
  assert.equal(verified.status, "verified", JSON.stringify(verified));
  assert.equal(verified.receiptId, result.receiptId);
  const bootstrap = verifyLocalDevelopmentInstalledPluginReceipt({
    provider, plugin: repo.input.plugin, installedPluginRoot: repo.installedPluginRoot,
    ...(["antigravity", "claude"].includes(provider)
      ? { registryInstalledPluginRoot: repo.installedPluginRoot }
      : { registrySourcePluginRoot: repo.sourcePluginRoot }),
    protectedPaths: repo.protectedPaths,
  }, {
    receiptDirectory: repo.receiptDirectory,
    observe: (observation) => observePublicCoreIdentity(observation),
    ...(provider === "antigravity" ? {
      antigravityConfigRoot: repo.antigravityConfigRoot,
      antigravityWorkspaceRoot: repo.antigravityWorkspaceRoot,
    } : {}),
  });
  assert.equal(bootstrap.status, "verified", JSON.stringify(bootstrap));
 }
});

check("terminal-template attestation producer preserves Codex setupAction argv and verifies its receipt", (t) => {
  const repo = fixture("codex"); t.after(repo.cleanup);
  const launcher = join(repo.installedPluginRoot, "scripts", "installed-plugin-attestation-host.mjs");
  const command = installedPluginAttestationSetupCommand({
    provider: "codex", version: repo.input.plugin.version,
    installedPluginRoot: repo.installedPluginRoot, launcher,
  });
  assert.deepEqual(command.argv, [
    launcher, "write-local-from-codex-registry", "--version", repo.input.plugin.version,
    "--installed-plugin-root", repo.installedPluginRoot,
  ]);
  const pluginList = () => JSON.stringify({ installed: [{
    pluginId: "pipeline-core@agent-pipeline-local", name: "pipeline-core", marketplaceName: "agent-pipeline-local",
    version: repo.input.plugin.version, installed: true, enabled: true,
    source: { source: "local", path: repo.sourcePluginRoot },
    marketplaceSource: { sourceType: "local", source: dirname(dirname(repo.sourcePluginRoot)) },
  }], available: [] });
  assert.equal(writeCodexRegistryInstalledPluginReceipt({
    provider: "codex", plugin: repo.input.plugin, installedPluginRoot: repo.installedPluginRoot,
    protectedPaths: repo.protectedPaths,
  }, { receiptDirectory: repo.receiptDirectory, readPluginList: pluginList }).status, "written");
  const readback = readInstalledPluginAttestationSetup({
    provider: "codex", version: repo.input.plugin.version, installedPluginRoot: repo.installedPluginRoot,
  }, { receiptDirectory: repo.receiptDirectory, readPluginList: pluginList });
  assert.equal(readback.status, "verified", JSON.stringify(readback));
  assert.equal(readback.code, "IPA-HOST-RECEIPT-VERIFIED");
});

check("Codex accepts an exact real-directory marketplace copy bound to its clean Git source", (t) => {
  const repo = fixture("codex"); t.after(repo.cleanup);
  const marketplaceRoot = join(repo.base, "marketplace");
  const marketplacePluginRoot = join(marketplaceRoot, "plugins", "pipeline-core");
  cpSync(repo.sourcePluginRoot, marketplacePluginRoot, { recursive: true });

  const pluginList = () => JSON.stringify({ installed: [{
    pluginId: "pipeline-core@agent-pipeline-local",
    name: "pipeline-core",
    marketplaceName: "agent-pipeline-local",
    version: repo.input.plugin.version,
    installed: true,
    enabled: true,
    source: { source: "local", path: marketplacePluginRoot },
    marketplaceSource: { sourceType: "local", source: marketplaceRoot },
  }], available: [] });

  const command = installedPluginAttestationSetupCommand({
    provider: "codex",
    version: repo.input.plugin.version,
    sourcePluginRoot: repo.sourcePluginRoot,
    installedPluginRoot: repo.installedPluginRoot,
    launcher: join(repo.installedPluginRoot, "scripts", "installed-plugin-attestation-host.mjs"),
  });
  assert.equal(command.argv.includes("--source-plugin-root"), true);
  assert.equal(command.argv.includes(repo.sourcePluginRoot), true);

  const written = writeCodexRegistryInstalledPluginReceipt({
    provider: "codex",
    plugin: repo.input.plugin,
    sourcePluginRoot: repo.sourcePluginRoot,
    installedPluginRoot: repo.installedPluginRoot,
    protectedPaths: repo.protectedPaths,
  }, {
    receiptDirectory: repo.receiptDirectory,
    readPluginList: pluginList,
  });
  assert.equal(written.status, "written", JSON.stringify(written));

  const verified = verifyLocalDevelopmentInstalledPluginReceipt({
    provider: "codex",
    plugin: repo.input.plugin,
    installedPluginRoot: repo.installedPluginRoot,
    registrySourcePluginRoot: marketplacePluginRoot,
    protectedPaths: repo.protectedPaths,
  }, { receiptDirectory: repo.receiptDirectory });
  assert.equal(verified.status, "verified", JSON.stringify(verified));
});

check("readback is request-selected and a changed installed copy cannot reuse a receipt", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  assert.equal(writeLocalDevelopmentInstalledPluginReceipt(repo.input, { receiptDirectory: repo.receiptDirectory }).status, "written");
  writeFileSync(join(repo.installedPluginRoot, "agents", "critic.md"), "changed\n");
  const result = verifyInstalledPluginAttestation({
    provider: "codex", plugin: repo.input.plugin, installedPluginRoot: repo.installedPluginRoot,
    source: { class: "local-development", sourcePluginRoot: repo.sourcePluginRoot }, protectedPaths: repo.protectedPaths,
  }, { readExternalReceipt: (request) => readExternalInstalledPluginReceipt(request, { receiptDirectory: repo.receiptDirectory }) });
  assert.equal(result.status, "rejected");
  assert.ok(["IPA-LOCAL-SOURCE-MISMATCH", "IPA-LOCAL-SOURCE-UNVERIFIED"].includes(result.reasonCodes[0]));
});

check("receipt storage inside source or installed trees is rejected", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  for (const receiptDirectory of [join(repo.sourcePluginRoot, "receipts"), join(repo.installedPluginRoot, "receipts")]) {
    const result = writeLocalDevelopmentInstalledPluginReceipt(repo.input, { receiptDirectory });
    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "IPA-HOST-OPERATION");
  }
});

check("dirty source, stale copy, and embedded credential origin fail before a receipt survives", (t) => {
  for (const mutate of [
    (repo) => writeFileSync(join(repo.sourcePluginRoot, "dirty.txt"), "dirty\n"),
    (repo) => writeFileSync(join(repo.installedPluginRoot, "agents", "critic.md"), "stale\n"),
    (repo) => {
      const gitRoot = dirname(dirname(repo.sourcePluginRoot));
      const config = join(gitRoot, ".git", "config");
      writeFileSync(config, readFileSync(config, "utf8").replace("https://example.test/owner/plugin.git", "https://user:secret@example.test/owner/plugin.git"));
    },
  ]) {
    const repo = fixture();
    try {
      mutate(repo);
      const result = writeLocalDevelopmentInstalledPluginReceipt(repo.input, { receiptDirectory: repo.receiptDirectory });
      assert.equal(result.status, "rejected", JSON.stringify(result));
      assert.equal(readdirSync(repo.receiptDirectory).length, 0);
    } finally { repo.cleanup(); }
  }
});

check("bootstrap fails closed when its bound host locator is missing or stale", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  mkdirSync(repo.receiptDirectory, { recursive: true, mode: 0o700 });
  const input = { provider: "codex", plugin: repo.input.plugin, installedPluginRoot: repo.installedPluginRoot, protectedPaths: repo.protectedPaths };
  input.registrySourcePluginRoot = repo.sourcePluginRoot;
  assert.equal(verifyLocalDevelopmentInstalledPluginReceipt(input, { receiptDirectory: repo.receiptDirectory }).reasonCodes[0], "IPA-HOST-LOCATOR-UNAVAILABLE");
  assert.equal(writeLocalDevelopmentInstalledPluginReceipt(repo.input, { receiptDirectory: repo.receiptDirectory }).status, "written");
  const locatorName = readdirSync(repo.receiptDirectory).find((name) => name.endsWith(".source.json"));
  const locatorPath = join(repo.receiptDirectory, locatorName);
  const locator = JSON.parse(readFileSync(locatorPath, "utf8"));
  writeFileSync(locatorPath, `${JSON.stringify({ ...locator, installedRootPathSha256: "0".repeat(64) })}\n`, { mode: 0o600 });
  assert.equal(verifyLocalDevelopmentInstalledPluginReceipt(input, { receiptDirectory: repo.receiptDirectory }).reasonCodes[0], "IPA-HOST-LOCATOR-UNAVAILABLE");
});

check("unsupported provider and unsorted or escaping protected paths are refused", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  for (const input of [
    { ...repo.input, provider: "unknown" },
    { ...repo.input, protectedPaths: [...repo.protectedPaths].reverse() },
    { ...repo.input, protectedPaths: ["../secret"] },
  ]) assert.equal(writeLocalDevelopmentInstalledPluginReceipt(input, { receiptDirectory: repo.receiptDirectory }).reason, "IPA-HOST-INPUT");
});

check("an exact Codex local registry/cache binding needs no receipt and a divergent cache stays closed", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  const activation = planGovernanceScopeDecision({ rootDir: repo.sourceRoot, decision: "enroll", by: "Installed plugin preflight fixture" });
  assert.equal(applyGovernanceScopeDecision(activation, { activate: true, planSha256: activation.planSha256 }).state, "active");
  const marketplaceRoot = join(repo.base, "marketplace");
  const marketplacePluginRoot = join(marketplaceRoot, "plugins", "pipeline-core");
  cpSync(repo.sourcePluginRoot, marketplacePluginRoot, { recursive: true });
  const pluginList = () => JSON.stringify({ installed: [{
    pluginId: "pipeline-core@agent-pipeline-local", name: "pipeline-core", marketplaceName: "agent-pipeline-local",
    version: "1.2.3-test.1", installed: true, enabled: true,
    source: { source: "local", path: marketplacePluginRoot },
    marketplaceSource: { sourceType: "local", source: marketplaceRoot },
  }], available: [] });
  const scriptUrl = pathToFileURL(join(repo.installedPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href;
  const inspect = (verifyLocalInstalledPluginReceiptFn) => observePipelineStartPreflight({
    env: {}, pluginList, scriptUrl, cwd: repo.sourceRoot,
    read: () => JSON.stringify({ version: "1.2.3-test.1" }),
    verifyLocalInstalledPluginReceiptFn,
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "repository-unresolved" }),
    requireProjectOnboardingReadyFn: () => undefined,
  });
  const direct = inspect(() => { throw new Error("exact registry/cache binding must not consume a receipt"); });
  assert.equal(direct.status, "ready", JSON.stringify(direct));
  assert.equal(direct.installedPluginAttestation.status, "not-required");

  writeFileSync(join(repo.installedPluginRoot, "unexpected-cache-drift.mjs"), "export const drift = true;\n");
  const divergent = inspect(() => ({
    schema: "pipeline.installed-plugin-attestation-verification.v1",
    status: "unavailable",
    reasonCodes: ["IPA-HOST-LOCATOR-UNAVAILABLE"],
  }));
  assert.equal(divergent.status, "plugin-attestation-required", JSON.stringify(divergent));
  assert.ok(divergent.installedPluginAttestation.reasonCodes.includes("IPA-HOST-LOCATOR-UNAVAILABLE"));

  const claudeRepo = fixture("claude"); t.after(claudeRepo.cleanup);
  const claudeActivation = planGovernanceScopeDecision({ rootDir: claudeRepo.sourceRoot, decision: "enroll", by: "Installed plugin preflight fixture" });
  assert.equal(applyGovernanceScopeDecision(claudeActivation, { activate: true, planSha256: claudeActivation.planSha256 }).state, "active");
  // NVA-B8-10: Claude may load directly from the one registered directory
  // marketplace. That is not a source-to-copy installation: the registry's
  // physical marketplace plugin root and the loaded plugin root are the same
  // directory, so demanding a separate receipt would be impossible and wrong.
  const claudeDirectMarketplace = join(claudeRepo.base, "direct-marketplace");
  const claudeDirectPluginRoot = join(claudeDirectMarketplace, "plugins", "pipeline-core");
  cpSync(claudeRepo.sourcePluginRoot, claudeDirectPluginRoot, { recursive: true });
  const claudeDirectList = () => JSON.stringify([{
    id: "pipeline-core@agent-pipeline-local", version: "1.2.3-test.1", enabled: true,
    scope: "user", installPath: claudeDirectPluginRoot,
  }]);
  const claudeDirectMarketplaces = () => JSON.stringify({
    "agent-pipeline-local": { source: { source: "directory", path: claudeDirectMarketplace } },
  });
  const claudeDirect = observePipelineStartPreflight({
    env: { CLAUDECODE: "1" }, pluginList: claudeDirectList, knownMarketplaces: claudeDirectMarketplaces,
    scriptUrl: pathToFileURL(join(claudeDirectPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href,
    cwd: claudeRepo.sourceRoot, read: () => JSON.stringify({ version: "1.2.3-test.1" }),
    verifyLocalInstalledPluginReceiptFn: () => { throw new Error("direct directory must not consume a receipt"); },
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "repository-unresolved" }),
    requireProjectOnboardingReadyFn: () => undefined,
  });
  assert.equal(claudeDirect.status, "ready", JSON.stringify(claudeDirect));
  assert.equal(claudeDirect.installedPluginAttestation.status, "not-required");

  const claudeDirectWithoutInstallPath = observePipelineStartPreflight({
    env: { CLAUDECODE: "1" },
    pluginList: () => JSON.stringify([{
      id: "pipeline-core@agent-pipeline-local", version: "1.2.3-test.1", enabled: true, scope: "user",
    }]),
    knownMarketplaces: claudeDirectMarketplaces,
    scriptUrl: pathToFileURL(join(claudeDirectPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href,
    cwd: claudeRepo.sourceRoot, read: () => JSON.stringify({ version: "1.2.3-test.1" }),
    verifyLocalInstalledPluginReceiptFn: () => { throw new Error("direct directory must not consume a receipt"); },
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "repository-unresolved" }),
    requireProjectOnboardingReadyFn: () => undefined,
  });
  assert.equal(claudeDirectWithoutInstallPath.status, "ready", JSON.stringify(claudeDirectWithoutInstallPath));
  assert.equal(claudeDirectWithoutInstallPath.installedPluginAttestation.status, "not-required");

  // Windows Claude retains a cache path in installPath even when its current
  // process executes directly from the directory marketplace. The observed
  // script root and exact directory registration prove the direct topology;
  // the stale cache metadata must not turn that into an unreachable receipt
  // repair path.
  const claudeDirectWithCacheMetadata = observePipelineStartPreflight({
    env: { CLAUDECODE: "1" },
    pluginList: () => JSON.stringify([{
      id: "pipeline-core@agent-pipeline-local", version: "1.2.3-test.1", enabled: true,
      scope: "user", installPath: claudeRepo.installedPluginRoot,
    }]),
    knownMarketplaces: claudeDirectMarketplaces,
    scriptUrl: pathToFileURL(join(claudeDirectPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href,
    cwd: claudeRepo.sourceRoot, read: () => JSON.stringify({ version: "1.2.3-test.1" }),
    verifyLocalInstalledPluginReceiptFn: () => { throw new Error("direct directory must not consume a receipt"); },
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "repository-unresolved" }),
    requireProjectOnboardingReadyFn: () => undefined,
  });
  assert.equal(claudeDirectWithCacheMetadata.status, "ready", JSON.stringify(claudeDirectWithCacheMetadata));
  assert.equal(claudeDirectWithCacheMetadata.installedPluginAttestation.status, "not-required");

  const claudeMarketplace = join(claudeRepo.base, "gitless-marketplace");
  cpSync(claudeRepo.sourcePluginRoot, join(claudeMarketplace, "plugins", "pipeline-core"), { recursive: true });
  assert.equal(existsSync(join(claudeMarketplace, ".git")), false);
  const claudeList = () => JSON.stringify([{
    id: "pipeline-core@agent-pipeline-local", version: "1.2.3-test.1", enabled: true,
    scope: "user", installPath: claudeRepo.installedPluginRoot,
  }]);
  const knownMarketplaces = () => JSON.stringify({
    "agent-pipeline-local": { source: { source: "directory", path: claudeMarketplace } },
  });
  const claudeInspect = () => observePipelineStartPreflight({
    env: { CLAUDECODE: "1" }, pluginList: claudeList, knownMarketplaces,
    scriptUrl: pathToFileURL(join(claudeRepo.installedPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href,
    cwd: claudeRepo.sourceRoot, read: () => JSON.stringify({ version: "1.2.3-test.1" }),
    verifyLocalInstalledPluginReceiptFn: (input) => verifyLocalDevelopmentInstalledPluginReceipt(input, { receiptDirectory: claudeRepo.receiptDirectory }),
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "repository-unresolved" }),
    requireProjectOnboardingReadyFn: () => undefined,
  });
  const claudeBefore = claudeInspect();
  assert.equal(claudeBefore.status, "plugin-attestation-required", JSON.stringify(claudeBefore));
  assert.equal(claudeBefore.nextAction, null, "a gitless marketplace copy cannot reconstruct its clean Git source");
  assert.equal(writeClaudeRegistryInstalledPluginReceipt({
    provider: "claude", plugin: claudeRepo.input.plugin, installedPluginRoot: claudeRepo.installedPluginRoot,
  }, { receiptDirectory: claudeRepo.receiptDirectory, readPluginList: claudeList, readKnownMarketplaces: knownMarketplaces }).reason, "IPA-HOST-SOURCE-REQUIRED");
  const gitlessMarketplacePluginRoot = join(claudeMarketplace, "plugins", "pipeline-core");
  assert.equal(writeClaudeRegistryInstalledPluginReceipt({
    provider: "claude", plugin: claudeRepo.input.plugin,
    sourcePluginRoot: gitlessMarketplacePluginRoot, installedPluginRoot: claudeRepo.installedPluginRoot,
  }, { receiptDirectory: claudeRepo.receiptDirectory, readPluginList: claudeList, readKnownMarketplaces: knownMarketplaces }).status, "rejected");
  assert.equal(writeClaudeRegistryInstalledPluginReceipt({
    provider: "claude", plugin: claudeRepo.input.plugin,
    sourcePluginRoot: claudeRepo.sourcePluginRoot, installedPluginRoot: claudeRepo.installedPluginRoot,
  }, { receiptDirectory: claudeRepo.receiptDirectory, readPluginList: claudeList, readKnownMarketplaces: knownMarketplaces }).status, "written");
  assert.equal(claudeInspect().status, "ready");

  const agyRepo = fixture("antigravity"); t.after(agyRepo.cleanup);
  const agyWorkspaceRegistryPath = join(agyRepo.antigravityWorkspaceRoot, ".agents", "plugins.json");
  const agyGlobalRegistryPath = join(agyRepo.antigravityConfigRoot, "config", "plugins.json");
  const agyImportManifestPath = join(agyRepo.antigravityConfigRoot, "config", "import_manifest.json");
  writeFileSync(agyWorkspaceRegistryPath, `${JSON.stringify({ entries: [{ path: agyRepo.installedPluginRoot }] })}\n`);
  writeFileSync(agyImportManifestPath, `${JSON.stringify({ imports: [{ name: "agent-pipeline-core", source: agyRepo.installedPluginRoot }] })}\n`);
  const agyManifestRead = (path) => {
    const value = String(path);
    if (value.endsWith("/plugin.json") && !value.includes("/.codex-plugin/")) {
      return JSON.stringify({ version: "1.2.3-test.1" });
    }
    if (value.endsWith("/.codex-plugin/plugin.json")) {
      return JSON.stringify({ version: "9.9.9+wrong-codex-manifest" });
    }
    throw new Error(`unexpected Antigravity manifest path: ${path}`);
  };
  const agyInspect = (observeTopology) => observePipelineStartPreflight({
    env: { ANTIGRAVITY_AGENT: "1" }, pluginList: () => JSON.stringify({}),
    observeGovernanceScopeFn: ({ rootDir }) => ({ schema: "pipeline.governance-scope.v1", state: "active", root: rootDir, scopeKey: "a".repeat(64), repositoryKind: "git", provenance: { kind: "isolated-unit-capability", refs: [] }, diagnostics: [], requiresEnforcement: true, hintAllowed: false }),
    scriptUrl: pathToFileURL(join(agyRepo.installedPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href,
    cwd: agyRepo.antigravityWorkspaceRoot, antigravityConfigRoot: agyRepo.antigravityConfigRoot, read: agyManifestRead,
    ...(observeTopology ? { observeAntigravityLoadedTopologyFn: observeTopology } : {}),
    verifyLocalInstalledPluginReceiptFn: (input) => verifyLocalDevelopmentInstalledPluginReceipt(input, { receiptDirectory: agyRepo.receiptDirectory }),
    observeAntigravityHardEnforcementFn: () => ({ observed: true }),
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "repository-unresolved" }),
    requireProjectOnboardingReadyFn: () => undefined,
  });
  const agyDirect = agyInspect();
  assert.equal(agyDirect.status, "ready", JSON.stringify(agyDirect));
  assert.equal(agyDirect.installedPluginAttestation.status, "not-required");
  assert.notEqual(agyDirect.nextAction?.kind, "host-postinstall", "an exact Antigravity registry root needs no host receipt repair");

  // The installed copy is deliberately not the same root as the isolated
  // topology observed below. The real topology observer therefore returns a
  // current registration for a different gitless loaded root; preflight must
  // refuse to bind that registration to the installed copy without proposing
  // a writer. The three registry variants are also exercised against the real
  // physical root resolver below.
  const topologyPluginRoot = join(agyRepo.base, "topology", "direct-plugin");
  const topologyConfigRoot = join(agyRepo.base, "topology-config");
  const topologyWorkspaceRoot = join(agyRepo.base, "topology-workspace");
  mkdirSync(join(agyRepo.base, "topology"), { recursive: true });
  cpSync(agyRepo.installedPluginRoot, topologyPluginRoot, { recursive: true });
  mkdirSync(topologyConfigRoot, { recursive: true });
  mkdirSync(join(topologyWorkspaceRoot, ".agents"), { recursive: true });
  writeFileSync(join(topologyWorkspaceRoot, ".agents", "plugins.json"), `${JSON.stringify({ entries: [{ path: topologyPluginRoot }] })}\n`);
  const observeOtherCurrentTopology = () => observeAntigravityLoadedTopologyWithWiring({
    loadedPluginRoot: topologyPluginRoot,
    configRoot: topologyConfigRoot,
    workspaceRoot: topologyWorkspaceRoot,
  });
  const registryCases = [
    { name: "no physical registry", entries: [] },
    { name: "conflicting duplicate roots", entries: [agyRepo.installedPluginRoot, agyRepo.sourcePluginRoot] },
    { name: "unavailable external root", entries: [join(agyRepo.base, "other")] },
  ];
  for (const registryCase of registryCases) {
    rmSync(agyWorkspaceRegistryPath, { force: true });
    rmSync(agyGlobalRegistryPath, { force: true });
    if (registryCase.entries.length > 0) {
      writeFileSync(agyGlobalRegistryPath, `${JSON.stringify({ entries: registryCase.entries.map((path) => ({ path })) })}\n`);
    }
    assert.equal(resolveAntigravityRegistryInstalledRoot({
      installedPluginRoot: agyRepo.installedPluginRoot,
      configRoot: agyRepo.antigravityConfigRoot,
      workspaceRoot: agyRepo.antigravityWorkspaceRoot,
    }), null, `${registryCase.name} must not resolve a registered install root`);
    const refused = agyInspect(observeOtherCurrentTopology);
    assert.equal(refused.status, "plugin-attestation-required", JSON.stringify(refused));
    assert.equal(refused.nextAction, null);
    assert.equal(refused.installedPluginAttestation.reasonCodes[0], "IPA-HOST-REGISTRY-BINDING-UNAVAILABLE");
  }

  const rootEntrypoint = readFileSync(new URL("../../../install-agy.mjs", import.meta.url), "utf8");
  assert.match(rootEntrypoint, /\.\/plugins\/pipeline-core\/install-agy\.mjs/u);
  assert.match(rootEntrypoint, /runInteractiveInstaller\(\)/u);
  const shippedEntrypoint = readFileSync(new URL("../install-agy.mjs", import.meta.url), "utf8");
  assert.match(shippedEntrypoint, new RegExp(String.raw`if \(isDirectInvocation\(import\.meta\.url\)\) \{[\s\S]*?runInteractiveInstaller\(\);`, "u"));
});

assert.equal(cases.length, 9, "the complete installed-plugin-attestation host corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});

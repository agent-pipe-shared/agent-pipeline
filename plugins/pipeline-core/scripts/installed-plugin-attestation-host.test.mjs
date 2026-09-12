// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { verifyInstalledPluginAttestation } from "../lib/installed-plugin-attestation.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import {
  HOST_RESULT_SCHEMA,
  INSTALLED_PLUGIN_PROTECTED_PATHS_BY_PROVIDER,
  readExternalInstalledPluginReceipt,
  verifyLocalDevelopmentInstalledPluginReceipt,
  writeClaudeRegistryInstalledPluginReceipt,
  writeCodexRegistryInstalledPluginReceipt,
  writeLocalDevelopmentInstalledPluginReceipt,
} from "./installed-plugin-attestation-host.mjs";
import { observePipelineStartPreflight } from "./pipeline-start-preflight.mjs";
import { attestAntigravityMarketplaceCopy } from "../install-agy.mjs";

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
  const installedPluginRoot = join(base, "installed", "pipeline-core", "1.2.3-test.1");
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
  const protectedPaths = INSTALLED_PLUGIN_PROTECTED_PATHS_BY_PROVIDER[provider];
  const input = {
    provider, plugin: { name: "pipeline-core", version: "1.2.3-test.1" },
    sourcePluginRoot, installedPluginRoot, protectedPaths,
  };
  return { base, sourcePluginRoot, installedPluginRoot, receiptDirectory, protectedPaths, input, cleanup: () => rmSync(base, { recursive: true, force: true }) };
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
  }, { receiptDirectory: repo.receiptDirectory });
  assert.equal(bootstrap.status, "verified", JSON.stringify(bootstrap));
 }
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

check("missing receipt stays non-ready, registry host repair writes it, and renewed preflight becomes ready", (t) => {
  const repo = fixture(); t.after(repo.cleanup);
  const marketplaceRoot = dirname(dirname(repo.sourcePluginRoot));
  const pluginList = () => JSON.stringify({ installed: [{
    pluginId: "pipeline-core@agent-pipeline-local", name: "pipeline-core", marketplaceName: "agent-pipeline-local",
    version: "1.2.3-test.1", installed: true, enabled: true,
    source: { source: "local", path: repo.sourcePluginRoot },
    marketplaceSource: { sourceType: "local", source: marketplaceRoot },
  }], available: [] });
  const scriptUrl = pathToFileURL(join(repo.installedPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href;
  const inspect = () => observePipelineStartPreflight({
    env: {}, pluginList, scriptUrl, cwd: repo.base,
    read: () => JSON.stringify({ version: "1.2.3-test.1" }),
    verifyLocalInstalledPluginReceiptFn: (input) => verifyLocalDevelopmentInstalledPluginReceipt(input, { receiptDirectory: repo.receiptDirectory }),
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "repository-unresolved" }),
    requireProjectOnboardingReadyFn: () => undefined,
  });
  const before = inspect();
  assert.equal(before.status, "plugin-attestation-required");
  assert.equal(before.nextAction.kind, "host-postinstall");
  assert.equal(before.installedPluginAttestation.setupAction.argv.includes("write-local-from-codex-registry"), true);
  const repaired = writeCodexRegistryInstalledPluginReceipt({
    provider: "codex", plugin: repo.input.plugin, installedPluginRoot: repo.installedPluginRoot,
    protectedPaths: repo.protectedPaths,
  }, { receiptDirectory: repo.receiptDirectory, readPluginList: pluginList });
  assert.equal(repaired.status, "written", JSON.stringify(repaired));
  const after = inspect();
  assert.equal(after.status, "ready", JSON.stringify(after));
  assert.equal(after.installedPluginAttestation.status, "verified");

  const claudeRepo = fixture("claude"); t.after(claudeRepo.cleanup);
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
    cwd: claudeRepo.base, read: () => JSON.stringify({ version: "1.2.3-test.1" }),
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
  const agyRegistry = () => [JSON.stringify({ entries: [{ path: agyRepo.installedPluginRoot }] })];
  const agyInspect = (registries = agyRegistry) => observePipelineStartPreflight({
    env: { ANTIGRAVITY_AGENT: "1" }, pluginList: () => JSON.stringify({}),
    scriptUrl: pathToFileURL(join(agyRepo.installedPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href,
    cwd: agyRepo.base, read: () => JSON.stringify({ version: "1.2.3-test.1" }),
    antigravityPluginRegistries: registries,
    verifyLocalInstalledPluginReceiptFn: (input) => verifyLocalDevelopmentInstalledPluginReceipt(input, { receiptDirectory: agyRepo.receiptDirectory }),
    observeAntigravityHardEnforcementFn: () => ({ observed: true }),
    observePrePushHookInstallationFn: () => ({ state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ state: "repository-unresolved" }),
    requireProjectOnboardingReadyFn: () => undefined,
  });
  const agyBefore = agyInspect();
  assert.equal(agyBefore.status, "plugin-attestation-required", JSON.stringify(agyBefore));
  assert.equal(agyBefore.nextAction, null, "a legacy AGY copy has no trustworthy source callsite to print");
  const agyInstalled = attestAntigravityMarketplaceCopy({
    sourcePluginRoot: agyRepo.sourcePluginRoot,
    installedPluginRoot: agyRepo.installedPluginRoot,
    writeReceipt: (input) => writeLocalDevelopmentInstalledPluginReceipt(input, { receiptDirectory: agyRepo.receiptDirectory }),
  });
  assert.equal(agyInstalled.status, "written", JSON.stringify(agyInstalled));
  assert.equal(agyInspect().status, "ready", JSON.stringify(agyInspect()));
  for (const registries of [
    () => [],
    () => [JSON.stringify({ entries: [{ path: agyRepo.installedPluginRoot }, { path: agyRepo.installedPluginRoot }] })],
    () => [JSON.stringify({ entries: [{ path: join(agyRepo.base, "other") }] })],
  ]) {
    const refused = agyInspect(registries);
    assert.equal(refused.status, "plugin-attestation-required", JSON.stringify(refused));
    assert.equal(refused.nextAction, null);
    assert.equal(refused.installedPluginAttestation.reasonCodes[0], "IPA-HOST-REGISTRY-BINDING-UNAVAILABLE");
  }

  const rootEntrypoint = readFileSync(new URL("../../../install-agy.mjs", import.meta.url), "utf8");
  assert.match(rootEntrypoint, /\.\/plugins\/pipeline-core\/install-agy\.mjs/u);
  assert.match(rootEntrypoint, /runInteractiveInstaller\(\)/u);
  const shippedEntrypoint = readFileSync(new URL("../install-agy.mjs", import.meta.url), "utf8");
  assert.match(shippedEntrypoint, /isDirectInvocation\(import\.meta\.url\).*runInteractiveInstaller/u);
});

assert.equal(cases.length, 7, "the complete installed-plugin-attestation host corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});

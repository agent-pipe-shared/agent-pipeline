#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { isDirectInvocation } from "./lib/entrypoint.mjs";
import { writeLocalDevelopmentInstalledPluginReceipt } from "./scripts/installed-plugin-attestation-host.mjs";
import { homedir } from "node:os";
import { createAntigravityRefreshHost, resolveAntigravityCliPath } from "./lib/antigravity-topology-refresh-host.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LOCAL_MARKETPLACE = join(process.env.HOME || process.env.USERPROFILE, "agent-pipeline-local-marketplace");
const hasMarketplace = existsSync(join(LOCAL_MARKETPLACE, "plugins", "pipeline-core"));

export function installerUsageLines() {
  return [
    "Usage: node install-agy.mjs",
    "",
    "Run this from an approved Agent-Pipeline plugin directory while your shell is in the project Antigravity will govern.",
    "The interactive installer defaults to that approved directory. A local marketplace copy is an explicit pre-release development choice.",
    "The installer checks physical managed/import/registry/wiring topology and readback; it does not prove GitHub origin or release authenticity.",
    "Global refresh uses the installed Agy CLI; CLI-owned metadata is never hand-edited. A fresh executing session remains required.",
  ];
}

export function selectPluginSource({ answer = "", scriptDir = SCRIPT_DIR, marketplaceRoot = LOCAL_MARKETPLACE, marketplaceAvailable = hasMarketplace } = {}) {
  const selected = answer.trim();
  if (selected === "" || selected === "1") return { kind: "approved-directory", pluginRoot: scriptDir };
  if (selected === "2" && marketplaceAvailable) {
    return { kind: "local-marketplace", pluginRoot: join(marketplaceRoot, "plugins", "pipeline-core") };
  }
  if (selected === "2") throw new Error("Local development marketplace is unavailable; no plugin was registered");
  throw new Error("Invalid plugin source selection; no plugin was registered");
}

export function postInstallGuidanceLines(platform = process.platform) {
  return [
    "=== Environment verification ===",
    "The pipeline's hooks require `node` in the PATH of the Antigravity host.",
    "If Antigravity starts from an IDE, desktop launcher, or service, verify that host PATH directly.",
    platform === "win32" ? "Run in PowerShell or Command Prompt: where.exe node" : "Run: command -v node",
    "If node is absent, correct the launcher or host PATH, then fully restart Antigravity.",
    "Do not create a global sudo symlink merely for this plugin.",
    "",
    "=== Recommended next step ===",
    "Restart Antigravity, open this workspace, then invoke /pipeline-core:pipeline-start.",
    "Optional autonomous tool policy stays runner-local and grants no plan, release, remote, or human authority.",
  ];
}

export function attestAntigravityMarketplaceCopy({ sourcePluginRoot, installedPluginRoot, writeReceipt = writeLocalDevelopmentInstalledPluginReceipt } = {}) {
  try {
    const source = realpathSync(sourcePluginRoot);
    const installed = realpathSync(installedPluginRoot);
    if (source === installed) return { status: "rejected", reason: "IPA-AGY-SOURCE-UNAVAILABLE" };
    const manifest = JSON.parse(readFileSync(join(installed, "plugin.json"), "utf8"));
    return writeReceipt({ provider: "antigravity", plugin: { name: "pipeline-core", version: manifest.version }, sourcePluginRoot: source, installedPluginRoot: installed });
  } catch { return { status: "rejected", reason: "IPA-AGY-SOURCE-UNAVAILABLE" }; }
}

function isPipelineRegistration(path, currentRoot) {
  if (path === currentRoot) return true;
  if (!isAbsolute(path) || resolve(path) !== path) return false;
  const pipelineShaped = path.endsWith(`${sep}plugins${sep}pipeline-core`);
  try {
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(path) !== path) {
      if (pipelineShaped) throw new Error("Unverifiable existing Pipeline registration");
      return false;
    }
    const manifestInfo = lstatSync(join(path, "plugin.json"));
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw new Error("Unverifiable existing Pipeline registration");
    const manifest = JSON.parse(readFileSync(join(path, "plugin.json"), "utf8"));
    return manifest?.name === "agent-pipeline-core";
  } catch {
    // A deleted or unreadable directory cannot prove which plugin owned its
    // registry entry. Never remove it merely because its path looks familiar.
    // Restore the old checkout before upgrading; the documented path keeps
    // it until the new exact binding is read back.
    if (pipelineShaped) throw new Error("Unverifiable existing Pipeline registration: restore the old plugin directory before retrying");
    return false;
  }
}

/** Replace this plugin's registry binding while retaining unrelated entries. */
export function updatePluginRegistry({ targetFile, corePluginPath }) {
  if (typeof corePluginPath !== "string" || !isAbsolute(corePluginPath) || resolve(corePluginPath) !== corePluginPath) {
    throw new Error("Unsafe Pipeline plugin path");
  }
  const sourceInfo = lstatSync(corePluginPath);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink() || realpathSync(corePluginPath) !== corePluginPath) {
    throw new Error("Unsafe Pipeline plugin path");
  }
  const manifestPath = join(corePluginPath, "plugin.json");
  let sourceManifest;
  try {
    const manifestInfo = lstatSync(manifestPath);
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.nlink !== 1) {
      throw new Error("Unsafe Pipeline source manifest");
    }
    sourceManifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(manifestPath)));
  } catch {
    throw new Error("Unverifiable Pipeline source manifest");
  }
  if (sourceManifest === null || typeof sourceManifest !== "object" || Array.isArray(sourceManifest)
    || sourceManifest.name !== "agent-pipeline-core"
    || typeof sourceManifest.version !== "string" || sourceManifest.version.trim() === "") {
    throw new Error("Unverifiable Pipeline source manifest");
  }

  if (typeof targetFile !== "string" || !isAbsolute(targetFile) || resolve(targetFile) !== targetFile) {
    throw new Error("Unsafe plugin registry path");
  }
  const parent = dirname(targetFile);
  const parentInfo = lstatSync(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || realpathSync(parent) !== parent) {
    throw new Error("Unsafe plugin registry parent");
  }
  if (existsSync(targetFile)) {
    const targetInfo = lstatSync(targetFile);
    if (!targetInfo.isFile() || targetInfo.isSymbolicLink()) throw new Error("Unsafe plugin registry target");
  } else {
    try { lstatSync(targetFile); throw new Error("Unsafe plugin registry target"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }

  const config = existsSync(targetFile)
    ? JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(targetFile)))
    : { entries: [] };
  if (config === null || typeof config !== "object" || Array.isArray(config) || !Array.isArray(config.entries)
    || !config.entries.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry) && typeof entry.path === "string")) {
    throw new Error(`Malformed plugin registry: ${targetFile}`);
  }
  const retained = config.entries.filter((entry) => !isPipelineRegistration(entry.path, corePluginPath));
  const nextEntries = [...retained, { path: corePluginPath }];
  if (JSON.stringify(config.entries) === JSON.stringify(nextEntries)) return;
  const temporary = join(parent, `.${basename(targetFile)}.${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, JSON.stringify({ ...config, entries: nextEntries }, null, 2) + "\n");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (realpathSync(parent) !== parent) throw new Error("Unsafe plugin registry parent");
    renameSync(temporary, targetFile);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

/** Apply the separately confirmed runner-local option without losing existing settings. */
export function updateAutonomousSettings({ targetFile }) {
  if (typeof targetFile !== "string" || !isAbsolute(targetFile) || resolve(targetFile) !== targetFile) {
    throw new Error("Unsafe Antigravity settings path");
  }
  const parent = dirname(targetFile);
  const parentInfo = lstatSync(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || realpathSync(parent) !== parent) {
    throw new Error("Unsafe Antigravity settings parent");
  }
  let settings = {};
  if (existsSync(targetFile)) {
    const info = lstatSync(targetFile);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
      throw new Error("Unsafe Antigravity settings target");
    }
    try {
      settings = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(targetFile)));
    } catch {
      throw new Error("Malformed Antigravity settings; existing bytes were preserved");
    }
    if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
      throw new Error("Malformed Antigravity settings; existing bytes were preserved");
    }
  } else {
    try { lstatSync(targetFile); throw new Error("Unsafe Antigravity settings target"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const next = { ...settings, terminalSandbox: true, toolExecutionPolicy: "always-proceed", artifactReviewMode: "always-proceed" };
  const temporary = join(parent, `.${basename(targetFile)}.${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, JSON.stringify(next, null, 2) + "\n");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    if (realpathSync(parent) !== parent) throw new Error("Unsafe Antigravity settings parent");
    renameSync(temporary, targetFile);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

export function refreshAntigravityInstallation(options, dependencies = {}) {
  const host = createAntigravityRefreshHost({ ...options, ...dependencies, writeInstalledReceipt: dependencies.writeInstalledReceipt ?? writeLocalDevelopmentInstalledPluginReceipt });
  const plan = host.prepare();
  if (plan.status !== "prepared") return { schema: "pipeline.antigravity-refresh-result.v1", status: "refused", reason: plan.reason, completed: [] };
  return host.apply(plan);
}

export function runInteractiveInstaller() {
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("\n=== Antigravity Pipeline Installer ===\n");
if (hasMarketplace) console.log(`Detected local development marketplace: ${LOCAL_MARKETPLACE}`);
console.log("Source approval is your decision: this installer does not prove GitHub origin or release authenticity.");

rl.question(`Use (1) Approved Plugin Directory (${SCRIPT_DIR}) or (2) Local Marketplace (${LOCAL_MARKETPLACE})? [Default: 1]: `, (sourceAnswer) => {
  let selectedSource;
  try { selectedSource = selectPluginSource({ answer: sourceAnswer }); }
  catch (error) {
    console.error(`Installation refused: ${error.message}`);
    rl.close();
    process.exitCode = 1;
    return;
  }
  const useMarketplace = selectedSource.kind === "local-marketplace";
  const corePluginPath = selectedSource.pluginRoot;
  
  console.log(`\nPipeline plugin target: ${corePluginPath}\n`);
  console.log("Antigravity may retain a managed imported copy alongside path registries; both are observed before refresh.");
  console.log("Where would you like to install the pipeline?\n");
  console.log("  1) Workspace-Local (Recommended for teams - writes .agents/plugins.json)");
  console.log("  2) Global topology refresh (updates managed copy, owned global wiring/registry and existing Pipeline registration in this workspace)\n");

  rl.question("Select option (1 or 2): ", (answer) => {
    let targetFile;
    if (answer.trim() === "1") {
      const agentsDir = join(process.cwd(), ".agents");
      if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true });
      targetFile = join(agentsDir, "plugins.json");
    } else if (answer.trim() === "2") {
      const globalDir = join(process.env.HOME || process.env.USERPROFILE, ".gemini", "config");
      if (!existsSync(globalDir)) mkdirSync(globalDir, { recursive: true });
      targetFile = join(globalDir, "plugins.json");
    } else {
      console.log("Invalid selection. Exiting.");
      rl.close();
      process.exit(1);
    }

    try {
      const configRoot = join(homedir(), ".gemini");
      if (!existsSync(configRoot)) mkdirSync(configRoot, { mode: 0o700 });
      const result = refreshAntigravityInstallation({ configRoot, workspaceRoot: process.cwd(), approvedSourceRoot: corePluginPath, scope: answer.trim() === "2" ? "global" : "workspace", globalChangeApproved: answer.trim() === "2", cliPath: resolveAntigravityCliPath() });
      console.log(JSON.stringify(result));
      if (result.status !== "refreshed") throw new Error(result.reason ?? "ATR-REFRESH-UNAVAILABLE");
    } catch (error) {
      console.error(`Installation refused: ${error.message}`);
      rl.close();
      process.exitCode = 1;
      return;
    }

    if (useMarketplace) {
      // Antigravity registers and loads this exact directory.  Unlike a
      // separate cache copy, the registered physical root is the explicit
      // operator-selected development source and preflight verifies that
      // exact non-symlinked binding.  Do not manufacture a second source
      // locator or require a receipt for this direct-root topology.
      console.log("Direct local marketplace root selected; registry binding is the provenance boundary.");
    }

    console.log(`\nSuccess! Pipeline registered in: ${targetFile}`);

    rl.question("\nEnable Autonomous Execution Mode (auto-apply edits & safe commands without prompt)? [y/N]: ", (autoAnswer) => {
      const normalizedAutoAnswer = autoAnswer.trim().toLowerCase();
      const enableAuto = normalizedAutoAnswer === "y" || normalizedAutoAnswer === "yes";
      if (enableAuto) {
        const settingsFile = answer.trim() === "1"
          ? join(process.cwd(), ".agents", "settings.json")
          : join(process.env.HOME || process.env.USERPROFILE, ".gemini", "antigravity-cli", "settings.json");
        try {
          mkdirSync(dirname(settingsFile), { recursive: true });
          updateAutonomousSettings({ targetFile: settingsFile });
          console.log(`Autonomous sandboxed mode configured in: ${settingsFile}`);
        } catch (error) {
          console.error(`Autonomous settings update refused: ${error.message}`);
          process.exitCode = 1;
        }
      }

      for (const line of postInstallGuidanceLines()) console.log(line);
      
      rl.close();
    });
  });
});
}

if (isDirectInvocation(import.meta.url)) {
  if (process.argv.slice(2).includes("--help") || process.argv.slice(2).includes("-h")) {
    for (const line of installerUsageLines()) console.log(line);
  } else {
    runInteractiveInstaller();
  }
}

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { isDirectInvocation } from "./lib/entrypoint.mjs";
import { writeLocalDevelopmentInstalledPluginReceipt } from "./scripts/installed-plugin-attestation-host.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LOCAL_MARKETPLACE = join(process.env.HOME || process.env.USERPROFILE, "agent-pipeline-local-marketplace");
const hasMarketplace = existsSync(join(LOCAL_MARKETPLACE, "plugins", "pipeline-core"));

export function installerUsageLines() {
  return [
    "Usage: node install-agy.mjs",
    "",
    "Run this from an approved Agent-Pipeline plugin directory while your shell is in the project Antigravity will govern.",
    "The interactive installer defaults to that approved directory. A local marketplace copy is an explicit pre-release development choice.",
  ];
}

export function selectPluginSource({ answer = "", scriptDir = SCRIPT_DIR, marketplaceRoot = LOCAL_MARKETPLACE, marketplaceAvailable = hasMarketplace } = {}) {
  if (answer.trim() === "2" && marketplaceAvailable) {
    return { kind: "local-marketplace", pluginRoot: join(marketplaceRoot, "plugins", "pipeline-core") };
  }
  return { kind: "approved-directory", pluginRoot: scriptDir };
}

export function postInstallGuidanceLines() {
  return [
    "=== Environment verification ===",
    "The pipeline's hooks require `node` in the PATH of the Antigravity host.",
    "If Antigravity starts from an IDE, desktop launcher, or service, verify that host PATH directly.",
    "Run: command -v node",
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

export function runInteractiveInstaller() {
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("\n=== Antigravity Pipeline Installer ===\n");
if (hasMarketplace) console.log(`Detected local development marketplace: ${LOCAL_MARKETPLACE}`);

rl.question(`Use (1) Approved Plugin Directory (${SCRIPT_DIR}) or (2) Local Marketplace (${LOCAL_MARKETPLACE})? [Default: 1]: `, (sourceAnswer) => {
  const selectedSource = selectPluginSource({ answer: sourceAnswer });
  const useMarketplace = selectedSource.kind === "local-marketplace";
  const corePluginPath = selectedSource.pluginRoot;
  
  console.log(`\nPipeline plugin target: ${corePluginPath}\n`);
  console.log("Antigravity uses GitOps/JSON configs instead of a global marketplace.");
  console.log("Where would you like to install the pipeline?\n");
  console.log("  1) Workspace-Local (Recommended for teams - writes .agents/plugins.json)");
  console.log("  2) Global (Applies to all your local projects - writes ~/.gemini/config/plugins.json)\n");

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
      updatePluginRegistry({ targetFile, corePluginPath });
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
        
        let settings = {};
        if (existsSync(settingsFile)) {
          try { settings = JSON.parse(readFileSync(settingsFile, "utf-8")); } catch (e) {}
        }
        settings.terminalSandbox = true;
        settings.toolExecutionPolicy = "always-proceed";
        settings.artifactReviewMode = "always-proceed";
        mkdirSync(dirname(settingsFile), { recursive: true });
        writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
        console.log(`Autonomous sandboxed mode configured in: ${settingsFile}`);
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

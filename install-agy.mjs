#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_CORE_PATH = join(SCRIPT_DIR, "plugins", "pipeline-core");

console.log("\n=== Antigravity Pipeline Installer ===\n");
console.log(`Pipeline source: ${PLUGIN_CORE_PATH}\n`);
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

  let config = { entries: [] };
  if (existsSync(targetFile)) {
    try {
      config = JSON.parse(readFileSync(targetFile, "utf-8"));
    } catch (e) {
      console.log(`Warning: Could not parse existing ${targetFile}, overwriting.`);
    }
  }

  if (!config.entries) config.entries = [];
  
  const alreadyExists = config.entries.some(e => e.path === PLUGIN_CORE_PATH);
  if (!alreadyExists) {
    config.entries.push({ path: PLUGIN_CORE_PATH });
    writeFileSync(targetFile, JSON.stringify(config, null, 2) + "\n");
    console.log(`\nSuccess! Pipeline registered in: ${targetFile}`);
    console.log("You can now run 'agy' in your project to start the pipeline onboarding.\n");
  } else {
    console.log(`\nPipeline is already registered in: ${targetFile}\n`);
  }
  
  rl.close();
});

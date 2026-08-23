#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(SCRIPT_DIR, "plugins");

console.log("\n=== Antigravity Pipeline Installer ===\n");
console.log(`Pipeline source: ${PLUGIN_ROOT}\n`);
console.log("Antigravity uses GitOps/JSON configs instead of a global marketplace.");
console.log("Where would you like to install the pipeline?\n");
console.log("  1) Workspace-Local (Recommended for teams - writes .agents/plugins.json)");
console.log("  2) Global (Applies to all your local projects - writes ~/.gemini/config/plugins.json)\n");

rl.question("Select option (1 or 2): ", (answer) => {
  let targetFile;
  if (answer.trim() === "1") {
    const agentsDir = join(process.cwd(), ".agents");
    if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true });
    targetFile = join(agentsDir, "hooks.json");
  } else if (answer.trim() === "2") {
    const globalDir = join(process.env.HOME || process.env.USERPROFILE, ".gemini", "config");
    if (!existsSync(globalDir)) mkdirSync(globalDir, { recursive: true });
    targetFile = join(globalDir, "hooks.json");
  } else {
    console.log("Invalid selection. Exiting.");
    rl.close();
    process.exit(1);
  }

  let config = {};
  if (existsSync(targetFile)) {
    try {
      config = JSON.parse(readFileSync(targetFile, "utf-8"));
    } catch (e) {
      console.log(`Warning: Could not parse existing ${targetFile}, overwriting.`);
    }
  }

  config["pipeline-core"] = {
    "enabled": true,
    "PreToolUse": [
      {
        "matcher": "run_command|write_to_file|replace_file_content|invoke_subagent",
        "hooks": [
          {
            "type": "command",
            "command": `node ${join(PLUGIN_ROOT, "pipeline-core", "hooks", "antigravity-pretool-guard.mjs")}`,
            "timeout": 30
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": `node ${join(PLUGIN_ROOT, "pipeline-core", "hooks", "antigravity-stop-hook.mjs")}`,
            "timeout": 15
          }
        ]
      }
    ],
    "PreInvocation": [
      {
        "type": "command",
        "command": `node ${join(PLUGIN_ROOT, "pipeline-core", "hooks", "antigravity-start-hint.mjs")}`,
        "timeout": 5
      }
    ]
  };

  writeFileSync(targetFile, JSON.stringify(config, null, 2) + "\n");
  console.log(`\nSuccess! Pipeline registered in: ${targetFile}`);

  console.log("\n=== Important Environment Verification ===");
  console.log("The Agent Pipeline uses platform-neutral hooks (e.g. `node hooks/...`).");
  console.log("This requires `node` to be available in the PATH of the Antigravity Daemon.");
  console.log("If you launch Antigravity via an IDE or desktop shortcut, it may not source your ~/.bashrc or ~/.zshrc.");
  console.log("If the daemon cannot find `node`, security hooks will SILENTLY FAIL OPEN!");
  
  console.log("\nTo ensure node is permanently in your system path (e.g. for fnm users):");
  console.log("  sudo ln -s $(which node) /usr/local/bin/node");
  console.log("  (Or ensure your desktop environment loads your PATH correctly)\n");
  
  console.log("You can now restart your Antigravity daemon and run 'agy' in your project to start the pipeline onboarding.\n");
  
  rl.close();
});

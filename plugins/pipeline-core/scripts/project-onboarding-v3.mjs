#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { pathToFileURL } from "node:url";
import { applyProjectOnboardingV3, inspectProjectOnboardingV3, planProjectOnboardingV3 } from "../lib/project-onboarding-v3.mjs";

function usage() { return "Usage: node plugins/pipeline-core/scripts/project-onboarding-v3.mjs <inspect|plan|apply> --root <project-dir> [--activate]"; }
function parse(args) {
  const output = { activate: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (index === 0 && ["inspect", "plan", "apply"].includes(arg)) output.command = arg;
    else if (arg === "--root") { const root = args[index + 1]; if (!root || root.startsWith("--")) return { error: "--root requires a project directory" }; output.root = root; index += 1; }
    else if (arg === "--activate") output.activate = true;
    else if (arg === "--help" || arg === "-h") output.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!output.help && !output.command) return { error: "one command is required" };
  if (!output.help && !output.root) return { error: "--root is required" };
  if (output.activate && output.command !== "apply") return { error: "--activate is only valid for apply" };
  return output;
}
export function main(args = process.argv.slice(2), { write = process.stdout.write.bind(process.stdout), deps } = {}) {
  const options = parse(args);
  if (options.help) { write(`${usage()}\n`); return 0; }
  if (options.error) { write(`${usage()}\n${options.error}\n`); return 2; }
  let output;
  if (options.command === "inspect") output = inspectProjectOnboardingV3({ rootDir: options.root, deps });
  else if (options.command === "plan") output = planProjectOnboardingV3({ rootDir: options.root, deps });
  else output = applyProjectOnboardingV3(planProjectOnboardingV3({ rootDir: options.root, deps }), { rootDir: options.root, activate: options.activate, deps });
  write(`${JSON.stringify(output, null, 2)}\n`);
  return ["fresh", "ready", "migration-required", "applied"].includes(output.status) ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());

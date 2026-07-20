#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/** Project-local inspect/plan/apply surface for the I3 migration boundary. */
import {
  applyRunnerProfileMigrationV2,
  inspectRunnerProfileMigrationV2,
  planRunnerProfileMigrationV2,
} from "../lib/runner-profile-migration-v2.mjs";

function usage() {
  return "Usage: node plugins/pipeline-core/scripts/runner-profile-migration-v2.mjs <inspect|plan|apply> --root <project-dir> [--activate]";
}

function parseArgs(args) {
  const parsed = { activate: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (index === 0 && ["inspect", "plan", "apply"].includes(arg)) parsed.command = arg;
    else if (arg === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return { error: "--root requires a project directory" };
      parsed.root = value;
      index += 1;
    } else if (arg === "--activate") parsed.activate = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!parsed.help && !parsed.command) return { error: "one command is required" };
  if (!parsed.help && !parsed.root) return { error: "--root is required" };
  if (parsed.activate && parsed.command !== "apply") return { error: "--activate is only valid for apply" };
  return parsed;
}

export function main(args = process.argv.slice(2), { write = process.stdout.write.bind(process.stdout) } = {}) {
  const options = parseArgs(args);
  if (options.help) {
    write(`${usage()}\n`);
    return 0;
  }
  if (options.error) {
    write(`${usage()}\n${options.error}\n`);
    return 2;
  }
  let output;
  if (options.command === "inspect") output = inspectRunnerProfileMigrationV2({ rootDir: options.root });
  else {
    const plan = planRunnerProfileMigrationV2({ rootDir: options.root });
    output = options.command === "plan" ? plan : applyRunnerProfileMigrationV2(plan, { rootDir: options.root, activate: options.activate });
  }
  write(`${JSON.stringify(output, null, 2)}\n`);
  return ["ready", "noop", "applied"].includes(output.status) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());

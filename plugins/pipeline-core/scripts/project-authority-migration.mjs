#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Preview-first CLI for the runner-neutral project-authority migration. */
import { writeSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  applyPendingProjectAuthorityRecovery, applyProjectAuthorityMigration,
  planPendingProjectAuthorityRecovery, planProjectAuthorityMigration,
  readProjectAuthority,
} from "../lib/project-authority.mjs";

function parse(args) {
  const output = { activate: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (index === 0 && ["inspect", "plan", "apply", "recover"].includes(arg)) output.command = arg;
    else if (arg === "--root") { output.root = args[index + 1]; index += 1; }
    else if (arg === "--activate") output.activate = true;
    else if (arg === "--help" || arg === "-h") output.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!output.help && (!output.command || !output.root)) return { error: "usage: <inspect|plan|apply|recover> --root <project-dir> [--activate]" };
  if (output.activate && !["apply", "recover"].includes(output.command)) return { error: "--activate is only valid for apply or recover" };
  return output;
}
function preview(plan, operation) {
  return { schema: "pipeline.project-authority-prewrite-preview.v1", status: "pre-write-preview", operation, candidate: { planSchema: plan.schema, source: plan.source, compatibility: plan.compatibility }, targets: plan.targets.map(({ path, kind, before, after, changed, journalState }) => ({ path, kind, before, after, changed, journalState })) };
}
export function main(args = process.argv.slice(2), { write = process.stdout.write.bind(process.stdout), previewWrite = (chunk) => writeSync(2, chunk) } = {}) {
  const options = parse(args); if (options.help) { write("usage: <inspect|plan|apply|recover> --root <project-dir> [--activate]\n"); return 0; }
  if (options.error) { write(`${options.error}\n`); return 2; }
  let output;
  if (options.command === "inspect") output = readProjectAuthority({ rootDir: options.root });
  else if (options.command === "plan") output = planProjectAuthorityMigration({ rootDir: options.root });
  else if (options.command === "apply") {
    const plan = planProjectAuthorityMigration({ rootDir: options.root });
    if (options.activate && plan.status === "ready") previewWrite(`${JSON.stringify(preview(plan, "activation"))}\n`);
    output = applyProjectAuthorityMigration(plan, { rootDir: options.root, activate: options.activate });
  } else {
    const plan = planPendingProjectAuthorityRecovery({ rootDir: options.root });
    if (options.activate && plan.status === "ready") previewWrite(`${JSON.stringify(preview(plan, "recovery"))}\n`);
    output = applyPendingProjectAuthorityRecovery(plan, { rootDir: options.root, activate: options.activate });
  }
  write(`${JSON.stringify(output, null, 2)}\n`); return ["ready", "noop", "applied", "recovered"].includes(output.status) ? 0 : 1;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());

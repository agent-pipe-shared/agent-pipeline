#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Slices follow modules (candidate 19, M1.4): print the slice-queue proposal for the modules of an approved architecture design.
 *
 *   module-slice-proposal.mjs --prd <repository-relative PRD path> [--root <dir>]
 *
 * Read-only: it parses the `pipeline-architecture-design` block of the PRD with the same parser the design approval uses, cuts one
 * slice per module (lib/module-slice-proposal.mjs) and prints ONE JSON document. It never writes a queue and never dispatches.
 * Run the printed `addCommands` as `slice-queue.mjs <argv> --queue <path>` (the first with `--init-feature <feature>` when the queue
 * does not exist yet); the queue library validates every add. Exit 0 proposal, 2 usage, 3 design or proposal refused.
 */
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { architectureDesignFailureCode, parseArchitectureDesign } from "../lib/architecture-design.mjs";
import { MODULE_SLICE_PROPOSAL_SCHEMA, proposeSlicesFromModules } from "../lib/module-slice-proposal.mjs";

export const EXIT = Object.freeze({ OK: 0, USAGE: 2, REFUSED: 3 });
const MAX_PRD_BYTES = 4 * 1024 * 1024;
const USAGE = "usage: module-slice-proposal.mjs --prd <repository-relative path> [--root <dir>]";

function usage(reason) { return { exit: EXIT.USAGE, output: { ok: false, schema: MODULE_SLICE_PROPOSAL_SCHEMA, code: "MSP-USAGE", reason, usage: USAGE } }; }

export function run(argv, cwd = process.cwd()) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--prd", "--root"].includes(name)) return usage(`unknown argument ${String(name).slice(0, 40)}`);
    if (typeof value !== "string" || value.startsWith("--")) return usage(`${name} needs a value`);
    if (Object.hasOwn(flags, name)) return usage(`${name} given twice`);
    flags[name] = value;
  }
  if (flags["--prd"] === undefined) return usage("--prd is required");
  const root = resolve(cwd, flags["--root"] ?? ".");
  const target = resolve(root, flags["--prd"]);
  const inside = relative(root, target);
  if (isAbsolute(flags["--prd"]) || inside === "" || inside.startsWith("..") || isAbsolute(inside)) return usage("--prd must name a file inside the root, as a repository-relative path");
  let text;
  try {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_PRD_BYTES) return usage("--prd must name a regular file of at most 4 MiB");
    text = readFileSync(target, "utf8");
  } catch { return usage("--prd could not be read"); }
  let design;
  try { design = parseArchitectureDesign(text); }
  catch (error) {
    return { exit: EXIT.REFUSED, output: { ok: false, schema: MODULE_SLICE_PROPOSAL_SCHEMA, code: architectureDesignFailureCode(error), reason: "the architecture design of the PRD is not valid; the proposal needs the approved design package", ...(typeof error?.field === "string" ? { field: error.field } : {}) } };
  }
  const proposal = proposeSlicesFromModules(design.modules);
  return { exit: proposal.ok ? EXIT.OK : EXIT.REFUSED, output: proposal };
}

if (isDirectInvocation(import.meta.url)) {
  const { exit, output } = run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = exit;
}

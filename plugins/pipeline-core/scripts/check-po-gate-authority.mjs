#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only check of the repository-scoped PO gate authority, shipped with the plugin so a consumer can run it.
 * Usage: check-po-gate-authority.mjs [--root <repository>]
 * Exit 0 and one line when the authority is valid; exit 2 and `<code>: <reason> <repair>` otherwise. Writes nothing.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePoGateAuthorityForRepository } from "../lib/po-gate-authority.mjs";

export function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  if (!(argv.length === 0 || (argv.length === 2 && argv[0] === "--root"))) {
    err.write("usage: check-po-gate-authority.mjs [--root <repository>]\n");
    return 2;
  }
  try {
    const result = validatePoGateAuthorityForRepository({ repoRoot: argv.length === 2 ? resolve(argv[1]) : process.cwd() });
    if (!result.ok) {
      err.write(`${result.code}: ${result.reason} ${result.repair}\n`);
      return 2;
    }
    out.write(`PO gate authority valid: ${result.value.humanFacing}; ${result.value.planPath ?? "no active feature"}\n`);
    return 0;
  } catch {
    err.write("PO-GATE-AUTHORITY-UNAVAILABLE: Repository topology or authority inputs are unavailable; run sanctioned setup from the primary checkout.\n");
    return 2;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();

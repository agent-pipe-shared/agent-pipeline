#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Read-only decision-estate projection. A ready or advisory source projection is not a
 * native runner-session parity receipt or PO approval of legacy ADRs. */
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectEffectiveArchitectureDecisions } from "../lib/architecture-effective-decisions.mjs";

export function runArchitectureEffectiveCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--root", "--area", "--now"].includes(key) || key in options || typeof value !== "string"
      || value.startsWith("--")) {
      return { exitCode: 2, output: { schema: "pipeline.architecture-effective-decisions-cli-error.v1", code: "ARGUMENTS-INVALID" } };
    }
    options[key] = value;
  }
  if (!isAbsolute(options["--root"] ?? "") || !options["--area"]) {
    return { exitCode: 2, output: { schema: "pipeline.architecture-effective-decisions-cli-error.v1", code: "ARGUMENTS-INVALID" } };
  }
  const result = inspectEffectiveArchitectureDecisions({ rootDir: options["--root"], area: options["--area"], now: options["--now"] });
  return { exitCode: result.status === "blocked" ? 2 : 0, output: result };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runArchitectureEffectiveCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}

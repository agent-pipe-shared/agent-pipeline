#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Read-only decision-estate projection. A ready or advisory source projection is not a
 * native runner-session parity receipt or PO approval of legacy ADRs. */
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectEffectiveArchitectureDecisions, loadPhysicalArchitectureMap } from "../lib/architecture-effective-decisions.mjs";
import { resolveModuleForPath } from "./module-inventory.mjs";

const TASK_PATH = /^(?!\.\.?\/)(?!.*\/\.\.?\/)(?!.*\/\/)[^\\\0\r\n]+$/u;
function error(code) {
  return { exitCode: 2, output: { schema: "pipeline.architecture-effective-decisions-cli-error.v1", code } };
}

export function runArchitectureEffectiveCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!["--root", "--area", "--path", "--now"].includes(key) || key in options || typeof value !== "string"
      || value.startsWith("--")) {
      return error("ARGUMENTS-INVALID");
    }
    options[key] = value;
  }
  if (!isAbsolute(options["--root"] ?? "")
    || Boolean(options["--area"]) === Boolean(options["--path"])) {
    return error("ARGUMENTS-INVALID");
  }
  let area = options["--area"];
  if (options["--path"]) {
    const taskPath = options["--path"];
    if (!TASK_PATH.test(taskPath) || isAbsolute(taskPath) || taskPath.split("/").includes("..")
      || taskPath.split("/").includes(".")) return error("TASK-PATH-INVALID");
    const inventory = loadPhysicalArchitectureMap(options["--root"]);
    if (!inventory) return error("MODULE-INVENTORY-UNAVAILABLE");
    const owned = resolveModuleForPath(taskPath, inventory);
    if (!owned) return error("TASK-MODULE-UNRESOLVED");
    area = owned.id;
  }
  const result = inspectEffectiveArchitectureDecisions({ rootDir: options["--root"], area, now: options["--now"] });
  return { exitCode: result.status === "blocked" ? 2 : 0, output: result };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runArchitectureEffectiveCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}

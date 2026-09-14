#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkControlPlacement, readJson } from "./control-placement.mjs";

const DEFAULT_TABLE = "policies/control-placement.v1.json";
const DEFAULT_HOOKS = "plugins/pipeline-core/hooks/hooks.json";

function usage(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const options = { root: process.cwd(), table: DEFAULT_TABLE, hooks: DEFAULT_HOOKS, record: null, runner: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") { options.json = true; continue; }
    if (!Object.hasOwn({ "--root": true, "--table": true, "--hooks": true, "--a1-record": true, "--runner": true }, token)) throw new TypeError(`unknown argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new TypeError(`missing value: ${token}`);
    index += 1;
    if (token === "--root") options.root = value;
    if (token === "--table") options.table = value;
    if (token === "--hooks") options.hooks = value;
    if (token === "--a1-record") options.record = value;
    if (token === "--runner") options.runner = value;
  }
  if (!options.record || !options.runner) throw new TypeError("--a1-record and --runner are required");
  return options;
}

function pathFrom(root, path) {
  return resolve(root, path);
}

export function run(argv) {
  const options = parseArgs(argv);
  let a1Record = null;
  try { a1Record = readJson(pathFrom(options.root, options.record)); } catch { a1Record = null; }
  const result = checkControlPlacement({
    table: readJson(pathFrom(options.root, options.table)),
    hooksDocument: readJson(pathFrom(options.root, options.hooks)),
    a1Record,
    activeRunner: options.runner,
  });
  return { options, result };
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { options, result } = run(process.argv.slice(2));
    if (options.json) process.stdout.write(`${JSON.stringify({ schema: "pipeline.control-placement-readback.v1", ...result })}\n`);
    else if (result.ok) process.stdout.write(`OK: ${result.expectedControlIds.length} control placement rows are complete and A1-consistent for ${options.runner}.\n`);
    else process.stdout.write(`${result.findings.join("\n")}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    usage(`A2-CONTROL-PLACEMENT-INPUT-INVALID: ${error.message}`);
  }
}

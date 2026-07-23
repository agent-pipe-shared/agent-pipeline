#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../lib/yaml-lite.mjs";
import {
  loadRunnerProfilesV2Registry,
  validatePipelineUserV2,
  validateRunnerProfilesV2Registry,
} from "../lib/runner-profiles-v2.mjs";

function usage() {
  return [
    "Usage: validate-runner-profiles-v2.mjs [--registry <json-file>] [--config <json-or-yaml-file>]",
    "Without arguments, validates the committed frozen registry.",
  ].join("\n");
}

function parseArgs(argv) {
  const paths = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if ((argument === "--registry" || argument === "--config") && argv[index + 1] && !paths[argument]) {
      paths[argument] = argv[index + 1];
      index += 1;
      continue;
    }
    return null;
  }
  return { registry: paths["--registry"], config: paths["--config"] };
}

function readValue(path) {
  const text = readFileSync(path, "utf8");
  return [".yaml", ".yml"].includes(extname(path).toLowerCase()) ? parseYaml(text) : JSON.parse(text);
}

function readFailure(source) {
  return {
    ok: false,
    source,
    errors: [{
      path: "$",
      code: "read_or_parse",
      message: "source could not be read as one JSON or YAML document",
      repair: "check the source path and syntax without placing secrets in diagnostics",
    }],
  };
}

function report(result) {
  process.stdout.write(`${JSON.stringify({ schema: "pipeline.runner-profiles.validation.v1", ...result })}\n`);
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const results = [];
  let registry;
  try {
    registry = args.registry ? readValue(args.registry) : loadRunnerProfilesV2Registry();
    results.push(validateRunnerProfilesV2Registry(registry, { source: args.registry ?? "committed runner-profiles-v2.json" }));
  } catch {
    results.push(readFailure(args.registry ?? "committed runner-profiles-v2.json"));
  }
  if (args.config) {
    try {
      const config = readValue(args.config);
      results.push(validatePipelineUserV2(config, { source: args.config, registry }));
    } catch {
      results.push(readFailure(args.config));
    }
  }
  for (const checked of results) report(checked);
  return results.every((checked) => checked.ok) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

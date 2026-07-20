#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/** Read-only CLI for the V3 runtime projection planner. */
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

import {
  planRuntimeProjectionV3,
  readRuntimeProjectionV3Baselines,
} from "../lib/runtime-projection-v3.mjs";
import { validatePipelineUserV3 } from "../lib/runner-profiles-v3.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";

const PLAN_SCHEMA = "pipeline.runtime-projection-plan.v3";

function usage() {
  return "Usage: node plugins/pipeline-core/scripts/plan-runtime-projection-v3.mjs --intent <pipeline.user.v3.json-or-yaml> [--root <project-dir>] [--include-bytes]";
}

function parseArgs(args) {
  const parsed = { root: process.cwd(), includeBytes: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--intent" || arg === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return { error: `missing value for ${arg}` };
      parsed[arg.slice(2)] = value;
      index += 1;
    } else if (arg === "--include-bytes") parsed.includeBytes = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!parsed.help && !parsed.intent) return { error: "--intent is required" };
  return parsed;
}

function emptyPlan(source, diagnostics) {
  return {
    schema: PLAN_SCHEMA,
    status: "invalid-intent",
    source,
    diagnostics,
    decisionConflicts: [],
    requiresExplicitActivation: true,
    targets: [],
  };
}

function withoutBytes(plan) {
  return {
    ...plan,
    targets: plan.targets.map((target) => {
      const { bytes, ...after } = target.after;
      return { ...target, after };
    }),
  };
}

function parseIntent(text, source) {
  try {
    const yaml = [".yaml", ".yml"].includes(extname(source).toLowerCase());
    return { ok: true, value: yaml ? parseYaml(text) : JSON.parse(text) };
  } catch {
    return { ok: false, plan: emptyPlan(source, [{
      path: "$",
      code: "parse",
      message: "configuration is not valid JSON or YAML",
      repair: "provide one valid JSON or YAML document",
    }]) };
  }
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
  let text;
  try {
    text = readFileSync(resolve(options.intent), "utf8");
  } catch {
    write(`${JSON.stringify(emptyPlan(options.intent, [{ path: "$", code: "source_unreadable", message: "intent source cannot be read", repair: "supply one readable pipeline.user.v3 JSON or YAML file" }]))}\n`);
    return 1;
  }
  const parsed = parseIntent(text, options.intent);
  if (!parsed.ok) {
    write(`${JSON.stringify(parsed.plan, null, 2)}\n`);
    return 1;
  }
  const validation = validatePipelineUserV3(parsed.value, { source: options.intent });
  if (!validation.ok) {
    write(`${JSON.stringify(emptyPlan(options.intent, validation.errors), null, 2)}\n`);
    return 1;
  }
  const plan = planRuntimeProjectionV3(parsed.value, {
    source: options.intent,
    baselines: readRuntimeProjectionV3Baselines(resolve(options.root)),
  });
  write(`${JSON.stringify(options.includeBytes ? plan : withoutBytes(plan), null, 2)}\n`);
  return plan.status === "ready" ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());

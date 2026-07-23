#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only CLI for I2's v2 projection planner.  It never activates a plan or
 * writes a project runtime target.  Target bytes are withheld by default so
 * unowned project configuration is not echoed into logs; use --include-bytes
 * only for a local consumer that already owns the target access.
 */
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validatePipelineUserV2 } from "../lib/runner-profiles-v2.mjs";
import {
  planRuntimeProjectionV2,
  readRuntimeProjectionV2Baselines,
} from "../lib/runtime-projection-v2.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";

function usage() {
  return "Usage: node plugins/pipeline-core/scripts/plan-runtime-projection-v2.mjs --intent <pipeline.user.v2.json-or-yaml> [--root <project-dir>] [--include-bytes]";
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
    } else if (arg === "--include-bytes") {
      parsed.includeBytes = true;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }
  if (!parsed.help && !parsed.intent) return { error: "--intent is required" };
  return parsed;
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

function invalidIntentPlan(validation) {
  return {
    schema: "pipeline.runtime-projection-plan.v2",
    status: "invalid-intent",
    source: validation.source,
    diagnostics: validation.errors,
    decisionConflicts: [],
    requiresExplicitActivation: true,
    targets: [],
  };
}

function parseIntent(text, source) {
  try {
    const isYaml = [".yaml", ".yml"].includes(extname(source).toLowerCase());
    return { ok: true, value: isYaml ? parseYaml(text) : JSON.parse(text) };
  } catch {
    return {
      ok: false,
      validation: {
        ok: false,
        source,
        errors: [{
          path: "$",
          code: "parse",
          message: "configuration is not valid JSON or YAML",
          repair: "provide one valid JSON or YAML document",
        }],
      },
    };
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
    write(`${JSON.stringify({ schema: "pipeline.runtime-projection-plan.v2", status: "invalid-intent", source: options.intent, diagnostics: [{ path: "$", code: "source_unreadable", message: "intent source cannot be read", repair: "supply one readable pipeline.user.v2 JSON or YAML file" }], decisionConflicts: [], requiresExplicitActivation: true, targets: [] })}\n`);
    return 1;
  }
  const parsed = parseIntent(text, options.intent);
  if (!parsed.ok) {
    write(`${JSON.stringify(invalidIntentPlan(parsed.validation), null, 2)}\n`);
    return 1;
  }
  const validation = validatePipelineUserV2(parsed.value, { source: options.intent });
  if (!validation.ok) {
    write(`${JSON.stringify(invalidIntentPlan(validation), null, 2)}\n`);
    return 1;
  }
  const plan = planRuntimeProjectionV2(parsed.value, {
    source: options.intent,
    baselines: readRuntimeProjectionV2Baselines(resolve(options.root)),
  });
  write(`${JSON.stringify(options.includeBytes ? plan : withoutBytes(plan), null, 2)}\n`);
  return plan.status === "ready" ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());

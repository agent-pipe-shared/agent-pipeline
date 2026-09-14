#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-evidence-drift.mjs -- CLI utility to inspect and report closed-evidence drift
 * across closedFeatures (WP-A5-i, Issue #106, AC-5, IR-1).
 */
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { detectClosedEvidenceDrift } from "../lib/onboarding-continuity.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const SCHEMA_ID = "pipeline.closed-evidence-drift.v1";

export function checkEvidenceDrift({ rootDir = process.cwd() } = {}) {
  const root = resolve(rootDir);
  const statePath = resolve(root, "project", "pipeline-state.json");
  const claudeStatePath = resolve(root, ".claude", "pipeline-state.json");
  const actualStatePath = existsSync(statePath)
    ? statePath
    : (existsSync(claudeStatePath) ? claudeStatePath : null);

  if (!actualStatePath) {
    return {
      schema: SCHEMA_ID,
      ok: true,
      status: "no-state",
      root,
      driftCount: 0,
      drifts: [],
      message: "No pipeline-state.json found; zero closed features checked.",
    };
  }

  let state;
  try {
    state = JSON.parse(readFileSync(actualStatePath, "utf8"));
  } catch (err) {
    return {
      schema: SCHEMA_ID,
      ok: false,
      status: "malformed-state",
      root,
      driftCount: 0,
      drifts: [],
      error: err.message,
    };
  }

  const drifts = detectClosedEvidenceDrift(root, state);
  const closedCount = Array.isArray(state.closedFeatures) ? state.closedFeatures.length : 0;
  return {
    schema: SCHEMA_ID,
    ok: drifts.length === 0,
    status: drifts.length === 0 ? "clean" : "drift-detected",
    root,
    closedFeaturesCount: closedCount,
    driftCount: drifts.length,
    drifts,
  };
}

export function parseArgs(argv) {
  let root = process.cwd();
  let format = "text";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root" && i + 1 < argv.length) {
      root = argv[++i];
    } else if (arg === "--format" && i + 1 < argv.length) {
      format = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      return { help: true };
    } else {
      return { error: `Unknown option: ${arg}` };
    }
  }
  if (format !== "json" && format !== "text") {
    return { error: `Invalid format "${format}", expected "json" or "text"` };
  }
  return { root, format };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write("Usage: check-evidence-drift.mjs [--root <path>] [--format json|text]\n");
    return 0;
  }
  if (args.error) {
    process.stderr.write(`Error: ${args.error}\n`);
    return 2;
  }
  const result = checkEvidenceDrift({ rootDir: args.root });
  if (args.format === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    if (result.status === "malformed-state") {
      process.stderr.write(`Error: pipeline-state.json is malformed (${result.error})\n`);
      return 2;
    }
    if (result.ok) {
      process.stdout.write(`No closed-evidence drift detected across ${result.closedFeaturesCount ?? 0} closed feature(s).\n`);
    } else {
      process.stdout.write(`Closed-evidence drift detected (${result.driftCount} issue(s) found):\n`);
      for (const d of result.drifts) {
        process.stdout.write(`  - ${d.code}: feature "${d.featureId}" artifact "${d.artifact}" (expected ${d.expectedSha256}, observed ${d.observedSha256 ?? "missing"})\n`);
      }
    }
  }
  return result.ok ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

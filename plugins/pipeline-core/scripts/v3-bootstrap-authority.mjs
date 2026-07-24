#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only public V3 bootstrap authority validator.
 *
 * Consumer roots are not required to ship setup.mjs. The V3 migration owns
 * the source and every runtime projection, so a current V3 source followed by
 * that migration's empty plan is the complete public bootstrap authority.
 */
import { pathToFileURL } from "node:url";

import {
  inspectRunnerProfileMigrationV3,
  planRunnerProfileMigrationV3,
} from "../lib/runner-profile-migration-v3.mjs";

const SCHEMA = "pipeline.v3-bootstrap-authority.v1";

function diagnostic(path, code, message, repair) {
  return { path, code, message, repair };
}

function rejected(root, diagnostics, extra = {}) {
  return { schema: SCHEMA, status: "rejected", root, diagnostics, ...extra };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      const root = args[index + 1];
      if (!root || root.startsWith("--")) return { error: "--root requires a project directory" };
      parsed.root = root;
      index += 1;
    } else if (arg === "--help" || arg === "-h") parsed.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!parsed.help && !parsed.root) return { error: "--root is required" };
  return parsed;
}

export function validateV3BootstrapAuthority({ rootDir = process.cwd() } = {}) {
  const inspection = inspectRunnerProfileMigrationV3({ rootDir });
  if (inspection.status !== "ready") {
    return rejected(inspection.root, [diagnostic(
      "$.source",
      "v3_inspection_not_ready",
      "the project does not have one readable V3 migration source",
      "repair the reported source or recovery condition through the explicit V3 migration workflow",
    ), ...(inspection.diagnostics ?? [])], { inspectionStatus: inspection.status });
  }
  if (inspection.sourceKind !== "v3") {
    return rejected(inspection.root, [diagnostic(
      "$.sourceKind",
      "v3_source_not_current",
      "pipeline.user.yaml is not a current pipeline.user.v3 authority",
      "run the explicit V3 migration/apply workflow, then rerun bootstrap",
    )], { source: inspection.source, sourceKind: inspection.sourceKind });
  }

  const plan = planRunnerProfileMigrationV3({ rootDir });
  if (plan.status !== "noop" || plan.sourceKind !== "v3" || plan.sourceSha256 !== inspection.sourceSha256
    || (plan.changes?.length ?? 0) !== 0 || (plan.decisionConflicts?.length ?? 0) !== 0) {
    const code = plan.status === "ready" ? "v3_runtime_drift"
      : plan.sourceSha256 !== inspection.sourceSha256 ? "v3_source_changed_during_readback"
        : "v3_plan_not_noop";
    return rejected(plan.root ?? inspection.root, [diagnostic(
      "$.runtime",
      code,
      "the current V3 source and runtime projections do not produce an empty migration plan",
      "repair only through the explicit V3 migration/apply workflow, then rerun bootstrap",
    ), ...(plan.diagnostics ?? [])], {
      source: inspection.source,
      sourceKind: plan.sourceKind ?? inspection.sourceKind,
      planStatus: plan.status,
      changes: (plan.changes ?? []).map((change) => change.path),
    });
  }

  return {
    schema: SCHEMA,
    status: "ready",
    root: plan.root,
    source: inspection.source,
    sourceKind: "v3",
    sourceSha256: inspection.sourceSha256,
    runtimeProjection: "noop",
    diagnostics: [],
  };
}

export function main(args = process.argv.slice(2), { write = process.stdout.write.bind(process.stdout) } = {}) {
  const options = parseArgs(args);
  if (options.help) {
    write("Usage: node plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs --root <project-dir>\n");
    return 0;
  }
  if (options.error) {
    write(`${options.error}\n`);
    return 2;
  }
  const result = validateV3BootstrapAuthority({ rootDir: options.root });
  write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === "ready" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());

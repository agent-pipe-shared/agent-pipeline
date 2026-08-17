#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Preview-first CLI for the runner-neutral project-authority migration. */
import { createHash } from "node:crypto";
import { writeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyPendingProjectAuthorityRecovery, applyProjectAuthorityMigration,
  applyProjectAuthoritySessionCleanupRecovery, applyVendoredPackageSync,
  inspectProjectAuthorityProvenance,
  planPendingProjectAuthorityRecovery, planProjectAuthorityMigration,
  planProjectAuthoritySessionCleanupRecovery, planVendoredPackageSync,
  PROJECT_AUTHORITY_VENDOR_SYNC_SCHEMA, SELF_HEALABLE_VENDOR_PROVENANCE_CODES,
  readProjectAuthority,
} from "../lib/project-authority.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const USAGE = "usage: <inspect|plan|apply|recover|vendor-sync> --root <project-dir> [--activate]";
function parse(args) {
  const output = { activate: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (index === 0 && ["inspect", "plan", "apply", "recover", "vendor-sync"].includes(arg)) output.command = arg;
    else if (arg === "--root") { output.root = args[index + 1]; index += 1; }
    else if (arg === "--plan-sha256") { output.planSha256 = args[index + 1]; index += 1; }
    else if (arg === "--activate") output.activate = true;
    else if (arg === "--help" || arg === "-h") output.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!output.help && (!output.command || !output.root)) return { error: USAGE };
  if (output.activate && !["apply", "recover", "vendor-sync"].includes(output.command)) return { error: "--activate is only valid for apply, recover or vendor-sync" };
  return output;
}
const SHA256 = /^[0-9a-f]{64}$/u;
const SCRIPT = fileURLToPath(import.meta.url);
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function plannedOutput(plan, root, operation) {
  if (plan.status !== "ready") return plan;
  const planSha256 = sha256(JSON.stringify(plan));
  return {
    ...plan,
    planSha256,
    nextAction: {
      kind: "command",
      executable: process.execPath,
      argv: [
        SCRIPT,
        operation,
        "--root",
        root,
        "--plan-sha256",
        planSha256,
        "--activate",
      ],
      mutation: true,
      requiresConfirmation: true,
      executionBoundary: "host-authorized-wsl",
      expected: {
        schema: operation === "recover"
          ? "pipeline.project-authority-recovery.v1"
          : operation === "vendor-sync"
            ? PROJECT_AUTHORITY_VENDOR_SYNC_SCHEMA
            : "pipeline.project-authority.v1",
      },
    },
  };
}
function preview(plan, operation) {
  return { schema: "pipeline.project-authority-prewrite-preview.v1", status: "pre-write-preview", operation, candidate: { planSchema: plan.schema, source: plan.source, compatibility: plan.compatibility }, targets: plan.targets.map(({ path, kind, before, after, changed, journalState }) => ({ path, kind, before, after, changed, journalState })) };
}
/**
 * A marketplace-installed project has no vendored plugin copy, so its package
 * provenance is `unavailable` and the mixed-authority handler refuses with
 * PA-PROVENANCE-REQUIRED -- the only code that handler emits, and only for a
 * `mixed` authority, which is why matching it needs no second authority read.
 * When the missing evidence is a copy this script can provision, name that
 * command instead of returning a refusal with no route out of it.  A broken
 * copy (PA-VENDOR-COPY-UNKNOWN) is deliberately not offered the sync.
 */
function vendorSyncRedirect(plan, provenance, root) {
  if (plan.status !== "provenance-rejected" || plan.code !== "PA-PROVENANCE-REQUIRED") return null;
  if (provenance.status !== "unavailable" || !SELF_HEALABLE_VENDOR_PROVENANCE_CODES.includes(provenance.code)) return null;
  return {
    schema: plan.schema,
    status: "vendor-sync-required",
    code: provenance.code,
    diagnostics: ["mixed-authority adoption requires a local copy of the loaded plugin package as provenance"],
    nextAction: {
      kind: "command",
      executable: process.execPath,
      argv: [SCRIPT, "vendor-sync", "--root", root],
      mutation: false,
      requiresConfirmation: false,
      executionBoundary: "host-authorized-wsl",
      expected: { schema: PROJECT_AUTHORITY_VENDOR_SYNC_SCHEMA },
    },
  };
}
export function main(args = process.argv.slice(2), { write = process.stdout.write.bind(process.stdout), previewWrite = (chunk) => writeSync(2, chunk) } = {}) {
  const options = parse(args); if (options.help) { write(`${USAGE}\n`); return 0; }
  if (options.error) { write(`${options.error}\n`); return 2; }
  let output;
  if (options.command === "inspect") output = readProjectAuthority({ rootDir: options.root });
  else if (options.command === "plan") {
    const provenance = inspectProjectAuthorityProvenance({ rootDir: options.root });
    const plan = planProjectAuthorityMigration({
      rootDir: options.root,
      provenance: provenance.status === "ready" ? provenance : undefined,
    });
    output = vendorSyncRedirect(plan, provenance, options.root) ?? plannedOutput(plan, options.root, "apply");
  }
  else if (options.command === "apply") {
    const provenance = inspectProjectAuthorityProvenance({ rootDir: options.root });
    const plan = planProjectAuthorityMigration({
      rootDir: options.root,
      provenance: provenance.status === "ready" ? provenance : undefined,
    });
    const redirect = vendorSyncRedirect(plan, provenance, options.root);
    const currentPlanSha256 = sha256(JSON.stringify(plan));
    if (redirect !== null) output = redirect;
    else if (!SHA256.test(options.planSha256 ?? "") || options.planSha256 !== currentPlanSha256) {
      output = { schema: plan.schema, status: "invalid-plan", reason: "plan digest is missing or stale" };
    } else {
      if (options.activate && plan.status === "ready") previewWrite(`${JSON.stringify(preview(plan, "activation"))}\n`);
      output = applyProjectAuthorityMigration(plan, { rootDir: options.root, activate: options.activate });
    }
  }
  else if (options.command === "vendor-sync") {
    // The vendored copy is provisioned exactly like every other mutation here:
    // a readable plan first, then a digest-bound, explicitly activated write.
    const plan = planVendoredPackageSync({ rootDir: options.root });
    if (!options.activate) output = plannedOutput(plan, options.root, "vendor-sync");
    else {
      const currentPlanSha256 = sha256(JSON.stringify(plan));
      if (!SHA256.test(options.planSha256 ?? "") || options.planSha256 !== currentPlanSha256) {
        output = { schema: plan.schema, status: "invalid-plan", reason: "plan digest is missing or stale" };
      } else {
        if (plan.status === "ready") previewWrite(`${JSON.stringify(preview(plan, "vendored-package-sync"))}\n`);
        output = applyVendoredPackageSync(plan, { rootDir: options.root, activate: true });
      }
    }
  } else {
    // Recovery first considers an interrupted authority transaction.  When no
    // such journal exists it may expose the one closed-receipt-only cleanup
    // sanitization; it never routes a nonportable State to a generic writer.
    const pending = planPendingProjectAuthorityRecovery({ rootDir: options.root });
    const plan = pending.status === "none"
      ? planProjectAuthoritySessionCleanupRecovery({ rootDir: options.root })
      : pending;
    if (!options.activate) {
      output = plannedOutput(plan, options.root, "recover");
    } else {
      const currentPlanSha256 = sha256(JSON.stringify(plan));
      if (!SHA256.test(options.planSha256 ?? "") || options.planSha256 !== currentPlanSha256) {
        output = { schema: plan.schema, status: "invalid-plan", reason: "plan digest is missing or stale" };
      } else {
        if (plan.status === "ready") previewWrite(`${JSON.stringify(preview(plan, "recovery"))}\n`);
        output = plan.operation === "sanitize-completed-session-cleanup"
          ? applyProjectAuthoritySessionCleanupRecovery(plan, { rootDir: options.root, activate: true })
          : applyPendingProjectAuthorityRecovery(plan, { rootDir: options.root, activate: true });
      }
    }
  }
  write(`${JSON.stringify(output, null, 2)}\n`); return ["ready", "noop", "applied", "recovered"].includes(output.status) ? 0 : 1;
}
if (isDirectInvocation(import.meta.url)) process.exit(main());

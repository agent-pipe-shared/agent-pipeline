#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Preview-first CLI for the runner-neutral project-authority migration. */
import { writeSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  applyPendingProjectAuthorityRecovery, applyProjectAuthorityMigration,
  applyPendingProjectAuthorityStateSynchronizationRecovery,
  applyProjectAuthorityStateSynchronization,
  applyProjectAuthorityStateReconciliation, planPendingProjectAuthorityRecovery, planProjectAuthorityMigration,
  planProjectAuthorityStateReconciliation,
  planPendingProjectAuthorityStateSynchronizationRecovery,
  planProjectAuthorityStateSynchronization,
  readProjectAuthority,
} from "../lib/project-authority.mjs";

function parse(args) {
  const output = { activate: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (index === 0 && ["inspect", "plan", "apply", "recover", "reconcile-state", "sync-state", "recover-sync"].includes(arg)) output.command = arg;
    else if (arg === "--root") { output.root = args[index + 1]; index += 1; }
    else if (arg === "--activate") output.activate = true;
    else if (arg === "--help" || arg === "-h") output.help = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (!output.help && (!output.command || !output.root)) return { error: "usage: <inspect|plan|apply|recover|reconcile-state|sync-state|recover-sync> --root <project-dir> [--activate]" };
  if (output.activate && !["apply", "recover", "reconcile-state", "sync-state", "recover-sync"].includes(output.command)) return { error: "--activate is only valid for apply, recover, reconcile-state, sync-state, or recover-sync" };
  return output;
}
function preview(plan, operation) {
  const targets = plan.targets ?? (plan.target ? [plan.target] : []);
  const explanation = operation === "dual-state-synchronization"
    ? { summary: "Align both state projections to the neutral authority snapshot while retaining the legacy phase and transition timestamp.", why: "This prevents dual-read consumers from observing conflicting feature state. The pre-write journal retains both exact preimages so an interrupted write can be recovered without guessing.", operatorAction: "Explicit activation applies the exact preview only; it does not broaden authority or remove the legacy projection." }
    : operation === "dual-state-sync-recovery"
      ? { summary: "Restore the two recorded state preimages after an interrupted synchronization.", why: "Recovery returns both projections to the last proven consistent pair instead of silently completing a partial write.", operatorAction: "Explicit activation restores only the journal-bound preimages shown below." }
      : { summary: "Apply the exact authority preview shown below.", why: "The writer binds every destination to its observed preimage before a write.", operatorAction: "Explicit activation applies only this unchanged plan." };
  return { schema: "pipeline.project-authority-prewrite-preview.v1", status: "pre-write-preview", operation, explanation, candidate: { planSchema: plan.schema, source: plan.source ?? "neutral", compatibility: plan.compatibility ?? (operation === "dual-state-synchronization" ? "neutral-authority-with-legacy-phase" : "single-state-correction") }, targets: targets.map(({ path, kind, before, after, changed, journalState }) => ({ path, kind, before, after, changed, journalState })) };
}
export function main(args = process.argv.slice(2), { write = process.stdout.write.bind(process.stdout), previewWrite = (chunk) => writeSync(2, chunk) } = {}) {
  const options = parse(args); if (options.help) { write("usage: <inspect|plan|apply|recover|reconcile-state|sync-state|recover-sync> --root <project-dir> [--activate]\n"); return 0; }
  if (options.error) { write(`${options.error}\n`); return 2; }
  let output;
  if (options.command === "inspect") output = readProjectAuthority({ rootDir: options.root });
  else if (options.command === "plan") output = planProjectAuthorityMigration({ rootDir: options.root });
  else if (options.command === "apply") {
    const plan = planProjectAuthorityMigration({ rootDir: options.root });
    if (options.activate && plan.status === "ready") previewWrite(`${JSON.stringify(preview(plan, "activation"))}\n`);
    output = applyProjectAuthorityMigration(plan, { rootDir: options.root, activate: options.activate });
  } else {
    const plan = options.command === "recover"
      ? planPendingProjectAuthorityRecovery({ rootDir: options.root })
      : options.command === "recover-sync" ? planPendingProjectAuthorityStateSynchronizationRecovery({ rootDir: options.root })
        : options.command === "reconcile-state" ? planProjectAuthorityStateReconciliation({ rootDir: options.root }) : planProjectAuthorityStateSynchronization({ rootDir: options.root });
    const operation = options.command === "recover" ? "recovery" : options.command === "recover-sync" ? "dual-state-sync-recovery" : options.command === "sync-state" ? "dual-state-synchronization" : "state-reconciliation";
    if (options.activate && plan.status === "ready") previewWrite(`${JSON.stringify(preview(plan, operation))}\n`);
    output = options.command === "recover"
      ? applyPendingProjectAuthorityRecovery(plan, { rootDir: options.root, activate: options.activate })
      : options.command === "recover-sync" ? applyPendingProjectAuthorityStateSynchronizationRecovery(plan, { rootDir: options.root, activate: options.activate })
        : options.command === "reconcile-state" ? applyProjectAuthorityStateReconciliation(plan, { rootDir: options.root, activate: options.activate }) : applyProjectAuthorityStateSynchronization(plan, { rootDir: options.root, activate: options.activate });
  }
  write(`${JSON.stringify(output, null, 2)}\n`); return ["ready", "noop", "applied", "recovered"].includes(output.status) ? 0 : 1;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());

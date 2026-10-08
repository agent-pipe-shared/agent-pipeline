#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Refresh the installed git hooks whose recorded plugin copy is stale -- and nothing else.
 *
 * Target of the typed `hook-refresh-required` preflight action (HOOKREFRESH, Rulings 67, 69, 70). It is the
 * narrow sibling of `clone-hook-readiness.mjs`: that coordinator installs MISSING mandatory hooks, this one
 * only upgrades hooks that are already installed by the pipeline and report `updateRequired`.
 *
 * Safety contract:
 *  - A hook is applied only when its own plan is `ready-to-upgrade` AND `updateRequired === true`.
 *  - Every other plan outcome is skipped and reported, never applied. This pre-filter is the only guard,
 *    because each `applyInstall` re-plans internally and would also install over a `ready` (absent) or
 *    `declined` hook, which a refresh must never do. A foreign or hand-modified hook is likewise left alone.
 *  - One failing hook never aborts the others, and no hook is ever removed.
 *
 * Prints one JSON line (`pipeline.mandatory-hook-refresh.v1`); exits 0 only when the mandatory hooks are ready.
 */
import { resolve } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { assessMandatoryHookReadiness, checkCloneProvisioning } from "./check-clone-provisioning.mjs";
import { applyInstall as applyPreCommit, planInstall as planPreCommit } from "./pre-commit-hook-install.mjs";
import { applyInstall as applyCommitMsg, planInstall as planCommitMsg } from "./commit-msg-hook-install.mjs";
import { applyInstall as applyPrePush, planInstall as planPrePush } from "./pre-push-hook-install.mjs";

export const MANDATORY_HOOK_REFRESH_SCHEMA = "pipeline.mandatory-hook-refresh.v1";

/** The hooks this script may upgrade, in a fixed order. pre-push is advisory but is refreshed alongside. */
const HOOKS = Object.freeze([
  Object.freeze({ id: "pre-commit-hook", plan: planPreCommit, apply: applyPreCommit }),
  Object.freeze({ id: "commit-msg-hook", plan: planCommitMsg, apply: applyCommitMsg }),
  Object.freeze({ id: "pre-push-hook", plan: planPrePush, apply: applyPrePush }),
]);

/** Plan, filter and (only when the plan says an upgrade is due) apply one hook. Never throws. */
function refreshOne(hook, rootDir, dependencies) {
  const plan = (dependencies.plans?.[hook.id] ?? hook.plan)({ rootDir });
  if (plan?.status !== "ready-to-upgrade" || plan.updateRequired !== true) {
    return { id: hook.id, status: plan?.status === "ready-to-upgrade" ? "current" : `skipped-${plan?.status ?? "unknown"}` };
  }
  try {
    const applied = (dependencies.applies?.[hook.id] ?? hook.apply)({ rootDir });
    return { id: hook.id, status: applied?.status === "upgraded" || applied?.status === "installed" ? "refreshed" : `refused-${applied?.status ?? "unknown"}` };
  } catch (error) {
    return { id: hook.id, status: "failed", code: typeof error?.code === "string" ? error.code : "HOOK-REFRESH-APPLY-FAILED" };
  }
}

export function refreshMandatoryHooks(rootDir = process.cwd(), dependencies = {}) {
  const root = resolve(rootDir);
  const results = HOOKS.map((hook) => refreshOne(hook, root, dependencies));
  const readiness = assessMandatoryHookReadiness((dependencies.checkCloneProvisioning ?? checkCloneProvisioning)(root));
  const failed = results.some((entry) => entry.status === "failed" || entry.status.startsWith("refused-"));
  return {
    schema: MANDATORY_HOOK_REFRESH_SCHEMA,
    root,
    status: failed ? "failed" : readiness.status === "ready" ? "ready" : "pending",
    results,
    readiness: { status: readiness.status, code: readiness.code, required: readiness.required },
  };
}

export function main(argv = process.argv.slice(2), io = console, dependencies = {}) {
  let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && typeof argv[i + 1] === "string") root = argv[++i];
    else throw Object.assign(new Error("usage: refresh-mandatory-hooks.mjs --root <repo>"), { code: "HOOK-REFRESH-CLI" });
  }
  const result = refreshMandatoryHooks(root, dependencies);
  io.log(JSON.stringify(result));
  return result.status === "ready" ? 0 : 2;
}

if (isDirectInvocation(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) {
    process.stderr.write(`${error?.code ?? "HOOK-REFRESH-ERROR"}: ${error?.message}\n`);
    process.exitCode = 2;
  }
}

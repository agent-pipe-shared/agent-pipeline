#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Bounded coordinator for the two hooks required before a local repo is ready. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { assessMandatoryHookReadiness, checkCloneProvisioning } from "./check-clone-provisioning.mjs";
import { applyInstall as applyPreCommit } from "./pre-commit-hook-install.mjs";
import { applyInstall as applyCommitMsg } from "./commit-msg-hook-install.mjs";

export function inspectMandatoryHookReadiness(rootDir = process.cwd()) {
  const root = resolve(rootDir);
  const report = checkCloneProvisioning(root);
  const readiness = assessMandatoryHookReadiness(report);
  const nextAction = readiness.status === "provisioning-required" ? {
    kind: "command",
    executable: process.execPath,
    argv: [fileURLToPath(import.meta.url), "--root", root, "--apply"],
    mutation: true,
    requiresConfirmation: true,
    expected: { schema: "pipeline.mandatory-hook-readiness.v1", status: "ready" },
  } : null;
  return { schema: "pipeline.mandatory-hook-readiness.v1", root, status: readiness.status, code: readiness.code, required: readiness.required, nextAction };
}

export function applyMandatoryHookReadiness(rootDir = process.cwd(), dependencies = {}) {
  const before = inspectMandatoryHookReadiness(rootDir);
  if (before.status !== "provisioning-required") return { ...before, status: before.status === "ready" ? "ready" : "refused" };
  const required = new Map(before.required.map((entry) => [entry.id, entry]));
  if ([...required.values()].some((entry) => entry.status !== "install")) {
    return { ...before, status: "refused", code: "HOOK-READINESS-PLAN-DRIFT" };
  }
  const installPreCommit = dependencies.applyPreCommit ?? applyPreCommit;
  const installCommitMsg = dependencies.applyCommitMsg ?? applyCommitMsg;
  const results = [
    { id: "pre-commit-hook", result: installPreCommit({ rootDir: resolve(rootDir) }) },
    { id: "commit-msg-hook", result: installCommitMsg({ rootDir: resolve(rootDir) }) },
  ];
  const after = inspectMandatoryHookReadiness(rootDir);
  return {
    ...after,
    status: after.status === "ready" ? "ready" : "readback-failed",
    code: after.status === "ready" ? null : "HOOK-READINESS-READBACK-FAILED",
    installResults: results,
  };
}

export async function main(argv = process.argv.slice(2), io = console) {
  let root = process.cwd();
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && typeof argv[i + 1] === "string") root = argv[++i];
    else if (argv[i] === "--apply" && !apply) apply = true;
    else throw Object.assign(new Error("usage: clone-hook-readiness.mjs --root <repo> [--apply]"), { code: "HOOK-READINESS-CLI" });
  }
  const result = apply ? applyMandatoryHookReadiness(root) : inspectMandatoryHookReadiness(root);
  io.log(JSON.stringify(result));
  return result.status === "ready" ? 0 : 2;
}

if (isDirectInvocation(import.meta.url)) main().then((code) => { process.exitCode = code; }, (error) => {
  process.stderr.write(`${error.code ?? "HOOK-READINESS-ERROR"}: ${error.message}\n`);
  process.exitCode = 2;
});

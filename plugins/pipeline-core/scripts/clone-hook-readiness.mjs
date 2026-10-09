#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Bounded coordinator for the two hooks required before a local repo is ready. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { assessMandatoryHookReadiness, checkCloneProvisioning } from "./check-clone-provisioning.mjs";
import { applyInstall as applyPreCommit, applyRemoval as removePreCommit } from "./pre-commit-hook-install.mjs";
import { applyInstall as applyCommitMsg } from "./commit-msg-hook-install.mjs";

/** Result statuses by which an installer reports that the hook is now in place. Anything else a second
 * install RETURNS (a `refused-*` result, or no recognisable status) is a failed install, like a throw. */
const APPLIED_INSTALL_STATUSES = new Set(["installed", "upgraded"]);

/** Typed failure of `applyMandatoryHookReadiness` when the second mandatory hook (commit-msg) could not
 * be installed after the first (pre-commit) was, whether that install threw or returned a refusal. `code` is one of:
 *  - HOOK-READINESS-APPLY-ROLLED-BACK: pre-commit, installed by this same call, was removed again.
 *  - HOOK-READINESS-APPLY-ROLLBACK-FAILED: that removal did not succeed; the repository is half-applied.
 *  - HOOK-READINESS-APPLY-FAILED: pre-commit was not installed by this call, so nothing was rolled back.
 * `cause` is always the original commit-msg install failure (the thrown error, or the returned refusal result);
 * `rollback.error` is the removal failure, if any. */
export class MandatoryHookReadinessApplyError extends Error {
  constructor({ code, message, failedHook, rollback, readinessAfter, cause }) {
    super(message, { cause });
    this.name = "MandatoryHookReadinessApplyError";
    this.code = code;
    this.failedHook = failedHook;
    this.rollback = rollback;
    this.readinessAfter = readinessAfter;
  }
}

function describeFailure(value) {
  if (value instanceof Error) return value.code ? `${value.code}: ${value.message}` : value.message;
  return String(value?.status ?? value);
}

/** Undo the pre-commit install made earlier in this same call. It only ever runs for a hook this call
 * installed (`preCommitResult` is `null` when pre-commit was already current and so never attempted), and the
 * installer's own removal path refuses a hook that was modified since, so a pre-existing or foreign hook is
 * never removed. */
function applyFailureError({ rootDir, cause, preCommitResult, remove }) {
  const failedHook = "commit-msg-hook";
  const hook = "pre-commit-hook";
  const failure = describeFailure(cause);
  const readinessAfter = () => {
    try {
      const { status, code } = inspectMandatoryHookReadiness(rootDir);
      return { status, code };
    } catch {
      return null;
    }
  };
  if (preCommitResult?.status !== "installed") {
    return new MandatoryHookReadinessApplyError({
      code: "HOOK-READINESS-APPLY-FAILED",
      message: `mandatory hook readiness apply failed at ${failedHook} (${failure}); ${hook} was not installed by this call, so no rollback was needed`,
      failedHook,
      rollback: { hook, status: "not-needed" },
      readinessAfter: readinessAfter(),
      cause,
    });
  }
  let removal = null;
  let removalError;
  try {
    removal = remove({ rootDir });
  } catch (error) {
    removalError = error;
  }
  const after = readinessAfter();
  const afterText = after ? `${after.status}${after.code ? ` / ${after.code}` : ""}` : "unreadable";
  if (removalError === undefined && removal?.status === "removed") {
    return new MandatoryHookReadinessApplyError({
      code: "HOOK-READINESS-APPLY-ROLLED-BACK",
      message: `mandatory hook readiness apply failed at ${failedHook} (${failure}); ${hook}, installed earlier in this call, was rolled back (readiness now ${afterText})`,
      failedHook,
      rollback: { hook, status: "rolled-back" },
      readinessAfter: after,
      cause,
    });
  }
  const rollbackFailure = removalError === undefined ? describeFailure(removal ?? "no result") : describeFailure(removalError);
  return new MandatoryHookReadinessApplyError({
    code: "HOOK-READINESS-APPLY-ROLLBACK-FAILED",
    message: `mandatory hook readiness apply failed at ${failedHook} (${failure}); rollback failed for ${hook} (${rollbackFailure}), so ${hook} remains installed and the repository is half-applied (readiness now ${afterText})`,
    failedHook,
    rollback: { hook, status: "failed", ...(removalError === undefined ? { result: removal } : { error: removalError }) },
    readinessAfter: after,
    cause,
  });
}

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
  // Ruling 84 F1: a partly provisioned pair is installable. Only the `install` entries are installed; a `current`
  // entry (and a stale `refresh` one, which counts as current here and is refreshed by its own helper) is left
  // byte-identical. Anything else is a drift between the plan and this read.
  if ([...required.values()].some((entry) => entry.status !== "install" && entry.status !== "current" && entry.status !== "refresh")
    || ![...required.values()].some((entry) => entry.status === "install")) {
    return { ...before, status: "refused", code: "HOOK-READINESS-PLAN-DRIFT" };
  }
  const installPreCommit = dependencies.applyPreCommit ?? applyPreCommit;
  const installCommitMsg = dependencies.applyCommitMsg ?? applyCommitMsg;
  const root = resolve(rootDir);
  const remove = dependencies.removePreCommit ?? removePreCommit;
  const results = [];
  // `null` when pre-commit was not installed by this call, which makes the rollback `not-needed`.
  let preCommitResult = null;
  if (required.get("pre-commit-hook")?.status === "install") {
    preCommitResult = installPreCommit({ rootDir: root });
    results.push({ id: "pre-commit-hook", result: preCommitResult });
  }
  if (required.get("commit-msg-hook")?.status === "install") {
    let commitMsgResult;
    try { commitMsgResult = installCommitMsg({ rootDir: root }); }
    catch (cause) { throw applyFailureError({ rootDir: root, cause, preCommitResult, remove }); }
    // A returned refusal (plan/install race) is a failed install exactly like a throw: it must not fall through to
    // the readback with pre-commit left installed beside a missing commit-msg hook.
    if (!APPLIED_INSTALL_STATUSES.has(commitMsgResult?.status)) {
      throw applyFailureError({ rootDir: root, cause: commitMsgResult, preCommitResult, remove });
    }
    results.push({ id: "commit-msg-hook", result: commitMsgResult });
  }
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

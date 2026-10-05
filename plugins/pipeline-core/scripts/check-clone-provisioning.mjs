#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-clone-provisioning.mjs — check machine-local state provisioning in a fresh or existing clone.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validatePoGateProfileReceipt, poGateReceiptFingerprintMatches, poGateProfileReceiptPath } from "../lib/po-gate-authority.mjs";
import { assessWindowsPrivatePath } from "../lib/windows-private-state.mjs";
import { gateConfig, loadManifest } from "../lib/manifest.mjs";
import { planInstall as planPrePushHookInstall } from "./pre-push-hook-install.mjs";
import { planInstall as planPreCommitHookInstall } from "./pre-commit-hook-install.mjs";
import { planInstall as planCommitMsgHookInstall } from "./commit-msg-hook-install.mjs";

export const CLONE_PROVISIONING_REPORT_SCHEMA = "pipeline.clone-provisioning-report.v1";

export function assessMandatoryHookReadiness(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const byId = new Map(checks.map((entry) => [entry.id, entry]));
  const observed = ["pre-commit-hook", "commit-msg-hook"].map((id) => byId.get(id));
  if (observed.some((entry) => !entry)) return { status: "unresolved", code: "HOOK-READINESS-OBSERVATION-INCOMPLETE", required: [] };
  const projection = observed.map(({ id, status, repairAction, path }) => ({ id, status, path, repairAction }));
  // `refresh` (HOOKREFRESH-S1) is an installed, still-owned hook bound to an older plugin snapshot. It
  // keeps enforcing its older rules, so for readiness it counts as `current` and is only listed: it
  // must never turn a mixed current+stale pair into `blocked / HOOK-READINESS-STATE-UNSUPPORTED`.
  const refreshAvailable = projection.filter((entry) => entry.status === "refresh").map((entry) => entry.id);
  const required = observed.map((entry) => (entry.status === "refresh" ? { ...entry, status: "current" } : entry));
  if (required.every((entry) => entry.status === "current")) {
    return { status: "ready", code: null, required: projection, ...(refreshAvailable.length > 0 ? { refreshAvailable } : {}) };
  }
  if (required.some((entry) => entry.status === "foreign-owner" || entry.status === "decline")) {
    return { status: "blocked", code: "HOOK-READINESS-OWNER-OR-DECLINE", required: projection };
  }
  if (required.some((entry) => entry.status === "unresolved")) {
    return { status: "unresolved", code: "HOOK-READINESS-REPOSITORY-UNRESOLVED", required: projection };
  }
  if (required.every((entry) => entry.status === "install")) {
    return { status: "provisioning-required", code: "HOOK-READINESS-INSTALL-REQUIRED", required: projection };
  }
  return { status: "blocked", code: "HOOK-READINESS-STATE-UNSUPPORTED", required: projection };
}

export function applyMandatoryHookGate(status, readiness) {
  if (status !== "ready") return status;
  if (readiness?.status === "ready") return status;
  if (readiness?.status === "provisioning-required") return "hook-provisioning-required";
  return "hook-provisioning-blocked";
}

const HOOK_SPECS = Object.freeze([
  { id: "pre-push-hook", name: "pre-push", planInstall: planPrePushHookInstall, installer: "pre-push-hook-install.mjs", pushBackstop: true },
  { id: "pre-commit-hook", name: "pre-commit", planInstall: planPreCommitHookInstall, installer: "pre-commit-hook-install.mjs" },
  { id: "commit-msg-hook", name: "commit-msg", planInstall: planCommitMsgHookInstall, installer: "commit-msg-hook-install.mjs" },
]);

/** A deliberately small projection over each installer's authoritative plan.
 * The installer keeps ownership/mutation rules; this function merely gives all
 * three hooks one vocabulary for bootstrap, clone and release surfaces. */
export function projectHookProvisioning({ spec, rootDir, commonDir = null } = {}) {
  let plan;
  try { plan = spec.planInstall({ rootDir }); } catch { plan = { status: "repository-unresolved" }; }
  const repairAction = `node plugins/pipeline-core/scripts/${spec.installer} --install`;
  switch (plan.status) {
    case "ready-to-upgrade":
      // A hook that is ours and intact but bound to an older plugin snapshot (every installer reports
      // `updateRequired` since HOOKREFRESH-S1) is `refresh`: reported, never gating, never `install`
      // (which would read as an absent hook) and never a block. Only the ready-to-upgrade state can be
      // refreshable, so foreign, modified, declined and unresolved plans can never project to it.
      if (plan.updateRequired === true) return { id: spec.id, status: "refresh", path: plan.hookPath, repairAction };
      // A plan carrying only the older `current: false` still needs an explicit reinstall, not a misleading "current".
      if (plan.current === false) return { id: spec.id, status: "install", path: plan.hookPath, repairAction };
      return { id: spec.id, status: "current", path: plan.hookPath, repairAction: null };
    case "ready":
      return { id: spec.id, status: "install", path: plan.hookPath || join(commonDir || "", "hooks", spec.name), repairAction };
    case "declined":
      return { id: spec.id, status: "decline", path: plan.hookPath || join(commonDir || "", "hooks", spec.name), repairAction, declinedAt: plan.declinedAt };
    case "foreign-hook-present":
    case "modified-or-unreadable-managed-install":
    case "orphan-managed-file":
    case "unreadable-managed-state":
      // Do not present an installer command as a repair: it must never overwrite this.
      return { id: spec.id, status: "foreign-owner", path: plan.hookPath || join(commonDir || "", "hooks", spec.name), repairAction: null, detail: plan.detail };
    default:
      return { id: spec.id, status: "unresolved", path: plan.hookPath || join(commonDir || "", "hooks", spec.name), repairAction: null, detail: plan.status };
  }
}

/** Shared release-boundary reading.  A blocking push declaration is only backed
 * by the generated, verified pre-push hook.  A decline, foreign hook, modified
 * hook, unresolved repository, or stale binding remains explicitly unbacked;
 * no caller may infer security merely from a file being present. */
export function assessPushHookBackstop(rootDir = process.cwd(), { load = loadManifest, project = projectHookProvisioning } = {}) {
  const root = resolve(rootDir);
  let manifest = null;
  try { manifest = load(root); } catch { /* an unrelated manifest error belongs to its native validator */ }
  const blocking = gateConfig(manifest, "push")?.mode === "blocking";
  const spec = HOOK_SPECS[0];
  const hook = project({ spec, rootDir: root });
  const backed = !blocking || hook.status === "current";
  return {
    blocking,
    backed,
    hook,
    code: backed ? null : "UNBACKED_GATE",
    message: backed ? null : "UNBACKED_GATE: gates.push is blocking, but the generated pre-push backstop is not current.",
    remedy: backed ? null : hook.status === "foreign-owner"
      ? "A foreign pre-push hook owns this path; do not overwrite it. Resolve ownership, then install the generated backstop."
      : `Install the generated pre-push backstop: ${hook.repairAction ?? "inspect hook provisioning"}`,
  };
}

export function checkCloneProvisioning(rootDir = process.cwd()) {
  const resolvedRoot = resolve(rootDir);
  const checks = [];

  let commonDir = null;
  try {
    commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: resolvedRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Non-git repository or unresolvable
    return {
      schema: CLONE_PROVISIONING_REPORT_SCHEMA,
      status: "provisioning-required",
      checks: [
        ...HOOK_SPECS.map((spec) => ({ id: spec.id, status: "unresolved", path: `hooks/${spec.name}`, repairAction: "git init" })),
        { id: "po-profile-receipt", status: "absent", path: "agent-pipeline/po-gate/profile-receipt.json", repairAction: "node setup.mjs --publish-po-profile" },
        { id: "private-state-directory", status: "absent", path: "agent-pipeline", repairAction: "mkdir -p .git/agent-pipeline" },
      ],
    };
  }

  // Hook provisioning is intentionally projected via the installers, not merely
  // existsSync(): a present foreign/modified hook is not a usable pipeline hook.
  for (const spec of HOOK_SPECS) checks.push(projectHookProvisioning({ spec, rootDir: resolvedRoot, commonDir }));

  // 2. PO-profile receipt validity check
  let receiptPath = join(commonDir, "agent-pipeline", "po-gate", "profile-receipt.json");
  if (!existsSync(receiptPath)) {
    checks.push({
      id: "po-profile-receipt",
      status: "absent",
      path: receiptPath,
      repairAction: "node setup.mjs --publish-po-profile",
    });
  } else {
    let valid = false;
    try {
      const raw = readFileSync(receiptPath, "utf8");
      const receipt = JSON.parse(raw);
      if (validatePoGateProfileReceipt(receipt) && poGateReceiptFingerprintMatches({
        receiptFingerprint: receipt.repositoryFingerprint,
        gitCommonDir: commonDir,
        primaryRoot: resolvedRoot,
      })) {
        valid = true;
      }
    } catch {
      valid = false;
    }
    checks.push({
      id: "po-profile-receipt",
      status: valid ? "present" : "invalid",
      path: receiptPath,
      repairAction: valid ? null : "node setup.mjs --publish-po-profile",
    });
  }

  // 3. Private state directory health
  const privateDir = join(commonDir, "agent-pipeline");
  if (!existsSync(privateDir)) {
    checks.push({
      id: "private-state-directory",
      status: "absent",
      path: privateDir,
      repairAction: "mkdir -p " + privateDir,
    });
  } else {
    let secure = false;
    try {
      if (process.platform === "win32") {
        const assessment = assessWindowsPrivatePath(privateDir);
        secure = assessment.status === "secure" || assessment.status === "unavailable";
      } else {
        const stats = statSync(privateDir);
        if (stats.isDirectory()) {
          const mode = stats.mode & 0o777;
          // Secure if not group-writable or other-writable
          secure = (mode & 0o022) === 0;
        }
      }
    } catch {
      secure = false;
    }
    checks.push({
      id: "private-state-directory",
      status: secure ? "present" : "invalid",
      path: privateDir,
      repairAction: secure ? null : "chmod 0700 " + privateDir,
    });
  }

  // `refresh` is detection only and never gates: a stale-but-owned hook still enforces its older rules.
  const refreshAvailable = checks.filter((c) => c.status === "refresh").map((c) => c.id);
  const allReady = checks.every((c) => c.status === "present" || c.status === "current" || c.status === "refresh");
  return {
    schema: CLONE_PROVISIONING_REPORT_SCHEMA,
    status: allReady ? "ready" : "provisioning-required",
    checks,
    ...(refreshAvailable.length > 0 ? { refreshAvailable } : {}),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  let root = process.cwd();
  let check = false;
  let json = false;

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--root" && i + 1 < process.argv.length) {
      root = resolve(process.argv[++i]);
    } else if (arg === "--check") {
      check = true;
    } else if (arg === "--json") {
      json = true;
    }
  }

  const report = checkCloneProvisioning(root);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Clone provisioning status: ${report.status}`);
    for (const c of report.checks) {
      console.log(`  - [${c.status}] ${c.id} (${c.path})${c.repairAction ? ` -> repair: ${c.repairAction}` : ""}`);
    }
  }

  if (check && report.status !== "ready") {
    process.exit(2);
  }
  process.exit(0);
}

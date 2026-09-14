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

export const CLONE_PROVISIONING_REPORT_SCHEMA = "pipeline.clone-provisioning-report.v1";

export function checkCloneProvisioning(rootDir = process.cwd()) {
  const resolvedRoot = resolve(rootDir);
  const checks = [];

  let commonDir = null;
  let hookPath = null;
  try {
    commonDir = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: resolvedRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    hookPath = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks/pre-push"], {
      cwd: resolvedRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Non-git repository or unresolvable
    return {
      schema: CLONE_PROVISIONING_REPORT_SCHEMA,
      status: "provisioning-required",
      checks: [
        { id: "pre-push-hook", status: "absent", path: "hooks/pre-push", repairAction: "git init" },
        { id: "po-profile-receipt", status: "absent", path: "agent-pipeline/po-gate/profile-receipt.json", repairAction: "node setup.mjs --publish-po-profile" },
        { id: "private-state-directory", status: "absent", path: "agent-pipeline", repairAction: "mkdir -p .git/agent-pipeline" },
      ],
    };
  }

  // 1. Pre-push hook check
  if (hookPath && existsSync(hookPath)) {
    checks.push({
      id: "pre-push-hook",
      status: "present",
      path: hookPath,
      repairAction: null,
    });
  } else {
    checks.push({
      id: "pre-push-hook",
      status: "absent",
      path: hookPath || join(commonDir, "hooks", "pre-push"),
      repairAction: "node plugins/pipeline-core/scripts/pre-push-hook-install.mjs",
    });
  }

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

  const allReady = checks.every((c) => c.status === "present");
  return {
    schema: CLONE_PROVISIONING_REPORT_SCHEMA,
    status: allReady ? "ready" : "provisioning-required",
    checks,
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

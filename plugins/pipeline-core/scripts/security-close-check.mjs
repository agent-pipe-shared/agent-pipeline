#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// G20-25: the consumer Verify dispatcher for the baseline-security suite. It runs the configured scanners in the normal delivery
// path (before G20-25 no Verify suite called any, so the configured security gate never executed). A calibration without the gate
// is "not applicable" unless its stakes are critical, which refuses with the repair that configures the gate; a critical calibration
// refuses a scanner that did not execute.
//
// It is its own dispatcher, not a branch of consumer-verify-check.mjs: that file is a never-liftable guard kernel path, and the
// security scan pulls in the whole scanner tree (adapters, evaluators, diagnostics). verify-evidence-producer.mjs hands this
// module's URL to the consumer adapter, which imports it by URL, so no kernel file imports or spawns the scanner tree (GMWKC01).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  elementsOfCompletedScan, isCriticalStakes, readCalibrationStakes, readScannerExceptions, scannerNotExecutedRefusal, securityGateNotConfiguredRefusal, unexcusedNotExecuted,
} from "../lib/security-close-status.mjs";
import { gateConfig, loadManifest } from "../lib/manifest.mjs";

export const SECURITY_SCAN_SCRIPT = fileURLToPath(new URL("./security-scan.mjs", import.meta.url));

export function runSecurityCloseCheck(root, env = process.env) {
  const loaded = loadManifest(root);
  const gate = gateConfig(loaded.manifest, "security");
  if (loaded.status === "absent" || !gate || gate.mode === "off") {
    const refusal = securityGateNotConfiguredRefusal(root, "this Verify run");
    if (refusal) { console.error(refusal); return 1; }
    console.log("security close chain: not applicable -- the security gate is not configured for this project (no manifest, no gate, or mode off)");
    return 0;
  }
  const scan = spawnSync(process.execPath, [SECURITY_SCAN_SCRIPT, "--root", root, "--scan-mode", "snapshot"], { cwd: root, stdio: "inherit", env });
  if (scan.status !== 0 && scan.status !== 1) return 1; // 1 is the scan's own warn-mode exit, which the gate mode already decided
  if (!isCriticalStakes(readCalibrationStakes(root))) return 0;
  let scanners = null;
  try { scanners = JSON.parse(readFileSync(join(root, "evidence", "security-latest.json"), "utf8")).scanners; } catch { /* unreadable evidence: every configured element is not executed */ }
  // Candidate 21h: the critical reading (a skipped license-check did not run) and the named exceptions, the same as the close gate. The scan
  // above already printed each applied exception in its "Security close status" lines.
  const exceptions = readScannerExceptions(root);
  const notExecuted = unexcusedNotExecuted(elementsOfCompletedScan(scanners, { critical: true, exceptions }));
  for (const entry of notExecuted) console.error(scannerNotExecutedRefusal(entry.element, "this Verify run", { rejected: exceptions.rejected }));
  return notExecuted.length === 0 ? 0 : 1;
}

// The consumer adapter contract (lib/consumer-verify.mjs CONSUMER_VERIFY_ADAPTER): `runConsumerVerifyCheck(check, ...args)`.
export function runConsumerVerifyCheck(check) {
  if (check !== "security") { console.error(`unknown security Verify check: ${check}`); return 1; }
  try { return runSecurityCloseCheck(process.cwd()); } catch (error) { console.error(error.message); return 1; }
}

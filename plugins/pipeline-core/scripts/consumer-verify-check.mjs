#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { elementsOfCompletedScan, isCriticalStakes, readCalibrationStakes, scannerNotExecutedRefusal, securityGateNotConfiguredRefusal } from "../lib/security-close-status.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { readProjectCalibrationIdentity } from "../lib/project-calibration-identity.mjs";
import { gateConfig, loadManifest } from "../lib/manifest.mjs";
import { checkVerifyContractConfigured } from "./push-gate-satisfiability.mjs";
import { inspectConsumerBaseline } from "../lib/consumer-baseline-verify.mjs";
import { readConsumerVerifyConfiguration } from "../lib/consumer-verify.mjs";

// G20-25: the normal delivery path runs the configured scanners (before this, no Verify suite called any, so the configured security
// gate never executed). A calibration without the gate is "not applicable"; a critical calibration refuses a scanner that did not execute.
export function runSecurityCloseCheck(root, env = process.env) {
  const loaded = loadManifest(root);
  const gate = gateConfig(loaded.manifest, "security");
  if (loaded.status === "absent" || !gate || gate.mode === "off") {
    const refusal = securityGateNotConfiguredRefusal(root, "this Verify run");
    if (refusal) { console.error(refusal); return 1; }
    console.log("security close chain: not applicable -- the security gate is not configured for this project (no manifest, no gate, or mode off)");
    return 0;
  }
  const scan = spawnSync(process.execPath, [fileURLToPath(new URL("./security-scan.mjs", import.meta.url)), "--root", root, "--scan-mode", "snapshot"], { cwd: root, stdio: "inherit", env });
  if (scan.status !== 0 && scan.status !== 1) return 1; // 1 is the scan's own warn-mode exit, which the gate mode already decided
  if (!isCriticalStakes(readCalibrationStakes(root))) return 0;
  let scanners = null;
  try { scanners = JSON.parse(readFileSync(join(root, "evidence", "security-latest.json"), "utf8")).scanners; } catch { /* unreadable evidence: every configured element is not executed */ }
  const notExecuted = elementsOfCompletedScan(scanners).filter((entry) => entry.state === "not executed");
  for (const entry of notExecuted) console.error(scannerNotExecutedRefusal(entry.element, "this Verify run"));
  return notExecuted.length === 0 ? 0 : 1;
}

export function runConsumerVerifyCheck(check, commandId = null) {
  const root = process.cwd();
  try {
    const artifact = resolveAuthorityArtifactPath("calibration", { rootDir: root });
    if (!["ready", "missing"].includes(artifact.authorityStatus)) throw new Error(`project authority is ${artifact.authorityStatus}`);
    const projectIdentity = readProjectCalibrationIdentity({ rootDir: root });
    if (projectIdentity.status !== "resolved") throw new Error(`project calibration identity: ${projectIdentity.code}${projectIdentity.message === undefined ? "" : ` - ${projectIdentity.message}`}`);
    const calibrationBytes = readFileSync(artifact.path);
    if (projectIdentity.source.path !== artifact.relPath || projectIdentity.source.sha256 !== createHash("sha256").update(calibrationBytes).digest("hex")) throw new Error("project calibration identity: PCI-SOURCE-DRIFT");
    const calibration = JSON.parse(calibrationBytes.toString("utf8"));
    if (check === "calibration") {
      console.log("project calibration and authority: passed");
      console.log(JSON.stringify({ project: projectIdentity.project, projectIdentity }));
      return 0;
    }
    if (check === "manifest") {
      const manifest = loadManifest(root);
      console.log(JSON.stringify({ check, ...manifest }));
      return manifest.status === "invalid" ? 1 : 0;
    }
    if (check === "repository-baseline") {
      const result = inspectConsumerBaseline(root);
      console.log(JSON.stringify(result));
      return result.status === "passed" ? 0 : 1;
    }
    if (check === "security") return runSecurityCloseCheck(root);
    if (check === "configured-command") {
      const configuration = readConsumerVerifyConfiguration(root);
      const commands = [...configuration.baseline, ...configuration.areas.flatMap((area) => area.commands)];
      const selected = commands.find((entry) => entry.id === commandId);
      if (!selected) throw new Error("unknown configured Verify command id");
      const result = spawnSync(selected.command, { cwd: root, shell: true, stdio: "inherit" });
      return result.status ?? 1;
    }
    const contract = checkVerifyContractConfigured(root);
    if (!contract.ok && check === "contract" && contract.status === "missing") {
      console.log("project Verify command contract: baseline-only; add verify or verifyImpact commands before release");
      return 0;
    }
    if (!contract.ok) throw new Error(contract.message);
    if (/verify-evidence-producer\.mjs|consumer-verify\.mjs|consumer-verify-check\.mjs/u.test(calibration.verify)) throw new Error("verify must name the project command, not the evidence producer or adapter");
    if (check === "contract") { console.log("project Verify command contract: passed"); return 0; }
    if (check !== "product") throw new Error("unknown consumer Verify check");
    // Run the project command exactly as configured. Inherit diagnostics into the
    // journal's bounded private pipe; never buffer product output a second time.
    const result = spawnSync(calibration.verify, { cwd: root, shell: true, stdio: "inherit" });
    return result.status ?? 1;
  } catch (error) { console.error(error.message); return 1; }
}

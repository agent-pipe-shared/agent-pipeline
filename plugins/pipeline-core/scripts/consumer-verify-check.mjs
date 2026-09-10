#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { loadManifest } from "../lib/manifest.mjs";
import { checkVerifyContractConfigured } from "./push-gate-satisfiability.mjs";

export function runConsumerVerifyCheck(check) {
  const root = process.cwd();
  try {
    const artifact = resolveAuthorityArtifactPath("calibration", { rootDir: root });
    if (!["ready", "missing"].includes(artifact.authorityStatus)) throw new Error(`project authority is ${artifact.authorityStatus}`);
    const calibration = JSON.parse(readFileSync(artifact.path, "utf8"));
    if (!calibration || Array.isArray(calibration) || typeof calibration !== "object" || typeof calibration.project !== "string" || !calibration.project.trim()) throw new Error("calibration requires a non-empty project name");
    if (check === "calibration") { console.log("project calibration and authority: passed"); return 0; }
    if (check === "manifest") {
      const manifest = loadManifest(root);
      console.log(JSON.stringify({ check, ...manifest }));
      return manifest.status === "invalid" ? 1 : 0;
    }
    const contract = checkVerifyContractConfigured(root);
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

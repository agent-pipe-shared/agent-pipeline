#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConsumerVerifyConfiguration } from "../lib/consumer-verify.mjs";
import { preflightBrowserEvidence } from "./browser-evidence-preflight.mjs";

// C31-M7 (stage 1 of the browser smoke in Verify): the dispatcher the generated Verify adapter imports for the reserved verifyImpact id
// `browser-smoke` (the producer passes this module's URL; no kernel file imports it, like architecture-boundary-check.mjs).
// The declared command runs only behind the browser capability preflight, so "no browser" is never read as "the app is broken":
//   - no entry                  -> "browser smoke: not applicable", exit 0 (the producer builds no step for it; this is a safety net)
//   - preflight not ready       -> exit 1 WITHOUT running the command; the log carries the typed code, that no browser test ran,
//                                  "browser verification pending" and one human step (the Pipeline never installs or downloads)
//   - preflight ready, exit != 0 -> "browser smoke failed" and the command's own exit code
// Stage 1 supports Playwright and Chromium only: that is what the preflight probes.
export const BROWSER_SMOKE_ID = "browser-smoke";

const PREFLIGHT_SCRIPT = fileURLToPath(new URL("./browser-evidence-preflight.mjs", import.meta.url));
const HUMAN_STEPS = Object.freeze({
  "BEP-PLAYWRIGHT-PACKAGE-UNAVAILABLE": "the human operator adds the project's Playwright dev dependency (for example `npm install --save-dev @playwright/test`), then reruns Verify.",
  "BEP-CHROMIUM-UNAVAILABLE": "run `npx playwright install chromium` in the project, then rerun Verify.",
  "BEP-BROWSER-HOST-DEPENDENCY-UNAVAILABLE": "the human operator installs the browser's system libraries (`npx playwright install-deps chromium` needs administrator rights), then reruns Verify.",
  "BEP-CHROMIUM-LAUNCH-UNAVAILABLE": "the human operator makes the project's Chromium start on this machine (a broken download is repaired with `npx playwright install chromium`; a sandbox or display restriction needs the operator), then reruns Verify.",
});
const UNKNOWN_STATE_STEP = `the human operator runs \`node ${PREFLIGHT_SCRIPT} --root .\` in the project, reads its typed result and fixes the named state, then reruns Verify.`;

export function runConsumerVerifyCheck(check, deps = {}) {
  const { rootDir = process.cwd(), readConfiguration = readConsumerVerifyConfiguration, preflightDeps = {}, spawnFn = spawnSync, out = console.log, err = console.error } = deps !== null && typeof deps === "object" ? deps : {};
  try {
    if (check !== BROWSER_SMOKE_ID) { err(`unknown browser smoke Verify check: ${check}`); return 1; }
    const configuration = readConfiguration(rootDir);
    const selected = [...configuration.baseline, ...configuration.areas.flatMap((area) => area.commands)].find((entry) => entry.id === BROWSER_SMOKE_ID);
    if (!selected) { out("browser smoke: not applicable (no browser-smoke command is declared)"); return 0; }
    const preflight = preflightBrowserEvidence({ rootDir, requiredEvidence: "browser-e2e" }, preflightDeps);
    if (preflight.status !== "ready") {
      err(`browser smoke unavailable: ${preflight.code}: ${preflight.detail}`);
      err("no browser test ran; this is not a product failure");
      err("browser verification pending");
      err(`human step: ${HUMAN_STEPS[preflight.code] ?? UNKNOWN_STATE_STEP}`);
      // C31c (cloud review of candidate 31): a project that already used this id for a command of another tool sees a red suite that asks for Playwright; say why it was taken over.
      err("note: the id browser-smoke is reserved for a Playwright and Chromium smoke test; a project command of another tool that uses this id must be renamed (docs/usage.md)");
      return 1;
    }
    const result = spawnFn(selected.command, { cwd: rootDir, shell: true, stdio: "inherit" });
    if (result.status === 0) return 0;
    err(`browser smoke failed: the declared command exited with ${result.status ?? "no exit code"} although the browser was available; this is a product failure, not a missing browser`);
    return result.status ?? 1;
  } catch (error) { err(error.message); return 1; }
}

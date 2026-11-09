#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-close-security-completeness.mjs -- Close call site for AC8's shared completeness
 * evaluator (`cyb-2-feature-spec.md` AC8: Push/PR/Close/Release must all consult the SAME
 * completeness evaluator, no parallel duplicate evaluator per call site; CYB-2I-0's shared
 * `checkSecurityCompleteness` extraction is the foundation this reuses unchanged).
 *
 * Registered as a `close.pre` extension (this repo's own `.claude/pipeline.json`'s
 * `ritualExtensions.close.pre`; `close-block/SKILL.md`'s own extension-point contract): runs
 * at close.pre step 1, seeing HEAD and the working tree exactly as the block/session left
 * them, before any of the close ritual's own writes.
 *
 * Mirrors `guard-push.mjs`'s own gate-activation pattern EXACTLY (~line 1090-1106): manifest
 * absent, OR the security gate absent, OR its `mode === "off"` -> exit 0 immediately (same
 * "opt-in feature, nothing configured" semantics as the push gate -- not a new independent
 * policy for Close).
 *
 * Unlike the push gate, there is no "pushed source" here: Close is about the commit HEAD is
 * about to be treated as this repo's current, closed state -- so `commit`/`tree` are resolved
 * via `git rev-parse HEAD` / `git rev-parse HEAD^{tree}` against the project root (`close.pre`
 * entries always run from there, per `close-block/SKILL.md`'s own contract), never a pushed
 * ref.
 *
 * SCOPE BOUNDARY (deliberate, not a bug): if HEAD's own `evidence/security-latest.v2.json`/
 * `.verdict.json` don't exist in the working tree at close time (e.g. no `security-scan.mjs`
 * run happened yet this session), this fails closed with a missing-evidence reason and blocks
 * Close -- Close must not succeed silently without completeness evidence when the security
 * gate is active.
 *
 * Exit code contract (a `close.pre` shell entry, no CLI args):
 *   0 = pass or skip (gate inactive/unconfigured)
 *   2 = fail (mirrors `check-spec-retention.mjs`'s own `exit(2)` convention)
 *
 * VERIFY: node plugins/pipeline-core/scripts/check-close-security-completeness.test.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SECURITY_ELEMENTS, SECURITY_RUN_COMMAND, formatSecurityCloseStatus, isCriticalStakes, readCalibrationStakes, readScannerExceptions, securityCloseElements,
  securityGateNotConfiguredRefusal, unexcusedNotExecuted,
} from "../lib/security-close-status.mjs";

import { loadManifest, gateConfig } from "../lib/manifest.mjs";
import { checkSecurityCompleteness } from "../lib/security-completeness-gate.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

/**
 * Runs the Close-site completeness check against `root`. Returns:
 *   - `{ skipped: true }` when the manifest is absent, OR the security gate is absent, OR its
 *     `mode === "off"` (opt-in feature, nothing configured -- same semantics as the push gate).
 *   - `{ skipped: false, commit, failures }` once the gate is active (`failures` is a
 *     `string[]`; empty = pass). A HEAD commit/tree resolution failure is itself reported as a
 *     failure reason rather than thrown.
 */
export function checkCloseSecurityCompleteness(root) {
  const manifestResult = loadManifest(root);
  const securityGate = gateConfig(manifestResult.manifest, "security");
  if (manifestResult.status === "absent" || !securityGate || securityGate.mode === "off") {
    return { skipped: true };
  }

  const headCommit = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 5000 });
  const commit = headCommit.status === 0 ? headCommit.stdout.trim() : null;
  if (!commit) {
    return { skipped: false, commit: null, failures: ["HEAD commit could not be resolved (git rev-parse HEAD failed)"] };
  }

  const headTree = spawnSync("git", ["-C", root, "rev-parse", "HEAD^{tree}"], { encoding: "utf8", timeout: 5000 });
  const tree = headTree.status === 0 ? headTree.stdout.trim() : null;

  const failures = checkSecurityCompleteness({ projectDir: root, commit, tree, subjectLabel: "the sealed HEAD commit" });
  // G20-25: the four-state status of every security element, read from the scan evidence the completeness check just bound.
  let scanners = null;
  try { scanners = JSON.parse(readFileSync(join(root, "evidence", "security-latest.json"), "utf8")).scanners; } catch { /* no readable scan evidence: every configured element reads "not executed" */ }
  const enabled = Object.fromEntries(SECURITY_ELEMENTS.map((key) => [key, manifestResult.manifest?.security?.scanners?.[key]?.enabled ?? true]));
  // Candidate 21h: the critical reading and the named exceptions, so the printed lines match what the completeness check above decided.
  const critical = isCriticalStakes(readCalibrationStakes(root));
  return { skipped: false, commit, failures, elements: securityCloseElements({ scanners, enabled, critical, exceptions: critical ? readScannerExceptions(root) : null }) };
}

if (isDirectInvocation(import.meta.url)) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const result = checkCloseSecurityCompleteness(root);
  if (result.skipped) {
    // A critical calibration without a gate is blocked and names the repair command (G20-25); any other calibration is "not applicable",
    // said out loud: a silent exit 0 here read like a passed security check.
    const refusal = securityGateNotConfiguredRefusal(root, "the close chain");
    if (refusal) { console.error(`CLOSE SECURITY COMPLETENESS FAILED: ${refusal}`); process.exit(2); }
    console.log("CLOSE SECURITY CHAIN: not applicable -- the security gate is not configured for this project (no manifest, no gate, or mode off).");
    process.exit(0);
  }
  for (const line of formatSecurityCloseStatus(result.elements)) console.log(`  ${line}`);
  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error(`CLOSE SECURITY COMPLETENESS FAILED: ${failure}`);
    process.exit(2);
  }
  const notExecuted = unexcusedNotExecuted(result.elements).map((e) => e.element);
  const excepted = result.elements.filter((e) => e.exception).map((e) => e.element);
  if (notExecuted.length === 0 && excepted.length > 0) {
    // Never GREEN: the scanners named here did not run and are admitted only by a recorded, unexpired, human-confirmed exception.
    console.log(`CLOSE SECURITY COMPLETENESS ADMITTED BY NAMED EXCEPTION: HEAD ${result.commit} is bound; not executed but excepted: ${excepted.join(", ")} (see the lines above for reason, expiry and confirmer).`);
    process.exit(0);
  }
  console.log(notExecuted.length === 0
    ? `CLOSE SECURITY COMPLETENESS GREEN: HEAD ${result.commit} is bound and complete.`
    : `CLOSE SECURITY COMPLETENESS ADMITTED, NOT COMPLETE: HEAD ${result.commit} is bound; not executed: ${notExecuted.join(", ")} (this calibration is not critical, so it does not block). Run: ${SECURITY_RUN_COMMAND}`);
  process.exit(0);
}

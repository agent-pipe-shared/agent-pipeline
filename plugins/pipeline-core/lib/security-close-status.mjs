// SPDX-License-Identifier: SUL-1.0
// The security close chain's status vocabulary and its calibration rule (Candidate 20, G20-25, AC-108).
//
// Every security element reads with exactly one of four states, in every human-facing line:
//   passed          the scanner ran and found nothing;
//   failed          the scanner ran and reported findings;
//   not executed    the project configures the scanner, but it did not run (absent, rejected as untrusted, or errored);
//   not applicable  the calibration or the project gives it nothing to scan (not configured, or no package sources).
// A skipped or errored scanner is never "passed" and never an unqualified "ok" line.
//
// The calibration rule is one field: `stakes` of the project calibration (project/pipeline.json, else .claude/pipeline.json).
// A critical calibration (critical/high, or the German kritisch/hoch) turns a scanner that did not execute into a typed refusal;
// any other value, or an absent field, keeps today's behaviour (admitted, status "not executed"). Pure and offline: no scanner is spawned.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SECURITY_STATES = Object.freeze(["passed", "failed", "not executed", "not applicable"]);
export const SECURITY_ELEMENTS = Object.freeze(["gitleaks", "osv-scanner", "semgrep", "license-check"]);
export const SECURITY_RUN_COMMAND = "node <plugin-root>/scripts/security-scan.mjs";
export const SECURITY_PREFLIGHT_COMMAND = "node <plugin-root>/scripts/toolchain-preflight.mjs";
export const SCANNER_NOT_EXECUTED_CODE = "SEC-CLOSE-SCANNER-NOT-EXECUTED";

/**
 * Normalizes one scanner entry's {status, classification} into a reader-facing label: "passed", "findings", "not-configured",
 * "tool-unavailable", "not-applicable", or "error" (null for an unrecognised status). Purely additive next to `status`/`classification`.
 * Before this label, "classification: success" meant three different things (a real clean scan, a project with no policy configured, and
 * a project with nothing of that kind to scan); that is the ambiguity "an empty rule set must never read like a successful deep scan"
 * names. Moved here from security-scan.mjs so the scan and the close chain share one mapping.
 */
export function deriveReportStatus({ tool, status, classification }) {
  if (status === "PASS") return "passed";
  if (status === "FINDINGS") return "findings";
  if (status === "ERROR") return "error";
  if (status !== "SKIPPED") return null;
  // license-check has no binary at all (isInstalled() always reports installed); every one of its SKIPPED results means "this project
  // configured no policy/declaration" -- there is no other SKIPPED shape it can produce.
  if (tool === "license-check") return "not-configured";
  // osv-scanner's ONE non-binary_missing SKIPPED shape is its own "no package sources in project" honest signal (classification
  // "success") -- a project state, not a broken tool.
  if (tool === "osv-scanner" && classification === "success") return "not-applicable";
  // Every other SKIPPED shape for a binary-backed scanner means the tool itself could not be used: absent from PATH/trusted locations
  // ("binary_missing") or rejected as untrusted. No working scan happened, and it is not the project's own "nothing to scan" signal.
  return "tool-unavailable";
}

/** The four-state reading of one scanner entry {tool, status, classification, reason?}. */
export function securityScannerState(entry) {
  const label = entry?.reportStatus ?? deriveReportStatus(entry ?? {});
  if (label === "passed") return "passed";
  if (label === "findings") return "failed";
  if (label === "not-configured" || label === "not-applicable") return "not applicable";
  return "not executed"; // tool-unavailable, error, or an unrecognised status: the scanner did not complete a scan
}

/** True for a critical calibration: the first word of `stakes` is critical/high/kritisch/hoch. Absent or unknown is not critical. */
export function isCriticalStakes(stakes) {
  if (typeof stakes !== "string") return false;
  const word = stakes.trim().toLowerCase().split(/[^a-zäöüß]+/u)[0];
  return word === "critical" || word === "high" || word === "kritisch" || word === "hoch";
}

/** The raw `stakes` of the project calibration under `projectDir`, or null when it is absent, unreadable or not a string. */
export function readCalibrationStakes(projectDir) {
  for (const rel of ["project/pipeline.json", ".claude/pipeline.json"]) {
    const path = join(projectDir, rel);
    if (!existsSync(path)) continue;
    try {
      const stakes = JSON.parse(readFileSync(path, "utf8"))?.stakes;
      return typeof stakes === "string" ? stakes : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * One {element, state, reason} per security element. `scanners` is the scan evidence's scanner list (or null when there is none);
 * `enabled` maps an element to false when the calibration does not configure it. An element without an entry is "not applicable"
 * when not configured and "not executed" when configured -- no evidence never reads like a passed scan.
 */
export function securityCloseElements({ scanners = null, enabled = {} } = {}) {
  const list = Array.isArray(scanners) ? scanners : [];
  return SECURITY_ELEMENTS.map((element) => {
    const entry = list.find((s) => s?.tool === element);
    if (entry) return { element, state: securityScannerState(entry), reason: entry.reason ?? null };
    if (enabled?.[element] === false) return { element, state: "not applicable", reason: "not configured for this project" };
    return { element, state: "not executed", reason: "no scan evidence for this scanner" };
  });
}

/** The elements of a scan that completed: it lists every scanner the project enables, so an element missing from it is not configured. */
export function elementsOfCompletedScan(scanners) {
  const list = Array.isArray(scanners) ? scanners : [];
  const enabled = Object.fromEntries(SECURITY_ELEMENTS.filter((e) => !list.some((s) => s?.tool === e)).map((e) => [e, false]));
  return securityCloseElements({ scanners: list, enabled });
}

export function formatSecurityCloseStatus(elements) {
  return elements.map(({ element, state, reason }) => `${element}: ${state}${reason ? ` -- ${reason}` : ""}`);
}

/** The typed refusal of a critical calibration for a scanner that did not execute: names the scanner and the commands that repair it. */
export function scannerNotExecutedRefusal(element, where = "the security evidence") {
  return `${SCANNER_NOT_EXECUTED_CODE}: ${element} did not execute (${where}) and this project is calibrated critical (stakes in the project calibration). `
    + `Install ${element} (platform guidance: ${SECURITY_PREFLIGHT_COMMAND}), then run: ${SECURITY_RUN_COMMAND}`;
}

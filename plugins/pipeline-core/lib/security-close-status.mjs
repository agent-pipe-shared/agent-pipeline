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
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * The four-state reading of one scanner entry {tool, status, classification, reason?}. `critical` (Candidate 21h, CGF-05): in a critical
 * calibration a skipped license-check ("not-configured") did not run, so it reads "not executed" like every other scanner that did not run;
 * every other calibration keeps "not applicable". osv-scanner's "no package sources" result stays "not applicable" in both.
 */
export function securityScannerState(entry, { critical = false } = {}) {
  const label = entry?.reportStatus ?? deriveReportStatus(entry ?? {});
  if (label === "passed") return "passed";
  if (label === "findings") return "failed";
  if (label === "not-configured") return critical ? "not executed" : "not applicable";
  if (label === "not-applicable") return "not applicable";
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

// The named exception for a scanner that did not run (Candidate 21h, CGF-05; PO decision 2026-11-09): one committed file, entries with the
// scanner, a reason, an expiry and the label the human gave in chat. Same strength as the per-finding ignore (reason + expiry, listed in the
// close evidence, confirmed in chat, no signature). It only ever answers "did not run": a scanner that reported findings reads "failed".
export const SCANNER_EXCEPTIONS_PATH = "project/security-scanner-exceptions.json";
export const SCANNER_EXCEPTIONS_SCHEMA = "pipeline.security-scanner-exceptions.v1";
export const SCANNER_EXCEPTION_REASON_MAX = 500;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u;
const nonBlank = (value) => typeof value === "string" && value.trim() !== "";

/**
 * Parses the exception file text (null = no file). Returns {valid, rejected}: `valid` are the entries that may admit a scanner,
 * `rejected` are {ref, why} for every file-level or entry-level problem (expired, malformed, unknown scanner), which the refusal names.
 */
export function parseScannerExceptions(text, now = new Date()) {
  if (text === null) return { valid: [], rejected: [] };
  const rejectFile = (why) => ({ valid: [], rejected: [{ ref: SCANNER_EXCEPTIONS_PATH, why }] });
  let doc;
  try { doc = JSON.parse(text); } catch { return rejectFile("not valid JSON"); }
  if (doc?.schema !== SCANNER_EXCEPTIONS_SCHEMA) return rejectFile(`schema must be ${SCANNER_EXCEPTIONS_SCHEMA}`);
  if (!Array.isArray(doc.exceptions)) return rejectFile("exceptions must be an array");
  const valid = [];
  const rejected = [];
  doc.exceptions.forEach((entry, index) => {
    const ref = `entry ${index}${typeof entry?.scanner === "string" ? ` (${entry.scanner})` : ""}`;
    const problem = (() => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return "not an object";
      if (!SECURITY_ELEMENTS.includes(entry.scanner)) return `unknown scanner (one of ${SECURITY_ELEMENTS.join(", ")})`;
      if (!nonBlank(entry.reason)) return "reason is missing or blank";
      if (entry.reason.length > SCANNER_EXCEPTION_REASON_MAX) return `reason is longer than ${SCANNER_EXCEPTION_REASON_MAX} characters`;
      if (!nonBlank(entry.confirmedBy)) return "confirmedBy is missing or blank";
      if (typeof entry.expires !== "string" || !ISO_8601.test(entry.expires) || Number.isNaN(Date.parse(entry.expires))) return "expires is not an ISO-8601 date";
      if (Date.parse(entry.expires) <= now.getTime()) return `expired (${entry.expires})`;
      return null;
    })();
    if (problem) rejected.push({ ref, why: problem });
    else valid.push({ scanner: entry.scanner, reason: entry.reason, expires: entry.expires, confirmedBy: entry.confirmedBy });
  });
  return { valid, rejected };
}

// "Recorded beforehand" (PO decision 2026-11-09): the file counts only as it stands in HEAD, the commit the security evidence is bound to, so an
// exception written at the close does not admit that close. Line endings are not a change: a Windows checkout may hold CRLF over an LF blob.
function exceptionFileNotCommitted(projectDir, text) {
  const shown = spawnSync("git", ["-C", projectDir, "show", `HEAD:./${SCANNER_EXCEPTIONS_PATH}`], { encoding: "utf8", timeout: 5000, maxBuffer: 1 << 20, windowsHide: true });
  if (shown.error) return "could not be compared with HEAD (git did not run)";
  if (shown.status !== 0) return "not committed at HEAD (commit it before the candidate is frozen)";
  const lf = (value) => value.replace(/\r\n/gu, "\n");
  return lf(shown.stdout) === lf(text) ? null : "changed since the last commit (commit it before the candidate is frozen)";
}

/** The exceptions of the project under `projectDir` (absent = none). An existing file that HEAD does not hold byte for byte admits nothing. Spawns no scanner. */
export function readScannerExceptions(projectDir, now = new Date()) {
  const path = join(projectDir, SCANNER_EXCEPTIONS_PATH);
  if (!existsSync(path)) return { valid: [], rejected: [] };
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return { valid: [], rejected: [{ ref: SCANNER_EXCEPTIONS_PATH, why: "could not be read" }] }; }
  const notCommitted = exceptionFileNotCommitted(projectDir, text);
  if (notCommitted) return { valid: [], rejected: [{ ref: SCANNER_EXCEPTIONS_PATH, why: notCommitted }] };
  return parseScannerExceptions(text, now);
}

/**
 * One {element, state, reason} per security element. `scanners` is the scan evidence's scanner list (or null when there is none);
 * `enabled` maps an element to false when the calibration does not configure it. An element without an entry is "not applicable"
 * when not configured and "not executed" when configured -- no evidence never reads like a passed scan.
 * `critical` applies the critical reading (securityScannerState); `exceptions` ({valid, rejected} of readScannerExceptions) is honoured only
 * then: an element that did not execute and has a valid exception keeps the state "not executed" and carries the entry as `exception`, so it
 * is printed with its reason, expiry and confirmer and can never read like "passed".
 */
export function securityCloseElements({ scanners = null, enabled = {}, critical = false, exceptions = null } = {}) {
  const list = Array.isArray(scanners) ? scanners : [];
  const excepted = (base) => {
    const entry = critical && base.state === "not executed" ? exceptions?.valid?.find((e) => e.scanner === base.element) : null;
    return entry ? { ...base, exception: entry } : base;
  };
  return SECURITY_ELEMENTS.map((element) => {
    const entry = list.find((s) => s?.tool === element);
    if (entry) return excepted({ element, state: securityScannerState(entry, { critical }), reason: entry.reason ?? null });
    if (enabled?.[element] === false) return { element, state: "not applicable", reason: "not configured for this project" };
    return excepted({ element, state: "not executed", reason: "no scan evidence for this scanner" });
  });
}

/** The elements of a scan that completed: it lists every scanner the project enables, so an element missing from it is not configured. */
export function elementsOfCompletedScan(scanners, options = {}) {
  const list = Array.isArray(scanners) ? scanners : [];
  const enabled = Object.fromEntries(SECURITY_ELEMENTS.filter((e) => !list.some((s) => s?.tool === e)).map((e) => [e, false]));
  return securityCloseElements({ ...options, scanners: list, enabled });
}

/** The elements that did not execute and no named exception covers: these are what a critical calibration refuses. */
export const unexcusedNotExecuted = (elements) => elements.filter((e) => e.state === "not executed" && !e.exception);

// One line per exception: never contains a newline, and the " -- " that separates the reason from the label stays unique.
const oneLine = (value) => String(value).replace(/\s+/gu, " ").replace(/ -- /gu, " - ").trim();
export function formatSecurityCloseStatus(elements) {
  return elements.map(({ element, state, reason, exception }) => {
    const applied = exception ? ` [named exception: ${oneLine(exception.reason)}; expires ${exception.expires}; confirmed by ${oneLine(exception.confirmedBy)}]` : "";
    return `${element}: ${state}${applied}${reason ? ` -- ${reason}` : ""}`;
  });
}

/**
 * The typed refusal of a critical calibration whose manifest configures no security gate (no manifest, no gates.security, or mode off),
 * or null for any other calibration (those keep reading "not applicable"). It names the exact repair argv: the physical plugin script
 * with this root, which the guard admits without a ceremony and which sets gates.security to the block onboarding writes.
 */
export const GATE_NOT_CONFIGURED_CODE = "SEC-CLOSE-GATE-NOT-CONFIGURED";
const word = (value) => (/^[\w@%+=:,./\\-]+$/u.test(value) ? value : JSON.stringify(value));
export function securityGateNotConfiguredRefusal(root, where = "this check") {
  if (!isCriticalStakes(readCalibrationStakes(root))) return null;
  const script = fileURLToPath(new URL("../scripts/security-gate-configure.mjs", import.meta.url));
  return `${GATE_NOT_CONFIGURED_CODE}: the security gate is not configured (${where}: no manifest, no gates.security, or mode off) and this project is `
    + `calibrated critical (stakes in the project calibration). Run this command to configure it, then run this check again: node ${word(script)} --root ${word(root)}`;
}

/** The typed refusal of a critical calibration for a scanner that did not execute: names the scanner and the commands that repair it. */
export function scannerNotExecutedRefusal(element, where = "the security evidence", { rejected = [] } = {}) {
  const ignored = rejected.length > 0 ? ` Exception entries ignored: ${rejected.map((r) => `${r.ref}: ${r.why}`).join("; ")}.` : "";
  return `${SCANNER_NOT_EXECUTED_CODE}: ${element} did not execute (${where}) and this project is calibrated critical (stakes in the project calibration). `
    + `Install or configure ${element} (platform guidance: ${SECURITY_PREFLIGHT_COMMAND}), then run: ${SECURITY_RUN_COMMAND}. `
    + `Or record a named exception for ${element} in ${SCANNER_EXCEPTIONS_PATH} (schema ${SCANNER_EXCEPTIONS_SCHEMA}): `
    + `{"schema":"${SCANNER_EXCEPTIONS_SCHEMA}","exceptions":[{"scanner":"${element}","reason":"<non-blank, at most ${SCANNER_EXCEPTION_REASON_MAX} characters>",`
    + `"expires":"<ISO-8601 date in the future>","confirmedBy":"<the label the human gave for this exception in chat>"}]} `
    + `and commit it before the candidate is frozen; an exception never covers a scanner that reported findings.${ignored}`;
}

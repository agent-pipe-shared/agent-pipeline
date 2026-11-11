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
  // "not-run" (C28, markNotRunScans): a scan that ran on a dirty worktree or loaded zero rules is not a result; it reads like a scanner that did not run.
  return "not executed"; // not-run, tool-unavailable, error, or an unrecognised status: the scanner did not complete a scan
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
 * Candidate 22 (CGR-10): what a scanner entry's `ruleSet` (written by security-scan.mjs for a scanner that was invoked) says really ran, on one line:
 * the config or rule file with where it came from, a digest prefix, the rule ids when they are known, and a short description. Null without a rule set.
 * Never contains " -- " (the separator of the status lines).
 */
export function ruleSetSummary(ruleSet) {
  if (ruleSet === null || typeof ruleSet !== "object") return null;
  const ids = Array.isArray(ruleSet.ruleIds) && ruleSet.ruleIds.length > 0
    ? `: ${ruleSet.ruleIds.join(", ")}${Number.isInteger(ruleSet.ruleCount) && ruleSet.ruleCount > ruleSet.ruleIds.length ? ` (+${ruleSet.ruleCount - ruleSet.ruleIds.length} more)` : ""}`
    : "";
  const digest = typeof ruleSet.sha256 === "string" && ruleSet.sha256 !== "" ? `, sha256 ${ruleSet.sha256.slice(0, 12)}` : "";
  const note = typeof ruleSet.description === "string" && ruleSet.description !== "" ? ` - ${ruleSet.description}` : "";
  return `${ruleSet.ref ?? "no config resolved"} (${ruleSet.source ?? "unknown"}${digest})${ids}${note}`.replace(/ -- /gu, " - ");
}

/** One line per scanner entry for the scan output: the rule set of a scanner that ran, else the plain statement that no rules ran. */
export function formatRuleSetLine(entry) {
  const ran = (entry?.status === "PASS" || entry?.status === "FINDINGS") && entry?.reportStatus !== "not-run"; // C28: a not-run scan is not a result
  const summary = ran ? ruleSetSummary(entry.ruleSet) : null;
  return `${entry?.tool ?? "unknown"}: ${ran ? (summary ?? "ran, rule set not recorded") : "no rules ran (scanner did not execute)"}`;
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
    if (entry) {
      const state = securityScannerState(entry, { critical });
      const rules = state === "passed" || state === "failed" ? ruleSetSummary(entry.ruleSet) : null;
      // C28: additive facts for the warnings -- why a scan is not a result (`notRun`), a partial scan (`coverage`), a skipped not-configured check (`skipped`).
      const label = entry.reportStatus ?? deriveReportStatus(entry);
      return excepted({
        element, state, reason: entry.reason ?? null, ...(rules === null ? {} : { rules }),
        ...(typeof entry.notRun === "string" ? { notRun: entry.notRun } : {}),
        ...(entry.coverage?.status === "degraded" ? { coverage: { reason: String(entry.coverage.reason), files: Array.isArray(entry.coverage.files) ? entry.coverage.files.length : 0 } } : {}),
        ...(label === "not-configured" && state === "not applicable" ? { skipped: true } : {}),
      });
    }
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

/**
 * C28 (AC-108, honest states): a scan that PASSED but ran on a dirty or unbound worktree (`candidateUncertain`), or that loaded zero rules, is never counted
 * as a result. Marks such an entry `reportStatus: "not-run"` with `notRun` (dirty-worktree | zero-rules) and the reason, so every reader (state lines, scan
 * verdict, warnings, the declared requirement) sees a scanner that did not run. `status` and the scan's exit decision are untouched, so no gate becomes
 * newly blocking by this; a scan that reported findings is never hidden, and SKIPPED/ERROR entries already read as not executed. Mutates and returns `scanners`.
 */
export function markNotRunScans(scanners, { candidateUncertain = false } = {}) {
  for (const entry of Array.isArray(scanners) ? scanners : []) {
    if (entry?.status !== "PASS") continue;
    const dirty = candidateUncertain === true;
    const zeroRules = entry.tool === "semgrep" && Number.isInteger(entry.ruleSet?.ruleCount) && entry.ruleSet.ruleCount === 0;
    if (!dirty && !zeroRules) continue;
    entry.reportStatus = "not-run";
    entry.notRun = dirty ? "dirty-worktree" : "zero-rules";
    entry.reason = dirty
      ? "the scan ran on a dirty or unbound worktree and is not counted as a result"
      : "semgrep loaded zero rules from the configured rule set; a scan without rules is not a result";
  }
  return scanners;
}

// C28: a project may declare mandatory security capabilities in its manifest (security.required_capabilities); each maps to the scanner that provides it.
export const REQUIRED_CAPABILITY_CODE = "SEC-CLOSE-REQUIRED-CAPABILITY-NOT-RUN";
export const SECURITY_CAPABILITY_ELEMENT = Object.freeze({ secrets: "gitleaks", sast: "semgrep", sca: "osv-scanner", license: "license-check" });

/** The known capabilities the manifest declares mandatory (de-duplicated, in declared order); anything else is ignored here (the manifest validator rejects it). */
export function declaredSecurityCapabilities(manifest) {
  const list = manifest?.security?.required_capabilities;
  return Array.isArray(list) ? [...new Set(list.filter((c) => typeof c === "string" && Object.hasOwn(SECURITY_CAPABILITY_ELEMENT, c)))] : [];
}

/**
 * One typed refusal per declared capability whose scanner has no installed binary, loaded zero rules, errored, did not run or left no evidence (the critical
 * reading: a skipped license-check did not run). Without a declaration nothing here applies, so the same state stays a warning. `gateActive: false` (the manifest
 * configures no security gate, or mode off) means no scan runs at all, so every declared capability is refused. A valid named exception (`exceptions`, critical
 * calibrations only) answers it as everywhere else. "No package sources" is nothing to scan, not a missing capability.
 */
export function requiredCapabilityRefusals({ scanners = null, declared = [], exceptions = null, gateActive = true } = {}) {
  if (declared.length === 0) return [];
  const elements = gateActive ? securityCloseElements({ scanners, enabled: {}, critical: true, exceptions }) : [];
  return declared.flatMap((capability) => {
    const element = SECURITY_CAPABILITY_ELEMENT[capability];
    const found = elements.find((e) => e.element === element);
    if (gateActive && !(found?.state === "not executed" && !found.exception)) return [];
    const why = gateActive ? (found?.reason ?? "it did not run") : "the security gate is not configured (no gates.security, or mode off), so no scan runs";
    const step = gateActive
      ? `Install or configure ${element} (platform guidance: ${SECURITY_PREFLIGHT_COMMAND}), then run: ${SECURITY_RUN_COMMAND}`
      : `Set gates.security (mode blocking or warn, type automated) in the project manifest, then run: ${SECURITY_RUN_COMMAND}`;
    return [`${REQUIRED_CAPABILITY_CODE}: the project declared the ${capability} capability mandatory (security.required_capabilities in its manifest) and ${element} did not run (${oneLine(why)}). ${step}.`];
  });
}

const RUN_STEP = `then run: ${SECURITY_RUN_COMMAND}`;
function warningNextStep(entry) {
  if (entry.notRun === "dirty-worktree") return `commit or stash the working-tree changes (a scan needs a clean candidate), ${RUN_STEP}`;
  if (entry.notRun === "zero-rules") return `point security.scanners.semgrep.rules_dir at a directory that holds rule files, or remove it to use the plugin's default rule pack, ${RUN_STEP}`;
  if (entry.element === "license-check") return `provide the licence declaration third-party-licenses.json (or a policy under governance/policies/), ${RUN_STEP}`;
  return `install or configure ${entry.element} (platform guidance: ${SECURITY_PREFLIGHT_COMMAND}), ${RUN_STEP}`;
}

/**
 * C28: one `WARNING: ...` line per element that did not run, was skipped as not configured, or covered only part of the tree, each with the next step that would
 * run it. Passed, failed, "no package sources" and excepted elements raise none. Never blocking: only a declared capability refuses (requiredCapabilityRefusals).
 */
export function securityCloseWarnings(elements) {
  const lines = [];
  for (const entry of Array.isArray(elements) ? elements : []) {
    if (entry.exception) continue;
    const reason = entry.reason ? ` (${oneLine(entry.reason)})` : "";
    if (entry.state === "not executed") lines.push(`WARNING: ${entry.element} did not run${reason}. Next step: ${warningNextStep(entry)}.`);
    else if (entry.skipped) lines.push(`WARNING: ${entry.element} was skipped${reason}. Next step: ${warningNextStep(entry)}.`);
    else if (entry.coverage) lines.push(`WARNING: ${entry.element} covered only part of the tree (${oneLine(entry.coverage.reason)}, ${entry.coverage.files} file(s) only partly read). Next step: fix the syntax the scanner could not parse, ${RUN_STEP}.`);
  }
  return lines;
}

// One line per exception: never contains a newline, and the " -- " that separates the reason from the label stays unique.
const oneLine = (value) => String(value).replace(/\s+/gu, " ").replace(/ -- /gu, " - ").trim();
export function formatSecurityCloseStatus(elements) {
  return elements.map(({ element, state, reason, exception, rules }) => {
    const applied = exception ? ` [named exception: ${oneLine(exception.reason)}; expires ${exception.expires}; confirmed by ${oneLine(exception.confirmedBy)}]` : "";
    // Candidate 22 (CGR-10): a scanner that ran shows which rules or rule set really ran.
    const ran = rules ? ` [rules: ${oneLine(rules)}]` : "";
    return `${element}: ${state}${applied}${ran}${reason ? ` -- ${reason}` : ""}`;
  });
}

export const CLOSE_SECURITY_SCOPE_SCHEMA = "pipeline.close-security-scope.v1";
const CHECK_RAN = new Set(["pass", "findings"]);

/**
 * R8 (2026-11 greenfield report): the close said "green" with nothing about what that covers. Reads the v2 verdict the scan wrote: which authority decides the close's exit, whether the v2 verdict is only
 * reporting, how large the capability plan is and which checks really ran. A scanner is reported by its capability (`capabilityOutcomes`); `controls` holds only the checks without one, such as license-check.
 * Pure; a verdict it cannot read is typed unavailable, so this can never block the close.
 */
export function closeSecurityScope(doc) {
  if (doc?.schema !== "pipeline.security-verdict.v2" || !Array.isArray(doc.controls) || doc.capabilityOutcomes === null || typeof doc.capabilityOutcomes !== "object" || !Array.isArray(doc.plan?.required) || !Array.isArray(doc.plan?.optional)) {
    return { schema: CLOSE_SECURITY_SCOPE_SCHEMA, status: "unavailable", reason: "the v2 security verdict could not be read" };
  }
  const checks = [
    ...Object.entries(doc.capabilityOutcomes).map(([check, outcome]) => ({ check, outcome: String(outcome), required: doc.plan.required.includes(check) })),
    ...doc.controls.map((control) => ({ check: String(control.tool ?? control.control), outcome: String(control.runOutcome), required: control.required === true })),
  ];
  return {
    schema: CLOSE_SECURITY_SCOPE_SCHEMA, status: "read",
    exitAuthority: String(doc.exitAuthority),
    v2VerdictReportingOnly: doc.exitAuthority === "v1-blocking-logic",
    v2VerdictBlocking: doc.verdict?.blocking === true,
    capabilityPlan: { required: doc.plan.required.length, optional: doc.plan.optional.length, empty: doc.plan.required.length + doc.plan.optional.length === 0 },
    checksRan: checks.filter(({ outcome }) => CHECK_RAN.has(outcome)).map(({ check }) => check),
    checksNotRun: checks.filter(({ outcome }) => !CHECK_RAN.has(outcome)),
  };
}

/** One sentence for a close report; "" when the scope is unavailable (the structured field then says why). */
export function describeCloseSecurityScope(scope) {
  if (scope?.status !== "read") return "";
  const plan = scope.capabilityPlan.empty ? "empty" : `${scope.capabilityPlan.required} required, ${scope.capabilityPlan.optional} optional`;
  const notRun = scope.checksNotRun.length === 0 ? "none" : scope.checksNotRun.map(({ check, outcome }) => `${check} (${outcome})`).join(", ");
  return `Security scope: the exit is decided by ${scope.exitAuthority}${scope.v2VerdictReportingOnly ? ", the v2 policy verdict is reporting only" : ""}${scope.v2VerdictBlocking ? " and names a blocking capability" : ""}; capability plan: ${plan}; checks that ran: ${scope.checksRan.length === 0 ? "none" : scope.checksRan.join(", ")}; did not run: ${notRun}.`;
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

// The toolchain states a person can repair by providing the tool or its input. The host-boundary states (execution_environment, probe_timeout,
// probe_error) say the check itself could not look, as a sandboxed session does on WSL; they must never stop a project, or the check deadlocks it.
const SCANNER_PROVISION_STATES = new Set(["binary_missing", "incompatible_version", "incompatible_capability", "input_missing", "untrusted_path"]);

/**
 * PO 2026-11-09: a scanner the close will need is reported before the signature and before implementation, so it is installed then and not found
 * missing at the close. `report` is a toolchain preflight result. A critical calibration gets one refusal per scanner, the same one the close
 * would give; any other calibration gets notices only. A valid named exception answers it here as it does at the close.
 * @returns {{refusals: {code: string, text: string}[], notices: string[]}}
 */
export function scannerEntryReadiness(report, { critical = false, exceptions = null } = {}) {
  const refusals = [];
  const notices = [];
  for (const entry of Array.isArray(report?.results) ? report.results : []) {
    if (!SECURITY_ELEMENTS.includes(entry?.tool) || !SCANNER_PROVISION_STATES.has(entry.status)) continue;
    if (critical && exceptions?.valid?.some((e) => e.scanner === entry.tool)) continue;
    const guidance = typeof entry.guidance === "string" && entry.guidance !== "" ? ` ${entry.guidance}` : "";
    if (critical) refusals.push({ code: SCANNER_NOT_EXECUTED_CODE, text: `${scannerNotExecutedRefusal(entry.tool, `toolchain check: ${entry.status}`, { rejected: exceptions?.rejected ?? [] })}${guidance}` });
    else notices.push(`Notice: ${entry.tool} is not ready (${entry.status}); install it now if this project's security gate needs it at the close.${guidance}`);
  }
  return { refusals, notices };
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

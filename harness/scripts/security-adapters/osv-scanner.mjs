#!/usr/bin/env node
/**
 * osv-scanner.mjs -- security-scan adapter for osv-scanner (dependency vulnerability
 * scanning).
 *
 * NEW FILE. Same dependency-free adapter interface as ./gitleaks.mjs (read that file's
 * header first for the shared resolveBinary()/config.binaryPath/env-param rationale --
 * identical pattern here, not re-explained).
 *
 * INVOCATION: `osv-scanner --version` then `osv-scanner scan source --format json -r <root>`.
 * Only OSV-Scanner major version 2 is compatible with the v2 scan syntax.
 * osv-scanner prints its JSON report to STDOUT (unlike gitleaks, no report-path file).
 * Exit-code contract (load-bearing): 0 (clean) and 1 (findings present)
 * are BOTH valid completed runs -- osv-scanner uses exit 1 as its normal "vulnerabilities
 * found" signal, this must never be conflated with ERROR. Any other exit code is treated as
 * a genuine crash -> ERROR, regardless of whether stdout happens to parse as JSON --
 * EXCEPT ONE honest special case: exit 128 with stdout/stderr containing "No package
 * sources found" means the project
 * has no package manifests/lockfiles at all -- nothing to scan, not a crash -- and is
 * reported as SKIPPED (with an honest reason) instead of ERROR. Any OTHER exit 128 (or any
 * other unexpected exit code) stays ERROR unchanged (fail-closed).
 *
 * OUTPUT CONTRACT (fail-closed): after the major-v2 probe, this adapter accepts only a
 * JSON object shaped as `{ results: [ { source: { path }, packages: [ { package: { name,
 * version }, vulnerabilities: [...], groups: [...] } ] } ] }`. Every named container and
 * every vulnerability ID is validated before extraction; additional fields remain allowed
 * because they are not part of the adapter boundary. Empty `results` and empty package,
 * vulnerability, or group arrays are valid. Any missing or wrongly typed required member is
 * an ERROR, never a clean result or a partial finding set.
 *
 * SEVERITY MAPPING (per vulnerability, `mapOsvSeverity()`):
 *   1. `vuln.database_specific.severity` (string, e.g. "CRITICAL"/"HIGH"/"MEDIUM"/"LOW",
 *      some ecosystems use "MODERATE") if present and recognized -- lower-cased, "moderate"
 *      normalized to "medium".
 *   2. else the first `vuln.severity[].score` that parses as a plain number (some entries
 *      carry a numeric CVSS base score rather than a vector string) -- >=9 critical, >=7
 *      high, >=4 medium, else low.
 *   3. else "high" (intentional fallback -- a CVSS vector string without a directly
 *      parseable numeric score is not decoded here, it falls through to this default).
 */
import { existsSync } from "node:fs";
import { delimiter as PATH_DELIM, join as pathJoin } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";

export const name = "osv-scanner";

const ENV_VAR = "PIPELINE_OSV_SCANNER_PATH";
const BIN_NAME = "osv-scanner";
const WIN_EXTS = [".exe", ".cmd", ".bat"];
const SEVERITY_ENUM = new Set(["critical", "high", "medium", "low", "info"]);

function resolveBinary(env) {
  const override = env?.[ENV_VAR];
  if (override) {
    return existsSync(override)
      ? { installed: true, path: override }
      : { installed: false, reason: `${ENV_VAR} set but path not found: ${override}` };
  }
  const pathVar = env?.PATH || env?.Path || "";
  const dirs = String(pathVar).split(PATH_DELIM).filter(Boolean);
  const candidates = process.platform === "win32" ? [BIN_NAME, ...WIN_EXTS.map((e) => BIN_NAME + e)] : [BIN_NAME];
  for (const dir of dirs) {
    for (const candidate of candidates) {
      const full = pathJoin(dir, candidate);
      if (existsSync(full)) return { installed: true, path: full };
    }
  }
  return { installed: false, reason: `${BIN_NAME} not found on PATH (set ${ENV_VAR} to override)` };
}

export function isInstalled(env = process.env) {
  return resolveBinary(env);
}

function spawnFailure(error) {
  if (error?.code === "EPERM" || error?.code === "EACCES") {
    return {
      status: "ERROR",
      classification: "execution_environment",
      findings: [],
      raw: null,
      reason: `osv-scanner could not start (${error.code}): execution environment blocks Node child processes; this is not a missing scanner or finding`,
    };
  }
  return {
    status: "ERROR",
    classification: "scanner_error",
    findings: [],
    raw: null,
    reason: `spawn error: ${error?.message ?? "unknown error"}`,
  };
}

function versionMajor(stdout) {
  const match = String(stdout ?? "").match(/(?:^|[^0-9])v?(\d+)\.(\d+)\.(\d+)(?:$|[^0-9])/);
  return match ? Number(match[1]) : null;
}

function checkV2({ binaryPath, rootDir, spawnFn, timeoutMs }) {
  let result;
  try {
    result = spawnFn(binaryPath, ["--version"], { cwd: rootDir, encoding: "utf8", timeout: timeoutMs, shell: false });
  } catch (error) {
    return spawnFailure(error);
  }
  if (result.error?.code === "ETIMEDOUT") {
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: null,
      reason: `osv-scanner version probe timed out after ${timeoutMs}ms`,
    };
  }
  if (result.error) return spawnFailure(result.error);
  if (result.status !== 0) {
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: result.stdout ?? null,
      reason: `osv-scanner version probe exited ${result.status ?? "unknown"}: ${(result.stderr || "").trim().slice(0, 500)}`,
    };
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const major = versionMajor(output);
  if (major !== 2) {
    return {
      status: "ERROR",
      classification: "incompatible_major",
      findings: [],
      raw: output,
      reason: `osv-scanner major version ${major ?? "unknown"} is incompatible; install OSV-Scanner v2`,
    };
  }
  return null;
}

function mapOsvSeverity(vuln) {
  const dbSev = vuln?.database_specific?.severity;
  if (typeof dbSev === "string") {
    const norm = dbSev.toLowerCase() === "moderate" ? "medium" : dbSev.toLowerCase();
    if (SEVERITY_ENUM.has(norm)) return norm;
  }
  const sevArr = Array.isArray(vuln?.severity) ? vuln.severity : [];
  for (const s of sevArr) {
    const score = Number(s?.score);
    if (Number.isFinite(score)) {
      if (score >= 9) return "critical";
      if (score >= 7) return "high";
      if (score >= 4) return "medium";
      return "low";
    }
  }
  return "high"; // intentional fallback
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateV2Output(parsed) {
  if (!isRecord(parsed)) return "top-level JSON value must be an object";
  if (!Array.isArray(parsed.results)) return "results must be an array";

  for (let resultIndex = 0; resultIndex < parsed.results.length; resultIndex++) {
    const result = parsed.results[resultIndex];
    const resultPath = `results[${resultIndex}]`;
    if (!isRecord(result)) return `${resultPath} must be an object`;
    if (!isRecord(result.source)) return `${resultPath}.source must be an object`;
    if (!isNonEmptyString(result.source.path)) return `${resultPath}.source.path must be a non-empty string`;
    if (!Array.isArray(result.packages)) return `${resultPath}.packages must be an array`;

    for (let packageIndex = 0; packageIndex < result.packages.length; packageIndex++) {
      const packageEntry = result.packages[packageIndex];
      const packagePath = `${resultPath}.packages[${packageIndex}]`;
      if (!isRecord(packageEntry)) return `${packagePath} must be an object`;
      if (!isRecord(packageEntry.package)) return `${packagePath}.package must be an object`;
      if (!isNonEmptyString(packageEntry.package.name)) return `${packagePath}.package.name must be a non-empty string`;
      if (!isNonEmptyString(packageEntry.package.version)) return `${packagePath}.package.version must be a non-empty string`;
      if (!Array.isArray(packageEntry.vulnerabilities)) return `${packagePath}.vulnerabilities must be an array`;
      if (!Array.isArray(packageEntry.groups)) return `${packagePath}.groups must be an array`;

      for (let groupIndex = 0; groupIndex < packageEntry.groups.length; groupIndex++) {
        if (!isRecord(packageEntry.groups[groupIndex])) return `${packagePath}.groups[${groupIndex}] must be an object`;
      }
      for (let vulnerabilityIndex = 0; vulnerabilityIndex < packageEntry.vulnerabilities.length; vulnerabilityIndex++) {
        const vulnerability = packageEntry.vulnerabilities[vulnerabilityIndex];
        const vulnerabilityPath = `${packagePath}.vulnerabilities[${vulnerabilityIndex}]`;
        if (!isRecord(vulnerability)) return `${vulnerabilityPath} must be an object`;
        if (!isNonEmptyString(vulnerability.id)) return `${vulnerabilityPath}.id must be a non-empty string`;
      }
    }
  }
  return null;
}

function extractFindings(parsed) {
  const findings = [];
  for (const result of parsed.results) {
    for (const packageEntry of result.packages) {
      for (const vulnerability of packageEntry.vulnerabilities) {
        findings.push({
          tool: name,
          severity: mapOsvSeverity(vulnerability),
          rule: vulnerability.id,
          path: result.source.path,
          line: null,
          msg: vulnerability.summary ?? vulnerability.details ?? vulnerability.id,
        });
      }
    }
  }
  return findings;
}

export async function run({ rootDir, config = {}, spawnFn = nodeSpawnSync, timeoutMs = 60000, env = process.env }) {
  const resolved = config.binaryPath ? { installed: true, path: config.binaryPath } : resolveBinary(env);
  if (!resolved.installed) {
    return { status: "SKIPPED", classification: "binary_missing", findings: [], raw: null, reason: resolved.reason };
  }

  const v2Failure = checkV2({ binaryPath: resolved.path, rootDir, spawnFn, timeoutMs });
  if (v2Failure) return v2Failure;

  const args = ["scan", "source", "--format", "json", "-r", rootDir];

  let res;
  try {
    res = spawnFn(resolved.path, args, { cwd: rootDir, encoding: "utf8", timeout: timeoutMs, shell: false });
  } catch (err) {
    return spawnFailure(err);
  }

  if (res.error && res.error.code === "ETIMEDOUT") {
    return { status: "ERROR", classification: "scanner_error", findings: [], raw: null, reason: `osv-scanner timed out after ${timeoutMs}ms` };
  }
  if (res.error) {
    return spawnFailure(res.error);
  }

  // Exit-code contract: ONLY 0 and 1 are valid completed runs.
  if (res.status !== 0 && res.status !== 1) {
    // Honest special case: exit 128 + "No package
    // sources found" is osv-scanner's honest signal that the project has no package
    // manifests/lockfiles to scan at all -- NOT a crash. A docs-/guardrails-only project
    // (like this repo itself) would otherwise wrongly block the security gate over having
    // literally nothing to scan. Any OTHER exit code (including 128 with different output)
    // stays ERROR (fail-closed unchanged).
    const combinedOutput = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    if (res.status === 128 && combinedOutput.includes("No package sources found")) {
      return {
        status: "SKIPPED",
        classification: "success",
        findings: [],
        raw: res.stdout ?? null,
        reason: "no package sources in project (osv-scanner: \"No package sources found\", exit 128)",
      };
    }
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: res.stdout ?? null,
      reason: `osv-scanner exited ${res.status} (only 0/1 are valid runs): ${(res.stderr || "").trim().slice(0, 500)}`,
    };
  }

  const stdout = res.stdout ?? "";
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: stdout,
      reason: `unparseable osv-scanner JSON output (exit ${res.status}): ${err.message}`,
    };
  }

  const shapeError = validateV2Output(parsed);
  if (shapeError) {
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: stdout,
      reason: `unexpected osv-scanner v2 JSON shape (${shapeError}), exit ${res.status}`,
    };
  }

  let findings;
  try {
    findings = extractFindings(parsed);
  } catch (err) {
    return { status: "ERROR", classification: "scanner_error", findings: [], raw: stdout, reason: `osv-scanner output shape not recognized: ${err.message}` };
  }

  return { status: findings.length > 0 ? "FINDINGS" : "PASS", classification: findings.length > 0 ? "findings" : "success", findings, raw: stdout };
}

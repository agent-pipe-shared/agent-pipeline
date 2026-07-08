#!/usr/bin/env node
/**
 * osv-scanner.mjs -- security-scan adapter for osv-scanner (dependency vulnerability
 * scanning).
 *
 * NEW FILE. Same dependency-free adapter interface as ./gitleaks.mjs (read that file's
 * header first for the shared resolveBinary()/config.binaryPath/env-param rationale --
 * identical pattern here, not re-explained).
 *
 * INVOCATION: `osv-scanner scan source --format json -r <root>`.
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
 * OUTPUT SHAPE (defensive, OPEN ITEM for real-tool validation): osv-scanner's CLI has
 * had at least one shape
 * change across major versions ("old" vs "new" CLI). This adapter expects the common,
 * long-stable shape `{ results: [ { source: {...}, packages: [ { package: {...},
 * vulnerabilities: [...], groups: [...] } ] } ] }` and walks it defensively (every level
 * guarded with Array.isArray/optional chaining, the whole extraction wrapped in try/catch)
 * so an unexpected nesting degrades to ERROR ("osv-scanner output shape not recognized")
 * rather than crashing or silently reporting zero findings. NOT verified against a real
 * osv-scanner binary yet -- real-tool validation must confirm this shape against the
 * actual installed version before this adapter is trusted end-to-end.
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

function extractFindings(parsed) {
  const findings = [];
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  for (const result of results) {
    const sourcePath = result?.source?.path;
    const packages = Array.isArray(result?.packages) ? result.packages : [];
    for (const pkgEntry of packages) {
      const pkgName = pkgEntry?.package?.name ?? "unknown-package";
      const pkgVersion = pkgEntry?.package?.version;
      const vulns = Array.isArray(pkgEntry?.vulnerabilities) ? pkgEntry.vulnerabilities : [];
      for (const vuln of vulns) {
        findings.push({
          tool: name,
          severity: mapOsvSeverity(vuln),
          rule: vuln?.id ?? "unknown-osv-id",
          path: sourcePath ?? (pkgVersion ? `${pkgName}@${pkgVersion}` : pkgName),
          line: null,
          msg: vuln?.summary ?? vuln?.details ?? vuln?.id ?? "vulnerability detected",
        });
      }
    }
  }
  return findings;
}

export async function run({ rootDir, config = {}, spawnFn = nodeSpawnSync, timeoutMs = 60000, env = process.env }) {
  const resolved = config.binaryPath ? { installed: true, path: config.binaryPath } : resolveBinary(env);
  if (!resolved.installed) {
    return { status: "SKIPPED", findings: [], raw: null, reason: resolved.reason };
  }

  const args = ["scan", "source", "--format", "json", "-r", rootDir];

  let res;
  try {
    res = spawnFn(resolved.path, args, { cwd: rootDir, encoding: "utf8", timeout: timeoutMs });
  } catch (err) {
    return { status: "ERROR", findings: [], raw: null, reason: `spawn threw: ${err.message}` };
  }

  if (res.error && res.error.code === "ETIMEDOUT") {
    return { status: "ERROR", findings: [], raw: null, reason: `osv-scanner timed out after ${timeoutMs}ms` };
  }
  if (res.error) {
    return { status: "ERROR", findings: [], raw: null, reason: `spawn error: ${res.error.message}` };
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
        findings: [],
        raw: res.stdout ?? null,
        reason: "no package sources in project (osv-scanner: \"No package sources found\", exit 128)",
      };
    }
    return {
      status: "ERROR",
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
      findings: [],
      raw: stdout,
      reason: `unparseable osv-scanner JSON output (exit ${res.status}): ${err.message}`,
    };
  }

  let findings;
  try {
    findings = extractFindings(parsed);
  } catch (err) {
    return { status: "ERROR", findings: [], raw: stdout, reason: `osv-scanner output shape not recognized: ${err.message}` };
  }

  return { status: findings.length > 0 ? "FINDINGS" : "PASS", findings, raw: stdout };
}

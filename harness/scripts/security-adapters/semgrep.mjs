#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * semgrep.mjs -- security-scan adapter for semgrep (static analysis rules), AP1-P4 "FUNDIN".
 *
 * NEW FILE. Same dependency-free adapter interface as ./gitleaks.mjs (read that file's
 * header first for the shared resolveBinary()/config.binaryPath/env-param rationale).
 *
 * INVOCATION: `semgrep scan --json --config <rules_dir||auto> <root>`. `config.rulesDir`
 * (resolved to an absolute path by the runner from manifest field
 * `security.scanners.semgrep.rules_dir`, e.g. `governance/examples/policies/semgrep`) is
 * used verbatim as the `--config` value when present; otherwise falls back to the literal
 * string `"auto"` (semgrep's own built-in ruleset-registry mode).
 *
 * EXIT-CODE AND BODY POLICY: only a zero child exit with a JSON body carrying a `results[]`
 * array and no error payload is a completed Semgrep scan. Any nonzero exit, error payload or
 * missing `results[]` is a scanner error, even when stdout otherwise looks like a clean
 * report. This fail-closed rule deliberately avoids a false PASS after a partial/error run.
 *
 * SEVERITY MAPPING (per briefing, semgrep's three native severities -- high confidence, not
 * a guess): `extra.severity` "ERROR" -> high, "WARNING" -> medium, "INFO" -> info. Any other
 * or missing value maps defensively to "medium" (never silently dropped, never crashes).
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter as PATH_DELIM, join as pathJoin } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";

export const name = "semgrep";

const ENV_VAR = "PIPELINE_SEMGREP_PATH";
const BIN_NAME = "semgrep";
const WIN_EXTS = [".exe", ".cmd", ".bat"];

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
      reason: `semgrep could not start (${error.code}): execution environment blocks Node child processes; this is not a missing scanner or finding`,
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

function mapSemgrepSeverity(extraSeverity) {
  if (extraSeverity === "ERROR") return "high";
  if (extraSeverity === "WARNING") return "medium";
  if (extraSeverity === "INFO") return "info";
  return "medium"; // defensive fallback for an unrecognized/missing severity string
}

function cleanupScratch(path) {
  try { rmSync(path, { recursive: true, force: true }); } catch { /* best-effort bounded scratch cleanup */ }
}

export async function run({ rootDir, config = {}, spawnFn = nodeSpawnSync, timeoutMs = 60000, env = process.env }) {
  const resolved = config.binaryPath ? { installed: true, path: config.binaryPath } : resolveBinary(env);
  if (!resolved.installed) {
    return { status: "SKIPPED", classification: "binary_missing", findings: [], raw: null, reason: resolved.reason };
  }

  const configArg = config.rulesDir || "auto";
  const args = ["scan", "--json", "--config", configArg, rootDir];

  let scratch;
  try {
    scratch = mkdtempSync(pathJoin(tmpdir(), "pipeline-semgrep-scan-"));
  } catch (err) {
    return { status: "ERROR", classification: "scanner_error", findings: [], raw: null, reason: `could not create Semgrep scratch dir: ${err.message}` };
  }
  const scanEnv = {
    ...process.env,
    ...env,
    SEMGREP_LOG_FILE: pathJoin(scratch, "semgrep.log"),
    SEMGREP_SETTINGS_FILE: pathJoin(scratch, "settings.yml"),
    SEMGREP_SEND_METRICS: "off",
    SEMGREP_VERSION_CACHE_PATH: pathJoin(scratch, "version-cache"),
  };

  let res;
  try {
    res = spawnFn(resolved.path, args, { cwd: rootDir, encoding: "utf8", env: scanEnv, timeout: timeoutMs, shell: false });
  } catch (err) {
    cleanupScratch(scratch);
    return spawnFailure(err);
  }
  cleanupScratch(scratch);

  if (res.error && res.error.code === "ETIMEDOUT") {
    return { status: "ERROR", classification: "scanner_error", findings: [], raw: null, reason: `semgrep timed out after ${timeoutMs}ms` };
  }
  if (res.error) {
    return spawnFailure(res.error);
  }

  if (res.status !== 0) {
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: res.stdout ?? null,
      reason: `semgrep exited ${res.status ?? "unknown"}: ${(res.stderr || "").trim().slice(0, 500)}`,
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
      reason: `unparseable semgrep JSON output (exit ${res.status}): ${err.message}`,
    };
  }

  if (!Array.isArray(parsed?.results)) {
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: stdout,
      reason: `unexpected semgrep JSON shape (missing results[]), exit ${res.status}`,
    };
  }

  if (parsed.errors !== undefined && (!Array.isArray(parsed.errors) || parsed.errors.length > 0)) {
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: stdout,
      reason: "semgrep JSON contains an error payload",
    };
  }

  const findings = parsed.results.map((r) => ({
    tool: name,
    severity: mapSemgrepSeverity(r?.extra?.severity),
    rule: r?.check_id ?? "unknown-rule",
    path: r?.path ?? null,
    line: typeof r?.start?.line === "number" ? r.start.line : null,
    msg: r?.extra?.message ?? r?.check_id ?? "semgrep finding",
  }));

  return { status: findings.length > 0 ? "FINDINGS" : "PASS", classification: findings.length > 0 ? "findings" : "success", findings, raw: stdout };
}

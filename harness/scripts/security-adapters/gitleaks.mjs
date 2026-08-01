#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * gitleaks.mjs -- security-scan adapter for gitleaks (secret detection), AP1-P4 "FUNDIN".
 *
 * NEW FILE. Dependency-free (node:fs/os/path/child_process only), same adapter interface
 * as its siblings in this directory: `name`, `isInstalled(env)`, `run({rootDir, config,
 * spawnFn, timeoutMs, env})` -> `{status, findings, raw, reason?}`.
 *
 * BINARY RESOLUTION (isInstalled / run, shared `resolveBinary()` below): env override
 * `PIPELINE_GITLEAKS_PATH` first (must point at an existing file); else a plain PATH walk
 * for `gitleaks` (Windows: also tries `.exe`/`.cmd`/`.bat` suffixes). `run()` accepts an
 * already-resolved path via `config.binaryPath` (set by the runner after it already called
 * `isInstalled()` -- avoids re-walking PATH and guarantees run() executes the exact binary
 * isInstalled() found); if `config.binaryPath` is absent, `run()` resolves for itself via
 * the optional `env` param (defaults to `process.env`) -- this lets a unit test call run()
 * in isolation with a fixture env object, without needing the runner's glue.
 *
 * INVOCATION: `gitleaks detect --source <root> --report-format json --report-path <tmp>
 * --no-banner --exit-code 0`. The report is written to a temp JSON file (a fresh
 * `mkdtempSync` dir per run, removed again after parsing) rather than parsed from stdout --
 * gitleaks does not print a stable, parseable JSON stream to stdout across versions, but its
 * `--report-path` file is the documented, stable contract. `--exit-code 0` forces gitleaks
 * to always exit 0 regardless of findings, so a NON-zero exit here is a genuine crash (bad
 * args, internal error) -- never "findings present". This is the load-bearing mechanism that
 * keeps FINDINGS and ERROR from ever being conflated (briefing requirement): status comes
 * exclusively from the parsed report content, never from the exit code.
 *
 * SEVERITY MAPPING (documented per briefing -- gitleaks findings have no native severity):
 *   every finding -> fixed "high" (a detected secret is always treated as high-impact;
 *   there is no gitleaks field this could instead be derived from).
 *
 * TIMEOUT: enforced via node:child_process spawnSync's own `timeout` option (empirically
 * verified in this environment: on timeout, `res.error.code === "ETIMEDOUT"`, `res.status
 * === null`, `res.signal === "SIGTERM"` -- Node kills the child itself, no manual watchdog
 * needed for a one-shot report-and-exit tool like gitleaks).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter as PATH_DELIM, join as pathJoin } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";

export const name = "gitleaks";

const ENV_VAR = "PIPELINE_GITLEAKS_PATH";
const BIN_NAME = "gitleaks";
const WIN_EXTS = [".exe", ".cmd", ".bat"];

/** Env override -> plain PATH walk. Returns { installed, path? , reason? }. Never throws. */
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

/** Installation check per the adapter contract. `env` defaults to process.env. */
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
      reason: `gitleaks could not start (${error.code}): execution environment blocks Node child processes; this is not a missing scanner or finding`,
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

function cleanupTmp(tmpDir) {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort temp cleanup */
  }
}

/**
 * Runs gitleaks against `rootDir`. `config.binaryPath` (set by the runner) short-circuits
 * resolution; otherwise resolves via `env` (defaults to process.env). `spawnFn` defaults to
 * node:child_process's real spawnSync -- injectable so tests can point it at a fixture
 * "binary" (see security-scan.test.mjs) while production always uses the real spawnSync
 * with explicit `shell: false` (a real gitleaks binary never needs a shell).
 */
export async function run({ rootDir, config = {}, spawnFn = nodeSpawnSync, timeoutMs = 60000, env = process.env }) {
  const resolved = config.binaryPath ? { installed: true, path: config.binaryPath } : resolveBinary(env);
  if (!resolved.installed) {
    return { status: "SKIPPED", classification: "binary_missing", findings: [], raw: null, reason: resolved.reason };
  }

  let tmpDir;
  try {
    tmpDir = mkdtempSync(pathJoin(tmpdir(), "pipeline-gitleaks-"));
  } catch (err) {
    return { status: "ERROR", classification: "scanner_error", findings: [], raw: null, reason: `could not create temp report dir: ${err.message}` };
  }
  const reportPath = pathJoin(tmpDir, "report.json");

  const args = [
    "detect",
    "--source",
    rootDir,
    "--report-format",
    "json",
    "--report-path",
    reportPath,
    "--no-banner",
    "--exit-code",
    "0",
  ];

  let res;
  try {
    res = spawnFn(resolved.path, args, { cwd: rootDir, encoding: "utf8", timeout: timeoutMs, shell: false });
  } catch (err) {
    cleanupTmp(tmpDir);
    return spawnFailure(err);
  }

  if (res.error && res.error.code === "ETIMEDOUT") {
    cleanupTmp(tmpDir);
    return { status: "ERROR", classification: "scanner_error", findings: [], raw: null, reason: `gitleaks timed out after ${timeoutMs}ms` };
  }
  if (res.error) {
    cleanupTmp(tmpDir);
    return spawnFailure(res.error);
  }
  if (res.status !== 0) {
    cleanupTmp(tmpDir);
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw: res.stdout ?? null,
      reason: `gitleaks exited ${res.status} (expected 0 due to --exit-code 0): ${(res.stderr || "").trim().slice(0, 500)}`,
    };
  }

  let raw;
  try {
    raw = readFileSync(reportPath, "utf8");
  } catch (err) {
    cleanupTmp(tmpDir);
    return { status: "ERROR", classification: "scanner_error", findings: [], raw: null, reason: `report file not readable: ${err.message}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    cleanupTmp(tmpDir);
    return { status: "ERROR", classification: "scanner_error", findings: [], raw, reason: `unparseable gitleaks report JSON: ${err.message}` };
  }

  if (!Array.isArray(parsed)) {
    cleanupTmp(tmpDir);
    return {
      status: "ERROR",
      classification: "scanner_error",
      findings: [],
      raw,
      reason: "unexpected gitleaks report JSON shape (expected top-level array)",
    };
  }
  cleanupTmp(tmpDir);

  const findings = parsed.map((f) => ({
    tool: name,
    severity: "high", // fixed mapping -- see header (gitleaks has no native severity field)
    rule: f?.RuleID ?? f?.rule ?? "unknown-rule",
    path: f?.File ?? f?.file ?? null,
    line: typeof f?.StartLine === "number" ? f.StartLine : typeof f?.line === "number" ? f.line : null,
    msg: f?.Description ?? f?.description ?? f?.Message ?? "secret detected",
  }));

  return { status: findings.length > 0 ? "FINDINGS" : "PASS", classification: findings.length > 0 ? "findings" : "success", findings, raw };
}

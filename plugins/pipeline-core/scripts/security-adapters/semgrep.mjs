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
 *
 * CAPABILITY_CONTRACT_V2 (CYB-2D, additive): a frozen, machine-readable transcription of the
 * behavior documented above, exported for CYB-2E's later aggregator work to read a uniform
 * capability contract across all four scanner adapters without re-deriving it from prose
 * comments. Purely additive data -- does not change any existing behavior in this file. Its
 * `networkBehavior` is represented honestly as conditional: local-only when `config.rulesDir`
 * names a local rules directory, but network-optional when absent (the `"auto"` fallback is
 * semgrep's own built-in registry mode, whose network use is controlled by the semgrep binary
 * itself, not by this adapter).
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

/**
 * CAPABILITY_CONTRACT_V2 -- machine-readable capability-contract descriptor (CYB-2D). A pure,
 * static, additive transcription of behavior this file already has and already documents in
 * its header comment above -- consumed by CYB-2E's later aggregator work to read a uniform
 * capability contract across all four adapters without re-deriving it from prose. Adding this
 * export changes none of `run()`/`isInstalled()`/`mapSemgrepSeverity()`'s existing behavior.
 */
export const CAPABILITY_CONTRACT_V2 = Object.freeze({
  contractVersion: "v2",
  tool: name,
  kind: "capability",
  capabilityId: "cap.sast",
  controlRef: null,
  supportedEcosystems: null,
  supportedEcosystemsNote:
    "semgrep's rule-based static analysis is language/rule-scoped, not package-ecosystem-scoped, in this adapter -- config.rulesDir (when present) names a local rules directory passed verbatim as --config, and this adapter does not itself declare or restrict a language/ecosystem allowlist",
  toolVersionConstraint: null,
  networkBehavior: "network-optional",
  networkBehaviorNote:
    "offline when config.rulesDir names a local rules directory (used verbatim as --config); the 'auto' fallback used when config.rulesDir is absent is semgrep's own built-in ruleset-registry mode, which may involve a network fetch depending on the real semgrep binary's own behavior -- this adapter does not itself control or guarantee that",
  requiredInputs: ["rootDir"],
  requiredInputsNote:
    "config.rulesDir is optional -- when absent, run() falls back to the literal string \"auto\" as semgrep's --config value",
  severityNormalization: Object.freeze({
    source: "extra.severity",
    mapping: Object.freeze({ ERROR: "high", WARNING: "medium", INFO: "info" }),
    fallback: Object.freeze({
      value: "medium",
      rule: "defensive fallback for any other or missing extra.severity value -- never silently dropped, never crashes",
    }),
  }),
  confidenceNormalization: null,
  coverageLimitations: Object.freeze([
    "Coverage is entirely determined by the active rule set -- a local rules directory (config.rulesDir, if configured) or semgrep's own built-in 'auto' registry mode when not configured; this adapter does not itself enumerate which rules ran.",
    "Single-shot, full scan per invocation over rootDir (`semgrep scan --json --config <rules_dir||auto> <root>`) -- no incremental/diff mechanism; every run() call re-scans the entirety of rootDir from scratch.",
  ]),
  exitCodeMapping: Object.freeze({
    completed:
      "zero child exit AND a JSON body carrying a results[] array AND no error payload -- only this combination is a completed scan (PASS/FINDINGS based on findings.length)",
    nonzero: "scanner_error (ERROR) -- any nonzero child exit, fail-closed regardless of stdout content",
    errorPayload:
      "scanner_error (ERROR) -- JSON body carries a non-empty errors[] array, even at exit 0 with an otherwise clean-looking results[] array",
    missingResults:
      "scanner_error (ERROR) -- JSON body lacks a results[] array (or it is not an array), even at exit 0 and even if stdout otherwise looks like a clean report",
  }),
  timeoutContract: Object.freeze({
    defaultMs: 60000,
    cancellable: true,
    mechanism: "node:child_process spawnSync timeout option (ETIMEDOUT)",
  }),
  evidenceFields: Object.freeze(["tool", "severity", "rule", "path", "line", "msg"]),
});

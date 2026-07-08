#!/usr/bin/env node
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
 * EXIT-CODE POLICY (deliberately NOT gated on, OPEN ITEM for P8): semgrep's exit-code
 * semantics for "findings present" vs "clean" are not confidently known from documentation
 * alone for this delivery (stop-condition (b) disposition: implement defensively instead of
 * guessing wrong and stopping). This adapter therefore derives status PURELY from the
 * parsed JSON body's `results[]` array, never from the child's exit code -- semgrep with
 * `--json` reliably writes its full JSON report to stdout on both a clean and a
 * findings-present run in every version this was designed against; a genuine crash
 * (invalid --config path, internal error, OOM, etc.) is expected to either print no valid
 * JSON at all or omit `results[]`, both of which fall through to ERROR below regardless of
 * exit code. P8 must confirm real semgrep's exit-code behavior does not produce a case where
 * a genuine crash still emits a well-formed `{results: [...]}` body (which would currently
 * be misread as PASS/FINDINGS instead of ERROR).
 *
 * SEVERITY MAPPING (per briefing, semgrep's three native severities -- high confidence, not
 * a guess): `extra.severity` "ERROR" -> high, "WARNING" -> medium, "INFO" -> info. Any other
 * or missing value maps defensively to "medium" (never silently dropped, never crashes).
 */
import { existsSync } from "node:fs";
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

function mapSemgrepSeverity(extraSeverity) {
  if (extraSeverity === "ERROR") return "high";
  if (extraSeverity === "WARNING") return "medium";
  if (extraSeverity === "INFO") return "info";
  return "medium"; // defensive fallback for an unrecognized/missing severity string
}

export async function run({ rootDir, config = {}, spawnFn = nodeSpawnSync, timeoutMs = 60000, env = process.env }) {
  const resolved = config.binaryPath ? { installed: true, path: config.binaryPath } : resolveBinary(env);
  if (!resolved.installed) {
    return { status: "SKIPPED", findings: [], raw: null, reason: resolved.reason };
  }

  const configArg = config.rulesDir || "auto";
  const args = ["scan", "--json", "--config", configArg, rootDir];

  let res;
  try {
    res = spawnFn(resolved.path, args, { cwd: rootDir, encoding: "utf8", timeout: timeoutMs });
  } catch (err) {
    return { status: "ERROR", findings: [], raw: null, reason: `spawn threw: ${err.message}` };
  }

  if (res.error && res.error.code === "ETIMEDOUT") {
    return { status: "ERROR", findings: [], raw: null, reason: `semgrep timed out after ${timeoutMs}ms` };
  }
  if (res.error) {
    return { status: "ERROR", findings: [], raw: null, reason: `spawn error: ${res.error.message}` };
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
      reason: `unparseable semgrep JSON output (exit ${res.status}): ${err.message}`,
    };
  }

  if (!Array.isArray(parsed?.results)) {
    return {
      status: "ERROR",
      findings: [],
      raw: stdout,
      reason: `unexpected semgrep JSON shape (missing results[]), exit ${res.status}`,
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

  return { status: findings.length > 0 ? "FINDINGS" : "PASS", findings, raw: stdout };
}

#!/usr/bin/env node
/**
 * security-scan.mjs -- security-scan phase runner, AP1-P4 "FUNDIN".
 *
 * NEW FILE, NOT WIRED into harness/scripts/verify.mjs (TP-3 -- explicit scope boundary of
 * this delivery; a later work package, "W-WIRE", adds the call site + the accompanying gate
 * hook). This script is a standalone, independently invocable phase runner exactly like
 * verify.mjs is for the guard-family test set, following the same evidence-artifact family
 * pattern (`pipeline.verify-evidence.v0` is the sibling schema this one,
 * `pipeline.security-evidence.v0`, was modeled on).
 *
 * MANDATORY DEDUP STEP (briefing step 1): grepped the whole repo for
 * security-scan/security-adapters/gitleaks/osv-scanner/semgrep/license-check precursors --
 * found none (only this manifest's own `security:` config block, the real
 * `.claude/pipeline.yaml`, and forward-looking research/planning prose reference these tool
 * names). `guardrails/security.md` SEC-01's Verification line already marks "whether a
 * deterministic secret scanner joins the verify chain" as OPEN (Phase 4) -- this delivery is
 * exactly that scanner, built but deliberately not yet wired (P7 forbids editing that file;
 * the wiring itself is W-WIRE's job, not this one's).
 *
 * CONFIG SOURCES (manifest read via plugins/pipeline-core/lib/manifest.mjs's
 * loadManifestSafe()/gateConfig() -- never throws, `null` on any absent/invalid manifest,
 * all defaults below then apply):
 *   - `security.scanners.<tool>.enabled` (tool keys: "gitleaks", "osv-scanner", "semgrep",
 *     "license-check") -- default true for ALL FOUR when the manifest is absent or a given
 *     tool's `enabled` field is unset (briefing: "absent manifest -> defaults:
 *     gitleaks+osv-scanner+license-check enabled, semgrep enabled").
 *   - `security.scanners.semgrep.rules_dir` -- resolved to `<rootDir>/<rules_dir>`; absent
 *     -> semgrep adapter falls back to "auto" itself.
 *   - license-check's declared `third-party-licenses.json` is ALWAYS `<rootDir>/
 *     third-party-licenses.json` (repo root, per the briefing's "repo root or path from
 *     config" clause) -- a manifest-driven override was considered (mirroring
 *     `semgrep.rules_dir`'s pattern) and DELIBERATELY DROPPED: the manifest schema's
 *     `security.scanners.<key>` value schema is `additionalProperties: false` with only
 *     `enabled`/`rules_dir` declared (plugins/pipeline-core/scripts/pipeline-manifest.schema.json)
 *     -- adding an undeclared `declared_path` key there would make schema-lite reject the
 *     WHOLE manifest as invalid, and `loadManifestSafe` silently collapses ANY invalid
 *     manifest to `null` (same as absent), which would silently revert every OTHER
 *     manifest-driven setting (gate mode, thresholds, rules_dir, ...) to its default too --
 *     a landmine, not a feature. Flagged as an open item (schema is sibling territory, not
 *     editable by this delivery) rather than implemented; repo-root is sufficient for every
 *     DoD case class.
 *   - `security.thresholds.block_on` -- default `["critical", "high"]`.
 *   - `governance.policies_path` -- default `"governance/examples/policies"`; used to build
 *     the license-check allowlist path `<rootDir>/<policies_path>/license-allowlist.json`.
 *   - gate mode via `gateConfig(manifest, "security")?.mode` -- default `"blocking"`.
 *
 * EXIT-CODE POLICY (briefing, verbatim): any adapter status ERROR -> blocking-class
 * (fail-closed: an adapter that crashed is worse than one with findings, never silently
 * treated as clean). A finding whose severity is in `thresholds.block_on` -> blocking-class.
 * SKIPPED contributes no findings but IS recorded in evidence (QG-05: skipped != pass).
 * blocking-class: mode "blocking" -> exit 2, mode "warn" -> exit 1, mode "off" -> exit 0
 * (the "off" branch is this script's own defensive completion of the 3-value gates.mode
 * enum -- gates.security in THIS repo's manifest is "blocking" and the briefing's DoD only
 * exercises "blocking"/"warn" explicitly; "off" is handled the safe, documented way rather
 * than left to throw or silently fall through to the blocking branch). No blocking-class at
 * all -> exit 0 regardless of mode.
 *
 * EVIDENCE: `<rootDir>/evidence/security-latest.json`, schema
 * `pipeline.security-evidence.v0`, written unconditionally before this script exits (even on
 * a blocking/error verdict -- "gate honesty", the same QG-05/QG-03 spirit verify.mjs's
 * evidence file follows). `project` field: read from `<rootDir>/.claude/pipeline.json`'s
 * own `project` field if that file exists and parses (mirrors the calibration file's
 * existing convention, e.g. this repo's own `"project": "agent-pipeline"`); falls back to
 * `path.basename(rootDir)` if that file is absent/malformed -- this script is meant to run
 * unmodified across every pipeline-bound project, not just this repo.
 *
 * CLI: `node harness/scripts/security-scan.mjs [--root <dir>] [--timeout-ms N]`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadManifestSafe, gateConfig } from "../../plugins/pipeline-core/lib/manifest.mjs";
import { assessTrustedExecutablePath, resolveTrustedSystemExecutable } from "./security-readiness/tool-identity.mjs";

import * as gitleaksAdapter from "./security-adapters/gitleaks.mjs";
import * as osvScannerAdapter from "./security-adapters/osv-scanner.mjs";
import * as semgrepAdapter from "./security-adapters/semgrep.mjs";
import * as licenseCheckAdapter from "./security-adapters/license-check.mjs";

const DEFAULT_TIMEOUT_MS = 60000;
const PREFLIGHT_TIMEOUT_MS = 5000;
const DEFAULT_BLOCK_ON = ["critical", "high"];
const DEFAULT_GOVERNANCE_POLICIES_PATH = "governance/examples/policies";
const DEFAULT_GATE_MODE = "blocking";

// Fixed run order; every key here must match the manifest's security.scanners.<key> key.
const SCANNER_DEFS = [
  { key: "gitleaks", adapter: gitleaksAdapter },
  { key: "osv-scanner", adapter: osvScannerAdapter },
  { key: "semgrep", adapter: semgrepAdapter },
  { key: "license-check", adapter: licenseCheckAdapter },
];

const DEFAULT_ENABLED = Object.freeze({
  gitleaks: true,
  "osv-scanner": true,
  semgrep: true,
  "license-check": true,
});

// ---------------------------------------------------------------------------------------------
// Config derivation from the (possibly null) manifest object.
// ---------------------------------------------------------------------------------------------

function isScannerEnabled(manifest, key) {
  const configured = manifest?.security?.scanners?.[key]?.enabled;
  return configured ?? DEFAULT_ENABLED[key];
}

function resolveBlockOn(manifest) {
  const configured = manifest?.security?.thresholds?.block_on;
  return Array.isArray(configured) ? configured : DEFAULT_BLOCK_ON;
}

function resolveGateMode(manifest) {
  return gateConfig(manifest, "security")?.mode ?? DEFAULT_GATE_MODE;
}

function resolveGovernancePoliciesPath(manifest) {
  const configured = manifest?.governance?.policies_path;
  return typeof configured === "string" ? configured : DEFAULT_GOVERNANCE_POLICIES_PATH;
}

/** Builds the per-adapter `config` object for one scanner key (paths already absolute). */
function buildAdapterConfig(key, { rootDir, manifest, policiesPathAbs }) {
  if (key === "semgrep") {
    const rulesDirRel = manifest?.security?.scanners?.semgrep?.rules_dir;
    return { rulesDir: typeof rulesDirRel === "string" ? join(rootDir, rulesDirRel) : undefined };
  }
  if (key === "license-check") {
    // No manifest-driven override for declaredPath -- see header comment for why (schema
    // has no slot for it without risking the whole manifest collapsing to invalid/null).
    return {
      allowlistPath: join(policiesPathAbs, "license-allowlist.json"),
      declaredPath: join(rootDir, "third-party-licenses.json"),
    };
  }
  return {};
}

/** Best-effort `project` name: `.claude/pipeline.json`'s own field, else dir basename. */
function resolveProjectName(rootDir) {
  try {
    const raw = readFileSync(join(rootDir, ".claude", "pipeline.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.project === "string" && parsed.project.trim() !== "") return parsed.project;
  } catch {
    // absent/malformed calibration file -- fall through to the basename default
  }
  return basename(rootDir);
}

function resolveCommit(rootDir) {
  try {
    const res = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: rootDir });
    if (res.status === 0) return res.stdout.trim();
  } catch {
    // git missing from PATH: evidence still written, commit stays "unknown"
  }
  return "unknown";
}

function childProcessError({ tool, error, timeoutMs }) {
  if (error?.code === "EPERM" || error?.code === "EACCES") {
    return {
      status: "ERROR",
      classification: "execution_environment",
      reason: `${tool} could not start a Node child process (${error.code}). Run Codex CLI/headless verification in the approved host context; do not report this as a missing scanner or finding.`,
    };
  }
  if (error?.code === "ETIMEDOUT") {
    return {
      status: "ERROR",
      classification: "execution_environment",
      reason: `${tool} child-process preflight timed out after ${timeoutMs}ms`,
    };
  }
  return {
    status: "ERROR",
    classification: "execution_environment",
    reason: `${tool} could not start a Node child process: ${error?.message ?? "unknown error"}`,
  };
}

/**
 * Proves that this Node process can launch one fixed, non-project child process.
 * The scan never invokes project scripts: scanner binaries and arguments are fixed
 * by adapters, and this preflight always uses the absolute Node executable with
 * `shell: false`.
 */
export function runChildProcessPreflight({ rootDir, timeoutMs = DEFAULT_TIMEOUT_MS, spawnFn = spawnSync } = {}) {
  const boundedTimeoutMs = Math.min(timeoutMs, PREFLIGHT_TIMEOUT_MS);
  let result;
  try {
    result = spawnFn(process.execPath, ["-e", "process.exit(0)"], {
      cwd: rootDir,
      encoding: "utf8",
      timeout: boundedTimeoutMs,
      shell: false,
    });
  } catch (error) {
    return childProcessError({ tool: "security scan", error, timeoutMs: boundedTimeoutMs });
  }
  if (result?.error) return childProcessError({ tool: "security scan", error: result.error, timeoutMs: boundedTimeoutMs });
  if (result?.status !== 0) {
    return {
      status: "ERROR",
      classification: "execution_environment",
      reason: `security scan child-process preflight exited ${result?.status ?? "unknown"}`,
    };
  }
  return { status: "PASS", classification: "success" };
}

function scannerEntry(adapter, result) {
  const entry = {
    tool: adapter.name,
    status: result.status,
    classification: result.classification ?? (result.status === "PASS" ? "success" : result.status === "FINDINGS" ? "findings" : "scanner_error"),
    findingCount: result.findings.length,
  };
  if (result.reason) entry.reason = result.reason;
  return entry;
}

// ---------------------------------------------------------------------------------------------
// Orchestration core (exported: the CLI's own main() is a thin wrapper around this).
// ---------------------------------------------------------------------------------------------

/**
 * Runs every enabled scanner sequentially, aggregates evidence, writes it to
 * `<rootDir>/evidence/security-latest.json`, and returns `{ evidence, exitCode }`.
 * `env`/`spawnFn` are injectable seams for tests (default `process.env` / each adapter's own
 * real spawnSync) -- threaded through unchanged to every adapter's `isInstalled()`/`run()`.
 * Never throws: a single adapter's internal exception is caught here and downgraded to that
 * scanner's own ERROR status rather than aborting the whole run (defensive on top of each
 * adapter's own internal try/catch -- belt and suspenders, matches the "evidence file written
 * even on failure paths" DoD requirement, which requires this function to always reach the
 * write call).
 */
export async function runSecurityScan({ rootDir, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env, spawnFn, platform = process.platform } = {}) {
  const manifest = loadManifestSafe(rootDir);
  const blockOn = resolveBlockOn(manifest);
  const mode = resolveGateMode(manifest);
  const policiesPathAbs = join(rootDir, resolveGovernancePoliciesPath(manifest));

  const scanners = [];
  const findings = [];
  const childProcessPreflight = runChildProcessPreflight({ rootDir, timeoutMs, spawnFn });

  for (const { key, adapter } of SCANNER_DEFS) {
    if (!isScannerEnabled(manifest, key)) continue;

    let entry;
    try {
      // The license check does not spawn a process and remains usable when the
      // environment cannot start children. Every binary-backed scanner is
      // classified as an execution-environment failure before PATH discovery,
      // so a sandbox EPERM can never masquerade as a missing binary.
      if (key !== "license-check" && childProcessPreflight.status !== "PASS") {
        entry = {
          tool: adapter.name,
          status: "ERROR",
          classification: "execution_environment",
          findingCount: 0,
          reason: childProcessPreflight.reason,
        };
      } else {
      let inst = adapter.isInstalled(env);
      if (inst.installed && key !== "license-check") {
        const assessed = assessTrustedExecutablePath(inst.path, { platform });
        inst = assessed.ok ? { installed: true, path: assessed.path } : { installed: false, status: assessed.status, reason: `resolved ${key} path was rejected: ${assessed.status}` };
      }
      if (!inst.installed && key !== "license-check" && typeof env?.HOME === "string" && env.HOME.length > 0) {
        const trusted = resolveTrustedSystemExecutable(key, { platform, homeDir: env.HOME });
        if (trusted.ok) inst = { installed: true, path: trusted.path };
        else if (inst.status === undefined) inst = { ...inst, status: trusted.status };
      }
      if (!inst.installed) {
        entry = { tool: adapter.name, status: "SKIPPED", classification: inst.status ?? "binary_missing", findingCount: 0, reason: inst.reason };
      } else {
        const adapterConfig = { ...buildAdapterConfig(key, { rootDir, manifest, policiesPathAbs }), binaryPath: inst.path };
        const runArgs = { rootDir, config: adapterConfig, timeoutMs, env };
        if (spawnFn) runArgs.spawnFn = spawnFn;
        const result = await adapter.run(runArgs);
        entry = scannerEntry(adapter, result);
        findings.push(...result.findings);
      }
      }
    } catch (err) {
      entry = { tool: adapter.name, status: "ERROR", classification: "scanner_error", findingCount: 0, reason: `adapter threw: ${err.message}` };
    }
    scanners.push(entry);
  }

  const blockOnSet = new Set(blockOn);
  const hasErrorClass = scanners.some((s) => s.status === "ERROR");
  const hasBlockingFinding = findings.some((f) => blockOnSet.has(f.severity));
  const blockingClass = hasErrorClass || hasBlockingFinding;

  let exitCode;
  if (!blockingClass) {
    exitCode = 0;
  } else if (mode === "warn") {
    exitCode = 1;
  } else if (mode === "off") {
    exitCode = 0;
  } else {
    exitCode = 2; // "blocking" (default / fail-closed for any unrecognized mode string)
  }

  const evidence = {
    schema: "pipeline.security-evidence.v0",
    project: resolveProjectName(rootDir),
    command: "node harness/scripts/security-scan.mjs",
    commit: resolveCommit(rootDir),
    finishedAt: new Date().toISOString(),
    thresholds: { block_on: blockOn },
    execution: { childProcessPreflight },
    scanners,
    findings,
    exitCode,
  };

  const evidenceDir = join(rootDir, "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, "security-latest.json"), JSON.stringify(evidence, null, 2) + "\n");

  return { evidence, exitCode };
}

function statusLabel(status) {
  switch (status) {
    case "PASS":
      return "OK";
    case "FINDINGS":
      return "FINDINGS";
    case "SKIPPED":
      return "SKIPPED";
    case "ERROR":
      return "ERROR";
    default:
      return status;
  }
}

function printSummary(evidence) {
  for (const s of evidence.scanners) {
    const reasonSuffix = s.reason ? ` -- ${s.reason}` : "";
    console.log(`${s.tool}: ${statusLabel(s.status)} [${s.classification}] (${s.findingCount} findings)${reasonSuffix}`);
  }
  const verdict = evidence.exitCode === 0 ? "CLEAN" : evidence.exitCode === 1 ? "WARNING" : "BLOCKING";
  console.log(`\nVerdict: ${verdict} (thresholds: ${evidence.thresholds.block_on.join(", ")}) -> exit ${evidence.exitCode}`);
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { root: process.cwd(), timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") {
      opts.root = argv[++i];
    } else if (a === "--timeout-ms") {
      opts.timeoutMs = Number(argv[++i]);
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
    throw new Error(`--timeout-ms must be a positive number, got: ${opts.timeoutMs}`);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  const rootDir = resolve(opts.root);
  if (!existsSync(rootDir)) {
    process.stderr.write(`error: --root path does not exist: ${rootDir}\n`);
    process.exitCode = 1;
    return;
  }

  const { evidence, exitCode } = await runSecurityScan({ rootDir, timeoutMs: opts.timeoutMs });
  printSummary(evidence);
  console.log(`Evidence written: ${join(rootDir, "evidence", "security-latest.json")}`);
  process.exitCode = exitCode;
}

const isDirectRun = (() => {
  try {
    return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  main();
}

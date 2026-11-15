#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * trivy.mjs -- security-scan adapter for Trivy's misconfiguration scan of infrastructure and container files
 * (candidate 29e, PO tiles 28d 4/5 and 29d T8/T8b, ADR-0092, ADR-0103).
 *
 * Same dependency-free adapter interface as ./osv-scanner.mjs (resolveBinary()/config.binaryPath/env param).
 *
 * APPLICABILITY (decided by the Pipeline, never by the binary): `trivyTriggerFiles(rootDir)` walks the scan root (the
 * detached candidate snapshot, so only committed bytes) and names
 *   - container files: basename `Dockerfile`, `Containerfile`, `Dockerfile.*`, `Containerfile.*` or `*.dockerfile`;
 *   - Terraform files: `*.tf`;
 *   - Kubernetes manifests: `*.yaml`/`*.yml` with a column-0 `apiVersion:` and `kind:` line (any document), or `*.json`
 *     whose top-level object has string `apiVersion` and `kind`; a `Kustomization`/`Component` kind and a file holding
 *     a template marker (`{{`) are not manifests (measured: Trivy does not scan them as Kubernetes).
 * No trigger file -> SKIPPED with classification "success" and no spawn at all: the project has nothing of this kind.
 *
 * INVOCATION (always offline and neutral; measured on 0.76.2): `trivy --version`, then
 *   trivy config --format json --skip-check-update --cache-dir <private> --exit-code 0
 *     --config <empty file> --ignorefile <empty file> --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL <rootDir>
 * with a private working directory and every `TRIVY_*` variable removed from the environment. Without the neutral
 * config, ignore file and environment, a `trivy.yaml`, `.trivyignore` or `TRIVY_SEVERITY` of the scanned candidate would
 * silently narrow its own scan (measured: a candidate `trivy.yaml` with `severity: [CRITICAL]` hid a HIGH finding).
 * Inline `trivy:ignore:<ID>` comments are honoured by Trivy; the adapter lists every one it finds in a trigger file as
 * `inlineIgnores` (path, line, rule) so the evidence shows them. They never block.
 *
 * FAIL CLOSED (scanner_error): spawn error or timeout; nonzero exit; unparseable JSON; SchemaVersion other than 2; a
 * `Results` member that is present but not an array; a stderr line at level ERROR or FATAL other than the expected
 * embedded-checks fallback (a Terraform parse error is reported only there); a trigger file Trivy did not report as a
 * target (a broken Kubernetes manifest is otherwise silently dropped).
 *
 * FINDINGS: Status FAIL only. Severity CRITICAL/HIGH/MEDIUM/LOW map to the lower-case value, anything else to medium.
 * rule = ID, path = Target (scan-root-relative, forward slashes), line = CauseMetadata.StartLine or null.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter as PATH_DELIM, dirname, join as pathJoin, relative, sep } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";

export const name = "trivy";

const ENV_VAR = "PIPELINE_TRIVY_PATH";
const BIN_NAME = "trivy";
const WIN_EXTS = [".exe"];
const SEVERITY_MAP = Object.freeze({ CRITICAL: "critical", HIGH: "high", MEDIUM: "medium", LOW: "low" });
const MAX_WALK_ENTRIES = 200000;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const SKIP_DIRS = new Set([".git"]);
const NOT_MANIFEST_KINDS = new Set(["Kustomization", "Component"]);
const EXPECTED_ERROR = /^\[misconfig\] Falling back to embedded checks(?:\t|$)/u;
const IGNORE_COMMENT = /trivy:ignore:([A-Za-z0-9][A-Za-z0-9_.-]*)/gu;
export const TRIVY_NOT_APPLICABLE_REASON = "no infrastructure or container files in project (Dockerfile/Containerfile, *.tf, Kubernetes manifests)";

function resolveBinary(env) {
  const override = env?.[ENV_VAR];
  if (override) {
    return existsSync(override) ? { installed: true, path: override } : { installed: false, reason: `${ENV_VAR} set but path not found: ${override}` };
  }
  const dirs = String(env?.PATH || env?.Path || "").split(PATH_DELIM).filter(Boolean);
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

const posix = (path) => path.split(sep).join("/");

function isContainerFile(fileName) {
  return fileName === "Dockerfile" || fileName === "Containerfile" || fileName.startsWith("Dockerfile.") || fileName.startsWith("Containerfile.")
    || fileName.toLowerCase().endsWith(".dockerfile");
}

/** True for YAML/JSON text that Trivy scans as a Kubernetes manifest (module header). */
export function isKubernetesManifestText(fileName, text) {
  if (typeof text !== "string" || text.includes("{{")) return false;
  if (/\.json$/iu.test(fileName)) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return false; }
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      && typeof parsed.apiVersion === "string" && typeof parsed.kind === "string" && !NOT_MANIFEST_KINDS.has(parsed.kind);
  }
  for (const document of text.split(/^---[^\S\r\n]*$/mu)) {
    const kind = document.match(/^kind:[^\S\r\n]*["']?([A-Za-z0-9]+)/mu)?.[1];
    if (kind && /^apiVersion:[^\S\r\n]*\S/mu.test(document) && !NOT_MANIFEST_KINDS.has(kind)) return true;
  }
  return false;
}

/**
 * The trigger files under `rootDir` as `{ container, terraform, kubernetes }` lists of scan-root-relative forward-slash
 * paths, or `{ error }` when the walk could not complete (an unreadable directory, or more than the bounded entry count).
 */
export function trivyTriggerFiles(rootDir, deps = {}) {
  const readdir = deps.readdirSyncFn ?? ((path) => readdirSync(path, { withFileTypes: true }));
  const readText = deps.readFileSyncFn ?? ((path) => readFileSync(path, "utf8"));
  const stat = deps.statSyncFn ?? statSync;
  const found = { container: [], terraform: [], kubernetes: [] };
  const queue = [rootDir];
  let entries = 0;
  while (queue.length > 0) {
    const dir = queue.shift();
    let listing;
    try { listing = readdir(dir); } catch (error) { return { error: `directory ${posix(relative(rootDir, dir)) || "."} could not be read (${error?.code ?? error?.message ?? "error"})` }; }
    for (const dirent of [...listing].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      entries += 1;
      if (entries > MAX_WALK_ENTRIES) return { error: `more than ${MAX_WALK_ENTRIES} entries under the scan root; applicability could not be decided` };
      const full = pathJoin(dir, dirent.name);
      if (dirent.isDirectory()) { if (!SKIP_DIRS.has(dirent.name)) queue.push(full); continue; }
      if (!dirent.isFile()) continue;
      const rel = posix(relative(rootDir, full));
      if (isContainerFile(dirent.name)) { found.container.push(rel); continue; }
      if (/\.tf$/u.test(dirent.name)) { found.terraform.push(rel); continue; }
      if (!/\.(?:ya?ml|json)$/iu.test(dirent.name)) continue;
      let size;
      try { size = stat(full).size; } catch { continue; }
      if (size > MAX_MANIFEST_BYTES) continue;
      let text;
      try { text = readText(full); } catch { continue; }
      if (isKubernetesManifestText(dirent.name, text)) found.kubernetes.push(rel);
    }
  }
  return found;
}

export function triggerCount(triggers) {
  return triggers && !triggers.error ? triggers.container.length + triggers.terraform.length + triggers.kubernetes.length : 0;
}

/** Every inline `trivy:ignore:<ID>` comment in the trigger files, as { path, line, rule }. */
export function inlineIgnores(rootDir, triggers, deps = {}) {
  const readText = deps.readFileSyncFn ?? ((path) => readFileSync(path, "utf8"));
  const result = [];
  for (const rel of [...triggers.container, ...triggers.terraform, ...triggers.kubernetes].sort()) {
    let text;
    try { text = readText(pathJoin(rootDir, ...rel.split("/"))); } catch { continue; }
    text.split(/\r?\n/u).forEach((lineText, index) => {
      for (const match of lineText.matchAll(IGNORE_COMMENT)) result.push({ path: rel, line: index + 1, rule: match[1] });
    });
  }
  return result;
}

function scannerError(reason, raw = null) {
  return { status: "ERROR", classification: "scanner_error", findings: [], raw, reason: String(reason).slice(0, 500) };
}

function spawnFailure(error) {
  if (error?.code === "EPERM" || error?.code === "EACCES") {
    return { status: "ERROR", classification: "execution_environment", findings: [], raw: null, reason: `trivy could not start (${error.code}): execution environment blocks Node child processes; this is not a missing scanner or finding` };
  }
  return scannerError(`spawn error: ${error?.message ?? "unknown error"}`);
}

/** The environment Trivy runs with: the caller's, without any TRIVY_* variable, plus the no-progress switch. */
export function neutralTrivyEnv(env) {
  const clean = Object.fromEntries(Object.entries(env ?? {}).filter(([key]) => !key.toUpperCase().startsWith("TRIVY_")));
  return { ...clean, TRIVY_NO_PROGRESS: "true" };
}

/** Unexpected ERROR/FATAL lines of Trivy's tab-separated stderr log (module header); [] when there is none. */
export function unexpectedErrorLines(stderr) {
  const bad = [];
  for (const line of String(stderr ?? "").split(/\r?\n/u)) {
    const fields = line.split("\t");
    if (fields.length < 3) continue;
    const level = fields[1];
    if (level !== "ERROR" && level !== "FATAL") continue;
    const rest = fields.slice(2).join("\t");
    if (level === "ERROR" && EXPECTED_ERROR.test(rest)) continue;
    const component = rest.match(/^\[([^\]]+)\]/u)?.[1] ?? null;
    const file = rest.match(/file_path="([^"]*)"/u)?.[1] ?? null;
    bad.push(`${level}${component ? ` [${component}]` : ""}${file ? ` ${file}` : ""}: ${fields[2].replace(/^\[[^\]]+\]\s*/u, "").slice(0, 160)}`);
  }
  return bad;
}

/** Trigger files Trivy did not report as a target (module header); [] when every one is covered. */
export function unscannedTriggers(triggers, results) {
  const targets = new Set(results.map((result) => (typeof result?.Target === "string" ? result.Target : "")));
  const terraformTargets = new Set(results.filter((result) => result?.Type === "terraform").map((result) => result.Target));
  const missing = [];
  for (const rel of [...triggers.container, ...triggers.kubernetes]) if (!targets.has(rel)) missing.push(rel);
  for (const rel of triggers.terraform) {
    const dir = posix(dirname(rel));
    const moduleTarget = dir === "." ? "." : dir;
    if (!terraformTargets.has(moduleTarget) && !terraformTargets.has(rel)) missing.push(rel);
  }
  return missing;
}

/** FAIL misconfigurations as findings (module header). */
export function extractTrivyFindings(results) {
  const findings = [];
  for (const result of results) {
    const misconfigurations = Array.isArray(result?.Misconfigurations) ? result.Misconfigurations : [];
    for (const item of misconfigurations) {
      if (item?.Status !== "FAIL") continue;
      const line = item?.CauseMetadata?.StartLine;
      findings.push({
        tool: name,
        severity: SEVERITY_MAP[item?.Severity] ?? "medium",
        rule: typeof item?.ID === "string" && item.ID.length > 0 ? item.ID : "unknown-rule",
        path: typeof result.Target === "string" && result.Target.length > 0 ? result.Target : ".",
        line: Number.isInteger(line) && line >= 1 ? line : null,
        msg: String(item?.Title ?? item?.Message ?? item?.ID ?? "misconfiguration").slice(0, 300),
      });
    }
  }
  return findings;
}

function versionIdentity({ binaryPath, workDir, spawnFn, timeoutMs, env }) {
  let result;
  try { result = spawnFn(binaryPath, ["--version"], { cwd: workDir, encoding: "utf8", timeout: timeoutMs, shell: false, env }); } catch (error) { return { failure: spawnFailure(error) }; }
  if (result.error?.code === "ETIMEDOUT") return { failure: scannerError(`trivy version probe timed out after ${timeoutMs}ms`) };
  if (result.error) return { failure: spawnFailure(result.error) };
  if (result.status !== 0) return { failure: scannerError(`trivy version probe exited ${result.status ?? "unknown"}: ${String(result.stderr ?? "").trim().slice(0, 300)}`, result.stdout ?? null) };
  const version = String(result.stdout ?? "").match(/Version:\s*v?(\d+\.\d+\.\d+)/u)?.[1] ?? null;
  if (version === null) return { failure: scannerError("trivy version probe printed no version", result.stdout ?? null) };
  return { version };
}

export async function run({ rootDir, config = {}, spawnFn = nodeSpawnSync, timeoutMs = 300000, env = process.env, triggerFilesFn = trivyTriggerFiles }) {
  const triggers = config.triggers ?? triggerFilesFn(rootDir);
  if (triggers?.error) return scannerError(`trivy applicability could not be decided: ${triggers.error}`);
  if (triggerCount(triggers) === 0) return { status: "SKIPPED", classification: "success", findings: [], raw: null, reason: TRIVY_NOT_APPLICABLE_REASON };

  const resolved = config.binaryPath ? { installed: true, path: config.binaryPath } : resolveBinary(env);
  if (!resolved.installed) return { status: "SKIPPED", classification: "binary_missing", findings: [], raw: null, reason: resolved.reason };

  const runEnv = neutralTrivyEnv(env);
  let workDir;
  try { workDir = mkdtempSync(pathJoin(config.workParent ?? tmpdir(), "pipeline-trivy-")); } catch (error) { return scannerError(`private work directory could not be created: ${error?.message ?? error}`); }
  try {
    const neutralConfig = pathJoin(workDir, "trivy-neutral.yaml");
    const neutralIgnore = pathJoin(workDir, "trivyignore-neutral");
    writeFileSync(neutralConfig, "{}\n");
    writeFileSync(neutralIgnore, "");
    const identity = versionIdentity({ binaryPath: resolved.path, workDir, spawnFn, timeoutMs, env: runEnv });
    if (identity.failure) return identity.failure;
    const args = ["config", "--format", "json", "--skip-check-update", "--cache-dir", pathJoin(workDir, "cache"), "--exit-code", "0",
      "--config", neutralConfig, "--ignorefile", neutralIgnore, "--severity", "UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL", rootDir];
    let res;
    try { res = spawnFn(resolved.path, args, { cwd: workDir, encoding: "utf8", timeout: timeoutMs, shell: false, env: runEnv, maxBuffer: 64 * 1024 * 1024 }); } catch (error) { return spawnFailure(error); }
    if (res.error?.code === "ETIMEDOUT") return scannerError(`trivy timed out after ${timeoutMs}ms`);
    if (res.error) return spawnFailure(res.error);
    if (res.status !== 0) return scannerError(`trivy exited ${res.status} (only 0 is a valid run with --exit-code 0): ${String(res.stderr ?? "").trim().slice(-300)}`, res.stdout ?? null);
    const stdout = res.stdout ?? "";
    let parsed;
    try { parsed = JSON.parse(stdout); } catch (error) { return scannerError(`unparseable trivy JSON output: ${error.message}`, stdout); }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || parsed.SchemaVersion !== 2) return scannerError(`unexpected trivy JSON shape (SchemaVersion ${JSON.stringify(parsed?.SchemaVersion ?? null)}, expected 2)`, stdout);
    if (Object.hasOwn(parsed, "Results") && !Array.isArray(parsed.Results)) return scannerError("unexpected trivy JSON shape (Results is not an array)", stdout);
    const results = parsed.Results ?? [];
    const errors = unexpectedErrorLines(res.stderr);
    if (errors.length > 0) return scannerError(`trivy reported ${errors.length} error line(s): ${errors.slice(0, 3).join("; ")}`, stdout);
    const missing = unscannedTriggers(triggers, results);
    if (missing.length > 0) return scannerError(`trigger file not scanned by trivy: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ""}`, stdout);
    const findings = extractTrivyFindings(results);
    return {
      status: findings.length > 0 ? "FINDINGS" : "PASS",
      classification: findings.length > 0 ? "findings" : "success",
      findings,
      raw: stdout,
      version: identity.version,
      triggers: { container: triggers.container.length, terraform: triggers.terraform.length, kubernetes: triggers.kubernetes.length },
      inlineIgnores: inlineIgnores(rootDir, triggers),
    };
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* bounded private temp cleanup */ }
  }
}

/** Machine-readable capability contract (CYB-2D shape), read by the v2 evidence builder. */
export const CAPABILITY_CONTRACT_V2 = Object.freeze({
  contractVersion: "v2",
  tool: name,
  kind: "capability",
  capabilityId: "cap.iac",
  controlRef: null,
  supportedEcosystems: Object.freeze(["dockerfile", "terraform", "kubernetes"]),
  supportedEcosystemsNote: "trigger files decided by the Pipeline (trivyTriggerFiles); Trivy's own detection must report every trigger file as a target",
  toolVersionConstraint: "trivy with JSON SchemaVersion 2 (measured on 0.76.2); the version is recorded from `trivy --version`",
  networkBehavior: "offline",
  networkBehaviorNote: "--skip-check-update with an empty private cache: the embedded checks of the binary are used, no download",
  requiredInputs: Object.freeze(["rootDir"]),
  severityNormalization: Object.freeze({ tiers: Object.freeze([Object.freeze({ order: 1, source: "Misconfigurations[].Severity", rule: "CRITICAL/HIGH/MEDIUM/LOW lower-cased; anything else medium" })]) }),
  confidenceNormalization: null,
  coverageLimitations: Object.freeze([
    "Misconfiguration scan of Dockerfile/Containerfile, Terraform and Kubernetes manifests only; container images, Helm charts and templated manifests are not scanned.",
    "SKIPPED (not applicable, no spawn) when the candidate holds no trigger file.",
    "Inline trivy:ignore comments are honoured by Trivy and listed in the evidence; a candidate trivy.yaml, .trivyignore or TRIVY_* variable is never read.",
  ]),
  exitCodeMapping: Object.freeze({ "0": "completed run (--exit-code 0; findings are read from the JSON)", other: "ERROR (scanner_error)" }),
  timeoutContract: Object.freeze({ defaultMs: 300000, cancellable: true, mechanism: "node:child_process spawnSync timeout option (ETIMEDOUT) on the version probe and the scan" }),
  evidenceFields: Object.freeze(["tool", "severity", "rule", "path", "line", "msg"]),
});

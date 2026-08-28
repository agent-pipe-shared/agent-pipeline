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
 * INVOCATION: `gitleaks detect --source <root> --no-git --config <resolved-config-path>
 * --report-format json --report-path <tmp> --no-banner --exit-code 0`. `--config` (PHX-WP-
 * GITLEAKS-RULE-SCOPE) points at a config resolved from THIS MODULE's own on-disk location,
 * never from `rootDir`: the repo-root `.gitleaks.toml` when this module runs from inside the
 * Agent-Pipeline repo's own checkout (self-application scope), else the plugin-shipped default
 * at `config/security/gitleaks-default.toml` (NVA-J-GITLEAKSCONFIG; see
 * `resolveGitleaksConfigPath()` below) -- an installed-plugin deployment ships that file but not
 * the repo root, so it now finds a real config instead of degrading to a blocking ERROR. That
 * config `[extend]`s gitleaks' full built-in ruleset (`useDefault = true`) and adds a narrow,
 * path-scoped allowlist that disables ONLY `sentry-access-token`/`generic-api-key` for
 * `backlog/transitions.ndjson` and `backlog/transitions-phoenix-history.ndjson` (both hash-chained
 * ledgers' bare-hex-digest false positives --
 * backlog/2026-08-08-the-hash-chained-ledger-collides-permanently-with-the-secret-scanner.md;
 * second path added by the Nova/Phoenix merge, VFX3-SECURITY 2026-08-26);
 * every rule stays fully armed, unchanged, everywhere else. `--no-git` makes gitleaks "treat git repo as a regular directory
 * and scan those files" (its own --help wording): a pure filesystem content scan of <root> with
 * ZERO git object/ref/history traversal. This is the architecturally correct scope, not a
 * workaround -- <root> is already an immutable, identity-verified detached snapshot of ONE exact
 * commit's tree (security-scan.mjs's materializeCandidate + candidate.snapshot
 * "git-detached-worktree.v1", verifiedBeforeAfter), so a file-content scan is the literal
 * implementation of the security-evidence schema's `coverage.subject: "candidate-tree"` claim.
 * WITHOUT --no-git, `detect` defaults to mining git HISTORY; because a git worktree shares the
 * main clone's `.git` object database, that traversal reaches EVERY locally fetched branch's
 * commits -- not just the candidate's own ancestry -- producing cross-branch false positives that
 * blocked unrelated branches (root-caused + closed by backlog item
 * 2026-07-25-security-scan-cross-branch-gitleaks-findings, hypothesis 1). Historical /
 * deleted-secret / cross-ancestry mining was never a documented capability of this adapter; it
 * was an accidental default of the bare `detect` invocation, and --no-git removes only that
 * accident (no designed capability is lost). The report is written to a temp JSON file (a fresh
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
 *
 * CAPABILITY_CONTRACT_V2 (CYB-2D, additive): a frozen, machine-readable transcription of the
 * behavior documented above, exported for CYB-2E's later aggregator work to read a uniform
 * capability contract across all four scanner adapters without re-deriving it from prose
 * comments. Purely additive data -- does not change any existing behavior in this file.
 *
 * NEAR-MISS DIAGNOSTIC (NVA-GLFP-1): the `.gitleaksignore` content-v1 authority deliberately binds
 * the exact line (backlog: pipeline.gitleaks-content-fingerprint-breaks-on-any-line-insertion-
 * above-it) -- a digest that ignored position would keep suppressing a rule at a location that no
 * longer holds what was reviewed, so going inert when the line moves is the correct, SAFE
 * direction and stays unchanged here. What changes is legibility only: a blocked finding whose
 * path+rule+column matches an entry recorded at a DIFFERENT line gets an appended, human-readable
 * note in its `msg` naming both lines and the exact `gitleaks-repair-ignore.mjs` command that
 * recomputes the entry in place -- never run automatically, never touching detection. A finding
 * with no entry at that location at all is untouched (still a genuine new finding, exactly as
 * loud as before).
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter as PATH_DELIM, dirname, isAbsolute, join as pathJoin, relative, sep } from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const name = "gitleaks";

const ENV_VAR = "PIPELINE_GITLEAKS_PATH";
const BIN_NAME = "gitleaks";
const WIN_EXTS = [".exe", ".cmd", ".bat"];
const IGNORE_FILE = ".gitleaksignore";
const CONTENT_AUTHORITY_PREFIX = "content-v1:";
const MAX_IGNORE_BYTES = 256 * 1024;

// Fixed, repo-relative gitleaks rule config (PHX-WP-GITLEAKS-RULE-SCOPE): a per-path allowlist
// that disables ONLY `sentry-access-token`/`generic-api-key` for `backlog/transitions.ndjson`
// and `backlog/transitions-phoenix-history.ndjson`
// (see the config file's own header for the full rationale). Resolved from THIS module's own
// on-disk location (`import.meta.url`), never from `rootDir` -- `rootDir` is a detached
// candidate-tree snapshot of the commit under scan (see INVOCATION/--source note above), and the
// config must NOT be sourced from that untrusted, not-yet-approved tree (the same reasoning
// security-scan.mjs already applies to a candidate-supplied manifest path -- a candidate commit
// must never be able to smuggle its own scanner-config override). This adapter file's path is
// fixed at `plugins/pipeline-core/scripts/security-adapters/gitleaks.mjs`, FOUR directories below
// the repo root (VFX-SECURITY, 2026-08-26: corrected from three -- the original PHX-WP-GITLEAKS-
// RULE-SCOPE comment assumed this file's pre-merge Phoenix location,
// `harness/scripts/security-adapters/gitleaks.mjs`, also three directories deep but under a
// different top-level dir; the Nova/Phoenix merge relocated the file one directory deeper without
// updating this arithmetic, so it resolved to `plugins/.gitleaks.toml`, which does not exist), so
// `../../../../.gitleaks.toml` from this file's own directory is the repo root's config,
// regardless of what `rootDir` points at for any given run.
//
// SCOPE + FALLBACK (RW2-GITLEAKSCONFIG 2026-08-27, superseded by NVA-J-GITLEAKSCONFIG
// 2026-08-28): GITLEAKS_CONFIG_PATH resolution is self-application-scoped (ADR-0015) -- it only
// finds `.gitleaks.toml` when this module executes from ITS canonical position inside the
// Agent-Pipeline repo's own checkout, which is where that file actually ships today. A plugin
// distribution/marketplace install that carries only `plugins/` (no repo root, no
// `.gitleaks.toml` alongside it) does not have this file at the resolved path -- previously
// (RW2-GITLEAKSCONFIG) that meant a blocking ERROR (`config_missing`) for every such deployment,
// which is every consumer that installed the plugin rather than cloning this repo
// (backlog/items/2026-08-28-the-push-gate-is-unsatisfiable-in-any-installed-plugin-deployment.md).
// GITLEAKS_PLUGIN_DEFAULT_CONFIG_PATH below is the fix: a second candidate, resolved the same
// self-application way but three directories up (the plugin root) rather than four (the repo
// root), pointing at a config this plugin package ships itself. `resolveGitleaksConfigPath()`
// tries the repo-root path FIRST (preserves this repo's own exact behavior unchanged -- same
// file, same rules) and only falls back to the plugin-shipped default when that is absent. If
// somehow NEITHER resolves, `run()` degrades to SKIPPED (never ERROR; see
// `gitleaksConfigMissingResult()`) rather than blocking a push on a scanner that could not even
// find a ruleset to run -- the same SKIPPED-as-success shape `osv-scanner`/`license-check`
// already use for their own absent-input cases.
const GITLEAKS_CONFIG_PATH = pathJoin(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", ".gitleaks.toml");
// Plugin-shipped default (NVA-J-GITLEAKSCONFIG): three directories up from this module's own
// directory is the plugin root (`plugins/pipeline-core/`), mirroring the exact convention
// `security-scan.mjs`'s `DEFAULT_SEMGREP_RULES_PATH`/`DEFAULT_LICENSE_ALLOWLIST_PATH` already use
// for their own plugin-shipped defaults under `config/security/`. This file is a byte-for-byte
// mirror of the repo-root `.gitleaks.toml` (see that file's own header) -- an installed consumer
// gets the identical ruleset, including the ledger allowlist, which simply never matches
// anything there.
const GITLEAKS_PLUGIN_DEFAULT_CONFIG_PATH = pathJoin(dirname(fileURLToPath(import.meta.url)), "..", "..", "config", "security", "gitleaks-default.toml");

/**
 * Repo-root config first (self-application scope, unchanged priority/behavior for this repo's
 * own checkout), else the plugin-shipped default (NVA-J-GITLEAKSCONFIG), else `null` when
 * neither exists anywhere. NEVER considers `rootDir` -- the candidate tree must not be able to
 * supply its own scanner-config override (see the constants' doc comments above).
 */
export function resolveGitleaksConfigPath() {
  if (existsSync(GITLEAKS_CONFIG_PATH)) return GITLEAKS_CONFIG_PATH;
  if (existsSync(GITLEAKS_PLUGIN_DEFAULT_CONFIG_PATH)) return GITLEAKS_PLUGIN_DEFAULT_CONFIG_PATH;
  return null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalContentFingerprint(finding) {
  const path = finding?.File ?? finding?.file;
  const rule = finding?.RuleID ?? finding?.rule;
  const line = finding?.StartLine ?? finding?.line;
  const column = finding?.StartColumn ?? finding?.column;
  const secret = finding?.Secret ?? finding?.secret;
  if (
    typeof path !== "string" || path.length === 0
    || typeof rule !== "string" || rule.length === 0
    || !Number.isSafeInteger(line) || line < 1
    || !Number.isSafeInteger(column) || column < 1
    || typeof secret !== "string" || secret.length === 0
  ) return null;
  return {
    path,
    rule,
    line,
    column,
    sha256: sha256(`pipeline.gitleaks-content-fingerprint.v1\0${path}\0${rule}\0${line}\0${column}\0${secret}`),
  };
}

export function gitleaksContentAuthorityLine(finding) {
  const fingerprint = canonicalContentFingerprint(finding);
  if (fingerprint === null) return null;
  return `${CONTENT_AUTHORITY_PREFIX}${fingerprint.sha256}:${fingerprint.path}:${fingerprint.rule}:${fingerprint.line}:${fingerprint.column}`;
}

function safeAuthorityPath(path) {
  if (isAbsolute(path) || path.includes("\\") || path.includes("\0")) return false;
  const parts = path.split("/");
  return parts.length > 0 && parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

export function parseContentAuthorityLine(line) {
  if (!line.startsWith(CONTENT_AUTHORITY_PREFIX)) return { kind: "legacy" };
  const match = /^content-v1:([a-f0-9]{64}):(.+):([a-zA-Z0-9][a-zA-Z0-9._-]*):([1-9][0-9]*):([1-9][0-9]*)$/u.exec(line);
  if (!match) return { kind: "invalid" };
  const [, digest, path, rule, lineText, columnText] = match;
  const lineNumber = Number(lineText);
  const column = Number(columnText);
  if (!safeAuthorityPath(path) || !Number.isSafeInteger(lineNumber) || !Number.isSafeInteger(column)) return { kind: "invalid" };
  return { kind: "content", digest, path, rule, line: lineNumber, column };
}

// Near-miss index (NVA-GLFP-1): keyed on path+rule+column WITHOUT the line, so a blocked
// finding whose line moved (e.g. lines inserted above it) can be told apart from a genuine new
// finding. Deliberately does not affect `entries` (the exact-match suppression set) at all --
// this is diagnostic-only and never widens what the scan silently ignores. First-seen line per
// location key wins; a location covered by more than one stale line is a rare edge case left to
// the (also first-match) repair command to report as ambiguous rather than guessed at here.
function locationKeyLessLine(path, rule, column) {
  return `${path}\0${rule}\0${column}`;
}

function loadContentAuthority(rootDir) {
  const path = pathJoin(rootDir, IGNORE_FILE);
  if (!existsSync(path)) return {
    ok: true,
    entries: new Set(),
    linesByLocation: new Map(),
    sha256: null,
    path: IGNORE_FILE,
  };
  try {
    const info = lstatSync(path);
    const physicalRoot = realpathSync(rootDir);
    const physicalPath = realpathSync(path);
    const relativePath = relative(physicalRoot, physicalPath);
    if (
      !info.isFile() || info.isSymbolicLink()
      || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
    ) return { ok: false, reason: `${IGNORE_FILE} must be one physical regular in-root file` };
    const raw = readFileSync(physicalPath);
    if (raw.length > MAX_IGNORE_BYTES) return { ok: false, reason: `${IGNORE_FILE} exceeds ${MAX_IGNORE_BYTES} bytes` };
    const entries = new Set();
    const linesByLocation = new Map();
    for (const rawLine of raw.toString("utf8").split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;
      const parsed = parseContentAuthorityLine(line);
      if (parsed.kind === "invalid") return { ok: false, reason: `${IGNORE_FILE} contains a malformed content-v1 authority` };
      if (parsed.kind !== "content") continue;
      const key = `${parsed.digest}\0${parsed.path}\0${parsed.rule}\0${parsed.line}\0${parsed.column}`;
      if (entries.has(key)) return { ok: false, reason: `${IGNORE_FILE} contains a duplicate content-v1 authority` };
      entries.add(key);
      const locKey = locationKeyLessLine(parsed.path, parsed.rule, parsed.column);
      if (!linesByLocation.has(locKey)) linesByLocation.set(locKey, parsed.line);
    }
    return { ok: true, entries, linesByLocation, sha256: sha256(raw), path: IGNORE_FILE };
  } catch (error) {
    return { ok: false, reason: `${IGNORE_FILE} could not be authenticated: ${error.message}` };
  }
}

// Returns the OTHER recorded line for this finding's path+rule+column, or null when there is
// none (a genuine new finding, per DoD -- must stay silent) or when the recorded line is this
// finding's own current line (an exact match, already suppressed upstream, never reaches here).
function findNearMissLine(linesByLocation, fingerprint) {
  const entryLine = linesByLocation.get(locationKeyLessLine(fingerprint.path, fingerprint.rule, fingerprint.column));
  if (entryLine === undefined || entryLine === fingerprint.line) return null;
  return entryLine;
}

function authorityKey(finding) {
  const fingerprint = canonicalContentFingerprint(finding);
  return fingerprint === null
    ? null
    : `${fingerprint.sha256}\0${fingerprint.path}\0${fingerprint.rule}\0${fingerprint.line}\0${fingerprint.column}`;
}

// Gitleaks reports absolute filesystem paths when scanning the detached candidate snapshot.
// Content-v1 authorities deliberately bind repository-relative paths, so normalize only a
// physical regular candidate descendant before computing that authority key.  External,
// missing, linked, or otherwise ambiguous paths remain untouched and therefore cannot match
// an authority entry.
export function normalizeCandidateFindingPath(finding, rootDir) {
  const field = typeof finding?.File === "string" ? "File" : typeof finding?.file === "string" ? "file" : null;
  if (field === null || !isAbsolute(finding[field])) return finding;
  try {
    const physicalRoot = realpathSync(rootDir);
    const physicalFile = realpathSync(finding[field]);
    const repositoryPath = relative(physicalRoot, physicalFile);
    if (!safeAuthorityPath(repositoryPath)) return finding;
    return { ...finding, [field]: repositoryPath };
  } catch {
    return finding;
  }
}

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

/**
 * Explicit, honest SKIPPED-as-success result for the case where NEITHER the repo-root
 * `.gitleaks.toml` NOR the plugin-shipped default resolved (NVA-J-GITLEAKSCONFIG; supersedes
 * RW2-GITLEAKSCONFIG's ERROR/config_missing behavior): returned by `run()` BEFORE it ever spawns
 * gitleaks. Since the plugin package now ships its own default (GITLEAKS_PLUGIN_DEFAULT_CONFIG_PATH,
 * config/security/gitleaks-default.toml), this branch should be unreachable for any deployment
 * that actually carries `plugins/pipeline-core/` intact -- it exists as a fail-safe for a
 * corrupted/stripped install, not as the normal installed-plugin path. `classification: "success"`
 * is load-bearing exactly as it is for `osv-scanner`/`license-check`'s own absent-input SKIPPED
 * results: without it, security-scan.mjs's `scannerEntry` would default an unclassified SKIPPED
 * to `scanner_error`. SKIPPED never contributes to security-scan.mjs's `hasErrorClass` blocking
 * check (only ERROR does), so this never blocks a push -- the whole point of this fix (a
 * correctly-signed push must be able to land in every installed-plugin deployment). Exported so
 * it is directly unit-testable without needing to fabricate a real missing-file deployment inside
 * this repo's own checkout, where GITLEAKS_CONFIG_PATH always resolves successfully.
 */
export function gitleaksConfigMissingResult(primaryPath, fallbackPath) {
  return {
    status: "SKIPPED",
    classification: "success",
    findings: [],
    raw: null,
    reason: `gitleaks config not found at ${primaryPath} (self-application scope, PHX-WP-GITLEAKS-RULE-SCOPE) or at the plugin-shipped default ${fallbackPath} (NVA-J-GITLEAKSCONFIG) -- resolved relative to this adapter module's own on-disk location, never rootDir; degrading to SKIPPED rather than blocking a push on a scanner that has no ruleset to run (see CAPABILITY_CONTRACT_V2.coverageLimitations)`,
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
  const configPath = resolveGitleaksConfigPath();
  if (configPath === null) {
    return gitleaksConfigMissingResult(GITLEAKS_CONFIG_PATH, GITLEAKS_PLUGIN_DEFAULT_CONFIG_PATH);
  }
  const contentAuthority = loadContentAuthority(rootDir);
  if (!contentAuthority.ok) {
    return {
      status: "ERROR",
      classification: "ignore_authority",
      findings: [],
      raw: null,
      reason: contentAuthority.reason,
    };
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
    "--no-git", // file-content-only scan of the candidate tree; no git history/ref traversal (see header INVOCATION + CAPABILITY_CONTRACT_V2.coverageLimitations)
    "--config",
    configPath, // resolved via resolveGitleaksConfigPath() -- repo-root first, else the plugin-shipped default; never resolved from rootDir
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

  const retained = [];
  let ignoredFindingCount = 0;
  for (const rawFinding of parsed) {
    const finding = normalizeCandidateFindingPath(rawFinding, rootDir);
    const key = authorityKey(finding);
    if (key !== null && contentAuthority.entries.has(key)) ignoredFindingCount++;
    else retained.push(finding);
  }

  const findings = retained.map((f) => {
    const base = {
      tool: name,
      severity: "high", // fixed mapping -- see header (gitleaks has no native severity field)
      rule: f?.RuleID ?? f?.rule ?? "unknown-rule",
      path: f?.File ?? f?.file ?? null,
      line: typeof f?.StartLine === "number" ? f.StartLine : typeof f?.line === "number" ? f.line : null,
      msg: f?.Description ?? f?.description ?? f?.Message ?? "secret detected",
    };
    // Near-miss diagnostic (NVA-GLFP-1): a blocked finding whose path+rule+column matches a
    // .gitleaksignore entry recorded at a DIFFERENT line is very likely that same suppression
    // gone stale (something moved above it), not a genuine new secret. Never auto-repaired --
    // this only names the mismatch and points at the standalone repair command a human runs on
    // request (gitleaks-repair-ignore.mjs). A finding with no entry at this location at all gets
    // none of this and stays exactly as loud as before.
    const fingerprint = canonicalContentFingerprint(f);
    if (fingerprint !== null) {
      const nearMissLine = findNearMissLine(contentAuthority.linesByLocation, fingerprint);
      if (nearMissLine !== null) {
        const repairCmd = `node plugins/pipeline-core/scripts/gitleaks-repair-ignore.mjs --path ${fingerprint.path} --rule ${fingerprint.rule} --column ${fingerprint.column} --old-line ${nearMissLine}`;
        base.msg = `${base.msg} [possibly-stale .gitleaksignore suppression: an entry exists for ${fingerprint.path}:${fingerprint.rule} column ${fingerprint.column} recorded at line ${nearMissLine}, but this finding is now at line ${fingerprint.line} -- likely the suppression just needs its line updated, not a new secret. Repair: ${repairCmd}]`;
      }
    }
    return base;
  });

  return {
    status: findings.length > 0 ? "FINDINGS" : "PASS",
    classification: findings.length > 0 ? "findings" : "success",
    findings,
    raw,
    ignored: {
      policy: "pipeline.gitleaks-content-fingerprint.v1",
      authorityPath: contentAuthority.path,
      authoritySha256: contentAuthority.sha256,
      findingCount: ignoredFindingCount,
    },
  };
}

/**
 * CAPABILITY_CONTRACT_V2 -- machine-readable capability-contract descriptor (CYB-2D). A pure,
 * static, additive transcription of behavior this file already has and already documents in
 * its header comment above -- consumed by CYB-2E's later aggregator work to read a uniform
 * capability contract across all four adapters without re-deriving it from prose. Adding this
 * export changes none of `run()`/`isInstalled()`'s existing behavior.
 */
export const CAPABILITY_CONTRACT_V2 = Object.freeze({
  contractVersion: "v2",
  tool: name,
  kind: "capability",
  capabilityId: "cap.secrets",
  controlRef: null,
  supportedEcosystems: null,
  toolVersionConstraint: null,
  networkBehavior: "offline",
  requiredInputs: ["rootDir"],
  severityNormalization: Object.freeze({
    source: "fixed",
    value: "high",
    rationale: "gitleaks findings carry no native severity field",
  }),
  confidenceNormalization: null,
  coverageLimitations: Object.freeze([
    "A fixed `--config <repo-root>/.gitleaks.toml` is always passed to `detect` (PHX-WP-GITLEAKS-RULE-SCOPE), resolved from this adapter module's own on-disk location, never from rootDir (the candidate tree must never supply its own scanner-config override). That config extends gitleaks' full built-in default ruleset (`useDefault = true`) unchanged and adds exactly one narrow, path-scoped allowlist: `sentry-access-token` and `generic-api-key` are disabled ONLY for `backlog/transitions.ndjson` and `backlog/transitions-phoenix-history.ndjson` (both hash-chained ledgers' bare-64-hex-digest false positives; the second path was added by the Nova/Phoenix merge, VFX3-SECURITY 2026-08-26); every other rule, and this rule pair on every other path, remains fully armed and unmodified.",
    "`--no-git` is passed to `detect`, so the scan is a pure filesystem content scan of rootDir (gitleaks' own --help wording: \"treat git repo as a regular directory and scan those files\") with ZERO git object/ref/history traversal. rootDir is an immutable, identity-verified single-commit-tree snapshot (security-scan.mjs materializeCandidate, git-detached-worktree.v1), so this is the literal `candidate-tree` coverage the security-evidence schema claims. Historical / deleted-secret / cross-ancestry mining is deliberately NOT performed: it was never a documented capability of this adapter and, because a git worktree shares the main clone's `.git` object database, that default `detect` traversal was the source of cross-branch false positives (backlog 2026-07-25-security-scan-cross-branch-gitleaks-findings).",
    "Single-shot, full scan per invocation -- no --baseline-path or other incremental/diff mechanism; every run() call re-scans the entirety of rootDir from scratch.",
    "GITLEAKS_CONFIG_PATH resolution is self-application-scoped (ADR-0015): the repo-root .gitleaks.toml is only found when this module executes from its canonical position inside the Agent-Pipeline repo's own checkout. A plugin-only distribution/marketplace install (no repo root) instead resolves GITLEAKS_PLUGIN_DEFAULT_CONFIG_PATH, a byte-for-byte mirror of that same config shipped inside the plugin package itself (config/security/gitleaks-default.toml, NVA-J-GITLEAKSCONFIG) -- so an installed deployment now finds a real ruleset and scans normally. Only if NEITHER resolves does run() degrade to a SKIPPED/success result before ever spawning gitleaks (gitleaksConfigMissingResult) rather than a blocking ERROR -- the same SKIPPED-as-success shape osv-scanner/license-check already use for their own absent-input cases; this is a fail-safe for a corrupted/stripped install, not the normal installed-plugin path.",
  ]),
  exitCodeMapping: Object.freeze({
    "0": "always -- status derived from parsed report content, never from exit code (forced via --exit-code 0)",
    nonzero: "scanner_error (ERROR) -- genuine crash, never findings",
  }),
  timeoutContract: Object.freeze({
    defaultMs: 60000,
    cancellable: true,
    mechanism: "node:child_process spawnSync timeout option (SIGTERM on expiry)",
  }),
  evidenceFields: Object.freeze(["tool", "severity", "rule", "path", "line", "msg"]),
});

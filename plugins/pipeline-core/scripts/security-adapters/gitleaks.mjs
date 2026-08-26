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
 * INVOCATION: `gitleaks detect --source <root> --no-git --config <repo-root>/.gitleaks.toml
 * --report-format json --report-path <tmp> --no-banner --exit-code 0`. `--config` (PHX-WP-
 * GITLEAKS-RULE-SCOPE) always points at the fixed, repo-root `.gitleaks.toml` resolved from THIS
 * MODULE's own on-disk location (see `GITLEAKS_CONFIG_PATH` below), never from `rootDir` -- that
 * file `[extend]`s gitleaks' full built-in ruleset (`useDefault = true`) and adds a narrow,
 * path-scoped allowlist that disables ONLY `sentry-access-token`/`generic-api-key` for
 * `backlog/transitions.ndjson` (the hash-chained ledger's bare-hex-digest false positives --
 * backlog/2026-08-08-the-hash-chained-ledger-collides-permanently-with-the-secret-scanner.md);
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
const GITLEAKS_CONFIG_PATH = pathJoin(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", ".gitleaks.toml");

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

function parseContentAuthorityLine(line) {
  if (!line.startsWith(CONTENT_AUTHORITY_PREFIX)) return { kind: "legacy" };
  const match = /^content-v1:([a-f0-9]{64}):(.+):([a-zA-Z0-9][a-zA-Z0-9._-]*):([1-9][0-9]*):([1-9][0-9]*)$/u.exec(line);
  if (!match) return { kind: "invalid" };
  const [, digest, path, rule, lineText, columnText] = match;
  const lineNumber = Number(lineText);
  const column = Number(columnText);
  if (!safeAuthorityPath(path) || !Number.isSafeInteger(lineNumber) || !Number.isSafeInteger(column)) return { kind: "invalid" };
  return { kind: "content", digest, path, rule, line: lineNumber, column };
}

function loadContentAuthority(rootDir) {
  const path = pathJoin(rootDir, IGNORE_FILE);
  if (!existsSync(path)) return {
    ok: true,
    entries: new Set(),
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
    for (const rawLine of raw.toString("utf8").split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;
      const parsed = parseContentAuthorityLine(line);
      if (parsed.kind === "invalid") return { ok: false, reason: `${IGNORE_FILE} contains a malformed content-v1 authority` };
      if (parsed.kind !== "content") continue;
      const key = `${parsed.digest}\0${parsed.path}\0${parsed.rule}\0${parsed.line}\0${parsed.column}`;
      if (entries.has(key)) return { ok: false, reason: `${IGNORE_FILE} contains a duplicate content-v1 authority` };
      entries.add(key);
    }
    return { ok: true, entries, sha256: sha256(raw), path: IGNORE_FILE };
  } catch (error) {
    return { ok: false, reason: `${IGNORE_FILE} could not be authenticated: ${error.message}` };
  }
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
function normalizeCandidateFindingPath(finding, rootDir) {
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
    GITLEAKS_CONFIG_PATH, // repo-fixed rule config -- see GITLEAKS_CONFIG_PATH doc comment above; never resolved from rootDir
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

  const findings = retained.map((f) => ({
    tool: name,
    severity: "high", // fixed mapping -- see header (gitleaks has no native severity field)
    rule: f?.RuleID ?? f?.rule ?? "unknown-rule",
    path: f?.File ?? f?.file ?? null,
    line: typeof f?.StartLine === "number" ? f.StartLine : typeof f?.line === "number" ? f.line : null,
    msg: f?.Description ?? f?.description ?? f?.Message ?? "secret detected",
  }));

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
    "A fixed `--config <repo-root>/.gitleaks.toml` is always passed to `detect` (PHX-WP-GITLEAKS-RULE-SCOPE), resolved from this adapter module's own on-disk location, never from rootDir (the candidate tree must never supply its own scanner-config override). That config extends gitleaks' full built-in default ruleset (`useDefault = true`) unchanged and adds exactly one narrow, path-scoped allowlist: `sentry-access-token` and `generic-api-key` are disabled ONLY for `backlog/transitions.ndjson` (the hash-chained ledger's bare-64-hex-digest false positives); every other rule, and this rule pair on every other path, remains fully armed and unmodified.",
    "`--no-git` is passed to `detect`, so the scan is a pure filesystem content scan of rootDir (gitleaks' own --help wording: \"treat git repo as a regular directory and scan those files\") with ZERO git object/ref/history traversal. rootDir is an immutable, identity-verified single-commit-tree snapshot (security-scan.mjs materializeCandidate, git-detached-worktree.v1), so this is the literal `candidate-tree` coverage the security-evidence schema claims. Historical / deleted-secret / cross-ancestry mining is deliberately NOT performed: it was never a documented capability of this adapter and, because a git worktree shares the main clone's `.git` object database, that default `detect` traversal was the source of cross-branch false positives (backlog 2026-07-25-security-scan-cross-branch-gitleaks-findings).",
    "Single-shot, full scan per invocation -- no --baseline-path or other incremental/diff mechanism; every run() call re-scans the entirety of rootDir from scratch.",
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

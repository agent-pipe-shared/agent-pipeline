#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-protected-path-integrity -- Stage 1 (detection only) of NVA-R10-PROTPATH.
 *
 * WHY THIS EXISTS
 *   backlog/items/2026-08-29-a-node-script-defeats-every-file-protection-guard.md: every
 *   file-protection guard in this repository (`guard-gate-strength.mjs`, `guard-testpath.mjs`,
 *   `guard-lifecycle-ready.mjs`'s shell grammar) is a PreToolUse hook that inspects the TEXT of
 *   an Edit/Write/Bash tool call. None of them can see a syscall issued by a process the guard
 *   already approved the launch of -- a spawned `node <script>.mjs` calling `fs.writeFileSync`
 *   directly against a protected path lands unobserved, regression-free, and unlogged.
 *
 *   This module is Layer 1 of the item's two-layer proposal: a mechanism-blind, content-digest
 *   baseline over every currently protected path, and a comparison that reports a typed, loud
 *   finding (`FINDING_CODE` below) when a digest changed with no matching CONSUMED
 *   human-guard-override capability covering that exact path. It is detection, not enforcement
 *   -- nothing here blocks a tool call or a commit. Layer 2 (a git `pre-commit` hook that
 *   actually refuses such a commit) is explicitly out of scope for this dispatch and is a
 *   separate, later task; see the backlog item's own "Stage 1 landed" section for the record.
 *
 * PROTECTED-PATH SOURCE OF TRUTH (never a second hand-maintained list, per the item's own
 * acceptance bar)
 *   - Gate-strength paths: `GATE_STRENGTH_PATHS`, imported directly from
 *     `../hooks/guard-gate-strength.mjs` -- the same array that guard already enforces against.
 *   - Test-path patterns: `loadProtectedTestPathRules()`, imported from
 *     `../lib/protected-test-paths.mjs` -- the same parser `guard-testpath.mjs` and the shell
 *     lane in `guard-lifecycle-ready.mjs` both already share.
 *   Test-path rules are regex SUFFIX patterns, not concrete paths, so covering them needs a
 *   directory walk (`walkFiles` below) rather than a plain `existsSync` per entry; that walk is
 *   exactly how a NEWLY protected path (a rule added to the same source of truth) is picked up
 *   the day it is protected, with no second list to remember to update.
 *
 * DELIBERATE SCOPE NARROWING (disclosed, not silent)
 *   - `GS-6` (`LIVE_PLUGIN_RULE`, the "whichever plugin root is currently enforcing" rule) is
 *     NOT baselined here: it names an entire live source tree under active development, not a
 *     discrete file, and content-digesting all of it would both explode this baseline's size and
 *     misclassify ordinary in-flight development as tampering. `GS-15`
 *     (`project/.onboarding-staging/*`) IS expanded (every file currently under that directory,
 *     if it exists), because it is a bounded, concrete subtree rather than "wherever the
 *     enforcing code happens to live right now".
 *   - The test-path directory walk excludes `.git`, `node_modules`, and `.claude/worktrees`
 *     (`DEFAULT_EXCLUDED_RELATIVE_DIRS`) -- the first two are never source, and the third is a
 *     pool of separate, independently-git-tracked worktree checkouts in THIS repository, each of
 *     which would otherwise contribute its own (spurious, out-of-scope) copy of every protected
 *     suite to the walk.
 *
 * CONSUMED-CAPABILITY CHECK
 *   `defaultHasConsumedCapabilityForPath()` reads
 *   `<git-common-dir>/agent-pipeline/human-guard-overrides/capabilities/*.json` directly (the
 *   same storage layout `human-guard-override.mjs` writes, read here rather than imported from
 *   there because that module exports no query-by-path helper and reworking its own internals is
 *   out of this dispatch's scope) and treats a path as authorized only when some capability file
 *   has `status: "consumed"`, an `eligiblePaths` entry matching it exactly, AND -- when the
 *   capability record carries an `expiresAt` (it does, per `human-guard-override.mjs`'s
 *   `CAPABILITY_KEYS`/consumption path) -- that `expiresAt` has not already passed relative to
 *   the current check time. A `status: "consumed"` record is otherwise permanent: the ceremony
 *   consumes it once, but nothing previously re-checked its own recorded expiry afterward, so one
 *   legitimate ceremony would silently authorize every later write to that same path forever. This
 *   narrows only that "forever" part of the gap -- it is NOT full per-change binding (tying an
 *   override to one specific diff/hash), which stays a separate, harder design question. Any read
 *   failure (missing directory, corrupt JSON, unresolved git-common-dir) is treated as NOT
 *   consumed -- fail toward reporting the finding, never toward silently swallowing a real change,
 *   matching this guard family's own asymmetric fail posture on the side that actually matters
 *   here.
 *
 * PERSISTENCE
 *   A baseline is NOT committed tracked state (ADR-0063 would put durable, gate-cited evidence
 *   under `backlog/evidence/`, but a content-digest baseline is neither durable across commits
 *   nor should it be reviewed as prose -- it is local session state). It is written under
 *   `<git-common-dir>/agent-pipeline/protected-path-integrity/baseline.json`, the identical
 *   arrangement `pre-push-hook-install.mjs` already uses for its own install marker.
 *
 * CLI
 *   node check-protected-path-integrity.mjs record   -- (re)write the baseline for the current
 *                                                        working tree.
 *   node check-protected-path-integrity.mjs compare  -- compare the current tree against the
 *                                                        last recorded baseline; exit 1 on any
 *                                                        finding, exit 3 if no baseline exists.
 *   Append --json to either verb for machine-readable output.
 *
 * VERIFY: node --test plugins/pipeline-core/scripts/check-protected-path-integrity.test.mjs
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { GATE_STRENGTH_PATHS } from "../hooks/guard-gate-strength.mjs";
import { loadProtectedTestPathRules, protectedTestPathRuleFor } from "../lib/protected-test-paths.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const BASELINE_SCHEMA = "pipeline.protected-path-integrity.v1";
/** The item's own `done_when` predicate needle -- kept as a standalone literal so `rg` (and the
 * predicate checker) finds it independently of BASELINE_SCHEMA's own spelling. */
export const FINDING_CODE = "pipeline.protected-path-integrity";
export const DEFAULT_EXCLUDED_RELATIVE_DIRS = Object.freeze([".git", "node_modules", ".claude/worktrees"]);

// ---------------------------------------------------------------------------------
// Directory walk (test-path regex patterns need this; gate-strength paths are concrete)
// ---------------------------------------------------------------------------------

function isExcludedRelativeDir(relPosix, excludedRelativeDirs) {
  return excludedRelativeDirs.some((ex) => relPosix === ex || relPosix.startsWith(`${ex}/`));
}

/** Every FILE under `root`, as repo-relative forward-slashed paths, skipping `excludedRelativeDirs`. */
export function walkFiles(root, { excludedRelativeDirs = DEFAULT_EXCLUDED_RELATIVE_DIRS } = {}) {
  const rootResolved = resolve(root);
  const results = [];
  const recurse = (absDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // unreadable directory -- nothing to contribute, never fatal
    }
    for (const entry of entries) {
      const abs = join(absDir, entry.name);
      const relPosix = relative(rootResolved, abs).split(sep).join("/");
      if (entry.isDirectory()) {
        if (isExcludedRelativeDir(relPosix, excludedRelativeDirs)) continue;
        recurse(abs);
      } else if (entry.isFile()) {
        results.push(relPosix);
      }
    }
  };
  recurse(rootResolved);
  return results.sort((left, right) => left.localeCompare(right));
}

// ---------------------------------------------------------------------------------
// Enumeration (the actual source of truth, never a second hand-maintained list)
// ---------------------------------------------------------------------------------

/** Concrete gate-strength-protected files that currently exist under `rootDir`. GS-15's `/*`
 * glob is expanded into every file currently under that subtree; `LIVE_PLUGIN_RULE` (GS-6) is
 * deliberately never included -- see this file's header, "DELIBERATE SCOPE NARROWING". */
export function enumerateGateStrengthProtectedPaths({ rootDir, gateStrengthPaths = GATE_STRENGTH_PATHS } = {}) {
  const rootResolved = resolve(rootDir);
  const out = [];
  for (const rule of gateStrengthPaths) {
    if (typeof rule?.path !== "string") continue;
    if (rule.path.endsWith("/*")) {
      const prefix = rule.path.slice(0, -2);
      const abs = join(rootResolved, prefix);
      if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
      for (const relPosix of walkFiles(abs, { excludedRelativeDirs: [] })) {
        out.push({ id: rule.id, path: `${prefix}/${relPosix}`, reason: rule.reason, source: "gate-strength" });
      }
      continue;
    }
    const abs = join(rootResolved, rule.path);
    let info;
    try {
      info = statSync(abs);
    } catch {
      continue; // not present in this project -- nothing to baseline
    }
    if (!info.isFile()) continue;
    out.push({ id: rule.id, path: rule.path, reason: rule.reason, source: "gate-strength" });
  }
  return out;
}

/** Every file under `rootDir` (outside the excluded dirs) whose path matches a configured
 * test-path rule. `rules` is the already-parsed `{id, re, reason}` array from
 * `loadProtectedTestPathRules()` (or a synthetic fixture array in a test). */
export function enumerateTestPathProtectedPaths({ rootDir, rules, excludedRelativeDirs = DEFAULT_EXCLUDED_RELATIVE_DIRS } = {}) {
  if (!Array.isArray(rules) || rules.length === 0) return [];
  const rootResolved = resolve(rootDir);
  const out = [];
  for (const relPosix of walkFiles(rootResolved, { excludedRelativeDirs })) {
    const rule = protectedTestPathRuleFor(rules, relPosix);
    if (rule) out.push({ id: rule.id, path: relPosix, reason: rule.reason, source: "testpath" });
  }
  return out;
}

/** The combined, de-duplicated (first-match-wins, by path) protected-path set. */
export function enumerateProtectedPaths({
  rootDir,
  gateStrengthPaths = GATE_STRENGTH_PATHS,
  testPathRules,
  excludedRelativeDirs = DEFAULT_EXCLUDED_RELATIVE_DIRS,
} = {}) {
  const rules = testPathRules ?? loadProtectedTestPathRules({ rootDir }).rules;
  const gate = enumerateGateStrengthProtectedPaths({ rootDir, gateStrengthPaths });
  const testpath = enumerateTestPathProtectedPaths({ rootDir, rules, excludedRelativeDirs });
  const seen = new Map();
  for (const entry of [...gate, ...testpath]) {
    if (!seen.has(entry.path)) seen.set(entry.path, entry);
  }
  return [...seen.values()].sort((left, right) => left.path.localeCompare(right.path));
}

// ---------------------------------------------------------------------------------
// Digests + baseline
// ---------------------------------------------------------------------------------

/** sha256 hex of a file's current bytes, or `null` when it is missing/unreadable (a removed
 * protected file is itself a change worth reporting, not a crash). */
export function sha256Of(absPath) {
  try {
    return createHash("sha256").update(readFileSync(absPath)).digest("hex");
  } catch {
    return null;
  }
}

export function buildBaseline({ rootDir, entries }) {
  const rootResolved = resolve(rootDir);
  return {
    schema: BASELINE_SCHEMA,
    generatedAt: new Date().toISOString(),
    root: rootResolved,
    entries: entries.map((entry) => ({
      id: entry.id,
      path: entry.path,
      reason: entry.reason,
      source: entry.source,
      sha256: sha256Of(join(rootResolved, entry.path)),
    })),
  };
}

// ---------------------------------------------------------------------------------
// Persistence -- <git-common-dir>/agent-pipeline/protected-path-integrity/baseline.json,
// the same arrangement pre-push-hook-install.mjs already uses for its own marker.
// ---------------------------------------------------------------------------------

export function resolveGitCommonDir(rootDir) {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: rootDir, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return null;
  }
}

export function defaultBaselinePath(rootDir) {
  const commonDir = resolveGitCommonDir(rootDir);
  if (!commonDir) return null;
  return join(commonDir, "agent-pipeline", "protected-path-integrity", "baseline.json");
}

export function readBaseline(baselinePath) {
  try {
    return JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch {
    return null;
  }
}

/** Writes a fresh baseline for `rootDir`'s current tree. */
export function recordBaseline({
  rootDir = DEFAULT_ROOT,
  baselinePath,
  gateStrengthPaths,
  testPathRules,
  excludedRelativeDirs,
} = {}) {
  const path = baselinePath ?? defaultBaselinePath(rootDir);
  if (!path) return { status: "repository-unresolved" };
  const entries = enumerateProtectedPaths({ rootDir, gateStrengthPaths, testPathRules, excludedRelativeDirs });
  const baseline = buildBaseline({ rootDir, entries });
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { status: "recorded", path, baseline };
}

// ---------------------------------------------------------------------------------
// Consumed human-guard-override capability lookup (see file header)
// ---------------------------------------------------------------------------------

export function defaultHasConsumedCapabilityForPath(rootDir, targetPath, { now = Date.now() } = {}) {
  const commonDir = resolveGitCommonDir(rootDir);
  if (!commonDir) return false;
  const capsDir = join(commonDir, "agent-pipeline", "human-guard-overrides", "capabilities");
  let names;
  try {
    names = readdirSync(capsDir);
  } catch {
    return false;
  }
  const normalizedTarget = String(targetPath).replace(/\\/gu, "/");
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    let capability;
    try {
      capability = JSON.parse(readFileSync(join(capsDir, name), "utf8"));
    } catch {
      continue; // unreadable/corrupt capability file -- not a match
    }
    if (capability?.status !== "consumed" || !Array.isArray(capability?.eligiblePaths)) continue;
    if (!capability.eligiblePaths.some((entry) => String(entry).replace(/\\/gu, "/") === normalizedTarget)) continue;
    // A recorded expiresAt that has already passed does NOT authorize a later write, even though
    // the ceremony itself was legitimately consumed -- see file header, "CONSUMED-CAPABILITY
    // CHECK". A capability with no expiresAt at all (absent/unparseable) is not narrowed by this
    // check and keeps its prior (permanent) behavior, matching this function's existing
    // fail-toward-reporting posture: an unparseable date fails the `<=` comparison and the
    // capability is treated as never expiring, exactly like today. Only a well-formed, PAST
    // expiresAt now excludes the match.
    if (typeof capability.expiresAt === "string") {
      const expiresAtMs = Date.parse(capability.expiresAt);
      if (!Number.isNaN(expiresAtMs) && expiresAtMs <= now) continue;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------
// Comparison -- the actual detection
// ---------------------------------------------------------------------------------

/**
 * Compares the current tree against the last recorded baseline. For every baselined path whose
 * digest has changed AND for which `hasConsumedCapabilityForPath` reports no matching consumed
 * capability, a typed finding (`FINDING_CODE`) is produced naming the path and both digests.
 *
 * A protected path added to the source of truth SINCE the baseline was last recorded is not, by
 * itself, a finding here -- it has no prior digest to compare against. `recordBaseline()` picks
 * it up the next time it runs (see file header); comparison only ever judges paths the baseline
 * already knows about.
 */
export function compareAgainstBaseline({
  rootDir = DEFAULT_ROOT,
  baselinePath,
  hasConsumedCapabilityForPath = defaultHasConsumedCapabilityForPath,
} = {}) {
  const path = baselinePath ?? defaultBaselinePath(rootDir);
  if (!path) return { status: "repository-unresolved", ok: false, findings: [] };
  const baseline = readBaseline(path);
  if (!baseline) return { status: "no-baseline", ok: false, findings: [], baselinePath: path };
  const rootResolved = resolve(rootDir);
  const findings = [];
  for (const entry of baseline.entries) {
    const currentSha256 = sha256Of(join(rootResolved, entry.path));
    if (currentSha256 === entry.sha256) continue;
    if (hasConsumedCapabilityForPath(rootDir, entry.path)) continue;
    findings.push({
      code: FINDING_CODE,
      id: entry.id,
      path: entry.path,
      reason: entry.reason,
      baselineSha256: entry.sha256,
      currentSha256,
    });
  }
  return {
    status: "ok",
    ok: findings.length === 0,
    findings,
    checked: baseline.entries.length,
    baselinePath: path,
    baselineGeneratedAt: baseline.generatedAt,
  };
}

// ---------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------

function main(argv) {
  const [verb] = argv;
  const json = argv.includes("--json");
  if (verb === "record") {
    const result = recordBaseline({ rootDir: DEFAULT_ROOT });
    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (result.status === "recorded") {
      process.stdout.write(`recorded baseline for ${result.baseline.entries.length} protected path(s) at ${result.path}\n`);
    } else {
      process.stderr.write(`could not record a baseline: ${result.status}\n`);
    }
    return result.status === "recorded" ? 0 : 3;
  }
  if (verb === "compare") {
    const result = compareAgainstBaseline({ rootDir: DEFAULT_ROOT });
    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (result.status === "no-baseline" || result.status === "repository-unresolved") {
      process.stderr.write(`no baseline to compare against (${result.status}) -- run "record" first\n`);
    } else {
      process.stdout.write(`checked ${result.checked} protected path(s); findings: ${result.findings.length}\n`);
      for (const finding of result.findings) {
        process.stdout.write(`  - ${finding.code} ${finding.id} ${finding.path}: baseline=${finding.baselineSha256} current=${finding.currentSha256}\n`);
      }
    }
    if (result.status === "no-baseline" || result.status === "repository-unresolved") return 3;
    return result.ok ? 0 : 1;
  }
  process.stderr.write("usage: check-protected-path-integrity.mjs record|compare [--json]\n");
  return 2;
}

if (isDirectInvocation(import.meta.url)) process.exit(main(process.argv.slice(2)));

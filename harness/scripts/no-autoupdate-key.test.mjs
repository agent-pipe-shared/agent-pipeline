#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * no-autoupdate-key.test.mjs -- R9 regression guard: no git-tracked settings.json
 * anywhere in this repo may carry a committed `autoUpdate` key, at any nesting
 * depth. A committed `autoUpdate` key is a rollback the canon explicitly rejected --
 * see docs/adr/0001-distribution-plugin-marketplace.md, section "## Addendum
 * (2026-07-11): install-scope canonicalization + auto-update posture", decision D2
 * ("No committed `autoUpdate` flag; the canon stays detect-and-prompt.").
 *
 * This file IS the guard: hasAutoUpdateKey() below is the pure detection function
 * (recursive, any nesting depth, exact key match). The case list both self-checks
 * that function against in-memory fixtures (never touches a real settings.json)
 * and scans every git-tracked *settings.json for a real regression.
 *
 * Convention: same plain-assertion + PASS/FAIL console output + "N/N cases passed."
 * summary as harness/scripts/validate-manifest.test.mjs and
 * plugins/pipeline-core/hooks/guard-git.test.mjs (record()/pass counter/failures
 * array pattern).
 *
 * Run:   node harness/scripts/no-autoupdate-key.test.mjs
 * Exit:  0 = all cases pass (no committed autoUpdate key found) · 1 = at least one
 *        case failed (failure list on stdout).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

let pass = 0;
const failures = [];
function record(id, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${id} -- ${detail}`);
  }
}

// =============================================================================================
// Detection logic (pure functions) -- the actual regression guard.
// =============================================================================================

/**
 * findAutoUpdateKeyPaths(value, prefix) -- recursively walks a parsed-JSON value
 * (objects and arrays) and returns the dotted/bracketed path(s) at which a key
 * exactly named "autoUpdate" was found, at any nesting depth. [] when nothing
 * found. Pure: no I/O, no mutation, never throws on primitives/null.
 */
function findAutoUpdateKeyPaths(value, prefix = "") {
  const hits = [];
  if (value === null || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      hits.push(...findAutoUpdateKeyPaths(item, `${prefix}[${index}]`));
    });
    return hits;
  }
  for (const key of Object.keys(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (key === "autoUpdate") hits.push(path);
    hits.push(...findAutoUpdateKeyPaths(value[key], path));
  }
  return hits;
}

/**
 * hasAutoUpdateKey(value) -- true iff `value` (parsed JSON) contains a key
 * exactly named "autoUpdate" anywhere in its object/array structure, at any
 * nesting depth. Pure predicate built on findAutoUpdateKeyPaths.
 */
function hasAutoUpdateKey(value) {
  return findAutoUpdateKeyPaths(value).length > 0;
}

/**
 * isTrackedSettingsPath(rawLine) -- pure filter predicate: true iff a single
 * `git ls-files` output line (after trimming) names a path ending in literal
 * "settings.json" (catches `.claude/settings.json` in the root plus any nested
 * or example/template settings.json files). Untracked/ignored files such as
 * `settings.local.json` never reach this filter in the first place (git
 * ls-files only lists tracked paths) -- and would not match the literal suffix
 * either, since "settings.local.json" does not end with "settings.json".
 */
function isTrackedSettingsPath(rawLine) {
  const line = rawLine.trim();
  if (line.length === 0) return false;
  return line.endsWith("settings.json");
}

/**
 * FALLBACK -- the fixed candidate list trackedSettingsPaths() falls back to when
 * `git ls-files` is unavailable. Module-level (not function-local) so the
 * superset-invariant self-check below can reference it directly: if a new tracked
 * settings.json-named file is ever added while git ls-files happens to be
 * unavailable, this list needs updating too -- otherwise the fallback scan would
 * silently narrow instead of catching a real regression.
 */
const FALLBACK = [".claude/settings.json"];

/**
 * trackedSettingsPaths(repoRoot) -- git-tracked, repo-relative paths ending in
 * "settings.json" as reported by `git ls-files` (read-only). Falls back to a
 * fixed single-path list (`.claude/settings.json`) if `git ls-files` itself is
 * unavailable (missing git binary, not a git repo, non-zero exit, ...) -- never
 * throws. Returns { paths, usedFallback, notice }; `notice` is a human-readable
 * string to surface on stdout when the fallback path was taken, else null.
 */
function trackedSettingsPaths(repoRoot) {
  let res;
  try {
    res = spawnSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  } catch (err) {
    return {
      paths: FALLBACK,
      usedFallback: true,
      notice: `git ls-files threw (${err.message}) -- falling back to fixed list: ${FALLBACK.join(", ")}`,
    };
  }
  if (!res || res.error || typeof res.status !== "number" || res.status !== 0) {
    const reason = res?.error?.message ?? `exit ${res?.status}`;
    return {
      paths: FALLBACK,
      usedFallback: true,
      notice: `git ls-files unavailable (${reason}) -- falling back to fixed list: ${FALLBACK.join(", ")}`,
    };
  }
  const paths = res.stdout.split(/\r?\n/).filter(isTrackedSettingsPath).map((line) => line.trim());
  return { paths, usedFallback: false, notice: null };
}

// =============================================================================================
// Self-check: hasAutoUpdateKey/findAutoUpdateKeyPaths against in-memory fixtures only.
// Proves an injected autoUpdate key WOULD be caught -- no real settings.json is touched here.
// =============================================================================================

record(
  "SELF-CHECK top-level autoUpdate key is detected",
  hasAutoUpdateKey({ autoUpdate: true }) === true,
  `expected true, got ${hasAutoUpdateKey({ autoUpdate: true })}`,
);

record(
  "SELF-CHECK autoUpdate key nested several levels deep (object-in-object) is detected",
  hasAutoUpdateKey({ plugins: { "pipeline-core": { config: { autoUpdate: false } } } }) === true,
  "expected true for a 3-levels-deep nested autoUpdate key",
);

record(
  "SELF-CHECK autoUpdate key nested inside an array element is detected",
  hasAutoUpdateKey({ marketplaces: [{ name: "x" }, { name: "y", autoUpdate: true }] }) === true,
  "expected true for autoUpdate nested inside an array element",
);

record(
  "SELF-CHECK a realistic settings.json shape WITHOUT autoUpdate returns false",
  hasAutoUpdateKey({
    statusLine: { type: "command", command: "node plugins/pipeline-core/scripts/statusline-context.mjs" },
    permissions: { allow: ["Bash(git push*)"] },
    extraKnownMarketplaces: { "agent-pipeline": { source: { source: "github", repo: "example-org/agent-pipeline" } } },
    enabledPlugins: { "pipeline-core@agent-pipeline": true },
  }) === false,
  "expected false for a realistic settings.json shape without autoUpdate",
);

record(
  "SELF-CHECK primitives/null/plain-arrays never crash and report false",
  hasAutoUpdateKey(null) === false &&
    hasAutoUpdateKey("autoUpdate") === false &&
    hasAutoUpdateKey(42) === false &&
    hasAutoUpdateKey([1, 2, 3]) === false &&
    hasAutoUpdateKey(undefined) === false,
  "expected false for null/string/number/plain-array/undefined inputs",
);

record(
  "SELF-CHECK findAutoUpdateKeyPaths reports the exact key path for a nested hit",
  JSON.stringify(findAutoUpdateKeyPaths({ a: { b: [{ autoUpdate: true }] } })) === JSON.stringify(["a.b[0].autoUpdate"]),
  `got ${JSON.stringify(findAutoUpdateKeyPaths({ a: { b: [{ autoUpdate: true }] } }))}`,
);

record(
  "SELF-CHECK findAutoUpdateKeyPaths reports ALL hits when the key appears more than once",
  JSON.stringify(findAutoUpdateKeyPaths({ a: { autoUpdate: 1 }, b: [{ autoUpdate: 2 }] }).sort()) ===
    JSON.stringify(["a.autoUpdate", "b[0].autoUpdate"].sort()),
  `got ${JSON.stringify(findAutoUpdateKeyPaths({ a: { autoUpdate: 1 }, b: [{ autoUpdate: 2 }] }))}`,
);

record(
  "SELF-CHECK isTrackedSettingsPath accepts a root .claude/settings.json line",
  isTrackedSettingsPath(".claude/settings.json") === true,
  "expected true",
);

record(
  "SELF-CHECK isTrackedSettingsPath accepts a nested example/template settings.json line",
  isTrackedSettingsPath("templates/example-settings.json") === true,
  "expected true (any tracked path ending in literal 'settings.json' is caught)",
);

record(
  "SELF-CHECK isTrackedSettingsPath rejects unrelated tracked files",
  isTrackedSettingsPath("package.json") === false && isTrackedSettingsPath("") === false,
  "expected false for package.json and an empty line",
);

// =============================================================================================
// Self-check: trackedSettingsPaths() fallback path (git unavailable / not a repo), WITHOUT
// touching the real repo -- run against a fresh temp dir that is not inside any git worktree.
// =============================================================================================

{
  const NON_REPO_DIR = mkdtempSync(join(tmpdir(), "no-autoupdate-key-test-nonrepo-"));
  const result = trackedSettingsPaths(NON_REPO_DIR);
  if (result.notice) console.log(`NOTE  ${result.notice}`);
  record(
    "SELF-CHECK trackedSettingsPaths falls back to the fixed list outside any git repo",
    result.usedFallback === true &&
      Array.isArray(result.paths) &&
      result.paths.includes(".claude/settings.json") &&
      typeof result.notice === "string" &&
      result.notice.length > 0,
    `got ${JSON.stringify(result)}`,
  );
  rmSync(NON_REPO_DIR, { recursive: true, force: true });
}

// =============================================================================================
// Repo scan: every git-tracked *settings.json must be free of a committed autoUpdate key.
// =============================================================================================

const { paths: trackedPaths, usedFallback, notice } = trackedSettingsPaths(REPO_ROOT);
if (notice) console.log(`NOTE  ${notice}`);
if (usedFallback) {
  console.log("NOTE  git ls-files was unavailable for the real repo scan -- using the fixed fallback list.");
}

// =============================================================================================
// Invariant: when git ls-files IS available, FALLBACK must be a superset of the real
// git-tracked settings-path set. This makes FALLBACK drift loud -- today FALLBACK equals the
// real tracked set only coincidentally; if a new tracked settings.json-named file is added
// later while git ls-files happens to be unavailable, the guard would otherwise silently
// narrow its scan instead of catching a real regression.
// =============================================================================================

if (!usedFallback) {
  const fallbackSet = new Set(FALLBACK);
  const missing = trackedPaths.filter((relPath) => !fallbackSet.has(relPath));
  record(
    "SELF-CHECK FALLBACK covers the real git-tracked settings-path set (drift guard)",
    missing.length === 0,
    missing.length > 0
      ? `FALLBACK is missing tracked path(s): ${missing.join(", ")} -- update FALLBACK in trackedSettingsPaths() so a future git-unavailable run still scans them`
      : "",
  );
} else {
  console.log(
    "NOTE  git ls-files was unavailable for the real repo -- skipping the FALLBACK superset invariant check (nothing to compare FALLBACK against).",
  );
}

if (trackedPaths.length === 0) {
  record("SCAN  no tracked settings.json found in the repo (robust no-crash path)", true, "");
} else {
  for (const relPath of trackedPaths) {
    const absPath = join(REPO_ROOT, relPath);
    if (!existsSync(absPath)) {
      // Only reachable via the fallback list naming a path that doesn't (or no longer) exist --
      // nothing to check, not a failure (robustness over crashing).
      record(`SCAN  ${relPath} (fallback candidate not present on disk -- skipped)`, true, "");
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(absPath, "utf8"));
    } catch (err) {
      record(`SCAN  ${relPath} parses as JSON`, false, `JSON.parse failed: ${err.message}`);
      continue;
    }
    const hits = findAutoUpdateKeyPaths(parsed);
    record(
      `SCAN  ${relPath} has no committed autoUpdate key (ADR-0001 D2)`,
      hits.length === 0,
      hits.length > 0 ? `found "autoUpdate" at: ${hits.join(", ")}` : "",
    );
  }
}

// ---- Summary ------------------------------------------------------------------------------
const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);

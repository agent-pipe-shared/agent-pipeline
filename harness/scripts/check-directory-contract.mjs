#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-directory-contract.mjs — Verify-adjacent (standalone) check for ADR-0063.
 *
 * ADR-0063 (`docs/adr/0063-repository-directory-contract.md`) names three deferred
 * follow-up obligations. This is the third: "a Verify gate assertion, in the spirit
 * of the existing gate chain, that scans tracked paths against the kinds table and
 * flags unanchored directory-name ignore patterns" (ADR-0063 point 4).
 *
 * STANDALONE, NOT REGISTERED IN harness/scripts/verify.mjs
 *   verify.mjs is TP-3 protected (`.claude/guard-config.json`, pattern
 *   `harness/scripts/verify\.mjs$`) — its own header states so explicitly ("this
 *   file is TP-3-protected"). Wiring this check into verify.mjs's TEST_SUITES list
 *   requires the audited human-guard-override ceremony, which is out of a single
 *   Goldfish dispatch's authority. This script is therefore standalone (same pattern
 *   as `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` and
 *   `plugins/pipeline-core/scripts/tmp-leak-guard.mjs`, both of which document the
 *   same TP-3 constraint): runnable directly (`node harness/scripts/
 *   check-directory-contract.mjs`), covered by its own test suite
 *   (`check-directory-contract.test.mjs`), but not yet part of the one canonical
 *   Verify run. Registering it into verify.mjs's suite list is deferred to whichever
 *   dispatch carries the TP-3 override ceremony.
 *
 * WHAT THIS CHECKS (ADR-0063 point 4's two named assertions)
 *   1. No tracked file sits in a top-level directory the contract doesn't name.
 *      ADR-0063's kinds table (point 1) is lean by design and does not enumerate
 *      every directory in the repository (that full audit was explicitly rejected —
 *      see the ADR's "Discarded alternatives"). KNOWN_TOP_LEVEL_DIRS below is the
 *      practical, cheapest-credible-form allowlist: every top-level directory this
 *      repository actually carries tracked files under today, each with a one-line
 *      reason tying it either to an ADR-0063 kinds-table row or to pre-existing
 *      repository infrastructure the ADR's lean scope did not re-litigate. The
 *      failure mode this closes is future recurrence of backlog instance 1 (agent-
 *      authored material landing in an invented top-level directory nobody named):
 *      a NEW top-level directory not on this list is a finding. It is deliberately
 *      NOT a full per-file taxonomy audit — that scope was explicitly deferred to
 *      the Nightwing-era revision the ADR names.
 *   2. Every bare directory-name `.gitignore` pattern (one path segment, no other
 *      "/", no wildcard, ending in a trailing slash — the exact shape that swallowed
 *      `backlog/evidence/` before the `/evidence/` anchoring fix) is either anchored
 *      with a leading slash or explicitly justified as intentionally depth-unbounded
 *      in DEPTH_UNBOUNDED_GITIGNORE_PATTERNS below, with a stated reason (ADR-0063
 *      point 2: "any directory-name-only ignore pattern must be justified as
 *      intentionally depth-unbounded or anchored with a leading slash"). A pattern
 *      that already contains another "/" is anchored to the .gitignore's own
 *      directory by git's own semantics regardless of a leading slash, so it is out
 *      of scope for this check (nothing to flag).
 *
 * Mirrors the allowlist-with-stated-reason, stale-entry-is-itself-a-finding shape
 * `harness/scripts/check-consumer-safe-paths.mjs` already uses for the same kind of
 * problem (a fixed set of known-acceptable exceptions to an otherwise-strict rule).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Every top-level directory this repository currently carries tracked files under,
 * with a one-line reason. Adding a new top-level directory means adding a line here
 * — deliberately a manual step, so a fresh session inventing one is a Verify finding
 * rather than a silent pass, closing backlog instance 1 (agent-authored material
 * falling back to an unnamed location).
 */
export const KNOWN_TOP_LEVEL_DIRS = Object.freeze({
  ".claude": "Plugin/runtime config and state (guard-config.json, pipeline.json/yaml, settings) — ADR-0063's \"plugin-owned private runtime state\" row names this family of paths.",
  ".claude-plugin": "Marketplace manifest metadata for the pipeline-core plugin — pre-existing repository infrastructure, not an ADR-0063 kind.",
  ".codex": "Codex-runner agent/config definitions (parallel-runner support) — pre-existing repository infrastructure, not an ADR-0063 kind.",
  ".github": "GitHub issue/PR templates and CI workflow definitions — standard repository convention, not an ADR-0063 kind.",
  backlog: "Backlog process directory; its evidence/ subdirectory is ADR-0063's \"Evidence, durable citation target\" row home.",
  docs: "Decision records (docs/adr/) and part of ADR-0063's \"Normative canon\" row home.",
  evidence: "ADR-0063's \"Evidence, machine-regenerated\" row (ignored via /evidence/ in .gitignore); a small number of files tracked before the 2026-08-09 anchoring fix remain visible (git does not re-evaluate ignore rules against already-tracked paths) and are grandfathered, not new instances.",
  governance: "Governance-layer examples (ADR-0030) — pre-existing repository infrastructure, not an ADR-0063 kind.",
  guardrails: "ADR-0063's \"Normative canon\" row home.",
  harness: "Session-bootstrap spec and the harness/scripts/ check family (this file included) — pre-existing repository infrastructure, not an ADR-0063 kind.",
  plugins: "The pipeline-core plugin package (hooks, skills, agents, lib) — pre-existing repository infrastructure, not an ADR-0063 kind.",
  policies: "ADR-0063's \"Normative canon\" row home.",
  project: "Project-tier calibration artifacts at the resolved authority tier — a candidate for ADR-0063's \"Generated projections\" row, pre-existing repository infrastructure.",
  roles: "ADR-0063's \"Normative canon\" row home.",
  scripts: "Top-level invocation-contract JSON Schemas — pre-existing repository infrastructure, not an ADR-0063 kind.",
  specs: "ADR-0063's \"Specifications / feature authority packages\" row home (ADR-0045, specs/<feature-id>/).",
  telemetry: "Cost-tracking documentation — pre-existing repository infrastructure, not an ADR-0063 kind.",
  templates: "Spec/ADR/dispatch template package (templates/prompts/) — pre-existing repository infrastructure, not an ADR-0063 kind.",
});

/**
 * Bare directory-name `.gitignore` patterns that are correct WITHOUT a leading
 * slash because they are deliberately depth-unbounded (every nested occurrence of
 * the name, anywhere in the tree, is meant to be ignored) — the universal-editor-
 * config convention, not an ADR-0063 kind with a single repo-root home. Anything
 * NOT on this list that is also unanchored is flagged: that is the exact shape of
 * bug instance 3 (an unanchored `evidence/` line swallowing `backlog/evidence/`).
 */
export const DEPTH_UNBOUNDED_GITIGNORE_PATTERNS = Object.freeze({
  ".vscode/": "Editor config folder; intentionally ignored at any nesting depth (no ADR-0063 kind names a single repo-root home for it, and nothing cites a nested .vscode/ by path).",
  ".idea/": "Editor config folder; same depth-unbounded convention as .vscode/ above.",
});

function posixPath(value) {
  return value.split(sep).join("/");
}

function gitListFiles(root) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" });
  if (result.status !== 0) throw new Error(`git ls-files failed with exit ${result.status ?? "unknown"}`);
  return decoder
    .decode(result.stdout)
    .split("\0")
    .filter(Boolean)
    .map(posixPath)
    .sort();
}

function defaultReadGitignore(root) {
  return decoder.decode(readFileSync(resolve(root, ".gitignore")));
}

/**
 * One finding per undeclared top-level directory (not per file under it), so a
 * hundred files landing in one invented directory reads as one actionable finding.
 */
export function checkTopLevelDirectories(files, knownDirs = KNOWN_TOP_LEVEL_DIRS) {
  const counts = new Map();
  for (const file of files) {
    const idx = file.indexOf("/");
    if (idx === -1) continue; // a root-level file is not a directory member
    const top = file.slice(0, idx);
    if (top in knownDirs) continue;
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([top, count]) => `${top}/: top-level directory not named in ADR-0063's directory-kinds table (docs/adr/0063-repository-directory-contract.md) or KNOWN_TOP_LEVEL_DIRS (${count} tracked file${count === 1 ? "" : "s"}) — name its kind and home before adding files here, per ADR-0063 point 1.`);
}

/**
 * Parse `.gitignore` for bare directory-name patterns: exactly one path segment
 * (no other "/"), no glob metacharacters, ending in a trailing slash. A pattern
 * with any other "/" is already anchored to the .gitignore's own directory by
 * git's own semantics (a slash in the middle or start anchors it) regardless of a
 * leading slash, so it is intentionally excluded here — nothing to flag.
 */
export function parseGitignoreDirectoryPatterns(text) {
  const results = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue;
    const anchored = line.startsWith("/");
    const withoutLeadingSlash = anchored ? line.slice(1) : line;
    if (!withoutLeadingSlash.endsWith("/")) continue;
    const name = withoutLeadingSlash.slice(0, -1);
    if (name === "" || name.includes("/") || /[*?[\]]/u.test(name)) continue;
    results.push({ line: i + 1, raw: line, anchored, name });
  }
  return results;
}

export function checkGitignoreAnchoring(text, depthUnboundedAllowlist = DEPTH_UNBOUNDED_GITIGNORE_PATTERNS) {
  const findings = [];
  const used = new Set();
  for (const entry of parseGitignoreDirectoryPatterns(text)) {
    if (entry.anchored) continue;
    const key = `${entry.name}/`;
    if (key in depthUnboundedAllowlist) {
      used.add(key);
      continue;
    }
    findings.push(`.gitignore:${entry.line}: "${entry.raw}" is an unanchored directory-name pattern — matches "${entry.name}" at ANY depth (the bug that swallowed backlog/evidence/, ADR-0063 point 2). Anchor it as "/${entry.name}/" or add it to DEPTH_UNBOUNDED_GITIGNORE_PATTERNS with a stated reason.`);
  }
  for (const key of Object.keys(depthUnboundedAllowlist)) {
    if (!used.has(key)) findings.push(`DEPTH_UNBOUNDED_GITIGNORE_PATTERNS: entry "${key}" never matched an unanchored .gitignore line — remove it or .gitignore changed underneath it.`);
  }
  return findings;
}

export function checkRepository(rootInput, options = {}) {
  const root = resolve(rootInput);
  const files = options.files ?? gitListFiles(root);
  const knownDirs = options.knownDirs ?? KNOWN_TOP_LEVEL_DIRS;
  const depthUnboundedAllowlist = options.depthUnboundedAllowlist ?? DEPTH_UNBOUNDED_GITIGNORE_PATTERNS;
  const gitignoreText = options.gitignoreText ?? defaultReadGitignore(root);
  const findings = [
    ...checkTopLevelDirectories(files, knownDirs),
    ...checkGitignoreAnchoring(gitignoreText, depthUnboundedAllowlist),
  ];
  findings.sort();
  return { findings, stats: { filesScanned: files.length, knownDirCount: Object.keys(knownDirs).length } };
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex < 0 || rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-directory-contract.mjs [--root <repository>]\n");
    process.exit(2);
  }
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const root = rootIndex === 0 ? args[1] : defaultRoot;
  try {
    const result = checkRepository(root);
    if (result.findings.length) {
      for (const item of result.findings) process.stderr.write(`DIRECTORY-CONTRACT ${item}\n`);
      process.stderr.write(`Directory-contract check failed: ${result.findings.length} finding(s).\n`);
      process.exit(2);
    }
    process.stdout.write(
      `Directory-contract check passed: ${result.stats.filesScanned} tracked file(s), ${result.stats.knownDirCount} known top-level director${result.stats.knownDirCount === 1 ? "y" : "ies"}.\n`,
    );
  } catch (error) {
    process.stderr.write(`Directory-contract check unavailable: ${error.message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Consumer-safe-path gate.
 *
 * Fails when a documentation artifact this repository ships to a consumer
 * project under `plugins/pipeline-core/` (skill instructions, their
 * references, agent definitions, plugin docs) names a path that resolves
 * only inside THIS repository's own source checkout and never inside an
 * installed plugin. Closes the class recorded in
 * `backlog/items/2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md`
 * (CB-1b, direction 4): "Add a check that fails the build when a shipped
 * artifact names a source-only path... this is the piece that matters most."
 *
 * Scope (deliberate, see the CB-1b dispatch report for the full accounting):
 * tracked Markdown files under `plugins/pipeline-core/` -- the documentation
 * surface a consumer/agent reads as INSTRUCTIONS (skills, their references,
 * agent definitions, plugin docs). Source code under
 * `plugins/pipeline-core/{scripts,lib,hooks}/` is out of this check's scope:
 * its comments and test fixtures legitimately cite this repository's own
 * `harness/` layout in far greater volume (self-application, ADR-0015), are
 * never read by a consumer as an instruction, and are a separate, much
 * larger sweep than this backlog item's "skills, their references, and
 * push/release documentation an agent follows by hand" framing calls for.
 *
 * Not every match is a defect: some Markdown mentions of these prefixes are
 * legitimate (a bare citation to this repository's own canon docs, or a step
 * explicitly scoped to run only inside the Pipeline's own source checkout).
 * The ALLOWLIST below carries a stated reason for each such entry, matched
 * by (file, exact substring) rather than by line number so it survives
 * unrelated edits. An allowlist entry that stops matching anything is itself
 * reported as a finding -- a stale entry is exactly the kind of place a real
 * regression could hide.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const decoder = new TextDecoder("utf-8", { fatal: true });

const SCAN_PREFIX = "plugins/pipeline-core/";

// Minimum set from the backlog item's direction 4. Prefix matching, not
// exact-path matching: `harness/` also catches `harness/checklists/...` and
// `harness/definition-of-done.md`, both real citation classes found in the
// initial sweep.
export const SOURCE_ONLY_PREFIXES = Object.freeze(["harness/", "specs/sprint-nova-epic/", "setup.mjs"]);

export const ALLOWLIST = Object.freeze([
  {
    file: "plugins/pipeline-core/skills/close-feature/SKILL.md",
    match: "harness/scripts/usage-ledger.mjs",
    reason:
      "Content defect, not a path defect (CB-1b stop condition, field 5): usage-ledger.mjs " +
      "has no plugin-relative equivalent anywhere under plugins/pipeline-core/ -- no path " +
      "substitution makes this instruction consumer-correct. Reported as an open item for a " +
      "separate decision rather than silently left broken or silently rewritten.",
  },
  {
    file: "plugins/pipeline-core/skills/pipeline-start/SKILL.md",
    match: "harness/scripts/check-observation-governance.mjs",
    reason:
      "Self-application only (ADR-0015): this exact command runs exclusively inside the " +
      "Pipeline's own source checkout, gated by \"Only a checkout carrying the Pipeline " +
      "source manifest is required\". The Consumer-project branch of the same step resolves " +
      "to not-applicable and explicitly instructs the agent never to look for, copy, or " +
      "repair this path there.",
  },
  {
    file: "plugins/pipeline-core/skills/pipeline-start/references/failure-cases.md",
    match: "harness/scripts/check-observation-governance.mjs",
    reason:
      "Same self-application-only scoping as pipeline-start/SKILL.md's Observation " +
      "governance step: F6 is explicitly \"mandatory only in the Public source checkout\".",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/checklists/session-close.md",
    reason:
      "Bare citation to this repository's own canon documentation, explicitly labelled " +
      "\"(agent-pipeline repo -- canon pointers, not runtime reads)\" in the same sentence -- " +
      "never a command a consumer executes.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/definition-of-done.md",
    reason: "Bare parenthetical citation to the DoD source, not a runtime command.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/checklists/small-session.md",
    reason: "Bare parenthetical citation to the close-light companion checklist, not a runtime command.",
  },
  {
    file: "plugins/pipeline-core/skills/critic-review/SKILL.md",
    match: "harness/review-protocol.md",
    reason:
      "Bare citation in a list explicitly labelled \"Canon pointers (agent-pipeline repo, not " +
      "runtime reads)\" -- never a command a consumer executes.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/scripts/check-observation-governance.mjs",
    reason:
      "Explicitly scoped \"(Agent-Pipeline checkout only)\" in the same sentence -- the same " +
      "self-application-only pattern as pipeline-start/SKILL.md's Observation governance step.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/scripts/usage-ledger.mjs",
    reason:
      "Content defect, not a path defect (CB-1b stop condition, field 5) -- same gap as " +
      "close-feature/SKILL.md's usage-ledger.mjs reference; no plugin-relative equivalent exists.",
  },
  {
    file: "plugins/pipeline-core/skills/close-block/SKILL.md",
    match: "harness/scripts/model-prices.json",
    reason:
      "Companion data file of the same harness-only usage-ledger.mjs telemetry capability; " +
      "same content-defect gap, no plugin-relative equivalent exists.",
  },
]);

function posixPath(value) {
  return value.split(sep).join("/");
}

function gitListMarkdown(root) {
  const result = spawnSync("git", ["ls-files", "-z", "--", SCAN_PREFIX], { cwd: root, encoding: "buffer" });
  if (result.status !== 0) throw new Error(`git ls-files failed with exit ${result.status ?? "unknown"}`);
  return decoder
    .decode(result.stdout)
    .split("\0")
    .filter(Boolean)
    .map(posixPath)
    .filter((entry) => entry.toLowerCase().endsWith(".md"))
    .sort();
}

function defaultReadText(file) {
  return decoder.decode(readFileSync(file));
}

/**
 * Scan one file's already-read text for the banned prefixes, honoring the
 * allowlist. Exported separately so a caller (the test suite) can exercise
 * the line-matching logic without touching the filesystem or git.
 */
export function checkText(filePath, text, allowlist, usedAllowlistIndices) {
  const findings = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const prefix of SOURCE_ONLY_PREFIXES) {
      if (!line.includes(prefix)) continue;
      const allowIndex = allowlist.findIndex((entry) => entry.file === filePath && line.includes(entry.match));
      if (allowIndex >= 0) {
        usedAllowlistIndices.add(allowIndex);
        continue;
      }
      findings.push(`${filePath}:${i + 1}: names source-only path prefix "${prefix}" -- ${line.trim()}`);
    }
  }
  return findings;
}

export function checkRepository(rootInput, options = {}) {
  const root = resolve(rootInput);
  const readText = options.readText ?? defaultReadText;
  const files = options.markdownPaths ?? gitListMarkdown(root);
  const allowlist = options.allowlist ?? ALLOWLIST;
  const usedAllowlistIndices = new Set();
  const findings = [];

  for (const file of files) {
    const text = readText(resolve(root, file));
    findings.push(...checkText(file, text, allowlist, usedAllowlistIndices));
  }

  allowlist.forEach((entry, index) => {
    if (!usedAllowlistIndices.has(index)) {
      findings.push(`allowlist: ${entry.file}: entry for "${entry.match}" never matched a line in that file -- remove it`);
    }
  });

  findings.sort();
  return { findings, stats: { filesScanned: files.length, allowlistEntries: allowlist.length } };
}

function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  if (args.length && (rootIndex < 0 || rootIndex !== 0 || args.length !== 2)) {
    process.stderr.write("usage: check-consumer-safe-paths.mjs [--root <repository>]\n");
    process.exit(2);
  }
  const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const root = rootIndex === 0 ? args[1] : defaultRoot;
  try {
    const result = checkRepository(root);
    if (result.findings.length) {
      for (const item of result.findings) process.stderr.write(`CONSUMER-PATH ${item}\n`);
      process.stderr.write(`Consumer-safe-path check failed: ${result.findings.length} finding(s).\n`);
      process.exit(2);
    }
    process.stdout.write(
      `Consumer-safe-path check passed: ${result.stats.filesScanned} Markdown file(s) under ${SCAN_PREFIX}, ` +
        `${result.stats.allowlistEntries} allowlist entr${result.stats.allowlistEntries === 1 ? "y" : "ies"} (all used).\n`,
    );
  } catch (error) {
    process.stderr.write(`Consumer-safe-path check unavailable: ${error.message}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();

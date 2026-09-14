#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * check-commit-type-range.mjs — audits an entire commit range for valid Conventional Commit types per GIT-01/GG-22.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commitTypeFindingsForRange } from "../lib/commit-message-policy.mjs";

export function auditCommitTypeRange({ root = process.cwd(), base, head, gitOperations } = {}) {
  const runGit = gitOperations?.runGit ?? ((args) => {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  });

  const resolvedHead = head || "HEAD";
  let resolvedBase = base;

  if (!resolvedBase) {
    const pluginJsonPath = join(root, "plugins", "pipeline-core", ".claude-plugin", "plugin.json");
    if (existsSync(pluginJsonPath)) {
      try {
        const pluginData = JSON.parse(readFileSync(pluginJsonPath, "utf8"));
        const version = typeof pluginData.version === "string" ? pluginData.version : "";
        const match = /\+.*\.([a-f0-9]+)$/u.exec(version) || /\.([a-f0-9]{7,40})$/u.exec(version);
        if (match) {
          try {
            resolvedBase = runGit(["rev-parse", "--verify", `${match[1]}^{commit}`]);
          } catch {
            resolvedBase = null;
          }
        }
      } catch {
        resolvedBase = null;
      }
    }
  }

  if (!resolvedBase) {
    return { ok: true, findings: [], skipped: "no resolvable base", commitsChecked: 0, base: null, head: resolvedHead };
  }

  const commits = [];
  try {
    const logOutput = runGit(["log", "--format=%H%x00%s", `${resolvedBase}..${resolvedHead}`]);
    if (logOutput.length > 0) {
      for (const line of logOutput.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const idx = trimmed.indexOf("\0");
        if (idx === -1) continue;
        const sha = trimmed.slice(0, idx);
        const subject = trimmed.slice(idx + 1);
        commits.push({ sha, subject });
      }
    }
  } catch (error) {
    return { ok: false, findings: [{ error: error.message }], commitsChecked: 0, base: resolvedBase, head: resolvedHead };
  }

  const assessed = commitTypeFindingsForRange(commits);
  const findings = assessed.filter((entry) => entry.findings.length > 0);

  return {
    ok: findings.length === 0,
    findings,
    commitsChecked: commits.length,
    base: resolvedBase,
    head: resolvedHead,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  let range = null;
  let base = null;
  let head = null;
  let root = process.cwd();

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--range" && i + 1 < process.argv.length) {
      range = process.argv[++i];
    } else if (arg === "--base" && i + 1 < process.argv.length) {
      base = process.argv[++i];
    } else if (arg === "--head" && i + 1 < process.argv.length) {
      head = process.argv[++i];
    } else if (arg === "--root" && i + 1 < process.argv.length) {
      root = resolve(process.argv[++i]);
    }
  }

  if (range) {
    const parts = range.split(/\.{2,3}/);
    if (parts.length === 2) {
      base = parts[0];
      head = parts[1];
    }
  }

  const result = auditCommitTypeRange({ root, base, head });
  if (result.skipped) {
    console.log(`Skipped commit type range check: ${result.skipped}`);
    process.exit(0);
  }
  if (result.ok) {
    console.log(`Commit type range check passed: ${result.commitsChecked} commit(s) verified in ${result.base}..${result.head}.`);
    process.exit(0);
  }

  console.error(`Commit type range check failed with ${result.findings.length} finding(s):`);
  for (const finding of result.findings) {
    for (const f of finding.findings) {
      console.error(`  ${finding.sha.slice(0, 8)}: ${f.code}: ${f.detail}`);
    }
  }
  process.exit(2);
}

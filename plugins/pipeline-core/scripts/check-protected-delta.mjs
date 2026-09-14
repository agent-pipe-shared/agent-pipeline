#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Candidate-time protected-surface delta detector (Sprint Alfred A3 / #101). */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { protectedBaselineReadback, protectedBaselineRuleFor, resolveProtectedBaseline } from "../lib/protected-baseline.mjs";

function git(rootDir, args) {
  return execFileSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function binding(rootDir, candidate) {
  return Object.freeze({ commit: git(rootDir, ["rev-parse", candidate]), tree: git(rootDir, ["rev-parse", `${candidate}^{tree}`]) });
}

export function checkProtectedDelta({ rootDir = process.cwd(), base = "HEAD^", candidate = "HEAD", gitFn = git } = {}) {
  const root = resolve(rootDir);
  const baseline = resolveProtectedBaseline({ rootDir: root });
  let paths;
  let candidateBinding;
  try {
    candidateBinding = Object.freeze({ commit: gitFn(root, ["rev-parse", candidate]), tree: gitFn(root, ["rev-parse", `${candidate}^{tree}`]) });
    paths = gitFn(root, ["diff", "--name-only", "-z", base, candidate]).split("\0").filter(Boolean);
  } catch (error) {
    return Object.freeze({ schema: "pipeline.protected-delta-check.v1", status: "unavailable", ok: false, error: error.message, baseline: protectedBaselineReadback({ rootDir: root }) });
  }
  const protectedPaths = paths.flatMap((path) => {
    const entry = protectedBaselineRuleFor(baseline.entries, path);
    return entry ? [{ path, ruleId: entry.id, class: entry.class, dynamic: Boolean(entry.dynamic) }] : [];
  });
  return Object.freeze({
    schema: "pipeline.protected-delta-check.v1",
    status: protectedPaths.length ? "protected-delta" : "pass",
    ok: baseline.status === "ready" && protectedPaths.length === 0,
    candidate: candidateBinding,
    base,
    changedPaths: paths,
    protectedPaths,
    baseline: Object.freeze({ identity: baseline.identity, diagnostics: baseline.diagnostics, dynamic: baseline.dynamic.status }),
  });
}

function parse(argv) {
  const options = { rootDir: process.cwd(), base: "HEAD^", candidate: "HEAD", format: "text" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--root") options.rootDir = argv[++index];
    else if (value === "--base") options.base = argv[++index];
    else if (value === "--candidate") options.candidate = argv[++index];
    else if (value === "--format") options.format = argv[++index];
    else if (value === "--help") return null;
    else throw new Error(`unknown option: ${value}`);
  }
  return options;
}
function printHelp() {
  console.log("Usage: check-protected-delta.mjs [--root <dir>] [--base <git-ref>] [--candidate <git-ref>] [--format text|json]");
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parse(process.argv.slice(2));
    if (!options) { printHelp(); process.exit(0); }
    const result = checkProtectedDelta(options);
    if (options.format === "json") console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.status}: ${result.protectedPaths?.length ?? 0} protected path(s)`);
      for (const item of result.protectedPaths ?? []) console.log(`${item.ruleId} ${item.path}`);
      if (result.baseline?.identity) console.log(`baseline ${result.baseline.identity.baselineRevision} ${result.baseline.identity.mergedDigest}`);
      for (const diagnostic of result.baseline?.diagnostics ?? []) console.log(`${diagnostic.code}: ${diagnostic.message}`);
    }
    process.exit(result.ok ? 0 : 2);
  } catch (error) {
    process.stderr.write(`check-protected-delta: ${error.message}\n`);
    process.exit(2);
  }
}

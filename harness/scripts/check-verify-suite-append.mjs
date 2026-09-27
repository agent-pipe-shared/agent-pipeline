#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** AC-11 B2-ii: every registration edit after TP-13 introduction is append-only. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "../../plugins/pipeline-core/lib/governance-event.mjs";
import { evaluateVerifySuiteAppend } from "../../plugins/pipeline-core/lib/verify-suite-append-policy.mjs";

const CONFIG = "project/guard-config.json";
const REGISTRY = "harness/verify-suites.json";
const OID = /^[0-9a-f]{40}$/u;
const fail = (code, detail = null) => ({ ok: false, code, detail });

function hasTp13(bytes) {
  try {
    const value = parseStrictJson(bytes);
    return Array.isArray(value?.protectedTestPaths)
      && value.protectedTestPaths.some((entry) => entry?.id === "TP-13"
        && entry.pattern === "harness/verify-suites\\.json$");
  } catch { return false; }
}

/**
 * The commit introducing TP-13 is the grandfather boundary. Rechecking every
 * later registry edit prevents a second append from hiding an earlier rewrite.
 * An uncommitted TP-13 is checked against HEAD for candidate preparation.
 */
export function checkVerifySuiteAppend({ rootDir, git = null, read = readFileSync } = {}) {
  if (typeof rootDir !== "string") return fail("VSA-ROOT");
  const root = resolve(rootDir);
  const run = git ?? ((args) => execFileSync("git", ["-C", root, ...args],
    { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] }));
  const show = (revision, path) => run(["show", `${revision}:${path}`]);
  try {
    const currentConfig = read(resolve(root, CONFIG), "utf8");
    if (!hasTp13(currentConfig)) return fail("VSA-TP13-ABSENT");
    const head = run(["rev-parse", "--verify", "HEAD^{commit}"]).trim();
    if (!OID.test(head)) return fail("VSA-HEAD");
    const configCommits = run(["log", "--first-parent", "--reverse", "--format=%H", "--", CONFIG])
      .trim().split("\n").filter(Boolean);
    let introduction = null;
    for (const commit of configCommits) {
      if (!OID.test(commit)) return fail("VSA-HISTORY-SHAPE");
      if (hasTp13(show(commit, CONFIG))) { introduction = commit; break; }
    }
    if (introduction === null) {
      const before = show(head, REGISTRY);
      const after = read(resolve(root, REGISTRY), "utf8");
      if (before === after) return { ok: true, code: "VSA-UNCOMMITTED-INTRODUCTION",
        checked: 0, appended: 0 };
      const result = evaluateVerifySuiteAppend({ beforeBytes: before, afterBytes: after });
      return result.ok ? { ok: true, code: "VSA-UNCOMMITTED-INTRODUCTION",
        checked: 1, appended: result.appended }
        : fail(result.code, "uncommitted TP-13 registration postimage");
    }
    const registryCommits = run(["rev-list", "--first-parent", "--reverse",
      `${introduction}^..${head}`, "--", REGISTRY]).trim().split("\n").filter(Boolean);
    let checked = 0;
    for (const commit of registryCommits) {
      if (!OID.test(commit)) return fail("VSA-HISTORY-SHAPE");
      const before = show(`${commit}^`, REGISTRY);
      const after = show(commit, REGISTRY);
      const result = evaluateVerifySuiteAppend({ beforeBytes: before, afterBytes: after });
      if (!result.ok) return fail(result.code, commit);
      checked += 1;
    }
    const committed = show(head, REGISTRY);
    const worktree = read(resolve(root, REGISTRY), "utf8");
    if (committed !== worktree) {
      const result = evaluateVerifySuiteAppend({ beforeBytes: committed, afterBytes: worktree });
      if (!result.ok) return fail(result.code, "worktree");
      checked += 1;
    }
    return { ok: true, code: "VSA-HISTORY-APPEND-ONLY", checked };
  } catch (error) {
    return fail("VSA-UNAVAILABLE", error?.code ?? error?.message ?? "unknown");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkVerifySuiteAppend({ rootDir: resolve(fileURLToPath(new URL("../..", import.meta.url))) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

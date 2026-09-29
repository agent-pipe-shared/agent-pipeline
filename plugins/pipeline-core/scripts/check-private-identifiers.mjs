#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Check newly added tracked content without publishing the values being checked. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const MAX_OUTPUT = 128 * 1024 * 1024;
const categories = new Set(["home-path", "user-path", "email", "local-pattern"]);

function git(root, args, { optional = false } = {}) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8", shell: false, maxBuffer: MAX_OUTPUT,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  });
  if (result.error || result.status !== 0) {
    if (optional) return null;
    throw new Error(`private-identifier scan: git ${args[0]} failed`);
  }
  return result.stdout;
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length >= 3))];
}

function variants(value) {
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/u, "");
  if (normalized.length < 3) return [];
  const slash = normalized;
  const backslash = slash.replaceAll("/", "\\");
  const escaped = backslash.replaceAll("\\", "\\\\");
  const encoded = slash.split("/").map(encodeURIComponent).join("%2F");
  return unique([value, slash, backslash, escaped, encoded, encodeURIComponent(slash)]);
}

function escaped(value) { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }

export function derivePatterns({ home = os.homedir(), username = os.userInfo().username,
  userProfile = process.env.USERPROFILE, email = null, localPatterns = [] } = {}) {
  const patterns = [];
  const push = (category, value, boundary = false) => {
    if (typeof value !== "string" || value.length < 3) return;
    for (const form of variants(value)) {
      patterns.push({ category, expression: boundary
        ? new RegExp(`(?:^|[^A-Za-z0-9._+-])${escaped(form)}(?=$|[^A-Za-z0-9_+-])`, "iu")
        : new RegExp(escaped(form), "iu") });
    }
  };
  for (const path of unique([home, userProfile])) push("home-path", path, true);
  // A bare user name is too ambiguous. Only concrete home-directory segments count.
  if (username?.length >= 3) {
    for (const prefix of ["/home/", "/Users/", "\\Users\\", "C:/Users/", "C:\\Users\\"]) {
      push("user-path", `${prefix}${username}/`, true);
      push("user-path", `${prefix}${username}\\`, true);
    }
  }
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) push("email", email, true);
  for (const entry of localPatterns) {
    if (!entry || !categories.has(entry.category) || typeof entry.value !== "string" || entry.value.length < 5) {
      throw new Error("private-identifier scan: invalid local pattern");
    }
    push(entry.category, entry.value, entry.category === "email");
  }
  return patterns;
}

function localPatternFile(root, supplied) {
  const path = supplied ?? join(root, ".git", "agent-pipeline", "private-identity-patterns.json");
  if (!existsSync(path)) return [];
  const repo = realpathSync(root);
  const actual = realpathSync(path);
  // A tracked pattern file would disclose the very values this check protects.
  const repoRelative = relative(repo, actual);
  if (repoRelative && !repoRelative.startsWith("..") && !isAbsolute(repoRelative)) {
    if (git(root, ["ls-files", "--error-unmatch", "--", repoRelative], { optional: true }) !== null) {
      throw new Error("private-identifier scan: local pattern file is tracked");
    }
    if (!/^\.git[\\/]/u.test(repoRelative)
      && git(root, ["check-ignore", "-q", "--", repoRelative], { optional: true }) === null) {
      throw new Error("private-identifier scan: local pattern file must be ignored");
    }
  }
  const data = JSON.parse(readFileSync(actual, "utf8"));
  if (!Array.isArray(data)) throw new Error("private-identifier scan: local pattern file must be an array");
  return data;
}

export function inspectAddedLines(diff, patterns) {
  const counts = new Map();
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++ ")) continue;
    const matched = new Set();
    for (const pattern of patterns) {
      if (pattern.expression.test(line.slice(1))) {
        matched.add(pattern.category);
      }
    }
    if (matched.has("home-path")) matched.delete("user-path");
    for (const category of matched) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

function scrubPath(path, patterns) {
  let safe = path;
  for (const pattern of patterns) {
    const flags = pattern.expression.flags.includes("g") ? pattern.expression.flags : `${pattern.expression.flags}g`;
    safe = safe.replace(new RegExp(pattern.expression.source, flags), "<private>");
  }
  return safe;
}

export function scanChangedContent(root, { patterns = null, patternsFile = null, scopes = ["staged", "worktree"] } = {}) {
  const repo = resolve(root);
  const email = git(repo, ["config", "--get", "user.email"], { optional: true })?.trim() || null;
  const active = patterns ?? derivePatterns({ email, localPatterns: localPatternFile(repo, patternsFile) });
  const findings = [];
  const availableScopes = [
    { label: "staged", args: ["diff", "--cached"] },
    { label: "worktree", args: ["diff"] },
  ].filter((entry) => scopes.includes(entry.label));
  for (const scope of availableScopes) {
    const paths = git(repo, [...scope.args, "--no-renames", "--name-only", "-z", "--diff-filter=ACMRT", "--"])
      .split("\0").filter(Boolean);
    for (const path of paths) {
      const byCategory = new Map();
      for (const pattern of active) {
        if (pattern.expression.test(path)) byCategory.set(pattern.category, 1);
      }
      const diff = git(repo, [...scope.args, "--no-renames", "--no-ext-diff", "--no-textconv", "--unified=0", "--", path]);
      for (const [category, count] of inspectAddedLines(diff, active)) {
        byCategory.set(category, (byCategory.get(category) ?? 0) + count);
      }
      for (const [category, count] of byCategory) findings.push({ scope: scope.label, category,
        path: scrubPath(path, active), count });
    }
  }
  return { ok: findings.length === 0, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const args = process.argv.slice(2);
  if (args.length > 4 || args.some((value, index) => index % 2 === 0 && !["--root", "--patterns-file"].includes(value))) {
    process.stderr.write("usage: check-private-identifiers.mjs [--root <repository>] [--patterns-file <ignored-json>]\n");
    process.exitCode = 2;
  } else {
    try {
      const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, index) => [args[index * 2], args[index * 2 + 1]]));
      const result = scanChangedContent(options["--root"] ?? process.cwd(), { patternsFile: options["--patterns-file"] });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (!result.ok) process.exitCode = 1;
    } catch {
      process.stderr.write("private-identifier scan failed; no candidate content was disclosed\n");
      process.exitCode = 2;
    }
  }
}

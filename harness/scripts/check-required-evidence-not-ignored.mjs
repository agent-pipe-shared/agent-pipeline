#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Invariant (PO decision D101): evidence, receipts or records that a tracked
 * file, a check or an index NEEDS must never live where a clean clone cannot
 * have them. This check reads the tracked indexes and manifests, collects the
 * repo-relative paths they name, and classifies each one against git:
 *
 *   REQ-EVIDENCE-GIT-DIR          names a path inside the git directory
 *   REQ-EVIDENCE-IGNORED          untracked and matched by an ignore rule
 *   REQ-EVIDENCE-UNTRACKED        untracked, not ignored (also covers "missing")
 *   REQ-EVIDENCE-TRACKED-IGNORED  tracked, but an ignore rule would hide it
 *                                 (advisory: it works, yet a replacement file
 *                                 cannot be added without `git add -f`)
 *
 * Only the first three fail the check. Scope is declared, not discovered:
 * see REFERRER_PATTERNS. Code that hard-codes a machine-local path is out of
 * reach of a data scan and stays a review concern.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Tracked files whose content is an index/manifest other things depend on. */
export const REFERRER_PATTERNS = Object.freeze([
  /^evidence\/[^/]+\.json$/u,
  /^harness\/[^/]*(?:recovery|index|manifest)[^/]*\.json$/u,
  /^harness\/verify-suites\.json$/u,
]);
const PATH_SHAPED = /^[A-Za-z0-9_.@-][A-Za-z0-9_.@/-]*\/[A-Za-z0-9_.@-]+\.[A-Za-z0-9]{1,8}$/u;

/** Every string value, at any depth, that looks like a repo-relative file path. */
export function collectPathReferences(value, out = new Set()) {
  if (typeof value === "string") {
    if (PATH_SHAPED.test(value) && !value.split("/").some((part) => part === "..")) out.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPathReferences(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectPathReferences(item, out);
  }
  return [...out];
}

export function checkRequiredEvidenceNotIgnored({ rootDir, referrerPatterns = REFERRER_PATTERNS } = {}) {
  if (typeof rootDir !== "string") return { ok: false, code: "REQ-EVIDENCE-ROOT", findings: [] };
  const root = resolve(rootDir);
  const git = (args, allowFailure = false) => {
    try {
      return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 });
    } catch (error) {
      if (allowFailure && error?.status === 1) return "";
      throw error;
    }
  };
  let tracked;
  try { tracked = new Set(git(["ls-files", "-z"]).split("\0").filter(Boolean)); }
  catch { return { ok: false, code: "REQ-EVIDENCE-UNAVAILABLE", findings: [] }; }

  const findings = [];
  const seen = new Set();
  for (const source of [...tracked].sort()) {
    if (!referrerPatterns.some((pattern) => pattern.test(source))) continue;
    let references;
    try { references = collectPathReferences(JSON.parse(readFileSync(resolve(root, source), "utf8"))); }
    catch { continue; }
    for (const path of references.sort()) {
      if (path === source || seen.has(source + "\0" + path)) continue;
      seen.add(source + "\0" + path);
      const base = { source, path };
      if (path === ".git" || path.startsWith(".git/") || path.includes("/.git/")) {
        findings.push({ ...base, code: "REQ-EVIDENCE-GIT-DIR", severity: "error", exists: null });
        continue;
      }
      // --no-index: classify the path by the rules alone, even when it is tracked.
      const hit = git(["check-ignore", "-v", "--no-index", "--", path], true).trim();
      const rule = hit === "" ? null : hit.split("\t")[0];
      const exists = existsSync(resolve(root, path));
      if (tracked.has(path)) {
        if (rule) findings.push({ ...base, code: "REQ-EVIDENCE-TRACKED-IGNORED", severity: "advisory", rule, exists });
        continue;
      }
      findings.push(rule
        ? { ...base, code: "REQ-EVIDENCE-IGNORED", severity: "error", rule, exists }
        : { ...base, code: "REQ-EVIDENCE-UNTRACKED", severity: "error", exists });
    }
  }
  return { ok: !findings.some((entry) => entry.severity === "error"), code: "REQ-EVIDENCE-CHECKED", findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkRequiredEvidenceNotIgnored({ rootDir: resolve(fileURLToPath(new URL("../..", import.meta.url))) });
  const counts = {};
  for (const entry of result.findings) {
    const key = `${entry.source} ${entry.code}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  // Default output is a per-referrer summary; --list prints every finding.
  const listed = process.argv.includes("--list") ? result.findings : undefined;
  process.stdout.write(JSON.stringify({ ok: result.ok, code: result.code, counts, findings: listed }, null, 2) + "\n");
  if (!result.ok) process.exitCode = 1;
}

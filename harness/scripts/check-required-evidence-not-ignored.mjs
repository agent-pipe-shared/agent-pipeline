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
 * Only the first three fail the check, unless a finding is a listed pair of the
 * tracked accepted-debt baseline (PO decision D106, ACCEPTED_DEBT_PATH): a listed
 * pair is reported as severity "accepted" until its due date; past it the pair is
 * REQ-EVIDENCE-DEBT-EXPIRED, and a listed pair that is no longer a finding is
 * REQ-EVIDENCE-DEBT-STALE, so the list can only shrink. A new pair is always an
 * error. Scope is declared, not discovered:
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

export function checkRequiredEvidenceNotIgnored({
  rootDir, referrerPatterns = REFERRER_PATTERNS, debtPath = ACCEPTED_DEBT_PATH, today: today_ = new Date(),
} = {}) {
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

  // D106: subtract the named, expiring accepted baseline. A finding that is not
  // listed stays an error; a listed pair is advisory until its due date; a listed
  // pair that is no longer a finding is stale. The list can therefore only shrink.
  const today = normalizeDay(today_);
  const debt = loadAcceptedDebt({ root, tracked, debtPath });
  const gated = [...debt.findings];
  const used = new Set();
  for (const finding of findings) {
    const key = finding.source + "\0" + finding.path;
    const entry = finding.severity === "error" ? debt.byPair.get(key) : undefined;
    if (!entry || entry.code !== finding.code) { gated.push(finding); continue; }
    used.add(key);
    if (today === null || entry.due < today) {
      gated.push({ ...finding, code: "REQ-EVIDENCE-DEBT-EXPIRED", severity: "error", acceptedAs: finding.code, owner: entry.owner, due: entry.due });
    } else {
      gated.push({ ...finding, severity: "accepted", owner: entry.owner, due: entry.due, reason: entry.reason });
    }
  }
  for (const [key, entry] of debt.byPair) {
    if (!used.has(key)) {
      gated.push({ source: entry.source, path: entry.path, code: "REQ-EVIDENCE-DEBT-STALE", severity: "error", acceptedAs: entry.code, owner: entry.owner, due: entry.due });
    }
  }
  return { ok: !gated.some((entry) => entry.severity === "error"), code: "REQ-EVIDENCE-CHECKED", findings: gated };
}

export const ACCEPTED_DEBT_PATH = "harness/config/required-evidence-accepted-debt.v1.json";
export const ACCEPTED_DEBT_SCHEMA = "pipeline.required-evidence-accepted-debt.v1";
const DEBT_CODES = Object.freeze(["REQ-EVIDENCE-GIT-DIR", "REQ-EVIDENCE-IGNORED", "REQ-EVIDENCE-UNTRACKED"]);
const DEBT_ENTRY_KEYS = ["code", "due", "owner", "path", "reason", "source"];
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const DEBT_REASON = Object.freeze({
  "REQ-EVIDENCE-GIT-DIR": "The referrer names a machine-local path inside the git directory; accepted historical debt per D106, cleanup in 0.7.1.",
  "REQ-EVIDENCE-IGNORED": "The referrer names evidence that an ignore rule hides and a clean clone does not have; accepted historical debt per D106, cleanup in 0.7.1.",
  "REQ-EVIDENCE-UNTRACKED": "The referrer names evidence that is neither tracked nor ignored and a clean clone does not have; accepted historical debt per D106, cleanup in 0.7.1.",
});

function validDay(value) {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizeDay(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  return validDay(value) ? value : null;
}

/** Generate the accepted-debt document from real findings; nothing is typed by hand. */
export function buildAcceptedDebt(findings, { due, owner = "Elephant" } = {}) {
  const seen = new Set();
  const entries = [];
  for (const finding of findings) {
    if (!(finding.severity === "error" || finding.severity === "accepted") || !DEBT_CODES.includes(finding.code)) continue;
    const key = finding.source + "\0" + finding.path;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ source: finding.source, path: finding.path, code: finding.code, reason: DEBT_REASON[finding.code], owner, due });
  }
  entries.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { schema: ACCEPTED_DEBT_SCHEMA, entries };
}

function loadAcceptedDebt({ root, tracked, debtPath }) {
  const empty = (finding) => ({ byPair: new Map(), findings: finding ? [finding] : [] });
  const invalid = (detail) => empty({ source: debtPath, path: debtPath, code: "REQ-EVIDENCE-DEBT-INVALID", severity: "error", detail });
  if (!existsSync(resolve(root, debtPath))) return empty(null);
  // The list is itself evidence the gate depends on: it must be in a clean clone.
  if (!tracked.has(debtPath)) {
    return empty({ source: debtPath, path: debtPath, code: "REQ-EVIDENCE-DEBT-UNTRACKED", severity: "error" });
  }
  let doc;
  try { doc = JSON.parse(readFileSync(resolve(root, debtPath), "utf8")); }
  catch { return invalid("not valid JSON"); }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)
    || Object.keys(doc).sort().join("\0") !== "entries\0schema"
    || doc.schema !== ACCEPTED_DEBT_SCHEMA || !Array.isArray(doc.entries)) return invalid("shape or schema");
  const byPair = new Map();
  for (const [position, entry] of doc.entries.entries()) {
    const label = `entries[${position}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join("\0") !== DEBT_ENTRY_KEYS.join("\0")) return invalid(`${label} is not a closed entry`);
    if (![entry.source, entry.path, entry.reason, entry.owner].every((value) => typeof value === "string" && value.trim() !== "")) {
      return invalid(`${label} has an empty source, path, reason or owner`);
    }
    if (!DEBT_CODES.includes(entry.code)) return invalid(`${label}.code is not a listable failing code`);
    if (!validDay(entry.due)) return invalid(`${label}.due is not a YYYY-MM-DD date`);
    const key = entry.source + "\0" + entry.path;
    if (byPair.has(key)) return invalid(`${label} repeats an earlier referrer and target pair`);
    byPair.set(key, entry);
  }
  return { byPair, findings: [] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const result = checkRequiredEvidenceNotIgnored({ rootDir });
  if (process.argv.includes("--emit-accepted-debt")) {
    // Regenerate from the current findings (accepted baseline included), never by hand.
    const dueArg = process.argv.find((arg) => arg.startsWith("--due="))?.slice("--due=".length);
    if (!validDay(dueArg)) {
      process.stderr.write("--emit-accepted-debt needs --due=YYYY-MM-DD\n");
      process.exitCode = 2;
    } else process.stdout.write(JSON.stringify(buildAcceptedDebt(result.findings, { due: dueArg }), null, 2) + "\n");
  } else {
    const counts = {};
    const bySeverity = {};
    for (const entry of result.findings) {
      const key = `${entry.source} ${entry.code} ${entry.severity}`;
      counts[key] = (counts[key] ?? 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] ?? 0) + 1;
    }
    // Default output is a per-referrer summary; --list prints every finding.
    const listed = process.argv.includes("--list") ? result.findings : undefined;
    process.stdout.write(JSON.stringify({ ok: result.ok, code: result.code, bySeverity, counts, findings: listed }, null, 2) + "\n");
    if (!result.ok) process.exitCode = 1;
  }
}

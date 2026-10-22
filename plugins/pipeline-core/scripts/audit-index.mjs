#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Generated audit index: one machine-readable record of the source, commit and
// gate digests behind a change, with every step that cannot be evidenced named
// explicitly as missing (never silently omitted).
//
// Pure and read-only: it hashes files the caller names, runs no git command and
// writes nothing. Transcript text is deliberately not included (data
// minimisation); only digests and presence are indexed.

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const AUDIT_INDEX_SCHEMA = "pipeline.audit-index.v1";

const COMMIT_RE = /^[0-9a-f]{40}$/;

function sha256Of(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Resolve a repository-relative path; anything escaping the root is refused.
function digestRelative(rootDir, rel) {
  if (typeof rel !== "string" || rel === "" || isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) {
    return { status: "refused", sha256: null };
  }
  const root = resolve(rootDir);
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) return { status: "refused", sha256: null };
  try {
    if (!statSync(abs).isFile()) return { status: "missing", sha256: null };
    return { status: "present", sha256: sha256Of(readFileSync(abs)) };
  } catch {
    return { status: "missing", sha256: null };
  }
}

function entries(rootDir, list, idKey) {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      const spec = typeof item === "string" ? { [idKey]: item, path: item } : item;
      return { [idKey]: String(spec?.[idKey] ?? spec?.path ?? ""), path: spec?.path ?? null, ...digestRelative(rootDir, spec?.path) };
    })
    .sort((a, b) => (a[idKey] < b[idKey] ? -1 : a[idKey] > b[idKey] ? 1 : 0));
}

/**
 * @param {object} input
 * @param {string} input.rootDir repository root
 * @param {string[]} [input.sources] repo-relative source/spec/approval paths
 * @param {string} [input.commit] 40-hex commit id
 * @param {{id:string,path:string}[]} [input.gates] gate evidence files
 * @returns {object} index; `complete` is true only when no step is missing
 */
export function buildAuditIndex({ rootDir, sources, commit, gates } = {}) {
  if (typeof rootDir !== "string" || rootDir === "") throw new TypeError("rootDir is required");
  const sourceEntries = entries(rootDir, sources, "path");
  const gateEntries = entries(rootDir, gates, "id");
  const commitEntry =
    typeof commit === "string" && COMMIT_RE.test(commit)
      ? { sha: commit, status: "present" }
      : { sha: null, status: commit === undefined || commit === null || commit === "" ? "missing" : "refused" };

  const missingSteps = [];
  if (sourceEntries.length === 0) missingSteps.push({ step: "sources", reason: "none-declared" });
  for (const s of sourceEntries) {
    if (s.status !== "present") missingSteps.push({ step: `source:${s.path}`, reason: s.status });
  }
  if (commitEntry.status !== "present") missingSteps.push({ step: "commit", reason: commitEntry.status });
  if (gateEntries.length === 0) missingSteps.push({ step: "gates", reason: "none-declared" });
  for (const g of gateEntries) {
    if (g.status !== "present") missingSteps.push({ step: `gate:${g.id}`, reason: g.status });
  }

  return {
    schema: AUDIT_INDEX_SCHEMA,
    sources: sourceEntries,
    commit: commitEntry,
    gates: gateEntries,
    missingSteps,
    complete: missingSteps.length === 0,
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = { sources: [], gates: [], root: process.cwd(), commit: undefined };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === "--root") args.root = value;
    else if (flag === "--commit") args.commit = value;
    else if (flag === "--source") args.sources.push(value);
    else if (flag === "--gate") {
      const eq = typeof value === "string" ? value.indexOf("=") : -1;
      args.gates.push(eq > 0 ? { id: value.slice(0, eq), path: value.slice(eq + 1) } : { id: value, path: value });
    } else {
      process.stderr.write(`unknown argument: ${flag}\n`);
      process.exitCode = 2;
      return;
    }
  }
  const index = buildAuditIndex({ rootDir: args.root, sources: args.sources, commit: args.commit, gates: args.gates });
  process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
  process.exitCode = index.complete ? 0 : 1;
}

if (isDirectInvocation(import.meta.url)) main();

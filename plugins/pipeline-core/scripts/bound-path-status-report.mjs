#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Bounded, read-only, warn-only close report: lists the State fields that bind a file by
// digest with their tracked/ignored/untracked/modified status (ADR-0063 amendment,
// backlog item 2026-10-06-approval-bound-design-package-lives-in-an-ignored-directory).
// Mirrors scratch-custody-check.mjs: it never writes and always exits 0.
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listBoundPathStatuses, renderHandoverBoundPaths } from "../lib/bound-path-status.mjs";

const SCHEMA = "pipeline.bound-path-status-report.v1";
const DEFAULT_STATE = "project/pipeline-state.json";

function usage() {
  process.stderr.write("Usage: bound-path-status-report.mjs --root <repo> [--state <path>]\n");
}
function parse(argv) {
  let root = null;
  let state = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root" && root === null && argv[i + 1] && !argv[i + 1].startsWith("--")) root = argv[++i];
    else if (argv[i] === "--state" && state === null && argv[i + 1] && !argv[i + 1].startsWith("--")) state = argv[++i];
    else return null;
  }
  return root ? { root, state } : null;
}
function emit(report) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
function unavailable(code) {
  emit({ schema: SCHEMA, mode: "report-only", ok: false, warnings: [{ code }], failures: [] });
  process.stderr.write("[bound-path-status] WARN: bound-path report unavailable; no close gate was changed.\n");
}

function main(argv) {
  const args = parse(argv);
  if (!args) { usage(); return unavailable("usage"); }
  try {
    const root = resolve(args.root);
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root) throw new Error("unsafe root");
    const statePath = args.state ? (isAbsolute(args.state) ? args.state : resolve(root, args.state)) : resolve(root, DEFAULT_STATE);
    const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
    const result = listBoundPathStatuses({ repoRoot: root, state });
    process.stdout.write(`${renderHandoverBoundPaths(result)}\n`);
    emit({ schema: SCHEMA, mode: "report-only", ok: result.ok, entries: result.entries.length, failures: result.failures, deviceLocal: result.deviceLocal.length });
    // Findings are WARN/report-only. They never refuse a close.
    if (!result.ok) process.stderr.write(`[bound-path-status] WARN: ${result.failures.length} bound path(s) not tracked and clean; review the typed report.\n`);
  } catch {
    unavailable("observer-unavailable");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Bounded, report-only command used after a handover update and by guard-push.
import { lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reportScratchCustody } from "../lib/scratch-custody-report.mjs";

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
function usage() {
  process.stderr.write("Usage: scratch-custody-check.mjs --root <repo> [--push-commit <full-oid>]\n");
  process.exitCode = 2;
}
function main(argv) {
  let root = null;
  let pushCommit = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root" && root === null && argv[i + 1] && !argv[i + 1].startsWith("--")) root = argv[++i];
    else if (argv[i] === "--push-commit" && pushCommit === null && argv[i + 1] && !argv[i + 1].startsWith("--")) pushCommit = argv[++i];
    else return usage();
  }
  if (!root || (pushCommit !== null && !OID.test(pushCommit))) return usage();
  try {
    const absolute = resolve(root);
    const stat = lstatSync(absolute);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(absolute) !== absolute) throw new Error("unsafe root");
    const report = reportScratchCustody({ root: absolute, pushCommit });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    // Findings are WARN/report-only. They never refuse a close or push.
    if (report.warnings.length) process.stderr.write(`[scratch-custody] WARN: ${report.warnings.length} custody finding(s); review the typed report.\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({ schema: "pipeline.scratch-custody-report.v1", mode: "report-only", warnings: [{ code: "observer-unavailable" }], views: [] })}\n`);
    process.stderr.write("[scratch-custody] WARN: custody report unavailable; no close or push gate was changed.\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

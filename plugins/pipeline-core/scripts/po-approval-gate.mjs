#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Public control-plane half of a PO approval.
 *
 * It may prepare and verify public candidate-bound artifacts, but deliberately
 * cannot set up an authority, access a private key, or sign an intent. Those
 * actions remain in po-human-approval.mjs on the approving human's terminal.
 */
import { pathToFileURL } from "node:url";

import { parseHumanArgs, runHumanApproval } from "./po-human-approval.mjs";

const USAGE = "Usage: po-approval-gate.mjs prepare --repo-root <repo> --directory <external-dir> [--feature-id <id>] | prepare-all --repo-root <repo> --directory <external-dir> | verify --repo-root <repo> --directory <external-dir> [--feature-id <id>] | verify-all --repo-root <repo> --directory <external-dir> | prepare-critical --repo-root <repo> --directory <external-dir> --feature-id <id> --plan <repo-path> --spec <repo-path> --kind <push|deploy|publication> --subject-sha256 <sha256> --expires-at <ISO-8601> | verify-critical --repo-root <repo> --directory <external-dir> --kind <push|deploy|publication>";

export function parseGateArgs(argv) {
  const parsed = parseHumanArgs(argv);
  if (parsed.error || !new Set(["prepare", "prepare-all", "verify", "verify-all", "prepare-critical", "verify-critical"]).has(parsed.command)) return { error: USAGE };
  return parsed;
}

export function run(argv = process.argv.slice(2), dependencies = {}) {
  const parsed = parseGateArgs(argv); if (parsed.error) throw new Error(parsed.error);
  return runHumanApproval(argv, dependencies);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(run(), null, 2)}\n`); } catch (error) { process.stderr.write(`PO-APPROVAL-GATE-FAILED: ${error.message}\n`); process.exitCode = 2; }
}

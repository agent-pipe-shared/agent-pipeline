#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Public control-plane half of a PO approval.
 *
 * It may prepare and verify public candidate-bound artifacts, but deliberately
 * cannot set up an authority, access a private key, or sign an intent. Those
 * actions remain in po-human-approval.mjs on the approving human's terminal.
 */

import { parseHumanArgs, runForkDispositionApproval, runHumanApproval } from "./po-human-approval.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const USAGE = "Usage: po-approval-gate.mjs prepare --repo-root <repo> --directory <external-dir> [--feature-id <id>] | prepare-all --repo-root <repo> --directory <external-dir> | verify --repo-root <repo> --directory <external-dir> [--feature-id <id>] | verify-all --repo-root <repo> --directory <external-dir> | prepare-critical --repo-root <repo> --directory <external-dir> --feature-id <id> --plan <repo-path> --spec <repo-path> --kind <push|deploy|publication> --subject-sha256 <sha256> --expires-at <ISO-8601> | verify-critical --repo-root <repo> --directory <external-dir> --kind <push|deploy|publication> | prepare-fork-disposition --repo-root <repo> --directory <external-dir> --repository-fingerprint <sha256> --stream-id <id> --sequence <n> --expires-at <ISO-8601> | verify-fork-disposition --repo-root <repo> --directory <external-dir> --repository-fingerprint <sha256> --stream-id <id> --sequence <n>";

/**
 * The public half of the fork-disposition ceremony (ADR-0072). Preparation
 * writes only public bytes and verification only reads them, exactly like
 * `prepare`/`verify` — so an agent driving this control plane can reach both.
 * `approve-fork-disposition` is absent on purpose and stays absent: it delegates
 * to the `approve-critical` signing branch, so it reads the private key and
 * belongs on the approving human's terminal, precisely like `setup`, `approve`,
 * `approve-all`, `approve-critical` and `sign-intent`, none of which this script
 * has ever admitted.
 */
const AGENT_FORK_DISPOSITION_COMMANDS = new Set(["prepare-fork-disposition", "verify-fork-disposition"]);
const GATE_COMMANDS = new Set(["prepare", "prepare-all", "verify", "verify-all", "prepare-critical", "verify-critical", ...AGENT_FORK_DISPOSITION_COMMANDS]);

export function parseGateArgs(argv) {
  const parsed = parseHumanArgs(argv);
  if (parsed.error || !GATE_COMMANDS.has(parsed.command)) return { error: USAGE };
  return parsed;
}

/**
 * Returns a promise for the two fork-disposition commands and a plain value for
 * every other one. Not an `async function`: the existing commands are
 * synchronous and their callers consume the result directly, so awaiting is the
 * new caller's job — the same shape `po-human-approval.mjs`'s own entry point
 * uses.
 */
export function run(argv = process.argv.slice(2), dependencies = {}) {
  const parsed = parseGateArgs(argv); if (parsed.error) throw new Error(parsed.error);
  return AGENT_FORK_DISPOSITION_COMMANDS.has(parsed.command)
    ? runForkDispositionApproval(argv, dependencies)
    : runHumanApproval(argv, dependencies);
}

if (isDirectInvocation(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await run(), null, 2)}\n`); } catch (error) { process.stderr.write(`PO-APPROVAL-GATE-FAILED: ${error.message}\n`); process.exitCode = 2; }
}

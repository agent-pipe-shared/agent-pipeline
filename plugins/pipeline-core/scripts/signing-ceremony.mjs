#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Signing Ceremony CLI -- the single entry point Direction step 1 of
 * backlog/items/2026-08-08-the-signing-ceremony-is-designed-for-the-verifier-not-the-signer.md
 * asks for: the PO's own words, after walking the maintenance-window ceremony by
 * hand and needing three attempts, were "ein verlässliches Skript ..., was man
 * immer aufruft und was dann alles sauber managed" (a reliable script you always
 * call, which then manages everything cleanly).
 *
 * This orchestrates the `guard-maintenance-window.mjs` ceremony -- prepare,
 * present, sign, install, verify -- as ONE command, calling the existing,
 * already-reviewed CLI entry points in sequence. It adds NO new cryptography,
 * signature verification, or trust-anchor logic of its own: every security
 * decision still happens inside `guard-maintenance-window.mjs` and
 * `po-human-approval.mjs`, unchanged.
 *
 * Two hard constraints from the backlog item, both preserved by construction:
 *
 *   - The real, attended OpenSSL passphrase prompt is never scripted or
 *     bypassed. STEP 2 below calls the exact same `runHumanApproval(["sign-
 *     intent", ...])` function a human would invoke by hand, with this
 *     process's own inherited stdio -- the confirmation prompt and the OpenSSL
 *     passphrase prompt behave identically to running `po-human-approval.mjs
 *     sign-intent` directly.
 *   - Exactly one human decision point. Only `sign-intent`'s own
 *     `requireExplicitConfirmation()` gate is ever reached; prepare, install and
 *     verify (STEPS 1, 3, 4) run unattended and ask nothing. A cancelled or
 *     mismatched confirmation aborts the whole ceremony before install is ever
 *     attempted -- no maintenance window is opened.
 *
 * Usage:
 *   signing-ceremony.mjs maintenance-window --repo-root <path> --directory <external-dir> \
 *     --scope <ids> --ttl-seconds <n> --reason <text> \
 *     [--feature-id <id>] [--plan <repo-path>] [--spec <repo-path>] \
 *     [--authority <external-public-json>]
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { run as runGuardMaintenanceWindowCli } from "./guard-maintenance-window.mjs";
import { runHumanApproval } from "./po-human-approval.mjs";

const USAGE = "Usage: signing-ceremony.mjs maintenance-window --repo-root <path> --directory <external-dir> --scope <ids> --ttl-seconds <n> --reason <text> [--feature-id <id>] [--plan <repo-path>] [--spec <repo-path>] [--authority <external-public-json>]";

const KNOWN_FLAGS = new Set([
  "repoRoot", "directory", "scope", "ttlSeconds", "reason", "featureId", "plan", "spec", "authority",
]);
const REQUIRED_FLAGS = ["repoRoot", "directory", "scope", "ttlSeconds", "reason"];

/** Same shape/conventions as guard-maintenance-window.mjs's own parseArgs: `--flag value`
 * pairs only, unknown or duplicate flags fail closed to `null` (never a partial parse). */
export function parseSigningCeremonyArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (typeof key !== "string" || !key.startsWith("--")) return null;
    const value = argv[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) return null;
    const normalized = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!KNOWN_FLAGS.has(normalized) || Object.hasOwn(result, normalized)) return null;
    result[normalized] = value;
    index += 1;
  }
  for (const name of REQUIRED_FLAGS) {
    if (typeof result[name] !== "string" || result[name] === "") return null;
  }
  return result;
}

/**
 * Runs the full maintenance-window ceremony end to end.
 *
 * `dependencies.runGuardMaintenanceWindow` and `dependencies.runHumanApproval` are
 * the injectable seams tests use to observe/replace the two underlying CLIs
 * without touching real git state twice; production callers never supply them.
 * `dependencies.signDependencies` is forwarded verbatim to the sign-intent call
 * (e.g. a test's `readConfirmation` override) -- this is the ONLY dependency seam
 * that can influence the ceremony's single decision point, and it can only ever
 * choose who answers the prompt, never remove it: `sign-intent`'s own
 * `requireExplicitConfirmation()` still runs unconditionally in every case.
 * `dependencies.write` overrides the narration sink (default: real stdout).
 */
export function runSigningCeremony(argv = process.argv.slice(2), dependencies = {}) {
  const write = dependencies.write ?? ((line) => { process.stdout.write(`${line}\n`); });
  const [command, ...rest] = argv;
  if (command !== "maintenance-window") throw new Error(USAGE);
  const parsed = parseSigningCeremonyArgs(rest);
  if (parsed === null) throw new Error(USAGE);

  const runGmw = dependencies.runGuardMaintenanceWindow ?? runGuardMaintenanceWindowCli;
  const runSign = dependencies.runHumanApproval ?? runHumanApproval;

  write("STEP 1/4 -- prepare: recording the maintenance-window request (unsigned).");
  const prepareArgv = [
    "prepare", "--repo-root", parsed.repoRoot, "--scope", parsed.scope,
    "--ttl-seconds", parsed.ttlSeconds, "--reason", parsed.reason,
  ];
  if (parsed.featureId) prepareArgv.push("--feature-id", parsed.featureId);
  if (parsed.plan) prepareArgv.push("--plan", parsed.plan);
  if (parsed.spec) prepareArgv.push("--spec", parsed.spec);
  const prepared = runGmw(prepareArgv);
  const { request, intent } = prepared.value;
  write(`  prepared: candidate commit ${intent.value.candidate.commit}, window would expire (signed, absolute) at ${new Date(request.subject.expiresAtMs).toISOString()} -- nothing is signed yet.`);

  write("STEP 2/4 -- present + sign: the confirmation block and the real, attended OpenSSL passphrase prompt follow below. This command never reads or supplies your passphrase.");
  const signed = runSign(
    ["sign-intent", "--repo-root", parsed.repoRoot, "--directory", parsed.directory, "--intent-sha256", intent.sha256],
    dependencies.signDependencies ?? {},
  );
  write(`  signed by ${signed.signer?.humanName ?? signed.signer?.keyReference ?? "the confirmed signer"}.`);

  write("STEP 3/4 -- install: verifying the signature and activating the window.");
  const scratchDir = mkdtempSync(join(tmpdir(), "signing-ceremony-gmw-"));
  try {
    // `install --request` has no externality requirement (unlike `--proof`/`--authority`):
    // it just reads back the exact `request` object STEP 1 already produced, written here
    // so the CLI wrapper's own file-based contract stays unchanged. `proof-manual.json` is
    // the fixed artifact name `sign-intent` always writes to the external `--directory`,
    // regardless of whether it was invoked with `--intent-sha256` or `--request`.
    const requestPath = join(scratchDir, "gmw-request.json");
    writeFileSync(requestPath, JSON.stringify(request), { mode: 0o600 });
    const proofPath = join(resolve(parsed.directory), "proof-manual.json");
    const installArgv = ["install", "--repo-root", parsed.repoRoot, "--request", requestPath, "--proof", proofPath];
    if (parsed.authority) installArgv.push("--authority", parsed.authority);
    const installed = runGmw(installArgv);

    write("STEP 4/4 -- verify: reading the installed window back independently.");
    const status = runGmw(["status", "--repo-root", parsed.repoRoot]);
    if (status.value?.status !== "active") {
      throw new Error(`SIGNING-CEREMONY-VERIFY-FAILED: install reported "${installed.value?.status ?? "unknown"}" but the independent status readback reports "${status.value?.status ?? "unknown"}"`);
    }
    write(`MAINTENANCE WINDOW OPEN: scope=${status.value.scopeRuleIds.join(",")}, expires=${new Date(status.value.expiresAtMs).toISOString()}, candidate=${intent.value.candidate.commit}.`);
    return {
      ok: true,
      code: "SIGNING-CEREMONY-MAINTENANCE-WINDOW-READY",
      prepared: prepared.value,
      signer: signed.signer,
      installed: installed.value,
      status: status.value,
    };
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const result = runSigningCeremony();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`SIGNING-CEREMONY-FAILED: ${error.message}\n`);
    process.exitCode = 2;
  }
}

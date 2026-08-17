#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Guard Maintenance Window CLI — thin transport around lib/guard-maintenance-window.mjs.
 *
 * Same shape/flag conventions as scripts/po-approval-request.mjs: `prepare` emits a
 * public, digest-bound request only; a human signs its intent digest in a separate
 * trusted terminal/device; this program contains no signer and accepts no
 * private-key material; there is no `sign` mode, ever.
 *
 * `install`'s trust policy defaults to this repository's own committed anchor
 * (`project/critical-human-proof.json`'s `trustAnchor` field, the same one push
 * approval already uses) so the ordinary flow needs no extra file. `--authority`
 * overrides that default with an external JSON file for testing or a differently
 * anchored authority; when given, it (like `--proof`) must live OUTSIDE the
 * repository, mirroring po-approval-request.mjs's external-transport discipline for
 * human-produced material. `--request` has no such restriction: it is public,
 * digest-bound data, and the ordinary flow points it at the durable file `prepare`
 * already wrote.
 *
 * Usage:
 *   guard-maintenance-window.mjs prepare --repo-root <path> --scope <ids> \
 *     --ttl-seconds <n> --reason <text> [--feature-id <id>] [--plan <path>] [--spec <path>]
 *   guard-maintenance-window.mjs install --repo-root <path> --request <path> \
 *     --proof <external-public-json> [--authority <external-public-json>]
 *   guard-maintenance-window.mjs status --repo-root <path>
 *   guard-maintenance-window.mjs close --repo-root <path>
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { readPublicRepositoryFile } from "../lib/threat-model-approval-request.mjs";
import { readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { livePluginRoots } from "../hooks/guard-gate-strength.mjs";
import {
  closeGuardMaintenanceWindow,
  currentGuardMaintenanceWindow,
  installGuardMaintenanceWindow,
  prepareGuardMaintenanceWindowRequest,
} from "../lib/guard-maintenance-window.mjs";

/** The plugin root this CLI process is itself running from — index 0 is always the invoking module's own real location (see guard-gate-strength.mjs's `livePluginRoots()`). */
function currentLivePluginRoot() {
  return livePluginRoots()[0] ?? null;
}

export const GMW_POLICY_REVISION = "guard-maintenance-window-v1";
const DEFAULT_FEATURE_ID = "sprint-nova-epic";
const DEFAULT_PLAN = "specs/sprint-nova-epic/prd_sprint-nova-epic.md";
const DEFAULT_SPEC = "specs/sprint-nova-epic/spec.md";

const usage = "Usage: guard-maintenance-window.mjs prepare --repo-root <path> --scope <ids> --ttl-seconds <n> --reason <text> [--feature-id <id>] [--plan <path>] [--spec <path>] | install --repo-root <path> --request <path> --proof <external-public-json> [--authority <external-public-json>] | status --repo-root <path> | close --repo-root <path>";

export function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = { command, repoRoot: process.cwd() };
  const supplied = new Set();
  const known = new Set(["featureId", "plan", "spec", "repoRoot", "scope", "ttlSeconds", "reason", "request", "authority", "proof"]);
  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index];
    if (!key.startsWith("--")) return { error: usage };
    const value = tokens[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) return { error: usage };
    const normalized = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!known.has(normalized) || supplied.has(normalized)) return { error: usage };
    supplied.add(normalized);
    values[normalized] = value;
    index += 1;
  }
  return values;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** `path` must be supplied outside the repository — genuinely external human-produced material. */
function externalJson(repoRoot, path) {
  const root = resolve(repoRoot);
  const source = resolve(path);
  if (source === root || source.startsWith(`${root}/`)) throw new Error("authority and proof must be supplied outside the repository");
  return JSON.parse(readFileSync(source, "utf8"));
}

export function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) throw new Error(args.error);
  const rootDir = resolve(args.repoRoot);

  if (args.command === "prepare") {
    if (!args.scope || !args.ttlSeconds || !args.reason) throw new Error(usage);
    const scopeRuleIds = args.scope.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
    const ttlSeconds = Number(args.ttlSeconds);
    const featureId = args.featureId ?? DEFAULT_FEATURE_ID;
    const planPath = args.plan ?? DEFAULT_PLAN;
    const specPath = args.spec ?? DEFAULT_SPEC;
    const livePluginRoot = currentLivePluginRoot();
    if (livePluginRoot === null) throw new Error("GMW-PLUGIN-SOURCE: no currently-enforcing live plugin root could be identified");
    const { intent, subject, request } = prepareGuardMaintenanceWindowRequest({
      rootDir,
      scopeRuleIds,
      ttlSeconds,
      reason: args.reason,
      featureId,
      planSha256: sha256(readPublicRepositoryFile(rootDir, planPath)),
      specSha256: sha256(readPublicRepositoryFile(rootDir, specPath)),
      policyRevision: GMW_POLICY_REVISION,
      livePluginRoot,
    });
    return { ok: true, value: { request, intent, subject } };
  }

  if (args.command === "install") {
    if (!args.request || !args.proof) throw new Error(usage);
    const request = JSON.parse(readFileSync(resolve(args.request), "utf8"));
    const proof = externalJson(rootDir, args.proof);
    // The shared trustPolicy contract (verifyPoApprovalProof et al.) checks an EXACT
    // {keyReference, publicKeySha256} shape; the external authority file may additionally
    // carry `humanName` (SETUP-1: `po-human-approval.mjs setup --human-name` writes it into
    // the same trust-policy.json this command is documented to be pointed at). Only the two
    // key-identity fields travel into verification -- the same narrowing already applied in
    // pipeline-state.mjs's verifyCriticalHumanProof and po-approval-request.mjs's verify
    // subcommand.
    const trustPolicy = args.authority
      ? (() => {
        const authority = externalJson(rootDir, args.authority);
        return { keyReference: authority?.keyReference, publicKeySha256: authority?.publicKeySha256 };
      })()
      : (() => {
        // NVA-GMWFIX-2: unlike trustAnchorsFor (lib/critical-action-authorization.mjs),
        // the Guard Maintenance Window does NOT treat an absent/empty v3 trustAnchors set
        // as "any well-formed key may sign" -- GMW is the ceremony that LIFTS GS-6/TP-*
        // protection in the first place, so that posture here would make the whole
        // ceremony self-serviceable by an agent, with no human involved
        // (docs/adr/0058-guard-maintenance-window.md). A NON-EMPTY v3 `trustAnchors` SET
        // wins whenever the document carries one; an absent OR EMPTY v3 set falls through
        // to the legacy singular `trustAnchor` field (the fallback for a document that
        // predates v3, or that explicitly carries an empty v3 set), and finally to the
        // fail-closed throw below. installGuardMaintenanceWindow's proof verification
        // accepts either resolved shape: a single anchor object (legacy) or a non-empty
        // anchor array (v3 set) -- and independently refuses an empty resolved set itself
        // (defense in depth), so this branch's own fallthrough is not the only guard.
        const policy = readCriticalHumanProofPolicy(rootDir);
        if (!policy.ok) throw new Error("GMW-TRUST-ANCHOR-MISSING: project/critical-human-proof.json is unreadable or invalid");
        if (Array.isArray(policy.trustAnchors) && policy.trustAnchors.length > 0) return policy.trustAnchors;
        if (policy.trustAnchor !== null) return policy.trustAnchor;
        throw new Error("GMW-TRUST-ANCHOR-MISSING: project/critical-human-proof.json carries no trustAnchor");
      })();
    const livePluginRoot = currentLivePluginRoot();
    if (livePluginRoot === null) throw new Error("GMW-PLUGIN-SOURCE: no currently-enforcing live plugin root could be identified");
    const window = installGuardMaintenanceWindow({ rootDir, request, trustPolicy, proof, livePluginRoot });
    return { ok: true, value: window };
  }

  if (args.command === "status") {
    return { ok: true, value: currentGuardMaintenanceWindow({ rootDir }) };
  }

  if (args.command === "close") {
    return { ok: true, value: closeGuardMaintenanceWindow({ rootDir }) };
  }

  throw new Error(usage);
}

if (isDirectInvocation(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(run(), null, 2)}\n`); } catch (error) { process.stderr.write(`GUARD-MAINTENANCE-WINDOW-FAILED: ${error.message}\n`); process.exitCode = 2; }
}

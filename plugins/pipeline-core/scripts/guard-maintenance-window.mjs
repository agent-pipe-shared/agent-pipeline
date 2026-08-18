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
    // The candidate commit this signature is bound to lives in intent.value.candidate
    // (set by createPoApprovalIntent in lib/po-approval-proof.mjs), not on `subject` --
    // `subject` itself carries no `candidate` field. See backlog item
    // 2026-08-08-a-prepared-maintenance-window-dies-at-the-next-commit.md, option 1:
    // disclose the binding here so the human knows before spending a signature.
    const warning = `This signature is valid only while HEAD stays at ${intent.value.candidate.commit}. Commit nothing between signing and installing.`;
    return { ok: true, value: { request, intent, subject, warning } };
  }

  if (args.command === "install") {
    if (!args.request || !args.proof) throw new Error(usage);
    const request = JSON.parse(readFileSync(resolve(args.request), "utf8"));
    const proof = externalJson(rootDir, args.proof);
    // The committed identity is a SET (ADR-0056's 2026-08-16 correction), so `install`
    // resolves anchors exactly the way currentGuardMaintenanceWindow already does: a v3
    // `trustAnchors` is used as written, EMPTY INCLUDED -- an explicit empty v3 set is not
    // "no anchor", it is the "any well-formed key may sign" posture, and refusing it here
    // would block a deliberately-configured repository from ever installing a window. A
    // v1/v2 document's single `trustAnchor` is wrapped as a set of one (identical
    // behaviour to before), and only a document with no anchor concept at all still
    // refuses. `--authority` keeps its precedence and its single-anchor external file
    // shape; it is merely wrapped as a one-element set for the array-based lib signature.
    const anchors = args.authority
      ? [externalJson(rootDir, args.authority)]
      : (() => {
        const policy = readCriticalHumanProofPolicy(rootDir);
        const resolved = !policy.ok
          ? null
          : (policy.trustAnchors !== null ? policy.trustAnchors : (policy.trustAnchor === null ? null : [policy.trustAnchor]));
        if (resolved === null) throw new Error("GMW-TRUST-ANCHOR-MISSING: project/critical-human-proof.json carries no trustAnchor");
        return resolved;
      })();
    const livePluginRoot = currentLivePluginRoot();
    if (livePluginRoot === null) throw new Error("GMW-PLUGIN-SOURCE: no currently-enforcing live plugin root could be identified");
    const window = installGuardMaintenanceWindow({ rootDir, request, anchors, proof, livePluginRoot });
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

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
 *     --proof <external-public-json> --plan <repo-path> --spec <repo-path> \
 *     [--authority <external-public-json>]
 *   guard-maintenance-window.mjs status --repo-root <path>
 *   guard-maintenance-window.mjs close --repo-root <path>
 *
 * PHX-WP-GMW-LEDGER-EMISSION (backlog/items/2026-08-07-gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger.md,
 * PO decision 2026-08-18; design specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md
 * §6/§7.1/§7.4): `install` and `close` additionally emit portable PHX-2 governance-ledger
 * events -- GMW's own machine-local `window.json`/`request.json` storage is UNCHANGED
 * (still overwritten/unlinked exactly as before); this is additive emission, not a
 * storage redesign. The intake lives here, in the CLI, and NOT inside
 * `lib/guard-maintenance-window.mjs`'s `installGuardMaintenanceWindow`/
 * `closeGuardMaintenanceWindow` themselves, because the ledger append
 * (`appendHumanGovernanceDecision`) is async and those two library functions are
 * synchronous -- changing their signatures is exactly the risk the design's own §7.1
 * declines to take against a module finalized in a separate session. `install` now
 * REQUIRES `--plan`/`--spec` (both already parsed -- `parseArgs` has always shared one
 * option set across every command -- only `install`'s own branch never read them before
 * this change): `scope.artifacts` is a required, non-empty field of the portable
 * decision shape, and the intake fails closed on a plan/spec digest mismatch against the
 * signed intent BEFORE `installGuardMaintenanceWindow` ever runs, exactly as the design's
 * §7.4 requires. `close` reads the about-to-be-closed window's ledger identity
 * (`currentGuardMaintenanceWindow`'s `intentSha256` field) before narrowing, then
 * best-effort appends a `revoked` disposition; a ledger append failure at `close` never
 * blocks or reverses the file-level narrowing itself (§8.1's "fail open toward
 * narrowing").
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
import { canonicalSha256, parseStrictJson } from "../lib/governance-event.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { appendHumanGovernanceDecision, queryHumanGovernanceDecisions } from "../lib/human-governance-ledger.mjs";
import {
  WINDOW_REASON_CODE_CLOSED,
  WINDOW_REASON_CODE_NOT_ARMED,
  buildAppendIntent,
  buildWindowGrantDecision,
  buildWindowRequestDecision,
  buildWindowRevocationDecision,
  requestDecisionId,
} from "../lib/guard-authority-ledger-intake.mjs";

/** The plugin root this CLI process is itself running from — index 0 is always the invoking module's own real location (see guard-gate-strength.mjs's `livePluginRoots()`). */
function currentLivePluginRoot() {
  return livePluginRoots()[0] ?? null;
}

export const GMW_POLICY_REVISION = "guard-maintenance-window-v1";
const DEFAULT_FEATURE_ID = "sprint-nova-epic";
const DEFAULT_PLAN = "specs/sprint-nova-epic/prd_sprint-nova-epic.md";
const DEFAULT_SPEC = "specs/sprint-nova-epic/spec.md";

const usage = "Usage: guard-maintenance-window.mjs prepare --repo-root <path> --scope <ids> --ttl-seconds <n> --reason <text> [--feature-id <id>] [--plan <path>] [--spec <path>] | install --repo-root <path> --request <path> --proof <external-public-json> --plan <repo-path> --spec <repo-path> [--authority <external-public-json>] | status --repo-root <path> | close --repo-root <path>";

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

// ---------------------------------------------------------------------------------
// PHX-WP-GMW-LEDGER-EMISSION: install/close ledger wiring. Mirrors
// scripts/human-authority-grant.mjs's own `repositoryFingerprintFor`/
// `capturePolicyDigestFor` local helpers exactly (small, owned by each CLI script --
// same DUPLICATION NOTE discipline lib/guard-maintenance-window.mjs already documents
// at its own top for its physical-safety primitives).
// ---------------------------------------------------------------------------------

/** The AUTHORITATIVE repository identity -- never the raw `--repo-root` string. */
function repositoryFingerprintFor(rootDir) {
  const repo = discoverRepository(rootDir);
  return { repo, fingerprint: derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot }) };
}

function capturePolicyDigestFor(primaryRoot) {
  let bytes;
  try { bytes = readPublicRepositoryFile(primaryRoot, "governance/events/capture-policy.json"); }
  catch { throw new Error("GMW-CAPTURE-POLICY-MISSING: this checkout has no governance/events/capture-policy.json (not a Phoenix-governed project)"); }
  return canonicalSha256(parseStrictJson(bytes));
}

/**
 * §7.3/§7.4: the live grant (if any) already linked to `reqId` -- "live" means
 * `granted` and not yet the target of any `consumed`/`revoked`/`superseded`/
 * `corrected` disposition among the same decisions. In the normal, non-racing
 * sequential flow this file implements (the full §7.3 concurrent-race
 * byte-identical-adoption logic is deliberately not implemented -- a losing
 * concurrent racer fails closed on the store's own idempotency-conflict check
 * instead, which is still "no window arms without a matching ledger trail"),
 * at most one such grant exists at a time.
 */
function findLiveWindowGrant(decisions, reqId) {
  const grants = decisions.filter((entry) => entry.event === "granted" && entry.outcome === "granted" && entry.links.requestDecisionId === reqId);
  return grants.find((grant) => !decisions.some((entry) => Object.values(entry.links).includes(grant.decisionId)
    && ["consumed", "revoked", "superseded", "corrected"].includes(entry.event))) ?? null;
}

/** Parses the trailing `-<g>` generation out of a `gmw-grant-<i32>-<g>` decisionId, rather than assuming list order. */
function generationOf(decisionId) {
  const match = /-(\d+)$/u.exec(decisionId);
  if (!match) throw new Error(`GMW-LEDGER-DECISION-ID: cannot parse a generation out of ${decisionId}`);
  return Number(match[1]);
}

/**
 * Builds the §7.2 append intent for one already-built window decision and appends
 * it. Whether a failure here is fail-closed (install's pre-arm requested/granted
 * pair) or best-effort (a revocation disposition) is entirely the caller's own
 * try/catch discipline -- this helper itself never swallows an error.
 */
async function appendWindowDecision({ repositoryRoot, repositoryFingerprint, decision, occurredAtEpochMs, featureId, requestId, capturePolicyDigest }) {
  const intent = buildAppendIntent({
    decision, repositoryFingerprint, occurredAtEpochMs, featureId, requestId, capturePolicyDigest,
  });
  return appendHumanGovernanceDecision({ repositoryRoot, repositoryFingerprint, intent });
}

export async function run(argv = process.argv.slice(2)) {
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
    if (!args.request || !args.proof || !args.plan || !args.spec) throw new Error(usage);
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

    // PHX-WP-GMW-LEDGER-EMISSION (design §7.4): append `requested`+`granted` to the
    // portable human-governance ledger BEFORE arming, using the AUTHORITATIVE repository
    // identity -- never the raw `rootDir` string (the same F2 discipline
    // scripts/human-authority-grant.mjs already applies).
    const { repo, fingerprint } = repositoryFingerprintFor(rootDir);
    const nowMs = Date.now();
    const intentSha256 = request?.intent?.sha256;
    const plan = { path: args.plan, sha256: sha256(readPublicRepositoryFile(repo.primaryRoot, args.plan)) };
    const spec = { path: args.spec, sha256: sha256(readPublicRepositoryFile(repo.primaryRoot, args.spec)) };
    const capturePolicyDigest = capturePolicyDigestFor(repo.primaryRoot);
    const featureId = typeof request?.intent?.value?.featureId === "string" ? request.intent.value.featureId : null;
    const builderRequest = {
      intent: request?.intent, subject: request?.subject, repositoryFingerprint: fingerprint,
      installedAtMs: nowMs, plan, spec, authorityClass: "product-owner",
    };

    const reqId = requestDecisionId({ intentSha256 });
    const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint });
    const liveGrant = findLiveWindowGrant(decisions, reqId);
    let justAppendedGrant = null;
    const ledger = [];
    if (liveGrant === null) {
      // Step (b): appended once per signed request, skipped on every later install of
      // the same live-or-not-yet-disposed request (§6/§7.3).
      if (!decisions.some((entry) => entry.decisionId === reqId)) {
        const requestedDecision = buildWindowRequestDecision(builderRequest);
        ledger.push(await appendWindowDecision({
          repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint, decision: requestedDecision,
          occurredAtEpochMs: nowMs, featureId, requestId: intentSha256, capturePolicyDigest,
        }));
      }
      // Step (c): `g` is the number of grants already linked to this request (§7.3).
      const generation = decisions.filter((entry) => entry.event === "granted" && entry.links.requestDecisionId === reqId).length;
      const grantDecision = buildWindowGrantDecision({ ...builderRequest, generation });
      ledger.push(await appendWindowDecision({
        repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint, decision: grantDecision,
        occurredAtEpochMs: nowMs, featureId, requestId: intentSha256, capturePolicyDigest,
      }));
      justAppendedGrant = { decision: grantDecision, generation };
    }

    // Step (d)/(e): verify-and-arm. A pre-arm ledger append failure above already fails
    // this whole command closed -- installGuardMaintenanceWindow is never reached, so no
    // window arms without a matching ledger trail. Once a grant WAS appended here, an
    // install failure gets a best-effort `revoked` (NOT_ARMED) disposition; that append
    // failing must never mask the original, more important install error.
    let window;
    try {
      window = installGuardMaintenanceWindow({ rootDir, request, anchors, proof, livePluginRoot, nowMs });
    } catch (error) {
      if (justAppendedGrant !== null) {
        try {
          const revocation = buildWindowRevocationDecision({
            grant: justAppendedGrant.decision, intentSha256, generation: justAppendedGrant.generation,
            reasonCode: WINDOW_REASON_CODE_NOT_ARMED,
          });
          await appendWindowDecision({
            repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint, decision: revocation,
            occurredAtEpochMs: Date.now(), featureId, requestId: intentSha256, capturePolicyDigest,
          });
        } catch { /* best-effort; never mask the original install failure below */ }
      }
      throw error;
    }
    return { ok: true, value: window, ledger };
  }

  if (args.command === "status") {
    return { ok: true, value: currentGuardMaintenanceWindow({ rootDir }) };
  }

  if (args.command === "close") {
    // Capture the about-to-be-closed window's ledger identity BEFORE narrowing --
    // closeGuardMaintenanceWindow unlinks window.json, and intentSha256 is only
    // readable while it still exists.
    let priorWindow;
    try { priorWindow = currentGuardMaintenanceWindow({ rootDir }); } catch { priorWindow = { status: "absent" }; }
    // §8.1 "fail open toward narrowing": this call always runs, unconditionally, and its
    // outcome is returned regardless of whether the ledger append below succeeds.
    const result = closeGuardMaintenanceWindow({ rootDir });
    let ledger = null;
    if ((priorWindow.status === "active" || priorWindow.status === "expired") && typeof priorWindow.intentSha256 === "string") {
      try {
        const { repo, fingerprint } = repositoryFingerprintFor(rootDir);
        const intentSha256 = priorWindow.intentSha256;
        const reqId = requestDecisionId({ intentSha256 });
        const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint });
        const liveGrant = findLiveWindowGrant(decisions, reqId);
        if (liveGrant === null) {
          ledger = { appended: false, code: "GMW-LEDGER-NO-LIVE-GRANT" };
        } else {
          const revocation = buildWindowRevocationDecision({
            grant: liveGrant, intentSha256, generation: generationOf(liveGrant.decisionId), reasonCode: WINDOW_REASON_CODE_CLOSED,
          });
          const receipt = await appendWindowDecision({
            repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint, decision: revocation,
            occurredAtEpochMs: Date.now(), featureId: null, requestId: intentSha256,
            capturePolicyDigest: capturePolicyDigestFor(repo.primaryRoot),
          });
          ledger = { appended: true, receipt };
        }
      } catch (error) {
        ledger = { appended: false, code: error.code ?? "GMW-LEDGER-CLOSE-FAILED" };
      }
    }
    return { ok: true, value: result, ledger };
  }

  throw new Error(usage);
}

if (isDirectInvocation(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await run(), null, 2)}\n`); } catch (error) { process.stderr.write(`GUARD-MAINTENANCE-WINDOW-FAILED: ${error.message}\n`); process.exitCode = 2; }
}

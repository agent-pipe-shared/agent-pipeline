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
 *     --ttl-seconds <n> --reason <text> --authorship-mode <goldfish-dispatch|elephant-direct> \
 *     [--files-changed <n> --diff-lines <n> --touches-test-file <true|false>] \
 *     [--feature-id <id>] [--plan <path>] [--spec <path>]
 *   guard-maintenance-window.mjs install --repo-root <path> --request <path> \
 *     --proof <external-public-json> --plan <repo-path> --spec <repo-path> \
 *     [--authority <external-public-json>] [--attribution-key-file <external-path>]
 *   guard-maintenance-window.mjs status --repo-root <path>
 *   guard-maintenance-window.mjs close --repo-root <path>
 *
 * PHX-WP-HAC11-D1-GMW-WIRING (design §5.4, Increment 2/D-1): `install` additionally,
 * ONLY when `--attribution-key-file` is supplied, appends ONE restricted machine-local
 * `pipeline.human-decision-attribution.v1` event carrying the free-text rationale and the
 * verified signer's `{keyReference, publicKeySha256}` -- the two values §5.1 keeps out of
 * the portable ledger entirely. This is additive enrichment, never a required part of
 * install: absent the flag, behavior is byte-identical to before this change, and even
 * when present, a failure appending the restricted record (bad key length, store error,
 * anything) is caught and reported on a new `attribution` field on the returned value,
 * never thrown, never unarming the window or masking `install`'s own success. `close`
 * is unchanged -- §5.4 scopes D-1 to `install` only.
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
 *
 * PHX-WP-GMW-PREPARE-AUTHORSHIP (backlog/items/2026-08-19-gmw-prepare-cli-authorship-mode-invalid-on-every-call.md):
 * `prepare` now forwards `authorshipMode`/`stage0Selfcheck` to
 * `prepareGuardMaintenanceWindowRequest`, which PHX-WP-STAGE0-SELFCHECK made mandatory
 * (`lib/guard-maintenance-window.mjs`'s `assertStage0Declaration`) -- before this change
 * `prepare` failed `GMW-AUTHORSHIP-MODE-INVALID` on every real invocation because the CLI
 * never supplied either field. `--authorship-mode` is now required and must be exactly
 * `"goldfish-dispatch"` or `"elephant-direct"` (`AUTHORSHIP_MODES`, unchanged library
 * closed set). `--files-changed`/`--diff-lines`/`--touches-test-file` carry EL-01's
 * stage-0 self-check shape and are required only when `--authorship-mode
 * elephant-direct` is given -- for `goldfish-dispatch` they are ignored (the library
 * itself records `stage0Selfcheck: null` for that mode). This is CLI wiring only; the
 * library's own validation logic (`assertStage0Declaration`) is untouched.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { readPublicRepositoryFile } from "../lib/threat-model-approval-request.mjs";
import { USER_SOURCE_PATH, readCriticalHumanProofPolicy, readHumanApprovalMode } from "../lib/critical-human-proof-policy.mjs";
import { livePluginRoots } from "../hooks/guard-gate-strength.mjs";
import {
  closeGuardMaintenanceWindow,
  currentGuardMaintenanceWindow,
  installGuardMaintenanceWindow,
  prepareGuardMaintenanceWindowRequest,
} from "../lib/guard-maintenance-window.mjs";
import { canonicalSha256, parseStrictJson, sealGovernanceEvent } from "../lib/governance-event.mjs";
import { createRestrictedAuthorization, putRestrictedGovernanceEvent, readLocalRepositoryFingerprint } from "../lib/governance-event-store.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { appendHumanGovernanceDecision, queryHumanGovernanceDecisions } from "../lib/human-governance-ledger.mjs";
import {
  WINDOW_PACKAGE_ID,
  WINDOW_REASON_CODE_CLOSED,
  WINDOW_REASON_CODE_NOT_ARMED,
  buildAppendIntent,
  buildWindowAttributionEvent,
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

const usage = "Usage: guard-maintenance-window.mjs prepare --repo-root <path> --scope <ids> --ttl-seconds <n> --reason <text> --authorship-mode <goldfish-dispatch|elephant-direct> [--files-changed <n> --diff-lines <n> --touches-test-file <true|false>] [--feature-id <id>] [--plan <path>] [--spec <path>] | install --repo-root <path> --request <path> --proof <external-public-json> --plan <repo-path> --spec <repo-path> [--authority <external-public-json>] [--attribution-key-file <external-path>] | status --repo-root <path> | close --repo-root <path>";

export function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = { command, repoRoot: process.cwd() };
  const supplied = new Set();
  const known = new Set(["featureId", "plan", "spec", "repoRoot", "scope", "ttlSeconds", "reason", "request", "authority", "proof", "attributionKeyFile", "authorshipMode", "filesChanged", "diffLines", "touchesTestFile"]);
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
// PHX-WP-HAC11-D1-GMW-WIRING: restricted attribution wiring (design §5.4, D-1).
// ---------------------------------------------------------------------------------

/** `path` must be supplied outside the repository — mirrors `externalJson`'s boundary discipline, but the restricted-zone key is raw bytes, never JSON. */
function externalKeyFile(repoRoot, path) {
  const root = resolve(repoRoot);
  const source = resolve(path);
  if (source === root || source.startsWith(`${root}/`)) throw new Error("attribution key file must be supplied outside the repository");
  const bytes = readFileSync(source);
  if (bytes.byteLength !== 32) {
    const error = new Error("attribution key file must contain exactly 32 bytes");
    error.code = "GMW-ATTRIBUTION-KEY-LENGTH";
    throw error;
  }
  return bytes;
}

/** Pinned string; the restricted store's own `keyGeneration` shape check requires one, and there is no library default. */
const ATTRIBUTION_KEY_GENERATION = "gmw-attribution-v1";

// 180 days: design §5.4 states no library default exists for D-1 retention -- this is
// this dispatch's own judgment call (PHX-WP-HAC11-D1-GMW-WIRING), documented in its
// final report. Long enough that a later audit of a maintenance-window install still
// finds the attribution record; short enough to respect the restricted zone's own
// "erasable, machine-local, minimized" design intent (§3.4) rather than defaulting to
// an effectively-unbounded retention.
const ATTRIBUTION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * The restricted store's root: genuinely outside the repository (required by
 * governance-event-store.mjs's GES-RESTRICTED-IN-REPOSITORY check), keyed by the
 * authoritative repository fingerprint so distinct repositories never collide. No new
 * CLI flag carries this path -- this briefing named only `--attribution-key-file` --
 * so this mirrors the codebase's own existing outside-repo convention
 * (external-push-ledger.mjs's `join(homedir(), ".pipeline", ...)`) rather than
 * inventing a second one. Documented as a deviation in this dispatch's final report.
 */
function attributionStoreRoot(fingerprint) {
  return join(homedir(), ".pipeline", "governance-restricted", "guard-maintenance-window", fingerprint);
}

/**
 * Best-effort, fail-open enrichment (design §5.4). A failure here — bad key length,
 * store error, encryption error, anything — must never fail `install`, never unarm the
 * already-armed window, and never replace `install`'s own success return value; it is
 * only ever surfaced on the returned `attribution` field, mirroring the `close` branch's
 * own best-effort ledger try/catch shape elsewhere in this file.
 */
async function appendWindowAttribution({ repo, fingerprint, rationale, reasonCode, proof, nowMs, keyFilePath }) {
  try {
    const key = externalKeyFile(repo.primaryRoot, keyFilePath);
    const draft = buildWindowAttributionEvent({
      repositoryFingerprint: fingerprint,
      packageId: WINDOW_PACKAGE_ID,
      authorityClass: "product-owner",
      reasonCode,
      rationale,
      // The verified signer identity, read rather than re-derived: `proof.keyReference`
      // is the claim `verifyAgainstTrustAnchors` already matched, and
      // sha256(proof.publicKey) is PROVABLY equal to the trust anchor's own verified
      // `publicKeySha256` once `installGuardMaintenanceWindow` has already returned
      // without throwing -- `verifyPoApprovalProof` (lib/po-approval-proof.mjs) requires
      // exactly that equality to accept in every posture (empty or populated anchor set).
      // This reads the already-verified value; it does not duplicate unverified logic.
      keyReference: proof.keyReference,
      publicKeySha256: sha256(proof.publicKey),
      occurredAtEpochMs: nowMs,
    });
    const sealed = sealGovernanceEvent(draft);
    const expiresAtEpochMs = nowMs + ATTRIBUTION_RETENTION_MS;
    const storeRoot = attributionStoreRoot(fingerprint);
    const authorization = createRestrictedAuthorization({ key, repositoryFingerprint: fingerprint, operation: "put" });
    const stored = await putRestrictedGovernanceEvent({
      repositoryRoot: repo.primaryRoot, storeRoot, repositoryFingerprint: fingerprint,
      authorization, key, keyGeneration: ATTRIBUTION_KEY_GENERATION, expiresAtEpochMs, event: sealed,
    });
    return { appended: true, recordId: stored.recordId, expiresAtEpochMs: stored.expiresAtEpochMs };
  } catch (error) {
    return { appended: false, code: error.code ?? "GMW-ATTRIBUTION-FAILED" };
  }
}

// ---------------------------------------------------------------------------------
// PHX-WP-GMW-LEDGER-EMISSION: install/close ledger wiring. Mirrors
// scripts/human-authority-grant.mjs's own `repositoryFingerprintFor`/
// `capturePolicyDigestFor` local helpers exactly (small, owned by each CLI script --
// same DUPLICATION NOTE discipline lib/guard-maintenance-window.mjs already documents
// at its own top for its physical-safety primitives).
// ---------------------------------------------------------------------------------

/**
 * The AUTHORITATIVE repository identity -- never the raw `--repo-root` string,
 * and (NVA-REPOID-3) never the path-derived `derivePoGateRepositoryFingerprint`
 * hash either. Every governance-event-store.mjs call below requires the
 * store's own bound identity (`readLocalRepositoryFingerprint`,
 * bind-on-first-use, f7623bca) -- passing the legacy derived hash instead
 * fails every one of them closed with GES-CROSS-REPOSITORY, aborting `install`
 * before the window ever arms (confirmed empirically by this dispatch,
 * NVA-REPOID-3, against this file's own guard-maintenance-window.test.mjs).
 */
async function repositoryFingerprintFor(rootDir) {
  const repo = discoverRepository(rootDir);
  return { repo, fingerprint: await readLocalRepositoryFingerprint({ repositoryRoot: repo.primaryRoot }) };
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
    if (!args.scope || !args.ttlSeconds || !args.reason || !args.authorshipMode) throw new Error(usage);
    const scopeRuleIds = args.scope.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
    const ttlSeconds = Number(args.ttlSeconds);
    const featureId = args.featureId ?? DEFAULT_FEATURE_ID;
    const planPath = args.plan ?? DEFAULT_PLAN;
    const specPath = args.spec ?? DEFAULT_SPEC;
    const authorshipMode = args.authorshipMode;
    // stage0Selfcheck is only meaningful (and only required) for "elephant-direct" --
    // mirrors lib/guard-maintenance-window.mjs's own conditional requirement
    // (assertStage0Declaration); for "goldfish-dispatch" these three flags are simply
    // ignored even if supplied, exactly as the library records `stage0Selfcheck: null`
    // for that mode regardless of what is passed in.
    let stage0Selfcheck = null;
    if (authorshipMode === "elephant-direct") {
      if (args.filesChanged === undefined || args.diffLines === undefined || args.touchesTestFile === undefined) throw new Error(usage);
      if (args.touchesTestFile !== "true" && args.touchesTestFile !== "false") throw new Error(usage);
      stage0Selfcheck = {
        filesChanged: Number(args.filesChanged),
        diffLines: Number(args.diffLines),
        touchesTestFile: args.touchesTestFile === "true",
      };
    }
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
      authorshipMode,
      stage0Selfcheck,
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
    const configuredApproval = readHumanApprovalMode(rootDir);
    const globalChat = configuredApproval.mode === "chat"
      && configuredApproval.scope === "global"
      && configuredApproval.source === USER_SOURCE_PATH;
    if (!args.request || !args.plan || !args.spec || (!globalChat && !args.proof)) throw new Error(usage);
    const request = JSON.parse(readFileSync(resolve(args.request), "utf8"));
    const proof = globalChat ? null : externalJson(rootDir, args.proof);
    // The shared trustPolicy contract (verifyAgainstTrustAnchors) checks an EXACT
    // {keyReference, publicKeySha256} shape per anchor; the external authority file may
    // additionally carry `humanName` (SETUP-1: `po-human-approval.mjs setup --human-name`
    // writes it into the same trust-policy.json this command is documented to be pointed
    // at). Only the two key-identity fields travel into verification -- the same
    // narrowing already applied in pipeline-state.mjs's verifyCriticalHumanProof and
    // po-approval-request.mjs's verify subcommand. Wrapped as a one-element set for the
    // array-based lib signature (`anchors`), consistent with every other branch below.
    const anchors = globalChat ? null : args.authority
      ? [(() => {
        const authority = externalJson(rootDir, args.authority);
        return { keyReference: authority?.keyReference, publicKeySha256: authority?.publicKeySha256 };
      })()]
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
        if (policy.trustAnchor !== null) return [policy.trustAnchor];
        throw new Error("GMW-TRUST-ANCHOR-MISSING: project/critical-human-proof.json carries no trustAnchor");
      })();
    const livePluginRoot = currentLivePluginRoot();
    if (livePluginRoot === null) throw new Error("GMW-PLUGIN-SOURCE: no currently-enforcing live plugin root could be identified");

    // PHX-WP-GMW-LEDGER-EMISSION (design §7.4): append `requested`+`granted` to the
    // portable human-governance ledger BEFORE arming, using the AUTHORITATIVE repository
    // identity -- never the raw `rootDir` string (the same F2 discipline
    // scripts/human-authority-grant.mjs already applies).
    const { repo, fingerprint } = await repositoryFingerprintFor(rootDir);
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

    let liveGrant = null;
    let justAppendedGrant = null;
    const ledger = [];
    if (!globalChat) {
      const reqId = requestDecisionId({ intentSha256 });
      const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint });
      liveGrant = findLiveWindowGrant(decisions, reqId);
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

    // PHX-WP-HAC11-D1-GMW-WIRING (design §5.4): additive, best-effort, only when the
    // flag is supplied. Runs AFTER installGuardMaintenanceWindow has already returned
    // without throwing -- never before arming, never inside the fail-closed pre-arm
    // block above.
    let attribution = globalChat ? { status: "chat-attributed-unattested" } : null;
    if (args.attributionKeyFile && !globalChat) {
      const grantReasonCode = justAppendedGrant !== null ? justAppendedGrant.decision.reasonCode : liveGrant.reasonCode;
      attribution = await appendWindowAttribution({
        repo, fingerprint, rationale: request?.subject?.reason, reasonCode: grantReasonCode,
        proof, nowMs, keyFilePath: args.attributionKeyFile,
      });
    }
    return { ok: true, value: window, ledger, attribution };
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
        const { repo, fingerprint } = await repositoryFingerprintFor(rootDir);
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

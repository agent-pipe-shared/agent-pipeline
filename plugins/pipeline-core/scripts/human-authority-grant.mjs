#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Human Authority Grant CLI — the missing entry point for A-AC-04.
 *
 * A-AC-04 (specs/sprint-phoenix-epic/acceptance.md:243-244): "WHEN an agent asks for
 * human authority, THE SYSTEM SHALL correlate the request to the human ledger and
 * SHALL NOT self-confirm it." The correlate-and-cannot-replay half already lives in
 * `guard-git.mjs`'s Phoenix override path (`consumePhoenixOverrideAuthority`). What
 * was missing: no production entry point ever CREATED a granted decision in the
 * ledger in the first place. This script chains three already-tested library
 * functions — `createExternalHumanGovernanceIntent`, `verifyExternalHumanGovernanceProof`,
 * `appendHumanGovernanceDecision` (all in `lib/human-governance-ledger.mjs`) — behind
 * the same prepare -> external-sign -> install ceremony `guard-maintenance-window.mjs`
 * already uses successfully in this repo. No new schema, no new cryptography, no new
 * trust model: the intent/proof shapes and the ledger's own validation are untouched.
 *
 * NO IN-SESSION ACTIVATION STEP, same discipline as guard-maintenance-window.mjs and
 * po-approval-request.mjs: `prepare` is agent-safe and produces only a public,
 * digest-bound request. There is no `sign` mode here — this program contains no
 * signer and never accepts or writes private-key material. `install` is agent-safe
 * but verify-and-append ONLY: it cannot succeed without a genuine detached Ed25519
 * proof, checked against exactly one trust anchor — this repository's own committed
 * `project/critical-human-proof.json` (`readCriticalHumanProofPolicy`), read from
 * the repository's own DISCOVERED root (`discoverRepository(...).primaryRoot`),
 * never from the raw `--repo-root` string a caller supplies. Unlike
 * `guard-maintenance-window.mjs`, this program has NO flag, argument, environment
 * variable, or code path anywhere that lets a caller substitute a different trust
 * anchor while still binding a grant to and appending it into THIS repository:
 * the anchor, the repository fingerprint, and the ledger append destination are
 * all derived from the SAME resolved `repo.primaryRoot`. Pointing `--repo-root`
 * at a different repository (one with its own `.git`) resolves and binds to
 * THAT repository's own anchor, fingerprint, and ledger, consistently — it
 * cannot forge a grant that appears to belong to a repository it does not
 * control. Any verification failure exits non-zero and appends nothing.
 *
 * Usage:
 *   human-authority-grant.mjs prepare --repo-root <path> --decision-id <id> \
 *     --package-id <id> --action <OVERRIDE.rule> --plan <repo-path> --spec <repo-path> \
 *     --ttl-seconds <n> --reason-code <CODE> --policy-digest <sha256> --rule-digest <sha256> \
 *     --request <output-path> [--environment <id>] [--artifacts <comma-separated-repo-paths>] \
 *     [--request-decision-id <id>]
 *   human-authority-grant.mjs install --repo-root <path> --request <path> \
 *     --proof <external-public-json>
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { canonicalSha256, parseStrictJson } from "../lib/governance-event.mjs";
import { readCriticalHumanProofPolicy } from "../lib/critical-human-proof-policy.mjs";
import { readPublicRepositoryFile } from "../lib/threat-model-approval-request.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import {
  appendHumanGovernanceDecision,
  createExternalHumanGovernanceIntent,
  verifyExternalHumanGovernanceProof,
} from "../lib/human-governance-ledger.mjs";

const REQUEST_SCHEMA = "pipeline.human-authority-grant-request.v1";
const UNAVAILABLE = Object.freeze({ state: "not-applicable" });

const usage = "Usage: human-authority-grant.mjs prepare --repo-root <path> --decision-id <id> --package-id <id> --action <OVERRIDE.rule> --plan <repo-path> --spec <repo-path> --ttl-seconds <n> --reason-code <CODE> --policy-digest <sha256> --rule-digest <sha256> --request <output-path> [--environment <id>] [--artifacts <comma-separated-repo-paths>] [--request-decision-id <id>] | install --repo-root <path> --request <path> --proof <external-public-json>";

export function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = { command, repoRoot: process.cwd() };
  const supplied = new Set();
  // NOTE (F1): deliberately no "trustAnchorFile" entry here. `install`'s trust
  // anchor has exactly one source -- this repository's own committed
  // project/critical-human-proof.json -- and it must stay unconditional. A
  // caller-supplied override flag is not merely unused, it is ABSENT from the
  // grammar entirely, so no future edit can wire one back in by accident.
  // NOTE (N2): deliberately no "eventId"/"idempotencyKey" entries here either.
  // `install` always derives both deterministically from `decision.decisionId`
  // (never from caller-supplied values), so accepting them from `prepare` only
  // let the CLI's documented contract diverge from its actual behavior --
  // same "absent from the grammar, not merely unused" principle as F1.
  const known = new Set([
    "repoRoot", "decisionId", "packageId", "action", "environment", "plan", "spec", "artifacts",
    "ttlSeconds", "reasonCode", "policyDigest", "ruleDigest", "requestDecisionId",
    "request", "proof",
  ]);
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

/**
 * `path` must be supplied outside the repository — genuinely external
 * human-produced material.
 *
 * F2 fix: mirrors `guard-maintenance-window.mjs`'s already-correct containment
 * check (`source === root || source.startsWith(`${root}/`)`) instead of the
 * previous `path.relative()` + `rel.startsWith("..")` heuristic. That heuristic
 * misclassified an IN-REPO file whose name literally begins with ".." (e.g.
 * `<repo-root>/..anchor.json`) as external, because `path.relative('/repo',
 * '/repo/..anchor.json')` returns the string `"..anchor.json"`, which starts
 * with ".." without the path ever leaving the root. A direct prefix check has
 * no such blind spot.
 *
 * `primaryRoot` must be the AUTHORITATIVE repository root discovered via
 * `discoverRepository` (`repo.primaryRoot`), never the raw `--repo-root`
 * string a caller supplies: pointing `--repo-root` at a subdirectory of the
 * real repository must not reclassify an actually-in-repo file as external.
 */
function externalJson(primaryRoot, path) {
  const root = resolve(primaryRoot);
  const source = resolve(path);
  if (source === root || source.startsWith(`${root}/`)) throw new Error("HAG-EXTERNAL-REQUIRED: proof must be supplied outside the repository");
  return JSON.parse(readFileSync(source, "utf8"));
}

function artifactFor(rootDir, path) {
  return { path, sha256: sha256(readPublicRepositoryFile(rootDir, path)) };
}

function capturePolicyDigestFor(rootDir) {
  let bytes;
  try { bytes = readPublicRepositoryFile(rootDir, "governance/events/capture-policy.json"); }
  catch { throw new Error("HAG-CAPTURE-POLICY-MISSING: this checkout has no governance/events/capture-policy.json (not a Phoenix-governed project)"); }
  return canonicalSha256(parseStrictJson(bytes));
}

function currentCandidate(primaryRoot) {
  let lines;
  try {
    lines = execFileSync("git", ["-C", primaryRoot, "rev-parse", "HEAD", "HEAD^{tree}"], { encoding: "utf8" }).trim().split("\n");
  } catch { throw new Error("HAG-CANDIDATE: the current repository candidate could not be read"); }
  if (lines.length !== 2) throw new Error("HAG-CANDIDATE: the current repository candidate could not be read");
  return { commit: lines[0], tree: lines[1] };
}

function repositoryFingerprintFor(rootDir) {
  const repo = discoverRepository(rootDir);
  return { repo, fingerprint: derivePoGateRepositoryFingerprint({ gitCommonDir: repo.commonDir, primaryRoot: repo.primaryRoot }) };
}

function runPrepare(args) {
  const rootDir = resolve(args.repoRoot);
  const required = ["decisionId", "packageId", "action", "plan", "spec", "ttlSeconds", "reasonCode", "policyDigest", "ruleDigest", "request"];
  for (const key of required) if (!args[key]) throw new Error(usage);
  const ttlSeconds = Number(args.ttlSeconds);
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) throw new Error("HAG-TTL-INVALID: ttlSeconds must be a positive number");
  const environment = args.environment ?? "local";

  const { repo, fingerprint } = repositoryFingerprintFor(rootDir);
  const candidate = currentCandidate(repo.primaryRoot);

  // F2: read from the AUTHORITATIVE resolved root (`repo.primaryRoot`), never
  // the raw `rootDir` -- the artifact/capture-policy digests shown to the
  // human signer must describe the SAME resolved repository the fingerprint
  // and candidate above already describe, not whatever directory the raw
  // `--repo-root` string happened to name.
  const plan = artifactFor(repo.primaryRoot, args.plan);
  const spec = artifactFor(repo.primaryRoot, args.spec);
  const extraPaths = (args.artifacts ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  const extraArtifacts = extraPaths.map((path) => artifactFor(repo.primaryRoot, path));
  const artifacts = [plan, spec, ...extraArtifacts];

  const nowMs = Date.now();
  const decisionId = args.decisionId;
  const requestDecisionId = args.requestDecisionId ?? `${decisionId}-request`;
  // N2: no caller-supplied override -- `install` always reconstructs both
  // deterministically from `decision.decisionId` and ignores whatever this
  // envelope carries, so deriving them any other way here would just restate
  // the mismatch the removed --event-id/--idempotency-key flags caused.
  const eventId = `${decisionId}-event`;
  const idempotencyKey = `${decisionId}-idempotency`;

  const decision = {
    decisionId,
    event: "granted",
    outcome: "granted",
    authorityClass: "product-owner",
    identityAssurance: "locally-attributed",
    timeAssurance: "locally-observed",
    scope: { repositoryFingerprint: fingerprint, candidate, packageId: args.packageId, action: args.action, environment, artifacts },
    reasonCode: args.reasonCode,
    policyDigest: args.policyDigest,
    ruleDigest: args.ruleDigest,
    validity: { notBeforeEpochMs: nowMs, expiresAtEpochMs: nowMs + Math.round(ttlSeconds * 1000), singleUse: true },
    links: { requestDecisionId, consumesDecisionId: null, revokesDecisionId: null, expiresDecisionId: null, supersedesDecisionId: null, correctsDecisionId: null },
  };

  const capturePolicyDigest = capturePolicyDigestFor(repo.primaryRoot);
  const intent = {
    schema: "pipeline.governance-event-envelope.v1",
    payloadSchema: "pipeline.human-governance-decision.v1",
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventId,
    idempotencyKey,
    origin: "human",
    authorityClass: "human-authority",
    eventType: "human.granted",
    occurredAtEpochMs: nowMs,
    observedAtEpochMs: nowMs,
    timeAssurance: "locally-observed",
    repositoryFingerprint: fingerprint,
    sourceUri: `urn:pipeline:repository:${fingerprint}`,
    streamId: "human",
    correlation: { featureId: UNAVAILABLE, packageId: UNAVAILABLE, requestId: UNAVAILABLE, sessionId: UNAVAILABLE, dispatchId: UNAVAILABLE, traceId: UNAVAILABLE },
    candidate,
    artifacts: [UNAVAILABLE],
    policy: { policyDigest: UNAVAILABLE, configurationDigest: UNAVAILABLE, capturePolicyDigest, redactionPolicyDigest: UNAVAILABLE },
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payload: decision,
  };

  // Built now purely to fail fast on a malformed decision/plan/spec and to obtain
  // the digest a human must sign; install() rebuilds this independently from the
  // stored intent rather than trusting this precomputed copy (defense in depth,
  // same discipline guard-maintenance-window.mjs's install() already uses).
  const externalIntent = createExternalHumanGovernanceIntent({ decision, plan, spec });
  const request = { schema: REQUEST_SCHEMA, intent, plan, spec, externalIntentSha256: externalIntent.sha256 };
  const requestPath = resolve(args.request);
  writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
  return { ok: true, code: "HUMAN-AUTHORITY-GRANT-REQUEST-READY", requestPath, digestToSign: externalIntent.sha256 };
}

async function runInstall(args) {
  const rootDir = resolve(args.repoRoot);
  if (!args.request || !args.proof) throw new Error(usage);
  const request = JSON.parse(readFileSync(resolve(args.request), "utf8"));
  if (request?.schema !== REQUEST_SCHEMA) throw new Error("HAG-REQUEST-INVALID: unexpected request schema");

  // Authoritative repository identity, computed once and reused for both the
  // containment check (F2) and the trust anchor / fingerprint checks below —
  // never the raw `--repo-root` string a caller supplies.
  const { repo, fingerprint } = repositoryFingerprintFor(rootDir);
  const proof = externalJson(repo.primaryRoot, args.proof);

  // F1/N1: the ONLY trust anchor is this repository's own committed
  // project/critical-human-proof.json, read from `repo.primaryRoot` --
  // the AUTHORITATIVE root `discoverRepository` resolved above -- never from
  // the raw `rootDir` (`resolve(args.repoRoot)`). Reading from raw `rootDir`
  // here was the residual self-confirmation shape A-AC-04 forbids: pointing
  // `--repo-root` at an agent-writable subdirectory containing a forged
  // project/critical-human-proof.json would otherwise let a caller pick their
  // own trust anchor while the fingerprint above still bound to the real
  // repository. Pointing --repo-root at a genuinely different repository
  // resolves and binds to THAT repository's own anchor/fingerprint/ledger,
  // consistently -- it cannot forge a grant that appears to belong to this one.
  const policy = readCriticalHumanProofPolicy(repo.primaryRoot);
  if (!policy.ok || policy.trustAnchor === null) throw new Error("HAG-TRUST-ANCHOR-MISSING: project/critical-human-proof.json carries no trustAnchor");
  const trustPolicy = policy.trustAnchor;

  if (fingerprint !== request.intent?.repositoryFingerprint) throw new Error("HAG-DRIFT: physical repository identity does not match the request");

  let rebuiltIntent;
  try {
    rebuiltIntent = createExternalHumanGovernanceIntent({ decision: request.intent?.payload, plan: request.plan, spec: request.spec });
  } catch (error) {
    throw new Error(`HAG-REQUEST-INVALID: request payload does not rebuild a valid external intent (${error.code ?? error.message})`);
  }
  if (rebuiltIntent.sha256 !== request.externalIntentSha256) throw new Error("HAG-REQUEST-INVALID: request intent digest does not match its rebuilt preimage");

  const verified = verifyExternalHumanGovernanceProof({ intent: rebuiltIntent, trustPolicy, proof });
  if (!verified.verified) throw new Error(`HAG-PROOF-INVALID: ${verified.code}`);

  // F4: the cryptographic proof only covers `{decision, plan, spec}`
  // (human-governance-ledger.mjs's `subjectSha256 = canonicalSha256({decision,
  // plan, spec})`). The rest of the stored request's envelope
  // (`request.intent`) was never signed, so it must never be appended
  // verbatim -- a party editing the request file between `prepare` and
  // `install` could otherwise plant unattested material into the append-only
  // ledger as if a human had signed it. Every non-signed-subject field below
  // is reconstructed from a trusted source instead of copied from
  // `request.intent`: decision-derived fields come from `decision` itself
  // (part of the just-verified signed subject), everything else is observed
  // fresh, live, at install time.
  const decision = request.intent.payload;
  // N1: same authoritative root as the trust anchor read above -- never `rootDir`.
  const capturePolicyDigest = capturePolicyDigestFor(repo.primaryRoot);
  const intent = {
    schema: "pipeline.governance-event-envelope.v1",
    payloadSchema: "pipeline.human-governance-decision.v1",
    canonicalization: "RFC8785",
    digestAlgorithm: "sha-256",
    eventId: `${decision.decisionId}-event`,
    idempotencyKey: `${decision.decisionId}-idempotency`,
    origin: "human",
    authorityClass: "human-authority",
    eventType: "human.granted",
    occurredAtEpochMs: decision.validity.notBeforeEpochMs,
    observedAtEpochMs: Date.now(),
    timeAssurance: "locally-observed",
    repositoryFingerprint: fingerprint,
    sourceUri: `urn:pipeline:repository:${fingerprint}`,
    streamId: "human",
    correlation: { featureId: UNAVAILABLE, packageId: UNAVAILABLE, requestId: UNAVAILABLE, sessionId: UNAVAILABLE, dispatchId: UNAVAILABLE, traceId: UNAVAILABLE },
    candidate: decision.scope.candidate,
    artifacts: [UNAVAILABLE],
    policy: { policyDigest: UNAVAILABLE, configurationDigest: UNAVAILABLE, capturePolicyDigest, redactionPolicyDigest: UNAVAILABLE },
    classification: "repository-public-safe",
    storageProfile: "repository-public-safe",
    retentionCompatibility: "repository-retained",
    disclosureClass: "repository-visible",
    payload: decision,
  };

  // Only reachable once verification has genuinely succeeded — a rejected or
  // tampered proof throws above and appends nothing. N1: same authoritative
  // root as above -- the ledger is written at `repo.primaryRoot`, never `rootDir`.
  const receipt = await appendHumanGovernanceDecision({ repositoryRoot: repo.primaryRoot, repositoryFingerprint: fingerprint, intent });
  return { ok: true, code: "HUMAN-AUTHORITY-GRANT-INSTALLED", receipt };
}

export async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) throw new Error(args.error);
  if (args.command === "prepare") return runPrepare(args);
  if (args.command === "install") return runInstall(args);
  throw new Error(usage);
}

if (isDirectInvocation(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await run(), null, 2)}\n`); } catch (error) { process.stderr.write(`HUMAN-AUTHORITY-GRANT-FAILED: ${error.message}\n`); process.exitCode = 2; }
}

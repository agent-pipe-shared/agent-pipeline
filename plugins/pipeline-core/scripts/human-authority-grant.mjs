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
 * proof, and any verification failure exits non-zero and appends nothing.
 *
 * Usage:
 *   human-authority-grant.mjs prepare --repo-root <path> --decision-id <id> \
 *     --package-id <id> --action <OVERRIDE.rule> --plan <repo-path> --spec <repo-path> \
 *     --ttl-seconds <n> --reason-code <CODE> --policy-digest <sha256> --rule-digest <sha256> \
 *     --request <output-path> [--environment <id>] [--artifacts <comma-separated-repo-paths>] \
 *     [--request-decision-id <id>] [--event-id <id>] [--idempotency-key <id>]
 *   human-authority-grant.mjs install --repo-root <path> --request <path> \
 *     --proof <external-public-json> [--trust-anchor-file <external-public-json>]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

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

const usage = "Usage: human-authority-grant.mjs prepare --repo-root <path> --decision-id <id> --package-id <id> --action <OVERRIDE.rule> --plan <repo-path> --spec <repo-path> --ttl-seconds <n> --reason-code <CODE> --policy-digest <sha256> --rule-digest <sha256> --request <output-path> [--environment <id>] [--artifacts <comma-separated-repo-paths>] [--request-decision-id <id>] [--event-id <id>] [--idempotency-key <id>] | install --repo-root <path> --request <path> --proof <external-public-json> [--trust-anchor-file <external-public-json>]";

export function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = { command, repoRoot: process.cwd() };
  const supplied = new Set();
  const known = new Set([
    "repoRoot", "decisionId", "packageId", "action", "environment", "plan", "spec", "artifacts",
    "ttlSeconds", "reasonCode", "policyDigest", "ruleDigest", "requestDecisionId", "eventId",
    "idempotencyKey", "request", "proof", "trustAnchorFile",
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

/** `path` must be supplied outside the repository — genuinely external human-produced material. */
function externalJson(repoRoot, path) {
  const root = resolve(repoRoot);
  const source = resolve(path);
  const rel = relative(root, source);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error("HAG-EXTERNAL-REQUIRED: proof and trust-anchor-file must be supplied outside the repository");
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

  const plan = artifactFor(rootDir, args.plan);
  const spec = artifactFor(rootDir, args.spec);
  const extraPaths = (args.artifacts ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  const extraArtifacts = extraPaths.map((path) => artifactFor(rootDir, path));
  const artifacts = [plan, spec, ...extraArtifacts];

  const nowMs = Date.now();
  const decisionId = args.decisionId;
  const requestDecisionId = args.requestDecisionId ?? `${decisionId}-request`;
  const eventId = args.eventId ?? `${decisionId}-event`;
  const idempotencyKey = args.idempotencyKey ?? `${decisionId}-idempotency`;

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

  const capturePolicyDigest = capturePolicyDigestFor(rootDir);
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
  const proof = externalJson(rootDir, args.proof);
  const trustPolicy = args.trustAnchorFile
    ? (() => {
      const anchor = externalJson(rootDir, args.trustAnchorFile);
      if (!anchor || typeof anchor.keyReference !== "string" || typeof anchor.publicKeySha256 !== "string") throw new Error("HAG-TRUST-ANCHOR-INVALID: trust-anchor-file is malformed");
      return { keyReference: anchor.keyReference, publicKeySha256: anchor.publicKeySha256 };
    })()
    : (() => {
      const policy = readCriticalHumanProofPolicy(rootDir);
      if (!policy.ok || policy.trustAnchor === null) throw new Error("HAG-TRUST-ANCHOR-MISSING: project/critical-human-proof.json carries no trustAnchor");
      return policy.trustAnchor;
    })();

  const { fingerprint } = repositoryFingerprintFor(rootDir);
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

  // Only reachable once verification has genuinely succeeded — a rejected or
  // tampered proof throws above and appends nothing.
  const receipt = await appendHumanGovernanceDecision({ repositoryRoot: rootDir, repositoryFingerprint: fingerprint, intent: request.intent });
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

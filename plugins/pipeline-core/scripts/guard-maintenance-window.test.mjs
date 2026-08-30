#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * CLI-level regression tests for scripts/guard-maintenance-window.mjs's
 * PHX-WP-GMW-LEDGER-EMISSION wiring: `install` and `close` additionally emit
 * portable PHX-2 governance-ledger events
 * (backlog/items/2026-08-07-gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger.md,
 * PO decision 2026-08-18; design
 * specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md).
 * GMW's own machine-local window.json/request.json storage is exercised only to
 * confirm it is UNCHANGED by this wiring (lib/guard-maintenance-window.test.mjs
 * already covers that storage contract in full; this file does not repeat it).
 *
 * Fixture pattern mirrors scripts/human-authority-grant.test.mjs (registry.json +
 * capture-policy.json + a committed critical-human-proof.json trust anchor) and
 * lib/guard-maintenance-window.test.mjs (Ed25519 keypair + a detached proof over
 * the intent digest).
 *
 * Run: node plugins/pipeline-core/scripts/guard-maintenance-window.test.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, createHash, randomBytes, sign } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../lib/governance-event.mjs";
import { createRestrictedAuthorization, queryRestrictedGovernanceEvent, readLocalRepositoryFingerprint } from "../lib/governance-event-store.mjs";
import { queryHumanGovernanceDecisions } from "../lib/human-governance-ledger.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { livePluginRoots } from "../hooks/guard-gate-strength.mjs";
import { prepareGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { run } from "./guard-maintenance-window.mjs";

// PHX-WP-GMW-PREPARE-AUTHORSHIP fixed the CLI's own `prepare` command to forward
// `authorshipMode`/`stage0Selfcheck` to `prepareGuardMaintenanceWindowRequest` (see
// that file's own top-of-file note and the "prepare" describe block below, which
// exercises `run(["prepare", ...])` directly). The install/close fixtures in THIS file
// predate that fix and still build the signed request directly through the library
// function (exactly `lib/guard-maintenance-window.test.mjs`'s own fixture pattern) --
// left as-is since re-routing them through the CLI's `prepare` is out of this dispatch's
// briefed scope (CLI wiring + its own test coverage, not a fixture-pattern rewrite of
// unrelated install/close tests) and would only re-prove the same thing the new
// "prepare" tests below already cover directly. They still stop at the same
// "currently-enforcing live plugin root" resolution the CLI's `install`/`close`
// branches use internally (`livePluginRoots()[0]`), so the two paths still agree on
// `openingTreeSha256`.
function currentLivePluginRoot() {
  return livePluginRoots()[0];
}

const FREE_TEXT_REASON = "ZZFREETEXTZZ gmw ledger regression fixture reason";

function registry(fingerprint) {
  return {
    schema: "pipeline.governance-stream-registry.v1", repositoryFingerprint: fingerprint,
    canonicalization: "RFC8785", digestAlgorithm: "sha-256", eventDigestDomain: "pipeline.governance-event.v1\0",
    storageRoot: "governance/events",
    streams: [
      { streamId: "human", origin: "human", authorityClass: "human-authority", relativeRoot: "human", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "agent", origin: "agent", authorityClass: "non-authoritative", relativeRoot: "agent", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
      { streamId: "lifecycle", origin: "lifecycle", authorityClass: "non-authoritative", relativeRoot: "lifecycle", storageProfile: "repository-public-safe", genesis: { sequence: 0, eventDigest: null } },
    ],
  };
}

function capturePolicy() {
  return {
    schema: "pipeline.governance-capture-policy.v1", policyId: "fixture", revision: "d".repeat(64), defaultAction: "deny",
    streams: [
      { origin: "human", purpose: "authority-history", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
      { origin: "agent", purpose: "declared-assumption", materiality: "policy-selected", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
      { origin: "lifecycle", purpose: "deterministic-lifecycle", materiality: "required", personalIdentifiability: "prohibited", contextualIdentifiability: "prohibited", storageProfile: "repository-public-safe", retention: "repository-retained", disclosure: "repository-visible", encryptionGeneration: null },
    ],
    sanitizedReceipt: { allowEventId: true, allowEventDigest: true, allowCheckpoint: true, allowReasonText: false },
    mandatoryEventClasses: [],
  };
}

function keypair() {
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
  return { privateKey: pair.privateKey, publicKey, publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
}

/** The project's committed trust-anchor policy (ADR-0055 shape), pinned to a fixture keypair. Never the real repo's key. */
function trustAnchorPolicy(keys) {
  return { schema: "pipeline.critical-human-proof-policy.v1", requiredKinds: ["push"], trustAnchor: { keyReference: "gmw-ledger-test-key", publicKeySha256: keys.publicKeySha256 } };
}

/** A real, freshly initialized git repository, Phoenix-governed, carrying `keys` as its committed trust anchor. */
async function fixture({ humanApproval = null, includeCriticalPolicy = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "gmw-ledger-"));
  const keys = keypair();
  await writeFile(path.join(root, "plan.md"), "fixture plan\n");
  await writeFile(path.join(root, "spec.md"), "fixture spec\n");
  await mkdir(path.join(root, "project"), { recursive: true });
  if (includeCriticalPolicy) {
    await writeFile(path.join(root, "project/critical-human-proof.json"), `${JSON.stringify(trustAnchorPolicy(keys), null, 2)}\n`);
  }
  if (humanApproval !== null) {
    await writeFile(path.join(root, "pipeline.user.yaml"), [
      'schema: "pipeline.user.v3"',
      "gates:",
      `  human_approval: "${humanApproval}"`,
      "",
    ].join("\n"));
  }
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  // NVA-REPOID-3: the store's bound identity, matching what
  // scripts/guard-maintenance-window.mjs's repositoryFingerprintFor() itself
  // now reads (readLocalRepositoryFingerprint) -- not the legacy path-derived
  // hash.
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
  await mkdir(path.join(root, "governance/events"), { recursive: true });
  await writeFile(path.join(root, "governance/events/registry.json"), `${canonicalizeJson(registry(fingerprint))}\n`);
  await writeFile(path.join(root, "governance/events/capture-policy.json"), `${canonicalizeJson(capturePolicy())}\n`);
  return { root, fingerprint, keys };
}

function proofFor(keys, intentSha256) {
  return {
    schema: PO_APPROVAL_PROOF_SCHEMA,
    intentSha256,
    keyReference: "gmw-ledger-test-key",
    publicKey: keys.publicKey,
    signatureBase64: sign(null, Buffer.from(intentSha256, "utf8"), keys.privateKey).toString("base64"),
  };
}

/** prepare (direct library call -- see the note above) -> sign externally -> install via the CLI. */
function prepareRequest({ root, ttlSeconds = 120, reason = FREE_TEXT_REASON, scopeRuleIds = ["GS-6", "TP-1"] }) {
  return prepareGuardMaintenanceWindowRequest({
    rootDir: root, scopeRuleIds, ttlSeconds, reason, featureId: "sprint-phoenix-epic",
    planSha256: createHash("sha256").update("fixture plan\n").digest("hex"),
    specSha256: createHash("sha256").update("fixture spec\n").digest("hex"),
    policyRevision: "guard-maintenance-window-v1",
    livePluginRoot: currentLivePluginRoot(),
    authorshipMode: "goldfish-dispatch",
  });
}

async function installedWindow({ root, keys, ttlSeconds = 120, reason = FREE_TEXT_REASON }) {
  const { intent, request } = prepareRequest({ root, ttlSeconds, reason });
  const external = await mkdtemp(path.join(os.tmpdir(), "gmw-ledger-ext-"));
  const requestPath = path.join(root, "request.json");
  await writeFile(requestPath, JSON.stringify(request));
  const proofPath = path.join(external, "proof.json");
  await writeFile(proofPath, JSON.stringify(proofFor(keys, intent.sha256)));
  const installed = await run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath, "--plan", "plan.md", "--spec", "spec.md"]);
  return { installed, external, requestPath, proofPath, intent, request };
}

// ---------------------------------------------------------------------------------
// PHX-WP-GMW-PREPARE-AUTHORSHIP: `prepare`'s own `--authorship-mode`/stage-0-selfcheck
// CLI wiring, exercised through `run(["prepare", ...])` itself -- not the library
// function directly -- since this is what was previously always broken.
// ---------------------------------------------------------------------------------

test("prepare with --authorship-mode goldfish-dispatch succeeds and carries stage0Selfcheck: null", async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prepared = await run([
    "prepare", "--repo-root", root, "--scope", "GS-6,TP-1", "--ttl-seconds", "120",
    "--reason", FREE_TEXT_REASON, "--authorship-mode", "goldfish-dispatch",
    "--plan", "plan.md", "--spec", "spec.md",
  ]);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.value.request.authorshipMode, "goldfish-dispatch");
  assert.equal(prepared.value.request.stage0Selfcheck, null);
});

test("prepare with --authorship-mode elephant-direct and a qualifying stage-0 self-check succeeds and carries the full object", async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const prepared = await run([
    "prepare", "--repo-root", root, "--scope", "GS-6", "--ttl-seconds", "120",
    "--reason", FREE_TEXT_REASON, "--authorship-mode", "elephant-direct",
    "--files-changed", "1", "--diff-lines", "10", "--touches-test-file", "false",
    "--plan", "plan.md", "--spec", "spec.md",
  ]);
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.value.request.authorshipMode, "elephant-direct");
  assert.deepEqual(prepared.value.request.stage0Selfcheck, { filesChanged: 1, diffLines: 10, touchesTestFile: false });
});

test("prepare with --authorship-mode elephant-direct and a non-qualifying stage-0 self-check still fails, with the library's own not-qualified code", async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => run([
      "prepare", "--repo-root", root, "--scope", "GS-6", "--ttl-seconds", "120",
      "--reason", FREE_TEXT_REASON, "--authorship-mode", "elephant-direct",
      "--files-changed", "5", "--diff-lines", "100", "--touches-test-file", "false",
      "--plan", "plan.md", "--spec", "spec.md",
    ]),
    (error) => error.code === "GMW-STAGE0-NOT-QUALIFIED",
  );
});

test("prepare with --authorship-mode elephant-direct but no stage-0 self-check flags fails on the CLI's own usage check", async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => run([
      "prepare", "--repo-root", root, "--scope", "GS-6", "--ttl-seconds", "120",
      "--reason", FREE_TEXT_REASON, "--authorship-mode", "elephant-direct",
      "--plan", "plan.md", "--spec", "spec.md",
    ]),
    (error) => error.message.startsWith("Usage:"),
  );
});

test("prepare with an invalid --authorship-mode value still fails, matching the library's closed-set check", async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => run([
      "prepare", "--repo-root", root, "--scope", "GS-6", "--ttl-seconds", "120",
      "--reason", FREE_TEXT_REASON, "--authorship-mode", "not-a-real-mode",
      "--plan", "plan.md", "--spec", "spec.md",
    ]),
    (error) => error.code === "GMW-AUTHORSHIP-MODE-INVALID",
  );
});

test("prepare with no --authorship-mode at all fails on the CLI's own usage check", async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => run([
      "prepare", "--repo-root", root, "--scope", "GS-6", "--ttl-seconds", "120",
      "--reason", FREE_TEXT_REASON, "--plan", "plan.md", "--spec", "spec.md",
    ]),
    (error) => error.message.startsWith("Usage:"),
  );
});

test("install appends requested+granted to the portable ledger and arms the window", async (t) => {
  const { root, fingerprint, keys } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { installed } = await installedWindow({ root, keys });

  assert.equal(installed.ok, true);
  assert.equal(installed.value.status, "active");
  assert.equal(installed.ledger.length, 2, "requested + granted");
  assert.equal(installed.ledger.every((receipt) => receipt.outcome === "appended"), true);

  const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(decisions.length, 2);
  const requested = decisions.find((entry) => entry.event === "requested");
  const granted = decisions.find((entry) => entry.event === "granted");
  assert.ok(requested, "a requested decision was appended");
  assert.ok(granted, "a granted decision was appended");
  assert.equal(granted.links.requestDecisionId, requested.decisionId);
  assert.equal(requested.outcome, "pending");
  assert.equal(granted.outcome, "granted");
  assert.equal(granted.scope.packageId, "guard-maintenance-window");
  assert.equal(granted.scope.action, "GUARD.MAINTENANCE.LIFT");
  assert.equal(granted.scope.environment, "local-checkout");
  assert.equal(granted.scope.artifacts.some((entry) => entry.path === "plan.md"), true);
  assert.equal(granted.scope.artifacts.some((entry) => entry.path === "spec.md"), true);
  assert.equal(granted.authorityClass, "product-owner");
  assert.equal(granted.identityAssurance, "locally-attributed");
  assert.equal(granted.timeAssurance, "locally-observed");
  // §5.3: GMW's finalized subject carries no reasonCode field, so the intake records
  // the explicit "unattested" code rather than deriving one from the free-text reason.
  assert.equal(granted.reasonCode, "GUARD.MAINTENANCE.WINDOW_UNATTESTED");
  assert.equal(granted.validity.singleUse, false);
});

test("committed global chat CLI install requires neither proof nor key/anchor and reports chat attribution", async (t) => {
  const { root, fingerprint } = await fixture({ humanApproval: "chat", includeCriticalPolicy: false });
  t.after(() => rm(root, { recursive: true, force: true }));
  const { request } = prepareRequest({ root });
  const requestPath = path.join(root, "global-chat-request.json");
  await writeFile(requestPath, JSON.stringify(request));

  const installed = await run([
    "install", "--repo-root", root, "--request", requestPath, "--plan", "plan.md", "--spec", "spec.md",
  ]);
  assert.equal(installed.ok, true);
  assert.equal(installed.value.status, "active");
  assert.deepEqual(installed.ledger, [], "global chat emits no signature-backed requested/granted ledger pair");
  assert.deepEqual(installed.attribution, { status: "chat-attributed-unattested" });
  const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.deepEqual(decisions, [], "global chat does not manufacture a signer/key record");
});

test("re-installing the identical still-live request skips the ledger append (no duplicate grant)", async (t) => {
  const { root, keys } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await installedWindow({ root, keys });
  assert.equal(first.installed.ledger.length, 2);

  const second = await run(["install", "--repo-root", root, "--request", first.requestPath, "--proof", first.proofPath, "--plan", "plan.md", "--spec", "spec.md"]);
  assert.equal(second.ok, true);
  assert.equal(second.value.status, "active");
  assert.equal(second.ledger.length, 0, "a live grant already exists -- nothing new appended");
});

test("a proof that fails verification arms nothing and still leaves a revoked(NOT_ARMED) ledger trail", async (t) => {
  const { root, fingerprint, keys } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { intent, request } = prepareRequest({ root, scopeRuleIds: ["GS-6"] });
  const external = await mkdtemp(path.join(os.tmpdir(), "gmw-ledger-ext-"));
  const requestPath = path.join(root, "request.json");
  await writeFile(requestPath, JSON.stringify(request));
  const forged = proofFor(keys, intent.sha256);
  const corruptedSignature = Buffer.from(forged.signatureBase64, "base64");
  corruptedSignature[0] ^= 0xff;
  forged.signatureBase64 = corruptedSignature.toString("base64");
  const proofPath = path.join(external, "proof.json");
  await writeFile(proofPath, JSON.stringify(forged));

  await assert.rejects(
    () => run(["install", "--repo-root", root, "--request", requestPath, "--proof", proofPath, "--plan", "plan.md", "--spec", "spec.md"]),
    (error) => error.code === "GMW-PROOF-INVALID",
  );
  const status = await run(["status", "--repo-root", root]);
  assert.equal(status.value.status, "absent", "no window ever armed");

  const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(decisions.length, 3, "requested + granted + revoked(NOT_ARMED)");
  const revoked = decisions.find((entry) => entry.event === "revoked");
  assert.ok(revoked);
  assert.equal(revoked.reasonCode, "GUARD.MAINTENANCE.NOT_ARMED");
});

test("close appends a revoked(CLOSED) disposition linked to the live grant, and still narrows exactly as before", async (t) => {
  const { root, fingerprint, keys } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { installed } = await installedWindow({ root, keys });
  assert.equal(installed.value.status, "active");

  const closed = await run(["close", "--repo-root", root]);
  assert.equal(closed.ok, true);
  assert.equal(closed.value.status, "closed");
  assert.equal(closed.ledger.appended, true);
  assert.equal(closed.ledger.receipt.outcome, "appended");

  const status = await run(["status", "--repo-root", root]);
  assert.equal(status.value.status, "absent", "close still narrows exactly as before -- window.json is gone");
  assert.equal((await run(["close", "--repo-root", root])).value.status, "absent", "closing twice is still a no-op");

  const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(decisions.length, 3, "requested + granted + revoked(CLOSED)");
  const granted = decisions.find((entry) => entry.event === "granted");
  const revoked = decisions.find((entry) => entry.event === "revoked");
  assert.ok(revoked);
  assert.equal(revoked.reasonCode, "GUARD.MAINTENANCE.CLOSED");
  assert.equal(revoked.links.revokesDecisionId, granted.decisionId);
});

test("close on an absent window is a no-op and never appends", async (t) => {
  const { root } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const closed = await run(["close", "--repo-root", root]);
  assert.equal(closed.ok, true);
  assert.equal(closed.value.status, "absent");
  assert.equal(closed.ledger, null);
});

test("boundary: the emitted portable decisions never carry natural-person attribution or free-form reason", async (t) => {
  const { root, fingerprint, keys } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { installed } = await installedWindow({ root, keys });
  const closed = await run(["close", "--repo-root", root]);
  assert.equal(closed.ledger.appended, true);

  const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(decisions.length, 3);

  // Structural: the closed `human-governance-decision.v1` payload shape has no field
  // for any of these at all -- this is enforced by validateHumanGovernanceDecision's
  // own exact()-key check (already exercised by guard-authority-ledger-intake.test.mjs's
  // U-1/U-3), asserted again here at the CLI-emission boundary.
  for (const decision of decisions) {
    for (const forbiddenKey of ["reason", "rationale", "proof", "root", "keyReference", "publicKey", "nonce"]) {
      assert.equal(Object.hasOwn(decision, forbiddenKey), false, `${decision.event} decision must not carry "${forbiddenKey}"`);
    }
    assert.match(decision.authorityClass, /^(product-owner|delegated-reviewer|security-reviewer|privacy-reviewer)$/u);
    assert.equal(decision.identityAssurance, "locally-attributed");
  }

  // Content: the free-text reason string and the signer's raw public key/PEM material
  // never appear anywhere in the emitted bytes either -- not merely absent as a key.
  const asText = JSON.stringify(decisions);
  assert.equal(asText.includes(FREE_TEXT_REASON), false);
  assert.equal(asText.includes(keys.publicKey), false);
  assert.equal(asText.includes(root), false, "no absolute filesystem path leaks into the portable record");

  assert.deepEqual([...installed.ledger, closed.ledger.receipt].every((receipt) => receipt.outcome === "appended"), true);
});

// ---------------------------------------------------------------------------------
// PHX-WP-HAC11-D1-GMW-WIRING: `install --attribution-key-file` restricted-zone wiring
// (design §5.4, Increment 2/D-1). `os.homedir()` is dynamic per-call on Node (reads
// $HOME each time), so pointing HOME at a fresh temp directory isolates each test's
// restricted store without touching the real machine-local store.
// ---------------------------------------------------------------------------------

const ATTRIBUTION_STORE_SEGMENTS = [".pipeline", "governance-restricted", "guard-maintenance-window"];

async function withIsolatedHome(fn) {
  const home = await mkdtemp(path.join(os.tmpdir(), "gmw-attribution-home-"));
  const previous = process.env.HOME;
  process.env.HOME = home;
  try { return await fn(home); }
  finally {
    if (previous === undefined) delete process.env.HOME; else process.env.HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
}

test("install with --attribution-key-file appends exactly one restricted attribution record with no correlator", async (t) => {
  await withIsolatedHome(async (home) => {
    const { root, fingerprint, keys } = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const { intent, request } = prepareRequest({ root });
    const external = await mkdtemp(path.join(os.tmpdir(), "gmw-ledger-ext-"));
    const requestPath = path.join(root, "request.json");
    await writeFile(requestPath, JSON.stringify(request));
    const proofPath = path.join(external, "proof.json");
    await writeFile(proofPath, JSON.stringify(proofFor(keys, intent.sha256)));
    const key = randomBytes(32);
    const keyFilePath = path.join(external, "attribution.key");
    await writeFile(keyFilePath, key);

    const installed = await run([
      "install", "--repo-root", root, "--request", requestPath, "--proof", proofPath,
      "--plan", "plan.md", "--spec", "spec.md", "--attribution-key-file", keyFilePath,
    ]);
    assert.equal(installed.ok, true);
    assert.equal(installed.value.status, "active");
    assert.equal(installed.attribution.appended, true);
    assert.equal(typeof installed.attribution.recordId, "string");

    const storeRoot = path.join(home, ...ATTRIBUTION_STORE_SEGMENTS, fingerprint);
    const authorization = createRestrictedAuthorization({ key, repositoryFingerprint: fingerprint, operation: "query", recordId: installed.attribution.recordId });
    const { event } = await queryRestrictedGovernanceEvent({ repositoryRoot: root, storeRoot, repositoryFingerprint: fingerprint, authorization, key, recordId: installed.attribution.recordId });
    assert.equal(event.payloadSchema, "pipeline.human-decision-attribution.v1");
    assert.equal(event.storageProfile, "restricted-machine-local");
    assert.equal(event.eventId.startsWith("evt-attribution-"), true, "a fresh random id, never derived from the portable decisionId");
    assert.equal(event.idempotencyKey.startsWith("attribution-"), true);
    assert.equal(event.candidate.state, "omitted-by-policy");
    assert.equal(event.correlation.requestId.state, "omitted-by-policy");

    const payload = event.payload;
    assert.deepEqual(Object.keys(payload).sort(), ["authorityClass", "identityAssurance", "keyReference", "packageId", "publicKeySha256", "rationale", "reasonCode", "schema", "timeBucketEpochMs"]);
    assert.equal(payload.rationale, FREE_TEXT_REASON, "rationale matches subject.reason verbatim");
    assert.equal(payload.packageId, "guard-maintenance-window");
    assert.equal(payload.authorityClass, "product-owner");
    assert.equal(payload.identityAssurance, "locally-attributed");
    assert.equal(Object.hasOwn(payload, "decisionId"), false);
    assert.equal(payload.timeBucketEpochMs % (24 * 60 * 60 * 1000), 0, "day-bucketed, never an exact timestamp");

    const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
    const granted = decisions.find((entry) => entry.event === "granted");
    assert.notEqual(event.eventId, `evt-${granted.decisionId}`);
    assert.notEqual(event.idempotencyKey, granted.decisionId);
  });
});

test("install without --attribution-key-file: unchanged behavior, no restricted-store interaction", async (t) => {
  const { root, keys } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { installed } = await installedWindow({ root, keys });
  assert.equal(installed.ok, true);
  assert.equal(installed.value.status, "active");
  assert.equal(installed.attribution, null);
  assert.equal(installed.ledger.length, 2);
});

test("install with a corrupt/wrong-length attribution key file: install still succeeds, attribution reports failure", async (t) => {
  const { root, fingerprint, keys } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { intent, request } = prepareRequest({ root });
  const external = await mkdtemp(path.join(os.tmpdir(), "gmw-ledger-ext-"));
  const requestPath = path.join(root, "request.json");
  await writeFile(requestPath, JSON.stringify(request));
  const proofPath = path.join(external, "proof.json");
  await writeFile(proofPath, JSON.stringify(proofFor(keys, intent.sha256)));
  const keyFilePath = path.join(external, "attribution.key");
  await writeFile(keyFilePath, randomBytes(31)); // wrong length, never a real secret

  const installed = await run([
    "install", "--repo-root", root, "--request", requestPath, "--proof", proofPath,
    "--plan", "plan.md", "--spec", "spec.md", "--attribution-key-file", keyFilePath,
  ]);
  assert.equal(installed.ok, true);
  assert.equal(installed.value.status, "active", "the window still arms");
  assert.equal(installed.ledger.length, 2, "the portable ledger is still appended");
  assert.equal(installed.attribution.appended, false);
  assert.equal(installed.attribution.code, "GMW-ATTRIBUTION-KEY-LENGTH");

  const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
  assert.equal(decisions.length, 2, "no extra/partial ledger side effect from the failed attribution append");
});

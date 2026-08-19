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
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeJson } from "../lib/governance-event.mjs";
import { queryHumanGovernanceDecisions } from "../lib/human-governance-ledger.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "../lib/po-approval-proof.mjs";
import { derivePoGateRepositoryFingerprint } from "../lib/po-gate-authority.mjs";
import { discoverRepository } from "../lib/worktree-lifecycle.mjs";
import { livePluginRoots } from "../hooks/guard-gate-strength.mjs";
import { prepareGuardMaintenanceWindowRequest } from "../lib/guard-maintenance-window.mjs";
import { run } from "./guard-maintenance-window.mjs";

// The CLI's own `prepare` command does not (pre-existing, unrelated to this dispatch's
// briefed install/close scope -- see this dispatch's final report) forward
// `authorshipMode`/`stage0Selfcheck` to `prepareGuardMaintenanceWindowRequest`, which
// PHX-WP-STAGE0-SELFCHECK made a mandatory field; `run(["prepare", ...])` therefore
// always throws GMW-AUTHORSHIP-MODE-INVALID today, independently of this dispatch's
// changes. These tests build the signed request directly through the library function
// instead (exactly `lib/guard-maintenance-window.test.mjs`'s own fixture pattern),
// stopping at the same "currently-enforcing live plugin root" resolution the CLI's
// `install`/`close` branches use internally (`livePluginRoots()[0]`, unchanged by this
// dispatch), so the two paths still agree on `openingTreeSha256`.
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
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gmw-ledger-"));
  const keys = keypair();
  await writeFile(path.join(root, "plan.md"), "fixture plan\n");
  await writeFile(path.join(root, "spec.md"), "fixture spec\n");
  await mkdir(path.join(root, "project"), { recursive: true });
  await writeFile(path.join(root, "project/critical-human-proof.json"), `${JSON.stringify(trustAnchorPolicy(keys), null, 2)}\n`);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  const repository = discoverRepository(root);
  const fingerprint = derivePoGateRepositoryFingerprint({ gitCommonDir: repository.commonDir, primaryRoot: repository.primaryRoot });
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

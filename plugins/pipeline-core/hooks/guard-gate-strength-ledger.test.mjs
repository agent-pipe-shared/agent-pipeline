#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-gate-strength-ledger.test.mjs — dedicated regression coverage for the
 * ALREADY-LANDED hook-side HGO ledger helpers
 * (hooks/guard-gate-strength.mjs's `appendOverrideDeniedLedgerEvent`/
 * `appendOverrideConsumedLedgerEvent`, commit `025f9e1a`), which previously had ZERO
 * direct test coverage.
 *
 * PHX-WP-HGO-LEDGER-EMISSION-V3 SCOPE NOTE. This dispatch's task (A) -- a CLI-side
 * `granted` append in scripts/guard-human-override.mjs's `authorize`/
 * `authorize-by-signature`, appended BEFORE arming and fail-closed on append failure
 * -- was attempted and then REVERTED after empirical proof of a genuine architectural
 * blocker: `appendHumanGovernanceDecision` writes new files into the tracked worktree
 * (governance/events/human/*.jsonl) without committing them, which dirties
 * `git status`; `authorizeHumanGuardOverride()`/`authorizeHumanGuardOverrideBySignature()`
 * (lib/human-guard-override.mjs, out of this dispatch's edit scope) each internally
 * re-derive `repositoryObservation` (including `statusSha256`) via their own internal
 * `planHumanGuardOverride()` call and refuse with `HGO-DRIFT` the moment that status
 * differs from what was captured in the original request at denial time. Placing the
 * ledger append BEFORE the arm call -- required for fail-closed-at-arming per design
 * §8.1 -- therefore causes EVERY representable authorization to fail arming, which is
 * a regression, not a partial feature; the reverse order (arm-then-append) would
 * abandon the fail-closed requirement itself. See this dispatch's final report for the
 * full account; the stop condition this matches is named verbatim in the briefing:
 * "Achieving true fail-closed-at-arming semantics for authorize/authorize-by-signature
 * would require editing lib/human-guard-override.mjs (out of scope per Forbidden)."
 * `scripts/guard-human-override.mjs` and its own test file are therefore UNCHANGED by
 * this dispatch (reverted to their pre-dispatch committed state) -- this file covers
 * only what task (B) can deliver without that blocker: the two already-landed,
 * previously-uncovered hook helpers, exercised directly with hand-built ledger fixtures
 * (never through the blocked CLI arm path).
 *
 * Design: specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md
 * §7.5 (HGO event sequence), §8.1 (fail-closed at arming).
 *
 * Run: node --test plugins/pipeline-core/hooks/guard-gate-strength-ledger.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  appendOverrideConsumedLedgerEvent,
  appendOverrideDeniedLedgerEvent,
} from "./guard-gate-strength.mjs";
import {
  planHumanGuardOverride,
  recordHumanGuardDenial,
} from "../lib/human-guard-override.mjs";
import { appendHumanGovernanceDecision, queryHumanGovernanceDecisions } from "../lib/human-governance-ledger.mjs";
import { buildAppendIntent, buildOverrideDecisions, requestDecisionId } from "../lib/guard-authority-ledger-intake.mjs";
import { canonicalizeJson, canonicalSha256, parseStrictJson } from "../lib/governance-event.mjs";
import { readPublicRepositoryFile } from "../lib/threat-model-approval-request.mjs";
import { readLocalRepositoryFingerprint } from "../lib/governance-event-store.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, "..");

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return String(result.stdout).trim();
}

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

/** §7.5 layer 1 is never supplied by the hook's own denied-lane wiring (defaults to
 * `[]`), so representability falls to layer 2: `policyIdentity()`'s `project` array.
 * Only its two `project/`-prefixed entries can ever match the artifact path pattern,
 * so one of them must exist in this fixture or every decision below is
 * "not representable". */
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gate-strength-ledger-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "pipeline.user.yaml"), 'schema: "pipeline.user.v3"\ngates:\n  push_approval: "chat"\n');
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "guard-config.json"), JSON.stringify({ schema: "pipeline.guard-config.v1" }));
  git(root, "add", "README.md", "pipeline.user.yaml", "project/guard-config.json");
  git(root, "commit", "-q", "-m", "fixture");
  const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
  mkdirSync(join(root, "governance", "events"), { recursive: true });
  writeFileSync(join(root, "governance", "events", "registry.json"), `${canonicalizeJson(registry(fingerprint))}\n`);
  writeFileSync(join(root, "governance", "events", "capture-policy.json"), `${canonicalizeJson(capturePolicy())}\n`);
  return { root, fingerprint };
}

function capturePolicyDigestOf(root) {
  return canonicalSha256(parseStrictJson(readPublicRepositoryFile(root, "governance/events/capture-policy.json")));
}

const DENIALS = [{ guard: "guard-gate-strength.mjs", reason: "GS-1: fixture reason" }];

test("appendOverrideDeniedLedgerEvent produces a correctly-linked requested+denied pair", async () => {
  const { root } = await fixture();
  try {
    const toolInput = { file_path: "pipeline.user.yaml", content: "fixture edit\n" };
    const recorded = recordHumanGuardDenial({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: DENIALS });
    assert.equal(recorded.status, "planned");
    const result = await appendOverrideDeniedLedgerEvent({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256, authorizationChannel: "chat",
    });
    assert.equal(result.appended, true);

    const fingerprint = await readLocalRepositoryFingerprint({ repositoryRoot: root });
    const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
    const requestId = requestDecisionId({ intentSha256: recorded.requestSha256, producer: "hgo" });
    const requested = decisions.find((entry) => entry.event === "requested" && entry.decisionId === requestId);
    const denied = decisions.find((entry) => entry.event === "denied");
    assert.ok(requested, "a requested decision was appended");
    assert.ok(denied, "a denied decision was appended");
    assert.equal(denied.links.requestDecisionId, requestId);
    assert.equal(denied.outcome, "denied");
    assert.equal(denied.reasonCode, "GUARD.OVERRIDE.DENIED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Builds a "granted" ledger decision directly through the already-landed, unmodified
 * pure builder + ledger writer (`buildOverrideDecisions`/`buildAppendIntent`/
 * `appendHumanGovernanceDecision`), deliberately WITHOUT going through
 * `authorizeHumanGuardOverride()` or any CLI path -- this test only needs a live
 * `granted` decision to exist in the portable ledger to exercise
 * `appendOverrideConsumedLedgerEvent` in isolation, and building it this way sidesteps
 * the CLI-side blocker documented at the top of this file entirely.
 */
test("appendOverrideConsumedLedgerEvent produces a correctly-linked consumed event against a live prior grant", async () => {
  const { root, fingerprint } = await fixture();
  try {
    const toolInput = { file_path: "pipeline.user.yaml", content: "consumed fixture\n" };
    const recorded = recordHumanGuardDenial({ rootDir: root, pluginRoot: PLUGIN_ROOT, toolName: "Write", toolInput, denials: DENIALS });
    assert.equal(recorded.status, "planned");
    const plan = planHumanGuardOverride({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256,
      scriptPath: join(PLUGIN_ROOT, "scripts", "guard-human-override.mjs"),
    });
    const nowMs = Date.now();
    const capability = {
      requestSha256: recorded.requestSha256,
      repository: plan.repository,
      eligiblePaths: plan.eligiblePaths,
      policy: plan.policy,
      commandClass: plan.commandClass,
      denials: plan.denials,
      authorizedAt: nowMs,
      expiresAt: Date.parse(plan.expiresAt),
    };
    const built = buildOverrideDecisions({
      transition: "authorized", capability, repositoryFingerprint: fingerprint, authorizationChannel: "chat", generation: 0,
    });
    assert.equal(built.representable, true, built.reason ?? "");
    const intent = buildAppendIntent({
      decision: built.decisions[0], repositoryFingerprint: fingerprint, occurredAtEpochMs: nowMs,
      featureId: null, requestId: recorded.requestSha256, capturePolicyDigest: capturePolicyDigestOf(root),
    });
    await appendHumanGovernanceDecision({ repositoryRoot: root, repositoryFingerprint: fingerprint, intent });

    const result = await appendOverrideConsumedLedgerEvent({
      rootDir: root, pluginRoot: PLUGIN_ROOT, requestSha256: recorded.requestSha256,
    });
    assert.equal(result.appended, true);

    const { decisions } = await queryHumanGovernanceDecisions({ repositoryRoot: root, repositoryFingerprint: fingerprint });
    const granted = decisions.find((entry) => entry.event === "granted");
    const consumed = decisions.find((entry) => entry.event === "consumed");
    assert.ok(granted, "the hand-built grant is present");
    assert.ok(consumed, "a consumed decision was appended");
    assert.equal(consumed.links.consumesDecisionId, granted.decisionId);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

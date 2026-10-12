#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BOOTSTRAP_PAYLOAD_MAX_BYTES } from "../../../plugins/pipeline-core/lib/bootstrap-payload-budget.mjs";
import { ProjectOnboardingReadyError } from "../../../plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs";
import {
  ANTIGRAVITY_HARD_ENFORCEMENT_SCHEMA,
  observeAntigravityHardEnforcement,
  observePipelineStartPreflight,
  resolveActiveRunner,
} from "../../../plugins/pipeline-core/scripts/pipeline-start-preflight.mjs";

const itemRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const sourceRoot = resolve(itemRoot, "../../../plugins/pipeline-core");
const runners = [
  ["claude", { CLAUDECODE: "1" }],
  ["codex", { CODEX_SESSION_ID: "fixture-only" }],
  ["antigravity", { ANTIGRAVITY_AGENT: "1" }],
];
const receipts = [];
const processEntryInvoked = false;

for (const [expectedRunner, env] of runners) {
  const cwd = resolve(itemRoot, "fixtures", expectedRunner);
  const expectedManifest = resolve(sourceRoot,
    expectedRunner === "claude" ? ".claude-plugin/plugin.json"
      : expectedRunner === "antigravity" ? "plugin.json" : ".codex-plugin/plugin.json");
  const sourceReads = [];
  const readSourceManifest = (path, encoding) => {
    assert.equal(resolve(path), expectedManifest, "fixture read is limited to the pinned Source manifest");
    assert.equal(encoding, "utf8");
    sourceReads.push(resolve(path));
    return readFileSync(path, encoding);
  };
  const result = observePipelineStartPreflight({
    env,
    cwd,
    read: readSourceManifest,
    // Empty fixture registry prevents every CLI/host runner lookup.
    pluginList: () => "[]",
    knownMarketplaces: () => null,
    antigravityPluginRegistries: () => [],
    antigravityConfigRoot: resolve(cwd, "fixture-home-gemini"),
    observeGovernanceScopeFn: ({ rootDir }) => ({
      schema: "pipeline.governance-scope.v1", state: "active", root: rootDir,
      scopeKey: "fixture-scope-only", repositoryKind: "git",
      provenance: { kind: "isolated-unit-fixture", refs: [] }, diagnostics: [],
      requiresEnforcement: true, hintAllowed: false,
    }),
    observe: () => ({ schema: "pipeline.public-core-observation.v1", status: "unavailable" }),
    checkCloneProvisioningFn: () => ({
      schema: "pipeline.clone-provisioning-report.v1", status: "ready", checks: [],
    }),
    requireProjectOnboardingReadyFn: ({ intent }) => {
      if (intent === "bootstrap") {
        throw new ProjectOnboardingReadyError("PORG-NOT-READY", "isolated fixture reports not ready", { intent });
      }
      throw new Error("session readiness is not probed after bootstrap refusal");
    },
    observeAntigravityLoadedTopologyFn: () => ({
      schema: "pipeline.antigravity-loaded-topology.v1", status: "unavailable",
      loadedKind: "unknown", executingGuardAssurance: "not-established-by-topology",
    }),
    observeAntigravityHardEnforcementFn: ({ rootDir, currentVersion }) =>
      observeAntigravityHardEnforcement({ rootDir, currentVersion, readdir: () => [] }),
    observePrePushHookInstallationFn: () => ({ schema: "pipeline.pre-push-hook-observation.v1", state: "repository-unresolved" }),
    observeUnseenPushToRemoteFn: () => ({ schema: "pipeline.unseen-remote-push-observation.v1", state: "repository-unresolved" }),
    observeArchitectureAdoptionOrientationFn: () => ({
      schema: "pipeline.architecture-adoption-orientation.v1", status: "unavailable", findings: [],
    }),
    inspectEffectiveArchitectureDecisionsFn: () => ({
      schema: "pipeline.architecture-effective-decisions.v1", area: "project", status: "advisory",
      code: "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING", projectionSha256: "a".repeat(64),
      decisionCount: 0, findingCount: 0, taskScopeResolved: false,
    }),
  });

  assert.equal(resolveActiveRunner({ env }), expectedRunner);
  assert.equal(result.status === "ready", false, "fixture must not claim verified native/source identity or onboarding readiness");
  assert.equal(result.installedPluginAttestation.status, "not-required", "empty fixture registry avoids receipt-write paths");
  assert.equal(result.nextAction?.kind, "command");
  assert.equal(result.nextAction.executable, "node");
  if (expectedRunner === "antigravity") {
    assert.equal(result.antigravityHardEnforcement.schema, ANTIGRAVITY_HARD_ENFORCEMENT_SCHEMA);
    assert.equal(result.antigravityHardEnforcement.observed, false, "missing fixture lock cannot imply native admission");
    assert.equal(result.nextAction.mutation, true);
    assert.equal(result.nextAction.requiresConfirmation, true);
    assert.deepEqual(result.nextAction.argv, [resolve(sourceRoot, "install-agy.mjs")]);
  } else {
    assert.equal(result.nextAction.mutation, false);
    assert.equal(result.nextAction.requiresConfirmation, false);
    assert.deepEqual(result.nextAction.argv, [
      resolve(sourceRoot, "scripts/onboarding-init.mjs"),
      "--root", cwd,
      "--runner", expectedRunner,
    ]);
  }
  const json = JSON.stringify(result);
  const bytes = Buffer.byteLength(json, "utf8");
  assert.ok(bytes <= BOOTSTRAP_PAYLOAD_MAX_BYTES, `${expectedRunner} emitted envelope exceeded the shared bootstrap ceiling`);
  const measurement = result.bootstrapPayload.originalMeasurement;
  assert.equal(measurement.metric, "utf8-byte-upper-bound");
  assert.equal(measurement.exactModelTokens, false);
  assert.equal(measurement.runner, "runner-neutral");
  assert.equal(measurement.maxUpperBoundUnits, BOOTSTRAP_PAYLOAD_MAX_BYTES);
  assert.equal(measurement.withinBudget, true, `${expectedRunner} payload exceeded the accepted Source budget`);
  const firstLine = json.split("\n", 1)[0];
  assert.equal(firstLine, json, "preflight machine response is one JSON line");
  assert.deepEqual(JSON.parse(firstLine).nextAction, result.nextAction, "the rendered machine response preserves the exact returned action object");
  assert.deepEqual(sourceReads, [expectedManifest], "only the pinned Source manifest was read");
  receipts.push({
    case: `BOOT-OUT-${String(receipts.length + 1).padStart(2, "0")}`,
    runnerFixture: expectedRunner,
    sourceOnly: true,
    status: result.status,
    firstLineBytes: Buffer.byteLength(firstLine, "utf8"),
    serializedEnvelopeBytes: bytes,
    serializedEnvelopeWithinSharedBudget: bytes <= BOOTSTRAP_PAYLOAD_MAX_BYTES,
    serializedEnvelopeSha256: createHash("sha256").update(json).digest("hex"),
    metric: measurement.metric,
    payloadBytes: measurement.bytes,
    payloadBudgetBytes: measurement.maxUpperBoundUnits,
    payloadWithinBudget: measurement.withinBudget,
    exactAction: result.nextAction,
    processEntryInvoked,
    externalRunnerInvoked: false,
    onboardingActionInvoked: false,
    receiptWritePathEntered: result.installedPluginAttestation.status !== "not-required",
    sourceReads,
  });
}

assert.equal(receipts.length, 3);
assert.ok(receipts.every((receipt) => receipt.payloadWithinBudget));
assert.equal(receipts[0].exactAction.mutation, false);
assert.equal(receipts[1].exactAction.mutation, false);
assert.equal(receipts[2].exactAction.mutation, true, "held Antigravity fixture preserves the returned host-action shape without invoking it");
assert.ok(receipts.every((receipt) => receipt.processEntryInvoked === false && receipt.externalRunnerInvoked === false));
assert.ok(receipts.every((receipt) => receipt.onboardingActionInvoked === false && receipt.receiptWritePathEntered === false));
process.stdout.write(`${JSON.stringify({ schema: "private.source-first-run-consumer.v1", receipts }, null, 2)}\n`);

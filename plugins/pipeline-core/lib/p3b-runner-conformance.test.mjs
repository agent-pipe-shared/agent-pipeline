#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * End-to-end P3B conformance: a v1 source migrates to complete v2 with its
 * Claude request preserved, the public planner projects both runners, and
 * receipt-bound native usage remains pure.
 *
 * Run: node plugins/pipeline-core/lib/p3b-runner-conformance.test.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyRunnerProfileMigrationV2,
  planRunnerProfileMigrationV2,
} from "./runner-profile-migration-v2.mjs";
import { loadRunnerProfilesV2Registry, validatePipelineUserV2 } from "./runner-profiles-v2.mjs";
import { planRuntimeProjectionV2, readRuntimeProjectionV2Baselines } from "./runtime-projection-v2.mjs";
import { ingestClaudeUsage, ingestCodexUsage } from "./runner-usage-v1.mjs";
import { parseYaml } from "./yaml-lite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures", "runner-usage-v1");
const CLAUDE_EVENT = readFileSync(join(FIXTURES, "claude-turn.json"));
const CODEX_EVENT = readFileSync(join(FIXTURES, "codex-turn-completed.json"));
const registry = loadRunnerProfilesV2Registry();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const SETTINGS = '{\n  "settings-unowned-sentinel": true\n}\n';
const PIPELINE = "# pipeline-prefix-sentinel\nunownedBefore: exact\nmodelRouting:\n  legacy_route:\n    model: legacy\n    effort: low\nunownedAfter: exact\n";
const CONFIG = '# config-unowned-sentinel\nprofile = "keep"\n';
const IMPLEMENTOR = '# implementor-prefix-sentinel\nmodel = "old-implementor"\nmodel_reasoning_effort = "low"\nname = "keep-implementor"\n';
const CRITIC = '# critic-prefix-sentinel\nmodel = "old-critic"\nmodel_reasoning_effort = "medium"\nname = "keep-critic"\n';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function scalar(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  throw new Error(`unsupported YAML scalar: ${typeof value}`);
}

function yaml(value, indent = "") {
  return Object.entries(value).map(([key, child]) => {
    if (Array.isArray(child)) return `${indent}${key}:\n${child.map((item) => `${indent}  - ${scalar(item)}`).join("\n")}`;
    if (child && typeof child === "object") return `${indent}${key}:\n${yaml(child, `${indent}  `)}`;
    return `${indent}${key}: ${scalar(child)}`;
  }).join("\n");
}

function direct(runner, value, effort) {
  return {
    runner,
    selector: { kind: runner === "claude" ? "alias" : "model-id", value },
    effort,
    unavailability: "defer",
    evidenceRequirement: "dispatch-receipt",
  };
}

function v1Source() {
  const claude = (value, effort) => direct("claude", value, effort);
  const codex = (value = "gpt-5.6-terra", effort = "xhigh") => direct("codex", value, effort);
  return {
    schema: "pipeline.user.v1",
    language: { human_facing: "de", agent_facing: "en" },
    agent_runtime: "other",
    routing: {
      worktypes: {
        design: { design_phase: claude("opus", "high"), execution_phase: claude("opus", "high"), advisor: "off" },
        feature: { design_phase: claude("opus", "high"), execution_phase: claude("fable", "max"), advisor: claude("opus", "not-applicable") },
        mini: { design_phase: claude("sonnet", "high"), execution_phase: claude("sonnet", "high"), advisor: claude("opus", "not-applicable") },
      },
      duties: {
        implement: claude("sonnet", "medium"), mechanic: claude("sonnet", "low"), deep: claude("sonnet", "xhigh"), review: claude("sonnet", "max"),
        codex_design: codex("gpt-5.6-sol"), codex_independent_critic: codex(), codex_implementation: codex(), codex_goldfish: codex(), codex_mechanic: codex(), codex_deep: codex(),
      },
    },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
  };
}

function write(root, path, bytes) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "p3b-runner-conformance-"));
  write(root, ".claude/settings.json", SETTINGS);
  write(root, ".claude/pipeline.yaml", PIPELINE);
  write(root, ".codex/config.toml", CONFIG);
  write(root, ".codex/agents/implementor.toml", IMPLEMENTOR);
  write(root, ".codex/agents/critic.toml", CRITIC);
  write(root, "pipeline.user.yaml", `${yaml(v1Source())}\n`);
  return root;
}

function filesSnapshot(root, relativePath = "") {
  const directory = join(root, relativePath);
  const entries = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) entries.push(...filesSnapshot(root, path));
    else if (entry.isFile()) entries.push(`${path}:${sha256(readFileSync(join(root, path)))}`);
  }
  return entries.sort();
}

function target(plan, path) {
  const result = plan.targets.find((entry) => entry.path === path);
  assert.ok(result, `missing projection target ${path}`);
  return result;
}

function boundUsage(root, { runner, nativeEvent, requested, duty, effectiveModelId, effectiveEffort, evidenceSource }) {
  const dispatchId = `${runner}-${duty}-dispatch`;
  const source = runner === "claude"
    ? { threadId: "thread-claude-001", turnId: "turn-claude-001" }
    : { threadId: "thread-codex-001", turnId: "turn-codex-001" };
  const sourceContext = {
    schema: "pipeline.usage-source-context.v1",
    trust: runner === "codex" ? "codex-app-server" : "runner-wrapper",
    runner,
    source,
    scope: { kind: "turn", dispatchId },
  };
  const candidateCommit = "a".repeat(40);
  const candidateTree = "b".repeat(40);
  const resultSha256 = sha256(`${dispatchId}:result`);
  const routeEvidenceSha256 = sha256(`${dispatchId}:route-evidence`);
  const provider = runner === "claude" ? "anthropic" : "openai";
  const dispatchBinding = { dispatchId, queueRevision: 0, candidateCommit, candidateTree, requestedDuty: duty, requestedWorktype: null };
  const trustedEvidence = {
    source: evidenceSource,
    sha256: routeEvidenceSha256,
    resultSha256,
    effectiveDuty: duty,
    effectiveWorktype: null,
    effectiveRunner: runner,
    effectiveSelector: { kind: "model-id", value: effectiveModelId },
    effectiveProvider: provider,
    effectiveModelId,
    effectiveEffort,
  };
  const receipt = {
    schema: "pipeline.route-receipt.v1",
    ...dispatchBinding,
    resultSha256,
    requestedRunner: runner,
    requestedProvider: provider,
    requestedSelector: clone(requested.selector),
    requestedEffort: requested.effort,
    effectiveDuty: duty,
    effectiveWorktype: null,
    effectiveRunner: runner,
    effectiveSelector: { kind: "model-id", value: effectiveModelId },
    effectiveProvider: provider,
    effectiveModelId,
    effectiveEffort,
    resolutionEvidence: { source: evidenceSource, sha256: routeEvidenceSha256 },
    attestationAvailable: true,
    effectiveRouteStatus: "attested",
  };
  const receiptPath = `receipts/${runner}-${duty}.json`;
  write(root, receiptPath, JSON.stringify(receipt));
  return {
    sourceContext,
    routeContext: {
      schema: "pipeline.usage-route-context.v1",
      trust: "trusted-runner-wrapper",
      runner,
      requested: { selector: clone(requested.selector), effort: requested.effort },
      binding: {
        schema: "pipeline.usage-route-binding.v1",
        dispatchId,
        threadId: source.threadId,
        turnId: source.turnId,
        cell: { kind: "duty", dutyId: duty },
        candidateCommit,
        candidateTree,
        usageEventSha256: sha256(nativeEvent),
      },
      receipt: {
        schema: "pipeline.route-receipt.v1",
        repoRelativePath: receiptPath,
        sha256: sha256(readFileSync(join(root, receiptPath))),
        resultSha256,
        routeEvidenceSha256,
      },
      dispatchBinding,
      trustedEvidence,
    },
  };
}

let passed = 0;
const failures = [];
function check(name, run) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

check("C01 v1 preserves Claude routes and projects exact Codex routes", () => {
  const root = fixtureRoot();
  try {
    const migration = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(migration.status, "ready");
    assert.equal(migration.sourceKind, "v1");
    assert.equal(applyRunnerProfileMigrationV2(migration, { rootDir: root, activate: true }).status, "applied");
    const intent = parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8"));
    assert.equal(validatePipelineUserV2(intent).ok, true, "I1 validates the migrated v2 intent");
    assert.ok(!JSON.stringify(migration).includes("effectiveModelId"), "migration does not claim a provider model");

    const fableClaude = intent.routing.duties.critic_high_risk.claude;
    const fableCodex = intent.routing.duties.critic_high_risk.codex;
    const terraCodex = intent.routing.duties.implement.codex;
    assert.deepEqual(fableClaude, { state: "default", selector: { kind: "alias", value: "fable" }, effort: "max", unavailable: "defer", evidence: "dispatch-receipt" });
    assert.deepEqual(fableCodex, { state: "default", selector: { kind: "model-id", value: "gpt-5.6-sol" }, effort: fableClaude.effort, unavailable: "defer", evidence: "dispatch-receipt" });
    assert.deepEqual(terraCodex, { state: "default", selector: { kind: "model-id", value: "gpt-5.6-terra" }, effort: "xhigh", unavailable: "defer", evidence: "dispatch-receipt" });
    assert.deepEqual(intent.routing.duties.critic_normal.codex, registry.duties.critic_normal.codex, "legacy independent Critic stays in its exact Codex duty cell");
    assert.deepEqual(intent.routing.duties.implement.claude, { state: "default", selector: { kind: "alias", value: "sonnet" }, effort: "medium", unavailable: "defer", evidence: "dispatch-receipt" });
    assert.deepEqual(intent.routing.profiles.feature.execution_phase.claude, { state: "default", selector: { kind: "alias", value: "fable" }, effort: "max", unavailable: "defer", evidence: "dispatch-receipt" });
    assert.deepEqual(intent.routing.profiles.feature.execution_phase.codex, registry.profiles.feature.execution_phase.codex, "legacy Claude input never substitutes the Codex route");

    const projection = planRuntimeProjectionV2(intent, { source: "migrated-v2", baselines: readRuntimeProjectionV2Baselines(root) });
    assert.equal(projection.status, "ready");
    assert.equal(projection.requiresExplicitActivation, true);
    const claude = target(projection, ".claude/pipeline.yaml");
    assert.ok(claude.unowned.preserved);
    const claudeRuntime = parseYaml(claude.after.bytes);
    assert.deepEqual(claudeRuntime.modelRouting.elephant_feature_execution, { model: "fable", effort: "max" });
    assert.deepEqual(claudeRuntime.modelRouting.goldfish, { model: "sonnet-5", effort: "medium" });
    const codex = target(projection, ".codex/agents/implementor.toml");
    assert.deepEqual(codex.route.requested, { selector: { kind: "model-id", value: "gpt-5.6-terra" }, effort: "xhigh" });
    assert.deepEqual(codex.route.effective, { status: "unknown", reasonCode: "effective-model-not-observed" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

check("C02 native Claude and Codex usage bind only through receipts and never persist raw events", () => {
  const root = fixtureRoot();
  try {
    const intent = {
      schema: "pipeline.user.v2",
      language: { human_facing: "de", agent_facing: "en" },
      agent_runtime: "other",
      runners: { enabled: ["claude", "codex"], default: "codex" },
      routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) },
      usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
      autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
      gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
    };
    assert.equal(validatePipelineUserV2(intent).ok, true);
    const claude = boundUsage(root, {
      runner: "claude", nativeEvent: CLAUDE_EVENT, requested: intent.routing.duties.critic_high_risk.claude,
      duty: "critic_high_risk", effectiveModelId: "claude-conformance-observed", effectiveEffort: "max", evidenceSource: "cli",
    });
    const codexFable = boundUsage(root, {
      runner: "codex", nativeEvent: CODEX_EVENT, requested: intent.routing.duties.critic_high_risk.codex,
      duty: "critic_high_risk", effectiveModelId: "gpt-5.6-sol", effectiveEffort: "max", evidenceSource: "host",
    });
    const codexTerra = boundUsage(root, {
      runner: "codex", nativeEvent: CODEX_EVENT, requested: intent.routing.duties.implement.codex,
      duty: "implement", effectiveModelId: "gpt-5.6-terra", effectiveEffort: "xhigh", evidenceSource: "host",
    });
    const before = filesSnapshot(root);
    const unbound = ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: CODEX_EVENT, sourceContext: codexTerra.sourceContext, repoRoot: root });
    assert.deepEqual(unbound.route, { status: "unbound", effective: { status: "unknown", reasonCode: "receipt-missing" } });

    const claudeUsage = ingestClaudeUsage({ version: "claude-transcript-usage.v1", nativeEventBytes: CLAUDE_EVENT, sourceContext: claude.sourceContext, routeContext: claude.routeContext, repoRoot: root });
    const codexFableUsage = ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: CODEX_EVENT, sourceContext: codexFable.sourceContext, routeContext: codexFable.routeContext, repoRoot: root });
    const codexTerraUsage = ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: CODEX_EVENT, sourceContext: codexTerra.sourceContext, routeContext: codexTerra.routeContext, repoRoot: root });
    assert.deepEqual(claudeUsage.raw, JSON.parse(CLAUDE_EVENT).message.usage);
    assert.deepEqual(codexTerraUsage.raw, JSON.parse(CODEX_EVENT).usage);
    assert.deepEqual(claudeUsage.route.effective, { status: "observed", modelId: "claude-conformance-observed" });
    assert.deepEqual(codexFableUsage.route.effective, { status: "observed", modelId: "gpt-5.6-sol" });
    assert.deepEqual(codexTerraUsage.route.effective, { status: "observed", modelId: "gpt-5.6-terra" });
    assert.equal(claudeUsage.common.cachedInputTokens.status, "unavailable");
    assert.equal(codexTerraUsage.common.cacheReadInputTokens.status, "unavailable");
    assert.deepEqual(claudeUsage.common.billedCost, { status: "unknown", reasonCode: "billing-unavailable" });
    assert.deepEqual(codexTerraUsage.common.estimatedCost, { status: "unknown", reasonCode: "billing-unavailable" });

    const mismatched = clone(codexTerra.routeContext);
    mismatched.binding.usageEventSha256 = "f".repeat(64);
    const broken = ingestCodexUsage({ version: "codex-exec-json.v1", nativeEventBytes: CODEX_EVENT, sourceContext: codexTerra.sourceContext, routeContext: mismatched, repoRoot: root });
    assert.deepEqual(broken.route, { status: "unbound", effective: { status: "unknown", reasonCode: "binding-mismatch" } });
    assert.deepEqual(filesSnapshot(root), before, "usage ingestion writes neither raw events nor telemetry state");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} P3B cross-runner conformance test(s) passed.`);
}

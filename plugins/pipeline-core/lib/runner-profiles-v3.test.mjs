#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import {
  loadPipelineUserV3Schema,
  loadRunnerProfilesV3Registry,
  validatePipelineUserV3,
  validateRunnerProfilesV3Registry,
} from "./runner-profiles-v3.mjs";

const registry = loadRunnerProfilesV3Registry();
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function completeIntent() {
  return {
    schema: "pipeline.user.v3",
    language: { human_facing: "de", agent_facing: "en" },
    agent_runtime: "other",
    runners: { enabled: ["claude", "codex"], default: "codex" },
    routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) },
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
    session: { keep_awake: true },
    critic_export: clone(registry.criticExportPolicy),
  };
}
function has(result, path, code) { return result.errors.some((entry) => entry.path === path && entry.code === code); }

const cases = [
  ["schema names V3", () => assert.equal(loadPipelineUserV3Schema().$id, "pipeline.user.v3")],
  ["committed V3 registry is accepted", () => assert.equal(validateRunnerProfilesV3Registry(registry).ok, true)],
  ["registered profile and duty defaults match the approved matrix", () => {
    const route = (cell) => `${cell.selector.value} / ${cell.effort}`;
    assert.deepEqual({
      "epic.design.codex": route(registry.profiles.epic.design_phase.codex),
      "epic.design.claude": route(registry.profiles.epic.design_phase.claude),
      "epic.execution.codex": route(registry.profiles.epic.execution_phase.codex),
      "epic.execution.claude": route(registry.profiles.epic.execution_phase.claude),
      "feature.design.codex": route(registry.profiles.feature.design_phase.codex),
      "feature.design.claude": route(registry.profiles.feature.design_phase.claude),
      "feature.execution.codex": route(registry.profiles.feature.execution_phase.codex),
      "feature.execution.claude": route(registry.profiles.feature.execution_phase.claude),
      "mini.design.codex": route(registry.profiles.mini.design_phase.codex),
      "mini.design.claude": route(registry.profiles.mini.design_phase.claude),
      "mini.execution.codex": route(registry.profiles.mini.execution_phase.codex),
      "mini.execution.claude": route(registry.profiles.mini.execution_phase.claude),
      "advisory.codex": route(registry.duties.advisory.codex),
      "advisory.claude": route(registry.duties.advisory.claude),
      "advisory.claude.native-opus": route(registry.duties.advisory.claude.fallbacks[0]),
      "advisory.claude.consult": route(registry.duties.advisory.claude.fallbacks[1]),
      "critic-high-risk.codex": route(registry.duties.critic_high_risk.codex),
      "critic-high-risk.claude": route(registry.duties.critic_high_risk.claude),
      "critic-normal.codex": route(registry.duties.critic_normal.codex),
      "critic-normal.claude": route(registry.duties.critic_normal.claude),
      "deep.codex": route(registry.duties.deep.codex),
      "deep.claude": route(registry.duties.deep.claude),
      "implement.codex": route(registry.duties.implement.codex),
      "implement.claude": route(registry.duties.implement.claude),
      "mechanic.codex": route(registry.duties.mechanic.codex),
      "mechanic.claude": route(registry.duties.mechanic.claude),
      "readiness.codex": route(registry.duties.readiness.codex),
      "readiness.claude": route(registry.duties.readiness.claude),
      "test-author.codex": route(registry.duties.test_author.codex),
      "test-author.claude": route(registry.duties.test_author.claude),
    }, {
      "epic.design.codex": "gpt-5.6-sol / xhigh", "epic.design.claude": "opus / xhigh",
      "epic.execution.codex": "gpt-5.6-terra / high", "epic.execution.claude": "sonnet / high",
      "feature.design.codex": "gpt-5.6-sol / high", "feature.design.claude": "opus / high",
      "feature.execution.codex": "gpt-5.6-terra / medium", "feature.execution.claude": "sonnet / medium",
      "mini.design.codex": "gpt-5.6-terra / high", "mini.design.claude": "sonnet / high",
      "mini.execution.codex": "gpt-5.6-terra / medium", "mini.execution.claude": "sonnet / medium",
      "advisory.codex": "gpt-5.6-sol / max", "advisory.claude": "fable / not-applicable",
      "advisory.claude.native-opus": "opus / not-applicable", "advisory.claude.consult": "fable / max",
      "critic-high-risk.codex": "gpt-5.6-sol / max", "critic-high-risk.claude": "opus / max",
      "critic-normal.codex": "gpt-5.6-terra / high", "critic-normal.claude": "sonnet / high",
      "deep.codex": "gpt-5.6-terra / high", "deep.claude": "sonnet / high",
      "implement.codex": "gpt-5.6-luna / medium", "implement.claude": "sonnet / medium",
      "mechanic.codex": "gpt-5.6-luna / low", "mechanic.claude": "sonnet / low",
      "readiness.codex": "gpt-5.6-terra / high", "readiness.claude": "sonnet / high",
      "test-author.codex": "gpt-5.6-terra / high", "test-author.claude": "sonnet / high",
    });
  }],
  ["complete V3 intent is accepted", () => assert.equal(validatePipelineUserV3(completeIntent()).ok, true)],
  ["advisory is a duty, not a profile phase", () => {
    const value = completeIntent(); value.routing.profiles.epic.advisory = clone(value.routing.duties.advisory);
    const checked = validatePipelineUserV3(value); assert.equal(checked.ok, false); assert.ok(has(checked, "$.routing.profiles.epic.advisory", "additional_property"));
  }],
  ["legacy design profile is rejected", () => {
    const value = completeIntent(); value.routing.profiles.design = clone(value.routing.profiles.epic);
    const checked = validatePipelineUserV3(value); assert.equal(checked.ok, false); assert.ok(has(checked, "$.routing.profiles.design", "additional_property"));
  }],
  ["mini cannot enable advisory", () => {
    const value = completeIntent(); value.routing.duties.advisory.eligibility.mini = "required";
    const checked = validatePipelineUserV3(value); assert.equal(checked.ok, false); assert.ok(has(checked, "$.routing.duties.advisory.eligibility.mini", "frozen_mapping"));
  }],
  ["Claude fallback order is fixed", () => {
    const value = completeIntent(); value.routing.duties.advisory.claude.fallbacks.reverse();
    const checked = validatePipelineUserV3(value); assert.equal(checked.ok, false); assert.ok(checked.errors.some((entry) => entry.path.startsWith("$.routing.duties.advisory.claude.fallbacks")));
  }],
  ["Codex advisory selected-sandbox host-consult cell is frozen", () => {
    const cell = completeIntent().routing.duties.advisory.codex;
    assert.deepEqual(cell, { adapter: "host-consult", effort: "max", evidence: "advisory-receipt", isolation: "selected-sandbox-network-open-read-only", runner: "codex", selector: { kind: "model-id", value: "gpt-5.6-sol" }, state: "default", status: "pipeline.codex-sandbox-execution-receipt.v1" });
    const value = completeIntent(); value.routing.duties.advisory.codex.selector.value = "gpt-5.6-terra";
    const checked = validatePipelineUserV3(value); assert.equal(checked.ok, false); assert.ok(has(checked, "$.routing.duties.advisory.codex.selector.value", "frozen_mapping"));
  }],
  ["every schema-defined nested object is closed", () => {
    const value = completeIntent();
    value.language.extra = "de";
    value.runners.extra = true;
    value.routing.extra = {};
    value.usage.extra = "none";
    value.autonomy.extra = 1;
    value.gates.extra = "warn";
    const checked = validatePipelineUserV3(value);
    assert.equal(checked.ok, false);
    for (const path of ["$.language.extra", "$.runners.extra", "$.routing.extra", "$.usage.extra", "$.autonomy.extra", "$.gates.extra"]) {
      assert.ok(has(checked, path, "additional_property"), `missing closed-object error for ${path}`);
    }
  }],
  ["runner allowlist, cardinality, uniqueness, and enabled default are enforced", () => {
    for (const enabled of [[], ["claude", "claude"], ["claude", "codex", "claude"], ["claude", "antigravity"]]) {
      const value = completeIntent(); value.runners.enabled = enabled;
      const checked = validatePipelineUserV3(value);
      assert.equal(checked.ok, false, `unexpected acceptance for ${JSON.stringify(enabled)}`);
      assert.ok(has(checked, "$.runners", "contract"));
    }
    const value = completeIntent(); value.runners.enabled = ["claude"]; value.runners.default = "codex";
    const checked = validatePipelineUserV3(value);
    assert.equal(checked.ok, false); assert.ok(has(checked, "$.runners", "contract"));
  }],
  ["normal Codex Critic uses the registered Terra high route", () => {
    const route = registry.duties.critic_normal.codex;
    assert.equal(route.selector.value, "gpt-5.6-terra");
    assert.equal(route.effort, "high");
  }],
  ["keep-awake accepts only its explicit boolean and legacy V3 absence remains compatible", () => {
    const enabled = completeIntent();
    assert.equal(validatePipelineUserV3(enabled).ok, true);
    const legacy = completeIntent(); delete legacy.session;
    assert.equal(validatePipelineUserV3(legacy).ok, true);
    const malformed = completeIntent(); malformed.session = { keep_awake: true, command: "never" };
    const checked = validatePipelineUserV3(malformed);
    assert.equal(checked.ok, false); assert.ok(has(checked, "$.session.command", "additional_property"));
  }],
  ["advisor export consent is an optional closed public-safe V3 authority", () => {
    const schema = loadPipelineUserV3Schema();
    assert.deepEqual(schema.properties.advisor_export, { "$ref": "#/$defs/advisor_export" });
    assert.deepEqual(schema.$defs.advisor_export, {
      type: "object",
      required: ["consent"],
      additionalProperties: false,
      properties: { consent: { enum: ["approved", "declined"] } },
    });
  }],
  ["missing advisor export consent remains valid and leaves advisory enabled by default", () => {
    const checked = validatePipelineUserV3(completeIntent());
    assert.equal(checked.ok, true);
    assert.deepEqual(checked.advisoryExport, { consent: "missing", enabled: true });
  }],
  ["declined advisor export consent resolves advisory disabled", () => {
    const value = completeIntent(); value.advisor_export = { consent: "declined" };
    const checked = validatePipelineUserV3(value);
    assert.equal(checked.ok, true);
    assert.deepEqual(checked.advisoryExport, { consent: "declined", enabled: false });
  }],
  ["approved advisor export consent remains compatible with the enabled default", () => {
    const value = completeIntent(); value.advisor_export = { consent: "approved" };
    const checked = validatePipelineUserV3(value);
    assert.equal(checked.ok, true);
    assert.deepEqual(checked.advisoryExport, { consent: "approved", enabled: true });
  }],
  ["registry cannot reintroduce profile advisory", () => {
    const value = clone(registry); value.phases.push("advisory");
    const checked = validateRunnerProfilesV3Registry(value); assert.equal(checked.ok, false); assert.ok(has(checked, "$.phases", "frozen_mapping"));
  }],
  ["registry cannot silently change host-consult runner", () => {
    const value = clone(registry); value.duties.advisory.codex.runner = "claude";
    const checked = validateRunnerProfilesV3Registry(value); assert.equal(checked.ok, false); assert.ok(has(checked, "$.duties.advisory.codex.runner", "frozen_mapping"));
  }],
];

let passed = 0;
for (const [name, run] of cases) {
  try { run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { console.log(`FAIL  ${name} -- ${error instanceof Error ? error.message : String(error)}`); }
}
console.log(`\n${passed}/${cases.length} cases passed.`);
if (passed !== cases.length) process.exitCode = 1;

#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

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
  ["Codex advisory remains Sol consult", () => {
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
  ["normal Codex Critic remains ADR-0035 Sol xhigh", () => {
    const route = registry.duties.critic_normal.codex;
    assert.equal(route.selector.value, "gpt-5.6-sol");
    assert.equal(route.effort, "xhigh");
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
  ["missing advisor export consent remains valid but resolves advisory disabled", () => {
    const checked = validatePipelineUserV3(completeIntent());
    assert.equal(checked.ok, true);
    assert.deepEqual(checked.advisoryExport, { consent: "missing", enabled: false });
  }],
  ["declined advisor export consent resolves advisory disabled", () => {
    const value = completeIntent(); value.advisor_export = { consent: "declined" };
    const checked = validatePipelineUserV3(value);
    assert.equal(checked.ok, true);
    assert.deepEqual(checked.advisoryExport, { consent: "declined", enabled: false });
  }],
  ["approved advisor export consent exposes authority for the registered duty", () => {
    const value = completeIntent(); value.advisor_export = { consent: "approved" };
    const checked = validatePipelineUserV3(value);
    assert.equal(checked.ok, true);
    assert.deepEqual(checked.advisoryExport, { consent: "approved", enabled: true });
  }],
  ["registry cannot reintroduce profile advisory", () => {
    const value = clone(registry); value.phases.push("advisory");
    const checked = validateRunnerProfilesV3Registry(value); assert.equal(checked.ok, false); assert.ok(has(checked, "$.phases", "frozen_mapping"));
  }],
  ["registry cannot silently change consult runner", () => {
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

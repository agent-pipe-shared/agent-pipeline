#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * Contract tests for the I1 fail-closed runner-profile validators.
 *
 * Run: node plugins/pipeline-core/lib/runner-profiles-v2.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main as validateRunnerProfilesV2Cli } from "../scripts/validate-runner-profiles-v2.mjs";

import {
  loadRunnerProfilesV2Registry,
  validatePipelineUserV2,
  validateRunnerProfilesV2Registry,
} from "./runner-profiles-v2.mjs";

const registry = loadRunnerProfilesV2Registry();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function completePipelineUser() {
  return {
    schema: "pipeline.user.v2",
    language: { human_facing: "de", agent_facing: "en" },
    agent_runtime: "other",
    runners: { enabled: ["claude", "codex"], default: "codex" },
    routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) },
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
  };
}

function hasError(result, expected) {
  return result.errors.some((error) => error.path === expected.path && error.code === expected.code);
}

function assertResult(result, expected, source) {
  assert.equal(result.source, source, "diagnostic source");
  assert.equal(result.ok, expected.ok, "validation disposition");
  for (const error of expected.errors ?? []) {
    assert.ok(hasError(result, error), `missing diagnostic ${error.path} (${error.code})`);
  }
  if (expected.ok) assert.equal(result.errors.length, 0, "valid input has no diagnostics");
}

let passed = 0;
const failures = [];

function record(name, run) {
  try {
    run();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${detail}`);
    console.log(`FAIL  ${name} -- ${detail}`);
  }
}

function runTable(group, cases, run) {
  for (const testCase of cases) record(`${group}: ${testCase.name}`, () => run(testCase));
}

const registryCases = [
  { name: "committed registry is accepted", expected: { ok: true } },
  {
    name: "missing profile is rejected",
    mutate: (value) => { delete value.profiles.mini; },
    expected: { ok: false, errors: [{ path: "$.profiles.mini", code: "required" }] },
  },
  {
    name: "extra profile is rejected",
    mutate: (value) => { value.profiles.unapproved = clone(value.profiles.mini); },
    expected: { ok: false, errors: [{ path: "$.profiles", code: "unknown_identifier" }] },
  },
  {
    name: "missing phase is rejected",
    mutate: (value) => { delete value.profiles.feature.execution_phase; },
    expected: { ok: false, errors: [{ path: "$.profiles.feature.execution_phase", code: "required" }] },
  },
  {
    name: "extra phase is rejected",
    mutate: (value) => { value.profiles.feature.preview_phase = clone(value.profiles.feature.design_phase); },
    expected: { ok: false, errors: [{ path: "$.profiles.feature", code: "unknown_identifier" }] },
  },
  {
    name: "missing duty is rejected",
    mutate: (value) => { delete value.duties.readiness; },
    expected: { ok: false, errors: [{ path: "$.duties.readiness", code: "required" }] },
  },
  {
    name: "extra duty is rejected",
    mutate: (value) => { value.duties.unapproved = clone(value.duties.implement); },
    expected: { ok: false, errors: [{ path: "$.duties", code: "unknown_identifier" }] },
  },
  {
    name: "missing runner cell is rejected",
    mutate: (value) => { delete value.profiles.design.design_phase.codex; },
    expected: { ok: false, errors: [{ path: "$.profiles.design.design_phase.codex", code: "required" }] },
  },
  {
    name: "extra runner cell is rejected",
    mutate: (value) => { value.duties.implement.unapproved = clone(value.duties.implement.codex); },
    expected: { ok: false, errors: [{ path: "$.duties.implement", code: "unknown_identifier" }] },
  },
  {
    name: "unknown capability state is rejected",
    mutate: (value) => { value.duties.implement.codex.state = "available"; },
    expected: { ok: false, errors: [{ path: "$.duties.implement.codex.state", code: "enum" }] },
  },
  {
    name: "invalid selector is rejected",
    mutate: (value) => { value.duties.implement.codex.selector = { kind: "model-id", value: "gpt-5.6-unknown" }; },
    expected: { ok: false, errors: [{ path: "$.duties.implement.codex.selector", code: "one_of" }] },
  },
  {
    name: "missing selector is rejected",
    mutate: (value) => { delete value.duties.implement.codex.selector; },
    expected: { ok: false, errors: [{ path: "$.duties.implement.codex", code: "one_of" }] },
  },
  {
    name: "invalid effort is rejected",
    mutate: (value) => { value.duties.implement.codex.effort = "high"; },
    expected: { ok: false, errors: [{ path: "$.duties.implement.codex.effort", code: "const" }] },
  },
  {
    name: "missing effort is rejected",
    mutate: (value) => { delete value.duties.implement.codex.effort; },
    expected: { ok: false, errors: [{ path: "$.duties.implement.codex", code: "one_of" }] },
  },
  {
    name: "legacy alias terra is rejected",
    mutate: (value) => { value.duties.implement.codex.selector = { kind: "alias", value: "terra" }; },
    expected: { ok: false, errors: [{ path: "$.duties.implement.codex.selector", code: "one_of" }] },
  },
  {
    name: "asserted effective model is rejected",
    mutate: (value) => { value.duties.implement.codex.effectiveModelId = "provider-guess"; },
    expected: { ok: false, errors: [{ path: "$.duties.implement.codex", code: "additional_property" }] },
  },
  {
    name: "Codex Advisor substitution is rejected",
    mutate: (value) => { value.profiles.feature.advisory.codex = clone(value.duties.implement.codex); },
    expected: { ok: false, errors: [{ path: "$.profiles.feature.advisory.codex.state", code: "const" }] },
  },
];

runTable("registry", registryCases, (testCase) => {
  const value = clone(registry);
  testCase.mutate?.(value);
  const source = `registry table: ${testCase.name}`;
  assertResult(validateRunnerProfilesV2Registry(value, { source }), testCase.expected, source);
});

const configCases = [
  { name: "complete committed configuration is accepted", expected: { ok: true } },
  {
    name: "complete configuration retains a schema-valid legacy Claude route",
    mutate: (value) => {
      value.routing.profiles.feature.execution_phase.claude.selector = { kind: "alias", value: "fable" };
      value.routing.profiles.feature.execution_phase.claude.effort = "max";
    },
    expected: { ok: true },
  },
  {
    name: "complete configuration rejects legacy Claude capability-state drift",
    mutate: (value) => { value.routing.profiles.feature.execution_phase.claude.state = "opt-in"; },
    expected: { ok: false, errors: [{ path: "$.routing.profiles.feature.execution_phase.claude.state", code: "frozen_mapping" }] },
  },
  {
    name: "complete configuration rejects frozen Codex mapping drift",
    mutate: (value) => { value.routing.duties.implement.codex = clone(value.routing.duties.mechanic.codex); },
    expected: { ok: false, errors: [{ path: "$.routing.duties.implement.codex.state", code: "frozen_mapping" }] },
  },
  {
    name: "complete configuration rejects a legacy Terra alias",
    mutate: (value) => { value.routing.duties.implement.codex.selector = { kind: "alias", value: "terra" }; },
    expected: { ok: false, errors: [{ path: "$.routing.duties.implement.codex.selector", code: "one_of" }] },
  },
  {
    name: "complete configuration rejects an unregistered duty",
    mutate: (value) => { value.routing.duties.unapproved = clone(value.routing.duties.implement); },
    expected: { ok: false, errors: [{ path: "$.routing.duties", code: "additional_property" }] },
  },
];

runTable("pipeline.user.v2", configCases, (testCase) => {
  const value = completePipelineUser();
  testCase.mutate?.(value);
  const source = `pipeline.user.v2 table: ${testCase.name}`;
  assertResult(validatePipelineUserV2(value, { source }), testCase.expected, source);
});

function parseCliOutput(output) {
  return output.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function runCli(args) {
  const output = [];
  const write = process.stdout.write;
  process.stdout.write = (chunk) => {
    output.push(String(chunk));
    return true;
  };
  try {
    return { status: validateRunnerProfilesV2Cli(args), output: output.join("") };
  } finally {
    process.stdout.write = write;
  }
}

const fixtureDirectory = mkdtempSync(join(tmpdir(), "runner-profiles-v2-test-"));
const validConfigPath = join(fixtureDirectory, "valid.pipeline.user.v2.json");
const invalidConfigPath = join(fixtureDirectory, "invalid.pipeline.user.v2.json");
const invalidRegistryPath = join(fixtureDirectory, "invalid.runner-profiles-v2.json");
const invalidConfig = completePipelineUser();
invalidConfig.routing.duties.implement.codex.effort = "max";
const invalidRegistry = clone(registry);
invalidRegistry.duties.implement.codex.selector = { kind: "alias", value: "terra" };
writeFileSync(validConfigPath, `${JSON.stringify(completePipelineUser())}\n`);
writeFileSync(invalidConfigPath, `${JSON.stringify(invalidConfig)}\n`);
writeFileSync(invalidRegistryPath, `${JSON.stringify(invalidRegistry)}\n`);

const cliCases = [
  {
    name: "committed registry exits zero",
    args: [],
    status: 0,
    records: [{ source: "committed runner-profiles-v2.json", ok: true }],
  },
  {
    name: "valid complete configuration exits zero",
    args: ["--config", validConfigPath],
    status: 0,
    records: [
      { source: "committed runner-profiles-v2.json", ok: true },
      { source: validConfigPath, ok: true },
    ],
  },
  {
    name: "invalid registry exits nonzero",
    args: ["--registry", invalidRegistryPath],
    status: 1,
    records: [{ source: invalidRegistryPath, ok: false, error: { path: "$.duties.implement.codex.selector", code: "one_of" } }],
  },
  {
    name: "invalid complete configuration exits nonzero",
    args: ["--config", invalidConfigPath],
    status: 1,
    records: [
      { source: "committed runner-profiles-v2.json", ok: true },
      { source: invalidConfigPath, ok: false, error: { path: "$.routing.duties.implement.codex.effort", code: "const" } },
    ],
  },
];

try {
  runTable("CLI", cliCases, (testCase) => {
    const result = runCli(testCase.args);
    assert.equal(result.status, testCase.status, "CLI exit status");
    const records = parseCliOutput(result.output);
    assert.equal(records.length, testCase.records.length, "CLI record count");
    for (const [index, expected] of testCase.records.entries()) {
      const actual = records[index];
      assert.equal(actual.schema, "pipeline.runner-profiles.validation.v1", `record ${index} schema`);
      assert.equal(actual.source, expected.source, `record ${index} source`);
      assert.equal(actual.ok, expected.ok, `record ${index} disposition`);
      if (expected.error) assert.ok(hasError(actual, expected.error), `record ${index} diagnostic`);
    }
  });
} finally {
  rmSync(fixtureDirectory, { recursive: true, force: true });
}

const total = passed + failures.length;
console.log(`\n${passed}/${total} cases passed.`);
if (failures.length) {
  console.log("Failures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { inspectPipelineUserDrift } from "./pipeline-user-drift.mjs";

const REPO_SCHEMA_PATH = fileURLToPath(new URL("../../../pipeline.user.schema.json", import.meta.url));
const SCHEMA_BYTES = readFileSync(REPO_SCHEMA_PATH, "utf8");

const CONFORMING_YAML = `setup:
  intent: "consumer"
language:
  human_facing: "en"
  agent_facing: "en"
agent_runtime: "claude-code"
worktypes:
  design:
    design_phase:
      model: "opus"
      effort: "high"
    execution_phase:
      model: "sonnet"
      effort: "high"
    advisor: "off"
  feature:
    design_phase:
      model: "opus"
      effort: "high"
    execution_phase:
      model: "sonnet"
      effort: "medium"
    advisor: "off"
  mini:
    design_phase:
      model: "sonnet"
      effort: "high"
    execution_phase:
      model: "sonnet"
      effort: "medium"
    advisor: "off"
models:
  implement:
    model: "sonnet"
    effort: "medium"
  mechanic:
    model: "haiku"
    effort: "medium"
  deep:
    model: "sonnet"
    effort: "xhigh"
  review:
    model: "sonnet"
    effort: "high"
autonomy:
  push_policy: "gated"
  branch_model: "feature-branch"
  wip_limit: 3
gates:
  dev_plan: "blocking"
  push: "blocking"
  security: "blocking"
  claude_md_max_lines: 200
`;

// Same conforming document with the required `autonomy` object (its header line
// plus every indented line under it) removed entirely.
const MISSING_REQUIRED_KEY_YAML = CONFORMING_YAML.replace(/autonomy:\n(?: {2}.*\n)+/u, "");

// Same conforming document with one schema-forbidden extra top-level key added.
const EXTRA_KEY_YAML = `${CONFORMING_YAML}chat_gate_ceremony: "enabled"\n`;

// A tab character in indentation is explicitly, loudly rejected by yaml-lite.mjs.
const MALFORMED_YAML = "setup:\n\tintent: \"consumer\"\n";

function makeFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "pipeline-user-drift-test-"));
  writeFileSync(join(root, "pipeline.user.schema.json"), SCHEMA_BYTES, "utf8");
  return root;
}

function withFixtureRoot(fn) {
  const root = makeFixtureRoot();
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a conforming pipeline.user.yaml reports no drift and stays silent", () => {
  withFixtureRoot((root) => {
    writeFileSync(join(root, "pipeline.user.yaml"), CONFORMING_YAML, "utf8");
    const result = inspectPipelineUserDrift({ rootDir: root });
    assert.equal(result.status, "conforming");
    assert.equal(result.drifted, false);
    assert.deepEqual(result.diagnostics, []);
  });
});

test("a pipeline.user.yaml missing a required key reports drift naming that exact key path and a repair command", () => {
  withFixtureRoot((root) => {
    writeFileSync(join(root, "pipeline.user.yaml"), MISSING_REQUIRED_KEY_YAML, "utf8");
    const result = inspectPipelineUserDrift({ rootDir: root });
    assert.equal(result.status, "drifted");
    assert.equal(result.drifted, true);
    assert.ok(result.diagnostics.length > 0);
    const finding = result.diagnostics.find((d) => d.path === "$.autonomy");
    assert.ok(finding, `expected a diagnostic naming $.autonomy, got: ${JSON.stringify(result.diagnostics)}`);
    assert.equal(finding.code, "missing_required_property");
    assert.equal(finding.repair, "node setup.mjs");
  });
});

test("a pipeline.user.yaml with a schema-forbidden extra key reports drift naming it and a repair command", () => {
  withFixtureRoot((root) => {
    writeFileSync(join(root, "pipeline.user.yaml"), EXTRA_KEY_YAML, "utf8");
    const result = inspectPipelineUserDrift({ rootDir: root });
    assert.equal(result.status, "drifted");
    assert.equal(result.drifted, true);
    const finding = result.diagnostics.find((d) => d.path === "$.chat_gate_ceremony");
    assert.ok(finding, `expected a diagnostic naming $.chat_gate_ceremony, got: ${JSON.stringify(result.diagnostics)}`);
    assert.equal(finding.code, "unexpected_additional_property");
    assert.equal(finding.repair, "node setup.mjs");
  });
});

test("an absent pipeline.user.yaml returns a typed result instead of throwing", () => {
  withFixtureRoot((root) => {
    const result = inspectPipelineUserDrift({ rootDir: root });
    assert.equal(result.status, "source-absent");
    assert.equal(result.drifted, false);
    assert.equal(result.diagnostics.length, 1);
  });
});

test("an unparseable/malformed pipeline.user.yaml returns a typed result instead of throwing", () => {
  withFixtureRoot((root) => {
    writeFileSync(join(root, "pipeline.user.yaml"), MALFORMED_YAML, "utf8");
    const result = inspectPipelineUserDrift({ rootDir: root });
    assert.equal(result.status, "source-unparseable");
    assert.equal(result.drifted, false);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].code, "yaml_parse");
  });
});

test("inspection is read-only: pipeline.user.yaml's bytes are byte-identical before and after, over a drifted fixture", () => {
  withFixtureRoot((root) => {
    const userYamlPath = join(root, "pipeline.user.yaml");
    const schemaJsonPath = join(root, "pipeline.user.schema.json");
    writeFileSync(userYamlPath, MISSING_REQUIRED_KEY_YAML, "utf8");
    const userYamlBefore = readFileSync(userYamlPath);
    const schemaJsonBefore = readFileSync(schemaJsonPath);

    const result = inspectPipelineUserDrift({ rootDir: root });
    assert.equal(result.status, "drifted");

    const userYamlAfter = readFileSync(userYamlPath);
    const schemaJsonAfter = readFileSync(schemaJsonPath);
    assert.equal(Buffer.compare(userYamlBefore, userYamlAfter), 0);
    assert.equal(Buffer.compare(schemaJsonBefore, schemaJsonAfter), 0);
  });
});

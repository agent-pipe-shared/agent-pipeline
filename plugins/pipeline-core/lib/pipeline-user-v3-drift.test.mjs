// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { inspectPipelineUserV3Drift } from "./pipeline-user-v3-drift.mjs";

// This repository's own `pipeline.user.yaml` is a correct, fully-onboarded
// pipeline.user.v3 source (the negative case named by the dispatch briefing).
// Reading its real bytes -- rather than hand-authoring a fixture -- is
// deliberate: validatePipelineUserV3 compares `routing.profiles`/
// `routing.duties`/`critic_export` byte-exact against the frozen, committed
// V3 registry, so any hand-written fixture would drift from that registry the
// moment it changes. Using the live file keeps this suite honest against the
// same authority the detector itself calls.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const REPO_PIPELINE_USER_YAML_PATH = join(REPO_ROOT, "pipeline.user.yaml");
const CONFORMING_YAML = readFileSync(REPO_PIPELINE_USER_YAML_PATH, "utf8");

// The generic, consumer-invokable repair command every "drifted" diagnostic
// must carry (module header / REPAIR_COMMAND in pipeline-user-v3-drift.mjs).
// Duplicated here deliberately: a mismatch would mean either the module or
// this assertion drifted, and this test exists to catch that.
const REPAIR_COMMAND =
  "node <plugin-root>/scripts/project-onboarding-v3.mjs plan-source-recovery --root <project-dir> --runner <claude|codex>";

// Same conforming document with the required top-level `autonomy:` object
// (its header line plus every 2-space-indented line under it) removed
// entirely. `^autonomy:` (multiline) matches only the unindented, top-level
// occurrence -- never a nested key of the same name.
const MISSING_REQUIRED_KEY_YAML = CONFORMING_YAML.replace(/^autonomy:\n(?: {2}.*\n)+/mu, "");
assert.notEqual(MISSING_REQUIRED_KEY_YAML, CONFORMING_YAML, "fixture setup: the autonomy: block must actually be present in the real pipeline.user.yaml for this test to mean anything");

// Same conforming document with one schema-forbidden extra top-level key added.
const EXTRA_KEY_YAML = `${CONFORMING_YAML}chat_gate_ceremony: "enabled"\n`;

// A v2 source (recognized schema, but not v3) is out of this detector's
// scope by design -- the existing v0/v1/v2 migration's job, never this
// module's to classify.
const V2_SCHEMA_YAML = 'schema: "pipeline.user.v2"\nagent_runtime: "claude-code"\n';

// A tab character in indentation is explicitly, loudly rejected by yaml-lite.mjs.
const MALFORMED_YAML = "schema:\n\t\"pipeline.user.v3\"\n";

function makeFixtureRoot() {
  return mkdtempSync(join(tmpdir(), "pipeline-user-v3-drift-test-"));
}

function withFixtureRoot(fn) {
  const root = makeFixtureRoot();
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a conforming pipeline.user.yaml reports no drift and stays silent -- both a copied fixture and this repository's own real file", () => {
  withFixtureRoot((root) => {
    writeFileSync(join(root, "pipeline.user.yaml"), CONFORMING_YAML, "utf8");
    const result = inspectPipelineUserV3Drift({ rootDir: root });
    assert.equal(result.status, "conforming");
    assert.equal(result.drifted, false);
    assert.deepEqual(result.diagnostics, []);
  });

  // DoD: "A correct, fully-onboarded schema: pipeline.user.v3 calibration is
  // never reported as drifted." Run directly against the repository's own
  // real file (not a copy) and confirm it is untouched by the run.
  const before = readFileSync(REPO_PIPELINE_USER_YAML_PATH);
  const result = inspectPipelineUserV3Drift({ rootDir: REPO_ROOT });
  assert.equal(result.status, "conforming");
  assert.equal(result.drifted, false);
  assert.deepEqual(result.diagnostics, []);
  const after = readFileSync(REPO_PIPELINE_USER_YAML_PATH);
  assert.equal(Buffer.compare(before, after), 0, "inspecting this repository's own pipeline.user.yaml must never change its bytes");
});

test("a pipeline.user.yaml missing a required key reports drift naming that exact key path, the validator's own hint, and the generic repair command", () => {
  withFixtureRoot((root) => {
    writeFileSync(join(root, "pipeline.user.yaml"), MISSING_REQUIRED_KEY_YAML, "utf8");
    const result = inspectPipelineUserV3Drift({ rootDir: root });
    assert.equal(result.status, "drifted");
    assert.equal(result.drifted, true);
    assert.ok(result.diagnostics.length > 0);
    const finding = result.diagnostics.find((d) => d.path === "$.autonomy");
    assert.ok(finding, `expected a diagnostic naming $.autonomy, got: ${JSON.stringify(result.diagnostics)}`);
    assert.equal(finding.code, "required");
    // The validator's own specific hint must survive, not be overwritten by
    // the generic command.
    assert.equal(finding.repair, "add the required property");
    assert.equal(finding.repairCommand, REPAIR_COMMAND);
  });
});

test("a pipeline.user.yaml with a schema-forbidden extra key reports drift naming it, and the generic repair command", () => {
  withFixtureRoot((root) => {
    writeFileSync(join(root, "pipeline.user.yaml"), EXTRA_KEY_YAML, "utf8");
    const result = inspectPipelineUserV3Drift({ rootDir: root });
    assert.equal(result.status, "drifted");
    assert.equal(result.drifted, true);
    const finding = result.diagnostics.find((d) => d.path === "$.chat_gate_ceremony");
    assert.ok(finding, `expected a diagnostic naming $.chat_gate_ceremony, got: ${JSON.stringify(result.diagnostics)}`);
    assert.equal(finding.code, "additional_property");
    assert.equal(finding.repairCommand, REPAIR_COMMAND);
  });
});

test("an absent pipeline.user.yaml returns a typed result instead of throwing", () => {
  withFixtureRoot((root) => {
    const result = inspectPipelineUserV3Drift({ rootDir: root });
    assert.equal(result.status, "source-absent");
    assert.equal(result.drifted, false);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].repairCommand, REPAIR_COMMAND);
  });
});

test("an unparseable/malformed pipeline.user.yaml returns a typed result instead of throwing", () => {
  withFixtureRoot((root) => {
    writeFileSync(join(root, "pipeline.user.yaml"), MALFORMED_YAML, "utf8");
    const result = inspectPipelineUserV3Drift({ rootDir: root });
    assert.equal(result.status, "source-unparseable");
    assert.equal(result.drifted, false);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].code, "yaml_parse");
  });
});

test("inspection is read-only: pipeline.user.yaml's bytes are byte-identical before and after, over a drifted fixture", () => {
  withFixtureRoot((root) => {
    const userYamlPath = join(root, "pipeline.user.yaml");
    writeFileSync(userYamlPath, MISSING_REQUIRED_KEY_YAML, "utf8");
    const userYamlBefore = readFileSync(userYamlPath);

    const result = inspectPipelineUserV3Drift({ rootDir: root });
    assert.equal(result.status, "drifted");

    const userYamlAfter = readFileSync(userYamlPath);
    assert.equal(Buffer.compare(userYamlBefore, userYamlAfter), 0);
  });
});

// Beyond the six reused cases: this module's `not-v3` branch (a recognized
// but pre-v3 schema, out of scope by design -- see the module header) had no
// coverage in the withdrawn attempt because that attempt validated every
// source against one flat pre-v3 schema and had no such branch at all.
test("a recognized but pre-v3 schema (e.g. pipeline.user.v2) is out of scope and reports not-v3, never drifted", () => {
  withFixtureRoot((root) => {
    writeFileSync(join(root, "pipeline.user.yaml"), V2_SCHEMA_YAML, "utf8");
    const result = inspectPipelineUserV3Drift({ rootDir: root });
    assert.equal(result.status, "not-v3");
    assert.equal(result.drifted, false);
    assert.deepEqual(result.diagnostics, []);
  });
});

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Contract tests for the I2 read-only v2 runtime projection planner.
 *
 * Run: node plugins/pipeline-core/lib/runtime-projection-v2.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";

import { main as planRuntimeProjectionV2Cli } from "../scripts/plan-runtime-projection-v2.mjs";
import { loadRunnerProfilesV2Registry } from "./runner-profiles-v2.mjs";
import {
  isPhysicalPathContained,
  loadRuntimeProjectionV2OwnedKeys,
  planRuntimeProjectionV2,
  readRuntimeProjectionV2Baselines,
} from "./runtime-projection-v2.mjs";

const registry = loadRunnerProfilesV2Registry();
const targetPaths = [
  ".claude/settings.json",
  ".claude/pipeline.yaml",
  ".codex/config.toml",
  ".codex/agents/implementor.toml",
  ".codex/agents/critic.toml",
];

const SETTINGS_BASELINE = "{\n  \"sentinel\": \"settings-unowned-sentinel\"\n}\n";
const PIPELINE_PREFIX = "# pipeline-prefix-sentinel\ncustomBefore: exact-bytes\n";
const PIPELINE_OWNED = "modelRouting:\n  legacy_route:\n    model: legacy\n    effort: low\n";
const PIPELINE_SUFFIX = "unownedAfter: exact-bytes\n";
const CONFIG_BASELINE = "# config-unowned-sentinel\nprofile = \"keep\"\n";
const IMPLEMENTOR_BASELINE = "# implementor-prefix-sentinel\nmodel = \"old-implementor\"\nmodel_reasoning_effort = \"low\"\nname = \"keep-implementor\"\n[metadata]\nmodel = \"nested-must-stay\"\n";
const CRITIC_BASELINE = "# critic-prefix-sentinel\nmodel = \"old-critic\"\nmodel_reasoning_effort = \"medium\"\nname = \"keep-critic\"\n[metadata]\nmodel_reasoning_effort = \"nested-must-stay\"\n";

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

function yamlScalar(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`unsupported YAML test scalar: ${typeof value}`);
}

function yamlDocument(value, indent = 0) {
  const prefix = " ".repeat(indent);
  return Object.entries(value).map(([key, child]) => {
    if (Array.isArray(child)) {
      return `${prefix}${key}:\n${child.map((item) => `${prefix}  - ${yamlScalar(item)}`).join("\n")}`;
    }
    if (child && typeof child === "object") return `${prefix}${key}:\n${yamlDocument(child, indent + 2)}`;
    return `${prefix}${key}: ${yamlScalar(child)}`;
  }).join("\n");
}

function writeFixture(root, overrides = {}) {
  const files = {
    ".claude/settings.json": SETTINGS_BASELINE,
    ".claude/pipeline.yaml": `${PIPELINE_PREFIX}${PIPELINE_OWNED}${PIPELINE_SUFFIX}`,
    ".codex/config.toml": CONFIG_BASELINE,
    ".codex/agents/implementor.toml": IMPLEMENTOR_BASELINE,
    ".codex/agents/critic.toml": CRITIC_BASELINE,
    ...overrides,
  };
  for (const [path, bytes] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    if (bytes !== null) writeFileSync(absolute, bytes);
  }
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "runtime-projection-v2-test-"));
  writeFixture(root);
  return root;
}

function plansByPath(plan) {
  return Object.fromEntries(plan.targets.map((target) => [target.path, target]));
}

function snapshot(root) {
  return Object.fromEntries(targetPaths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
}

function runCli(args) {
  let output = "";
  const status = planRuntimeProjectionV2Cli(args, {
    write: (chunk) => { output += String(chunk); },
  });
  return { status, output };
}

function diagnostic(plan, code, path) {
  return plan.diagnostics.some((entry) => entry.code === code && (!path || entry.path === path));
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

record("physical containment: host paths use path semantics and reject escapes", () => {
  const cases = [
    { name: "POSIX descendant", root: "/repo", candidate: "/repo/.claude/pipeline.yaml", expected: true },
    { name: "POSIX root requires explicit permission", root: "/repo", candidate: "/repo", expected: false },
    { name: "POSIX traversal", root: "/repo", candidate: "/repo/../outside", expected: false },
    { name: "POSIX sibling prefix", root: "/repo", candidate: "/repo-other/.claude/pipeline.yaml", expected: false },
  ];
  for (const testCase of cases) {
    assert.equal(isPhysicalPathContained(testCase.root, testCase.candidate), testCase.expected, testCase.name);
  }
  assert.equal(isPhysicalPathContained("/repo", "/repo", { allowRoot: true }), true);

  const windowsCases = [
    { name: "drive descendant", root: "C:\\repo", candidate: "C:\\repo\\.claude\\pipeline.yaml", expected: true },
    { name: "mixed separator descendant", root: "C:\\repo", candidate: "C:/repo/.claude\\pipeline.yaml", expected: true },
    { name: "drive traversal", root: "C:\\repo", candidate: "C:\\repo\\..\\outside", expected: false },
    { name: "drive sibling prefix", root: "C:\\repo", candidate: "C:\\repo-other\\.claude\\pipeline.yaml", expected: false },
    { name: "different drive", root: "C:\\repo", candidate: "D:\\repo\\.claude\\pipeline.yaml", expected: false },
    { name: "UNC descendant", root: "\\\\server\\share\\repo", candidate: "\\\\server\\share\\repo\\.claude\\pipeline.yaml", expected: true },
    { name: "incompatible UNC share", root: "\\\\server\\share\\repo", candidate: "\\\\server\\other\\repo\\.claude\\pipeline.yaml", expected: false },
  ];
  for (const testCase of windowsCases) {
    assert.equal(isPhysicalPathContained(testCase.root, testCase.candidate, { pathApi: win32 }), testCase.expected, testCase.name);
  }
});

record("baseline reader: a missing valid V2 target remains an explicit absent baseline", () => {
  const root = fixtureRoot();
  try {
    unlinkSync(join(root, ".codex/config.toml"));
    const baselines = readRuntimeProjectionV2Baselines(root);
    assert.equal(baselines[".codex/config.toml"].status, "absent");
    assert.equal(baselines[".claude/pipeline.yaml"].status, "present");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("compiler: valid intent produces a deterministic, byte-preserving ready plan", () => {
  const root = fixtureRoot();
  try {
    const intent = completePipelineUser();
    const baselines = readRuntimeProjectionV2Baselines(root);
    const originalBaselines = clone(baselines);
    const first = planRuntimeProjectionV2(intent, { source: "fixture.intent", baselines });
    const second = planRuntimeProjectionV2(intent, { source: "fixture.intent", baselines });
    assert.equal(first.status, "ready");
    assert.deepEqual(second, first, "same input has a deterministic plan");
    assert.deepEqual(baselines, originalBaselines, "planning does not mutate source baselines");
    assert.equal(first.requiresExplicitActivation, true);
    assert.equal(first.targets.length, targetPaths.length);
    assert.ok(first.targets.every((target) => target.unowned.preserved), "each target preserves its unowned bytes");

    const targets = plansByPath(first);
    assert.equal(targets[".claude/settings.json"].after.bytes, SETTINGS_BASELINE);
    assert.equal(targets[".codex/config.toml"].after.bytes, CONFIG_BASELINE);
    const pipeline = targets[".claude/pipeline.yaml"];
    assert.equal(pipeline.changed, true, "only the owned Claude routing block changes");
    assert.ok(pipeline.after.bytes.startsWith(PIPELINE_PREFIX), "Claude prefix bytes remain exact");
    assert.ok(pipeline.after.bytes.endsWith(PIPELINE_SUFFIX), "Claude suffix bytes remain exact");
    assert.ok(!pipeline.after.bytes.includes("legacy_route"), "the former owned routing block is replaced");

    for (const path of [".codex/agents/implementor.toml", ".codex/agents/critic.toml"]) {
      const target = targets[path];
      assert.equal(target.route.requested.selector.value, "gpt-5.6-terra");
      assert.equal(target.route.requested.effort, "xhigh");
      assert.deepEqual(target.route.effective, { status: "unknown", reasonCode: "effective-model-not-observed" });
      assert.ok(target.after.bytes.includes('model = "gpt-5.6-terra"'));
      assert.ok(target.after.bytes.includes('model_reasoning_effort = "xhigh"'));
      assert.ok(target.after.bytes.includes('model = "nested-must-stay"') || target.after.bytes.includes('model_reasoning_effort = "nested-must-stay"'), "nested unowned TOML bytes remain exact");
    }
    assert.equal(targets[".codex/agents/implementor.toml"].after.bytes, IMPLEMENTOR_BASELINE
      .replace('model = "old-implementor"', 'model = "gpt-5.6-terra"')
      .replace('model_reasoning_effort = "low"', 'model_reasoning_effort = "xhigh"'));
    assert.equal(targets[".codex/agents/critic.toml"].after.bytes, CRITIC_BASELINE
      .replace('model = "old-critic"', 'model = "gpt-5.6-terra"')
      .replace('model_reasoning_effort = "medium"', 'model_reasoning_effort = "xhigh"'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("compiler: changed Codex baselines report decisions 3 and 10 without activation", () => {
  const root = fixtureRoot();
  try {
    const baselines = readRuntimeProjectionV2Baselines(root);
    const originalBaselines = clone(baselines);
    const plan = planRuntimeProjectionV2(completePipelineUser(), { source: "conflicts", baselines });
    assert.equal(plan.status, "ready");
    assert.equal(plan.requiresExplicitActivation, true);
    assert.deepEqual(plan.decisionConflicts.map((entry) => entry.decision), [3, 10]);
    const conflicts = Object.fromEntries(plan.decisionConflicts.map((entry) => [entry.decision, entry]));
    assert.deepEqual(conflicts[3].observed, { model: "old-critic", model_reasoning_effort: "medium" });
    assert.deepEqual(conflicts[10].observed, { model: "old-implementor", model_reasoning_effort: "low" });
    assert.deepEqual(baselines, originalBaselines, "the read-only compiler does not write its conflict resolution");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("compiler: projected unchanged baselines are a repeatable no-change plan", () => {
  const root = fixtureRoot();
  try {
    const intent = completePipelineUser();
    const first = planRuntimeProjectionV2(intent, { baselines: readRuntimeProjectionV2Baselines(root) });
    assert.equal(first.status, "ready");
    const projectedBaselines = Object.fromEntries(first.targets.map((target) => [target.path, { status: "present", bytes: target.after.bytes }]));
    const second = planRuntimeProjectionV2(intent, { baselines: projectedBaselines });
    const third = planRuntimeProjectionV2(intent, { baselines: projectedBaselines });
    assert.equal(second.status, "ready");
    assert.ok(second.targets.every((target) => !target.changed && target.before.sha256 === target.after.sha256));
    assert.deepEqual(third, second, "unchanged baselines retain the same plan digest evidence");
    assert.equal(second.decisionConflicts.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("compiler: quoted unowned YAML key immediately after modelRouting remains byte-exact", () => {
  const quotedUnownedSuffix = "\"gates\":\n  custom: \"quoted-key-unowned-sentinel\"\n";
  const root = mkdtempSync(join(tmpdir(), "runtime-projection-v2-test-"));
  writeFixture(root, {
    ".claude/pipeline.yaml": `${PIPELINE_PREFIX}${PIPELINE_OWNED}${quotedUnownedSuffix}`,
  });
  try {
    const plan = planRuntimeProjectionV2(completePipelineUser(), {
      baselines: readRuntimeProjectionV2Baselines(root),
    });
    assert.equal(plan.status, "ready");
    const pipeline = plansByPath(plan)[".claude/pipeline.yaml"];
    assert.ok(pipeline.after.bytes.endsWith(quotedUnownedSuffix), "the quoted top-level key and all of its unowned bytes remain exact");
    assert.ok(pipeline.unowned.preserved);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const invalidBaselineCases = [
  {
    name: "absent owned YAML baseline fails closed",
    arrange(root) { unlinkSync(join(root, ".claude/pipeline.yaml")); },
    code: "required_baseline_missing",
    path: ".claude/pipeline.yaml",
  },
  {
    name: "duplicate owned YAML block fails closed",
    arrange(root) { writeFileSync(join(root, ".claude/pipeline.yaml"), `${PIPELINE_PREFIX}${PIPELINE_OWNED}modelRouting:\n  duplicate: true\n${PIPELINE_SUFFIX}`); },
    code: "yaml_target_parse",
    path: ".claude/pipeline.yaml:modelRouting",
  },
  {
    name: "malformed owned YAML block fails closed",
    arrange(root) { writeFileSync(join(root, ".claude/pipeline.yaml"), `${PIPELINE_PREFIX}modelRouting: not-a-block\n${PIPELINE_SUFFIX}`); },
    code: "yaml_target_parse",
    path: ".claude/pipeline.yaml:modelRouting",
  },
  {
    name: "missing owned TOML key fails closed",
    arrange(root) { writeFileSync(join(root, ".codex/agents/implementor.toml"), 'model = "old-implementor"\nname = "keep"\n'); },
    code: "toml_target_parse",
    path: ".codex/agents/implementor.toml",
  },
  {
    name: "duplicate owned TOML key fails closed",
    arrange(root) { writeFileSync(join(root, ".codex/agents/critic.toml"), 'model = "one"\nmodel = "two"\nmodel_reasoning_effort = "low"\n'); },
    code: "toml_target_parse",
    path: ".codex/agents/critic.toml",
  },
  {
    name: "malformed owned TOML value fails closed",
    arrange(root) { writeFileSync(join(root, ".codex/agents/critic.toml"), 'model = unquoted\nmodel_reasoning_effort = "low"\n'); },
    code: "toml_target_parse",
    path: ".codex/agents/critic.toml",
  },
  {
    name: "trailing token after owned TOML scalar fails closed",
    arrange(root) { writeFileSync(join(root, ".codex/agents/implementor.toml"), 'model = "old-implementor" trailing-invalid-toml\nmodel_reasoning_effort = "low"\nname = "keep"\n'); },
    code: "toml_target_parse",
    path: ".codex/agents/implementor.toml",
    message: "malformed top-level model",
  },
];

runTable("compiler invalid baselines", invalidBaselineCases, (testCase) => {
  const root = fixtureRoot();
  try {
    testCase.arrange(root);
    const plan = planRuntimeProjectionV2(completePipelineUser(), { baselines: readRuntimeProjectionV2Baselines(root) });
    assert.equal(plan.status, "invalid-baseline");
    assert.equal(plan.targets.length, 0, "a malformed baseline produces no partial plan");
    assert.equal(plan.requiresExplicitActivation, true);
    assert.ok(diagnostic(plan, testCase.code, testCase.path), `missing ${testCase.code} at ${testCase.path}`);
    if (testCase.message) {
      const entry = plan.diagnostics.find((item) => item.code === testCase.code && item.path === testCase.path);
      assert.ok(entry.message.includes(testCase.message), `missing parse detail: ${testCase.message}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("compiler: ordinary TOML trailing comments remain valid and reparsable", () => {
  const trailingComment = " # ordinary-unowned-comment";
  const root = mkdtempSync(join(tmpdir(), "runtime-projection-v2-test-"));
  writeFixture(root, {
    ".codex/agents/implementor.toml": IMPLEMENTOR_BASELINE.replace('model = "old-implementor"', `model = "old-implementor"${trailingComment}`),
  });
  try {
    const first = planRuntimeProjectionV2(completePipelineUser(), {
      baselines: readRuntimeProjectionV2Baselines(root),
    });
    assert.equal(first.status, "ready");
    const implementor = plansByPath(first)[".codex/agents/implementor.toml"];
    assert.ok(implementor.after.bytes.includes(`model = "gpt-5.6-terra"${trailingComment}`), "the valid trailing comment remains exact");

    const projectedBaselines = Object.fromEntries(first.targets.map((target) => [target.path, { status: "present", bytes: target.after.bytes }]));
    const second = planRuntimeProjectionV2(completePipelineUser(), { baselines: projectedBaselines });
    const third = planRuntimeProjectionV2(completePipelineUser(), { baselines: projectedBaselines });
    assert.equal(second.status, "ready");
    assert.ok(second.targets.every((target) => !target.changed), "the rendered TOML remains reparsable without further edits");
    assert.deepEqual(third, second, "reparsing an unchanged projection remains deterministic");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("compiler: invalid intent stops before baseline access or target planning", () => {
  const intent = completePipelineUser();
  delete intent.routing.duties.implement;
  const forbiddenBaselines = new Proxy({}, {
    get() { throw new Error("invalid intent must not inspect baselines"); },
  });
  const plan = planRuntimeProjectionV2(intent, { source: "invalid.intent", baselines: forbiddenBaselines });
  assert.equal(plan.status, "invalid-intent");
  assert.equal(plan.targets.length, 0);
  assert.equal(plan.decisionConflicts.length, 0);
  assert.equal(plan.requiresExplicitActivation, true);
});

record("compiler: only the committed owned-key boundary may drive planning", () => {
  const root = fixtureRoot();
  try {
    const baselines = readRuntimeProjectionV2Baselines(root);
    const equivalentClone = clone(loadRuntimeProjectionV2OwnedKeys());
    const accepted = planRuntimeProjectionV2(completePipelineUser(), {
      source: "equivalent-owned-key-manifest",
      baselines,
      ownedKeyManifest: equivalentClone,
    });
    assert.equal(accepted.status, "ready", "a content-equivalent committed manifest copy remains accepted");

    const divergentManifest = clone(equivalentClone);
    divergentManifest.targets[0].path = ".codex/agents/safe-caller-target.toml";
    const forbiddenBaselines = new Proxy({}, {
      get() { throw new Error("a rejected manifest must not inspect baselines"); },
    });
    const first = planRuntimeProjectionV2(completePipelineUser(), {
      source: "divergent-owned-key-manifest",
      baselines: forbiddenBaselines,
      ownedKeyManifest: divergentManifest,
    });
    const second = planRuntimeProjectionV2(completePipelineUser(), {
      source: "divergent-owned-key-manifest",
      baselines: forbiddenBaselines,
      ownedKeyManifest: divergentManifest,
    });
    assert.equal(first.status, "invalid-manifest");
    assert.deepEqual(second, first, "a rejected caller manifest yields deterministic evidence");
    assert.equal(first.targets.length, 0);
    assert.equal(first.decisionConflicts.length, 0);
    assert.equal(first.requiresExplicitActivation, true);
    assert.ok(diagnostic(first, "invalid_manifest", "$.ownedKeyManifest"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("CLI: redacts bytes by default, exposes them only on request, and never writes", () => {
  const root = fixtureRoot();
  try {
    const intentPath = join(root, "intent.pipeline.user.v2.json");
    writeFileSync(intentPath, `${JSON.stringify(completePipelineUser())}\n`);
    const before = snapshot(root);
    const redacted = runCli(["--intent", intentPath, "--root", root]);
    assert.equal(redacted.status, 0);
    assert.ok(!redacted.output.includes("settings-unowned-sentinel"), "default output must not echo target bytes");
    const redactedPlan = JSON.parse(redacted.output);
    assert.equal(redactedPlan.status, "ready");
    assert.ok(redactedPlan.targets.every((target) => !Object.hasOwn(target.after, "bytes")));

    const included = runCli(["--intent", intentPath, "--root", root, "--include-bytes"]);
    assert.equal(included.status, 0);
    assert.ok(included.output.includes("settings-unowned-sentinel"));
    assert.ok(JSON.parse(included.output).targets.every((target) => Object.hasOwn(target.after, "bytes")));
    assert.deepEqual(snapshot(root), before, "the planning CLI does not activate or write target files");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("CLI: complete YAML intent produces a redacted ready plan without writes", () => {
  const root = fixtureRoot();
  try {
    const intentPath = join(root, "intent.pipeline.user.v2.yaml");
    writeFileSync(intentPath, `${yamlDocument(completePipelineUser())}\n`);
    const before = snapshot(root);
    const result = runCli(["--intent", intentPath, "--root", root]);
    assert.equal(result.status, 0);
    assert.ok(!result.output.includes("settings-unowned-sentinel"), "default YAML output must not echo target bytes");
    const plan = JSON.parse(result.output);
    assert.equal(plan.status, "ready");
    assert.equal(plan.source, intentPath);
    assert.ok(plan.targets.every((target) => !Object.hasOwn(target.after, "bytes")));
    assert.deepEqual(snapshot(root), before, "a YAML intent only plans and never writes target files");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("CLI: malformed or invalid YAML intent fails before baseline planning", () => {
  const root = mkdtempSync(join(tmpdir(), "runtime-projection-v2-empty-root-"));
  try {
    const malformedPath = join(root, "malformed.pipeline.user.v2.yaml");
    const invalidPath = join(root, "invalid.pipeline.user.v2.yaml");
    writeFileSync(malformedPath, 'schema: "pipeline.user.v2\n');
    writeFileSync(invalidPath, "schema: not-pipeline-user-v2\n");

    for (const intentPath of [malformedPath, invalidPath]) {
      const result = runCli(["--intent", intentPath, "--root", root]);
      assert.equal(result.status, 1);
      const plan = JSON.parse(result.output);
      assert.equal(plan.status, "invalid-intent");
      assert.equal(plan.source, intentPath);
      assert.deepEqual(plan.targets, [], "invalid YAML must not reach baseline planning");
      assert.deepEqual(plan.decisionConflicts, []);
      assert.equal(plan.requiresExplicitActivation, true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

record("CLI: argument and unreadable-source failures are explicit and non-writing", () => {
  const root = fixtureRoot();
  try {
    const before = snapshot(root);
    const help = runCli(["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.output, /JSON-or-YAML/i, "help names both supported intent formats");

    const argumentFailure = runCli(["--unknown"]);
    assert.equal(argumentFailure.status, 2);
    assert.ok(argumentFailure.output.includes("unknown argument: --unknown"));

    const unreadable = join(root, "missing.pipeline.user.v2.json");
    const sourceFailure = runCli(["--intent", unreadable, "--root", root]);
    assert.equal(sourceFailure.status, 1);
    const sourcePlan = JSON.parse(sourceFailure.output);
    assert.equal(sourcePlan.status, "invalid-intent");
    assert.ok(diagnostic(sourcePlan, "source_unreadable", "$"));
    assert.deepEqual(snapshot(root), before, "failure paths do not write target files");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const total = passed + failures.length;
console.log(`\n${passed}/${total} cases passed.`);
if (failures.length) {
  console.log("Failures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

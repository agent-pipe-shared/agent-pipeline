#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Contract tests for I3's source migration and recoverable apply boundary.
 *
 * Run: node plugins/pipeline-core/lib/runner-profile-migration-v2.test.mjs
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

// plan.targets[].path is canonical forward-slash form; node:path's relative()
// returns the host's own separator (backslash on native Windows), so a
// multi-segment target compared against it never matches there. Used only where
// the result is compared against a canonical target-path string, not for display.
function posixRelative(root, target) { return relative(root, target).replaceAll("\\", "/"); }

import {
  applyRunnerProfileMigrationV2,
  inspectRunnerProfileMigrationV2,
  planRunnerProfileMigrationV2,
} from "./runner-profile-migration-v2.mjs";
import { parseYaml } from "./yaml-lite.mjs";
import { loadRunnerProfilesV2Registry, validatePipelineUserV2 } from "./runner-profiles-v2.mjs";
import { main as migrationCli } from "../scripts/runner-profile-migration-v2.mjs";
import { checkV2RuntimeProjection } from "../scripts/check-routing-projections.mjs";
import { run as setupRun } from "../../../setup.mjs";

const registry = loadRunnerProfilesV2Registry();
const runtimePaths = [
  ".claude/settings.json",
  ".claude/pipeline.yaml",
  ".codex/config.toml",
  ".codex/agents/implementor.toml",
  ".codex/agents/critic.toml",
];
const sourcePath = "pipeline.user.yaml";
const trackedPaths = [...runtimePaths, sourcePath];
const SETTINGS = '{\n  "settings-unowned-sentinel": true\n}\n';
const PIPELINE_PREFIX = "# pipeline-prefix-sentinel\nunownedBefore: exact\n";
const PIPELINE_OWNED = "modelRouting:\n  legacy_route:\n    model: legacy\n    effort: low\n";
const PIPELINE_SUFFIX = "unownedAfter: exact\n";
const CONFIG = '# config-unowned-sentinel\nprofile = "keep"\n';
const IMPLEMENTOR = '# implementor-prefix-sentinel\nmodel = "old-implementor"\nmodel_reasoning_effort = "low"\nname = "keep-implementor"\n[metadata]\nmodel = "nested-must-stay"\n';
const CRITIC = '# critic-prefix-sentinel\nmodel = "old-critic"\nmodel_reasoning_effort = "medium"\nname = "keep-critic"\n[metadata]\nmodel_reasoning_effort = "nested-must-stay"\n';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function scalar(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  throw new Error(`unsupported YAML fixture scalar: ${typeof value}`);
}

function yaml(value, indent = "") {
  return Object.entries(value).map(([key, child]) => {
    if (Array.isArray(child)) return `${indent}${key}:\n${child.map((item) => `${indent}  - ${scalar(item)}`).join("\n")}`;
    if (child && typeof child === "object") return `${indent}${key}:\n${yaml(child, `${indent}  `)}`;
    return `${indent}${key}: ${scalar(child)}`;
  }).join("\n");
}

function completeV2() {
  return {
    schema: "pipeline.user.v2",
    language: { human_facing: "de", agent_facing: "en" },
    agent_runtime: "other",
    runners: { enabled: ["claude", "codex"], default: "claude" },
    routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) },
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
  };
}

function legacyRoute(model, effort) {
  return { model, effort };
}

function v0Source() {
  const profiles = {
    design: { design_phase: legacyRoute("opus-4.8", "high"), execution_phase: legacyRoute("opus-4.8", "high"), advisor: "off" },
    feature: { design_phase: legacyRoute("opus-4.8", "high"), execution_phase: legacyRoute("sonnet-5", "high"), advisor: "opus-4.8" },
    mini: { design_phase: legacyRoute("sonnet-5", "high"), execution_phase: legacyRoute("sonnet-5", "high"), advisor: "opus-4.8" },
  };
  return {
    language: { human_facing: "de", agent_facing: "en" },
    agent_runtime: "other",
    worktypes: profiles,
    models: {
      implement: legacyRoute("sonnet-5", "medium"),
      mechanic: legacyRoute("sonnet-5", "low"),
      deep: legacyRoute("sonnet-5", "xhigh"),
      review: legacyRoute("sonnet-5", "max"),
    },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
  };
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
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
}

function fixtureRoot(source = yaml(v0Source())) {
  const root = mkdtempSync(join(tmpdir(), "runner-profile-migration-v2-test-"));
  write(root, ".claude/settings.json", SETTINGS);
  write(root, ".claude/pipeline.yaml", `${PIPELINE_PREFIX}${PIPELINE_OWNED}${PIPELINE_SUFFIX}`);
  write(root, ".codex/config.toml", CONFIG);
  write(root, ".codex/agents/implementor.toml", IMPLEMENTOR);
  write(root, ".codex/agents/critic.toml", CRITIC);
  write(root, sourcePath, source);
  return root;
}

/** Frozen historical v1 seed; the committed authority is intentionally V3. */
function historicalV1SeedFixtureRoot() {
  const source = v1Source();
  source.routing.duties.codex_independent_critic = direct("codex", "gpt-5.6-sol", "xhigh");
  for (const duty of ["codex_implementation", "codex_goldfish", "codex_mechanic", "codex_deep"]) {
    source.routing.duties[duty].selector = { kind: "alias", value: "terra" };
  }
  return fixtureRoot(yaml(source));
}

function bytes(root, paths = trackedPaths) {
  return Object.fromEntries(paths.map((path) => {
    const absolute = join(root, path);
    return [path, existsSync(absolute) ? readFileSync(absolute, "utf8") : null];
  }));
}

function hasDiagnostic(result, code) {
  return result.diagnostics?.some((entry) => entry.code === code);
}

function runCli(args) {
  let output = "";
  const status = migrationCli(args, { write: (chunk) => { output += String(chunk); } });
  return { status, output, json: JSON.parse(output) };
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

function skip(name, reason) {
  console.log(`SKIP  ${name} -- [capability: ${reason}]`);
}

// Native Windows requires SeCreateSymbolicLinkPrivilege (admin or Developer Mode) to create a
// FILE symlink; probe this once so the file-symlink fixtures below can fail closed with a
// visible capability note instead of the raw fixture-setup EPERM masquerading as a product bug.
// Directory symlinks are exercised via NTFS junctions (no privilege required, still a real
// reparse point that lstatSync reports as isSymbolicLink() === true) -- so directory-boundary
// coverage stays fully active on every platform.
const fileSymlinkCapability = (() => {
  if (process.platform !== "win32") return { ok: true };
  const probeDir = mkdtempSync(join(tmpdir(), "runner-profile-migration-v2-symcap-"));
  try {
    const target = join(probeDir, "target.txt");
    writeFileSync(target, "probe");
    symlinkSync(target, join(probeDir, "link.txt"));
    return { ok: true };
  } catch (error) {
    return { ok: false, code: error && error.code };
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
})();

record("v0: valid legacy Claude routes are preserved in complete multi-runner v2 and become idempotent", () => {
  const legacy = v0Source();
  legacy.worktypes.feature.execution_phase = legacyRoute("fable-5", "max");
  legacy.models.implement = legacyRoute("opus-4.8", "high");
  const root = fixtureRoot(yaml(legacy));
  try {
    const inspected = inspectRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(inspected.status, "ready");
    assert.equal(inspected.sourceKind, "v0");
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.sourceKind, "v0");
    assert.ok(!JSON.stringify(plan).includes("settings-unowned-sentinel"), "public plan contains digests, never target bytes");
    const applied = applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: true });
    assert.equal(applied.status, "applied");
    const intent = parseYaml(readFileSync(join(root, sourcePath), "utf8"));
    assert.equal(validatePipelineUserV2(intent).ok, true);
    assert.deepEqual(intent.routing.profiles.feature.execution_phase.claude, {
      state: "default", selector: { kind: "alias", value: "fable" }, effort: "max", unavailable: "defer", evidence: "dispatch-receipt",
    });
    assert.deepEqual(intent.routing.duties.implement.claude, {
      state: "default", selector: { kind: "alias", value: "opus" }, effort: "high", unavailable: "defer", evidence: "dispatch-receipt",
    });
    assert.deepEqual(intent.routing.profiles.feature.execution_phase.codex, registry.profiles.feature.execution_phase.codex);
    assert.deepEqual(intent.routing.duties.implement.codex, registry.duties.implement.codex);
    assert.deepEqual(intent.runners, { enabled: ["claude", "codex"], default: "claude" });
    assert.deepEqual(intent.usage, { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" });
    assert.deepEqual(intent.language, { human_facing: "de", agent_facing: "en" });
    assert.deepEqual(intent.routing.duties.readiness.claude.selector, { kind: "alias", value: "fable" });
    assert.deepEqual(plan.compatibilityDeltas, [], "v0 Claude routes are retained rather than substituted");
    assert.ok(!JSON.stringify(plan).includes("effectiveModelId"));
    assert.equal(planRunnerProfileMigrationV2({ rootDir: root }).status, "noop");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("v0: exact historical Public opus and sonnet aliases are closed compatibility spellings", () => {
  const legacy = v0Source();
  for (const profile of Object.values(legacy.worktypes)) {
    for (const phase of ["design_phase", "execution_phase"]) {
      profile[phase].model = profile[phase].model.startsWith("opus") ? "opus" : "sonnet";
    }
    if (profile.advisor !== "off") profile.advisor = "opus";
  }
  for (const route of Object.values(legacy.models)) route.model = "sonnet";
  const root = fixtureRoot(yaml(legacy));
  try {
    assert.equal(inspectRunnerProfileMigrationV2({ rootDir: root }).status, "ready");
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.sourceKind, "v0");
    assert.equal(applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: true }).status, "applied");
    const intent = parseYaml(readFileSync(join(root, sourcePath), "utf8"));
    assert.equal(intent.routing.profiles.design.design_phase.claude.selector.value, "opus");
    assert.equal(intent.routing.profiles.feature.execution_phase.claude.selector.value, "sonnet");
    assert.equal(validatePipelineUserV2(intent).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("v1: preserved Claude routes and exact Codex routes never claim effective identities", () => {
  const root = fixtureRoot(yaml(v1Source()));
  try {
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.sourceKind, "v1");
    assert.deepEqual(plan.compatibilityDeltas, [], "already exact v1 Codex routes require no substitution");
    assert.ok(!JSON.stringify(plan).includes("effectiveModelId"));
    assert.ok(!JSON.stringify(plan).includes("pipeline-prefix-sentinel"));
    assert.equal(applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: true }).status, "applied");
    const intent = parseYaml(readFileSync(join(root, sourcePath), "utf8"));
    assert.equal(validatePipelineUserV2(intent).ok, true);
    assert.deepEqual(intent.routing.profiles.feature.execution_phase.claude, {
      state: "default", selector: { kind: "alias", value: "fable" }, effort: "max", unavailable: "defer", evidence: "dispatch-receipt",
    });
    assert.deepEqual(intent.routing.profiles.feature.execution_phase.codex, registry.profiles.feature.execution_phase.codex);

    const nonIdentical = v1Source();
    nonIdentical.routing.duties.codex_goldfish.effort = "max";
    writeFileSync(join(root, sourcePath), yaml(nonIdentical));
    const rejected = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(rejected.status, "invalid-source");
    assert.ok(hasDiagnostic(rejected, "duplicate_semantic_owner"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("historical v1 seed: I3 reconciles its Sol/xhigh independent Critic to the frozen same-runner v2 cell", () => {
  const root = historicalV1SeedFixtureRoot();
  try {
    const sourceBefore = readFileSync(join(root, sourcePath), "utf8");
    assert.equal(parseYaml(sourceBefore).schema, "pipeline.user.v1", "fixture must remain the explicit historical v1 seed");
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.sourceKind, "v1");
    assert.equal(readFileSync(join(root, sourcePath), "utf8"), sourceBefore, "planning leaves the historical source untouched");
    assert.deepEqual(plan.compatibilityDeltas.map((delta) => delta.path), [
      "routing.duties.critic_normal.codex",
      "routing.duties.implement.codex",
      "routing.duties.implement.codex",
      "routing.duties.mechanic.codex",
      "routing.duties.deep.codex",
    ], "the Sol independent Critic and historical Terra aliases are explicit same-runner reconciliations");
    assert.ok(plan.compatibilityDeltas.every((delta) => (
      delta.newRequested.selector.value === "gpt-5.6-terra"
      && delta.effectiveModel.status === "unknown"
      && delta.effectiveModel.reasonCode === "effective-model-not-observed"
    )));

    assert.equal(applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: true }).status, "applied");
    const intent = parseYaml(readFileSync(join(root, sourcePath), "utf8"));
    assert.equal(validatePipelineUserV2(intent).ok, true);
    assert.deepEqual(intent.routing.duties.critic_normal.codex, registry.duties.critic_normal.codex);
    assert.equal(planRunnerProfileMigrationV2({ rootDir: root }).status, "noop");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("v1: a valid legacy Codex route reconciles to its frozen same-runner v2 cell", () => {
  const conflicting = v1Source();
  conflicting.routing.duties.codex_design = direct("codex", "gpt-5.6-terra", "xhigh");
  const root = fixtureRoot(yaml(conflicting));
  try {
    const before = bytes(root);
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.deepEqual(plan.compatibilityDeltas, [{
      name: "po-approved-runner-routing-amendment",
      path: "routing.profiles.design.design_phase.codex",
      oldRequested: { selector: { kind: "model-id", value: "gpt-5.6-terra" }, effort: "xhigh" },
      newRequested: { selector: { kind: "model-id", value: "gpt-5.6-sol" }, effort: "xhigh" },
      effectiveModel: { status: "unknown", reasonCode: "effective-model-not-observed" },
    }]);
    assert.deepEqual(bytes(root), before, "planning keeps the source untouched");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("v1: accepted Terra aliases become requested frozen selectors without an effective-model claim", () => {
  const legacy = v1Source();
  for (const duty of ["codex_independent_critic", "codex_implementation", "codex_goldfish", "codex_mechanic", "codex_deep"]) {
    legacy.routing.duties[duty].selector = { kind: "alias", value: "terra" };
  }
  const root = fixtureRoot(yaml(legacy));
  try {
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.compatibilityDeltas.length, 5);
    assert.ok(plan.compatibilityDeltas.every((delta) => (
      delta.name === "po-approved-runner-routing-amendment"
      && delta.newRequested.selector.value === "gpt-5.6-terra"
      && delta.effectiveModel.status === "unknown"
      && delta.effectiveModel.reasonCode === "effective-model-not-observed"
    )));
    assert.ok(!JSON.stringify(plan).includes("effectiveModelId"));
    assert.equal(applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: true }).status, "applied");
    const intent = parseYaml(readFileSync(join(root, sourcePath), "utf8"));
    assert.deepEqual(intent.routing.duties.implement.codex, registry.duties.implement.codex);
    assert.equal(validatePipelineUserV2(intent).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("source classification: malformed, unknown, wrong-runner, unsupported, and duplicate legacy routes fail before planning", () => {
  const cases = [];
  const ambiguous = v0Source(); ambiguous.schema = "pipeline.user.v1"; cases.push({ source: yaml(ambiguous), code: "invalid_v1_source" });
  const unknownOwner = v0Source(); unknownOwner.unapproved_owner = true; cases.push({ source: yaml(unknownOwner), code: "invalid_v0_signature" });
  const unknownV0Alias = v0Source(); unknownV0Alias.models.implement.model = "sonnet-latest"; cases.push({ source: yaml(unknownV0Alias), code: "unknown_legacy_route" });
  const badSelector = v1Source(); badSelector.routing.duties.codex_design.selector.value = "gpt-5.6-unknown"; cases.push({ source: yaml(badSelector), code: "unknown_selector" });
  const badEffort = v1Source(); badEffort.routing.duties.codex_design.effort = "low"; cases.push({ source: yaml(badEffort), code: "invalid_direct_route" });
  const badEvidence = v1Source(); badEvidence.routing.duties.codex_design.evidenceRequirement = "none"; cases.push({ source: yaml(badEvidence), code: "invalid_direct_route" });
  const wrongRunner = v1Source(); wrongRunner.routing.duties.codex_design.runner = "claude"; cases.push({ source: yaml(wrongRunner), code: "invalid_direct_route" });
  const malformed = v1Source(); malformed.routing.duties.codex_design.unapproved = true; cases.push({ source: yaml(malformed), code: "invalid_direct_route" });
  const duplicate = v1Source(); duplicate.routing.duties.codex_goldfish.effort = "max"; cases.push({ source: yaml(duplicate), code: "duplicate_semantic_owner" });
  cases.push({ source: 'schema: "pipeline.user.v1\n', code: "source_parse" });
  for (const { source, code } of cases) {
    const root = fixtureRoot(source);
    try {
      const before = bytes(root);
      const plan = planRunnerProfileMigrationV2({ rootDir: root });
      assert.equal(plan.status, "invalid-source");
      assert.ok(hasDiagnostic(plan, code), `expected ${code}; got ${plan.diagnostics.map((entry) => entry.code).join(", ")}`);
      assert.equal(plan.targets.length, 0);
      assert.deepEqual(bytes(root), before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

record("v2: original source bytes stay exact; inspect and plan do not mutate", () => {
  const source = `# source-format-sentinel\n${yaml(completeV2())}\n`;
  const root = fixtureRoot(source);
  try {
    const before = bytes(root);
    assert.equal(inspectRunnerProfileMigrationV2({ rootDir: root }).status, "ready");
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.sourceKind, "v2");
    assert.equal(plan.targets.find((target) => target.path === sourcePath).changed, false);
    assert.deepEqual(bytes(root), before, "read-only operations must leave every file byte-identical");
    assert.equal(applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: false }).status, "activation-required");
    assert.equal(applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: true }).status, "applied");
    assert.equal(readFileSync(join(root, sourcePath), "utf8"), source);
    assert.equal(planRunnerProfileMigrationV2({ rootDir: root }).status, "noop");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("inspect and plan: no journal means no transient lock or persistent write", () => {
  const root = fixtureRoot();
  try {
    const mutations = [];
    const deps = {
      mkdirSync(path, options) {
        mutations.push(`mkdir:${relative(root, path)}`);
        return mkdirSync(path, options);
      },
      writeFileSync(path, content, options) {
        mutations.push(`write:${relative(root, path)}`);
        return writeFileSync(path, content, options);
      },
      renameSync(from, to) {
        mutations.push(`rename:${relative(root, from)}:${relative(root, to)}`);
        return renameSync(from, to);
      },
      rmSync(path, options) {
        mutations.push(`remove:${relative(root, path)}`);
        return rmSync(path, options);
      },
    };
    assert.equal(inspectRunnerProfileMigrationV2({ rootDir: root, deps }).status, "ready");
    assert.equal(planRunnerProfileMigrationV2({ rootDir: root, deps }).status, "ready");
    assert.deepEqual(mutations, [], "read-only calls must not create even a transient migration lock");
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v2")), false);
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v2.lock")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("inspect and plan: a live lock blocks parsing without reclamation", () => {
  const root = fixtureRoot();
  try {
    const lock = join(root, ".pipeline-runner-profile-migration-v2.lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "owner.json"), `${JSON.stringify({ pid: process.pid, schema: "pipeline.runner-profile-migration-journal.v2" })}\n`);
    const before = bytes(root);
    const inspected = inspectRunnerProfileMigrationV2({ rootDir: root });
    const planned = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(inspected.status, "recovery-required");
    assert.equal(planned.status, "recovery-required");
    assert.deepEqual(bytes(root), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("baseline gate: invalid source precedes baseline access; missing or malformed baselines never apply", () => {
  const missingRoot = mkdtempSync(join(tmpdir(), "runner-profile-migration-v2-invalid-source-"));
  try {
    write(missingRoot, sourcePath, 'schema: "pipeline.user.v1\n');
    assert.equal(planRunnerProfileMigrationV2({ rootDir: missingRoot }).status, "invalid-source");
  } finally { rmSync(missingRoot, { recursive: true, force: true }); }

  for (const mutate of [
    (root) => rmSync(join(root, ".codex/config.toml")),
    (root) => writeFileSync(join(root, ".codex/agents/implementor.toml"), 'model = "unterminated\n'),
  ]) {
    const root = fixtureRoot();
    try {
      mutate(root);
      const before = bytes(root);
      const plan = planRunnerProfileMigrationV2({ rootDir: root });
      assert.equal(plan.status, "invalid-baseline");
      assert.equal(applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: true }).status, "invalid-plan");
      assert.deepEqual(bytes(root), before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

record("apply: forged or mutated public plans fail closed before any write", () => {
  const root = fixtureRoot();
  try {
    write(root, "unowned-runtime-sentinel.txt", "must-never-be-staged-or-overwritten\n");
    const before = {
      ...bytes(root),
      "unowned-runtime-sentinel.txt": readFileSync(join(root, "unowned-runtime-sentinel.txt"), "utf8"),
    };
    const assertNoWrite = (candidate) => {
      const writes = [];
      const outcome = applyRunnerProfileMigrationV2(candidate, {
        rootDir: root,
        activate: true,
        deps: {
          mkdirSync(path, options) {
            writes.push(`mkdir:${relative(root, path)}`);
            return mkdirSync(path, options);
          },
          writeFileSync(path, content, options) {
            writes.push(`write:${relative(root, path)}`);
            return writeFileSync(path, content, options);
          },
          renameSync(from, to) {
            writes.push(`rename:${relative(root, from)}:${relative(root, to)}`);
            return renameSync(from, to);
          },
          rmSync(path, options) {
            writes.push(`remove:${relative(root, path)}`);
            return rmSync(path, options);
          },
        },
      });
      assert.equal(outcome.status, "invalid-plan");
      assert.deepEqual(writes, [], "an unauthenticated plan must fail before lock or staging writes");
      assert.deepEqual({
        ...bytes(root),
        "unowned-runtime-sentinel.txt": readFileSync(join(root, "unowned-runtime-sentinel.txt"), "utf8"),
      }, before);
    };

    const planned = planRunnerProfileMigrationV2({ rootDir: root });
    const forged = clone(planned);
    Object.defineProperty(forged, "_migrationTargets", {
      value: [{ path: "unowned-runtime-sentinel.txt", kind: "runtime", bytes: "forged\n" }],
      enumerable: false,
    });
    assertNoWrite(forged);

    const hiddenMutation = planRunnerProfileMigrationV2({ rootDir: root });
    Object.defineProperty(hiddenMutation, "_migrationTargets", {
      value: [{ path: "unowned-runtime-sentinel.txt", kind: "runtime", bytes: "forged\n" }],
      enumerable: false,
    });
    assertNoWrite(hiddenMutation);

    const mutated = planRunnerProfileMigrationV2({ rootDir: root });
    mutated.targets[0].path = "unowned-runtime-sentinel.txt";
    assertNoWrite(mutated);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("apply: writes only declared targets, commits source last, and preserves I2 unowned bytes", () => {
  const root = fixtureRoot();
  try {
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    const destinations = [];
    const known = new Set(plan.targets.map((target) => target.path));
    const applied = applyRunnerProfileMigrationV2(plan, {
      rootDir: root,
      activate: true,
      deps: {
        renameSync(from, to) {
          const destination = posixRelative(root, to);
          if (known.has(destination)) destinations.push(destination);
          renameSync(from, to);
        },
      },
    });
    assert.equal(applied.status, "applied");
    assert.deepEqual(destinations, plan.targets.map((target) => target.path));
    assert.equal(destinations.at(-1), sourcePath);
    assert.equal(readFileSync(join(root, ".claude/settings.json"), "utf8"), SETTINGS);
    assert.equal(readFileSync(join(root, ".codex/config.toml"), "utf8"), CONFIG);
    const pipeline = readFileSync(join(root, ".claude/pipeline.yaml"), "utf8");
    assert.ok(pipeline.startsWith(PIPELINE_PREFIX) && pipeline.endsWith(PIPELINE_SUFFIX));
    const implementor = readFileSync(join(root, ".codex/agents/implementor.toml"), "utf8");
    assert.ok(implementor.includes('name = "keep-implementor"') && implementor.includes('model = "nested-must-stay"'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("apply: every rename-after-effect fault rolls all targets back without false success", () => {
  const sampleRoot = fixtureRoot();
  const samplePlan = planRunnerProfileMigrationV2({ rootDir: sampleRoot });
  const targetNames = samplePlan.targets.map((target) => target.path);
  rmSync(sampleRoot, { recursive: true, force: true });
  for (const injectedTarget of targetNames) {
    const root = fixtureRoot();
    try {
      const before = bytes(root);
      const plan = planRunnerProfileMigrationV2({ rootDir: root });
      let injected = false;
      const outcome = applyRunnerProfileMigrationV2(plan, {
        rootDir: root,
        activate: true,
        deps: {
          renameSync(from, to) {
            renameSync(from, to);
            if (!injected && posixRelative(root, to) === injectedTarget) {
              injected = true;
              throw new Error(`fault after durable rename ${injectedTarget}`);
            }
          },
        },
      });
      assert.equal(outcome.status, "rolled-back");
      assert.deepEqual(bytes(root), before);
      assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v2")), false, "successful rollback cleans its consumed proof");
      assert.equal(inspectRunnerProfileMigrationV2({ rootDir: root }).status, "ready");
      assert.equal(planRunnerProfileMigrationV2({ rootDir: root }).status, "ready");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

record("apply: post-rename journal durability failure rolls back cleanly and permits a later plan", () => {
  const root = fixtureRoot();
  try {
    const before = bytes(root);
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    let journalWrites = 0;
    const outcome = applyRunnerProfileMigrationV2(plan, {
      rootDir: root,
      activate: true,
      deps: {
        writeFileSync(path, content, options) {
          writeFileSync(path, content, options);
          if (basename(path) === "journal.json" && ++journalWrites === 3) {
            throw new Error("injected post-rename journal durability failure");
          }
        },
      },
    });
    assert.equal(outcome.status, "rolled-back");
    assert.deepEqual(bytes(root), before);
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v2")), false);
    assert.equal(planRunnerProfileMigrationV2({ rootDir: root }).status, "ready");
    assert.equal(applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: true }).status, "applied");
    assert.equal(planRunnerProfileMigrationV2({ rootDir: root }).status, "noop");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("recovery: a crash during rollback retains proof until a later inspect can clean it", () => {
  const root = fixtureRoot();
  try {
    const before = bytes(root);
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    let forwardFault = false;
    let rollbackFault = false;
    const outcome = applyRunnerProfileMigrationV2(plan, {
      rootDir: root,
      activate: true,
      deps: {
        renameSync(from, to) {
          renameSync(from, to);
          if (!forwardFault && basename(from).startsWith("stage-")) {
            forwardFault = true;
            throw new Error("injected rename effect then throw");
          }
          if (forwardFault && !rollbackFault && basename(from).startsWith("restore-")) {
            rollbackFault = true;
            throw new Error("injected rollback effect then throw");
          }
        },
      },
    });
    assert.equal(outcome.status, "rollback-failed");
    assert.equal(rollbackFault, true);
    assert.deepEqual(bytes(root), before, "the failed restore may already have restored the first target");
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v2", "journal.json")), true);
    const recovered = inspectRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(recovered.status, "ready");
    assert.equal(recovered.recovery, "recovered");
    assert.deepEqual(bytes(root), before);
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v2")), false);
    assert.equal(planRunnerProfileMigrationV2({ rootDir: root }).status, "ready");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("apply: staged write fault leaves bytes intact and never reports success", () => {
  const root = fixtureRoot();
  try {
    const before = bytes(root);
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    const outcome = applyRunnerProfileMigrationV2(plan, {
      rootDir: root,
      activate: true,
      deps: {
        writeFileSync(path, content, options) {
          if (basename(path) === "stage-000") throw new Error("injected staging fault");
          writeFileSync(path, content, options);
        },
      },
    });
    assert.equal(outcome.status, "apply-failed");
    assert.deepEqual(bytes(root), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("recovery: durable interruption restores preimages before parsing and corrupt journals fail closed", () => {
  const root = fixtureRoot();
  try {
    const before = bytes(root);
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    const interrupted = applyRunnerProfileMigrationV2(plan, { rootDir: root, activate: true, interruptAfterRename: ({ index }) => index === 0 });
    assert.equal(interrupted.status, "interrupted");
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v2/journal.json")), true);
    writeFileSync(join(root, sourcePath), 'schema: "pipeline.user.v1\n');
    const recovered = inspectRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(recovered.status, "ready");
    assert.equal(recovered.recovery, "recovered");
    assert.deepEqual(bytes(root), before, "recovery restores source too before parsing it");
  } finally { rmSync(root, { recursive: true, force: true }); }

  const corruptRoot = fixtureRoot();
  try {
    const plan = planRunnerProfileMigrationV2({ rootDir: corruptRoot });
    assert.equal(applyRunnerProfileMigrationV2(plan, { rootDir: corruptRoot, activate: true, interruptAfterRename: () => true }).status, "interrupted");
    writeFileSync(join(corruptRoot, ".pipeline-runner-profile-migration-v2/journal.json"), "not-json\n");
    const before = bytes(corruptRoot);
    const result = inspectRunnerProfileMigrationV2({ rootDir: corruptRoot });
    assert.equal(result.status, "recovery-required");
    assert.deepEqual(bytes(corruptRoot), before, "corrupt proof permits no additional target write");
  } finally { rmSync(corruptRoot, { recursive: true, force: true }); }
});

record("recovery: a journal cannot widen the frozen I2 ownership boundary", () => {
  const root = fixtureRoot();
  try {
    write(root, "unowned-runtime-sentinel.txt", "must-never-be-restored-or-overwritten\n");
    const plan = planRunnerProfileMigrationV2({ rootDir: root });
    const interrupted = applyRunnerProfileMigrationV2(plan, {
      rootDir: root,
      activate: true,
      interruptAfterRename: ({ target }) => target === ".claude/pipeline.yaml",
    });
    assert.equal(interrupted.status, "interrupted");

    const journalPath = join(root, ".pipeline-runner-profile-migration-v2", "journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    const ownedEntry = journal.targets.find((entry) => entry.path === ".claude/pipeline.yaml");
    assert.ok(ownedEntry, "fixture journal contains the frozen pipeline target");
    ownedEntry.path = "unowned-runtime-sentinel.txt";
    writeFileSync(journalPath, `${JSON.stringify(journal)}\n`);

    const before = {
      ...bytes(root),
      "unowned-runtime-sentinel.txt": readFileSync(join(root, "unowned-runtime-sentinel.txt"), "utf8"),
    };
    const inspected = inspectRunnerProfileMigrationV2({ rootDir: root });
    const planned = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(inspected.status, "recovery-required");
    assert.equal(planned.status, "recovery-required");
    assert.deepEqual({
      ...bytes(root),
      "unowned-runtime-sentinel.txt": readFileSync(join(root, "unowned-runtime-sentinel.txt"), "utf8"),
    }, before, "an unowned journal target must fail closed before any target write");
    assert.equal(existsSync(journalPath), true, "untrusted recovery proof remains available for manual repair");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("CLI: inspect, plan, activation, apply, and error exits are JSON and never falsely successful", () => {
  const root = fixtureRoot();
  try {
    const inspected = runCli(["inspect", "--root", root]);
    const planned = runCli(["plan", "--root", root]);
    const blocked = runCli(["apply", "--root", root]);
    const applied = runCli(["apply", "--root", root, "--activate"]);
    const noop = runCli(["plan", "--root", root]);
    assert.deepEqual([inspected.status, planned.status, blocked.status, applied.status, noop.status], [0, 0, 1, 0, 0]);
    assert.deepEqual([inspected.json.status, planned.json.status, blocked.json.status, applied.json.status, noop.json.status], ["ready", "ready", "activation-required", "applied", "noop"]);
    mkdirSync(join(root, ".pipeline-runner-profile-migration-v2"));
    writeFileSync(join(root, ".pipeline-runner-profile-migration-v2", "journal.json"), "bad\n");
    const failedRecovery = runCli(["inspect", "--root", root]);
    assert.equal(failedRecovery.status, 1);
    assert.equal(failedRecovery.json.status, "recovery-required");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const path of trackedPaths) {
  const name = `path safety: ${path} symlink fails closed`;
  if (!fileSymlinkCapability.ok) {
    skip(name, `file symlink unavailable (${fileSymlinkCapability.code}) -- requires admin or Developer Mode on win32`);
    continue;
  }
  record(name, () => {
    const root = fixtureRoot();
    const outside = mkdtempSync(join(tmpdir(), "runner-profile-migration-v2-outside-"));
    try {
      const local = join(root, path);
      const external = join(outside, basename(path));
      writeFileSync(external, readFileSync(local, "utf8"));
      rmSync(local);
      symlinkSync(external, local);
      const before = readFileSync(external, "utf8");
      const plan = planRunnerProfileMigrationV2({ rootDir: root });
      assert.notEqual(plan.status, "ready", `${path} symlink must fail closed`);
      assert.equal(readFileSync(external, "utf8"), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
}

for (const parent of [".claude", ".codex"]) record(`path safety: ${parent} parent symlink fails closed before an outside write`, () => {
    const root = fixtureRoot();
    const outside = mkdtempSync(join(tmpdir(), "runner-profile-migration-v2-parent-outside-"));
    try {
      const localParent = join(root, parent);
      const externalParent = join(outside, parent.slice(1));
      renameSync(localParent, externalParent);
      // Directory-to-directory symlinks need admin/Developer Mode on win32; an NTFS junction is
      // a reparse point too (no privilege required) and lstatSync still reports
      // isSymbolicLink() === true, so the production "path contains a symbolic link" guard is
      // exercised identically. POSIX keeps the plain symlink.
      symlinkSync(externalParent, localParent, process.platform === "win32" ? "junction" : undefined);
      const before = bytes(root, runtimePaths.filter((path) => path.startsWith(`${parent}/`)));
      const plan = planRunnerProfileMigrationV2({ rootDir: root });
      assert.notEqual(plan.status, "ready", `${parent} symlink must fail closed before planning`);
      assert.deepEqual(bytes(root, runtimePaths.filter((path) => path.startsWith(`${parent}/`))), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
});

async function recordAsync(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${detail}`);
    console.log(`FAIL  ${name} -- ${detail}`);
  }
}

await recordAsync("historical v2 lifecycle: routing check accepts v2 while normal setup requires one-way V3 migration", async () => {
  const root = fixtureRoot();
  try {
    const migration = planRunnerProfileMigrationV2({ rootDir: root });
    assert.equal(migration.status, "ready");
    assert.equal(applyRunnerProfileMigrationV2(migration, { rootDir: root, activate: true }).status, "applied");
    const afterMigration = bytes(root);
    const intent = parseYaml(afterMigration[sourcePath]);
    assert.deepEqual(checkV2RuntimeProjection(root, intent), [], "routing gate must accept a current v2 projection");
    assert.equal(await setupRun(["--defaults"], { rootDir: root }), 2, "normal setup must reject v2 and require the explicit one-way V3 migration");
    assert.deepEqual(bytes(root), afterMigration, "V3 setup gate must not rewrite or loosen historical v2 authority");

    const pipelinePath = join(root, ".claude/pipeline.yaml");
    writeFileSync(pipelinePath, readFileSync(pipelinePath, "utf8").replace("model: opus", "model: fable"));
    assert.ok(checkV2RuntimeProjection(root, intent).some((finding) => finding.includes("v2 owned projection drift")), "routing gate must detect v2-owned runtime drift");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} migration v2 contract test(s) passed.`);
}

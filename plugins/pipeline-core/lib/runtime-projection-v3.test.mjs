#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { main as planRuntimeProjectionV3Cli } from "../scripts/plan-runtime-projection-v3.mjs";
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";
import {
  CODEX_CUSTOM_AGENT_METADATA,
  codexCustomAgentSeed,
  loadRuntimeProjectionV3OwnedKeys,
  planRuntimeProjectionV3,
  readRuntimeProjectionV3Baselines,
} from "./runtime-projection-v3.mjs";

const registry = loadRunnerProfilesV3Registry();
const targetPaths = [
  ".claude/settings.json",
  ".claude/pipeline.json",
  ".claude/pipeline.yaml",
  ".codex/config.toml",
  ".codex/agents/implementor.toml",
  ".codex/agents/critic.toml",
  ".codex/agents/consult-advisor.toml",
];

const PREFIX = "# unowned-prefix\nlanguage:\n  human_facing: en\n  unowned_language_sentinel: exact\ncustomBefore: exact\n";
const OWNED = "modelRouting:\n  stale: true\n";
const LEGACY_RUNNER_ROUTES = "runnerRoutes:\n  worktype_feature_advisor:\n    runner: claude\n  worktype_mini_advisor:\n    runner: claude\n";
const SUFFIX = "unownedAfter: exact\n";

assert.match(
  CODEX_CUSTOM_AGENT_METADATA.critic.developerInstructions,
  /bootstrap role is closed as critic[\s\S]*compact critic path[\s\S]*never Elephant onboarding, State, handover, or history/u,
  "Codex Critic projection must close its bootstrap role before the generic SessionStart reminder",
);

for (const role of ["implementor", "critic"]) {
  const source = readFileSync(join(process.cwd(), ".codex", "agents", `${role}.toml`), "utf8");
  const requiredInstruction = codexCustomAgentSeed(role).match(/^developer_instructions = (.+)$/mu)?.[1];
  assert.ok(requiredInstruction && source.includes(`developer_instructions = ${requiredInstruction}`), `source ${role} role must carry the consumer developer instructions`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

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
    critic_export: clone(registry.criticExportPolicy),
    session: { keep_awake: true },
  };
}

function writeFixture(root, { pipelineYaml = `${PREFIX}${OWNED}${LEGACY_RUNNER_ROUTES}${SUFFIX}` } = {}) {
  const files = {
    ".claude/settings.json": "{\n  \"unowned\": true\n}\n",
    ".claude/pipeline.json": "{\n  \"project\": \"fixture\",\n  \"unowned\": true\n}\n",
    ".claude/pipeline.yaml": pipelineYaml,
    ".codex/config.toml": "profile = \"keep\"\n",
    ".codex/agents/implementor.toml": "model = \"old\"\nmodel_reasoning_effort = \"low\"\nname = \"keep\"\n[metadata]\nmodel = \"nested\"\n",
    ".codex/agents/critic.toml": "model = \"old\"\nmodel_reasoning_effort = \"medium\"\nname = \"keep\"\n[metadata]\nmodel_reasoning_effort = \"nested\"\n",
    ".codex/agents/consult-advisor.toml": "name = \"stale\"\n",
  };
  for (const [path, bytes] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, bytes);
  }
}

function fixtureRoot(options) {
  const root = mkdtempSync(join(tmpdir(), "runtime-projection-v3-test-"));
  writeFixture(root, options);
  return root;
}

function target(plan, path) {
  return plan.targets.find((entry) => entry.path === path);
}

let passed = 0;
const failures = [];
function test(name, run) {
  try {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name} -- ${error.message}`);
  }
}

test("V3 plan projects epic/feature advisory and excludes mini advisory", () => {
  const root = fixtureRoot();
  try {
    const plan = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
    assert.equal(plan.status, "ready");
    assert.equal(plan.schema, "pipeline.runtime-projection-plan.v3");
    const claude = target(plan, ".claude/pipeline.yaml");
    assert.match(claude.after.bytes, /advisor_epic:\n    model: fable\n    effort: not-applicable/u);
    assert.match(claude.after.bytes, /advisor_feature:\n    model: fable\n    effort: not-applicable/u);
    assert.doesNotMatch(claude.after.bytes, /advisor_mini/u);
    assert.doesNotMatch(claude.after.bytes, /runnerRoutes/u);
    assert.doesNotMatch(claude.after.bytes, /worktype_mini_advisor/u);
    assert.match(claude.after.bytes, /criticExport:\n  policy: pipeline\.critic-export-policy\.v1/u);
    assert.match(claude.after.bytes, /hostGate: visible-not-bypassed/u);
    assert.match(claude.after.bytes, /providerGate: visible-not-bypassed/u);
    assert.match(claude.after.bytes, /elephant_epic_design/u);
    assert.match(claude.after.bytes, /Adapter selector catalog — Claude aliases: fable, haiku, opus, sonnet; Codex\/OpenAI model IDs: gpt-5\.6-luna, gpt-5\.6-sol, gpt-5\.6-terra\./u);
    assert.match(claude.after.bytes, /language:\n  human_facing: de\n  unowned_language_sentinel: exact/u);
    assert.match(claude.after.bytes, /language:\n  human_facing: de\n  unowned_language_sentinel: exact\nsession:\n  keep_awake: true\ncustomBefore: exact\n/u);
    assert.ok(claude.after.bytes.endsWith(SUFFIX));
    assert.ok(claude.unowned.preserved);
    assert.deepEqual(claude.routes.filter((route) => route.cell.kind === "advisory-profile").map((route) => route.cell.profileId), ["epic", "feature"]);
    const calibration = JSON.parse(target(plan, ".claude/pipeline.json").after.bytes);
    assert.deepEqual(calibration.humanRoles, { po: { displayLabel: "PO" } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("advisor export consent is source-only and never changes runtime projection bytes", () => {
  const root = fixtureRoot();
  try {
    const missing = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
    const declinedIntent = completeIntent();
    declinedIntent.advisor_export = { consent: "declined" };
    const declined = planRuntimeProjectionV3(declinedIntent, { baselines: readRuntimeProjectionV3Baselines(root) });
    const approvedIntent = completeIntent();
    approvedIntent.advisor_export = { consent: "approved" };
    const approved = planRuntimeProjectionV3(approvedIntent, { baselines: readRuntimeProjectionV3Baselines(root) });
    assert.equal(missing.status, "ready");
    assert.equal(declined.status, "ready");
    assert.equal(approved.status, "ready");
    assert.deepEqual(
      declined.targets.map(({ path, after }) => [path, after.sha256]),
      missing.targets.map(({ path, after }) => [path, after.sha256]),
    );
    assert.deepEqual(
      approved.targets.map(({ path, after }) => [path, after.sha256]),
      missing.targets.map(({ path, after }) => [path, after.sha256]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 owns the Codex advisor custom-agent target", () => {
  const manifest = loadRuntimeProjectionV3OwnedKeys();
  const advisor = manifest.targets.find((entry) => entry.path === ".codex/agents/consult-advisor.toml");
  assert.equal(advisor.projection, "codex-advisor-agent-v3");
  assert.deepEqual(advisor.cell, { kind: "duty", dutyId: "advisory" });
  assert.deepEqual(advisor.ownedKeys, ["name", "description", "model", "model_reasoning_effort", "developer_instructions", "sandbox_mode"]);
  const humanRoles = manifest.targets.find((entry) => entry.path === ".claude/pipeline.json");
  assert.deepEqual(humanRoles.ownedKeys, ["humanRoles.po.displayLabel"]);
  const claude = manifest.targets.find((entry) => entry.path === ".claude/pipeline.yaml");
  assert.equal(claude.bindings.some((entry) => entry.targetKey === "advisor_mini"), false);
  assert.ok(claude.ownedKeys.includes("runnerRoutes"), "legacy runnerRoutes must be removed as an owned V3 projection");
  assert.ok(claude.ownedKeys.includes("session.keep_awake"), "session power is an explicit owned V3 projection");
});

test("V3 planning is deterministic, read-only, and byte-preserving", () => {
  const root = fixtureRoot();
  try {
    const before = Object.fromEntries(targetPaths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
    const baselines = readRuntimeProjectionV3Baselines(root);
    const first = planRuntimeProjectionV3(completeIntent(), { source: "fixture", baselines });
    const second = planRuntimeProjectionV3(completeIntent(), { source: "fixture", baselines });
    assert.deepEqual(second, first);
    assert.ok(first.targets.filter((entry) => entry.unowned).every((entry) => entry.unowned.preserved));
    assert.deepEqual(Object.fromEntries(targetPaths.map((path) => [path, readFileSync(join(root, path), "utf8")])), before);
    assert.match(target(first, ".codex/agents/implementor.toml").after.bytes, /model = "gpt-5\.6-luna"/u);
    assert.match(target(first, ".codex/agents/critic.toml").after.bytes, /model = "gpt-5\.6-terra"/u);
    assert.equal(target(first, ".codex/agents/critic.toml").route.requested.effort, "high");
    assert.match(target(first, ".codex/agents/consult-advisor.toml").after.bytes, /sandbox_mode = "read-only"/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 repeated projection is a no-change plan", () => {
  const root = fixtureRoot();
  try {
    const first = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
    const projected = Object.fromEntries(first.targets.map((entry) => [entry.path, { status: "present", bytes: entry.after.bytes }]));
    const second = planRuntimeProjectionV3(completeIntent(), { baselines: projected });
    assert.equal(second.status, "ready");
    assert.ok(second.targets.every((entry) => !entry.changed));
    assert.equal(second.decisionConflicts.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 YAML rendering uses one final LF for a terminal generated projection", () => {
  const root = fixtureRoot({ pipelineYaml: `${PREFIX}${OWNED}` });
  try {
    const plan = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
    assert.equal(plan.status, "ready");
    const bytes = target(plan, ".claude/pipeline.yaml").after.bytes;
    assert.ok(bytes.endsWith("\n"));
    assert.equal(bytes.endsWith("\n\n"), false);
    assert.equal(
      bytes.slice(-"  providerGate: visible-not-bypassed\n".length),
      "  providerGate: visible-not-bypassed\n",
      "the terminal owned criticExport block has exactly one final LF",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 YAML rendering keeps the generated separator before an unowned following block", () => {
  const root = fixtureRoot({ pipelineYaml: `${PREFIX}${OWNED}${SUFFIX}` });
  try {
    const plan = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
    assert.equal(plan.status, "ready");
    const bytes = target(plan, ".claude/pipeline.yaml").after.bytes;
    assert.ok(bytes.endsWith(SUFFIX));
    assert.equal(
      bytes.slice(bytes.indexOf("  providerGate: visible-not-bypassed")),
      "  providerGate: visible-not-bypassed\n\nunownedAfter: exact\n",
      "the unowned following header keeps the generated blank-line separator",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 YAML rendering preserves CRLF placement for terminal and nonterminal projections", () => {
  for (const [name, baseline, expectedEnd] of [
    ["terminal", `${PREFIX}${OWNED}`, "  providerGate: visible-not-bypassed\r\n"],
    ["nonterminal", `${PREFIX}${OWNED}${SUFFIX}`, "  providerGate: visible-not-bypassed\r\n\r\nunownedAfter: exact\r\n"],
  ]) {
    const root = fixtureRoot({ pipelineYaml: baseline.replace(/\n/gu, "\r\n") });
    try {
      const plan = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
      assert.equal(plan.status, "ready", name);
      const bytes = target(plan, ".claude/pipeline.yaml").after.bytes;
      assert.equal(/(?<!\r)\n/u.test(bytes), false, `${name} must not introduce LF-only endings`);
      assert.ok(bytes.endsWith(expectedEnd), name);
      if (name === "terminal") assert.equal(bytes.endsWith("\r\n\r\n"), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("V3 regeneration removes manual terminal YAML whitespace drift", () => {
  const root = fixtureRoot({ pipelineYaml: `${PREFIX}${OWNED}` });
  try {
    const first = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
    assert.equal(first.status, "ready");
    const canonical = target(first, ".claude/pipeline.yaml").after.bytes;
    const drifted = Object.fromEntries(first.targets.map((entry) => [entry.path, { status: "present", bytes: entry.after.bytes }]));
    drifted[".claude/pipeline.yaml"] = { status: "present", bytes: `${canonical}\n` };
    const repaired = planRuntimeProjectionV3(completeIntent(), { baselines: drifted });
    assert.equal(repaired.status, "ready");
    assert.equal(target(repaired, ".claude/pipeline.yaml").changed, true);
    assert.equal(target(repaired, ".claude/pipeline.yaml").after.bytes, canonical);
    const stable = planRuntimeProjectionV3(completeIntent(), {
      baselines: Object.fromEntries(repaired.targets.map((entry) => [entry.path, { status: "present", bytes: entry.after.bytes }])),
    });
    assert.equal(target(stable, ".claude/pipeline.yaml").changed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 language projection changes only the owned human_facing scalar", () => {
  const root = fixtureRoot();
  try {
    const intent = completeIntent();
    const de = planRuntimeProjectionV3(intent, { baselines: readRuntimeProjectionV3Baselines(root) });
    const deBytes = target(de, ".claude/pipeline.yaml").after.bytes;
    assert.match(deBytes, /human_facing: de/u);
    assert.match(deBytes, /unowned_language_sentinel: exact/u);
    intent.language.human_facing = "en";
    const en = planRuntimeProjectionV3(intent, { baselines: readRuntimeProjectionV3Baselines(root) });
    const enBytes = target(en, ".claude/pipeline.yaml").after.bytes;
    assert.match(enBytes, /human_facing: en/u);
    assert.equal(enBytes.replace("human_facing: en", "human_facing: de"), deBytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 projects keep-awake explicitly and maps an omitted legacy source to disabled", () => {
  const root = fixtureRoot();
  try {
    const enabled = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
    assert.match(target(enabled, ".claude/pipeline.yaml").after.bytes, /session:\n  keep_awake: true\n/u);
    const legacy = completeIntent();
    delete legacy.session;
    const disabled = planRuntimeProjectionV3(legacy, { baselines: readRuntimeProjectionV3Baselines(root) });
    assert.equal(disabled.status, "ready");
    assert.match(target(disabled, ".claude/pipeline.yaml").after.bytes, /session:\n  keep_awake: false\n/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 rejects unknown or non-boolean keep-awake input before baseline access", () => {
  for (const session of [{ keep_awake: "true" }, { keep_awake: true, command: "sleep" }]) {
    const intent = completeIntent();
    intent.session = session;
    const baselines = new Proxy({}, { get() { throw new Error("must not inspect baselines"); } });
    const plan = planRuntimeProjectionV3(intent, { baselines });
    assert.equal(plan.status, "invalid-intent");
    assert.deepEqual(plan.targets, []);
  }
});

test("V3 projects a custom PO display label without changing unrelated calibration", () => {
  const root = fixtureRoot();
  try {
    const intent = completeIntent();
    intent.roles = { po: { display_label: "Produktleitung" } };
    const plan = planRuntimeProjectionV3(intent, { baselines: readRuntimeProjectionV3Baselines(root) });
    assert.equal(plan.status, "ready");
    const calibration = target(plan, ".claude/pipeline.json");
    assert.deepEqual(JSON.parse(calibration.after.bytes), {
      project: "fixture",
      unowned: true,
      humanRoles: { po: { displayLabel: "Produktleitung" } },
    });
    assert.match(calibration.after.bytes, /"project": "fixture"/u);
    assert.match(calibration.after.bytes, /"unowned": true/u);
    assert.ok(calibration.unowned.preserved);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 rejects role-label violations before baseline access", () => {
  for (const displayLabel of ["e\u0301", "\u00A0PO", "<PO>", "PO\\", "\u202EPO", "\uFDD0", "x".repeat(41), "\uD800"]) {
    const intent = completeIntent();
    intent.roles = { po: { display_label: displayLabel } };
    const baselines = new Proxy({}, { get() { throw new Error("must not inspect baselines"); } });
    const plan = planRuntimeProjectionV3(intent, { baselines });
    assert.equal(plan.status, "invalid-intent", displayLabel);
    assert.deepEqual(plan.targets, [], displayLabel);
    assert.equal(plan.diagnostics[0].path, "$.roles.po.display_label", displayLabel);
  }
});

test("V3 rejects unknown human-role keys", () => {
  const intent = completeIntent();
  intent.roles = { po: { display_label: "PO", actor: "po" } };
  const plan = planRuntimeProjectionV3(intent, { baselines: {} });
  assert.equal(plan.status, "invalid-intent");
  assert.ok(plan.diagnostics.some((entry) => entry.path === "$.roles.po.actor" && entry.code === "additional_property"));
});

test("V3 rejects invalid intent before baseline access", () => {
  const intent = completeIntent();
  intent.routing.duties.advisory.eligibility.mini = "required";
  const baselines = new Proxy({}, { get() { throw new Error("must not inspect baselines"); } });
  const plan = planRuntimeProjectionV3(intent, { baselines });
  assert.equal(plan.status, "invalid-intent");
  assert.deepEqual(plan.targets, []);
});

test("V3 rejects a caller-modified owned-key boundary", () => {
  const manifest = loadRuntimeProjectionV3OwnedKeys();
  manifest.targets.find((entry) => entry.path === ".claude/pipeline.yaml").bindings.push({ targetKey: "advisor_mini", kind: "advisory-profile", profileId: "mini" });
  const baselines = new Proxy({}, { get() { throw new Error("must not inspect baselines"); } });
  const plan = planRuntimeProjectionV3(completeIntent(), { baselines, ownedKeyManifest: manifest });
  assert.equal(plan.status, "invalid-manifest");
  assert.deepEqual(plan.targets, []);
});

test("V3 CLI redacts target bytes by default and never writes", () => {
  const root = fixtureRoot();
  try {
    const intentPath = join(root, "pipeline.user.v3.json");
    writeFileSync(intentPath, `${JSON.stringify(completeIntent())}\n`);
    const before = readFileSync(join(root, ".claude/pipeline.yaml"), "utf8");
    let output = "";
    const status = planRuntimeProjectionV3Cli(["--intent", intentPath, "--root", root], { write: (chunk) => { output += chunk; } });
    assert.equal(status, 0);
    const plan = JSON.parse(output);
    assert.ok(plan.targets.every((entry) => !Object.hasOwn(entry.after, "bytes")));
    assert.equal(readFileSync(join(root, ".claude/pipeline.yaml"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 malformed owned runtime baseline fails closed", () => {
  const root = fixtureRoot();
  try {
    writeFileSync(join(root, ".claude/pipeline.yaml"), `${PREFIX}modelRouting: invalid\n${SUFFIX}`);
    const plan = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
    assert.equal(plan.status, "invalid-baseline");
    assert.deepEqual(plan.targets, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 baseline reader shares the V2 physical containment contract and preserves a missing valid target", () => {
  const root = fixtureRoot();
  try {
    unlinkSync(join(root, ".claude/pipeline.json"));
    const baselines = readRuntimeProjectionV3Baselines(root);
    assert.equal(baselines[".claude/pipeline.json"].status, "absent");
    assert.equal(baselines[".claude/pipeline.yaml"].status, "present");
    assert.equal(baselines[".codex/config.toml"].status, "present");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("V3 missing or duplicate owned language scalar fails closed", () => {
  for (const language of ["language:\n  other: exact\n", "language:\n  human_facing: en\n  human_facing: de\n"]) {
    const root = fixtureRoot();
    try {
      writeFileSync(join(root, ".claude/pipeline.yaml"), `${language}customBefore: exact\n${OWNED}${LEGACY_RUNNER_ROUTES}${SUFFIX}`);
      const plan = planRuntimeProjectionV3(completeIntent(), { baselines: readRuntimeProjectionV3Baselines(root) });
      assert.equal(plan.status, "invalid-baseline");
      assert.deepEqual(plan.targets, []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// F4 (Critic review CLAUDE-RUNNER-01, round 2): the committed owned-key
// manifest is resolved LAZILY, so importing this module never touches disk.
//
// The manifest used to be read, parsed and frozen at module scope. A missing,
// unreadable, or malformed `config/runtime-projection-v3-owned-keys.json`
// therefore threw during ES-module evaluation -- merely IMPORTING this file
// crashed, before any function in any importer could run. The fail-closed
// admission hooks import it, and node's exit 1 is "allow + config warning"
// under `hooks/hooks.json`, so a config fault DISARMED the gate. The probe
// below spawns a real child process against a staged plugin copy, because an
// import-time side effect can only be observed at real module-evaluation time.
// ---------------------------------------------------------------------------

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const OWNED_KEYS_RELATIVE = join("config", "runtime-projection-v3-owned-keys.json");

const LOAD_SAFETY_PROBE = `
const observed = { importFailure: null, planFailure: null, baselineFailure: null };
let module = null;
try {
  module = await import("./lib/runtime-projection-v3.mjs");
} catch (error) {
  observed.importFailure = String(error?.message ?? error);
}
if (module) {
  try {
    module.planRuntimeProjectionV3({ schema: "pipeline.user.v3" });
    observed.planFailure = false;
  } catch (error) {
    observed.planFailure = String(error?.message ?? error);
  }
  try {
    module.readRuntimeProjectionV3Baselines(process.argv[2]);
    observed.baselineFailure = false;
  } catch (error) {
    observed.baselineFailure = String(error?.message ?? error);
  }
}
process.stdout.write(JSON.stringify(observed));
`;

/** Stage a self-contained plugin copy, optionally breaking the shipped manifest. */
function probeStagedManifest(breakManifest) {
  const stage = mkdtempSync(join(tmpdir(), "runtime-projection-v3-load-"));
  const fixture = fixtureRoot();
  try {
    const withoutTests = (source) => !source.endsWith(".test.mjs");
    for (const directory of ["config", "lib", "scripts"]) {
      cpSync(join(PLUGIN_ROOT, directory), join(stage, directory), { recursive: true, filter: withoutTests });
    }
    breakManifest(join(stage, OWNED_KEYS_RELATIVE));
    const probe = join(stage, "load-safety-probe.mjs");
    writeFileSync(probe, LOAD_SAFETY_PROBE);
    const run = spawnSync(process.execPath, [probe, fixture], { encoding: "utf8", timeout: 120_000 });
    assert.equal(run.error, undefined, String(run.error));
    assert.equal(run.status, 0, `probe exited ${run.status}: ${run.stderr}`);
    return JSON.parse(run.stdout);
  } finally {
    rmSync(stage, { recursive: true, force: true });
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("importing the V3 projector never reads the owned-key manifest from disk", () => {
  // Control: with the shipped manifest intact the very same probe imports AND
  // completes both calls, so a reported failure below is the manifest fault
  // and not an unrelated staging defect.
  const intact = probeStagedManifest(() => {});
  assert.equal(intact.importFailure, null);
  assert.equal(intact.planFailure, false);
  assert.equal(intact.baselineFailure, false);

  for (const [name, breakManifest] of [
    ["absent", (path) => unlinkSync(path)],
    ["invalid-json", (path) => writeFileSync(path, "{ \"schema\": \n")],
  ]) {
    const observed = probeStagedManifest(breakManifest);
    assert.equal(observed.importFailure, null, `${name}: import must not throw`);
    assert.equal(typeof observed.planFailure, "string", `${name}: planRuntimeProjectionV3 must surface the fault`);
    assert.equal(typeof observed.baselineFailure, "string", `${name}: readRuntimeProjectionV3Baselines must surface the fault`);
  }
});

test("the committed owned-key manifest default parameter resolves at call time", () => {
  const root = fixtureRoot();
  try {
    const baselines = readRuntimeProjectionV3Baselines(root);
    // The default expression is `frozenOwnedKeys().manifest`; JS evaluates it
    // per call, so omitting the option must equal passing the committed
    // manifest explicitly -- byte for byte, diagnostics included.
    const byDefault = planRuntimeProjectionV3(completeIntent(), { source: "fixture", baselines });
    const explicit = planRuntimeProjectionV3(completeIntent(), {
      source: "fixture",
      baselines,
      ownedKeyManifest: loadRuntimeProjectionV3OwnedKeys(),
    });
    assert.equal(byDefault.status, "ready");
    assert.deepEqual(explicit, byDefault);
    assert.equal(byDefault.ownedKeyManifest.schema, loadRuntimeProjectionV3OwnedKeys().schema);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log(`\n${passed}/${passed + failures.length} tests passed.`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main as planRuntimeProjectionV3Cli } from "../scripts/plan-runtime-projection-v3.mjs";
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";
import {
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
];

const PREFIX = "# unowned-prefix\nlanguage:\n  human_facing: en\n  unowned_language_sentinel: exact\ncustomBefore: exact\n";
const OWNED = "modelRouting:\n  stale: true\n";
const LEGACY_RUNNER_ROUTES = "runnerRoutes:\n  worktype_feature_advisor:\n    runner: claude\n  worktype_mini_advisor:\n    runner: claude\n";
const SUFFIX = "unownedAfter: exact\n";

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

function writeFixture(root) {
  const files = {
    ".claude/settings.json": "{\n  \"unowned\": true\n}\n",
    ".claude/pipeline.json": "{\n  \"project\": \"fixture\",\n  \"unowned\": true\n}\n",
    ".claude/pipeline.yaml": `${PREFIX}${OWNED}${LEGACY_RUNNER_ROUTES}${SUFFIX}`,
    ".codex/config.toml": "profile = \"keep\"\n",
    ".codex/agents/implementor.toml": "model = \"old\"\nmodel_reasoning_effort = \"low\"\nname = \"keep\"\n[metadata]\nmodel = \"nested\"\n",
    ".codex/agents/critic.toml": "model = \"old\"\nmodel_reasoning_effort = \"medium\"\nname = \"keep\"\n[metadata]\nmodel_reasoning_effort = \"nested\"\n",
  };
  for (const [path, bytes] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, bytes);
  }
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "runtime-projection-v3-test-"));
  writeFixture(root);
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

test("V3 has no Codex advisor custom-agent target", () => {
  const manifest = loadRuntimeProjectionV3OwnedKeys();
  assert.equal(manifest.targets.some((entry) => /advisor/u.test(entry.path)), false);
  assert.equal(manifest.targets.some((entry) => entry.cell?.dutyId === "advisory"), false);
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
    assert.ok(first.targets.every((entry) => entry.unowned.preserved));
    assert.deepEqual(Object.fromEntries(targetPaths.map((path) => [path, readFileSync(join(root, path), "utf8")])), before);
    assert.match(target(first, ".codex/agents/implementor.toml").after.bytes, /model = "gpt-5\.6-terra"/u);
    assert.match(target(first, ".codex/agents/critic.toml").after.bytes, /model = "gpt-5\.6-sol"/u);
    assert.equal(target(first, ".codex/agents/critic.toml").route.requested.effort, "xhigh");
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

console.log(`\n${passed}/${passed + failures.length} tests passed.`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

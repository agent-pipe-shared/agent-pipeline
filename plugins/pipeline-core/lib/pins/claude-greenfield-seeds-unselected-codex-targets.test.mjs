#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Pin: pipeline.claude-greenfield-seeds-unselected-codex-targets (AC-125).
// A fresh project enables only the enrolling runner and seeds no native
// Codex/Claude runtime targets; a later migration reports no false drift for
// .codex targets, and an explicit Codex selection is what makes them appear.
//
// Plan-only: no apply/activate and no child process. The git probe is answered
// by an in-process fake (the fakeDeps pattern of project-onboarding-v3.test.mjs).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { planProjectOnboardingV3 } from "../project-onboarding-v3.mjs";
import { planRunnerProfileMigrationV3 } from "../runner-profile-migration-v3.mjs";
import { loadRunnerProfilesV3Registry, validatePipelineUserV3 } from "../runner-profiles-v3.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "../runtime-projection-v3.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const fixtureParent = join(repoRoot, "scratch", "alf-c-p21-02b-pin");
const RUNNERS = ["claude", "codex", "antigravity"];
const runtimePaths = loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path);
const isCodexPath = (path) => path.startsWith(".codex/");

// In-process fakes: nothing here spawns a process or touches a real machine plane.
const fakeDeps = {
  spawnSync(command, args) {
    const gitArgs = args.filter((value) => value !== "-c");
    return command === "git" && gitArgs.includes("--version")
      ? { status: 0, stdout: "git version 2.40.1\n", stderr: "" }
      : { status: 1, stderr: "unexpected program or arguments" };
  },
  environment: {},
  codexExecutable: process.execPath,
  observeCodexOnboardingCapabilities: () => ({
    status: "local-uninitialized", mode: "local", gitVersion: "2.40.1", initializesGit: false,
    rootWritable: "passed", sessionCapability: "not-required", worktreeCapability: "not-required",
  }),
  observeOnboardingAppServer: () => ({ required: false, status: "not-requested", code: null }),
  observePersistedPoAuthority: () => ({ status: "absent" }),
  readMachinePlane: () => ({
    status: "valid",
    plane: {
      schema: "pipeline.machine-plane.v1", poKeyDirectory: null, pushApprovalDefault: "signature",
      routing: null, language: null, session: null, usage: null, updatedAt: "2026-08-08T00:00:00.000Z",
    },
  }),
};

function freshRoot(label) {
  mkdirSync(fixtureParent, { recursive: true });
  return mkdtempSync(join(fixtureParent, `${label}-`));
}
function dispose(root) { rmSync(root, { recursive: true, force: true }); }
function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

// Test-side mirror of the producer's V3 source rendering (sorted keys, JSON
// scalars). The sha binding below proves it is byte-identical to the plan.
function renderScalar(value) {
  if (typeof value === "string") return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e");
  return String(value);
}
function renderYaml(value, indent = "") {
  if (Array.isArray(value)) {
    return value.map((item) => (item && typeof item === "object")
      ? `${indent}-\n${renderYaml(item, `${indent}  `)}` : `${indent}- ${renderScalar(item)}\n`).join("");
  }
  return Object.keys(value).sort().map((key) => {
    const child = value[key];
    return child && typeof child === "object"
      ? `${indent}${key}:\n${renderYaml(child, `${indent}  `)}` : `${indent}${key}: ${renderScalar(child)}\n`;
  }).join("");
}
function sourceIntent(enabled) {
  const registry = loadRunnerProfilesV3Registry();
  return {
    schema: "pipeline.user.v3",
    language: { human_facing: "en", agent_facing: "en" },
    agent_runtime: "other",
    runners: { enabled, default: enabled[0] },
    routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) },
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 3 },
    gates: {
      dev_plan: "blocking", push: "blocking", human_approval: "signature", push_approval: "signature",
      security: "blocking", claude_md_max_lines: 200,
    },
    critic_export: clone(registry.criticExportPolicy),
    roles: { po: { display_label: "Human" } },
    session: { keep_awake: true },
    advisor_export: { consent: "declined" },
  };
}

// Baselines for the runtime surfaces a migration inspects. `withCodex` controls
// whether the .codex tier already exists on disk.
const baselines = {
  ".claude/settings.json": "{\n  \"settings-unowned-sentinel\": true\n}\n",
  ".claude/pipeline.json": "{\n  \"project\": \"fixture\",\n  \"calibration-unowned-sentinel\": true\n}\n",
  ".claude/pipeline.yaml": "# pipeline-prefix-sentinel\nlanguage:\n  human_facing: en\nunownedBefore: exact\nmodelRouting:\n  legacy_route:\n    model: legacy\n    effort: low\nrunnerRoutes:\n  worktype_feature_advisor:\n    runner: claude\n  worktype_mini_advisor:\n    runner: claude\nunownedAfter: exact\n",
  ".codex/config.toml": "# config-unowned-sentinel\nprofile = \"keep\"\n",
  ".codex/agents/implementor.toml": "# implementor-prefix-sentinel\nmodel = \"old-implementor\"\nmodel_reasoning_effort = \"low\"\n",
  ".codex/agents/critic.toml": "# critic-prefix-sentinel\nmodel = \"old-critic\"\nmodel_reasoning_effort = \"medium\"\n",
  ".codex/agents/consult-advisor.toml": "# advisor-prefix-sentinel\nname = \"old-advisor\"\nmodel = \"old-advisor\"\n",
};
function migrationRoot(label, enabled, { withCodex }) {
  const root = freshRoot(label);
  for (const path of runtimePaths) {
    if (withCodex || !isCodexPath(path)) write(root, path, baselines[path] ?? "{}\n");
  }
  const source = sourceIntent(enabled);
  assert.equal(validatePipelineUserV3(source).ok, true);
  write(root, "pipeline.user.yaml", renderYaml(source));
  return root;
}
function codexPathsOf(plan) {
  return [...plan.targets.map((target) => target.path), ...plan.changes.map((change) => change.path)].filter(isCodexPath);
}
// The one assertion that carries acceptance point (b)/(c) for a migration plan.
function assertNoCodexTargets(plan, label) {
  assert.ok(["ready", "noop"].includes(plan.status), `${label}: ${plan.status} ${JSON.stringify(plan.diagnostics)}`);
  assert.deepEqual(codexPathsOf(plan), [], `${label} must not plan or change an unselected Codex target`);
  assert.deepEqual(plan.decisionConflicts ?? [], [], `${label} must owe no Codex model decisions`);
}

for (const runner of RUNNERS) {
  test(`(a) fresh ${runner} plan enables exactly [${runner}] with default ${runner}, byte-bound to the plan`, () => {
    const root = freshRoot(`plan-${runner}`);
    try {
      const plan = planProjectOnboardingV3({ rootDir: root, runner, deps: fakeDeps });
      assert.equal(plan.status, "ready", JSON.stringify(plan.diagnostics));
      const planned = plan.targets.find((target) => target.path === "pipeline.user.yaml");
      assert.ok(planned, "the plan publishes the V3 source authority");
      const expected = renderYaml(sourceIntent([runner]));
      assert.equal(planned.after.sha256, sha256(expected),
        `planned pipeline.user.yaml must be exactly runners.enabled=[${runner}], default=${runner}`);
      assert.equal(planned.after.byteLength, Buffer.byteLength(expected, "utf8"));
      for (const other of RUNNERS.filter((name) => name !== runner)) {
        assert.notEqual(planned.after.sha256, sha256(renderYaml(sourceIntent([other]))),
          `${runner} plan must not equal the ${other} source`);
      }
      assert.notEqual(planned.after.sha256, sha256(renderYaml(sourceIntent(["claude", "codex"]))),
        "the plan must not also enable Codex");
    } finally { dispose(root); }
  });
}

for (const runner of ["claude", "antigravity"]) {
  test(`(b) fresh ${runner} plan has no .codex/ target and writes no .codex/ path`, () => {
    const root = freshRoot(`nocodex-${runner}`);
    try {
      const plan = planProjectOnboardingV3({ rootDir: root, runner, deps: fakeDeps });
      assert.equal(plan.status, "ready");
      assert.deepEqual(plan.targets.map((target) => target.path).filter(isCodexPath), []);
      assert.deepEqual(plan.changes.filter(isCodexPath), []);
      assert.ok(plan.targets.every((target) => !target.path.startsWith(".claude/")),
        "fresh onboarding seeds the portable tier only; runtime targets come later");
    } finally { dispose(root); }
  });
}

for (const runner of ["claude", "antigravity"]) {
  test(`(c) migration of a ${runner}-only root reports no drift for .codex targets`, () => {
    const root = migrationRoot(`mig-${runner}`, [runner], { withCodex: false });
    try {
      const plan = planRunnerProfileMigrationV3({ rootDir: root });
      assertNoCodexTargets(plan, runner);
      // Sentinel baselines are not the projected bytes, so the Claude tier may be
      // "ready"; the .codex tier must be a no-op: absent from targets and changes,
      // while the plan still inspects the shared tier (the check is not vacuous).
      assert.ok(plan.targets.some((target) => target.path.startsWith(".claude/")), "the shared tier is still planned");
      assert.ok(runtimePaths.some(isCodexPath), "the registry does own .codex runtime targets");
      assert.equal(plan.targets.some((target) => isCodexPath(target.path) && target.changed), false);
    } finally { dispose(root); }
  });
}

test("(d) explicitly enabling Codex makes .codex targets appear (absence is selection-driven)", () => {
  const root = migrationRoot("mig-both", ["claude", "codex"], { withCodex: false });
  try {
    const plan = planRunnerProfileMigrationV3({ rootDir: root, initializeMissingRuntimeForSlimV3: true, overlayCalibration: false });
    assert.equal(plan.status, "ready", JSON.stringify(plan.diagnostics));
    assert.ok(plan.targets.some((target) => target.path === ".codex/agents/consult-advisor.toml"),
      "an enabled Codex runner must publish its native targets");
    assert.ok(codexPathsOf(plan).length > 0);
    assert.throws(() => assertNoCodexTargets(plan, "claude+codex"), /unselected Codex target/u,
      "the no-.codex assertion must fail once Codex is enabled");
  } finally { dispose(root); }
});

test("(d) the same root with Codex baselines present and only Claude selected still plans no .codex target", () => {
  const root = migrationRoot("mig-claude-with-codex-files", ["claude"], { withCodex: true });
  try {
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.ok(["ready", "noop"].includes(plan.status), `${plan.status} ${JSON.stringify(plan.diagnostics)}`);
  } finally { dispose(root); }
});

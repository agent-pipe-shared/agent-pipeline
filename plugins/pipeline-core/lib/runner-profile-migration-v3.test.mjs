#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  applyPendingTransactionRecoveryV3,
  applyRunnerProfileMigrationV3,
  authorizePendingTransactionRecoveryV3,
  inspectRunnerProfileMigrationV3,
  planPendingTransactionRecoveryV3,
  planRunnerProfileMigrationV3,
} from "./runner-profile-migration-v3.mjs";
import * as migrationV3Module from "./runner-profile-migration-v3.mjs";
import { loadRunnerProfilesV2Registry } from "./runner-profiles-v2.mjs";
import { loadRunnerProfilesV3Registry, validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "./runtime-projection-v3.mjs";
import { parseYaml } from "./yaml-lite.mjs";
import { main as migrationCli } from "../scripts/runner-profile-migration-v3.mjs";
import { buildDefaultAnswers, renderUserYaml } from "../../../setup.mjs";

const runtimePaths = loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function scalar(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  throw new Error("unsupported fixture scalar");
}
function yaml(value, indent = "") {
  return Object.entries(value).map(([key, child]) => {
    if (Array.isArray(child)) return `${indent}${key}:\n${child.map((item) => (item && typeof item === "object") ? `${indent}  -\n${yaml(item, `${indent}    `)}` : `${indent}  - ${scalar(item)}\n`).join("")}`;
    if (child && typeof child === "object") return `${indent}${key}:\n${yaml(child, `${indent}  `)}`;
    return `${indent}${key}: ${scalar(child)}\n`;
  }).join("");
}
function v2Intent() {
  const registry = loadRunnerProfilesV2Registry();
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
function v3Intent() {
  const registry = loadRunnerProfilesV3Registry();
  const v2 = v2Intent();
  return { ...v2, schema: "pipeline.user.v3", routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) }, critic_export: clone(registry.criticExportPolicy) };
}
function publicLegacyIntent() {
  const route = (model, effort) => ({ model, effort });
  return {
    setup: { intent: "unconfigured" },
    language: { human_facing: "en", agent_facing: "en" },
    agent_runtime: "claude-code",
    worktypes: {
      design: { design_phase: route("opus", "high"), execution_phase: route("opus", "high"), advisor: "off" },
      feature: { design_phase: route("opus", "high"), execution_phase: route("sonnet", "high"), advisor: "opus" },
      mini: { design_phase: route("sonnet", "high"), execution_phase: route("sonnet", "high"), advisor: "opus" },
    },
    models: {
      implement: route("sonnet", "medium"), mechanic: route("sonnet", "low"),
      deep: route("sonnet", "xhigh"), review: route("sonnet", "max"),
    },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "blocking", claude_md_max_lines: 200 },
  };
}
function write(root, path, content) { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content); }
function fixture(source, { omitCodex = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "runner-profile-v3-test-"));
  const baselines = {
    ".claude/settings.json": "{\n  \"settings-unowned-sentinel\": true\n}\n",
    ".claude/pipeline.json": "{\n  \"project\": \"fixture\",\n  \"calibration-unowned-sentinel\": true\n}\n",
    ".claude/pipeline.yaml": "# pipeline-prefix-sentinel\nlanguage:\n  human_facing: en\nunownedBefore: exact\nmodelRouting:\n  legacy_route:\n    model: legacy\n    effort: low\nrunnerRoutes:\n  worktype_feature_advisor:\n    runner: claude\n  worktype_mini_advisor:\n    runner: claude\nunownedAfter: exact\n",
    ".codex/config.toml": '# config-unowned-sentinel\nprofile = "keep"\n',
    ".codex/agents/implementor.toml": '# implementor-prefix-sentinel\nmodel = "old-implementor"\nmodel_reasoning_effort = "low"\nname = "keep-implementor"\n[metadata]\nmodel = "nested-must-stay"\n',
    ".codex/agents/critic.toml": '# critic-prefix-sentinel\nmodel = "old-critic"\nmodel_reasoning_effort = "medium"\nname = "keep-critic"\n[metadata]\nmodel_reasoning_effort = "nested-must-stay"\n',
  };
  for (const path of runtimePaths) {
    if (!omitCodex || !path.startsWith(".codex/")) write(root, path, baselines[path]);
  }
  write(root, "pipeline.user.yaml", source);
  return root;
}
function snapshot(root) { return Object.fromEntries([...runtimePaths, "pipeline.user.yaml"].map((path) => {
  const target = join(root, path);
  return [path, existsSync(target) ? readFileSync(target, "utf8") : null];
})); }
function durableSnapshot(root) {
  const transaction = join(root, ".pipeline-runner-profile-migration-v3");
  const transactionEntries = existsSync(transaction)
    ? Object.fromEntries(readdirSync(transaction).sort().map((name) => {
      const path = join(transaction, name);
      const info = lstatSync(path);
      return [name, info.isFile() ? readFileSync(path).toString("base64") : `directory:${info.mode}`];
    }))
    : null;
  return {
    targets: snapshot(root),
    transactionEntries,
    codexDirectory: existsSync(join(root, ".codex")),
    codexAgentsDirectory: existsSync(join(root, ".codex/agents")),
  };
}
function runCli(args) {
  let output = ""; let preview = "";
  const status = migrationCli(args, {
    write: (chunk) => { output += String(chunk); },
    writePreview: (chunk) => { preview += String(chunk); },
  });
  return { status, json: JSON.parse(output), preview: preview ? JSON.parse(preview) : null };
}

let passed = 0;
const failures = [];
function record(name, run) {
  try { run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log(`FAIL  ${name} -- ${error.message}`); }
}

record("v2 -> v3 is one-way, digest-only, and old design.advisory cannot disable the advisory duty", () => {
  const source = v2Intent();
  source.routing.profiles.design.advisory.claude = { state: "off", unavailable: "defer", reasonCode: "profile-disabled" };
  const root = fixture(yaml(source));
  try {
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.sourceKind, "v2");
    assert.equal(JSON.stringify(plan).includes("after.bytes"), false);
    assert.equal(JSON.stringify(plan).includes("native-fable"), false, "public plan must not disclose target bytes");
    assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true }).status, "applied");
    const intent = parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8"));
    assert.equal(validatePipelineUserV3(intent).ok, true);
    assert.equal(intent.routing.profiles.design, undefined);
    assert.equal(intent.routing.profiles.epic.design_phase.claude.selector.value, "opus");
    assert.equal(intent.routing.duties.advisory.eligibility.epic, "required");
    assert.equal(intent.routing.duties.advisory.claude.adapter, "native-fable");
    assert.equal(intent.routing.duties.advisory.codex.adapter, "consult");
    assert.equal(intent.advisor_export, undefined);
    assert.deepEqual(validatePipelineUserV3(intent).advisoryExport, { consent: "missing", enabled: false });
    assert.deepEqual(intent.roles, { po: { display_label: "PO" } });
    assert.deepEqual(intent.session, { keep_awake: false });
    assert.deepEqual(JSON.parse(readFileSync(join(root, ".claude/pipeline.json"), "utf8")).humanRoles, { po: { displayLabel: "PO" } });
    assert.match(readFileSync(join(root, ".claude/pipeline.yaml"), "utf8"), /session:\n  keep_awake: false\n/u);
    assert.equal(planRunnerProfileMigrationV3({ rootDir: root }).status, "noop");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("apply requires explicit activation and an unchanged in-process digest-only plan", () => {
  const root = fixture(yaml(v2Intent()));
  try {
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root }).status, "activation-required");
    plan.sourceKind = "forged";
    assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true }).status, "invalid-plan");
    assert.equal(applyRunnerProfileMigrationV3(JSON.parse(JSON.stringify(plan)), { rootDir: root, activate: true }).status, "invalid-plan");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("direct APIs preserve a pending journal until an authenticated delivered-preview authorization recovers it", () => {
  const root = fixture(yaml(v2Intent()));
  try {
    const before = snapshot(root);
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    const applied = applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true, interruptAfterRename: ({ index }) => index === 1 });
    assert.equal(applied.status, "interrupted");
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v3")), true);
    const pending = durableSnapshot(root);
    assert.equal(inspectRunnerProfileMigrationV3({ rootDir: root }).status, "recovery-required");
    assert.deepEqual(durableSnapshot(root), pending);
    assert.equal(inspectRunnerProfileMigrationV3({ rootDir: root, recoverPending: true }).status, "recovery-required", "a recovery boolean grants no authority");
    assert.deepEqual(durableSnapshot(root), pending);
    assert.equal(planRunnerProfileMigrationV3({ rootDir: root }).status, "recovery-required");
    assert.deepEqual(durableSnapshot(root), pending);
    assert.equal(planRunnerProfileMigrationV3({ rootDir: root, recoverPending: true }).status, "recovery-required", "planning cannot opt into implicit recovery");
    assert.deepEqual(durableSnapshot(root), pending);
    assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true, recoverPending: true }).status, "apply-failed");
    assert.deepEqual(durableSnapshot(root), pending);
    assert.equal(Object.hasOwn(migrationV3Module, "recoverPendingTransactionV3"), false, "direct recovery bypass is not exported");

    const recoveryPlan = planPendingTransactionRecoveryV3({ rootDir: root });
    assert.equal(recoveryPlan.status, "ready");
    assert.equal(applyPendingTransactionRecoveryV3(recoveryPlan, { rootDir: root, activate: true }).status, "authorization-required", "activation boolean is not a recovery authorization");
    assert.deepEqual(durableSnapshot(root), pending);
    assert.equal(authorizePendingTransactionRecoveryV3(recoveryPlan).status, "preview-required");
    assert.deepEqual(durableSnapshot(root), pending);

    let deliveredPreview;
    const authorization = authorizePendingTransactionRecoveryV3(recoveryPlan, {
      deliverPreview: (preview) => {
        deliveredPreview = preview;
        assert.deepEqual(durableSnapshot(root), pending, "delivery completes before a recovery mutation");
      },
    });
    assert.equal(authorization.status, "authorized");
    assert.equal(deliveredPreview.operation, "recovery");
    assert.equal(applyPendingTransactionRecoveryV3(recoveryPlan, { rootDir: root, authorization }).status, "recovered");
    assert.deepEqual(snapshot(root), before);
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v3")), false);
    assert.equal(inspectRunnerProfileMigrationV3({ rootDir: root }).status, "ready");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("stale, wrong-plan, and replayed recovery authorizations fail closed", () => {
  const pendingRoot = () => {
    const root = fixture(yaml(v2Intent()));
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    const interrupted = applyRunnerProfileMigrationV3(plan, {
      rootDir: root,
      activate: true,
      interruptAfterRename: ({ index }) => index === 1,
    });
    assert.equal(interrupted.status, "interrupted");
    return root;
  };
  const staleRoot = pendingRoot(); const wrongRoot = pendingRoot(); const replayRoot = pendingRoot();
  try {
    const stalePlan = planPendingTransactionRecoveryV3({ rootDir: staleRoot });
    const staleAuthorization = authorizePendingTransactionRecoveryV3(stalePlan, { deliverPreview: () => {} });
    const staleJournal = join(staleRoot, ".pipeline-runner-profile-migration-v3/journal.json");
    writeFileSync(staleJournal, `${readFileSync(staleJournal, "utf8")} `);
    const staleBytes = durableSnapshot(staleRoot);
    assert.equal(applyPendingTransactionRecoveryV3(stalePlan, {
      rootDir: staleRoot,
      authorization: staleAuthorization,
    }).status, "recovery-failed");
    assert.deepEqual(durableSnapshot(staleRoot), staleBytes, "stale authorization performs no recovery mutation");

    const wrongPlanA = planPendingTransactionRecoveryV3({ rootDir: wrongRoot });
    const wrongAuthorization = authorizePendingTransactionRecoveryV3(wrongPlanA, { deliverPreview: () => {} });
    const otherRoot = pendingRoot();
    try {
      const wrongPlanB = planPendingTransactionRecoveryV3({ rootDir: otherRoot });
      const wrongA = durableSnapshot(wrongRoot); const wrongB = durableSnapshot(otherRoot);
      assert.equal(applyPendingTransactionRecoveryV3(wrongPlanB, {
        rootDir: otherRoot,
        authorization: wrongAuthorization,
      }).status, "invalid-authorization");
      assert.deepEqual(durableSnapshot(wrongRoot), wrongA);
      assert.deepEqual(durableSnapshot(otherRoot), wrongB);
    } finally { rmSync(otherRoot, { recursive: true, force: true }); }

    const replayPlan = planPendingTransactionRecoveryV3({ rootDir: replayRoot });
    const replayAuthorization = authorizePendingTransactionRecoveryV3(replayPlan, { deliverPreview: () => {} });
    assert.equal(applyPendingTransactionRecoveryV3(replayPlan, {
      rootDir: replayRoot,
      authorization: replayAuthorization,
    }).status, "recovered");
    const recovered = durableSnapshot(replayRoot);
    assert.equal(applyPendingTransactionRecoveryV3(replayPlan, {
      rootDir: replayRoot,
      authorization: replayAuthorization,
    }).status, "authorization-required");
    assert.deepEqual(durableSnapshot(replayRoot), recovered, "replayed authorization is single-use and non-mutating");
  } finally {
    rmSync(staleRoot, { recursive: true, force: true });
    rmSync(wrongRoot, { recursive: true, force: true });
    rmSync(replayRoot, { recursive: true, force: true });
  }
});

record("stale source invalidates a reviewed plan before staging", () => {
  const root = fixture(yaml(v2Intent()));
  try {
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    writeFileSync(join(root, "pipeline.user.yaml"), `${readFileSync(join(root, "pipeline.user.yaml"), "utf8")}\n`);
    assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true }).status, "apply-failed");
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v3")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("a handled durable exclusive-commit error rolls every target back", () => {
  const root = fixture(yaml(v2Intent()));
  try {
    const before = snapshot(root);
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    let stageLinks = 0;
    let injected = false;
    const applied = applyRunnerProfileMigrationV3(plan, {
      rootDir: root,
      activate: true,
      deps: {
        linkSync: (from, to) => {
          if (String(from).includes(".pipeline-runner-profile-migration-v3/stage-")) {
            stageLinks += 1;
            if (stageLinks === 2 && !injected) { injected = true; throw Object.assign(new Error("injected link failure"), { code: "EIO" }); }
          }
          return linkSync(from, to);
        },
      },
    });
    assert.equal(applied.status, "rolled-back");
    assert.deepEqual(snapshot(root), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("already-current v3 inspects ready and plans noop", () => {
  const intent = v3Intent();
  intent.advisor_export = { consent: "approved" };
  intent.session = { keep_awake: true };
  const source = yaml(intent);
  const root = fixture(source);
  try {
    assert.equal(inspectRunnerProfileMigrationV3({ rootDir: root }).sourceKind, "v3");
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.ok(["ready", "noop"].includes(plan.status));
    const applied = applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true });
    assert.ok(["applied", "noop"].includes(applied.status));
    assert.equal(planRunnerProfileMigrationV3({ rootDir: root }).status, "noop");
    assert.equal(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), source);
    assert.match(readFileSync(join(root, ".claude/pipeline.yaml"), "utf8"), /session:\n  keep_awake: true\n/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("historical Public aliases migrate atomically without pre-seeded Codex files or private policy", () => {
  const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
  try {
    assert.equal(existsSync(join(root, ".codex")), false);
    const inspected = inspectRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(inspected.status, "ready");
    assert.equal(inspected.sourceKind, "v0");
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.sourceKind, "v0");
    const publicPlan = JSON.stringify(plan);
    assert.equal(publicPlan.includes("after.bytes"), false);
    assert.equal(publicPlan.includes('model = ""'), false);
    const byPath = Object.fromEntries(plan.targets.map((target) => [target.path, target]));
    assert.deepEqual(byPath["pipeline.user.yaml"].preWrite, {
      dataClass: "portable-project-intent",
      logicalTargetRoot: "project-root",
      trackingStatus: "repository-policy-dependent",
      ownerMode: "source-authority",
    });
    assert.deepEqual(byPath[".claude/settings.json"].preWrite, {
      dataClass: "project-runtime-projection",
      logicalTargetRoot: ".claude",
      trackingStatus: "repository-policy-dependent",
      ownerMode: "preserve-only",
    });
    assert.deepEqual(byPath[".claude/pipeline.json"].preWrite, {
      dataClass: "project-runtime-projection",
      logicalTargetRoot: ".claude",
      trackingStatus: "repository-policy-dependent",
      ownerMode: "owned-keys-preserve-unowned",
    });
    assert.deepEqual(byPath[".codex/config.toml"].preWrite, {
      dataClass: "project-runtime-projection",
      logicalTargetRoot: ".codex",
      trackingStatus: "repository-policy-dependent",
      ownerMode: "preserve-only",
    });
    assert.deepEqual(byPath[".codex/agents/implementor.toml"].preWrite, {
      dataClass: "project-runtime-projection",
      logicalTargetRoot: ".codex",
      trackingStatus: "repository-policy-dependent",
      ownerMode: "owned-keys-preserve-unowned",
    });
    assert.ok(plan.targets.every((target) => Object.keys(target.preWrite).sort().join(",") === "dataClass,logicalTargetRoot,ownerMode,trackingStatus"));
    for (const path of [".codex/config.toml", ".codex/agents/implementor.toml", ".codex/agents/critic.toml"]) {
      const target = plan.targets.find((entry) => entry.path === path);
      assert.deepEqual(target.before, { status: "absent", sha256: null, byteLength: 0 });
      assert.equal(target.after.status, "present");
      assert.equal(target.changed, true);
    }
    const applied = applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true });
    assert.equal(applied.status, "applied");
    assert.ok(applied.changes.length > 0);
    assert.ok(applied.changes.every((change) => change.preWrite?.trackingStatus === "repository-policy-dependent"));
    assert.deepEqual(applied.changes.find((change) => change.path === "pipeline.user.yaml").preWrite, byPath["pipeline.user.yaml"].preWrite);
    const intent = parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8"));
    assert.equal(validatePipelineUserV3(intent).ok, true);
    assert.deepEqual(intent.session, { keep_awake: false });
    assert.equal(readFileSync(join(root, ".codex/config.toml"), "utf8"), "");
    const generated = [
      readFileSync(join(root, ".codex/config.toml"), "utf8"),
      readFileSync(join(root, ".codex/agents/implementor.toml"), "utf8"),
      readFileSync(join(root, ".codex/agents/critic.toml"), "utf8"),
    ].join("\n");
    assert.doesNotMatch(generated, /private|provider|communication|human_facing|display_label|keep_awake/iu);
    assert.equal(planRunnerProfileMigrationV3({ rootDir: root }).status, "noop");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("accepted v1 and v2 inputs share the same legacy-only absent-Codex addition contract", () => {
  for (const [sourceKind, source] of [
    ["v1", renderUserYaml(buildDefaultAnswers())],
    ["v2", yaml(v2Intent())],
  ]) {
    const root = fixture(source, { omitCodex: true });
    try {
      const plan = planRunnerProfileMigrationV3({ rootDir: root });
      assert.equal(plan.status, "ready");
      assert.equal(plan.sourceKind, sourceKind);
      assert.ok(plan.targets.filter((target) => target.before.status === "absent").every((target) => target.path.startsWith(".codex/")));
      assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true }).status, "applied");
      assert.equal(parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8")).session.keep_awake, false);
      assert.equal(planRunnerProfileMigrationV3({ rootDir: root }).status, "noop");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

record("legacy additions roll back files and created directories after interruption", () => {
  const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
  try {
    const before = snapshot(root);
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    const applied = applyRunnerProfileMigrationV3(plan, {
      rootDir: root,
      activate: true,
      interruptAfterRename: ({ target }) => target === ".codex/agents/critic.toml",
    });
    assert.equal(applied.status, "interrupted");
    assert.equal(existsSync(join(root, ".codex")), true);
    const recoveryPlan = planPendingTransactionRecoveryV3({ rootDir: root });
    const authorization = authorizePendingTransactionRecoveryV3(recoveryPlan, { deliverPreview: () => {} });
    assert.equal(applyPendingTransactionRecoveryV3(recoveryPlan, { rootDir: root, authorization }).status, "recovered");
    assert.equal(inspectRunnerProfileMigrationV3({ rootDir: root }).status, "ready");
    assert.deepEqual(snapshot(root), before);
    assert.equal(existsSync(join(root, ".codex")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("a stale legacy-addition plan cannot overwrite a newly appeared Codex target", () => {
  const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
  try {
    const before = snapshot(root);
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    write(root, ".codex/config.toml", 'profile = "external-owner"\n');
    const applied = applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true });
    assert.equal(applied.status, "apply-failed");
    assert.equal(readFileSync(join(root, ".codex/config.toml"), "utf8"), 'profile = "external-owner"\n');
    for (const path of runtimePaths.filter((entry) => entry !== ".codex/config.toml")) {
      assert.equal(snapshot(root)[path], before[path]);
    }
    assert.equal(snapshot(root)["pipeline.user.yaml"], before["pipeline.user.yaml"]);
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v3")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("a parent appearing after prepare remains external and survives safe rollback cleanup", () => {
  const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
  try {
    const before = snapshot(root);
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    let raced = false;
    const applied = applyRunnerProfileMigrationV3(plan, {
      rootDir: root,
      activate: true,
      deps: {
        writeFileSync: (path, bytes, options) => {
          const result = writeFileSync(path, bytes, options);
          if (!raced && String(path).endsWith("/.pipeline-runner-profile-migration-v3/journal.json")) {
            const journal = JSON.parse(String(bytes));
            if (journal.state === "prepared") {
              mkdirSync(join(root, ".codex"));
              writeFileSync(join(root, ".codex", "external-owner.txt"), "external\n");
              raced = true;
            }
          }
          return result;
        },
      },
    });
    assert.equal(raced, true);
    assert.equal(applied.status, "rolled-back");
    assert.equal(readFileSync(join(root, ".codex", "external-owner.txt"), "utf8"), "external\n");
    assert.deepEqual(snapshot(root), before);
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v3")), false);
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v3.lock")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("every changed target rejects a post-prepare pre-commit race without deleting external bytes", () => {
  const probe = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
  const changedPaths = planRunnerProfileMigrationV3({ rootDir: probe }).changes.map((change) => change.path);
  rmSync(probe, { recursive: true, force: true });
  for (const [raceIndex, racePath] of changedPaths.entries()) {
    const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
    try {
      const before = snapshot(root);
      const plan = planRunnerProfileMigrationV3({ rootDir: root });
      const external = `external:${racePath}\n`;
      const visited = [];
      const applied = applyRunnerProfileMigrationV3(plan, {
        rootDir: root,
        activate: true,
        deps: {
          beforeCommit: ({ target, journal }) => {
            visited.push(target);
            assert.equal(journal.state, "applying");
            if (target === racePath) writeFileSync(join(root, target), external);
          },
        },
      });
      assert.ok(["rolled-back", "rollback-failed"].includes(applied.status), `${racePath}: ${applied.status}`);
      assert.deepEqual(visited, changedPaths.slice(0, raceIndex + 1), `${racePath}: source-last commit order`);
      assert.equal(readFileSync(join(root, racePath), "utf8"), external, `${racePath}: external bytes survive`);
      const after = snapshot(root);
      for (const path of [...runtimePaths, "pipeline.user.yaml"].filter((path) => path !== racePath)) {
        assert.equal(after[path], before[path], `${racePath}: ${path} restored or untouched`);
      }
      assert.notEqual(applied.status, "applied");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

record("exclusive absent-target commit closes the race after its final preimage check", () => {
  const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
  try {
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    const racePath = ".codex/agents/critic.toml";
    const target = join(root, racePath);
    const external = "external-absent-window\n";
    let raced = false;
    const applied = applyRunnerProfileMigrationV3(plan, {
      rootDir: root,
      activate: true,
      deps: {
        linkSync: (from, to) => {
          if (!raced && to === target && String(from).includes(".pipeline-runner-profile-migration-v3/stage-")) {
            writeFileSync(target, external);
            raced = true;
          }
          return linkSync(from, to);
        },
      },
    });
    assert.equal(raced, true);
    assert.equal(applied.status, "rollback-failed");
    assert.equal(readFileSync(target, "utf8"), external);
    assert.notEqual(applied.status, "applied");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("existing-target displacement verifies the exact bytes moved at the commit boundary", () => {
  const root = fixture(yaml(v2Intent()));
  try {
    const before = snapshot(root);
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    const racePath = ".claude/pipeline.yaml";
    const target = join(root, racePath);
    const external = "external-existing-window\n";
    let raced = false;
    const applied = applyRunnerProfileMigrationV3(plan, {
      rootDir: root,
      activate: true,
      deps: {
        renameSync: (from, to) => {
          if (!raced && from === target && String(to).includes(".pipeline-runner-profile-migration-v3/displaced-")) {
            writeFileSync(target, external);
            raced = true;
          }
          return renameSync(from, to);
        },
      },
    });
    assert.equal(raced, true);
    assert.equal(applied.status, "rolled-back");
    assert.equal(readFileSync(target, "utf8"), external);
    for (const path of [...runtimePaths, "pipeline.user.yaml"].filter((path) => path !== racePath)) {
      assert.equal(snapshot(root)[path], before[path], `${path} restored or untouched`);
    }
    assert.notEqual(applied.status, "applied");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("current V3 with any missing runtime target remains fail-closed", () => {
  const root = fixture(yaml(v3Intent()), { omitCodex: true });
  try {
    assert.equal(inspectRunnerProfileMigrationV3({ rootDir: root }).status, "ready");
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(plan.status, "invalid-baseline");
    assert.equal(plan.targets.length, 0);
    assert.match(plan.diagnostics[0].message, /baseline is missing/u);
    assert.equal(existsSync(join(root, ".codex")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("legacy compatibility remains closed to malformed and unknown aliases", () => {
  const legacy = publicLegacyIntent();
  legacy.models.implement.model = "sonnet-latest";
  const root = fixture(yaml(legacy), { omitCodex: true });
  try {
    const inspected = inspectRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(inspected.status, "invalid-source");
    assert.ok(inspected.diagnostics.some((entry) => entry.code === "unknown_legacy_route"));
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(plan.status, "invalid-source");
    assert.equal(plan.targets.length, 0);
    assert.equal(existsSync(join(root, ".codex")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("existing V3 source without roles or session stays source-compatible while runtime defaults remain inert", () => {
  const source = yaml(v3Intent());
  const root = fixture(source);
  try {
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(plan.sourceKind, "v3");
    assert.equal(plan.status, "ready");
    assert.equal(plan.changes.some((change) => change.path === "pipeline.user.yaml"), false);
    assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true }).status, "applied");
    assert.equal(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), source);
    assert.deepEqual(JSON.parse(readFileSync(join(root, ".claude/pipeline.json"), "utf8")).humanRoles, { po: { displayLabel: "PO" } });
    assert.match(readFileSync(join(root, ".claude/pipeline.yaml"), "utf8"), /session:\n  keep_awake: false\n/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("a one-key V3 refresh preserves the complete boundary without renaming unchanged targets", () => {
  const root = fixture(yaml(v3Intent()));
  try {
    const bootstrap = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(applyRunnerProfileMigrationV3(bootstrap, { rootDir: root, activate: true }).status, "applied");
    write(root, ".claude/pipeline.json", "{\n  \"project\": \"fixture\"\n}\n");
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.deepEqual(plan.changes.map((entry) => entry.path), [".claude/pipeline.json"]);
    const committedTargets = [];
    const applied = applyRunnerProfileMigrationV3(plan, {
      rootDir: root,
      activate: true,
      deps: {
        linkSync: (from, to) => {
          if (String(from).includes(".pipeline-runner-profile-migration-v3/stage-")) committedTargets.push(String(to));
          return linkSync(from, to);
        },
      },
    });
    assert.equal(applied.status, "applied");
    assert.deepEqual(committedTargets, [join(root, ".claude/pipeline.json")]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("authenticated noop apply remains bound to source, runtime digests, and root", () => {
  const root = fixture(yaml(v3Intent()));
  const otherRoot = fixture(yaml(v3Intent()));
  try {
    let bootstrap = planRunnerProfileMigrationV3({ rootDir: root });
    assert.ok(["ready", "noop"].includes(bootstrap.status));
    assert.ok(["applied", "noop"].includes(applyRunnerProfileMigrationV3(bootstrap, { rootDir: root, activate: true }).status));

    const sourcePlan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(sourcePlan.status, "noop");
    writeFileSync(join(root, "pipeline.user.yaml"), `${readFileSync(join(root, "pipeline.user.yaml"), "utf8")}\n`);
    assert.equal(applyRunnerProfileMigrationV3(sourcePlan, { rootDir: root, activate: true }).status, "apply-failed");

    writeFileSync(join(root, "pipeline.user.yaml"), yaml(v3Intent()));
    bootstrap = planRunnerProfileMigrationV3({ rootDir: root });
    assert.ok(["ready", "noop"].includes(bootstrap.status));
    assert.ok(["applied", "noop"].includes(applyRunnerProfileMigrationV3(bootstrap, { rootDir: root, activate: true }).status));
    const runtimePlan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(runtimePlan.status, "noop");
    const runtimeTarget = runtimePaths[0];
    writeFileSync(join(root, runtimeTarget), `${readFileSync(join(root, runtimeTarget), "utf8")}\n`);
    assert.equal(applyRunnerProfileMigrationV3(runtimePlan, { rootDir: root, activate: true }).status, "apply-failed");

    const rootPlan = planRunnerProfileMigrationV3({ rootDir: otherRoot });
    assert.ok(["ready", "noop"].includes(rootPlan.status));
    assert.equal(applyRunnerProfileMigrationV3(rootPlan, { rootDir: root, activate: true }).status, "apply-failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  }
});

record("known V3 Critic route and legacy runnerRoutes refresh through sanctioned re-apply", () => {
  const intent = v3Intent();
  intent.routing.duties.critic_normal.codex.selector.value = "gpt-5.6-terra";
  delete intent.critic_export;
  const root = fixture(yaml(intent));
  try {
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(plan.status, "ready");
    assert.equal(plan.sourceKind, "v3-refresh");
    assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true }).status, "applied");
    const refreshed = parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8"));
    assert.equal(refreshed.routing.duties.critic_normal.codex.selector.value, "gpt-5.6-sol");
    assert.equal(refreshed.critic_export.schema, "pipeline.critic-export-policy.v1");
    assert.match(readFileSync(join(root, ".codex/agents/critic.toml"), "utf8"), /model = "gpt-5\.6-sol"/u);
    assert.doesNotMatch(readFileSync(join(root, ".claude/pipeline.yaml"), "utf8"), /runnerRoutes|worktype_mini_advisor/u);
    assert.match(readFileSync(join(root, ".claude/pipeline.yaml"), "utf8"), /criticExport:\n  policy: pipeline\.critic-export-policy\.v1/u);
    assert.equal(planRunnerProfileMigrationV3({ rootDir: root }).status, "noop");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("CLI enforces inspect/plan/apply and explicit activation", () => {
  const root = fixture(yaml(v2Intent()));
  try {
    assert.equal(runCli(["inspect", "--root", root]).status, 0);
    assert.equal(runCli(["plan", "--root", root]).json.status, "ready");
    const before = snapshot(root);
    const inactive = runCli(["apply", "--root", root]);
    assert.equal(inactive.json.status, "activation-required");
    assert.equal(inactive.preview, null);
    assert.deepEqual(snapshot(root), before);
    const active = runCli(["apply", "--root", root, "--activate"]);
    assert.equal(active.json.status, "applied");
    assert.equal(active.preview.schema, "pipeline.runner-profile-migration-prewrite-preview.v3");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("CLI activated apply emits the complete classified preview before any target mutation", () => {
  const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
  try {
    const before = snapshot(root);
    const expectedPlan = planRunnerProfileMigrationV3({ rootDir: root });
    let output = ""; let previewOutput = ""; let observedAtPreview = null;
    const status = migrationCli(["apply", "--root", root, "--activate"], {
      write: (chunk) => { output += String(chunk); },
      writePreview: (chunk) => {
        observedAtPreview = snapshot(root);
        previewOutput += String(chunk);
      },
    });
    assert.equal(status, 0);
    assert.equal(JSON.parse(output).status, "applied", "stdout remains one machine-readable final result");
    assert.deepEqual(observedAtPreview, before, "preview callback must run before any source/runtime preimage changes");
    assert.equal(existsSync(join(root, ".codex")), true, "apply occurs only after the preview callback returns");

    const preview = JSON.parse(previewOutput);
    assert.equal(preview.schema, "pipeline.runner-profile-migration-prewrite-preview.v3");
    assert.equal(preview.status, "pre-write-preview");
    assert.deepEqual(preview.candidate, {
      planSchema: expectedPlan.schema,
      source: "pipeline.user.yaml",
      sourceKind: "v0",
      sourceSha256: expectedPlan.sourceSha256,
      intentSha256: expectedPlan.intentSha256,
    });
    assert.deepEqual(preview.activation, { requested: true, sourceCommittedLast: true });
    assert.deepEqual(preview.targets, expectedPlan.targets.map((target) => ({
      path: target.path,
      kind: target.kind,
      preWrite: target.preWrite,
      before: target.before,
      after: target.after,
      changed: target.changed,
    })));
    assert.ok(preview.targets.every((target) => target.preWrite.trackingStatus === "repository-policy-dependent"));
    assert.deepEqual(preview.targets.find((target) => target.path === ".codex/config.toml").preWrite, {
      dataClass: "project-runtime-projection",
      logicalTargetRoot: ".codex",
      trackingStatus: "repository-policy-dependent",
      ownerMode: "preserve-only",
    });
    const serialized = JSON.stringify(preview);
    for (const forbidden of ["after.bytes", "settings-unowned-sentinel", "old-implementor", "old-critic", "model =", "private"]) {
      assert.equal(serialized.includes(forbidden), false, `preview must not contain ${forbidden}`);
    }
    assert.equal(Object.hasOwn(preview.candidate, "root"), false, "preview never exports an absolute project coordinate");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("CLI production preview contract completes bounded short writes before activation", () => {
  const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
  try {
    const before = snapshot(root);
    let output = ""; const chunks = []; let writeCalls = 0;
    const status = migrationCli(["apply", "--root", root, "--activate"], {
      write: (chunk) => { output += String(chunk); },
      previewWriteSync: (fd, buffer, offset, length) => {
        assert.equal(fd, 2);
        assert.deepEqual(snapshot(root), before, "every synchronous preview write precedes target mutation");
        const written = Math.min(11, length);
        chunks.push(Buffer.from(buffer.subarray(offset, offset + written)));
        writeCalls += 1;
        return written;
      },
    });
    assert.equal(status, 0);
    assert.equal(JSON.parse(output).status, "applied");
    assert.ok(writeCalls > 1, "the seam must exercise short-write completion");
    const preview = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    assert.equal(preview.schema, "pipeline.runner-profile-migration-prewrite-preview.v3");
    assert.equal(preview.targets.length, runtimePaths.length + 1);
    assert.ok(preview.targets.every((target) => target.preWrite.trackingStatus === "repository-policy-dependent"));
    assert.equal(JSON.stringify(preview).includes("after.bytes"), false);
    assert.equal(existsSync(join(root, ".codex/config.toml")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("CLI production preview zero-progress and failure seams stop before apply", () => {
  for (const [name, previewWriteSync] of [
    ["zero-progress", () => 0],
    ["failed-write", () => { throw new Error("fd2 failed with private detail"); }],
  ]) {
    const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
    try {
      const before = snapshot(root); let output = "";
      const status = migrationCli(["apply", "--root", root, "--activate"], {
        write: (chunk) => { output += String(chunk); },
        previewWriteSync,
      });
      assert.equal(status, 1, name);
      const result = JSON.parse(output);
      assert.equal(result.status, "preview-failed", name);
      assert.equal(output.includes("private detail"), false, name);
      assert.deepEqual(snapshot(root), before, name);
      assert.equal(existsSync(join(root, ".codex")), false, name);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

record("CLI preview-channel failure returns one sanitized result and cannot activate", () => {
  const root = fixture(yaml(publicLegacyIntent()), { omitCodex: true });
  try {
    const before = snapshot(root);
    let output = "";
    const status = migrationCli(["apply", "--root", root, "--activate"], {
      write: (chunk) => { output += String(chunk); },
      writePreview: () => { throw new Error("private injected preview detail"); },
    });
    assert.equal(status, 1);
    const result = JSON.parse(output);
    assert.equal(result.status, "preview-failed");
    assert.equal(result.diagnostics[0].code, "preview_write_failed");
    assert.equal(output.includes("private injected preview detail"), false);
    assert.deepEqual(snapshot(root), before);
    assert.equal(existsSync(join(root, ".codex")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("CLI previews a classified pending recovery before recovery and activation", () => {
  const root = fixture(yaml(v2Intent()));
  try {
    const original = durableSnapshot(root);
    const interrupted = applyRunnerProfileMigrationV3(planRunnerProfileMigrationV3({ rootDir: root }), {
      rootDir: root,
      activate: true,
      interruptAfterRename: ({ index }) => index === 1,
    });
    assert.equal(interrupted.status, "interrupted");
    const pending = durableSnapshot(root);
    assert.notDeepEqual(pending, original);
    assert.equal(runCli(["inspect", "--root", root]).json.status, "recovery-required");
    assert.deepEqual(durableSnapshot(root), pending, "CLI inspect must not recover without a preview");
    assert.equal(runCli(["plan", "--root", root]).json.status, "recovery-required");
    assert.deepEqual(durableSnapshot(root), pending, "CLI plan must not recover without a preview");

    let output = ""; const previews = [];
    const status = migrationCli(["apply", "--root", root, "--activate"], {
      write: (chunk) => { output += String(chunk); },
      writePreview: (chunk) => {
        const preview = JSON.parse(String(chunk));
        previews.push({ preview, observed: durableSnapshot(root) });
      },
    });
    assert.equal(status, 0);
    assert.equal(JSON.parse(output).status, "applied");
    assert.equal(previews.length, 2);
    assert.equal(previews[0].preview.operation, "recovery");
    assert.deepEqual(previews[0].observed, pending, "complete recovery preview precedes every recovery mutation");
    assert.equal(previews[0].preview.recovery.journalSchema, "pipeline.runner-profile-migration-journal.v3");
    assert.match(previews[0].preview.recovery.journalSha256, /^[a-f0-9]{64}$/u);
    assert.ok(previews[0].preview.targets.some((target) => target.action === "restore-recorded-preimage"));
    assert.ok(previews[0].preview.targets.every((target) => target.preWrite.trackingStatus === "repository-policy-dependent"));
    assert.equal(previews[1].preview.operation, "activation");
    assert.deepEqual(previews[1].observed, original, "activation preview follows completed recovery and precedes activation");
    const serialized = JSON.stringify(previews.map(({ preview }) => preview));
    for (const forbidden of [root, "settings-unowned-sentinel", "old-implementor", "old-critic", "after.bytes"]) {
      assert.equal(serialized.includes(forbidden), false, `recovery preview must not contain ${forbidden}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("CLI completes bounded short writes for pending recovery before touching its journal", () => {
  const root = fixture(yaml(v2Intent()));
  try {
    const interrupted = applyRunnerProfileMigrationV3(planRunnerProfileMigrationV3({ rootDir: root }), {
      rootDir: root,
      activate: true,
      interruptAfterRename: ({ index }) => index === 1,
    });
    assert.equal(interrupted.status, "interrupted");
    const pending = durableSnapshot(root);
    let output = ""; let callsWithPendingJournal = 0; let callsAfterRecovery = 0;
    const status = migrationCli(["apply", "--root", root, "--activate"], {
      write: (chunk) => { output += String(chunk); },
      previewWriteSync: (_fd, _buffer, _offset, length) => {
        if (existsSync(join(root, ".pipeline-runner-profile-migration-v3/journal.json"))) {
          assert.deepEqual(durableSnapshot(root), pending, "each recovery-preview short write precedes recovery mutation");
          callsWithPendingJournal += 1;
        } else callsAfterRecovery += 1;
        return Math.min(7, length);
      },
    });
    assert.equal(status, 0);
    assert.equal(JSON.parse(output).status, "applied");
    assert.ok(callsWithPendingJournal > 1, "recovery preview must exercise bounded short-write completion");
    assert.ok(callsAfterRecovery > 1, "activation preview must also complete before activation");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

record("CLI recovery-preview zero-progress and errors preserve pending repo and journal bytes", () => {
  for (const [name, previewWriteSync] of [
    ["zero-progress", () => 0],
    ["failed-write", () => { throw new Error("recovery channel private detail"); }],
  ]) {
    const root = fixture(yaml(v2Intent()));
    try {
      const interrupted = applyRunnerProfileMigrationV3(planRunnerProfileMigrationV3({ rootDir: root }), {
        rootDir: root,
        activate: true,
        interruptAfterRename: ({ index }) => index === 1,
      });
      assert.equal(interrupted.status, "interrupted");
      const pending = durableSnapshot(root); let output = "";
      const status = migrationCli(["apply", "--root", root, "--activate"], {
        write: (chunk) => { output += String(chunk); },
        previewWriteSync,
      });
      assert.equal(status, 1, name);
      const result = JSON.parse(output);
      assert.equal(result.status, "preview-failed", name);
      assert.equal(result.diagnostics[0].message, "pre-write preview channel failed before recovery", name);
      assert.equal(output.includes("private detail"), false, name);
      assert.deepEqual(durableSnapshot(root), pending, `${name}: repo and recovery journal remain byte-identical`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

record("the shipped v1 seed converts directly to V3 without a persistent V2 intermediate", () => {
  const root = fixture(renderUserYaml(buildDefaultAnswers()));
  try {
    const plan = planRunnerProfileMigrationV3({ rootDir: root });
    assert.equal(plan.sourceKind, "v1");
    assert.equal(plan.status, "ready");
    assert.equal(applyRunnerProfileMigrationV3(plan, { rootDir: root, activate: true }).status, "applied");
    const intent = parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8"));
    assert.equal(intent.schema, "pipeline.user.v3");
    assert.equal(validatePipelineUserV3(intent).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

console.log(`\nrunner-profile-migration-v3: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) { for (const failure of failures) console.error(`  ${failure}`); process.exit(1); }

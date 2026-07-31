#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import {
  fsyncSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyPipelineUpdateChannel,
  PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA,
  planPipelineUpdateChannel,
  readProjectPipelineUpdateChannel,
  resolvePipelineUpdateChannel,
} from "./pipeline-update-channel.mjs";

const roots = [];

function fixture(name, raw = "{\n  \"project\": \"consumer\"\n}\n") {
  const root = mkdtempSync(join(tmpdir(), `pipeline-update-channel-${name}-`));
  roots.push(root);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schemaVersion: 4\n");
  writeFileSync(join(root, "project", "pipeline.json"), raw);
  return root;
}

function writeLegacyCalibration(root, raw) {
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schemaVersion: 4\n");
  writeFileSync(join(root, ".claude", "pipeline.json"), raw);
}

function applyPlan(root, plan, deps = {}) {
  return applyPipelineUpdateChannel(root, {
    channel: plan.channel,
    expectedCalibrationSha256: plan.preimageSha256,
    expectedPostimageSha256: plan.postimageSha256,
    planSha256: plan.planSha256,
    activate: true,
  }, deps);
}

function transactionArtifacts(root) {
  return readdirSync(join(root, "project"))
    .filter((name) => name.includes("pipeline-update-channel"));
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("closed defaults use only explicit trusted self-application authority", () => {
  assert.deepEqual(resolvePipelineUpdateChannel({ selfApplication: true }), {
    status: "ready",
    channel: "alpha",
    source: "distribution-default",
    topology: "local-self-development",
    reason: null,
  });
  assert.equal(resolvePipelineUpdateChannel({}).channel, "stable");
  assert.equal(resolvePipelineUpdateChannel({ installedSource: "local-development" }).channel, "stable");
  assert.equal(resolvePipelineUpdateChannel({ updateChannel: "alpha" }).channel, "stable");
  assert.equal(resolvePipelineUpdateChannel({
    distributionTopology: "local-self-development",
  }).channel, "alpha");
  assert.equal(resolvePipelineUpdateChannel({
    distributionTopology: "guessed-local-source",
  }).status, "unknown");
});

test("project override is the sole portable channel input", () => {
  for (const channel of ["alpha", "beta", "stable"]) {
    const resolved = resolvePipelineUpdateChannel({
      selfApplication: true,
      updateChannel: "stable",
      projectConfig: {
        status: "ready",
        updateChannel: channel,
        source: "project-config",
        reason: null,
      },
    });
    assert.equal(resolved.channel, channel);
    assert.equal(resolved.source, "project-config");
  }
  assert.equal(resolvePipelineUpdateChannel({
    projectConfig: { status: "ready", updateChannel: "refs/heads/main" },
  }).status, "unknown");
  assert.equal(resolvePipelineUpdateChannel({
    projectConfig: { status: "unknown" },
  }).status, "unknown");
});

test("neutral consumer calibration with an absent field defaults stable", () => {
  const root = fixture("absent-field");
  const projectConfig = readProjectPipelineUpdateChannel(root);
  assert.equal(projectConfig.status, "absent");
  assert.equal(resolvePipelineUpdateChannel({ projectConfig }).channel, "stable");
});

test("digest-bound writer preserves every unrelated calibration byte and reads back", () => {
  const before = "{\n\t\"project\" : \"consumer\",\n\t\"pipelineUpdateChannel\" : \"stable\",\n\t\"nested\": { \"keep\": [1, 2, 3] }\n}\n";
  const root = fixture("preserve", before);
  const plan = planPipelineUpdateChannel(root, "beta");
  assert.equal(plan.schema, PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA);
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.applyAction, {
    kind: "command",
    executable: "node",
    mutation: true,
    requiresConfirmation: true,
    executionBoundary: "host-authorized-wsl",
    argv: [
      fileURLToPath(new URL("./pipeline-update-channel.mjs", import.meta.url)),
      "apply",
      "--repo",
      root,
      "--channel",
      "beta",
      "--expected-calibration-sha256",
      plan.preimageSha256,
      "--expected-postimage-sha256",
      plan.postimageSha256,
      "--plan-sha256",
      plan.planSha256,
      "--activate",
    ],
    expected: {
      schema: PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA,
      statuses: ["applied", "replayed"],
    },
  });

  const applied = applyPlan(root, plan);
  assert.equal(applied.status, "applied");
  const after = readFileSync(join(root, "project", "pipeline.json"), "utf8");
  assert.equal(after, before.replace('"pipelineUpdateChannel" : "stable"', '"pipelineUpdateChannel" : "beta"'));
  assert.deepEqual(readProjectPipelineUpdateChannel(root), {
    status: "ready",
    updateChannel: "beta",
    source: "project-config",
    reason: null,
  });

  const replay = applyPlan(root, plan);
  assert.equal(replay.status, "replayed");
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), after);
});

test("writer inserts the portable field without reserializing calibration", () => {
  const before = "{\n  \"project\": \"consumer\",\n  \"unrelated\": [true, false]\n}\n";
  const root = fixture("insert", before);
  const plan = planPipelineUpdateChannel(root, "stable");
  assert.equal(plan.status, "ready");
  assert.equal(applyPlan(root, plan).status, "applied");
  const after = readFileSync(join(root, "project", "pipeline.json"), "utf8");
  assert.equal(after, "{\n  \"project\": \"consumer\",\n  \"unrelated\": [true, false],\n  \"pipelineUpdateChannel\": \"stable\"\n}\n");
  assert.deepEqual(JSON.parse(after).unrelated, [true, false]);
});

test("current plans are explicit read-only replay actions", () => {
  const before = '{"pipelineUpdateChannel":"beta","keep":true}\n';
  const root = fixture("current", before);
  const plan = planPipelineUpdateChannel(root, "beta");
  assert.equal(plan.status, "current");
  assert.equal(plan.preimageSha256, plan.postimageSha256);
  assert.equal(plan.applyAction.mutation, false);
  assert.equal(plan.applyAction.requiresConfirmation, false);
  assert.deepEqual(plan.applyAction.expected.statuses, ["replayed"]);
  assert.equal(applyPlan(root, plan).status, "replayed");
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), before);
  assert.deepEqual(transactionArtifacts(root), []);
});

test("exclusive writer lock rejects concurrent sanctioned mutation", () => {
  const before = '{"pipelineUpdateChannel":"stable"}\n';
  const root = fixture("locked", before);
  const target = join(root, "project", "pipeline.json");
  const lock = `${target}.pipeline-update-channel.lock`;
  const plan = planPipelineUpdateChannel(root, "beta");
  writeFileSync(lock, "foreign-lock\n", { flag: "wx", mode: 0o600 });
  const blocked = applyPlan(root, plan);
  assert.equal(blocked.reason, "writer-locked");
  assert.equal(readFileSync(target, "utf8"), before);
});

test("precommit race revalidation preserves the concurrent calibration edit", () => {
  const before = '{"pipelineUpdateChannel":"stable","owner":"planned"}\n';
  const concurrent = '{"pipelineUpdateChannel":"alpha","owner":"concurrent"}\n';
  const root = fixture("race", before);
  const target = join(root, "project", "pipeline.json");
  const plan = planPipelineUpdateChannel(root, "beta");
  const raced = applyPlan(root, plan, {
    beforeCommitValidation() { writeFileSync(target, concurrent); },
  });
  assert.equal(raced.reason, "calibration-drift");
  assert.equal(readFileSync(target, "utf8"), concurrent);
  assert.deepEqual(transactionArtifacts(root), []);
});

test("writer lock identity loss fails closed without removing a foreign lock", () => {
  const before = '{"pipelineUpdateChannel":"stable"}\n';
  const root = fixture("lock-loss", before);
  const target = join(root, "project", "pipeline.json");
  const lock = `${target}.pipeline-update-channel.lock`;
  const plan = planPipelineUpdateChannel(root, "beta");
  const lost = applyPlan(root, plan, {
    beforeCommitValidation() {
      unlinkSync(lock);
      writeFileSync(lock, "foreign-owner\n", { flag: "wx", mode: 0o600 });
    },
  });
  assert.equal(lost.reason, "writer-lock-lost");
  assert.equal(readFileSync(target, "utf8"), before);
  assert.equal(readFileSync(lock, "utf8"), "foreign-owner\n");
});

test("temporary fsync and rename faults leave the exact preimage in place", () => {
  for (const fault of ["temp-fsync", "rename"]) {
    const before = `{\"pipelineUpdateChannel\":\"stable\",\"fault\":\"${fault}\"}\n`;
    const root = fixture(fault, before);
    const target = join(root, "project", "pipeline.json");
    const plan = planPipelineUpdateChannel(root, "beta");
    let syncCount = 0;
    const failed = applyPlan(root, plan, fault === "temp-fsync" ? {
      fsync(fd) {
        syncCount += 1;
        if (syncCount === 3) throw new Error("injected temp fsync failure");
        return fsyncSync(fd);
      },
    } : {
      rename() { throw new Error("injected rename failure"); },
    });
    assert.equal(failed.reason, "write-unavailable");
    assert.equal(readFileSync(target, "utf8"), before);
    assert.deepEqual(transactionArtifacts(root), []);
  }
});

test("post-rename directory fsync failure is typed committed and replayable", () => {
  const root = fixture("durability", '{"pipelineUpdateChannel":"stable"}\n');
  const target = join(root, "project", "pipeline.json");
  const plan = planPipelineUpdateChannel(root, "beta");
  let syncCount = 0;
  const uncertain = applyPlan(root, plan, {
    fsync(fd) {
      syncCount += 1;
      if (syncCount === 4) throw new Error("injected directory fsync failure");
      return fsyncSync(fd);
    },
  });
  assert.equal(uncertain.status, "unknown");
  assert.equal(uncertain.reason, "commit-durability-unknown");
  assert.equal(uncertain.committed, true);
  assert.equal(JSON.parse(readFileSync(target, "utf8")).pipelineUpdateChannel, "beta");
  assert.equal(applyPlan(root, plan).status, "replayed");
  assert.deepEqual(transactionArtifacts(root), []);
});

test("hard-linked calibration is rejected before planning", () => {
  const root = fixture("hardlink");
  const target = join(root, "project", "pipeline.json");
  linkSync(target, join(root, "project", "pipeline-hardlink.json"));
  const rejected = planPipelineUpdateChannel(root, "beta");
  assert.equal(rejected.status, "unknown");
  assert.equal(rejected.reason, "calibration-unavailable");
});

test("repository aliases through a symlink are not writable authority paths", () => {
  const real = fixture("physical-root");
  const holder = mkdtempSync(join(tmpdir(), "pipeline-update-channel-alias-"));
  roots.push(holder);
  const alias = join(holder, "repo");
  symlinkSync(real, alias, "dir");
  const rejected = planPipelineUpdateChannel(alias, "beta");
  assert.equal(rejected.status, "unknown");
  assert.equal(rejected.reason, "project-authority-unavailable");
});

test("apply rejects calibration drift and a forged or stale plan without writing", () => {
  const root = fixture("drift");
  const plan = planPipelineUpdateChannel(root, "beta");
  const drifted = "{\n  \"project\": \"consumer-drifted\"\n}\n";
  writeFileSync(join(root, "project", "pipeline.json"), drifted);
  assert.equal(applyPlan(root, plan).reason, "calibration-drift");
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), drifted);

  const forged = applyPipelineUpdateChannel(root, {
    channel: "beta",
    expectedCalibrationSha256: plan.preimageSha256,
    expectedPostimageSha256: plan.postimageSha256,
    planSha256: "f".repeat(64),
    activate: true,
  });
  assert.equal(forged.reason, "invalid-plan");
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), drifted);
});

test("neutral calibration wins conflicts and legacy bytes are never mutated", () => {
  const root = fixture("neutral-wins", '{"pipelineUpdateChannel":"alpha","neutral":true}\n');
  const legacy = '{"pipelineUpdateChannel":"stable","legacy":true}\n';
  writeLegacyCalibration(root, legacy);

  assert.equal(readProjectPipelineUpdateChannel(root).updateChannel, "alpha");
  const plan = planPipelineUpdateChannel(root, "beta");
  assert.equal(plan.status, "ready");
  assert.equal(plan.calibrationPath, "project/pipeline.json");
  assert.equal(applyPlan(root, plan).status, "applied");
  assert.equal(readProjectPipelineUpdateChannel(root).updateChannel, "beta");
  assert.equal(readFileSync(join(root, ".claude", "pipeline.json"), "utf8"), legacy);
});

test("legacy-only calibration is non-authoritative and consumers default stable", () => {
  const root = mkdtempSync(join(tmpdir(), "pipeline-update-channel-legacy-only-"));
  roots.push(root);
  writeLegacyCalibration(root, '{"pipelineUpdateChannel":"alpha"}\n');

  const projectConfig = readProjectPipelineUpdateChannel(root);
  assert.deepEqual(projectConfig, {
    status: "absent",
    updateChannel: null,
    source: null,
    reason: null,
  });
  assert.equal(resolvePipelineUpdateChannel({ projectConfig }).channel, "stable");
  assert.equal(planPipelineUpdateChannel(root, "beta").reason, "calibration-unavailable");
});

test("mixed neutral and legacy authority fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "pipeline-update-channel-mixed-"));
  roots.push(root);
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.yaml"), "schemaVersion: 4\n");
  writeLegacyCalibration(root, '{"pipelineUpdateChannel":"alpha"}\n');

  assert.equal(readProjectPipelineUpdateChannel(root).status, "unknown");
  assert.equal(planPipelineUpdateChannel(root, "stable").reason, "project-authority-unavailable");
});

test("malformed calibration and invalid enum, URL, or ref values fail closed", () => {
  const malformed = fixture("malformed", "{not json\n");
  assert.equal(planPipelineUpdateChannel(malformed, "stable").reason, "malformed-configuration");
  assert.equal(readProjectPipelineUpdateChannel(malformed).status, "unknown");

  const invalid = fixture("invalid", '{"pipelineUpdateChannel":"main"}\n');
  assert.equal(planPipelineUpdateChannel(invalid, "stable").reason, "invalid-channel");
  assert.equal(planPipelineUpdateChannel(invalid, "refs/heads/main").reason, "invalid-channel");
  assert.equal(planPipelineUpdateChannel(invalid, "https://example.invalid/pipeline.git").reason, "invalid-channel");

  const duplicate = fixture("duplicate", '{"pipelineUpdateChannel":"beta","pipelineUpdateChannel":"stable"}\n');
  assert.equal(planPipelineUpdateChannel(duplicate, "stable").reason, "malformed-configuration");
});

test("CLI admits no configured-channel, ref, URL, or remote bypass", () => {
  const root = fixture("cli");
  for (const args of [
    ["plan", "--repo", root, "--channel", "refs/heads/main"],
    ["plan", "--repo", root, "--channel", "https://example.invalid/pipeline.git"],
    ["plan", "--repo", root, "--channel", "stable", "--remote", "origin"],
  ]) {
    const output = spawnSync(process.execPath, [fileURLToPath(new URL("./pipeline-update-channel.mjs", import.meta.url)), ...args], {
      encoding: "utf8",
    });
    assert.notEqual(output.status, 0);
  }
});

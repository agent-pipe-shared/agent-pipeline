#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyPipelineUpdateAlphaRef,
  applyPipelineUpdateChannel,
  isPipelineUpdateAlphaRef,
  PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA,
  PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA,
  planPipelineUpdateAlphaRef,
  planPipelineUpdateChannel,
  readProjectPipelineUpdateAlphaRef,
  readProjectPipelineUpdateChannel,
  resolvePipelineUpdateChannel,
} from "./pipeline-update-channel.mjs";
import { NEUTRAL_CALIBRATION } from "../lib/project-authority.mjs";

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

function applyAlphaRefPlan(root, plan, deps = {}) {
  return applyPipelineUpdateAlphaRef(root, {
    alphaRef: plan.alphaRef,
    expectedCalibrationSha256: plan.preimageSha256,
    expectedPostimageSha256: plan.postimageSha256,
    planSha256: plan.planSha256,
    activate: true,
  }, deps);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

// Mirrors canonicalJson/alphaRefPlanBinding (both unexported, pipeline-update-channel.mjs)
// to construct a genuinely self-consistent digest binding without going
// through planPipelineUpdateAlphaRef -- which itself now refuses to plan
// against a duplicate-key file, so it cannot be the source of a binding
// that is meant to target one. This models AC-2's "a caller that builds
// its own plan": independently-computed digests that still satisfy apply's
// own invalid-plan self-consistency check, not a caller replaying the
// sanctioned plan function's output.
function canonicalJsonForTest(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonForTest).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonForTest(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function independentAlphaRefBinding(root, alphaRef, preimageSha256, postimageSha256) {
  const binding = {
    schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA,
    repo: resolve(root),
    calibrationPath: NEUTRAL_CALIBRATION,
    alphaRef,
    preimageSha256,
    postimageSha256,
  };
  return { ...binding, planSha256: sha256(canonicalJsonForTest(binding)) };
}

// Mirrors independentAlphaRefBinding for the channel field: a genuinely
// self-consistent digest binding built without going through
// planPipelineUpdateChannel, which itself now refuses to plan a channel
// value over an already-invalid stored channel (this models a caller that
// built its own plan against a stale, since-then-corrupted calibration).
function independentChannelBinding(root, channel, preimageSha256, postimageSha256) {
  const binding = {
    schema: PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA,
    repo: resolve(root),
    calibrationPath: NEUTRAL_CALIBRATION,
    channel,
    preimageSha256,
    postimageSha256,
  };
  return { ...binding, planSha256: sha256(canonicalJsonForTest(binding)) };
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
    alphaRef: null,
    alphaRefReason: null,
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

test("alpha-ref field follows the channel field's read/validate/default pattern (ADR-0078 D3)", () => {
  const absentRoot = fixture("alpha-ref-absent");
  assert.deepEqual(readProjectPipelineUpdateAlphaRef(absentRoot), {
    status: "absent", alphaRef: null, source: null, reason: null,
  });

  const readyRoot = fixture("alpha-ref-ready", '{"pipelineUpdateAlphaRef":"feat/sprint-nova-codex-v046"}\n');
  assert.deepEqual(readProjectPipelineUpdateAlphaRef(readyRoot), {
    status: "ready", alphaRef: "feat/sprint-nova-codex-v046", source: "project-config", reason: null,
  });

  const mainRoot = fixture("alpha-ref-main", '{"pipelineUpdateAlphaRef":"main"}\n');
  assert.deepEqual(readProjectPipelineUpdateAlphaRef(mainRoot), {
    status: "ready", alphaRef: "main", source: "project-config", reason: null,
  });

  const nonStringRoot = fixture("alpha-ref-non-string", '{"pipelineUpdateAlphaRef":123}\n');
  assert.deepEqual(readProjectPipelineUpdateAlphaRef(nonStringRoot), {
    status: "unknown", alphaRef: null, source: "project-config", reason: "invalid-alpha-ref",
  });

  const malformedRoot = fixture("alpha-ref-malformed", '{"pipelineUpdateAlphaRef":"not a valid ref"}\n');
  assert.deepEqual(readProjectPipelineUpdateAlphaRef(malformedRoot), {
    status: "unknown", alphaRef: null, source: "project-config", reason: "invalid-alpha-ref",
  });

  const duplicateRoot = fixture("alpha-ref-duplicate", '{"pipelineUpdateAlphaRef":"feat/a","pipelineUpdateAlphaRef":"feat/b"}\n');
  assert.deepEqual(readProjectPipelineUpdateAlphaRef(duplicateRoot), {
    status: "unknown", alphaRef: null, source: "project-config", reason: "malformed-configuration",
  });

  // AC-4: a genuinely unreadable calibration (not merely an absent or
  // invalid field) is the one case that legitimately stays
  // channel-unavailable -- distinct from the two config-error cases above.
  const unreadableRoot = fixture("alpha-ref-calibration-unreadable", "{not json\n");
  assert.deepEqual(readProjectPipelineUpdateAlphaRef(unreadableRoot), {
    status: "unknown", alphaRef: null, source: "project-config", reason: "channel-unavailable",
  });

  assert.equal(isPipelineUpdateAlphaRef("main"), true);
  assert.equal(isPipelineUpdateAlphaRef("feat/sprint-alfred"), true);
  assert.equal(isPipelineUpdateAlphaRef(""), false);
  assert.equal(isPipelineUpdateAlphaRef(123), false);
  assert.equal(isPipelineUpdateAlphaRef("/leading-slash"), false);
  assert.equal(isPipelineUpdateAlphaRef("trailing-slash/"), false);
  assert.equal(isPipelineUpdateAlphaRef("has space"), false);
  assert.equal(isPipelineUpdateAlphaRef("has..dotdot"), false);
  assert.equal(isPipelineUpdateAlphaRef("-leading-dash"), false);
});

test("resolvePipelineUpdateChannel threads alphaRef only when the config is ready, and never blocks an unrelated channel", () => {
  assert.deepEqual(resolvePipelineUpdateChannel({
    projectConfig: { status: "ready", updateChannel: "stable" },
    alphaRefConfig: { status: "unknown", alphaRef: null, source: "project-config", reason: "invalid-alpha-ref" },
  }), {
    status: "ready", channel: "stable", source: "project-config", topology: null,
    alphaRef: null, alphaRefReason: "invalid-alpha-ref", reason: null,
  });
  assert.deepEqual(resolvePipelineUpdateChannel({
    projectConfig: { status: "ready", updateChannel: "alpha" },
    alphaRefConfig: { status: "ready", alphaRef: "feat/sprint-alfred", source: "project-config", reason: null },
  }), {
    status: "ready", channel: "alpha", source: "project-config", topology: null,
    alphaRef: "feat/sprint-alfred", alphaRefReason: null, reason: null,
  });
  assert.deepEqual(resolvePipelineUpdateChannel({
    projectConfig: { status: "ready", updateChannel: "alpha" },
    alphaRefConfig: { status: "absent", alphaRef: null, source: null, reason: null },
  }).alphaRef, null);
});

test("resolvePipelineUpdateChannel survives all three distinct alphaRefConfig reasons (finding: the resolver must not collapse them)", () => {
  assert.equal(resolvePipelineUpdateChannel({
    projectConfig: { status: "ready", updateChannel: "alpha" },
    alphaRefConfig: { status: "unknown", alphaRef: null, source: "project-config", reason: "channel-unavailable" },
  }).alphaRefReason, "channel-unavailable");
  assert.equal(resolvePipelineUpdateChannel({
    projectConfig: { status: "ready", updateChannel: "alpha" },
    alphaRefConfig: { status: "unknown", alphaRef: null, source: "project-config", reason: "malformed-configuration" },
  }).alphaRefReason, "malformed-configuration");
  assert.equal(resolvePipelineUpdateChannel({
    projectConfig: { status: "ready", updateChannel: "alpha" },
    alphaRefConfig: { status: "unknown", alphaRef: null, source: "project-config", reason: "invalid-alpha-ref" },
  }).alphaRefReason, "invalid-alpha-ref");
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

test("alpha-ref writer plans, applies, and replays the way the channel writer does (AC-1)", () => {
  const before = "{\n  \"project\": \"self\",\n  \"pipelineUpdateAlphaRef\": \"feat/old\"\n}\n";
  const root = fixture("alpha-ref-write", before);
  const plan = planPipelineUpdateAlphaRef(root, "feat/sprint-nova-codex-v046");
  assert.equal(plan.schema, PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA);
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
      "--alpha-ref",
      "feat/sprint-nova-codex-v046",
      "--expected-calibration-sha256",
      plan.preimageSha256,
      "--expected-postimage-sha256",
      plan.postimageSha256,
      "--plan-sha256",
      plan.planSha256,
      "--activate",
    ],
    expected: {
      schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA,
      statuses: ["applied", "replayed"],
    },
  });

  const applied = applyAlphaRefPlan(root, plan);
  assert.equal(applied.status, "applied");
  const after = readFileSync(join(root, "project", "pipeline.json"), "utf8");
  assert.equal(after, before.replace('"feat/old"', '"feat/sprint-nova-codex-v046"'));
  assert.deepEqual(readProjectPipelineUpdateAlphaRef(root), {
    status: "ready", alphaRef: "feat/sprint-nova-codex-v046", source: "project-config", reason: null,
  });

  const replay = applyAlphaRefPlan(root, plan);
  assert.equal(replay.status, "replayed");
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), after);

  const currentPlan = planPipelineUpdateAlphaRef(root, "feat/sprint-nova-codex-v046");
  assert.equal(currentPlan.status, "current");
  assert.equal(currentPlan.applyAction.mutation, false);
  assert.deepEqual(transactionArtifacts(root), []);
});

test("alpha-ref apply refuses calibration drift and a forged or stale plan without writing (AC-1)", () => {
  const root = fixture("alpha-ref-drift", '{"pipelineUpdateAlphaRef":"feat/a"}\n');
  const plan = planPipelineUpdateAlphaRef(root, "feat/b");
  const drifted = "{\n  \"project\": \"consumer-drifted\"\n}\n";
  writeFileSync(join(root, "project", "pipeline.json"), drifted);
  assert.equal(applyAlphaRefPlan(root, plan).reason, "calibration-drift");
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), drifted);

  const forged = applyPipelineUpdateAlphaRef(root, {
    alphaRef: "feat/b",
    expectedCalibrationSha256: plan.preimageSha256,
    expectedPostimageSha256: plan.postimageSha256,
    planSha256: "f".repeat(64),
    activate: true,
  });
  assert.equal(forged.reason, "invalid-plan");
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), drifted);
});

test("alpha-ref plan refuses a duplicate top-level key without ever reaching a write (F1, AC-4)", () => {
  const before = '{"pipelineUpdateAlphaRef":"feat/a","pipelineUpdateAlphaRef":"feat/b"}\n';
  const root = fixture("alpha-ref-duplicate-write", before);
  const plan = planPipelineUpdateAlphaRef(root, "feat/c");
  assert.deepEqual(plan, {
    schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA,
    status: "unknown",
    reason: "malformed-configuration",
  });
  // What this actually pins: unlike the analogous apply-path assertion below
  // (AC-3), this byte-identity check does NOT discriminate a fixed version
  // from a broken one -- `planPipelineUpdateAlphaRef` has no write path in
  // ANY version of this module, guard or no guard, so the file is always
  // left untouched here regardless of whether the duplicate-key check exists.
  // It is a stable regression pin on plan's own no-write property (and on
  // the refusal reason), not evidence that the write path is guarded --
  // only `applyPipelineUpdateAlphaRef` can commit a write, so only its own
  // test below can prove that path refuses before writing.
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), before);
  assert.deepEqual(transactionArtifacts(root), []);
});

test("alpha-ref apply refuses a duplicate top-level key before any write, even with a correctly-computed digest binding (F1, AC-1/AC-2/AC-3)", () => {
  // applyPipelineUpdateAlphaRef is the only function in this module that can
  // commit a write, so this test -- not the plan-path one above -- is the
  // one that actually discriminates the fix from the pre-fix code. The
  // digest binding below is computed independently of the sanctioned plan
  // function (AC-2's "a caller that builds its own plan"): planPipelineUpdateAlphaRef
  // itself now refuses to plan against a duplicate-key file, so it can never
  // be the source of a binding that targets one. Both digests are real
  // hashes of the exact bytes on disk and of the exact postimage
  // fieldPostimage's first-occurrence splice would produce, so -- absent the
  // guard -- execution would reach atomicReplaceCalibration, commit that
  // splice, and only then compare readback.value.pipelineUpdateAlphaRef --
  // which JSON.parse resolves to the LAST occurrence, still "feat/b" -- so it
  // would return "readback-failed" with committed: true (finding F1's
  // committed-write-on-a-failed-report shape). Confirmed by temporarily
  // disabling the new guard: without it, this exact test fails with
  // reason "readback-failed" and committed: true, not "malformed-configuration".
  const duplicated = '{"pipelineUpdateAlphaRef":"feat/a","pipelineUpdateAlphaRef":"feat/b"}\n';
  const root = fixture("alpha-ref-duplicate-apply", duplicated);
  const postimage = duplicated.replace('"feat/a"', '"feat/c"');
  const preimageSha256 = sha256(duplicated);
  const postimageSha256 = sha256(postimage);
  const { planSha256 } = independentAlphaRefBinding(root, "feat/c", preimageSha256, postimageSha256);

  // AC-2: the refusal must happen even though this digest binding is
  // correctly computed -- that is the whole point.
  const applied = applyPipelineUpdateAlphaRef(root, {
    alphaRef: "feat/c",
    expectedCalibrationSha256: preimageSha256,
    expectedPostimageSha256: postimageSha256,
    planSha256,
    activate: true,
  });
  assert.deepEqual(applied, {
    schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA,
    status: "unknown",
    alphaRef: "feat/c",
    reason: "malformed-configuration",
  });
  // AC-3: the deliverable. The return value alone is not proof -- only the
  // byte-identity check below actually distinguishes "refused before
  // writing" from "wrote, then reported failure".
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), duplicated);
  assert.deepEqual(transactionArtifacts(root), []);
});

test("writing one field never touches the other, in either direction (AC-4)", () => {
  const before = '{"project":"self","pipelineUpdateChannel":"alpha","pipelineUpdateAlphaRef":"feat/keep"}\n';
  const rootA = fixture("ac4-alpha-ref-write", before);
  const alphaPlan = planPipelineUpdateAlphaRef(rootA, "feat/new");
  assert.equal(applyAlphaRefPlan(rootA, alphaPlan).status, "applied");
  assert.equal(readProjectPipelineUpdateChannel(rootA).updateChannel, "alpha");
  const afterAlphaWrite = readFileSync(join(rootA, "project", "pipeline.json"), "utf8");
  assert.match(afterAlphaWrite, /"pipelineUpdateChannel":"alpha"/);
  assert.equal(afterAlphaWrite, before.replace('"feat/keep"', '"feat/new"'));

  const rootB = fixture("ac4-channel-write", before);
  const channelPlan = planPipelineUpdateChannel(rootB, "beta");
  assert.equal(applyPlan(rootB, channelPlan).status, "applied");
  assert.equal(readProjectPipelineUpdateAlphaRef(rootB).alphaRef, "feat/keep");
  const afterChannelWrite = readFileSync(join(rootB, "project", "pipeline.json"), "utf8");
  assert.match(afterChannelWrite, /"pipelineUpdateAlphaRef":"feat\/keep"/);
  assert.equal(afterChannelWrite, before.replace('"pipelineUpdateChannel":"alpha"', '"pipelineUpdateChannel":"beta"'));
});

test("alpha-ref writer refuses empty, whitespace-only, and structurally invalid values with a distinct reason matching the reader (AC-5)", () => {
  const root = fixture("ac5-invalid");
  for (const badRef of ["", "   ", "/leading-slash", "trailing-slash/", "has space", "-leading-dash"]) {
    assert.equal(isPipelineUpdateAlphaRef(badRef), false, `reader validator must already reject ${JSON.stringify(badRef)}`);
    const plan = planPipelineUpdateAlphaRef(root, badRef);
    assert.equal(plan.status, "unknown");
    assert.equal(plan.reason, "invalid-alpha-ref");
  }
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), "{\n  \"project\": \"consumer\"\n}\n");

  const applyInvalid = applyPipelineUpdateAlphaRef(root, {
    alphaRef: "",
    expectedCalibrationSha256: "a".repeat(64),
    expectedPostimageSha256: "b".repeat(64),
    planSha256: "c".repeat(64),
    activate: true,
  });
  assert.equal(applyInvalid.reason, "invalid-alpha-ref");
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), "{\n  \"project\": \"consumer\"\n}\n");
});

test("CLI rejects supplying both --channel and --alpha-ref, and accepts --alpha-ref alone (AC-2)", () => {
  const root = fixture("ac2-cli");
  const both = spawnSync(process.execPath, [
    fileURLToPath(new URL("./pipeline-update-channel.mjs", import.meta.url)),
    "plan", "--repo", root, "--channel", "beta", "--alpha-ref", "feat/x",
  ], { encoding: "utf8" });
  assert.notEqual(both.status, 0);

  const alphaOnly = spawnSync(process.execPath, [
    fileURLToPath(new URL("./pipeline-update-channel.mjs", import.meta.url)),
    "plan", "--repo", root, "--alpha-ref", "feat/sprint-alfred",
  ], { encoding: "utf8" });
  assert.equal(alphaOnly.status, 0);
  const parsed = JSON.parse(alphaOnly.stdout);
  assert.equal(parsed.schema, PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA);
  assert.equal(parsed.alphaRef, "feat/sprint-alfred");
});

test("CLI readback exposes alphaRef alongside channel, additive to the existing output contract (AC-3)", () => {
  const root = fixture("ac3-readback", '{"pipelineUpdateChannel":"beta","pipelineUpdateAlphaRef":"feat/sprint-alfred"}\n');
  const output = spawnSync(process.execPath, [
    fileURLToPath(new URL("./pipeline-update-channel.mjs", import.meta.url)),
    "readback", "--repo", root,
  ], { encoding: "utf8" });
  assert.equal(output.status, 0);
  const parsed = JSON.parse(output.stdout);
  // Existing top-level channel-readback contract is untouched.
  assert.deepEqual(
    { status: parsed.status, updateChannel: parsed.updateChannel, source: parsed.source, reason: parsed.reason },
    { status: "ready", updateChannel: "beta", source: "project-config", reason: null },
  );
  // Additive: the full alpha-ref reader result nested under its own key.
  assert.deepEqual(parsed.alphaRef, {
    status: "ready", alphaRef: "feat/sprint-alfred", source: "project-config", reason: null,
  });
});

test("CLI readback exits non-zero when the alpha ref is unknown even though the channel is valid (F2)", () => {
  const root = fixture("readback-alpha-unknown", '{"pipelineUpdateChannel":"beta","pipelineUpdateAlphaRef":123}\n');
  const output = spawnSync(process.execPath, [
    fileURLToPath(new URL("./pipeline-update-channel.mjs", import.meta.url)),
    "readback", "--repo", root,
  ], { encoding: "utf8" });
  assert.notEqual(output.status, 0);
  // The JSON payload shape is unchanged -- only the exit code differs. The
  // channel side stays fully valid; only the alpha-ref side is broken.
  const parsed = JSON.parse(output.stdout);
  assert.equal(parsed.status, "ready");
  assert.equal(parsed.updateChannel, "beta");
  assert.equal(parsed.source, "project-config");
  assert.equal(parsed.reason, null);
  assert.deepEqual(parsed.alphaRef, {
    status: "unknown", alphaRef: null, source: "project-config", reason: "invalid-alpha-ref",
  });
});

test("fix: an invalid pre-existing pipelineUpdateChannel value no longer blocks an unrelated alpha-ref plan/apply (NVA-B-ALPHADECOUPLE-1)", () => {
  const root = fixture("entangled-invalid-channel", '{"pipelineUpdateChannel":"main"}\n');
  const plan = planPipelineUpdateAlphaRef(root, "feat/unrelated");
  assert.equal(plan.status, "ready");
  assert.equal(plan.reason, undefined);
  const applied = applyAlphaRefPlan(root, plan);
  assert.equal(applied.status, "applied");
  const after = readFileSync(join(root, "project", "pipeline.json"), "utf8");
  assert.match(after, /"pipelineUpdateAlphaRef":"feat\/unrelated"/);
  // The unrelated, still-invalid channel value is untouched by the write.
  assert.match(after, /"pipelineUpdateChannel":"main"/);
});

test("fix: an invalid pre-existing pipelineUpdateAlphaRef value never names the alpha-ref field when the caller only operates on the channel (NVA-B-ALPHADECOUPLE-1)", () => {
  const root = fixture("entangled-invalid-alpha-ref", '{"pipelineUpdateAlphaRef":"has space"}\n');
  const plan = planPipelineUpdateChannel(root, "beta");
  assert.equal(plan.status, "ready");
  assert.equal(plan.reason, undefined);
  assert.equal(applyPlan(root, plan).status, "applied");
  const after = readFileSync(join(root, "project", "pipeline.json"), "utf8");
  assert.match(after, /"pipelineUpdateChannel":"beta"/);
  // The unrelated, still-invalid alpha-ref value is untouched by the write.
  assert.match(after, /"pipelineUpdateAlphaRef":"has space"/);
});

test("fix: a genuine alpha-ref problem still refuses with an alpha-ref reason code, decoupling did not remove validation (NVA-B-ALPHADECOUPLE-1)", () => {
  const root = fixture("still-refuses-alpha-ref", '{"pipelineUpdateAlphaRef":"has space"}\n');
  const plan = planPipelineUpdateAlphaRef(root, "feat/new");
  assert.equal(plan.status, "ready"); // the field being targeted is validated against the REQUESTED value only
  // The reader surfaces the pre-existing bad value with its own reason code.
  assert.equal(readProjectPipelineUpdateAlphaRef(root).reason, "invalid-alpha-ref");
  const badTarget = planPipelineUpdateAlphaRef(root, "has space");
  assert.equal(badTarget.status, "unknown");
  assert.equal(badTarget.reason, "invalid-alpha-ref");
});

test("unchanged: an invalid pipelineUpdateChannel value still blocks a channel operation, at plan, readback, and apply (NVA-B-ALPHADECOUPLE-1)", () => {
  const before = '{"pipelineUpdateChannel":"main"}\n';
  const root = fixture("channel-still-blocks-channel", before);
  assert.equal(planPipelineUpdateChannel(root, "stable").reason, "invalid-channel");
  assert.equal(readProjectPipelineUpdateChannel(root).status, "unknown");
  assert.equal(readProjectPipelineUpdateChannel(root).reason, "invalid-channel");

  // Apply's own guard, exercised directly with a genuinely self-consistent
  // digest binding (AC-2's "a caller that builds its own plan") -- proves
  // apply refuses even though planPipelineUpdateChannel itself can never be
  // the source of this exact binding (it refuses to plan against this file).
  const postimage = before.replace('"main"', '"stable"');
  const preimageSha256 = sha256(before);
  const postimageSha256 = sha256(postimage);
  const { planSha256 } = independentChannelBinding(root, "stable", preimageSha256, postimageSha256);
  const applied = applyPipelineUpdateChannel(root, {
    channel: "stable",
    expectedCalibrationSha256: preimageSha256,
    expectedPostimageSha256: postimageSha256,
    planSha256,
    activate: true,
  });
  assert.equal(applied.reason, "invalid-channel");
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), before);
});

test("duplicate-key detection is symmetric: a duplicated pipelineUpdateChannel key refuses only channel operations, not an unrelated alpha-ref plan/apply (NVA-B-ALPHADECOUPLE-1)", () => {
  const before = '{"pipelineUpdateChannel":"beta","pipelineUpdateChannel":"stable"}\n';
  const root = fixture("channel-duplicate-key", before);
  assert.equal(planPipelineUpdateChannel(root, "alpha").reason, "malformed-configuration");
  assert.equal(readProjectPipelineUpdateChannel(root).reason, "malformed-configuration");
  const applied = applyPipelineUpdateChannel(root, {
    channel: "alpha",
    expectedCalibrationSha256: "a".repeat(64),
    expectedPostimageSha256: "b".repeat(64),
    planSha256: "c".repeat(64),
    activate: true,
  });
  assert.equal(applied.reason, "invalid-plan"); // digest binding never matches a forged plan
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), before);

  // The unrelated alpha-ref field is fully writable despite the duplicated
  // channel key elsewhere in the same file.
  const plan = planPipelineUpdateAlphaRef(root, "feat/unrelated");
  assert.equal(plan.status, "ready");
  assert.equal(applyAlphaRefPlan(root, plan).status, "applied");
  const after = readFileSync(join(root, "project", "pipeline.json"), "utf8");
  assert.match(after, /"pipelineUpdateAlphaRef":"feat\/unrelated"/);
});

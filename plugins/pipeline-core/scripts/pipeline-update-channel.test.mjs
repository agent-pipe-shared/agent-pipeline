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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJsonForTest(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonForTest).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonForTest(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Builds a self-consistent digest binding without going through
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

test("legacy alpha-ref is readable but its exported writers refuse without mutation", () => {
  const before = JSON.stringify({ pipelineUpdateAlphaRef: "feat/legacy" }) + "\n";
  const root = fixture("retired-alpha-ref", before);
  assert.equal(readProjectPipelineUpdateAlphaRef(root).alphaRef, "feat/legacy");
  assert.deepEqual(planPipelineUpdateAlphaRef(root, "main"), {
    schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA, status: "unknown", reason: "alpha-ref-retired",
  });
  assert.deepEqual(applyPipelineUpdateAlphaRef(root, {
    alphaRef: "main", activate: true,
    expectedCalibrationSha256: "a".repeat(64),
    expectedPostimageSha256: "b".repeat(64),
    planSha256: "c".repeat(64),
  }), {
    schema: PIPELINE_UPDATE_ALPHA_REF_PLAN_SCHEMA, status: "unknown",
    alphaRef: "main", reason: "alpha-ref-retired",
  });
  assert.equal(readFileSync(join(root, "project", "pipeline.json"), "utf8"), before);
  assert.deepEqual(transactionArtifacts(root), []);
});

test("CLI rejects retired alpha-ref writes while channel planning works", () => {
  const root = fixture("retired-alpha-cli");
  const script = fileURLToPath(new URL("./pipeline-update-channel.mjs", import.meta.url));
  for (const args of [
    ["plan", "--repo", root, "--alpha-ref", "main"],
    ["apply", "--repo", root, "--alpha-ref", "main", "--activate"],
    ["plan", "--repo", root, "--channel", "alpha", "--alpha-ref", "main"],
  ]) {
    const output = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(output.status, 64);
    assert.match(output.stderr, /--channel/);
  }
  const channel = spawnSync(process.execPath, [script, "plan", "--repo", root, "--channel", "alpha"], { encoding: "utf8" });
  assert.equal(channel.status, 0);
  assert.equal(JSON.parse(channel.stdout).schema, PIPELINE_UPDATE_CHANNEL_PLAN_SCHEMA);
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

// AM-W-T2 (Critic AM-D1, dispatcher rulings 50 and 55; design note agy-snapshot-central-2026-10-08 section 3, "the update verb
// calls publish then refresh at the host boundary (skipped when no agy CLI is found)"): pins that the update verb is a caller
// of the per-user central agy snapshot. Test-only; the structural pin is expected RED until the AM-W wiring slice lands, and
// the behaviour cases are todo until that slice exposes an injectable seam (the real agy CLI and the real home are never touched).
function amW2CodeOf(url) {
  return readFileSync(url, "utf8").split(/\r?\n/u).filter((line) => !/^\s*(?:\/\/|\/\*|\*)/u.test(line)).join("\n");
}

test("AM-W-T2: pipeline-update-channel.mjs imports applyAgyCentralSnapshotAfterUpdate from the central refresh module and calls it (structural stand-in)", () => {
  const code = amW2CodeOf(new URL("./pipeline-update-channel.mjs", import.meta.url));
  assert.match(code, /import\s*\{[^}]*\bapplyAgyCentralSnapshotAfterUpdate\b[^}]*\}\s*from\s*["']\.\.\/lib\/agy-central-refresh\.mjs["']/u);
  assert.match(code, /\bapplyAgyCentralSnapshotAfterUpdate\s*\(/u);
});

test("AM-W-T2: applyAgyCentralSnapshotAfterUpdate is called after a successful update", (t) => {
  t.todo("missing seam: the update entry must accept an injectable applyAgyCentralSnapshotAfterUpdate (or its resolveCliPath and runCli) before this call can be pinned against a fixture project and a fixture config root without resolving the real agy CLI by PATH or touching the real home. The wiring slice must provide that seam; the case then asserts exactly one call, strictly after the update was applied, and no call when the update itself did not apply.");
});

test("AM-W-T2: a refused agy refresh is reported in the update result and does not fail the update", (t) => {
  t.todo("missing seam: same injectable seam as the case above, here with a refusing refresh (for example status refused with an ATR- reason). The wiring slice must expose the refusal in the update result and leave the update status, exit code and the already written project calibration unchanged; an absent agy CLI (status skipped, AGY-CLI-ABSENT) must also leave the update untouched.");
});

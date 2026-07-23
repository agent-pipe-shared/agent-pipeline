#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  activatePrivateOverlayRuntimeProjection,
  planPrivateOverlayRuntimeProjection,
} from "./private-overlay-runtime-projection.mjs";
import { validatePrivateOverlayActivation } from "./private-overlay-activation.mjs";
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "./runtime-projection-v3.mjs";

const runtimePaths = loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path);

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function scalar(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  throw new Error("unsupported scalar");
}
function yaml(value, indent = "") {
  return Object.entries(value).map(([key, child]) => {
    if (Array.isArray(child)) return `${indent}${key}:\n${child.map((item) => (item && typeof item === "object") ? `${indent}  -\n${yaml(item, `${indent}    `)}` : `${indent}  - ${scalar(item)}\n`).join("")}`;
    if (child && typeof child === "object") return `${indent}${key}:\n${yaml(child, `${indent}  `)}`;
    return `${indent}${key}: ${scalar(child)}\n`;
  }).join("");
}
function intent() {
  const registry = loadRunnerProfilesV3Registry();
  return {
    schema: "pipeline.user.v3",
    language: { human_facing: "de", agent_facing: "en" },
    agent_runtime: "other",
    runners: { enabled: ["claude", "codex"], default: "codex" },
    routing: clone({ profiles: registry.profiles, duties: registry.duties }),
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
    critic_export: clone(registry.criticExportPolicy),
    roles: { po: { display_label: "PO" } },
    session: { keep_awake: true },
    advisor_export: { consent: "approved" },
  };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "private-overlay-projection-test-"));
  const source = yaml(intent());
  writeFileSync(join(root, "pipeline.user.yaml"), source);
  return { root, source };
}
function write(root, relative, bytes) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
function activationEvidence(source) {
  const digest = sha256("fixture");
  return {
    schema: "pipeline.private-overlay-activation-evidence.v1",
    status: "ready",
    reasonCodes: ["SNT-A-VALIDATED"],
    candidate: {
      repositorySha256: digest,
      branchSha256: digest,
      commit: "a".repeat(40),
      tree: "b".repeat(40),
    },
    plugin: {
      name: "pipeline-core",
      version: "0.2.0+test",
      manifestSha256: digest,
      contentSha256: sha256("complete installed plugin fixture"),
    },
    inputs: {
      sourceSha256: sha256(source),
      lockSha256: digest,
      admittedSetSha256: digest,
      admittedFileSha256: [digest, digest],
    },
    admittedCounts: { policies: 1, guidelines: 1, templates: 0, extensions: 0, total: 2 },
  };
}

test("accepts the exact ready evidence shape returned by A1", () => {
  const { root, source } = fixture();
  const digest = sha256("real A1 compatibility fixture");
  const selectedCandidate = {
    repository: "https://example.invalid/public-core.git",
    branch: "main",
    commit: "a".repeat(40),
    tree: "b".repeat(40),
  };
  const installedPlugin = {
    name: "pipeline-core",
    version: "0.2.0+test",
    manifestSha256: digest,
    contentSha256: sha256("complete installed plugin fixture"),
  };
  try {
    const overlay = join(root, ".agent-pipeline");
    mkdirSync(overlay);
    writeFileSync(join(overlay, "core.lock.json"), `${JSON.stringify({
      $schema: "pipeline.core-lock.v1",
      source: selectedCandidate,
      plugin: {
        name: installedPlugin.name,
        version: installedPlugin.version,
        manifest_sha256: installedPlugin.manifestSha256,
      },
    }, null, 2)}\n`);
    for (const className of ["policies", "guidelines", "templates", "extensions"]) {
      mkdirSync(join(overlay, className));
    }
    const evidence = validatePrivateOverlayActivation({
      overlayRoot: root,
      selectedCandidate,
      installedPlugin,
    });
    assert.equal(evidence.status, "ready", JSON.stringify(evidence));
    assert.deepEqual(evidence.plugin, installedPlugin);
    assert.equal(evidence.inputs.sourceSha256, sha256(source));
    const review = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: evidence });
    assert.equal(review.status, "ready", JSON.stringify(review));
    assert.match(review.activationEvidenceSha256, /^[0-9a-f]{64}$/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("full installed content identity changes the canonical evidence and plan bindings", () => {
  const { root, source } = fixture();
  try {
    const firstEvidence = activationEvidence(source);
    const secondEvidence = activationEvidence(source);
    secondEvidence.plugin.contentSha256 = "9".repeat(64);
    const first = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: firstEvidence });
    const second = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: secondEvidence });
    assert.equal(first.status, "ready");
    assert.equal(second.status, "ready");
    assert.notEqual(first.activationEvidenceSha256, second.activationEvidenceSha256);
    assert.notEqual(first.planSha256, second.planSha256);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ready plan is sanitized, digest-bound, and performs no writes", () => {
  const { root, source } = fixture();
  try {
    const review = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: activationEvidence(source) });
    assert.equal(review.status, "ready");
    assert.match(review.planSha256, /^[a-f0-9]{64}$/u);
    assert.equal(review.changeCount, runtimePaths.length);
    assert.ok(review.targets.filter((target) => target.kind === "runtime").every((target) => target.before.status === "absent"));
    assert.equal(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), source);
    assert.equal(existsSync(join(root, ".claude")), false);
    assert.equal(existsSync(join(root, ".codex")), false);
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v3")), false);
    const serialized = JSON.stringify(review);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes(source), false);
    assert.equal(serialized.includes("diagnostic"), false);
    assert.equal(serialized.includes(".agent-pipeline"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("successful activation consumes the exact reviewed plan and replay fails closed", () => {
  const { root, source } = fixture();
  try {
    const review = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: activationEvidence(source) });
    const missingActivation = activatePrivateOverlayRuntimeProjection(review, {
      overlayRoot: root,
      expectedPlanSha256: review.planSha256,
    });
    assert.equal(missingActivation.reasonCodes[0], "SNT-A-PROJECTION-ACTIVATION-REQUIRED");
    const applied = activatePrivateOverlayRuntimeProjection(review, {
      overlayRoot: root,
      activate: true,
      expectedPlanSha256: review.planSha256,
    });
    assert.equal(applied.status, "applied");
    assert.equal(applied.planSha256, review.planSha256);
    assert.ok(runtimePaths.every((path) => existsSync(join(root, path))));
    const replay = activatePrivateOverlayRuntimeProjection(review, {
      overlayRoot: root,
      activate: true,
      expectedPlanSha256: review.planSha256,
    });
    assert.equal(replay.reasonCodes[0], "SNT-A-PROJECTION-REPLAY");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("wrong, cloned, changed, and digest-mismatched reviews are rejected", () => {
  const { root, source } = fixture();
  try {
    const review = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: activationEvidence(source) });
    const options = { overlayRoot: root, activate: true, expectedPlanSha256: review.planSha256 };
    assert.equal(activatePrivateOverlayRuntimeProjection({}, options).reasonCodes[0], "SNT-A-PROJECTION-REVIEW-INVALID");
    assert.equal(activatePrivateOverlayRuntimeProjection(clone(review), options).reasonCodes[0], "SNT-A-PROJECTION-REVIEW-INVALID");
    assert.equal(activatePrivateOverlayRuntimeProjection(review, { ...options, expectedPlanSha256: "0".repeat(64) }).reasonCodes[0], "SNT-A-PROJECTION-DIGEST-MISMATCH");
    review.changeCount += 1;
    assert.equal(activatePrivateOverlayRuntimeProjection(review, options).reasonCodes[0], "SNT-A-PROJECTION-REVIEW-INVALID");
    assert.equal(existsSync(join(root, ".claude")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("activation rechecks the unchanged admission evidence object", () => {
  const { root, source } = fixture();
  try {
    const evidence = activationEvidence(source);
    const review = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: evidence });
    evidence.inputs.lockSha256 = "c".repeat(64);
    const result = activatePrivateOverlayRuntimeProjection(review, {
      overlayRoot: root,
      activate: true,
      expectedPlanSha256: review.planSha256,
    });
    assert.equal(result.reasonCodes[0], "SNT-A-PROJECTION-REVIEW-INVALID");
    assert.equal(existsSync(join(root, ".claude")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("source drift is rejected and sanitized by the authenticated native apply", () => {
  const { root, source } = fixture();
  try {
    const review = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: activationEvidence(source) });
    writeFileSync(join(root, "pipeline.user.yaml"), `${source}\nprivate-drift-sentinel\n`);
    const result = activatePrivateOverlayRuntimeProjection(review, {
      overlayRoot: root,
      activate: true,
      expectedPlanSha256: review.planSha256,
    });
    assert.equal(result.status, "rejected");
    assert.equal(result.reasonCodes[0], "SNT-A-PROJECTION-APPLY-REJECTED");
    assert.equal(JSON.stringify(result).includes(root), false);
    assert.equal(JSON.stringify(result).includes("private-drift-sentinel"), false);
    assert.equal(existsSync(join(root, ".claude")), false);
    assert.equal(activatePrivateOverlayRuntimeProjection(review, {
      overlayRoot: root,
      activate: true,
      expectedPlanSha256: review.planSha256,
    }).reasonCodes[0], "SNT-A-PROJECTION-REPLAY");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a freshly admitted current projection plans and activates as noop", () => {
  const { root, source } = fixture();
  try {
    const first = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: activationEvidence(source) });
    assert.equal(activatePrivateOverlayRuntimeProjection(first, {
      overlayRoot: root,
      activate: true,
      expectedPlanSha256: first.planSha256,
    }).status, "applied");

    const currentSource = readFileSync(join(root, "pipeline.user.yaml"), "utf8");
    const review = planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: activationEvidence(currentSource) });
    assert.equal(review.status, "noop");
    assert.equal(review.changeCount, 0);
    const applied = activatePrivateOverlayRuntimeProjection(review, {
      overlayRoot: root,
      activate: true,
      expectedPlanSha256: review.planSha256,
    });
    assert.equal(applied.status, "noop");
    assert.equal(applied.sourceCommittedLast, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("malformed or source-mismatched activation evidence is rejected before planning", () => {
  const { root, source } = fixture();
  try {
    const malformed = activationEvidence(source);
    malformed.admittedCounts.total = 3;
    let planned = false;
    assert.equal(planPrivateOverlayRuntimeProjection(
      { overlayRoot: root, activationEvidence: malformed },
      { planMigration: () => { planned = true; throw new Error("must not plan"); } },
    ).reasonCodes[0], "SNT-A-PROJECTION-EVIDENCE-INVALID");
    assert.equal(planned, false);
    for (const mutatePlugin of [
      (plugin) => { delete plugin.contentSha256; },
      (plugin) => { plugin.contentSha256 = "invalid"; },
      (plugin) => { plugin.extraContentIdentity = "0".repeat(64); },
    ]) {
      const invalidPluginEvidence = activationEvidence(source);
      mutatePlugin(invalidPluginEvidence.plugin);
      let invalidPluginPlanned = false;
      const invalidPlugin = planPrivateOverlayRuntimeProjection(
        { overlayRoot: root, activationEvidence: invalidPluginEvidence },
        { planMigration: () => { invalidPluginPlanned = true; throw new Error("must not plan"); } },
      );
      assert.equal(invalidPlugin.reasonCodes[0], "SNT-A-PROJECTION-EVIDENCE-INVALID");
      assert.equal(invalidPluginPlanned, false);
    }
    const mismatch = activationEvidence(source);
    mismatch.inputs.sourceSha256 = "0".repeat(64);
    assert.equal(planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: mismatch }).reasonCodes[0], "SNT-A-PROJECTION-SOURCE-MISMATCH");
    const hostile = new Proxy({}, { ownKeys() { throw new Error("private proxy detail"); } });
    assert.equal(planPrivateOverlayRuntimeProjection({ overlayRoot: root, activationEvidence: hostile }).reasonCodes[0], "SNT-A-PROJECTION-EVIDENCE-INVALID");
    assert.equal(existsSync(join(root, ".claude")), false);
    assert.equal(existsSync(join(root, ".codex")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

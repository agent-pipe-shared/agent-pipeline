#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readPrivateOverlayBootstrapStatus } from "./private-overlay-bootstrap-status.mjs";
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";

const SHA = "a".repeat(64);
const PLAN_SHA = "b".repeat(64);
const CANDIDATE = Object.freeze({
  repository: "https://example.invalid/public/core.git",
  branch: "feature/neutral",
  commit: "1".repeat(40),
  tree: "2".repeat(40),
});
const PLUGIN = Object.freeze({
  name: "pipeline-core",
  version: "1.2.3+fixture",
  manifestSha256: "3".repeat(64),
  contentSha256: "4".repeat(64),
});
const OBSERVATION = Object.freeze({
  schema: "pipeline.public-core-observation.v1",
  status: "ready",
  candidate: CANDIDATE,
  plugin: PLUGIN,
});

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
    routing: { profiles: JSON.parse(JSON.stringify(registry.profiles)), duties: JSON.parse(JSON.stringify(registry.duties)) },
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 300 },
    critic_export: JSON.parse(JSON.stringify(registry.criticExportPolicy)),
    roles: { po: { display_label: "PO" } },
    session: { keep_awake: true },
    advisor_export: { consent: "approved" },
  };
}
function lock() {
  return {
    $schema: "pipeline.core-lock.v1",
    source: CANDIDATE,
    plugin: { name: PLUGIN.name, version: PLUGIN.version, manifest_sha256: PLUGIN.manifestSha256 },
  };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "private-overlay-bootstrap-status-"));
  writeFileSync(join(root, "pipeline.user.yaml"), yaml(intent()));
  mkdirSync(join(root, ".agent-pipeline"));
  writeFileSync(join(root, ".agent-pipeline", "core.lock.json"), `${JSON.stringify(lock(), null, 2)}\n`);
  for (const className of ["policies", "guidelines", "templates", "extensions"]) mkdirSync(join(root, ".agent-pipeline", className));
  writeFileSync(join(root, ".agent-pipeline", "policies", "neutral.md"), "private neutral policy\n");
  return root;
}
function request(root, consumeInputs = () => {}) {
  return {
    overlayRoot: root,
    sourcePluginRoot: "/source/plugins/pipeline-core",
    installedPluginRoot: "/installed/pipeline-core",
    consumeInputs,
  };
}
function evidence() {
  return {
    schema: "pipeline.private-overlay-activation-evidence.v1",
    status: "ready",
    reasonCodes: ["SNT-A-VALIDATED"],
    candidate: { repositorySha256: SHA, branchSha256: SHA, commit: CANDIDATE.commit, tree: CANDIDATE.tree },
    plugin: { ...PLUGIN },
    inputs: { sourceSha256: SHA, lockSha256: SHA, admittedSetSha256: SHA, admittedFileSha256: [SHA] },
    admittedCounts: { policies: 1, guidelines: 0, templates: 0, extensions: 0, total: 1 },
  };
}
function plan(status) { return { schema: "pipeline.private-overlay-runtime-projection-plan.v1", status, planSha256: PLAN_SHA }; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function profile(ok = true, sourceSha256 = SHA) {
  return ok ? {
    ok: true,
    code: "PO-PROFILE-AUTHORITY-VALID",
    value: {
      schema: "pipeline.po-gate-authority-evidence.v1",
      humanFacing: "de",
      sourceSha256,
      runtimeSha256: "6".repeat(64),
      receiptSha256: "7".repeat(64),
      repositoryFingerprint: "8".repeat(64),
    },
  } : { ok: false, code: "PO-PROFILE-RECEIPT-STALE" };
}
function consumed() {
  return {
    schema: "pipeline.private-overlay-activation-evidence.v1",
    status: "consumed",
    reasonCodes: ["SNT-A-PRIVATE-INPUTS-CONSUMED"],
    admittedCounts: { policies: 1, guidelines: 0, templates: 0, extensions: 0, total: 1 },
  };
}

test("real admission and projection report activation-required without writes or consumption", () => {
  const root = fixture();
  try {
    let consumedInputs = false;
    const before = readFileSync(join(root, "pipeline.user.yaml"), "utf8");
    const result = readPrivateOverlayBootstrapStatus(request(root, () => { consumedInputs = true; }), {
      observe: () => OBSERVATION,
    });
    assert.equal(result.status, "activation-required");
    assert.deepEqual(result.reasonCodes, ["SNT-A-RUNTIME-PROJECTION-REQUIRED"]);
    assert.match(result.planSha256, /^[a-f0-9]{64}$/u);
    assert.equal(result.plugin.contentSha256, PLUGIN.contentSha256);
    assert.equal(consumedInputs, false);
    assert.equal(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), before);
    assert.equal(readFileSync(join(root, ".agent-pipeline/policies/neutral.md"), "utf8"), "private neutral policy\n");
    assert.equal(existsSync(join(root, ".claude")), false);
    assert.equal(existsSync(join(root, ".codex")), false);
    assert.equal(existsSync(join(root, ".pipeline-runner-profile-migration-v3")), false);
    assert.equal(JSON.stringify(result).includes(root), false);
    assert.equal(JSON.stringify(result).includes("private neutral policy"), false);
    assert.equal(Object.hasOwn(result, "targets"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("noop with stale profile reports activation-required and does not consume", () => {
  let consumedCalled = false;
  const result = readPrivateOverlayBootstrapStatus(request("/overlay"), {
    observe: () => OBSERVATION,
    admit: () => evidence(),
    plan: () => plan("noop"),
    profile: () => profile(false),
    consume: () => { consumedCalled = true; },
  });
  assert.equal(result.status, "activation-required");
  assert.deepEqual(result.reasonCodes, ["SNT-A-PO-PROFILE-READBACK-REQUIRED"]);
  assert.deepEqual(result.profile, { status: "invalid", code: "PO-PROFILE-RECEIPT-STALE" });
  assert.equal(consumedCalled, false);
});

test("noop with valid profile consumes the exact authenticated admission and reports activated", () => {
  const root = fixture();
  try {
    let observedBatch;
    const sourceSha256 = sha256(readFileSync(join(root, "pipeline.user.yaml")));
    const result = readPrivateOverlayBootstrapStatus(request(root, (batch) => { observedBatch = batch; }), {
      observe: () => OBSERVATION,
      plan: () => plan("noop"),
      profile: () => profile(true, sourceSha256),
    });
    assert.equal(result.status, "activated");
    assert.deepEqual(result.reasonCodes, ["SNT-A-PRIVATE-OVERLAY-ACTIVATED"]);
    assert.equal(result.planSha256, PLAN_SHA);
    assert.equal(result.profile.humanFacing, "de");
    assert.equal(result.profile.receiptSha256, "7".repeat(64));
    assert.equal(observedBatch.length, 1);
    assert.equal(observedBatch[0].privateName, "neutral.md");
    const output = JSON.stringify(result);
    assert.equal(output.includes(root), false);
    assert.equal(output.includes("neutral.md"), false);
    assert.equal(output.includes("private neutral policy"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("observer, admission, plan and profile throws or rejections are sanitized and stop the chain", () => {
  const secret = "/private/secret/path private-input.md";
  const stages = [
    { key: "observe", value: () => { throw new Error(secret); }, expected: "SNT-A-BOOTSTRAP-OBSERVATION-REJECTED" },
    { key: "observe", value: () => ({ status: "rejected", reasonCodes: ["SNT-A2-SOURCE-DIRTY"], detail: secret }), expected: "SNT-A2-SOURCE-DIRTY" },
    { key: "admit", value: () => ({ status: "rejected", reasonCodes: ["SNT-A-LOCK-MALFORMED"], detail: secret }), expected: "SNT-A-LOCK-MALFORMED" },
    { key: "plan", value: () => ({ status: "rejected", reasonCodes: ["SNT-A-PROJECTION-INVALID-BASELINE"], detail: secret }), expected: "SNT-A-PROJECTION-INVALID-BASELINE" },
    { key: "profile", value: () => { throw new Error(secret); }, expected: "SNT-A-BOOTSTRAP-PROFILE-REJECTED", noop: true },
  ];
  for (const stage of stages) {
    const deps = {
      observe: () => OBSERVATION,
      admit: () => evidence(),
      plan: () => plan(stage.noop ? "noop" : "ready"),
      profile: () => profile(true),
      consume: () => assert.fail("must not consume"),
      [stage.key]: stage.value,
    };
    const result = readPrivateOverlayBootstrapStatus(request("/overlay"), deps);
    assert.equal(result.status, "rejected");
    assert.equal(result.reasonCodes[0], stage.expected);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test("consumer failure, async callback and forged consume success never report activated", () => {
  const root = fixture();
  try {
    const sourceSha256 = sha256(readFileSync(join(root, "pipeline.user.yaml")));
    for (const [consumeInputs, expected] of [
      [() => { throw new Error("private consumer detail"); }, "SNT-A-CONSUMER-FAILED"],
      [() => Promise.resolve(), "SNT-A-CONSUMER-ASYNC"],
    ]) {
      const result = readPrivateOverlayBootstrapStatus(request(root, consumeInputs), {
        observe: () => OBSERVATION,
        plan: () => plan("noop"),
        profile: () => profile(true, sourceSha256),
      });
      assert.equal(result.status, "rejected");
      assert.equal(result.reasonCodes[0], expected);
      assert.equal(JSON.stringify(result).includes("private consumer detail"), false);
    }
    const forged = readPrivateOverlayBootstrapStatus(request(root), {
      observe: () => OBSERVATION,
      admit: () => evidence(),
      plan: () => plan("noop"),
      profile: () => profile(true),
      consume: () => consumed(),
    });
    assert.equal(forged.status, "rejected");
    assert.equal(forged.reasonCodes[0], "SNT-A-BOOTSTRAP-CONSUME-REJECTED");

    const ignoredAsync = readPrivateOverlayBootstrapStatus(request(root, () => Promise.resolve()), {
      observe: () => OBSERVATION,
      admit: () => evidence(),
      plan: () => plan("noop"),
      profile: () => profile(true),
      consume: (_evidence, callback) => { callback([]); return consumed(); },
    });
    assert.equal(ignoredAsync.status, "rejected");
    assert.equal(ignoredAsync.reasonCodes[0], "SNT-A-CONSUMER-ASYNC");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("malformed input, dependencies, profile codes and callback multiplicity fail closed", () => {
  assert.equal(readPrivateOverlayBootstrapStatus().reasonCodes[0], "SNT-A-BOOTSTRAP-INPUT-INVALID");
  assert.equal(readPrivateOverlayBootstrapStatus({ ...request("/overlay"), extra: true }).reasonCodes[0], "SNT-A-BOOTSTRAP-INPUT-INVALID");
  assert.equal(readPrivateOverlayBootstrapStatus(request("/overlay"), { unexpected: () => {} }).reasonCodes[0], "SNT-A-BOOTSTRAP-INPUT-INVALID");

  const stale = readPrivateOverlayBootstrapStatus(request("/overlay"), {
    observe: () => OBSERVATION,
    admit: () => evidence(),
    plan: () => plan("noop"),
    profile: () => ({ ok: false, code: "/private/profile/path" }),
  });
  assert.deepEqual(stale.profile, { status: "invalid", code: "PO-PROFILE-AUTHORITY-INVALID" });

  const multiple = readPrivateOverlayBootstrapStatus(request("/overlay"), {
    observe: () => OBSERVATION,
    admit: () => evidence(),
    plan: () => plan("noop"),
    profile: () => profile(true),
    consume: (_evidence, callback) => { callback([]); callback([]); return consumed(); },
  });
  assert.equal(multiple.status, "rejected");
  assert.equal(multiple.reasonCodes[0], "SNT-A-BOOTSTRAP-CONSUME-REJECTED");

  const mismatchedProfile = readPrivateOverlayBootstrapStatus(request("/overlay"), {
    observe: () => OBSERVATION,
    admit: () => evidence(),
    plan: () => plan("noop"),
    profile: () => ({ ...profile(true), value: { ...profile(true).value, sourceSha256: "9".repeat(64) } }),
  });
  assert.equal(mismatchedProfile.status, "rejected");
  assert.equal(mismatchedProfile.reasonCodes[0], "SNT-A-BOOTSTRAP-PROFILE-BINDING-MISMATCH");
});

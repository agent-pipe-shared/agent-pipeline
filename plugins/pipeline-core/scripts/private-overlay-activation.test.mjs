#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { main } from "./private-overlay-activation.mjs";

let symlinkCapable = true;
{
  const probeDir = mkdtempSync(join(tmpdir(), "private-overlay-activation-symlink-probe-"));
  try { writeFileSync(join(probeDir, "target"), "x"); symlinkSync(join(probeDir, "target"), join(probeDir, "link")); }
  catch { symlinkCapable = false; }
  finally { rmSync(probeDir, { recursive: true, force: true }); }
  if (!symlinkCapable) process.stdout.write("[capability: symlink unavailable] skipping symlink-specific checks\n");
}

const PROJECT_ROOT = "/private/customer/project";
const SOURCE_PLUGIN_ROOT = "/public/source/plugins/pipeline-core";
const PLUGIN_ROOT = "/installed/cache/pipeline-core-version";
const RAW_REPOSITORY = "https://example.invalid/private-core.git";
const PRIVATE_NAME = "customer-secret-policy.md";
const PLAN_SHA256 = "d".repeat(64);
const STATUS_PLAN_SHA256 = "b".repeat(64);
const RECEIPT_SHA256 = "e".repeat(64);
const USAGE = "Usage: private-overlay-activation.mjs <inspect|plan|status|load-context> --project-root <absolute-path> --source-plugin-root <absolute-path>\n       private-overlay-activation.mjs activate --project-root <absolute-path> --source-plugin-root <absolute-path> --expected-plan-sha256 <64hex>\n";

const candidate = Object.freeze({
  repository: RAW_REPOSITORY,
  branch: "main",
  commit: "a".repeat(40),
  tree: "b".repeat(40),
});
const plugin = Object.freeze({
  name: "pipeline-core",
  version: "1.2.3",
  manifestSha256: "c".repeat(64),
  contentSha256: "9".repeat(64),
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function canonicalLine(value) { return `${JSON.stringify(stable(value))}\n`; }
function readyObservation() { return { schema: "pipeline.public-core-observation.v1", status: "ready", candidate, plugin }; }
function readyEvidence() {
  return {
    schema: "pipeline.private-overlay-activation-evidence.v1",
    status: "ready",
    reasonCodes: ["SNT-A-VALIDATED"],
    marker: "sanitized",
  };
}
function readyReview(status = "ready") {
  return {
    schema: "pipeline.private-overlay-runtime-projection-plan.v1",
    status,
    reasonCodes: [status === "noop" ? "SNT-A-PROJECTION-NOOP" : "SNT-A-PROJECTION-READY"],
    planSha256: PLAN_SHA256,
    sourceSha256: "f".repeat(64),
    targets: [],
    changeCount: status === "noop" ? 0 : 6,
  };
}
function projection(status = "applied") {
  return {
    schema: "pipeline.private-overlay-runtime-projection-activation.v1",
    status,
    reasonCodes: [status === "noop" ? "SNT-A-PROJECTION-NOOP" : "SNT-A-PROJECTION-APPLIED"],
    planSha256: PLAN_SHA256,
    changeCount: status === "noop" ? 0 : 6,
    sourceCommittedLast: status === "applied",
  };
}
function bootstrapStatus(status = "activated") {
  const summary = {
    candidate: {
      repositorySha256: "1".repeat(64),
      branchSha256: "2".repeat(64),
      commit: candidate.commit,
      tree: candidate.tree,
    },
    plugin: { ...plugin },
    inputs: {
      sourceSha256: "3".repeat(64),
      lockSha256: "4".repeat(64),
      admittedSetSha256: "5".repeat(64),
      admittedFileSha256: ["6".repeat(64)],
    },
    admittedCounts: { policies: 1, guidelines: 0, templates: 0, extensions: 0, total: 1 },
  };
  if (status === "activation-required") {
    return {
      schema: "pipeline.private-overlay-bootstrap-status.v1",
      status,
      reasonCodes: ["SNT-A-RUNTIME-PROJECTION-REQUIRED"],
      planSha256: STATUS_PLAN_SHA256,
      ...summary,
    };
  }
  return {
    schema: "pipeline.private-overlay-bootstrap-status.v1",
    status,
    reasonCodes: ["SNT-A-PRIVATE-OVERLAY-ACTIVATED"],
    planSha256: STATUS_PLAN_SHA256,
    ...summary,
    profile: {
      humanFacing: "de",
      sourceSha256: summary.inputs.sourceSha256,
      runtimeSha256: "7".repeat(64),
      receiptSha256: RECEIPT_SHA256,
      repositoryFingerprint: "8".repeat(64),
    },
  };
}
function privateBatch() {
  return Object.freeze([Object.freeze({
    className: "policies",
    privateName: PRIVATE_NAME,
    text: "private policy contents\n",
  })]);
}
function baseDependencies() {
  return {
    pluginRoot: PLUGIN_ROOT,
    observe: readyObservation,
    validate: readyEvidence,
    planProjection: () => readyReview(),
    activateProjection: () => projection(),
    readProjectionInputs: () => ({ userYamlText: "user-v3\n", runtimeYamlText: "runtime-v3\n" }),
    publishReceipt: () => ({
      ok: true,
      code: "PO-PROFILE-RECEIPT-PUBLISHED",
      humanFacing: "de",
      receiptSha256: RECEIPT_SHA256,
    }),
    readBootstrapStatus: (input) => {
      input.consumeInputs(privateBatch());
      return bootstrapStatus();
    },
  };
}
function commandArgs(command, ...extra) {
  return [command, "--project-root", PROJECT_ROOT, "--source-plugin-root", SOURCE_PLUGIN_ROOT, ...extra];
}
function run(argv, overrides = {}) {
  let stdout = "";
  let stderr = "";
  let preview = "";
  const { useProductionReader = false, ...dependencyOverrides } = overrides;
  const dependencies = {
    ...baseDependencies(),
    ...dependencyOverrides,
    write: (chunk) => { stdout += String(chunk); return true; },
    writeError: (chunk) => { stderr += String(chunk); return true; },
  };
  if (useProductionReader) delete dependencies.readProjectionInputs;
  if (!Object.hasOwn(dependencyOverrides, "previewWriteSync")) {
    dependencies.previewWriteSync = (_fd, buffer, offset, length) => {
      preview += buffer.subarray(offset, offset + length).toString("utf8");
      return length;
    };
  }
  const code = main(argv, dependencies);
  return { code, stdout, stderr, preview };
}

test("inspect remains canonical and wires observed candidate and plugin to admission", () => {
  const calls = [];
  const evidence = readyEvidence();
  const result = run(commandArgs("inspect"), {
    observe(input) { calls.push(["observe", input]); return readyObservation(); },
    validate(input) { calls.push(["validate", input]); return evidence; },
  });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.preview, "");
  assert.equal(result.stdout, canonicalLine(evidence));
  assert.deepEqual(calls, [
    ["observe", { sourcePluginRoot: SOURCE_PLUGIN_ROOT, installedPluginRoot: PLUGIN_ROOT }],
    ["validate", { overlayRoot: PROJECT_ROOT, selectedCandidate: candidate, installedPlugin: plugin }],
  ]);
  for (const forbidden of [PROJECT_ROOT, SOURCE_PLUGIN_ROOT, PLUGIN_ROOT, PRIVATE_NAME, RAW_REPOSITORY]) {
    assert.equal(result.stdout.includes(forbidden), false);
  }
});

test("all malformed invocations emit only fixed usage and perform no observation", () => {
  const cases = [
    [], ["inspect"], ["unknown", "--project-root", PROJECT_ROOT, "--source-plugin-root", SOURCE_PLUGIN_ROOT],
    ["inspect", "--other", PROJECT_ROOT, "--source-plugin-root", SOURCE_PLUGIN_ROOT],
    ["inspect", "--project-root", "relative/project", "--source-plugin-root", SOURCE_PLUGIN_ROOT],
    ["inspect", "--project-root", PROJECT_ROOT],
    ["inspect", "--project-root", PROJECT_ROOT, "--source-plugin-root", "relative/plugin"],
    ["inspect", "--project-root", PROJECT_ROOT, "--source-plugin-root", SOURCE_PLUGIN_ROOT, "--source-plugin-root", SOURCE_PLUGIN_ROOT],
    [...commandArgs("inspect"), "--expected-plan-sha256", PLAN_SHA256],
    [...commandArgs("status"), "--expected-plan-sha256", PLAN_SHA256],
    [...commandArgs("load-context"), "--expected-plan-sha256", PLAN_SHA256],
    ["plan", "--project-root", PROJECT_ROOT, "--project-root", PROJECT_ROOT, "--source-plugin-root", SOURCE_PLUGIN_ROOT],
    commandArgs("activate"),
    commandArgs("activate", "--expected-plan-sha256", "short"),
    commandArgs("activate", "--expected-plan-sha256", PLAN_SHA256, "extra"),
    commandArgs("activate", "--expected-plan-sha256", PLAN_SHA256, "--expected-plan-sha256", PLAN_SHA256),
  ];
  for (const argv of cases) {
    let called = false;
    const result = run(argv, { observe: () => { called = true; return readyObservation(); } });
    assert.deepEqual(result, { code: 64, stdout: "", stderr: USAGE, preview: "" });
    assert.equal(called, false);
  }
});

test("status performs one read-only combined readback and consumes the authenticated batch synchronously", () => {
  const calls = [];
  const batch = privateBatch();
  const status = bootstrapStatus();
  const result = run(commandArgs("status"), {
    observe: () => assert.fail("legacy observation must not run"),
    validate: () => assert.fail("legacy validation must not run"),
    planProjection: () => assert.fail("standalone planning must not run"),
    activateProjection: () => assert.fail("activation must not run"),
    publishReceipt: () => assert.fail("publication must not run"),
    readBootstrapStatus(input) {
      calls.push(["read", {
        overlayRoot: input.overlayRoot,
        sourcePluginRoot: input.sourcePluginRoot,
        installedPluginRoot: input.installedPluginRoot,
      }]);
      const callbackResult = input.consumeInputs(batch);
      assert.equal(callbackResult, undefined);
      return status;
    },
    consumeInputs(received) {
      calls.push(["consume", received]);
      assert.equal(received, batch);
    },
  });
  assert.deepEqual(result, { code: 0, stdout: canonicalLine(status), stderr: "", preview: "" });
  assert.deepEqual(calls, [
    ["read", { overlayRoot: PROJECT_ROOT, sourcePluginRoot: SOURCE_PLUGIN_ROOT, installedPluginRoot: PLUGIN_ROOT }],
    ["consume", batch],
  ]);
  for (const forbidden of [PROJECT_ROOT, SOURCE_PLUGIN_ROOT, PLUGIN_ROOT, PRIVATE_NAME, "private policy contents"]) {
    assert.equal(result.stdout.includes(forbidden), false);
  }
});

test("status reports activation-required without consuming or mutating", () => {
  let consumed = false;
  const status = bootstrapStatus("activation-required");
  const result = run(commandArgs("status"), {
    readBootstrapStatus: () => status,
    consumeInputs: () => { consumed = true; },
    activateProjection: () => assert.fail("activation must not run"),
    publishReceipt: () => assert.fail("publication must not run"),
  });
  assert.deepEqual(result, { code: 2, stdout: canonicalLine(status), stderr: "", preview: "" });
  assert.equal(consumed, false);
});

test("load-context is the only command that emits a bounded private non-evidence envelope", () => {
  const batch = Object.freeze([
    Object.freeze({ className: "policies", privateName: "customer/a.md", text: "private policy alpha\n" }),
    Object.freeze({ className: "guidelines", privateName: "guide.md", text: "private guideline beta\n" }),
  ]);
  const result = run(commandArgs("load-context"), {
    readBootstrapStatus(input) {
      input.consumeInputs(batch);
      return {
        ...bootstrapStatus(),
        inputs: { ...bootstrapStatus().inputs, admittedFileSha256: ["6".repeat(64), "a".repeat(64)] },
        admittedCounts: { policies: 1, guidelines: 1, templates: 0, extensions: 0, total: 2 },
      };
    },
  });
  assert.equal(result.code, 0);
  assert.equal(result.preview, "");
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output, {
    classification: "private-operational-context",
    entries: [
      { className: "policies", text: "private policy alpha\n" },
      { className: "guidelines", text: "private guideline beta\n" },
    ],
    handling: "do-not-persist-or-export",
    machineEvidence: false,
    planSha256: STATUS_PLAN_SHA256,
    reasonCodes: ["SNT-A-PRIVATE-CONTEXT-LOADED"],
    schema: "pipeline.private-overlay-operational-context.v1",
    status: "context-loaded",
  });
  assert.equal(result.stdout.includes("customer/a.md"), false);
  assert.equal(result.stdout.includes("guide.md"), false);
  for (const forbidden of [PROJECT_ROOT, SOURCE_PLUGIN_ROOT, PLUGIN_ROOT, RAW_REPOSITORY]) {
    assert.equal(result.stdout.includes(forbidden), false);
  }
});

test("load-context fails closed on drift, callback failure, oversize, or incomplete consumption", () => {
  const rejection = {
    reasonCodes: ["SNT-A-CONTEXT-LOAD-REJECTED"],
    schema: "pipeline.private-overlay-operational-context.v1",
    status: "rejected",
  };
  const oversizedText = `private-oversize-${"x".repeat(33 * 1024)}`;
  const cases = [
    {
      name: "projection drift",
      readBootstrapStatus: () => bootstrapStatus("activation-required"),
    },
    {
      name: "consumer failure",
      readBootstrapStatus(input) {
        try { input.consumeInputs(Object.freeze([Object.freeze({ className: "unknown", privateName: PRIVATE_NAME, text: "private invalid" })])); }
        catch { return { schema: "pipeline.private-overlay-bootstrap-status.v1", status: "rejected", reasonCodes: ["SNT-A-CONSUMER-FAILED"] }; }
        assert.fail("invalid batch must fail");
      },
    },
    {
      name: "oversize",
      readBootstrapStatus(input) {
        try { input.consumeInputs(Object.freeze([Object.freeze({ className: "policies", privateName: PRIVATE_NAME, text: oversizedText })])); }
        catch { return { schema: "pipeline.private-overlay-bootstrap-status.v1", status: "rejected", reasonCodes: ["SNT-A-CONSUMER-FAILED"] }; }
        assert.fail("oversized batch must fail");
      },
    },
    {
      name: "forged no callback",
      readBootstrapStatus: () => bootstrapStatus(),
      internal: true,
    },
  ];
  for (const fixture of cases) {
    const result = run(commandArgs("load-context"), { readBootstrapStatus: fixture.readBootstrapStatus });
    assert.equal(result.code, 2, fixture.name);
    const expected = fixture.internal
      ? { reasonCodes: ["SNT-A-CLI-INTERNAL"], schema: "pipeline.private-overlay-operational-context.v1", status: "rejected" }
      : rejection;
    assert.deepEqual(JSON.parse(result.stdout), expected, fixture.name);
    for (const forbidden of [PRIVATE_NAME, "private invalid", oversizedText, PROJECT_ROOT, SOURCE_PLUGIN_ROOT, PLUGIN_ROOT]) {
      assert.equal(result.stdout.includes(forbidden), false, fixture.name);
    }
  }
});

test("status remains sanitized and never exposes the private operational context", () => {
  const result = run(commandArgs("status"), {
    readBootstrapStatus(input) {
      input.consumeInputs(privateBatch());
      return bootstrapStatus();
    },
  });
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schema, "pipeline.private-overlay-bootstrap-status.v1");
  assert.equal(Object.hasOwn(output, "entries"), false);
  assert.equal(result.stdout.includes(PRIVATE_NAME), false);
  assert.equal(result.stdout.includes("private policy contents"), false);
});

test("observer and admission rejection short-circuit projection", () => {
  let validated = false;
  let planned = false;
  const observationRejection = { schema: "pipeline.public-core-observation.v1", status: "rejected", reasonCodes: ["SNT-A2-PLUGIN-DIRTY"] };
  const observed = run(commandArgs("plan"), {
    observe: () => observationRejection,
    validate: () => { validated = true; },
    planProjection: () => { planned = true; },
  });
  assert.equal(observed.code, 2);
  assert.equal(observed.stdout, canonicalLine(observationRejection));
  assert.equal(validated, false);
  assert.equal(planned, false);

  const admissionRejection = { schema: "pipeline.private-overlay-activation-evidence.v1", status: "rejected", reasonCodes: ["SNT-A-COMMIT-MISMATCH"] };
  const admitted = run(commandArgs("activate", "--expected-plan-sha256", PLAN_SHA256), {
    validate: () => admissionRejection,
    planProjection: () => { planned = true; },
  });
  assert.equal(admitted.code, 2);
  assert.equal(admitted.stdout, canonicalLine(admissionRejection));
  assert.equal(admitted.preview, "");
  assert.equal(planned, false);
});

test("plan emits one sanitized canonical review and performs no mutation or preview", () => {
  let activated = false;
  let read = false;
  let published = false;
  const review = readyReview();
  const result = run(commandArgs("plan"), {
    planProjection: ({ overlayRoot, activationEvidence }) => {
      assert.equal(overlayRoot, PROJECT_ROOT);
      assert.deepEqual(activationEvidence, readyEvidence());
      return review;
    },
    activateProjection: () => { activated = true; },
    readProjectionInputs: () => { read = true; },
    publishReceipt: () => { published = true; },
  });
  assert.deepEqual(result, { code: 0, stdout: canonicalLine(review), stderr: "", preview: "" });
  assert.equal(activated, false);
  assert.equal(read, false);
  assert.equal(published, false);
});

test("digest mismatch performs zero preview, activation, read, or publication", () => {
  let activated = false;
  let read = false;
  let published = false;
  const result = run(commandArgs("activate", "--expected-plan-sha256", "0".repeat(64)), {
    activateProjection: () => { activated = true; },
    readProjectionInputs: () => { read = true; },
    publishReceipt: () => { published = true; },
  });
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).reasonCodes[0], "SNT-A-PROJECTION-DIGEST-MISMATCH");
  assert.equal(result.preview, "");
  assert.equal(activated, false);
  assert.equal(read, false);
  assert.equal(published, false);
});

test("preview zero-progress or error stops before activation and publication", () => {
  for (const previewWriteSync of [() => 0, () => { throw new Error(`${PROJECT_ROOT} private preview`); }]) {
    let activated = false;
    let published = false;
    const result = run(commandArgs("activate", "--expected-plan-sha256", PLAN_SHA256), {
      previewWriteSync,
      activateProjection: () => { activated = true; },
      publishReceipt: () => { published = true; },
    });
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stdout).reasonCodes[0], "SNT-A-PROJECTION-PREVIEW-FAILED");
    assert.equal(result.stdout.includes(PROJECT_ROOT), false);
    assert.equal(activated, false);
    assert.equal(published, false);
  }
});

test("bounded short writes deliver the exact review before apply and receipt publication", () => {
  const review = readyReview();
  let preview = "";
  let previewCalls = 0;
  const order = [];
  const result = run(commandArgs("activate", "--expected-plan-sha256", PLAN_SHA256), {
    planProjection: () => review,
    previewWriteSync: (_fd, buffer, offset, length) => {
      order.push("preview");
      previewCalls += 1;
      const written = Math.min(3, length);
      preview += buffer.subarray(offset, offset + written).toString("utf8");
      return written;
    },
    activateProjection(received, options) {
      order.push("activate");
      assert.equal(preview, canonicalLine(review), "complete preview must precede activation");
      assert.equal(received, review);
      assert.deepEqual(options, { overlayRoot: PROJECT_ROOT, activate: true, expectedPlanSha256: PLAN_SHA256 });
      return projection();
    },
    publishReceipt(input) {
      order.push("publish");
      assert.deepEqual(input, { rootDir: PROJECT_ROOT, userYamlText: "user-v3\n", runtimeYamlText: "runtime-v3\n" });
      return { ok: true, code: "PO-PROFILE-RECEIPT-PUBLISHED", humanFacing: "de", receiptSha256: RECEIPT_SHA256 };
    },
    readBootstrapStatus(input) {
      order.push("readback");
      input.consumeInputs(privateBatch());
      return bootstrapStatus();
    },
  });
  assert.ok(previewCalls > 1);
  assert.deepEqual(order.slice(-3), ["activate", "publish", "readback"]);
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "activated");
  assert.equal(output.planSha256, PLAN_SHA256);
  assert.equal(output.projectionStatus, "applied");
  assert.equal(output.receipt.receiptSha256, RECEIPT_SHA256);
  assert.deepEqual(output.readback, bootstrapStatus());
  assert.equal(output.readback.planSha256, STATUS_PLAN_SHA256);
});

test("activate never claims success when the fresh combined readback is not activated and bound", () => {
  for (const readback of [
    bootstrapStatus("activation-required"),
    { ...bootstrapStatus(), profile: { ...bootstrapStatus().profile, receiptSha256: "0".repeat(64) } },
  ]) {
    const result = run(commandArgs("activate", "--expected-plan-sha256", PLAN_SHA256), {
      readBootstrapStatus(input) {
        if (readback.status === "activated") input.consumeInputs(privateBatch());
        return readback;
      },
    });
    assert.equal(result.code, 2);
    assert.deepEqual(JSON.parse(result.stdout), {
      planSha256: PLAN_SHA256,
      projectionStatus: "applied",
      reasonCodes: ["SNT-A-ACTIVATED-STATUS-READBACK-FAILED"],
      rollbackClaimed: false,
      schema: "pipeline.private-overlay-activation-result.v1",
      status: "partial",
    });
  }
});

test("publisher failure after projection is a sanitized partial result without rollback claim", () => {
  const result = run(commandArgs("activate", "--expected-plan-sha256", PLAN_SHA256), {
    publishReceipt: () => ({ ok: false, code: "PO-PROFILE-RECEIPT-WRITE-FAILED", reason: `${PROJECT_ROOT} private` }),
  });
  assert.equal(result.code, 2);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output, {
    planSha256: PLAN_SHA256,
    projectionStatus: "applied",
    reasonCodes: ["SNT-A-ACTIVATED-RECEIPT-PUBLISH-FAILED"],
    rollbackClaimed: false,
    schema: "pipeline.private-overlay-activation-result.v1",
    status: "partial",
  });
  assert.equal(result.stdout.includes(PROJECT_ROOT), false);
});

test("post-apply input read failure is partial and never invokes the publisher", () => {
  let published = false;
  const result = run(commandArgs("activate", "--expected-plan-sha256", PLAN_SHA256), {
    readProjectionInputs: () => { throw new Error(`${PROJECT_ROOT} private read`); },
    publishReceipt: () => { published = true; },
  });
  assert.equal(result.code, 2);
  assert.equal(JSON.parse(result.stdout).reasonCodes[0], "SNT-A-ACTIVATED-INPUT-READ-FAILED");
  assert.equal(JSON.parse(result.stdout).rollbackClaimed, false);
  assert.equal(result.stdout.includes(PROJECT_ROOT), false);
  assert.equal(published, false);
});

test("production reader admits stable project-local files and rejects source or runtime symlinks", { skip: !symlinkCapable && "symlink unavailable" }, () => {
  const base = mkdtempSync(join(tmpdir(), "private-overlay-cli-read-test-"));
  const root = join(base, "overlay");
  const outside = join(base, "outside.yaml");
  const source = "schema: pipeline.user.v3\nlanguage:\n  human_facing: de\n";
  const runtime = "language:\n  human_facing: de\n";
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, "pipeline.user.yaml"), source);
  writeFileSync(join(root, ".claude/pipeline.yaml"), runtime);
  writeFileSync(outside, source);
  try {
    let publishedInput;
    const safe = run(["activate", "--project-root", root, "--source-plugin-root", SOURCE_PLUGIN_ROOT, "--expected-plan-sha256", PLAN_SHA256], {
      useProductionReader: true,
      publishReceipt(input) {
        publishedInput = input;
        return { ok: true, code: "PO-PROFILE-RECEIPT-PUBLISHED", humanFacing: "de", receiptSha256: RECEIPT_SHA256 };
      },
    });
    assert.equal(safe.code, 0);
    assert.deepEqual(publishedInput, { rootDir: root, userYamlText: source, runtimeYamlText: runtime });

    for (const relative of ["pipeline.user.yaml", ".claude/pipeline.yaml"]) {
      const path = join(root, relative);
      unlinkSync(path);
      symlinkSync(outside, path);
      let published = false;
      const unsafe = run(["activate", "--project-root", root, "--source-plugin-root", SOURCE_PLUGIN_ROOT, "--expected-plan-sha256", PLAN_SHA256], {
        useProductionReader: true,
        publishReceipt: () => { published = true; },
      });
      assert.equal(unsafe.code, 2);
      assert.equal(JSON.parse(unsafe.stdout).reasonCodes[0], "SNT-A-ACTIVATED-INPUT-READ-FAILED");
      assert.equal(published, false);
      unlinkSync(path);
      writeFileSync(path, relative === "pipeline.user.yaml" ? source : runtime);
    }
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("noop projection still publishes a receipt and completes activation", () => {
  const result = run(commandArgs("activate", "--expected-plan-sha256", PLAN_SHA256), {
    planProjection: () => readyReview("noop"),
    activateProjection: () => projection("noop"),
  });
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "activated");
  assert.equal(output.projectionStatus, "noop");
});

test("unexpected dependency and callback errors are sanitized", () => {
  for (const overrides of [
    { observe: () => { throw new Error(`${PROJECT_ROOT} ${SOURCE_PLUGIN_ROOT} ${PLUGIN_ROOT} ${PRIVATE_NAME}`); } },
    { observe: () => ({
      schema: "pipeline.public-core-observation.v1",
      status: "rejected",
      reasonCodes: ["SNT-A2-INTERNAL-ERROR"],
      privateRoot: SOURCE_PLUGIN_ROOT,
    }) },
    { validate: () => { throw new Error(RAW_REPOSITORY); } },
    { planProjection: () => { throw new Error(PRIVATE_NAME); } },
    { observe: "not-a-function" },
    { unexpected: () => {} },
    { readBootstrapStatus: () => ({ ...bootstrapStatus(), privateRoot: PROJECT_ROOT }) },
    { readBootstrapStatus: () => bootstrapStatus() },
  ]) {
    const command = Object.hasOwn(overrides, "readBootstrapStatus")
      ? "status"
      : Object.hasOwn(overrides, "planProjection") ? "plan" : "inspect";
    const result = run(commandArgs(command), overrides);
    assert.equal(result.code, 2);
    assert.equal(JSON.parse(result.stdout).reasonCodes[0], "SNT-A-CLI-INTERNAL");
    for (const forbidden of [PROJECT_ROOT, SOURCE_PLUGIN_ROOT, PLUGIN_ROOT, PRIVATE_NAME, RAW_REPOSITORY]) {
      assert.equal(result.stdout.includes(forbidden), false);
      assert.equal(result.stderr.includes(forbidden), false);
      assert.equal(result.preview.includes(forbidden), false);
    }
  }
});

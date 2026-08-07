// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  appendDiagnosticEvent,
  applyProfile,
  classifyProbe,
  ELIGIBLE_CLASSES,
  INELIGIBLE_CLASSES,
  planProfile,
  PROFILE_NAME,
  runFixedIpcProbe,
  strictValidateActiveCodexConfig,
  strictValidateCodexConfig,
  strictValidateProfilePostimage,
  validatePostInstallProbePair,
  WslIpcCompatibilityController,
} from "./wsl-ipc-compatibility.mjs";
import {
  isReactiveIpcTrigger,
  projectSandboxFailure,
  SANDBOX_FAILURE_SCHEMA,
  validateSandboxFailure,
} from "./sandbox-failure.mjs";

const CLI = fileURLToPath(new URL("../scripts/codex-wsl-ipc-compatibility.mjs", import.meta.url));
const CANARY = fileURLToPath(import.meta.url);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, (key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
  ? Object.fromEntries(Object.keys(entry).sort().map((child) => [child, entry[child]]))
  : entry, 2)}\n`;
const digest = (character) => character.repeat(64);

function identity(overrides = {}) {
  return {
    codexSha256: digest("a"),
    configSha256: digest("b"),
    filesystemClass: "wsl-ext4",
    platform: "linux-wsl",
    selectedProfile: ":workspace",
    selectedProfileSha256: digest("d"),
    sessionSha256: digest("c"),
    standardProfileSha256: digest("d"),
    workspaceClass: "approved-workspace",
    ...overrides,
  };
}

const baseTrigger = projectSandboxFailure({
  failureCode: "unix_socket_bind_denied",
  capability: "local-ipc",
  operation: "listen",
  osCode: "EPERM",
  syscall: "listen",
  resourceClass: "af-unix-socket",
  originLayer: "native-standard",
  executionBoundary: "nested-codex-sandbox",
  permissionPosture: "standard",
  evidenceSource: "direct",
  probeVersion: "1",
  runnerClass: "codex",
  locationClass: "system-temp",
  retryClass: "none",
  partialEffect: "unknown",
  rawDiagnosticsAvailable: true,
});
const trigger = (session = "s") => ({ ...baseTrigger, session });

function probe(status = "confirmed", probeIdentity = identity()) {
  const compatible = status === "compatible";
  const receipt = {
    schema: "pipeline.codex-wsl-ipc-probe-receipt.v1",
    status,
    probeVersion: "1",
    probeInputSha256: digest("e"),
    identity: probeIdentity,
    tempFile: "success",
    afUnix: compatible ? "success" : "denied",
    error: compatible ? null : {
      capability: "local-ipc",
      operation: "listen",
      syscall: "listen",
      resourceClass: "af-unix-socket",
      osCode: "EPERM",
    },
    canaryPreSha256: digest("f"),
    canaryPostSha256: digest("f"),
    cleanup: "passed",
    withinDeadline: true,
  };
  return {
    schema: "pipeline.codex-wsl-ipc-probe.v1",
    status,
    probeVersion: "1",
    probeInputSha256: receipt.probeInputSha256,
    identity: probeIdentity,
    tempFile: receipt.tempFile,
    afUnix: receipt.afUnix,
    error: receipt.error,
    canaryPreSha256: receipt.canaryPreSha256,
    canaryPostSha256: receipt.canaryPostSha256,
    canarySha256: receipt.canaryPreSha256,
    cleanup: receipt.cleanup,
    receipt,
    receiptSha256: sha256(canonical(receipt)),
  };
}

function profileFixture(config = 'default_permissions = ":workspace"\n', codexScript = "#!/bin/sh\nexit 0\n") {
  const root = mkdtempSync(join(tmpdir(), "wsl-ipc-profile-"));
  const codexHome = join(root, "codex-home");
  mkdirSync(codexHome, { mode: 0o700 });
  const configPath = join(codexHome, "config.toml");
  writeFileSync(configPath, config, { mode: 0o600 });
  chmodSync(configPath, 0o600);
  const codexPath = join(root, "codex");
  writeFileSync(codexPath, codexScript, { mode: 0o700 });
  chmodSync(codexPath, 0o700);
  const codexSha256 = sha256(readFileSync(codexPath));
  const configSha256 = sha256(config);
  const probeIdentity = identity({ codexSha256, configSha256 });
  const fixedProbe = probe("confirmed", probeIdentity);
  return {
    root, codexHome, configPath, config, codexPath, codexSha256,
    probe: fixedProbe,
    plan: (overrides = {}) => planProfile({
      configBytes: config,
      codexHome,
      configPath,
      codexPath,
      codexDigest: codexSha256,
      probeReceipt: fixedProbe.receipt,
      probeReceiptSha256: fixedProbe.receiptSha256,
      approvalActor: "operator",
      validator: () => true,
      ...overrides,
    }),
  };
}

test("sandbox failure projection is closed, sanitized, ordered and capped", () => {
  let projected = baseTrigger;
  for (const adapter of ["fixed-probe", "sandbox-process", "codex-command", "runner", "duty", "coordinator", "outer", "last", "overflow"]) {
    projected = projectSandboxFailure(projected, adapter);
  }
  assert.equal(projected.schema, SANDBOX_FAILURE_SCHEMA);
  assert.equal(projected.failureCode, "unix_socket_bind_denied");
  assert.equal(projected.adapterTrace.length, 8);
  assert.equal(new Set(projected.adapterTrace).size, 8);
  assert.equal(JSON.stringify(projected).includes("/home/"), false);
  validateSandboxFailure(projected);
});

test("reactive trigger requires the exact structured direct or contract-plausible shape", () => {
  assert.equal(isReactiveIpcTrigger(baseTrigger), true);
  const plausible = { ...baseTrigger, failureCode: "sandbox_permission_denied_unknown" };
  assert.equal(isReactiveIpcTrigger(plausible), false);
  assert.equal(isReactiveIpcTrigger(plausible, { operationCapability: "local-ipc" }), true);
  for (const changed of [
    { osCode: "EACCES" },
    { originLayer: "wrapper" },
    { capability: "filesystem" },
    { operation: "connect" },
    { resourceClass: "regular-file" },
    { executionBoundary: "host-direct" },
    { executionBoundary: "unknown" },
  ]) assert.equal(isReactiveIpcTrigger({ ...baseTrigger, ...changed }), false);
});

test("direct host AF_UNIX observations never activate fallback and each new Elephant session retries nested standard first", () => {
  const first = new WslIpcCompatibilityController({ sessionId: "elephant-1" });
  const hostFailure = trigger("elephant-1");
  hostFailure.executionBoundary = "host-direct";
  assert.equal(first.observe("coordinator-workspace", hostFailure).state, "standard");
  assert.equal(first.verifierInvocations, 0);

  assert.equal(first.observe("coordinator-workspace", trigger("elephant-1")).state, "probe-required");
  const nestedIdentity = identity();
  assert.equal(first.confirm(probe("confirmed", nestedIdentity), {
    currentSession: "elephant-1",
    session: "elephant-1",
    probeIdentity: nestedIdentity,
  }).state, "confirmed");

  const next = new WslIpcCompatibilityController({ sessionId: "elephant-2" });
  assert.equal(next.state, "standard");
  assert.equal(next.active, false);
  assert.equal(next.observe("coordinator-workspace", trigger("elephant-2")).state, "probe-required");

  const fixed = new WslIpcCompatibilityController({ sessionId: "elephant-fixed" });
  const nestedSuccess = fixed.observe("coordinator-workspace", null);
  assert.equal(nestedSuccess.state, "standard");
  assert.equal(nestedSuccess.activation, "inactive");
  assert.equal(nestedSuccess.profileName, null);
  assert.equal(nestedSuccess.verifierInvocations, 0);
});

test("probe classifier requires full receipt, identity, canary and trigger-operation binding", () => {
  const fixed = probe();
  const binding = { currentSession: "s", session: "s", probeIdentity: fixed.identity };
  assert.equal(classifyProbe(trigger(), fixed, binding).state, "confirmed");
  for (const mutated of [
    { ...fixed, receiptSha256: digest("0") },
    { ...fixed, cleanup: "failure" },
    { ...fixed, canaryPostSha256: digest("0") },
    { ...fixed, identity: identity({ sessionSha256: digest("0") }) },
    { ...fixed, error: { ...fixed.error, syscall: "bind" } },
  ]) assert.equal(classifyProbe(trigger(), mutated, binding).state, "unavailable");
});

test("controller is native-first, session-bound, exactly-once and narrow-duty isolated", () => {
  const probeIdentity = identity();
  const controller = new WslIpcCompatibilityController({
    sessionId: "s",
    identity: { probeIdentity, sessionId: "s" },
  });
  assert.equal(controller.observe("implement", trigger("other")).state, "standard");
  assert.equal(controller.observe("advisory", trigger()).state, "standard");
  assert.equal(controller.observe("implement", trigger(), { baselineProfile: "custom" }).state, "standard");
  assert.equal(controller.observe("implement", trigger()).state, "probe-required");
  assert.equal(controller.observe("implement", trigger()).verifierInvocations, 0);
  assert.equal(controller.confirm(probe("confirmed", probeIdentity), {
    currentSession: "s", session: "s", probeIdentity,
  }).state, "confirmed");
  assert.equal(controller.confirm(probe("confirmed", probeIdentity), {
    currentSession: "s", session: "s", probeIdentity,
  }).verifierInvocations, 1);
  for (const duty of INELIGIBLE_CLASSES) {
    assert.equal(new WslIpcCompatibilityController({ sessionId: "s" }).observe(duty, trigger()).state, "standard");
  }
});

test("controller activates only from matching approval plus compatible fallback and retries once when proven safe", () => {
  const probeIdentity = identity();
  const controller = new WslIpcCompatibilityController({
    sessionId: "s",
    identity: {
      probeIdentity,
      sessionId: "s",
      codexSha256: probeIdentity.codexSha256,
      configSha256: probeIdentity.configSha256,
    },
  });
  controller.observe("implement", trigger(), {
    operationReadOnly: true,
    deterministic: true,
    partialEffect: "none-observed-and-proven",
  });
  const standard = probe("confirmed", probeIdentity);
  controller.confirm(standard, { currentSession: "s", session: "s", probeIdentity });
  const approval = {
    schema: "pipeline.codex-wsl-ipc-approval.v1",
    profileSha256: digest("1"),
    probeReceiptSha256: standard.receiptSha256,
    codexSha256: probeIdentity.codexSha256,
    preimageSha256: probeIdentity.configSha256,
    postimageSha256: digest("2"),
  };
  const approvalDigest = sha256(canonical(approval));
  const postStandardIdentity = identity({
    ...probeIdentity,
    configSha256: approval.postimageSha256,
  });
  const compatibilityIdentity = identity({
    ...postStandardIdentity,
    selectedProfile: PROFILE_NAME,
    selectedProfileSha256: approval.profileSha256,
  });
  const postStandard = probe("confirmed", postStandardIdentity);
  assert.equal(controller.activate({
    profileDigest: digest("1"),
    approvalReceipt: approval,
    approvalDigest,
    standardProbe: postStandard,
    fallbackProbe: probe("unavailable", probeIdentity),
    operationClass: "implement",
  }).activation, "inactive");
  const activated = controller.activate({
    profileDigest: digest("1"),
    approvalReceipt: approval,
    approvalDigest,
    standardProbe: postStandard,
    fallbackProbe: probe("compatible", compatibilityIdentity),
    operationClass: "implement",
  });
  assert.equal(activated.state, "session-fallback-active");
  assert.equal(activated.retry, true);
  assert.equal(controller.activate({
    profileDigest: digest("1"), approvalReceipt: approval, approvalDigest,
    standardProbe: postStandard,
    fallbackProbe: probe("compatible", compatibilityIdentity), operationClass: "implement",
  }).retry, false);
  assert.equal(controller.result("security").profileName, null);
  assert.equal(controller.resetSession("next").state, "standard");
});

test("controller never retries an effectful or ambiguous original operation", () => {
  const probeIdentity = identity();
  const controller = new WslIpcCompatibilityController({ sessionId: "s", identity: { probeIdentity, sessionId: "s" } });
  controller.observe("implement", trigger(), { operationReadOnly: false, deterministic: true, partialEffect: "unknown" });
  const standard = probe("confirmed", probeIdentity);
  controller.confirm(standard, { currentSession: "s", session: "s", probeIdentity });
  const approval = { schema: "pipeline.codex-wsl-ipc-approval.v1", profileSha256: digest("1"), probeReceiptSha256: standard.receiptSha256, codexSha256: probeIdentity.codexSha256, preimageSha256: digest("b"), postimageSha256: digest("2") };
  const postStandardIdentity = identity({ ...probeIdentity, configSha256: approval.postimageSha256 });
  const activated = controller.activate({
    profileDigest: digest("1"), approvalReceipt: approval, approvalDigest: sha256(canonical(approval)),
    standardProbe: probe("confirmed", postStandardIdentity),
    fallbackProbe: probe("compatible", identity({
      ...postStandardIdentity,
      selectedProfile: PROFILE_NAME,
      selectedProfileSha256: approval.profileSha256,
    })),
    operationClass: "implement",
  });
  assert.equal(activated.state, "session-fallback-active");
  assert.equal(activated.retry, false);
});

test("post-install pair binds the same candidate/config and two exact selected profiles", () => {
  const profileDigest = digest("1");
  const postConfig = digest("2");
  const standardIdentity = identity({ configSha256: postConfig });
  const compatibilityIdentity = identity({
    ...standardIdentity,
    selectedProfile: PROFILE_NAME,
    selectedProfileSha256: profileDigest,
  });
  const approvalReceipt = {
    schema: "pipeline.codex-wsl-ipc-approval.v1",
    planSha256: digest("3"),
    profileSha256: profileDigest,
    codexSha256: standardIdentity.codexSha256,
    postimageSha256: postConfig,
  };
  const standardProbe = probe("confirmed", standardIdentity);
  const compatibilityProbe = probe("compatible", compatibilityIdentity);
  const pair = validatePostInstallProbePair({
    standardProbe,
    compatibilityProbe,
    approvalReceipt,
    profileDigest,
  });
  assert.equal(pair.ok, true);
  assert.match(pair.pairSha256, /^[0-9a-f]{64}$/u);
  for (const changed of [
    { compatibilityProbe: probe("compatible", { ...compatibilityIdentity, configSha256: digest("4") }) },
    { compatibilityProbe: probe("compatible", { ...compatibilityIdentity, selectedProfile: ":workspace" }) },
    { compatibilityProbe: probe("confirmed", compatibilityIdentity) },
    { standardProbe: probe("confirmed", { ...standardIdentity, selectedProfileSha256: digest("5") }) },
  ]) {
    assert.equal(validatePostInstallProbePair({
      standardProbe,
      compatibilityProbe,
      approvalReceipt,
      profileDigest,
      ...changed,
    }).ok, false);
  }
});

test("session fallback retires on Codex, config or probe drift and never carries into reset", () => {
  const controller = new WslIpcCompatibilityController();
  controller.active = true;
  controller.state = "session-fallback-active";
  controller.codexDigest = "codex";
  controller.configDigest = "config";
  controller.probeVersion = "1";
  assert.equal(controller.retireIfDrifted({ codexDigest: "changed", configDigest: "config", probeVersion: "1" }), true);
  assert.equal(controller.state, "not-required");
  assert.equal(controller.resetSession("new").activation, "inactive");
});

test("fixed probe uses a physical external canary, bounded scratch and exact cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "wsl-probe-"));
  try {
    const result = await runFixedIpcProbe({ scratchRoot: root, canaryPath: CANARY, identity: identity() });
    assert.ok(["confirmed", "compatible", "unavailable"].includes(result.status));
    assert.equal(result.cleanup, "passed");
    assert.equal(result.canaryPreSha256, result.canaryPostSha256);
    assert.deepEqual(readdirSync(root), []);
    assert.equal(result.receiptSha256, sha256(canonical(result.receipt)));
    assert.equal((await runFixedIpcProbe({ scratchRoot: root, canaryPath: join(root, "inside"), identity: identity() })).status, "unavailable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("diagnostic log is private, capped, sanitized and corruption cannot control classification", () => {
  const root = mkdtempSync(join(tmpdir(), "wsl-log-"));
  const session = digest("9");
  try {
    for (let index = 0; index < 270; index += 1) {
      assert.equal(appendDiagnosticEvent(`event-${index}`, { failure: baseTrigger }, { codexHome: root, sessionDigest: session, now: index }).code, "ok");
    }
    const path = join(root, "log", "pipeline-ipc", `${session}.jsonl`);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    assert.equal(lines.length, 256);
    assert.equal(readFileSync(path, "utf8").includes("/home/"), false);
    writeFileSync(path, "{broken}\n", { mode: 0o600 });
    assert.equal(appendDiagnosticEvent("next", {}, { codexHome: root, sessionDigest: session }).code, "diagnostic_log_unavailable");
    assert.equal(readFileSync(path, "utf8"), "{broken}\n");
    assert.equal(appendDiagnosticEvent("next", {}, { codexHome: root, sessionDigest: "unsafe/path" }).code, "diagnostic_log_unavailable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("profile planner is read-only, probe/binary/config bound and names only the broad reviewed key", () => {
  const fixture = profileFixture();
  try {
    const before = readFileSync(fixture.configPath);
    const plan = fixture.plan();
    assert.equal(plan.status, "approval-required");
    assert.equal(plan.profileName, PROFILE_NAME);
    assert.deepEqual(plan.ownedKeys, ["network.enabled", "dangerously_allow_all_unix_sockets"]);
    assert.deepEqual(plan.dangerousKeys, ["dangerously_allow_all_unix_sockets"]);
    assert.match(plan.dangerousWarning, /local-daemon exposure risk/u);
    assert.equal(plan.defaultPermissionProfile, ":workspace");
    assert.equal(plan.codexSha256, fixture.codexSha256);
    assert.equal(readFileSync(fixture.configPath).equals(before), true);
    assert.equal(fixture.plan({ probeReceiptSha256: digest("0") }).status, "probe-required");
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("profile planner materializes only the safe workspace default when Codex requires an explicit default", () => {
  const fixture = profileFixture('model = "test-model"\n');
  try {
    const plan = fixture.plan();
    assert.equal(plan.status, "approval-required");
    assert.equal(plan.defaultPermissionProfile, null);
    assert.equal(plan.effectiveDefaultPermissionProfile, ":workspace");
    assert.equal(plan.defaultPermissionMaterialized, true);
    assert.deepEqual(plan.ownedKeys, ["default_permissions", "network.enabled", "dangerously_allow_all_unix_sockets"]);
    assert.match(plan.ownedDefaultSha256, /^[0-9a-f]{64}$/u);
    const applied = applyProfile(plan, {
      configBytes: fixture.config,
      planSha256: plan.planSha256,
      confirmed: true,
      write: true,
      actor: "operator",
      probeReceipt: fixture.probe.receipt,
      probeReceiptSha256: fixture.probe.receiptSha256,
      validator: () => true,
    });
    assert.equal(applied.status, "applied");
    const post = readFileSync(fixture.configPath, "utf8");
    assert.equal(post.startsWith('default_permissions = ":workspace"\nmodel = "test-model"\n'), true);
    assert.equal(/default_permissions\s*=\s*"pipeline-wsl-ipc-compat"/u.test(post), false);
    assert.equal(applied.effectiveDefaultPermissionProfile, ":workspace");
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("profile upgrade accepts only the exact legacy block plus matching receipt and atomically supersedes both", () => {
  const legacyConfig = `default_permissions = ":workspace"
model = "test-model"
[permissions.${PROFILE_NAME}]
extends = ":workspace"
[permissions.${PROFILE_NAME}.network]
dangerously_allow_all_unix_sockets = true
`;
  const fixture = profileFixture(legacyConfig);
  try {
    const legacyReceipt = {
      schema: "pipeline.codex-wsl-ipc-approval.v1",
      actor: "operator",
      approvedAt: "2026-07-29T12:00:00.000Z",
      planSha256: digest("1"),
      probeReceiptSha256: fixture.probe.receiptSha256,
      probeInputSha256: fixture.probe.probeInputSha256,
      codexSha256: fixture.codexSha256,
      preimageSha256: digest("2"),
      postimageSha256: sha256(legacyConfig),
      profileSha256: sha256(canonical({
        name: PROFILE_NAME,
        extends: ":workspace",
        permissions: { dangerously_allow_all_unix_sockets: true },
        dangerousKeys: ["dangerously_allow_all_unix_sockets"],
      })),
      defaultPermissionProfile: null,
      effectiveDefaultPermissionProfile: ":workspace",
      defaultPermissionMaterialized: true,
      ownedKeys: ["default_permissions", "dangerously_allow_all_unix_sockets"],
      dangerousKeys: ["dangerously_allow_all_unix_sockets"],
    };
    const receiptPath = join(fixture.codexHome, "pipeline-wsl-ipc-approval.json");
    const legacyBytes = canonical(legacyReceipt);
    writeFileSync(receiptPath, legacyBytes, { mode: 0o600 });
    const plan = fixture.plan();
    assert.equal(plan.status, "approval-required");
    assert.equal(plan.operation, "upgrade");
    assert.equal(plan.priorApprovalReceiptSha256, sha256(legacyBytes));
    assert.equal(plan.replacedProfileSha256, legacyReceipt.profileSha256);
    assert.deepEqual(plan.ownedKeys, ["default_permissions", "network.enabled", "dangerously_allow_all_unix_sockets"]);

    const args = {
      configBytes: legacyConfig,
      planSha256: plan.planSha256,
      confirmed: true,
      write: true,
      actor: "operator",
      probeReceipt: fixture.probe.receipt,
      probeReceiptSha256: fixture.probe.receiptSha256,
      validator: () => true,
      now: () => "2026-07-29T13:00:00.000Z",
    };
    const applied = applyProfile(plan, args);
    assert.equal(applied.status, "applied");
    assert.equal(applied.replay, false);
    const post = readFileSync(fixture.configPath, "utf8");
    assert.match(post, /\[permissions\.pipeline-wsl-ipc-compat\.network\]\nenabled = true\ndangerously_allow_all_unix_sockets = true/u);
    assert.equal((post.match(/\[permissions\.pipeline-wsl-ipc-compat\]/gu) ?? []).length, 1);
    const upgradedReceipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    assert.equal(upgradedReceipt.supersedesApprovalReceiptSha256, sha256(legacyBytes));
    assert.equal(upgradedReceipt.profileSha256, plan.profileSha256);
    assert.equal(applyProfile(plan, args).replay, true);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("profile planner rejects ambiguous, linked, already-installed and default-selected configs", () => {
  for (const config of [
    'default_permissions = "pipeline-wsl-ipc-compat"\n',
    'default_permissions = ":workspace"\nsandbox_mode = "danger-full-access"\n',
  ]) {
    const fixture = profileFixture(config);
    try { assert.equal(fixture.plan().status, "validation-required"); }
    finally { rmSync(fixture.root, { recursive: true, force: true }); }
  }
  const installed = profileFixture(`default_permissions = ":workspace"
[permissions.${PROFILE_NAME}]
extends = ":workspace"
[permissions.${PROFILE_NAME}.network]
enabled = true
dangerously_allow_all_unix_sockets = true
`);
  try { assert.equal(installed.plan().status, "installed"); }
  finally { rmSync(installed.root, { recursive: true, force: true }); }
  const unownedLegacy = profileFixture(`default_permissions = ":workspace"
[permissions.${PROFILE_NAME}]
extends = ":workspace"
[permissions.${PROFILE_NAME}.network]
dangerously_allow_all_unix_sockets = true
`);
  try { assert.equal(unownedLegacy.plan().status, "recovery-required"); }
  finally { rmSync(unownedLegacy.root, { recursive: true, force: true }); }
  const linked = profileFixture();
  try {
    const alias = join(linked.root, "config-alias");
    linkSync(linked.configPath, alias);
    assert.equal(linked.plan().status, "validation-required");
  } finally { rmSync(linked.root, { recursive: true, force: true }); }
});

test("profile apply requires exact confirmation, digest, actor and unchanged preimage", () => {
  const fixture = profileFixture();
  try {
    const plan = fixture.plan();
    const common = {
      configBytes: fixture.config,
      planSha256: plan.planSha256,
      probeReceipt: fixture.probe.receipt,
      probeReceiptSha256: fixture.probe.receiptSha256,
      actor: "operator",
      validator: () => true,
    };
    assert.equal(applyProfile(plan, { ...common, confirmed: false, write: false }).status, "approval-required");
    assert.equal(applyProfile(plan, { ...common, confirmed: true, write: true, planSha256: digest("0") }).status, "digest-drift");
    assert.equal(applyProfile(plan, { ...common, confirmed: true, write: true, actor: "other" }).status, "digest-drift");
    writeFileSync(fixture.configPath, `${fixture.config}# drift\n`, { mode: 0o600 });
    assert.equal(applyProfile(plan, { ...common, confirmed: true, write: true }).status, "digest-drift");
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("profile apply publishes exact config and private approval receipt without changing default, then replays", () => {
  const fixture = profileFixture();
  try {
    const plan = fixture.plan();
    const args = {
      configBytes: fixture.config,
      planSha256: plan.planSha256,
      confirmed: true,
      write: true,
      actor: "operator",
      probeReceipt: fixture.probe.receipt,
      probeReceiptSha256: fixture.probe.receiptSha256,
      validator: () => true,
      now: () => "2026-07-29T12:00:00.000Z",
    };
    const applied = applyProfile(plan, args);
    assert.equal(applied.status, "applied");
    assert.equal(applied.replay, false);
    const post = readFileSync(fixture.configPath, "utf8");
    assert.match(post, new RegExp(`\\[permissions\\.${PROFILE_NAME}\\]`, "u"));
    assert.match(post, /enabled = true/u);
    assert.match(post, /dangerously_allow_all_unix_sockets = true/u);
    assert.equal(/(?:^|\n)\s*(?:domains|allow_local_binding|allow_upstream_proxy|enable_socks5)\s*=/u.test(post), false);
    assert.match(post, /default_permissions = ":workspace"/u);
    assert.equal(/default_permissions\s*=\s*"pipeline-wsl-ipc-compat"/u.test(post), false);
    const receipt = JSON.parse(readFileSync(join(fixture.codexHome, "pipeline-wsl-ipc-approval.json"), "utf8"));
    assert.equal(receipt.planSha256, plan.planSha256);
    assert.equal(receipt.probeReceiptSha256, fixture.probe.receiptSha256);
    assert.equal(applyProfile(plan, args).replay, true);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("active profile validator loads the published profile through the strict bounded sandbox path", () => {
  const fixture = profileFixture();
  try {
    const observed = [];
    const success = strictValidateActiveCodexConfig({
      codexPath: fixture.codexPath,
      codexDigest: fixture.codexSha256,
      codexHome: fixture.codexHome,
      expectedConfigSha256: sha256(fixture.config),
      spawn(executable, argv, options) {
        observed.push({ executable, argv, options });
        if (argv.includes("doctor")) {
          return {
            status: 1,
            stdout: '{"checks":{"config.load":{"status":"ok"}}}',
            stderr: "",
            error: undefined,
            signal: null,
          };
        }
        return { status: 0, stdout: "", stderr: "", error: undefined, signal: null };
      },
    });
    assert.deepEqual(success, {
      ok: true,
      status: "validated",
      code: "validator-active-profile-ok",
      exitCode: 0,
    });
    assert.equal(observed.length, 2);
    assert.equal(observed[0].executable, fixture.codexPath);
    assert.deepEqual(observed[0].argv, ["--strict-config", "doctor", "--json"]);
    assert.notEqual(observed[0].options.env.CODEX_HOME, fixture.codexHome);
    assert.equal(observed[1].executable, fixture.codexPath);
    assert.deepEqual(observed[1].argv, [
      "sandbox",
      "--permission-profile", PROFILE_NAME,
      "--cd", fixture.codexHome,
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);
    assert.equal(observed[1].options.env.CODEX_HOME, fixture.codexHome);
    assert.equal(observed[1].options.cwd, fixture.codexHome);
    assert.equal(observed[1].options.shell, false);
    assert.equal(observed[1].options.timeout, 15_000);

    const timeout = strictValidateActiveCodexConfig({
      codexPath: fixture.codexPath,
      codexDigest: fixture.codexSha256,
      codexHome: fixture.codexHome,
      expectedConfigSha256: sha256(fixture.config),
      spawn: () => ({
        status: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
        signal: null,
      }),
    });
    assert.equal(timeout.code, "validator-timeout");

    const rejected = strictValidateActiveCodexConfig({
      codexPath: fixture.codexPath,
      codexDigest: fixture.codexSha256,
      codexHome: fixture.codexHome,
      expectedConfigSha256: sha256(fixture.config),
      spawn: (executable, argv) => argv.includes("doctor")
        ? {
          status: 1,
          stdout: '{"checks":{"config.load":{"status":"ok"}}}',
          stderr: "",
          error: undefined,
          signal: null,
        }
        : { status: 2, stdout: "", stderr: "rejected", error: undefined, signal: null },
    });
    assert.equal(rejected.code, "validator-active-profile-failed");
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("profile apply uses the strict active-profile readback before publishing its receipt", () => {
  const fixture = profileFixture('default_permissions = ":workspace"\n', `#!/bin/sh
case "$*" in
  *doctor*) printf '%s' '{"checks":{"config.load":{"status":"ok"}}}' ;;
esac
exit 0
`);
  try {
    const plan = fixture.plan();
    const result = applyProfile(plan, {
      configBytes: fixture.config,
      planSha256: plan.planSha256,
      confirmed: true,
      write: true,
      actor: "operator",
      probeReceipt: fixture.probe.receipt,
      probeReceiptSha256: fixture.probe.receiptSha256,
      now: () => "2026-07-29T12:00:00.000Z",
    });
    assert.equal(result.status, "applied");
    assert.equal(result.readback, true);
    assert.equal(existsSync(join(fixture.codexHome, "pipeline-wsl-ipc-approval.json")), true);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("profile apply rolls config back when receipt publication fails", () => {
  const fixture = profileFixture();
  try {
    const plan = fixture.plan();
    let moves = 0;
    const result = applyProfile(plan, {
      configBytes: fixture.config,
      planSha256: plan.planSha256,
      confirmed: true,
      write: true,
      actor: "operator",
      probeReceipt: fixture.probe.receipt,
      probeReceiptSha256: fixture.probe.receiptSha256,
      validator: () => true,
      io: {
        renameSync(source, target) {
          moves += 1;
          if (moves === 2) throw new Error("injected receipt publication failure");
          renameSync(source, target);
        },
      },
    });
    assert.equal(result.status, "rolled-back");
    assert.equal(readFileSync(fixture.configPath, "utf8"), fixture.config);
    assert.equal(existsSync(join(fixture.codexHome, "pipeline-wsl-ipc-approval.json")), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("strict Codex validator distinguishes success, drift, timeout, truncation, spawn and malformed output", () => {
  const fixture = profileFixture();
  try {
    const responses = [
      [{ status: 1, stdout: '{"checks":{"config.load":{"status":"ok"}}}', stderr: "", error: undefined, signal: null }, "validated"],
      [{ status: null, stdout: "", stderr: "", error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), signal: null }, "validator-timeout"],
      [{ status: 1, stdout: "x".repeat(64 * 1024), stderr: "", error: undefined, signal: null }, "validator-output-truncated"],
      [{ status: 1, stdout: "{broken", stderr: "", error: undefined, signal: null }, "validator-output-malformed"],
      [{ status: null, stdout: "", stderr: "", error: Object.assign(new Error("spawn"), { code: "EACCES" }), signal: null }, "validator-spawn-failed"],
    ];
    for (const [child, expected] of responses) {
      const temp = mkdtempSync(join(tmpdir(), "wsl-validator-"));
      const result = strictValidateCodexConfig({
        codexPath: fixture.codexPath,
        codexDigest: fixture.codexSha256,
        configBytes: fixture.config,
        tempHome: temp,
        spawn: () => child,
      });
      assert.equal(result.status === "validated" ? result.status : result.code, expected);
      rmSync(temp, { recursive: true, force: true });
    }
    const driftHome = mkdtempSync(join(tmpdir(), "wsl-validator-"));
    assert.equal(strictValidateCodexConfig({
      codexPath: fixture.codexPath,
      codexDigest: digest("0"),
      configBytes: fixture.config,
      tempHome: driftHome,
      spawn: () => { throw new Error("must not spawn"); },
    }).status, "digest-drift");
    rmSync(driftHome, { recursive: true, force: true });
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("planned postimage validator checks exact bytes in an isolated private CODEX_HOME", () => {
  const fixture = profileFixture();
  try {
    let observedHome = null;
    const result = strictValidateProfilePostimage({
      codexPath: fixture.codexPath,
      codexDigest: fixture.codexSha256,
      configBytes: fixture.config,
      spawn(executable, argv, options) {
        assert.equal(executable, fixture.codexPath);
        assert.deepEqual(argv, ["--strict-config", "doctor", "--json"]);
        observedHome = options.env.CODEX_HOME;
        assert.notEqual(observedHome, fixture.codexHome);
        assert.equal(readFileSync(join(observedHome, "config.toml"), "utf8"), fixture.config);
        return {
          status: 1,
          stdout: '{"checks":{"config.load":{"status":"ok"}}}',
          stderr: "",
          error: undefined,
          signal: null,
        };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(existsSync(observedHome), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("CLI emits one complete digest-bound apply action and rejects extra arguments", () => {
  const fixture = profileFixture();
  try {
    writeFileSync(fixture.codexPath, `#!/usr/bin/env node
if (process.argv.includes("sandbox")) process.exit(0);
process.stdout.write(JSON.stringify({checks:{"config.load":{status:"ok"}}}));
process.exitCode=1;
`, { mode: 0o700 });
    chmodSync(fixture.codexPath, 0o700);
    const codexSha256 = sha256(readFileSync(fixture.codexPath));
    const configSha256 = sha256(fixture.config);
    const receipt = probe("confirmed", identity({ codexSha256, configSha256 }));
    const receiptPath = join(fixture.root, "probe.json");
    writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
    const base = [
      "--codex-home", fixture.codexHome,
      "--codex", fixture.codexPath,
      "--probe-receipt", receiptPath,
      "--actor", "operator",
    ];
    const planned = spawnSync(process.execPath, [CLI, "plan-profile", ...base], { encoding: "utf8" });
    assert.equal(planned.status, 0, JSON.stringify({ stdout: planned.stdout, stderr: planned.stderr, error: planned.error?.message, signal: planned.signal }));
    const plan = JSON.parse(planned.stdout);
    assert.equal(plan.nextAction.requiresConfirmation, true);
    assert.equal(plan.nextAction.argv.includes("<operator>"), false);
    assert.equal(plan.nextAction.argv.includes(plan.planSha256), true);
    const rejected = spawnSync(process.execPath, [CLI, "plan-profile", ...base, "--extra", "x"], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("operation-class sets are closed, disjoint and complete for declared duties", () => {
  assert.equal(new Set([...ELIGIBLE_CLASSES, ...INELIGIBLE_CLASSES]).size, ELIGIBLE_CLASSES.length + INELIGIBLE_CLASSES.length);
  assert.deepEqual(ELIGIBLE_CLASSES, ["coordinator-workspace", "implement", "mechanic", "deep", "test_author"]);
  assert.equal(INELIGIBLE_CLASSES.includes("readiness"), true);
  assert.equal(INELIGIBLE_CLASSES.includes("critic_high_risk"), true);
  assert.equal(INELIGIBLE_CLASSES.includes("release"), true);
});

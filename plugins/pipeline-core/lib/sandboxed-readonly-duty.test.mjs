#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arch, release, tmpdir, type } from "node:os";

import { bindSandboxedReadonlyDuty, buildSandboxedReadonlyRequest, validateSandboxedExecutionReceipt } from "./sandboxed-readonly-duty.mjs";
import { sandboxSelectionDigest } from "../scripts/codex-sandbox-select.mjs";
import { invokeCodexNativeCriticHost, runFixedChild } from "../scripts/codex-native-critic-host.mjs";
import { repositoryFingerprint } from "../lib/codex-onboarding-runtime.mjs";
import { buildNativeCriticSelection, nativeCriticCanonicalDigest } from "./codex-native-critic-policy.mjs";
import { NATIVE_CRITIC_PROHIBITED_FEATURES, NATIVE_CRITIC_REDUCING_CONFIG_SHA256, nativeCriticToolSurfaceConfigDigest, nativeCriticToolSurfaceObservationDigest, reduceDiscoveredNativeMcpServers } from "./codex-native-critic-tools.mjs";

const D = "a".repeat(64);
const DISPATCH = Object.freeze({
  queueRevision: 7,
  candidateCommit: "b".repeat(40),
  candidateTree: "c".repeat(40),
  referenceSetSha256: "d".repeat(64),
});

function request(duty) {
  return buildSandboxedReadonlyRequest({
    duty,
    repoFingerprint: D,
    dispatch: DISPATCH,
    requested: { runner: "codex", model: "gpt-5.6-sol" },
  });
}

function selection(duty) {
  return {
    schema: "pipeline.codex-sandbox-selection.v1",
    selectionId: "css_aaaaaaaaaaaaaaaaaaaaaaaaae",
    repoFingerprint: D,
    duty,
    dispatch: { ...DISPATCH, requestSha256: request(duty).requestSha256 },
    toolchain: { cliVersion: "0.144.6", cliSha256: "0".repeat(64), observedHelperSha256: "1".repeat(64), selectionSchemaSha256: "2".repeat(64) },
    host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6", machine: "x86_64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
    profile: { id: "codex-critic-intermediate.v1", sha256: "4".repeat(64), base: ":read-only", network: { enabled: true }, writableRootClass: "coordinator-scratch-only", scratchRootSha256: "5".repeat(64) },
    preflight: { receiptSha256: "6".repeat(64), eligibility: "intermediate", terminalCode: "eligible", observedAt: "2026-07-19T00:00:00.000Z" },
    compatibilityReceiptSha256: "7".repeat(64),
    status: "selected",
    assurance: {
      class: "sandbox-read-only-except-coordinator-scratch-network-open",
      literal: "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted",
    },
    failureClass: null,
    observedAt: "2026-07-19T00:00:00.000Z",
  };
}

function execution(duty) {
  const current = selection(duty);
  return {
    schema: "pipeline.codex-sandbox-execution-receipt.v1",
    selectionId: current.selectionId,
    selectionSha256: sandboxSelectionDigest(current),
    repoFingerprint: current.repoFingerprint,
    duty,
    dispatch: current.dispatch,
    requested: { runner: "codex", model: "gpt-5.6-sol" },
    observed: {
      cliSha256: current.toolchain.cliSha256,
      profileSha256: current.profile.sha256,
      networkEnabled: current.profile.network.enabled,
      scratchRootSha256: current.profile.scratchRootSha256,
    },
    terminal: { childStarted: true, exitCode: 0, stdioStatus: "complete", cleanupStatus: "complete" },
    assurance: current.assurance,
    dutyReceipt: { schema: `pipeline.${duty}-receipt.v1`, sha256: "4".repeat(64), status: duty === "advisory" ? "answered" : "reviewed" },
    createdAt: "2026-07-19T00:00:00.000Z",
  };
}

test("all Codex read-only duties build one closed selector request from refs-only dispatch evidence", () => {
  for (const duty of ["advisory", "readiness", "critic"]) {
    const value = request(duty);
    assert.equal(value.duty, duty);
    assert.deepEqual(value.dispatch, DISPATCH);
    assert.match(value.requestSha256, /^[a-f0-9]{64}$/u);
    assert.throws(() => buildSandboxedReadonlyRequest({
      duty, repoFingerprint: D, dispatch: DISPATCH, requested: { runner: "codex", model: "gpt-5.6-sol" }, userProse: "network enabled please",
    }));
  }
});

test("all three duties bind exact selection, execution, and duty receipts to one dispatch", () => {
  for (const duty of ["advisory", "readiness", "critic"]) {
    const currentSelection = selection(duty);
    const currentExecution = execution(duty);
    assert.equal(validateSandboxedExecutionReceipt(currentExecution), currentExecution);
    const bound = bindSandboxedReadonlyDuty({ selection: currentSelection, execution: currentExecution });
    assert.equal(bound.selectionSha256, currentExecution.selectionSha256);
    assert.equal(bound.dutyReceipt.sha256, currentExecution.dutyReceipt.sha256);
    assert.throws(() => bindSandboxedReadonlyDuty({
      selection: currentSelection,
      execution: { ...currentExecution, dispatch: { ...currentExecution.dispatch, queueRevision: 8 } },
    }));
    assert.throws(() => bindSandboxedReadonlyDuty({
      selection: currentSelection,
      execution: { ...currentExecution, requested: { runner: "codex", model: "gpt-5.6-terra" } },
    }), /transport evidence drifted/);
    for (const observed of [
      { ...currentExecution.observed, cliSha256: "9".repeat(64) },
      { ...currentExecution.observed, profileSha256: "8".repeat(64) },
      { ...currentExecution.observed, networkEnabled: false },
      { ...currentExecution.observed, scratchRootSha256: "7".repeat(64) },
    ]) {
      assert.throws(() => bindSandboxedReadonlyDuty({
        selection: currentSelection,
        execution: { ...currentExecution, observed },
      }));
    }
  }
});

test("unavailable selection has no child and cannot manufacture a usable duty receipt", () => {
  const value = {
    ...execution("advisory"),
    observed: { cliSha256: null, profileSha256: null, networkEnabled: null, scratchRootSha256: null },
    terminal: { childStarted: false, exitCode: null, stdioStatus: "not-started", cleanupStatus: "not-started" },
    assurance: { class: "no-usable-review", literal: null },
    dutyReceipt: { schema: "pipeline.advisory-receipt.v1", sha256: null, status: "unavailable" },
  };
  assert.equal(validateSandboxedExecutionReceipt(value), value);
  assert.throws(() => bindSandboxedReadonlyDuty({ selection: { ...selection("advisory"), status: "unavailable" }, execution: value }));
});

test("a started child with an error receipt cannot become a usable duty binding", () => {
  for (const duty of ["advisory", "readiness", "critic"]) {
    const currentSelection = selection(duty);
    const currentExecution = { ...execution(duty), dutyReceipt: { ...execution(duty).dutyReceipt, status: "error" } };
    assert.equal(validateSandboxedExecutionReceipt(currentExecution), currentExecution);
    assert.throws(() => bindSandboxedReadonlyDuty({ selection: currentSelection, execution: currentExecution }), /transport evidence drifted/);
  }
});

const NATIVE_NOW = Date.parse("2026-09-09T12:00:00.000Z");
const NATIVE_ROUTE = Object.freeze({ dutyId: "critic_high_risk", runner: "codex", model: "gpt-5.6-terra", effort: "high", sourceSha256: "e".repeat(64), candidateCommit: "b".repeat(40) });
const NATIVE_FEATURE = Object.freeze({ pageCount: 1, dataCount: NATIVE_CRITIC_PROHIBITED_FEATURES.length, digest: "f".repeat(64) });
const NATIVE_MCP = Object.freeze({ pageCount: 1, dataCount: 0, digest: "0".repeat(64) });
const NATIVE_REDUCTION = reduceDiscoveredNativeMcpServers([{ data: [], nextCursor: null }]);
const NATIVE_RECORDS = Object.freeze([{ path: "templates/prompts/critic-review.md", blobOid: "6".repeat(40), sha256: "7".repeat(64) }]);
const NATIVE_TUPLE = Object.freeze({
  cli: { version: "0.153.4", sha256: "1".repeat(64) },
  protocolSchemaSha256: "2".repeat(64),
  host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6.6", machine: "x64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
  policy: { threadSandbox: "read-only", turn: { type: "readOnly", networkAccess: false } },
  toolSurface: { configSha256: nativeCriticToolSurfaceConfigDigest(NATIVE_REDUCTION), observationSha256: nativeCriticToolSurfaceObservationDigest(NATIVE_FEATURE, NATIVE_MCP) },
});
const NATIVE_SMOKE = Object.freeze({
  schema: "pipeline.codex-native-critic-smoke.v1", status: "passed", tuple: NATIVE_TUPLE,
  observed: { initialized: true, readObserved: true, writeObserved: true, nativeWriteDenied: true, canaryUnchanged: true, hostWriteControl: true, sourceUnchanged: true, protocolError: false, guardDenial: false, sandboxLaunchDenied: false, timedOut: false, cleanupComplete: true, terminal: { exitCode: 0, signal: null, spawnFailed: false } },
  capturedAt: "2026-09-09T11:59:00.000Z",
});
function nativeSelection() {
  return buildNativeCriticSelection({
    selectionId: "cncs_aaaaaaaaaaaaaaaaaaaaaaaaaa", repoFingerprint: "4".repeat(64),
    dispatch: { queueRevision: 7, candidateCommit: "b".repeat(40), candidateTree: "c".repeat(40), referenceSetSha256: nativeCriticCanonicalDigest(NATIVE_RECORDS), requestSha256: "e".repeat(64) },
    route: NATIVE_ROUTE, poDecisionSha256: "5".repeat(64), smokeReceipt: NATIVE_SMOKE, smokeReceiptSha256: nativeCriticCanonicalDigest(NATIVE_SMOKE), createdAt: "2026-09-09T11:59:30.000Z",
  }, { validateRoute: () => NATIVE_ROUTE, expectedTuple: NATIVE_TUPLE, nowMs: NATIVE_NOW, maxSmokeAgeMs: 300_000 });
}
function nativeVerdict() { return { findings: [], deliberately_not_flagged: [], trajectory_verdict: "consistent", trajectory_evidence: "fixture", briefing_violations: [], pass: true }; }
function nativeChild(overrides = {}) {
  const observed = {
    provider: "openai", model: NATIVE_ROUTE.model, effort: NATIVE_ROUTE.effort,
    initialized: true, threadStarted: true, turnStarted: true, turnCompleted: true, stdinEnded: true,
    exitCode: 0, signal: null, cleanup: "complete", writeAttemptKind: null,
    requestedNativePolicy: NATIVE_TUPLE.policy,
    requestedToolReduction: { featureConfigSha256: NATIVE_CRITIC_REDUCING_CONFIG_SHA256, mcpReductionCount: 0, mcpReductionConfigSha256: NATIVE_REDUCTION.configSha256 },
    observedThreadSandbox: NATIVE_TUPLE.policy.turn,
    observedThreadReasoningEffort: NATIVE_ROUTE.effort,
    toolSurface: { configSha256: NATIVE_TUPLE.toolSurface.configSha256, observationSha256: NATIVE_TUPLE.toolSurface.observationSha256, mcpReductionCount: 0, featureSnapshot: NATIVE_FEATURE, mcpSnapshot: NATIVE_MCP, snapshotLimitation: "pre-turn thread configuration snapshot; not atomic with turn start" },
  };
  return { result: { schema: "pipeline.codex-native-critic-app-server-child.v1", ok: true, code: "answered", answer: JSON.stringify(nativeVerdict()), observed: { ...observed, ...(overrides.observed ?? {}) } }, terminal: { code: 0, signal: null, error: null, started: true, cleanup: "complete" }, stdoutBytes: 100, stderrBytes: 0, overflow: false, timedOut: false, ...overrides };
}
function nativeDependencies(response = nativeChild()) {
  return {
    nowMs: NATIVE_NOW, resolveRoute: () => NATIVE_ROUTE, runChild: async () => response,
    observePhysical: () => ({ repoRoot: process.cwd(), scratch: process.cwd(), cliPath: process.execPath, referencePaths: ["templates/prompts/critic-review.md"], rolePath: "roles/critic.md", promptPath: "templates/prompts/critic-review.md", verdictPath: "plugins/pipeline-core/scripts/critic-verdict.schema.json" }),
  };
}
function nativeInput() { return { selection: nativeSelection(), expectedTuple: NATIVE_TUPLE, repository: { root: process.cwd(), cliPath: process.execPath }, coordinatorScratch: { path: process.cwd() }, referencePaths: ["templates/prompts/critic-review.md"], referenceRecords: NATIVE_RECORDS, reviewBase: "a".repeat(40) }; }

test("native Critic consumer accepts only a bound native child proof and never emits the legacy sandbox receipt", async () => {
  const value = await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies());
  assert.equal(value.schema, "pipeline.codex-native-critic-host-result.v1");
  assert.equal(value.status, "reviewed");
  assert.equal(value.receipt.schema, "pipeline.codex-native-critic-execution-receipt.v1");
  assert.equal(value.receipt.assurance.class, "native-model-tool-read-only");
  assert.equal(value.receipt.observed.toolSurface.observationSha256, NATIVE_TUPLE.toolSurface.observationSha256);
});

test("native Critic re-observes the reference binding after the child returns", async () => {
  let observations = 0;
  const stablePhysical = nativeDependencies().observePhysical;
  const value = await invokeCodexNativeCriticHost(nativeInput(), {
    ...nativeDependencies(),
    observePhysical: (input) => {
      observations += 1;
      if (observations === 2) throw new Error("reference replaced during review");
      return stablePhysical(input);
    },
  });
  assert.equal(value.code, "physical-proof-drift");
  assert.equal(observations, 2);
});

test("native Critic timeout escalates to the detached process group after its wrapper closes", async () => {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end() {} };
  child.kill = () => {};
  const timers = [];
  const signals = [];
  const schedule = (callback) => {
    const timer = { callback, cancelled: false };
    timers.push(timer);
    return timer;
  };
  const runTimer = (timer) => { if (!timer.cancelled) timer.callback(); };
  const running = runFixedChild({ cwd: process.cwd() }, {
    spawnFn: () => child,
    setTimeoutFn: schedule,
    clearTimeoutFn: (timer) => { timer.cancelled = true; },
    killFn: (pid, signal) => { signals.push([pid, signal]); },
  });
  runTimer(timers[1]);
  child.emit("close", 0, null);
  await Promise.resolve();
  assert.equal(timers[2].cancelled, false, "the SIGKILL grace timer survives wrapper closure");
  runTimer(timers[2]);
  const result = await running;
  assert.equal(result.timedOut, true);
  assert.deepEqual(signals, [[-4242, "SIGTERM"], [-4242, "SIGKILL"]]);
});

test("native Critic consumer rejects selection drift and unsafe child policy without exposing child output", async () => {
  const routeDrift = nativeInput();
  routeDrift.selection = { ...routeDrift.selection, route: { ...routeDrift.selection.route, effort: "low" } };
  const invalidSelection = await invokeCodexNativeCriticHost(routeDrift, nativeDependencies());
  assert.equal(invalidSelection.code, "selection-invalid");
  const unsafe = nativeChild({ result: { ...nativeChild().result, observed: { ...nativeChild().result.observed, observedThreadSandbox: { type: "externalSandbox", networkAccess: true } } } });
  const invalidPolicy = await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies(unsafe));
  assert.equal(invalidPolicy.code, "child-policy-invalid");
  assert.equal("answer" in invalidPolicy, false);
});

test("native Critic consumer fails closed for old wire shapes, tool evidence drift, verdicts, writes, and bounded transport failures", async () => {
  const oldWire = nativeChild({ result: { ...nativeChild().result, schema: "pipeline.codex-critic-app-server-child.v1" } });
  assert.equal((await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies(oldWire))).code, "child-output-invalid");
  const mcpDrift = nativeChild({ result: { ...nativeChild().result, observed: { ...nativeChild().result.observed, toolSurface: { ...nativeChild().result.observed.toolSurface, mcpReductionCount: 1 } } } });
  assert.equal((await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies(mcpDrift))).code, "child-policy-invalid");
  const malformedVerdict = nativeChild({ result: { ...nativeChild().result, answer: "{not JSON" } });
  assert.equal((await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies(malformedVerdict))).code, "child-verdict-invalid");
  const secret = "never-return-this-secret";
  const write = nativeChild({ result: { ...nativeChild().result, ok: false, code: "write-attempt", answer: secret } });
  const writeResult = await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies(write));
  assert.equal(writeResult.code, "child-write-attempt");
  assert.equal(JSON.stringify(writeResult).includes(secret), false);
  const terminalWrite = nativeChild({ result: { ...nativeChild().result, ok: false, code: "write-attempt", answer: secret }, terminal: { code: 2, signal: null, error: null, started: true, cleanup: "complete" } });
  const terminalWriteResult = await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies(terminalWrite));
  assert.equal(terminalWriteResult.code, "child-write-attempt");
  assert.equal(terminalWriteResult.lifecycle.writeAttemptKind, null);
  assert.equal(JSON.stringify(terminalWriteResult).includes(secret), false);
  assert.equal((await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies({ ...nativeChild(), timedOut: true }))).code, "child-timeout");
  assert.equal((await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies({ ...nativeChild(), overflow: true, stdoutBytes: 8 * 1024 * 1024 + 1 }))).code, "child-stream-overflow");
  assert.equal((await invokeCodexNativeCriticHost(nativeInput(), nativeDependencies({ ...nativeChild(), terminal: { code: null, signal: "SIGTERM", error: null, started: true, cleanup: "incomplete" } }))).code, "child-terminal-invalid");
});

test("native Critic consumer does not let path, tuple, or physical-observation drift activate a child", async () => {
  const escaped = nativeInput();
  escaped.referencePaths = ["../pipeline.user.yaml"];
  assert.equal((await invokeCodexNativeCriticHost(escaped, nativeDependencies())).code, "input-invalid");
  const tupleDrift = nativeInput();
  tupleDrift.expectedTuple = { ...NATIVE_TUPLE, cli: { ...NATIVE_TUPLE.cli, sha256: "9".repeat(64) } };
  assert.equal((await invokeCodexNativeCriticHost(tupleDrift, nativeDependencies())).code, "selection-invalid");
  let spawned = false;
  const unavailable = await invokeCodexNativeCriticHost(nativeInput(), { ...nativeDependencies(), observePhysical: () => { throw new Error("CLI or ruleset drift"); }, runChild: async () => { spawned = true; return nativeChild(); } });
  assert.equal(unavailable.code, "physical-proof-unavailable");
  assert.equal(spawned, false);
});

test("native Critic default physical observer binds candidate sources and ignored candidate-bound evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "native-critic-host-"));
  try {
    mkdirSync(join(root, "specs"), { recursive: true }); mkdirSync(join(root, "evidence"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "evidence/\n"); writeFileSync(join(root, "specs", "review.md"), "candidate source\n");
    execFileSync("git", ["init"], { cwd: root }); execFileSync("git", ["config", "user.email", "fixture@example.test"], { cwd: root }); execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
    execFileSync("git", ["add", ".gitignore", "specs/review.md"], { cwd: root }); execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
    writeFileSync(join(root, "evidence", "verify-latest.json"), JSON.stringify({ candidate: { commit, tree } }));
    const cli = join(root, "fake-codex"); writeFileSync(cli, "#!/bin/sh\necho 0.153.4\n"); chmodSync(cli, 0o755);
    const sourceBytes = readFileSync(join(root, "specs", "review.md")); const evidenceBytes = readFileSync(join(root, "evidence", "verify-latest.json"));
    const records = [
      { path: "specs/review.md", blobOid: execFileSync("git", ["rev-parse", `${commit}:specs/review.md`], { cwd: root, encoding: "utf8" }).trim(), sha256: createHash("sha256").update(sourceBytes).digest("hex") },
      { path: "evidence/verify-latest.json", sha256: createHash("sha256").update(evidenceBytes).digest("hex"), candidate: { commit, tree } },
    ];
    const tuple = { ...NATIVE_TUPLE, cli: { version: "0.153.4", sha256: createHash("sha256").update(readFileSync(cli)).digest("hex") }, host: { platformClass: "linux-wsl2", kernel: { sysname: type(), release: release(), machine: arch() }, filesystemClass: "wsl2-native", bootIdSha256: createHash("sha256").update("boot").digest("hex") } };
    const smoke = { ...NATIVE_SMOKE, tuple };
    const route = { ...NATIVE_ROUTE, candidateCommit: commit };
    const selected = buildNativeCriticSelection({ selectionId: "cncs_bbbbbbbbbbbbbbbbbbbbbbbbbb", repoFingerprint: repositoryFingerprint(root), dispatch: { queueRevision: 1, candidateCommit: commit, candidateTree: tree, referenceSetSha256: nativeCriticCanonicalDigest(records), requestSha256: "9".repeat(64) }, route, poDecisionSha256: "a".repeat(64), smokeReceipt: smoke, smokeReceiptSha256: nativeCriticCanonicalDigest(smoke), createdAt: "2026-09-09T11:59:30.000Z" }, { validateRoute: () => route, expectedTuple: tuple, nowMs: NATIVE_NOW, maxSmokeAgeMs: 300_000 });
    const response = nativeChild(); response.result.observed = { ...response.result.observed, toolSurface: { ...response.result.observed.toolSurface, configSha256: tuple.toolSurface.configSha256, observationSha256: tuple.toolSurface.observationSha256 } };
    const input = { selection: selected, expectedTuple: tuple, repository: { root, cliPath: cli }, coordinatorScratch: { path: root }, referencePaths: records.map(({ path }) => path), referenceRecords: records, reviewBase: commit };
    const deps = { nowMs: NATIVE_NOW, resolveRoute: () => route, runChild: async () => response, readFileSync: (path) => path === "/proc/version" ? "Linux Microsoft" : path === "/proc/self/mountinfo" ? `1 0 0:1 / ${root} rw - ext4 /dev/root rw\n` : "boot" };
    assert.equal((await invokeCodexNativeCriticHost(input, deps)).status, "reviewed");
    const wrongFingerprint = { ...input, selection: { ...selected, repoFingerprint: "f".repeat(64) } }; assert.equal((await invokeCodexNativeCriticHost(wrongFingerprint, deps)).code, "physical-proof-unavailable");
    writeFileSync(join(root, "specs", "review.md"), "mutated\n"); assert.equal((await invokeCodexNativeCriticHost(input, deps)).code, "physical-proof-unavailable");
    writeFileSync(join(root, "specs", "review.md"), sourceBytes); writeFileSync(join(root, "evidence", "verify-latest.json"), JSON.stringify({ candidate: { commit: "0".repeat(40), tree } })); assert.equal((await invokeCodexNativeCriticHost(input, deps)).code, "physical-proof-unavailable");
    symlinkSync("../specs", join(root, "linked")); const escaped = { ...input, referencePaths: ["linked/review.md", records[1].path], referenceRecords: [{ ...records[0], path: "linked/review.md" }, records[1]], selection: { ...selected, dispatch: { ...selected.dispatch, referenceSetSha256: nativeCriticCanonicalDigest([{ ...records[0], path: "linked/review.md" }, records[1]]) } } }; assert.equal((await invokeCodexNativeCriticHost(escaped, deps)).code, "physical-proof-unavailable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

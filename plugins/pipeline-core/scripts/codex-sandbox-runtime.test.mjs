#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import {
  NATIVE_CRITIC_ASSURANCE,
  NATIVE_CRITIC_POLICY,
  buildNativeCriticSelection,
  nativeCriticCanonicalDigest,
  validateNativeCriticPolicy,
  validateNativeCriticSmokeReceipt,
} from "../lib/codex-native-critic-policy.mjs";
import { coalesceInputCoveredRuntimeReads, createCodexSandboxRuntimeTransport } from "./codex-sandbox-runtime.mjs";
import { compilePermissionProfile } from "./codex-sandbox-preflight.mjs";

const SCRIPT = new URL("./codex-sandbox-runtime.mjs", import.meta.url);
const CONTEXT = { repoFingerprint: "a".repeat(64), referenceSetSha256: "b".repeat(64) };

const NATIVE_NOW_MS = Date.parse("2026-09-09T08:00:00.000Z");
const NATIVE_POLICY_OPTIONS = Object.freeze({ nowMs: NATIVE_NOW_MS, maxAgeMs: 60_000 });
function nativeTuple() {
  return {
    cli: { version: "codex-cli 0.153.4", sha256: "1".repeat(64) },
    protocolSchemaSha256: "2".repeat(64),
    host: { platformClass: "linux-wsl2", kernel: { sysname: "Linux", release: "6.18.33.2-microsoft-standard-WSL2", machine: "x64" }, filesystemClass: "wsl2-native", bootIdSha256: "3".repeat(64) },
    policy: structuredClone(NATIVE_CRITIC_POLICY),
    toolSurface: { configSha256: "4".repeat(64), observationSha256: "5".repeat(64) },
  };
}
function nativeSmoke(tuple = nativeTuple()) {
  return {
    schema: "pipeline.codex-native-critic-smoke.v1", status: "passed", tuple: structuredClone(tuple),
    observed: {
      initialized: true, readObserved: true, writeObserved: true, nativeWriteDenied: true,
      canaryUnchanged: true, hostWriteControl: true, sourceUnchanged: true, protocolError: false,
      guardDenial: false, sandboxLaunchDenied: false, timedOut: false, cleanupComplete: true,
      terminal: { exitCode: 0, signal: null, spawnFailed: false },
    },
    capturedAt: "2026-09-09T07:59:30.000Z",
  };
}
function nativeSelectionInput() {
  const smokeReceipt = nativeSmoke();
  return {
    selectionId: `cncs_${"a".repeat(26)}`,
    repoFingerprint: "6".repeat(64),
    dispatch: { queueRevision: 7, candidateCommit: "7".repeat(40), candidateTree: "8".repeat(40), referenceSetSha256: "9".repeat(64), requestSha256: "a".repeat(64) },
    route: { dutyId: "critic_high_risk", runner: "codex", model: "gpt-6-astra", effort: "max", sourceSha256: "b".repeat(64), candidateCommit: "7".repeat(40) },
    poDecisionSha256: "c".repeat(64), smokeReceipt,
    smokeReceiptSha256: nativeCriticCanonicalDigest(smokeReceipt),
    createdAt: "2026-09-09T07:59:45.000Z",
  };
}
function nativeSelectionOptions(validateRoute = (route) => structuredClone(route), expectedTuple = nativeTuple()) {
  return { validateRoute, expectedTuple, nowMs: NATIVE_NOW_MS, maxSmokeAgeMs: 60_000 };
}

test("native Critic policy accepts only the approved per-tool read-only policy", () => {
  assert.deepEqual(validateNativeCriticPolicy(structuredClone(NATIVE_CRITIC_POLICY)), NATIVE_CRITIC_POLICY);
  for (const policy of [
    { threadSandbox: "read-only", turn: { type: "externalSandbox", networkAccess: false } },
    { threadSandbox: "read-only", turn: { type: "readOnly", networkAccess: true } },
    { threadSandbox: "read-only", turn: { type: "readOnly", networkAccess: false, writableRoots: [] } },
    { id: "codex-critic-intermediate.v1", base: ":read-only" },
  ]) assert.throws(() => validateNativeCriticPolicy(policy));
});

test("native Critic smoke accepts the real-proof shape only when its tuple and terminal facts bind", () => {
  const tuple = nativeTuple();
  assert.deepEqual(validateNativeCriticSmokeReceipt(nativeSmoke(tuple), tuple, NATIVE_POLICY_OPTIONS).tuple, tuple);
  const mutations = [
    (receipt) => { receipt.observed.writeObserved = false; },
    (receipt) => { receipt.observed.nativeWriteDenied = false; },
    (receipt) => { receipt.observed.canaryUnchanged = false; },
    (receipt) => { receipt.observed.sourceUnchanged = false; },
    (receipt) => { receipt.observed.protocolError = true; },
    (receipt) => { receipt.observed.guardDenial = true; },
    (receipt) => { receipt.observed.sandboxLaunchDenied = true; },
    (receipt) => { receipt.observed.timedOut = true; },
    (receipt) => { receipt.observed.cleanupComplete = false; },
    (receipt) => { receipt.observed.terminal.exitCode = 1; },
    (receipt) => { receipt.capturedAt = "2026-09-09T08:00:01.000Z"; },
    (receipt) => { receipt.capturedAt = "2026-09-09T07:58:00.000Z"; },
    (receipt) => { receipt.capturedAt = "2026-02-30T07:59:30.000Z"; },
    (receipt) => { receipt.tuple.cli.sha256 = "f".repeat(64); },
    (receipt) => { receipt.tuple.host.bootIdSha256 = "e".repeat(64); },
    (receipt) => { receipt.tuple.host.platformClass = "linux-native"; },
    (receipt) => { receipt.tuple.toolSurface.observationSha256 = "d".repeat(64); },
  ];
  for (const mutate of mutations) {
    const receipt = nativeSmoke(tuple); mutate(receipt);
    assert.throws(() => validateNativeCriticSmokeReceipt(receipt, tuple, NATIVE_POLICY_OPTIONS));
  }
});

test("native Critic selection binds V3 authority, candidate dispatch, PO decision and exact smoke digest without a fallback", () => {
  const input = nativeSelectionInput();
  const selected = buildNativeCriticSelection(input, nativeSelectionOptions());
  assert.equal(selected.schema, "pipeline.codex-native-critic-selection.v1");
  assert.equal(selected.status, "selected");
  assert.deepEqual(selected.assurance, NATIVE_CRITIC_ASSURANCE);
  for (const mutate of [
    (value) => { value.selectionId = `css_${"a".repeat(25)}a`; },
    (value) => { value.dispatch.candidateCommit = "d".repeat(40); },
    (value) => { value.route.candidateCommit = "e".repeat(40); },
    (value) => { value.smokeReceiptSha256 = "f".repeat(64); },
    (value) => { value.smokeReceipt.tuple.policy.turn.networkAccess = true; },
    (value) => { value.smokeReceipt.tuple.toolSurface.configSha256 = "d".repeat(64); },
  ]) {
    const value = nativeSelectionInput(); mutate(value);
    assert.throws(() => buildNativeCriticSelection(value, nativeSelectionOptions()));
  }
  assert.throws(() => buildNativeCriticSelection(nativeSelectionInput(), nativeSelectionOptions((route) => ({ ...route, model: "fallback" }))));
  for (const mutateExpected of [
    (tuple) => { tuple.cli.sha256 = "d".repeat(64); },
    (tuple) => { tuple.host.bootIdSha256 = "e".repeat(64); },
    (tuple) => { tuple.toolSurface.configSha256 = "f".repeat(64); },
  ]) {
    const expectedTuple = nativeTuple(); mutateExpected(expectedTuple);
    assert.throws(() => buildNativeCriticSelection(nativeSelectionInput(), nativeSelectionOptions(undefined, expectedTuple)));
  }
});

test("covered production runtime reads are coalesced before the strict compiler while sibling reads remain explicit", (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-covered-reads-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const inputRoot = realpathSync(mkdirSync(join(root, "input"), { recursive: true }));
  const outputRoot = realpathSync(mkdirSync(join(root, "output"), { recursive: true }));
  const deniedRoot = realpathSync(mkdirSync(join(root, "denied"), { recursive: true }));
  const sensitiveRoot = realpathSync(mkdirSync(join(root, "sensitive"), { recursive: true }));
  const siblingRoot = realpathSync(mkdirSync(join(root, "input-sibling"), { recursive: true }));
  const child = join(inputRoot, "production-helper.mjs");
  const sibling = join(siblingRoot, "runtime-helper.mjs");
  const outputHelper = join(outputRoot, "runtime-helper.mjs");
  const deniedHelper = join(deniedRoot, "runtime-helper.mjs");
  const sensitiveHelper = join(sensitiveRoot, "runtime-helper.mjs");
  writeFileSync(child, "export {};\n");
  writeFileSync(sibling, "export {};\n");
  writeFileSync(outputHelper, "export {};\n");
  writeFileSync(deniedHelper, "export {};\n");
  writeFileSync(sensitiveHelper, "export {};\n");
  const reads = coalesceInputCoveredRuntimeReads(inputRoot, [inputRoot, realpathSync(child), realpathSync(sibling), siblingRoot, "/proc/self", "/dev/null"]);
  assert.deepEqual(reads, ["/dev/null", "/proc/self", realpathSync(sibling), siblingRoot].sort());
  assert.doesNotThrow(() => compilePermissionProfile("intermediate", {
    inputRoot, outputRoot, runtimeReadSet: reads.filter((path) => path !== siblingRoot), deniedRoots: [deniedRoot], sensitiveRoots: [sensitiveRoot], sandboxCwd: inputRoot,
  }));
  assert.throws(() => compilePermissionProfile("intermediate", {
    inputRoot, outputRoot, runtimeReadSet: [realpathSync(child)], deniedRoots: [deniedRoot], sensitiveRoots: [sensitiveRoot], sandboxCwd: inputRoot,
  }), /overlap or alias/);
  for (const overlap of [outputHelper, deniedHelper, sensitiveHelper]) {
    assert.throws(() => compilePermissionProfile("intermediate", {
      inputRoot, outputRoot, runtimeReadSet: [realpathSync(overlap)], deniedRoots: [deniedRoot], sensitiveRoots: [sensitiveRoot], sandboxCwd: inputRoot,
    }), /overlap or alias/);
  }
  const alias = join(root, "runtime-helper-alias.mjs");
  symlinkSync(sibling, alias);
  assert.throws(() => coalesceInputCoveredRuntimeReads(inputRoot, [alias]), /must be physical/);
});

test("the standard runtime adapter rejects missing or caller-shaped host coordinates before preflight or a model launch", () => {
  assert.throws(() => createCodexSandboxRuntimeTransport({ sandboxContext: CONTEXT }));
  assert.throws(() => createCodexSandboxRuntimeTransport({ sandboxContext: CONTEXT, sandboxRuntime: {
    schema: "pipeline.codex-sandbox-runtime.v1", repoRoot: "/not-a-repository", codexPath: "/not-a-codex", observedHelperPath: null,
  } }));
  assert.throws(() => createCodexSandboxRuntimeTransport({ sandboxContext: { ...CONTEXT, userProse: "network enabled please" } }));
});

test("the standard adapter derives selection evidence locally and never embeds a direct model-launch or unsafe-mode escape", async () => {
  const source = await readFile(SCRIPT, "utf8");
  assert.equal(source.includes("runCodexSandboxPreflight"), true);
  assert.equal(source.includes("createRepositorySandboxSelectionStore"), true);
  assert.equal(source.includes("inspectSessionClosure"), true);
  assert.equal(source.includes("compilePermissionProfile(\"intermediate\""), true);
  assert.equal(source.includes("validateCodexSandboxState"), true);
  assert.equal(source.includes("sandboxStateJson"), true);
  assert.equal(source.includes("selectedProfile.sha256"), true);
  assert.equal(source.includes("selectedProfile.sha !=="), false);
  assert.equal(source.includes("return structuredClone(readback.profile)"), true);
  assert.equal(source.includes("store.readScratch(selectionId)"), true);
  assert.equal(source.includes("store.readRequest(requestSha256)"), true);
  assert.equal(source.includes("maxEvidenceAgeMs"), true);
  assert.equal(source.includes("canonicalJson, loadCompatibilityPolicy"), true);
  assert.equal(source.includes(".agent-pipeline-scratch-canary"), true);
  assert.equal(source.includes("registerTemporaryIntent"), true);
  assert.equal(source.includes("inspectTemporaryResource"), true);
  assert.equal(source.includes("sealTemporaryResource"), true);
  assert.equal(source.includes("refreshScratch: true"), true);
  assert.equal(source.includes("resealCoordinatorScratch"), true);
  assert.equal(source.includes("resealScratch({ selectionId, profile })"), true);
  assert.equal(source.includes("danger-full-access"), false);
  assert.equal(source.includes("spawn("), false);
});

// ---------------------------------------------------------------------------
// Closes the runtime<->preflight wiring gap named in
// backlog/items/2026-07-19-codex-sandbox-critic-longterm.md's NVA-BL-CSANDBOX-2
// scoping note: both tests above stop before (case 1) or route around (case 2,
// a static source-text grep) the actual call this module makes into
// codex-sandbox-preflight.mjs. The tests below exercise that call for real --
// through createCodexSandboxRuntimeTransport()'s own selection.* methods,
// against codex-sandbox-preflight.mjs's real, unmocked exports -- proving the
// wiring genuinely connects, not merely that both modules mention each
// other's names.
//
// The two cases below are reached via two different real integration seams
// (compiledIntermediateReadback's compilePermissionProfile()/
// validateCodexSandboxState() call, and runPreflight()'s
// runCodexSandboxPreflight() call) and two different consumption channels
// (return value vs. return value/thrown error). The first case
// (createCoordinatorScratch()) reaches a genuine PASSING outcome since the
// deniedRoots fix landed (dispatch NVA-BL-CSDENIED-1, backlog item
// codex-sandbox-runtime-deniedroots-proc-collides-with-proc-self-in-the-runtime-read-set):
// compiledIntermediateReadback() no longer collides with its own runtime read
// set, so this call path now reaches a real, structurally valid compiled
// profile end-to-end instead of failing closed. The second case
// (runPreflight()/observeHost()) remains a FAILING-preflight-outcome case --
// see setupRuntime()'s and the first test's comments for why a PASSING
// preflight *receipt* is not obtainable from this module's current,
// unmodified code without either a live, fully sandbox-capable Codex CLI
// (explicitly out of scope, matching this suite's sibling's own established
// live-subprocess limitation) or reproducing genuine OS-level sandbox
// enforcement inside a test double (which would itself be exactly the kind of
// "runtime-side stub standing in for the whole module" this dispatch's DoD
// forbids). This remains an explicit open item in the dispatch report, not
// silently worked around.
// ---------------------------------------------------------------------------

function writeFakeCodex(root) {
  const path = join(root, "fake-codex.mjs");
  // A minimal, real, directly-executable stand-in for the Codex CLI: answers
  // --version (needed by codex-sandbox-preflight.mjs's own inspectCodex())
  // and fails closed on anything else, including the "sandbox" and
  // "app-server" subcommands codex-sandbox-preflight.mjs also invokes. This
  // is a real subprocess actually spawned by the real, unmodified preflight
  // code -- not a mock of any preflight export -- but it deliberately cannot
  // ever produce a passing ("ok") preflight receipt (see the file-level
  // comment above): a genuine "ok" needs a real app-server JSON-RPC handshake
  // and real sandbox-enforced write denial, neither of which this stand-in
  // (or any non-live-Codex substitute) can honestly provide.
  writeFileSync(path, [
    "#!/usr/bin/env node",
    "const argv = process.argv.slice(2);",
    "if (argv[0] === \"--version\") { process.stdout.write(\"fake-codex 0.144.6\\n\"); process.exit(0); }",
    "process.stderr.write(\"fake-codex: unsupported subcommand\\n\");",
    "process.exit(1);",
    "",
  ].join("\n"), { mode: 0o755 });
  chmodSync(path, 0o755);
  return realpathSync(path);
}

// Builds one throwaway git repository -- codex-sandbox-runtime.mjs's runtime
// wiring resolves session/store state through the repository's real git
// common dir (createRepositorySandboxSelectionStore -> resolvePoGateRepositoryTopology
// -> `git rev-parse --show-toplevel`); there is no lighter-weight seam that
// bypasses this -- with one real, registered session descriptor
// (worktree-lifecycle.mjs's own startSessionDescriptor(), the same production
// function real callers use), and a real (non-Codex, non-sandboxing)
// executable standing in for the Codex CLI binary. Returns a fully
// constructed, real createCodexSandboxRuntimeTransport() instance; the
// throwaway repository is removed via t.after().
function setupRuntime(t) {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "codex-runtime-wiring-")));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const init = spawnSync("git", ["init", "-q", repoRoot], { encoding: "utf8" });
  assert.equal(init.status, 0, `git init failed: ${init.stderr}`);
  const session = startSessionDescriptor(repoRoot, { sessionId: "wiring-probe-session" });
  // The fake codex binary is deliberately placed OUTSIDE repoRoot (a sibling
  // temp dir), not nested inside it: compiledIntermediateReadback() folds
  // codexPath into runtimeReadSet, and compilePermissionProfile()'s overlap
  // check (real, unmocked) rejects any runtimeReadSet entry nested under
  // inputRoot exactly as it rejects any other alias/overlap -- a fixture
  // codexPath inside the fixture repoRoot would fail closed for a reason
  // unrelated to the deniedRoots/sensitiveRoots collision this suite is
  // about, masking whether that specific fix actually works.
  const codexHostRoot = realpathSync(mkdtempSync(join(tmpdir(), "codex-runtime-wiring-codex-")));
  t.after(() => rmSync(codexHostRoot, { recursive: true, force: true }));
  const codexPath = writeFakeCodex(codexHostRoot);
  return createCodexSandboxRuntimeTransport({
    sandboxContext: CONTEXT,
    sandboxRuntime: {
      schema: "pipeline.codex-sandbox-runtime.v1", repoRoot, codexPath, observedHelperPath: null,
      sessionCleanup: { sessionId: session.sessionId, descriptorSha256: session.descriptorSha256 },
    },
  });
}

function scratchRequest() {
  return { repoFingerprint: CONTEXT.repoFingerprint, duty: "advisory", queueRevision: 1, candidateCommit: "c".repeat(40), candidateTree: "d".repeat(40), referenceSetSha256: CONTEXT.referenceSetSha256, runner: "codex", model: "wiring-probe-model" };
}

test("selection.createCoordinatorScratch() makes a real, unmocked call into codex-sandbox-preflight.mjs's compilePermissionProfile()/validateCodexSandboxState(), and now reaches a genuine PASSING compiled profile end-to-end", (t) => {
  const transport = setupRuntime(t);
  // Before dispatch NVA-BL-CSDENIED-1's fix, compiledIntermediateReadback()
  // (this module's own, only call site for these two preflight exports)
  // hardcoded deniedRoots: ["/proc"], while codex-sandbox-preflight.mjs's own
  // resolveNodeRuntimeReadSet() -- which this module also calls,
  // unconditionally, to build its runtimeReadSet -- always includes the
  // literal path "/proc/self", nested under "/proc". Every real
  // "intermediate" readback/scratch call through this exact wiring failed
  // closed with "overlap or alias" (compilePermissionProfile()'s real,
  // unmocked overlap check). deniedRoots is now ["/proc/sys"]: a sibling of
  // "/proc/self" under the same parent, never a sub/superpath of it, so this
  // call now reaches compilePermissionProfile()/validateCodexSandboxState()
  // and returns a real, structurally valid "intermediate" compiled profile --
  // not a caught fail() exception -- confirmed empirically against this exact
  // runtime call path (not merely against compilePermissionProfile() in
  // isolation), on a physically valid repoRoot/codexPath, not an engineered
  // fixture.
  const scratch = transport.selection.createCoordinatorScratch(scratchRequest());
  assert.match(scratch.sandboxStateSha256, /^[a-f0-9]{64}$/);
  assert.match(scratch.profileRawSha256, /^[a-f0-9]{64}$/);
  const state = JSON.parse(scratch.sandboxStateJson);
  assert.equal(state.permissionProfile.network, "enabled");
  assert.deepEqual(state.permissionProfile.file_system.entries.map((entry) => entry.access), ["read", "write"]);
  assert.equal(state.permissionProfile.file_system.entries[0].path.type, "special");
  assert.equal(state.permissionProfile.file_system.entries[0].path.value.kind, "root");
  assert.equal(state.permissionProfile.file_system.entries[1].path.path, scratch.path);
  // selection.readbackProfile() (compiledIntermediateReadback's second,
  // distinct call site in this module) resolves the same in-memory pending
  // scratch by its scratchRootSha256 and also now reaches the same real
  // compiled profile, rather than failing closed.
  const readback = transport.selection.readbackProfile({ profile: { sha256: scratch.profileRawSha256, scratchRootSha256: scratch.sha256 } });
  assert.equal(readback.sha256, scratch.profileRawSha256);
  assert.equal(readback.scratchRootSha256, scratch.sha256);
});

test("selection.runPreflight() and selection.observeHost() make a real, unmocked call into codex-sandbox-preflight.mjs's runCodexSandboxPreflight(), and a real TERMINAL_CODES failure receipt is consumed via the runtime module's own return value, not silently swallowed", async (t) => {
  const transport = setupRuntime(t);
  const result = await transport.selection.runPreflight();
  assert.deepEqual(Object.keys(result).sort(), ["eligibility", "receiptSha256", "terminalCode"]);
  assert.equal(result.eligibility, "none");
  assert.equal(result.terminalCode, "child-stdio-error");
  assert.match(result.receiptSha256, /^[a-f0-9]{64}$/);

  const observed = await transport.selection.observeHost();
  const receipt = observed.compatibilityObservation.preflight.receipt;
  assert.equal(receipt.schema, "pipeline.codex-sandbox-preflight.v1");
  assert.equal(receipt.terminalCode, "child-stdio-error");
  assert.equal(receipt.eligibility, "none");
  // observeHost() and runPreflight() share the SAME internal preflight call
  // (memoized within one transport instance) -- prove they observed the
  // identical real receipt, not two independent/divergent evaluations.
  assert.equal(receipt.terminalCode, result.terminalCode);
});

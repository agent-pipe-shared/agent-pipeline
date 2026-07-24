#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import {
  FIXED_BUDGETS,
  CLAIMS_SCHEMA,
  IsolatedCriticContractError,
  REQUEST_SCHEMA,
  VERDICT_SCHEMA,
  advanceLifecycle,
  buildReceipt,
  canonicalJson,
  createJournal,
  decideCleanup,
  dispatchPaths,
  evaluateLease,
  filePersistence,
  inputSetSha256,
  loadJournal,
  observeHeartbeat,
  recordCleanup,
  recordOutputObservation,
  recordSemanticProgress,
  recordTerminal,
  recordVerdictBytes,
  recordVerdictReceived,
  recoveryDecision,
  schemaArtifacts,
  sha256,
  validateClaims,
  validateReceipt,
  validateRecordedVerdict,
  validateRequest,
  validateRequestShape,
  validateVerdictValue,
  writeReceipt,
} from "./codex-isolated-critic-contract.mjs";
import { symlinkSkip } from "../lib/symlink-capability.mjs";
import { assessWindowsPrivatePath } from "../lib/windows-private-state.mjs";

const H = Object.freeze({
  dispatch: "1".repeat(32),
  attempt: "2".repeat(32),
  coordinator: "3".repeat(32),
  commit: "4".repeat(40),
  tree: "5".repeat(40),
  diff: "6".repeat(64),
  profile: "7".repeat(64),
  preflight: "8".repeat(64),
  evidence: "9".repeat(64),
});

class MemoryPersistence {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
    this.replaceCount = 0;
    this.artifactWriteCount = 0;
    this.conflictNextReplace = false;
  }

  ensureDirectory(path) {
    this.directories.add(path);
  }

  exists(path) {
    return this.files.has(path) || this.directories.has(path);
  }

  list(path) {
    const prefix = `${path}/`;
    return [...this.files.keys()]
      .filter((candidate) => candidate.startsWith(prefix) && !candidate.slice(prefix.length).includes("/"))
      .map((candidate) => basename(candidate))
      .sort();
  }

  read(path) {
    if (!this.files.has(path)) throw new Error(`missing memory file ${path}`);
    return Buffer.from(this.files.get(path));
  }

  createExclusive(path, bytes) {
    if (this.files.has(path)) throw new Error(`existing memory file ${path}`);
    this.directories.add(dirname(path));
    this.files.set(path, Buffer.from(bytes));
  }

  replace(path, expectedRawSha256, bytes) {
    const current = this.read(path);
    if (this.conflictNextReplace) {
      this.conflictNextReplace = false;
      this.files.set(path, Buffer.from("concurrent-writer\n"));
    }
    if (sha256(this.read(path)) !== expectedRawSha256) {
      throw new IsolatedCriticContractError("F3-CAS", "journal changed before replacement");
    }
    assert.ok(current.length > 0);
    this.files.set(path, Buffer.from(bytes));
    this.replaceCount += 1;
  }

  writeArtifactExclusive(path, bytes) {
    if (this.files.has(path)) throw new Error(`existing memory artifact ${path}`);
    this.files.set(path, Buffer.from(bytes));
    this.artifactWriteCount += 1;
  }
}

function disposable(t) {
  const root = mkdtempSync(join(tmpdir(), "isolated-critic-f3-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const commonDir = join(root, "common");
  const inputRoot = join(root, "inputs");
  mkdirSync(commonDir);
  mkdirSync(inputRoot);
  const spec = Buffer.from("# Bound spec\n");
  const diff = Buffer.from("diff --git a/a b/a\n");
  writeFileSync(join(inputRoot, "spec.md"), spec);
  writeFileSync(join(inputRoot, "candidate.diff"), diff);
  return { root, commonDir, inputRoot, spec, diff };
}

function makeRequest(fixture, overrides = {}) {
  const inputs = [
    { kind: "spec", path: "spec.md", rawSha256: sha256(fixture.spec), size: fixture.spec.length },
    { kind: "candidate-diff", path: "candidate.diff", rawSha256: sha256(fixture.diff), size: fixture.diff.length },
  ];
  const request = {
    schema: REQUEST_SCHEMA,
    dispatchNonce: H.dispatch,
    attemptNonce: H.attempt,
    candidate: { commit: H.commit, tree: H.tree, diffSha256: H.diff },
    inputs,
    inputSetSha256: inputSetSha256(inputs),
    permissionProfile: { id: "codex-linux-default-off-v1", rawSha256: H.profile },
    cli: { version: "codex-cli-test", compatibilityClass: "codex-cli-v1" },
    platform: { os: "linux", kernelClass: "linux-test", filesystemClass: "native-linux" },
    preflight: { schema: "pipeline.codex-sandbox-preflight.v1", rawSha256: H.preflight },
    verdictSchemaSha256: schemaArtifacts().verdict.rawSha256,
    budgets: { ...FIXED_BUDGETS },
    process: {
      hostBootId: "boot-test-1",
      pid: 41001,
      processStartId: "start-test-1",
      pgid: 41001,
      coordinatorNonce: H.coordinator,
    },
    createdAtMs: 1_000,
  };
  return Object.assign(request, structuredClone(overrides));
}

function setupMemory(t, { now = 1_000 } = {}) {
  const fixture = disposable(t);
  const persistence = new MemoryPersistence();
  const request = makeRequest(fixture);
  const clock = () => now;
  createJournal({ commonDir: fixture.commonDir, request, inputRoot: fixture.inputRoot, persistence, clock });
  const context = { commonDir: fixture.commonDir, dispatchNonce: request.dispatchNonce, persistence };
  return { fixture, persistence, request, context, get now() { return now; }, set now(value) { now = value; }, clock };
}

function verdictFor(request, { pass = true, ...resultOverrides } = {}) {
  return {
    schema: VERDICT_SCHEMA,
    dispatchNonce: request.dispatchNonce,
    attemptNonce: request.attemptNonce,
    candidate: structuredClone(request.candidate),
    inputSetSha256: request.inputSetSha256,
    result: {
      findings: pass ? [] : [{
        gap: "A fixed-contract gap",
        risk: "The candidate could violate isolation",
        severity: "major",
        evidence: "candidate.diff:1",
        specRef: "F3 lifecycle",
      }],
      deliberatelyNotFlagged: ["Style-only differences"],
      trajectoryVerdict: "consistent",
      trajectoryEvidence: "The fixed diff and requested tree agree.",
      briefingViolations: [],
      pass,
      ...resultOverrides,
    },
  };
}

function exactObservation(request, { running = false, ...overrides } = {}) {
  return {
    running,
    hostBootId: request.process.hostBootId,
    pid: request.process.pid,
    processStartId: request.process.processStartId,
    pgid: request.process.pgid,
    coordinatorNonce: request.process.coordinatorNonce,
    ...overrides,
  };
}

/**
 * Node synthesizes `.mode` on native Windows from the read-only attribute
 * alone, so an exact-0600 mode-bit comparison is meaningless there (see
 * `assertPrivateFile` in codex-isolated-critic-contract.mjs). On win32 this
 * instead positively asserts the real DACL-secured state; on POSIX it keeps
 * the exact mode-0600 assertion.
 */
function assertPrivateFileMode(path) {
  if (process.platform === "win32") {
    assert.equal(assessWindowsPrivatePath(path).status, "secure");
  } else {
    assert.equal(lstatSync(path).mode & 0o777, 0o600);
  }
}

function claimsFixture() {
  const proven = (kind, locator) => ({
    state: "proven",
    evidence: [{ kind, locator, rawSha256: H.evidence }],
  });
  return {
    schema: CLAIMS_SCHEMA,
    briefingBounded: proven("briefing", "evidence/briefing.json"),
    inputConfined: proven("input-manifest", "evidence/input-set.json"),
    technicallyIsolatedReadOnly: proven("sandbox-preflight", "evidence/preflight.json"),
    verdictIntegrity: proven("verdict", "evidence/verdict-binding.json"),
  };
}

function advanceToTurn(state) {
  for (const type of ["sandbox-started", "thread-started", "turn-started"]) {
    state.now += 1;
    advanceLifecycle(state.context, type, sha256(Buffer.from(type)), { clock: state.clock });
  }
}

function recordAndReceive(state, verdict) {
  state.now += 1;
  const bytes = Buffer.from(canonicalJson(verdict));
  recordVerdictBytes(state.context, bytes, { clock: state.clock });
  state.now += 1;
  recordVerdictReceived(state.context, { clock: state.clock });
  return bytes;
}

test("all four owned schemas parse and close their root vocabulary", () => {
  const artifacts = schemaArtifacts();
  assert.deepEqual(Object.keys(artifacts).sort(), ["journal", "receipt", "request", "verdict"]);
  for (const artifact of Object.values(artifacts)) {
    assert.equal(artifact.schema.additionalProperties, false);
    assert.match(artifact.rawSha256, /^[0-9a-f]{64}$/);
    assert.doesNotThrow(() => JSON.parse(readFileSync(artifact.path, "utf8")));
  }
  const journalSchema = artifacts.journal.schema;
  assert.equal(journalSchema.properties.events.items.additionalProperties, false);
  assert.ok(journalSchema.properties.events.items.allOf.length >= 7);
  for (const name of ["preparedBody", "lifecycleBody", "semanticBody", "verdictReceivedBody", "validatedBody", "cleanupBody", "terminalBody"]) {
    assert.equal(journalSchema.$defs[name].additionalProperties, false);
  }
});

test("request binds exact ordered physical inputs and rejects closed-schema drift", (t) => {
  const fixture = disposable(t);
  const request = makeRequest(fixture);
  assert.equal(validateRequest(request, { inputRoot: fixture.inputRoot }), request);

  const extra = structuredClone(request);
  extra.futureField = true;
  assert.throws(() => validateRequestShape(extra), { code: "F3-SCHEMA" });

  const reordered = structuredClone(request);
  reordered.inputs.reverse();
  assert.throws(() => validateRequestShape(reordered), { code: "F3-INPUT-DIGEST" });

  writeFileSync(join(fixture.inputRoot, "unexpected.txt"), "not requested\n");
  assert.throws(() => validateRequest(request, { inputRoot: fixture.inputRoot }), { code: "F3-INPUT-MATERIALIZATION" });
});

test("request materialization rejects symlinks and hard links", { skip: symlinkSkip() }, (t) => {
  const fixture = disposable(t);
  const request = makeRequest(fixture);
  symlinkSync("spec.md", join(fixture.inputRoot, "alias.md"));
  assert.throws(() => validateRequest(request, { inputRoot: fixture.inputRoot }), { code: "F3-INPUT-SYMLINK" });
  rmSync(join(fixture.inputRoot, "alias.md"));
  linkSync(join(fixture.inputRoot, "spec.md"), join(fixture.inputRoot, "alias.md"));
  assert.throws(() => validateRequest(request, { inputRoot: fixture.inputRoot }), { code: "F3-INPUT-HARDLINK" });
});

test("journal begins before model start and enforces the lifecycle vocabulary", (t) => {
  const state = setupMemory(t);
  let loaded = loadJournal(state.context);
  assert.equal(loaded.journal.phase, "prepared");
  assert.equal(loaded.journal.events.length, 1);
  assert.equal(recoveryDecision(state.context).mayStartModel, true);
  assert.throws(() => advanceLifecycle(state.context, "turn-started", H.evidence, { clock: state.clock }), { code: "F3-TRANSITION" });

  advanceToTurn(state);
  loaded = loadJournal(state.context);
  assert.deepEqual(loaded.journal.events.map(({ type }) => type), ["prepared", "sandbox-started", "thread-started", "turn-started"]);
  assert.equal(recoveryDecision(state.context).mayStartModel, false);
  assert.equal(recoveryDecision(state.context).action, "recover-without-repeat");
});

test("heartbeat, PID liveness and noisy output are not semantic progress", (t) => {
  const state = setupMemory(t);
  const before = loadJournal(state.context).journal;
  const heartbeat = observeHeartbeat(state.context, { nowMs: before.createdAtMs + FIXED_BUDGETS.firstEvidenceMs });
  assert.equal(heartbeat.mutated, false);
  assert.equal(heartbeat.revision, before.revision);
  assert.deepEqual(heartbeat, {
    state: "expired",
    terminalCode: "timeout",
    reason: "first-evidence-timeout",
    revision: 0,
    mutated: false,
  });

  advanceToTurn(state);
  const semanticAt = loadJournal(state.context).journal.events.at(-1).observedAtMs;
  state.now = semanticAt + FIXED_BUDGETS.semanticLeaseMs;
  const noisy = { stream: "stdout", startOffset: 0, chunkSha256: H.evidence, byteLength: 4_096 };
  recordOutputObservation(state.context, noisy, { clock: state.clock });
  const afterOutput = loadJournal(state.context).journal;
  assert.equal(afterOutput.events.at(-1).observedAtMs, semanticAt);
  assert.deepEqual(evaluateLease(afterOutput, state.now), {
    state: "expired",
    terminalCode: "lifecycle-stall",
    reason: "semantic-lease-expired",
  });
  const outputReplacements = state.persistence.replaceCount;
  assert.equal(recordOutputObservation(state.context, noisy, { clock: state.clock }).outcome.duplicate, true);
  assert.equal(state.persistence.replaceCount, outputReplacements);

  state.now += 1;
  const progress = { kind: "evidence", contentSha256: sha256(Buffer.from("new evidence")), byteLength: 12 };
  const renewed = recordSemanticProgress(state.context, progress, { clock: state.clock });
  assert.equal(renewed.outcome.renewed, true);
  const replacements = state.persistence.replaceCount;
  state.now += 1;
  const duplicate = recordSemanticProgress(state.context, progress, { clock: state.clock });
  assert.equal(duplicate.outcome.renewed, false);
  assert.equal(state.persistence.replaceCount, replacements);
});

test("stream budgets are fixed at one MiB per stream", (t) => {
  const state = setupMemory(t);
  recordOutputObservation(state.context, {
    stream: "stderr",
    startOffset: 0,
    chunkSha256: H.evidence,
    byteLength: FIXED_BUDGETS.maxStderrBytes,
  }, { clock: state.clock });
  assert.throws(
    () => recordOutputObservation(state.context, {
      stream: "stderr",
      startOffset: FIXED_BUDGETS.maxStderrBytes,
      chunkSha256: H.evidence,
      byteLength: 1,
    }, { clock: state.clock }),
    { code: "F3-STREAM-LIMIT" },
  );
});

test("verdict bytes make retries impossible and success requires validated binding", (t) => {
  const state = setupMemory(t);
  advanceToTurn(state);
  const verdict = verdictFor(state.request, { pass: false });
  recordAndReceive(state, verdict);
  const replay = recoveryDecision(state.context);
  assert.equal(replay.verdictBytesObserved, true);
  assert.equal(replay.mayStartModel, false);
  assert.equal(replay.action, "validate-existing-output-once");

  const validation = validateRecordedVerdict(state.context, { clock: state.clock });
  assert.equal(validation.valid, true);
  assert.equal(validation.reviewPass, false);
  recordCleanup(state.context, exactObservation(state.request), null, { clock: state.clock });
  recordTerminal(state.context, "verdict-success", { clock: state.clock });
  const terminal = loadJournal(state.context).journal;
  assert.equal(terminal.terminal.code, "verdict-success");
  assert.equal(terminal.verdict.reviewPass, false);

  const receipt = buildReceipt(state.context, claimsFixture(), { clock: state.clock });
  assert.equal(receipt.reviewPass, false);
  assert.equal(receipt.terminalCode, "verdict-success");
  assert.doesNotThrow(() => validateReceipt(receipt));
  const rendered = canonicalJson(receipt);
  assert.equal(rendered.includes(state.fixture.root), false);
  assert.equal(rendered.includes(state.fixture.inputRoot), false);

  const first = writeReceipt(state.context, claimsFixture(), { clock: state.clock });
  const writes = state.persistence.artifactWriteCount;
  state.now += 500;
  const second = writeReceipt(state.context, claimsFixture(), { clock: state.clock });
  assert.equal(first.written, true);
  assert.equal(second.written, false);
  assert.equal(state.persistence.artifactWriteCount, writes);
});

test("invalid or misbound verdict can terminate only as verdict-schema-error", (t) => {
  const state = setupMemory(t);
  advanceToTurn(state);
  const verdict = verdictFor(state.request);
  verdict.attemptNonce = "a".repeat(32);
  recordAndReceive(state, verdict);
  const result = validateRecordedVerdict(state.context, { clock: state.clock });
  assert.equal(result.valid, false);
  assert.equal(result.code, "F3-VERDICT-BINDING");
  assert.throws(() => recordTerminal(state.context, "verdict-success", { clock: state.clock }), { code: "F3-TRANSITION" });
  recordCleanup(state.context, exactObservation(state.request), null, { clock: state.clock });
  recordTerminal(state.context, "verdict-schema-error", { clock: state.clock });
  assert.equal(loadJournal(state.context).journal.terminal.code, "verdict-schema-error");
});

test("verdict schema-error is forbidden before verdict-received", (t) => {
  const state = setupMemory(t);
  recordCleanup(state.context, exactObservation(state.request), null, { clock: state.clock });
  assert.throws(() => recordTerminal(state.context, "verdict-schema-error", { clock: state.clock }), { code: "F3-TERMINAL" });
});

test("cleanup decisions rebind boot, PID, start identity and process group", (t) => {
  const state = setupMemory(t);
  const expected = state.request.process;
  assert.deepEqual(decideCleanup(expected, exactObservation(state.request)), { status: "not-needed", ownershipMatched: true });
  assert.deepEqual(decideCleanup(expected, exactObservation(state.request, { running: true }), "complete"), {
    status: "attempted-complete",
    ownershipMatched: true,
  });
  assert.deepEqual(decideCleanup(expected, exactObservation(state.request, { running: true, processStartId: "reused" })), {
    status: "refused-not-owned",
    ownershipMatched: false,
  });
  assert.throws(() => decideCleanup(expected, exactObservation(state.request, { running: true })), { code: "F3-CLEANUP-RESULT" });
});

test("cleanup ownership refusal dominates the requested terminal", (t) => {
  const state = setupMemory(t);
  recordCleanup(state.context, exactObservation(state.request, { running: true, pgid: 99999 }), null, { clock: state.clock });
  const terminal = recordTerminal(state.context, "timeout", { clock: state.clock });
  assert.equal(terminal.outcome.terminalCode, "coordinator-cleanup");
  assert.equal(loadJournal(state.context).journal.cleanup.status, "refused-not-owned");
});

test("journal replay is idempotent, hash-chained and CAS guarded", (t) => {
  const state = setupMemory(t);
  recordCleanup(state.context, exactObservation(state.request), null, { clock: state.clock });
  recordTerminal(state.context, "timeout", { clock: state.clock });
  const replacements = state.persistence.replaceCount;
  recordTerminal(state.context, "timeout", { clock: state.clock });
  assert.equal(state.persistence.replaceCount, replacements);
  assert.throws(() => recordTerminal(state.context, "lifecycle-stall", { clock: state.clock }), { code: "F3-REPLAY-CONFLICT" });
  assert.throws(
    () => recordOutputObservation(state.context, { stream: "stdout", startOffset: 0, chunkSha256: H.evidence, byteLength: 1 }, { clock: state.clock }),
    { code: "F3-TERMINAL" },
  );

  const paths = dispatchPaths(state.fixture.commonDir, state.request.dispatchNonce);
  const original = state.persistence.files.get(paths.journal);
  const tampered = JSON.parse(original.toString("utf8"));
  tampered.events[0].body.requestSha256 = "0".repeat(64);
  state.persistence.files.set(paths.journal, Buffer.from(canonicalJson(tampered)));
  assert.throws(() => loadJournal(state.context), { code: "F3-EVENT-CHAIN" });
});

test("an injected CAS race is detected before replacement", (t) => {
  const state = setupMemory(t);
  state.persistence.conflictNextReplace = true;
  assert.throws(
    () => recordOutputObservation(state.context, { stream: "stdout", startOffset: 0, chunkSha256: H.evidence, byteLength: 1 }, { clock: state.clock }),
    { code: "F3-CAS" },
  );
});

test("crash after verdict-file write still forbids a second model run", (t) => {
  const state = setupMemory(t);
  const paths = dispatchPaths(state.fixture.commonDir, state.request.dispatchNonce);
  state.persistence.writeArtifactExclusive(paths.verdict, Buffer.from(canonicalJson(verdictFor(state.request))));
  const replay = recoveryDecision(state.context);
  assert.equal(replay.verdictBytesObserved, true);
  assert.equal(replay.mayStartModel, false);
  assert.equal(replay.action, "validate-existing-output-once");
});

test("claims require evidence exactly for proven or disproven states", () => {
  const claims = claimsFixture();
  assert.equal(validateClaims(claims), claims);
  const missing = structuredClone(claims);
  missing.inputConfined.evidence = [];
  assert.throws(() => validateClaims(missing), { code: "F3-CLAIMS" });
  const contradictory = structuredClone(claims);
  contradictory.briefingBounded.state = "not-proven";
  assert.throws(() => validateClaims(contradictory), { code: "F3-CLAIMS" });
  const wrongProof = structuredClone(claims);
  wrongProof.technicallyIsolatedReadOnly.evidence[0].kind = "briefing";
  assert.throws(() => validateClaims(wrongProof), { code: "F3-CLAIMS" });
});

test("receipt sanitizer rejects private paths, accounts and remotes", (t) => {
  const state = setupMemory(t);
  recordCleanup(state.context, exactObservation(state.request), null, { clock: state.clock });
  recordTerminal(state.context, "timeout", { clock: state.clock });
  const receipt = buildReceipt(state.context, claimsFixture(), { clock: state.clock });
  receipt.cli.version = "/private/codex";
  assert.throws(() => validateReceipt(receipt), { code: "F3-RECEIPT-SANITIZATION" });
  receipt.cli.version = "account 42";
  assert.throws(() => validateReceipt(receipt), { code: "F3-RECEIPT-SANITIZATION" });
  receipt.cli.version = "remote";
  assert.throws(() => validateReceipt(receipt), { code: "F3-RECEIPT-SANITIZATION" });
});

test("file persistence uses mode 0600 and refuses a torn postimage", (t) => {
  const fixture = disposable(t);
  const request = makeRequest(fixture);
  const created = createJournal({ commonDir: fixture.commonDir, request, inputRoot: fixture.inputRoot, clock: () => 1_000 });
  assertPrivateFileMode(created.paths.journal);

  const context = { commonDir: fixture.commonDir, dispatchNonce: request.dispatchNonce, persistence: filePersistence };
  advanceLifecycle(context, "sandbox-started", H.evidence, { clock: () => 1_001 });
  advanceLifecycle(context, "thread-started", H.evidence, { clock: () => 1_002 });
  advanceLifecycle(context, "turn-started", H.evidence, { clock: () => 1_003 });
  recordVerdictBytes(context, Buffer.from(canonicalJson(verdictFor(request))), { clock: () => 1_004 });
  assertPrivateFileMode(created.paths.verdict);

  const torn = join(created.paths.directory, ".journal.fixture.tmp");
  writeFileSync(torn, "partial\n", { mode: 0o600 });
  chmodSync(torn, 0o600);
  assert.throws(() => loadJournal(context), { code: "F3-TORN-POSTIMAGE" });
});

test("verdict validator closes nested vocabulary and exact request bindings", (t) => {
  const fixture = disposable(t);
  const request = makeRequest(fixture);
  const verdict = verdictFor(request);
  assert.equal(validateVerdictValue(verdict, request), verdict);
  const extra = structuredClone(verdict);
  extra.result.unknown = true;
  assert.throws(() => validateVerdictValue(extra, request), { code: "F3-SCHEMA" });
});

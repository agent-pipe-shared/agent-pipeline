#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROCESS_CAPS,
  buildDiagnosis,
  classifyPublicBaseline,
  mayConfirmAgain,
  persistProcessRun,
  runPublicBaselineCommand,
  runPublicBaselineProcesses,
  validateDiagnosis,
  validateProcessRun,
} from "./public-baseline-diagnose.mjs";
const h = (char = "a", length = 64) => char.repeat(length), oid = h("b", 40), tree = h("c", 40);
const base = {
  repositoryFingerprint: h(), remoteFingerprint: h("d"), ref: "refs/heads/main", commit: oid, tree, commandDigest: h("e"),
  hostCalibration: { schema: "pipeline.public-baseline-host-calibration.v1", status: "ready", receiptPath: "evidence/host.json", rawDigest: h("f"), node: "v24", git: "2.49", platform: "linux", filesystem: "ext4", controlsDigest: h("1") },
  toolchain: { schema: "pipeline.toolchain-preflight-receipt.v1", status: "ready", receiptPath: "evidence/toolchain.json", rawDigest: h("2"), missing: [], scanners: [{ id: "gitleaks", status: "PASS" }] },
  attempts: [{ id: "attempt-1", startedAt: 1, endedAt: 2, failureSignature: null }],
  verify: { exitCode: 0, signal: null, firstStepTimedOut: false, noProgressTimedOut: false, outerTimedOut: false, productStepStarted: true, hostClassifier: null, hostClassifierEvidenceDigest: null, productVerdict: "PASS", focused: null, failureSignature: null, eventsDigest: h("3"), outputTailDigest: h("4") },
  security: { path: "evidence/security.json", rawDigest: h("5"), commit: oid, tree, adapters: [{ id: "gitleaks", status: "PASS" }] },
  priorEvidence: { status: "unavailable", stormSourceDigest: h("6") },
};
let tests = 0; const check = (name, fn) => { fn(); tests++; };
check("green exact rerun", () => assert.equal(classifyPublicBaseline(base).classification, "not-reproduced"));
check("scanner skipped is ambiguous", () => assert.equal(classifyPublicBaseline({ ...base, toolchain: { ...base.toolchain, scanners: [{ id: "gitleaks", status: "SKIPPED" }] } }).classification, "ambiguous"));
check("environment evidence", () => assert.equal(classifyPublicBaseline({ ...base, verify: { ...base.verify, exitCode: 1, productStepStarted: false, hostClassifier: "trusted-environment", hostClassifierEvidenceDigest: h("7"), productVerdict: null } }).classification, "environment-confirmed"));
check("product reproduction", () => assert.equal(classifyPublicBaseline({ ...base, verify: { ...base.verify, exitCode: 1, productStepStarted: true, productVerdict: "FAIL", failureSignature: "same failure", focused: { exitCode: 1, requiredToolsReady: true, commandDigest: h("8"), failureSignature: "same failure", productStep: "focused-step" } } }).classification, "product-confirmed"));
check("caller cannot assert same signature", () => assert.equal(classifyPublicBaseline({ ...base, verify: { ...base.verify, exitCode: 1, productStepStarted: true, productVerdict: "FAIL", failureSignature: "one", focused: { exitCode: 1, requiredToolsReady: true, commandDigest: h("8"), failureSignature: "two", productStep: "focused-step" } } }).classification, "ambiguous"));
check("outer timeout precedence", () => assert.equal(classifyPublicBaseline({ ...base, verify: { ...base.verify, exitCode: 1, outerTimedOut: true, noProgressTimedOut: true } }).reason, "outer-timeout"));
check("unknown input key is ambiguous", () => assert.match(classifyPublicBaseline({ ...base, cause: "caller guess" }).reason, /invalid-contract/));
check("41-character commit OID is rejected", () => assert.match(classifyPublicBaseline({ ...base, commit: h("b", 41) }).reason, /commit invalid/));
check("63-character tree OID is rejected", () => assert.match(classifyPublicBaseline({ ...base, tree: h("c", 63) }).reason, /tree invalid/));
const diagnosisSchema = JSON.parse(readFileSync(new URL("./public-baseline-diagnosis.schema.json", import.meta.url), "utf8"));
check("schema OID accepts only exact SHA-1 or SHA-256 widths", () => {
  const oidPattern = new RegExp(diagnosisSchema.$defs.oid.pattern);
  assert.equal(oidPattern.test(h("a", 40)), true);
  assert.equal(oidPattern.test(h("a", 64)), true);
  assert.equal(oidPattern.test(h("a", 41)), false);
  assert.equal(oidPattern.test(h("a", 63)), false);
});
const record = buildDiagnosis(base);
check("record digest validates", () => assert.equal(validateDiagnosis(record), true));
check("record drift blocks", () => assert.throws(() => validateDiagnosis({ ...record, tree: h("7", 40) }), /digest/));
check("one same-signature confirmation allowed", () => assert.equal(mayConfirmAgain([{ failureSignature: h() }], h()), true));
check("third automatic attempt forbidden", () => assert.equal(mayConfirmAgain([{ failureSignature: h() }, { failureSignature: h() }], h()), false));

const fixture = mkdtempSync(join(tmpdir(), "public-baseline-diagnose-test-"));
const harnessDir = join(fixture, "harness", "scripts");
const focusedDir = join(fixture, "focused");
mkdirSync(harnessDir, { recursive: true });
mkdirSync(focusedDir, { recursive: true });
const fullPath = join(harnessDir, "verify.mjs");
const focusedPath = join(focusedDir, "repeat.mjs");
const secret = "PRIVATE-MACHINE-PATH-MARKER";

function executable(contents, path = fullPath) {
  writeFileSync(path, `// SPDX-License-Identifier: SUL-1.0\n${contents}\n`, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function controlledTimers(triggerMs) {
  const requested = [];
  const native = new Set();
  return {
    requested,
    setTimeoutFn(fn, delay) {
      requested.push(delay);
      if (delay !== triggerMs && !(delay === PROCESS_CAPS.terminateGraceMs && triggerMs !== null)) return { inert: true };
      const handle = setTimeout(fn, delay === PROCESS_CAPS.terminateGraceMs ? 40 : 25);
      native.add(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      if (native.has(handle)) clearTimeout(handle);
      native.delete(handle);
    },
  };
}

function fakeSpawnSequence(sequence, calls = []) {
  let live = null;
  return {
    calls,
    spawnFn(file, args, options) {
      const plan = sequence.shift();
      if (!plan) throw new Error("unexpected extra spawn");
      const child = new EventEmitter();
      child.pid = 424_000 + calls.length;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      calls.push({ file, args, options });
      live = child;
      queueMicrotask(() => {
        if (plan.stdout) child.stdout.write(plan.stdout);
        if (plan.stderr) child.stderr.write(plan.stderr);
        if (plan.close !== false) {
          child.stdout.end();
          child.stderr.end();
          setImmediate(() => child.emit("close", plan.exitCode ?? 0, plan.signal ?? null));
        }
      });
      return child;
    },
    killFn(_pid, signal) {
      if (!live) return;
      const child = live;
      live = null;
      child.stdout.end();
      child.stderr.end();
      queueMicrotask(() => child.emit("close", null, signal));
    },
  };
}

try {
  executable(`console.log("=== alpha (${secret}/alpha.mjs) ===");\nconsole.log("PASS ${secret}");`);
  const spawns = [];
  const green = await runPublicBaselineProcesses({ rootDir: fixture }, {
    environment: { ...process.env, GITHUB_TOKEN: "must-not-reach-child", SSH_AUTH_SOCK: "/private/agent.sock" },
    spawnFn(file, args, options) {
      spawns.push({ file, args, options });
      return spawn(file, args, options);
    },
  });
  check("real Full Verify runner succeeds", () => {
    assert.equal(green.fullVerify.status, "completed");
    assert.equal(green.fullVerify.exitCode, 0);
    assert.equal(validateProcessRun(green), true);
  });
  check("runner uses fixed argv with shell false and a credential-minimal environment", () => {
    assert.equal(spawns.length, 1);
    assert.equal(spawns[0].file, process.execPath);
    assert.deepEqual(spawns[0].args, [fullPath]);
    assert.equal(spawns[0].options.shell, false);
    assert.equal(spawns[0].options.env.GITHUB_TOKEN, undefined);
    assert.equal(spawns[0].options.env.SSH_AUTH_SOCK, undefined);
  });
  check("receipt contains no raw output, argv or machine paths", () => {
    const serialized = JSON.stringify(green);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes(fixture), false);
    assert.equal(serialized.includes("GITHUB_TOKEN"), false);
    assert.equal(Object.hasOwn(green.fullVerify, "stdout"), false);
  });

  const semanticCalls = [];
  const semanticChild = fakeSpawnSequence([{ stdout: `=== alpha (${secret}/alpha.mjs) ===\nPASS ${secret}\n`, exitCode: 0 }], semanticCalls);
  const semantic = await runPublicBaselineProcesses({ rootDir: fixture }, semanticChild);
  check("structured child output creates path-redacted semantic step events", () => {
    assert.equal(semantic.fullVerify.productStepStarted, true);
    assert.equal(semantic.fullVerify.events.some((entry) => entry.type === "step-start"), true);
    assert.equal(semantic.fullVerify.events.some((entry) => entry.type === "step-progress"), true);
    assert.equal(JSON.stringify(semantic).includes(secret), false);
    assert.equal(semanticCalls[0].options.shell, false);
  });

  const receiptPath = join(fixture, "private-receipt.json");
  check("receipt persistence is create-only and mode 0600", () => {
    assert.equal(persistProcessRun(receiptPath, green), green.runDigest);
    assert.equal(statSync(receiptPath).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(receiptPath, "utf8")).runDigest, green.runDigest);
    assert.throws(() => persistProcessRun(receiptPath, green), /EEXIST/);
  });

  executable(`console.log("=== alpha (${secret}/alpha.mjs) ===");\nconsole.error("Error: deterministic failure");\nprocess.exitCode = 7;`);
  executable(`console.log("=== alpha (${secret}/alpha.mjs) ===");\nconsole.error("Error: deterministic failure");\nprocess.exitCode = 7;`, focusedPath);
  const confirmationCalls = [];
  const confirmationChild = fakeSpawnSequence([
    { stdout: `=== alpha (${secret}/alpha.mjs) ===\n`, stderr: "Error: deterministic failure\n", exitCode: 7 },
    { stdout: `=== alpha (${secret}/alpha.mjs) ===\n`, stderr: "Error: deterministic failure\n", exitCode: 7 },
  ], confirmationCalls);
  const confirmed = await runPublicBaselineProcesses({ rootDir: fixture, focusedRelativeFile: "focused/repeat.mjs", requiredToolsReady: true }, {
    ...confirmationChild,
  });
  check("one fixed focused confirmation may follow a product-started failure", () => {
    assert.equal(confirmed.fullVerify.exitCode, 7);
    assert.equal(confirmed.focused?.exitCode, 7);
    assert.equal(confirmed.confirmationAttempted, true);
    assert.equal(confirmationCalls.length, 2);
    assert.equal(confirmed.fullVerify.failureSignatureDigest, confirmed.focused.failureSignatureDigest);
  });

  const blockedCalls = [];
  const blockedChild = fakeSpawnSequence([{ stdout: `=== alpha (${secret}/alpha.mjs) ===\n`, stderr: "Error: deterministic failure\n", exitCode: 7 }], blockedCalls);
  const toolBlocked = await runPublicBaselineProcesses({ rootDir: fixture, focusedRelativeFile: "focused/repeat.mjs", requiredToolsReady: false }, {
    ...blockedChild,
  });
  check("missing required tools suppress the focused run", () => {
    assert.equal(toolBlocked.focused, null);
    assert.equal(toolBlocked.confirmationAttempted, false);
    assert.equal(blockedCalls.length, 1);
  });

  executable("setInterval(() => {}, 1000);");
  const firstTimers = controlledTimers(PROCESS_CAPS.firstStepMs);
  const firstTimeout = await runPublicBaselineCommand({ rootDir: fixture, kind: "full-verify" }, firstTimers);
  check("first-step budget stops the owned process group", () => {
    assert.equal(firstTimeout.status, "first-step-timeout");
    assert.equal(firstTimers.requested.includes(PROCESS_CAPS.firstStepMs), true);
    assert.equal(firstTimers.requested.includes(PROCESS_CAPS.outerMs), true);
  });

  executable(`console.log("=== alpha (${secret}/alpha.mjs) ===");\nsetInterval(() => {}, 1000);`);
  const progressTimers = controlledTimers(PROCESS_CAPS.noProgressMs);
  const progressChild = fakeSpawnSequence([{ stdout: `=== alpha (${secret}/alpha.mjs) ===\n`, close: false }]);
  const progressTimeout = await runPublicBaselineCommand({ rootDir: fixture, kind: "full-verify" }, { ...progressTimers, ...progressChild });
  check("no-progress budget starts only after semantic product progress", () => {
    assert.equal(progressTimeout.status, "no-progress-timeout");
    assert.equal(progressTimeout.productStepStarted, true);
  });

  executable("setInterval(() => {}, 1000);");
  const outerTimers = controlledTimers(PROCESS_CAPS.outerMs);
  const outerTimeout = await runPublicBaselineCommand({ rootDir: fixture, kind: "full-verify" }, outerTimers);
  check("outer budget stops an otherwise live process", () => assert.equal(outerTimeout.status, "outer-timeout"));

  executable("console.log('never reached');");
  const spawnFailure = await runPublicBaselineCommand({ rootDir: fixture, kind: "full-verify" }, {
    spawnFn() { throw Object.assign(new Error(`${secret}/denied`), { code: "EPERM" }); },
  });
  check("spawn errors are typed and redact the raw exception", () => {
    assert.equal(spawnFailure.status, "spawn-error");
    assert.equal(spawnFailure.spawnError, "permission-denied");
    assert.equal(JSON.stringify(spawnFailure).includes(secret), false);
  });
  await assert.rejects(() => runPublicBaselineCommand({ rootDir: fixture, kind: "focused", focusedRelativeFile: "../escape.mjs" }), /escapes repository/);
  tests += 1;
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log(`public-baseline-diagnose: ${tests} tests passed`);

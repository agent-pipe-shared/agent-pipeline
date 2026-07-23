#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { advancePreflightCleanup, buildSandboxInvocation, canonicalJson, classifyPlatform, compilePermissionProfile, decidePreflightCleanup, evaluatePreflight, evaluatePreflightLease, loadProfileIntent, resolveNodeRuntimeReadSet, runBoundedProbe, sha256, validatePreflightReceipt, validateProfileIntent } from "./codex-sandbox-preflight.mjs";

// buildSandboxInvocation validates codexPath/nodePath/payloadPath as
// absolute AND host-canonical (`resolve(path) === path`); it never touches
// the filesystem for them. A bare POSIX literal like "/opt/codex" is already
// canonical on Linux but is rewritten by Windows' resolve() to a
// drive-rooted path, so wrap fixed argv-shape literals through resolve()
// to stay canonical on whichever host the test runs on.
function hostPath(posixLiteral) { return resolve(posixLiteral); }

// `/proc/self` and `/dev/null` are real, `physicalRuntimePath`-recognized
// Linux special files. They are not Windows-resolvable paths (there is no
// procfs, and Node's `resolve()` rewrites a bare "/x" literal to a
// drive-rooted path on win32), so this fixture is not exercising a genuine
// procfs/devnull contract on non-Linux hosts -- it only needs two real,
// canonical, host-resolvable regular files to stand in for them.
function defaultRuntimeReadSet(root) {
  if (process.platform === "linux") return [realpathSync(process.execPath), "/proc/self", "/dev/null"];
  const a = join(root, "runtime-read-a");
  const b = join(root, "runtime-read-b");
  writeFileSync(a, "a");
  writeFileSync(b, "b");
  return [realpathSync(process.execPath), realpathSync(a), realpathSync(b)];
}

function roots(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-preflight-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const make = (name) => { const path = join(root, name); mkdirSync(path); return realpathSync(path); };
  const value = { inputRoot: make("input"), outputRoot: make("output"), runtimeReadSet: defaultRuntimeReadSet(root), deniedRoots: [make("denied")], sensitiveRoots: [make("sensitive")] };
  return { ...value, sandboxCwd: value.inputRoot };
}

function observation(kind = "strong") {
  const profile = loadProfileIntent(kind);
  const entries = kind === "strong"
    ? [{ path: { type: "path", path: "/tmp/input" }, access: "read" }, { path: { type: "path", path: "/usr/bin/node" }, access: "read" }, { path: { type: "path", path: "/lib/libc.so" }, access: "read" }, { path: { type: "path", path: "/proc/self" }, access: "read" }, { path: { type: "path", path: "/dev/null" }, access: "read" }, { path: { type: "path", path: "/tmp/output" }, access: "write" }, { path: { type: "path", path: "/tmp/denied" }, access: "deny" }, { path: { type: "path", path: "/tmp/sensitive" }, access: "deny" }]
    : [{ path: { type: "special", value: { kind: "root" } }, access: "read" }, { path: { type: "path", path: "/tmp/output" }, access: "write" }];
  const state = {
    permissionProfile: { type: "managed", file_system: { type: "restricted", entries }, network: kind === "strong" ? "restricted" : "enabled" },
    sandboxCwd: "file:///tmp/input",
    useLegacyLandlock: false,
  };
  const digest = "a".repeat(64);
  const semantic = { stdinSha256: digest, eofObserved: true, stdoutSha256: "b".repeat(64), stderrSha256: "c".repeat(64), childExit: 7, appServerInitialized: true, appServerBoundedStop: true };
  return {
    kind,
    cli: { version: "0.144.6", artifactSha256: "d".repeat(64) },
    observedHelper: { role: "diagnostic-only", artifactSha256: "d".repeat(64) },
    platform: { os: "linux", kernelClass: "wsl2", filesystemClass: "wsl-native" },
    profile: { value: profile.value, rawSha256: profile.rawSha256 },
    compiledState: { rawSha256: sha256(Buffer.from(canonicalJson(state))) },
    readback: state,
    control: semantic,
    sandbox: { ...semantic },
    probes: { allowedRead: true, externalReadDenied: kind === "strong", sensitiveReadDenied: kind === "strong", writeDenied: true, scratchWriteAllowed: true, networkDenied: kind === "strong" },
    canaries: [{ id: "outside", beforeSha256: "e".repeat(64), afterSha256: "e".repeat(64) }],
    events: [{ type: "control-started", atMs: 1 }, { type: "control-complete", atMs: 2 }, { type: "sandbox-started", atMs: 3 }, { type: "sandbox-complete", atMs: 4 }],
    durationMs: 4,
    streamBytes: { stdout: 10, stderr: 3 },
    terminalCode: "ok",
  };
}

test("committed profile intents are closed and have distinct assurance boundaries", () => {
  assert.equal(validateProfileIntent(loadProfileIntent("strong").value), "strong");
  assert.equal(validateProfileIntent(loadProfileIntent("intermediate").value), "intermediate");
  const weakened = structuredClone(loadProfileIntent("strong").value);
  weakened.networkEnabled = true;
  assert.throws(() => validateProfileIntent(weakened), { code: "profile-error" });
});

test("profile compilation binds physical nonoverlapping roots and fixed shell-free invocation", (t) => {
  const compiled = compilePermissionProfile("strong", roots(t));
  assert.equal(compiled.state.permissionProfile.network, "restricted");
  assert.equal(compiled.state.permissionProfile.file_system.entries.some((entry) => entry.path.type === "special" && entry.path.value.kind === "minimal"), false);
  assert.deepEqual(Object.keys(compiled.state).sort(), ["permissionProfile", "sandboxCwd", "useLegacyLandlock"]);
  assert.match(compiled.profileRawSha256, /^[0-9a-f]{64}$/);
  const sandboxStateJson = compiled.raw.toString("utf8");
  const invocation = buildSandboxInvocation({ codexPath: hostPath("/opt/codex"), sandboxStateJson, sandboxStateSha256: sha256(Buffer.from(sandboxStateJson)), nodePath: hostPath("/usr/bin/node"), payloadPath: hostPath("/opt/preflight.mjs") });
  assert.deepEqual(invocation.argv.slice(0, 3), ["sandbox", "--sandbox-state-json", sandboxStateJson]);
  assert.equal(invocation.options.shell, false);
});

test("CLI-owned helper selection rejects the incompatible explicit helper state", (t) => {
  const fixtureRoots = roots(t);
  const runtimeRoot = realpathSync(mkdtempSync(join(tmpdir(), "codex-preflight-runtime-")));
  t.after(() => rmSync(runtimeRoot, { recursive: true, force: true }));
  const compiled = compilePermissionProfile("intermediate", { ...fixtureRoots, runtimeReadSet: defaultRuntimeReadSet(runtimeRoot) });
  const legacy = JSON.parse(compiled.raw.toString("utf8"));
  legacy.codexLinuxSandboxExe = "/opt/incompatible-bwrap";
  assert.throws(() => buildSandboxInvocation({
    codexPath: hostPath("/opt/codex"), sandboxStateJson: canonicalJson(legacy), sandboxStateSha256: sha256(Buffer.from(canonicalJson(legacy))),
    nodePath: hostPath("/usr/bin/node"), payloadPath: hostPath("/opt/preflight.mjs"),
  }), { code: "profile-error" });
});

test("profile compilation rejects root aliases", (t) => {
  const fixture = roots(t);
  fixture.sensitiveRoots = [fixture.inputRoot];
  assert.throws(() => compilePermissionProfile("strong", fixture), { code: "profile-error" });
});

test("platform classification distinguishes native Linux, WSL native and DrvFS", () => {
  assert.equal(classifyPlatform({ procVersion: "Linux", mountInfo: "1 0 0:1 / / rw - ext4 /dev/root rw", candidateRoot: "/repo" }).filesystemClass, "native-linux");
  assert.equal(classifyPlatform({ procVersion: "Linux microsoft WSL2", mountInfo: "1 0 0:1 / / rw - ext4 /dev/root rw", candidateRoot: "/repo" }).filesystemClass, "wsl-native");
  assert.equal(classifyPlatform({ procVersion: "Linux microsoft WSL2", mountInfo: "1 0 0:1 / / rw - ext4 /dev/root rw\n2 1 0:2 / /mnt/c rw - 9p drvfs rw", candidateRoot: "/mnt/c/repo" }).filesystemClass, "drvfs");
});

test("strong and intermediate receipts never share an assurance boundary", () => {
  const strong = evaluatePreflight(observation("strong"));
  const intermediate = evaluatePreflight(observation("intermediate"));
  assert.equal(strong.eligibility, "strong");
  assert.equal(strong.networkEnabled, false);
  assert.equal(intermediate.eligibility, "intermediate");
  assert.equal(intermediate.networkEnabled, true);
  assert.equal(intermediate.vectors.externalReadDenied, false);
  assert.equal(intermediate.vectors.scratchWriteAllowed, true);
  assert.equal(intermediate.vectors.appServerInitEquivalent, true);
  assert.equal(validatePreflightReceipt(strong), strong);
});

test("the affected lost-stdio vector is ineligible while the documented network-open profile is positive", () => {
  const denied = observation("intermediate");
  denied.sandbox.stderrSha256 = "f".repeat(64);
  denied.probes.networkDenied = true;
  assert.deepEqual(
    { eligibility: evaluatePreflight(denied).eligibility, terminalCode: evaluatePreflight(denied).terminalCode },
    { eligibility: "none", terminalCode: "child-stdio-error" },
  );

  const networkOpen = observation("intermediate");
  const receipt = evaluatePreflight(networkOpen);
  assert.deepEqual(
    { eligibility: receipt.eligibility, networkEnabled: receipt.networkEnabled, terminalCode: receipt.terminalCode },
    { eligibility: "intermediate", networkEnabled: true, terminalCode: "ok" },
  );
  assert.equal(receipt.vectors.appServerInitEquivalent, true);
});

test("stdio mismatch and canary drift fail closed", () => {
  const stdio = observation("strong");
  stdio.sandbox.stdoutSha256 = "f".repeat(64);
  assert.deepEqual({ eligibility: evaluatePreflight(stdio).eligibility, terminalCode: evaluatePreflight(stdio).terminalCode }, { eligibility: "none", terminalCode: "child-stdio-error" });
  const drift = observation("strong");
  drift.canaries[0].afterSha256 = "0".repeat(64);
  assert.deepEqual({ eligibility: evaluatePreflight(drift).eligibility, terminalCode: evaluatePreflight(drift).terminalCode }, { eligibility: "none", terminalCode: "canary-drift" });
});

test("missing no-model app-server initialization fails closed", () => {
  const value = observation("intermediate");
  value.sandbox.appServerInitialized = false;
  assert.deepEqual({ eligibility: evaluatePreflight(value).eligibility, terminalCode: evaluatePreflight(value).terminalCode }, { eligibility: "none", terminalCode: "child-stdio-error" });
});

test("permission and network probe failures are typed, never diagnostic success", () => {
  const permission = observation("strong"); permission.probes.externalReadDenied = false;
  assert.deepEqual({ eligibility: evaluatePreflight(permission).eligibility, terminalCode: evaluatePreflight(permission).terminalCode }, { eligibility: "none", terminalCode: "permission-mismatch" });
  const network = observation("strong"); network.probes.networkDenied = false;
  assert.deepEqual({ eligibility: evaluatePreflight(network).eligibility, terminalCode: evaluatePreflight(network).terminalCode }, { eligibility: "none", terminalCode: "network-mismatch" });
});

test("profile readback and network drift block before eligibility", () => {
  const value = observation("strong");
  value.readback.permissionProfile.network = "enabled";
  assert.throws(() => evaluatePreflight(value), { code: "permission-mismatch" });
});

test("receipt sanitizer rejects private paths and remote material", () => {
  const receipt = evaluatePreflight(observation("intermediate"));
  receipt.cli.version = "/home/private/codex";
  assert.throws(() => validatePreflightReceipt(receipt), { code: "internal-error" });
});

test("PID heartbeats never renew first-event or semantic leases", () => {
  assert.deepEqual(evaluatePreflightLease({ startedAtMs: 0, events: [{ semantic: false, atMs: 29_000, contentSha256: "a".repeat(64) }], nowMs: 30_000 }), { state: "expired", terminalCode: "first-event-timeout" });
  assert.deepEqual(evaluatePreflightLease({ startedAtMs: 0, events: [{ semantic: true, atMs: 1_000, contentSha256: "a".repeat(64) }, { semantic: false, atMs: 60_000, contentSha256: "b".repeat(64) }], nowMs: 61_000 }), { state: "expired", terminalCode: "lifecycle-stall" });
});

test("bounded runner accepts only semantic payload lifecycle and keeps shell disabled", async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-preflight-bounded-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const script = `const s=${JSON.stringify("pipeline.codex-sandbox-preflight-payload.v1")};console.log(JSON.stringify({schema:s,type:"started"}));process.stdin.resume();process.stdin.on("end",()=>console.log(JSON.stringify({schema:s,type:"result"})));`;
  const result = await runBoundedProbe({ command: realpathSync(process.execPath), argv: ["-e", script], cwd: root, env: { PATH: "/usr/bin:/bin" } });
  if (result.close.code === 0 && result.stdout.length === 0) { t.skip("outer Codex sandbox swallowed direct child stdio; host-context test covers this path"); return; }
  assert.equal(result.terminalCode, "ok");
  assert.deepEqual(result.semanticEvents.map(({ type }) => type), ["started", "result"]);
});

// resolveNodeRuntimeReadSet is a fixed Linux-only ELF dependency resolver
// (hardcoded /usr/bin/ldd, Linux ldd output format, /proc/self and /dev/null
// literals) -- there is no Windows equivalent to fall back to, and the
// production function itself fails closed off-Linux. Skip rather than adapt.
test("strong runtime resolver enumerates files without the :minimal macro", { skip: process.platform !== "linux" && "ldd-based resolver is Linux-only" }, () => {
  const values = resolveNodeRuntimeReadSet(realpathSync(process.execPath));
  assert.equal(values.includes(realpathSync(process.execPath)), true);
  assert.equal(values.includes("/proc/self"), true);
  assert.equal(values.includes("/dev/null"), true);
  assert.equal(values.every((value) => value === "/proc/self" || value === "/dev/null" || readFileSync(value).length >= 0), true);
});

test("cleanup rebinds process-group ownership before TERM and KILL", () => {
  const expected = { hostBootId: "boot", pid: 101, processStartId: "start", pgid: 101, coordinatorNonce: "nonce" };
  assert.equal(decidePreflightCleanup(expected, { ...expected, running: true }).signal, "TERM");
  assert.deepEqual(decidePreflightCleanup(expected, { ...expected, processStartId: "reused", running: true }), { action: "none", status: "cleanup-not-owned" });
  assert.deepEqual(advancePreflightCleanup({ priorSignal: "TERM", signaledAtMs: 0, nowMs: 5_000, running: true, ownershipMatched: true }), { action: "signal-process-group", signal: "KILL" });
  assert.deepEqual(advancePreflightCleanup({ priorSignal: "KILL", signaledAtMs: 5_000, nowMs: 10_000, running: true, ownershipMatched: true }), { action: "stop", terminalCode: "cleanup-failed" });
});

test("public payload is inert and contains no Critic or network invocation", () => {
  const payloadUrl = new URL("./fixtures/codex-sandbox-preflight-payload.mjs", import.meta.url);
  const bytes = readFileSync(payloadUrl, "utf8");
  assert.doesNotMatch(bytes, /codex exec|https?:|danger-full-access/);
  assert.doesNotMatch(bytes, /thread\/start|turn\/start/);
  assert.match(bytes, /app-server/);
  assert.match(bytes, /shell: false/);
});

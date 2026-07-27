#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as nativeFs from "node:fs";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PassThrough, Writable } from "node:stream";

import {
  HELPER_PATH, authenticateLaunchTicket, canonicalJson, canonicalSha256, consumeRuntimeReadback, issueLaunchTicket,
  persistRestartBarrier, prepareRuntimeRestartBinding, readCurrentRuntimeReadback, readRestartBarrier,
  resolveRuntimeExecutable, sha256,
} from "./codex-onboarding-runtime.mjs";
import {
  main as runtimeReadbackMain,
  produceRuntimeReadback,
  readNativeConfig,
  RuntimeReadbackError,
  verifyRuntimeReadback,
} from "../scripts/codex-project-runtime-readback-host.mjs";
import { main as onboardingLaunchMain } from "../scripts/codex-onboarding-launch.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "./runtime-projection-v3.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const cases = [];
function test(name, run) { cases.push([name, run]); }
function root() { return mkdtempSync(join(tmpdir(), "codex onboarding runtime matrix with spaces-")); }
function dispose(path) { rmSync(path, { recursive: true, force: true }); }
function git(path) { const result = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: path, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); }
function gitCommon(path) { return () => ({ status: 0, stdout: `${join(path, ".git")}\n`, stderr: "" }); }
function write(rootDir, relativePath, bytes) { const path = join(rootDir, relativePath); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); }
function treeSnapshot(rootDir) {
  const entries = [];
  const visit = (path, relativePath) => {
    const info = nativeFs.lstatSync(path);
    const type = info.isSymbolicLink() ? "symlink" : info.isDirectory() ? "directory" : info.isFile() ? "file" : "other";
    const entry = { path: relativePath, type, mode: info.mode & 0o777 };
    if (type === "file") entry.bytes = nativeFs.readFileSync(path).toString("base64");
    if (type === "symlink") entry.target = nativeFs.readlinkSync(path);
    entries.push(entry);
    if (type === "directory") {
      for (const name of nativeFs.readdirSync(path).sort()) visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
    }
  };
  visit(rootDir, "");
  return entries;
}
function seeded(rootDir) {
  const targets = loadRuntimeProjectionV3OwnedKeys().targets.filter((target) => target.path.startsWith(".codex/")).map((target) => {
    let bytes = "model = \"gpt-test\"\n";
    if (target.path.includes("/agents/")) {
      bytes = target.ownedKeys.map((key) => `${key} = ${JSON.stringify(`${key}-bound`)}\n`).join("");
    }
    write(rootDir, target.path, bytes);
    return { path: target.path, beforeSha256: null, afterSha256: sha256(bytes) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  write(rootDir, "pipeline.user.yaml", "schema: pipeline.user.v3\n");
  return { runtimeTargets: targets, sourceSha256: sha256(readFileSync(join(rootDir, "pipeline.user.yaml"))) };
}
function counterRandom(...values) {
  let index = 0;
  return (size) => Buffer.alloc(size, values[index++] ?? 0x7f);
}
function configReadResponse(rootDir, dotCodexFolder = join(rootDir, ".codex")) {
  const metadata = { name: { type: "project", dotCodexFolder }, version: "test-v1" };
  return {
    config: { model: "gpt-test" },
    origins: { model: metadata },
    layers: [{ ...metadata, config: { model: "gpt-test" }, disabledReason: null }],
  };
}
function remoteControlNotification(overrides = {}) {
  const { params: paramsOverrides = {}, ...topLevelOverrides } = overrides;
  return {
    emittedAtMs: 1_700_000_000_000,
    method: "remoteControl/status/changed",
    params: {
      environmentId: null,
      installationId: "fixture-installation",
      serverName: "fixture-server",
      status: "disabled",
      ...paramsOverrides,
    },
    ...topLevelOverrides,
  };
}
function configWarningNotification(overrides = {}) {
  const { params: paramsOverrides = {}, ...topLevelOverrides } = overrides;
  return {
    emittedAtMs: 1_700_000_000_000,
    method: "configWarning",
    params: {
      details: null,
      summary: "fixture warning",
      ...paramsOverrides,
    },
    ...topLevelOverrides,
  };
}
function configReadChildTransportFixture({
  beforeInitializeResponse = [],
  beforeConfigReadResponse = [remoteControlNotification()],
} = {}) {
  return function childTransport(executable, argv, options) {
    assert.equal(executable, resolveRuntimeExecutable().physicalPath);
    assert.deepEqual(argv, ["--strict-config", "app-server", "--listen", "stdio://"]);
    assert.equal(options.shell, false);
    assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe"]);
    assert.equal(options.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID, undefined);
    assert.equal(options.env.PIPELINE_CODEX_ONBOARDING_TOKEN, undefined);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    let buffer = "";
    let initialized = false;
    let initializationAcknowledged = false;
    const send = (value) => child.stdout.write(`${JSON.stringify(value)}\n`);
    child.stdin = new Writable({
      write(chunk, encoding, callback) {
        buffer += chunk.toString("utf8");
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const message = JSON.parse(line);
          if (message.id === 1) {
            assert.equal(message.method, "initialize");
            assert.equal(initialized, false);
            initialized = true;
            for (const notification of beforeInitializeResponse) send(notification);
            if (child.signalCode === null) {
              send({ id: 1, result: { userAgent: "codex-runtime-readback-fixture" } });
            }
          } else if (message.method === "initialized") {
            assert.equal(initialized, true);
            assert.equal(initializationAcknowledged, false);
            assert.equal(message.id, undefined);
            initializationAcknowledged = true;
          } else if (message.id === 2) {
            assert.equal(initializationAcknowledged, true);
            assert.equal(message.method, "config/read");
            assert.deepEqual(message.params, { cwd: options.cwd, includeLayers: true });
            for (const notification of beforeConfigReadResponse) send(notification);
            if (child.signalCode === null) send({ id: 2, result: configReadResponse(options.cwd) });
          } else assert.fail("unexpected transport message");
        }
        callback();
      },
      final(callback) {
        child.stdout.end();
        child.stderr.end();
        if (child.signalCode === null) {
          child.exitCode = 0;
          setImmediate(() => child.emit("close", 0, null));
        }
        callback();
      },
    });
    child.kill = (signal) => {
      child.signalCode = signal;
      child.stdin.destroy();
      child.stdout.end();
      child.stderr.end();
      setImmediate(() => child.emit("close", null, signal));
      return true;
    };
    return child;
  };
}
const configReadChildTransport = configReadChildTransportFixture();

test("the PATH resolver selects the first symlinked Codex entry and binds its physical executable", () => {
  const path = root();
  try {
    const bin = join(path, "bin");
    mkdirSync(bin);
    symlinkSync(process.execPath, join(bin, "codex"));
    assert.deepEqual(resolveRuntimeExecutable("codex", bin), {
      schema: "pipeline.codex-runtime-executable.v1",
      platform: process.platform,
      requestedName: "codex",
      physicalPath: realpathSync(process.execPath),
      sha256: sha256(readFileSync(realpathSync(process.execPath))),
      resolution: "posix-path-direct",
    });
  } finally { dispose(path); }
});

test("native Windows resolution admits only a physical codex.exe through controlled PATHEXT", () => {
  const path = root();
  try {
    const first = join(path, "first");
    const second = join(path, "second");
    mkdirSync(first); mkdirSync(second);
    writeFileSync(join(first, "codex.cmd"), "wrapper");
    writeFileSync(join(first, "codex.bat"), "wrapper");
    writeFileSync(join(second, "codex.exe"), "physical executable");
    const descriptor = resolveRuntimeExecutable("codex", `${first};${second}`, {
      platform: "win32",
      pathext: ".CMD;.EXE;.BAT",
    });
    assert.equal(descriptor.schema, "pipeline.codex-runtime-executable.v1");
    assert.equal(descriptor.platform, "win32");
    assert.equal(descriptor.requestedName, "codex");
    assert.equal(descriptor.physicalPath, realpathSync(join(second, "codex.exe")));
    assert.equal(descriptor.sha256, sha256("physical executable"));
    assert.equal(descriptor.resolution, "windows-pathext-exe");
    assert.throws(
      () => resolveRuntimeExecutable("codex.cmd", `${first};${second}`, {
        platform: "win32",
        pathext: ".CMD;.EXE;.BAT",
      }),
      (error) => error?.code === "runtime-executable-unsafe"
        && error?.phase === "runtime-executable-resolution",
    );
    assert.throws(
      () => resolveRuntimeExecutable("codex", second, {
        platform: "win32",
        pathext: ".CMD;.BAT",
      }),
      (error) => error?.code === "runtime-executable-unavailable",
    );
    unlinkSync(join(second, "codex.exe"));
    symlinkSync(process.execPath, join(second, "codex.exe"));
    assert.throws(
      () => resolveRuntimeExecutable("codex", second, {
        platform: "win32",
        pathext: ".EXE",
      }),
      (error) => error?.code === "runtime-executable-unsafe",
    );
  } finally { dispose(path); }
});

test("Linux and macOS retain the direct physical extensionless executable contract", () => {
  const path = root();
  try {
    const bin = join(path, "bin");
    mkdirSync(bin);
    symlinkSync(process.execPath, join(bin, "codex"));
    for (const platform of ["linux", "darwin"]) {
      const descriptor = resolveRuntimeExecutable("codex", bin, { platform });
      assert.equal(descriptor.platform, platform);
      assert.equal(descriptor.requestedName, "codex");
      assert.equal(descriptor.physicalPath, realpathSync(process.execPath));
      assert.equal(descriptor.resolution, "posix-path-direct");
    }
    assert.throws(
      () => resolveRuntimeExecutable("codex.exe", bin, { platform: "darwin" }),
      (error) => error?.code === "runtime-executable-unavailable",
    );
  } finally { dispose(path); }
});

test("native Windows restart state consumes owner-DACL assurance instead of projected mode bits", () => {
  const path = root();
  try {
    git(path);
    const fixture = seeded(path);
    const binding = prepareRuntimeRestartBinding({
      rootDir: path,
      ...fixture,
      codexExecutable: process.execPath,
      random: counterRandom(0x91, 0x92),
    });
    const hardened = [];
    const assessed = [];
    const projectedMode = (target) => {
      const info = nativeFs.lstatSync(target);
      return {
        ...info,
        mode: (info.mode & ~0o777) | 0o777,
        isDirectory: () => info.isDirectory(),
        isFile: () => info.isFile(),
        isSymbolicLink: () => info.isSymbolicLink(),
      };
    };
    const deps = {
      platform: "win32",
      spawnSync: gitCommon(path),
      lstatSync: projectedMode,
      hardenWindowsPrivateDirectoryFn(target) {
        hardened.push(target);
        return { status: "secure" };
      },
      assessWindowsPrivatePathFn(target) {
        assessed.push(target);
        return { status: "secure" };
      },
    };
    const stored = persistRestartBarrier({ rootDir: path, binding, deps });
    assert.equal(stored.barrier.state, "restart-required");
    assert.equal(hardened.some((target) => target.endsWith("agent-pipeline")), true);
    assert.equal(hardened.some((target) => target.endsWith("onboarding")), true);
    assert.equal(hardened.some((target) => target.endsWith(".writer-lock")), true);
    assert.equal(assessed.some((target) => target.endsWith(".tmp")), true);
    assert.equal(assessed.some((target) => target.endsWith("restart-barrier.json")), true);
    assert.equal(readRestartBarrier({ rootDir: path, deps }).status, "present");
  } finally { dispose(path); }
});

test("unavailable or insecure Windows private-state assurance fails before barrier publication", () => {
  for (const status of ["unavailable", "insecure"]) {
    const path = root();
    try {
      git(path);
      const fixture = seeded(path);
      const binding = prepareRuntimeRestartBinding({
        rootDir: path,
        ...fixture,
        codexExecutable: process.execPath,
        random: counterRandom(0x93, 0x94),
      });
      assert.throws(
        () => persistRestartBarrier({
          rootDir: path,
          binding,
          deps: {
            platform: "win32",
            spawnSync: gitCommon(path),
            hardenWindowsPrivateDirectoryFn: () => ({ status }),
            assessWindowsPrivatePathFn: () => ({ status }),
          },
        }),
        (error) => error?.phase === "private-root-assurance"
          && error?.code === (status === "insecure"
            ? "private-state-object-unsafe"
            : "private-state-assurance-unavailable"),
      );
      assert.equal(nativeFs.existsSync(join(path, ".git", "agent-pipeline", "onboarding", "restart-barrier.json")), false);
    } finally { dispose(path); }
  }
});

test("the launch wrapper preserves the interactive Codex process contract without exposing its token", () => {
  const successPath = root();
  const failurePath = root();
  const readbackFailurePath = root();
  const tuiFailurePath = root();
  const priorTicketId = process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID;
  const priorToken = process.env.PIPELINE_CODEX_ONBOARDING_TOKEN;
  const priorSentinel = process.env.PIPELINE_ONBOARDING_HOST_ENV_SENTINEL;
  const priorPath = process.env.PATH;
  try {
    const executable = resolveRuntimeExecutable().physicalPath;
    const prepare = (path, random) => {
      git(path);
      const binding = prepareRuntimeRestartBinding({
        rootDir: path, ...seeded(path), codexExecutable: executable, random,
      });
      return persistRestartBarrier({ rootDir: path, binding, spawn: gitCommon(path) });
    };
    const successBarrier = prepare(successPath, counterRandom(0x01, 0x02));
    const failureBarrier = prepare(failurePath, counterRandom(0x03, 0x04));
    const readbackFailureBarrier = prepare(readbackFailurePath, counterRandom(0x05, 0x06));
    const tuiFailureBarrier = prepare(tuiFailurePath, counterRandom(0x07, 0x08));
    delete process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID;
    delete process.env.PIPELINE_CODEX_ONBOARDING_TOKEN;
    process.env.PIPELINE_ONBOARDING_HOST_ENV_SENTINEL = "preserved";

    const externalEnv = { ...process.env };
    delete externalEnv.CODEX_THREAD_ID;
    const invoke = (path, stored, spawn, env = externalEnv) => {
      let stdout = "";
      const status = onboardingLaunchMain([
        "--root", path, "--barrier-sha256", stored.rawSha256, "--activate",
      ], { spawn, write: (chunk) => { stdout += chunk; }, env });
      return { status, stdout };
    };
    const calls = [];
    const success = invoke(successPath, successBarrier, (childExecutable, argv, options) => {
      calls.push({ executable: childExecutable, argv, options });
      if (childExecutable === process.execPath) {
        return {
          status: 0,
          signal: null,
          stdout: `${canonicalJson({
            schema: "pipeline.codex-project-runtime-readback-status.v1",
            status: "produced",
          })}\n`,
          stderr: "",
        };
      }
      return { status: 0 };
    });
    assert.equal(calls.length, 2);
    const [readback, launch] = calls;
    assert.equal(readback.executable, process.execPath);
    assert.deepEqual(readback.argv, [HELPER_PATH, "--root", successPath]);
    const { env: readbackEnv, ...readbackOptions } = readback.options;
    assert.deepEqual(readbackOptions, {
      cwd: successPath,
      encoding: "utf8",
      maxBuffer: 128 * 1024,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 35_000,
    });
    const {
      PIPELINE_CODEX_ONBOARDING_TICKET_ID: childTicketId,
      PIPELINE_CODEX_ONBOARDING_TOKEN: childToken,
      ...readbackInheritedEnv
    } = readbackEnv;
    assert.deepEqual(readbackInheritedEnv, externalEnv);
    assert.match(childTicketId, /^[A-Za-z0-9._-]{1,80}$/u);
    assert.match(childToken, /^[a-f0-9]{64}$/u);

    assert.equal(launch.executable, executable);
    assert.deepEqual(launch.argv, ["-C", successPath, "pipeline-core:pipeline-start"]);
    const { env: launchEnv, ...launchOptions } = launch.options;
    assert.deepEqual(launchOptions, { cwd: successPath, shell: false, stdio: "inherit" });
    assert.deepEqual(launchEnv, externalEnv);
    assert.equal(process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID, undefined);
    assert.equal(process.env.PIPELINE_CODEX_ONBOARDING_TOKEN, undefined);
    assert.equal(success.status, 0);
    assert.deepEqual(JSON.parse(success.stdout), {
      schema: "pipeline.codex-onboarding-launch.v1", status: "launched", ticketId: childTicketId,
    });
    assert.equal(success.stdout.includes(childToken), false);

    let failedToken;
    const failure = invoke(failurePath, failureBarrier, (_childExecutable, _argv, options) => {
      failedToken = options.env.PIPELINE_CODEX_ONBOARDING_TOKEN;
      throw new Error(`sensitive child failure ${failedToken}`);
    });
    assert.equal(failure.status, 2);
    const failed = JSON.parse(failure.stdout);
    assert.deepEqual(Object.keys(failed).sort(), [
      "code", "retryAllowed", "schema", "status", "ticketId",
    ]);
    assert.equal(failed.schema, "pipeline.codex-onboarding-launch.v1");
    assert.equal(failed.status, "readback-unavailable");
    assert.equal(failed.code, "transport-unavailable");
    assert.equal(failed.retryAllowed, true);
    assert.match(failed.ticketId, /^[A-Za-z0-9._-]{1,80}$/u);
    assert.equal(failure.stdout.includes(failedToken), false);
    assert.equal(failure.stdout.includes("sensitive child failure"), false);
    const failedTicket = JSON.parse(readFileSync(join(
      failureBarrier.paths.tickets,
      `${failed.ticketId}.json`,
    ), "utf8"));
    assert.equal(failedTicket.state, "failed");
    assert.equal(failedTicket.failure.code, "transport-unavailable");
    const immediateRetry = issueLaunchTicket({
      rootDir: failurePath,
      barrierSha256: failureBarrier.rawSha256,
      codexExecutable: executable,
      now: failedTicket.failure.failedAtEpochMs + 1,
      random: counterRandom(0x35, 0x36),
    });
    assert.equal(immediateRetry.ticketId.length > 0, true);

    let readbackFailureCalls = 0;
    const readbackFailure = invoke(readbackFailurePath, readbackFailureBarrier, () => {
      readbackFailureCalls += 1;
      return {
        status: 2,
        signal: null,
        stdout: `${canonicalJson({
          schema: "pipeline.codex-project-runtime-readback-status.v1",
          status: "unavailable",
          code: "transport-unavailable",
        })}\n`,
        stderr: "",
      };
    });
    assert.equal(readbackFailureCalls, 1);
    assert.equal(readbackFailure.status, 2);
    const unavailable = JSON.parse(readbackFailure.stdout);
    assert.equal(unavailable.status, "readback-unavailable");
    assert.equal(unavailable.code, "transport-unavailable");
    assert.equal(unavailable.retryAllowed, true);
    assert.match(unavailable.ticketId, /^[A-Za-z0-9._-]{1,80}$/u);
    const unavailableTicket = JSON.parse(readFileSync(join(
      readbackFailureBarrier.paths.tickets,
      `${unavailable.ticketId}.json`,
    ), "utf8"));
    assert.equal(unavailableTicket.state, "failed");
    assert.equal(unavailableTicket.failure.code, "transport-unavailable");

    let tuiCalls = 0;
    const tuiFailure = invoke(tuiFailurePath, tuiFailureBarrier, (childExecutable, argv) => {
      tuiCalls += 1;
      if (childExecutable === process.execPath && argv[0] === HELPER_PATH) {
        return {
          status: 0,
          signal: null,
          stdout: `${canonicalJson({
            schema: "pipeline.codex-project-runtime-readback-status.v1",
            status: "produced",
          })}\n`,
          stderr: "",
        };
      }
      throw new Error("interactive TUI unavailable after readback");
    });
    assert.equal(tuiCalls, 2);
    assert.equal(tuiFailure.status, 0);
    assert.equal(JSON.parse(tuiFailure.stdout).status, "readback-produced");

    const guardedPath = root();
    try {
      const guardedBarrier = prepare(guardedPath, counterRandom(0x31, 0x32));
      let spawned = false;
      const guarded = invoke(
        guardedPath,
        guardedBarrier,
        () => { spawned = true; return { status: 0 }; },
        { ...externalEnv, CODEX_THREAD_ID: "active-codex-thread" },
      );
      assert.equal(guarded.status, 2);
      assert.deepEqual(JSON.parse(guarded.stdout), {
        schema: "pipeline.codex-onboarding-launch.v1",
        status: "external-launch-required",
      });
      assert.equal(spawned, false);
      assert.equal(nativeFs.existsSync(guardedBarrier.paths.tickets), false);
    } finally { dispose(guardedPath); }
  } finally {
    if (priorTicketId === undefined) delete process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID;
    else process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID = priorTicketId;
    if (priorToken === undefined) delete process.env.PIPELINE_CODEX_ONBOARDING_TOKEN;
    else process.env.PIPELINE_CODEX_ONBOARDING_TOKEN = priorToken;
    if (priorSentinel === undefined) delete process.env.PIPELINE_ONBOARDING_HOST_ENV_SENTINEL;
    else process.env.PIPELINE_ONBOARDING_HOST_ENV_SENTINEL = priorSentinel;
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
    dispose(successPath);
    dispose(failurePath);
    dispose(readbackFailurePath);
    dispose(tuiFailurePath);
  }
});

test("a barrier permits only one live issued ticket while expired history remains non-blocking", () => {
  const path = root();
  try {
    git(path);
    const fixture = seeded(path);
    const executable = resolveRuntimeExecutable().physicalPath;
    const binding = prepareRuntimeRestartBinding({
      rootDir: path, ...fixture, codexExecutable: executable, random: counterRandom(0x05, 0x06),
    });
    const host = gitCommon(path);
    const stored = persistRestartBarrier({ rootDir: path, binding, spawn: host });
    const first = issueLaunchTicket({
      rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: executable,
      now: 1_000, random: counterRandom(0x07, 0x08), spawn: host,
    });
    let secondRandomCalls = 0;
    assert.throws(
      () => issueLaunchTicket({
        rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: executable,
        now: 1_001, random: (size) => { secondRandomCalls += 1; return Buffer.alloc(size, 0x09); }, spawn: host,
      }),
      /live launch ticket/u,
    );
    assert.equal(secondRandomCalls, 0, "a rejected parallel issue must not generate a new credential");
    assert.deepEqual(readdirSync(stored.paths.tickets), [`${first.ticketId}.json`]);

    const replacement = issueLaunchTicket({
      rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: executable,
      now: 301_000, random: counterRandom(0x0a, 0x0b), spawn: host,
    });
    assert.equal(authenticateLaunchTicket({
      rootDir: path, ticketId: replacement.ticketId, token: replacement.token, now: 301_001, spawn: host,
    }).ticket.value.state, "issued");
    assert.throws(
      () => authenticateLaunchTicket({
        rootDir: path, ticketId: first.ticketId, token: first.token, now: 301_001, spawn: host,
      }),
      /unavailable or replayed/u,
    );
  } finally { dispose(path); }
});

test("failed initial barrier persistence restores the complete tree preimage at every write stage", () => {
  for (const stage of ["lock", "open", "write", "file-fsync", "close", "rename", "directory-fsync"]) {
    const path = root();
    try {
      git(path);
      const fixture = seeded(path);
      const binding = prepareRuntimeRestartBinding({
        rootDir: path, ...fixture, codexExecutable: process.execPath, random: counterRandom(0x81, 0x82),
      });
      const before = treeSnapshot(path);
      let injected = false;
      let fsyncCalls = 0;
      const fault = () => {
        injected = true;
        const error = new Error(`injected persistence ${stage}`);
        error.code = "EIO";
        throw error;
      };
      const deps = {
        spawnSync: gitCommon(path),
        mkdirSync(target, options) {
          if (!injected && stage === "lock" && target.endsWith(".writer-lock")) fault();
          return nativeFs.mkdirSync(target, options);
        },
        openSync(target, flags, mode) {
          if (!injected && stage === "open" && typeof flags === "number" && target.endsWith(".tmp")) fault();
          return nativeFs.openSync(target, flags, mode);
        },
        writeFileSync(target, bytes, options) {
          if (!injected && stage === "write" && typeof target === "number") fault();
          return nativeFs.writeFileSync(target, bytes, options);
        },
        fsyncSync(fd) {
          fsyncCalls += 1;
          if (!injected && stage === "file-fsync" && fsyncCalls === 1) fault();
          if (!injected && stage === "directory-fsync" && fsyncCalls === 2) fault();
          return nativeFs.fsyncSync(fd);
        },
        closeSync(fd) {
          if (!injected && stage === "close") {
            nativeFs.closeSync(fd);
            fault();
          }
          return nativeFs.closeSync(fd);
        },
        renameSync(source, target) {
          if (!injected && stage === "rename" && target.endsWith("restart-barrier.json")) fault();
          return nativeFs.renameSync(source, target);
        },
      };
      assert.throws(
        () => persistRestartBarrier({ rootDir: path, binding, deps }),
        /injected persistence|cleanup failed|rollback failed/u,
        stage,
      );
      assert.equal(injected, true, `${stage} fault was not reached`);
      assert.deepEqual(treeSnapshot(path), before, `${stage} changed the tree`);
    } finally { dispose(path); }
  }
});

test("failed persistence never removes an identity-drifted private directory and sanitizes rollback failure", () => {
  const path = root();
  try {
    git(path);
    const fixture = seeded(path);
    const binding = prepareRuntimeRestartBinding({
      rootDir: path, ...fixture, codexExecutable: process.execPath, random: counterRandom(0x83, 0x84),
    });
    let foreignPath;
    const deps = {
      spawnSync: gitCommon(path),
      mkdirSync(target, options) {
        if (target.endsWith(".writer-lock")) {
          const onboarding = dirname(target);
          nativeFs.rmdirSync(onboarding);
          nativeFs.mkdirSync(onboarding, { mode: 0o700 });
          foreignPath = join(onboarding, "foreign");
          nativeFs.writeFileSync(foreignPath, "foreign", { mode: 0o600 });
          throw new Error(`sensitive cleanup path ${onboarding}`);
        }
        return nativeFs.mkdirSync(target, options);
      },
    };
    assert.throws(
      () => persistRestartBarrier({ rootDir: path, binding, deps }),
      (error) => error?.message === "restart barrier persistence rollback failed",
    );
    assert.equal(nativeFs.readFileSync(foreignPath, "utf8"), "foreign");
  } finally { dispose(path); }
});

test("duplicate, malformed, and unsafe ticket-set entries fail authentication and consumption without mutation", () => {
  const path = root();
  try {
    git(path);
    const fixture = seeded(path);
    const executable = resolveRuntimeExecutable().physicalPath;
    const binding = prepareRuntimeRestartBinding({
      rootDir: path, ...fixture, codexExecutable: executable, random: counterRandom(0x0c, 0x0d),
    });
    const host = gitCommon(path);
    const stored = persistRestartBarrier({ rootDir: path, binding, spawn: host });
    const issued = issueLaunchTicket({
      rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: executable,
      now: 400_000, random: counterRandom(0x0e, 0x0f), spawn: host,
    });
    const originalPath = join(stored.paths.tickets, `${issued.ticketId}.json`);
    const original = JSON.parse(readFileSync(originalPath, "utf8"));
    const legacy = structuredClone(original);
    delete legacy.failure;
    writeFileSync(originalPath, canonicalJson(legacy), { mode: 0o600 });
    assert.equal(authenticateLaunchTicket({
      rootDir: path,
      ticketId: issued.ticketId,
      token: issued.token,
      now: 400_001,
      spawn: host,
    }).ticket.value.state, "issued", "a live 0.4.6 ticket remains readable after the hotfix");
    writeFileSync(originalPath, canonicalJson(original), { mode: 0o600 });
    const foreignId = "foreign-duplicate";
    const foreignPath = join(stored.paths.tickets, `${foreignId}.json`);
    writeFileSync(foreignPath, canonicalJson({
      ...original, ticketId: foreignId, tokenSha256: sha256(Buffer.alloc(32, 0x10)),
    }), { mode: 0o600 });
    assert.throws(
      () => authenticateLaunchTicket({
        rootDir: path, ticketId: issued.ticketId, token: issued.token, now: 400_001, spawn: host,
      }),
      /unavailable or replayed/u,
    );
    const receipt = {
      schema: "pipeline.codex-project-runtime-readback.v1", barrierSha256: stored.rawSha256,
      repositoryFingerprint: stored.barrier.repositoryFingerprint, sourceSha256: stored.barrier.sourceSha256,
      runtimeTargetsSha256: stored.barrier.runtimeTargetsSha256, readerGenerationSha256: sha256(Buffer.alloc(32, 0x11)),
      effectiveConfigSha256: sha256("effective"), validatedAgentsSha256: sha256("agents"),
      ticketId: issued.ticketId, observedAtEpochMs: 400_001,
    };
    assert.throws(
      () => consumeRuntimeReadback({
        rootDir: path, receipt, ticketId: issued.ticketId, token: issued.token, now: 400_001, spawn: host,
      }),
      /unavailable or replayed/u,
    );
    assert.equal(readRestartBarrier({ rootDir: path, spawn: host }).barrier.state, "restart-required");
    assert.equal(JSON.parse(readFileSync(originalPath, "utf8")).state, "issued");
    rmSync(foreignPath);

    const malformedPath = join(stored.paths.tickets, "malformed.json");
    writeFileSync(malformedPath, "{}", { mode: 0o600 });
    assert.throws(
      () => authenticateLaunchTicket({
        rootDir: path, ticketId: issued.ticketId, token: issued.token, now: 400_001, spawn: host,
      }),
      /launch ticket/u,
    );
    rmSync(malformedPath);

    mkdirSync(join(stored.paths.tickets, "unsafe-entry"), { mode: 0o700 });
    assert.throws(
      () => authenticateLaunchTicket({
        rootDir: path, ticketId: issued.ticketId, token: issued.token, now: 400_001, spawn: host,
      }),
      /unsafe entry/u,
    );
    assert.equal(JSON.parse(readFileSync(originalPath, "utf8")).state, "issued");
  } finally { dispose(path); }
});

test("a runtime barrier is canonical, blocks same-process observation, and clears only through a fresh ticket receipt", () => {
  const path = root();
  try {
    git(path); const fixture = seeded(path);
    const binding = prepareRuntimeRestartBinding({ rootDir: path, ...fixture, codexExecutable: process.execPath, random: counterRandom(0x11, 0x12) });
    const host = gitCommon(path);
    const stored = persistRestartBarrier({ rootDir: path, binding, spawn: host });
    assert.equal(readRestartBarrier({ rootDir: path, spawn: host }).barrier.state, "restart-required");
    assert.equal(stored.rawSha256, sha256(canonicalJson(stored.barrier)));
    const issued = issueLaunchTicket({ rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: process.execPath, now: 1_000, random: counterRandom(0x21, 0x22), spawn: host });
    const receipt = {
      schema: "pipeline.codex-project-runtime-readback.v1", barrierSha256: stored.rawSha256,
      repositoryFingerprint: stored.barrier.repositoryFingerprint, sourceSha256: stored.barrier.sourceSha256,
      runtimeTargetsSha256: stored.barrier.runtimeTargetsSha256, readerGenerationSha256: sha256(Buffer.alloc(32, 0x33)),
      effectiveConfigSha256: sha256("effective"), validatedAgentsSha256: sha256("agents"), ticketId: issued.ticketId, observedAtEpochMs: 1_001,
    };
    assert.throws(() => consumeRuntimeReadback({ rootDir: path, receipt: { ...receipt, readerGenerationSha256: stored.barrier.writerGenerationSha256 }, ticketId: issued.ticketId, token: issued.token, now: 1_001, spawn: host }), /fresh barrier/u);
    const consumed = consumeRuntimeReadback({ rootDir: path, receipt, ticketId: issued.ticketId, token: issued.token, now: 1_001, spawn: host });
    assert.equal(consumed.barrier.state, "cleared");
    assert.equal(readRestartBarrier({ rootDir: path, spawn: host }).barrier.state, "cleared");
    assert.throws(() => authenticateLaunchTicket({ rootDir: path, ticketId: issued.ticketId, token: issued.token, now: 1_002, spawn: host }), /unavailable or replayed/u);
    const nextBinding = prepareRuntimeRestartBinding({
      rootDir: path, ...fixture, codexExecutable: process.execPath, random: counterRandom(0x34, 0x35),
    });
    const nextBarrier = persistRestartBarrier({ rootDir: path, binding: nextBinding, spawn: host });
    const nextIssued = issueLaunchTicket({
      rootDir: path, barrierSha256: nextBarrier.rawSha256, codexExecutable: process.execPath,
      now: 1_003, random: counterRandom(0x36, 0x37), spawn: host,
    });
    assert.equal(authenticateLaunchTicket({
      rootDir: path, ticketId: nextIssued.ticketId, token: nextIssued.token, now: 1_004, spawn: host,
    }).ticket.value.state, "issued", "consumed ticket history must not block a later barrier");
  } finally { dispose(path); }
});

test("readback publication refuses a concurrently replaced ticket or barrier without claiming ready", () => {
  for (const replacement of ["ticket", "barrier"]) {
    const path = root();
    try {
      git(path); const fixture = seeded(path);
      const binding = prepareRuntimeRestartBinding({
        rootDir: path, ...fixture, codexExecutable: process.execPath, random: counterRandom(0x71, 0x72),
      });
      const host = gitCommon(path);
      const stored = persistRestartBarrier({ rootDir: path, binding, spawn: host });
      const issued = issueLaunchTicket({
        rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: process.execPath,
        now: 50_000, random: counterRandom(0x73, 0x74), spawn: host,
      });
      const ticketPath = join(stored.paths.tickets, `${issued.ticketId}.json`);
      const target = replacement === "ticket" ? ticketPath : stored.paths.barrier;
      const original = JSON.parse(readFileSync(target, "utf8"));
      const foreign = replacement === "ticket"
        ? { ...original, tokenSha256: sha256(Buffer.alloc(32, 0x75)) }
        : { ...original, transactionId: "foreign-barrier" };
      const foreignRaw = canonicalJson(foreign);
      const foreignPath = join(dirname(target), `.foreign-${replacement}.json`);
      let injected = false;
      const deps = {
        fsyncSync(fd) {
          if (!injected) {
            injected = true;
            writeFileSync(foreignPath, foreignRaw, { mode: 0o600, flag: "wx" });
            nativeFs.renameSync(foreignPath, target);
          }
          return nativeFs.fsyncSync(fd);
        },
      };
      const receipt = {
        schema: "pipeline.codex-project-runtime-readback.v1", barrierSha256: stored.rawSha256,
        repositoryFingerprint: stored.barrier.repositoryFingerprint, sourceSha256: stored.barrier.sourceSha256,
        runtimeTargetsSha256: stored.barrier.runtimeTargetsSha256,
        readerGenerationSha256: sha256(Buffer.alloc(32, 0x76)),
        effectiveConfigSha256: sha256("effective"), validatedAgentsSha256: sha256("agents"),
        ticketId: issued.ticketId, observedAtEpochMs: 50_001,
      };
      assert.throws(
        () => consumeRuntimeReadback({
          rootDir: path, receipt, ticketId: issued.ticketId, token: issued.token, now: 50_001,
          spawn: host, deps,
        }),
        /private-state publication CAS drifted/u,
      );
      assert.equal(readFileSync(target, "utf8"), foreignRaw, `${replacement} replacement must not be overwritten`);
      assert.equal(readRestartBarrier({ rootDir: path, spawn: host }).barrier.state, "restart-required");
      let readbackStatus = "unavailable";
      try { readbackStatus = readCurrentRuntimeReadback({ rootDir: path, spawn: host }).status; } catch {}
      assert.notEqual(readbackStatus, "current", "a rejected publication must not make runtime readiness observable");
    } finally { dispose(path); }
  }
});

test("the strict host helper requires a bound executable, ticket, fresh generation, config origin, and agent postimages", async () => {
  const path = root();
  try {
    git(path); const fixture = seeded(path);
    const binding = prepareRuntimeRestartBinding({ rootDir: path, ...fixture, codexExecutable: process.execPath, random: counterRandom(0x41, 0x42) });
    const host = gitCommon(path);
    const stored = persistRestartBarrier({ rootDir: path, binding, spawn: host });
    const issued = issueLaunchTicket({ rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: process.execPath, now: 10_000, random: counterRandom(0x43, 0x44), spawn: host });
    const dotCodexFolder = join(path, ".codex");
    const produced = await verifyRuntimeReadback({
      rootDir: path, ticketId: issued.ticketId, token: issued.token, now: 10_001, random: counterRandom(0x45, 0x46),
      runtimeOptions: { spawn: host, codexExecutablePath: process.execPath },
      configRead: ({ executable, cwd, includeLayers }) => {
        assert.equal(executable, process.execPath);
        assert.equal(cwd, path); assert.equal(includeLayers, true);
        return configReadResponse(path, dotCodexFolder);
      },
    });
    assert.notEqual(produced.receipt.readerGenerationSha256, stored.barrier.writerGenerationSha256);
    assert.equal(produced.receipt.effectiveConfigSha256, canonicalSha256({}));
    assert.equal(produced.agents.length, 3);
    assert.deepEqual(Object.keys(produced.agents.find((agent) => agent.path.endsWith("implementor.toml")).route).sort(), ["model", "model_reasoning_effort"]);
    assert.equal(produced.consumed.barrier.state, "cleared");
    await assert.rejects(
      produceRuntimeReadback({
        rootDir: path, ticketId: issued.ticketId, token: issued.token,
        runtimeOptions: { spawn: host, codexExecutablePath: process.execPath },
      }),
      (error) => error?.code === "ticket-unavailable",
    );
  } finally { dispose(path); }
});

test("native config/read admits exact Codex 0.145 config warnings and requires the remote-control status", async () => {
  const path = root();
  try {
    const executable = resolveRuntimeExecutable().physicalPath;
    for (const status of ["disabled", "connecting", "connected", "errored"]) {
      const observed = await readNativeConfig({
        executable,
        cwd: path,
        includeLayers: true,
        spawnChild: configReadChildTransportFixture({
          beforeConfigReadResponse: [
            configWarningNotification(),
            remoteControlNotification({ params: { status } }),
          ],
        }),
      });
      assert.deepEqual(Object.keys(observed).sort(), ["config", "layers", "origins"]);
    }
    const completeWarning = await readNativeConfig({
      executable,
      cwd: path,
      includeLayers: true,
      spawnChild: configReadChildTransportFixture({
        beforeConfigReadResponse: [
          configWarningNotification({
            params: {
              details: "bounded fixture details",
              path: "/fixture/config.toml",
              range: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 2 },
              },
            },
          }),
          remoteControlNotification(),
        ],
      }),
    });
    assert.deepEqual(Object.keys(completeWarning).sort(), ["config", "layers", "origins"]);
    const invalidTransports = [
      ["missing", configReadChildTransportFixture({ beforeConfigReadResponse: [] })],
      ["duplicate", configReadChildTransportFixture({
        beforeConfigReadResponse: [remoteControlNotification(), remoteControlNotification()],
      })],
      ["unknown method", configReadChildTransportFixture({
        beforeConfigReadResponse: [remoteControlNotification({ method: "account/updated" })],
      })],
      ["malformed config warning", configReadChildTransportFixture({
        beforeConfigReadResponse: [configWarningNotification({ params: { summary: 42 } })],
      })],
      ["config warning with an unknown field", configReadChildTransportFixture({
        beforeConfigReadResponse: [configWarningNotification({ params: { secret: "unexpected" } })],
      })],
      ["config warning before initialize", configReadChildTransportFixture({
        beforeInitializeResponse: [configWarningNotification()],
        beforeConfigReadResponse: [remoteControlNotification()],
      })],
      ["out of sequence", configReadChildTransportFixture({
        beforeInitializeResponse: [remoteControlNotification()],
        beforeConfigReadResponse: [],
      })],
      ["malformed status", configReadChildTransportFixture({
        beforeConfigReadResponse: [remoteControlNotification({ params: { status: "unknown" } })],
      })],
      ["server request", configReadChildTransportFixture({
        beforeConfigReadResponse: [{ ...remoteControlNotification(), id: 91 }],
      })],
    ];
    for (const [label, spawnChild] of invalidTransports) {
      await assert.rejects(
        readNativeConfig({ executable, cwd: path, includeLayers: true, spawnChild }),
        (error) => error?.code === "protocol-invalid",
        label,
      );
    }
  } finally { dispose(path); }
});

test("the productive main performs native config/read without a config/evidence seam and clears a launch ticket", async () => {
  const path = root();
  const priorTicketId = process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID;
  const priorToken = process.env.PIPELINE_CODEX_ONBOARDING_TOKEN;
  const priorPath = process.env.PATH;
  try {
    git(path);
    const fixture = seeded(path);
    const executable = resolveRuntimeExecutable().physicalPath;
    const bin = dirname(executable);
    const binding = prepareRuntimeRestartBinding({
      rootDir: path, ...fixture, codexExecutable: executable, random: counterRandom(0x61, 0x62),
    });
    const host = gitCommon(path);
    const stored = persistRestartBarrier({ rootDir: path, binding, spawn: host });
    const issued = issueLaunchTicket({
      rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: executable,
      now: Date.now(), random: counterRandom(0x63, 0x64), spawn: host,
    });
    process.env.PATH = `${bin}${process.platform === "win32" ? ";" : ":"}${priorPath ?? ""}`;
    process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID = issued.ticketId;
    process.env.PIPELINE_CODEX_ONBOARDING_TOKEN = issued.token.toString("hex");
    assert.equal(authenticateLaunchTicket({
      rootDir: path, ticketId: issued.ticketId, token: issued.token, now: Date.now(),
    }).ticket.value.state, "issued", "the productive local private-state adapter must authenticate without an injected spawn");
    let stdout = "";
    assert.equal(await runtimeReadbackMain(["--root", path], {
      write: (chunk) => { stdout += chunk; },
      childTransport: configReadChildTransport,
    }), 0, stdout);
    assert.deepEqual(JSON.parse(stdout), {
      schema: "pipeline.codex-project-runtime-readback-status.v1",
      status: "produced",
    });
    assert.equal(readRestartBarrier({ rootDir: path, spawn: host }).barrier.state, "cleared");
    const current = readCurrentRuntimeReadback({ rootDir: path, spawn: host });
    assert.equal(current.status, "current");
    assert.notEqual(current.readbackSha256, current.barrierSha256);
    const driftedMarker = { ...current.marker, receiptSha256: sha256("drifted-receipt") };
    writeFileSync(current.paths.currentReadback, canonicalJson(driftedMarker));
    assert.throws(
      () => readCurrentRuntimeReadback({ rootDir: path, spawn: host }),
      /receipt digest invalid/u,
      "a drifted private marker must not preserve readback-current",
    );
  } finally {
    if (priorTicketId === undefined) delete process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID;
    else process.env.PIPELINE_CODEX_ONBOARDING_TICKET_ID = priorTicketId;
    if (priorToken === undefined) delete process.env.PIPELINE_CODEX_ONBOARDING_TOKEN;
    else process.env.PIPELINE_CODEX_ONBOARDING_TOKEN = priorToken;
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
    dispose(path);
  }
});

test("expired tickets and unchanged barrier replays fail closed", () => {
  const path = root();
  try {
    git(path); const fixture = seeded(path);
    const binding = prepareRuntimeRestartBinding({ rootDir: path, ...fixture, codexExecutable: process.execPath, random: counterRandom(0x51, 0x52) });
    const host = gitCommon(path);
    const stored = persistRestartBarrier({ rootDir: path, binding, spawn: host });
    const replay = persistRestartBarrier({ rootDir: path, binding, spawn: host });
    assert.equal(replay.written, false); assert.equal(replay.rawSha256, stored.rawSha256);
    const issued = issueLaunchTicket({ rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: process.execPath, now: 20_000, random: counterRandom(0x53, 0x54), spawn: host });
    assert.throws(() => authenticateLaunchTicket({ rootDir: path, ticketId: issued.ticketId, token: issued.token, now: 320_000, spawn: host }), /unavailable or replayed/u);
  } finally { dispose(path); }
});

test("a stale launcher binding is replaced even when source and runtime targets are unchanged", () => {
  const path = root();
  try {
    git(path);
    const fixture = seeded(path);
    const binding = prepareRuntimeRestartBinding({
      rootDir: path,
      ...fixture,
      codexExecutable: process.execPath,
      random: counterRandom(0x61, 0x62),
    });
    const host = gitCommon(path);
    const stale = persistRestartBarrier({
      rootDir: path,
      binding: { ...binding, launcherSha256: "f".repeat(64) },
      spawn: host,
    });
    const rebound = persistRestartBarrier({ rootDir: path, binding, spawn: host });
    assert.equal(stale.written, true);
    assert.equal(rebound.written, true);
    assert.notEqual(rebound.rawSha256, stale.rawSha256);
    assert.equal(rebound.barrier.revision, stale.barrier.revision + 1);
    assert.equal(rebound.barrier.priorStateSha256, stale.rawSha256);
    assert.equal(rebound.barrier.launcherSha256, binding.launcherSha256);
  } finally { dispose(path); }
});

test("wrong identity, origin, same-generation, timeout, oversize, and absent transport remain typed and do not consume", async () => {
  const path = root();
  try {
    git(path);
    const fixture = seeded(path);
    const binding = prepareRuntimeRestartBinding({
      rootDir: path, ...fixture, codexExecutable: process.execPath, random: counterRandom(0x71, 0x72),
    });
    const host = gitCommon(path);
    const stored = persistRestartBarrier({ rootDir: path, binding, spawn: host });
    const issued = issueLaunchTicket({
      rootDir: path, barrierSha256: stored.rawSha256, codexExecutable: process.execPath,
      now: 30_000, random: counterRandom(0x73, 0x74), spawn: host,
    });
    const base = {
      rootDir: path, ticketId: issued.ticketId, token: issued.token, now: 30_001,
      runtimeOptions: { spawn: host, codexExecutablePath: process.execPath },
    };
    await assert.rejects(
      produceRuntimeReadback({ ...base, random: counterRandom(0x72), configRead: () => configReadResponse(path) }),
      (error) => error?.code === "same-generation",
    );
    await assert.rejects(
      produceRuntimeReadback({
        ...base,
        random: counterRandom(0x75),
        runtimeOptions: { spawn: host, codexExecutablePath: realpathSync("/bin/true") },
        configRead: () => configReadResponse(path),
      }),
      (error) => error?.code === "executable-identity-mismatch",
    );
    const foreign = join(path, "foreign", ".codex");
    mkdirSync(foreign, { recursive: true });
    await assert.rejects(
      produceRuntimeReadback({
        ...base, random: counterRandom(0x76), configRead: () => configReadResponse(path, foreign),
      }),
      (error) => error?.code === "config-origin-invalid",
    );
    for (const code of ["transport-timeout", "transport-oversize", "transport-unavailable"]) {
      await assert.rejects(
        readNativeConfig({
          executable: process.execPath,
          cwd: path,
          includeLayers: true,
          spawnChild: () => { throw new RuntimeReadbackError(code, code); },
        }),
        (error) => error?.code === code,
      );
    }
    assert.equal(authenticateLaunchTicket({
      rootDir: path, ticketId: issued.ticketId, token: issued.token, now: 30_002, spawn: host,
    }).ticket.value.state, "issued", "typed readback failures must not consume the one-use ticket");
  } finally { dispose(path); }
});

let passed = 0; const failures = [];
for (const [name, run] of cases) {
  try {
    await run();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`FAIL  ${name} -- ${error.message}`);
  }
}
console.log(`\ncodex-onboarding-runtime: ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }

#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildHandle, resolveSystemExecutable } from "../../../harness/scripts/security-readiness/tool-identity.mjs";
import { runProbe } from "../../../harness/scripts/security-readiness/tool-identity.mjs";
import { defaultGitProbe, FIXED_TOOLS, runToolchainPreflight } from "./toolchain-preflight.mjs";
import { probeSemgrep } from "../../../harness/scripts/security-readiness/semgrep-readiness.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS TCP${String(passed).padStart(2, "0")} ${name}\n`); }
function observed(tool, version, capabilities) {
  return { ok: true, status: "ready", handle: buildHandle(tool, { realPath: `/tools/${tool}`, device: "1", inode: "2", size: 3, mtimeNs: "4", sha256: "a".repeat(64) }, version, capabilities, "2026-07-18T12:00:00.000Z") };
}
const nodeReady = () => observed("node", "24.15.0", ["spawn-shell-false"]);
const gitReady = () => observed("git", "2.50.1", ["object-format", "diff-paths"]);
function manifest(scanners, mode = "blocking") { return { status: "ok", manifest: { gates: { security: { mode, type: "automated" } }, security: { scanners }, governance: { policies_path: "policies" } } }; }
function root() { return mkdtempSync(join(tmpdir(), "toolchain-preflight-")); }

check("invalid manifest blocks before every identity or capability probe", () => {
  const repo = root(); let calls = 0;
  try {
    const result = runToolchainPreflight({ rootDir: repo, manifestResult: { status: "invalid", errors: [{}] } }, { probeNodeFn: () => { calls++; }, probeGitFn: () => { calls++; }, scannerProbes: new Proxy({}, { get: () => () => { calls++; } }) });
    assert.equal(result.code, "TCP-MANIFEST-INVALID"); assert.equal(result.exitCode, 2); assert.equal(calls, 0); assert.equal(result.results.length, 6);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
check("absent manifest requires only compatible Node and Git", () => {
  const repo = root();
  try {
    const result = runToolchainPreflight({ rootDir: repo, manifestResult: { status: "absent" } }, { probeNodeFn: nodeReady, probeGitFn: gitReady });
    assert.equal(result.code, "TCP-READY"); assert.equal(result.exitCode, 0); assert.deepEqual(result.results.map(({ tool }) => tool), FIXED_TOOLS);
    assert.deepEqual(result.results.slice(2).map(({ status }) => status), ["not_required", "not_required", "not_required", "not_required"]);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
check("enabled scanners are probed under warn and carry exact prepared handles", () => {
  const repo = root(); const called = [];
  try {
    const probes = {
      gitleaks: () => { called.push("gitleaks"); return observed("gitleaks", "8.28.0", ["--source", "--report-format", "--report-path", "--no-banner", "--exit-code"]); },
      "osv-scanner": () => { called.push("osv-scanner"); return observed("osv-scanner", "2.3.1", ["--format", "recursive-source"]); },
      semgrep: () => { called.push("semgrep"); return observed("semgrep", "1.130.0", ["--json", "--config"]); },
    };
    const result = runToolchainPreflight({ rootDir: repo, manifestResult: manifest({ gitleaks: { enabled: true }, "osv-scanner": { enabled: true }, semgrep: { enabled: true } }, "warn") },
      { probeNodeFn: nodeReady, probeGitFn: gitReady, scannerProbes: probes, resolveExecutableFn: (name) => `/tools/${name}` });
    assert.equal(result.code, "TCP-READY"); assert.deepEqual(called, ["gitleaks", "osv-scanner", "semgrep"]); assert.deepEqual(Object.keys(result.preparedHandles).sort(), ["git", "gitleaks", "node", "osv-scanner", "semgrep"]);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
check("warn/off change only failure severity and never skip enabled probing", () => {
  for (const [mode, exitCode] of [["warn", 1], ["off", 0]]) {
    const repo = root(); let calls = 0;
    try {
      const result = runToolchainPreflight({ rootDir: repo, manifestResult: manifest({ "osv-scanner": { enabled: true } }, mode) }, { probeNodeFn: nodeReady, probeGitFn: gitReady, resolveExecutableFn: () => "/tools/osv", scannerProbes: { "osv-scanner": () => { calls++; return observed("osv-scanner", "3.0.0", ["--format", "recursive-source"]); } } });
      assert.equal(result.status, "incompatible_version"); assert.equal(result.exitCode, exitCode); assert.equal(calls, 1);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }
});
check("unknown enabled scanner is never executed and blocks under blocking mode", () => {
  const repo = root(); let resolvedUnknown = false;
  try {
    const result = runToolchainPreflight({ rootDir: repo, manifestResult: manifest({ "future-scanner": { enabled: true } }) }, { probeNodeFn: nodeReady, probeGitFn: gitReady, resolveExecutableFn: (name) => { if (name === "future-scanner") resolvedUnknown = true; return null; }, scannerProbes: {} });
    assert.equal(result.code, "TCP-UNSUPPORTED-SCANNER"); assert.equal(result.exitCode, 2); assert.equal(resolvedUnknown, false);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
check("execution environment outranks missing, timeout, probe and compatibility failures", () => {
  const repo = root();
  try {
    const result = runToolchainPreflight({ rootDir: repo, manifestResult: manifest({ gitleaks: { enabled: true }, semgrep: { enabled: true } }) }, { probeNodeFn: () => ({ ok: false, status: "execution_environment" }), probeGitFn: () => ({ ok: false, status: "binary_missing" }), resolveExecutableFn: (name) => `/tools/${name}`, scannerProbes: { gitleaks: () => ({ ok: false, status: "probe_timeout" }), semgrep: () => observed("semgrep", null, []) } });
    assert.equal(result.status, "execution_environment"); assert.equal(result.exitCode, 2);
    const node = result.results.find(({ tool }) => tool === "node");
    const gitleaks = result.results.find(({ tool }) => tool === "gitleaks");
    assert.equal(node.installCommand, null);
    assert.match(node.guidance, /host-authorized local read-only boundary/u);
    assert.match(node.guidance, /do not reinstall node/u);
    assert.equal(gitleaks.installCommand, null);
    assert.match(gitleaks.guidance, /do not reinstall gitleaks/u);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
check("Git accepts only the documented status-zero EPERM false-positive, while ordinary probes retain EPERM failure", () => {
  const epermSuccess = () => ({ status: 0, error: Object.assign(new Error("sandbox false-positive"), { code: "EPERM" }), stdout: "git version 2.50.1\n", stderr: "" });
  assert.equal(runProbe("git", ["--version"], { cwd: "/tmp", tempDir: "/tmp", spawnFn: epermSuccess }).status, "execution_environment");
  const accepted = runProbe("git", ["--version"], { cwd: "/tmp", tempDir: "/tmp", spawnFn: epermSuccess, acceptSuccessfulEperm: true });
  assert.deepEqual(accepted, { ok: true, stdout: "git version 2.50.1\n", stderr: "" });
  const eaccesSuccess = () => ({ status: 0, error: Object.assign(new Error("access denied"), { code: "EACCES" }), stdout: "git version 2.50.1\n", stderr: "" });
  assert.equal(runProbe("git", ["--version"], { cwd: "/tmp", tempDir: "/tmp", spawnFn: eaccesSuccess, acceptSuccessfulEperm: true }).status, "execution_environment");
  const repo = root(); const calls = [];
  try {
    const observedGit = defaultGitProbe({ rootDir: repo, tempDir: "/tmp", now: new Date("2026-07-18T12:00:00.000Z") }, {
      runProbeFn: (_executable, args, options) => {
        calls.push({ args, options });
        if (args[0] === "--version") return { ok: true, stdout: "git version 2.50.1\n", stderr: "" };
        return { ok: true, stdout: "", stderr: "" };
      },
    });
    assert.equal(observedGit.ok, true);
    assert.deepEqual(observedGit.handle.capabilities, ["object-format", "diff-paths"]);
    assert.equal(calls.length, 3);
    assert.equal(calls.every(({ options }) => options.acceptSuccessfulEperm === true), true);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
check("a missing configured prerequisite names the blocked claim and a copyable command without installing", () => {
  const repo = root(); let probeCalls = 0;
  try {
    const result = runToolchainPreflight({ rootDir: repo, manifestResult: manifest({ semgrep: { enabled: true } }) }, {
      probeNodeFn: nodeReady,
      probeGitFn: gitReady,
      resolveExecutableFn: () => null,
      resolveInstallerFn: (name) => name === "pipx" ? "/usr/bin/pipx" : null,
      scannerProbes: { semgrep: () => { probeCalls += 1; throw new Error("a missing tool must not be executed or installed"); } },
    });
    const missing = result.results.find(({ tool }) => tool === "semgrep");
    assert.equal(result.code, "TCP-BINARY-MISSING");
    assert.equal(result.ok, false);
    assert.equal(missing.status, "binary_missing");
    assert.equal(missing.affectedClaim, "Security readiness cannot be claimed until semgrep is installed.");
    assert.equal(missing.installCommand, "pipx install semgrep");
    assert.equal(missing.installAttempted, false);
    assert.equal(missing.guidance.includes(missing.installCommand), true);
    assert.equal(probeCalls, 0);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
check("standard per-user pipx and Go bin locations are discovered without trusting arbitrary PATH order", () => {
  const home = root();
  try {
    const localBin = join(home, ".local", "bin");
    const goBin = join(home, "go", "bin");
    mkdirSync(localBin, { recursive: true });
    mkdirSync(goBin, { recursive: true });
    writeFileSync(join(localBin, "pipeline-test-local"), "local");
    writeFileSync(join(goBin, "pipeline-test-go"), "go");
    assert.equal(resolveSystemExecutable("pipeline-test-local", { platform: "linux", homeDir: home }), join(localBin, "pipeline-test-local"));
    assert.equal(resolveSystemExecutable("pipeline-test-go", { platform: "linux", homeDir: home }), join(goBin, "pipeline-test-go"));
  } finally { rmSync(home, { recursive: true, force: true }); }
});
check("missing installer prerequisites are embedded in copyable Ubuntu chains while npm-only hosts get no unsafe command", () => {
  for (const npmOnly of [false, true]) {
    const repo = root();
    try {
      const available = npmOnly ? new Set(["npm"]) : new Set(["apt-get", "sudo"]);
      const result = runToolchainPreflight({ rootDir: repo, manifestResult: manifest({ gitleaks: { enabled: true }, semgrep: { enabled: true } }) }, {
        probeNodeFn: nodeReady,
        probeGitFn: gitReady,
        resolveExecutableFn: () => null,
        resolveInstallerFn: (name) => available.has(name) ? `/tools/${name}` : null,
        scannerProbes: {},
      });
      const gitleaks = result.results.find(({ tool }) => tool === "gitleaks");
      const semgrep = result.results.find(({ tool }) => tool === "semgrep");
      if (npmOnly) {
        assert.equal(gitleaks.installCommand, null);
        assert.equal(semgrep.installCommand, null);
        assert.match(gitleaks.guidance, /npm is not an approved installer/u);
        assert.match(semgrep.guidance, /npm is not an approved installer/u);
      } else {
        assert.equal(gitleaks.installCommand, "sudo apt-get update && sudo apt-get install -y golang-go && go install github.com/zricethezav/gitleaks/v8@latest");
        assert.equal(semgrep.installCommand, "sudo apt-get update && sudo apt-get install -y pipx && pipx install semgrep");
      }
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }
});
check("Semgrep probes use bounded temporary settings instead of writing the user home", () => {
  const repo = root();
  const executable = join(repo, "semgrep");
  const calls = [];
  writeFileSync(executable, "fake semgrep");
  try {
    const observedSemgrep = probeSemgrep({ executablePath: executable, rootDir: repo, tempDir: repo }, {
      now: new Date("2026-07-19T22:00:00.000Z"),
      spawnFn: (_command, args, options) => {
        calls.push({ args, env: options.env });
        return args[0] === "--version"
          ? { status: 0, stdout: "1.170.0\n", stderr: "" }
          : { status: 0, stdout: "--json --config\n", stderr: "" };
      },
    });
    assert.equal(observedSemgrep.ok, true);
    assert.equal(observedSemgrep.handle.version, "1.170.0");
    assert.equal(calls.length, 2);
    assert.equal(calls.every(({ env }) => env.SEMGREP_SETTINGS_FILE.startsWith(`${repo}/pipeline-semgrep-preflight-`) && env.SEMGREP_SEND_METRICS === "off" && !("HOME" in env)), true);
    assert.deepEqual(readdirSync(repo), ["semgrep"]);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
process.stdout.write(`${passed}/11 checks passed.\n`);

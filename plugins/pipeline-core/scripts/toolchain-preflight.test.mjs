#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { after as afterTests } from "node:test";
const cases = [];
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildHandle, resolveSystemExecutable } from "../../../harness/scripts/security-readiness/tool-identity.mjs";
import { runProbe } from "../../../harness/scripts/security-readiness/tool-identity.mjs";
import { defaultGitProbe, FIXED_TOOLS, runToolchainPreflight } from "./toolchain-preflight.mjs";
import { probeSemgrep } from "../../../harness/scripts/security-readiness/semgrep-readiness.mjs";
// CYB-2G (AC10) additions: new imports kept on their own lines rather than
// merged into the existing import statements above, so this additive change
// touches zero pre-existing lines.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITY_TOOL_ROOTS, evaluateCapabilityCompleteness } from "./toolchain-preflight.mjs";
import { parseBrowserEvidencePreflightArgs, preflightBrowserEvidence } from "./browser-evidence-preflight.mjs";
// R7-7-T (Spec 22.7) additions: new imports on their own lines, no pre-existing import line touched.
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import * as toolchainModule from "./toolchain-preflight.mjs";

let passed = 0;
function check(name, fn) { cases.push({ id: `TCP${String(cases.length + 1).padStart(3, "0")}`, name, run: async () => { await fn(); passed += 1; process.stdout.write(`PASS TCP${String(passed).padStart(2, "0")} ${name}\n`); } }); }
function observed(tool, version, capabilities) {
  return { ok: true, status: "ready", handle: buildHandle(tool, { realPath: `/tools/${tool}`, device: "1", inode: "2", size: 3, mtimeNs: "4", sha256: "a".repeat(64) }, version, capabilities, "2026-07-18T12:00:00.000Z") };
}
const nodeReady = () => observed("node", "24.15.0", ["spawn-shell-false"]);
const gitReady = () => observed("git", "2.50.1", ["object-format", "diff-paths"]);
function manifest(scanners, mode = "blocking") { return { status: "ok", manifest: { gates: { security: { mode, type: "automated" } }, security: { scanners }, governance: { policies_path: "policies" } } }; }
function root() { return mkdtempSync(join(tmpdir(), "toolchain-preflight-")); }
// CYB-2G (AC10) additions below this line.
function entry(tool, status) { return { tool, status }; }
const REPO_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
function gitStatus() {
  const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, `git status failed: ${String(result.stderr)}`);
  return result.stdout;
}

check("browser evidence preflight distinguishes available local browser capability without running a test", () => {
  const calls = [];
  const result = preflightBrowserEvidence({ rootDir: process.cwd() }, {
    spawnFn: (...args) => {
      calls.push(args);
      return { status: 0, stdout: JSON.stringify({ state: "ready" }) };
    },
  });
  assert.equal(result.code, "BEP-BROWSER-E2E-READY");
  assert.equal(result.status, "ready");
  assert.equal(result.testExecuted, false);
  assert.equal(result.installAttempted, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ["-e", calls[0][1][1]]);
  assert.match(calls[0][1][1], /"@playwright\/test", "playwright"/u, "the capability probe must accept either standard local Playwright package");
});

check("browser evidence preflight accepts a consumer that provides only the playwright package", () => {
  const repo = root();
  try {
    const packageDir = join(repo, "node_modules", "playwright");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, "chromium"), "fixture browser", "utf8");
    writeFileSync(
      join(packageDir, "index.js"),
      'const { join } = require("node:path"); module.exports = { chromium: { executablePath: () => join(__dirname, "chromium"), launch: async () => ({ close: async () => {} }) } };',
      "utf8",
    );
    const result = preflightBrowserEvidence({ rootDir: repo });
    assert.equal(result.code, "BEP-BROWSER-E2E-READY");
    assert.equal(result.status, "ready");
    assert.equal(result.testExecuted, false);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

check("browser evidence preflight reports unavailable browser separately from a test failure", () => {
  const probe = () => ({ status: 0, stdout: JSON.stringify({ state: "browser-missing", executablePath: "/browser/chrome" }) });
  const required = preflightBrowserEvidence({ rootDir: process.cwd() }, { spawnFn: probe });
  assert.equal(required.code, "BEP-CHROMIUM-UNAVAILABLE");
  assert.equal(required.status, "unavailable");
  assert.equal(required.exitCode, 1);
  assert.equal(required.testExecuted, false);
  const fallback = preflightBrowserEvidence({ rootDir: process.cwd(), fallbackEvidence: "offline-behaviour" }, { spawnFn: probe });
  assert.equal(fallback.code, "BEP-BROWSER-E2E-UNAVAILABLE-FALLBACK-DECLARED");
  assert.equal(fallback.status, "degraded");
  assert.equal(fallback.selectedEvidence, "offline-behaviour");
  assert.equal(fallback.exitCode, 2);
});

check("browser evidence preflight never probes when a weaker evidence class is explicitly declared", () => {
  const result = preflightBrowserEvidence({ rootDir: process.cwd(), requiredEvidence: "static" }, {
    spawnFn: () => { throw new Error("a static declaration must not probe or install Playwright"); },
  });
  assert.equal(result.code, "BEP-DECLARED-NON-BROWSER");
  assert.equal(result.selectedEvidence, "static");
  assert.equal(result.installAttempted, false);
  assert.equal(result.testExecuted, false);
  const unusedFallback = preflightBrowserEvidence({ rootDir: process.cwd(), requiredEvidence: "offline-behaviour", fallbackEvidence: "static" });
  assert.equal(unusedFallback.code, "BEP-FALLBACK-UNUSED");
  assert.equal(unusedFallback.exitCode, 2);
});

check("browser evidence preflight CLI grammar rejects duplicate and malformed declarations", () => {
  assert.deepEqual(parseBrowserEvidencePreflightArgs(["--required-evidence", "browser-e2e", "--fallback-evidence", "offline-behaviour"]), {
    rootDir: process.cwd(), requiredEvidence: "browser-e2e", fallbackEvidence: "offline-behaviour",
  });
  assert.equal(parseBrowserEvidencePreflightArgs(["--root", "one", "--root", "two"]), null);
  assert.equal(parseBrowserEvidencePreflightArgs(["--required-evidence"]), null);
});

check("browser evidence preflight rejects an absent required evidence class fail-closed", () => {
  const result = preflightBrowserEvidence({ rootDir: process.cwd(), requiredEvidence: null });
  assert.equal(result.code, "BEP-INPUT-INVALID");
  assert.equal(result.status, "unavailable");
  assert.equal(result.exitCode, 2);
});

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
  if (resolveSystemExecutable("git") === null) {
    // defaultGitProbe's real resolveExecutableFn default only trusts fixed
    // system install roots (never PATH). A host with git outside those roots
    // has no trusted git to probe -- this integration assertion needs one and
    // is a host-capability gap, not a defaultGitProbe defect.
    process.stdout.write("SKIP  defaultGitProbe trusted-resolution integration: no trusted-root git install on this host\n");
    return;
  }
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
check("a rejected Windows path stays untrusted and blocks without probing or install guidance", () => {
  const repo = root(); let probeCalls = 0;
  try {
    const result = runToolchainPreflight({ rootDir: repo, platform: "win32", manifestResult: manifest({ semgrep: { enabled: true } }) }, {
      probeNodeFn: nodeReady, probeGitFn: gitReady, resolveExecutableFn: () => ({ ok: false, status: "untrusted_path" }), resolveInstallerFn: () => null,
      scannerProbes: { semgrep: () => { probeCalls += 1; throw new Error("a rejected tool must not be executed"); } },
    });
    const rejected = result.results.find(({ tool }) => tool === "semgrep");
    assert.equal(result.code, "TCP-UNTRUSTED-PATH"); assert.equal(result.exitCode, 2); assert.equal(rejected.status, "untrusted_path"); assert.equal(rejected.installCommand, null); assert.match(rejected.guidance, /direct .exe/u); assert.equal(probeCalls, 0);
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
      const result = runToolchainPreflight({ rootDir: repo, platform: "linux", manifestResult: manifest({ gitleaks: { enabled: true }, semgrep: { enabled: true } }) }, {
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
    assert.equal(calls.every(({ env }) => env.SEMGREP_SETTINGS_FILE.startsWith(join(repo, "pipeline-semgrep-preflight-")) && env.SEMGREP_SEND_METRICS === "off" && !("HOME" in env)), true);
    assert.deepEqual(readdirSync(repo), ["semgrep"]);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

// --- CYB-2G (AC10): evaluateCapabilityCompleteness() -----------------------
// Fixtures below construct synthetic preflight-result-shaped inputs
// (`{ results: [...] }`) rather than requiring real scanner binaries, per
// field 2/3 of the briefing. Together they exercise all five DoD-named
// states (required/available/missing/unsupported/optional) plus the
// omitted-entirely (no-information) branch, the node/git exclusion, the
// license-check informative-only representation, the frozen tool->capability
// mapping, a real runToolchainPreflight()-shaped integration fixture, and the
// zero-mutation proof.
check("capability-completeness: tool-to-capability-root mapping matches the CYB-1F frozen assignment", () => {
  assert.deepEqual(CAPABILITY_TOOL_ROOTS, { gitleaks: "cap.secrets", "osv-scanner": "cap.sca", semgrep: "cap.sast" });
});
check("capability-completeness: a required capability with a ready tool reports \"required\"", () => {
  const output = evaluateCapabilityCompleteness({ results: [entry("gitleaks", "ready")] }, ["cap.secrets"]);
  assert.deepEqual(output.capabilities, [{ capability: "cap.secrets", status: "required", tool: "gitleaks" }]);
});
check("capability-completeness: a required capability with a known-but-not-ready tool reports \"missing\"", () => {
  const output = evaluateCapabilityCompleteness({ results: [entry("osv-scanner", "binary_missing")] }, ["cap.sca"]);
  assert.deepEqual(output.capabilities, [{ capability: "cap.sca", status: "missing", tool: "osv-scanner" }]);
});
check("capability-completeness: a required capability whose tool was never enabled (not_required) also reports \"missing\"", () => {
  const output = evaluateCapabilityCompleteness({ results: [entry("semgrep", "not_required")] }, ["cap.sast"]);
  assert.deepEqual(output.capabilities, [{ capability: "cap.sast", status: "missing", tool: "semgrep" }]);
});
check("capability-completeness: a required capability with no mapped tool reports \"unsupported\"", () => {
  const output = evaluateCapabilityCompleteness({ results: [] }, ["cap.container"]);
  assert.deepEqual(output.capabilities, [{ capability: "cap.container", status: "unsupported", tool: null }]);
});
check("capability-completeness: a not-required capability whose tool is ready reports \"available\"", () => {
  const output = evaluateCapabilityCompleteness({ results: [entry("semgrep", "ready")] }, []);
  assert.deepEqual(output.capabilities, [{ capability: "cap.sast", status: "available", tool: "semgrep" }]);
});
check("capability-completeness: a not-required capability whose tool is known but not ready reports \"optional\"", () => {
  const output = evaluateCapabilityCompleteness({ results: [entry("osv-scanner", "binary_missing")] }, []);
  assert.deepEqual(output.capabilities, [{ capability: "cap.sca", status: "optional", tool: "osv-scanner" }]);
});
check("capability-completeness: a not-required capability whose tool was never enabled is omitted entirely", () => {
  const output = evaluateCapabilityCompleteness({ results: [entry("gitleaks", "not_required")] }, []);
  assert.deepEqual(output.capabilities, []);
});
check("capability-completeness: a not-required capability with no mapped tool at all is omitted entirely", () => {
  const output = evaluateCapabilityCompleteness({ results: [] }, []);
  assert.deepEqual(output.capabilities, []);
});
check("capability-completeness: node and git are excluded from the capability-level report entirely", () => {
  const output = evaluateCapabilityCompleteness({ results: [entry("node", "ready"), entry("git", "ready"), entry("gitleaks", "ready")] }, ["cap.secrets"]);
  assert.deepEqual(output.capabilities.map(({ capability }) => capability), ["cap.secrets"]);
});
check("capability-completeness: license-check is never a cap.* verdict, only an informative field", () => {
  const output = evaluateCapabilityCompleteness({ results: [entry("license-check", "input_missing"), entry("gitleaks", "ready")] }, ["cap.secrets"]);
  assert.equal(output.capabilities.some(({ capability }) => capability.includes("license")), false);
  assert.deepEqual(output.licenseControl, { control: "license-check", status: "input_missing", note: "catalog control (CYB-1F F-4), not a cap.* capability-root verdict" });
});
check("capability-completeness: licenseControl is null when license-check is absent from the preflight results", () => {
  const output = evaluateCapabilityCompleteness({ results: [entry("gitleaks", "ready")] }, ["cap.secrets"]);
  assert.equal(output.licenseControl, null);
});
check("capability-completeness: rejects a non-array requiredCapabilities and a preflightResult without a results array", () => {
  assert.throws(() => evaluateCapabilityCompleteness({ results: [] }, "cap.secrets"), TypeError);
  assert.throws(() => evaluateCapabilityCompleteness({}, ["cap.secrets"]), TypeError);
  assert.throws(() => evaluateCapabilityCompleteness(null, ["cap.secrets"]), TypeError);
});
check("capability-completeness: derives directly from a real runToolchainPreflight() result", () => {
  const repo = root();
  try {
    const probes = { gitleaks: () => observed("gitleaks", "8.28.0", ["--source", "--report-format", "--report-path", "--no-banner", "--exit-code"]) };
    const preflight = runToolchainPreflight({ rootDir: repo, manifestResult: manifest({ gitleaks: { enabled: true } }) }, { probeNodeFn: nodeReady, probeGitFn: gitReady, scannerProbes: probes, resolveExecutableFn: (name) => `/tools/${name}` });
    const output = evaluateCapabilityCompleteness(preflight, ["cap.secrets", "cap.sca", "cap.container"]);
    assert.deepEqual(output.capabilities, [
      { capability: "cap.container", status: "unsupported", tool: null },
      { capability: "cap.sca", status: "missing", tool: "osv-scanner" },
      { capability: "cap.secrets", status: "required", tool: "gitleaks" },
    ]);
    // license-check is always present in a real preflight (default "not_required"
    // when disabled in the manifest); it still surfaces only as an informative
    // field, never as a cap.* verdict.
    assert.deepEqual(output.licenseControl, { control: "license-check", status: "not_required", note: "catalog control (CYB-1F F-4), not a cap.* capability-root verdict" });
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
check("capability-completeness: performs zero filesystem/git mutation (repo status is byte-identical before and after)", () => {
  const before = gitStatus();
  evaluateCapabilityCompleteness({ results: [entry("gitleaks", "ready"), entry("osv-scanner", "binary_missing"), entry("license-check", "input_missing")] }, ["cap.secrets", "cap.sca", "cap.container", "cap.dast"]);
  const after = gitStatus();
  assert.equal(after, before);
});
// ===== R7-7-T (Spec 22.7, cases R7-7a, R7-7b, R7-7c, R7-7e): environment readiness report ==========
// RED by design: pins the report contract before its implementation (R7-7-F). R7-7d (installed copy
// in the consumer layout) is NOT covered here. Finding ids, states and the closed finding fields are
// verbatim from Spec 22.7. The spec does NOT name three interface points, so they are fixed in this
// one block and nowhere else (R7-7-F renames them here in one edit, or changes the contract):
//   R77_REPORT_EXPORT  the toolchain-preflight.mjs export that builds the report
//   R77_REPORT_FIELD   the key under which bootstrap and prepare-for-signature carry the report
//   R77_PROBES_DEP     the dependency seam that puts ONE finding id into a fixture state
// Fixtures: per-test temporary repositories whose git configuration is isolated from the machine
// (empty global config, no system config, HOME redirected), removed afterwards. Nothing here reads
// or writes the real repository's hooks or the real machine's git configuration.
const R77_FINDING_IDS = Object.freeze(["git-version", "signing-toolchain", "po-key-directory", "trust-anchor-match", "git-hooks", "bound-paths-tracked", "orphan-descriptors", "approval-verifiable"]);
const R77_STATES = Object.freeze(["ok", "repairable", "attended", "unknown"]);
const R77_FINDING_KEYS = Object.freeze(["cause", "findingId", "repair", "status"]);
const R77_KNOWN_BAD_GIT = "2.56.0.windows.1";
const R77_HOOKS = Object.freeze(["pre-push", "pre-commit", "commit-msg"]);
const R77_REPORT_EXPORT = "runEnvironmentReadinessReport";
const R77_REPORT_FIELD = "environmentReadiness";
const R77_PROBES_DEP = "findingProbes";
const R77_ENV_KEYS = Object.freeze(["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "HOME", "USERPROFILE", "XDG_CONFIG_HOME", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX"]);
const R77_SCRIPT = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

function r77IsAgentAction(repair) {
  return repair !== null && typeof repair === "object" && !Array.isArray(repair)
    && typeof repair.kind === "string" && repair.kind.length > 0
    && typeof repair.executable === "string" && repair.executable.length > 0
    && Array.isArray(repair.argv) && repair.argv.every((arg) => typeof arg === "string")
    && typeof repair.mutation === "boolean" && repair.requiresConfirmation === false
    && repair.expected !== null && typeof repair.expected === "object" && typeof repair.expected.schema === "string" && repair.expected.schema.length > 0;
}
function r77AssertFinding(finding, label) {
  assert.ok(finding !== null && typeof finding === "object", `${label}: a finding must be an object`);
  assert.deepEqual(Object.keys(finding).sort(), [...R77_FINDING_KEYS], `${label}: a finding carries exactly the closed fields findingId, status, cause, repair`);
  assert.ok(R77_FINDING_IDS.includes(finding.findingId), `${label}: findingId must be one of the eight closed ids`);
  assert.ok(R77_STATES.includes(finding.status), `${label}: status must be ok, repairable, attended or unknown`);
  assert.equal(typeof finding.cause, "string", `${label}: cause must be a string`);
  if (finding.status === "ok") return;
  assert.ok(finding.repair !== null && typeof finding.repair === "object" && !Array.isArray(finding.repair), `${label}: a non-ok finding without a repair fails its case`);
  if (finding.status === "repairable") {
    assert.ok(r77IsAgentAction(finding.repair), `${label}: a repairable finding carries a nextAction envelope (kind, executable, argv, mutation, requiresConfirmation false, expected.schema)`);
  } else if (finding.status === "attended") {
    assert.equal(r77IsAgentAction(finding.repair), false, `${label}: an attended finding carries exactly one repair form, the attended prerequisite, never an agent-executable envelope`);
    assert.ok(Object.values(finding.repair).some((value) => typeof value === "string" && value.length > 0), `${label}: the attended prerequisite must name the concrete prerequisite`);
  }
}
function r77LeaksPath(text, path) {
  return [path, path.replaceAll("\\", "/"), path.replaceAll("\\", "\\\\")].some((form) => String(text).includes(form));
}
function r77Action(repo) {
  return { kind: "command", executable: process.execPath, argv: [R77_SCRIPT("clone-hook-readiness.mjs"), "--root", repo, "--apply"], mutation: true, requiresConfirmation: false, expected: { schema: "pipeline.mandatory-hook-readiness.v1", status: "ready" } };
}
const r77Attended = () => ({ kind: "attended-prerequisite", prerequisite: "fixture prerequisite the PO applies in their own terminal" });
// Probes that report every finding ok, so one overridden id (or one id left to its real probe) is isolated.
function r77Probes(overrides = {}, real = []) {
  const probes = {};
  for (const id of R77_FINDING_IDS) probes[id] = () => ({ status: "ok", cause: `${id} is ready`, repair: null });
  Object.assign(probes, overrides);
  for (const id of real) delete probes[id];
  return probes;
}
async function r77Report(rootDir, deps = {}) {
  const build = toolchainModule[R77_REPORT_EXPORT];
  assert.equal(typeof build, "function", `toolchain-preflight.mjs does not export ${R77_REPORT_EXPORT}(): the Spec 22.7 environment readiness report is not implemented`);
  const report = await build({ rootDir }, deps);
  assert.ok(report !== null && typeof report === "object" && Array.isArray(report.findings), "the report must carry a findings array");
  return report;
}
function r77Finding(report, id) {
  const matches = report.findings.filter((finding) => finding.findingId === id);
  assert.equal(matches.length, 1, `exactly one ${id} finding expected`);
  return matches[0];
}
async function r77WithFixtureRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), "r77-readiness-"));
  const saved = new Map(R77_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    const config = join(dir, "isolated-gitconfig");
    writeFileSync(config, "", "utf8");
    const repo = join(dir, "repo");
    mkdirSync(repo);
    Object.assign(process.env, { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1", HOME: dir, USERPROFILE: dir, XDG_CONFIG_HOME: dir });
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX"]) delete process.env[key];
    const init = spawnSync("git", ["init", "-q"], { cwd: repo, encoding: "utf8", env: process.env, shell: false });
    assert.equal(init.status, 0, `fixture git init failed: ${String(init.stderr)}`);
    return await fn(repo, { ...process.env });
  } finally {
    for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
function r77StubGit(repo, version) {
  const stubDir = join(repo, "stub-git");
  const stubPath = join(stubDir, process.platform === "win32" ? "git.exe" : "git");
  mkdirSync(stubDir, { recursive: true });
  writeFileSync(stubPath, "stub git executable fixture\n", "utf8");
  chmodSync(stubPath, 0o755);
  const calls = [];
  const runProbeFn = (executable, args) => { calls.push({ executable, args }); return args[0] === "--version" ? { ok: true, stdout: `git version ${version}\n`, stderr: "" } : { ok: true, stdout: "", stderr: "" }; };
  return { stubPath, calls, deps: { resolveTrustedExecutableFn: () => stubPath, runProbeFn } };
}
function r77Run(script, args, repo, env) {
  const run = spawnSync(process.execPath, [script, ...args], { cwd: repo, env, encoding: "utf8", shell: false, timeout: 120000 });
  return { status: run.status, text: `${run.stdout ?? ""}\n${run.stderr ?? ""}`.split(repo).join("<fixture>") };
}
function r77JsonObjects(text) {
  const objects = [];
  for (const line of String(text).split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try { objects.push(JSON.parse(trimmed)); } catch { /* not a one-line JSON document */ }
  }
  try { objects.push(JSON.parse(text)); } catch { /* not a single JSON document */ }
  return objects;
}
function r77EntryReport(label, run) {
  const found = r77JsonObjects(run.text).map((object) => object?.[R77_REPORT_FIELD]).find((value) => value !== null && typeof value === "object");
  assert.ok(found, `${label} output carries no ${R77_REPORT_FIELD} report (Spec 22.7: the same report is produced at this entry point)`);
  assert.ok(Array.isArray(found.findings), `${label} report must carry a findings array`);
  return found;
}

check("R7-7a: the matrix checker itself fails a non-ok finding without its typed repair (validator self-check, passes today by construction)", () => {
  const base = { findingId: "git-hooks", cause: "fixture" };
  assert.doesNotThrow(() => r77AssertFinding({ ...base, status: "ok", repair: null }, "ok"));
  assert.throws(() => r77AssertFinding({ ...base, status: "repairable", repair: null }, "repairable without repair"));
  assert.throws(() => r77AssertFinding({ ...base, status: "attended", repair: null }, "attended without repair"));
  assert.throws(() => r77AssertFinding({ ...base, status: "repairable", repair: { ...r77Action("x"), requiresConfirmation: true } }, "repairable asking for confirmation"));
  assert.throws(() => r77AssertFinding({ ...base, status: "attended", repair: r77Action("x") }, "attended carrying an agent action"));
  assert.throws(() => r77AssertFinding({ ...base, status: "ok", repair: null, extra: 1 }, "open field set"));
  assert.doesNotThrow(() => r77AssertFinding({ ...base, status: "repairable", repair: r77Action("x") }, "repairable"));
  assert.doesNotThrow(() => r77AssertFinding({ ...base, status: "attended", repair: r77Attended() }, "attended"));
});
check("R7-7a: a fixture matrix puts each of the eight finding ids in ok, repairable and attended, each non-ok with its typed repair, cause path-redacted", async () => {
  await r77WithFixtureRepo(async (repo) => {
    for (const id of R77_FINDING_IDS) {
      for (const status of ["ok", "repairable", "attended"]) {
        const label = `${id}/${status}`;
        const repair = status === "ok" ? null : status === "repairable" ? r77Action(repo) : r77Attended();
        const probe = () => ({ status, cause: `fixture ${label} observed under ${repo}`, repair });
        const report = await r77Report(repo, { [R77_PROBES_DEP]: r77Probes({ [id]: probe }) });
        assert.deepEqual(report.findings.map((finding) => finding.findingId).sort(), [...R77_FINDING_IDS].sort(), `${label}: the report carries exactly the eight closed finding ids, once each`);
        for (const finding of report.findings) r77AssertFinding(finding, `${label}/${finding.findingId}`);
        const finding = r77Finding(report, id);
        assert.equal(finding.status, status, `${label}: the fixture state must surface as the finding status`);
        assert.equal(r77LeaksPath(finding.cause, repo), false, `${label}: cause must be path-redacted`);
      }
    }
  });
});
check("R7-7a: a finding cause is bounded", async () => {
  await r77WithFixtureRepo(async (repo) => {
    const huge = "x".repeat(200000);
    const probes = r77Probes({ "git-hooks": () => ({ status: "attended", cause: huge, repair: r77Attended() }) });
    const finding = r77Finding(await r77Report(repo, { [R77_PROBES_DEP]: probes }), "git-hooks");
    assert.equal(typeof finding.cause, "string");
    assert.ok(finding.cause.length < huge.length, "an oversized cause must be bounded, not passed through whole");
  });
});
check("R7-7b: a stub git --version equal to the known-bad table entry yields git-version attended naming the fixed version", async () => {
  await r77WithFixtureRepo(async (repo) => {
    const stub = r77StubGit(repo, R77_KNOWN_BAD_GIT);
    const report = await r77Report(repo, { ...stub.deps, [R77_PROBES_DEP]: r77Probes({}, ["git-version"]) });
    const finding = r77Finding(report, "git-version");
    r77AssertFinding(finding, "known-bad git");
    assert.equal(finding.status, "attended");
    assert.ok(stub.calls.some(({ executable, args }) => args[0] === "--version" && basename(executable) === basename(stub.stubPath)), "the stub git --version must be the only version source");
    const fixed = JSON.stringify(finding.repair).replaceAll(R77_KNOWN_BAD_GIT, "").match(/\d+\.\d+\.\d+/u);
    assert.ok(fixed, "the attended prerequisite must name a fixed version other than the known-bad one");
  });
});
check("R7-7b: a stub git --version that matches no table entry yields git-version ok", async () => {
  await r77WithFixtureRepo(async (repo) => {
    for (const version of ["2.50.1", "2.47.1.windows.2"]) {
      const stub = r77StubGit(repo, version);
      const finding = r77Finding(await r77Report(repo, { ...stub.deps, [R77_PROBES_DEP]: r77Probes({}, ["git-version"]) }), "git-version");
      r77AssertFinding(finding, `unlisted git ${version}`);
      assert.equal(finding.status, "ok", `an unlisted version ${version} is ok`);
      assert.ok(stub.calls.some(({ args }) => args[0] === "--version"), "the stub git --version must be the only version source");
    }
  });
});
check("R7-7c: bootstrap and prepare-for-signature produce the same report content as the report itself; a non-ok finding hands over no command and starts no window", async () => {
  await r77WithFixtureRepo(async (repo, env) => {
    const bootstrap = r77EntryReport("bootstrap (pipeline-start-preflight)", r77Run(R77_SCRIPT("pipeline-start-preflight.mjs"), [], repo, env));
    const prepareRun = r77Run(R77_SCRIPT("guard-human-override.mjs"), ["prepare-for-signature", "--repo", repo, "--request-sha256", "0".repeat(64)], repo, env);
    const prepare = r77EntryReport("prepare-for-signature", prepareRun);
    const direct = await r77Report(repo);
    assert.ok(direct.findings.some((finding) => finding.status !== "ok"), "fixture precondition: a fresh clone carries a non-ok finding (git-hooks)");
    assert.deepEqual(bootstrap.findings, direct.findings, "bootstrap must carry the same findings as the report");
    assert.deepEqual(prepare.findings, direct.findings, "prepare-for-signature must carry the same findings as the report");
    for (const key of ["signIntentCommand", "authorizeBySignatureCommand", "expiresAt"]) assert.equal(prepareRun.text.includes(key), false, `prepare-for-signature with a non-ok finding must hand over no ${key} (no command, no window)`);
  });
});
check("R7-7e: a missing pre-push hook yields git-hooks repairable; running the typed repair installs it with no PO confirmation", async () => {
  await r77WithFixtureRepo(async (repo, env) => {
    const deps = () => ({ [R77_PROBES_DEP]: r77Probes({}, ["git-hooks"]) });
    const hookPath = (name) => join(repo, ".git", "hooks", name);
    const repair = (finding) => {
      assert.equal(finding.repair.requiresConfirmation, false, "the hook repair needs no PO confirmation");
      assert.equal(finding.repair.mutation, true, "installing hooks is a declared mutation");
      assert.equal(finding.repair.argv.some((arg) => resolve(arg).startsWith(join(REPO_ROOT, ".git"))), false, "the repair must never point into the real repository's .git");
      const run = spawnSync(finding.repair.executable, finding.repair.argv, { cwd: repo, env, encoding: "utf8", shell: false, timeout: 120000 });
      assert.equal(run.status, 0, `the typed repair must exit 0 (got ${run.status})`);
    };
    const fresh = r77Finding(await r77Report(repo, deps()), "git-hooks");
    r77AssertFinding(fresh, "fresh clone");
    assert.equal(fresh.status, "repairable", "a fresh clone has no mandatory hooks");
    repair(fresh);
    for (const name of R77_HOOKS) assert.ok(existsSync(hookPath(name)), `${name} must exist after the repair`);
    assert.equal(r77Finding(await r77Report(repo, deps()), "git-hooks").status, "ok", "after the repair git-hooks is ok");
    rmSync(hookPath("pre-push"));
    const missing = r77Finding(await r77Report(repo, deps()), "git-hooks");
    r77AssertFinding(missing, "missing pre-push");
    assert.equal(missing.status, "repairable", "a missing pre-push hook yields repairable");
    repair(missing);
    assert.ok(existsSync(hookPath("pre-push")), "the repair must reinstall the pre-push hook");
    assert.equal(r77Finding(await r77Report(repo, deps()), "git-hooks").status, "ok", "after the second repair git-hooks is ok");
  });
});
check("R7-7e: a foreign pre-push hook yields git-hooks attended and is left unchanged", async () => {
  await r77WithFixtureRepo(async (repo) => {
    const hooks = join(repo, ".git", "hooks");
    mkdirSync(hooks, { recursive: true });
    const foreign = "#!/bin/sh\n# foreign hook, not installed by the Pipeline\nexit 0\n";
    const path = join(hooks, "pre-push");
    writeFileSync(path, foreign, "utf8");
    chmodSync(path, 0o755);
    const finding = r77Finding(await r77Report(repo, { [R77_PROBES_DEP]: r77Probes({}, ["git-hooks"]) }), "git-hooks");
    r77AssertFinding(finding, "foreign pre-push");
    assert.equal(finding.status, "attended", "a foreign hook is never overwritten and yields the attended prerequisite");
    assert.equal(readFileSync(path, "utf8"), foreign, "the foreign hook must be left byte-identical");
  });
});
afterTests(() => {
process.stdout.write(`${passed}/${cases.length} checks passed.\n`);
});
registerTestCaseCompletion({ cases, fd: 3, maxBytes: 65536 });

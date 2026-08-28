#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * gitleaks.test.mjs -- regression coverage for gitleaks.mjs. Two concerns:
 *   1. CAPABILITY_CONTRACT_V2 (CYB-2D): pure shape/value assertions on the additive, frozen
 *      capability descriptor.
 *   2. The invocation-scope contract (cross-branch scan-scope fix, backlog
 *      2026-07-25-security-scan-cross-branch-gitleaks-findings): that run() ALWAYS passes
 *      `--no-git` to `gitleaks detect` (hermetic in-process spy, no real binary needed), plus an
 *      environment-gated reproduction proving `--no-git` closes the cross-branch git-history leak
 *      against a REAL gitleaks binary + a real `git worktree add --detach` fixture. The broader
 *      run()/isInstalled() status matrix (PASS/FINDINGS/ERROR/SKIPPED classification) stays
 *      covered by security-scan.test.mjs's fixture-binary suite; this file adds only the
 *      scope-guarantee cases that are gitleaks-adapter-local.
 *
 * Run:  node --test plugins/pipeline-core/scripts/security-adapters/gitleaks.test.mjs
 * Exit: 0 = all cases pass, non-zero = at least one case failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { name, CAPABILITY_CONTRACT_V2, gitleaksContentAuthorityLine, gitleaksConfigMissingResult, resolveGitleaksConfigPath, run } from "./gitleaks.mjs";
import { resolveTrustedSystemExecutable } from "../tool-identity.mjs";
import { repairStaleIgnoreEntry } from "../gitleaks-repair-ignore.mjs";

test("CAPABILITY_CONTRACT_V2 exists and is frozen", () => {
  assert.ok(CAPABILITY_CONTRACT_V2, "CAPABILITY_CONTRACT_V2 export is missing");
  assert.equal(Object.isFrozen(CAPABILITY_CONTRACT_V2), true);
});

test("CAPABILITY_CONTRACT_V2 fixed top-level fields match the documented v2 contract", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.contractVersion, "v2");
  assert.equal(CAPABILITY_CONTRACT_V2.kind, "capability");
  assert.equal(CAPABILITY_CONTRACT_V2.capabilityId, "cap.secrets");
  assert.equal(CAPABILITY_CONTRACT_V2.controlRef, null);
  assert.equal(CAPABILITY_CONTRACT_V2.supportedEcosystems, null);
  assert.equal(CAPABILITY_CONTRACT_V2.toolVersionConstraint, null);
  assert.equal(CAPABILITY_CONTRACT_V2.networkBehavior, "offline");
  assert.deepEqual(CAPABILITY_CONTRACT_V2.requiredInputs, ["rootDir"]);
  assert.equal(CAPABILITY_CONTRACT_V2.confidenceNormalization, null);
});

test("CAPABILITY_CONTRACT_V2.tool tracks the real `name` export, not a hardcoded duplicate string", () => {
  assert.equal(name, "gitleaks");
  assert.equal(CAPABILITY_CONTRACT_V2.tool, name);
});

test("CAPABILITY_CONTRACT_V2.severityNormalization faithfully transcribes the fixed-high rule", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.severityNormalization.source, "fixed");
  assert.equal(CAPABILITY_CONTRACT_V2.severityNormalization.value, "high");
  assert.equal(typeof CAPABILITY_CONTRACT_V2.severityNormalization.rationale, "string");
  assert.ok(CAPABILITY_CONTRACT_V2.severityNormalization.rationale.length > 0);
});

test("CAPABILITY_CONTRACT_V2.coverageLimitations is a non-empty array of factual strings", () => {
  assert.ok(Array.isArray(CAPABILITY_CONTRACT_V2.coverageLimitations));
  assert.ok(CAPABILITY_CONTRACT_V2.coverageLimitations.length >= 1);
  for (const entry of CAPABILITY_CONTRACT_V2.coverageLimitations) {
    assert.equal(typeof entry, "string");
    assert.ok(entry.length > 0);
  }
});

test("CAPABILITY_CONTRACT_V2.exitCodeMapping transcribes the real exit-code contract", () => {
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping["0"], /status derived from parsed report content/);
  assert.match(CAPABILITY_CONTRACT_V2.exitCodeMapping.nonzero, /scanner_error/);
});

test("CAPABILITY_CONTRACT_V2.timeoutContract matches run()'s real default and mechanism", () => {
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.defaultMs, 60000);
  assert.equal(CAPABILITY_CONTRACT_V2.timeoutContract.cancellable, true);
  assert.match(CAPABILITY_CONTRACT_V2.timeoutContract.mechanism, /spawnSync/);
});

test("CAPABILITY_CONTRACT_V2.evidenceFields matches the real findings.map(...) object shape", () => {
  assert.deepEqual(CAPABILITY_CONTRACT_V2.evidenceFields, ["tool", "severity", "rule", "path", "line", "msg"]);
});

test("CAPABILITY_CONTRACT_V2.coverageLimitations documents the --no-git file-content-only scope", () => {
  // Non-weakening strengthening of the existing non-empty-array check: the descriptor must now
  // honestly transcribe the --no-git scope (not the old, stale "installed binary's own default").
  const joined = CAPABILITY_CONTRACT_V2.coverageLimitations.join("\n");
  assert.match(joined, /--no-git/, "coverageLimitations must mention the --no-git flag");
  assert.doesNotMatch(joined, /unmodified by this adapter/, "the stale pre-fix wording must be gone");
});

// ===============================================================================================
// Invocation-scope contract -- run() ALWAYS passes --no-git (hermetic spy, no real binary)
// ===============================================================================================

test("run() always passes --no-git to `gitleaks detect`, keeping every existing flag (hermetic spy)", async () => {
  const calls = [];
  // Minimal in-process spy: records the argv it is handed and writes an empty (clean) report to
  // the --report-path the adapter chose, so run() parses it and returns PASS. No real binary,
  // no environment dependency -- this assertion holds identically everywhere.
  const spySpawn = (cmd, args) => {
    calls.push({ cmd, args });
    const reportPath = args[args.indexOf("--report-path") + 1];
    writeFileSync(reportPath, "[]");
    return { status: 0, stdout: "", stderr: "", error: null };
  };
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-nogit-spy-"));
  try {
    // config.binaryPath short-circuits PATH resolution -> run() executes the spy directly.
    const result = await run({ rootDir, config: { binaryPath: join(rootDir, "unused-fake-gitleaks") }, spawnFn: spySpawn, timeoutMs: 5000 });
    assert.equal(result.status, "PASS", `expected PASS from clean spy report, got ${result.status} (${result.reason ?? ""})`);
    assert.equal(calls.length, 1, "run() must invoke the scanner exactly once");
    const args = calls[0].args;
    assert.equal(args[0], "detect", "first arg must remain the `detect` subcommand");
    assert.ok(args.includes("--no-git"), `--no-git must be present in every detect invocation: ${JSON.stringify(args)}`);
    // Every pre-existing flag remains present and unchanged (the fix adds a flag, removes none).
    for (const flag of ["--source", "--report-format", "json", "--report-path", "--no-banner", "--exit-code", "0"]) {
      assert.ok(args.includes(flag), `existing flag ${flag} must remain in args: ${JSON.stringify(args)}`);
    }
    assert.equal(args[args.indexOf("--source") + 1], rootDir, "--source must still point at rootDir");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ===============================================================================================
// Config-path resolution (RW2-GITLEAKSCONFIG) -- GITLEAKS_CONFIG_PATH is self-application-scoped
// (resolved relative to this adapter module's own on-disk location, four directories below the
// repo root); a plugin-only deployment without the repo root present must fail with an explicit,
// specific diagnostic rather than an opaque scanner_error from letting gitleaks itself choke on a
// missing --config path.
// ===============================================================================================

test("gitleaksConfigMissingResult() returns a SKIPPED/success result naming both missing paths (NVA-J-GITLEAKSCONFIG: never a blocking ERROR)", () => {
  const result = gitleaksConfigMissingResult("/nonexistent/marketplace-root/.gitleaks.toml", "/nonexistent/marketplace-root/plugins/pipeline-core/config/security/gitleaks-default.toml");
  assert.equal(result.status, "SKIPPED");
  assert.equal(result.classification, "success", "classification must be 'success' -- security-scan.mjs's scannerEntry() defaults an unclassified SKIPPED to scanner_error otherwise");
  assert.deepEqual(result.findings, []);
  assert.equal(result.raw, null);
  assert.match(result.reason, /\/nonexistent\/marketplace-root\/\.gitleaks\.toml/);
  assert.match(result.reason, /\/nonexistent\/marketplace-root\/plugins\/pipeline-core\/config\/security\/gitleaks-default\.toml/);
});

test("run() short-circuits to gitleaksConfigMissingResult() BEFORE spawning gitleaks when GITLEAKS_CONFIG_PATH is absent (hermetic: fixture binaryPath points at a real, but config-less, sibling dir)", async () => {
  // This repo's own checkout always has a real .gitleaks.toml (GITLEAKS_CONFIG_PATH resolves
  // successfully here), so this case cannot be reproduced by pointing run() at a real missing
  // config -- it is deliberately covered as a pure unit test of the returned shape above, plus a
  // positive regression here confirming GITLEAKS_CONFIG_PATH DOES resolve in this checkout (the
  // self-application case the whole adapter is scoped to), so the new existsSync() guard never
  // fires for the deployment this repo's own verify/security-scan actually runs in.
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  // This test file lives in the SAME directory as gitleaks.mjs (security-adapters/), so the same
  // four-`..` climb GITLEAKS_CONFIG_PATH itself uses (see gitleaks.mjs) applies unchanged here.
  const configPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", ".gitleaks.toml");
  assert.ok(existsSync(configPath), `expected .gitleaks.toml to exist at the resolved repo-root path in this checkout: ${configPath}`);
  let spawnCalled = false;
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-config-present-spy-"));
  try {
    const spySpawn = (cmd, args) => {
      spawnCalled = true;
      writeFileSync(args[args.indexOf("--report-path") + 1], "[]");
      return { status: 0, stdout: "", stderr: "", error: null };
    };
    const result = await run({ rootDir, config: { binaryPath: join(rootDir, "unused-fake-gitleaks") }, spawnFn: spySpawn, timeoutMs: 5000 });
    assert.equal(result.status, "PASS", `expected PASS (config present, clean spy report), got ${result.status} (${result.reason ?? ""})`);
    assert.equal(spawnCalled, true, "gitleaks must still be spawned when the config is present");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ===============================================================================================
// NVA-J-GITLEAKSCONFIG -- rootDir must never be a config source; installed-plugin resolution
// must be exercised via a real fixture directory tree, not asserted on an error string.
// ===============================================================================================

test("run() never resolves --config from rootDir, even when a candidate tree plants its own .gitleaks.toml (the config must not be attacker/candidate-controlled)", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-candidate-config-plant-"));
  try {
    // A candidate commit could ship its own .gitleaks.toml trying to weaken the scan (e.g.
    // `useDefault = false`) -- the config must never be sourced from rootDir.
    writeFileSync(join(rootDir, ".gitleaks.toml"), "[extend]\nuseDefault = false\n");
    let invokedConfigArg = null;
    const spySpawn = (cmd, args) => {
      invokedConfigArg = args[args.indexOf("--config") + 1];
      writeFileSync(args[args.indexOf("--report-path") + 1], "[]");
      return { status: 0, stdout: "", stderr: "", error: null };
    };
    const result = await run({ rootDir, config: { binaryPath: join(rootDir, "unused-fake-gitleaks") }, spawnFn: spySpawn, timeoutMs: 5000 });
    assert.equal(result.status, "PASS", `expected PASS (real config still resolved), got ${result.status} (${result.reason ?? ""})`);
    assert.ok(invokedConfigArg, "spy must have captured a --config argument");
    assert.notEqual(invokedConfigArg, join(rootDir, ".gitleaks.toml"), "must never point --config at rootDir's own planted file");
    assert.ok(!invokedConfigArg.startsWith(rootDir), `--config must not resolve from anywhere under rootDir, got: ${invokedConfigArg}`);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("resolveGitleaksConfigPath() in THIS checkout resolves to the repo-root config, not the plugin-shipped default (self-application priority)", () => {
  // Same four-`..` climb GITLEAKS_CONFIG_PATH itself uses (gitleaks.mjs), applied from this test
  // file's own location (the same directory as gitleaks.mjs).
  const expectedRepoRootConfig = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", ".gitleaks.toml");
  const resolved = resolveGitleaksConfigPath();
  assert.equal(resolved, expectedRepoRootConfig, "expected the repo-root config to win priority over the plugin-shipped default in this checkout");
  assert.ok(!resolved.includes(join("config", "security", "gitleaks-default.toml")), `must not have fallen back to the plugin-shipped default, got: ${resolved}`);
});

test("run() resolves the plugin-shipped default config from an installed-plugin fixture with no repo root anywhere (real resolution algorithm via a copied module, not a mocked path)", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "gitleaks-installed-fixture-"));
  const scanRootDir = mkdtempSync(join(tmpdir(), "gitleaks-installed-fixture-scanroot-"));
  try {
    const adapterDir = join(fixtureRoot, "plugins", "pipeline-core", "scripts", "security-adapters");
    const configDir = join(fixtureRoot, "plugins", "pipeline-core", "config", "security");
    mkdirSync(adapterDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    // Copy the REAL adapter source verbatim -- this exercises the actual resolution algorithm
    // (climbing from the copy's own on-disk location), not a reimplementation of it.
    const realAdapterPath = fileURLToPath(new URL("./gitleaks.mjs", import.meta.url));
    copyFileSync(realAdapterPath, join(adapterDir, "gitleaks.mjs"));
    // Copy the REAL plugin-shipped default config (added by this task) into the same relative
    // position -- proves the shipped file itself, not a synthetic stand-in.
    const realDefaultConfigPath = fileURLToPath(new URL("../../config/security/gitleaks-default.toml", import.meta.url));
    copyFileSync(realDefaultConfigPath, join(configDir, "gitleaks-default.toml"));
    // fixtureRoot has no repo root at all above `plugins/` -- this models an installed-plugin
    // (marketplace) deployment with no Pipeline checkout present anywhere.
    assert.equal(existsSync(join(fixtureRoot, ".gitleaks.toml")), false, "sanity: fixture must carry no repo-root .gitleaks.toml");

    const fixtureModuleUrl = pathToFileURL(join(adapterDir, "gitleaks.mjs")).href;
    const fixtureAdapter = await import(fixtureModuleUrl);
    assert.equal(fixtureAdapter.resolveGitleaksConfigPath(), join(configDir, "gitleaks-default.toml"), "fixture module must resolve to its own plugin-shipped default, not the (absent) repo-root path");

    let invokedConfigArg = null;
    const spySpawn = (cmd, args) => {
      invokedConfigArg = args[args.indexOf("--config") + 1];
      writeFileSync(args[args.indexOf("--report-path") + 1], "[]");
      return { status: 0, stdout: "", stderr: "", error: null };
    };
    const result = await fixtureAdapter.run({ rootDir: scanRootDir, config: { binaryPath: join(scanRootDir, "unused-fake-gitleaks") }, spawnFn: spySpawn, timeoutMs: 5000 });
    assert.equal(result.status, "PASS", `expected PASS (plugin-shipped default resolved and used), got ${result.status} (${result.reason ?? ""})`);
    assert.equal(invokedConfigArg, join(configDir, "gitleaks-default.toml"), "gitleaks must be invoked with the plugin-shipped default config path");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(scanRootDir, { recursive: true, force: true });
  }
});

test("run() degrades to SKIPPED/success (never ERROR) from an installed-plugin fixture where NEITHER the repo-root NOR the plugin-shipped config exists (fail-safe for a stripped/corrupted install)", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "gitleaks-installed-fixture-noconfig-"));
  const scanRootDir = mkdtempSync(join(tmpdir(), "gitleaks-installed-fixture-noconfig-scanroot-"));
  try {
    const adapterDir = join(fixtureRoot, "plugins", "pipeline-core", "scripts", "security-adapters");
    mkdirSync(adapterDir, { recursive: true });
    // No `config/security/` directory created at all -- neither candidate config exists anywhere
    // under fixtureRoot.
    const realAdapterPath = fileURLToPath(new URL("./gitleaks.mjs", import.meta.url));
    copyFileSync(realAdapterPath, join(adapterDir, "gitleaks.mjs"));

    const fixtureModuleUrl = pathToFileURL(join(adapterDir, "gitleaks.mjs")).href;
    const fixtureAdapter = await import(fixtureModuleUrl);
    assert.equal(fixtureAdapter.resolveGitleaksConfigPath(), null, "sanity: fixture must resolve to no config at all");

    const result = await fixtureAdapter.run({
      rootDir: scanRootDir,
      config: { binaryPath: join(scanRootDir, "unused-fake-gitleaks") },
      spawnFn: () => { throw new Error("must not spawn gitleaks when no config resolved at all"); },
      timeoutMs: 5000,
    });
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.classification, "success");
    assert.deepEqual(result.findings, []);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(scanRootDir, { recursive: true, force: true });
  }
});

test("run() matches a content-v1 authority against the detached snapshot's absolute finding path", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-snapshot-authority-"));
  const candidatePath = join(rootDir, "backlog", "fixture.txt");
  const reportFinding = {
    File: candidatePath,
    RuleID: "fixture-rule",
    StartLine: 7,
    StartColumn: 3,
    Secret: "fixture-secret-value",
    Description: "fixture finding",
  };
  try {
    mkdirSync(join(rootDir, "backlog"), { recursive: true });
    writeFileSync(candidatePath, "fixture-only content\n");
    const authorityFinding = { ...reportFinding, File: "backlog/fixture.txt" };
    writeFileSync(join(rootDir, ".gitleaksignore"), `${gitleaksContentAuthorityLine(authorityFinding)}\n`);
    const spySpawn = (cmd, args) => {
      writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify([reportFinding]));
      return { status: 0, stdout: "", stderr: "", error: null };
    };
    const result = await run({ rootDir, config: { binaryPath: join(rootDir, "unused-fake-gitleaks") }, spawnFn: spySpawn, timeoutMs: 5000 });
    assert.equal(result.status, "PASS");
    assert.equal(result.findings.length, 0);
    assert.equal(result.ignored.findingCount, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ===============================================================================================
// Near-miss diagnostic + repair command (NVA-GLFP-1) -- a stale `.gitleaksignore` entry (same
// path+rule+column, different line) must say so explicitly and name the exact repair command; a
// genuine new finding (no entry at that location at all) must stay silent about it.
// ===============================================================================================

test("run() flags a near-miss: a .gitleaksignore entry exists for the same path+rule+column but a different line, and names both lines plus the literal repair command", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-nearmiss-"));
  try {
    const relPath = "backlog/fixture-nearmiss.txt";
    mkdirSync(join(rootDir, "backlog"), { recursive: true });
    writeFileSync(join(rootDir, relPath), "fixture content\n");
    // Stale entry: recorded at line 10, but edits moved the same finding down to line 55.
    const staleFinding = { File: relPath, RuleID: "fixture-rule", StartLine: 10, StartColumn: 4, Secret: "fixture-secret-value-a" };
    writeFileSync(join(rootDir, ".gitleaksignore"), `${gitleaksContentAuthorityLine(staleFinding)}\n`);
    const liveFinding = { File: join(rootDir, relPath), RuleID: "fixture-rule", StartLine: 55, StartColumn: 4, Secret: "fixture-secret-value-b", Description: "fixture finding" };
    const spySpawn = (cmd, args) => {
      writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify([liveFinding]));
      return { status: 0, stdout: "", stderr: "", error: null };
    };
    const result = await run({ rootDir, config: { binaryPath: join(rootDir, "unused-fake-gitleaks") }, spawnFn: spySpawn, timeoutMs: 5000 });
    assert.equal(result.status, "FINDINGS", "the stale entry must NOT suppress the finding -- going inert stays the safe direction");
    assert.equal(result.findings.length, 1);
    const msg = result.findings[0].msg;
    assert.match(msg, /stale/i);
    assert.match(msg, /line 10/, "must name the entry's recorded line");
    assert.match(msg, /line 55/, "must name the finding's current line");
    assert.match(msg, /gitleaks-repair-ignore\.mjs/, "must name the repair command literally");
    assert.match(msg, /--path backlog\/fixture-nearmiss\.txt/);
    assert.match(msg, /--rule fixture-rule/);
    assert.match(msg, /--column 4/);
    assert.match(msg, /--old-line 10/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("run() does NOT add the near-miss diagnostic when no .gitleaksignore entry exists at that path+rule+column at all (genuine new finding stays exactly as loud)", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-genuine-"));
  try {
    const relPath = "backlog/fixture-genuine.txt";
    mkdirSync(join(rootDir, "backlog"), { recursive: true });
    writeFileSync(join(rootDir, relPath), "fixture content\n");
    // The only ignore entry present is for an unrelated path -- proves the check is scoped to a
    // real same-location match, not "some entry exists somewhere in the file".
    const unrelatedFinding = { File: "backlog/unrelated.txt", RuleID: "fixture-rule", StartLine: 1, StartColumn: 1, Secret: "fixture-secret-value-c" };
    writeFileSync(join(rootDir, ".gitleaksignore"), `${gitleaksContentAuthorityLine(unrelatedFinding)}\n`);
    const liveFinding = { File: join(rootDir, relPath), RuleID: "fixture-rule", StartLine: 20, StartColumn: 4, Secret: "fixture-secret-value-d", Description: "fixture finding" };
    const spySpawn = (cmd, args) => {
      writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify([liveFinding]));
      return { status: 0, stdout: "", stderr: "", error: null };
    };
    const result = await run({ rootDir, config: { binaryPath: join(rootDir, "unused-fake-gitleaks") }, spawnFn: spySpawn, timeoutMs: 5000 });
    assert.equal(result.status, "FINDINGS");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].msg, "fixture finding", "no diagnostic text appended -- must stay byte-identical to the original message");
    assert.doesNotMatch(result.findings[0].msg, /gitleaks-repair-ignore/);
    assert.doesNotMatch(result.findings[0].msg, /stale/i);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("gitleaks-repair-ignore.mjs's repairStaleIgnoreEntry() recomputes a stale entry in place, and the scan then accepts it", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-repair-"));
  try {
    const relPath = "backlog/fixture-repair.txt";
    mkdirSync(join(rootDir, "backlog"), { recursive: true });
    writeFileSync(join(rootDir, relPath), "fixture content\n");
    const staleFinding = { File: relPath, RuleID: "fixture-rule", StartLine: 3, StartColumn: 7, Secret: "fixture-secret-value-e" };
    const preexistingEntry = "content-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:backlog/other.txt:fixture-rule:1:1";
    writeFileSync(join(rootDir, ".gitleaksignore"), `${preexistingEntry}\n${gitleaksContentAuthorityLine(staleFinding)}\n`);
    const liveFinding = { File: join(rootDir, relPath), RuleID: "fixture-rule", StartLine: 48, StartColumn: 7, Secret: "fixture-secret-value-e", Description: "fixture finding" };
    const spySpawn = (cmd, args) => {
      writeFileSync(args[args.indexOf("--report-path") + 1], JSON.stringify([liveFinding]));
      return { status: 0, stdout: "", stderr: "", error: null };
    };

    const before = await run({ rootDir, config: { binaryPath: join(rootDir, "unused-fake-gitleaks") }, spawnFn: spySpawn, timeoutMs: 5000 });
    assert.equal(before.status, "FINDINGS", "sanity: the stale entry must not already suppress the moved finding");

    const repairResult = await repairStaleIgnoreEntry({
      rootDir,
      path: relPath,
      rule: "fixture-rule",
      column: 7,
      oldLine: 3,
      spawnFn: spySpawn,
      binaryPath: join(rootDir, "unused-fake-gitleaks"),
    });
    assert.equal(repairResult.ok, true, `expected repair to succeed: ${repairResult.reason ?? ""}`);
    assert.equal(repairResult.oldLine, 3);
    assert.equal(repairResult.newLine, 48);

    const rewritten = readFileSync(join(rootDir, ".gitleaksignore"), "utf8");
    assert.ok(rewritten.includes(preexistingEntry), "the unrelated pre-existing entry must be left untouched");
    assert.equal(rewritten.includes(gitleaksContentAuthorityLine(staleFinding)), false, "the stale entry itself must be gone");

    const after = await run({ rootDir, config: { binaryPath: join(rootDir, "unused-fake-gitleaks") }, spawnFn: spySpawn, timeoutMs: 5000 });
    assert.equal(after.status, "PASS", `expected the repaired entry to now suppress the finding, got ${after.status} (${JSON.stringify(after.findings)})`);
    assert.equal(after.ignored.findingCount, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("repairStaleIgnoreEntry() refuses when no entry matches path+rule+column+old-line (nothing to repair, never guesses)", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-repair-noop-"));
  try {
    writeFileSync(join(rootDir, ".gitleaksignore"), "content-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:backlog/other.txt:fixture-rule:1:1\n");
    const result = await repairStaleIgnoreEntry({
      rootDir,
      path: "backlog/nonexistent.txt",
      rule: "fixture-rule",
      column: 7,
      oldLine: 3,
      spawnFn: () => { throw new Error("must not spawn gitleaks when there is nothing to repair"); },
      binaryPath: join(rootDir, "unused-fake-gitleaks"),
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /nothing to repair/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ===============================================================================================
// Environment-gated reproduction -- real gitleaks + a real detached-worktree cross-branch fixture
// ===============================================================================================

function gitUsable() {
  try {
    return spawnSync("git", ["--version"], { encoding: "utf8", shell: false }).status === 0;
  } catch {
    return false;
  }
}

// Mirror the runner's own production trust probe (resolveTrustedSystemExecutable) rather than a
// raw PATH walk: this is the exact capability-probe-gating convention security-scan.mjs uses to
// decide whether a real scanner may run. When no trusted gitleaks binary (or no git) is resolvable
// -- e.g. CI without the tool -- the test SKIPS cleanly with a stated reason; it never fails or
// errors for genuine tool-absence. The skip path is the only sanctioned green-without-running case.
const gitleaksProbe = resolveTrustedSystemExecutable("gitleaks");
const reproSkip = !gitleaksProbe.ok
  ? `no trusted gitleaks binary resolvable on host (status=${gitleaksProbe.status}); real cross-branch reproduction needs one`
  : !gitUsable()
    ? "git is not spawnable on host; real cross-branch reproduction needs a working git"
    : false;

// Rule-config regression needs only a real gitleaks binary (no git worktree involved).
const gitleaksOnlySkip = !gitleaksProbe.ok
  ? `no trusted gitleaks binary resolvable on host (status=${gitleaksProbe.status}); rule-config regression needs one`
  : false;

// ===============================================================================================
// Path-scoped rule-config regression (PHX-WP-GITLEAKS-RULE-SCOPE) -- proves run()'s new fixed
// `--config <repo-root>/.gitleaks.toml` wiring actually narrows sentry-access-token/generic-api-key
// to backlog/transitions.ndjson ONLY, using the real gitleaks binary and the real, delivered
// .gitleaks.toml (never a synthetic/fixture config -- this exercises exactly what production runs).
// ===============================================================================================

test(
  "run() wires the repo's .gitleaks.toml: a ledger-shaped amendment line at backlog/transitions.ndjson produces no sentry-access-token finding, while the identical secret-shaped string elsewhere still does (real gitleaks binary)",
  { skip: gitleaksOnlySkip },
  async () => {
    // A real reachability-amendment-shaped line (four bare 64-hex-character SHA-256 digests),
    // the exact shape documented in backlog/2026-08-08-the-hash-chained-ledger-collides-
    // permanently-with-the-secret-scanner.md. `supersedesEntryHash`'s value is the literal that
    // trips gitleaks' `sentry-access-token` rule (empirically confirmed while designing this fix).
    const amendmentLine = `${JSON.stringify({
      actor: "hotfix-047-reachability-repair",
      at: "2026-07-30",
      entryHash: "7b7a0fe4ec4551933201bb4bc356fbb23e744ac23af8deda061a794400386ac7",
      evidence: {
        commit: "83640cec22d494d227eebc82929370277ce926b9",
        kind: "reachability-amendment",
        reference: "backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md",
        referenceBlobOid: "708c5c05b1868b616e0d56974da4316bf6fc43d5",
        referenceSha256: "90ba0093cf0494ce44c3f1c7cdb207cff0813c55c3a11eac5f2cebc46e701024",
        supersedesEntryHash: "84d2128467224ca61aa980c088e92473b9dda27959ecd29600cf8d4a72b83d3b",
        supersedesSequence: 39,
      },
      from: "open",
      id: "pipeline.elephant-direct-implementation-under-afk-authorization",
      previousHash: "48d371f383d42919d565cdb3caab6e4f51ba9803d1fbbfd29c0e44339fe32a5e",
      reason: "Append reachable evidence for historical event 39 without rewriting it or changing item status.",
      schema: "pipeline.backlog-transition.v1",
      sequence: 42,
      to: "open",
    })}\n`;

    const rootDir = mkdtempSync(join(tmpdir(), "gitleaks-rule-scope-"));
    try {
      mkdirSync(join(rootDir, "backlog"), { recursive: true });
      mkdirSync(join(rootDir, "other"), { recursive: true });
      // Ledger path: must produce zero sentry-access-token findings once .gitleaks.toml is wired in.
      writeFileSync(join(rootDir, "backlog", "transitions.ndjson"), amendmentLine);
      // Control: the IDENTICAL secret-shaped content, at a DIFFERENT path -- the load-bearing proof
      // that the allowlist stayed scoped to backlog/transitions.ndjson and did not weaken the rule
      // anywhere else.
      writeFileSync(join(rootDir, "other", "copy.ndjson"), amendmentLine);

      const result = await run({ rootDir, config: { binaryPath: gitleaksProbe.path }, timeoutMs: 20000 });
      assert.equal(result.status, "FINDINGS", `expected the control file to still trip a finding, got ${result.status} (${result.reason ?? ""})`);

      const ledgerFindings = result.findings.filter((f) => f.path === "backlog/transitions.ndjson" && f.rule === "sentry-access-token");
      assert.equal(ledgerFindings.length, 0, `backlog/transitions.ndjson must produce zero sentry-access-token findings once .gitleaks.toml is wired in, got: ${JSON.stringify(ledgerFindings)}`);

      const controlFindings = result.findings.filter((f) => f.path === "other/copy.ndjson" && f.rule === "sentry-access-token");
      assert.equal(controlFindings.length, 1, `other/copy.ndjson (identical secret-shaped content, different path) must still trip sentry-access-token -- proof the allowlist did not weaken the rule elsewhere, got: ${JSON.stringify(controlFindings)}`);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  },
);

test(
  "reproduction: bare `detect` leaks a sibling branch's secret from a detached worktree; --no-git closes it (real gitleaks + git, env-gated)",
  { skip: reproSkip },
  async () => {
    const gitleaksBin = gitleaksProbe.path;
    const parent = mkdtempSync(join(tmpdir(), "gitleaks-xbranch-repro-"));
    const repoDir = join(parent, "repo");
    const worktreeDir = join(parent, "candidate-worktree"); // git creates this; must not pre-exist
    mkdirSync(repoDir, { recursive: true });

    const git = (...args) => {
      const r = spawnSync("git", args, { cwd: repoDir, encoding: "utf8", shell: false });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
      return (r.stdout || "").trim();
    };
    const runReal = (extraArgs, reportName) => {
      const reportPath = join(parent, reportName);
      const args = ["detect", "--source", worktreeDir, ...extraArgs, "--report-format", "json", "--report-path", reportPath, "--no-banner", "--exit-code", "0"];
      const r = spawnSync(gitleaksBin, args, { cwd: worktreeDir, encoding: "utf8", shell: false });
      assert.equal(r.status, 0, `gitleaks exited ${r.status} (expected 0 via --exit-code 0): ${(r.stderr || "").slice(0, 400)}`);
      return JSON.parse(readFileSync(reportPath, "utf8"));
    };

    try {
      // Branch B (the candidate): one benign commit, NO secret in its tree.
      git("init", "-q", "-b", "candidate");
      git("config", "user.name", "Gitleaks Repro Fixture");
      git("config", "user.email", "gitleaks-repro@example.invalid");
      writeFileSync(join(repoDir, "readme.txt"), "ordinary project readme, no credentials here\n");
      git("add", "-A");
      git("commit", "-qm", "candidate base (branch B) -- no secret in tree");
      const candidateCommit = git("rev-parse", "HEAD");

      // Branch A: a sibling branch, NOT an ancestor of the candidate, whose commit adds a file
      // with an obvious, gitleaks-detectable, clearly-fixture-only secret-shaped token. Models a
      // secret that only ever lived on an unrelated local branch (the real bug: sprint-nova-codex).
      git("checkout", "-q", "-b", "sibling-leak");
      // FIXTURE-ONLY fake Slack-bot-token shape, assembled from fragments at RUNTIME so that no
      // contiguous secret-shaped literal is ever committed to a tracked source file -- this repo's
      // own --no-git candidate-tree scan would otherwise (correctly) flag THIS very test. The bytes
      // written to the sibling file are identical to a real-shaped token, so gitleaks still detects
      // it there; only the on-disk representation of THIS test source is kept scanner-clean.
      const fixtureToken = ["xoxb", "1234567890", "1234567890123", "aBcDeFgHiJkLmNoPqRsTuVwX"].join("-");
      writeFileSync(join(repoDir, "sibling-secret.txt"), `slack_bot_token = "${fixtureToken}"\n`);
      git("add", "-A");
      git("commit", "-qm", "secret on sibling branch A (never merged into the candidate)");
      git("checkout", "-q", "candidate");

      // Sanity: branch A must NOT be an ancestor of the candidate, else B's own tree would carry it.
      const isAncestor = spawnSync("git", ["merge-base", "--is-ancestor", "sibling-leak", "candidate"], { cwd: repoDir, shell: false }).status === 0;
      assert.equal(isAncestor, false, "fixture invalid: sibling-leak must not be an ancestor of the candidate");

      // Materialize exactly like security-scan.mjs's materializeCandidate(): a detached worktree at
      // the candidate commit, sharing the repo's .git object database (that sharing is the root cause).
      git("worktree", "add", "--detach", worktreeDir, candidateCommit, "-q");

      // OLD invocation (no --no-git): must surface branch A's secret via the shared object DB --
      // proves the cross-branch bug reproduces on this real binary.
      const oldFindings = runReal([], "report-old.json");
      assert.ok(oldFindings.length >= 1, `OLD invocation must reproduce the cross-branch leak (>=1 finding), got ${oldFindings.length}`);
      assert.ok(
        oldFindings.some((f) => (f.File || "").includes("sibling-secret.txt")),
        `OLD invocation must attribute a finding to branch A's file, got: ${JSON.stringify(oldFindings.map((f) => f.File))}`,
      );

      // NEW invocation (--no-git): scans only the candidate tree's actual files (readme only) -- the
      // sibling-branch secret is not on disk, so it must produce zero findings. This is the fix.
      const newFindings = runReal(["--no-git"], "report-new.json");
      assert.equal(newFindings.length, 0, `NEW invocation (--no-git) must not surface any cross-branch finding, got: ${JSON.stringify(newFindings)}`);
    } finally {
      // Unconditional cleanup (including on assertion failure): deregister the worktree, then remove
      // the whole temp tree. Never leave a stray worktree registered on the host.
      try { spawnSync("git", ["worktree", "remove", "--force", worktreeDir], { cwd: repoDir, shell: false }); } catch { /* best-effort */ }
      try { rmSync(parent, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  },
);

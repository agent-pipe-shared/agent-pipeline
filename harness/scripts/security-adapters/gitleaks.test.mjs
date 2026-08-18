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
 * Run:  node --test harness/scripts/security-adapters/gitleaks.test.mjs
 * Exit: 0 = all cases pass, non-zero = at least one case failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { name, CAPABILITY_CONTRACT_V2, gitleaksContentAuthorityLine, run } from "./gitleaks.mjs";
import { resolveTrustedSystemExecutable } from "../security-readiness/tool-identity.mjs";

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

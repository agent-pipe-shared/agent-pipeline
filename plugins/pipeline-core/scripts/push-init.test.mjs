#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for push-init.mjs (NVA-V4-PUSHDRIVER).
 *
 * Fixtures live under temporary directories (`scratch/push-init-*`), never against the real
 * repository state, EXCEPT the one test explicitly marked "real repo" below -- mirroring
 * push-prepare.test.mjs's own D3 exception: it runs check-doc-reconciliation.mjs for real,
 * as a real subprocess, against this repository's own real HEAD, to prove the one genuinely
 * spawned step actually runs end to end rather than merely being spelled correctly.
 *
 * `satisfiabilityDeps`/`prepareDeps` mirror push-prepare.test.mjs's own `readyDeps()` idiom
 * exactly (mocked git/filesystem/PO-approval-directory reads), so "all preconditions met"
 * never needs a real Git working tree with real evidence files or a real PO approval
 * directory.
 *
 * Run: node --test plugins/pipeline-core/scripts/push-init.test.mjs
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildPushInitArgv, buildReconciliationArgv, drivePushInit, parseArgs, RECONCILIATION_SCRIPT_RELATIVE_PATH } from "./push-init.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SCRATCH = join(REPO_ROOT, "scratch");
mkdirSync(SCRATCH, { recursive: true });
const FIXTURE_DIR = mkdtempSync(join(SCRATCH, "push-init-"));
after(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

const HEAD = "1a757618133eb27b62f1e427b2fb55895da42d85";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

test("parseArgs: accepts a well-formed --root/--by/--remote/--destination, --base optional", () => {
  const full = parseArgs(["--root", "/x", "--by", "t", "--remote", "origin", "--destination", "refs/heads/main"]);
  assert.equal(full.error, undefined);
  assert.equal(full.base, undefined);
  const withBase = parseArgs(["--root", "/x", "--by", "t", "--remote", "origin", "--destination", "refs/heads/main", "--base", "HEAD~1"]);
  assert.equal(withBase.base, "HEAD~1");
});

test("parseArgs: refuses a missing required flag", () => {
  assert.ok(parseArgs(["--by", "t", "--remote", "origin", "--destination", "refs/heads/main"]).error);
  assert.ok(parseArgs(["--root", "/x", "--remote", "origin", "--destination", "refs/heads/main"]).error);
});

test("parseArgs: refuses an unknown argument and a flag with no value", () => {
  assert.ok(parseArgs(["--root", "/x", "--by", "t", "--remote", "origin", "--destination", "refs/heads/main", "--nope", "x"]).error);
  assert.ok(parseArgs(["--root", "/x", "--by"]).error);
});

// ---------------------------------------------------------------------------
// buildPushInitArgv / buildReconciliationArgv -- shape sanity (guard-admission is proven
// against these same functions in guard-lifecycle-ready.test.mjs, NVA-V4-PUSHDRIVER)
// ---------------------------------------------------------------------------

test("buildPushInitArgv: omits --base when absent, includes it when supplied", () => {
  const withoutBase = buildPushInitArgv({ root: "/x", by: "t", remote: "origin", destination: "refs/heads/main" });
  assert.equal(withoutBase.includes("--base"), false);
  const withBase = buildPushInitArgv({ root: "/x", by: "t", remote: "origin", destination: "refs/heads/main", base: "HEAD~1" });
  assert.deepEqual(withBase.slice(-2), ["--base", "HEAD~1"]);
});

test("buildReconciliationArgv: candidate is always the literal ref HEAD, never invented otherwise", () => {
  const argv = buildReconciliationArgv({ scriptPath: "/x/check-doc-reconciliation.mjs", base: "HEAD~1", root: "/proj" });
  assert.deepEqual(argv, ["/x/check-doc-reconciliation.mjs", "--base", "HEAD~1", "--candidate", "HEAD", "--root", "/proj"]);
});

// ---------------------------------------------------------------------------
// drivePushInit -- deps fixtures (mirrors push-prepare.test.mjs's readyDeps())
// ---------------------------------------------------------------------------

function satisfiabilityDepsAllGreen(overrides = {}) {
  return {
    resolveHeadCommit: () => HEAD,
    exists: (path) => path.endsWith("push-threat-model.md") || path.endsWith("trust-policy.json"),
    readFile: (path) => {
      if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "k", publicKeySha256: "a".repeat(64), humanName: "Tester" });
      if (path.endsWith("verify-latest.json")) return JSON.stringify({ exitCode: 0, commit: HEAD });
      if (path === "/fake/calibration.json") return JSON.stringify({ verify: "node harness/scripts/verify.mjs" });
      throw new Error(`unexpected read: ${path}`);
    },
    resolveAuthorityArtifactPath: () => ({ exists: true, path: "/fake/calibration.json" }),
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [] }),
    parseHumanArgs: () => ({ directory: "/external/po-dir" }),
    resolveGitCommonDir: () => null,
    now: () => new Date("2026-08-16T20:00:00.000Z"),
    ...overrides,
  };
}

function prepareDepsAllGreen(overrides = {}) {
  return {
    gitHead: () => HEAD,
    gitStatus: () => "",
    exists: (path) => path.endsWith("push-threat-model.md") || path.endsWith("trust-policy.json"),
    readFile: (path) => {
      if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "k", publicKeySha256: "a".repeat(64), humanName: "Tester" });
      if (path.endsWith("verify-latest.json") || path.endsWith("security-latest.json")) return JSON.stringify({ exitCode: 0, commit: HEAD });
      throw new Error(`unexpected read: ${path}`);
    },
    readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: [] }),
    parseHumanArgs: () => ({ directory: "/external/po-dir" }),
    readState: () => ({ status: "ok", state: { activeFeature: { id: "nova-push-init", planPath: "specs/sprint-nova-epic/plans/nova-push-init.md" } } }),
    gitCommonDir: () => "/external/po-dir/.fake-common",
    derivePoGateRepositoryFingerprint: () => "0123456789ab",
    now: () => new Date("2026-08-16T20:00:00.000Z"),
    pipelineStateRun: () => {
      console.log(JSON.stringify({ schema: "pipeline.push-subject-preview.v1", subjectSha256: "7fefc0ada3b7726f39460bf7e001ed4b71ad66c173f0132d00fcbd0648f5601a" }));
      return 0;
    },
    // Deliberately NOT overridden: the REAL authorizeCriticalPushCommand (po-human-
    // approval.mjs) must be what builds the presented signature command, or the
    // "never driver-executable" property this suite checks would prove nothing real.
    ...overrides,
  };
}

function freshFixtureRoot() {
  return mkdtempSync(join(SCRATCH, "push-init-case-"));
}

// ---------------------------------------------------------------------------
// DoD 1: chains consecutive command steps without a human turn between them
// ---------------------------------------------------------------------------

test("drivePushInit: chains all three steps (reconciliation, gate-satisfiability, push-prepare) in one call, reaches signature-required", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture placeholder, never executed -- run is injected\n");
    let reconciliationCalls = 0;
    const run = (executable, argv) => {
      reconciliationCalls += 1;
      return { status: 0, stdout: "Doc reconciliation: fixture pass.\n", stderr: "" };
    };
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1",
      run, satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "signature-required", JSON.stringify(result, null, 2));
    assert.equal(reconciliationCalls, 1, "reconciliation must run exactly once, not zero, not repeated");
    assert.equal(result.steps.length, 3);
    assert.deepEqual(result.steps.map((step) => step.id), ["doc-reconciliation", "push-gate-satisfiability", "push-prepare"]);
    for (const step of result.steps) assert.equal(step.ok, true, JSON.stringify(step));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: layer 1b is skipped, not failed, when the project has no harness/scripts/check-doc-reconciliation.mjs", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "signature-required", JSON.stringify(result, null, 2));
    // No reconciliation step was pushed at all -- nothing to run against.
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: harness/scripts/check-doc-reconciliation.mjs present but --base omitted stops with that precondition named, never invents a range", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
    const result = drivePushInit({ rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main" });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks[0].id, "doc-reconciliation");
    assert.equal(result.checks[0].status, "base-required");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// DoD 2 -- THE MOST IMPORTANT PROPERTY: the driver stops at the signature and cannot
// pass it. Guard-level backstop for the exact same command lives in
// guard-lifecycle-ready.test.mjs (NVA-V4-PUSHDRIVER); this is the driver's own structural
// half of the property.
// ---------------------------------------------------------------------------

test("drivePushInit: the signature-required outcome never carries a driver-executable action, for the real authorize-critical command", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "signature-required");
    assert.equal(result.signatureCommand.executedByDriver, false);
    assert.equal(result.followOn.executedByDriver, false);
    // The command IS the real one (proves this is not a no-op stub) --
    assert.ok(result.signatureCommand.lines.some((line) => line.includes("po-human-approval.mjs")));
    assert.ok(result.signatureCommand.lines.some((line) => line.includes("authorize-critical")));
    // -- and nothing in `steps` (the property actually EXECUTED) ever names it.
    for (const step of result.steps) {
      assert.equal(JSON.stringify(step).includes("po-human-approval"), false, JSON.stringify(step));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: push-init.mjs's own source never imports or spawns po-human-approval.mjs -- no code path could reach it", () => {
  const source = readFileSync(fileURLToPath(new URL("./push-init.mjs", import.meta.url)), "utf8");
  // The header comment names it in prose ("THE SIGNATURE BOUNDARY"); a real `import`/spawn
  // reference would additionally show up as the literal module specifier below -- absent here.
  assert.doesNotMatch(source, /["'`]\.\/po-human-approval\.mjs["'`]/u, "push-init.mjs must never import po-human-approval.mjs directly");
});

// ---------------------------------------------------------------------------
// DoD 3: a failing precondition stops the driver with that precondition named, rather than
// proceeding. Four named cases: dirty tree, stale verify evidence, missing threat model,
// unavailable trust anchor.
// ---------------------------------------------------------------------------

test("drivePushInit: dirty working tree stops at push-prepare's own check, named, even though gate-satisfiability does not check it", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(),
      prepareDeps: prepareDepsAllGreen({ gitStatus: () => " M dirty.mjs\n" }),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks.length, 1);
    assert.equal(result.checks[0].id, "working-tree-clean");
    assert.equal(result.checks[0].ok, false);
    assert.equal(result.steps.map((step) => step.id).includes("push-prepare"), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: stale verify evidence stops at the cheap gate-satisfiability preflight, named, before push-prepare ever runs", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen({
        readFile: (path) => {
          if (path.endsWith("trust-policy.json")) return JSON.stringify({ keyReference: "k", publicKeySha256: "a".repeat(64), humanName: "Tester" });
          if (path.endsWith("verify-latest.json")) return JSON.stringify({ exitCode: 0, commit: "stale-commit-sha" });
          if (path === "/fake/calibration.json") return JSON.stringify({ verify: "node harness/scripts/verify.mjs" });
          throw new Error(`unexpected read: ${path}`);
        },
      }),
      prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    // The ONLY failing check -- proves this fixture isolates exactly the one precondition
    // under test, not a side effect of an unrelated fixture gap.
    assert.deepEqual(result.checks.map((check) => check.id), ["verify-evidence-bound"], JSON.stringify(result.checks));
    // Fails fast: push-prepare never ran.
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: missing push-threat-model.md stops at gate-satisfiability, named, before push-prepare ever runs", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen({ exists: (path) => path.endsWith("trust-policy.json") }),
      prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks.some((check) => check.id === "push-threat-model-materialized"), true, JSON.stringify(result.checks));
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: an unavailable trust anchor (no trustAnchor, no trustAnchors) stops at gate-satisfiability, named", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen({
        readCriticalHumanProofPolicy: () => ({ ok: true, trustAnchor: null, trustAnchors: null }),
      }),
      prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks.some((check) => check.id === "trust-anchor-present"), true, JSON.stringify(result.checks));
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// DoD 4: re-entrancy -- running the driver twice from the same state does not double-
// execute a step. Every underlying check is read-only by construction (see push-init.mjs's
// own header comment), so this is a stronger, byte-identity property, not merely "no
// crash on retry".
// ---------------------------------------------------------------------------

test("drivePushInit: re-entrant -- two consecutive calls from unchanged state produce byte-identical results, and each runs the spawned step exactly once", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
    let calls = 0;
    const run = () => { calls += 1; return { status: 0, stdout: "ok\n", stderr: "" }; };
    const args = {
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1",
      run, satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    };
    const first = drivePushInit(args);
    const second = drivePushInit(args);
    assert.deepEqual(first, second);
    assert.equal(calls, 2, "exactly one reconciliation spawn per invocation -- 2 invocations, 2 calls, never more");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Real-repo integration: the one genuinely spawned step (check-doc-reconciliation.mjs),
// run for real, against this repository's own real HEAD -- mirrors push-prepare.test.mjs's
// own D3 exception. This repository's own reconciliation state can legitimately change over
// time (it did: commit b84fd343 turned a real finding this check used to fail into a pass),
// so this test asserts the INVARIANT that holds either way rather than one fixed shape:
// step 1 is always the real spawn, argv[0] always names the real script, and the driver's
// own continue-or-stop decision must follow THAT spawn's own `ok`, never a guess -- it stops
// at exactly one step with the failure named when the real verdict is a fail, and it must
// have continued past layer 1b (never re-reporting doc-reconciliation as a failing check)
// when the real verdict is a pass. A fixed `steps.length === 1` expectation would (and did)
// silently re-encode "the repository currently has an outstanding finding" as if it were a
// property of the driver -- it is not; only the follow-verdict behavior is.
// ---------------------------------------------------------------------------

test("drivePushInit: real repo -- layer 1b actually spawns check-doc-reconciliation.mjs and surfaces ITS real verdict, never a guess", () => {
  const result = drivePushInit({ rootDir: REPO_ROOT, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1" });
  // Layer 1b is always step 1, and it is a real spawn against the real script, not a guess --
  // true regardless of the reconciliation outcome.
  assert.ok(result.steps.length >= 1, "layer 1b must always run and be recorded as step 1");
  const reconciliationStep = result.steps[0];
  assert.equal(reconciliationStep.id, "doc-reconciliation");
  assert.equal(reconciliationStep.executable, "node");
  assert.equal(reconciliationStep.argv[0], join(REPO_ROOT, RECONCILIATION_SCRIPT_RELATIVE_PATH));
  assert.equal(typeof reconciliationStep.exitCode, "number", "a real subprocess always reports a numeric exit code");

  if (reconciliationStep.ok === false) {
    // The real script's own real failure: the driver must stop immediately on it, never
    // proceed on a guess, and surface that script's own verdict (not an invented one).
    assert.equal(result.outcome, "precondition-unmet", JSON.stringify(result, null, 2));
    assert.equal(result.steps.length, 1, "a failing real verdict must stop the driver at step 1, never proceed");
    assert.equal(result.checks.length, 1);
    assert.equal(result.checks[0].id, "doc-reconciliation");
    assert.equal(result.checks[0].ok, false);
    assert.equal(typeof result.checks[0].message, "string");
    assert.ok(result.checks[0].message.length > 0, "the surfaced verdict must carry the real script's own message, not a placeholder");
  } else {
    // The real script's own real pass: the driver must have continued past layer 1b on the
    // strength of THAT verdict -- never stopping at step 1 as though it failed, and never
    // re-reporting doc-reconciliation as a failing check further down.
    assert.equal(reconciliationStep.exitCode, 0);
    assert.ok(result.steps.length > 1, "a passing real verdict must let the driver continue past layer 1b, never stop as if it failed");
    assert.ok(["precondition-unmet", "error", "signature-required"].includes(result.outcome), result.outcome);
    if (result.outcome === "precondition-unmet") {
      assert.equal(result.checks.some((check) => check.id === "doc-reconciliation"), false, "layer 1b already passed; it must not resurface as a failing check");
    }
  }
});

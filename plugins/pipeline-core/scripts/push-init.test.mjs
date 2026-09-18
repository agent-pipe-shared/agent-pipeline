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

import { buildPushInitArgv, buildReconciliationArgv, driveCheckpointPushInit, drivePushInit, parseArgs, RECONCILIATION_SCRIPT_RELATIVE_PATH } from "./push-init.mjs";
import { run as pipelineStateRun } from "./pipeline-state.mjs";
import { checkVerifyContractConfigured } from "./push-gate-satisfiability.mjs";
import { verifyEvidenceFixture } from "../lib/verify-selection-fixture.mjs";

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

test("parseArgs: accepts the explicit checkpoint selector without weakening the ordinary path", () => {
  const parsed = parseArgs(["--root", "/x", "--by", "t", "--remote", "origin", "--destination", "refs/heads/feat/checkpoint", "--checkpoint"]);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.checkpoint, true);
});

// ---------------------------------------------------------------------------
// buildPushInitArgv / buildReconciliationArgv -- shape sanity (guard-admission is proven
// against these same functions in guard-lifecycle-ready.test.mjs, NVA-V4-PUSHDRIVER)
// ---------------------------------------------------------------------------

test("buildPushInitArgv: preserves every optional reconciliation selector in a retry", () => {
  const withoutBase = buildPushInitArgv({ root: "/x", by: "t", remote: "origin", destination: "refs/heads/main" });
  assert.equal(withoutBase.includes("--base"), false);
  const withSelectors = buildPushInitArgv({
    root: "/x", by: "t", remote: "origin", destination: "refs/heads/main",
    base: "HEAD~1", candidate: "candidate-S", recordRef: "record-R",
  });
  assert.deepEqual(withSelectors.slice(-6), ["--base", "HEAD~1", "--candidate", "candidate-S", "--record-ref", "record-R"]);
});

test("driveCheckpointPushInit: accepts only the configured exact feature source/destination with clean candidate and intent", () => {
  const run = (_command, argv) => {
    const last = argv.at(-1);
    if (argv.includes("symbolic-ref")) return { status: 0, stdout: "refs/heads/feat/checkpoint\n" };
    if (argv.includes("status")) return { status: 0, stdout: "" };
    if (last === "HEAD") return { status: 0, stdout: "remote backup before refactor\n" };
    throw new Error(`unexpected argv: ${JSON.stringify(argv)}`);
  };
  const load = () => ({
    status: "ok",
    manifest: {
      gates: { push: { mode: "blocking", type: "human", approval: "required" } },
      pushDestinationPolicy: { schema: "pipeline.push-destination-policy.v1", checkpointNamespace: "refs/heads/feat/" },
    },
  });
  const ready = driveCheckpointPushInit({ rootDir: "/fixture", by: "tester", remote: "origin", destination: "refs/heads/feat/checkpoint", run, load });
  assert.equal(ready.outcome, "checkpoint-ready", JSON.stringify(ready));
  assert.equal(ready.gitPushLine, "git -C /fixture push origin refs/heads/feat/checkpoint:refs/heads/feat/checkpoint");
  const quotedRoot = driveCheckpointPushInit({ rootDir: "/fixture with space", by: "tester", remote: "origin", destination: "refs/heads/feat/checkpoint", run, load });
  assert.equal(quotedRoot.outcome, "checkpoint-ready", JSON.stringify(quotedRoot));
  assert.equal(quotedRoot.gitPushLine, "git -C '/fixture with space' push origin refs/heads/feat/checkpoint:refs/heads/feat/checkpoint");
  const protectedDestination = driveCheckpointPushInit({ rootDir: "/fixture", by: "tester", remote: "origin", destination: "refs/heads/main", run, load });
  assert.equal(protectedDestination.outcome, "precondition-unmet");
  assert.equal(protectedDestination.checks.find((check) => check.id === "checkpoint-destination").ok, false);
});

test("driveCheckpointPushInit: absent or off push gate fails closed", () => {
  const run = (_command, argv) => {
    if (argv.includes("symbolic-ref")) return { status: 0, stdout: "refs/heads/feat/checkpoint\n" };
    if (argv.includes("status")) return { status: 0, stdout: "" };
    return { status: 0, stdout: "remote backup\n" };
  };
  const policy = { schema: "pipeline.push-destination-policy.v1", checkpointNamespace: "refs/heads/feat/" };
  for (const manifest of [
    { pushDestinationPolicy: policy },
    { gates: { push: { mode: "off", type: "human", approval: "required" } }, pushDestinationPolicy: policy },
  ]) {
    const result = driveCheckpointPushInit({ rootDir: "/fixture", by: "tester", remote: "origin", destination: "refs/heads/feat/checkpoint", run, load: () => ({ status: "ok", manifest }) });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks.find((check) => check.id === "checkpoint-push-gate").ok, false);
  }
});

test("driveCheckpointPushInit: unsafe command inputs never reach checkpoint-ready", () => {
  const run = (_command, argv) => {
    if (argv.includes("symbolic-ref")) return { status: 0, stdout: "refs/heads/feat/checkpoint\n" };
    if (argv.includes("status")) return { status: 0, stdout: "" };
    return { status: 0, stdout: "remote backup\n" };
  };
  const load = () => ({ status: "ok", manifest: { gates: { push: { mode: "blocking", type: "human", approval: "required" } }, pushDestinationPolicy: { schema: "pipeline.push-destination-policy.v1", checkpointNamespace: "refs/heads/feat/" } } });
  for (const [remote, destination] of [["origin;touch", "refs/heads/feat/checkpoint"], ["origin", "refs/heads/feat/checkpoint with-space"], ["origin", "refs/heads/feat/"]]) {
    const result = driveCheckpointPushInit({ rootDir: "/fixture", by: "tester", remote, destination, run, load });
    assert.notEqual(result.outcome, "checkpoint-ready");
    assert.equal(Object.hasOwn(result, "gitPushLine"), false);
  }
});

test("buildReconciliationArgv: candidate and record-ref are explicit caller inputs, never invented (NVA-B-PUSHINIT-1)", () => {
  const withoutRecordRef = buildReconciliationArgv({ scriptPath: "/x/check-doc-reconciliation.mjs", base: "HEAD~1", candidate: "abc123", root: "/proj" });
  assert.deepEqual(withoutRecordRef, ["/x/check-doc-reconciliation.mjs", "--base", "HEAD~1", "--candidate", "abc123", "--root", "/proj"]);
  const withRecordRef = buildReconciliationArgv({ scriptPath: "/x/check-doc-reconciliation.mjs", base: "HEAD~1", candidate: "abc123", root: "/proj", recordRef: "HEAD" });
  assert.deepEqual(withRecordRef, ["/x/check-doc-reconciliation.mjs", "--base", "HEAD~1", "--candidate", "abc123", "--root", "/proj", "--record-ref", "HEAD"]);
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
      if (path.endsWith("verify-latest.json")) return JSON.stringify(verifyEvidenceFixture(HEAD));
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
      if (path.endsWith("verify-latest.json")) return JSON.stringify(verifyEvidenceFixture(HEAD));
      if (path.endsWith("security-latest.json")) return JSON.stringify({ exitCode: 0, commit: HEAD });
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

function writeLateVerifyFixture(root) {
  const verify = "node -e \"console.error('pipeline: the verify contract of this project is not configured'); process.exit(1)\"";
  const calibration = { project: "push-init-late-verify", verify, handover: "docs/state.md" };
  mkdirSync(join(root, "project"), { recursive: true });
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  writeFileSync(join(root, ".claude", "pipeline.json"), `${JSON.stringify(calibration, null, 2)}\n`);
  writeFileSync(join(root, "project", "pipeline-state.json"), JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "push-init-late-verify", planPath: "specs/push-init-late-verify/prd.md", phase: "design" },
    planApproved: true,
    planApproval: { approvedBy: "PO", approvedAt: "2026-09-18T12:00:00.000Z" },
  }, null, 2));
}

function pushInitGateReport() {
  return {
    ok: true,
    report: {
      satisfiable: true,
      checks: [{ id: "verify-contract-configured", status: "baseline-only", ok: true, message: "baseline contract" }],
    },
  };
}

// ---------------------------------------------------------------------------
// DoD 1: chains consecutive command steps without a human turn between them
// ---------------------------------------------------------------------------

test("drivePushInit: baseline-only implementation publishes configure-verify and proceeds after its exact apply action", () => {
  const root = freshFixtureRoot();
  try {
    writeLateVerifyFixture(root);
    const stateDeps = { dir: root, now: () => "2026-09-18T12:00:00.000Z" };
    assert.equal(pipelineStateRun(["set-phase", "--phase", "implementation"], stateDeps), 0);

    const blocked = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: {},
      assessPushGateSatisfiability: () => pushInitGateReport(),
      pushPrepareReport: () => ({ ok: true, report: { ready: false, checks: [{ id: "verify-evidence-bound", ok: false, message: "baseline has no release evidence" }] } }),
    });
    assert.equal(blocked.outcome, "precondition-unmet", JSON.stringify(blocked, null, 2));
    assert.equal(blocked.recovery.actions.length, 1);
    const action = blocked.recovery.actions[0];
    assert.equal(action.kind, "collect-input");
    assert.deepEqual(action.inputs.map((input) => input.name), ["verify-command"]);
    assert.equal(action.requiresConfirmation, false,
      "the push driver only collects the command at its read-only recovery boundary");
    assert.equal(action.applyAction.requiresConfirmation, true,
      "the exact protected calibration write requires fresh attended confirmation");
    assert.deepEqual(action.applyAction.argv.slice(1, 3), ["configure-verify", "--verify-command"],
      "push-init must return the sanctioned CLI action rather than a reconstructed shell command");
    assert.equal(action.applyAction.argv.some((value) => String(value).includes("scratch") || String(value).includes("guard-human-override")), false,
      "the executable recovery has no scratch-file or HGO path");

    const command = `${process.execPath} --test harness/scripts/check-consumer-safe-paths.test.mjs`;
    assert.equal(pipelineStateRun(["configure-verify", "--verify-command", command], stateDeps), 0);
    assert.equal(checkVerifyContractConfigured(root).ok, true,
      "the exact late recovery replaces the baseline contract for push readiness");
    const ready = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: {},
      assessPushGateSatisfiability: () => pushInitGateReport(),
      pushPrepareReport: () => ({
        ok: true,
        report: { ready: true, subjectSha256: "a".repeat(64), checks: [] },
        lines: { authorize: ["human command"], approvePush: ["approve command"], gitPush: "git push" },
      }),
    });
    assert.equal(ready.outcome, "signature-required", JSON.stringify(ready, null, 2));
    assert.equal(Object.hasOwn(ready, "recovery"), false,
      "once configured, ordinary push-init can continue into its existing signature boundary");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

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
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1", candidate: "HEAD",
      run, satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "signature-required", JSON.stringify(result, null, 2));
    assert.equal(reconciliationCalls, 1, "reconciliation must run exactly once, not zero, not repeated");
    assert.equal(result.steps.length, 3);
    assert.deepEqual(result.steps.map((step) => step.id), ["doc-reconciliation", "push-gate-satisfiability", "push-prepare"]);
    for (const step of result.steps) assert.equal(step.ok, true, JSON.stringify(step));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: reconciliation accepts WSL EPERM only after status zero, while non-zero and status-less results stop fail-closed", () => {
  const eperm = Object.assign(new Error("sandbox transport completed late"), { code: "EPERM" });
  const cases = [
    { run: () => ({ status: 0, stdout: "pass\n", stderr: "", error: eperm }), outcome: "signature-required" },
    { run: () => ({ status: 1, stdout: "", stderr: "failed" }), outcome: "precondition-unmet" },
    { run: () => ({ status: 2, stdout: "ADR-0001: unreconciled\n", stderr: "findings", error: eperm }), outcome: "precondition-unmet", retainedOutput: "findings\nADR-0001: unreconciled" },
    { run: () => ({ stdout: "", stderr: "missing status" }), outcome: "precondition-unmet" },
  ];
  for (const { run, outcome, retainedOutput } of cases) {
    const root = freshFixtureRoot();
    try {
      mkdirSync(join(root, "harness", "scripts"), { recursive: true });
      writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
      const result = drivePushInit({
        rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1", candidate: "HEAD",
        run, satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
      });
      assert.equal(result.outcome, outcome, JSON.stringify(result));
      if (retainedOutput) assert.equal(result.checks[0].message, retainedOutput);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
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

test("drivePushInit: missing reconciliation base reports it with policy checks and stops before the later commit report", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks[0].id, "doc-reconciliation");
    assert.equal(result.checks[0].status, "base-required");
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: harness/scripts/check-doc-reconciliation.mjs present, --base supplied but --candidate omitted reports that precondition and never invents HEAD (NVA-B-PUSHINIT-1)", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1",
      satisfiabilityDeps: satisfiabilityDepsAllGreen(), prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks[0].id, "doc-reconciliation");
    assert.equal(result.checks[0].status, "candidate-required");
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability"]);
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

test("drivePushInit: stale verify evidence is reported by the cheap preflight while push-prepare still collects its independent checks", () => {
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
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: missing push-threat-model.md is reported while push-prepare still collects its independent checks", () => {
  const root = freshFixtureRoot();
  try {
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen({ exists: (path) => path.endsWith("trust-policy.json") }),
      prepareDeps: prepareDepsAllGreen(),
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(result.checks.some((check) => check.id === "push-threat-model-materialized"), true, JSON.stringify(result.checks));
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: one run returns failures from satisfiability and push-prepare together", () => {
  const root = freshFixtureRoot();
  try {
    let prepareOptions = null;
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      assessPushGateSatisfiability: () => ({
        ok: true,
        report: {
          satisfiable: false,
          checks: [
            { id: "verify-contract-configured", ok: false, message: "verify missing" },
            { id: "push-threat-model-materialized", ok: false, message: "threat model missing" },
          ],
        },
      }),
      pushPrepareReport: (_argv, _deps, options) => {
        prepareOptions = options;
        return {
          ok: true,
          report: {
            ready: false,
            checks: [
              { id: "working-tree-clean", ok: false, message: "tree dirty" },
              { id: "security-evidence", ok: false, message: "security evidence missing" },
            ],
          },
        };
      },
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
    assert.deepEqual(result.checks.map((check) => check.id), [
      "verify-contract-configured",
      "push-threat-model-materialized",
      "working-tree-clean",
      "security-evidence",
    ]);
    assert.deepEqual(prepareOptions, { foldPendingApprovalWrite: false });
    assert.equal(result.recovery.schema, "pipeline.push-init-recovery.v1");
    assert.equal(result.recovery.status, "action-required");
    assert.deepEqual(result.recovery.blockers.map((check) => check.id), result.checks.map((check) => check.id));
    assert.deepEqual(result.recovery.retryAction.argv.slice(1), [
      "--root", root, "--by", "tester", "--remote", "origin", "--destination", "refs/heads/main",
    ]);
    assert.equal(result.recovery.retryAction.mutation, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("drivePushInit: an onboarding-set machine-plane anchor resolves the key directory without disclosing it in the signature instructions", () => {
  const root = freshFixtureRoot();
  try {
    let satisfiabilityAnchorReads = 0;
    let prepareAnchorReads = 0;
    const tofuPolicy = () => ({ ok: true, trustAnchor: null, trustAnchors: null });
    const machinePlane = () => ({
      status: "valid",
      plane: { poKeyDirectory: "/external/po-dir" },
    });
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      satisfiabilityDeps: satisfiabilityDepsAllGreen({
        readCriticalHumanProofPolicy: tofuPolicy,
        resolveLocalOperatorKeyAnchor: () => {
          satisfiabilityAnchorReads += 1;
          return { keyReference: "fixture-operator-key", publicKeySha256: "a".repeat(64) };
        },
        readMachinePlane: machinePlane,
      }),
      prepareDeps: prepareDepsAllGreen({
        readCriticalHumanProofPolicy: tofuPolicy,
        resolveLocalOperatorKeyAnchor: () => {
          prepareAnchorReads += 1;
          return { keyReference: "fixture-operator-key", publicKeySha256: "a".repeat(64) };
        },
        readMachinePlane: machinePlane,
      }),
    });
    assert.equal(result.outcome, "signature-required", JSON.stringify(result, null, 2));
    assert.deepEqual(result.steps.map((step) => step.id), ["push-gate-satisfiability", "push-prepare"]);
    assert.equal(satisfiabilityAnchorReads, 1, "the cheap preflight must resolve the onboarding-set operator anchor");
    assert.equal(prepareAnchorReads, 1, "push-prepare must independently resolve the same operator anchor");
    assert.equal(result.signatureCommand.executedByDriver, false);
    const instructions = result.signatureCommand.lines.join("\n");
    assert.ok(instructions.includes("The configured approval directory is resolved automatically."), JSON.stringify(result.signatureCommand));
    assert.equal(instructions.includes("/external/po-dir"), false, JSON.stringify(result.signatureCommand));
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
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1", candidate: "HEAD",
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
// own verdict must be retained, never guessed. A failure remains named and the commit-neutral
// satisfiability preflight still runs. The later record-commit preparation does not run until
// reconciliation is green, so one result never mixes substantive S and record R findings.
// A pass must never reappear as a failing reconciliation check.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reproduce-first regression: NVA-B-PUSHINIT-1. The checker's own contract requires
// --candidate and --record-ref to be able to differ (a record naming candidate X cannot
// live inside X's own tree). Before the fix, drivePushInit has no `candidate`/`recordRef`
// input at all -- buildReconciliationArgv() always emits the literal "HEAD" and never
// emits --record-ref, so the two collapse onto the same commit and the check is
// unsatisfiable by construction. This fixture is a REAL, already-reconciled range in this
// repository's own history (commit 8681046622... is the candidate named in an existing
// docs/doc-reconciliation.md section, and it is an ancestor of the current real HEAD, which
// serves as --record-ref by the checker's own default) -- proving the check CAN pass when
// given the two refs it actually needs, which the driver could not previously supply.
// ---------------------------------------------------------------------------

test("drivePushInit: real repo -- an explicit candidate distinct from the record-ref lets layer 1b actually pass (NVA-B-PUSHINIT-1 regression)", () => {
  const result = drivePushInit({
    rootDir: REPO_ROOT, by: "tester", remote: "origin", destination: "refs/heads/main",
    base: "56e91858d96f9d58db75c306424b79c256c1fe74",
    candidate: "8681046622dc23956b760ba93552793b3d983193",
    // record-ref intentionally omitted: defaults to HEAD, which descends from the candidate
    // above and carries the already-reconciled record for it.
  });
  const reconciliationStep = result.steps[0];
  assert.equal(reconciliationStep.id, "doc-reconciliation", JSON.stringify(result, null, 2));
  assert.equal(reconciliationStep.exitCode, 0, JSON.stringify(reconciliationStep));
  assert.equal(reconciliationStep.ok, true, JSON.stringify(reconciliationStep));
});

test("drivePushInit: real repo -- layer 1b actually spawns check-doc-reconciliation.mjs and surfaces ITS real verdict, never a guess", () => {
  const result = drivePushInit({ rootDir: REPO_ROOT, by: "tester", remote: "origin", destination: "refs/heads/main", base: "HEAD~1", candidate: "HEAD" });
  // Layer 1b is always step 1, and it is a real spawn against the real script, not a guess --
  // true regardless of the reconciliation outcome.
  assert.ok(result.steps.length >= 1, "layer 1b must always run and be recorded as step 1");
  const reconciliationStep = result.steps[0];
  assert.equal(reconciliationStep.id, "doc-reconciliation");
  assert.equal(reconciliationStep.executable, "node");
  assert.equal(reconciliationStep.argv[0], join(REPO_ROOT, RECONCILIATION_SCRIPT_RELATIVE_PATH));
  assert.equal(typeof reconciliationStep.exitCode, "number", "a real subprocess always reports a numeric exit code");

  if (reconciliationStep.ok === false) {
    // The real script's own real failure is surfaced with the commit-neutral policy preflight;
    // the R-bound push preparation is intentionally deferred.
    assert.equal(result.outcome, "precondition-unmet", JSON.stringify(result, null, 2));
    assert.deepEqual(result.steps.map((step) => step.id), ["doc-reconciliation", "push-gate-satisfiability"]);
    const surfaced = result.checks.find((check) => check.id === "doc-reconciliation");
    assert.equal(surfaced?.ok, false);
    assert.equal(typeof surfaced?.message, "string");
    assert.ok(surfaced.message.length > 0, "the surfaced verdict must carry the real script's own message, not a placeholder");
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

test("drivePushInit: a failed S-to-R reconciliation never invokes the R-bound preparation report", () => {
  const root = freshFixtureRoot();
  try {
    mkdirSync(join(root, "harness", "scripts"), { recursive: true });
    writeFileSync(join(root, "harness", "scripts", "check-doc-reconciliation.mjs"), "// fixture\n");
    let prepareCalls = 0;
    const result = drivePushInit({
      rootDir: root, by: "tester", remote: "origin", destination: "refs/heads/main",
      base: "base", candidate: "substantive-S", recordRef: "record-R",
      run: () => ({ status: 2, stdout: "", stderr: "unreconciled" }),
      satisfiabilityDeps: satisfiabilityDepsAllGreen(),
      pushPrepareReport: () => { prepareCalls += 1; throw new Error("must not run"); },
    });
    assert.equal(result.outcome, "precondition-unmet");
    assert.equal(prepareCalls, 0);
    assert.deepEqual(result.steps.map((step) => step.id), ["doc-reconciliation", "push-gate-satisfiability"]);
    assert.equal(result.checks[0].id, "doc-reconciliation");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

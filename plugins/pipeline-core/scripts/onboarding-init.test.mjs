#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

/**
 * Process-level regression harness for onboarding-init.mjs, same idiom as
 * project-onboarding-e2e.test.mjs: this spawns the shipped CLI entry points against
 * disposable, real temporary directories rather than importing project-onboarding-v3.mjs's
 * library seams, so what is exercised is exactly what an agent invoking this driver would
 * get -- real `git`, real filesystem writes, real subprocess boundaries. Only the
 * non-converging step-cap scenario below uses a synthetic `run` responder: constructing a
 * genuinely infinite real onboarding chain is not a real repository shape, so mocking is
 * the more honest choice there.
 *
 * NVA-W3-ONBOARDENV: every test below that spawns the real onboarding CLI (i.e. omits its
 * own synthetic `run`) threads `env: FIXTURE_ENV` -- `PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE`
 * pointed at a disposable fixture home this suite owns, honoured by
 * `project-onboarding-v3.mjs`'s own `main()`. Before this, the same suite spawned that CLI
 * with no env override at all, so it read the REAL operator's `$HOME` machine-plane state
 * (`readMachinePlane()`/`detectExistingLocalTrustAnchor()`) -- a suite gating verify with two
 * legitimate outcomes depending on who ran it (backlog:
 * 2026-08-28-a-verify-gate-suite-reads-real-machine-state-through-a-subprocess.md).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createHash, generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";

import { DEFAULT_STEP_CAP, SCHEMA, applyTrustAnchorBootstrap, driveOnboardingInit } from "./onboarding-init.mjs";

const PROJECT_ONBOARDING_SCRIPT_PATH = fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url));

function freshRoot() {
  return mkdtempSync(join(tmpdir(), "onboarding-init-test-"));
}

function freshHome() {
  return mkdtempSync(join(tmpdir(), "onboarding-init-test-home-"));
}

function dispose(path) {
  rmSync(path, { recursive: true, force: true });
}

// One disposable fixture home for the whole suite: none of the "real subprocess" tests
// below assert anything ABOUT the machine plane, they only need to never read the
// operator's real one. A single fresh, empty home (no `.agent-pipeline/machine.json`, no
// signing key) makes every one of them resolve the same "never been asked" onboarding path
// regardless of which machine or PO key state the suite happens to run under.
const FIXTURE_HOME = freshHome();
const FIXTURE_ENV = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: FIXTURE_HOME };
after(() => dispose(FIXTURE_HOME));

// NVA-CF-BL17-ONBOARDINIT (backlog: 2026-08-28-a-verify-gate-suite-reads-real-machine-
// state-through-a-subprocess.md, AC-1): a SECOND fixture home, pre-seeded with a signing
// key in exactly the shape `detectExistingLocalTrustAnchor()`
// (lib/project-onboarding-v3.mjs) expects -- `<home>/.agent-pipeline/machine.json`
// (schema `pipeline.machine-plane.v1`, `poKeyDirectory` pointing at a directory) whose
// `trust-policy.json` names a `keyReference` and a 64-hex `publicKeySha256`
// (`lib/machine-plane.mjs` field shapes). Both fixture homes are wired into the SAME
// driver via the SAME env seam, so the "with a PO key" and "without one" branches are
// each reached provably from a fixture rather than from whatever the real operator's
// `$HOME` happens to hold.
const FIXTURE_HOME_WITH_KEY = freshHome();
const FIXTURE_KEY_DIRECTORY = join(FIXTURE_HOME_WITH_KEY, "po-key-directory");
mkdirSync(FIXTURE_KEY_DIRECTORY, { recursive: true });
mkdirSync(join(FIXTURE_HOME_WITH_KEY, ".agent-pipeline"), { recursive: true });
const FIXTURE_PUBLIC_KEY_SHA256 = createHash("sha256").update("onboarding-init-test-fixture-key").digest("hex");
writeFileSync(
  join(FIXTURE_KEY_DIRECTORY, "trust-policy.json"),
  `${JSON.stringify({
    keyReference: "onboarding-init-test-fixture-key",
    publicKeySha256: FIXTURE_PUBLIC_KEY_SHA256,
    humanName: "Onboarding Init Test Fixture PO",
  }, null, 2)}\n`,
);
writeFileSync(
  join(FIXTURE_HOME_WITH_KEY, ".agent-pipeline", "machine.json"),
  `${JSON.stringify({
    schema: "pipeline.machine-plane.v1",
    poKeyDirectory: FIXTURE_KEY_DIRECTORY,
    pushApprovalDefault: "signature",
    routing: null,
    language: null,
    session: null,
    usage: null,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`,
);
const FIXTURE_ENV_WITH_KEY = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: FIXTURE_HOME_WITH_KEY };
after(() => dispose(FIXTURE_HOME_WITH_KEY));

// NVA-GF-GREENFIELD-3RUNNERDRIVER-1: one explicit runner x machine-key matrix replaces
// the former two-runner lane test plus Claude-only key comparison. Every cell is a real
// subprocess walk against a fresh root. The injected ambient marker deliberately names a
// DIFFERENT runner, so an omitted `--runner` on any generated step fails visibly instead
// of accidentally agreeing with the current test host.
const GREENFIELD_RUNNERS = ["claude", "codex", "antigravity"];
const GREENFIELD_MACHINE_STATES = [
  { name: "no-registered-key", env: FIXTURE_ENV, hasKey: false },
  { name: "valid-registered-key", env: FIXTURE_ENV_WITH_KEY, hasKey: true },
];

function withConflictingAmbientRunner(env, runner) {
  const conflicted = { ...env };
  for (const key of ["CLAUDECODE", "ANTIGRAVITY_AGENT", "AI_AGENT", "CODEX_SESSION_ID", "CODEX_THREAD_ID"]) delete conflicted[key];
  if (runner === "claude") conflicted.CODEX_THREAD_ID = "ambient-codex-fixture";
  else conflicted.CLAUDECODE = "1";
  return conflicted;
}

function actionInputNames(action) {
  if (!action || typeof action !== "object") return [];
  return (action.inputs ?? (action.input ? [action.input] : []))
    .map((input) => input?.name)
    .filter((name) => typeof name === "string");
}

function assertPinnedRunner(result, runner, label) {
  assert.equal(result.runner, runner, `${label}: the selected lane is reported`);
  for (const step of result.steps) {
    const indexes = step.argv.flatMap((value, index) => value === "--runner" ? [index] : []);
    assert.equal(indexes.length, 1, `${label}: every generated step has exactly one --runner`);
    assert.equal(step.argv[indexes[0] + 1], runner, `${label}: every generated step carries the selected runner`);
    assert.equal(step.faultCode, null, `${label}: ${JSON.stringify(step.argv)} must not fault`);
    assert.equal(step.exitCode, 0, `${label}: ${JSON.stringify(step.argv)} must exit zero`);
  }
}

function recordAnsweredOnboardingValues(root, runner, env) {
  const applied = spawnSync(process.execPath, [
    PROJECT_ONBOARDING_SCRIPT_PATH,
    "intake-consent-apply",
    "--root", root,
    "--granted",
    "--git-author-name", "Greenfield Matrix PO",
    "--git-author-email", "greenfield-matrix@example.invalid",
    "--language", "en",
    "--profile", "feature",
    "--activate",
    "--runner", runner,
  ], { encoding: "utf8", shell: false, env });
  assert.equal(applied.status, 0, applied.stderr);

  for (const [key, value] of [["user.name", "Greenfield Matrix PO"], ["user.email", "greenfield-matrix@example.invalid"]]) {
    const configured = spawnSync("git", ["config", key, value], { cwd: root, encoding: "utf8", shell: false, env });
    assert.equal(configured.status, 0, configured.stderr);
  }
}

test("driveOnboardingInit: Claude, Codex, and Antigravity converge across fresh no-key/valid-key homes without ambient drift or repeated answered asks", () => {
  const roots = [];
  const firstShapes = [];
  try {
    for (const runner of GREENFIELD_RUNNERS) {
      for (const machine of GREENFIELD_MACHINE_STATES) {
        const root = freshRoot();
        roots.push(root);
        const label = `${runner}/${machine.name}`;
        const env = withConflictingAmbientRunner(machine.env, runner);
        const first = driveOnboardingInit({ rootDir: root, runner, env });

        assert.equal(first.schema, SCHEMA, label);
        assert.equal(first.outcome, "pending-asks", `${label}: first stable stop is genuine published human input: ${JSON.stringify(first)}`);
        assert.equal(first.final?.status, "runtime-initialization-required", `${label}: runner choice must not alter the stable boundary`);
        assert.equal(first.final?.nextAction?.kind, "command", `${label}: pending asks accompany the unchanged real next command`);
        assert.ok(first.pendingAsks.length > 0, `${label}: the boundary must carry real asks`);
        assertPinnedRunner(first, runner, label);
        firstShapes.push({ schema: first.schema, outcome: first.outcome, status: first.final.status, nextActionKind: first.final.nextAction.kind });

        const askNames = first.pendingAsks.flatMap(actionInputNames);
        assert.equal(askNames.includes("trustAnchorPointerRepairAcknowledged"), false, `${label}: a fresh or valid key is never a broken pointer`);
        assert.equal(askNames.includes("trustAnchorPolicyRepairAcknowledged"), false, `${label}: a valid policy is never an external repair failure`);
        if (machine.hasKey) {
          const policy = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
          assert.equal(policy.schema, "pipeline.critical-human-proof-policy.v3", `${label}: the existing key is reusable`);
          assert.ok(policy.trustAnchors.some((anchor) => anchor.publicKeySha256 === FIXTURE_PUBLIC_KEY_SHA256), `${label}: the reusable key digest is materialized into the fresh policy`);
          assert.equal(askNames.includes("trustAnchorAbsentAcknowledged"), false, `${label}: a valid existing key is not reported absent`);
        } else {
          const policy = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
          assert.equal(policy.schema, "pipeline.critical-human-proof-policy.v1", `${label}: the no-key home must not inherit an external anchor`);
          assert.equal(Object.prototype.hasOwnProperty.call(policy, "trustAnchors"), false, `${label}: the no-key policy carries no inherited anchors`);
        }

        // Record the values the first human round already supplied, then re-enter the SAME
        // root. Identity is fulfilled through the exact repository-local git-config route
        // its ask names; language/profile remain in the private intake checkpoint. None may
        // be asked again, while unrelated unresolved asks remain a truthful stopping point.
        recordAnsweredOnboardingValues(root, runner, env);
        const reentrant = driveOnboardingInit({ rootDir: root, runner, env });
        assert.equal(reentrant.outcome, "pending-asks", `${label}: unrelated genuine asks remain surfaced`);
        assertPinnedRunner(reentrant, runner, `${label}/reentrant`);
        const reentrantNames = [
          ...reentrant.pendingAsks.flatMap(actionInputNames),
          ...actionInputNames(reentrant.collectInput),
        ];
        for (const answered of ["gitAuthorName", "gitAuthorEmail", "language", "profile"]) {
          assert.equal(reentrantNames.includes(answered), false, `${label}: answered ${answered} must not be asked again`);
        }
      }
    }
    assert.equal(new Set(firstShapes.map((shape) => JSON.stringify(shape))).size, 1, "all six cells converge to one driver outcome shape");
  } finally {
    for (const root of roots) dispose(root);
  }
});

test("public onboarding driver imports and materializes the first existing anchor for Claude, Codex, and Antigravity in one returned action", () => {
  const fixtures = [];
  try {
    for (const runner of GREENFIELD_RUNNERS) {
      const root = freshRoot();
      const home = freshHome();
      const sourceDirectory = mkdtempSync(join(tmpdir(), "onboarding-init-existing-source-"));
      const destination = join(home, "po-authority");
      const existingKey = join(sourceDirectory, "existing-private.pem");
      fixtures.push(root, home, sourceDirectory);
      const { privateKey } = generateKeyPairSync("ed25519");
      writeFileSync(existingKey, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
      const env = withConflictingAmbientRunner({
        ...process.env,
        PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home,
      }, runner);

      const first = driveOnboardingInit({ rootDir: root, runner, env });
      assert.equal(first.outcome, "pending-asks", runner);
      assert.equal(first.pendingAsks.length, 1, `${runner}: the first PO stop is one bundled action, not sibling command fragments`);
      const setupAsk = first.pendingAsks.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"));
      assert.ok(setupAsk, `${runner}: public inspect publishes the structured first-anchor action`);
      const replacements = new Map([
        ["<PO_GIT_AUTHOR_NAME>", "Greenfield Anchor PO"],
        ["<PO_GIT_AUTHOR_EMAIL>", "greenfield-anchor@example.invalid"],
        ["<signature|chat>", "signature"],
        ["<existing|new>", "existing"],
        ["<absolute external key directory>", destination],
        ["<human attribution>", "Greenfield Anchor PO"],
        ["<absolute existing key path|none>", existingKey],
      ]);
      const argv = setupAsk.applyAction.argv.map((value) => replacements.get(value) ?? value);
      assert.equal(argv[0].endsWith("onboarding-init.mjs"), true, `${runner}: no internal setup script is guessed`);
      assert.equal(argv.includes("po-human-approval.mjs"), false, `${runner}: raw setup is not published`);
      const applied = spawnSync(setupAsk.applyAction.executable, argv, {
        encoding: "utf8", shell: false, env, maxBuffer: 8 * 1024 * 1024,
      });
      assert.equal(applied.status, 0, `${runner}: ${applied.stderr}\n${applied.stdout}`);
      assert.doesNotMatch(applied.stdout, /PRIVATE KEY|BEGIN [A-Z ]+KEY/u, `${runner}: no key bytes reach driver JSON`);
      const result = JSON.parse(applied.stdout);
      assert.deepEqual(result.initialAnswers, {
        ok: true,
        code: "INITIAL-ANSWERS-APPLIED",
        pushApprovalPreference: "signature",
        trustAnchor: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE",
      });
      assertPinnedRunner(result, runner, `${runner}/post-bootstrap`);

      assert.equal(spawnSync("git", ["-C", root, "config", "--local", "user.name"], { encoding: "utf8" }).stdout.trim(), "Greenfield Anchor PO");
      assert.equal(spawnSync("git", ["-C", root, "config", "--local", "user.email"], { encoding: "utf8" }).stdout.trim(), "greenfield-anchor@example.invalid");
      assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), /^\s*push_approval:\s*"signature"\s*$/mu);
      assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), true);

      const policy = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
      assert.equal(policy.schema, "pipeline.critical-human-proof-policy.v3");
      assert.equal(policy.trustAnchors.length, 1);
      const machine = JSON.parse(readFileSync(join(home, ".agent-pipeline", "machine.json"), "utf8"));
      assert.equal(machine.poKeyDirectory, destination, `${runner}: machine pointer is durable`);
      const repositoryPointer = JSON.parse(readFileSync(join(root, ".git", "agent-pipeline", "po-key-directory.json"), "utf8"));
      assert.equal(repositoryPointer.poKeyDirectory, destination, `${runner}: repository pointer is durable`);

      const reentered = driveOnboardingInit({ rootDir: root, runner, env });
      const names = [
        ...(reentered.pendingAsks ?? []).flatMap(actionInputNames),
        ...actionInputNames(reentered.collectInput),
      ];
      assert.equal(names.includes("trustAnchorSetupMode"), false, `${runner}: completed setup is not asked again`);
      assert.equal(names.includes("pushApprovalPreference"), false, `${runner}: durable receipt prevents a repeated push-preference ask`);
    }
  } finally {
    for (const path of fixtures) dispose(path);
  }
});

test("a failed bundled first-anchor action restores Git/source/machine state and leaves no receipt that could mask the retry", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home };
    const first = driveOnboardingInit({ rootDir: root, runner: "claude", env });
    assert.equal(first.outcome, "pending-asks");
    assert.equal(first.pendingAsks.length, 1);
    const action = first.pendingAsks[0];
    assert.deepEqual(action.inputs.map((input) => input.name), [
      "gitAuthorName",
      "gitAuthorEmail",
      "pushApprovalPreference",
      "trustAnchorSetupMode",
      "trustAnchorDirectory",
      "trustAnchorHumanName",
      "trustAnchorExistingKeyPath",
    ]);
    const replacements = new Map([
      ["<PO_GIT_AUTHOR_NAME>", "Rollback PO"],
      ["<PO_GIT_AUTHOR_EMAIL>", "rollback@example.invalid"],
      ["<signature|chat>", "chat"],
      ["<existing|new>", "existing"],
      ["<absolute external key directory>", join(home, "failed-authority")],
      ["<human attribution>", "Rollback PO"],
      ["<absolute existing key path|none>", join(home, "missing-private.pem")],
    ]);
    const failed = spawnSync(action.applyAction.executable, action.applyAction.argv.map((value) => replacements.get(value) ?? value), {
      encoding: "utf8", shell: false, env, maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(failed.status, 1, failed.stderr);
    const result = JSON.parse(failed.stdout);
    assert.equal(result.outcome, "error");
    assert.equal(result.initialAnswers.code, "TRUST-ANCHOR-SETUP-FAILED");
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), false);
    assert.equal(spawnSync("git", ["-C", root, "config", "--local", "--get", "user.name"], { encoding: "utf8" }).status, 1);
    assert.equal(spawnSync("git", ["-C", root, "config", "--local", "--get", "user.email"], { encoding: "utf8" }).status, 1);
    assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), /^\s*push_approval:\s*"signature"\s*$/mu);
    assert.equal(existsSync(join(home, ".agent-pipeline", "machine.json")), false);
  } finally {
    dispose(root);
    dispose(home);
  }
});

test("new-key bootstrap omits an existing-key operand, requires durable pointer readback, and refuses a pre-existing repository anchor before setup", () => {
  const root = freshRoot();
  const home = freshHome();
  const destination = join(home, "new-po-authority");
  try {
    const seeded = driveOnboardingInit({
      rootDir: root,
      runner: "codex",
      env: { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home },
    });
    assert.equal(seeded.outcome, "pending-asks");
    let setupCalls = 0;
    const runSetup = (_executable, argv) => {
      setupCalls += 1;
      assert.equal(argv.includes("--existing-key"), false, "new mode never fabricates an existing key path");
      mkdirSync(destination, { recursive: true });
      writeFileSync(join(destination, "trust-policy.json"), `${JSON.stringify({
        keyReference: "local-po-key",
        publicKeySha256: "a".repeat(64),
        humanName: "New Key PO",
      })}\n`);
      mkdirSync(join(root, ".git", "agent-pipeline"), { recursive: true });
      writeFileSync(join(root, ".git", "agent-pipeline", "po-key-directory.json"), `${JSON.stringify({
        schema: "pipeline.po-key-directory.v1",
        poKeyDirectory: destination,
        updatedAt: new Date().toISOString(),
      })}\n`);
      return { status: 0 };
    };
    const applied = applyTrustAnchorBootstrap({
      rootDir: root,
      mode: "new",
      directory: destination,
      humanName: "New Key PO",
      existingKey: "none",
      env: { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home },
      runSetup,
    });
    assert.deepEqual(applied, { ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE", mode: "new" });
    assert.equal(setupCalls, 1);

    const replay = applyTrustAnchorBootstrap({
      rootDir: root,
      mode: "new",
      directory: destination,
      humanName: "New Key PO",
      existingKey: "none",
      env: { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home },
      runSetup,
    });
    assert.deepEqual(replay, {
      ok: true,
      code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE",
      mode: "new",
      alreadyComplete: true,
    });
    assert.equal(setupCalls, 1, "a stale/replayed setup action stops before touching key state again");
    const authorityPath = join(destination, "trust-policy.json");
    const different = JSON.parse(readFileSync(authorityPath, "utf8"));
    different.publicKeySha256 = "c".repeat(64);
    writeFileSync(authorityPath, `${JSON.stringify(different)}\n`);
    const conflict = applyTrustAnchorBootstrap({
      rootDir: root,
      mode: "new",
      directory: destination,
      humanName: "New Key PO",
      existingKey: "none",
      env: { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home },
      runSetup,
    });
    assert.equal(conflict.code, "TRUST-ANCHOR-REPOSITORY-CONFLICT");
    assert.equal(setupCalls, 1, "a differing established anchor fails before setup");
  } finally {
    dispose(root);
    dispose(home);
  }
});

test("first-anchor transaction restores exact repository, machine, and pointer preimages on every post-setup failure boundary", () => {
  const failures = [
    {
      name: "setup",
      runSetup: ({ writeAuthorityAndPointer }) => { writeAuthorityAndPointer(); return { status: 1 }; },
    },
    {
      name: "repository-pointer-readback",
      runSetup: ({ writeAuthority }) => { writeAuthority(); return { status: 0 }; },
    },
    {
      name: "machine-write",
      runSetup: ({ writeAuthorityAndPointer }) => { writeAuthorityAndPointer(); return { status: 0 }; },
      writeMachine() { throw new Error("injected machine write failure"); },
    },
    {
      name: "machine-readback",
      runSetup: ({ writeAuthorityAndPointer }) => { writeAuthorityAndPointer(); return { status: 0 }; },
      writeMachine() {},
    },
    {
      name: "policy-write",
      runSetup: ({ writeAuthorityAndPointer }) => { writeAuthorityAndPointer(); return { status: 0 }; },
      writePolicy() { throw new Error("injected policy write failure"); },
    },
    {
      name: "policy-readback",
      runSetup: ({ writeAuthorityAndPointer }) => { writeAuthorityAndPointer(); return { status: 0 }; },
      writePolicy(path) { writeFileSync(path, "{malformed"); },
    },
    {
      name: "existing-pem-policy-write",
      mode: "existing",
      runSetup: ({ writeAuthorityAndPointer, destination }) => {
        writeAuthorityAndPointer();
        writeFileSync(join(destination, "po-private.pem"), "fixture private-key container");
        writeFileSync(join(destination, "po-public.pem"), "fixture public-key container");
        return { status: 0 };
      },
      writePolicy() { throw new Error("injected imported-PEM policy write failure"); },
    },
  ];
  for (const failure of failures) {
    const root = freshRoot();
    const home = freshHome();
    const destination = join(home, `authority-${failure.name}`);
    try {
      const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home };
      assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "pending-asks");
      const policyPath = join(root, "project", "critical-human-proof.json");
      const policyPreimage = readFileSync(policyPath, "utf8");
      const pointerPath = join(root, ".git", "agent-pipeline", "po-key-directory.json");
      const machinePath = join(home, ".agent-pipeline", "machine.json");
      const existingKey = join(home, "source-existing.pem");
      if (failure.mode === "existing") writeFileSync(existingKey, "source PEM remains authoritative");
      const writeAuthority = () => {
        mkdirSync(destination, { recursive: true });
        writeFileSync(join(destination, "trust-policy.json"), `${JSON.stringify({
          keyReference: "local-po-key",
          publicKeySha256: "b".repeat(64),
          humanName: "Rollback PO",
        })}\n`);
      };
      const writePointer = () => {
        mkdirSync(join(root, ".git", "agent-pipeline"), { recursive: true });
        writeFileSync(pointerPath, `${JSON.stringify({
          schema: "pipeline.po-key-directory.v1",
          poKeyDirectory: destination,
          updatedAt: new Date().toISOString(),
        })}\n`);
      };
      const runSetup = () => failure.runSetup({
        destination,
        writeAuthority,
        writeAuthorityAndPointer() { writeAuthority(); writePointer(); },
      });
      const result = applyTrustAnchorBootstrap({
        rootDir: root,
        mode: failure.mode ?? "new",
        directory: destination,
        humanName: "Rollback PO",
        existingKey: failure.mode === "existing" ? existingKey : "none",
        env,
        runSetup,
        ...(failure.writeMachine ? { writeMachine: failure.writeMachine } : {}),
        ...(failure.writePolicy ? { writePolicy: failure.writePolicy } : {}),
      });
      assert.equal(result.ok, false, failure.name);
      assert.doesNotMatch(result.code, /ROLLBACK-FAILED/u, failure.name);
      assert.equal(readFileSync(policyPath, "utf8"), policyPreimage, `${failure.name}: policy bytes restored`);
      assert.equal(existsSync(pointerPath), false, `${failure.name}: repository pointer absence restored`);
      assert.equal(existsSync(machinePath), false, `${failure.name}: machine pointer absence restored`);
      if (failure.mode === "existing") {
        assert.equal(existsSync(destination), false, "owned imported PEM copy is removed on rollback");
        assert.equal(readFileSync(existingKey, "utf8"), "source PEM remains authoritative",
          "the PO-selected source PEM is never touched");
      }
    } finally {
      dispose(root);
      dispose(home);
    }
  }
});

test("a new-key post-setup failure replays the same public action from its bound recovery receipt without running setup twice", () => {
  const root = freshRoot();
  const home = freshHome();
  const destination = join(home, "recoverable-new-authority");
  const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home };
  try {
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "antigravity", env }).outcome, "pending-asks");
    const policyPath = join(root, "project", "critical-human-proof.json");
    const policyPreimage = readFileSync(policyPath, "utf8");
    const pointerPath = join(root, ".git", "agent-pipeline", "po-key-directory.json");
    const recoveryPath = join(root, ".git", "agent-pipeline", "first-anchor-bootstrap-recovery.json");
    let setupCalls = 0;
    const runSetup = () => {
      setupCalls += 1;
      mkdirSync(destination, { recursive: true });
      writeFileSync(join(destination, "po-private.pem"), "encrypted key container owned by setup");
      writeFileSync(join(destination, "po-public.pem"), "public key container owned by setup");
      writeFileSync(join(destination, "trust-policy.json"), `${JSON.stringify({
        keyReference: "local-po-key",
        publicKeySha256: "d".repeat(64),
        humanName: "Recovery PO",
      })}\n`);
      mkdirSync(join(root, ".git", "agent-pipeline"), { recursive: true });
      writeFileSync(pointerPath, `${JSON.stringify({
        schema: "pipeline.po-key-directory.v1",
        poKeyDirectory: destination,
        updatedAt: new Date().toISOString(),
      })}\n`);
      return { status: 0 };
    };
    const first = applyTrustAnchorBootstrap({
      rootDir: root,
      mode: "new",
      directory: destination,
      humanName: "Recovery PO",
      existingKey: "none",
      env,
      runSetup,
      writePolicy() { throw new Error("post-setup policy failure"); },
    });
    assert.equal(first.code, "TRUST-ANCHOR-REPOSITORY-MATERIALIZATION-WRITE-FAILED");
    assert.equal(setupCalls, 1);
    assert.equal(readFileSync(policyPath, "utf8"), policyPreimage);
    assert.equal(existsSync(pointerPath), false);
    assert.equal(existsSync(join(home, ".agent-pipeline", "machine.json")), false);
    assert.equal(existsSync(recoveryPath), true, "only the public authority-bound recovery receipt remains");

    const replay = applyTrustAnchorBootstrap({
      rootDir: root,
      mode: "new",
      directory: destination,
      humanName: "Recovery PO",
      existingKey: "none",
      env,
      runSetup() { throw new Error("setup must not run on recovery"); },
    });
    assert.deepEqual(replay, { ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE", mode: "new" });
    assert.equal(setupCalls, 1);
    assert.equal(existsSync(recoveryPath), false, "receipt is consumed only after all readbacks pass");
    assert.equal(JSON.parse(readFileSync(pointerPath, "utf8")).poKeyDirectory, destination);
    assert.equal(JSON.parse(readFileSync(join(home, ".agent-pipeline", "machine.json"), "utf8")).poKeyDirectory, destination);
    assert.equal(JSON.parse(readFileSync(policyPath, "utf8")).trustAnchors[0].publicKeySha256, "d".repeat(64));
  } finally {
    dispose(root);
    dispose(home);
  }
});

test("new-key recovery refuses malformed or foreign authority receipts before setup", () => {
  for (const variant of ["malformed-authority", "foreign-receipt"]) {
    const root = freshRoot();
    const home = freshHome();
    const destination = join(home, variant);
    const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home };
    try {
      assert.equal(driveOnboardingInit({ rootDir: root, runner: "claude", env }).outcome, "pending-asks");
      mkdirSync(destination, { recursive: true });
      const authority = {
        keyReference: "local-po-key",
        publicKeySha256: "e".repeat(64),
        humanName: "Receipt PO",
      };
      writeFileSync(join(destination, "trust-policy.json"), variant === "malformed-authority"
        ? "{malformed"
        : `${JSON.stringify(authority)}\n`);
      const recoveryPath = join(root, ".git", "agent-pipeline", "first-anchor-bootstrap-recovery.json");
      mkdirSync(join(root, ".git", "agent-pipeline"), { recursive: true });
      writeFileSync(recoveryPath, `${JSON.stringify({
        schema: "pipeline.first-anchor-bootstrap-recovery.v1",
        root,
        directory: destination,
        humanName: "Receipt PO",
        keyReference: "local-po-key",
        publicKeySha256: variant === "foreign-receipt" ? "f".repeat(64) : "e".repeat(64),
      })}\n`);
      let setupCalls = 0;
      const result = applyTrustAnchorBootstrap({
        rootDir: root,
        mode: "new",
        directory: destination,
        humanName: "Receipt PO",
        existingKey: "none",
        env,
        runSetup() { setupCalls += 1; return { status: 0 }; },
      });
      assert.equal(result.code, "TRUST-ANCHOR-RECOVERY-RECEIPT-CONFLICT", variant);
      assert.equal(setupCalls, 0, variant);
    } finally {
      dispose(root);
      dispose(home);
    }
  }
});

test("driveOnboardingInit: stops at the first published ask (pendingAsks or collect-input) without inventing any of its values", () => {
  const root = freshRoot();
  try {
    const result = driveOnboardingInit({ rootDir: root, runner: "claude" });
    assert.equal(result.schema, SCHEMA);
    // A fresh repository's first stop is now the pendingAsks published on the
    // `apply-portable-seed` command step (author identity/push-approval/verify-contract) --
    // this is the earlier stop NVA-V3-PENDINGASKS introduces, reached before the later
    // intake-consent collect-input a pre-fix driver reached instead.
    assert.equal(result.outcome, "pending-asks");
    assert.equal(result.root, root);
    assert.ok(Array.isArray(result.pendingAsks) && result.pendingAsks.length > 0);
    // The pendingAsks array is carried through VERBATIM from the underlying onboarding
    // CLI's own final response -- never re-derived, never re-worded.
    assert.deepEqual(result.pendingAsks, result.final.nextAction.pendingAsks);
    // Never invented: this driver holds no field anywhere in its result that could carry a
    // fabricated answer for any of the asked inputs across all published asks.
    const askedNames = result.pendingAsks.flatMap((ask) => (ask.inputs ?? [ask.input]).map((input) => input.name));
    assert.ok(askedNames.length > 0, "at least one pending ask must name at least one input");
    for (const name of askedNames) {
      assert.equal(Object.prototype.hasOwnProperty.call(result, name), false, `must not have invented a top-level ${name}`);
    }
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: executes a run of consecutive command actions before it has to stop", () => {
  const root = freshRoot();
  try {
    const result = driveOnboardingInit({ rootDir: root, runner: "claude" });
    // A fresh, empty repository needs several plan/apply steps (portable seed, runtime
    // init, ...) before the first genuine human question -- this exercises the CHAIN, not
    // just a single hop.
    assert.ok(result.stepsExecuted >= 3, `expected several chained command steps, got ${result.stepsExecuted}`);
    for (const step of result.steps) {
      assert.equal(step.faultCode, null, `step ${JSON.stringify(step.argv)} must not have faulted`);
      assert.equal(step.exitCode, 0, `step ${JSON.stringify(step.argv)} must have exited 0`);
    }
    // The FIRST step is always the bare inspect this driver bootstraps itself with; at
    // least one LATER step must be a genuinely different subcommand, proving the loop
    // actually followed nextAction rather than repeating the same call.
    const subcommands = result.steps.map((step) => step.argv[1]);
    assert.equal(subcommands[0], "inspect");
    assert.ok(subcommands.slice(1).some((name) => name !== "inspect"), "expected the chain to advance past inspect");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: is re-entrant -- a second run never repeats the already-executed command that published the ask", () => {
  const root = freshRoot();
  try {
    const first = driveOnboardingInit({ rootDir: root, runner: "claude" });
    assert.equal(first.outcome, "pending-asks");
    assert.ok(first.steps.some((step) => step.argv[1] === "apply-portable-seed"),
      "the pendingAsks are published as a side effect of this exact command's own response");

    // KNOWN LIMITATION, library-side and out of this driver's scope (confirmed by direct
    // measurement, 2026-08-28): `withPendingAsksSurfacedOnNextAction()`
    // (lib/project-onboarding-v3.mjs ~lines 5416/5418) is wired ONLY into the
    // apply-portable-seed activation call's own response, not into a later bare `inspect`
    // read of the same on-disk state. So a re-entrant run that neither answered nor
    // re-triggers that exact command does not see the SAME pendingAsks again -- it silently
    // continues past where they were, reaching whatever the chain's next genuine stop is.
    // This driver cannot close that gap without knowing WHICH command re-surfaces which
    // ask, which is exactly the domain knowledge it is built to hold none of; it is
    // reported here, not special-cased around. What IS guaranteed, and what this test pins,
    // is the property this driver actually owns: it never re-executes the already-applied
    // command a second time.
    const second = driveOnboardingInit({ rootDir: root, runner: "claude" });
    const secondSubcommands = second.steps.map((step) => step.argv[1]);
    assert.equal(secondSubcommands.filter((name) => name === "apply-portable-seed").length, 0,
      "must not double-apply the already-applied command");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: the step cap fires on a chain that never converges", () => {
  // A synthetic responder that always reports a fresh "command" action pointing back at
  // itself -- there is no real onboarding chain shaped like this (every real subcommand
  // eventually settles), so this is the one scenario mocked rather than run for real.
  let calls = 0;
  const run = () => {
    calls += 1;
    return {
      status: 0,
      stdout: JSON.stringify({
        schema: "pipeline.synthetic-non-converging.v1",
        status: "in-progress",
        nextAction: {
          kind: "command",
          executable: "node",
          argv: ["--eval", `void ${calls}`],
          mutation: false,
          requiresConfirmation: false,
        },
      }),
      stderr: "",
    };
  };
  const root = freshRoot();
  try {
    const stepCap = 4;
    const result = driveOnboardingInit({ rootDir: root, stepCap, run });
    assert.equal(result.outcome, "step-cap-exceeded");
    assert.equal(result.stepCap, stepCap);
    assert.equal(result.stepsExecuted, stepCap);
    assert.equal(result.steps.length, stepCap);
    assert.equal(calls, stepCap);
  } finally {
    dispose(root);
  }
});

// The four tests below use a synthetic responder, same idiom as the non-converging
// step-cap test above: the re-anchor path needs an executed step to settle with no
// `nextAction` and a non-"ready" status, which is not a real onboarding-cli shape any
// still-supported subcommand currently produces on its own (the backlog item this task
// closes describes the gap being fixed, not a reproducible live example), so mocking the
// two resting responses is the honest choice, exactly as it already is for the
// non-converging chain.
function respond(body) {
  return { status: 0, stdout: JSON.stringify(body), stderr: "" };
}

test("driveOnboardingInit: re-anchors after an executed step settles with no nextAction, and completes", () => {
  const root = freshRoot();
  try {
    let inspectCalls = 0;
    const run = (executable, argv) => {
      const subcommand = argv[1];
      if (subcommand === "inspect") {
        inspectCalls += 1;
        if (inspectCalls === 1) {
          return respond({
            schema: "pipeline.synthetic.v1",
            status: "in-progress",
            nextAction: { kind: "command", executable: "node", argv: ["--eval", "0"] },
          });
        }
        // The re-anchor: a different, terminal state -- proves the driver actually
        // re-read the state rather than repeating the anchor blindly.
        return respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
      }
      // The one executed ("command") step: settles with no nextAction, not ready --
      // exactly the silent-success shape this task fixes.
      return respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: null });
    };
    const result = driveOnboardingInit({ rootDir: root, run });
    assert.equal(result.outcome, "ready", JSON.stringify(result));
    assert.equal(inspectCalls, 2, "expected exactly one re-anchor inspect on top of the initial one");
    assert.equal(result.stepsExecuted, 3);
    assert.equal(result.steps[0].argv[1], "inspect");
    assert.notEqual(result.steps[1].argv[1], "inspect", "the middle step is the executed command, not another anchor");
    assert.equal(result.steps[2].argv[1], "inspect", "the driver re-anchored on inspect after the silent success");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: re-anchors after a published command succeeds with plain human-facing output", () => {
  const root = freshRoot();
  try {
    let calls = 0;
    const run = () => {
      calls += 1;
      if (calls === 1) {
        return respond({
          schema: "pipeline.synthetic.v1",
          status: "ready",
          nextAction: {
            kind: "command",
            executable: "node",
            argv: ["/plugin/pipeline-state.mjs", "set-phase", "--phase", "implementation"],
          },
        });
      }
      if (calls === 2) return { status: 0, stdout: 'Phase set: "implementation"; lifecycle="implementing".\n', stderr: "" };
      return respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
    };
    const result = driveOnboardingInit({ rootDir: root, runner: "claude", run });
    assert.equal(result.outcome, "ready", JSON.stringify(result));
    assert.equal(result.stepsExecuted, 3);
    assert.equal(result.steps[1].faultCode, null);
    assert.equal(result.steps[1].outputKind, "plain-success");
    assert.equal(result.steps[2].argv[1], "inspect", "plain command success must re-enter only through public inspect");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: plain or malformed anchor output, JSON-shaped malformed command output, and nonzero command output remain errors", () => {
  for (const [name, run, expectedExitCode] of [
    ["plain-anchor", () => ({ status: 0, stdout: "not protocol json", stderr: "" }), 0],
    ["malformed-anchor", () => ({ status: 0, stdout: "{not-json", stderr: "" }), 0],
    ["malformed-command", (() => {
      let calls = 0;
      return () => {
        calls += 1;
        return calls === 1
          ? respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: { kind: "command", executable: "node", argv: ["tool"] } })
          : { status: 0, stdout: "{not-json", stderr: "" };
      };
    })(), 0],
    ["nonzero-command", (() => {
      let calls = 0;
      return () => {
        calls += 1;
        return calls === 1
          ? respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: { kind: "command", executable: "node", argv: ["tool"] } })
          : { status: 2, stdout: "command refused", stderr: "refused" };
      };
    })(), 2],
  ]) {
    const root = freshRoot();
    try {
      const result = driveOnboardingInit({ rootDir: root, run });
      assert.equal(result.outcome, "error", `${name}: ${JSON.stringify(result)}`);
      assert.equal(result.error.faultCode, "unparseable-output", name);
      assert.equal(result.error.exitCode, expectedExitCode, name);
    } finally {
      dispose(root);
    }
  }
});

test("driveOnboardingInit: a nextAction-less result from the anchoring inspect itself does not re-anchor again", () => {
  const root = freshRoot();
  try {
    const run = () => respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: null });
    const result = driveOnboardingInit({ rootDir: root, run });
    // No step was executed before this resting response -- it IS the (only) anchor call --
    // so re-anchoring must not fire, or this would spin forever on the identical command.
    assert.equal(result.outcome, "no-automatic-next-step");
    assert.equal(result.stepsExecuted, 1);
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: a genuinely non-converging chain stops with its own outcome, not the step cap", () => {
  const root = freshRoot();
  try {
    let inspectCalls = 0;
    const run = (executable, argv) => {
      const subcommand = argv[1];
      if (subcommand === "inspect") {
        inspectCalls += 1;
        // Every inspect reports the identical state -- the executed step never actually
        // changes anything, the exact shape of the earlier `inspect` -> `bootstrap-bind-plan`
        // -> `inspect` -> ... defect this re-anchor must not reintroduce.
        return respond({
          schema: "pipeline.synthetic.v1",
          status: "in-progress",
          nextAction: { kind: "command", executable: "node", argv: ["--eval", "0"] },
        });
      }
      return respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: null });
    };
    const stepCap = 50;
    const result = driveOnboardingInit({ rootDir: root, stepCap, run });
    assert.equal(result.outcome, "no-progress");
    // Caught after the first repeat (anchor, executed step, re-anchor) rather than after
    // burning the whole step cap.
    assert.equal(result.stepsExecuted, 3);
    assert.equal(inspectCalls, 2);
    assert.ok(result.stepsExecuted < stepCap);
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: collect-input, ready, unsupported-next-action and error outcomes reached directly are unchanged", () => {
  const collectInputRoot = freshRoot();
  try {
    const collectInputAction = { kind: "collect-input", input: { name: "example" } };
    const collectInputRun = () => respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: collectInputAction });
    const collectInputResult = driveOnboardingInit({ rootDir: collectInputRoot, run: collectInputRun });
    assert.equal(collectInputResult.outcome, "collect-input");
    assert.deepEqual(collectInputResult.collectInput, collectInputAction);
  } finally {
    dispose(collectInputRoot);
  }

  const readyRoot = freshRoot();
  try {
    const readyRun = () => respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
    const readyResult = driveOnboardingInit({ rootDir: readyRoot, run: readyRun });
    assert.equal(readyResult.outcome, "ready");
    assert.equal(readyResult.stepsExecuted, 1);
  } finally {
    dispose(readyRoot);
  }

  const unsupportedRoot = freshRoot();
  try {
    const unsupportedRun = () => respond({
      schema: "pipeline.synthetic.v1",
      status: "in-progress",
      nextAction: { kind: "restart-process" },
    });
    const unsupportedResult = driveOnboardingInit({ rootDir: unsupportedRoot, run: unsupportedRun });
    assert.equal(unsupportedResult.outcome, "unsupported-next-action");
  } finally {
    dispose(unsupportedRoot);
  }

  const errorRoot = freshRoot();
  try {
    const errorRun = () => ({ status: 1, stdout: "not json", stderr: "boom" });
    const errorResult = driveOnboardingInit({ rootDir: errorRoot, run: errorRun });
    assert.equal(errorResult.outcome, "error");
  } finally {
    dispose(errorRoot);
  }
});

// NVA-V3-PENDINGASKS: the library publishes side-channel `nextAction.pendingAsks` (author
// identity, push-approval mode, verify-contract, trust-anchor, project-ignore-gap --
// `withPendingAsksSurfacedOnNextAction()`, lib/project-onboarding-v3.mjs) and this driver
// previously branched only on `nextAction.kind`, dropping every one of them silently on the
// common `kind: "command"` path (backlog: 2026-08-28-push-approval-mode-is-not-chosen-at-
// onboarding.md). The four tests below pin the fix, generically -- no individual ask's
// meaning is ever asserted here, only that the protocol channel itself is surfaced.

test("driveOnboardingInit: a command nextAction carrying pendingAsks stops and surfaces them instead of executing straight past them", () => {
  const root = freshRoot();
  try {
    let calls = 0;
    const askEntry = { kind: "collect-input", input: { name: "examplePendingAsk" }, guidance: "example" };
    const run = () => {
      calls += 1;
      return respond({
        schema: "pipeline.synthetic.v1",
        status: "in-progress",
        nextAction: { kind: "command", executable: "node", argv: ["--eval", "0"], pendingAsks: [askEntry] },
      });
    };
    const result = driveOnboardingInit({ rootDir: root, run });
    assert.equal(result.outcome, "pending-asks", JSON.stringify(result));
    assert.deepEqual(result.pendingAsks, [askEntry]);
    assert.equal(calls, 1, "the command must not have been executed once a pending ask surfaced");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: a command nextAction with no pendingAsks (absent or empty) is unaffected", () => {
  for (const pendingAsks of [undefined, []]) {
    const root = freshRoot();
    try {
      let step = 0;
      const run = () => {
        step += 1;
        if (step === 1) {
          const nextAction = { kind: "command", executable: "node", argv: ["--eval", "0"] };
          if (pendingAsks !== undefined) nextAction.pendingAsks = pendingAsks;
          return respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction });
        }
        return respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
      };
      const result = driveOnboardingInit({ rootDir: root, run });
      assert.equal(result.outcome, "ready", JSON.stringify(result));
      assert.equal(step, 2, "the command must have been executed, exactly as before this change");
    } finally {
      dispose(root);
    }
  }
});

test("driveOnboardingInit: a collect-input nextAction that also carries pendingAsks surfaces both, neither lost", () => {
  const root = freshRoot();
  try {
    const askEntry = { kind: "collect-input", input: { name: "sideChannelAsk" } };
    const collectInputAction = { kind: "collect-input", input: { name: "primaryAsk" }, pendingAsks: [askEntry] };
    const run = () => respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: collectInputAction });
    const result = driveOnboardingInit({ rootDir: root, run });
    assert.equal(result.outcome, "collect-input");
    assert.deepEqual(result.collectInput, collectInputAction, "the primary question must still be carried through verbatim");
    assert.deepEqual(result.pendingAsks, [askEntry], "the sibling ask must also be surfaced, not dropped");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: malformed pendingAsks does not crash the driver and is not silently swallowed", () => {
  for (const malformed of ["not-an-array", ["a string entry, not an object"], [{ noKindField: true }]]) {
    const root = freshRoot();
    try {
      let step = 0;
      const run = () => {
        step += 1;
        if (step === 1) {
          return respond({
            schema: "pipeline.synthetic.v1",
            status: "in-progress",
            nextAction: { kind: "command", executable: "node", argv: ["--eval", "0"], pendingAsks: malformed },
          });
        }
        return respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
      };
      const result = driveOnboardingInit({ rootDir: root, run });
      assert.equal(result.outcome, "ready", JSON.stringify(result));
      assert.equal(step, 2, "malformed metadata is not treated as a valid stop-worthy ask -- the command must still execute");
      assert.equal(result.steps[0].pendingAsksFault, "malformed-pending-asks-ignored",
        "the malformed field must be visible on the step record, not silently dropped");
    } finally {
      dispose(root);
    }
  }
});

test("DEFAULT_STEP_CAP is a small, positive constant", () => {
  assert.ok(Number.isInteger(DEFAULT_STEP_CAP));
  assert.ok(DEFAULT_STEP_CAP > 0);
  assert.ok(DEFAULT_STEP_CAP < 1000, "the cap must be a small constant, not effectively unbounded");
});

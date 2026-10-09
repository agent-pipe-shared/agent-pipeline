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
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createHash, generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";

import { DEFAULT_RUN_BUDGET_MS, DEFAULT_STEP_CAP, SCHEMA, applyInitialOnboardingAnswers, applyTrustAnchorBootstrap, driveOnboardingInit, main } from "./onboarding-init.mjs";
import { isSanctionedLifecycleCommand } from "../hooks/guard-lifecycle-ready.mjs";
import { applyOnboardingIntakeConsent, readOnboardingIntakeCheckpoint } from "../lib/onboarding-continuity.mjs";
import { resolveInitialAnswersState } from "../lib/onboarding-initial-answers-state.mjs";
import { projectConfirmedIntakeLanguage } from "../lib/onboarding-later-language.mjs";
import { readMachinePlane } from "../lib/machine-plane.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";
import { applyProjectOnboardingLifecycleV4, planProjectOnboardingLifecycleV4 } from "../lib/project-onboarding-v3.mjs";
import { runHumanApproval } from "./po-human-approval.mjs";
import "./bootstrap-trust-recovery.test.mjs";

const PROJECT_ONBOARDING_SCRIPT_PATH = fileURLToPath(new URL("./project-onboarding-v3.mjs", import.meta.url));

/**
 * TR-S1-T3f (Ruling 132): the PO key fixtures are passphrase-protected PKCS#8 keys, because
 * `po-human-approval.mjs setup --existing-key` refuses an unencrypted one (PO-KEY-UNENCRYPTED).
 * A passphrase cannot cross the onboarding-init CLI -> po-human-approval CLI -> `openssl pkey
 * -pubout` process chain without a production seam, and production has no `-passin`. So the two
 * cells that import a key drive the setup step IN-PROCESS through `runHumanApproval`, whose
 * `spawn` dependency is the existing test seam: `passinSpawn` appends `-passin pass:<fixture>` to
 * every OpenSSL call that names a `po-private.pem`, and passes every other spawn through
 * untouched. `homedirFn` keeps the machine plane inside the fixture home, which the spawned CLI
 * reached through the HOME/USERPROFILE rewrite of `childEnvironment()`.
 */
const KEY_FIXTURE_PASSPHRASE = "onboarding-init-test-fixture-passphrase";

function encryptedKeyPem() {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey.export({ format: "pem", type: "pkcs8", cipher: "aes-256-cbc", passphrase: KEY_FIXTURE_PASSPHRASE });
}

function passinSpawn(base = spawnSync) {
  return (executable, args, options) => {
    const list = Array.isArray(args) ? args : [];
    const namesKey = /(?:^|[\\/])openssl(?:\.exe)?$/iu.test(String(executable)) && !list.includes("-passin")
      && list.some((entry) => /po-private\.pem$/u.test(String(entry)));
    return base(executable, namesKey ? [...list, "-passin", `pass:${KEY_FIXTURE_PASSPHRASE}`] : args, options);
  };
}

function inProcessSetup(home, failures) {
  return (_executable, setupArgs) => {
    try {
      runHumanApproval(setupArgs.slice(1), { spawn: passinSpawn(), homedirFn: () => home, isTTY: true });
      return { status: 0, signal: null };
    } catch (error) {
      failures.push(error);
      return { status: 1, signal: null };
    }
  };
}

test("a failed first-anchor action returns an attended digest-bound recovery command", () => {
  let output = "";
  const root = join(tmpdir(), "onboarding-recovery-fixture");
  const destination = join(tmpdir(), "onboarding-recovery-key");
  const code = main(["--root", root, "--runner", "claude", "--trust-anchor-mode", "new",
    "--trust-anchor-directory", destination, "--trust-anchor-human-name", "PO",
    "--trust-anchor-existing-key", "none"], {
    write: (value) => { output += value; },
    applyTrustAnchor: () => ({ ok: false, code: "TRUST-ANCHOR-SETUP-UNAVAILABLE" }),
    drive: () => { throw new Error("failed anchor must stop the driver"); },
  });
  assert.equal(code, 1);
  const result = JSON.parse(output);
  assert.equal(result.recovery.code, "BTR-EXTERNAL-ATTENDED-RECOVERY");
  assert.deepEqual(result.recovery.argv.slice(1), ["plan", "--root", root, "--mode", "new",
    "--directory", destination, "--human-name", "PO", "--existing-key", "none"]);
});

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
const MATRIX_CELL_ENV = "PIPELINE_ONBOARDING_TEST_MATRIX_CELL";
const MATRIX_CELL = process.env[MATRIX_CELL_ENV];
const MATRIX_CASES = {
  convergence: GREENFIELD_RUNNERS.flatMap((runner) =>
    GREENFIELD_MACHINE_STATES.map((machine) => `${runner}/${machine.name}`)),
  approval: GREENFIELD_RUNNERS.flatMap((runner) => ["signature", "chat"].map((mode) => `${runner}/${mode}`)),
  rollback: ["setup", "repository-pointer-readback", "machine-write", "machine-readback",
    "policy-write", "policy-readback", "existing-pem-policy-write"],
};

function runMatrixCell(group, cell) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, [MATRIX_CELL_ENV]: `${group}:${cell}` };
    // node:test marks its own file worker; a nested --test otherwise exits zero
    // after skipping every file as a recursive run.
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [
      "--test", "--test-reporter=tap", "--test-name-pattern", "^isolated onboarding matrix cell$",
      fileURLToPath(import.meta.url),
    ], {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0 && /# tests 1\b/u.test(output) && /# pass 1\b/u.test(output)) resolve();
      else reject(new Error(`${group}/${cell}: node --test exited ${code ?? signal}\n${output}`));
    });
  });
}

async function runMatrix(group) {
  // A bounded process pool lets synchronous CLI walks overlap without sharing roots or
  // test fixtures. Each child runs exactly one named cell and reports its own failure.
  const cells = MATRIX_CASES[group];
  // Each matrix cell runs a nested test process plus many Git/Node child calls.
  // Two concurrent cells retain overlap without exhausting transient host spawn
  // capacity on WSL and Windows runners.
  for (let offset = 0; offset < cells.length; offset += 2) {
    const settled = await Promise.allSettled(cells.slice(offset, offset + 2).map((cell) => runMatrixCell(group, cell)));
    const failures = settled.filter((result) => result.status === "rejected").map((result) => result.reason.message);
    assert.deepEqual(failures, [], failures.join("\n"));
  }
}

// NVA-B-CIGREEN-1. The driver executes the selected runner's OWN executable, so
// this fixture silently depended on the host having `codex`/`claude`/
// `antigravity` installed: it isolated HOME and never isolated PATH. Under the
// verify workflow's synthetic PATH (node, git, bash, sh, openssl, uname and nothing
// else) the runtime readback found no runner executable, reported
// `runtime_executable_unavailable` / `runtime-readback-unavailable`, and the
// suite failed on the CI runner while passing on any developer machine that
// happens to have one installed -- a property of the host, not of the code
// under test. The runners are stubbed into a test-local directory placed FIRST
// on PATH (the shape trust-anchor-bootstrap-circularity.repro.test.mjs already
// uses for `openssl`), so the lookup is decided by the fixture. `git` and the
// rest of the ambient PATH stay reachable behind it.
const RUNNER_STUB_DIR = mkdtempSync(join(tmpdir(), "onboarding-init-runner-stubs-"));
for (const runner of GREENFIELD_RUNNERS) {
  writeFileSync(join(RUNNER_STUB_DIR, runner), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
}
after(() => dispose(RUNNER_STUB_DIR));
const PATH_DELIMITER = process.platform === "win32" ? ";" : ":";
const STUBBED_RUNNER_PATH = [RUNNER_STUB_DIR, process.env.PATH]
  .filter((entry) => typeof entry === "string" && entry.length > 0)
  .join(PATH_DELIMITER);

function withConflictingAmbientRunner(env, runner) {
  const conflicted = { ...env, PATH: STUBBED_RUNNER_PATH };
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

function checkConvergenceCell(selectedCell) {
  const roots = [];
  const firstShapes = [];
  try {
    for (const runner of GREENFIELD_RUNNERS) {
      for (const machine of GREENFIELD_MACHINE_STATES) {
        if (selectedCell !== `${runner}/${machine.name}`) continue;
        const root = freshRoot();
        roots.push(root);
        const label = `${runner}/${machine.name}`;
        const env = withConflictingAmbientRunner(machine.env, runner);
        const first = driveOnboardingInit({ rootDir: root, runner, env });

        assert.equal(first.schema, SCHEMA, label);
        assert.equal(first.outcome, runner === "codex" ? "collect-input" : "pending-asks", `${label}: first stable stop is genuine published human input: ${JSON.stringify(first)}`);
        assert.equal(first.final?.status, runner === "codex" ? "intake-required" : "runtime-initialization-required", `${label}: runner-specific intake boundary must be explicit`);
        assert.equal(first.final?.nextAction?.kind, runner === "codex" ? "collect-input" : "command", `${label}: the primary action remains visible alongside pending asks`);
        assert.ok(first.pendingAsks.length > 0, `${label}: the boundary must carry real asks`);
        assertPinnedRunner(first, runner, label);
        firstShapes.push({ schema: first.schema, outcome: first.outcome, status: first.final.status, nextActionKind: first.final.nextAction.kind });

        const askNames = [...first.pendingAsks.flatMap(actionInputNames), ...actionInputNames(first.collectInput)];
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
        assert.equal(reentrant.outcome, runner === "codex" ? "collect-input" : "pending-asks", `${label}: unrelated genuine asks remain surfaced`);
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
    assert.equal(firstShapes.length, 1, `${selectedCell}: exactly one runner/key cell runs`);
  } finally {
    for (const root of roots) dispose(root);
  }
}

test("driveOnboardingInit: Claude, Codex, and Antigravity converge across fresh no-key/valid-key homes without ambient drift or repeated answered asks", async () => {
  if (!MATRIX_CELL) await runMatrix("convergence");
});

test("initial answer CLI refuses absent or invalid language before any source or receipt write", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "claude");
    const first = driveOnboardingInit({ rootDir: root, runner: "claude", env });
    assert.equal(first.outcome, "pending-asks");
    const sourcePath = join(root, "pipeline.user.yaml");
    const before = readFileSync(sourcePath);
    const args = [
      "--root", root, "--runner", "claude", "--git-author-name", "Language PO",
      "--git-author-email", "language@example.invalid", "--human-approval", "chat",
    ];
    for (const suffix of [[], ["--language", "fr"], ["--language", ""]]) {
      const call = spawnSync(process.execPath, [new URL("./onboarding-init.mjs", import.meta.url).pathname, ...args, ...suffix], {
        encoding: "utf8", shell: false, env,
      });
      assert.equal(call.status, 2, call.stderr || call.stdout);
      assert.deepEqual(readFileSync(sourcePath), before);
      assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), false);
    }
  } finally {
    dispose(root);
    dispose(home);
  }
});

test("an earlier intake language cannot be mislabeled as a later override", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "claude");
    const first = driveOnboardingInit({ rootDir: root, runner: "claude", env });
    assert.equal(first.outcome, "pending-asks");
    applyOnboardingIntakeConsent({ rootDir: root, granted: true, language: "de", activate: true });
    const mismatch = applyInitialOnboardingAnswers({
      rootDir: root, runner: "claude", env, pushApproval: "chat", language: "en",
      gitAuthorName: "Language PO", gitAuthorEmail: "language@example.invalid",
    });
    assert.equal(mismatch.ok, false, JSON.stringify(mismatch));
    assert.equal(mismatch.code, "INITIAL-ANSWERS-INTAKE-LANGUAGE-CONFLICT");
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), false);
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root }).value.values.language, "de");
  } finally {
    dispose(root);
    dispose(home);
  }
});

test("a later explicit intake language override is reported by the real CLI", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "claude");
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "claude", env }).outcome, "pending-asks");
    const initial = applyInitialOnboardingAnswers({
      rootDir: root, runner: "claude", env, pushApproval: "chat", language: "en",
      gitAuthorName: "Language PO", gitAuthorEmail: "language@example.invalid",
    });
    assert.equal(initial.ok, true, JSON.stringify(initial));
    const call = spawnSync(process.execPath, [PROJECT_ONBOARDING_SCRIPT_PATH,
      "intake-consent-apply", "--root", root, "--granted", "--language", "de",
      "--activate", "--runner", "claude"], { encoding: "utf8", shell: false, env });
    assert.equal(call.status, 0, call.stderr || call.stdout);
    const output = JSON.parse(call.stdout);
    assert.deepEqual(output.languageAudit, {
      schema: "pipeline.onboarding-language-decision.v1",
      status: "later-intake-supersedes-initial",
      initialLanguage: "en",
      intakeLanguage: "de",
    });
    assert.equal(output.languageProjection?.status, "completed");
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root }).value.values.language, "de");
    assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), /human_facing:\s*"de"/u);
    assert.equal(readMachinePlane({ homedirFn: () => home }).plane.language, "de");
    assert.equal(parseYaml(readFileSync(join(root, "project", "pipeline.yaml"), "utf8")).language.human_facing, "de");
    const receipt = JSON.parse(readFileSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json"), "utf8"));
    assert.equal(receipt.language, "en");
  } finally {
    dispose(root);
    dispose(home);
  }
});

test("host-managed initial answers publish privately and never write reserved Git or Codex controls", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    for (const name of [".git", ".codex"]) {
      mkdirSync(join(root, name));
      chmodSync(join(root, name), 0o555);
    }
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
    const first = driveOnboardingInit({ rootDir: root, runner: "codex", env });
    assert.equal(first.outcome, "pending-asks");
    assert.deepEqual(actionInputNames(first.pendingAsks[0]),
      ["gitAuthorName", "gitAuthorEmail", "humanApprovalMode", "advisorExportConsent", "language"]);
    const sourcePath = join(root, "pipeline.user.yaml");
    const sourceBefore = readFileSync(sourcePath);
    const missingIdentity = applyInitialOnboardingAnswers({ rootDir: root, runner: "codex", env, pushApproval: "chat", language: "de" });
    assert.deepEqual(missingIdentity, { ok: false, code: "INITIAL-ANSWERS-GIT-IDENTITY-REQUIRED" });
    assert.deepEqual(readFileSync(sourcePath), sourceBefore);
    const answers = { rootDir: root, runner: "codex", env, gitAuthorName: "Host User",
      gitAuthorEmail: "host@example.invalid", pushApproval: "chat", language: "de" };
    const applied = applyInitialOnboardingAnswers(answers);
    assert.equal(applied.code, "INITIAL-ANSWERS-APPLIED", JSON.stringify(applied));
    assert.match(readFileSync(join(root, "project", "pipeline.yaml"), "utf8"), /human_facing: de/u);
    const state = resolveInitialAnswersState(root, "host-managed");
    assert.equal(JSON.parse(readFileSync(state.receipt, "utf8")).gitAuthorName, "Host User");
    assert.equal(existsSync(state.pending), false);
    assert.equal(applyInitialOnboardingAnswers(answers).code, "INITIAL-ANSWERS-APPLIED");
    const next = driveOnboardingInit({ rootDir: root, runner: "codex", env });
    assert.equal(next.outcome, "collect-input", JSON.stringify(next));
    assert.deepEqual(actionInputNames(next.collectInput), ["language", "profile", "projectDescription"]);
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), false);
    assert.deepEqual(readdirSync(join(root, ".git")), []);
    assert.deepEqual(readdirSync(join(root, ".codex")), []);
  } finally {
    dispose(root);
    dispose(home);
  }
});

test("host-managed first stop asks identity, approval and language before intake consent", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    for (const name of [".git", ".codex"]) {
      mkdirSync(join(root, name));
      chmodSync(join(root, name), 0o555);
    }
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
    const first = driveOnboardingInit({ rootDir: root, runner: "codex", env });
    assert.equal(first.outcome, "pending-asks");
    assert.equal(first.pendingAsks.length, 1);
    assert.deepEqual(actionInputNames(first.pendingAsks[0]),
      ["gitAuthorName", "gitAuthorEmail", "humanApprovalMode", "advisorExportConsent", "language"]);
    assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), false);
  } finally {
    dispose(root);
    dispose(home);
  }
});

test("host-managed consent CLI routes its later explicit language into private intake state", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    for (const name of [".git", ".codex"]) {
      mkdirSync(join(root, name));
      chmodSync(join(root, name), 0o555);
    }
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "pending-asks");
    const first = applyInitialOnboardingAnswers({ rootDir: root, runner: "codex", env,
      gitAuthorName: "Host User", gitAuthorEmail: "host@example.invalid",
      pushApproval: "chat", language: "en" });
    assert.equal(first.code, "INITIAL-ANSWERS-APPLIED");
    const consent = spawnSync(process.execPath, [PROJECT_ONBOARDING_SCRIPT_PATH,
      "intake-consent-apply", "--root", root, "--granted", "--language", "de",
      "--profile", "mini", "--text", "Build a bounded fixture", "--activate", "--runner", "codex",
    ], { encoding: "utf8", env });
    assert.equal(consent.status, 0, consent.stderr || consent.stdout);
    const output = JSON.parse(consent.stdout);
    assert.equal(output.languageAudit?.status, "later-intake-supersedes-initial");
    assert.equal(output.languageAudit?.initialLanguage, "en");
    assert.equal(output.languageAudit?.intakeLanguage, "de");
    assert.equal(output.languageProjection?.status, "completed");
    assert.equal(output.languageProjection?.audit?.initialLanguage, "en");
    assert.equal(output.languageProjection?.audit?.intakeLanguage, "de");
    const checkpoint = readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability: "host-managed" });
    assert.equal(checkpoint.value.values.language, "de");
    assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), /human_facing:\s*"de"/u);
    assert.match(readFileSync(join(root, "project", "pipeline.yaml"), "utf8"), /human_facing: de/u);
    assert.equal(readMachinePlane({ homedirFn: () => home }).plane.language, "de");
    const sourceAfter = readFileSync(join(root, "pipeline.user.yaml"));
    const machineAfter = readFileSync(join(home, ".agent-pipeline", "machine.json"));
    const replay = spawnSync(process.execPath, [PROJECT_ONBOARDING_SCRIPT_PATH,
      "intake-consent-apply", "--root", root, "--granted", "--language", "de",
      "--profile", "mini", "--text", "Build a bounded fixture", "--activate", "--runner", "codex",
    ], { encoding: "utf8", env });
    assert.equal(replay.status, 0, replay.stderr || replay.stdout);
    assert.equal(JSON.parse(replay.stdout).languageProjection?.status, "replayed");
    assert.equal(projectConfirmedIntakeLanguage({ rootDir: root, repositoryCapability: "host-managed",
      runner: "claude", deps: { homedir: () => home } }).status, "replayed");
    assert.deepEqual(readFileSync(join(root, "pipeline.user.yaml")), sourceAfter);
    assert.deepEqual(readFileSync(join(home, ".agent-pipeline", "machine.json")), machineAfter);
    assert.equal(checkpoint.value.transactionState, "design-questions-pending");
    assert.equal(checkpoint.value.materialInput.length, 1);
    const questions = spawnSync(process.execPath, [PROJECT_ONBOARDING_SCRIPT_PATH,
      "intake-design-questions-apply", "--root", root,
      "--answers-json", JSON.stringify([{ question: "What is in scope?", answer: "One bounded fixture." }]),
      "--activate", "--runner", "codex",
    ], { encoding: "utf8", env });
    assert.equal(questions.status, 0, questions.stderr || questions.stdout);
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability: "host-managed" })
      .value.transactionState, "ready-to-generate");
    const generation = spawnSync(process.execPath, [PROJECT_ONBOARDING_SCRIPT_PATH,
      "intake-generate-plan", "--root", root, "--runner", "codex",
    ], { encoding: "utf8", env });
    assert.equal(generation.status, 0, generation.stderr || generation.stdout);
    const generationPlan = JSON.parse(generation.stdout);
    assert.equal(generationPlan.repositoryCapability, "host-managed");
    assert.match(generationPlan.planSha256, /^[a-f0-9]{64}$/u);
    const generated = spawnSync(process.execPath, [PROJECT_ONBOARDING_SCRIPT_PATH,
      "intake-generate-apply", "--root", root, "--plan-sha256", generationPlan.planSha256,
      "--activate", "--runner", "codex",
    ], { encoding: "utf8", env });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);
    assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root, repositoryCapability: "host-managed" })
      .value.transactionState, "generated");
    assert.deepEqual(readdirSync(join(root, ".git")), []);
    assert.deepEqual(readdirSync(join(root, ".codex")), []);
  } finally { dispose(root); dispose(home); }
});

test("later intake language projection resumes after each target publication", () => {
  for (const stoppedRole of ["source", "machine", "receipt"]) {
    const root = freshRoot();
    const home = freshHome();
    try {
      for (const name of [".git", ".codex"]) {
        mkdirSync(join(root, name));
        chmodSync(join(root, name), 0o555);
      }
      const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
      assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "pending-asks");
      assert.equal(applyInitialOnboardingAnswers({ rootDir: root, runner: "codex", env,
        gitAuthorName: "Projection User", gitAuthorEmail: "projection@example.invalid",
        pushApproval: "chat", language: "en" }).code, "INITIAL-ANSWERS-APPLIED");
      applyOnboardingIntakeConsent({ rootDir: root, repositoryCapability: "host-managed",
        granted: true, language: "de", profile: "mini", activate: true });
      const args = { rootDir: root, repositoryCapability: "host-managed", runner: "codex",
        deps: { homedir: () => home } };
      assert.throws(() => projectConfirmedIntakeLanguage({ ...args, afterPublication(role) {
        if (role === stoppedRole) throw new Error("simulated-process-stop");
      } }), /simulated-process-stop/u);
      const resumed = projectConfirmedIntakeLanguage({ ...args, runner: "claude" });
      assert.ok(["completed", "replayed"].includes(resumed.status));
      assert.equal(resumed.audit.intakeLanguage, "de");
      assert.equal(readMachinePlane({ homedirFn: () => home }).plane.language, "de");
      assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), /human_facing:\s*"de"/u);
      assert.deepEqual(readdirSync(join(root, ".git")), []);
      assert.deepEqual(readdirSync(join(root, ".codex")), []);
    } finally { dispose(root); dispose(home); }
  }
});

test("public re-entry repairs consent recorded before language projection", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    for (const name of [".git", ".codex"]) {
      mkdirSync(join(root, name));
      chmodSync(join(root, name), 0o555);
    }
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "pending-asks");
    assert.equal(applyInitialOnboardingAnswers({ rootDir: root, runner: "codex", env,
      gitAuthorName: "Recovery User", gitAuthorEmail: "recovery@example.invalid",
      pushApproval: "chat", language: "en" }).code, "INITIAL-ANSWERS-APPLIED");
    applyOnboardingIntakeConsent({ rootDir: root, repositoryCapability: "host-managed",
      granted: true, language: "de", profile: "mini", activate: true });
    const bypass = spawnSync(process.execPath, [PROJECT_ONBOARDING_SCRIPT_PATH,
      "intake-generate-plan", "--root", root, "--runner", "codex",
    ], { encoding: "utf8", env });
    assert.notEqual(bypass.status, 0);
    assert.match(bypass.stderr, /INTAKE-LANGUAGE-PROJECTION-REQUIRED/u);
    const resumed = driveOnboardingInit({ rootDir: root, runner: "codex", env });
    assert.notEqual(resumed.outcome, "error", JSON.stringify(resumed));
    assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), /human_facing:\s*"de"/u);
    assert.equal(readMachinePlane({ homedirFn: () => home }).plane.language, "de");
    assert.deepEqual(readdirSync(join(root, ".git")), []);
    assert.deepEqual(readdirSync(join(root, ".codex")), []);
  } finally { dispose(root); dispose(home); }
});

test("later-language recovery refuses foreign edits without publishing an audit", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    for (const name of [".git", ".codex"]) {
      mkdirSync(join(root, name));
      chmodSync(join(root, name), 0o555);
    }
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "pending-asks");
    assert.equal(applyInitialOnboardingAnswers({ rootDir: root, runner: "codex", env,
      gitAuthorName: "Drift User", gitAuthorEmail: "drift@example.invalid",
      pushApproval: "chat", language: "en" }).code, "INITIAL-ANSWERS-APPLIED");
    applyOnboardingIntakeConsent({ rootDir: root, repositoryCapability: "host-managed",
      granted: true, language: "de", profile: "mini", activate: true });
    const args = { rootDir: root, repositoryCapability: "host-managed", runner: "codex",
      deps: { homedir: () => home } };
    assert.throws(() => projectConfirmedIntakeLanguage({ ...args, afterPublication(role) {
      if (role === "source") throw new Error("simulated-process-stop");
    } }), /simulated-process-stop/u);
    const sourcePath = join(root, "pipeline.user.yaml");
    writeFileSync(sourcePath, `${readFileSync(sourcePath, "utf8")}# foreign edit\n`);
    assert.throws(() => projectConfirmedIntakeLanguage(args), /INITIAL-ANSWERS-JOURNAL-DRIFT/u);
    assert.equal(readMachinePlane({ homedirFn: () => home }).plane.language, "en");
    assert.equal(existsSync(join(root, ".claude", ".runtime", "agent-pipeline", "onboarding", "language-projection.json")), false);
  } finally { dispose(root); dispose(home); }
});

test("later-language projection completes a prior three-target journal after plugin upgrade", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    for (const name of [".git", ".codex"]) {
      mkdirSync(join(root, name));
      chmodSync(join(root, name), 0o555);
    }
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "pending-asks");
    assert.equal(applyInitialOnboardingAnswers({ rootDir: root, runner: "codex", env,
      gitAuthorName: "Upgrade User", gitAuthorEmail: "upgrade@example.invalid",
      pushApproval: "chat", language: "en" }).code, "INITIAL-ANSWERS-APPLIED");
    applyOnboardingIntakeConsent({ rootDir: root, repositoryCapability: "host-managed",
      granted: true, language: "de", profile: "mini", activate: true });
    const args = { rootDir: root, repositoryCapability: "host-managed", runner: "codex",
      deps: { homedir: () => home } };
    assert.throws(() => projectConfirmedIntakeLanguage({ ...args, afterPublication(role) {
      if (role === "source") throw new Error("simulated old-plugin stop");
    } }), /simulated old-plugin stop/u);
    const pendingPath = join(root, ".claude", ".runtime", "agent-pipeline", "onboarding", "language-projection-pending.json");
    const pending = JSON.parse(readFileSync(pendingPath, "utf8"));
    pending.entries.pop();
    writeFileSync(pendingPath, `${JSON.stringify(pending)}\n`);
    assert.equal(projectConfirmedIntakeLanguage(args).status, "completed");
    assert.equal(existsSync(pendingPath), false);
    assert.equal(parseYaml(readFileSync(join(root, "project", "pipeline.yaml"), "utf8")).language.human_facing, "de");
  } finally { dispose(root); dispose(home); }
});

test("host-managed first answers recover after every publication boundary", () => {
  for (const stoppedRole of ["source", "machine", "receipt", "manifest"]) {
    const root = freshRoot();
    const home = freshHome();
    try {
      for (const name of [".git", ".codex"]) {
        mkdirSync(join(root, name));
        chmodSync(join(root, name), 0o555);
      }
      const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
      assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "pending-asks");
      const answers = { rootDir: root, runner: "codex", env, gitAuthorName: "Interrupted User",
        gitAuthorEmail: "interrupted@example.invalid", pushApproval: "chat", language: "de" };
      const interrupted = applyInitialOnboardingAnswers({ ...answers, afterInitialPublication(role) {
        if (role === stoppedRole) throw new Error("simulated-process-stop");
      } });
      assert.deepEqual(interrupted, { ok: false, code: "INITIAL-ANSWERS-TRANSACTION-RECOVERY-REQUIRED" });
      const state = resolveInitialAnswersState(root, "host-managed");
      assert.equal(existsSync(state.pending), true);
      const recovered = applyInitialOnboardingAnswers(answers);
      assert.equal(recovered.code, "INITIAL-ANSWERS-APPLIED", `${stoppedRole}: ${JSON.stringify(recovered)}`);
      assert.equal(existsSync(state.pending), false);
      assert.equal(JSON.parse(readFileSync(state.receipt, "utf8")).gitAuthorName, "Interrupted User");
      assert.deepEqual(readdirSync(join(root, ".git")), []);
      assert.deepEqual(readdirSync(join(root, ".codex")), []);
    } finally { dispose(root); dispose(home); }
  }
});

test("host-managed first answers complete a prior three-target journal after plugin upgrade", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    for (const name of [".git", ".codex"]) {
      mkdirSync(join(root, name));
      chmodSync(join(root, name), 0o555);
    }
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "pending-asks");
    const answers = { rootDir: root, runner: "codex", env, gitAuthorName: "Upgrade PO",
      gitAuthorEmail: "upgrade@example.invalid", pushApproval: "chat", language: "de" };
    const stopped = applyInitialOnboardingAnswers({ ...answers, afterInitialPublication(role) {
      if (role === "source") throw new Error("simulated old-plugin stop");
    } });
    assert.equal(stopped.code, "INITIAL-ANSWERS-TRANSACTION-RECOVERY-REQUIRED");
    const state = resolveInitialAnswersState(root, "host-managed");
    const pending = JSON.parse(readFileSync(state.pending, "utf8"));
    pending.entries.pop();
    writeFileSync(state.pending, `${JSON.stringify(pending)}\n`);
    assert.equal(applyInitialOnboardingAnswers(answers).code, "INITIAL-ANSWERS-APPLIED");
    assert.equal(existsSync(state.pending), false);
    assert.equal(parseYaml(readFileSync(join(root, "project", "pipeline.yaml"), "utf8")).language.human_facing, "de");
  } finally { dispose(root); dispose(home); }
});

test("host-managed recovery refuses changed answers and foreign post-interruption bytes", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    for (const name of [".git", ".codex"]) {
      mkdirSync(join(root, name));
      chmodSync(join(root, name), 0o555);
    }
    const env = withConflictingAmbientRunner({ ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home }, "codex");
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "pending-asks");
    const answers = { rootDir: root, runner: "codex", env, gitAuthorName: "Bound User",
      gitAuthorEmail: "bound@example.invalid", pushApproval: "chat", language: "de" };
    assert.equal(applyInitialOnboardingAnswers({ ...answers, afterInitialPublication(role) {
      if (role === "source") throw new Error("simulated-process-stop");
    } }).code, "INITIAL-ANSWERS-TRANSACTION-RECOVERY-REQUIRED");
    const state = resolveInitialAnswersState(root, "host-managed");
    assert.equal(applyInitialOnboardingAnswers({ ...answers, language: "en" }).code,
      "INITIAL-ANSWERS-TRANSACTION-ANSWER-CONFLICT");
    assert.equal(existsSync(state.pending), true);
    const sourcePath = join(root, "pipeline.user.yaml");
    writeFileSync(sourcePath, `${readFileSync(sourcePath, "utf8")}# foreign edit\n`);
    assert.equal(applyInitialOnboardingAnswers(answers).code,
      "INITIAL-ANSWERS-TRANSACTION-DRIFT");
    assert.equal(existsSync(state.receipt), false);
    assert.equal(existsSync(state.pending), true);
    assert.deepEqual(readdirSync(join(root, ".git")), []);
    assert.deepEqual(readdirSync(join(root, ".codex")), []);
  } finally { dispose(root); dispose(home); }
});

function checkApprovalCell(selectedCell) {
  const fixtures = [];
  try {
    const cases = [
      ...GREENFIELD_RUNNERS.flatMap((runner) => [
        { runner, pushApproval: "signature" },
        { runner, pushApproval: "chat" },
      ]),
    ];
    for (const { runner, pushApproval } of cases) {
      if (selectedCell !== `${runner}/${pushApproval}`) continue;
      const root = freshRoot();
      const home = freshHome();
      const sourceDirectory = mkdtempSync(join(tmpdir(), "onboarding-init-existing-source-"));
      const destination = join(home, "po-authority");
      const existingKey = join(sourceDirectory, "existing-private.pem");
      fixtures.push(root, home, sourceDirectory);
      writeFileSync(existingKey, encryptedKeyPem(), { mode: 0o600 });
      const env = withConflictingAmbientRunner({
        ...process.env,
        PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home,
      }, runner);

      const first = driveOnboardingInit({ rootDir: root, runner, env });
      assert.equal(first.outcome, runner === "codex" ? "collect-input" : "pending-asks", runner);
      assert.equal(first.pendingAsks.length, 1, `${runner}: the first PO stop is one bundled action, not sibling command fragments`);
      const initialAsk = first.pendingAsks[0];
      assert.deepEqual(actionInputNames(initialAsk), ["gitAuthorName", "gitAuthorEmail", "humanApprovalMode", "advisorExportConsent", "language"],
        `${runner}/${pushApproval}: initial action must confirm identity, shared approval mode and language together`);
      assert.match(initialAsk.guidance, /design\/plan approval as well as push approval/u,
        `${runner}/${pushApproval}: the shared mode must never be presented as push-only`);
      const replacements = new Map([
        ["<PO_GIT_AUTHOR_NAME>", "Greenfield Anchor PO"],
        ["<PO_GIT_AUTHOR_EMAIL>", "greenfield-anchor@example.invalid"],
        ["<signature|chat>", pushApproval],
        ["<approved|declined>", "approved"],
        ["<de|en>", "de"],
      ]);
      const argv = initialAsk.applyAction.argv.map((value) => replacements.get(value) ?? value);
      assert.equal(argv[0].endsWith("onboarding-init.mjs"), true, `${runner}: no internal setup script is guessed`);
      assert.equal(argv.includes("po-human-approval.mjs"), false, `${runner}: raw setup is not published`);
      assert.equal(argv.some((value) => value.startsWith("--trust-anchor-")), false,
        `${runner}/${pushApproval}: initial action never accepts trust-anchor flags`);
      const applied = spawnSync(initialAsk.applyAction.executable, argv, {
        encoding: "utf8", shell: false, env, maxBuffer: 8 * 1024 * 1024,
      });
      assert.equal(applied.status, 0, `${runner}: ${applied.stderr}\n${applied.stdout}`);
      assert.doesNotMatch(applied.stdout, /PRIVATE KEY|BEGIN [A-Z ]+KEY/u, `${runner}: no key bytes reach driver JSON`);
      const result = JSON.parse(applied.stdout);
      if (result.outcome === "pending-asks") {
        assert.equal(result.final?.nextAction?.pendingAsks, undefined,
          "the CLI prints sibling asks once while the library retains its full result");
      }
      assert.deepEqual(result.initialAnswers, {
        ok: true,
        code: "INITIAL-ANSWERS-APPLIED",
        pushApprovalPreference: pushApproval,
        language: "de",
        advisorExportConsent: "approved",
        trustAnchor: "not-requested",
      });
      assertPinnedRunner(result, runner, `${runner}/post-bootstrap`);

      assert.equal(spawnSync("git", ["-C", root, "config", "--local", "user.name"], { encoding: "utf8" }).status, 1);
      assert.equal(spawnSync("git", ["-C", root, "config", "--local", "user.email"], { encoding: "utf8" }).status, 1);
      const held = JSON.parse(readFileSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json"), "utf8"));
      assert.equal(held.root, root);
      assert.equal(held.gitAuthorName, "Greenfield Anchor PO");
      assert.equal(held.gitAuthorEmail, "greenfield-anchor@example.invalid");
      assert.equal(held.language, "de");
      assert.equal(held.advisorExportConsent, "approved");
      const confirmedIntent = parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8"));
      assert.equal(confirmedIntent.language.human_facing, "de", "confirmed PO language is projected before intake");
      assert.equal(parseYaml(readFileSync(join(root, "project", "pipeline.yaml"), "utf8")).language.human_facing,
        "de", "confirmed PO language keeps the active manifest coherent");
      assert.equal(confirmedIntent.advisor_export.consent, "approved", "Advisor export is attributed to this exact initial answer");
      assert.equal(readOnboardingIntakeCheckpoint({ rootDir: root }).status, "absent",
        `${runner}: first-round answers must not manufacture intake consent`);
      const effectivePlane = JSON.parse(readFileSync(join(home, ".agent-pipeline", "machine.json"), "utf8"));
      assert.equal(effectivePlane.language, "de", `${runner}: confirmed language reaches the runtime plane`);
      const gitCalls = [];
      const confirmedReceiptBytes = readFileSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json"));
      const confirmedSourceBytes = readFileSync(join(root, "pipeline.user.yaml"));
      const replay = applyInitialOnboardingAnswers({
        rootDir: root, runner, env, pushApproval, language: "de", advisorExportConsent: "approved",
        gitAuthorName: held.gitAuthorName, gitAuthorEmail: held.gitAuthorEmail,
        runGit: (...args) => { gitCalls.push(args); throw new Error("initial answers must never invoke Git config"); },
      });
      assert.equal(replay.ok, true, JSON.stringify(replay));
      assert.deepEqual(gitCalls, [], "the actual apply function persists answers without any Git config invocation");
      assert.deepEqual(readFileSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), confirmedReceiptBytes,
        "the same confirmed first answer is a zero-write replay");
      assert.deepEqual(readFileSync(join(root, "pipeline.user.yaml")), confirmedSourceBytes);
      const planePath = join(home, ".agent-pipeline", "machine.json");
      const planeBytes = readFileSync(planePath);
      for (const drift of [
        { language: null },
        { pushApprovalDefault: pushApproval === "chat" ? "signature" : "chat" },
      ]) {
        writeFileSync(planePath, `${JSON.stringify({ ...JSON.parse(planeBytes.toString("utf8")), ...drift }, null, 2)}\n`);
        const driftedReplay = applyInitialOnboardingAnswers({
          rootDir: root, runner, env, pushApproval, language: "de", advisorExportConsent: "approved",
          gitAuthorName: held.gitAuthorName, gitAuthorEmail: held.gitAuthorEmail,
        });
        assert.equal(driftedReplay.code, "INITIAL-ANSWERS-MACHINE-DRIFT", `${runner}/${pushApproval}: ${JSON.stringify(drift)}`);
        assert.deepEqual(readFileSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), confirmedReceiptBytes);
        assert.deepEqual(readFileSync(join(root, "pipeline.user.yaml")), confirmedSourceBytes);
      }
      writeFileSync(planePath, planeBytes);
      const changedLanguage = applyInitialOnboardingAnswers({
        rootDir: root, runner, env, pushApproval, advisorExportConsent: "approved",
        language: "en", gitAuthorName: held.gitAuthorName, gitAuthorEmail: held.gitAuthorEmail,
      });
      assert.equal(changedLanguage.code, "INITIAL-ANSWERS-RECEIPT-CONFLICT");
      assert.deepEqual(readFileSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), confirmedReceiptBytes);
      assert.deepEqual(readFileSync(join(root, "pipeline.user.yaml")), confirmedSourceBytes);
      assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), new RegExp(`^\\s*push_approval:\\s*"${pushApproval}"\\s*$`, "mu"));
      assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), new RegExp(`^\\s*human_approval:\\s*"${pushApproval}"\\s*$`, "mu"));
      assert.equal(existsSync(join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json")), true);

      const policy = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
      assert.equal(policy.schema, "pipeline.critical-human-proof-policy.v1");
      assert.equal(Object.hasOwn(policy, "trustAnchor"), false);
      assert.equal(Object.hasOwn(policy, "trustAnchors"), false);
      assert.equal(Object.hasOwn(policy, "waivedKinds"), false);
      const machine = JSON.parse(readFileSync(join(home, ".agent-pipeline", "machine.json"), "utf8"));
      assert.equal(machine.poKeyDirectory, null, `${runner}/${pushApproval}: initial action leaves the key directory unset`);

      const reentered = driveOnboardingInit({ rootDir: root, runner, env });
      const names = [
        ...(result.pendingAsks ?? []).flatMap(actionInputNames),
        ...(reentered.pendingAsks ?? []).flatMap(actionInputNames),
        ...actionInputNames(reentered.collectInput),
      ];
      assert.equal(names.includes("humanApprovalMode"), false, `${runner}: durable receipt prevents a repeated shared-approval ask`);
      assert.equal(names.includes("gitAuthorName"), false, `${runner}: held name suppresses repeated author ask`);
      assert.equal(names.includes("gitAuthorEmail"), false, `${runner}: held email suppresses repeated author ask`);
      if (pushApproval === "chat") {
        assert.equal(names.includes("trustAnchorSetupMode"), false, `${runner}: chat never asks for a signing key`);
        assert.equal(existsSync(join(root, ".git", "agent-pipeline", "po-key-directory.json")), false,
          `${runner}: chat creates no repository key pointer`);
        continue;
      }

      const anchorAsk = result.pendingAsks?.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"))
        ?? reentered.pendingAsks?.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"));
      assert.ok(anchorAsk, `${runner}: signature reaches the separate trust-anchor action`);
      assert.equal(anchorAsk.applyAction.argv.includes("--push-approval"), false,
        `${runner}: signature anchor action is separate from initial push-mode selection`);
      const attendedArgv = anchorAsk.applyAction.argv.map((value) => new Map([
        ["<existing|new>", "existing"],
        ["<absolute external key directory>", destination],
        ["<human attribution>", "Greenfield Anchor PO"],
        ["<absolute existing key path|none>", existingKey],
      ]).get(value) ?? value);
      const attendedCommand = [anchorAsk.applyAction.executable, ...attendedArgv]
        .map((value) => `'${value.replaceAll("'", "'\\''")}'`).join(" ");
      assert.equal(isSanctionedLifecycleCommand(attendedCommand, root), true,
        `${runner}: the emitted and answered anchor action must be admitted by the lifecycle guard`);
      const invalidArgv = [...attendedArgv];
      invalidArgv[invalidArgv.indexOf("--trust-anchor-existing-key") + 1] = "none";
      const invalidCommand = [anchorAsk.applyAction.executable, ...invalidArgv]
        .map((value) => `'${value.replaceAll("'", "'\\''")}'`).join(" ");
      assert.equal(isSanctionedLifecycleCommand(invalidCommand, root), false,
        `${runner}: existing + none is a different, invalid action and must remain refused`);
      // TR-S1-T3f (Ruling 132): in-process, so the passphrase-protected fixture key can be derived with
      // `-passin` through the setup step's spawn seam; a spawned CLI chain has no way to carry it.
      const setupFailures = [];
      let anchoredStdout = "";
      let anchoredStderr = "";
      const anchoredCode = main(attendedArgv.slice(1), {
        write: (value) => { anchoredStdout += value; },
        writeError: (value) => { anchoredStderr += value; },
        env,
        applyTrustAnchor: (request) => applyTrustAnchorBootstrap({ ...request, runSetup: inProcessSetup(home, setupFailures) }),
      });
      assert.equal(anchoredCode, 0,
        `${runner}: ${setupFailures.map((error) => error.message).join("; ")}\n${anchoredStderr}\n${anchoredStdout}`);
      const anchoredResult = JSON.parse(anchoredStdout);
      assert.deepEqual(anchoredResult.bootstrap, {
        ok: true,
        code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE",
        mode: "existing",
      });
      const anchoredPolicy = JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8"));
      assert.equal(anchoredPolicy.schema, "pipeline.critical-human-proof-policy.v3");
      assert.equal(anchoredPolicy.trustAnchors.length, 1);
      assert.deepEqual(anchoredPolicy.waivedKinds, []);
      assert.equal(JSON.parse(readFileSync(join(home, ".agent-pipeline", "machine.json"), "utf8")).poKeyDirectory, destination);
      assert.equal(JSON.parse(readFileSync(join(root, ".git", "agent-pipeline", "po-key-directory.json"), "utf8")).poKeyDirectory, destination);
    }
  } finally {
    for (const path of fixtures) dispose(path);
  }
}

test("public onboarding driver keeps chat keyless and reaches a separate signature-anchor action", async () => {
  if (!MATRIX_CELL) await runMatrix("approval");
});

test("a failed separate signature-anchor action preserves the completed initial chat-free transaction", () => {
  const root = freshRoot();
  const home = freshHome();
  try {
    const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home };
    const first = driveOnboardingInit({ rootDir: root, runner: "claude", env });
    assert.equal(first.outcome, "pending-asks");
    assert.equal(first.pendingAsks.length, 1);
    const initialAction = first.pendingAsks[0];
    assert.deepEqual(initialAction.inputs.map((input) => input.name), [
      "gitAuthorName",
      "gitAuthorEmail",
      "humanApprovalMode",
      "advisorExportConsent",
      "language",
    ]);
    const initial = spawnSync(initialAction.applyAction.executable, initialAction.applyAction.argv.map((value) => new Map([
      ["<PO_GIT_AUTHOR_NAME>", "Rollback PO"],
      ["<PO_GIT_AUTHOR_EMAIL>", "rollback@example.invalid"],
      ["<signature|chat>", "signature"],
      ["<approved|declined>", "declined"],
      ["<de|en>", "en"],
    ]).get(value) ?? value), {
      encoding: "utf8", shell: false, env, maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(initial.status, 0, initial.stderr);
    const initialResult = JSON.parse(initial.stdout);
    const anchorAction = initialResult.pendingAsks?.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"))
      ?? driveOnboardingInit({ rootDir: root, runner: "claude", env }).pendingAsks?.find((ask) => ask.inputs?.some((input) => input.name === "trustAnchorSetupMode"));
    assert.ok(anchorAction, "signature re-entry reaches the separate anchor action");
    const replacements = new Map([
      ["<existing|new>", "existing"],
      ["<absolute external key directory>", join(home, "failed-authority")],
      ["<human attribution>", "Rollback PO"],
      ["<absolute existing key path|none>", join(home, "missing-private.pem")],
    ]);
    const failed = spawnSync(anchorAction.applyAction.executable, anchorAction.applyAction.argv.map((value) => replacements.get(value) ?? value), {
      encoding: "utf8", shell: false, env, maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(failed.status, 1, failed.stderr);
    const result = JSON.parse(failed.stdout);
    assert.equal(result.outcome, "error");
    assert.equal(result.bootstrap.code, "TRUST-ANCHOR-SETUP-FAILED");
    const initialAnswersPath = join(root, ".git", "agent-pipeline", "onboarding-initial-answers.json");
    assert.equal(existsSync(initialAnswersPath), true);
    const initialAnswers = JSON.parse(readFileSync(initialAnswersPath, "utf8"));
    assert.equal(initialAnswers.gitAuthorName, "Rollback PO");
    assert.equal(initialAnswers.gitAuthorEmail, "rollback@example.invalid");
    assert.equal(initialAnswers.language, "en");
    assert.equal(initialAnswers.advisorExportConsent, "declined");
    assert.equal(parseYaml(readFileSync(join(root, "pipeline.user.yaml"), "utf8")).advisor_export.consent, "declined");
    assert.equal(spawnSync("git", ["-C", root, "config", "--local", "--get", "user.name"], { encoding: "utf8" }).status, 1);
    assert.equal(spawnSync("git", ["-C", root, "config", "--local", "--get", "user.email"], { encoding: "utf8" }).status, 1);
    assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), /^\s*push_approval:\s*"signature"\s*$/mu);
    assert.match(readFileSync(join(root, "pipeline.user.yaml"), "utf8"), /^\s*human_approval:\s*"signature"\s*$/mu);
    assert.equal(JSON.parse(readFileSync(join(home, ".agent-pipeline", "machine.json"), "utf8")).poKeyDirectory, null);
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
    assert.equal(seeded.outcome, "collect-input");
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
      return {
        status: 0,
        error: Object.assign(new Error("WSL sandbox adapter reported EPERM after setup completed"), { code: "EPERM" }),
      };
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

// TR-S1-T3f (Ruling 132), fail-closed pin for the SPAWNED path the two key cells above no longer
// walk: a CLI `setup --existing-key` on a passphrase-protected key, with stdin closed and no
// controlling terminal (`detached` makes the child a session leader, so OpenSSL cannot reach a
// /dev/tty), must end non-zero inside the bound and must register no trust anchor. The private key
// is copied before OpenSSL derives the public half, so the pin checks the authority record and the
// public key, not an empty directory. POSIX only: native Windows has no equivalent that avoids
// opening a console window per run.
test("setup --existing-key on a passphrase-protected key with no terminal fails closed without a trust anchor", {
  skip: process.platform === "win32" ? "detaching from the console needs a POSIX session" : false,
}, () => {
  const root = freshRoot();
  const home = freshHome();
  const directory = join(home, "unattended-po-authority");
  const source = join(home, "source-private.pem");
  try {
    assert.equal(spawnSync("git", ["init", "-q", root], { encoding: "utf8", shell: false }).status, 0);
    writeFileSync(source, encryptedKeyPem(), { mode: 0o600 });
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("./po-human-approval.mjs", import.meta.url)), "setup",
      "--repo-root", root, "--directory", directory, "--existing-key", source,
      "--human-name", "Unattended PO",
    ], {
      encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"], detached: true, windowsHide: true,
      timeout: 30000, killSignal: "SIGKILL",
      env: { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home, HOME: home, USERPROFILE: home },
    });
    assert.equal(result.error, undefined, `the setup child must not hang: ${result.error?.message}`);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stderr, /openssl failed/u, "the refusal comes from the key derivation, not from an earlier unrelated gate");
    assert.equal(existsSync(join(directory, "trust-policy.json")), false, "no authority record is written");
    assert.equal(existsSync(join(directory, "po-public.pem")), false, "no public key is derived");
    assert.equal(existsSync(join(home, ".agent-pipeline", "machine.json")), false, "no machine key pointer is written");
  } finally {
    dispose(root);
    dispose(home);
  }
});

// TR-S1-T3g (Ruling 137), RED pin: the same unattended `setup --existing-key` as the case above, now
// on the other half of "registers no trust anchor". By code read, po-human-approval.mjs copies the
// private key into the target directory (the `write(paths.privateKey, ...)` step) BEFORE the OpenSSL
// derivation that validates it, so a failed derivation leaves a copy of the passphrase-protected
// private key behind in a directory that was never registered. The preconditions are identical to the
// case above, so a red here is attributable to the leftover copy and to nothing earlier. Expected to
// stay RED until the copy is moved behind (or rolled back after) the derivation in po-human-approval.mjs.
test("setup --existing-key on a passphrase-protected key with no terminal leaves no copy of the private key in the target directory", {
  skip: process.platform === "win32" ? "detaching from the console needs a POSIX session" : false,
}, () => {
  const root = freshRoot();
  const home = freshHome();
  const directory = join(home, "unattended-po-authority");
  const source = join(home, "source-private.pem");
  try {
    assert.equal(spawnSync("git", ["init", "-q", root], { encoding: "utf8", shell: false }).status, 0);
    writeFileSync(source, encryptedKeyPem(), { mode: 0o600 });
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("./po-human-approval.mjs", import.meta.url)), "setup",
      "--repo-root", root, "--directory", directory, "--existing-key", source,
      "--human-name", "Unattended PO",
    ], {
      encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"], detached: true, windowsHide: true,
      timeout: 30000, killSignal: "SIGKILL",
      env: { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home, HOME: home, USERPROFILE: home },
    });
    assert.equal(result.error, undefined, `the setup child must not hang: ${result.error?.message}`);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stderr, /openssl failed/u, "the refusal comes from the key derivation, not from an earlier unrelated gate");
    const leftovers = existsSync(directory) ? readdirSync(directory) : [];
    assert.deepEqual(leftovers.filter((name) => name.endsWith(".pem")), [],
      "a failed key derivation must leave no copy of the private key in the target directory");
  } finally {
    dispose(root);
    dispose(home);
  }
});

// TR-S1-T3g (Ruling 137): machine-plane isolation of the in-process setup step the two key cells now use.
// The ambient home (what `os.homedir()` would return: HOME on POSIX, USERPROFILE on win32) is pointed at
// a decoy for the duration of the call, so any code path that reached the plane through `os.homedir()`
// instead of the injected `homedirFn` would write the decoy and fail the last assertion. The real
// operator's `~/.agent-pipeline/machine.json` is never read, written or compared.
test("the in-process setup step writes the machine plane into the injected home and never into the ambient home", () => {
  const root = freshRoot();
  const home = freshHome();
  const ambient = freshHome();
  const directory = join(home, "po-authority");
  const source = join(home, "source-private.pem");
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  try {
    assert.equal(spawnSync("git", ["init", "-q", root], { encoding: "utf8", shell: false }).status, 0);
    writeFileSync(source, encryptedKeyPem(), { mode: 0o600 });
    process.env.HOME = ambient;
    process.env.USERPROFILE = ambient;
    runHumanApproval(["setup", "--repo-root", root, "--directory", directory, "--existing-key", source,
      "--human-name", "Isolated PO"], { spawn: passinSpawn(), homedirFn: () => home, isTTY: true });
    const plane = readMachinePlane({ homedirFn: () => home });
    assert.equal(plane.status, "valid", "the injected home received the machine plane");
    assert.equal(existsSync(join(ambient, ".agent-pipeline")), false, "the ambient home never received a machine plane");
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    dispose(root);
    dispose(home);
    dispose(ambient);
  }
});

test("signature anchor reuses a key already at the canonical directory path without importing or replacing it", () => {
  const root = freshRoot();
  const home = freshHome();
  const directory = join(home, "existing-po-authority");
  const source = join(home, "source-private.pem");
  const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home };
  try {
    assert.equal(driveOnboardingInit({ rootDir: root, runner: "claude", env }).outcome, "pending-asks");
    // TR-S1-T3f (Ruling 132): the import step runs in-process so the passphrase-protected key can be
    // derived with `-passin`; runHumanApproval throws on failure, which fails this case with the reason.
    writeFileSync(source, encryptedKeyPem(), { mode: 0o600 });
    runHumanApproval(["setup", "--repo-root", root, "--directory", directory, "--existing-key", source,
      "--human-name", "Existing PO"], { spawn: passinSpawn(), homedirFn: () => home, isTTY: true });
    const canonicalKey = join(directory, "po-private.pem");
    const suppliedKey = process.platform === "win32"
      ? `${canonicalKey[0].toLowerCase()}${canonicalKey.slice(1)}`.replaceAll("\\", "/")
      : canonicalKey;
    const keyBytes = readFileSync(canonicalKey);
    const applied = applyTrustAnchorBootstrap({
      rootDir: root, mode: "existing", directory, humanName: "Existing PO",
      existingKey: suppliedKey, env,
    });
    assert.deepEqual(applied, { ok: true, code: "TRUST-ANCHOR-BOOTSTRAP-COMPLETE", mode: "existing" });
    assert.deepEqual(readFileSync(canonicalKey), keyBytes, "reuse never copies or overwrites the private key");
    assert.equal(JSON.parse(readFileSync(join(root, "project", "critical-human-proof.json"), "utf8")).trustAnchors.length, 1);
  } finally {
    dispose(root);
    dispose(home);
  }
});

function checkRollbackCell(selectedCell) {
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
    if (selectedCell !== failure.name) continue;
    const root = freshRoot();
    const home = freshHome();
    const destination = join(home, `authority-${failure.name}`);
    try {
      const env = { ...process.env, PIPELINE_ONBOARDING_HOMEDIR_OVERRIDE: home };
      assert.equal(driveOnboardingInit({ rootDir: root, runner: "codex", env }).outcome, "collect-input");
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
}

test("first-anchor transaction restores exact repository, machine, and pointer preimages on every post-setup failure boundary", async () => {
  if (!MATRIX_CELL) await runMatrix("rollback");
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

test("driveOnboardingInit: failed portable seed stops at its first unexpected mutation outcome", () => {
  const root = freshRoot();
  try {
    let calls = 0;
    const run = () => {
      calls += 1;
      if (calls === 1) return respond({
        schema: "pipeline.project-onboarding.v4",
        status: "portable-seed-required",
        nextAction: {
          kind: "command", executable: "node", argv: ["/plugin/scripts/project-onboarding-v3.mjs", "apply-portable-seed", "--root", root, "--plan-sha256", "a".repeat(64), "--activate"],
          mutation: true, requiresConfirmation: true,
          expected: { schema: "pipeline.project-onboarding.v4", statuses: ["runtime-initialization-required"] },
        },
      });
      return respond({
        schema: "pipeline.project-onboarding-plan.v3",
        status: "rolled-back",
        diagnostics: [{ path: "$.transaction", code: "apply_failed", message: "synthetic failure" }],
      });
    };
    const result = driveOnboardingInit({ rootDir: root, runner: "claude", run });
    assert.equal(result.outcome, "error");
    assert.equal(result.error.faultCode, "unexpected-mutation-outcome");
    assert.equal(result.final.status, "rolled-back");
    assert.equal(result.blockedAction.diagnostics[0].code, "apply_failed");
    assert.equal(calls, 2);
  } finally { dispose(root); }
});

test("portable lifecycle apply returns its rollback instead of replanning the same seed", () => {
  const root = freshRoot();
  try {
    const plan = planProjectOnboardingLifecycleV4({ rootDir: root, runner: "claude", operation: "portable" });
    const argv = plan.nextAction.argv;
    const digest = argv[argv.indexOf("--plan-sha256") + 1];
    const result = applyProjectOnboardingLifecycleV4({
      rootDir: root, runner: "claude", operation: "portable", planSha256: digest, activate: true,
      deps: { writeFileSync: () => { throw new Error("synthetic seed write failure"); } },
    });
    assert.equal(result.status, "rolled-back");
    assert.equal(result.diagnostics[0].code, "apply_failed");
    assert.equal(existsSync(join(root, ".git")), false);
  } finally { dispose(root); }
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

test("driveOnboardingInit: binds a returned root-less project action to the Driver root", () => {
  const root = freshRoot();
  try {
    let calls = 0;
    const run = (executable, argv, options) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(argv.includes("--root"), true);
        assert.equal(options.env, undefined, "explicit --root actions retain their published environment");
        return respond({
          schema: "pipeline.inspect.v1",
          status: "draft",
          nextAction: {
            kind: "command",
            executable: process.execPath,
            argv: ["/pipeline-state.mjs", "inspect"],
          },
        });
      }
      if (calls === 2) {
        assert.equal(executable, process.execPath);
        assert.deepEqual(argv, ["/pipeline-state.mjs", "inspect"]);
        assert.equal(options.env.CLAUDE_PROJECT_DIR, root);
        return respond({ schema: "pipeline.inspect.v1", status: "ready", nextAction: null });
      }
      assert.equal(executable, "node");
      assert.equal(argv.includes("--root"), true);
      return respond({ schema: "pipeline.project-onboarding.v4", status: "ready", nextAction: null });
    };
    const result = driveOnboardingInit({ rootDir: root, runner: "codex", run });
    assert.equal(result.outcome, "ready", JSON.stringify(result));
    assert.equal(calls, 3, "a command's own ready response requires a fresh inspect readback");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: accepts a completed WSL child when EPERM accompanies its zero exit status", () => {
  const root = freshRoot();
  try {
    let calls = 0;
    const completed = (output) => ({
      status: 0,
      stdout: JSON.stringify(output),
      stderr: "",
      error: Object.assign(new Error("WSL sandbox adapter reported EPERM after completion"), { code: "EPERM" }),
    });
    const run = () => {
      calls += 1;
      if (calls === 1) {
        return completed({
          schema: "pipeline.synthetic.v1",
          status: "in-progress",
          nextAction: { kind: "command", executable: "node", argv: ["tool"] },
        });
      }
      return completed({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null });
    };
    const result = driveOnboardingInit({ rootDir: root, run });
    assert.equal(result.outcome, "ready", JSON.stringify(result));
    assert.equal(calls, 3, "the completed command is followed by its mandatory fresh inspect readback");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: nonzero, missing-status, and non-EPERM spawn results remain closed", () => {
  assert.equal(DEFAULT_RUN_BUDGET_MS, 90_000);
  const root = freshRoot();
  try {
    let tick = 0;
    let calls = 0;
    const bounded = driveOnboardingInit({ rootDir: root, runBudgetMs: 10, now: () => tick,
      run: (executable, argv, options) => {
        calls += 1;
        assert.equal(options.timeout, 10);
        assert.equal(options.killSignal, "SIGKILL");
        tick = 11;
        return respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: { kind: "command", executable: "node", argv: ["tool"], mutation: true } });
      } });
    assert.equal(bounded.outcome, "execution-budget-exhausted");
    assert.equal(calls, 1, "expired budget must not execute the next mutation");
    assert.equal(bounded.recovery.argv[1], "inspect");
    assert.equal(bounded.recovery.mutation, false);
    const timedOut = driveOnboardingInit({ rootDir: root, run: () => ({ status: null, error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) }) });
    assert.equal(timedOut.error.faultCode, "execution-budget-exhausted");
    assert.equal(timedOut.recovery.argv[1], "inspect");
  } finally { dispose(root); }
  for (const [name, result, faultCode, exitCode] of [
    ["nonzero-eperm", {
      status: 1,
      stdout: JSON.stringify({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null }),
      stderr: "refused",
      error: Object.assign(new Error("EPERM"), { code: "EPERM" }),
    }, "spawn-failed", 1],
    ["missing-status", {
      stdout: JSON.stringify({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null }),
      stderr: "",
    }, "nonzero-exit", null],
    ["timed-out-child", { status: null, stdout: "", stderr: "", error: Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }) }, "execution-budget-exhausted", null],
    ["foreign-error-at-zero", {
      status: 0,
      stdout: JSON.stringify({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null }),
      stderr: "",
      error: Object.assign(new Error("EACCES"), { code: "EACCES" }),
    }, "spawn-failed", 0],
  ]) {
    const root = freshRoot();
    try {
      const observed = driveOnboardingInit({ rootDir: root, run: () => result });
      assert.equal(observed.outcome, "error", `${name}: ${JSON.stringify(observed)}`);
      assert.equal(observed.error.faultCode, faultCode, name);
      assert.equal(observed.error.exitCode, exitCode, name);
    } finally {
      dispose(root);
    }
  }
});

test("driveOnboardingInit: a blocked published runner-permission repair retains its exact diagnostic action", () => {
  const root = freshRoot();
  try {
    let call = 0;
    const repairArgv = ["/plugin/scripts/settings-allowlist-merge.mjs", "apply-runner-permissions", "--root", root, "--plan-sha256", "a".repeat(64), "--activate"];
    const run = () => {
      call += 1;
      if (call === 1) {
        return respond({
          schema: "pipeline.project-onboarding.v4",
          status: "projection-drift",
          diagnostics: [{ path: "$.runnerPermissions", code: "runner_permissions_drift", message: "permissions are stale", guidance: "apply the digest-bound settings merge" }],
          nextAction: {
            kind: "command",
            executable: "node",
            argv: repairArgv,
            mutation: true,
            requiresConfirmation: true,
            expected: { schema: "pipeline.settings-allowlist-merge-apply.v1", statuses: ["ready", "no-op"] },
          },
        });
      }
      return { status: 1, stdout: "", stderr: "runner denied the current script path" };
    };
    const result = driveOnboardingInit({ rootDir: root, runner: "codex", run });
    assert.equal(result.outcome, "error");
    assert.deepEqual(result.blockedAction.action.argv, repairArgv);
    assert.equal(result.blockedAction.priorStatus, "projection-drift");
    assert.equal(result.blockedAction.diagnostics[0].code, "runner_permissions_drift");
    assert.match(result.blockedAction.guidance, /Re-run the public inspection/u);
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
    let commandCalls = 0;
    const directLoop = driveOnboardingInit({ rootDir: root, stepCap, run: () => { commandCalls += 1; return respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: { kind: "command", executable: "node", argv: ["tool"] } }); } });
    assert.equal(directLoop.outcome, "no-progress");
    assert.equal(commandCalls, 3, "a repeated command response must not consume all 50 steps");
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: collect-input, external-operator, ready, unsupported-next-action and error outcomes reached directly are typed", () => {
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

  const externalRoot = freshRoot();
  try {
    const externalAction = { kind: "external-operator", executionBoundary: "attended-external-tool", invocation: "user-copy-only" };
    const externalRun = () => respond({ schema: "pipeline.synthetic.v1", status: "in-progress", nextAction: externalAction });
    const externalResult = driveOnboardingInit({ rootDir: externalRoot, run: externalRun });
    assert.equal(externalResult.outcome, "external-operator");
    assert.deepEqual(externalResult.externalOperator, externalAction);
  } finally {
    dispose(externalRoot);
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
        return step === 2
          ? respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null })
          : respond({ schema: "pipeline.project-onboarding.v4", status: "ready", nextAction: null });
      };
      const result = driveOnboardingInit({ rootDir: root, run });
      assert.equal(result.outcome, "ready", JSON.stringify(result));
      assert.equal(step, 3, "the command must execute and then receive a fresh inspect readback");
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
        return step === 2
          ? respond({ schema: "pipeline.synthetic.v1", status: "ready", nextAction: null })
          : respond({ schema: "pipeline.project-onboarding.v4", status: "ready", nextAction: null });
      };
      const result = driveOnboardingInit({ rootDir: root, run });
      assert.equal(result.outcome, "ready", JSON.stringify(result));
      assert.equal(step, 3, "malformed metadata is not treated as a valid stop-worthy ask -- the command must execute and re-anchor");
      assert.equal(result.steps[0].pendingAsksFault, "malformed-pending-asks-ignored",
        "the malformed field must be visible on the step record, not silently dropped");
    } finally {
      dispose(root);
    }
  }
});

test("driveOnboardingInit: walks migration plan -> apply --activate -> re-anchor inspect -> ready without premature termination", () => {
  const root = freshRoot();
  try {
    let call = 0;
    const run = (executable, argv) => {
      call += 1;
      if (call === 1) {
        assert.equal(argv.includes("inspect"), true);
        return respond({
          schema: "pipeline.project-onboarding.v3",
          status: "migration-required",
          nextAction: {
            kind: "command",
            executable: "node",
            argv: ["/migration.mjs", "plan", "--root", root],
          },
        });
      }
      if (call === 2) {
        assert.deepEqual(argv, ["/migration.mjs", "plan", "--root", root]);
        return respond({
          schema: "pipeline.runner-profile-migration-plan.v3",
          status: "ready",
          changes: [{ path: "pipeline.user.yaml", changed: true }],
          activation: { required: true, command: "apply --activate", sourceCommittedLast: true },
          nextAction: {
            kind: "command",
            executable: "node",
            argv: ["/migration.mjs", "apply", "--root", root, "--activate"],
            mutation: true,
          },
        });
      }
      if (call === 3) {
        assert.deepEqual(argv, ["/migration.mjs", "apply", "--root", root, "--activate"]);
        return respond({
          schema: "pipeline.runner-profile-migration-plan.v3",
          status: "applied",
          changes: [{ path: "pipeline.user.yaml", changed: true }],
          nextAction: null,
        });
      }
      if (call === 4) {
        assert.equal(argv.includes("inspect"), true);
        return respond({
          schema: "pipeline.project-onboarding.v3",
          status: "ready",
          nextAction: null,
        });
      }
      throw new Error(`Unexpected call ${call}`);
    };

    const result = driveOnboardingInit({ rootDir: root, runner: "codex", run });
    assert.equal(result.outcome, "ready");
    assert.equal(result.stepsExecuted, 4);
    assert.equal(call, 4);
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: a migration-ready V4 response keeps required asks while optional handover commands remain terminal", () => {
  const migration = "/plugin/runner-profile-migration-v3.mjs";
  for (const [label, nextAction, expectedOutcome] of [
    ["verify command", { kind: "collect-input", input: { name: "verifyCommand" } }, "collect-input"],
    ["optional handover", { kind: "command", executable: "node", argv: ["/plugin/pipeline-state.mjs", "set-phase", "--phase", "implementation"] }, "ready"],
    ["handover pending ask", { kind: "command", executable: "node", argv: ["/plugin/pipeline-state.mjs", "set-phase", "--phase", "implementation"], pendingAsks: [{ kind: "collect-input", input: { name: "verifyCommand" } }] }, "pending-asks"],
  ]) {
    const root = freshRoot();
    try {
      let call = 0;
      const run = (_executable, argv) => {
        call += 1;
        if (call === 1) return respond({ schema: "pipeline.project-onboarding.v4", status: "migration-required", nextAction: { kind: "command", executable: "node", argv: [migration, "plan", "--root", root] } });
        if (call === 2) return respond({ schema: "pipeline.runner-profile-migration-plan.v3", status: "ready", changes: [{ path: "pipeline.user.yaml", changed: true }], activation: { required: true }, nextAction: { kind: "command", executable: "node", argv: [migration, "apply", "--root", root, "--activate"] } });
        if (call === 3) return respond({ schema: "pipeline.runner-profile-migration-plan.v3", status: "applied", nextAction: null });
        if (call === 4) {
          assert.equal(argv.includes("inspect"), true, `${label}: migration must re-anchor before deciding readiness`);
          return respond({ schema: "pipeline.project-onboarding.v4", status: "ready", nextAction });
        }
        throw new Error(`${label}: unexpected call ${call}`);
      };
      const result = driveOnboardingInit({ rootDir: root, runner: "codex", run });
      assert.equal(result.outcome, expectedOutcome, `${label}: ${JSON.stringify(result)}`);
      assert.equal(result.stepsExecuted, 4, `${label}: optional handover command must not execute during migration`);
      assert.equal(call, 4);
      if (expectedOutcome === "collect-input") assert.equal(result.collectInput.input.name, "verifyCommand");
      if (expectedOutcome === "pending-asks") assert.equal(result.pendingAsks[0].input.name, "verifyCommand");
    } finally {
      dispose(root);
    }
  }
});

test("driveOnboardingInit: a greenfield V4-ready command nextAction executes before reaching PO input", () => {
  const root = freshRoot();
  try {
    let call = 0;
    const run = (_executable, argv) => {
      call += 1;
      if (call === 1) {
        assert.equal(argv.includes("inspect"), true, "the driver starts from its public inspect anchor");
        return respond({
          schema: "pipeline.project-onboarding.v4",
          status: "ready",
          nextAction: {
            kind: "command",
            executable: "node",
            argv: ["/plugin/pipeline-state.mjs", "inspect"],
          },
        });
      }
      if (call === 2) {
        assert.deepEqual(argv, ["/plugin/pipeline-state.mjs", "inspect"], "a greenfield command must not be treated as a migration handover");
        return respond({
          schema: "pipeline.project-onboarding.v4",
          status: "awaiting-po-input",
          nextAction: { kind: "collect-input", input: { name: "profile" } },
        });
      }
      throw new Error(`Unexpected call ${call}`);
    };

    const result = driveOnboardingInit({ rootDir: root, runner: "codex", run });
    assert.equal(result.outcome, "collect-input", JSON.stringify(result));
    assert.equal(result.collectInput.input.name, "profile");
    assert.equal(result.stepsExecuted, 2, "the greenfield command must run before the PO boundary");
    assert.equal(call, 2);
  } finally {
    dispose(root);
  }
});

test("driveOnboardingInit: an unapplied migration plan missing its apply action fails closed instead of claiming ready", () => {
  const root = freshRoot();
  try {
    let call = 0;
    const run = (executable, argv) => {
      call += 1;
      if (call === 1) {
        return respond({
          schema: "pipeline.project-onboarding.v3",
          status: "migration-required",
          nextAction: {
            kind: "command",
            executable: "node",
            argv: ["/migration.mjs", "plan", "--root", root],
          },
        });
      }
      if (call === 2) {
        return respond({
          schema: "pipeline.runner-profile-migration-plan.v3",
          status: "ready",
          changes: [{ path: "pipeline.user.yaml", changed: true }],
          activation: { required: true, command: "apply --activate", sourceCommittedLast: true },
          nextAction: null,
        });
      }
      throw new Error(`Unexpected call ${call}`);
    };

    const result = driveOnboardingInit({ rootDir: root, runner: "codex", run });
    assert.equal(result.outcome, "error");
    assert.equal(result.error.faultCode, "migration-action-missing");
    assert.equal(result.final.schema, "pipeline.runner-profile-migration-plan.v3");
    assert.equal(call, 2);
  } finally {
    dispose(root);
  }
});

test("DEFAULT_STEP_CAP is a small, positive constant", () => {
  assert.ok(Number.isInteger(DEFAULT_STEP_CAP));
  assert.ok(DEFAULT_STEP_CAP > 0);
  assert.ok(DEFAULT_STEP_CAP < 1000, "the cap must be a small constant, not effectively unbounded");
});

if (MATRIX_CELL) {
  test("isolated onboarding matrix cell", () => {
    const separator = MATRIX_CELL.indexOf(":");
    const group = MATRIX_CELL.slice(0, separator);
    const cell = MATRIX_CELL.slice(separator + 1);
    assert.ok(MATRIX_CASES[group]?.includes(cell), `unknown onboarding matrix cell: ${MATRIX_CELL}`);
    if (group === "convergence") checkConvergenceCell(cell);
    else if (group === "approval") checkApprovalCell(cell);
    else checkRollbackCell(cell);
  });
}

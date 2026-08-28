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
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { DEFAULT_STEP_CAP, SCHEMA, driveOnboardingInit } from "./onboarding-init.mjs";

const ONBOARDING_SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), "project-onboarding-v3.mjs");

function freshRoot() {
  return mkdtempSync(join(tmpdir(), "onboarding-init-test-"));
}

function dispose(path) {
  rmSync(path, { recursive: true, force: true });
}

test("driveOnboardingInit: stops at the first collect-input action without inventing any of its values", () => {
  const root = freshRoot();
  try {
    const result = driveOnboardingInit({ rootDir: root });
    assert.equal(result.schema, SCHEMA);
    assert.equal(result.outcome, "collect-input");
    assert.equal(result.root, root);
    assert.equal(result.collectInput.kind, "collect-input");
    // The collect-input action is carried through VERBATIM from the underlying onboarding
    // CLI's own final response -- never re-derived, never re-worded.
    assert.deepEqual(result.collectInput, result.final.nextAction);
    // Never invented: this driver holds no field anywhere in its result that could carry a
    // fabricated answer for any of the asked inputs (gitAuthorName/gitAuthorEmail/language/
    // profile, for a fresh repository's first intake-consent ask).
    const askedNames = (result.collectInput.inputs ?? [result.collectInput.input]).map((input) => input.name);
    assert.ok(askedNames.length > 0, "a collect-input action must name at least one input");
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
    const result = driveOnboardingInit({ rootDir: root });
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

test("driveOnboardingInit: is re-entrant -- a second run continues from the checkpoint instead of restarting or double-applying", () => {
  const root = freshRoot();
  try {
    const first = driveOnboardingInit({ rootDir: root });
    assert.equal(first.outcome, "collect-input");
    const firstAsk = (first.collectInput.inputs ?? [first.collectInput.input]).map((input) => input.name).sort();

    // Simulate the human answering, OUTSIDE this driver, exactly once -- the same
    // intake-consent-apply call the first run's own guidance names, with concrete answers
    // this test supplies (never the driver).
    const answered = spawnSync("node", [
      ONBOARDING_SCRIPT_PATH,
      "intake-consent-apply",
      "--root", root,
      "--git-author-name", "Onboarding Init Test",
      "--git-author-email", "onboarding-init-test@example.invalid",
      "--language", "en",
      "--profile", "mini",
      "--granted",
      "--activate",
    ], { encoding: "utf8", shell: false });
    assert.equal(answered.status, 0, answered.stderr);

    const second = driveOnboardingInit({ rootDir: root });
    // Re-running must not repeat the already-answered consent question: whatever it stops
    // on next must be a DIFFERENT ask than the first run's.
    const secondAsk = second.outcome === "collect-input"
      ? (second.collectInput.inputs ?? [second.collectInput.input]).map((input) => input.name).sort()
      : null;
    assert.notDeepEqual(secondAsk, firstAsk, "must have progressed past the already-answered consent question");
    // No double-apply: the second run must not re-run intake-consent-apply itself -- it
    // already resolved that from the disk state the spawned call above wrote.
    const secondSubcommands = second.steps.map((step) => step.argv[1]);
    assert.equal(secondSubcommands.filter((name) => name === "intake-consent-apply").length, 0);
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

test("DEFAULT_STEP_CAP is a small, positive constant", () => {
  assert.ok(Number.isInteger(DEFAULT_STEP_CAP));
  assert.ok(DEFAULT_STEP_CAP > 0);
  assert.ok(DEFAULT_STEP_CAP < 1000, "the cap must be a small constant, not effectively unbounded");
});

#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  PROJECT_ONBOARDING_READY_GATE_SCHEMA,
  ProjectOnboardingReadyError,
  requireProjectOnboardingReady,
} from "./project-onboarding-ready-gate.mjs";

function root() { return mkdtempSync(join(tmpdir(), "project-ready-gate-")); }

function readyResult(rootDir, intent, runner = "codex") {
  return {
    schema: "pipeline.project-onboarding.v4",
    status: "ready",
    root: realpathSync(rootDir),
    runner,
    intent,
    repository: {},
    runtime: {},
    continuity: {},
    appServer: {},
    nextAction: null,
    diagnostics: [],
  };
}

function withClaudecode(value, run) {
  const had = Object.prototype.hasOwnProperty.call(process.env, "CLAUDECODE");
  const previous = process.env.CLAUDECODE;
  try {
    if (value === undefined) delete process.env.CLAUDECODE;
    else process.env.CLAUDECODE = value;
    run();
  } finally {
    if (had) process.env.CLAUDECODE = previous;
    else delete process.env.CLAUDECODE;
  }
}

test("exact V4 ready is bound to the requested intent and returns one sanitized receipt", () => {
  const path = root();
  const calls = [];
  try {
    const result = requireProjectOnboardingReady({
      rootDir: path,
      intent: "dispatch",
      runner: "codex",
      inspect(options) {
        calls.push(options);
        return readyResult(path, "dispatch");
      },
    });
    assert.deepEqual(calls, [{ rootDir: path, intent: "dispatch", runner: "codex" }]);
    assert.deepEqual(result, {
      schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
      status: "ready",
      intent: "dispatch",
    });
    assert.equal(JSON.stringify(result).includes(path), false);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("an absent runner resolves from process.env.CLAUDECODE, not inspectProjectOnboardingV3's own Codex default", () => {
  const path = root();
  try {
    withClaudecode("1", () => {
      let seenRunner = null;
      const result = requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        inspect(options) {
          seenRunner = options.runner;
          return readyResult(path, "dispatch", "claude");
        },
      });
      assert.equal(seenRunner, "claude");
      assert.equal(result.status, "ready");
    });

    withClaudecode(undefined, () => {
      let seenRunner = null;
      requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        inspect(options) {
          seenRunner = options.runner;
          return readyResult(path, "dispatch", "codex");
        },
      });
      assert.equal(seenRunner, "codex");
    });

    withClaudecode("0", () => {
      let seenRunner = null;
      requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        inspect(options) {
          seenRunner = options.runner;
          return readyResult(path, "dispatch", "codex");
        },
      });
      assert.equal(seenRunner, "codex");
    });

    // An explicit `runner` argument still wins over the env-derived default,
    // even inside a session where CLAUDECODE=1 would otherwise resolve "claude".
    withClaudecode("1", () => {
      let seenRunner = null;
      requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner: "codex",
        inspect(options) {
          seenRunner = options.runner;
          return readyResult(path, "dispatch", "codex");
        },
      });
      assert.equal(seenRunner, "codex");
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("every controlling non-ready lifecycle status is preserved and denied without forwarding diagnostics", () => {
  const path = root();
  try {
    assert.equal(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.length, 27);
    for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "session",
        inspect: () => ({
          ...readyResult(path, "session"),
          status,
          diagnostics: [{ message: "private/raw/diagnostic" }],
        }),
      }), (error) => {
        assert(error instanceof ProjectOnboardingReadyError);
        assert.equal(error.code, "PORG-NOT-READY");
        assert.equal(error.intent, "session");
        assert.equal(error.lifecycleStatus, status);
        assert.equal(error.message.includes("private/raw/diagnostic"), false);
        assert.equal(error.message.includes(path), false);
        return true;
      });
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("exceptions, malformed envelopes, intent/root mismatch, and false-ready actions fail closed", () => {
  const path = root();
  const malformed = [
    null,
    {},
    { ...readyResult(path, "dispatch"), schema: "pipeline.project-onboarding.v3" },
    readyResult(path, "session"),
    { ...readyResult(path, "dispatch"), root: `${path}-other` },
    { ...readyResult(path, "dispatch"), runner: null },
    { ...readyResult(path, "dispatch"), nextAction: { kind: "command" } },
    { ...readyResult(path, "dispatch"), diagnostics: [{ code: "false-ready" }] },
    { ...readyResult(path, "dispatch"), status: "future-unknown-status" },
  ];
  try {
    for (const value of malformed) {
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        inspect: () => value,
      }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    }
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "dispatch",
      inspect: () => { throw new Error("secret absolute path /private/repo"); },
    }), (error) => {
      assert(error instanceof ProjectOnboardingReadyError);
      assert.equal(error.code, "PORG-OBSERVATION-UNAVAILABLE");
      assert.equal(error.message.includes("secret"), false);
      assert.equal(error.message.includes("/private/repo"), false);
      return true;
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("unsupported or missing intents are rejected before inspection", () => {
  for (const intent of [undefined, "", "generic", "Dispatch"]) {
    let calls = 0;
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: "/unused",
      intent,
      inspect() { calls += 1; },
    }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INTENT");
    assert.equal(calls, 0);
  }
});

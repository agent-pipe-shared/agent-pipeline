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

function readyResult(rootDir, intent) {
  return {
    schema: "pipeline.project-onboarding.v4",
    status: "ready",
    root: realpathSync(rootDir),
    runner: "codex",
    intent,
    repository: {},
    runtime: {},
    continuity: {},
    appServer: {},
    nextAction: null,
    diagnostics: [],
  };
}

test("exact V4 ready is bound to the requested intent and returns one sanitized receipt", () => {
  const path = root();
  const calls = [];
  try {
    const result = requireProjectOnboardingReady({
      rootDir: path,
      intent: "dispatch",
      inspect(options) {
        calls.push(options);
        return readyResult(path, "dispatch");
      },
    });
    assert.deepEqual(calls, [{ rootDir: path, intent: "dispatch" }]);
    assert.deepEqual(result, {
      schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
      status: "ready",
      intent: "dispatch",
    });
    assert.equal(JSON.stringify(result).includes(path), false);
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

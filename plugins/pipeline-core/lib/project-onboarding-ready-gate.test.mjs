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
import {
  inspectProjectOnboardingV3,
  PROJECT_ONBOARDING_BASE_RESULT_KEYS,
  PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS,
} from "./project-onboarding-v3.mjs";

function root() { return mkdtempSync(join(tmpdir(), "project-ready-gate-")); }

// pipeline.ready-gate-keys-derived-from-producer: this file's own fixture-shape stub used to
// hand-type the eleven base field names independently of both the gate's own hand-typed list
// AND the producer's actual construction site -- the "third copy" that let this suite stay
// green while the real producer shape drifted underneath it (backlog:
// pipeline.ready-gate-hand-maintained-shape-mirror, "Predicate note, 2026-08-29"). Iterating
// PROJECT_ONBOARDING_BASE_RESULT_KEYS (imported from the producer, same as the gate itself
// now imports) instead means: a key REMOVED from the producer's shape is simply no longer
// requested here (still correct); a key ADDED to the producer's shape has no entry in
// FIELD_PLACEHOLDER below and throws immediately, loudly, right here in this test file,
// rather than silently building an incomplete stub that happens to still satisfy a
// same-vintage gate list.
function fieldPlaceholder(key, rootDir, intent, runner) {
  switch (key) {
    case "schema": return "pipeline.project-onboarding.v4";
    case "status": return "ready";
    case "root": return realpathSync(rootDir);
    case "runner": return runner;
    case "intent": return intent;
    case "repository": return {};
    case "runtime": return {};
    case "continuity": return {};
    case "appServer": return {};
    case "nextAction": return null;
    case "diagnostics": return [];
    default:
      throw new Error(
        `project-onboarding-ready-gate.test.mjs's readyResult() has no placeholder value wired `
        + `for producer-derived base key "${key}" -- the producer's shape changed; wire a value `
        + "here, do not guess.",
      );
  }
}

function readyResult(rootDir, intent, runner = "codex") {
  const result = {};
  for (const key of PROJECT_ONBOARDING_BASE_RESULT_KEYS) {
    result[key] = fieldPlaceholder(key, rootDir, intent, runner);
  }
  return result;
}

// NVA-T-READYKEYS: a real ready V4 observation carries two more fields than the base
// eleven -- project-onboarding-v3.mjs attaches pushApprovalMode/trustAnchorAvailability
// only to a `status: "ready"` result. readyResult() above stays the base shape (reused by
// the non-ready-status tests, where those two fields must NOT be present); this is the
// wider ready shape a real inspection actually returns, built the same derived way: any
// PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS name without a placeholder below throws.
function readyResultWithPushApprovalKeys(rootDir, intent, runner = "codex") {
  const result = readyResult(rootDir, intent, runner);
  for (const key of PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS) {
    if (key === "pushApprovalMode") { result[key] = "signature"; continue; }
    if (key === "trustAnchorAvailability") { result[key] = "present"; continue; }
    throw new Error(
      `project-onboarding-ready-gate.test.mjs's readyResultWithPushApprovalKeys() has no `
      + `placeholder value wired for producer-derived ready-only key "${key}".`,
    );
  }
  return result;
}

function implementationHandoverAction() {
  return {
    kind: "command",
    executable: "node",
    argv: ["/plugin/pipeline-state.mjs", "set-phase", "--phase", "implementation"],
    mutation: true,
    requiresConfirmation: true,
    expected: { schema: "pipeline.project-onboarding.v4", statuses: ["ready"] },
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
        return readyResultWithPushApprovalKeys(path, "dispatch");
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

test("the gate never reads process.env; a missing runner fails closed as PORG-RUNNER even with CLAUDECODE=1 set (regression pin for ready-gate-env-var-runner-authority)", () => {
  const path = root();
  try {
    withClaudecode("1", () => {
      let calls = 0;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        inspect() { calls += 1; return readyResult(path, "dispatch", "claude"); },
      }), (error) => {
        assert(error instanceof ProjectOnboardingReadyError);
        assert.equal(error.code, "PORG-RUNNER");
        assert.equal(error.intent, "dispatch");
        return true;
      });
      assert.equal(calls, 0);
    });

    withClaudecode(undefined, () => {
      let calls = 0;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        inspect() { calls += 1; },
      }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-RUNNER");
      assert.equal(calls, 0);
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("an unknown or malformed runner string fails closed as PORG-RUNNER", () => {
  const path = root();
  try {
    for (const runner of [null, "", "Codex", "CLAUDE", "claude ", "windows", "claudecode", 42, {}, []]) {
      let calls = 0;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner,
        inspect() { calls += 1; },
      }), (error) => {
        assert(error instanceof ProjectOnboardingReadyError);
        assert.equal(error.code, "PORG-RUNNER");
        assert.equal(error.intent, "dispatch");
        return true;
      });
      assert.equal(calls, 0);
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("the gate accepts \"claude\" and \"codex\" explicitly and threads the exact caller-supplied value to inspection", () => {
  const path = root();
  try {
    for (const runner of ["claude", "codex"]) {
      let seenRunner = null;
      const result = requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner,
        inspect(options) {
          seenRunner = options.runner;
          return readyResultWithPushApprovalKeys(path, "dispatch", runner);
        },
      });
      assert.equal(seenRunner, runner);
      assert.equal(result.status, "ready");
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-T-READYKEYS DoD 1: this is the shape a real ready inspection produces (thirteen keys,
// including pushApprovalMode and trustAnchorAvailability). Before the fix, RESULT_KEYS
// listed exactly the eleven base names, so exactKeys() rejected precisely this shape --
// the only case the gate should otherwise pass -- as PORG-INVALID-OBSERVATION. This test
// fails before the fix and must pass after it.
test("a real V4 ready observation carrying pushApprovalMode/trustAnchorAvailability (thirteen keys) is accepted", () => {
  const path = root();
  try {
    const result = requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "codex",
      inspect: () => readyResultWithPushApprovalKeys(path, "session"),
    });
    assert.deepEqual(result, {
      schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
      status: "ready",
      intent: "session",
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("a ready observation may carry the producer's helpful design-to-implementation handover without becoming PORG-INVALID-OBSERVATION", () => {
  const path = root();
  try {
    const observed = readyResultWithPushApprovalKeys(path, "session");
    observed.nextAction = implementationHandoverAction();
    const result = requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "codex",
      inspect: () => observed,
    });
    assert.deepEqual(result, {
      schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
      status: "ready",
      intent: "session",
    });
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("the ready handover exception remains closed to arbitrary or malformed actions", () => {
  const path = root();
  try {
    const valid = implementationHandoverAction();
    const invalidActions = [
      { ...valid, argv: ["/plugin/not-pipeline-state.mjs", ...valid.argv.slice(1)] },
      { ...valid, argv: [valid.argv[0], "set-phase", "--phase", "design"] },
      { ...valid, mutation: false },
      { ...valid, requiresConfirmation: false },
      { ...valid, unexpected: true },
      { ...valid, expected: { schema: valid.expected.schema, statuses: ["ready", "partial"] } },
    ];
    for (const nextAction of invalidActions) {
      const observed = readyResultWithPushApprovalKeys(path, "dispatch");
      observed.nextAction = nextAction;
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "dispatch",
        runner: "codex",
        inspect: () => observed,
      }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    }
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-T-READYKEYS DoD 2: a genuinely unexpected extra key beyond the thirteen still fails
// closed -- proving the fix is a second, ready-only key LIST, never a switch to a subset
// check. exactKeys() stays exact either way.
test("a ready observation with an unexpected extra key beyond the thirteen is still rejected (not a subset check)", () => {
  const path = root();
  try {
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "codex",
      inspect: () => ({ ...readyResultWithPushApprovalKeys(path, "session"), somethingUnexpected: true }),
    }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

// NVA-T-READYKEYS DoD 3: the two ready-only fields showing up on a NON-ready observation
// must still fail closed -- the accepted shape is status-specific, not "eleven keys plus
// optionally two more no matter what status says".
test("a non-ready observation carrying the two ready-only fields is rejected (the shape stays status-specific)", () => {
  const path = root();
  try {
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "session",
      runner: "codex",
      inspect: () => ({ ...readyResultWithPushApprovalKeys(path, "session"), status: "restart-required" }),
    }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test("every controlling non-ready lifecycle status is preserved and denied without forwarding diagnostics", () => {
  const path = root();
  try {
    assert.equal(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.length, 30);
    for (const status of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "session",
        runner: "codex",
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

// NVA-BL-INTAKEBIND-1 (AC-2): the Wave 4 onboarding coordinator's three new
// v4Inspection statuses (design.md SSa.4) must be recognized as controlling
// non-ready statuses -- a repo observed at any of them must fail as
// PORG-NOT-READY with the matching lifecycleStatus, never fall through to the
// fail-closed-on-unknown-status PORG-INVALID-OBSERVATION branch.
test("intake-required, intake-design-questions-required, and bootstrap-binding-required fail closed as PORG-NOT-READY, not PORG-INVALID-OBSERVATION", () => {
  const path = root();
  try {
    for (const status of ["intake-required", "intake-design-questions-required", "bootstrap-binding-required"]) {
      assert(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.includes(status), status);
      assert.throws(() => requireProjectOnboardingReady({
        rootDir: path,
        intent: "session",
        runner: "codex",
        inspect: () => ({ ...readyResult(path, "session"), status }),
      }), (error) => {
        assert(error instanceof ProjectOnboardingReadyError);
        assert.equal(error.code, "PORG-NOT-READY");
        assert.equal(error.lifecycleStatus, status);
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
        runner: "codex",
        inspect: () => value,
      }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
    }
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "dispatch",
      runner: "codex",
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

// pipeline.ready-gate-keys-derived-from-producer, Direction option 2 fallback (backlog:
// pipeline.ready-gate-hand-maintained-shape-mirror): the accepted STATUS enumeration cannot
// be derived structurally the way the two key lists above now are (see the comment above
// PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES in project-onboarding-ready-gate.mjs for
// the concrete obstacle). This test drives the gate against a REAL, non-stubbed
// inspectProjectOnboardingV3() result instead -- a genuinely fresh, empty temp root, with no
// `inspect` override -- so at least one status is proven end to end against actual producer
// output, not an internally-consistent fixture that only agrees with itself.
test("a real, non-stubbed inspectProjectOnboardingV3() result is driven straight through the gate (Direction option 2 fallback)", () => {
  const path = root();
  try {
    const real = inspectProjectOnboardingV3({ rootDir: path, intent: "onboarding", runner: "codex" });
    // Pinned so this test fails loudly (not silently) if project-onboarding-v3.mjs ever
    // changes what a genuinely fresh, empty root observes -- the exact drift class this
    // item exists to catch, this time on the STATUS axis rather than the key axis.
    assert.equal(real.status, "portable-seed-required");
    assert(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES.includes(real.status), real.status);
    assert.deepEqual(Object.keys(real).sort(), [...PROJECT_ONBOARDING_BASE_RESULT_KEYS].sort());
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "onboarding",
      runner: "codex",
      inspect: () => real,
    }), (error) => {
      assert(error instanceof ProjectOnboardingReadyError);
      assert.equal(error.code, "PORG-NOT-READY");
      assert.equal(error.lifecycleStatus, "portable-seed-required");
      return true;
    });
    // The other half of Direction option 2: a status the gate does not know about -- standing
    // in for "the producer gained a new lifecycle status" -- built from this SAME real
    // observation with only `status` mutated, so every other field stays genuinely
    // producer-shaped rather than hand-typed. Must fail the check, never silently pass or
    // silently block every other write.
    assert.throws(() => requireProjectOnboardingReady({
      rootDir: path,
      intent: "onboarding",
      runner: "codex",
      inspect: () => ({ ...real, status: "a-status-this-gate-has-never-heard-of" }),
    }), (error) => error instanceof ProjectOnboardingReadyError && error.code === "PORG-INVALID-OBSERVATION");
  } finally { rmSync(path, { recursive: true, force: true }); }
});

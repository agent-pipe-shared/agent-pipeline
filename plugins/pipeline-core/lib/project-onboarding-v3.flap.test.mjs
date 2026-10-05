// SPDX-License-Identifier: SUL-1.0
// FLAP2: the cleanup-recovery observation behind session readiness is retried a bounded number of
// times when it throws a transient descriptor/filesystem error (another session's descriptor being
// created or retired between listing and loading), instead of flapping the whole session to
// `partial` on the first throw. Injected deps only: no real timing, no real descriptors.
import assert from "node:assert/strict";
import test from "node:test";
import { partialCleanupRecoveryResultCore } from "./project-onboarding-v3.mjs";
import { WorktreeLifecycleError } from "./worktree-lifecycle.mjs";

const OBSERVATION_UNAVAILABLE = "cleanup_recovery_observation_unavailable";

function typed(code, message = "descriptor observation failed") {
  return new WorktreeLifecycleError(code, message);
}

function raw(code) {
  return Object.assign(new Error(`raw ${code}`), { code });
}

// `steps` is consumed one entry per planSessionCleanupRecovery call: an Error is thrown, anything
// else is returned. Running past the end of `steps` is a test failure, never a silent reuse.
function observe(steps, { strict = true, intent = "session" } = {}) {
  const sleeps = [];
  let calls = 0;
  const result = partialCleanupRecoveryResultCore({
    root: "flap-root",
    runner: "codex",
    intent,
    repository: {},
    strict,
    deps: {
      planSessionCleanupRecovery() {
        assert.ok(calls < steps.length, `planSessionCleanupRecovery called more than the ${steps.length} scripted times`);
        const step = steps[calls];
        calls += 1;
        if (step instanceof Error) throw step;
        return step;
      },
      applySessionCleanupRecovery() {
        assert.fail("no ready recovery plan is scripted, so apply must never run");
      },
      sleepSync(ms) { sleeps.push(ms); },
    },
  });
  return { result, calls, sleeps };
}

const NOT_NEEDED = Object.freeze({ schema: "pipeline.session-cleanup-recovery-plan.v1", status: "not-needed" });

test("a transient descriptor error followed by success is not a partial", () => {
  const { result, calls, sleeps } = observe([typed("WT-SESSION-DESCRIPTOR", "session descriptor is malformed"), NOT_NEEDED]);
  assert.equal(result, null);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [50]);
});

test("a descriptor retired between listing and loading (WT-SESSION-MISSING) is retried until it converges", () => {
  const { result, calls, sleeps } = observe([typed("WT-SESSION-MISSING"), typed("WT-SESSION-DESCRIPTOR"), NOT_NEEDED]);
  assert.equal(result, null);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [50, 100]);
});

for (const code of ["EBUSY", "EPERM", "EACCES", "ENOENT", "EAGAIN"]) {
  test(`a raw ${code} error followed by success is not a partial`, () => {
    const { result, calls, sleeps } = observe([raw(code), NOT_NEEDED]);
    assert.equal(result, null);
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [50]);
  });
}

test("a persistent transient error exhausts exactly three attempts and stays the strict partial, naming its cause", () => {
  const { result, calls, sleeps } = observe([
    typed("WT-SESSION-DESCRIPTOR"), typed("WT-SESSION-DESCRIPTOR"), typed("WT-SESSION-DESCRIPTOR"),
  ]);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [50, 100]);
  assert.equal(result.status, "partial");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, OBSERVATION_UNAVAILABLE);
  assert.equal(result.diagnostics[0].path, "$.authority.sessionCleanup");
  assert.equal(
    result.diagnostics[0].message,
    "cleanup recovery authority could not be observed safely (cause: WT-SESSION-DESCRIPTOR)",
  );
  assert.equal(result.nextAction.argv[1], "plan-human-recovery");
});

test("a persistent raw EBUSY exhausts the budget and reports the raw code as its cause", () => {
  const { result, calls } = observe([raw("EBUSY"), raw("EBUSY"), raw("EBUSY")]);
  assert.equal(calls, 3);
  assert.equal(result.status, "partial");
  assert.equal(result.diagnostics[0].code, OBSERVATION_UNAVAILABLE);
  assert.match(result.diagnostics[0].message, / \(cause: EBUSY\)$/u);
});

test("a typed error outside the transient set is not retried and stays the strict partial", () => {
  const { result, calls, sleeps } = observe([typed("WT-SESSION-OWNER-UNOBSERVABLE")]);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(result.status, "partial");
  assert.equal(result.diagnostics[0].code, OBSERVATION_UNAVAILABLE);
  assert.match(result.diagnostics[0].message, / \(cause: WT-SESSION-OWNER-UNOBSERVABLE\)$/u);
});

test("a plain Error is not retried and stays the strict partial, naming its error name", () => {
  const { result, calls, sleeps } = observe([new Error("private cleanup state unreadable")]);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(result.status, "partial");
  assert.equal(result.diagnostics[0].code, OBSERVATION_UNAVAILABLE);
  assert.match(result.diagnostics[0].message, / \(cause: Error\)$/u);
});

test("only the error's own code is retried; a transient code that sits only on its cause is not", () => {
  const wrapped = Object.assign(new Error("wrapped"), { cause: { code: "EBUSY" } });
  const { result, calls } = observe([wrapped]);
  assert.equal(calls, 1);
  assert.equal(result.status, "partial");
  assert.match(result.diagnostics[0].message, / \(cause: EBUSY\)$/u);
});

test("a transient error followed by a cleanup-required plan still blocks exactly as it does today", () => {
  const cleanupRequired = { schema: "pipeline.session-cleanup-recovery-plan.v1", status: "cleanup-required" };
  const { result, calls, sleeps } = observe([typed("WT-SESSION-DESCRIPTOR"), cleanupRequired]);
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [50]);
  assert.equal(result.status, "partial");
  assert.equal(result.diagnostics[0].code, "cleanup_recovery_required");
  assert.equal(result.nextAction.argv[1], "plan-human-recovery");
});

test("outside strict mode a persistent transient error still infers no cleanup authority (null)", () => {
  const { result, calls, sleeps } = observe([
    typed("WT-SESSION-DESCRIPTOR"), typed("WT-SESSION-DESCRIPTOR"), typed("WT-SESSION-DESCRIPTOR"),
  ], { strict: false });
  assert.equal(result, null);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [50, 100]);
});

test("an apply failure after a successful re-observation is never retried", () => {
  const ready = { schema: "pipeline.session-cleanup-recovery-plan.v1", status: "ready", planSha256: "0".repeat(64) };
  let applies = 0;
  const sleeps = [];
  const result = partialCleanupRecoveryResultCore({
    root: "flap-root", runner: "codex", intent: "session", repository: {}, strict: true,
    deps: {
      planSessionCleanupRecovery: () => ready,
      applySessionCleanupRecovery() { applies += 1; throw raw("EBUSY"); },
      sleepSync(ms) { sleeps.push(ms); },
    },
  });
  assert.equal(applies, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(result.status, "partial");
  assert.equal(result.diagnostics[0].code, "cleanup_recovery_apply_failed");
});

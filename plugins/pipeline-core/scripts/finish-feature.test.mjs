// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { finishFeature } from "./finish-feature.mjs";

function response(value) { return { status: 0, stdout: JSON.stringify(value), stderr: "" }; }
function closeAction(criticVerifyLifecycle) {
  return { executable: process.execPath, argv: [new URL("./pipeline-state.mjs", import.meta.url).pathname,
    "close-feature", "--by", "PO", "--architecture-impact", "no-architecture-impact",
    "--coordinator-lifecycle", "feature-abc", "--coordinator-sha256", "a".repeat(64),
    "--critic-verify-lifecycle", criticVerifyLifecycle] };
}
function fixture() {
  const criticVerifyLifecycle = "b".repeat(64);
  const calls = [];
  let phase = 0;
  const runner = (executable, argv) => {
    calls.push([executable, argv]);
    if (argv[0].endsWith("pipeline-state.mjs")) return { status: 0, stdout: "Feature closed", stderr: "" };
    const sub = argv[1];
    if (sub.startsWith("plan-")) {
      phase += 1;
      const planSha256 = `${phase}`.padEnd(64, "a");
      return response({ planSha256, nextAction: { executable: process.execPath, argv: [new URL("./close-coordinator.mjs", import.meta.url).pathname, sub.replace("plan-", "apply-"), ...argv.slice(2), "--plan-sha256", planSha256, "--activate"] } });
    }
    if (sub.startsWith("apply-")) {
      const prepared = sub === "apply-transition" && argv.includes("feature-close-prepared");
      return response({ status: "applied", ...(prepared ? { stateSha256: "a".repeat(64), nextAction: closeAction(criticVerifyLifecycle) } : {}) });
    }
    throw new Error(`unexpected ${sub}`);
  };
  return { calls, runner, criticVerifyLifecycle };
}
test("one-shot driver CAS-plans every close transition then invokes only the bound State action", () => {
  const f = fixture();
  const result = finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle, lifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: f.runner,
  });
  assert.equal(result.status, "closed");
  assert.equal(f.calls.length, 7);
  assert.deepEqual(f.calls.slice(0, 6).map(([, argv]) => argv[1]), ["plan-start", "apply-start", "plan-transition", "apply-transition", "plan-transition", "apply-transition"]);
  for (const [, argv] of f.calls.filter(([, argv]) => argv[1]?.startsWith("apply-"))) {
    assert.equal(argv.at(-1), "--activate", "the coordinator accepts a bare boolean flag, not --activate true");
  }
  assert.equal(f.calls[4][1].at(f.calls[4][1].indexOf("--critic-verify-lifecycle") + 1), f.criticVerifyLifecycle);
  assert.equal(f.calls.at(-1)[1][1], "close-feature");
});

test("resume from a checkpoint reuses the same lifecycle without repeating start or checkpoint effects", () => {
  const f = fixture();
  const runner = (executable, argv) => argv[1] === "inspect"
    ? response({ identity: { lifecycleId: "feature-abc", featureId: "feature-abc" }, coordinator: { phase: "checkpointed" } })
    : f.runner(executable, argv);
  const result = finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle, resumeLifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: runner,
  });
  assert.equal(result.lifecycleId, "feature-abc");
  assert.deepEqual(f.calls.map(([, argv]) => argv[1]), ["plan-transition", "apply-transition", "close-feature"]);
});

test("resume of a prepared close uses only its recorded operation digest and one State action", () => {
  const f = fixture();
  const digest = "d".repeat(64);
  const calls = [];
  const runner = (executable, argv) => {
    calls.push(argv);
    if (argv[1] === "inspect") return response({ identity: { lifecycleId: "feature-abc", featureId: "feature-abc" }, coordinator: { phase: "feature-close-prepared", architectureImpact: "no-architecture-impact", featureCloseAudit: { criticVerifyLifecycleId: f.criticVerifyLifecycle }, effects: [{ operationSha256: digest }] } });
    if (argv[1] === "apply-transition") return response({ status: "replayed", stateSha256: "a".repeat(64), nextAction: closeAction(f.criticVerifyLifecycle) });
    if (argv[1] === "close-feature") return { status: 0, stdout: "Feature closed", stderr: "" };
    throw new Error(`unexpected ${argv[1]}`);
  };
  const result = finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle, resumeLifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: runner,
  });
  assert.equal(result.status, "closed");
  assert.deepEqual(calls.map(argv => argv[1]), ["inspect", "apply-transition", "close-feature"]);
  assert.equal(calls[1].at(calls[1].indexOf("--plan-sha256") + 1), digest);
  assert.equal(calls[1].at(-1), "--activate");
});

test("resume rejects a different feature or changed close binding before mutation", () => {
  const f = fixture();
  const calls = [];
  const runner = (_executable, argv) => {
    calls.push(argv);
    return response({ identity: { lifecycleId: "feature-abc", featureId: "another-feature" }, coordinator: { phase: "checkpointed" } });
  };
  assert.throws(() => finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle, resumeLifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: runner,
  }), error => error.code === "FINISH-RESUME-STATE");
  assert.deepEqual(calls.map(argv => argv[1]), ["inspect"]);
});

test("prepared resume refuses a changed architecture disposition or Critic/Verify receipt", () => {
  const f = fixture();
  const calls = [];
  const runner = (_executable, argv) => {
    calls.push(argv);
    return response({ identity: { lifecycleId: "feature-abc", featureId: "feature-abc" },
      coordinator: { phase: "feature-close-prepared", architectureImpact: "architecture-conforms",
        featureCloseAudit: { criticVerifyLifecycleId: f.criticVerifyLifecycle },
        effects: [{ operationSha256: "d".repeat(64) }] } });
  };
  assert.throws(() => finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact",
    auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle,
    resumeLifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: runner,
  }), error => error.code === "FINISH-RESUME-BINDING");
  assert.deepEqual(calls.map(argv => argv[1]), ["inspect"]);
});

test("a plan without the exact coordinator apply argv cannot trigger any apply or State action", () => {
  const f = fixture();
  const runner = (executable, argv) => {
    const reply = f.runner(executable, argv);
    if (argv[1] === "plan-start") {
      const plan = JSON.parse(reply.stdout);
      plan.nextAction.argv.push("true");
      return response(plan);
    }
    return reply;
  };
  assert.throws(() => finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle, lifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: runner,
  }), error => error.code === "FINISH-PLAN-ACTION" && error.lifecycleId === "feature-abc");
  assert.deepEqual(f.calls.map(([, argv]) => argv[1]), ["plan-start"]);
});

test("a denied final State write reports the resumable lifecycle without claiming closed", () => {
  const f = fixture();
  const runner = (executable, argv) => argv[1] === "close-feature"
    ? { status: 2, stdout: "", stderr: "State denied the close" }
    : f.runner(executable, argv);
  assert.throws(() => finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact",
    auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle,
    lifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: runner,
  }), error => error.code === "FINISH-CLOSE" && error.lifecycleId === "feature-abc");
  assert.equal(f.calls.filter(([, argv]) => argv[1] === "apply-transition").length, 2);
});
test("unsafe request paths and unbound final actions fail before State close", () => {
  assert.throws(() => finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "../escape", criticVerifyLifecycle: "b".repeat(64) }, {
    realpathSyncFn: value => value,
  }), error => error.code === "FINISH-AUDIT-REQUEST");
  const f = fixture();
  const broken = (executable, argv) => {
    const reply = f.runner(executable, argv);
    if (argv[1] === "apply-transition" && argv.includes("feature-close-prepared")) return response({ status: "applied", nextAction: { executable: process.execPath, argv: ["untrusted", "close-feature"] } });
    return reply;
  };
  assert.throws(() => finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle, lifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: broken,
  }), error => error.code === "FINISH-CLOSE-ACTION");
});
test("a missing or substituted Critic/Verify lifecycle ID never reaches the coordinator", () => {
  const f = fixture();
  assert.throws(() => finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "specs/feature/audit-request.json", lifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: f.runner,
  }), error => error.code === "FINISH-CRITIC-VERIFY");
  assert.equal(f.calls.length, 0);
});

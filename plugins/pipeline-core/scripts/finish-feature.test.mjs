// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { finishFeature } from "./finish-feature.mjs";

function response(value) { return { status: 0, stdout: JSON.stringify(value), stderr: "" }; }
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
      return response({ planSha256: `${phase}`.padEnd(64, "a"), nextAction: { argv: ["ignored", sub.replace("plan-", "apply-")] } });
    }
    if (sub.startsWith("apply-")) {
      const prepared = sub === "apply-transition" && argv.includes("feature-close-prepared");
      return response({ status: "applied", ...(prepared ? { nextAction: { executable: process.execPath, argv: [new URL("./pipeline-state.mjs", import.meta.url).pathname, "close-feature", "--coordinator-lifecycle", "feature-abc", "--coordinator-sha256", "a".repeat(64), "--critic-verify-lifecycle", criticVerifyLifecycle] } } : {}) });
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
  assert.equal(f.calls[4][1].at(f.calls[4][1].indexOf("--critic-verify-lifecycle") + 1), f.criticVerifyLifecycle);
  assert.equal(f.calls.at(-1)[1][1], "close-feature");
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

// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { finishFeature, oneShotClose } from "./finish-feature.mjs";

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

test("a lost close response resumes from the durable closed State without a second mutation", () => {
  const f = fixture();
  const auditReceiptSha256 = "c".repeat(64);
  const prior = { identity: { lifecycleId: "feature-abc", featureId: "feature-abc" },
    stateSha256: "a".repeat(64), coordinator: { phase: "feature-close-prepared", revision: 3,
      architectureImpact: "no-architecture-impact", featureCloseAudit: {
        auditReceiptSha256, criticVerifyLifecycleId: f.criticVerifyLifecycle,
      } } };
  const state = { closedFeatures: [{ id: "feature-abc", closedBy: "PO",
    architectureImpact: "no-architecture-impact", coordinatorClose: {
      lifecycleId: "feature-abc", stateSha256: prior.stateSha256,
      revision: 3, phase: "feature-close-prepared",
    }, auditReference: { auditReceiptSha256, criticVerifyLifecycleId: f.criticVerifyLifecycle } }] };
  const calls = [];
  const runner = (_executable, argv) => { calls.push(argv); return response(prior); };
  const input = { rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact",
    auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle,
    resumeLifecycleId: "feature-abc" };
  const deps = { realpathSyncFn: value => value, readFileSyncFn: () => JSON.stringify(state), runCommand: runner };
  const result = finishFeature(input, deps);
  assert.equal(result.status, "closed");
  assert.equal(result.closeOutput, "already-closed");
  assert.deepEqual(calls.map(argv => argv[1]), ["inspect"]);
  assert.equal(finishFeature(input, deps).closeOutput, "already-closed");
  assert.deepEqual(calls.map(argv => argv[1]), ["inspect", "inspect"]);
  assert.throws(() => finishFeature({ ...input, resumeLifecycleId: null }, deps),
    error => error.code === "FINISH-FEATURE");
  assert.deepEqual(calls.map(argv => argv[1]), ["inspect", "inspect"]);
});

test("closed-State recovery rejects a mismatched actor, audit, or coordinator without State writes", () => {
  const criticVerifyLifecycle = "b".repeat(64);
  const auditReceiptSha256 = "c".repeat(64);
  const prior = { identity: { lifecycleId: "feature-abc", featureId: "feature-abc" },
    stateSha256: "a".repeat(64), coordinator: { phase: "feature-close-prepared", revision: 3,
      architectureImpact: "no-architecture-impact", featureCloseAudit: {
        auditReceiptSha256, criticVerifyLifecycleId: criticVerifyLifecycle,
      } } };
  const closed = { id: "feature-abc", closedBy: "PO", architectureImpact: "no-architecture-impact",
    coordinatorClose: { lifecycleId: "feature-abc", stateSha256: prior.stateSha256,
      revision: 3, phase: "feature-close-prepared" },
    auditReference: { auditReceiptSha256, criticVerifyLifecycleId: criticVerifyLifecycle } };
  const calls = [];
  const runner = (_executable, argv) => { calls.push(argv); return response(prior); };
  const input = { rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact",
    auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle,
    resumeLifecycleId: "feature-abc" };
  for (const changed of [
    { input: { ...input, by: "Another" }, closed },
    { input, closed: { ...closed, auditReference: { ...closed.auditReference, auditReceiptSha256: "d".repeat(64) } } },
    { input, closed: { ...closed, coordinatorClose: { ...closed.coordinatorClose, revision: 2 } } },
  ]) {
    assert.throws(() => finishFeature(changed.input, { realpathSyncFn: value => value,
      readFileSyncFn: () => JSON.stringify({ closedFeatures: [changed.closed] }), runCommand: runner }),
    error => error.code === "FINISH-RESUME-CLOSED-MISMATCH" && error.lifecycleId === "feature-abc");
  }
  assert.deepEqual(calls.map(argv => argv[1]), ["inspect", "inspect", "inspect"]);
});

// ---- P3 (C20D-P3-ONE-SHOT-CLOSE, AC-108): feature close is one agent command up to the commit, then one more call to closed-local ----
const sha256Of = (value) => createHash("sha256").update(value).digest("hex");
const STATE_PATH = ".claude/pipeline-state.json";
const COORD = new URL("./close-coordinator.mjs", import.meta.url).pathname;
const STATE_WRITER = new URL("./pipeline-state.mjs", import.meta.url).pathname;
function oneShotFixture({ continuity = false, verifyRed = false, securityBlocking = false, packetOnDisk = true, startPhase = null, closed = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "one-shot-close-")));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(root, ".claude")); mkdirSync(join(root, "specs/feature-abc/evidence"), { recursive: true });
  writeFileSync(join(root, "specs/feature-abc/result.md"), "# Result\n");
  const resultSha = sha256Of("# Result\n");
  const stateValue = (nextAction) => ({ schema: "pipeline.state.v0", activeFeature: { id: "feature-abc" },
    ...(continuity ? { continuity: { revision: 3, queueHead: { nextAction }, authority: { result: { path: "specs/feature-abc/result.md", sha256: resultSha } } } } : {}) });
  const writeState = (value) => writeFileSync(join(root, STATE_PATH), `${JSON.stringify(value)}\n`);
  writeState(closed ? { schema: "pipeline.state.v0", closedFeatures: [{ id: "feature-abc" }] } : stateValue("review"));
  git("add", "-A"); git("commit", "-q", "-m", "baseline");
  const packetId = "a".repeat(32); const lifecycleId = "c".repeat(64);
  if (packetOnDisk) mkdirSync(join(root, ".git/agent-pipeline/critic-packets", packetId), { recursive: true });
  const calls = []; let phase = startPhase ?? "none";
  const json = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
  const flag = (argv, name) => argv[argv.indexOf(name) + 1];
  const runner = (executable, argv) => {
    if (executable === "git") return spawnSync("git", argv, { cwd: root, encoding: "utf8" });
    const script = argv[0].split("/").at(-1); const sub = argv[1]; calls.push(script === "verify-evidence-producer.mjs" || script === "security-scan.mjs" || script === "register-feature-package.mjs" ? script : `${script.replace(".mjs", "")} ${sub}`);
    if (script === "verify-evidence-producer.mjs") {
      if (verifyRed) return { status: 2, stdout: "", stderr: "verify-evidence-producer: VEP-FAILED: suite red\n" };
      const head = git("rev-parse", "HEAD").trim(); const tree = git("rev-parse", "HEAD^{tree}").trim();
      mkdirSync(dirname(join(root, flag(argv, "--out"))), { recursive: true }); // the real producer creates the output directory
      writeFileSync(join(root, flag(argv, "--out")), `${JSON.stringify({ schema: "pipeline.verify-evidence.v0", mode: flag(argv, "--mode"), exitCode: 0, commit: head, tree, candidate: { commit: head, tree } })}\n`);
      if (argv.includes("--critic-packet-id")) { mkdirSync(join(root, ".git/agent-pipeline/critic-verify-lifecycle"), { recursive: true }); writeFileSync(join(root, `.git/agent-pipeline/critic-verify-lifecycle/${lifecycleId}.json`), JSON.stringify({ critic: { packetId: flag(argv, "--critic-packet-id") } })); }
      return json({ status: "passed" });
    }
    if (script === "security-scan.mjs") { mkdirSync(join(root, "evidence"), { recursive: true }); writeFileSync(join(root, "evidence/security-latest.v2.verdict.json"), "{\"verdict\":{\"blocking\":false}}\n"); return { status: securityBlocking ? 1 : 0, stdout: "scan", stderr: "" }; }
    if (script === "register-feature-package.mjs") return json({ status: "registered" });
    if (script === "pipeline-state.mjs") {
      if (sub === "feature-package-plan") return json({ planSha256: "9".repeat(64) });
      if (sub === "feature-package-apply") return json({ status: "applied" });
      if (sub === "continuity-result-close-plan") return json({ applyAction: { executable: process.execPath, argv: [STATE_WRITER, "continuity-result-close-apply", "--feature-id", "feature-abc"] } });
      if (sub === "continuity-result-close-apply") { writeState(stateValue("close")); return json({ status: "applied" }); }
      if (sub === "close-feature") { writeState({ schema: "pipeline.state.v0", closedFeatures: [{ id: "feature-abc" }] }); return { status: 0, stdout: "Feature \"feature-abc\" closed", stderr: "" }; }
    }
    if (script === "close-coordinator.mjs") {
      if (sub === "inspect") return json({ identity: { lifecycleId: "lc-1", featureId: "feature-abc" }, coordinator: { phase }, evidenceDirectory: join(root, ".git/agent-pipeline/publication-close/lc-1/evidence") });
      if (sub === "drive") { phase = "cleanup-complete"; return json({ status: "applied", phaseAfter: "cleanup-complete" }); }
      if (sub.startsWith("plan-")) { const planSha256 = `${calls.length}`.padEnd(64, "a"); return json({ planSha256, nextAction: { executable: process.execPath, argv: [COORD, sub.replace("plan-", "apply-"), ...argv.slice(2), "--plan-sha256", planSha256, "--activate"] } }); }
      if (sub.startsWith("apply-")) {
        if (sub === "apply-transition") phase = flag(argv, "--phase");
        if (phase === "feature-close-prepared" && sub === "apply-transition") {
          return json({ status: "applied", stateSha256: "a".repeat(64), nextAction: { executable: process.execPath, argv: [STATE_WRITER, "close-feature", "--by", "PO", "--architecture-impact", "no-architecture-impact", "--coordinator-lifecycle", flag(argv, "--lifecycle"), "--coordinator-sha256", "a".repeat(64), "--critic-verify-lifecycle", lifecycleId, ...(argv.includes("--continuity-close-request") ? ["--continuity-close-request", flag(argv, "--continuity-close-request")] : [])] } });
        }
        return json({ status: "applied" });
      }
    }
    throw new Error(`unexpected ${script} ${sub}`);
  };
  return { root, git, calls, runner, resultSha, packetId, lifecycleId, setPhase: (value) => { phase = value; }, input: { rootDir: root, by: "PO", architectureImpact: "no-architecture-impact", criticPacketId: packetId } };
}
const forbidden = (calls) => calls.filter((call) => /approve-push|authorize|sign|push|release/u.test(call));

test("P3: one command takes the active feature from the approved candidate to the printed commit, and signs and pushes nothing", () => {
  const f = oneShotFixture();
  try {
    const result = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(result.status, "commit-required", JSON.stringify(result).slice(0, 400));
    assert.deepEqual(f.calls, ["verify-evidence-producer.mjs", "register-feature-package.mjs", "pipeline-state feature-package-plan", "pipeline-state feature-package-apply", "pipeline-state feature-package-plan", "pipeline-state feature-package-apply",
      "close-coordinator plan-start", "close-coordinator apply-start", "close-coordinator plan-transition", "close-coordinator apply-transition", "close-coordinator plan-transition", "close-coordinator apply-transition", "pipeline-state close-feature",
      // P3: the one-shot reads the coordinator's phase once after the State close (inspect) before it finalizes the tracked effects; the stage order is otherwise as written.
      "close-coordinator inspect", "close-coordinator plan-transition", "close-coordinator apply-transition"]);
    assert.deepEqual(forbidden(f.calls), []);
    const audit = JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/audit-request.json"), "utf8"));
    assert.equal(audit.schema, "pipeline.feature-close-audit-request.v1"); assert.equal(audit.criticVerifyLifecycleId, f.lifecycleId); assert.deepEqual(audit.packs, ["pipeline-core-baseline"]); assert.match(audit.coreVersion, /^\d+\.\d+\.\d+$/u);
    const tracked = JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/tracked-close.json"), "utf8"));
    assert.equal(tracked.schema, "pipeline.close-tracked-effects.v1"); assert.equal(tracked.resultSha256, f.resultSha); assert.equal(tracked.pipelineStateSha256, sha256Of(readFileSync(join(f.root, STATE_PATH))));
    assert.ok(result.commit.paths.includes(STATE_PATH) && result.commit.paths.includes("specs/feature-abc/evidence/audit-request.json") && result.commit.paths.includes("specs/feature-abc/evidence/tracked-close.json"), result.commit.paths.join());
    assert.match(result.commit.steps[0], /^git add -- /u); assert.match(result.commit.steps[1], /chore\(close\): close feature feature-abc/u); /* restated 2026-11-08 (QG-04, candidate 21): the printed -m form could not pass GIT-03, the step is now a message file */ assert.match(result.commit.steps[2], /^git commit -F scratch\/commit-msg\/writer-output\.txt -- /u);
    assert.ok(result.resumeLifecycleId, "the next call resumes this lifecycle"); assert.match(result.next, /--resume-lifecycle-id/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("P3: a feature with Continuity gets its Result close block and close request written by the same command", () => {
  const f = oneShotFixture({ continuity: true });
  try {
    const result = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(result.status, "commit-required", JSON.stringify(result).slice(0, 400));
    assert.ok(f.calls.indexOf("pipeline-state continuity-result-close-plan") > f.calls.indexOf("pipeline-state feature-package-apply"));
    assert.equal(f.calls[f.calls.indexOf("pipeline-state continuity-result-close-plan") + 1], "pipeline-state continuity-result-close-apply");
    const request = JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/close-request.json"), "utf8"));
    assert.deepEqual(request, { schema: "pipeline.continuity-close.v0", featureId: "feature-abc", expectedRevision: 3, result: { path: "specs/feature-abc/result.md", sha256: f.resultSha }, closeEvidence: { path: "specs/feature-abc/evidence/verify-candidate.json", sha256: sha256Of(readFileSync(join(f.root, "specs/feature-abc/evidence/verify-candidate.json"))) } });
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("P3: every stop that needs a human is one typed reason with its exact repair, and nothing later ran", () => {
  const missing = oneShotFixture({ packetOnDisk: false });
  try {
    const stopped = oneShotClose({ ...missing.input, criticPacketId: null }, { runCommand: missing.runner });
    assert.equal(stopped.status, "stopped"); assert.equal(stopped.stop.code, "ONESHOT-CRITIC-PACKET-MISSING"); assert.match(stopped.stop.repair, /--critic-packet-id/u); assert.deepEqual(missing.calls, []);
  } finally { rmSync(missing.root, { recursive: true, force: true }); }
  const red = oneShotFixture({ verifyRed: true });
  try {
    const stopped = oneShotClose(red.input, { runCommand: red.runner });
    assert.equal(stopped.status, "stopped"); assert.equal(stopped.stop.code, "ONESHOT-VERIFY-RED"); assert.match(stopped.stop.repair, /rerun the identical command/u); assert.deepEqual(red.calls, ["verify-evidence-producer.mjs"]);
  } finally { rmSync(red.root, { recursive: true, force: true }); }
  const refused = oneShotFixture();
  try {
    const runner = (executable, argv) => argv[1] === "plan-transition" && argv.includes("feature-close-prepared")
      ? { status: 2, stdout: JSON.stringify({ schema: "pipeline.close-coordinator.error.v1", status: "refused", code: "CLOSE-CRITIC-CALLER-AUTHORED", message: "repair: record the PO acknowledgement with approve-critic-acknowledgement" }), stderr: "" }
      : refused.runner(executable, argv);
    const stopped = oneShotClose(refused.input, { runCommand: runner });
    assert.equal(stopped.status, "stopped"); assert.equal(stopped.stop.code, "CLOSE-CRITIC-CALLER-AUTHORED"); assert.match(stopped.stop.repair, /approve-critic-acknowledgement/u);
    assert.match(stopped.next, /--resume-lifecycle-id /u, "the rerun resumes the started lifecycle and skips the evidence stages");
  } finally { rmSync(refused.root, { recursive: true, force: true }); }
});

test("P3: after the commit the next call continues to closed-local; an uncommitted tree or a blocking scan stops with its repair", () => {
  const f = oneShotFixture({ closed: true, startPhase: "tracked-close-finalized" });
  try {
    writeFileSync(join(f.root, "dirty.txt"), "x\n"); writeFileSync(join(f.root, STATE_PATH), "{\"schema\":\"pipeline.state.v0\",\"closedFeatures\":[{\"id\":\"feature-abc\"},{\"id\":\"x\"}]}\n");
    const pending = oneShotClose({ ...f.input, resumeLifecycleId: "lc-1" }, { runCommand: f.runner });
    assert.equal(pending.status, "stopped"); assert.equal(pending.stop.code, "ONESHOT-COMMIT-PENDING"); assert.match(pending.stop.repair, /git add -- .*pipeline-state\.json/u);
    f.git("checkout", "--", STATE_PATH); rmSync(join(f.root, "dirty.txt"));
    const blocked = oneShotFixture({ closed: true, startPhase: "tracked-close-finalized", securityBlocking: true });
    try {
      const stopped = oneShotClose({ ...blocked.input, resumeLifecycleId: "lc-1" }, { runCommand: blocked.runner });
      assert.equal(stopped.status, "stopped"); assert.equal(stopped.stop.code, "ONESHOT-SECURITY-BLOCKING"); assert.match(stopped.stop.repair, /security-scan\.mjs/u);
    } finally { rmSync(blocked.root, { recursive: true, force: true }); }
    const done = oneShotClose({ ...f.input, resumeLifecycleId: "lc-1" }, { runCommand: f.runner });
    assert.equal(done.status, "closed-local", JSON.stringify(done).slice(0, 400));
    assert.deepEqual(f.calls.slice(f.calls.indexOf("close-coordinator inspect", 1)), ["close-coordinator inspect", "close-coordinator plan-transition", "close-coordinator apply-transition", "verify-evidence-producer.mjs", "security-scan.mjs", "close-coordinator plan-transition", "close-coordinator apply-transition", "close-coordinator drive", "close-coordinator plan-transition", "close-coordinator apply-transition"]);
    assert.deepEqual(forbidden(f.calls), []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("P3: the CLI prints the result JSON on stdout and, for a stop, the typed repair on stderr with exit 2; a bad flag is a usage refusal", () => {
  const f = oneShotFixture({ closed: true });
  try {
    const script = new URL("./finish-feature.mjs", import.meta.url).pathname;
    const stopped = spawnSync(process.execPath, [script, "--one-shot", "--root", f.root, "--by", "PO", "--architecture-impact", "no-architecture-impact"], { encoding: "utf8" });
    assert.equal(stopped.status, 2, stopped.stderr);
    assert.equal(JSON.parse(stopped.stdout).stop.code, "ONESHOT-NO-ACTIVE-FEATURE");
    assert.match(stopped.stderr, /ONESHOT-NO-ACTIVE-FEATURE/u); assert.match(stopped.stderr, /^repair: /mu);
    const usage = spawnSync(process.execPath, [script, "--one-shot", "--root", f.root, "--bogus", "x"], { encoding: "utf8" });
    assert.equal(usage.status, 2); assert.match(usage.stderr, /FINISH-USAGE/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("G20-66: every close stage that writes protected files arms the commit of exactly those bytes, and the result prints the one commit", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const ptp = await import("../lib/protected-test-paths.mjs");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "finish-wc-")));
  try {
    const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    mkdirSync(join(root, ".claude"));
    writeFileSync(join(root, ".claude/guard-config.json"), JSON.stringify({ protectedTestPaths: [{ pattern: "(?:lifecycle|audit|state)-fixture\\.json$", reason: "fixture close outputs", id: "TP-1" }] }));
    for (const name of ["lifecycle", "audit", "state"]) writeFileSync(join(root, `${name}-fixture.json`), "{\"v\":0}\n");
    git("add", "-A"); git("commit", "-q", "-m", "baseline");
    const f = fixture();
    const writes = { "apply-start": "audit", "apply-transition": "lifecycle", "close-feature": "state" };
    let prepared = 0;
    const runner = (executable, argv) => {
      const key = argv[0].endsWith("pipeline-state.mjs") ? "close-feature" : argv[1];
      const target = key === "apply-transition" ? (argv.includes("feature-close-prepared") ? "lifecycle" : null) : writes[key];
      if (target) writeFileSync(join(root, `${target}-fixture.json`), `{"v":"${key}-${prepared += 1}"}\n`);
      return f.runner(executable, argv);
    };
    const result = finishFeature({ rootDir: root, by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle, lifecycleId: "feature-abc" }, {
      readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }), runCommand: runner,
    });
    assert.equal(result.status, "closed");
    assert.equal(result.writerCommit.status, "armed");
    assert.deepEqual(result.writerCommit.paths, ["audit-fixture.json", "lifecycle-fixture.json", "state-fixture.json"]);
    assert.deepEqual(result.writerCommit.stages.map((stage) => [stage.stage, stage.paths]), [["apply-start", ["audit-fixture.json"]], ["apply-prepared", ["lifecycle-fixture.json"]], ["close-feature", ["state-fixture.json"]]]);
    assert.match(result.writerCommit.steps.join("\n"), /git add -- audit-fixture\.json lifecycle-fixture\.json state-fixture\.json/);
    assert.match(result.writerCommit.message, /^chore\(pipeline\): /);
    git("add", "audit-fixture.json", "lifecycle-fixture.json", "state-fixture.json");
    for (const path of result.writerCommit.paths) assert.equal(ptp.writerCommitAdmission(root, path).admitted, true, `${path} is admitted`);
    writeFileSync(join(root, "state-fixture.json"), "{\"v\":\"tampered\"}\n"); git("add", "state-fixture.json");
    const stale = ptp.writerCommitAdmission(root, "state-fixture.json");
    assert.equal(stale.admitted, false); assert.match(stale.stale.rerun, /finish-feature\.mjs/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

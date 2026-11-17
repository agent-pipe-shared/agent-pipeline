// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { createHash, generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { finishFeature, oneShotClose } from "./finish-feature.mjs";
import { canonical } from "../lib/po-approval-proof.mjs";
import { validateFeaturePackage } from "../lib/feature-package-topology.mjs";
import { closeSbom } from "../lib/sbom-close.mjs";
import { applyAcceptanceSection, readAcceptanceRecord, renderAcceptanceSection } from "../lib/close-acceptance-record.mjs";
import { syncPublicCurrentState } from "./pipeline-state.mjs";

function response(value) { return { status: 0, stdout: JSON.stringify(value), stderr: "" }; }
function closeAction(criticVerifyLifecycle) {
  return { executable: process.execPath, argv: [new URL("./pipeline-state.mjs", import.meta.url).pathname,
    "close-feature", "--by", "PO", "--architecture-impact", "no-architecture-impact",
    "--coordinator-lifecycle", "feature-abc", "--coordinator-sha256", "a".repeat(64),
    "--critic-verify-lifecycle", criticVerifyLifecycle] };
}
const POSTIMAGE_PASS = { status: 0, stdout: "{\"schema\":\"pipeline.close-postimage-scan.v1\",\"status\":\"pass\",\"blocking\":false,\"findings\":[]}\n", stderr: "" };
const POSTIMAGE_BLOCK = { status: 2, stdout: "{\"schema\":\"pipeline.close-postimage-scan.v1\",\"status\":\"findings\",\"blocking\":true,\"findings\":[{\"rule\":\"generic-api-key\",\"path\":\"audit-bundles/feature-abc/dispatch-records/briefing-copy.json\",\"line\":7}]}\n", stderr: "" };
function fixture() {
  const criticVerifyLifecycle = "b".repeat(64);
  const calls = [];
  let phase = 0;
  const runner = (executable, argv) => {
    if (argv.includes("--close-postimages")) return POSTIMAGE_PASS; // C29 (C2): the postimage secret check, not part of the call order asserted below
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

test("C29-C2: a blocking secret in the close outputs stops before the State close (point B); the feature stays open and the rerun resumes", () => {
  const f = fixture();
  const runner = (executable, argv) => (argv.includes("--close-postimages") ? POSTIMAGE_BLOCK : f.runner(executable, argv));
  assert.throws(() => finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "no-architecture-impact", auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle, lifecycleId: "feature-abc" }, {
    realpathSyncFn: value => value,
    readFileSyncFn: () => JSON.stringify({ activeFeature: { id: "feature-abc" } }),
    runCommand: runner,
  }), (error) => error.code === "FINISH-CLOSE-POSTIMAGE-SECRET" && error.lifecycleId === "feature-abc"
    && /briefing-copy\.json:7 \(generic-api-key\)/u.test(error.message) && /--resume-lifecycle-id feature-abc/u.test(error.message) && /gitleaks-repair-ignore\.mjs/u.test(error.message));
  assert.equal(f.calls.some(([, argv]) => argv[1] === "close-feature"), false, "the State close never ran");
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
    if (argv.includes("--close-postimages")) return POSTIMAGE_PASS;
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
  // C23 (Antigravity greenfield C): the refusal names what it would accept.
  assert.throws(() => finishFeature({ rootDir: "/repo", by: "PO", architectureImpact: "none", auditRequest: "specs/feature/audit-request.json", criticVerifyLifecycle: f.criticVerifyLifecycle }, { realpathSyncFn: value => value, runCommand: runner }),
    error => error.code === "FINISH-IMPACT" && /no-architecture-impact/u.test(error.message) && /architecture-conforms/u.test(error.message));
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
// C30D-G1: the shape `reconcileSigningRoute` prints (boundedCopySafeCommand's `{ executable, argv, command, copyCommand }` plus the kind, subject and boundary): the PO's line is its `command`.
const SIGNATURE_COMMAND = { executable: "node", argv: ["po-human-approval.mjs", "authorize-critical", "--kind", "feature-package-reconcile"], command: "node po-human-approval.mjs authorize-critical --kind feature-package-reconcile", copyCommand: { maxColumns: 100, posix: null, powershell: null, cmd: null }, kind: "feature-package-reconcile", requiresPoApproval: true, executionBoundary: "attended-external-terminal", executed: false };
// C22 (CGR-06, restated in place, QG-04): the one-shot now asks the human once before its irreversible part, so every fixture input carries the
// human's recorded answer unless a case sets `acceptance: false` to examine the question itself. `handover` / `telemetry` seed the files the
// tracked-effects digest reads; with neither, no handover writer is called and the call lists of the existing cases stay as they were.
function oneShotFixture({ continuity = false, resultBound = true, verifyRed = false, securityBlocking = false, packetOnDisk = true, startPhase = null, closed = false, acknowledgementMissing = false, addendaWritten = false, acceptance = true, handover = false, telemetry = false, criticStanding = { status: "passed" }, residualOnRecord = false, language = null, postimageBlocking = false, gateChangesUnproven = false, bootstrap = "refused", ownerRoute = false } = {}) {
  // C30D-G1: `bootstrap` names what the Result bootstrap stand-ins answer (a refused plan by default, so the cases written before the close ran the bootstrap itself keep their stop); `ownerRoute` gives the repository a session-authority catalogue.
  const independenceChecks = []; const gateChangeChecks = []; const ownerRouteCalls = []; let retired = false; let bootstrapped = false;
  const root = realpathSync(mkdtempSync(join(tmpdir(), "one-shot-close-")));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(root, ".claude")); mkdirSync(join(root, "specs/feature-abc/evidence"), { recursive: true });
  writeFileSync(join(root, "specs/feature-abc/result.md"), "# Result\n");
  const resultSha = sha256Of("# Result\n");
  const stateValue = (nextAction) => ({ schema: "pipeline.state.v0", activeFeature: { id: "feature-abc" }, ...(residualOnRecord ? { residualAcceptance: { lastAccepted: { findings: [] } } } : {}),
    ...(continuity ? { continuity: { revision: retired || bootstrapped ? 4 : 3, ...(language === null ? {} : { runtime: { humanFacingLanguage: language } }), queueHead: { nextAction }, authority: { result: (resultBound || bootstrapped) && !retired ? { path: "specs/feature-abc/result.md", sha256: resultSha } : null } } } : {}) });
  const writeState = (value) => writeFileSync(join(root, STATE_PATH), `${JSON.stringify(value)}\n`);
  writeState(closed ? { schema: "pipeline.state.v0", closedFeatures: [{ id: "feature-abc" }] } : stateValue("review"));
  if (handover) { mkdirSync(join(root, "project")); mkdirSync(join(root, "docs")); writeFileSync(join(root, "project/pipeline.json"), `${JSON.stringify({ handover: "docs/state.md" })}\n`); writeFileSync(join(root, "docs/state.md"), "# State\n\n## Current state\n\nFeature `feature-abc` is active in implementation.\n"); }
  if (telemetry) { mkdirSync(join(root, "telemetry")); writeFileSync(join(root, "telemetry/costs.md"), "| session | cost |\n"); }
  git("add", "-A"); git("commit", "-q", "-m", "baseline");
  const packetId = "a".repeat(32); const lifecycleId = "c".repeat(64);
  if (packetOnDisk) mkdirSync(join(root, ".git/agent-pipeline/critic-packets", packetId), { recursive: true });
  if (ownerRoute) { mkdirSync(join(root, ".git/agent-pipeline/session-authority"), { recursive: true }); writeFileSync(join(root, ".git/agent-pipeline/session-authority/catalogue.json"), "{}\n"); mkdirSync(join(root, ".git/agent-pipeline/publication-close/lc-1"), { recursive: true }); }
  const calls = []; let phase = startPhase ?? "none"; let addendaPending = addendaWritten;
  const json = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
  const flag = (argv, name) => argv[argv.indexOf(name) + 1];
  const runner = (executable, argv) => {
    if (executable === "git") return spawnSync("git", argv, { cwd: root, encoding: "utf8" });
    // The owner route forwards the State argv after `--` to the same State writer stand-ins.
    if (argv[0].split("/").at(-1) === "continuity-owner-route.mjs") { const inner = argv.slice(argv.indexOf("--") + 1); ownerRouteCalls.push(inner); return runner(executable, [STATE_WRITER, ...inner]); }
    const script = argv[0].split("/").at(-1); const sub = argv[1];
    if (script === "close-coordinator.mjs" && sub === "critic-standing") return json(criticStanding);
    if (script === "close-coordinator.mjs" && sub === "critic-independence") { independenceChecks.push(flag(argv, "--packet")); return json(acknowledgementMissing ? { status: "acknowledgement-required", code: "CLOSE-CRITIC-CALLER-AUTHORED", message: "authored by the calling agent; record it with approve-critic-acknowledgement" } : { status: "satisfied" }); }
    if (script === "close-coordinator.mjs" && sub === "critic-addenda") return json(addendaPending ? { status: "written", commitPaths: ["specs/feature-abc/evidence/critic-addendum-r1.json"], subject: "chore(evidence): bind the Critic course to the delivery records", message: "written" } : { status: "none" });
    // ADR-0096: the read-only gate-change readback; a proven range carries its record, which the close writes into the evidence.
    if (script === "close-coordinator.mjs" && sub === "gate-changes") { gateChangeChecks.push(flag(argv, "--root")); return json(gateChangesUnproven
      ? { schema: "pipeline.close-gate-changes.v1", status: "unproven", unproven: ["GS-1 pipeline.user.yaml changed in 0123456789ab: no proof"], repair: "the PO acknowledges the unproven gate-definition changes once for this range: run node pipeline-state.mjs approve-gate-change-acknowledgement --by <the label the PO gives for this command>, which prints the PO's signing command" }
      : { schema: "pipeline.close-gate-changes.v1", status: "proven", changes: 0, record: { schema: "pipeline.gate-definition-changes.v1", status: "proven", base: null, head: git("rev-parse", "HEAD").trim(), changes: [], unproven: [] } }); }
    if (script === "security-scan.mjs" && argv.includes("--close-postimages")) { calls.push("security-scan.mjs --close-postimages"); return postimageBlocking ? POSTIMAGE_BLOCK : POSTIMAGE_PASS; }
    calls.push(script === "verify-evidence-producer.mjs" || script === "security-scan.mjs" || script === "register-feature-package.mjs" || script === "commit-pipeline-owned.mjs" ? script : `${script.replace(".mjs", "")} ${sub}`);
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
    // C30D-G1: stand-ins for the Result bootstrap the close now runs itself, and for the commit that owns its outputs (it moves HEAD, as the real one does).
    if (script === "commit-pipeline-owned.mjs") {
      if (bootstrap === "commit-refused") return { status: 2, stdout: JSON.stringify({ schema: "pipeline.commit-pipeline-owned.v1", status: "refused", code: "CPO-FOREIGN-CHANGES", reason: "other files are uncommitted; this command commits only the Pipeline's own state files", others: ["notes.txt"], owned: [STATE_PATH] }), stderr: "" };
      git("add", "--", STATE_PATH); git("commit", "-q", "-m", "chore(state): bind the Implementation Result", "--", STATE_PATH);
      return json({ schema: "pipeline.commit-pipeline-owned.v1", status: "committed", owned: [STATE_PATH], commit: git("rev-parse", "HEAD").trim() });
    }
    if (script === "pipeline-state.mjs") {
      if (sub === "continuity-result-bootstrap-plan") {
        if (bootstrap === "refused") return { status: 2, stdout: "", stderr: "Error: Result bootstrap plan refused (PS-RESULT-BOOTSTRAP-DRIFT); zero mutation.\n" };
        return json({ schema: "pipeline.continuity-result-bootstrap-plan.v1", featureId: "feature-abc", planSha256: "6".repeat(64),
          applyAction: { executable: process.execPath, argv: [STATE_WRITER, "continuity-result-bootstrap-apply", "--feature-id", "feature-abc", "--plan-sha256", "6".repeat(64), "--activate"], mutation: true, requiresConfirmation: true, executionBoundary: "host-authorized-wsl" },
          ...(bootstrap === "plan-signature" ? { signatureCommand: SIGNATURE_COMMAND } : {}) });
      }
      if (sub === "continuity-result-bootstrap-apply") {
        if (bootstrap === "apply-refused") return { status: 2, stdout: "", stderr: "Error: Result bootstrap apply refused (PS-RESULT-BOOTSTRAP-LOCK); zero mutation.\n" };
        // "stuck": the writer reports success but the State still binds no Result (the loop guard's case); the write still dirties the tree, so a commit follows.
        if (bootstrap === "stuck") writeState({ ...stateValue("review"), touched: true }); else { bootstrapped = true; writeState(stateValue("review")); }
        const completion = bootstrap === "completion-signature" ? { state: "reconciliation-pending", signatureCommand: SIGNATURE_COMMAND, reconcileCommand: { executable: process.execPath, argv: [STATE_WRITER, "feature-package-reconcile", "--by", "<po-name>"], requiredInputs: ["by", "proof-request", "proof-authority", "proof"] } }
          : bootstrap === "reconcile" || bootstrap === "reconcile-refused" ? { state: "reconciliation-pending", reconcileCommand: { executable: process.execPath, argv: [STATE_WRITER, "feature-package-reconcile", "--root", root, "--manifest", "specs/feature-abc/lifecycle.json", "--plan-sha256", "5".repeat(64)], requiredInputs: [] } }
            : { scope: "feature-closure", state: "review", workflowTerminal: false };
        return json({ schema: "pipeline.continuity-result-bootstrap-apply.v1", status: "applied", featureId: "feature-abc", mutated: true, completion });
      }
      if (sub === "feature-package-reconcile") return bootstrap === "reconcile-refused" ? { status: 2, stdout: "", stderr: "Error: feature-package-reconcile refused (PS-RECONCILE-DRIFT); zero mutation.\n" } : json({ status: "reconciled" });
      if (sub === "feature-package-plan") return json({ planSha256: "9".repeat(64) });
      if (sub === "feature-package-apply") return json({ status: "applied" });
      // C22 (CGF-12): the existing handover writer; this stand-in rewrites the generated Current state sentence the way the writer does for a closed feature.
      if (sub === "update-public-handover") { writeFileSync(join(root, "docs/state.md"), "# State\n\n## Current state\n\n**Lifecycle phase:** no active feature\nFeature `feature-abc` is closed locally.\n"); return json({ status: "current", path: "docs/state.md", currentState: "updated" }); }
      if (sub === "continuity-result-close-plan") return json({ applyAction: { executable: process.execPath, argv: [STATE_WRITER, "continuity-result-close-apply", "--feature-id", "feature-abc"] } });
      if (sub === "continuity-result-close-apply") { writeState(stateValue("close")); return json({ status: "applied" }); }
      // C28: the decline route's stand-ins for the State transition that retires the bound Result and for the result-only package reconcile it names.
      if (sub === "continuity-result-retire-plan") return json({ planSha256: "7".repeat(64), applyAction: { executable: process.execPath, argv: [STATE_WRITER, "continuity-result-retire-apply", "--feature-id", "feature-abc", "--decline-record", flag(argv, "--decline-record")] } });
      if (sub === "continuity-result-retire-apply") { retired = true; writeState(stateValue("review")); return json({ status: "applied" }); }
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
  return { root, git, calls, ownerRouteCalls, independenceChecks, gateChangeChecks, runner, resultSha, packetId, lifecycleId, setPhase: (value) => { phase = value; }, addendaCommitted: () => { addendaPending = false; }, input: { rootDir: root, by: "PO", architectureImpact: "no-architecture-impact", criticPacketId: packetId, ...(acceptance ? { humanAcceptance: "yes, I accept" } : {}) } }; // C28 (QG-04, restated in place): the acceptance is recorded only for the one fixed yes form, so the default answer is exactly that form.
}
const forbidden = (calls) => calls.filter((call) => /approve-push|authorize|sign|push|release/u.test(call));

test("C29-C2: a blocking secret in the generated close outputs stops the one-shot before the close coordinator starts (point A)", () => {
  const f = oneShotFixture({ postimageBlocking: true });
  try {
    const result = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(result.status, "stopped", JSON.stringify(result).slice(0, 400));
    assert.equal(result.stage, "close-postimage-scan");
    assert.equal(result.stop.code, "ONESHOT-CLOSE-POSTIMAGE-SECRET");
    assert.match(result.stop.reason, /briefing-copy\.json:7 \(generic-api-key\)/u);
    assert.match(result.stop.repair, /nothing irreversible was written/u);
    assert.equal(result.postimageScan.blocking, true);
    assert.equal(f.calls.some((call) => call.startsWith("close-coordinator") || call === "pipeline-state close-feature"), false, "no close transition ran");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("P3: one command takes the active feature from the approved candidate to the printed commit, and signs and pushes nothing", () => {
  const f = oneShotFixture();
  try {
    const result = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(result.status, "commit-required", JSON.stringify(result).slice(0, 400));
    assert.ok(result.stages.includes("close-postimage-scan"));
    assert.deepEqual(f.calls, ["verify-evidence-producer.mjs", "register-feature-package.mjs", "pipeline-state feature-package-plan", "pipeline-state feature-package-apply", "pipeline-state feature-package-plan", "pipeline-state feature-package-apply",
      // C29 (C2): the close outputs are secret-checked before the coordinator starts (A) and again, with the audit bundle, before the State close (B).
      "security-scan.mjs --close-postimages",
      "close-coordinator plan-start", "close-coordinator apply-start", "close-coordinator plan-transition", "close-coordinator apply-transition", "close-coordinator plan-transition", "close-coordinator apply-transition",
      "security-scan.mjs --close-postimages", "pipeline-state close-feature",
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

test("C21B: a Continuity feature with no bound Result stops before Verify with the exact bootstrap chain and writes no close evidence", () => {
  // C30D-G1 (QG-04, restated in place): the close now takes the bootstrap plan itself, so the one State call it makes is the plan; this fixture's plan is refused, so the stop, the manual chain and the
  // guarantee that nothing past the plan ran (no Verify, no package stage, no apply, no commit) stay exactly as they were.
  const f = oneShotFixture({ continuity: true, resultBound: false });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 400));
    assert.equal(stopped.stop.code, "ONESHOT-RESULT-NOT-BOUND");
    assert.deepEqual(f.calls, ["pipeline-state continuity-result-bootstrap-plan"], "Verify and the package stages must not run");
    assert.match(stopped.stop.reason, /PS-RESULT-BOOTSTRAP-DRIFT[\s\S]*nothing was written/u);
    for (const needle of ["continuity-result-bootstrap-plan", "applyAction", "reconcileCommand", "commit-pipeline-owned.mjs", `--critic-packet-id ${f.packetId}`]) assert.ok(stopped.stop.repair.includes(needle), needle);
    for (const name of ["audit-request.json", "verify-candidate.json", "close-request.json"]) assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence", name)), false, name);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ---- C30D-G1 (AC-108): the one-shot close runs the Result bootstrap itself when it needs agent authority only -------------------------------------
const BOOTSTRAP_PLAN = "pipeline-state continuity-result-bootstrap-plan";
const BOOTSTRAP_APPLY = "pipeline-state continuity-result-bootstrap-apply";
const countOf = (calls, name) => calls.filter((call) => call === name).length;

test("C30D-G1: a close that only lacks the Result bootstrap needs no detour: the first call plans, applies, commits and asks the question at the new HEAD, the second reaches the commit step on that HEAD", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "agent", acceptance: false });
  try {
    const before = f.git("rev-parse", "HEAD").trim();
    const asked = oneShotClose(f.input, { runCommand: f.runner });
    const head = f.git("rev-parse", "HEAD").trim();
    assert.notEqual(head, before, "the bootstrap's own commit moved HEAD");
    assert.equal(asked.status, "stopped", JSON.stringify(asked).slice(0, 500)); assert.equal(asked.stop.code, "ONESHOT-ACCEPTANCE-REQUIRED");
    assert.ok(asked.stop.reason.includes(`candidate ${head}`), "the question names the post-bootstrap HEAD, never the one before it");
    assert.deepEqual(f.calls, [BOOTSTRAP_PLAN, BOOTSTRAP_APPLY, "commit-pipeline-owned.mjs"], "the bootstrap is settled and nothing else ran before the question");
    assert.equal(asked.resultBootstrap.commit, head);
    // the human's answer comes with the second call, for the candidate the question named
    const result = oneShotClose({ ...f.input, humanAcceptance: "yes, I accept" }, { runCommand: f.runner });
    assert.equal(result.status, "commit-required", JSON.stringify(result).slice(0, 500));
    assert.equal(f.git("rev-parse", "HEAD").trim(), head, "the second call moved nothing");
    assert.equal(JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/verify-candidate.json"), "utf8")).candidate.commit, head, "the candidate Verify ran on the post-bootstrap HEAD");
    assert.equal(readAcceptanceRecord(f.root, "feature-abc").candidate, head, "the acceptance names the post-bootstrap HEAD");
    const request = JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/close-request.json"), "utf8"));
    assert.equal(request.expectedRevision, 4, "the close request is built from the State read after the bootstrap");
    assert.deepEqual(request.result, { path: "specs/feature-abc/result.md", sha256: f.resultSha });
    assert.equal(countOf(f.calls, BOOTSTRAP_PLAN), 1, "never planned a second time");
    assert.deepEqual(forbidden(f.calls), []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C30D-G1: an answer given before the candidate existed is not carried over the bootstrap commit, and a decline does not bind a Result only to retire it", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "agent" });
  try {
    const asked = oneShotClose(f.input, { runCommand: f.runner }); // f.input carries --human-acceptance
    assert.equal(asked.stop.code, "ONESHOT-ACCEPTANCE-REQUIRED", JSON.stringify(asked).slice(0, 500));
    assert.match(asked.stop.repair, /answer given with --human-acceptance[\s\S]*not carried/u);
    assert.equal(readAcceptanceRecord(f.root, "feature-abc"), null, "no acceptance was recorded for a HEAD the human never saw");
    assert.equal(f.calls.includes("verify-evidence-producer.mjs"), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
  const g = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "agent" });
  try {
    const { humanAcceptance, ...noAnswer } = g.input;
    const declined = oneShotClose({ ...noAnswer, humanDecline: "it crashes on start" }, { runCommand: g.runner });
    assert.equal(declined.status, "stopped", JSON.stringify(declined).slice(0, 500)); assert.equal(declined.stop.code, "ONESHOT-RESULT-NOT-BOUND");
    assert.match(declined.stop.reason, /decline[\s\S]*nothing was written/u);
    assert.deepEqual(g.calls, [], "no plan, no apply, no commit");
  } finally { rmSync(g.root, { recursive: true, force: true }); }
});

test("C30D-G1: a reconcile the agent may run (no proof inputs) is run before the commit; a refused one stops with what is written and not committed", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "reconcile", acceptance: false });
  try {
    const result = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(result.stop.code, "ONESHOT-ACCEPTANCE-REQUIRED", JSON.stringify(result).slice(0, 500));
    assert.deepEqual(f.calls, [BOOTSTRAP_PLAN, BOOTSTRAP_APPLY, "pipeline-state feature-package-reconcile", "commit-pipeline-owned.mjs"]);
    assert.equal(result.resultBootstrap.reconciled, true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
  const g = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "reconcile-refused" });
  try {
    const stopped = oneShotClose(g.input, { runCommand: g.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 500)); assert.equal(stopped.stop.code, "ONESHOT-RESULT-BOOTSTRAP-RECONCILE");
    assert.match(stopped.stop.reason, /not committed[\s\S]*PS-RECONCILE-DRIFT/u);
    assert.match(stopped.stop.repair, /feature-package-reconcile[\s\S]*commit-pipeline-owned\.mjs --root [^ ]+ --agent/u);
    assert.deepEqual(g.calls, [BOOTSTRAP_PLAN, BOOTSTRAP_APPLY, "pipeline-state feature-package-reconcile"], "no commit after a refused reconcile");
  } finally { rmSync(g.root, { recursive: true, force: true }); }
});

test("C30D-G1: a stop below the block keeps its code and order after the bootstrap, and says what the bootstrap committed", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "agent", acknowledgementMissing: true });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    const head = f.git("rev-parse", "HEAD").trim();
    assert.equal(stopped.stage, "critic-acknowledgement"); assert.equal(stopped.stop.code, "CLOSE-CRITIC-CALLER-AUTHORED");
    assert.deepEqual(f.calls, [BOOTSTRAP_PLAN, BOOTSTRAP_APPLY, "commit-pipeline-owned.mjs"], "the acknowledgement is read after the bootstrap, before Verify");
    assert.equal(f.independenceChecks.length, 1, "the Critic independence check ran once, after the commit");
    assert.match(stopped.stop.repair, new RegExp(`first ran the Result bootstrap and committed it as ${head}[\\s\\S]*counts from that commit on[\\s\\S]*nothing was written;`, "u"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C30D-G1: on the owner route the same helper runs the entries through the route, and a later stop says what the bootstrap committed", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "agent", ownerRoute: true, startPhase: "checkpointed", acceptance: false });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    const head = f.git("rev-parse", "HEAD").trim();
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 500));
    assert.equal(stopped.stop.code, "ONESHOT-ACCEPTANCE-REQUIRED");
    assert.deepEqual(f.ownerRouteCalls.map((argv) => argv[0]), ["continuity-result-bootstrap-plan", "continuity-result-bootstrap-apply"], "plan and apply both ran on the owner route");
    assert.ok(stopped.stop.reason.includes(`candidate ${head}`), "the acceptance question names the post-bootstrap HEAD");
    assert.equal(stopped.resultBootstrap.commit, head);
    assert.match(stopped.stop.repair, /first ran the Result bootstrap and committed it[\s\S]*nothing was written[\s\S]*counts from that commit on/u, "the later stop does not claim an untouched tree");
    assert.match(stopped.stop.repair, /--resume-lifecycle-id lc-1/u);
    assert.equal(countOf(f.calls, BOOTSTRAP_PLAN), 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C30D-G1: on the owner route a refused plan keeps the old wording: the lifecycle may be open, nothing in the work tree was written", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, ownerRoute: true, startPhase: "checkpointed" });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.stop.code, "ONESHOT-RESULT-NOT-BOUND", JSON.stringify(stopped).slice(0, 500));
    assert.match(stopped.stop.reason, /owner route; the Close lifecycle lc-1 it needs is open\. [\s\S]*PS-RESULT-BOOTSTRAP-DRIFT[\s\S]*nothing in the work tree was written/u);
    assert.match(stopped.stop.repair, /continuity-owner-route\.mjs run --root \S+ --lifecycle lc-1 --/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C30D-G1: a plan that prints a signatureCommand still stops, names it for the PO and says nothing was written", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "plan-signature" });
  try {
    const before = f.git("rev-parse", "HEAD").trim();
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 500));
    assert.equal(stopped.stage, "result-bootstrap"); assert.equal(stopped.stop.code, "ONESHOT-RESULT-BOOTSTRAP-NEEDS-PO");
    assert.match(stopped.stop.reason, /nothing was written/u);
    assert.match(stopped.stop.repair, /authorize-critical --kind feature-package-reconcile/u);
    assert.equal(stopped.signatureCommand.command, SIGNATURE_COMMAND.command, "the printed line travels unchanged in the result too");
    assert.deepEqual(f.calls, [BOOTSTRAP_PLAN], "nothing was applied, committed or verified");
    assert.equal(f.git("rev-parse", "HEAD").trim(), before); assert.equal(f.git("status", "--porcelain").trim(), "");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C30D-G1: a completion that needs the PO's signature stops after the apply, says the writes are not committed and names the signatureCommand", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "completion-signature" });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 500));
    assert.equal(stopped.stop.code, "ONESHOT-RESULT-BOOTSTRAP-NEEDS-PO");
    assert.match(stopped.stop.reason, /applied[\s\S]*not committed/u);
    assert.match(stopped.stop.repair, /authorize-critical --kind feature-package-reconcile[\s\S]*commit-pipeline-owned\.mjs --root [^ ]+ --agent[\s\S]*--critic-packet-id /u);
    assert.match(stopped.stop.repair, /Do not commit or change the tree between the signature and the reconcile/u);
    assert.equal(stopped.signatureCommand.command, SIGNATURE_COMMAND.command);
    assert.deepEqual(f.calls, [BOOTSTRAP_PLAN, BOOTSTRAP_APPLY], "no reconcile, no commit, no Verify");
    assert.notEqual(f.git("status", "--porcelain").trim(), "", "the applied State write is left uncommitted, as the stop says");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C30D-G1: a refused applyAction is a typed stop that commits and verifies nothing", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "apply-refused" });
  try {
    const before = f.git("rev-parse", "HEAD").trim();
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 500));
    assert.equal(stopped.stage, "result-bootstrap"); assert.equal(stopped.stop.code, "ONESHOT-RESULT-BOOTSTRAP-APPLY");
    assert.match(stopped.stop.reason, /PS-RESULT-BOOTSTRAP-LOCK/u);
    assert.deepEqual(f.calls, [BOOTSTRAP_PLAN, BOOTSTRAP_APPLY]);
    assert.equal(f.git("rev-parse", "HEAD").trim(), before);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C30D-G1: a refused commit stops with the typed refusal and says the applied State is not committed", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "commit-refused" });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 500));
    assert.equal(stopped.stop.code, "ONESHOT-RESULT-BOOTSTRAP-COMMIT");
    assert.match(stopped.stop.reason, /CPO-FOREIGN-CHANGES[\s\S]*not committed/u);
    assert.match(stopped.stop.repair, /commit-pipeline-owned\.mjs --root [^ ]+ --agent/u);
    assert.deepEqual(f.calls, [BOOTSTRAP_PLAN, BOOTSTRAP_APPLY, "commit-pipeline-owned.mjs"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C30D-G1: the loop guard: when the State still binds no Result after the one re-entry the close stops and never plans a second time", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "stuck" });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 500));
    assert.equal(stopped.stop.code, "ONESHOT-RESULT-BOOTSTRAP-LOOP");
    assert.match(stopped.stop.repair, /first ran the Result bootstrap and committed it/u);
    assert.deepEqual(f.calls, [BOOTSTRAP_PLAN, BOOTSTRAP_APPLY, "commit-pipeline-owned.mjs"], "one plan, one apply, one commit, no Verify");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C30D-G1: a signed SBOM override is bound to the HEAD it was signed at, so the bootstrap commit asks for a new signature instead of reusing it; a blocked SBOM stops before the bootstrap writes anything", () => {
  const f = oneShotFixture({ continuity: true, resultBound: false, bootstrap: "agent" });
  try {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" });
    mkdirSync(join(f.root, "project"), { recursive: true });
    writeFileSync(join(f.root, "project/critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [{ keyReference: "po-key", publicKeySha256: createHash("sha256").update(pem).digest("hex") }] }));
    writeFileSync(join(f.root, "Podfile.lock"), "PODS:\n"); f.git("add", "Podfile.lock", "project/critical-human-proof.json"); f.git("commit", "-q", "-m", "pods");
    const stopped = oneShotClose({ ...f.input, humanAcceptance: null }, { runCommand: f.runner });
    assert.equal(stopped.stage, "sbom"); assert.deepEqual(f.calls, [], "the SBOM stop comes before the bootstrap: nothing was planned, applied or committed");
    const requestPath = /--request (scratch\/sbom-override-request-[a-f0-9]{16}\.json)/u.exec(stopped.stop.repair)[1];
    const proofPath = requestPath.replace("request", "proof");
    const request = JSON.parse(readFileSync(join(f.root, requestPath), "utf8"));
    writeFileSync(join(f.root, proofPath), JSON.stringify({ schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "po-key", publicKey: pem, signatureBase64: nodeSign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), privateKey).toString("base64") }));
    const after = oneShotClose({ ...f.input, sbomOverrideProof: proofPath }, { runCommand: f.runner });
    assert.equal(after.status, "stopped", JSON.stringify(after).slice(0, 400)); assert.equal(after.stage, "sbom"); assert.equal(after.stop.code, "SBOM-ADAPTER-UNSUPPORTED");
    assert.match(after.stop.repair, /first ran the Result bootstrap and committed it/u);
    const newRequest = /--request (scratch\/sbom-override-request-[a-f0-9]{16}\.json)/u.exec(after.stop.repair)[1];
    assert.notEqual(newRequest, requestPath, "the new request names the new HEAD"); assert.equal(existsSync(join(f.root, newRequest)), true, "the request the stop names exists");
    assert.deepEqual(f.calls, [BOOTSTRAP_PLAN, BOOTSTRAP_APPLY, "commit-pipeline-owned.mjs"], "one bootstrap, no Verify bound to a stale HEAD");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C24: a Critic round that did not pass stops before the Result bootstrap and Verify, names the delta round and says which severities can be accepted", () => {
  const stoppedFor = (criticStanding, options = {}) => {
    const f = oneShotFixture({ continuity: true, resultBound: false, criticStanding, ...options });
    try {
      const result = oneShotClose(f.input, { runCommand: f.runner });
      return { result, calls: [...f.calls], evidence: existsSync(join(f.root, "specs/feature-abc/evidence/audit-request.json")) };
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  };
  const major = stoppedFor({ status: "failed", blockers: 0, majors: 3, minors: 14 });
  assert.equal(major.result.stage, "critic-standing"); assert.equal(major.result.stop.code, "ONESHOT-CRITIC-NOT-PASSED");
  assert.match(major.result.stop.reason, /0 blocker, 3 major, 14 minor[\s\S]*A statement in chat is not an acceptance/u);
  assert.match(major.result.stop.repair, /Critic delta round[\s\S]*--critic-packet-id <new-packet-id>[\s\S]*uncorrectable-past-authorship[\s\S]*has to be corrected/u);
  assert.match(major.result.stop.repair, /--proof-request[\s\S]*authorize-critical --kind accept-residual-critic-findings/u, "a signature gate needs its proof flags named");
  assert.deepEqual(major.calls, [], "nothing runs before the stop"); assert.equal(major.evidence, false);
  assert.match(stoppedFor({ status: "failed", blockers: 1, majors: 0, minors: 0 }).result.stop.repair, /A blocker can never be accepted/u);
  const minor = stoppedFor({ status: "failed", blockers: 0, majors: 0, minors: 2 }).result.stop.repair;
  assert.match(minor, /approve-residual-acceptance --by <name> --critic-packet/u); assert.doesNotMatch(minor, /uncorrectable/u);
  assert.equal(stoppedFor({ status: "failed", blockers: 0, majors: 0, minors: 2 }, { residualOnRecord: true }).result.stop.code, "ONESHOT-RESULT-NOT-BOUND", "a recorded acceptance goes on to the close's own check");
  assert.equal(stoppedFor({ status: "unknown" }).result.stop.code, "ONESHOT-RESULT-NOT-BOUND", "an unreadable standing leaves the close's own check in charge");
});

test("C29 L1: a passing round with an earlier blocker/major marked fixed without a reviewed code change stops before anything runs and names the finding, its round and the routes", () => {
  const origin = "c".repeat(32);
  const open = [{ findingId: `CRF-${origin}-1`, severity: "major", originPacketId: origin, evidenceSha256: "d".repeat(64), markedFixedInReviewId: "r2" },
    { findingId: `CRF-${origin}-2`, severity: "blocker", originPacketId: origin, evidenceSha256: "e".repeat(64), markedFixedInReviewId: "r2" }];
  const f = oneShotFixture({ continuity: true, resultBound: false, criticStanding: { status: "earlier-findings-open", open, settled: [], repair: `correct the named findings ... A blocker can never be accepted. A major ... node pipeline-state.mjs approve-residual-acceptance --by <name> --critic-packet ${origin} --reason-class uncorrectable-past-authorship.` } });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.stage, "critic-standing"); assert.equal(stopped.stop.code, "ONESHOT-CRITIC-EARLIER-FINDINGS-OPEN");
    assert.match(stopped.stop.reason, new RegExp(`major CRF-${origin}-1 \\(raised in Critic round ${origin}\\), marked fixed by a round that changed only the Spec text, evidence or administration; blocker CRF-${origin}-2`, "u"));
    assert.match(stopped.stop.reason, /A statement in chat is not an acceptance/u);
    assert.match(stopped.stop.repair, /A blocker can never be accepted[\s\S]*approve-residual-acceptance --by <name> --critic-packet c{32} --reason-class uncorrectable-past-authorship/u);
    assert.doesNotMatch(stopped.stop.repair, / node pipeline-state\.mjs /u, "the state writer is named by its path");
    assert.deepEqual(f.calls, [], "nothing runs before the stop");
    assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence/audit-request.json")), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C29 L1: a failed round the PO accepted for its own minors does not carry an earlier major past the close", () => {
  const origin = "c".repeat(32);
  const earlierOpen = [{ findingId: `CRF-${origin}-1`, severity: "major", originPacketId: origin, evidenceSha256: "d".repeat(64), state: "still-open", reviewId: "r2" }];
  const f = oneShotFixture({ continuity: true, resultBound: false, residualOnRecord: true, criticStanding: { status: "failed", blockers: 0, majors: 0, minors: 1, earlierOpen, earlierRepair: "correct the named findings ... A blocker can never be accepted." } });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.stop.code, "ONESHOT-CRITIC-EARLIER-FINDINGS-OPEN", JSON.stringify(stopped).slice(0, 400));
    assert.match(stopped.stop.reason, new RegExp(`major CRF-${origin}-1 \\(raised in Critic round ${origin}\\), still open`, "u"));
    assert.match(stopped.stop.repair, /A blocker can never be accepted/u);
    assert.deepEqual(f.calls, [], "nothing runs before the stop");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C29 L1: an earlier major the PO accepted as uncorrectable is named in the acceptance question", () => {
  const origin = "c".repeat(32);
  const f = oneShotFixture({ acceptance: false, criticStanding: { status: "passed", settled: [{ findingId: `CRF-${origin}-1`, severity: "major", originPacketId: origin, evidenceSha256: "d".repeat(64), markedFixedInReviewId: "r2" }] } });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.stop.code, "ONESHOT-ACCEPTANCE-REQUIRED", JSON.stringify(stopped).slice(0, 400));
    assert.match(stopped.stop.reason, new RegExp(`earlier Critic major CRF-${origin}-1 \\(round ${origin}\\) is not corrected; the PO accepted it as uncorrectable`, "u"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C21C: a missing PO acknowledgement of a caller-authored Critic stops before Verify and writes nothing", () => {
  const f = oneShotFixture({ acknowledgementMissing: true });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 400));
    assert.equal(stopped.stage, "critic-acknowledgement"); assert.equal(stopped.stop.code, "CLOSE-CRITIC-CALLER-AUTHORED");
    assert.match(stopped.stop.reason, /approve-critic-acknowledgement/u);
    assert.deepEqual(f.independenceChecks, [f.packetId]); assert.deepEqual(f.calls, [], "Verify, the package and the close must not run");
    for (const name of ["audit-request.json", "verify-candidate.json"]) assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence", name)), false, name);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("ADR-0096: an unproven gate-definition change stops the one-shot before Verify with the acknowledgement as its repair; a proven range travels in the audit request", () => {
  const f = oneShotFixture({ gateChangesUnproven: true });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 400));
    assert.equal(stopped.stage, "gate-changes"); assert.equal(stopped.stop.code, "CLOSE-GATE-CHANGE-UNPROVEN");
    assert.match(stopped.stop.reason, /pipeline\.user\.yaml changed in 0123456789ab/u);
    assert.match(stopped.stop.repair, /approve-gate-change-acknowledgement --by/u);
    assert.match(stopped.stop.repair, /rerun the identical command/u);
    assert.deepEqual(f.gateChangeChecks, [f.root]); assert.deepEqual(f.calls, [], "no Verify, package or close stage ran");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
  const g = oneShotFixture();
  try {
    oneShotClose(g.input, { runCommand: g.runner });
    const request = JSON.parse(readFileSync(join(g.root, "specs/feature-abc/evidence/audit-request.json"), "utf8"));
    assert.equal(request.evidence.gateChangesRecordPath, "specs/feature-abc/evidence/gate-changes.json");
    assert.equal(JSON.parse(readFileSync(join(g.root, request.evidence.gateChangesRecordPath), "utf8")).schema, "pipeline.gate-definition-changes.v1");
  } finally { rmSync(g.root, { recursive: true, force: true }); }
});

test("C21E: the acknowledgement stop names the uncommitted paths before the PO is asked to sign, and says nothing on a clean tree", () => {
  const f = oneShotFixture({ acknowledgementMissing: true });
  try {
    assert.doesNotMatch(oneShotClose(f.input, { runCommand: f.runner }).stop.repair, /uncommitted/u, "a clean tree needs no note");
    writeFileSync(join(f.root, "untracked-note.md"), "note\n");
    writeFileSync(join(f.root, STATE_PATH), `${readFileSync(join(f.root, STATE_PATH), "utf8")} \n`);
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 400));
    assert.match(stopped.stop.repair, /first commit the 2 uncommitted path\(s\)/u);
    assert.ok(stopped.stop.repair.includes("untracked-note.md") && stopped.stop.repair.includes(STATE_PATH), stopped.stop.repair);
    assert.match(stopped.stop.repair, /rerun the identical command/u);
    assert.deepEqual(f.calls, [], "the note changes no stage order");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C21E: the close writes the Critic addenda before Verify, asks for their commit, and the rerun goes on to Verify", () => {
  const f = oneShotFixture({ addendaWritten: true });
  try {
    const first = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(first.status, "commit-required", JSON.stringify(first).slice(0, 400));
    assert.ok(first.stages.includes("critic-addenda")); assert.deepEqual(first.commit.paths, ["specs/feature-abc/evidence/critic-addendum-r1.json"]);
    assert.match(first.commit.steps[0], /git add -f --/u, "the addenda live below a possibly ignored evidence directory");
    assert.match(first.message, /Do not build addenda by hand/u);
    assert.deepEqual(f.calls, [], "Verify, the package and the close must not run before the addenda are committed");
    f.addendaCommitted();
    const second = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(second.status, "commit-required", JSON.stringify(second).slice(0, 400));
    assert.equal(f.calls[0], "verify-evidence-producer.mjs", "the rerun reaches Verify");
    assert.ok(!second.stages.includes("critic-addenda"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// The real writer's session authority refuses a group or world accessible entry below the control directory; the stubs above create theirs with default modes.
function privateControlTree(path) {
  if (!existsSync(path)) return;
  chmodSync(path, statSync(path).isDirectory() ? 0o700 : 0o600);
  if (statSync(path).isDirectory()) for (const name of readdirSync(path)) privateControlTree(join(path, name));
}

// The real package verbs and the real planner; only Verify, registration and the coordinator are stubbed.
function withRealPackage(f, { state = "completed" } = {}) {
  const base = "specs/feature-abc";
  const artifact = (klass, name, authority, mutability, retention) => { const path = `${base}/${name}`; const bytes = `${klass}\n`; mkdirSync(dirname(join(f.root, path)), { recursive: true }); writeFileSync(join(f.root, path), bytes); return { class: klass, path, sha256: sha256Of(bytes), authority, mutability, retention }; };
  const artifacts = [artifact("prd", "prd.md", true, "mutable", "active"), artifact("spec", "spec.md", true, "mutable", "active"), artifact("acceptance", "acceptance.md", true, "mutable", "active"),
    { class: "result", path: `${base}/result.md`, sha256: f.resultSha, authority: true, mutability: "append-only", retention: "retain" }, artifact("candidate-evidence", "evidence/verify-old.json", false, "immutable", "retain")];
  const manifestPath = join(f.root, base, "lifecycle.json");
  const read = () => JSON.parse(readFileSync(manifestPath, "utf8"));
  f.git("add", "-A"); f.git("commit", "-q", "-m", "package files");
  const head = f.git("rev-parse", "HEAD").trim(); const tree = f.git("rev-parse", "HEAD^{tree}").trim();
  writeFileSync(manifestPath, `${JSON.stringify({ schema: "pipeline.feature-package.v1", feature: { id: "feature-abc", rigor: 2 }, state, artifacts, candidate: { commit: head, tree }, supersedes: null }, null, 2)}\n`);
  f.git("add", "-A"); f.git("commit", "-q", "-m", "the close evidence commit moves HEAD past the candidate");
  const packaged = (executable, argv) => {
    const script = String(argv[0]).split("/").at(-1);
    if (script === "pipeline-state.mjs" && String(argv[1]).startsWith("feature-package-")) { f.calls.push(`pipeline-state ${argv[1]}`); privateControlTree(join(f.root, ".git/agent-pipeline")); return spawnSync(process.execPath, argv, { cwd: f.root, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: f.root } }); }
    if (script === "register-feature-package.mjs") {
      f.calls.push(script);
      const path = argv[argv.indexOf("--add-verify-evidence") + 1]; const value = read();
      value.artifacts = [...value.artifacts.filter((entry) => entry.path !== path), { class: "candidate-evidence", path, sha256: sha256Of(readFileSync(join(f.root, path))), authority: false, mutability: "immutable", retention: "retain" }];
      writeFileSync(manifestPath, `${JSON.stringify(value, null, 2)}\n`);
      return { status: 0, stdout: "{\"status\":\"registered\"}", stderr: "" };
    }
    return f.runner(executable, argv);
  };
  return { packaged, read, oldCandidate: head };
}

test("C21C: a resumed close whose package is completed on an older HEAD qualifies the new HEAD and rebinds the package instead of refusing", () => {
  const f = oneShotFixture({ startPhase: "checkpointed" });
  try {
    const { packaged, read, oldCandidate } = withRealPackage(f);
    writeFileSync(join(f.root, "specs/feature-abc/evidence/audit-request.json"), `${JSON.stringify({ criticVerifyLifecycleId: "d".repeat(64) })}\n`);
    mkdirSync(join(f.root, ".git/agent-pipeline/critic-verify-lifecycle"), { recursive: true });
    writeFileSync(join(f.root, `.git/agent-pipeline/critic-verify-lifecycle/${"d".repeat(64)}.json`), JSON.stringify({ critic: { packetId: f.packetId } }));
    const result = oneShotClose({ ...f.input, criticPacketId: null, resumeLifecycleId: "lc-1" }, { runCommand: packaged });
    assert.equal(result.status, "commit-required", JSON.stringify(result).slice(0, 600));
    const head = f.git("rev-parse", "HEAD").trim();
    assert.notEqual(oldCandidate, head);
    assert.equal(read().state, "completed"); assert.equal(read().candidate.commit, head, "the package is bound to the current HEAD");
    assert.deepEqual(f.independenceChecks, [f.packetId], "the packet comes from the earlier close's own receipt");
    assert.ok(result.stages.includes("requalify-candidate"), result.stages.join());
    assert.equal(JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/audit-request.json"), "utf8")).criticVerifyLifecycleId, f.lifecycleId, "the audit request names the receipt of the new Verify");
    const moves = f.calls.filter((call) => call.startsWith("pipeline-state feature-package-"));
    assert.deepEqual(moves, ["pipeline-state feature-package-plan", "pipeline-state feature-package-apply", "pipeline-state feature-package-plan", "pipeline-state feature-package-apply"]);
    assert.deepEqual(forbidden(f.calls), []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C21C: the owner route names the typed reason of a refused requester instead of only its code", async () => {
  const { ownerRouteRequesterRefusal } = await import("./continuity-owner-route.mjs");
  const platform = ownerRouteRequesterRefusal(Object.assign(new Error("x"), { code: "SDC-AUTHORITY-UNAVAILABLE", reason: "WINDOWS-REQUESTER-STORAGE" }), "/repo");
  assert.match(platform, /\(SDC-AUTHORITY-UNAVAILABLE: WINDOWS-REQUESTER-STORAGE\)/u);
  assert.match(platform, /session-authority-repair\.mjs inspect --root \/repo/u);
  assert.match(ownerRouteRequesterRefusal(Object.assign(new Error("x"), { code: "OSV-REPLAY" }), "/repo"), /\(OSV-REPLAY\)/u, "no reason, no empty colon");
});

test("C21D: every private record name the requester bridge publishes passes the Windows path check", async () => {
  const { WINDOWS_REQUESTER_PRIVATE_REF: check } = await import("../lib/windows-requester-runtime.mjs");
  const source = readFileSync(new URL("../lib/session-requester-bridge.mjs", import.meta.url), "utf8");
  const published = [...source.matchAll(/ensureNamespace\(r\),'(invocations|transports)','([a-z-]+-)'\+randomBytes\(12\)/gu)].map(([, directory, prefix]) => `${directory}/${prefix}`);
  assert.ok(published.length >= 5, `found only: ${published.join(", ")}`);
  for (const name of published) assert.match(`.git/agent-pipeline/run/session-requesters/${name}${"a".repeat(24)}.json`, check, name);
  assert.match(`.git/agent-pipeline/run/session-requesters/controller-${"a".repeat(24)}.1.json`, check, "the binding of a controller session");
  for (const refused of ["invocations/other-", "invocations/../child-", "transports/owner-route-"]) assert.doesNotMatch(`.git/agent-pipeline/run/session-requesters/${refused}${"a".repeat(24)}.json`, check, refused);
  assert.doesNotMatch(`.git/agent-pipeline/run/session-requesters/invocations/owner-route-${"A".repeat(24)}.json`, check, "the hex part stays lower case");
});

function ownerRouteInvocationFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "c21d-owner-route-")));
  execFileSync("git", ["init", "-q", root]);
  const commonDir = join(root, ".git");
  const directory = join(commonDir, "agent-pipeline", "run", "session-requesters", "invocations");
  mkdirSync(directory, { recursive: true });
  const repositorySha256 = createHash("sha256").update(canonical({ primaryRoot: root, commonDir })).digest("hex");
  const record = { schema: "pipeline.continuity-owner-route-invocation.v1", repositorySha256, sessionId: "controller-abc", lifecycleId: "close-1", entry: "continuity-result-close-plan", process: { platform: "win32", pid: 4242 } };
  const path = join(directory, `owner-route-${"a".repeat(24)}.json`);
  writeFileSync(path, `${canonical(record)}\n`);
  chmodSync(path, 0o644);
  return { root, path, record };
}

test("C21D: on Windows a killed owner-route call is found through the native reader, without POSIX owner checks", async () => {
  const { inspectSourceOwnedContinuityOwnerRouteInvocation: inspect } = await import("../lib/session-requester-bridge.mjs");
  const f = ownerRouteInvocationFixture();
  try {
    const input = { rootDir: f.root, sessionId: "controller-abc" };
    const reads = [];
    const found = inspect(input, { platform: "win32", readWindows: (path) => { reads.push(path); return readFileSync(path); }, processStatus: (p) => (p.pid === 4242 ? "dead" : "unknown") });
    assert.deepEqual({ ...found }, { status: "found", sessionId: "controller-abc", lifecycleId: "close-1", entry: "continuity-result-close-plan", ownerStatus: "dead" });
    assert.deepEqual(reads, [f.path]);
    const unreadable = inspect(input, { platform: "win32", readWindows: () => { throw new Error("WIN-AUTH"); }, processStatus: () => "dead" });
    assert.equal(unreadable.status, "absent", "a record the native reader refuses proves nothing");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C21D: on POSIX an owner-route record with open permissions stays refused", { skip: process.platform === "win32" }, async () => {
  const { inspectSourceOwnedContinuityOwnerRouteInvocation: inspect } = await import("../lib/session-requester-bridge.mjs");
  const f = ownerRouteInvocationFixture();
  try {
    assert.equal(inspect({ rootDir: f.root, sessionId: "controller-abc" }, { processStatus: () => "dead" }).status, "absent");
    chmodSync(f.path, 0o600);
    assert.equal(inspect({ rootDir: f.root, sessionId: "controller-abc" }, { processStatus: () => "dead" }).status, "found");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C21C: a resumed close past the prepared phase is not requalified", () => {
  const prepared = oneShotFixture({ startPhase: "tracked-close-finalized" });
  try {
    withRealPackage(prepared);
    writeFileSync(join(prepared.root, "specs/feature-abc/evidence/audit-request.json"), `${JSON.stringify({ criticVerifyLifecycleId: "d".repeat(64) })}\n`);
    const result = oneShotClose({ ...prepared.input, resumeLifecycleId: "lc-1" }, { runCommand: prepared.runner });
    assert.equal(result.stages?.includes("requalify-candidate") ?? false, false, JSON.stringify(result).slice(0, 300));
    assert.equal(prepared.calls.includes("verify-evidence-producer.mjs"), false, "no new Verify once the close is past prepared");
    assert.deepEqual(prepared.independenceChecks, []);
  } finally { rmSync(prepared.root, { recursive: true, force: true }); }
});

test("C21C: a first run that finds its package already completed on this HEAD does not move it again", () => {
  const f = oneShotFixture();
  try {
    const { packaged, read } = withRealPackage(f);
    const value = read(); value.candidate = { commit: f.git("rev-parse", "HEAD").trim(), tree: f.git("rev-parse", "HEAD^{tree}").trim() };
    writeFileSync(join(f.root, "specs/feature-abc/lifecycle.json"), `${JSON.stringify(value, null, 2)}\n`);
    const result = oneShotClose(f.input, { runCommand: packaged });
    assert.equal(result.status, "commit-required", JSON.stringify(result).slice(0, 400));
    assert.deepEqual(f.calls.filter((call) => call.startsWith("pipeline-state feature-package-")), []);
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
    assert.match(stopped.next, new RegExp(`--critic-packet-id ${refused.input.criticPacketId} `, "u"), "the printed resume keeps the packet: with two rounds on record it would stop at ONESHOT-CRITIC-PACKET-MISSING");
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

test("CFC-2: a rerun rolls back only its own uncommitted outputs of an earlier attempt, and leaves any other dirty tree to the Verify", () => {
  const f = oneShotFixture({ verifyRed: true });
  try {
    const manifest = join(f.root, "specs/feature-abc/lifecycle.json");
    writeFileSync(manifest, "{\"state\":\"implementing\"}\n"); f.git("add", "-A"); f.git("commit", "-q", "-m", "package");
    const leaveAttempt = () => {
      writeFileSync(manifest, "{\"state\":\"completed\"}\n");
      for (const name of ["audit-request.json", "verify-candidate.json"]) writeFileSync(join(f.root, "specs/feature-abc/evidence", name), "{}\n");
    };
    leaveAttempt();
    writeFileSync(join(f.root, "foreign.txt"), "x\n");
    oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(readFileSync(manifest, "utf8"), "{\"state\":\"completed\"}\n", "a foreign dirty path keeps every output");
    assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence/audit-request.json")), true);
    rmSync(join(f.root, "foreign.txt"));
    for (const name of ["audit-request.json", "verify-candidate.json"]) rmSync(join(f.root, "specs/feature-abc/evidence", name));
    oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(readFileSync(manifest, "utf8"), "{\"state\":\"completed\"}\n", "a modified package with no evidence of an earlier attempt is not touched");
    leaveAttempt();
    const before = f.calls.length;
    oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(readFileSync(manifest, "utf8"), "{\"state\":\"implementing\"}\n");
    assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence/audit-request.json")), false);
    assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence/verify-candidate.json")), false);
    assert.deepEqual(f.calls.slice(before), ["verify-evidence-producer.mjs"], "the Verify runs on the rolled back tree");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("CGF-21: closed-local names the Critic-bound push Verify with the packet of the close, argv as the close chain walk runs it", () => {
  const f = oneShotFixture({ closed: true, startPhase: "cleanup-complete" });
  try {
    const resumed = { ...f.input, criticPacketId: null, resumeLifecycleId: "lc-1" };
    assert.equal(oneShotClose(resumed, { runCommand: f.runner }).pushEvidence, undefined, "no readable audit request, so the close names no packet it cannot prove");
    mkdirSync(join(f.root, "specs/feature-abc/evidence"), { recursive: true });
    writeFileSync(join(f.root, "specs/feature-abc/evidence/audit-request.json"), `${JSON.stringify({ criticVerifyLifecycleId: "d".repeat(64) })}\n`);
    mkdirSync(join(f.root, ".git/agent-pipeline/critic-verify-lifecycle"), { recursive: true });
    writeFileSync(join(f.root, `.git/agent-pipeline/critic-verify-lifecycle/${"d".repeat(64)}.json`), JSON.stringify({ critic: { packetId: f.packetId } }));
    const done = oneShotClose(resumed, { runCommand: f.runner });
    assert.equal(done.status, "closed-local", JSON.stringify(done).slice(0, 400));
    assert.deepEqual(done.pushEvidence.argv.slice(1), ["--root", f.root, "--mode", "release", "--critic-packet-id", f.packetId, "--critic-evidence-feature-id", "feature-abc", "--out", "evidence/verify-latest.json"]);
    assert.match(done.pushEvidence.argv[0], /verify-evidence-producer\.mjs$/u);
    assert.doesNotMatch(done.pushEvidence.note, /aside/u);
    mkdirSync(join(f.root, "evidence"), { recursive: true }); writeFileSync(join(f.root, "evidence/verify-latest.json"), "{}\n");
    const again = oneShotClose(resumed, { runCommand: f.runner });
    assert.match(again.pushEvidence.note, /move the existing evidence\/verify-latest\.json aside/u);
    assert.deepEqual(forbidden(f.calls), []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ---- C22 (AC-108, PO decisions 2026-11-09): the human acceptance question, the effects the close really touched, the closed handover, the Critic reports ----
const ACCEPTANCE_FILE = "specs/feature-abc/acceptance.md"; const SPEC_POINTER = "# Acceptance pointer: feature-abc\n\nThe criteria are the approved Spec's (specs/feature-abc/spec.md).\n";
const EMPTY_DIGEST = sha256Of("");
const headOf = (f) => f.git("rev-parse", "HEAD").trim();
function packageFixture(f, { acceptanceAuthority = false } = {}) {
  const base = join(f.root, "specs/feature-abc"); const bytes = { "prd.md": "prd\n", "spec.md": "spec\n", "acceptance.md": SPEC_POINTER, "result.md": "# Result\n", "evidence/candidate.json": "{}\n" };
  for (const [name, text] of Object.entries(bytes)) writeFileSync(join(base, name), text);
  const entry = (cls, name, authority, mutability) => ({ class: cls, path: `specs/feature-abc/${name}`, sha256: sha256Of(bytes[name]), authority, mutability, retention: "active" });
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: "feature-abc", rigor: 1 }, state: "completed", artifacts: [entry("prd", "prd.md", true, "mutable"), entry("spec", "spec.md", true, "mutable"), entry("acceptance", "acceptance.md", acceptanceAuthority, "immutable"), entry("result", "result.md", false, "immutable"), entry("candidate-evidence", "evidence/candidate.json", false, "immutable")], candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, supersedes: null };
  writeFileSync(join(base, "lifecycle.json"), `${JSON.stringify(manifest, null, 2)}\n`); f.git("add", "-A"); f.git("commit", "-q", "-m", "package");
  return { manifestPath: "specs/feature-abc/lifecycle.json", pointerSha: sha256Of(SPEC_POINTER) };
}

test("C22 CGR-06: the one-shot stops once, before anything is written, with the one sentence to ask the human; the sentence says the close counts as the acceptance and names the open checks", () => {
  const f = oneShotFixture({ acceptance: false });
  try {
    const stopped = oneShotClose({ ...f.input, openChecks: ["real device check"] }, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 400));
    assert.equal(stopped.stage, "acceptance"); assert.equal(stopped.stop.code, "ONESHOT-ACCEPTANCE-REQUIRED");
    assert.match(stopped.stop.reason, /counts as the human acceptance of this feature package/u); assert.match(stopped.stop.reason, /real device check/u); assert.ok(stopped.stop.reason.includes("feature-abc"));
    assert.match(stopped.stop.repair, /--human-acceptance/u); assert.match(stopped.stop.repair, /--open-checks/u);
    assert.match(stopped.stop.repair, /how you really started or opened the delivered result[\s\S]*or say plainly that you could not and why/u, "the human decides knowing whether the result was really run");
    assert.deepEqual(f.calls, [], "no Verify, package or close stage ran"); assert.equal(existsSync(join(f.root, ACCEPTANCE_FILE)), false); assert.equal(f.git("status", "--porcelain").trim(), "");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C22 CGR-06: the answer is recorded in the feature's acceptance.md with the literal answer, the candidate commit and the open checks, labelled as an attribution record and not a signature", () => {
  const f = oneShotFixture({ acceptance: false });
  try {
    const head = headOf(f); const answer = "Yes, I accept."; // C28 (QG-04, restated in place): the fixed yes form, normalised for case and closing punctuation; the literal answer is recorded as given.
    const result = oneShotClose({ ...f.input, humanAcceptance: answer, openChecks: ["real device check"] }, { runCommand: f.runner });
    assert.equal(result.status, "commit-required", JSON.stringify(result).slice(0, 400));
    const text = readFileSync(join(f.root, ACCEPTANCE_FILE), "utf8");
    assert.ok(text.includes(JSON.stringify(answer)), "the literal answer"); assert.ok(text.includes(head), "the candidate commit"); assert.match(text, /real device check/u);
    assert.match(text, /attribution record/u); assert.match(text, /not a signature/u);
    assert.ok(result.commit.paths.includes(ACCEPTANCE_FILE), "the record travels in the one close commit"); assert.deepEqual(forbidden(f.calls), []);
    assert.throws(() => oneShotClose({ ...f.input, humanAcceptance: "  " }, { runCommand: f.runner }), (error) => error.code === "FINISH-ACCEPTANCE");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C22 CGR-06: a rerun with an acceptance recorded for the same candidate does not ask again, and a changed candidate asks again", () => {
  const f = oneShotFixture({ acceptance: false });
  try {
    const answer = "yes, I accept"; // C28 (QG-04, restated in place): the fixed yes form.
    assert.equal(oneShotClose({ ...f.input, humanAcceptance: answer }, { runCommand: f.runner }).status, "commit-required");
    f.git("checkout", "--", STATE_PATH);
    const again = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(again.status, "commit-required", JSON.stringify(again).slice(0, 400)); assert.ok(readFileSync(join(f.root, ACCEPTANCE_FILE), "utf8").includes(JSON.stringify(answer)), "the recorded answer is kept");
    f.git("add", "-A"); f.git("commit", "-q", "-m", "close outputs"); f.git("checkout", "HEAD~1", "--", STATE_PATH);
    const changed = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(changed.stage, "acceptance"); assert.equal(changed.stop.code, "ONESHOT-ACCEPTANCE-REQUIRED");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C22 CGR-06: a resumed close never asks (the question belongs to the evidence stages before the irreversible part)", () => {
  const f = oneShotFixture({ acceptance: false, startPhase: "checkpointed" });
  try {
    const resumed = oneShotClose({ ...f.input, criticPacketId: null, resumeLifecycleId: "lc-1" }, { runCommand: f.runner });
    assert.notEqual(resumed.stop?.code, "ONESHOT-ACCEPTANCE-REQUIRED", JSON.stringify(resumed).slice(0, 300));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// ---- C28 (AC-108, PO decision 2026-11-10 'Ablehnung im Close'): one fixed yes form, and a decline route that returns the feature to a correction round ----
const GERMAN_BUG_REPORT = "Man kann die raeder in level 2 nicht drehen. sonst gut"; // the answer a Codex greenfield human gave to the acceptance question
test("C28: the acceptance question states the one fixed yes form and the stop names both ways on", () => {
  const f = oneShotFixture({ acceptance: false });
  try {
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.stop.code, "ONESHOT-ACCEPTANCE-REQUIRED");
    assert.ok(stopped.stop.reason.includes("\"yes, I accept\""), `the question states the fixed form: ${stopped.stop.reason}`);
    assert.match(stopped.stop.repair, /"yes, I accept", "yes", "yes, accepted", "accepted", "I accept"/u); // C29 (C8, PO tile 2026-11-13): the closed list of clear yes forms replaces the one fixed form.
    assert.match(stopped.stop.repair, /--human-acceptance "<the human's literal answer>"/u); assert.match(stopped.stop.repair, /--human-decline "<the human's literal answer>"/u);
    assert.deepEqual(f.calls, []); assert.equal(f.git("status", "--porcelain").trim(), "");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C28: an answer that is not on the closed yes list is never recorded as an acceptance: it is a typed stop that names both ways on and writes nothing, whatever it says", () => {
  for (const answer of [GERMAN_BUG_REPORT, "yes, but the wheels do not turn", "no", "yes, I accept, but fix level 2", "yes, I accept?", "yes yes", "not accepted", "ja", "not good", "maybe ok later"]) { // C29 (C8): a bare "yes" is on the closed list now; "ja" is not an English project's form. C30g (PO 2026-11-17): a bare "ok" is a plainly positive answer on the list now (QG-04 restatement: it left this refusal list); "not good" is no positive form.
    const f = oneShotFixture({ acceptance: false });
    try {
      const stopped = oneShotClose({ ...f.input, humanAcceptance: answer }, { runCommand: f.runner });
      assert.equal(stopped.status, "stopped", JSON.stringify(stopped).slice(0, 300)); assert.equal(stopped.stage, "acceptance"); assert.equal(stopped.stop.code, "ONESHOT-ACCEPTANCE-NOT-YES", answer);
      assert.match(stopped.stop.repair, /--human-acceptance "<the human's literal answer>"/u); assert.match(stopped.stop.repair, /--human-decline/u);
      assert.deepEqual(f.calls, [], "no Verify, package or close stage ran"); assert.equal(existsSync(join(f.root, ACCEPTANCE_FILE)), false); assert.equal(f.git("status", "--porcelain").trim(), "", `nothing was written for ${JSON.stringify(answer)}`);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("C28: the fixed yes form is read normalised for case, surrounding space and closing punctuation, and the literal answer is recorded as given", () => {
  for (const answer of ["  YES, I accept!  ", "Yes, I accept.", "yes, i ACCEPT", "yes", "Yes!", "accepted", "yes accepted", "I accept."]) {
    const f = oneShotFixture({ acceptance: false });
    try {
      assert.equal(oneShotClose({ ...f.input, humanAcceptance: answer }, { runCommand: f.runner }).status, "commit-required", answer);
      assert.ok(readFileSync(join(f.root, ACCEPTANCE_FILE), "utf8").includes(JSON.stringify(answer)), "the literal answer");
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

// C30d (PO decision 2026-11-16, first Antigravity greenfield): a human who accepts and in the same breath names the next job ("yes! now push it") was asked a second time. An answer whose FIRST sentence is
// a form of the closed list is the acceptance; what follows is recorded with it and never read. A comma continues the sentence ("yes, but ..." stays a decline), a question mark never accepts, no keyword is searched.
test("C30d: a first sentence on the closed yes list accepts, the rest of the answer is recorded and never read; a comma, a question or any other first sentence still declines", () => {
  for (const answer of ["Yes, I accept! Now please push the branch.", "yes. then push it to the new branch", "Accepted!\nPlease close the feature and push.", "I accept. What is left?"]) {
    const f = oneShotFixture({ acceptance: false });
    try {
      assert.equal(oneShotClose({ ...f.input, humanAcceptance: answer }, { runCommand: f.runner }).status, "commit-required", answer);
      assert.ok(readFileSync(join(f.root, ACCEPTANCE_FILE), "utf8").includes(JSON.stringify(answer)), "the whole literal answer is recorded");
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
  for (const answer of ["yes, but level 2 is stuck. Then push", "Yes? Then push", "No. Yes, I accept.", "mostly fine! Then please push", "Now push it. Yes, I accept."]) { // C30g (QG-04 restatement): "good!" is a plainly positive first sentence on the list now; "mostly fine!" is not.
    const f = oneShotFixture({ acceptance: false });
    try {
      assert.equal(oneShotClose({ ...f.input, humanAcceptance: answer }, { runCommand: f.runner }).stop.code, "ONESHOT-ACCEPTANCE-NOT-YES", answer);
      assert.equal(f.git("status", "--porcelain").trim(), "", `nothing was written for ${JSON.stringify(answer)}`);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
  const asked = oneShotClose(oneShotFixture({ acceptance: false }).input, { runCommand: oneShotFixture({ acceptance: false }).runner });
  assert.match(asked.stop.reason, /when one of them is the first sentence, your next request may follow it/u, "the question says so");
  const de = oneShotFixture({ acceptance: false, continuity: true, language: "de" });
  try {
    assert.equal(oneShotClose({ ...de.input, humanAcceptance: "Ja, ich akzeptiere! Bitte jetzt pushen." }, { runCommand: de.runner }).status, "commit-required");
    assert.match(oneShotClose({ ...oneShotFixture({ acceptance: false, continuity: true, language: "de" }).input }, { runCommand: de.runner }).stop.reason ?? "", /darf danach Ihr nächster Auftrag folgen/u);
  } finally { rmSync(de.root, { recursive: true, force: true }); }
});

// C30g (PO decision 2026-11-17: "gut" and every plainly positive answer count as the acceptance; the signature before a push stays the final gate): the closed list grew by positive forms in both languages.
// It is still a closed list: a doubt, a "but", a negation or a free sentence is no acceptance, and the question names only the core forms plus a few examples.
test("C30g: a plainly positive answer on the closed list accepts in the project's language, a negation or a 'but' never does, and the question names examples of the positive forms", () => {
  for (const answer of ["good", "Great!", "ok", "Looks good.", "approved", "yes, perfect", "good! Now please push."]) {
    const f = oneShotFixture({ acceptance: false });
    try { assert.equal(oneShotClose({ ...f.input, humanAcceptance: answer }, { runCommand: f.runner }).status, "commit-required", answer); } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
  for (const answer of ["Gut!", "passt", "Super.", "ja, gut", "Okay", "einverstanden", "sieht gut aus", "gut. Bitte jetzt pushen."]) {
    const f = oneShotFixture({ acceptance: false, continuity: true, language: "de" });
    try { assert.equal(oneShotClose({ ...f.input, humanAcceptance: answer }, { runCommand: f.runner }).status, "commit-required", answer); } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
  for (const answer of ["good, but fix level 2", "nicht gut", "gut, aber Level 2 klemmt", "nicht ok", "gut?", "not approved"]) {
    for (const language of ["en", "de"]) {
      const f = oneShotFixture({ acceptance: false, continuity: language === "de", language });
      try {
        assert.equal(oneShotClose({ ...f.input, humanAcceptance: answer }, { runCommand: f.runner }).stop?.code, "ONESHOT-ACCEPTANCE-NOT-YES", `${language}: ${answer}`);
        assert.equal(f.git("status", "--porcelain").trim(), "", `nothing was written for ${JSON.stringify(answer)}`);
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    }
  }
  const asked = oneShotFixture({ acceptance: false }), askedDe = oneShotFixture({ acceptance: false, continuity: true, language: "de" });
  try {
    assert.match(oneShotClose(asked.input, { runCommand: asked.runner }).stop.repair, /, or another plainly positive answer such as "good", "ok", "approved"/u);
    assert.match(oneShotClose(askedDe.input, { runCommand: askedDe.runner }).stop.repair, / oder eine andere eindeutig zustimmende Antwort wie "gut", "passt", "ok"/u);
  } finally { rmSync(asked.root, { recursive: true, force: true }); rmSync(askedDe.root, { recursive: true, force: true }); }
});

test("C28: the fixed form follows the project's human-facing language so a German-speaking human answers in German, and falls back to English for any other language", () => {
  const de = oneShotFixture({ acceptance: false, continuity: true, language: "de" });
  try {
    const stopped = oneShotClose(de.input, { runCommand: de.runner });
    assert.ok(stopped.stop.reason.includes("\"ja, ich akzeptiere\""), stopped.stop.reason);
    assert.equal(oneShotClose({ ...de.input, humanAcceptance: "yes, I accept" }, { runCommand: de.runner }).stop.code, "ONESHOT-ACCEPTANCE-NOT-YES", "the English form is not the German project's form");
    assert.match(stopped.stop.reason, /^Nehmen Sie das Feature-Paket /u, "C29 (C8): the question itself is asked in the project's language");
    for (const refused of ["yes", "ja, aber Level 2 klemmt", "nein", "ja ja"]) assert.equal(oneShotClose({ ...de.input, humanAcceptance: refused }, { runCommand: de.runner }).stop.code, "ONESHOT-ACCEPTANCE-NOT-YES", refused);
    assert.equal(oneShotClose({ ...de.input, humanAcceptance: "Ja, ich akzeptiere." }, { runCommand: de.runner }).status, "commit-required");
  } finally { rmSync(de.root, { recursive: true, force: true }); }
  const deShort = oneShotFixture({ acceptance: false, continuity: true, language: "de" });
  try { // C29 (C8, Codex run 3): the human answered "ja akzeptiert" and was refused; it is on the closed German list now.
    assert.equal(oneShotClose({ ...deShort.input, humanAcceptance: "ja akzeptiert" }, { runCommand: deShort.runner }).status, "commit-required");
  } finally { rmSync(deShort.root, { recursive: true, force: true }); }
  const fr = oneShotFixture({ acceptance: false, continuity: true, language: "fr" });
  try { assert.ok(oneShotClose(fr.input, { runCommand: fr.runner }).stop.reason.includes("\"yes, I accept\"")); } finally { rmSync(fr.root, { recursive: true, force: true }); }
});

test("C28: --human-acceptance and --human-decline are exclusive, and a decline needs the human's literal words", () => {
  const f = oneShotFixture({ acceptance: false });
  try {
    for (const input of [{ humanAcceptance: "yes, I accept", humanDecline: GERMAN_BUG_REPORT }, { humanDecline: "  " }, { humanDecline: "x".repeat(501) }]) {
      assert.throws(() => oneShotClose({ ...f.input, ...input }, { runCommand: f.runner }), (error) => error.code === "FINISH-ACCEPTANCE");
    }
    assert.deepEqual(f.calls, []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C28: a decline records the literal words with the candidate and the time where an acceptance can never be read from, retires the bound Result through the State transition, runs no Verify and returns the correction steps in order", () => {
  const f = oneShotFixture({ acceptance: false, continuity: true });
  try {
    const head = headOf(f); const stateBefore = readFileSync(join(f.root, STATE_PATH), "utf8");
    const result = oneShotClose({ ...f.input, humanDecline: GERMAN_BUG_REPORT, openChecks: ["real device check"] }, { runCommand: f.runner, nowFn: () => "2026-11-10T12:00:00.000Z" });
    assert.equal(result.status, "declined", JSON.stringify(result).slice(0, 600)); assert.equal(result.featureId, "feature-abc");
    assert.match(result.decline.path, /^specs\/feature-abc\/evidence\/human-decline-[0-9a-f]{12}-[0-9a-f]{8}\.md$/u); assert.equal(result.decline.candidate, head);
    const text = readFileSync(join(f.root, result.decline.path), "utf8");
    assert.ok(text.includes(JSON.stringify(GERMAN_BUG_REPORT)), "the literal words"); assert.ok(text.includes(head), "the candidate commit"); assert.ok(text.includes("2026-11-10T12:00:00.000Z"), "the time"); assert.match(text, /not an acceptance/u);
    assert.equal(result.decline.sha256, sha256Of(text), "the digest the State history carries");
    assert.equal(readAcceptanceRecord(f.root, "feature-abc"), null, "a decline is never read as an acceptance, in either place");
    assert.equal(existsSync(join(f.root, ACCEPTANCE_FILE)), false);
    assert.deepEqual(f.calls.filter((call) => call.startsWith("pipeline-state")), ["pipeline-state continuity-result-retire-plan", "pipeline-state continuity-result-retire-apply"], "plan, then apply: the transition restores the Result and the package digest itself, so nothing is left to reconcile");
    assert.ok(!f.calls.includes("verify-evidence-producer.mjs") && !f.calls.some((call) => call.startsWith("close-coordinator")), "no Verify and no close stage ran");
    assert.notEqual(readFileSync(join(f.root, STATE_PATH), "utf8"), stateBefore); assert.equal(JSON.parse(readFileSync(join(f.root, STATE_PATH), "utf8")).continuity.authority.result, null);
    assert.ok(result.commit.paths.includes(result.decline.path), `the decline record travels in its own commit: ${result.commit.paths}`); assert.equal(result.commit.message.includes("git"), false);
    assert.ok(Array.isArray(result.next) && result.next.length >= 4, JSON.stringify(result.next));
    const [commitStep, correction, delta, closeAgain] = result.next;
    assert.match(commitStep, /commit/u); assert.match(correction, /prepare-dispatch\.mjs goldfish/u); assert.match(delta, /prepare-dispatch\.mjs critic --delta-request/u);
    assert.match(closeAgain, /--one-shot[\s\S]*--critic-packet-id <new-packet-id>/u); assert.doesNotMatch(closeAgain, new RegExp(f.packetId, "u"), "the new packet replaces the old one");
    assert.deepEqual(forbidden(f.calls), []);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C28: a decline in a project with no Continuity binding has no Result to retire and runs no State transition", () => {
  const plain = oneShotFixture({ acceptance: false });
  try {
    const result = oneShotClose({ ...plain.input, humanDecline: GERMAN_BUG_REPORT }, { runCommand: plain.runner });
    assert.equal(result.status, "declined", JSON.stringify(result).slice(0, 400)); assert.equal(result.retired, null);
    assert.deepEqual(plain.calls, [], "no State transition, no Verify");
  } finally { rmSync(plain.root, { recursive: true, force: true }); }
});

test("C28: the decline record is committed by the close's own commit route and is never rolled back by the leftover rule of a later close", () => {
  const f = oneShotFixture({ acceptance: false, continuity: true });
  try {
    const declined = oneShotClose({ ...f.input, humanDecline: GERMAN_BUG_REPORT }, { runCommand: f.runner });
    assert.equal(declined.status, "declined");
    f.git("add", "--", ...declined.commit.paths); f.git("commit", "-q", "-m", "decline outputs");
    assert.equal(f.git("status", "--porcelain").trim(), "", "everything the decline wrote is in the commit");
    assert.ok(readFileSync(join(f.root, declined.decline.path), "utf8").includes(JSON.stringify(GERMAN_BUG_REPORT)));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C22 CGR-06: the generated immutable pointer is replaced by the record WITHOUT a signature: the package entry is rebound with an amendment and the package still validates; an authority entry is never edited", () => {
  const f = oneShotFixture({ acceptance: false });
  try {
    const { manifestPath, pointerSha } = packageFixture(f);
    assert.equal(oneShotClose({ ...f.input, humanAcceptance: "yes, I accept" }, { runCommand: f.runner }).status, "commit-required"); // C28 (QG-04, restated in place): the fixed yes form instead of a bare "yes".
    const text = readFileSync(join(f.root, ACCEPTANCE_FILE), "utf8"); assert.ok(text.includes("# Acceptance pointer: feature-abc") && text.includes("\"yes, I accept\""));
    const entry = JSON.parse(readFileSync(join(f.root, manifestPath), "utf8")).artifacts.find((item) => item.class === "acceptance");
    assert.equal(entry.sha256, sha256Of(text)); assert.equal(entry.amendment.previousSha256, pointerSha); assert.equal(entry.mutability, "immutable"); assert.equal(entry.authority, false);
    assert.equal(validateFeaturePackage(f.root, manifestPath).ok, true, JSON.stringify(validateFeaturePackage(f.root, manifestPath).findings));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
  const g = oneShotFixture({ acceptance: false });
  try {
    const { manifestPath } = packageFixture(g, { acceptanceAuthority: true }); const before = readFileSync(join(g.root, manifestPath), "utf8");
    assert.equal(oneShotClose({ ...g.input, humanAcceptance: "yes, I accept" }, { runCommand: g.runner }).status, "commit-required");
    assert.equal(readFileSync(join(g.root, ACCEPTANCE_FILE), "utf8"), SPEC_POINTER, "a bound authority acceptance stays byte for byte"); assert.equal(readFileSync(join(g.root, manifestPath), "utf8"), before);
    assert.match(readFileSync(join(g.root, "specs/feature-abc/evidence/human-acceptance.md"), "utf8"), /"yes, I accept"/u);
  } finally { rmSync(g.root, { recursive: true, force: true }); }
});

test("C22 CGR-05: the tracked effects hash what exists (the calibrated handover, written by its own writer first, and the telemetry file) and keep the marked empty digest only for the rest", () => {
  const f = oneShotFixture({ handover: true, telemetry: true });
  try {
    const result = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(result.status, "commit-required", JSON.stringify(result).slice(0, 400));
    const tracked = JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/tracked-close.json"), "utf8"));
    assert.equal(tracked.handoverSha256, sha256Of(readFileSync(join(f.root, "docs/state.md"))), "the bytes after the writer ran"); assert.match(readFileSync(join(f.root, "docs/state.md"), "utf8"), /closed locally/u);
    assert.equal(tracked.telemetrySha256, sha256Of(readFileSync(join(f.root, "telemetry/costs.md"))));
    for (const key of ["backlogSha256", "historySha256", "retrospectiveSha256"]) assert.equal(tracked[key], EMPTY_DIGEST, key);
    assert.deepEqual(Object.keys(tracked).sort(), ["backlogSha256", "emptyInputs", "handoverSha256", "historySha256", "pipelineStateSha256", "resultSha256", "retrospectiveSha256", "schema", "telemetrySha256"]);
    assert.deepEqual(tracked.emptyInputs, ["backlogSha256", "historySha256", "retrospectiveSha256"], "an empty input is marked by name");
    assert.ok(f.calls.indexOf("pipeline-state update-public-handover") > f.calls.indexOf("pipeline-state close-feature"), f.calls.join());
    assert.ok(result.commit.paths.includes("docs/state.md"), result.commit.paths.join());
  } finally { rmSync(f.root, { recursive: true, force: true }); }
  const g = oneShotFixture();
  try {
    oneShotClose(g.input, { runCommand: g.runner });
    const tracked = JSON.parse(readFileSync(join(g.root, "specs/feature-abc/evidence/tracked-close.json"), "utf8"));
    for (const key of ["backlogSha256", "handoverSha256", "historySha256", "telemetrySha256", "retrospectiveSha256"]) assert.equal(tracked[key], EMPTY_DIGEST, `a project without the artefact keeps the marked empty digest (${key})`);
    assert.equal(g.calls.includes("pipeline-state update-public-handover"), false);
  } finally { rmSync(g.root, { recursive: true, force: true }); }
});

test("C22 CGF-12/CGF-29: after the close the calibrated handover is no longer active in design or implementation and states technical close, product acceptance and push as three facts, through the existing public-handover writer", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "closed-handover-")));
  try {
    mkdirSync(join(dir, "docs")); mkdirSync(join(dir, "specs/feature-abc"), { recursive: true });
    writeFileSync(join(dir, "docs/state.md"), "# State\n\n## Current state\n\nFeature `feature-abc` is active in implementation (PO profile: `light`).\nProject prose stays.\n\n## Decisions\n\nKeep this.\n");
    writeFileSync(join(dir, "specs/feature-abc/lifecycle.json"), `${JSON.stringify({ candidate: { commit: "c".repeat(40), tree: "d".repeat(40) }, artifacts: [] })}\n`);
    const closedState = { schema: "pipeline.state.v0", closedFeatures: [{ id: "feature-abc", closedBy: "PO" }] };
    assert.equal(syncPublicCurrentState(dir, closedState, "docs/state.md", "2026-11-09T10:00:00.000Z"), "updated");
    const text = readFileSync(join(dir, "docs/state.md"), "utf8");
    assert.doesNotMatch(text, /is active in/u); assert.match(text, /closed locally/u); assert.ok(text.includes("c".repeat(40)), "the candidate");
    for (const label of ["Technical close", "Product acceptance", "Push"]) assert.match(text, new RegExp(`^\\*\\*${label}:\\*\\*`, "mu"), label);
    assert.match(text, /^\*\*Product acceptance:\*\* not recorded/mu); assert.ok(text.includes("Project prose stays.") && text.includes("## Decisions\n\nKeep this.\n"));
    assert.equal(syncPublicCurrentState(dir, closedState, "docs/state.md", "2026-11-09T10:00:00.000Z"), "current", "idempotent");
    writeFileSync(join(dir, "specs/feature-abc/acceptance.md"), applyAcceptanceSection(null, renderAcceptanceSection({ candidate: "c".repeat(40), answer: "accepted", openChecks: ["device check"] })));
    assert.equal(syncPublicCurrentState(dir, closedState, "docs/state.md", "2026-11-09T10:00:00.000Z"), "updated");
    assert.match(readFileSync(join(dir, "docs/state.md"), "utf8"), /^\*\*Product acceptance:\*\* recorded/mu);
    const next = { schema: "pipeline.state.v0", activeFeature: { id: "feature-two", phase: "design" }, closedFeatures: closedState.closedFeatures };
    syncPublicCurrentState(dir, next, "docs/state.md", "2026-11-10T10:00:00.000Z");
    assert.doesNotMatch(readFileSync(join(dir, "docs/state.md"), "utf8"), /closed locally|Technical close/u, "a new active feature leaves no stale closed projection");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("C22 CGR-12: the audit request carries every Critic round report of the feature, and a round without an exported report is named, not omitted", () => {
  const f = oneShotFixture();
  try {
    const evidence = join(f.root, "specs/feature-abc/evidence"); const exported = "b".repeat(32); const lineageOnly = "c".repeat(32);
    mkdirSync(join(evidence, "critic", exported), { recursive: true }); writeFileSync(join(evidence, "critic", exported, "report.md"), "# report\n");
    writeFileSync(join(evidence, `critic-lineage-${"1".repeat(64)}.json`), `${JSON.stringify({ rounds: [{ packetId: lineageOnly }] })}\n`);
    assert.equal(oneShotClose(f.input, { runCommand: f.runner }).status, "commit-required");
    const request = JSON.parse(readFileSync(join(evidence, "audit-request.json"), "utf8"));
    assert.deepEqual(request.evidence.criticReports, [{ packetId: f.packetId, path: null }, { packetId: exported, path: `specs/feature-abc/evidence/critic/${exported}/report.md` }, { packetId: lineageOnly, path: null }]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// C28 (AC-108, WSL run): briefings and dispatch records stayed untracked. The close writes their redacted projection into the feature's evidence directory (so it travels in the
// one close commit) and names it in the audit request; with nothing to project, or an unreadable source, nothing is written and the close is not blocked.
test("C28: the close writes the redacted dispatch projection into the feature's evidence, names it in the audit request and commits it with the close", () => {
  const f = oneShotFixture();
  try {
    const text = "Briefing for /home/someone/src/repo and the plain parts.\n";
    const closeDispatchInputsFn = () => ({ records: [{ record: { taskId: "D-ONE", schema: "pipeline.dispatch-record.v4", runner: "claude", agentType: "goldfish-deep", model: "m", effort: "high", rulesetSha: "r".repeat(64), dispatcher: "elephant", candidateCommit: "a".repeat(40), commits: [], outcome: "succeeded", outcomeClassification: { kind: "authored-commit" }, resultSha256: null, report: { changedFiles: [] } } }],
      briefings: new Map([["D-ONE", [{ sha256: "e".repeat(64), path: "scratch/x.md", text, itemId: null }]]]) });
    const closed = oneShotClose(f.input, { runCommand: f.runner, closeDispatchInputsFn });
    assert.equal(closed.status, "commit-required");
    const path = "specs/feature-abc/evidence/dispatch-projection.json";
    const projection = JSON.parse(readFileSync(join(f.root, path), "utf8"));
    // C28e (Codex test run, PO 2026-11-13): the briefing travels as its digest only, never as text.
    assert.equal(projection.schema, "pipeline.close-dispatch-projection.v1"); assert.equal(projection.dispatches[0].briefing.status, "digest-only"); assert.equal(projection.dispatches[0].briefing.text, null); assert.ok(!JSON.stringify(projection).includes("/home/someone"));
    assert.equal(JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/audit-request.json"), "utf8")).evidence.dispatchProjectionPath, path);
    assert.ok(closed.commit.paths.includes(path), `the projection travels in the one close commit: ${closed.commit.paths}`);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

// C28c (PO decision 2026-11-11): the SBOM is a standard part of the close. A repository without dependency manifests gets an explicit not-applicable record, a lockfile it can read a complete one,
// and any blocking finding stops the close before the acceptance question or any write; only the human's literal override, recorded in the record, passes it.
test("C28c: the close writes the SBOM record (not-applicable here), names it in the audit request and commits it with the close", () => {
  const f = oneShotFixture();
  try {
    const closed = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(closed.status, "commit-required"); assert.ok(closed.stages.includes("sbom"));
    const path = "specs/feature-abc/evidence/sbom/record.json";
    const record = JSON.parse(readFileSync(join(f.root, path), "utf8"));
    assert.equal(record.status, "not-applicable"); assert.match(record.reason, /no dependency manifest/u);
    assert.equal(JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/audit-request.json"), "utf8")).evidence.sbomRecordPath, path);
    assert.ok(closed.commit.paths.includes(path), `the record travels in the one close commit: ${closed.commit.paths}`);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C28c: a lockfile the close can read gives a complete record with both documents in the close commit", () => {
  const f = oneShotFixture();
  try {
    writeFileSync(join(f.root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/left-pad": { version: "1.3.0" } } }));
    f.git("add", "package-lock.json"); f.git("commit", "-q", "-m", "lock");
    const closed = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(closed.status, "commit-required", JSON.stringify(closed).slice(0, 300));
    assert.equal(JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/sbom/record.json"), "utf8")).status, "complete");
    for (const name of ["record.json", "cyclonedx.json", "spdx.json"]) assert.ok(closed.commit.paths.includes(`specs/feature-abc/evidence/sbom/${name}`), name);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C28c: a lockfile format without a reader stops the close with the repair and writes nothing; only the PO's signed override passes it and is recorded", () => {
  const f = oneShotFixture();
  try {
    // The project's trust anchor names the PO's key (the policy file is committed, so HEAD is final before the request is made).
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" });
    const anchor = { keyReference: "po-key", publicKeySha256: createHash("sha256").update(pem).digest("hex") };
    mkdirSync(join(f.root, "project"), { recursive: true });
    writeFileSync(join(f.root, "project/critical-human-proof.json"), JSON.stringify({ schema: "pipeline.critical-human-proof-policy.v3", requiredKinds: ["push"], waivedKinds: [], trustAnchors: [anchor] }));
    // C28d: yarn.lock has a reader now; Podfile.lock (CocoaPods) still has none.
    writeFileSync(join(f.root, "Podfile.lock"), "PODS:\n"); f.git("add", "Podfile.lock", "project/critical-human-proof.json"); f.git("commit", "-q", "-m", "pods");
    const stopped = oneShotClose({ ...f.input, humanAcceptance: null }, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped"); assert.equal(stopped.stage, "sbom"); assert.equal(stopped.stop.code, "SBOM-ADAPTER-UNSUPPORTED");
    assert.match(stopped.stop.reason, /Podfile\.lock/u); assert.match(stopped.stop.repair, /SBOM_READERS/u);
    const requestPath = /--request (scratch\/sbom-override-request-[a-f0-9]{16}\.json)/u.exec(stopped.stop.repair)?.[1];
    assert.ok(requestPath !== undefined, `the stop names the request to sign: ${stopped.stop.repair}`);
    const proofPath = requestPath.replace("request", "proof");
    assert.match(stopped.stop.repair, /sign-intent/u); assert.ok(stopped.stop.repair.includes(`--sbom-override-proof ${proofPath}`)); assert.doesNotMatch(stopped.stop.repair, /literal words/u);
    assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence/audit-request.json")), false); assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence/sbom")), false);
    assert.deepEqual(f.calls, [], "no Verify ran and nothing was asked of the human");
    const request = JSON.parse(readFileSync(join(f.root, requestPath), "utf8"));
    const sign = (key, reference) => ({ schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: reference, publicKey: pem, signatureBase64: nodeSign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), key).toString("base64") });
    // The signing command mirrors the proof next to the request; a proof of a key the project does not name, or of another shape of path, is refused and nothing is recorded.
    const stranger = generateKeyPairSync("ed25519");
    writeFileSync(join(f.root, proofPath), JSON.stringify({ ...sign(stranger.privateKey, "other-key"), publicKey: stranger.publicKey.export({ type: "spki", format: "pem" }) }));
    const untrusted = oneShotClose({ ...f.input, sbomOverrideProof: proofPath }, { runCommand: f.runner });
    assert.equal(untrusted.status, "stopped"); assert.equal(untrusted.stop.code, "SBOM-OVERRIDE-KEY-UNTRUSTED"); assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence/sbom")), false);
    const stale = oneShotClose({ ...f.input, sbomOverrideProof: "scratch/sbom-override-proof-0000000000000000.json" }, { runCommand: f.runner });
    assert.equal(stale.stop.code, "SBOM-OVERRIDE-PROOF-STALE");
    assert.throws(() => oneShotClose({ ...f.input, sbomOverrideProof: "../outside.json" }, { runCommand: f.runner }), (error) => error.code === "FINISH-SBOM-OVERRIDE");
    writeFileSync(join(f.root, proofPath), JSON.stringify(sign(privateKey, "po-key")));
    const passed = oneShotClose({ ...f.input, sbomOverrideProof: proofPath }, { runCommand: f.runner });
    assert.equal(passed.status, "commit-required", JSON.stringify(passed).slice(0, 300));
    const record = JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/sbom/record.json"), "utf8"));
    assert.equal(record.status, "overridden"); assert.equal(record.override.actor, "PO"); assert.equal(record.override.blocked[0].path, "Podfile.lock");
    assert.equal(record.override.authority.kind, "po-signature"); assert.equal(record.override.authority.keyReference, "po-key"); assert.equal(record.override.authority.intentSha256, request.intentSha256);
    for (const name of ["override-request.json", "override-proof.json"]) assert.ok(passed.commit.paths.includes(`specs/feature-abc/evidence/sbom/${name}`), `the signed override travels in the close commit: ${name}`);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C28c: without a trust anchor in the project a signed override cannot pass, and a words-only flag is no longer a flag", () => {
  const f = oneShotFixture();
  try {
    writeFileSync(join(f.root, "Podfile.lock"), "PODS:\n"); f.git("add", "Podfile.lock"); f.git("commit", "-q", "-m", "pods");
    const stopped = oneShotClose({ ...f.input, humanAcceptance: null }, { runCommand: f.runner });
    const requestPath = /--request (scratch\/sbom-override-request-[a-f0-9]{16}\.json)/u.exec(stopped.stop.repair)[1];
    const request = JSON.parse(readFileSync(join(f.root, requestPath), "utf8"));
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const proof = { schema: "pipeline.po-approval-proof.v1", intentSha256: request.approvalIntent.sha256, keyReference: "po-key", publicKey: publicKey.export({ type: "spki", format: "pem" }), signatureBase64: nodeSign(null, Buffer.from(request.approvalIntent.sha256, "utf8"), privateKey).toString("base64") };
    writeFileSync(join(f.root, requestPath.replace("request", "proof")), JSON.stringify(proof));
    const refused = oneShotClose({ ...f.input, sbomOverrideProof: requestPath.replace("request", "proof") }, { runCommand: f.runner });
    assert.equal(refused.stop.code, "SBOM-OVERRIDE-NO-TRUST-ANCHOR"); assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence/sbom")), false);
    const parsed = spawnSync(process.execPath, [fileURLToPath(new URL("./finish-feature.mjs", import.meta.url)), "--one-shot", "--by", "PO", "--architecture-impact", "no-architecture-impact", "--sbom-override", "words"], { encoding: "utf8" });
    assert.notEqual(parsed.status, 0); assert.match(`${parsed.stdout}${parsed.stderr}`, /FINISH-USAGE/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C28c: a stale SBOM record blocks the close until the record is removed", () => {
  const f = oneShotFixture();
  try {
    writeFileSync(join(f.root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/left-pad": { version: "1.3.0" } } }));
    f.git("add", "package-lock.json"); f.git("commit", "-q", "-m", "lock");
    const text = (path) => { try { return readFileSync(join(f.root, path), "utf8"); } catch { return null; } };
    const recorded = closeSbom({ featureId: "feature-abc", evidenceDir: "specs/feature-abc/evidence", tracked: ["package-lock.json"], read: text });
    for (const file of recorded.files) { mkdirSync(dirname(join(f.root, file.path)), { recursive: true }); writeFileSync(join(f.root, file.path), file.text); }
    writeFileSync(join(f.root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/left-pad": { version: "1.3.1" } } }));
    f.git("add", "package-lock.json"); f.git("commit", "-q", "-m", "lock moved");
    const stopped = oneShotClose(f.input, { runCommand: f.runner });
    assert.equal(stopped.status, "stopped"); assert.equal(stopped.stage, "sbom"); assert.equal(stopped.stop.code, "SBOM-SOURCE-INPUTS-STALE"); assert.match(stopped.stop.repair, /Remove the sbom directory/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C28: nothing to project, or a source that cannot be read, writes no projection and never stops the close", () => {
  for (const closeDispatchInputsFn of [() => ({ records: [], briefings: new Map() }), () => { throw new Error("unreadable evidence directory"); }]) {
    const f = oneShotFixture();
    try {
      assert.equal(oneShotClose(f.input, { runCommand: f.runner, closeDispatchInputsFn }).status, "commit-required");
      assert.equal(existsSync(join(f.root, "specs/feature-abc/evidence/dispatch-projection.json")), false);
      assert.equal(Object.hasOwn(JSON.parse(readFileSync(join(f.root, "specs/feature-abc/evidence/audit-request.json"), "utf8")).evidence, "dispatchProjectionPath"), false);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

test("the close fetches a missing Critic report itself, inside its own evidence directory, and a failing export only leaves the round named", () => {
  const f = oneShotFixture();
  try {
    const evidence = join(f.root, "specs/feature-abc/evidence"); const seen = [];
    const exportCriticRoundFn = ({ root, packetId, outDir }) => {
      seen.push(packetId);
      if (packetId === f.packetId) throw new Error("no journal for this round");
      mkdirSync(join(root, outDir), { recursive: true }); writeFileSync(join(root, outDir, "report.md"), "# from the journal\n");
    };
    const fetched = "c".repeat(32);
    writeFileSync(join(evidence, `critic-lineage-${"1".repeat(64)}.json`), `${JSON.stringify({ rounds: [{ packetId: fetched }] })}\n`);
    const closed = oneShotClose(f.input, { runCommand: f.runner, exportCriticRoundFn });
    assert.equal(closed.status, "commit-required");
    assert.deepEqual(seen.sort(), [f.packetId, fetched].sort());
    assert.ok(closed.commit.paths.includes(`specs/feature-abc/evidence/critic/${fetched}/report.md`), `the fetched report travels in the one close commit: ${closed.commit.paths}`);
    const request = JSON.parse(readFileSync(join(evidence, "audit-request.json"), "utf8"));
    assert.deepEqual(request.evidence.criticReports, [{ packetId: f.packetId, path: null }, { packetId: fetched, path: `specs/feature-abc/evidence/critic/${fetched}/report.md` }]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C22 CGR-22: the minors of the bound Critic round are listed in the handover inside the close commit, the result names them, and an unreadable packet never blocks", () => {
  const verdict = { verdict: { findings: [{ severity: "minor", gap: "a small gap" }, { severity: "major", gap: "not a minor" }] } };
  const withHandover = () => { const fixture = oneShotFixture(); mkdirSync(join(fixture.root, "docs"), { recursive: true }); writeFileSync(join(fixture.root, "docs/state.md"), "# State\n"); return fixture; };
  const f = withHandover();
  try {
    const result = oneShotClose(f.input, { runCommand: f.runner, readConsumedCandidateResultFn: () => ({ result: verdict }) });
    assert.equal(result.status, "commit-required");
    const text = readFileSync(join(f.root, "docs/state.md"), "utf8");
    assert.ok(text.includes(`CRF-${f.packetId}-1`) && text.includes("a small gap") && !text.includes("not a minor"), text);
    assert.match(result.openMinors, /1 open, 0 accepted/u);
    assert.ok(result.commit.paths.includes("docs/state.md"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
  const unreadable = withHandover();
  try {
    const result = oneShotClose(unreadable.input, { runCommand: unreadable.runner, readConsumedCandidateResultFn: () => { throw new Error("packet cleaned up"); } });
    assert.equal(result.status, "commit-required");
    assert.match(result.openMinors, /none recorded/u);
  } finally { rmSync(unreadable.root, { recursive: true, force: true }); }
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
    const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" }); // measured: a run asked --help and was never told of the one-shot entry
    assert.equal(help.status === 0, false); assert.match(help.stderr, /finish-feature\.mjs --one-shot --by/u);
    // Candidate 29 (Codex run 3, T1): --one-shot and --stage are order-independent; the same close in another order
    // reaches the same stop instead of FINISH-USAGE. A doubled --one-shot or --stage is still a usage refusal.
    for (const argv of [["--root", f.root, "--one-shot", "--by", "PO", "--architecture-impact", "no-architecture-impact"],
      ["--by", "PO", "--architecture-impact", "no-architecture-impact", "--root", f.root, "--one-shot"],
      ["--stage", "--one-shot", "--root", f.root, "--by", "PO", "--architecture-impact", "no-architecture-impact"]]) {
      const reordered = spawnSync(process.execPath, [script, ...argv], { encoding: "utf8" });
      assert.equal(reordered.status, 2, argv.join(" "));
      assert.doesNotMatch(reordered.stderr, /FINISH-USAGE/u, argv.join(" "));
      assert.equal(JSON.parse(reordered.stdout).stop.code, "ONESHOT-NO-ACTIVE-FEATURE", argv.join(" "));
    }
    for (const argv of [["--one-shot", "--one-shot", "--root", f.root], ["--one-shot", "--stage", "--root", f.root, "--stage"]]) {
      const doubled = spawnSync(process.execPath, [script, ...argv], { encoding: "utf8" });
      assert.equal(doubled.status, 2); assert.match(doubled.stderr, /FINISH-USAGE/u, argv.join(" "));
    }
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

// ---- C22B (AC-108): the close reports product and evidence commits of the feature range apart, and its status comes from receipts ----
// CGR-13 (PO decision: the commits stay as they are): a commit is an evidence commit when every path it touches is an administration/documentation path of the
// shared path set, a path under specs/<feature>/evidence/ or audit-bundles/, or a root evidence record; any other path (source, an ADR, the spec text) makes it a product commit.
function commitFile(f, path, text, message) { mkdirSync(dirname(join(f.root, path)), { recursive: true }); writeFileSync(join(f.root, path), text); f.git("add", "-A"); f.git("commit", "-q", "-m", message); }
function closedLocalFixture() {
  const f = oneShotFixture({ closed: true, startPhase: "cleanup-complete" });
  f.resumed = { ...f.input, criticPacketId: null, resumeLifecycleId: "lc-1" };
  return f;
}
test("C22B CGR-13: closed-local counts the product commits and the evidence commits of the feature range separately, by the touched paths", () => {
  const f = closedLocalFixture();
  try {
    // the baseline commit (state file and the feature's result.md) is the first commit that touches specs/feature-abc: an evidence commit
    commitFile(f, "src/app.mjs", "export const a = 1;\n", "feat: product");
    commitFile(f, "specs/feature-abc/evidence/run.json", "{}\n", "chore: evidence record");
    commitFile(f, "docs/guide.md", "# guide\n", "docs: a guide");
    commitFile(f, "docs/adr/0002-choice.md", "# decision\n", "docs: an ADR is a decision, so content");
    commitFile(f, `specs/feature-abc/evidence/critic/${"b".repeat(32)}/report.md`, "# report\n", "chore: critic export");
    commitFile(f, "audit-bundles/feature-abc/x/README.md", "# bundle\n", "chore: bundle");
    mkdirSync(join(f.root, "specs/feature-abc/evidence"), { recursive: true }); writeFileSync(join(f.root, "specs/feature-abc/evidence/mixed.json"), "{}\n"); commitFile(f, "src/b.mjs", "export const b = 2;\n", "feat: product plus evidence in one commit");
    const done = oneShotClose(f.resumed, { runCommand: f.runner });
    assert.equal(done.status, "closed-local", JSON.stringify(done).slice(0, 400));
    assert.equal(done.commits.schema, "pipeline.close-commit-split.v1");
    assert.deepEqual([done.commits.product, done.commits.evidence, done.commits.total], [3, 5, 8], JSON.stringify(done.commits));
    assert.equal(typeof done.commits.rangeSource, "string", "the range names where its base came from");
    assert.match(done.message, /3 product commit\(s\) and 5 evidence commit\(s\)/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("R8: closed-local states what the security result covers, read from the v2 verdict; a missing verdict is typed unavailable and never blocks", () => {
  const f = closedLocalFixture();
  try {
    const none = oneShotClose(f.resumed, { runCommand: f.runner });
    assert.equal(none.status, "closed-local", JSON.stringify(none).slice(0, 400));
    assert.equal(none.securityScope.status, "unavailable");
    assert.match(none.message, /Security scope: unavailable \(the v2 security verdict could not be read\); what the security result covers is open\./u); // C29 (C3): said, not left out.
    // C29e T4: the last sentence names where the security verdict and final Verify reach the bundle.
    assert.match(none.message, /reach the audit bundle only with the evidence follow-up of the next push; until then this feature's audit bundle holds no security evidence\.$/u);
    mkdirSync(join(f.root, "evidence"), { recursive: true });
    // The shape a real scan writes: scanners under capabilityOutcomes, only the checks without a capability under controls.
    writeFileSync(join(f.root, "evidence/security-latest.v2.verdict.json"), JSON.stringify({ schema: "pipeline.security-verdict.v2", exitAuthority: "v1-blocking-logic", plan: { required: ["cap.sast", "cap.secrets"], optional: [] }, verdict: { blocking: false, offendingCapabilities: [] },
      capabilityOutcomes: { "cap.secrets": "pass", "cap.sca": "not-applicable", "cap.sast": "pass" }, controls: [{ control: "license-check", tool: "license-check", capabilityId: null, required: false, runOutcome: "pass" }] }));
    const done = oneShotClose(f.resumed, { runCommand: f.runner });
    assert.equal(done.status, "closed-local", JSON.stringify(done).slice(0, 400));
    assert.equal(done.securityScope.v2VerdictReportingOnly, true);
    assert.equal(done.securityScope.capabilityPlan.empty, false);
    assert.deepEqual(done.securityScope.checksRan, ["cap.secrets", "cap.sast", "license-check"]);
    assert.deepEqual(done.securityScope.checksNotRun, [{ check: "cap.sca", outcome: "not-applicable", required: false }]);
    assert.match(done.message, /Security scope: the exit is decided by v1-blocking-logic, the v2 policy verdict is reporting only; capability plan: 2 required, 0 optional; checks that ran: cap\.secrets, cap\.sast, license-check; did not run: cap\.sca \(not-applicable\)\./u);
    assert.doesNotMatch(done.message, /plan is empty/u);
    // C29 (C3, Codex run 3): an empty, reporting-only plan is said as open, never as a passed control.
    writeFileSync(join(f.root, "evidence/security-latest.v2.verdict.json"), JSON.stringify({ schema: "pipeline.security-verdict.v2", exitAuthority: "v1-blocking-logic", plan: { required: [], optional: [] }, verdict: { blocking: false, offendingCapabilities: [] }, capabilityOutcomes: {}, controls: [] }));
    const empty = oneShotClose(f.resumed, { runCommand: f.runner });
    assert.equal(empty.securityScope.capabilityPlan.empty, true);
    assert.match(empty.message, /capability plan: empty; checks that ran: none; did not run: none\. The v2 capability plan is empty, so no capability control counts as passed; it stays open\./u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("R9: closed-local names a calibration that still says local-only beside a real remote and says to correct it before the push in the same feature", () => {
  const f = closedLocalFixture();
  try {
    assert.equal(Object.hasOwn(oneShotClose(f.resumed, { runCommand: f.runner }), "repositoryMode"), false, "no remote: nothing to say");
    f.git("remote", "add", "publish", "https://example.invalid/x.git");
    assert.equal(Object.hasOwn(oneShotClose(f.resumed, { runCommand: f.runner }), "repositoryMode"), false, "a remote but no local-only calibration: nothing to say");
    const calibration = join(f.root, ".claude", "pipeline.json");
    const before = existsSync(calibration) ? JSON.parse(readFileSync(calibration, "utf8")) : {};
    mkdirSync(join(f.root, ".claude"), { recursive: true });
    writeFileSync(calibration, JSON.stringify({ ...before, repositoryMode: "local-only" }));
    const done = oneShotClose(f.resumed, { runCommand: f.runner });
    assert.equal(done.status, "closed-local", JSON.stringify(done).slice(0, 400));
    assert.deepEqual(done.repositoryMode.remotes, ["publish"]);
    assert.match(done.message, /still says local-only although a remote exists \(publish\)/u);
    // QG-04, restated in place (C28-ONBOARDING-QUESTIONS, PO decision 2026-11-10): this pin said "a calibration commit now ends the Critic carry ... leave it for
    // the next feature". The carry now admits exactly the one-token repositoryMode promotion (lib/critic-evidence-carry.mjs), so the close names the correction
    // before the push in the same feature, with the Verify rerun. Same subject (what the close says about the mismatch), same strength.
    assert.match(done.message, /same feature/u);
    assert.match(done.message, /admits exactly that one-token change/u);
    assert.match(done.message, /repository-mode-promote\.mjs/u);
    assert.doesNotMatch(done.message, /next feature|ends the Critic carry/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C22B CGR-13: a range that cannot be read is typed unavailable and never blocks the close", () => {
  const f = closedLocalFixture();
  try {
    const runner = (executable, argv) => (executable === "git" && argv[0] === "log" ? { status: 128, stdout: "", stderr: "fatal" } : f.runner(executable, argv));
    const done = oneShotClose(f.resumed, { runCommand: runner });
    assert.equal(done.status, "closed-local", JSON.stringify(done).slice(0, 400));
    assert.equal(done.commits.status, "unavailable"); assert.equal(typeof done.commits.reason, "string");
    assert.equal(done.commits.product, undefined, "no count is invented");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C22B CGF-12: the closed-local status separates product acceptance, technical close and push and reads the acceptance from its record", () => {
  const f = closedLocalFixture();
  try {
    const none = oneShotClose(f.resumed, { runCommand: f.runner });
    assert.equal(none.status, "closed-local", JSON.stringify(none).slice(0, 400));
    // C28 (QG-04, restated in place): the three statuses stay as they were; `statuses` is the new fourth key, the one four-fact vocabulary the State inspector prints too.
    assert.deepEqual(Object.keys(none.closeStatus).sort(), ["productAcceptance", "push", "statuses", "technicalClose"]);
    assert.equal(none.closeStatus.statuses.schema, "pipeline.feature-status.v1");
    assert.equal(none.closeStatus.statuses.humanAccepted.reached, false, "no acceptance record, no human-accepted");
    assert.match(none.message, /Status: package registered: [^;]+; implementation delivered: (?:yes|no); technically qualified: (?:yes|no); human-accepted: no\./u);
    assert.equal(none.closeStatus.technicalClose.status, "closed-local");
    assert.equal(none.closeStatus.productAcceptance.status, "not-recorded");
    assert.equal(none.closeStatus.push.status, "not-done-by-the-close");
    const head = f.git("rev-parse", "HEAD").trim();
    writeFileSync(join(f.root, "specs/feature-abc/acceptance.md"), applyAcceptanceSection(null, renderAcceptanceSection({ candidate: head, answer: "accepted", openChecks: ["device check"] })));
    const recorded = oneShotClose(f.resumed, { runCommand: f.runner });
    assert.equal(recorded.closeStatus.productAcceptance.status, "recorded"); assert.equal(recorded.closeStatus.productAcceptance.candidate, head);
    assert.deepEqual(recorded.closeStatus.productAcceptance.openChecks, ["device check"]);
    assert.match(recorded.message, /Technical close: closed-local\. Product acceptance: recorded\. Push: not done by the close\./u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("C22B CGF-12: the handover's technical-close line is read from the recorded close entry, never stated as done from memory", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "closed-handover-receipt-")));
  try {
    mkdirSync(join(dir, "docs")); mkdirSync(join(dir, "specs/feature-abc"), { recursive: true });
    writeFileSync(join(dir, "docs/state.md"), "# State\n\n## Current state\n\nFeature `feature-abc` is active in implementation.\n");
    writeFileSync(join(dir, "specs/feature-abc/lifecycle.json"), `${JSON.stringify({ candidate: { commit: "c".repeat(40), tree: "d".repeat(40) }, artifacts: [] })}\n`);
    const entry = { id: "feature-abc", closedBy: "PO", closedAt: "2026-11-09T09:00:00.000Z", coordinatorClose: { lifecycleId: "lc-1", phase: "feature-close-prepared" } };
    syncPublicCurrentState(dir, { schema: "pipeline.state.v0", closedFeatures: [entry] }, "docs/state.md", "2026-11-09T10:00:00.000Z");
    const line = readFileSync(join(dir, "docs/state.md"), "utf8").split("\n").find((text) => text.startsWith("**Technical close:**"));
    assert.ok(line.includes("2026-11-09T09:00:00.000Z") && line.includes("lc-1") && line.includes("feature-close-prepared"), line);
    assert.doesNotMatch(line, /\bdone\b/u, "the close continues to freeze, final Verify and cleanup after this text is committed, so it is not claimed as done");
    const bare = { id: "feature-abc", closedBy: "PO" };
    syncPublicCurrentState(dir, { schema: "pipeline.state.v0", closedFeatures: [bare] }, "docs/state.md", "2026-11-09T10:00:00.000Z");
    assert.match(readFileSync(join(dir, "docs/state.md"), "utf8"), /^\*\*Technical close:\*\* .*not readable/mu, "an entry without a readable close time is named, not papered over");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

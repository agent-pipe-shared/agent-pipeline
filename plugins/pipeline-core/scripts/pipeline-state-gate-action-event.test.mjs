#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** LND-6 call-path coverage for candidate-bound push/deploy action artifacts. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateGovernanceActionEvent } from "../lib/governance-action-events.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { run, statePath } from "./pipeline-state.mjs";

const cases = [];
const injectedFailure = process.env.PIPELINE_GATE_ACTION_EVENT_TEST_INJECT_FAILURE ?? "";
function check(name, execute) {
  const id = `PSG${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({ id, name, run() {
    if (injectedFailure === id) assert.fail("intentional gate action event case-completion failure");
    try { return execute(); }
    catch (error) { console.error(`${id} ${name}: ${error?.stack ?? error}`); throw error; }
  } });
}

const NOW = "2026-09-12T08:00:00.000Z";
const TREE = "b".repeat(40);

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture({ humanChat = false, deployWaiver = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ps-gate-action-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "user.name", "Fixture");
  mkdirSync(join(root, "project"), { recursive: true });
  writeFileSync(statePath(root), `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "lnd6-feature", planPath: "specs/lnd6.md", phase: "implementation" },
    planApproved: true,
  }, null, 2)}\n`);
  writeFileSync(join(root, "pipeline.user.yaml"), [
    "schema: pipeline.user.v3",
    "gates:",
    ...(humanChat ? ["  human_approval: chat"] : []),
    "  push_approval: chat",
    "",
  ].join("\n"));
  if (deployWaiver) writeFileSync(join(root, "project", "critical-human-proof.json"), `${JSON.stringify({
    schema: "pipeline.critical-human-proof-policy.v2",
    requiredKinds: ["deploy"],
    waivedKinds: [{ kind: "deploy", reason: "documented fixture waiver for deploy" }],
  }, null, 2)}\n`);
  writeFileSync(join(root, "project", "push-threat-model.md"), "# Fixture push threat model\n");
  git(root, "add", "project/pipeline-state.json", "project/push-threat-model.md", "pipeline.user.yaml",
    ...(deployWaiver ? ["project/critical-human-proof.json"] : []));
  git(root, "commit", "-q", "-m", "fixture: committed global chat approval");
  const commit = git(root, "rev-parse", "HEAD");
  const deps = {
    dir: root,
    now: () => NOW,
    gitHead: () => ({ ok: true, commit }),
    gitCandidate: () => ({ ok: true, commit, tree: TREE }),
    isattyFn: () => { throw new Error("global chat must not inspect a terminal"); },
    readLineFn: () => { throw new Error("global chat must not read a terminal"); },
  };
  return { root, commit, deps };
}

function capture(argv, deps) {
  const priorLog = console.log;
  const priorError = console.error;
  const out = [];
  const err = [];
  console.log = (...args) => out.push(args.join(" "));
  console.error = (...args) => err.push(args.join(" "));
  try { return { status: run(argv, deps), out, err }; }
  finally { console.log = priorLog; console.error = priorError; }
}

function pushArgs(eventOut) {
  return ["approve-push", "--by", "PO", "--remote", "origin", "--destination", "refs/heads/main",
    ...(eventOut === undefined ? [] : ["--action-event-out", eventOut])];
}

function deployArgs(eventOut) {
  return ["approve-deploy", "--env", "production", "--artifact", "release-1", "--by", "PO",
    ...(eventOut === undefined ? [] : ["--action-event-out", eventOut])];
}

function actionFrom(root, rel) {
  return validateGovernanceActionEvent(JSON.parse(readFileSync(join(root, rel), "utf8")));
}

function state(root) { return JSON.parse(readFileSync(statePath(root), "utf8")); }

check("push approval publishes one completed event bound to the exact candidate", () => {
  const f = fixture({ humanChat: true });
  try {
    const rel = "evidence/actions/push.json";
    const result = capture(pushArgs(rel), f.deps);
    assert.equal(result.status, 0, result.err.join("\n"));
    const event = actionFrom(f.root, rel);
    assert.equal(event.kind, "gate");
    assert.equal(event.status, "completed");
    assert.equal(event.reasonCode, "PUSH_APPROVED");
    assert.deepEqual(event.candidate, { commit: f.commit, tree: TREE });
    assert.equal(JSON.parse(result.out.at(-1)).status, "completed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("waived deploy approval publishes one completed event bound to the exact candidate", () => {
  const f = fixture();
  try {
    const rel = "evidence/actions/deploy.json";
    const result = capture(deployArgs(rel), f.deps);
    assert.equal(result.status, 0, result.err.join("\n"));
    const event = actionFrom(f.root, rel);
    assert.equal(event.kind, "gate");
    assert.equal(event.reasonCode, "DEPLOY_APPROVED");
    assert.deepEqual(event.candidate, { commit: f.commit, tree: TREE });
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("invalid output is zero-mutation and cannot create a push chat challenge", () => {
  const f = fixture({ humanChat: true });
  try {
    const before = readFileSync(statePath(f.root), "utf8");
    let terminalCalls = 0;
    const result = capture(pushArgs("../outside.json"), {
      ...f.deps,
      isattyFn: () => { terminalCalls += 1; return true; },
      readLineFn: () => { terminalCalls += 1; return "anything"; },
    });
    assert.equal(result.status, 2);
    assert.match(result.err.join("\n"), /zero mutation/u);
    assert.equal(readFileSync(statePath(f.root), "utf8"), before);
    assert.equal(terminalCalls, 0);
    assert.equal(state(f.root).pendingPushChallenge, undefined);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("omitting action-event-out preserves the existing push and deploy call paths", () => {
  const push = fixture({ humanChat: true });
  const deploy = fixture();
  try {
    const pushResult = capture(pushArgs(), push.deps);
    const deployResult = capture(deployArgs(), deploy.deps);
    assert.equal(pushResult.status, 0, pushResult.err.join("\n"));
    assert.equal(deployResult.status, 0, deployResult.err.join("\n"));
    assert.match(pushResult.out.join("\n"), /^Push approved by/u);
    assert.match(deployResult.out.join("\n"), /^Deploy approval granted by/u);
    assert.ok(state(push.root).pushApproval?.lastApproved);
    assert.equal(state(deploy.root).deployApprovals?.length, 1);
    assert.equal(existsSync(join(push.root, "evidence")), false);
    assert.equal(existsSync(join(deploy.root, "evidence")), false);
  } finally {
    rmSync(push.root, { recursive: true, force: true });
    rmSync(deploy.root, { recursive: true, force: true });
  }
});

check("event-requested physical state readback failure publishes no event", () => {
  const f = fixture({ humanChat: true });
  try {
    const rel = "evidence/actions/readback-failed.json";
    const result = capture(pushArgs(rel), { ...f.deps, physicalStateReadback: () => ({ status: "absent" }) });
    assert.equal(result.status, 2);
    assert.match(result.err.join("\n"), /PS-STATE-POSTIMAGE-READBACK/u);
    assert.equal(existsSync(join(f.root, rel)), false);
    assert.ok(state(f.root).pushApproval?.lastApproved, "the result must not falsely describe the durable source mutation as zero");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("post-approval event conflict returns a typed event-only retry and preserves the conflict", () => {
  const f = fixture();
  try {
    const rel = "evidence/actions/conflict.json";
    const target = join(f.root, rel);
    const physicalStateReadback = () => {
      mkdirSync(join(f.root, "evidence", "actions"), { recursive: true });
      writeFileSync(target, "conflicting owner bytes\n");
      return { status: "ok", state: state(f.root) };
    };
    const result = capture(deployArgs(rel), { ...f.deps, physicalStateReadback });
    assert.equal(result.status, 2);
    const report = JSON.parse(result.err.at(-1));
    assert.equal(report.status, "source-complete/event-unavailable");
    assert.equal(report.source, "approved");
    assert.equal(report.code, "GGA-OUTPUT-EXISTS");
    assert.equal(report.retry.eventOutPath, rel);
    assert.equal(report.retry.event.reasonCode, "DEPLOY_APPROVED");
    assert.deepEqual(report.retry.event.candidate, { commit: f.commit, tree: TREE });
    assert.equal(readFileSync(target, "utf8"), "conflicting owner bytes\n");
    assert.equal(state(f.root).deployApprovals.length, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("waived deploy requires an exact candidate only when an event is requested", () => {
  const eventRequested = fixture({ deployWaiver: true });
  const compatible = fixture({ deployWaiver: true });
  try {
    const unavailable = () => ({ ok: false, error: "fixture candidate unavailable" });
    const before = readFileSync(statePath(eventRequested.root), "utf8");
    const rejected = capture(deployArgs("evidence/actions/deploy.json"), { ...eventRequested.deps, gitCandidate: unavailable });
    assert.equal(rejected.status, 2);
    assert.match(rejected.err.join("\n"), /current candidate commit\/tree could not be determined/u);
    assert.equal(readFileSync(statePath(eventRequested.root), "utf8"), before);
    assert.equal(existsSync(join(eventRequested.root, "evidence")), false);
    const legacy = capture(deployArgs(), { ...compatible.deps, gitCandidate: unavailable });
    assert.equal(legacy.status, 0, legacy.err.join("\n"));
  } finally {
    rmSync(eventRequested.root, { recursive: true, force: true });
    rmSync(compatible.root, { recursive: true, force: true });
  }
});

check("gate payload excludes approval identity, proof, destination, and subject detail", () => {
  const f = fixture({ humanChat: true });
  try {
    const rel = "evidence/actions/push-closed.json";
    const result = capture(pushArgs(rel), f.deps);
    assert.equal(result.status, 0, result.err.join("\n"));
    const event = actionFrom(f.root, rel);
    const forbidden = new Set(["by", "signer", "key", "proof", "reason", "remote", "destination", "artifact", "environment"]);
    const keys = [];
    const walk = (value) => {
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) { keys.push(key); walk(child); }
    };
    walk(event);
    assert.deepEqual(keys.filter((key) => forbidden.has(key)), []);
    assert.equal(JSON.stringify(event).includes("PO"), false);
    assert.equal(JSON.stringify(event).includes("origin"), false);
    assert.equal(JSON.stringify(event).includes("refs/heads/main"), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

assert.equal(cases.length, 8);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

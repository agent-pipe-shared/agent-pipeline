// SPDX-License-Identifier: SUL-1.0

// Tests for hooks/subagent-start-receipt.mjs (backlog item pipeline.every-dispatch-pays-a-bootstrap-receipt-detour,
// AC-169, slice ALF-C-AC169-B). The hook records the dispatch's bootstrap receipt at SubagentStart so the
// subagent's first Edit/Write/NotebookEdit is admitted without the refusal-then-retry detour.
// Every case runs the REAL guard (evaluateLifecycleReadyGuard) as the reader, so "admitted" means what the
// dispatch would actually experience; nothing here re-implements the receipt format.
//   S1 RED -> GREEN for one agent: the first write is refused before the event, admitted after it;
//   S2 A2: with the event as the only bootstrap act, the first write of every write tool is admitted and the
//      guard never records a refusal;
//   S3 one format, two routes: the SubagentStart receipt equals the step-0 receipt byte for byte (modulo the
//      agent id), and step 0 stays available as the fallback;
//   S4 binding: the receipt belongs to the announced agent id only; an identity-less payload records nothing;
//   S5 non-applicable and malformed payloads record nothing (path-shaped ids included) and never throw;
//   S6 a project that does not require enforcement gets no private state written;
//   S7 fail-open: an unwritable receipt leaves the guard's step-0 refusal in force, a throwing dependency
//      never escapes;
//   S8 the real script as a host would run it (stdin JSON, exit 0, empty stdout) in a throwaway git repository.
// The registration in hooks/hooks.json is a protected path; its assertion lives in the item's pin
// (lib/pins/every-dispatch-pays-a-bootstrap-receipt-detour.test.mjs, case C6), not here, so this file is
// green with or without the hooks.json patch.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateLifecycleReadyGuard } from "./guard-lifecycle-ready.mjs";
import { START_PREFLIGHT_SCRIPT } from "../lib/guard/constants.mjs";
import { recordSubagentStartReceipt } from "./subagent-start-receipt.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const SCRATCH = join(REPO, "scratch");
const HOOK = join(HERE, "subagent-start-receipt.mjs");
const AGENT_TYPE = "pipeline-core:goldfish-deep";
const READY = () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" });
const NOW = "1970-01-01T00:00:00.000Z";

// Containment for the one git fixture: no GIT_* variable of the host process reaches a fixture git call (a
// GIT_DIR inherited from a commit hook would otherwise point `git init` at the real repository), and git
// may not search above the fixture's parent.
function fixtureGitEnv(ceiling) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^GIT_/iu.test(key)) env[key] = value;
  env.GIT_CEILING_DIRECTORIES = ceiling;
  return env;
}

function fixture({ git = false } = {}) {
  mkdirSync(SCRATCH, { recursive: true });
  const base = mkdtempSync(join(SCRATCH, "subagent-start-receipt-"));
  const project = join(base, "project");
  mkdirSync(join(project, ".claude"), { recursive: true });
  mkdirSync(join(project, ".agent-pipeline"), { recursive: true });
  writeFileSync(join(project, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  writeFileSync(join(project, "pipeline.user.yaml"), "marker\n");
  const env = fixtureGitEnv(base);
  let commonDir;
  let seams;
  if (git) {
    execFileSync("git", ["init", "-q"], { cwd: project, env, stdio: "ignore" });
    commonDir = join(project, ".git");
    seams = { execFileSyncFn: (command, args, options) => execFileSync(command, args, { ...options, env }) };
  } else {
    commonDir = join(base, "common");
    mkdirSync(commonDir, { recursive: true });
    seams = { resolveGitCommonDirFn: () => commonDir };
  }
  const hookDeps = { projectDir: project, nowFn: () => NOW, ...seams };
  const guardDeps = { ...hookDeps, requireProjectOnboardingReadyFn: READY };
  const startEvent = (agentId, extra = {}) => ({
    hook_event_name: "SubagentStart",
    session_id: "session-ssr",
    transcript_path: join(base, "session.jsonl"),
    cwd: project,
    agent_id: agentId,
    agent_type: AGENT_TYPE,
    ...extra,
  });
  const dispatched = (toolName, toolInput, agentId) => ({
    tool_name: toolName,
    tool_input: toolInput,
    transcript_path: join(base, "session.jsonl"),
    agent_id: agentId,
    agent_type: AGENT_TYPE,
  });
  const receipt = (agentId) => join(commonDir, "agent-pipeline", "bootstrap-receipt", `${agentId}.json`);
  const observations = () => {
    const file = join(commonDir, "agent-pipeline", "bootstrap-receipt", "observations.jsonl");
    return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  };
  const writes = (agentId) => [
    ["Write", { file_path: join(project, "src", "implementation.mjs") }, agentId],
    ["Edit", { file_path: join(project, "src", "implementation.mjs") }, agentId],
    ["NotebookEdit", { notebook_path: join(project, "src", "implementation.ipynb") }, agentId],
  ];
  const firstWrite = (agentId) => evaluateLifecycleReadyGuard(f.dispatched(...f.writes(agentId)[0]), guardDeps);
  const f = {
    base, project, commonDir, env, hookDeps, guardDeps, startEvent, dispatched, receipt, observations, writes, firstWrite,
    privateTreeExists: () => existsSync(join(commonDir, "agent-pipeline")),
    cleanup: () => rmSync(base, { recursive: true, force: true, maxRetries: 3 }),
  };
  return f;
}

const preflight = (f, agentId) => f.dispatched("Bash", { command: `node "${START_PREFLIGHT_SCRIPT}"` }, agentId);

test("S1 RED to GREEN: the first write is refused before the SubagentStart event and admitted after it", () => {
  const f = fixture();
  try {
    const id = "ssr-before-after";
    const before = f.firstWrite(id);
    assert.equal(before.exitCode, 2, "without the event the first write is the detour this item is about");
    assert.match(before.stderr, /GUARD-BOOTSTRAP-RECEIPT-MISSING/u);
    assert.equal(existsSync(f.receipt(id)), false);

    const result = recordSubagentStartReceipt(f.startEvent(id), f.hookDeps);
    assert.deepEqual(result, { status: "delegated", agentId: id, agentType: AGENT_TYPE });
    assert.deepEqual(JSON.parse(readFileSync(f.receipt(id), "utf8")), {
      schema: "pipeline.bootstrap-receipt.v1", agentId: id, agentType: AGENT_TYPE, observedAt: NOW,
    });
    const after = f.firstWrite(id);
    assert.equal(after.exitCode, 0, after.stderr);
  } finally { f.cleanup(); }
});

test("S2/A2: with the event as the only bootstrap act, the first write of every write tool is admitted and no refusal is ever recorded", () => {
  const f = fixture();
  try {
    const id = "ssr-zero-refusal";
    recordSubagentStartReceipt(f.startEvent(id), f.hookDeps);
    for (const [tool, input] of f.writes(id)) {
      const r = evaluateLifecycleReadyGuard(f.dispatched(tool, input, id), f.guardDeps);
      assert.equal(r.exitCode, 0, `${tool}: ${r.stderr}`);
    }
    const decisions = f.observations().map((o) => o.decision);
    assert.ok(decisions.includes("allow-receipt-present"));
    assert.equal(decisions.includes("deny-no-receipt"), false, "the detour (a refusal) must never occur on the SubagentStart path");
  } finally { f.cleanup(); }
});

test("S3: one receipt format for both routes, and the step-0 route stays available as the fallback", () => {
  const f = fixture();
  try {
    recordSubagentStartReceipt(f.startEvent("ssr-route-hook"), f.hookDeps);
    const pre = evaluateLifecycleReadyGuard(preflight(f, "ssr-route-step0"), f.guardDeps);
    assert.equal(pre.exitCode, 0, "the sanctioned preflight is admitted");
    const normalized = (id) => readFileSync(f.receipt(id), "utf8").replaceAll(id, "<agent>");
    assert.equal(normalized("ssr-route-hook"), normalized("ssr-route-step0"),
      "the SubagentStart receipt is byte-identical to the step-0 receipt apart from the agent id");

    // The fallback is not displaced: the preflight of an agent that already holds a SubagentStart receipt is
    // still admitted and leaves a receipt the gate still accepts.
    const again = evaluateLifecycleReadyGuard(preflight(f, "ssr-route-hook"), f.guardDeps);
    assert.equal(again.exitCode, 0, again.stderr);
    assert.equal(f.firstWrite("ssr-route-hook").exitCode, 0);
  } finally { f.cleanup(); }
});

test("S4: the receipt belongs to the announced agent id; an identity-less payload records nothing", () => {
  const f = fixture();
  try {
    recordSubagentStartReceipt(f.startEvent("ssr-agent-a"), f.hookDeps);
    assert.equal(f.firstWrite("ssr-agent-a").exitCode, 0);
    const other = f.firstWrite("ssr-agent-b");
    assert.equal(other.exitCode, 2, "another agent's first write is still refused");
    assert.match(other.stderr, /GUARD-BOOTSTRAP-RECEIPT-MISSING/u);
  } finally { f.cleanup(); }
  const g = fixture();
  try {
    const { agent_id: _id, agent_type: _type, ...identityLess } = g.startEvent("unused");
    const result = recordSubagentStartReceipt(identityLess, g.hookDeps);
    assert.equal(result.status, "skipped");
    assert.equal(result.code, "SSR-NO-DISPATCH-IDENTITY");
    assert.equal(g.privateTreeExists(), false, "no private state is created for a payload without a dispatch identity");
  } finally { g.cleanup(); }
});

test("S5: non-applicable and malformed payloads record nothing, path-shaped ids included, and never throw", () => {
  const f = fixture();
  try {
    const valid = f.startEvent("ssr-valid-base");
    const notStart = [null, "SubagentStart", [], 7, {}, { ...valid, hook_event_name: "PreToolUse" },
      (({ hook_event_name: _h, ...rest }) => rest)(valid)];
    for (const payload of notStart) {
      assert.deepEqual(recordSubagentStartReceipt(payload, f.hookDeps), { status: "skipped", code: "SSR-NOT-SUBAGENT-START" });
    }
    const noIdentity = [
      { ...valid, agent_id: "../escape" }, { ...valid, agent_id: "a/b" }, { ...valid, agent_id: "a\\b" },
      { ...valid, agent_id: "" }, { ...valid, agent_id: "x".repeat(81) }, { ...valid, agent_id: 42 },
      { ...valid, agent_type: "bad type" }, { ...valid, agent_type: "" }, { ...valid, agent_type: 7 },
      (({ agent_type: _t, ...rest }) => rest)(valid), (({ agent_id: _i, ...rest }) => rest)(valid),
      { ...valid, transcript_path: "relative/session.jsonl" },
    ];
    for (const payload of noIdentity) {
      const r = recordSubagentStartReceipt(payload, f.hookDeps);
      assert.equal(r.status, "skipped", JSON.stringify(payload));
      assert.equal(r.code, "SSR-NO-DISPATCH-IDENTITY", JSON.stringify(payload));
    }
    assert.equal(f.privateTreeExists(), false, "not a single private file or directory is created for any of them");
  } finally { f.cleanup(); }
});

test("S6: a project that does not require enforcement gets no private state", () => {
  const f = fixture();
  try {
    const seen = [];
    const result = recordSubagentStartReceipt(f.startEvent("ssr-out-of-scope"), {
      ...f.hookDeps,
      observeGovernanceScopeFn: (request) => { seen.push(request); return { requiresEnforcement: false }; },
    });
    assert.deepEqual(result, { status: "skipped", code: "SSR-OUT-OF-GOVERNANCE" });
    assert.deepEqual(seen, [{ rootDir: f.project }]);
    assert.equal(f.privateTreeExists(), false);
  } finally { f.cleanup(); }
});

test("S7: fail-open - an unwritable receipt leaves the step-0 refusal in force; a throwing dependency never escapes", () => {
  const f = fixture();
  try {
    const id = "ssr-write-fails";
    const result = recordSubagentStartReceipt(f.startEvent(id), {
      ...f.hookDeps,
      writeFileSyncFn: () => { throw new Error("simulated receipt write failure"); },
    });
    assert.equal(result.status, "delegated");
    assert.equal(existsSync(f.receipt(id)), false);
    const refused = f.firstWrite(id);
    assert.equal(refused.exitCode, 2);
    assert.match(refused.stderr, /GUARD-BOOTSTRAP-RECEIPT-MISSING/u);
    assert.match(refused.stderr, /pipeline-start-preflight\.mjs/u, "the refusal still names the step-0 route");

    assert.deepEqual(recordSubagentStartReceipt(f.startEvent("ssr-no-common-dir"), {
      ...f.hookDeps, resolveGitCommonDirFn: () => null,
    }).status, "delegated");
    assert.equal(existsSync(f.receipt("ssr-no-common-dir")), false);

    assert.deepEqual(recordSubagentStartReceipt(f.startEvent("ssr-scope-throws"), {
      ...f.hookDeps,
      observeGovernanceScopeFn: () => { throw new Error("simulated governance fault"); },
    }), { status: "skipped", code: "SSR-FAULT" });
  } finally { f.cleanup(); }
});

test("S8: the script as a host runs it - stdin JSON, exit 0, empty stdout, receipt in the real git common dir, first write admitted", () => {
  const f = fixture({ git: true });
  try {
    const run = (stdin) => spawnSync(process.execPath, [HOOK], {
      input: stdin,
      encoding: "utf8",
      cwd: f.project,
      env: { ...f.env, CLAUDE_PROJECT_DIR: f.project },
      timeout: 120000,
    });
    const id = "ssr-process-run";
    const ok = run(JSON.stringify(f.startEvent(id)));
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout, "", "stdout would be injected into the subagent's context; the hook must print nothing");
    assert.deepEqual(JSON.parse(readFileSync(f.receipt(id), "utf8")).agentId, id);
    assert.equal(f.firstWrite(id).exitCode, 0);
    assert.equal(f.observations().map((o) => o.decision).includes("deny-no-receipt"), false);

    for (const [name, stdin] of [
      ["garbage stdin", "this is not json"],
      ["empty stdin", ""],
      ["another event", JSON.stringify({ ...f.startEvent("ssr-process-other-event"), hook_event_name: "PreToolUse" })],
      ["path-shaped id", JSON.stringify(f.startEvent("../ssr-process-escape"))],
    ]) {
      const r = run(stdin);
      assert.equal(r.status, 0, `${name}: ${r.stderr}`);
      assert.equal(r.stdout, "", name);
    }
    assert.equal(existsSync(f.receipt("ssr-process-other-event")), false);
    assert.equal(existsSync(join(f.commonDir, "agent-pipeline", "bootstrap-receipt", "..", "ssr-process-escape.json")), false);
  } finally { f.cleanup(); }
});

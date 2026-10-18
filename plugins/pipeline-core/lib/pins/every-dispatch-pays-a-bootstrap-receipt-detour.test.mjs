// SPDX-License-Identifier: SUL-1.0

// Pin for backlog item pipeline.every-dispatch-pays-a-bootstrap-receipt-detour (AC-169).
// Original acceptance, two points:
//   A1 "The receipt is recorded without agent cost (e.g. SubagentStart hook), or the template's step 0 runs the preflight."
//   A2 "A regression test shows the first Write of a freshly started dispatch is admitted."
// Cases, each through the real guard (evaluateLifecycleReadyGuard) / the real template and agent files:
//   C1 baseline: with no step 0 the first Write/Edit/NotebookEdit is refused (the detour this item is about);
//   C2 A2: step 0 (sanctioned preflight as the first Bash call) is admitted, records the receipt, and the
//      FIRST write of every write tool is admitted with zero refusals ever observed;
//   C3 the receipt is bound to the dispatch process: another agent's first write is still refused, the
//      orchestrator is never gated, a near-miss preflight records nothing;
//   C4 A1 (template alternative): the shipped template carries a step 0 that precedes the first write and
//      forbids the retry-after-refusal pattern;
//   C5 A1 (template alternative) executability: the step 0 route must be runnable with the tools the shipped
//      Goldfish role actually has. KNOWN GAP, see the todo case: template step 0 names the Skill
//      `pipeline-core:pipeline-start`, while goldfish-implementor's tool list has no Skill tool.
//   C6 A1 (SubagentStart alternative, PO decision 2026-10-17): hooks/subagent-start-receipt.mjs exists and
//      hooks/hooks.json registers it under SubagentStart. hooks.json is a PROTECTED path (TP-4): the registration
//      lands only through the signature-bound patch scratch/patches/ALF-C-AC169-B.patch, so until then this case
//      is RED and carries "[needs protected patch ALF-C-AC169-B]" in its title (the marker clears itself once the
//      registration is present). This replaces the earlier C6, which pinned that SubagentStart was NOT wired;
//      the template alternative below (C4/C5) stays in force as the fallback either way.
//   C7 A1+A2 through the hook: with the SubagentStart event as the only bootstrap act, the FIRST write of every
//      write tool is admitted and the guard never records a refusal (the hook's own unit cases live in
//      hooks/subagent-start-receipt.test.mjs, which is green with or without the hooks.json patch).
// RED discriminator: C1 is the unmodified-flow RED (no receipt -> refusal); a scratch mirror of the template
// step 0 without the preflight route shows C5's assertion can fail; C6's discriminator shows the registration
// predicate can fail on text mirrors, and C6 itself is RED against the unpatched hooks.json.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateLifecycleReadyGuard } from "../../hooks/guard-lifecycle-ready.mjs";
import { recordSubagentStartReceipt } from "../../hooks/subagent-start-receipt.mjs";
import { START_PREFLIGHT_SCRIPT } from "../guard/constants.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");
const SCRATCH = join(REPO, "scratch");
const TEMPLATE = join(REPO, "templates", "prompts", "goldfish-task.md");
const AGENT = join(REPO, "plugins", "pipeline-core", "agents", "goldfish-implementor.md");
const HOOKS_JSON = join(REPO, "plugins", "pipeline-core", "hooks", "hooks.json");
const AGENT_TYPE = "pipeline-core:goldfish-implementor";
const READY = () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "session" });

function fixture() {
  mkdirSync(SCRATCH, { recursive: true });
  const base = mkdtempSync(join(SCRATCH, "bootstrap-receipt-detour-"));
  const project = join(base, "project");
  const commonDir = join(base, "common");
  mkdirSync(join(project, ".claude"), { recursive: true });
  mkdirSync(join(project, ".agent-pipeline"), { recursive: true });
  mkdirSync(commonDir, { recursive: true });
  writeFileSync(join(project, ".agent-pipeline", "onboarding-consent.json"), JSON.stringify({
    schema: "pipeline.onboarding-consent-marker.v1",
    status: "consent-given-onboarding-incomplete",
    consentGivenAt: "2026-09-29T00:00:00.000Z",
  }));
  writeFileSync(join(project, "pipeline.user.yaml"), "marker\n");
  const deps = {
    projectDir: project,
    resolveGitCommonDirFn: () => commonDir,
    requireProjectOnboardingReadyFn: READY,
    nowFn: () => "1970-01-01T00:00:00.000Z",
  };
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
  return { base, project, deps, dispatched, receipt, observations, writes, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

const preflight = (f, agentId) => f.dispatched("Bash", { command: `node "${START_PREFLIGHT_SCRIPT}"` }, agentId);

test("C1 baseline (RED shape): a fresh dispatch that skips step 0 has every first write refused", () => {
  const f = fixture();
  try {
    for (const [tool, input, id] of f.writes("fresh-no-step0")) {
      const r = evaluateLifecycleReadyGuard(f.dispatched(tool, input, id), f.deps);
      assert.equal(r.exitCode, 2, tool);
      assert.match(r.stderr, /GUARD-BOOTSTRAP-RECEIPT-MISSING/u, tool);
    }
    assert.equal(existsSync(f.receipt("fresh-no-step0")), false);
  } finally { f.cleanup(); }
});

test("C2/A2: step 0 as the first call admits the first write of every write tool, with no refusal ever observed", () => {
  const f = fixture();
  try {
    const id = "fresh-step0";
    const pre = evaluateLifecycleReadyGuard(preflight(f, id), f.deps);
    assert.equal(pre.exitCode, 0, "the sanctioned preflight itself must be admitted before any receipt exists");
    assert.deepEqual(JSON.parse(readFileSync(f.receipt(id), "utf8")), {
      schema: "pipeline.bootstrap-receipt.v1", agentId: id, agentType: AGENT_TYPE, observedAt: "1970-01-01T00:00:00.000Z",
    });
    for (const [tool, input] of f.writes(id)) {
      const r = evaluateLifecycleReadyGuard(f.dispatched(tool, input, id), f.deps);
      assert.equal(r.exitCode, 0, `${tool}: ${r.stderr}`);
    }
    const decisions = f.observations().map((o) => o.decision);
    assert.ok(decisions.includes("allow-receipt-present"));
    assert.equal(decisions.includes("deny-no-receipt"), false, "the detour (a refusal) must never occur on the step-0 path");
  } finally { f.cleanup(); }
});

test("C3: the receipt belongs to the dispatch process; near-miss preflights record nothing; the orchestrator is never gated", () => {
  const f = fixture();
  try {
    evaluateLifecycleReadyGuard(preflight(f, "agent-a"), f.deps);
    const other = evaluateLifecycleReadyGuard(f.dispatched("Write", { file_path: join(f.project, "src", "x.mjs") }, "agent-b"), f.deps);
    assert.equal(other.exitCode, 2, "another agent's first write is still refused");
    assert.match(other.stderr, /GUARD-BOOTSTRAP-RECEIPT-MISSING/u);
    for (const command of ["pwd", `node "${START_PREFLIGHT_SCRIPT}" --extra`]) {
      evaluateLifecycleReadyGuard(f.dispatched("Bash", { command }, "agent-c"), f.deps);
    }
    assert.equal(existsSync(f.receipt("agent-c")), false, "a near-miss command must not mint a receipt");
    const orchestrator = evaluateLifecycleReadyGuard({
      tool_name: "Write", tool_input: { file_path: join(f.project, "src", "x.mjs") }, transcript_path: join(f.base, "session.jsonl"),
    }, f.deps);
    assert.equal(orchestrator.exitCode, 0, "orchestrator (no agent identity) is not receipt-gated");
  } finally { f.cleanup(); }
});

function step0Section(text) {
  const start = text.indexOf("**Step 0");
  assert.ok(start >= 0, "template must carry a Step 0 section");
  return { start, body: text.slice(start, text.indexOf("First output line", start)) };
}

test("C4/A1: the shipped template's step 0 precedes the first write and forbids retry-after-refusal", () => {
  const text = readFileSync(TEMPLATE, "utf8");
  const { start, body } = step0Section(text);
  assert.match(body, /before the opening record or any other write/u);
  assert.match(body, /before the first Edit, Write or NotebookEdit/u);
  assert.match(body, /do\s+not wait for a missing-receipt refusal and then retry/u);
  assert.match(body, /never copy the parent receipt/u);
  assert.ok(start < text.indexOf("Native host-commit mode"), "step 0 precedes the commit/record instructions");
});

const GAP_TITLE = "C5/A1: template step 0 is executable with the Goldfish role's own tools";
function step0Executable(templateText, agentText) {
  const { body } = step0Section(templateText);
  const listed = (/^tools:\s*(.+)$/mu.exec(agentText)?.[1] ?? "").trim();
  const tools = (/^\[(.*)\]$/u.exec(listed)?.[1] ?? listed).split(",").map((tool) => tool.trim());
  const hasSkill = tools.includes("Skill");
  const namesPlainRoute = /pipeline-start-preflight\.mjs/u.test(body);
  return hasSkill || namesPlainRoute;
}
test(GAP_TITLE, () => {
  assert.equal(step0Executable(readFileSync(TEMPLATE, "utf8"), readFileSync(AGENT, "utf8")), true);
});

test("C5 discriminator: the executability predicate can pass and can fail (scratch mirrors, production untouched)", () => {
  const template = "**Step 0 — x**\nrun node pipeline-start-preflight.mjs\nFirst output line";
  const bare = "**Step 0 — x**\ninvoke the skill\nFirst output line";
  assert.equal(step0Executable(template, "tools: Read, Bash"), true);
  assert.equal(step0Executable(bare, "tools: Read, Skill, Bash"), true);
  assert.equal(step0Executable(bare, "tools: Read, Edit, Write, Grep, Glob, Bash"), false);
  assert.equal(step0Executable(template, "tools: [Read, Bash]"), true);
  assert.equal(step0Executable(bare, "tools: [Read, Skill, Bash]"), true);
  assert.equal(step0Executable(bare, "tools: [Read, Edit, Write, Grep, Glob, Bash]"), false);
});

const HOOK_SCRIPT = join(REPO, "plugins", "pipeline-core", "hooks", "subagent-start-receipt.mjs");
const C6_PATCH_MARKER = "[needs protected patch ALF-C-AC169-B]";
function subagentStartRegistered(hooksJsonText, hookScriptExists) {
  const entries = JSON.parse(hooksJsonText)?.hooks?.SubagentStart;
  if (!hookScriptExists || !Array.isArray(entries)) return false;
  return entries.some((entry) => Array.isArray(entry?.hooks) && entry.hooks.some((handler) => handler?.type === "command"
    && typeof handler.command === "string"
    && /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/subagent-start-receipt\.mjs/u.test(handler.command)
    && Number.isFinite(handler.timeout) && handler.timeout > 0));
}
const c6Registered = subagentStartRegistered(readFileSync(HOOKS_JSON, "utf8"), existsSync(HOOK_SCRIPT));
test(`C6/A1: the SubagentStart receipt hook exists and is registered in hooks.json${c6Registered ? "" : ` ${C6_PATCH_MARKER}`}`, () => {
  assert.equal(existsSync(HOOK_SCRIPT), true, "hooks/subagent-start-receipt.mjs must exist");
  assert.equal(subagentStartRegistered(readFileSync(HOOKS_JSON, "utf8"), true), true,
    "hooks/hooks.json must register hooks/subagent-start-receipt.mjs under SubagentStart with a finite timeout (protected path: apply scratch/patches/ALF-C-AC169-B.patch)");
});

test("C6 discriminator: the registration predicate can pass and can fail (text mirrors, production untouched)", () => {
  const good = 'node "${CLAUDE_PLUGIN_ROOT}/hooks/subagent-start-receipt.mjs"';
  const wired = (command, extra = {}) => JSON.stringify({ hooks: { SubagentStart: [{ hooks: [{ type: "command", command, ...extra }] }] } });
  assert.equal(subagentStartRegistered(wired(good, { timeout: 15 }), true), true);
  assert.equal(subagentStartRegistered(JSON.stringify({ hooks: { SessionStart: [] } }), true), false, "event not wired");
  assert.equal(subagentStartRegistered(wired('node "${CLAUDE_PLUGIN_ROOT}/hooks/other-hook.mjs"', { timeout: 15 }), true), false, "another script");
  assert.equal(subagentStartRegistered(wired(good), true), false, "no timeout");
  assert.equal(subagentStartRegistered(wired(good, { timeout: 15 }), false), false, "script missing on disk");
});

test("C7/A1+A2: with the SubagentStart hook as the only bootstrap act, the first write of every write tool is admitted with zero refusals", () => {
  const f = fixture();
  try {
    const id = "fresh-subagent-start";
    const result = recordSubagentStartReceipt({
      hook_event_name: "SubagentStart",
      session_id: "session-c7",
      transcript_path: join(f.base, "session.jsonl"),
      cwd: f.project,
      agent_id: id,
      agent_type: AGENT_TYPE,
    }, f.deps);
    assert.equal(result.status, "delegated");
    assert.deepEqual(JSON.parse(readFileSync(f.receipt(id), "utf8")), {
      schema: "pipeline.bootstrap-receipt.v1", agentId: id, agentType: AGENT_TYPE, observedAt: "1970-01-01T00:00:00.000Z",
    });
    for (const [tool, input] of f.writes(id)) {
      const r = evaluateLifecycleReadyGuard(f.dispatched(tool, input, id), f.deps);
      assert.equal(r.exitCode, 0, `${tool}: ${r.stderr}`);
    }
    const decisions = f.observations().map((o) => o.decision);
    assert.ok(decisions.includes("allow-receipt-present"));
    assert.equal(decisions.includes("deny-no-receipt"), false, "the detour (a refusal) must never occur on the SubagentStart path");
  } finally { f.cleanup(); }
});

// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { finalizeNativeGoldfishHostReturn } from "./native-goldfish-host-finalizer.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE, NATIVE_GOLDFISH_RETURN_SCHEMA } from "./native-goldfish-host-return.mjs";
import { prepareNativeGoldfishHostState } from "./native-goldfish-host-state.mjs";
import { nativeGoldfishHookMessage } from "../hooks/native-goldfish-host.mjs";
import { writeHostObservedNativeGoldfishDispatchRecord } from "../scripts/dispatch-record-write.mjs";

const COMMIT = "a".repeat(40); const TREE = "b".repeat(40); const POST = "c".repeat(40); const POST_TREE = "d".repeat(40);
const rulesetSha = "e".repeat(64);
const criticDecision = { schema: "pipeline.critic-required-decision.v1",
  trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 1, riskClass: "medium", riskFlag: false,
    diff: { mechanical: false, architecture: true, guardrails: false, security: false } }, appliedRow: "T1" };

function fixture(run, runner = "claude", adapterVersion = 1) {
  const root = mkdtempSync(join(tmpdir(), "native-goldfish-host-finalizer-"));
  const commonDir = join(root, ".git");
  mkdirSync(commonDir);
  const facts = { commits: 0, publishedRecord: null };
  try {
    const binding = { schema: adapterVersion === 2 ? "pipeline.native-goldfish-host-briefing.v2" : "pipeline.native-goldfish-host-briefing.v1", dispatchId: `NGHF-${runner.toUpperCase()}-1`,
      candidateCommit: COMMIT, candidateTree: TREE, runner, role: "pipeline-core:goldfish-implementor",
      ...(adapterVersion === 2 ? { nativeAgentType: "worker" } : { agentType: "goldfish-implementor" }),
      model: runner === "claude" ? "claude-sonnet-5" : "gpt-6-luna",
      effort: "medium", rulesetSha, allowedPaths: ["src/change.mjs"], criticDecision };
    const prompt = `Goldfish task\n<!-- pipeline-native-goldfish-host-commit:v${adapterVersion}\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
    const input = runner === "claude"
      ? { cwd: root, session_id: "session-claude", hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "tool-claude",
        tool_input: { subagent_type: binding.role, prompt, run_in_background: false } }
      : { cwd: root, session_id: "session-codex", hook_event_name: "PreToolUse", tool_name: "spawn_agent", tool_use_id: "tool-codex",
        tool_input: { agent_type: binding.nativeAgentType ?? binding.agentType, message: prompt } };
    const stateDependencies = {
      git: (_root, args) => args.at(-1) === "HEAD^{commit}" ? COMMIT : TREE,
      resolveCommonDir: () => commonDir,
      captureBaseline: ({ root: candidateRoot, candidateCommit, resultPath }) => {
        assert.equal(existsSync(join(candidateRoot, resultPath)), false);
        return { ok: true, baseline: { schema: "pipeline.agy-host-commit-baseline.v1",
          root: candidateRoot, candidateCommit, resultPath, untracked: [] } };
      },
    };
    const prepared = prepareNativeGoldfishHostState({ root, runner, input }, stateDependencies);
    assert.equal(prepared.ok, true, prepared.code);
    if (runner === "codex") {
      const started = finalizeNativeGoldfishHostReturn({ runner, root, input: {
        ...input, hook_event_name: "SubagentStart", agent_id: "agent-1", agent_type: binding.nativeAgentType ?? binding.agentType, model: binding.model,
      } }, { resolveCommonDir: () => commonDir });
      assert.equal(started.status, "agent-bound", started.code);
    }
    const assess = ({ baseline, final, allowedPaths }) => ({ ok: true, code: "AGY-HOST-COMMIT-ADMITTED",
      root: baseline.root, candidateCommit: baseline.candidateCommit, paths: final.changedPaths,
      admittedBlobs: final.changedPaths.map((path) => ({ path, oid: "f".repeat(40) })), allowedPaths });
    const commit = ({ final, taskId }) => {
      facts.commits += 1;
      assert.equal(final.outcome, "succeeded");
      return { ok: true, code: "NATIVE-HOST-COMMIT-READBACK-VERIFIED", commit: POST,
        parent: COMMIT, tree: POST_TREE, paths: [...final.changedPaths] };
    };
    const dependencies = { resolveCommonDir: () => commonDir, assess, commit,
      writeRecord: ({ target, record }) => { facts.publishedRecord = record; return { target, sha256: "1".repeat(64) }; } };
    return run({ root, commonDir, binding, input, dependencies, facts });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const cases = [
  { id: "NGHF01", name: "Claude valid PostToolUse return commits and publishes a host-observed v4 record last", run: () => fixture(({ root, binding, dependencies, facts }) => {
    const text = JSON.stringify({ schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: binding.dispatchId,
      candidateCommit: COMMIT, outcome: "succeeded", report: "Implemented and verified; independent review pending.",
      changedPaths: ["src/change.mjs"] });
    const input = { hook_event_name: "PostToolUse", tool_name: "Agent", session_id: "session-claude",
      tool_use_id: "tool-claude", tool_input: { subagent_type: binding.role, prompt: "marked" },
      tool_response: { status: "completed", resolvedModel: binding.model, modelsUsed: [binding.model],
        content: [{ type: "text", text }] } };
    const result = finalizeNativeGoldfishHostReturn({ runner: "claude", root, input }, dependencies);
    assert.equal(result.status, "authored-commit-recorded", result.code);
    assert.equal(result.commit, POST);
    assert.equal(facts.publishedRecord.runner, "claude");
    assert.equal(facts.publishedRecord.candidateCommit, POST);
    assert.equal(facts.publishedRecord.criticRequired.appliedRow, "T1");
    assert.equal(facts.commits, 1);
    assert.match(nativeGoldfishHookMessage(result), /host commit verified/u);
  }) },
  { id: "NGHF02", name: "Codex result model drift is rejected before the host commit call", run: () => fixture(({ root, binding, dependencies, facts }) => {
    const stop = { hook_event_name: "SubagentStop", session_id: "session-codex", agent_id: "agent-1",
      agent_type: binding.nativeAgentType ?? binding.agentType, model: "unresolved-model", last_assistant_message: "{}" };
    const result = finalizeNativeGoldfishHostReturn({ runner: "codex", root, input: stop }, dependencies);
    assert.equal(result.status, "not-finalized");
    assert.equal(result.code, "NGHR-CODEX-CORRELATION");
    assert.equal(facts.commits, 0);
  }, "codex") },
  { id: "NGHF03", name: "Codex v2 commits the functional role and writes a versioned private worker observation", run: () => fixture(({ root, commonDir, binding, dependencies, facts }) => {
    const text = JSON.stringify({ schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: binding.dispatchId,
      candidateCommit: COMMIT, outcome: "succeeded", report: "Implemented and verified; independent review pending.",
      changedPaths: ["src/change.mjs"] });
    const result = finalizeNativeGoldfishHostReturn({ runner: "codex", root, input: { hook_event_name: "SubagentStop",
      session_id: "session-codex", agent_id: "agent-1", agent_type: "worker", model: binding.model,
      last_assistant_message: text } }, dependencies);
    assert.equal(result.status, "authored-commit-recorded", result.code);
    assert.equal(facts.publishedRecord.agentType, "goldfish-implementor");
    const observationDir = join(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit");
    const receipts = readdirSync(observationDir).filter((name) => name.startsWith("observation-codex-"));
    assert.equal(receipts.length, 1);
    const receipt = JSON.parse(readFileSync(join(observationDir, receipts[0]), "utf8"));
    assert.equal(receipt.schema, "pipeline.native-goldfish-host-observation.v2");
    assert.equal(receipt.nativeAgentType, "worker");
    assert.equal(receipt.hostMarker, "Native-Host-Observed: v2 (codex)");
    assert.match(receipt.assurance, /native-worker/u);
  }, "codex", 2) },

];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

for (const item of cases) item.run();
process.stdout.write(`${cases.length} native Goldfish host-finalizer cases passed\n`);

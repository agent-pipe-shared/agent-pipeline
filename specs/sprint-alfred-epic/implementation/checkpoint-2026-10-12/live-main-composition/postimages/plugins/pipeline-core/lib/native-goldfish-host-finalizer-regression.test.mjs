// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { finalizeNativeGoldfishHostReturn } from "./native-goldfish-host-finalizer.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE, NATIVE_GOLDFISH_RETURN_SCHEMA } from "./native-goldfish-host-return.mjs";
import { integrateNativeGoldfishItemDelivery, prepareNativeGoldfishHostState } from "./native-goldfish-host-state.mjs";
import { nativeGoldfishHookMessage } from "../hooks/native-goldfish-host.mjs";
import { writeHostObservedNativeGoldfishDispatchRecord } from "../scripts/dispatch-record-write.mjs";

import { prepareApprovedItemCourseFixture, nativeContractFixtureParent, nativeContractFixtureRepositoryRoot } from "./test-item-approved-course-fixture.mjs";
import { createGovernanceScopeController } from "./governance-scope.mjs";
import { fileURLToPath } from "node:url";
import { inspectSignedDescriptorCustodyRepository } from "./worktree-lifecycle.mjs";
import { createControlledMethodRuntimeFixture } from "./session-requester-bridge.mjs";
import { initializeSessionAuthorityRegistry } from "./session-authority-registry.mjs";
import { createSessionAuthorityParticipantPorts } from "./session-authority-observers.mjs";
import { commitAdmittedNativeGoldfishReturn } from "./agy-host-commit-execution.mjs";

// Controlled METHOD fixture: genuine Source requester/member custody, not provider-host proof.
function sourceRuntime(root) {
  mkdirSync(join(root,".claude"),{recursive:true,mode:0o700});
  writeFileSync(join(root,".claude/pipeline.yaml"),"schema: pipeline.manifest.v0\n");
  const ref=path=>({path,sha256:"a".repeat(64)});
  const continuity={schema:"pipeline.continuity.v0",featureId:"unit",revision:0,
    runtime:{humanFacingLanguage:"en",activeDuty:"Coordinator",sessionCleanup:null},
    authority:{prd:ref("specs/unit/prd.md"),spec:ref("specs/unit/spec.md"),result:null},
    queueHead:{packageId:"unit-package",actionId:"finalizer-fixture",nextAction:"dispatch",productRetryCount:0,environmentRerouteCount:0,dispatch:null},
    blocker:null,acknowledgedFinal:null,resume:{mode:"immediate",sourceRevision:0,reasonCode:"active-turn"},recovery:null,decisionTxn:null,closeTransition:null,
    capacity:{concurrencyLimit:3,reservedCriticSlots:1,reservedRecoverySlots:1,fallbackPolicy:"defer"}};
  writeFileSync(join(root,".claude/pipeline-state.json"),JSON.stringify({schema:"pipeline.state.v0",activeFeature:{id:"unit",planPath:"specs/unit/prd.md",phase:"design"},planApproved:false,continuity}),{mode:0o600});
  const repository=inspectSignedDescriptorCustodyRepository(root);
  const runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,"agent-pipeline/controlled-method-fixtures/finalizer-owner"),sessionId:"finalizer-original-owner"});
  const ports=createSessionAuthorityParticipantPorts({repository}); for(const row of ports)assert.doesNotThrow(()=>row.port.readBaseline(),row.producerId); const initialized=initializeSessionAuthorityRegistry({repository},ports); assert.equal(initialized.status,"initialized",JSON.stringify(initialized));
  return runtime;
}
function fixtureRoot(prefix) {
  const parent=nativeContractFixtureParent();
  mkdirSync(parent,{recursive:true,mode:0o700}); return mkdtempSync(join(parent,prefix));
}

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
  { id: "NGHF05", name: "Codex v2 commits through real Git and reads back the versioned worker observation", run: () => {
    const root = fixtureRoot("native-goldfish-host-codex-finalizer-");
    const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    try {
      git("init", "-q"); git("config", "user.name", "Fixture");
      git("config", "user.email", "fixture@example.invalid"); git("config", "commit.gpgsign", "false");
      writeFileSync(join(root, "file.txt"), "before\n");
      writeFileSync(join(root, ".gitignore"), "evidence/\n.claude/\n");
      git("add", "--", "file.txt", ".gitignore"); git("commit", "-q", "-m", "fixture baseline");
      mkdirSync(join(root, "evidence"));
      writeFileSync(join(root,"pipeline.user.yaml"),readFileSync(join(nativeContractFixtureRepositoryRoot(),"pipeline.user.yaml")));
      git("add","pipeline.user.yaml");git("commit","-qm","committed V3 configured route");
      const runtime=sourceRuntime(root);
      return runtime.run(()=> {
      const candidateCommit = git("rev-parse", "HEAD");
      const candidateTree = git("rev-parse", "HEAD^{tree}");
      const binding = { schema: "pipeline.native-goldfish-host-briefing.v2", dispatchId: "NGHF-CODEX-LIVE-2",
        candidateCommit, candidateTree, runner: "codex", role: "pipeline-core:goldfish-implementor",
        nativeAgentType: "worker", model: "gpt-6-luna", effort: "high", rulesetSha,
        allowedPaths: ["file.txt"], criticDecision };
      const prompt = `Goldfish task\n<!-- pipeline-native-goldfish-host-commit:v2\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
      const preTool = { cwd: root, session_id: "session-codex-live", hook_event_name: "PreToolUse",
        tool_name: "spawn_agent", tool_use_id: "tool-codex-live", tool_input: { agent_type: "worker", message: prompt } };
      const prepared = prepareNativeGoldfishHostState({ root, runner: "codex", input: preTool });
      assert.equal(prepared.ok, true, prepared.code);
      const started = finalizeNativeGoldfishHostReturn({ runner: "codex", root, input: {
        ...preTool, hook_event_name: "SubagentStart", agent_id: "agent-codex-live", agent_type: "worker", model: binding.model,
      } });
      assert.equal(started.status, "agent-bound", started.code);
      writeFileSync(join(root, "file.txt"), "after validated worker return\n");
      const text = JSON.stringify({ schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: binding.dispatchId,
        candidateCommit, outcome: "succeeded", report: "Changed file.txt through the native worker route.", changedPaths: ["file.txt"] });
      let publishError = null;
      const finalized = finalizeNativeGoldfishHostReturn({ runner: "codex", root, input: {
        hook_event_name: "SubagentStop", session_id: "session-codex-live", agent_id: "agent-codex-live",
        agent_type: "worker", model: binding.model, last_assistant_message: text,
      } }, { writeRecord: (request) => {
        try { return writeHostObservedNativeGoldfishDispatchRecord(request); }
        catch (error) { publishError = error.message; throw error; }
      } });
      assert.equal(finalized.status, "authored-commit-recorded", `${finalized.code}: ${publishError ?? ""}`);
      assert.equal(git("rev-parse", "HEAD"), finalized.commit);
      assert.equal(git("show", "HEAD:file.txt"), "after validated worker return");
      assert.equal(git("status", "--porcelain"), "");
      const commitMessage = git("log", "-1", "--format=%B");
      assert.match(commitMessage, /Native-Host-Observed: v2 \(codex\)/u);
      const receiptDir = join(root, ".git", "agent-pipeline", "run", "native-goldfish-host-commit");
      const receiptName = readdirSync(receiptDir).find((name) => name.startsWith("observation-codex-"));
      const receipt = JSON.parse(readFileSync(join(receiptDir, receiptName), "utf8"));
      assert.equal(receipt.schema, "pipeline.native-goldfish-host-observation.v2");
      assert.equal(receipt.hostMarker, "Native-Host-Observed: v2 (codex)");
      assert.equal(receipt.nativeAgentType, "worker");
      const record = JSON.parse(readFileSync(join(root, finalized.record.target), "utf8"));
      assert.equal(record.candidateCommit, finalized.commit);
      assert.equal(record.outcomeClassification.kind, "authored-commit");
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  } },
  { id: "NGHF06", name: "Claude return completes real Git commit, private receipt, and exclusive v4 writer in order", run: () => {
    const root = fixtureRoot("native-goldfish-host-live-finalizer-");
    const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    try {
      git("init", "-q"); git("config", "user.name", "Fixture");
      git("config", "user.email", "fixture@example.invalid"); git("config", "commit.gpgsign", "false");
      writeFileSync(join(root, "file.txt"), "before\n");
      writeFileSync(join(root, ".gitignore"), "evidence/\n.claude/\n");
      git("add", "--", "file.txt", ".gitignore"); git("commit", "-q", "-m", "fixture baseline");
      mkdirSync(join(root, "evidence"));
      writeFileSync(join(root,"pipeline.user.yaml"),readFileSync(join(nativeContractFixtureRepositoryRoot(),"pipeline.user.yaml")));
      git("add","pipeline.user.yaml");git("commit","-qm","committed V3 configured route");
      const runtime=sourceRuntime(root);
      return runtime.run(()=> {
      const candidateCommit = git("rev-parse", "HEAD");
      const candidateTree = git("rev-parse", "HEAD^{tree}");
      const binding = { schema: "pipeline.native-goldfish-host-briefing.v1", dispatchId: "NGHF-LIVE-1",
        candidateCommit, candidateTree, runner: "claude", role: "pipeline-core:goldfish-implementor",
        agentType: "goldfish-implementor", model: "sonnet", effort: "medium",
        rulesetSha, allowedPaths: ["file.txt"], criticDecision };
      const prompt = `Goldfish task\n<!-- pipeline-native-goldfish-host-commit:v1\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
      const preTool = { cwd: root, session_id: "session-live", hook_event_name: "PreToolUse",
        tool_name: "Task", tool_use_id: "tool-live", tool_input: { subagent_type: binding.role, prompt, run_in_background: false } };
      const prepared = prepareNativeGoldfishHostState({ root, runner: "claude", input: preTool });
      assert.equal(prepared.ok, true, prepared.code);
      writeFileSync(join(root, "file.txt"), "after validated return\n");
      const text = JSON.stringify({ schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: binding.dispatchId,
        candidateCommit, outcome: "succeeded", report: "Changed file.txt and completed focused checks.",
        changedPaths: ["file.txt"] });
      let publishError = null;
      const finalized = finalizeNativeGoldfishHostReturn({ runner: "claude", root, input: {
        hook_event_name: "PostToolUse", tool_name: "Task", session_id: "session-live", tool_use_id: "tool-live",
        tool_input: { subagent_type: binding.role, prompt, run_in_background: false },
        tool_response: { status: "completed", resolvedModel: binding.model, modelsUsed: [binding.model],
          content: [{ type: "text", text }] },
      } }, { writeRecord: (request) => {
        try { return writeHostObservedNativeGoldfishDispatchRecord(request); }
        catch (error) { publishError = error.message; throw error; }
      } });
      assert.equal(finalized.status, "authored-commit-recorded", `${finalized.code}: ${publishError ?? ""}`);
      assert.equal(git("rev-parse", "HEAD"), finalized.commit);
      assert.equal(git("show", "HEAD:file.txt"), "after validated return");
      assert.equal(git("status", "--porcelain"), "");
      assert.equal(finalized.record.target, "evidence/dispatch-record-NGHF-LIVE-1.json");
      const persisted = JSON.parse(readFileSync(join(root, finalized.record.target), "utf8"));
      assert.equal(persisted.runner, "claude");
      assert.equal(persisted.candidateCommit, finalized.commit);
      assert.equal(persisted.outcomeClassification.kind, "authored-commit");
      assert.equal(persisted.criticRequired.appliedRow, "T1");
      assert.match(git("log", "-1", "--format=%B"), /Native-Host-Observed: v1 \(claude\)/u);
      assert.ok(existsSync(join(root, ".git", "agent-pipeline", "run", "native-goldfish-host-commit")));
      const replay = finalizeNativeGoldfishHostReturn({ runner: "claude", root, input: {
        hook_event_name: "PostToolUse", tool_name: "Task", session_id: "session-live", tool_use_id: "tool-live",
        tool_input: { subagent_type: binding.role, prompt, run_in_background: false },
      } });
      assert.notEqual(replay.status, "authored-commit-recorded");
      assert.equal(git("rev-parse", "HEAD"), finalized.commit);
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  } },

  {id:"NGHF07",name:"Codex approved original item automatically prepares queue, executes candidate checks, and releases only genuine Main integration",run:()=>{
    const root=fixtureRoot("native-codex-approved-item-");
    const git=(...args)=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
    try {
      const controller=createGovernanceScopeController({hostStateRoot:join(root,"fixture-host")});
      const plan=controller.planDecision({rootDir:root,decision:"enroll",by:"controlled METHOD explicit selection"});controller.applyDecision(plan,{activate:true,planSha256:plan.planSha256});
      const pipelineUserSource=readFileSync(join(nativeContractFixtureRepositoryRoot(),"pipeline.user.yaml"),"utf8").replace("gates:\n","gates:\n  human_approval: chat\n");
      const original=prepareApprovedItemCourseFixture({root,pipelineUserSource});
      git("config","user.name","Fixture");git("config","user.email","fixture@example.invalid");git("config","commit.gpgsign","false");
      const repository=inspectSignedDescriptorCustodyRepository(root),runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,"agent-pipeline/controlled-method-fixtures/codex-approved-owner"),sessionId:"codex-approved-owner"});
      assert.equal(initializeSessionAuthorityRegistry({repository},createSessionAuthorityParticipantPorts({repository})).status,"initialized");
      return runtime.run(()=>{
        const itemDelivery={schema:"pipeline.item-delivery-briefing.v1",sliceId:"CODEX-AC-1",itemId:"AC-1",criterionLocator:original.criterionLocator,checks:[{id:"original-criterion",path:"src/change.test.mjs",dependencies:["src/change.mjs","src/change.test.mjs"]}]};
        const binding={schema:"pipeline.native-goldfish-host-briefing.v3",dispatchId:"CODEX-AC-1",candidateCommit:original.candidate.commit,candidateTree:original.candidate.tree,runner:"codex",role:"pipeline-core:goldfish-implementor",nativeAgentType:"worker",model:"gpt-6-luna",effort:"high",rulesetSha,allowedPaths:["src/change.mjs"],criticDecision,itemDelivery};
        const prompt=`Goldfish task\n<!-- pipeline-native-goldfish-host-commit:v3\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}\nSlice: CODEX-AC-1\nWrite scope: src/change.mjs\n`;
        const pre={cwd:root,session_id:"codex-item-session",hook_event_name:"PreToolUse",tool_name:"spawn_agent",tool_use_id:"codex-item-tool",tool_input:{agent_type:"worker",message:prompt}};
        const prepared=prepareNativeGoldfishHostState({root,runner:"codex",input:pre});assert.equal(prepared.ok,true,JSON.stringify(prepared));
        assert.equal(finalizeNativeGoldfishHostReturn({root,runner:"codex",input:{...pre,hook_event_name:"SubagentStart",agent_id:"codex-item-worker",agent_type:"worker",model:binding.model}}).status,"agent-bound");
        writeFileSync(join(root,"src/change.mjs"),"// actual approved Codex item change\nexport const value='expected';\n");
        const text=JSON.stringify({schema:NATIVE_GOLDFISH_RETURN_SCHEMA,dispatchId:binding.dispatchId,candidateCommit:binding.candidateCommit,outcome:"succeeded",report:"Authored original criterion; candidate-bound check recorded.",changedPaths:["src/change.mjs"]});
        const finalized=finalizeNativeGoldfishHostReturn({root,runner:"codex",input:{hook_event_name:"SubagentStop",session_id:pre.session_id,agent_id:"codex-item-worker",agent_type:"worker",model:binding.model,last_assistant_message:text}});
        assert.equal(finalized.status,"authored-commit-recorded",JSON.stringify(finalized));assert.equal(finalized.delivery.checkStatus.verdict,"passed");
        const integrated=integrateNativeGoldfishItemDelivery({root,pendingSha256:prepared.sha256});assert.equal(integrated.status,"integrated",JSON.stringify(integrated));
        assert.equal(git("rev-parse","HEAD"),finalized.commit);assert.equal(git("show","HEAD:src/change.mjs"),"// actual approved Codex item change\nexport const value='expected';");
      });
    }finally{rmSync(root,{recursive:true,force:true});}
  }},

];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

for (const item of cases) item.run();
process.stdout.write(`${cases.length} native Goldfish host-finalizer cases passed\n`);

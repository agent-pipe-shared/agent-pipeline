// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { nativeContractFixtureParent, nativeContractFixtureRepositoryRoot } from "./test-item-approved-course-fixture.mjs";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { finalizeNativeGoldfishHostReturn } from "./native-goldfish-host-finalizer.mjs";
import { NATIVE_GOLDFISH_HOST_DIRECTIVE, NATIVE_GOLDFISH_RETURN_SCHEMA } from "./native-goldfish-host-return.mjs";
import { inspectSourceOwnedNativeConfiguredRoute, prepareNativeGoldfishHostState } from "./native-goldfish-host-state.mjs";
import { nativeGoldfishHookMessage } from "../hooks/native-goldfish-host.mjs";
import { writeHostObservedNativeGoldfishDispatchRecord } from "../scripts/dispatch-record-write.mjs";

import { nativeManagedDigest } from "./native-managed-authority-support.mjs";
import { createModelFamilyRuntimeHost } from "./model-family-runtime-host.mjs";
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
  const root=fixtureRoot("native-goldfish-host-finalizer-"); const commonDir=join(root,".git");
  const git=(...args)=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
  const facts={commits:0,publishedRecord:null,lastCommit:null};
  try {
    git("init","-q");git("config","user.name","Fixture");git("config","user.email","fixture@example.invalid");git("config","commit.gpgsign","false");
    mkdirSync(join(root,"src"));mkdirSync(join(root,"evidence"));
    writeFileSync(join(root,"src/change.mjs"),"export const value='before';\n");
    writeFileSync(join(root,".gitignore"),"evidence/\n.claude/\n");git("add",".");git("commit","-qm","fixture baseline");
    writeFileSync(join(root,"pipeline.user.yaml"),readFileSync(join(nativeContractFixtureRepositoryRoot(),"pipeline.user.yaml")));
    git("add","pipeline.user.yaml");git("commit","-qm","committed V3 configured route");
    const runtime=sourceRuntime(root);
    return runtime.run(()=> {
      const binding={schema:adapterVersion===2?"pipeline.native-goldfish-host-briefing.v2":"pipeline.native-goldfish-host-briefing.v1",dispatchId:`NGHF-${runner.toUpperCase()}-1`,
        candidateCommit:git("rev-parse","HEAD"),candidateTree:git("rev-parse","HEAD^{tree}"),runner,role:"pipeline-core:goldfish-implementor",
        ...(adapterVersion===2?{nativeAgentType:"worker"}:{agentType:"goldfish-implementor"}),model:runner==="claude"?"sonnet":"gpt-6-luna",effort:runner==="claude"?"medium":"high",rulesetSha,allowedPaths:["src/change.mjs"],criticDecision};
      const prompt=`Goldfish task\n<!-- pipeline-native-goldfish-host-commit:v${adapterVersion}\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
      const input=runner==="claude"?{cwd:root,session_id:"session-claude",hook_event_name:"PreToolUse",tool_name:"Agent",tool_use_id:"tool-claude",tool_input:{subagent_type:binding.role,prompt,run_in_background:false}}
        :{cwd:root,session_id:"session-codex",hook_event_name:"PreToolUse",tool_name:"spawn_agent",tool_use_id:"tool-codex",tool_input:{agent_type:binding.nativeAgentType??binding.agentType,message:prompt}};
      const prepared=prepareNativeGoldfishHostState({root,runner,input});assert.equal(prepared.ok,true,JSON.stringify(prepared));
      if(runner==="codex") {const started=finalizeNativeGoldfishHostReturn({runner,root,input:{...input,hook_event_name:"SubagentStart",agent_id:"agent-1",agent_type:binding.nativeAgentType??binding.agentType,model:binding.model}});assert.equal(started.status,"agent-bound",started.code);}
      writeFileSync(join(root,"src/change.mjs"),"export const value='after';\n");
      const dependencies={commit:request=>{facts.commits++;const actual=commitAdmittedNativeGoldfishReturn(request);facts.lastCommit=actual.commit;return actual;},writeRecord:request=>{facts.publishedRecord=request.record;return writeHostObservedNativeGoldfishDispatchRecord(request);}};
      return run({root,commonDir,binding,input,dependencies,facts,prepared,git});
    });
  } finally {rmSync(root,{recursive:true,force:true});}
}

const cases = [
  { id: "NGHF01", name: "Claude valid PostToolUse return commits and publishes a host-observed v4 record last", run: () => fixture(({ root, binding, dependencies, facts }) => {
    const text = JSON.stringify({ schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: binding.dispatchId,
      candidateCommit: binding.candidateCommit, outcome: "succeeded", report: "Implemented and verified; independent review pending.",
      changedPaths: ["src/change.mjs"] });
    const input = { hook_event_name: "PostToolUse", tool_name: "Agent", session_id: "session-claude",
      tool_use_id: "tool-claude", tool_input: { subagent_type: binding.role, prompt: "marked" },
      tool_response: { status: "completed", resolvedModel: binding.model, modelsUsed: [binding.model],
        content: [{ type: "text", text }] } };
    const result = finalizeNativeGoldfishHostReturn({ runner: "claude", root, input }, dependencies);
    assert.equal(result.status, "authored-commit-recorded", result.code);
    assert.equal(result.commit, facts.lastCommit);
    assert.equal(facts.publishedRecord.runner, "claude");
    assert.equal(facts.publishedRecord.candidateCommit, facts.lastCommit);
    assert.equal(facts.publishedRecord.criticRequired.appliedRow, "T1");
    assert.equal(facts.commits, 1);
    assert.match(nativeGoldfishHookMessage(result), /host commit verified/u);
  }) },
  { id: "NGHF01-P3", name: "Claude PostToolUse without pending state names the exact reason and the orchestrator route, not the bare code", run: () => fixture(({ root, binding, dependencies, facts }) => {
    const marked = `x\n<!-- pipeline-native-goldfish-host-commit:v1\n${JSON.stringify(binding)}\n-->`;
    const launch = (tool_response, run_in_background) => ({ hook_event_name: "PostToolUse", tool_name: "Agent", session_id: "session-claude",
      tool_use_id: "tool-never-prepared", tool_input: { subagent_type: binding.role, prompt: marked, run_in_background }, tool_response });
    const background = finalizeNativeGoldfishHostReturn({ runner: "claude", root, input: launch({ status: "async_launched", agentId: "agent-bg" }, true) }, dependencies);
    assert.equal(background.code, "NGHF-PENDING-UNAVAILABLE");
    assert.equal(background.reason, "async-launch");
    const backgroundMessage = nativeGoldfishHookMessage(background);
    assert.match(backgroundMessage, /\(NGHF-PENDING-UNAVAILABLE\)/u);
    assert.match(backgroundMessage, /background/u);
    assert.match(backgroundMessage, /Dispatch: <dispatchId> \(goldfish\)/u);
    assert.match(backgroundMessage, /dispatch-record-write\.mjs/u);
    const unprepared = finalizeNativeGoldfishHostReturn({ runner: "claude", root, input: launch({ status: "completed" }, false) }, dependencies);
    assert.equal(unprepared.code, "NGHF-PENDING-UNAVAILABLE");
    assert.equal(unprepared.reason, "no-pending");
    assert.match(nativeGoldfishHookMessage(unprepared), /no pending host-commit state was prepared/u);
    assert.match(nativeGoldfishHookMessage(unprepared), /dispatch-record-write\.mjs/u);
    assert.equal(facts.commits, 0);
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
      candidateCommit: binding.candidateCommit, outcome: "succeeded", report: "Implemented and verified; independent review pending.",
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


  { id: "NGHF04", name: "Codex original Source route rejects spoof, foreign candidate/ref, changed committed authority and active-family downgrade", run: () => fixture(({root,commonDir,prepared,git})=>{
    const read=()=>inspectSourceOwnedNativeConfiguredRoute({root,pendingSha256:prepared.sha256});
    const original=read();assert.equal(original.model,"gpt-6-luna");assert.equal(original.effort,"high");
    assert.throws(()=>inspectSourceOwnedNativeConfiguredRoute({root,pendingSha256:prepared.sha256,configuredRoute:{model:"forged"}}),error=>error.reason==="native-configured-input");
    assert.throws(()=>inspectSourceOwnedNativeConfiguredRoute({root,pendingSha256:"f".repeat(64)}));
    const sourcePath=join(root,"pipeline.user.yaml"),bytes=readFileSync(sourcePath);writeFileSync(sourcePath,Buffer.concat([bytes,Buffer.from("\n")]));
    assert.throws(read,error=>error.reason==="native-configured-source-drift");writeFileSync(sourcePath,bytes);
    const ref=git("symbolic-ref","HEAD");git("branch","alias-reference",original.candidateCommit);git("symbolic-ref","HEAD","refs/heads/alias-reference");
    assert.throws(read,error=>error.reason==="native-configured-route-stale");git("symbolic-ref","HEAD",ref);
    writeFileSync(sourcePath,Buffer.concat([bytes,Buffer.from("\n")]));git("add","pipeline.user.yaml");git("commit","-qm","unauthorized source route advance");
    assert.throws(read,error=>error.reason==="native-configured-source-drift");git("reset","--hard",original.candidateCommit);
    const familyDir=join(commonDir,"agent-pipeline/model-family-host");mkdirSync(familyDir,{mode:0o700});
    writeFileSync(join(familyDir,"activation.json"),JSON.stringify({schema:"pipeline.model-family-host-activation.v1",activationId:"a".repeat(64),authoritySha256:"b".repeat(64),createdAt:new Date().toISOString()}),{mode:0o600});
    // Corrupt/missing active state cannot downgrade to static inactive routing.
    assert.throws(read,error=>error.reason==="native-configured-family-uncertain");
    // Same closed on-disk active-state fixture as the existing RuntimeHost examiner.
    // This attests the ACTIVE reader branch, never a real provider adapter or PO adoption.
    mkdirSync(join(familyDir,"receipts"),{mode:0o700});
    const state={schema:"pipeline.model-family-host-state.v1",generation:0,activation:"family-active",authoritySha256:"b".repeat(64),pinStates:[],watermarks:[],invocationIndex:[]};
    const stateSha256=nativeManagedDigest(state),stateFile=`generation-0-${stateSha256}.json`;
    writeFileSync(join(familyDir,stateFile),JSON.stringify(state),{mode:0o600});writeFileSync(join(familyDir,"current.json"),JSON.stringify({schema:"pipeline.model-family-host-state-pointer.v1",generation:0,stateFile,stateSha256}),{mode:0o600});
    const activation=createModelFamilyRuntimeHost({cwd:root,resolveCommonDir:()=>commonDir}).observeActivation();assert.equal(activation.status,"active",JSON.stringify(activation));
    assert.throws(read,error=>error.reason==="native-configured-family-port-required");
    rmSync(familyDir,{recursive:true});assert.deepEqual(read(),original);
  },"codex",2) },

];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

for (const item of cases) item.run();
process.stdout.write(`${cases.length} native Goldfish host-finalizer cases passed\n`);

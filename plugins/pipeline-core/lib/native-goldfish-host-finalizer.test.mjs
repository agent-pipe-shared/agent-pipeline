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
import { inspectNativeGoldfishHostObservation, nativeAuthoredRecordBytes } from "./native-goldfish-host-observation.mjs";
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

// Claude binding effort mirrors the agent definition (owner: agents/<name>.md frontmatter): goldfish-deep declares xhigh, the others medium.
// `options.background` launches the Claude dispatch with an explicit run_in_background: true while the SubagentStop
// completion route is registered, so the pending state carries completionRoute "subagent-stop". The stop-hook fixtures
// (meta files, SubagentStop input) live in a directory OUTSIDE the repository root: the host-commit admission compares
// the working tree to its pre-launch baseline, so nothing the harness itself writes may appear inside the root.
const STOP_ASSURANCE = "host-observed-subagent-stop-correlation-model-not-observed";
const POST_ASSURANCE = "host-observed-tool-use-and-resolved-model-not-provider-attested";
const finalText = (binding, over = {}) => JSON.stringify({ schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: binding.dispatchId,
  candidateCommit: binding.candidateCommit, outcome: "succeeded", report: "Implemented and verified; independent review pending.",
  changedPaths: ["src/change.mjs"], ...over });
const privateDir = (commonDir) => join(commonDir, "agent-pipeline", "run", "native-goldfish-host-commit");
const privateEntries = (commonDir, prefix) => readdirSync(privateDir(commonDir)).filter((name) => name.startsWith(prefix)).sort();
const snapshot = (commonDir) => JSON.stringify(readdirSync(privateDir(commonDir)).sort()
  .map((name) => [name, readFileSync(join(privateDir(commonDir), name), "utf8")]));
const readReceipt = (commonDir) => { const names = privateEntries(commonDir, "observation-claude-"); assert.equal(names.length, 1);
  return JSON.parse(readFileSync(join(privateDir(commonDir), names[0]), "utf8")); };
function fixture(run, runner = "claude", adapterVersion = 1, agentName = "goldfish-implementor", options = {}) {
  const root=fixtureRoot("native-goldfish-host-finalizer-"); const commonDir=join(root,".git");
  const stopDir=fixtureRoot("native-goldfish-stop-hook-"); const background=options.background===true;
  const writeMeta=(agentId,meta)=>{mkdirSync(join(stopDir,"session","subagents"),{recursive:true});writeFileSync(join(stopDir,"session","subagents",`agent-${agentId}.meta.json`),JSON.stringify(meta));};
  const stopInput=(binding,text,over={})=>({hook_event_name:"SubagentStop",session_id:"session-claude",transcript_path:join(stopDir,"session.jsonl"),cwd:root,agent_id:"agent-bg",agent_type:binding.role,last_assistant_message:text,...over});
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
        candidateCommit:git("rev-parse","HEAD"),candidateTree:git("rev-parse","HEAD^{tree}"),runner,role:`pipeline-core:${agentName}`,
        ...(adapterVersion===2?{nativeAgentType:"worker"}:{agentType:agentName}),model:runner==="claude"?"sonnet":"gpt-6-luna",effort:runner==="claude"?(agentName==="goldfish-deep"?"xhigh":"medium"):"high",rulesetSha,allowedPaths:["src/change.mjs"],criticDecision};
      const prompt=`Goldfish task\n<!-- pipeline-native-goldfish-host-commit:v${adapterVersion}\n${JSON.stringify(binding)}\n-->\n${NATIVE_GOLDFISH_HOST_DIRECTIVE}`;
      const input=runner==="claude"?{cwd:root,session_id:"session-claude",hook_event_name:"PreToolUse",tool_name:"Agent",tool_use_id:"tool-claude",tool_input:{subagent_type:binding.role,prompt,run_in_background:background}}
        :{cwd:root,session_id:"session-codex",hook_event_name:"PreToolUse",tool_name:"spawn_agent",tool_use_id:"tool-codex",tool_input:{agent_type:binding.nativeAgentType??binding.agentType,message:prompt}};
      const prepared=prepareNativeGoldfishHostState({root,runner,input,...(background?{subagentStopCompletionRegistered:true}:{})});assert.equal(prepared.ok,true,JSON.stringify(prepared));
      if(runner==="codex") {const started=finalizeNativeGoldfishHostReturn({runner,root,input:{...input,hook_event_name:"SubagentStart",agent_id:"agent-1",agent_type:binding.nativeAgentType??binding.agentType,model:binding.model}});assert.equal(started.status,"agent-bound",started.code);}
      writeFileSync(join(root,"src/change.mjs"),"export const value='after';\n");
      const dependencies={commit:request=>{facts.commits++;const actual=commitAdmittedNativeGoldfishReturn(request);facts.lastCommit=actual.commit;return actual;},writeRecord:request=>{facts.publishedRecord=request.record;return writeHostObservedNativeGoldfishDispatchRecord(request);}};
      return run({root,commonDir,binding,input,dependencies,facts,prepared,git,writeMeta,stopInput});
    });
  } finally {rmSync(root,{recursive:true,force:true});rmSync(stopDir,{recursive:true,force:true});}
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
  { id: "NGHF01-DEEP", name: "Claude valid PostToolUse return for a goldfish-deep binding commits and publishes a host-observed v4 record", run: () => fixture(({ root, binding, dependencies, facts }) => {
    const text = JSON.stringify({ schema: NATIVE_GOLDFISH_RETURN_SCHEMA, dispatchId: binding.dispatchId,
      candidateCommit: binding.candidateCommit, outcome: "succeeded", report: "Implemented and verified; independent review pending.",
      changedPaths: ["src/change.mjs"] });
    const input = { hook_event_name: "PostToolUse", tool_name: "Agent", session_id: "session-claude",
      tool_use_id: "tool-claude", tool_input: { subagent_type: binding.role, prompt: "marked" },
      tool_response: { status: "completed", resolvedModel: binding.model, modelsUsed: [binding.model],
        content: [{ type: "text", text }] } };
    const result = finalizeNativeGoldfishHostReturn({ runner: "claude", root, input }, dependencies);
    assert.equal(binding.role, "pipeline-core:goldfish-deep");
    assert.equal(result.status, "authored-commit-recorded", result.code);
    assert.equal(result.commit, facts.lastCommit);
    assert.equal(facts.publishedRecord.agentType, "goldfish-deep");
    assert.equal(facts.commits, 1);
  }, "claude", 1, "goldfish-deep") },
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

  // NGHF05-NGHF10 -- ALF-G2C2B-SUBAGENT-STOP-FINALIZE: an explicit background Claude launch whose pending state carries
  // completionRoute "subagent-stop" is completed ONLY by the Claude SubagentStop hook, never by a PostToolUse.
  { id: "NGHF05", name: "Claude background launch on the SubagentStop route is a non-consuming no-op, and no PostToolUse ever commits that state", run: () => fixture(({ root, commonDir, binding, dependencies, facts, git }) => {
    const names = privateEntries(commonDir, "pending-claude-");
    assert.equal(names.length, 1);
    assert.equal(JSON.parse(readFileSync(join(privateDir(commonDir), names[0]), "utf8")).completionRoute, "subagent-stop");
    const post = (tool_response) => ({ hook_event_name: "PostToolUse", tool_name: "Agent", session_id: "session-claude", tool_use_id: "tool-claude",
      tool_input: { subagent_type: binding.role, prompt: "marked", run_in_background: true }, tool_response });
    const finalize = (input) => finalizeNativeGoldfishHostReturn({ runner: "claude", root, input }, dependencies);
    const before = snapshot(commonDir);
    const launched = finalize(post({ status: "async_launched", agentId: "agent-bg" }));
    assert.equal(launched.status, "awaiting-subagent-stop", launched.code);
    assert.equal(launched.commit, null);
    assert.equal(launched.record, null);
    assert.match(nativeGoldfishHookMessage(launched), /SubagentStop/u);
    assert.match(nativeGoldfishHookMessage(launched), /No commit or authorship record is claimed/u);
    assert.equal(snapshot(commonDir), before);
    const completed = finalize(post({ status: "completed", resolvedModel: binding.model, modelsUsed: [binding.model],
      content: [{ type: "text", text: finalText(binding) }] }));
    assert.equal(completed.status, "not-applicable", completed.code);
    assert.equal(nativeGoldfishHookMessage(completed), null);
    assert.equal(snapshot(commonDir), before);
    assert.equal(facts.commits, 0);
    assert.equal(git("rev-parse", "HEAD"), binding.candidateCommit);
  }, "claude", 1, "goldfish-implementor", { background: true }) },
  { id: "NGHF06", name: "Claude SubagentStop with a valid final commits exactly once and records the subagent-stop assurance", run: () => fixture(({ root, commonDir, binding, dependencies, facts, writeMeta, stopInput }) => {
    writeMeta("agent-bg", { spawnDepth: 1, agentType: "goldfish-implementor", toolUseId: "tool-claude" });
    // The stopping agent_type carries the plugin prefix and the meta file does not: both spellings normalize to one role.
    const result = finalizeNativeGoldfishHostReturn({ runner: "claude", root, input: stopInput(binding, finalText(binding)) }, dependencies);
    assert.equal(result.status, "authored-commit-recorded", result.code);
    assert.equal(facts.commits, 1);
    assert.equal(result.commit, facts.lastCommit);
    assert.equal(facts.publishedRecord.runner, "claude");
    assert.equal(facts.publishedRecord.model, binding.model);
    assert.equal(facts.publishedRecord.candidateCommit, facts.lastCommit);
    assert.equal(facts.publishedRecord.log.length, 2);
    assert.match(nativeGoldfishHookMessage(result), /host commit verified/u);
    const receipt = readReceipt(commonDir);
    assert.equal(receipt.assurance, STOP_ASSURANCE);
    assert.equal(receipt.agentId, null);
    assert.equal(receipt.schema, "pipeline.native-goldfish-host-observation.v1");
    assert.equal(receipt.hostMarker, "Native-Host-Observed: v1 (claude)");
    assert.equal(receipt.toolUseId, "tool-claude");
    assert.equal(receipt.commit, facts.lastCommit);
    const readback = inspectNativeGoldfishHostObservation({ root, taskId: binding.dispatchId, record: facts.publishedRecord,
      recordBytes: nativeAuthoredRecordBytes(facts.publishedRecord) });
    assert.equal(readback.ok, true, JSON.stringify(readback));
    assert.equal(readback.assurance, STOP_ASSURANCE);
  }, "claude", 1, "goldfish-implementor", { background: true }) },
  { id: "NGHF07", name: "Claude SubagentStop consumes once: a replayed stop and a later PostToolUse never commit twice", run: () => fixture(({ root, commonDir, binding, dependencies, facts, git, writeMeta, stopInput }) => {
    writeMeta("agent-bg", { spawnDepth: 1, agentType: "goldfish-implementor", toolUseId: "tool-claude" });
    const finalize = (input) => finalizeNativeGoldfishHostReturn({ runner: "claude", root, input }, dependencies);
    const stop = stopInput(binding, finalText(binding));
    const first = finalize(stop);
    assert.equal(first.status, "authored-commit-recorded", first.code);
    const replay = finalize(stop);
    assert.equal(replay.status, "not-applicable", replay.code);
    assert.equal(replay.code, "NGHF-RECEIPT-EXISTS");
    assert.equal(nativeGoldfishHookMessage(replay), null);
    for (const tool_response of [{ status: "async_launched", agentId: "agent-bg" },
      { status: "completed", resolvedModel: binding.model, modelsUsed: [binding.model], content: [{ type: "text", text: finalText(binding) }] }]) {
      const later = finalize({ hook_event_name: "PostToolUse", tool_name: "Agent", session_id: "session-claude", tool_use_id: "tool-claude",
        tool_input: { subagent_type: binding.role, prompt: "marked", run_in_background: true }, tool_response });
      assert.notEqual(later.status, "authored-commit-recorded", later.code);
    }
    assert.equal(facts.commits, 1);
    assert.equal(git("rev-parse", "HEAD"), first.commit);
    assert.equal(privateEntries(commonDir, "observation-claude-").length, 1);
    assert.equal(readdirSync(join(root, "evidence")).filter((name) => name.startsWith("dispatch-record-")).length, 1);
  }, "claude", 1, "goldfish-implementor", { background: true }) },
  { id: "NGHF08", name: "Claude SubagentStop refuses a final whose candidate, paths, JSON or working tree do not match, and a refusal consumes nothing", run: () => fixture(({ root, commonDir, binding, dependencies, facts, git, writeMeta, stopInput }) => {
    writeMeta("agent-bg", { spawnDepth: 1, agentType: "goldfish-implementor", toolUseId: "tool-claude" });
    const attempt = (text) => finalizeNativeGoldfishHostReturn({ runner: "claude", root, input: stopInput(binding, text) }, dependencies);
    const before = snapshot(commonDir);
    for (const [label, text, code] of [
      ["foreign candidate", finalText(binding, { candidateCommit: "f".repeat(40) }), "NGHR-FINAL-SHAPE"],
      ["path outside the allowed paths", finalText(binding, { changedPaths: ["src/other.mjs"] }), "NGHR-FINAL-SHAPE"],
      ["foreign dispatch id", finalText(binding, { dispatchId: "NGHF-OTHER" }), "NGHR-FINAL-SHAPE"],
      ["prose instead of the JSON contract", "All done, no JSON here.", "NGHR-FINAL-JSON"],
    ]) {
      const refused = attempt(text);
      assert.equal(refused.status, "not-finalized", `${label}: ${refused.code}`);
      assert.equal(refused.code, code, label);
      assert.equal(refused.commit, null, label);
    }
    assert.equal(facts.commits, 0);
    assert.equal(snapshot(commonDir), before);
    writeFileSync(join(root, "src/extra.mjs"), "export const extra=1;\n");
    const undeclared = attempt(finalText(binding));
    assert.notEqual(undeclared.status, "authored-commit-recorded", undeclared.code);
    assert.equal(facts.commits, 0);
    assert.equal(git("rev-parse", "HEAD"), binding.candidateCommit);
    rmSync(join(root, "src/extra.mjs"));
    const accepted = attempt(finalText(binding));
    assert.equal(accepted.status, "authored-commit-recorded", accepted.code);
    assert.equal(facts.commits, 1);
  }, "claude", 1, "goldfish-implementor", { background: true }) },
  { id: "NGHF09", name: "Claude SubagentStop for an unmarked, unknown or mismatching child is a silent not-applicable", run: () => fixture(({ root, commonDir, binding, dependencies, facts, git, writeMeta, stopInput }) => {
    const meta = { spawnDepth: 1, agentType: "goldfish-implementor", toolUseId: "tool-claude" };
    writeMeta("agent-ok", meta);
    writeMeta("agent-type-drift", { ...meta, agentType: "goldfish-deep" });
    writeMeta("agent-other-tool", { ...meta, toolUseId: "tool-never-prepared" });
    writeMeta("agent-top-level", { ...meta, spawnDepth: 0 });
    writeMeta("agent-general", { ...meta, agentType: "general-purpose" });
    const finalize = (input) => finalizeNativeGoldfishHostReturn({ runner: "claude", root, input }, dependencies);
    const text = finalText(binding);
    const before = snapshot(commonDir);
    for (const [label, over] of [
      ["meta agentType differs from the stopping agent", { agent_id: "agent-type-drift" }],
      ["no meta file for the stopping agent", { agent_id: "agent-missing" }],
      ["meta toolUseId names no pending dispatch", { agent_id: "agent-other-tool" }],
      ["meta spawnDepth below one", { agent_id: "agent-top-level" }],
      ["stopping agent is not a Goldfish role", { agent_id: "agent-general", agent_type: "general-purpose" }],
      ["agent_id escapes the meta directory", { agent_id: "../agent-ok" }],
      ["session differs from the pending dispatch", { agent_id: "agent-ok", session_id: "session-other" }],
      ["transcript path is not an absolute .jsonl", { agent_id: "agent-ok", transcript_path: "relative/session.jsonl" }],
    ]) {
      const result = finalize(stopInput(binding, text, over));
      assert.equal(result.status, "not-applicable", `${label}: ${result.code}`);
      assert.equal(nativeGoldfishHookMessage(result), null, label);
    }
    assert.equal(facts.commits, 0);
    assert.equal(git("rev-parse", "HEAD"), binding.candidateCommit);
    assert.equal(snapshot(commonDir), before);
    // The same fixtures with the one child that matches do complete the dispatch.
    const ok = finalize(stopInput(binding, text, { agent_id: "agent-ok" }));
    assert.equal(ok.status, "authored-commit-recorded", ok.code);
    assert.equal(facts.commits, 1);
  }, "claude", 1, "goldfish-implementor", { background: true }) },
  { id: "NGHF10", name: "A foreground pending state is never completed at SubagentStop, and its PostToolUse receipt keeps the original assurance", run: () => fixture(({ root, commonDir, binding, dependencies, facts, writeMeta, stopInput }) => {
    writeMeta("agent-bg", { spawnDepth: 1, agentType: "goldfish-implementor", toolUseId: "tool-claude" });
    const finalize = (input) => finalizeNativeGoldfishHostReturn({ runner: "claude", root, input }, dependencies);
    const stopped = finalize(stopInput(binding, finalText(binding)));
    assert.equal(stopped.status, "not-applicable", stopped.code);
    assert.equal(nativeGoldfishHookMessage(stopped), null);
    assert.equal(facts.commits, 0);
    const completed = finalize({ hook_event_name: "PostToolUse", tool_name: "Agent", session_id: "session-claude", tool_use_id: "tool-claude",
      tool_input: { subagent_type: binding.role, prompt: "marked" },
      tool_response: { status: "completed", resolvedModel: binding.model, modelsUsed: [binding.model], content: [{ type: "text", text: finalText(binding) }] } });
    assert.equal(completed.status, "authored-commit-recorded", completed.code);
    assert.equal(facts.commits, 1);
    const receipt = readReceipt(commonDir);
    assert.equal(receipt.assurance, POST_ASSURANCE);
    assert.equal(receipt.agentId, null);
  }) },

];

const fd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

for (const item of cases) item.run();
process.stdout.write(`${cases.length} native Goldfish host-finalizer cases passed\n`);

import assert from "node:assert/strict";
import {registerTestCaseCompletion} from "./test-case-completion.mjs";
import {spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isSuccessfulSpawn} from "./successful-spawn.mjs";
import {produceCriticDiagnostic} from "./critic-diagnostic-producer.mjs";
import {registerGenericCriticBatch,appendGenericCriticBatchCorrection,readGenericCriticBatchAdmission,assertFeatureCriticReviewUnitOwnership} from "./critic-generic-batch.mjs";
import {admitSessionCriticReview,finalizeSessionCriticReview,runSessionCriticFinalizerCli} from "../scripts/session-critic-finalizer.mjs";
import {sha256Canonical,CRITIC_DISPATCH_LIMITS} from "./review-economy.mjs";
import {readConsumedSessionAdmission,prepareCandidatePacket,sha256,canonicalJson} from "../scripts/critic-packet-preflight.mjs";

const completionCaseIds = Object.freeze(["CGB001", "CGB002", "CGB003", "CGB004", "CGB005", "CGB006", "CGB007", "CGB008", "CGB009", "CGB010", "CGB011"]);
const completionCases = [];
function test(name,run) { completionCases.push({id:completionCaseIds[completionCases.length],name,run}); }
function unit(overrides = {}) {
  return {schema:"pipeline.critic-review-unit.v1", kind:"related-fixes",
    purpose:"Repair one delivery boundary across the affected consumers", specPath:"specs/spec.md",
    logicalWorkIds:["AC-1","AC-2"], criterionIds:["AC-1","AC-2"],
    deliveryBoundary:{mainRef:"refs/heads/main"}, singletonRationale:null, ...overrides};
}
test("singleton requires explicit substantial or urgent rationale; duplicates cannot game membership",()=>{
  for(const kind of ["related-fixes","independent-delivery","urgent-isolated-risk"]){
    const fx=fixture({unitOverride:{kind,logicalWorkIds:["AC-1"],criterionIds:["AC-1"]}});
    try{rejected(()=>register(fx,declaration(fx,{logicalWorkIds:["AC-1"]})),"CGB-SINGLETON-RATIONALE");}finally{rmSync(fx.root,{recursive:true,force:true});}
  }
  for(const kind of ["independent-delivery","urgent-isolated-risk"]){
    const fx=fixture({unitOverride:{kind,logicalWorkIds:["AC-1"],criterionIds:["AC-1"],singletonRationale:"Independently deployed risk boundary requires isolated review"}});
    try{assert.ok(register(fx,declaration(fx,{logicalWorkIds:["AC-1"]})).batchRef);rejected(()=>register(fx,declaration(fx,{logicalWorkIds:["AC-1","AC-1"]})),"CGB-SHAPE");}finally{rmSync(fx.root,{recursive:true,force:true});}
  }
});
function review(fx,member,round,pass=false){
  const preflight={status:"packet-ready",base:{commit:fx.reviewBase??fx.base},candidate:{commit:fx.candidate,tree:git(fx.root,["rev-parse",`${fx.candidate}^{tree}`])},
    spec:{path:"specs/spec.md"},guardrails:[{path:".claude/pipeline.yaml"}],coordinatorOnly:{courseAdmission:null},
    dispatch:{requiredNextGate:"session-critic-dispatch",reviewerInput:{rulesetSha:fx.base}}};
  const options={preflightInput:{root:fx.root,evidencePaths:["evidence/verify.json"]},taskId:fx.taskId,projectId:"pipeline",sessionId:`session-round-${round}`,packetId:String(round).repeat(32),
    route:{routeId:"session-critic",runner:"codex",adapter:"session-functional-equivalent",provider:"openai",modelTier:"higher-capability",effortTier:"xhigh"},
    genericBatchRef:{...member.batchRef,memberSha256:member.memberSha256}};
  const deps={preflightCriticDispatchFn:()=>preflight,modelRoleEnvironment:{}};
  const admitted=admitSessionCriticReview(options,deps);assert.equal(admitted.status,"admitted");
  const verdict={findings:[],deliberately_not_flagged:["scope"],trajectory_verdict:"consistent",trajectory_evidence:"controlled fixture inspected",briefing_violations:[],pass};
  const final=finalizeSessionCriticReview({...options,verdict},deps);assert.equal(final.status,"completed");
  const consumed=readConsumedSessionAdmission({controlRoot:join(fx.root,".git/agent-pipeline/critic-packets"),packetId:options.packetId});
  assert.deepEqual(consumed.receipt,final.receipt);
  return {packetId:options.packetId,packetDigest:final.receipt.packetDigest,receiptSha256:sha256(canonicalJson(final.receipt))};
}
test("one full and shared-limit changed diff corrections use consumed immediate parent and refuse budget reset",()=>{
  const fx=fixture();try{
    let member=register(fx),parent=review(fx,member,1);const origin=declaration(fx);fx.taskId="correction-owner";
    rejected(()=>register(fx,{...origin,logicalWorkIds:["AC-1","AC-2","AC-3"]}),"CGB-REVIEW-UNIT-BINDING");
    for(let round=2;round<=CRITIC_DISPATCH_LIMITS.criticRounds;round++){
      const prior=fx.candidate;writeFileSync(join(fx.root,"repair.txt"),`correction ${round}\n`);git(fx.root,["add","repair.txt"]);git(fx.root,["-c","user.name=Test","-c","user.email=test@example.invalid","commit","-qm",`repair ${round}`]);fx.candidate=git(fx.root,["rev-parse","HEAD"]);fx.reviewBase=prior;
      writeFileSync(join(fx.root,"evidence/verify.json"),JSON.stringify(produceCriticDiagnostic({root:fx.root,candidate:fx.candidate,specPath:"specs/spec.md",guardrailPaths:[".claude/pipeline.yaml"],command:[process.execPath,"-e","console.log(\"targeted pass\")"],logPath:`evidence/targeted-${round}.log`})));
      const correction={...declaration(fx),baseCommit:prior,changedBehaviorClaims:["repair-boundary"],pathInvariantMap:{"repair.txt":["AC-1"]},coordinatorImpactConfirmed:true,trustBoundaryChanged:false,impactAmbiguous:false,evidencePaths:["evidence/verify.json"]};
      rejected(()=>appendGenericCriticBatchCorrection({repoRoot:fx.root,controlRoot:join(fx.root,".git/agent-pipeline/critic-packets"),batchRef:member.batchRef,parent,correction:{...correction,taskId:origin.taskId}}),"CGB-CORRECTION-OWNER");
      member=appendGenericCriticBatchCorrection({repoRoot:fx.root,controlRoot:join(fx.root,".git/agent-pipeline/critic-packets"),batchRef:member.batchRef,parent,correction});
      parent=review(fx,member,round,false);
      rejected(()=>register(fx,declaration(fx)),"CGB-CONFLICT");
    }
    assert.equal(CRITIC_DISPATCH_LIMITS.criticRounds,4);
    const prior=fx.candidate;writeFileSync(join(fx.root,"repair.txt"),"over budget\n");git(fx.root,["add","repair.txt"]);git(fx.root,["-c","user.name=Test","-c","user.email=test@example.invalid","commit","-qm","over budget"]);fx.candidate=git(fx.root,["rev-parse","HEAD"]);
    const correction={...declaration(fx),baseCommit:prior,changedBehaviorClaims:["repair-boundary"],pathInvariantMap:{"repair.txt":["AC-1"]},coordinatorImpactConfirmed:true,trustBoundaryChanged:false,impactAmbiguous:false,evidencePaths:["evidence/verify.json"]};
    rejected(()=>appendGenericCriticBatchCorrection({repoRoot:fx.root,controlRoot:join(fx.root,".git/agent-pipeline/critic-packets"),batchRef:member.batchRef,parent,correction}),"CGB-BUDGET");
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("genuinely consumed PASS stops corrections before the remaining budget",()=>{
 const fx=fixture();try{const member=register(fx),parent=review(fx,member,1,true);const prior=fx.candidate;writeFileSync(join(fx.root,"repair.txt"),"unneeded change\n");fx.candidate=commit(fx.root,"after pass");
 const correction={...declaration(fx),baseCommit:prior,changedBehaviorClaims:["repair-boundary"],pathInvariantMap:{"repair.txt":["AC-1"]},coordinatorImpactConfirmed:true,trustBoundaryChanged:false,impactAmbiguous:false,evidencePaths:["evidence/verify.json"]};
 rejected(()=>appendGenericCriticBatchCorrection({repoRoot:fx.root,controlRoot:join(fx.root,".git/agent-pipeline/critic-packets"),batchRef:member.batchRef,parent,correction}),"CGB-PASS-STOPS");
 }finally{rmSync(fx.root,{recursive:true,force:true});}
});
function declaration(fx, overrides={}) {
  return {taskId:fx.taskId,baseCommit:fx.base,candidateCommit:fx.candidate,
    logicalWorkIds:["AC-1","AC-2"],specPath:"specs/spec.md",guardrailPaths:[".claude/pipeline.yaml"],
    signedQualityImportAnchor:null,reviewUnitPath:"specs/review-unit.json",...overrides};
}
function register(fx,d=declaration(fx)) {
  const controlRoot=join(fx.root,".git/agent-pipeline/critic-packets");
  mkdirSync(controlRoot,{recursive:true,mode:0o700});
  chmodSync(join(fx.root,".git/agent-pipeline"),0o700); chmodSync(controlRoot,0o700);
  return registerGenericCriticBatch({repoRoot:fx.root,controlRoot,declaration:d});
}
function rejected(action,code) {assert.throws(action,e=>e.code===code);}
test("miniitem without committed review purpose is refused; delivered record alone does not launch review",()=>{
  const fx=fixture(); try {
    const d=declaration(fx); delete d.reviewUnitPath;
    rejected(()=>register(fx,d),"CGB-REVIEW-UNIT-REQUIRED");
    assert.equal(existsSync(join(fx.root,".git/agent-pipeline/critic-packets/generic-batches/repository.json")),false);
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("predeclared integrated coherent purpose admits and exact replay retains budget identity",()=>{
  const fx=fixture();try{const first=register(fx);const next=register(fx);assert.deepEqual(next.batchRef,first.batchRef);assert.equal(next.replay,true);
    const r=JSON.parse(readFileSync(join(fx.root,".git/agent-pipeline/critic-packets/generic-batches",first.batchRef.batchId,"registration.json")));
    assert.equal(r.schema,"pipeline.critic-generic-batch.v2");assert.equal(r.declaredScope.reviewUnit.declaration.kind,"related-fixes");
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("fixed membership and range cannot drift on replay",()=>{
  const fx=fixture();try{register(fx);
    rejected(()=>register(fx,declaration(fx,{logicalWorkIds:["AC-1"]})),"CGB-REVIEW-UNIT-BINDING");
    rejected(()=>register(fx,declaration(fx,{baseCommit:fx.recordCommit})),"CGB-CONFLICT");
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("worker branch completion requires Main integration before first full review",()=>{
  const fx=fixture();try{git(fx.root,["branch","worker",fx.candidate]);git(fx.root,["reset","--hard",fx.base]);
    rejected(()=>register(fx),"CGB-MAIN-INTEGRATION");
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("purpose declared after work is refused",()=>{
  const fx=fixture();try{writeFileSync(join(fx.root,"specs/review-unit.json"),JSON.stringify(unit({purpose:"new purpose after work"})));fx.candidate=commit(fx.root,"late declaration");
    rejected(()=>register(fx),"CGB-REVIEW-UNIT-BINDING");
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("finalizer CLI versioned registration requires bound purpose and exposes no completion auto-trigger",()=>{
 const fx=fixture();try{mkdirSync(join(fx.root,"scratch"));const path=join(fx.root,"scratch/register.json");
 writeFileSync(path,JSON.stringify({schema:"pipeline.critic-generic-batch-registration-request.v1",declaration:declaration(fx)}));
 assert.equal(runSessionCriticFinalizerCli(["register-batch","--root",fx.root,"--request","scratch/register.json"]).output.code,"SCF-REVIEW-UNIT-REQUEST");
 writeFileSync(path,JSON.stringify({schema:"pipeline.critic-generic-batch-registration-request.v2",declaration:declaration(fx)}));
 const result=runSessionCriticFinalizerCli(["register-batch","--root",fx.root,"--request","scratch/register.json"]);assert.equal(result.exitCode,0);assert.ok(result.output.batchRef);
 const dir=join(fx.root,".git/agent-pipeline/critic-packets/generic-batches",result.output.batchRef.batchId);assert.equal(existsSync(join(dir,"full-admission.json")),false);
 }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("legacy sealed accounting remains readable but cannot grant a new method admission",()=>{
 const fx=fixture();try{
  const registered=register(fx),controlRoot=join(fx.root,".git/agent-pipeline/critic-packets"),store=join(controlRoot,"generic-batches"),dir=join(store,registered.batchRef.batchId);
  const registration=JSON.parse(readFileSync(join(dir,"registration.json")));delete registration.registrationSha256;registration.schema="pipeline.critic-generic-batch.v1";delete registration.declaredScope.reviewUnit;
  const batchRef={batchId:registered.batchRef.batchId,registrationSha256:sha256Canonical(registration)};
  writeFileSync(join(dir,"registration.json"),canonicalJson({...registration,registrationSha256:batchRef.registrationSha256}));
  writeFileSync(join(dir,"registration-complete.json"),canonicalJson({schema:"pipeline.critic-generic-registration-complete.v1",batchRef}));
  const member=JSON.parse(readFileSync(join(dir,"members",`${registered.memberSha256}.json`)));delete member.recordSha256;member.registrationSha256=batchRef.registrationSha256;const memberSha256=sha256Canonical(member);
  const put=(path,value)=>{writeFileSync(path,canonicalJson(value));chmodSync(path,0o600);};
  put(join(dir,"members",`${memberSha256}.json`),{...member,recordSha256:memberSha256});put(join(dir,"members",`${memberSha256}.complete.json`),{schema:"pipeline.critic-generic-member-complete.v1",memberSha256});
  for(const id of registration.declaredScope.logicalWorkIds)put(join(store,"logical",`${sha256Canonical(id)}.json`),{schema:"pipeline.critic-generic-index.v1",kind:"logical",identity:id,batchRef});
  const target=registration.originTargets[0];put(join(store,"origins",`${sha256Canonical(target)}.json`),{schema:"pipeline.critic-generic-index.v1",kind:"origins",identity:target,batchRef});
  const packetId="a".repeat(32);prepareCandidatePacket({repoRoot:fx.root,controlRoot,packetId,taskId:fx.taskId,projectId:"pipeline",baseCommit:fx.base,candidateCommit:fx.candidate,rulesetOid:fx.base,trigger:"T1",
    route:{routeId:"legacy-check",runner:"codex",adapter:"session-functional-equivalent",provider:"openai",modelTier:"higher-capability",effortTier:"xhigh",assurance:"functional-equivalent-read-only; OS isolation not asserted",projectionDigest:"a".repeat(64)},references:[{kind:"spec",path:"specs/spec.md"},{kind:"guardrail",path:".claude/pipeline.yaml"}],evidencePaths:["evidence/verify.json"]});
  rejected(()=>readGenericCriticBatchAdmission({controlRoot,packetId,batchRef,memberSha256}),"CGB-REVIEW-UNIT-REQUIRED");
 }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("feature ownership shares sealed generic work IDs; unrelated declared work remains unclaimed",()=>{
 const fx=fixture();try{
  const courseKey="e".repeat(64),logicalWorkIds=["AC-1","AC-2"];
  assert.equal(assertFeatureCriticReviewUnitOwnership({repoRoot:fx.root,courseKey,logicalWorkIds}).claimed,false);
  register(fx);
  rejected(()=>assertFeatureCriticReviewUnitOwnership({repoRoot:fx.root,courseKey,logicalWorkIds}),"CGB-CONFLICT");
  rejected(()=>assertFeatureCriticReviewUnitOwnership({repoRoot:fx.root,courseKey,logicalWorkIds:["AC-1","AC-3"]}),"CGB-CONFLICT");
  assert.equal(assertFeatureCriticReviewUnitOwnership({repoRoot:fx.root,courseKey,logicalWorkIds:["AC-3","AC-4"]}).claimed,false);
 }finally{rmSync(fx.root,{recursive:true,force:true});}
});
function git(root, args, options = {}) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", ...options });
  assert.equal(isSuccessfulSpawn(result), true, result.stderr);
  return String(result.stdout ?? "").trim();
}
function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}
function fixture({ rootCandidate = false, targetedExitCode = 0, taskId = "nova-b-lnd5", unitOverride = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "session-critic-finalizer-"));
  git(root, ["init", "-q", "-b", "main"]);
  mkdirSync(join(root, ".claude"));
  mkdirSync(join(root, "specs"));
  mkdirSync(join(root, "evidence"));
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\nAC-1 AC-2\n");
  writeFileSync(join(root, "specs", "review-unit.json"), JSON.stringify(unit(unitOverride)));
  const emptyTree = git(root, ["hash-object", "-t", "tree", "--stdin"], { input: "" });
  const base = rootCandidate ? emptyTree : commit(root, "base");
  if (!rootCandidate) writeFileSync(join(root, "specs", "spec.md"), "# Spec\nAC-1 AC-2\nSource candidate.\n");
  const historicalCandidate = commit(root, rootCandidate ? "root source candidate" : "source candidate");
  const recordPath = `evidence/dispatch-record-${taskId}.json`;
  const record = {
    schema: "pipeline.dispatch-record.v3",
    taskId,
    agentType: "default",
    model: "gpt-5.6-luna",
    effort: "medium",
    rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0",
    dispatcher: "elephant",
    outcome: "completed",
    commits: [historicalCandidate],
    candidateCommit: historicalCandidate,
    resultSha256: "a".repeat(64),
    log: [],
    report: { text: "done", changedFiles: ["specs/spec.md"] },
    criticRequired: {
      schema: "pipeline.critic-required-decision.v1",
      trigger: {
        schema: "pipeline.critic-trigger-input.v1",
        rigorLevel: 2,
        riskClass: "high",
        riskFlag: true,
        diff: { mechanical: false, architecture: false, guardrails: true, security: false },
      },
      appliedRow: "T1",
    },
  };
  const recordBytes = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(join(root, recordPath), recordBytes);
  writeFileSync(join(root, "evidence/dispatch-record-correction-owner.json"), JSON.stringify({...record,taskId:"correction-owner"}));
  const recordCommit = commit(root, "persist authored dispatch record");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\nAC-1 AC-2\nDescendant candidate.\n");
  const candidate = commit(root, "descendant candidate");
  const tree = git(root, ["rev-parse", `${candidate}^{tree}`]);
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify(produceCriticDiagnostic({ root, candidate, specPath: "specs/spec.md", guardrailPaths: [".claude/pipeline.yaml"], command: [process.execPath, "-e", `console.log('fixture targeted result'); process.exit(${targetedExitCode})`], logPath: "evidence/targeted.log" }))}\n`);
  return { root, base, historicalCandidate, recordCommit, candidate, tree, taskId, recordPath, recordBytes };
}

registerTestCaseCompletion({cases:completionCases,fd:3,maxBytes:8192});

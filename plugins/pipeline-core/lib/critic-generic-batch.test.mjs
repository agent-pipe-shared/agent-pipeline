// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import {registerTestCaseCompletion} from "./test-case-completion.mjs";
import {spawn,spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isSuccessfulSpawn} from "./successful-spawn.mjs";
import {produceCriticDiagnostic} from "./critic-diagnostic-producer.mjs";
import {registerGenericCriticBatch,appendGenericCriticBatchCorrection,readGenericCriticBatchAdmission,assertFeatureCriticReviewUnitOwnership,reserveFeatureCriticReviewUnitOwnership} from "./critic-generic-batch.mjs";
import {admitSessionCriticReview,finalizeSessionCriticReview,runSessionCriticFinalizerCli} from "../scripts/session-critic-finalizer.mjs";
import {sha256Canonical,CRITIC_DISPATCH_LIMITS} from "./review-economy.mjs";
import {readConsumedSessionAdmission,prepareCandidatePacket,claimCandidatePacket,sha256,canonicalJson} from "../scripts/critic-packet-preflight.mjs";
import {readCriticCourseAdmission} from "./critic-course-admission.mjs";
import {derivePoGateRepositoryFingerprint} from "./po-gate-authority.mjs";
import {inspectGenericCriticBatchRecovery,recoverGenericCriticBatchEmptyStore} from "./critic-generic-batch.mjs";
import {readdirSync,readlinkSync} from "node:fs";

const completionCaseIds = Object.freeze(["CGB001", "CGB002", "CGB003", "CGB004", "CGB005", "CGB006", "CGB007", "CGB008", "CGB009", "CGB010", "CGB011", "CGB012", "CGB013", "CGB014", "CGB015", "CGB016", "CGB017"]);
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
function fixture({ rootCandidate = false, targetedExitCode = 0, taskId = "nova-b-lnd5", unitOverride = {}, feature = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "session-critic-finalizer-"));
  git(root, ["init", "-q", "-b", "main"]);
  mkdirSync(join(root, ".claude"));
  mkdirSync(join(root, "specs"));
  mkdirSync(join(root, "evidence"));
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\nAC-1 AC-2\n");
  writeFileSync(join(root, "specs", "review-unit.json"), JSON.stringify(unit(unitOverride)));
  if(feature){
    const directory=join(root,"specs/course-feature");
    mkdirSync(join(directory,"design"),{recursive:true}); mkdirSync(join(directory,"evidence"));
    writeFileSync(join(directory,"spec.md"),"# Feature spec\nAC-1 AC-2\n");
    const reviewUnit=JSON.stringify(unit({...unitOverride,specPath:"specs/course-feature/spec.md"}));
    writeFileSync(join(directory,"design/critic-review-unit.json"),reviewUnit);
    const artifacts=[{class:"spec",path:"specs/course-feature/spec.md",authority:true},
      {class:"design",path:"specs/course-feature/design/critic-review-unit.json",sha256:sha256(reviewUnit),authority:false,mutability:"immutable",retention:"retain"}];
    writeFileSync(join(directory,"lifecycle.json"),`${JSON.stringify({schema:"pipeline.feature-package.v1",feature:{id:"course-feature"},state:"approved",artifacts})}\n`);
    writeFileSync(join(root,".claude/pipeline.json"),JSON.stringify({project:"fixture",verify:"node verify.mjs"}));
    writeFileSync(join(root,".claude/settings.json"),JSON.stringify({fixture:true}));
  }
  const emptyTree = git(root, ["hash-object", "-t", "tree", "--stdin"], { input: "" });
  const base = rootCandidate ? emptyTree : commit(root, "base");
  if (!rootCandidate) writeFileSync(join(root, "specs", "spec.md"), "# Spec\nAC-1 AC-2\nSource candidate.\n");
  if(feature)writeFileSync(join(root,"specs/course-feature/spec.md"),"# Feature spec\nAC-1 AC-2\nSource candidate.\n");
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
    log: [{ phase: "verify", toolUseCount: 1 }],
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
  if(feature)writeFileSync(join(root,"specs/course-feature/spec.md"),"# Feature spec\nAC-1 AC-2\nDescendant candidate.\n");
  const candidate = commit(root, "descendant candidate");
  const tree = git(root, ["rev-parse", `${candidate}^{tree}`]);
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify(produceCriticDiagnostic({ root, candidate, specPath: "specs/spec.md", guardrailPaths: [".claude/pipeline.yaml"], command: [process.execPath, "-e", `console.log('fixture targeted result'); process.exit(${targetedExitCode})`], logPath: "evidence/targeted.log" }))}\n`);
  return { root, base, historicalCandidate, recordCommit, candidate, tree, taskId, recordPath, recordBytes };
}

test("generated pipeline JSON is an exact committed guardrail reference",()=>{
  const fx=fixture();try{
    const calibration=JSON.stringify({project:"fixture",verify:"node verify.mjs"});
    writeFileSync(join(fx.root,".claude/pipeline.json"),calibration);
    fx.candidate=commit(fx.root,"generated manifest");
    const d=declaration(fx,{guardrailPaths:[".claude/pipeline.json"]});
    const result=register(fx,d);
    assert.equal(result.replay,false);
    const saved=JSON.parse(readFileSync(join(fx.root,".git/agent-pipeline/critic-packets/generic-batches",result.batchRef.batchId,"registration.json")));
    assert.deepEqual(saved.declaredScope.guardrails.map(row=>[row.path,row.sha256]),[[".claude/pipeline.json",sha256(calibration)]]);
    rejected(()=>register(fx,{...d,guardrailPaths:[".claude/credentials.json"]}),"CGB-REFERENCE");
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("rejected guardrail leaves no held transaction and retry can register",()=>{
  const fx=fixture();try{
    const controlRoot=join(fx.root,".git/agent-pipeline/critic-packets");
    rejected(()=>register(fx,declaration(fx,{guardrailPaths:[".claude/missing.json"]})),"CGB-REFERENCE");
    assert.equal(existsSync(join(controlRoot,"generic-batches/transaction.lock")),false);
    assert.ok(register(fx).batchRef);
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("live owner and partial effects keep a digest-bound transaction hold",async()=>{
  const fx=fixture();try{
    const controlRoot=join(fx.root,".git/agent-pipeline/critic-packets");
    const store=join(controlRoot,"generic-batches");
    mkdirSync(store,{recursive:true,mode:0o700});
    chmodSync(join(fx.root,".git/agent-pipeline"),0o700);
    chmodSync(controlRoot,0o700); chmodSync(store,0o700);
    for(const name of ["logical","origins"])mkdirSync(join(store,name),{mode:0o700});
    const commonDir=join(fx.root,".git");
    const repository={schema:"pipeline.critic-generic-repository.v1",repoRoot:fx.root,commonDir,
      repositoryFingerprint:derivePoGateRepositoryFingerprint({gitCommonDir:commonDir,primaryRoot:fx.root})};
    const file=join(store,"repository.json");
    writeFileSync(file,canonicalJson(repository),{mode:0o600});
    const lock=join(store,"transaction.lock");
    const child=spawn(process.execPath,["--input-type=module","-e",
      "import {mkdirSync,rmdirSync} from 'node:fs'; mkdirSync(process.argv[1],{mode:0o700}); console.log('held'); process.stdin.once('data',()=>{rmdirSync(process.argv[1]); process.exit(0);});",lock],
      {stdio:["pipe","pipe","pipe"]});
    try {
    await new Promise((resolve,reject)=>{child.stdout.once("data",bytes=>bytes.toString().includes("held")?resolve():reject(new Error("holder not ready")));child.once("error",reject);child.once("exit",()=>reject(new Error("holder exited before inspection")));});
    const inspected=inspectGenericCriticBatchRecovery({controlRoot});
    assert.equal(inspected.status,"empty-store-held");
    rejected(()=>recoverGenericCriticBatchEmptyStore({controlRoot,digestSha256:"0".repeat(64)}),"CGB-RECOVERY-STALE");
    writeFileSync(join(store,"logical/foreign.json"),"{}");
    const partial=inspectGenericCriticBatchRecovery({controlRoot});
    assert.equal(partial.status,"partial-held");
    assert.notEqual(partial.digestSha256,inspected.digestSha256);
    rejected(()=>recoverGenericCriticBatchEmptyStore({controlRoot,digestSha256:inspected.digestSha256}),"CGB-RECOVERY-STALE");
    rejected(()=>recoverGenericCriticBatchEmptyStore({controlRoot,digestSha256:partial.digestSha256}),"CGB-RECOVERY-PARTIAL");
    rmSync(join(store,"logical/foreign.json"));
    rejected(()=>recoverGenericCriticBatchEmptyStore({controlRoot,digestSha256:inspected.digestSha256}),"CGB-RECOVERY-OWNER-UNPROVEN");
    assert.equal(existsSync(lock),true);
    } finally {
      const exit=new Promise(resolve=>child.once("exit",resolve));
      child.stdin.write("release\n");
      assert.equal(await exit,0);
    }
    assert.equal(existsSync(lock),false);
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
test("feature reserve validates packet guardrails before store effects and can retry",()=>{
  const fx=fixture({feature:true});try{
    const featureRoot=join(fx.root,"specs/course-feature");
    const logPath="specs/course-feature/evidence/targeted.log";
    const jsonPath="specs/course-feature/evidence/diagnostic.json";
    const diagnostic=produceCriticDiagnostic({root:fx.root,candidate:fx.candidate,
      specPath:"specs/course-feature/spec.md",command:[process.execPath,"-e","console.log('feature fixture pass')"],
      logPath:"evidence/feature-targeted.log"});
    const log=readFileSync(join(fx.root,"evidence/feature-targeted.log"));
    writeFileSync(join(fx.root,logPath),log);
    diagnostic.targeted.log.path=logPath;
    const bytes=`${JSON.stringify(diagnostic)}\n`;
    writeFileSync(join(fx.root,jsonPath),bytes);
    const manifestPath=join(featureRoot,"lifecycle.json");
    const manifest=JSON.parse(readFileSync(manifestPath));
    for(const [path,content] of [[logPath,log],[jsonPath,bytes]])manifest.artifacts.push({class:"candidate-evidence",path,
      sha256:sha256(content),authority:false,mutability:"immutable",retention:"retain"});
    writeFileSync(manifestPath,`${JSON.stringify(manifest)}\n`);
    // The evidence transport admits exactly the manifest and its declared members. The
    // generic fixture's untracked root captures must not ride into this registration commit.
    git(fx.root,["add","specs/course-feature/lifecycle.json",logPath,jsonPath]);
    git(fx.root,["-c","user.name=Test","-c","user.email=test@example.invalid","commit","-qm","register feature diagnostic"]);
    const registrationCommit=git(fx.root,["rev-parse","HEAD"]);
    const courseInput={repoRoot:fx.root,featureId:"course-feature",baseCommit:fx.base,candidateCommit:fx.candidate,
      registrationCommit,requestedMode:"full",acceptedReference:null,criterionLocator:null,deltaRequestPath:null};
    const projection=readCriticCourseAdmission(courseInput);
    assert.equal(projection.decision.status,"admitted",JSON.stringify(projection.decision));
    const {decision,...subject}=projection;
    const controlRoot=join(fx.root,".git/agent-pipeline/critic-packets");
    mkdirSync(controlRoot,{recursive:true,mode:0o700});
    chmodSync(join(fx.root,".git/agent-pipeline"),0o700);chmodSync(controlRoot,0o700);
    const route={routeId:"feature-fixture",runner:"codex",adapter:"session-functional-equivalent",provider:"openai",
      modelTier:"higher-capability",effortTier:"xhigh",assurance:"functional-equivalent-read-only; OS isolation not asserted",projectionDigest:"a".repeat(64)};
    const preflightSha256="b".repeat(64);
    const sessionBinding={schema:"pipeline.session-critic-packet-binding.v1",sessionId:"feature-fixture",preflightSha256,
      assurance:route.assurance,freshContext:true,historyInherited:false,mayDelegate:false};
    const reserveFor=(packetId,guardrail)=>{
      prepareCandidatePacket({repoRoot:fx.root,controlRoot,packetId,taskId:fx.taskId,projectId:"pipeline",
        baseCommit:fx.base,candidateCommit:fx.candidate,rulesetOid:fx.base,route,sessionBinding,
        references:[{kind:"spec",path:"specs/course-feature/spec.md"},{kind:"guardrail",path:guardrail}]});
      claimCandidatePacket({controlRoot,packetId,adapter:route.adapter,claimantNonce:"c".repeat(64)});
      return reserveFeatureCriticReviewUnitOwnership({repoRoot:fx.root,controlRoot,packetId,preflightSha256,courseInput,
        sourceSha256:sha256Canonical(subject),decisionSha256:sha256Canonical(decision)});
    };
    rejected(()=>reserveFor("d".repeat(32),".claude/settings.json"),"CGB-REFERENCE");
    assert.equal(existsSync(join(controlRoot,"generic-batches/transaction.lock")),false);
    assert.ok(reserveFor("e".repeat(32),".claude/pipeline.json").reservation);
  }finally{rmSync(fx.root,{recursive:true,force:true});}
});
// AC-245 / AGY2-H05: a transaction whose process died must leave a lock that a typed, digest-bound
// recovery can release, but only when the recorded owner is provably gone on this same host and the
// transaction left no partial publication. The holder below is a REAL second process running the real
// registration; it is parked inside the transaction (after the store skeleton exists, before the first
// batch id is drawn) so the test can observe the owner record the code itself wrote and then kill it.
async function abandonedHolder(fx){
  const controlRoot=join(fx.root,".git/agent-pipeline/critic-packets"),store=join(controlRoot,"generic-batches");
  mkdirSync(controlRoot,{recursive:true,mode:0o700});
  chmodSync(join(fx.root,".git/agent-pipeline"),0o700);chmodSync(controlRoot,0o700);
  const lock=join(store,"transaction.lock"),ownerFile=join(lock,"owner.json");
  const payload=JSON.stringify({repoRoot:fx.root,controlRoot,declaration:declaration(fx)});
  const child=spawn(process.execPath,["--input-type=module","-e",
    "import crypto from 'node:crypto';import {syncBuiltinESMExports} from 'node:module';import {existsSync,writeSync} from 'node:fs';"
    +"const [,moduleUrl,ownerPath,input]=process.argv.slice(1);const real=crypto.randomBytes;"
    +"crypto.randomBytes=(...a)=>{if(existsSync(ownerPath)){writeSync(1,'held\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}return real(...a);};"
    +"syncBuiltinESMExports();const m=await import(moduleUrl);m.registerGenericCriticBatch(JSON.parse(input));",
    fx.root,new URL("./critic-generic-batch.mjs",import.meta.url).href,ownerFile,payload],{stdio:["ignore","pipe","pipe"]});
  let errors="";child.stderr.on("data",b=>{errors+=b;});
  await new Promise((resolve,reject)=>{
    child.stdout.on("data",b=>{if(String(b).includes("held"))resolve();});
    child.once("error",reject);
    child.once("exit",code=>reject(new Error(`the transaction owner ended (${code}) without holding a lock owner record: ${errors.slice(0,400)}`)));
  });
  const alive=()=>child.exitCode===null&&child.signalCode===null;
  const kill=async()=>{if(!alive())return;const gone=new Promise(done=>child.once("exit",done));child.kill("SIGKILL");await gone;};
  return {child,alive,kill,controlRoot,store,lock,ownerFile,owner:JSON.parse(readFileSync(ownerFile,"utf8"))};
}
function processStartTicks(pid){const text=readFileSync(`/proc/${pid}/stat`,"utf8");return text.slice(text.lastIndexOf(")")+2).trim().split(/\s+/u)[19];}
test("a transaction records its owner; a live owner keeps the hold and a killed same-host owner without effects is recovered",async()=>{
  const fx=fixture();let holder=null;try{
    holder=await abandonedHolder(fx);
    const {owner,controlRoot}=holder;
    assert.equal(owner.schema,"pipeline.critic-generic-batch-lock-owner.v1");
    assert.equal(owner.pid,holder.child.pid);
    if(process.platform==="linux"){
      assert.equal(owner.processStart,processStartTicks(owner.pid));
      assert.equal(owner.bootId,readFileSync("/proc/sys/kernel/random/boot_id","utf8").trim().toLowerCase());
    }
    const inspected=inspectGenericCriticBatchRecovery({controlRoot});
    assert.equal(inspected.status,"empty-store-held");
    rejected(()=>recoverGenericCriticBatchEmptyStore({controlRoot,digestSha256:inspected.digestSha256}),"CGB-RECOVERY-OWNER-LIVE");
    assert.equal(existsSync(holder.lock),true);
    await holder.kill();
    assert.equal(inspectGenericCriticBatchRecovery({controlRoot}).digestSha256,inspected.digestSha256);
    const released=recoverGenericCriticBatchEmptyStore({controlRoot,digestSha256:inspected.digestSha256});
    assert.equal(released.status,"released");
    assert.equal(existsSync(holder.lock),false);
    assert.deepEqual(readdirSync(holder.store).sort(),["logical","origins","repository.json"]);
    rejected(()=>recoverGenericCriticBatchEmptyStore({controlRoot,digestSha256:inspected.digestSha256}),"CGB-RECOVERY-NOT-HELD");
    assert.ok(register(fx).batchRef);
  }finally{if(holder)await holder.kill();rmSync(fx.root,{recursive:true,force:true});}
});
test("owner identity is judged conservatively: foreign, unreadable or ownerless holds stay refused; a reused pid or an earlier boot is gone; partial effects are preserved",async()=>{
  const fx=fixture();let holder=null;try{
    holder=await abandonedHolder(fx);
    const real=holder.owner,{controlRoot}=holder;
    await holder.kill();
    const hold=owner=>{rmSync(holder.lock,{recursive:true,force:true});mkdirSync(holder.lock,{mode:0o700});chmodSync(holder.lock,0o700);
      if(owner!==null)writeFileSync(holder.ownerFile,canonicalJson(owner),{mode:0o600});};
    const attempt=()=>recoverGenericCriticBatchEmptyStore({controlRoot,digestSha256:inspectGenericCriticBatchRecovery({controlRoot}).digestSha256});
    const refused=(owner,code)=>{hold(owner);rejected(attempt,code);assert.equal(existsSync(holder.lock),true);};
    const released=owner=>{hold(owner);assert.equal(attempt().status,"released");assert.equal(existsSync(holder.lock),false);};
    refused({...real,hostId:"f".repeat(64)},"CGB-RECOVERY-OWNER-FOREIGN");
    refused({...real,machineId:"e".repeat(64)},"CGB-RECOVERY-OWNER-FOREIGN");
    refused({...real,platform:"plan9"},"CGB-RECOVERY-OWNER-FOREIGN");
    refused({...real,extra:true},"CGB-RECOVERY-OWNER-UNPROVEN");
    refused({...real,pid:0},"CGB-RECOVERY-OWNER-UNPROVEN");
    refused({...real,nonce:"short"},"CGB-RECOVERY-OWNER-UNPROVEN");
    refused(null,"CGB-RECOVERY-OWNER-UNPROVEN");
    if(process.platform==="linux"){
      const mine=processStartTicks(process.pid);
      refused({...real,pid:process.pid,processStart:mine},"CGB-RECOVERY-OWNER-LIVE");
      released({...real,pid:process.pid,processStart:String(Number(mine)+1)});
      released({...real,pid:process.pid,processStart:mine,bootId:"00000000-0000-0000-0000-000000000000"});
      let namespace=null;try{namespace=readlinkSync("/proc/self/ns/pid");}catch{}
      if(namespace!==null)refused({...real,pid:process.pid,processStart:mine,pidNamespace:"pid:[1]"},"CGB-RECOVERY-OWNER-FOREIGN");
    }
    hold(real);
    writeFileSync(join(holder.store,"logical/foreign.json"),"{}");
    const partial=inspectGenericCriticBatchRecovery({controlRoot});
    assert.equal(partial.status,"partial-held");
    rejected(()=>recoverGenericCriticBatchEmptyStore({controlRoot,digestSha256:partial.digestSha256}),"CGB-RECOVERY-PARTIAL");
    assert.equal(existsSync(holder.lock),true);
    assert.equal(existsSync(join(holder.store,"logical/foreign.json")),true);
  }finally{if(holder)await holder.kill();rmSync(fx.root,{recursive:true,force:true});}
});
registerTestCaseCompletion({cases:completionCases,fd:3,maxBytes:8192});

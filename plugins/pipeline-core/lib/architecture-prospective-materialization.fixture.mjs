// SPDX-License-Identifier: SUL-1.0
// METHOD fixtures only: real writers and verification of synthetic inputs.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {appendFileSync,chmodSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {run,readState,statePath,observeCurrentPlanApprovalForCalibration,readAcceptedDeliveryContract,checkPoGateAuthority} from '../scripts/pipeline-state.mjs';
import {inspectArchitectureDesign} from './architecture-design.mjs';
import * as po from './po-gate-authority.mjs';
import {createDesignReviewReceipt} from './design-review-receipt.mjs';
import {initialGreenfieldMapTargets,initialGreenfieldAgentEntryTarget} from './architecture-map-scaffold.mjs';
import {compileDecisionSummary} from '../scripts/architecture-baseline.mjs';
import {validateFeaturePackage} from './feature-package-topology.mjs';
import {createGovernanceScopeController} from './governance-scope.mjs';
import {NEUTRAL_MANIFEST,NEUTRAL_STATE} from './project-authority.mjs';
import {derivePlanLifecycle} from './plan-spec-state-v2.mjs';
import {isSuccessfulSpawn} from './successful-spawn.mjs';
import {createWindowsOwnedAuthorityDirectory,inspectWindowsOwnedAuthorityPath} from './windows-owned-authority-backend.mjs';

export const AT='2026-10-10T10:00:00.000Z';
export const TWINS=['project/pipeline.json','.claude/pipeline.json'];
export const COMMAND='node --test tests/unit.test.mjs';
export const PLAN='specs/e2e/prd_e2e.md',SPEC='specs/e2e/spec.md';
const COMPANIONS=['specs/e2e/design.md','specs/e2e/traceability.md'];
const REPORT='specs/e2e/review/design-review-1.md',RECEIPT='specs/e2e/review/design-review-receipt-1.json';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const own=dirname(fileURLToPath(import.meta.url));
const units=join(process.cwd(),'scratch','architecture-prospective-method-'+process.pid);
let initialized=false;
function initialize(){
  if(initialized)return;
  mkdirSync(units,{mode:0o700,recursive:true});
  // Diagnostic successor inherits HOME, temporary-directory and Git policy.
  initialized=true;
}
export function write(f,path,bytes){const target=join(f.dir,path);mkdirSync(dirname(target),{recursive:true,mode:0o700});writeFileSync(target,bytes,{mode:0o600});}
export const bytes=(f,path)=>readFileSync(join(f.dir,path));
export const json=(f,path)=>JSON.parse(bytes(f,path));
export const writeJson=(f,path,value)=>write(f,path,JSON.stringify(value,null,2)+'\n');
export function gitResult(f,argv,{normal=false}={}){
  assert(f.dir.startsWith(join(units,'unit-')),'Git confined to exclusive synthetic repository');
  const out=spawnSync('git',['-C',f.dir,...argv],{encoding:'utf8',timeout:90000,maxBuffer:8388608,env:{...process.env},shell:false});
  appendFileSync(join(units,'git-audit.jsonl'),JSON.stringify({fixture:dirname(f.dir).split('/').at(-1)+'/'+f.dir.split('/').at(-1),argv,normal,status:out.status,signal:out.signal,error:out.error?{code:out.error.code,message:out.error.message}:null,stdout:out.stdout,stderr:out.stderr})+'\n');
  return out;
}
export function git(f,...argv){const out=gitResult(f,argv);assert(isSuccessfulSpawn(out),`SETUP Git ${argv[0]}: ${out.stderr}`);return out.stdout.trim();}
export function invoke(f,argv){
  const logs=[],old={log:console.log,error:console.error,warn:console.warn};
  for(const name of Object.keys(old))console[name]=(...args)=>logs.push({channel:name,text:args.map(String).join(' ')});
  let status;try{status=run(argv,{dir:f.dir,now:()=>AT});}finally{Object.assign(console,old);}
  const result={status,text:logs.map(x=>x.text).join('\n')};
  appendFileSync(join(units,'source-call-audit.jsonl'),JSON.stringify({argv,...result})+'\n');return result;
}
export function must(f,argv){const out=invoke(f,argv);assert.equal(out.status,0,`SETUP ${argv[0]}: ${out.text}`);return out;}
export function state(f){const observed=readState(f.dir);assert.equal(observed.status,'ok');return observed.state;}
export const rawState=f=>readFileSync(statePath(f.dir));
export const stateRelative=f=>statePath(f.dir).slice(f.dir.length+1);
export function assertPrivateState(f,expected){
  assert.deepEqual(rawState(f),expected,'private lifecycle State bytes remain unchanged');
  const info=lstatSync(statePath(f.dir));assert(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1);if(process.platform==='win32'){const root=inspectWindowsOwnedAuthorityPath({path:join(f.dir,'.git','agent-pipeline'),directory:true});assert(/^[a-f0-9]{64}$/u.test(root.nativeFactsSha256),'actual private State root owned-DACL observation');}else assert.equal(info.mode&0o077,0,'actual private State mode');
  const path=stateRelative(f);
  assert.equal(gitResult(f,['check-ignore','--quiet','--',path]).status,0,'State is actually ignored');
  assert.equal(git(f,'ls-files','--',path),'','State remains untracked');
  assert.notEqual(gitResult(f,['cat-file','-e',`HEAD:${path}`]).status,0,'State absent from HEAD');
}
export function observe(f){return observeCurrentPlanApprovalForCalibration({rootDir:f.dir});}
export function requireEligible(f){const value=observe(f);assert.equal(value.status,'eligible','SETUP genuine default approval reader: '+JSON.stringify(value));assert.equal(value.approvalBasis,f.mode==='signature'?'signature':'chat-attributed-unattested');return value;}

export function requireApproved(f){
  const current=state(f),lifecycle=derivePlanLifecycle(current);
  assert(lifecycle.ok&&lifecycle.status==='approved'&&lifecycle.approvalCurrent===true,'SETUP genuine current approved lifecycle');
  assert.equal(current.planApproval.schema,'pipeline.plan-approval.v9');
  const accepted=readAcceptedDeliveryContract({dir:f.dir,envelopePath:current.planApproval.acceptedContract.path});
  assert(accepted.ok,'SETUP genuine default accepted reader: '+JSON.stringify(accepted));
  assert.equal(accepted.authorityBasis,f.mode==='signature'?'signature':'chat-attributed-unattested');
  const authority=checkPoGateAuthority({repoRoot:f.dir});
  assert(authority.ok&&authority.divergences.length===0&&authority.prdCardinality.head.ok&&authority.prdCardinality.worktree.ok,'SETUP genuine current source approval authority');
  assert.deepEqual(authority.value,current.planApproval.poGateAuthority);
  const design=inspectArchitectureDesign(f.dir);
  assert(design.ok&&design.status==='materialized'&&design.authority==='approved-design-package','SETUP genuine approved design materialization: '+JSON.stringify(design));
  return {accepted,authority,design};
}

const architecture={schema:'pipeline.architecture-design.v1',repositoryKind:'greenfield',disposition:{decision:'approved-scoped',scope:['specs/','architecture/','src/','tests/'],rationale:'Synthetic scoped method fixture; no new material decision'},modules:[{id:'unit',responsibility:'Own synthetic unit',nonResponsibilities:['No external authority'],ownedPaths:['src/**','tests/**'],publicContracts:['src/index.mjs'],allowedDependencies:[],authorityEffects:[],verificationEntryPoints:['tests/unit.test.mjs'],adrReferences:[]}],implementationSurface:['src/index.mjs'],fitnessModel:{schema:'pipeline.fitness-model.v1',profileId:'synthetic-unit',revision:1,allowedBoundaryCrossings:[],antiFragmentationPolicy:{decision:'bounded'}}};

export function makeFixture(mode='signature',{trackedState=false,stage='implementing',withDecisionBindings=true,legacy=false,descriptorCarrier='companion'}={}){
  assert(['draft','initialized','submitted','presented','approved-unmaterialized','approved','implementing'].includes(stage),'closed genuine fixture stage');
  COMPANIONS.splice(0, COMPANIONS.length, "specs/e2e/design.md", "specs/e2e/traceability.md");
  initialize();const f={dir:mkdtempSync(join(units,'unit-')),mode,trackedState,legacy,descriptorCarrier};
  git(f,'init','-q');git(f,'config','user.name','Synthetic P16 Fixture');git(f,'config','user.email','p16@example.invalid');git(f,'config','core.autocrlf','false');
  write(f,'README.md','Synthetic method fixture\n');
  write(f,'.gitignore',trackedState?'scratch/\n':'scratch/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n');
  const baseline={schema:'pipeline.project.v1',project:'synthetic-p16',verify:null,autonomy:'gated',handover:'docs/state.md'};
  for(const path of TWINS)writeJson(f,path,baseline);
  git(f,'add','--','README.md','.gitignore',...TWINS);git(f,'commit','-q','-m','test(agd): seed method project\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true');
  // Actual source-owned activation before any retained State; no invented ready marker.
  const governance=createGovernanceScopeController();
  const enrollment=governance.planDecision({rootDir:f.dir,decision:'enroll',by:'Synthetic method fixture'});
  assert.equal(governance.applyDecision(enrollment,{activate:true,planSha256:enrollment.planSha256}).state,'active','SETUP real governance decision');
  write(f,'pipeline.user.yaml',`schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\ngates:\n  human_approval: ${mode}\n`);
  git(f,'add','--','pipeline.user.yaml');git(f,'commit','-q','-m','test(agd): select method signature mode\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true');
  write(f,'.claude/pipeline.yaml','schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n');write(f,NEUTRAL_MANIFEST,bytes(f,'.claude/pipeline.yaml'));
  assert.equal(statePath(f.dir),join(f.dir,NEUTRAL_STATE));
  for(const target of initialGreenfieldMapTargets('fresh'))write(f,target.path,target.bytes);
  const pointer=initialGreenfieldAgentEntryTarget('fresh');write(f,pointer.path,pointer.bytes);write(f,'docs/adr/.gitkeep','');
  write(f,'specs/e2e/acceptance.md','# Synthetic acceptance\n');write(f,'specs/e2e/result.md','# Synthetic result\n');
  write(f,SPEC,'# Synthetic Test Spec\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | The package must receive a PASS verdict from an independent Critic before acceptance. | Synthetic candidate-bound review |\n');
  write(f,PLAN,`${po.PO_GATE_PRD_LANGUAGE_MARKER('de')}\n${po.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${hash(bytes(f,SPEC))} -->\n# Synthetic Test PRD\nImplementation surface: \`src/index.mjs\`.\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(architecture)}\n\`\`\`\n`);
  write(f,COMPANIONS[0],'# Synthetic Design\n');write(f,COMPANIONS[1],'| ID | Evidence |\n| --- | --- |\n');write(f,REPORT,'# Synthetic method review\nVerdict: pass.\n');
  prospectiveSubjects(f, COMPANIONS);

  const common=join(f.dir,'.git'),profile=po.createPoGateProfileReceipt({repositoryFingerprint:po.derivePoGateRepositoryFingerprint({gitCommonDir:common,primaryRoot:f.dir}),primaryRoot:f.dir,sourceBytes:bytes(f,'pipeline.user.yaml'),runtimeBytes:bytes(f,'.claude/pipeline.yaml'),updatedAt:AT});
  const profilePath=po.poGateProfileReceiptPath(common);
  // Native Windows: the private-state root must carry the production-owned protected DACL (mkdirSync mode is a no-op there and would inherit).
  if(process.platform==='win32')createWindowsOwnedAuthorityDirectory({path:join(common,'agent-pipeline')});
  mkdirSync(dirname(profilePath),{recursive:true,mode:0o700});writeFileSync(profilePath,po.serializePoGateProfileReceipt(profile),{mode:0o600});chmodSync(profilePath,0o600);
  const source=path=>({path,sha256:hash(bytes(f,path))});
  const review=createDesignReviewReceipt({featureId:'e2e',previous:null,sources:{prd:source(PLAN),spec:source(SPEC),companions:COMPANIONS.map(source)},reviewer:{runner:'claude',model:'claude-opus-4'},report:source(REPORT),openFindingIds:[],reviewedAt:AT});
  assert(review.ok,'SETUP actual review producer: '+review.code);write(f,RECEIPT,Buffer.from(review.bytes));
  const keys=generateKeyPairSync('ed25519');f.publicKey=keys.publicKey.export({type:'spki',format:'pem'});f.keyReference='synthetic-p16-key';f.signDigest=value=>sign(null,Buffer.from(value),keys.privateKey).toString('base64');
  writeJson(f,'project/critical-human-proof.json',{schema:'pipeline.critical-human-proof-policy.v3',requiredKinds:['push'],waivedKinds:[],trustAnchors:[{keyReference:f.keyReference,publicKeySha256:hash(f.publicKey)}]});
  git(f,'add','--',PLAN,SPEC,...COMPANIONS,REPORT,RECEIPT,'project/critical-human-proof.json','specs/e2e/acceptance.md','specs/e2e/result.md','architecture/map/index.md','architecture/map/inventory.json','AGENTS.md','docs/adr/.gitkeep',NEUTRAL_MANIFEST);
  git(f,'commit','-q','-m','test(agd): bind aggregate method subjects\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true');
  must(f,['set-feature','--id','e2e','--plan-path',PLAN]);
  const continuity={schema:'pipeline.continuity.v0',featureId:'e2e',revision:0,runtime:{humanFacingLanguage:'de',activeDuty:'Coordinator',sessionCleanup:null},authority:{prd:source(PLAN),spec:source(SPEC),result:null},queueHead:{packageId:'initial-planning',actionId:'review-plan',nextAction:'review',productRetryCount:0,environmentRerouteCount:0,dispatch:null},blocker:null,acknowledgedFinal:null,resume:{mode:'immediate',sourceRevision:0,reasonCode:'active-turn'},recovery:null,decisionTxn:null,capacity:{concurrencyLimit:4,reservedCriticSlots:1,reservedRecoverySlots:1,fallbackPolicy:'defer'}};
  f.continuityInitRequest=structuredClone(continuity);f.reviewReceiptPath=RECEIPT;
  writeJson(f,'continuity-init-request.json',continuity);
  if(stage==='draft')return finishStage(f,stage);
  must(f,['continuity-init','--expected-revision','absent','--request-file','continuity-init-request.json','--lock-token','p16-fixture-token']);
  if(stage==='initialized')return finishStage(f,stage);
  must(f,['submit-plan','--by','synthetic-author','--profile','feature']);
  if(stage==='submitted')return finishStage(f,stage);
  must(f,['present-plan','--by','synthetic-presenter','--review-receipt',RECEIPT]);
  f.requestPath=state(f).planPresentation.designApprovalRequestPath;f.request=json(f,f.requestPath);
  if(mode==='signature')writeJson(f,f.requestPath.replace('request-','proof-'),{schema:'pipeline.po-approval-proof.v1',intentSha256:f.request.approvalIntent.sha256,keyReference:f.keyReference,publicKey:f.publicKey,signatureBase64:sign(null,Buffer.from(f.request.approvalIntent.sha256),keys.privateKey).toString('base64')});
  if(stage==='presented')return finishStage(f,stage);
  must(f,['approve-plan','--by','synthetic-po','--design-approval-request',f.requestPath]);
  assert.equal(state(f).planApproval.schema,'pipeline.plan-approval.v9');f.retained=structuredClone(state(f).planApproval.acceptedContract);
  if(stage==='approved-unmaterialized')return finishStage(f,stage);
  must(f,['materialize-architecture']);const compiled=compileDecisionSummary(f.dir,{now:AT});assert.equal(compiled.count,0);assert.equal(compiled.authorityStatus,'source-validated');
  const artifact=(kind,path,authority,mutability,retention)=>({class:kind,path,sha256:hash(bytes(f,path)),authority,mutability,retention});
  // Synthetic project input, then the actual topology validator registers its real envelope.
  writeJson(f,'specs/e2e/lifecycle.json',{schema:'pipeline.feature-package.v1',feature:{id:'e2e',rigor:2},state:'approved',artifacts:[artifact('prd',PLAN,true,'mutable','active'),artifact('spec',SPEC,true,'mutable','active'),artifact('acceptance','specs/e2e/acceptance.md',true,'mutable','active'),artifact('result','specs/e2e/result.md',true,'mutable','active'),artifact('candidate-evidence',f.retained.path,false,'immutable','retain')],candidate:structuredClone(f.request.approvalIntent.value.candidate),supersedes:null});
  const packageRead=validateFeaturePackage(f.dir,'specs/e2e/lifecycle.json');assert(packageRead.ok,'SETUP registered package: '+JSON.stringify(packageRead.findings));
  if(stage==='implementing'){must(f,['set-phase','--phase','implementation']);assert.equal(derivePlanLifecycle(state(f)).status,'implementing');}
  else assert.equal(derivePlanLifecycle(state(f)).status,'approved');
  if(trackedState){git(f,'add','--',stateRelative(f));git(f,'commit','-q','-m','test(agd): retain legacy method State\n\nDispatch: stage-0 (elephant)\nAI-Assisted: true');}
  if(stage==='approved')requireApproved(f);else requireEligible(f);f.initialState=rawState(f);
  if(!trackedState)assertPrivateState(f,f.initialState);
  return f;
}


function finishStage(f,stage){f.fixtureStage=stage;f.initialState=rawState(f);return f;}
import * as ddbModule from "./design-decision-bindings.mjs";
export const ddb=ddbModule;
export const makeAggregateFixture=({stage="approved-unmaterialized",legacy=false,descriptorCarrier="companion"}={})=>makeFixture("signature",{stage,legacy,descriptorCarrier});
export function sourceSet(f){const source=path=>({path,sha256:hash(bytes(f,path))});return{prd:source(PLAN),spec:source(SPEC),companions:COMPANIONS.map(source)};}
export const draft=f=>ddb.inspectDesignDecisionBindingsDraft({rootDir:f.dir,sources:sourceSet(f)});
export const inspect=(f,area="architecture")=>ddb.inspectApprovedDesignDecisionBindings({rootDir:f.dir,area});
export function owned(f){const out=inspect(f);assert(out.ok&&out.required&&out.handle,JSON.stringify(out));return out;}

const jsonEncode=value=>JSON.stringify(value,null,2)+"\n";
function prospectiveSubjects(f, companions) {
  companions.splice(2);
  f.subjectPaths = []; f.contractPaths = [];
  const write = (path,bytes) => { mkdirSync(dirname(join(f.dir,path)),{recursive:true,mode:0o700}); writeFileSync(join(f.dir,path),bytes,{mode:0o600}); };
  const input = (path,bytes) => { write(path,bytes); companions.push(path); return {path,sha256:hash(bytes)}; };
  const markdown = '# Draft: METHOD item-owned EGM\n\n## Decision\nOne owner performs analysis, tests, code and targeted fixes.\n';
  const proposedMarkdown = input('docs/adr/draft-method-egm.md', markdown);
  const proposal = {schema:'pipeline.architecture-decision.v1',id:'draft-method-egm',title:'METHOD item-owned EGM',status:'proposed',digest:hash(markdown),scope:'project',supersedes:'9997-method-original',date:'2026-10-10'};
  const proposedSidecar = input('docs/adr/draft-method-egm.json',jsonEncode(proposal));
  const originValue = {schema:'method.original-selection.v1',status:'selected-not-approved',selections:[{topic:'ownership',text:'One item Goldfish owns analysis, tests, code and fixes.'}]};
  const origin = input('specs/e2e/original-chat-selection.json', jsonEncode(originValue));
  const choice = {schema:'pipeline.architecture-prospective-chat-selection.v1',id:proposal.id,decision:'selected',markdownSha256:proposedMarkdown.sha256,sidecarSha256:proposedSidecar.sha256,scope:proposal.scope,moduleIds:[],supersedes:proposal.supersedes,attributedTo:'Independent synthetic METHOD; no real PO approval',origin,selections:originValue.selections};
  const chatSelection = input('specs/e2e/prospective-chat-selection.json', jsonEncode(choice));
  const historic = input('docs/adr/9997-method-original.md', '# ADR-9997: METHOD original\n\nAccepted original requirement.\n');
  const id='9998-method-egm';
  const acceptedMarkdown=`# ADR-${id}: ${proposal.title}\n\nAccepted through the canonical aggregate design approval.\n\n## Approved proposal, preserved verbatim\n\n${markdown}`;
  const acceptedSidecar={...proposal,id,status:'accepted',digest:hash(acceptedMarkdown)};
  const {origin:_origin,selections:_selections,...selected}=choice;
  const acceptedChoice={...selected,schema:'pipeline.design-decision-chat-selection.v1',id,decision:'accepted',markdownSha256:hash(acceptedMarkdown),sidecarSha256:hash(jsonEncode(acceptedSidecar))};
  const historicRecord={schema:'pipeline.architecture-decision.v1',id:proposal.supersedes,title:'METHOD original',status:'superseded',digest:historic.sha256,scope:proposal.scope,date:proposal.date};
  const row={id,proposedMarkdown,proposedSidecar,chatSelection,predecessor:{markdown:historic,sidecar:{path:'docs/adr/9997-method-original.json',sha256:hash(jsonEncode(historicRecord))}},outputs:{markdown:{path:`docs/adr/${id}.md`,sha256:hash(acceptedMarkdown)},sidecar:{path:`docs/adr/${id}.json`,sha256:hash(jsonEncode(acceptedSidecar))},chatSelection:{path:`project/architecture-chat-selections/${id}.json`,sha256:hash(jsonEncode(acceptedChoice))}}};
  f.prospectiveManifest={schema:'pipeline.architecture-prospective-materialization.v1',decisions:[row]};
  const manifest=input('specs/e2e/prospective-architecture.json',jsonEncode(f.prospectiveManifest));
  f.descriptor={schema:'pipeline.design-decision-bindings.v2',repositoryFingerprint:po.derivePoGateRepositoryFingerprint({gitCommonDir:join(f.dir,'.git'),primaryRoot:f.dir}),featureId:'e2e',architectureDecisions:[],modelPolicy:null,prospectiveArchitecture:manifest};
  if (f.legacy) {
    write(row.outputs.markdown.path, acceptedMarkdown);
    write(row.outputs.sidecar.path, jsonEncode(acceptedSidecar));
    write(row.outputs.chatSelection.path, jsonEncode(acceptedChoice));
    write(row.predecessor.sidecar.path, jsonEncode(historicRecord));
    f.subjectPaths = [row.outputs.markdown.path,row.outputs.sidecar.path,row.outputs.chatSelection.path,row.predecessor.sidecar.path];
    const commit = spawnSync("git",["-C",f.dir,"add","--",...f.subjectPaths],{encoding:"utf8",timeout:10000});
    assert.equal(commit.status,0,commit.stderr);
    f.descriptor = {schema:"pipeline.design-decision-bindings.v1",repositoryFingerprint:f.descriptor.repositoryFingerprint,
      featureId:"e2e",architectureDecisions:[{id,markdown:row.outputs.markdown,sidecar:row.outputs.sidecar,chatSelection:row.outputs.chatSelection}],modelPolicy:null};
  }
  assert(['companion','prd','spec'].includes(f.descriptorCarrier), 'closed descriptor carrier');
  f.descriptorCarrierPath = f.descriptorCarrier === 'prd' ? PLAN : f.descriptorCarrier === 'spec' ? SPEC : 'specs/e2e/design.md';
  write(f.descriptorCarrierPath, Buffer.concat([bytes(f, f.descriptorCarrierPath), Buffer.from('\n```pipeline-design-decision-bindings\n'+jsonEncode(f.descriptor)+'```\n')]));
  if (f.descriptorCarrier === 'spec') write(PLAN, bytes(f, PLAN).toString().replace(/technical-spec-sha256: [a-f0-9]{64}/u, 'technical-spec-sha256: '+hash(bytes(f, SPEC))));
  companions.sort();
  f.outputPaths=[row.outputs.markdown.path,row.outputs.sidecar.path,row.outputs.chatSelection.path,row.predecessor.sidecar.path];
}

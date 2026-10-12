// SPDX-License-Identifier: SUL-1.0
// METHOD fixtures only: real writers and verification of synthetic inputs.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {appendFileSync,chmodSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {run,readState,statePath,observeCurrentPlanApprovalForCalibration,readAcceptedDeliveryContract,checkPoGateAuthority} from '../pipeline-state.mjs';
import {inspectArchitectureDesign} from '../../lib/architecture-design.mjs';
import * as po from '../../lib/po-gate-authority.mjs';
import {createDesignReviewReceipt} from '../../lib/design-review-receipt.mjs';
import {initialGreenfieldMapTargets,initialGreenfieldAgentEntryTarget} from '../../lib/architecture-map-scaffold.mjs';
import {compileDecisionSummary} from '../architecture-baseline.mjs';
import {validateFeaturePackage} from '../../lib/feature-package-topology.mjs';
import {createGovernanceScopeController} from '../../lib/governance-scope.mjs';
import {NEUTRAL_MANIFEST,NEUTRAL_STATE} from '../../lib/project-authority.mjs';
import {derivePlanLifecycle} from '../../lib/plan-spec-state-v2.mjs';
import {isSuccessfulSpawn} from '../../lib/successful-spawn.mjs';

export const AT='2026-10-10T10:00:00.000Z';
export const TWINS=['project/pipeline.json','.claude/pipeline.json'];
export const COMMAND='node --test tests/unit.test.mjs';
export const PLAN='specs/e2e/prd_e2e.md',SPEC='specs/e2e/spec.md';
const COMPANIONS=['specs/e2e/design.md','specs/e2e/traceability.md'];
const REPORT='specs/e2e/review/design-review-1.md',RECEIPT='specs/e2e/review/design-review-receipt-1.json';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const own=dirname(fileURLToPath(import.meta.url));
const units=join(process.cwd(),'owned-fixtures');
let initialized=false;
function initialize(){
  if(initialized)return;
  mkdirSync(units,{mode:0o700});
  // Diagnostic successor inherits HOME, temporary-directory and Git policy.
  initialized=true;
}
export function write(f,path,bytes){const target=join(f.dir,path);mkdirSync(dirname(target),{recursive:true,mode:0o700});writeFileSync(target,bytes,{mode:0o600});}
export const bytes=(f,path)=>readFileSync(join(f.dir,path));
export const json=(f,path)=>JSON.parse(bytes(f,path));
export const writeJson=(f,path,value)=>write(f,path,JSON.stringify(value,null,2)+'\n');
export function gitResult(f,argv,{normal=false}={}){
  assert(f.dir.startsWith(units+'/unit-'),'Git confined to exclusive synthetic repository');
  const out=spawnSync('git',['-C',f.dir,...argv],{encoding:'utf8',timeout:90000,maxBuffer:8388608,env:{...process.env},shell:false});
  appendFileSync(join(process.cwd(),'git-audit.jsonl'),JSON.stringify({fixture:dirname(f.dir).split('/').at(-1)+'/'+f.dir.split('/').at(-1),argv,normal,status:out.status,signal:out.signal,error:out.error?{code:out.error.code,message:out.error.message}:null,stdout:out.stdout,stderr:out.stderr})+'\n');
  return out;
}
export function git(f,...argv){const out=gitResult(f,argv);assert(isSuccessfulSpawn(out),`SETUP Git ${argv[0]}: ${out.stderr}`);return out.stdout.trim();}
export function invoke(f,argv){
  const logs=[],old={log:console.log,error:console.error,warn:console.warn};
  for(const name of Object.keys(old))console[name]=(...args)=>logs.push({channel:name,text:args.map(String).join(' ')});
  let status;try{status=run(argv,{dir:f.dir,now:()=>AT});}finally{Object.assign(console,old);}
  const result={status,text:logs.map(x=>x.text).join('\n')};
  appendFileSync(join(process.cwd(),'source-call-audit.jsonl'),JSON.stringify({argv,...result})+'\n');return result;
}
export function must(f,argv){const out=invoke(f,argv);assert.equal(out.status,0,`SETUP ${argv[0]}: ${out.text}`);return out;}
export function state(f){const observed=readState(f.dir);assert.equal(observed.status,'ok');return observed.state;}
export const rawState=f=>readFileSync(statePath(f.dir));
export const stateRelative=f=>statePath(f.dir).slice(f.dir.length+1);
export function assertPrivateState(f,expected){
  assert.deepEqual(rawState(f),expected,'private lifecycle State bytes remain unchanged');
  const info=lstatSync(statePath(f.dir));assert(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1);assert.equal(info.mode&0o077,0,'actual private State mode');
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

export function makeFixture(mode='signature',{trackedState=false,stage='implementing'}={}){
  assert(['draft','initialized','submitted','presented','approved-unmaterialized','approved','implementing'].includes(stage),'closed genuine fixture stage');
  initialize();const f={dir:mkdtempSync(join(units,'unit-')),mode,trackedState};
  git(f,'init','-q');git(f,'config','user.name','Synthetic P16 Fixture');git(f,'config','user.email','p16@example.invalid');git(f,'config','core.autocrlf','false');
  write(f,'README.md','Synthetic method fixture\n');
  write(f,'.gitignore',trackedState?'scratch/\n':'scratch/\nproject/pipeline-state.json\n.claude/pipeline-state.json\n');
  const baseline={schema:'pipeline.project.v1',project:'synthetic-p16',verify:null,autonomy:'gated',handover:'docs/state.md'};
  for(const path of TWINS)writeJson(f,path,baseline);
  git(f,'add','--','README.md','.gitignore',...TWINS);git(f,'commit','-q','-m','synthetic baseline');
  // Actual source-owned activation before any retained State; no invented ready marker.
  const governance=createGovernanceScopeController();
  const enrollment=governance.planDecision({rootDir:f.dir,decision:'enroll',by:'Synthetic method fixture'});
  assert.equal(governance.applyDecision(enrollment,{activate:true,planSha256:enrollment.planSha256}).state,'active','SETUP real governance decision');
  write(f,'pipeline.user.yaml',`schema: pipeline.user.v1\nlanguage:\n  human_facing: de\n  agent_facing: en\ngates:\n  human_approval: ${mode}\n`);
  git(f,'add','--','pipeline.user.yaml');git(f,'commit','-q','-m','synthetic selected mode');
  write(f,'.claude/pipeline.yaml','schema: pipeline.manifest.v0\nlanguage:\n  human_facing: de\n');write(f,NEUTRAL_MANIFEST,bytes(f,'.claude/pipeline.yaml'));
  assert.equal(statePath(f.dir),join(f.dir,NEUTRAL_STATE));
  for(const target of initialGreenfieldMapTargets('fresh'))write(f,target.path,target.bytes);
  const pointer=initialGreenfieldAgentEntryTarget('fresh');write(f,pointer.path,pointer.bytes);write(f,'docs/adr/.gitkeep','');
  write(f,'specs/e2e/acceptance.md','# Synthetic acceptance\n');write(f,'specs/e2e/result.md','# Synthetic result\n');
  write(f,SPEC,'# Synthetic Test Spec\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n|---|---|---|\n| AC-1 | The package must receive a PASS verdict from an independent Critic before acceptance. | Synthetic candidate-bound review |\n');
  write(f,PLAN,`${po.PO_GATE_PRD_LANGUAGE_MARKER('de')}\n${po.PO_GATE_PRD_ACKNOWLEDGEMENT_MARKER}\n<!-- technical-spec-sha256: ${hash(bytes(f,SPEC))} -->\n# Synthetic Test PRD\nImplementation surface: \`src/index.mjs\`.\n\n\`\`\`pipeline-architecture-design\n${JSON.stringify(architecture)}\n\`\`\`\n`);
  write(f,COMPANIONS[0],'# Synthetic Design\n');write(f,COMPANIONS[1],'| ID | Evidence |\n| --- | --- |\n');write(f,REPORT,'# Synthetic method review\nVerdict: pass.\n');
  const common=join(f.dir,'.git'),profile=po.createPoGateProfileReceipt({repositoryFingerprint:po.derivePoGateRepositoryFingerprint({gitCommonDir:common,primaryRoot:f.dir}),primaryRoot:f.dir,sourceBytes:bytes(f,'pipeline.user.yaml'),runtimeBytes:bytes(f,'.claude/pipeline.yaml'),updatedAt:AT});
  const profilePath=po.poGateProfileReceiptPath(common);mkdirSync(dirname(profilePath),{recursive:true,mode:0o700});writeFileSync(profilePath,po.serializePoGateProfileReceipt(profile),{mode:0o600});chmodSync(profilePath,0o600);
  const source=path=>({path,sha256:hash(bytes(f,path))});
  const review=createDesignReviewReceipt({featureId:'e2e',previous:null,sources:{prd:source(PLAN),spec:source(SPEC),companions:COMPANIONS.map(source)},reviewer:{runner:'claude',model:'claude-opus-4'},report:source(REPORT),openFindingIds:[],reviewedAt:AT});
  assert(review.ok,'SETUP actual review producer: '+review.code);write(f,RECEIPT,Buffer.from(review.bytes));
  const keys=generateKeyPairSync('ed25519');f.publicKey=keys.publicKey.export({type:'spki',format:'pem'});f.keyReference='synthetic-p16-key';
  writeJson(f,'project/critical-human-proof.json',{schema:'pipeline.critical-human-proof-policy.v3',requiredKinds:['push'],waivedKinds:[],trustAnchors:[{keyReference:f.keyReference,publicKeySha256:hash(f.publicKey)}]});
  git(f,'add','--',PLAN,SPEC,...COMPANIONS,REPORT,RECEIPT,'project/critical-human-proof.json','specs/e2e/acceptance.md','specs/e2e/result.md','architecture/map/index.md','architecture/map/inventory.json','AGENTS.md','docs/adr/.gitkeep',NEUTRAL_MANIFEST);
  git(f,'commit','-q','-m','synthetic finished design');
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
  if(trackedState){git(f,'add','--',stateRelative(f));git(f,'commit','-q','-m','synthetic legacy tracked implementing State');}
  if(stage==='approved')requireApproved(f);else requireEligible(f);f.initialState=rawState(f);
  if(!trackedState)assertPrivateState(f,f.initialState);
  return f;
}

export function configure(f){const out=invoke(f,['configure-verify','--verify-command',COMMAND]);assert.equal(out.status,0,out.text);return out;}
export function stage(f,paths=TWINS){git(f,'add','--',...paths);}
export function records(f){const dir=join(f.dir,'.git/agent-pipeline/calibration-verify-commit');return{dir,names:existsSync(dir)?readdirSync(dir).sort():[]};}
export function recordPath(f,phase){const r=records(f),matches=r.names.filter(x=>x.endsWith('.'+phase+'.json'));assert.equal(matches.length,1);return join(r.dir,matches[0]);}
export function normalCommit(f){return gitResult(f,['commit','-q','-m','chore: configure synthetic verification'],{normal:true});}
export function assertRefused(out){assert.equal(out.error,undefined,'actual process must launch');assert.equal(out.signal,null);assert(Number.isInteger(out.status)&&out.status!==0,'actual refusal, not unavailable spawn');}

function finishStage(f,stage){
  const current=state(f);assert.equal(current.activeFeature.id,'e2e');assert.equal(current.activeFeature.phase,'design');
  assert.equal(current.planApproved,stage==='approved-unmaterialized');
  f.fixtureStage=stage;f.initialState=rawState(f);assertPrivateState(f,f.initialState);return f;
}

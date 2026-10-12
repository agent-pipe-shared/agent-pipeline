// Test-only synthetic original chat event; no real human proof is claimed.
// Production original-approval producer/observer and physical hashes are used.
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,chmodSync,realpathSync,lstatSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {nativeManagedDigest} from './native-managed-authority-support.mjs';
import {publishPoGateProfileReceipt} from './po-gate-profile-publisher.mjs';
import {run,observeCurrentPlanApprovalForCalibration} from '../scripts/pipeline-state.mjs';
// Resolve this test module's genuine outer Git root, independent of cwd/layout/OS.
// Fixtures stay beneath the owned checkout even when tests execute from canonical Main.
export function nativeContractFixtureRepositoryRoot() {
 const observed=spawnSync('git',['-C',dirname(fileURLToPath(import.meta.url)),'rev-parse','--show-toplevel'],{encoding:'utf8'});
 if(observed.error||observed.status!==0||!observed.stdout.trim())throw Error('native fixture Git root unavailable');
 return realpathSync(observed.stdout.trim());
}
export function nativeContractFixtureParent() {
 const parent=join(nativeContractFixtureRepositoryRoot(),'scratch','native-goldfish-contract-fixtures');
 mkdirSync(parent,{recursive:true,mode:0o700});
 const physical=lstatSync(parent);
 if(!physical.isDirectory()||physical.isSymbolicLink()||realpathSync(parent)!==parent)throw Error('native fixture parent unsafe');
 return parent;
}
export function prepareApprovedItemCourseFixture({root,additionalCriteria=[],pipelineUserSource=null}={}) {
const write=(path,bytes)=>{const target=join(root,path);mkdirSync(join(target,'..'),{recursive:true});writeFileSync(target,bytes);};
const git=(...args)=>{const r=spawnSync('git',['-C',root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false',...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
git('init','-q');
const source=pipelineUserSource??'schema: pipeline.user.v3\ngates:\n  human_approval: chat\nlanguage:\n  human_facing: en\n  agent_facing: en\n';
const manifest='schema: pipeline.manifest.v0\nlanguage:\n  human_facing: en\n';
const spec='# Spec\n\n## Acceptance criteria\n\n| # | Criterion | Evidence |\n| --- | --- | --- |\n| AC-1 | The dependency returns expected bytes. | unit.test.cjs |\n'+additionalCriteria.map(row=>{if(!/^AC-[2-9][0-9]*$/.test(row.id)||typeof row.text!=='string'||/[|\n\r]/.test(row.text))throw Error('fixture criterion shape');return `| ${row.id} | ${row.text} | targeted source check |\n`;}).join('');
const preprd=`<!-- po-language: en -->\n<!-- technical-spec-sha256: ${nativeManagedDigest(spec)} -->\n# PRD\n\nProvide the expected dependency behavior.\n`;
write('pipeline.user.yaml',source);write('.claude/pipeline.yaml',manifest);write('.gitignore','.claude/pipeline-state.json\nscratch/\n');write('specs/unit/spec.md',spec);write('specs/unit/prd_unit.md',preprd+'\n\n<!-- po-plan-acknowledged: content-sound-and-spec-consistent -->\n');
write('.claude/pipeline.json',JSON.stringify({project:'fixture',verify:'node --test unit.test.cjs',autonomy:'bounded',branchModel:'local',worktree:'supported',stakes:'medium',constraints:[]}));
const ref=path=>({path,sha256:nativeManagedDigest(readFileSync(join(root,path)))});
const continuity={schema:'pipeline.continuity.v0',featureId:'unit',revision:0,runtime:{humanFacingLanguage:'en',activeDuty:'Coordinator',sessionCleanup:null},authority:{prd:ref('specs/unit/prd_unit.md'),spec:ref('specs/unit/spec.md'),result:null},queueHead:{packageId:'unit-package',actionId:'approve-original',nextAction:'review',productRetryCount:0,environmentRerouteCount:0,dispatch:null},blocker:null,acknowledgedFinal:null,resume:{mode:'immediate',sourceRevision:0,reasonCode:'active-turn'},recovery:null,decisionTxn:null,closeTransition:null,capacity:{concurrencyLimit:3,reservedCriticSlots:1,reservedRecoverySlots:1,fallbackPolicy:'defer'}};
write('.claude/pipeline-state.json',JSON.stringify({schema:'pipeline.state.v0',activeFeature:{id:'unit',planPath:'specs/unit/prd_unit.md',phase:'design'},planApproved:false,continuity}));chmodSync(join(root,'.claude/pipeline-state.json'),0o600);
const action={kind:'bootstrap-plan-acknowledgement',decision:'content-sound-and-spec-consistent',root,featureId:'unit',checkpoint:{revision:0,sha256:'a'.repeat(64)},prd:{path:'specs/unit/prd_unit.md',sha256:nativeManagedDigest(preprd)},spec:{path:'specs/unit/spec.md',sha256:nativeManagedDigest(spec)}};
const intentSha256=nativeManagedDigest(action),receiptPath=`scratch/bootstrap-plan-acknowledgement-receipt-${intentSha256}.json`;
write(receiptPath,JSON.stringify({schema:'pipeline.bootstrap-plan-acknowledgement-receipt.v1',intentSha256,action,acknowledgementMode:'chat',proofSha256:null,signer:null}));
write('src/change.mjs',"export const value='expected';\n");write('src/change.test.mjs',"import test from 'node:test';import assert from 'node:assert/strict';import {value} from './change.mjs';test('original criterion',()=>assert.equal(value,'expected'));\n");
git('add','.');git('commit','-qm','original fixture');
const published=publishPoGateProfileReceipt({rootDir:root,userYamlText:source,runtimeYamlText:manifest,updatedAt:new Date().toISOString()});if(!published.ok)throw Error(published.code);
const deps={dir:root,architectureEntryReadiness:()=>({status:'ready'})};
for(const args of [['submit-plan','--by','Synthetic fixture','--profile','mini'],['present-plan','--by','Synthetic fixture'],['approve-plan','--by','Synthetic fixture PO'],['set-phase','--phase','implementation']])if(run(args,deps)!==0)throw Error('Fixture sanctioned plan writer refused '+args[0]);
const approval=observeCurrentPlanApprovalForCalibration({rootDir:root});if(approval.status!=='eligible')throw Error(approval.code);
const criterion='The dependency returns expected bytes.',startByte=Buffer.byteLength(spec.slice(0,spec.indexOf(criterion)));
const criterionLocators=Object.fromEntries(additionalCriteria.map(row=>{const startByte=Buffer.byteLength(spec.slice(0,spec.indexOf(row.text)));return [row.id,{schema:'pipeline.critic-criterion-locator.v1',sourcePath:'specs/unit/spec.md',sourceSha256:nativeManagedDigest(spec),criterionId:row.id,startByte,endByte:startByte+Buffer.byteLength(row.text),excerptSha256:nativeManagedDigest(row.text)}];}));
return {approval,source,spec,manifest,criterionLocators,candidate:approval.candidate,criterionLocator:{schema:'pipeline.critic-criterion-locator.v1',sourcePath:'specs/unit/spec.md',sourceSha256:nativeManagedDigest(spec),criterionId:'AC-1',startByte,endByte:startByte+Buffer.byteLength(criterion),excerptSha256:nativeManagedDigest(criterion)},receiptPath};
}

// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.design-approval-validator-rejects-json-key-reordering (ALF-C-P1-06, AC-149).
// Synthetic non-Codex authority fixture; NOT managed Codex/provider evidence. The real default package
// validator, the real approval module and (for the CLI case) real OpenSSL are exercised; nothing is mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadRunnerProfilesV3Registry,validatePipelineUserV3} from '../runner-profiles-v3.mjs';
import {resolveV3DutyRoute} from '../critic-route-v3.mjs';
import {resolvePoGateRepositoryTopology,derivePoGateRepositoryFingerprint} from '../po-gate-authority.mjs';
import {createDesignReadinessRunnerHostStore} from '../design-readiness-runner-host-store.mjs';
import {designReadinessReportSha256,designReadinessRunnerSelectionSha256} from '../design-readiness-host-evidence.mjs';
import {canonicalJson} from '../codex-sandbox-compatibility.mjs';
import {createDesignWorkflowPackageApprovalRequest,validateDesignWorkflowPackageApprovalRequest,verifyDesignWorkflowPackageApproval} from '../design-workflow-approval.mjs';
import {verifyPoApprovalProof,canonical} from '../po-approval-proof.mjs';
import {runHumanApproval} from '../../scripts/po-human-approval.mjs';
import {parseYaml} from '../yaml-lite.mjs';
import {designWorkflowAdvisorQuestionSha256} from '../design-workflow-package.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=v=>Buffer.from(canonicalJson(v));
function yaml(v,indent=''){if(Array.isArray(v))return v.map(x=>x!==null&&typeof x==='object'?`${indent}-\n${yaml(x,indent+'  ')}`:`${indent}- ${JSON.stringify(x)}\n`).join('');return Object.entries(v).map(([k,x])=>x!==null&&typeof x==='object'?`${indent}${k}:\n${yaml(x,indent+'  ')}`:`${indent}${k}: ${JSON.stringify(x)}\n`).join('');}
const fixtureRoot=process.env.PIPELINE_SIGNING_FIXTURE_ROOT??fileURLToPath(new URL('../../../../scratch/design-approval-key-order-pin/',import.meta.url));
mkdirSync(fixtureRoot,{recursive:true});

function fixture(t){
 const root=mkdtempSync(join(fixtureRoot,'repo-')),keys=mkdtempSync(join(fixtureRoot,'keys-'));
 t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(keys,{recursive:true,force:true});});
 const put=(path,data)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),data);};
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','--quiet']);git(['config','user.name','Synthetic authority']);git(['config','user.email','fixture@example.invalid']);
 const r=loadRunnerProfilesV3Registry(),config={schema:'pipeline.user.v3',language:{human_facing:'en',agent_facing:'en'},agent_runtime:'other',runners:{enabled:['claude','codex'],default:'codex'},routing:{profiles:r.profiles,duties:r.duties},usage:{common_projection:'pipeline.runner-usage.v1',raw_persistence:'none'},autonomy:{push_policy:'gated',branch_model:'feature-branch',wip_limit:1},gates:{dev_plan:'blocking',push:'blocking',security:'warn',claude_md_max_lines:300},session:{keep_awake:true},critic_export:r.criticExportPolicy};
 assert.equal(validatePipelineUserV3(config).ok,true);assert.deepEqual(parseYaml(yaml(config)),config);put('pipeline.user.yaml',yaml(config));
 const sources=Object.fromEntries(['input','prd','spec','design','traceability'].map(name=>{const path=`specs/synthetic/${name}.md`,data=Buffer.from(`# Synthetic ${name}\nSynthetic isolated authority, not provider evidence.\n`);put(path,data);return[name,{path,sha256:sha(data)}];}));
 const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString(),trustPolicy={keyReference:'synthetic-dwp-fixture-key',publicKeySha256:sha(publicKey)};
 put('project/critical-human-proof.json',JSON.stringify({schema:'pipeline.critical-human-proof-policy.v3',requiredKinds:['governance-fork-disposition'],waivedKinds:[],trustAnchors:[{keyReference:trustPolicy.keyReference,publicKeySha256:trustPolicy.publicKeySha256}]}));
 git(['add','pipeline.user.yaml','specs','project']);git(['commit','--quiet','-m','Synthetic canonical design authority']);
 // An 'answered' advisor (no attempt trail) keeps every evidence file inside the evidence-only descendant bound set, so the
 // default validator accepts HEAD as an evidence-only descendant of the candidate without any override.
 const refs={receipt:'specs/synthetic/evidence/advisor.json',readiness:'specs/synthetic/evidence/readiness.json',package:'specs/synthetic/evidence/package.json'};
 const candidate={commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}'])},topology=resolvePoGateRepositoryTopology(root),repoFingerprint=derivePoGateRepositoryFingerprint({gitCommonDir:topology.gitCommonDir,primaryRoot:topology.primaryRoot});
 const resolved=resolveV3DutyRoute({rootDir:root,dutyId:'readiness',runner:'claude',candidateCommit:candidate.commit});
 const route=Object.fromEntries(['model','effort','sourceSha256','candidateCommit'].map(k=>[k,resolved[k]]));assert.equal(resolved.state,'default');
 const report={schema:'pipeline.design-readiness-receipt.v1',dispatchId:'synthetic-readiness',runner:'claude',candidate,sources,outcome:'ready-for-po-review',findings:[],unresolvedChoices:[],summary:'Synthetic authority fixture only; this is not a provider review.'};
 const record={schema:'pipeline.design-readiness-runner-host-receipt.v1',receiptId:'drh_'+'1'.repeat(32),runner:'claude',repoFingerprint,dispatchId:report.dispatchId,candidate,sources,route,executableSha256:sha('synthetic executable'),requestSha256:sha('synthetic request'),responseSha256:sha('synthetic response'),dutyReceiptSha256:designReadinessReportSha256(report),child:{started:true,exitCode:0,signal:null,stdoutStatus:'complete',writeToolsObserved:false},createdAt:'2026-09-28T10:00:00.000Z'};
 const store=createDesignReadinessRunnerHostStore({gitCommonDir:topology.gitCommonDir,repoFingerprint}),saved=store.write(record);
 const readiness={...report,hostExecution:{schema:'pipeline.design-readiness-host-execution.v1',runner:'claude',repoFingerprint,selectionId:record.receiptId,selectionSha256:designReadinessRunnerSelectionSha256(record),executionReceiptSha256:saved.sha256,dutyReceiptSha256:record.dutyReceiptSha256,route}};
 const receipt={schema:'pipeline.advisory-receipt.v1',receiptId:'synthetic-answered',dispatch:{dispatchId:'synthetic-advisor',queueRevision:0,candidateCommit:candidate.commit,candidateTree:candidate.tree},duty:'advisory',profile:'feature',configuredRoute:{runner:'codex',selector:{kind:'model-id',value:'gpt-6-sol'},effort:'high'},adapter:'consult',observed:{status:'answered',identity:{provider:'openai',modelId:'gpt-6-sol',effort:'high'}},questionSha256:designWorkflowAdvisorQuestionSha256(sources),answerSha256:'c'.repeat(64),fallback:{reason:'none',redactedErrorClass:null},emittedAtMs:1};
 const receiptBytes=bytes(receipt);put(refs.receipt,receiptBytes);const readinessBytes=bytes(readiness);put(refs.readiness,readinessBytes);
 const pkg={schema:'pipeline.design-workflow-package.v1',featureId:'synthetic-feature',authoringDispatchId:'synthetic-author',candidate,sources,advisor:{status:'answered',runner:'codex',nativeAvailable:false,receipt:{path:refs.receipt,sha256:sha(receiptBytes)},attemptTrail:null,disposition:{decision:'accept',rationale:'Synthetic disposition for the isolated authority fixture.'},exception:null},readiness:{path:refs.readiness,sha256:sha(readinessBytes),dispatchId:report.dispatchId},createdAt:'2026-09-28T10:00:00.000Z'};put(refs.package,bytes(pkg));
 // R7-3a bound-path gate: the digest-bound package must be tracked and clean; commit exactly the evidence set (an evidence-only descendant of the candidate).
 git(['add','--',refs.package,refs.readiness,refs.receipt]);git(['commit','--quiet','-m','Commit the synthetic design package and the artifacts it digests']);
 const readCandidate=()=>({commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}'])});
 // No verifyReadinessExecution override anywhere: the default package validator is the one under test.
 const binding={repoRoot:root,packagePath:refs.package,featureId:pkg.featureId,planPath:sources.prd.path,planSha256:sources.prd.sha256,specPath:sources.spec.path,specSha256:sources.spec.sha256,readCandidate};
 const prepared=createDesignWorkflowPackageApprovalRequest(binding);assert.equal(prepared.ok,true,JSON.stringify(prepared));
 writeFileSync(join(keys,'po-private.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});writeFileSync(join(keys,'po-public.pem'),publicKey);writeFileSync(join(keys,'trust-policy.json'),JSON.stringify({...trustPolicy,humanName:'Synthetic Test Operator'}));
 const requestPath='scratch/dwp-request.json';put(requestPath,bytes(prepared.request));
 return {root,keys,put,git,binding,request:prepared.request,requestPath,trustPolicy,refs,sources,pair,publicKey};
}

const validate=(f,request,extra={})=>validateDesignWorkflowPackageApprovalRequest({...f.binding,request,...extra});
const reverseKeys=o=>Array.isArray(o)?o.map(reverseKeys):(o!==null&&typeof o==='object')?Object.fromEntries(Object.keys(o).reverse().map(k=>[k,reverseKeys(o[k])])):o;
// Deterministic non-sorted, non-reversed order: rotate member order by one at every object level.
const rotateKeys=o=>Array.isArray(o)?o.map(rotateKeys):(o!==null&&typeof o==='object')?Object.fromEntries((ks=>[...ks.slice(1),...ks.slice(0,1)])(Object.keys(o)).map(k=>[k,rotateKeys(o[k])])):o;

test('AC1/AC2: equivalent member order at every nested intent level is accepted by the default validator with identical authority',t=>{
 const f=fixture(t),original=validate(f,f.request);assert.equal(original.ok,true,JSON.stringify(original));
 const variants={sorted:JSON.parse(canonicalJson(f.request)),reversed:reverseKeys(f.request),rotated:rotateKeys(f.request)};
 for(const [name,variant] of Object.entries(variants)){
  assert.notEqual(JSON.stringify(variant),JSON.stringify(f.request),`${name} must differ in raw member order`);
  assert.equal(canonical(variant),canonical(f.request),`${name} must be canonically identical`);
  const checked=validate(f,variant);assert.equal(checked.ok,true,`${name}: ${JSON.stringify(checked)}`);
  assert.equal(checked.intentSha256,original.intentSha256,name);assert.equal(checked.packageSha256,original.packageSha256,name);assert.deepEqual(checked.packageRead,original.packageRead,name);
 }
 // Nested-only reorder: only approvalIntent.value and approvalIntent.value.candidate members reordered, outer order untouched.
 const nested=structuredClone(f.request);nested.approvalIntent.value=reverseKeys(f.request.approvalIntent.value);
 assert.notEqual(JSON.stringify(nested.approvalIntent.value),JSON.stringify(f.request.approvalIntent.value));
 assert.notEqual(JSON.stringify(nested.approvalIntent.value.candidate),JSON.stringify(f.request.approvalIntent.value.candidate));
 assert.equal(validate(f,nested).ok,true);
});

test('AC3: reordered requests still reject unknown properties, changed values and incorrect digests',t=>{
 const f=fixture(t),reordered=reverseKeys(f.request);
 const mutations=[
  ['extra outer',r=>{r.extra=true;},'DWP-APPROVAL-REQUEST-SHAPE'],['extra envelope',r=>{r.approvalIntent.extra=true;},'DWP-APPROVAL-REQUEST-SHAPE'],
  ['extra intent',r=>{r.approvalIntent.value.extra=true;},'DWP-APPROVAL-REQUEST-SHAPE'],['extra candidate',r=>{r.approvalIntent.value.candidate.extra=true;},'DWP-APPROVAL-REQUEST-SHAPE'],
  ['missing member',r=>{delete r.approvalIntent.value.decision;},'DWP-APPROVAL-REQUEST-SHAPE'],
  ['decision',r=>{r.approvalIntent.value.decision='decline';},'DWP-APPROVAL-REQUEST-SHAPE'],
  ['feature',r=>{r.approvalIntent.value.featureId='different-feature';},'DWP-APPROVAL-INTENT-DRIFT'],
  ['plan',r=>{r.approvalIntent.value.planSha256='a'.repeat(64);},'DWP-APPROVAL-INTENT-DRIFT'],
  ['spec',r=>{r.approvalIntent.value.specSha256='b'.repeat(64);},'DWP-APPROVAL-INTENT-DRIFT'],
  ['subject',r=>{r.approvalIntent.value.subjectSha256='c'.repeat(64);},'DWP-APPROVAL-INTENT-DRIFT'],
  ['candidate commit',r=>{r.approvalIntent.value.candidate.commit='d'.repeat(40);},'DWP-APPROVAL-INTENT-DRIFT'],
  ['candidate tree',r=>{r.approvalIntent.value.candidate.tree='9'.repeat(40);},'DWP-APPROVAL-INTENT-DRIFT'],
  ['policy',r=>{r.approvalIntent.value.policyRevision='design-workflow-package-v2';},'DWP-APPROVAL-INTENT-DRIFT'],
  ['intent digest',r=>{r.approvalIntent.sha256='e'.repeat(64);},'DWP-APPROVAL-INTENT-DRIFT'],
  ['package digest',r=>{r.packageSha256='f'.repeat(64);},null],
  ['package path',r=>{r.packagePath='specs/synthetic/evidence/missing.json';},null],
 ];
 for(const [name,mutate,code] of mutations){
  const request=structuredClone(reordered);mutate(request);const checked=validate(f,request);
  // Shape and intent-drift are both typed pre-confirmation refusals; which one fires for a nested extra/missing member is not the contract.
  assert.equal(checked.ok,false,name);if(code)assert.ok(['DWP-APPROVAL-REQUEST-SHAPE','DWP-APPROVAL-INTENT-DRIFT'].includes(checked.code),`${name}: ${checked.code}`);if(code==='DWP-APPROVAL-INTENT-DRIFT')assert.equal(checked.code,code,name);
 }
});

const hostLimited=e=>e?.reason==='WIN-AUTH-DACL';
test('AC3: rejection happens before confirmation or key use for a reordered but altered request',t=>{
 const f=fixture(t);let confirmations=0,signs=0;
 const request=reverseKeys(f.request);request.approvalIntent.value.specSha256='b'.repeat(64);f.put(f.requestPath,bytes(request));
 try{runHumanApproval(['sign-intent','--repo-root',f.root,'--directory',f.keys,'--request',f.requestPath],{readConfirmation:()=>{confirmations++;return 'approve';},spawn:()=>{signs++;throw Error('Unexpected signing');}});assert.fail('expected refusal');}
 catch(e){if(hostLimited(e)){t.skip('host limitation: native Windows owned-authority DACL inspection (WIN-AUTH-DACL) refuses the CLI ceremony in this fixture');return;}assert.match(String(e?.message),/current, complete package/);}
 assert.equal(confirmations,0);assert.equal(signs,0);assert.equal(existsSync(join(f.keys,`proof-${f.request.approvalIntent.sha256}.json`)),false);
});

test('AC4/AC5: reordered request signs through the unchanged default validator with a disposable key and real OpenSSL, and the proof reads back for the ORIGINAL request',t=>{
 const f=fixture(t),prompts=[],reordered=reverseKeys(f.request);
 assert.notEqual(JSON.stringify(reordered),JSON.stringify(f.request));
 f.put(f.requestPath,JSON.stringify(reordered));
 let result;try{result=runHumanApproval(['sign-intent','--repo-root',f.root,'--directory',f.keys,'--request',f.requestPath],{readConfirmation:p=>{prompts.push(p);return 'approve';}});}
 catch(e){if(hostLimited(e)){t.skip('host limitation: native Windows owned-authority DACL inspection (WIN-AUTH-DACL) refuses the CLI signing ceremony in this fixture; proof readback is covered by the AC5 case');return;}throw e;}
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(prompts.length,1);assert.match(prompts[0],new RegExp(f.request.approvalIntent.sha256));
 const proof=JSON.parse(readFileSync(result.paths.proof,'utf8'));
 // Proof readback against both spellings: the same canonical intent, so no new plan ceremony is needed for the already approved package.
 for(const [name,request] of [['original',f.request],['reordered',reordered]]){
  assert.equal(proof.intentSha256,request.approvalIntent.sha256,name);
  assert.equal(verifyPoApprovalProof({intent:request.approvalIntent,proof,trustPolicy:f.trustPolicy}).verified,true,name);
  const verified=verifyDesignWorkflowPackageApproval({...f.binding,request,proof,anchors:[f.trustPolicy]});assert.equal(verified.ok,true,`${name}: ${JSON.stringify(verified)}`);
 }
});

test('AC5: a signature made for the original request verifies the reordered request without re-planning; a tampered signature does not',t=>{
 const f=fixture(t),reordered=rotateKeys(f.request);
 const intentSha=f.request.approvalIntent.sha256,proof={schema:'pipeline.po-approval-proof.v1',intentSha256:intentSha,keyReference:f.trustPolicy.keyReference,publicKey:f.publicKey,signatureBase64:sign(null,Buffer.from(intentSha),f.pair.privateKey).toString('base64')};
 const verified=verifyDesignWorkflowPackageApproval({...f.binding,request:reordered,proof,anchors:[f.trustPolicy]});
 assert.equal(verified.ok,true,JSON.stringify(verified));assert.equal(verified.intentSha256,intentSha);
 const forged={...proof,signatureBase64:Buffer.from('not-a-signature').toString('base64')};
 assert.equal(verifyDesignWorkflowPackageApproval({...f.binding,request:reordered,proof:forged,anchors:[f.trustPolicy]}).ok,false);
});

test('AC3/AC5: canonical equality cannot accept a changed physical package or a changed current candidate, with or without key reordering',t=>{
 const f=fixture(t),request=reverseKeys(f.request),packageBytes=readFileSync(join(f.root,f.refs.package));
 const changed=JSON.parse(packageBytes);changed.createdAt='2026-09-28T11:00:00.000Z';f.put(f.refs.package,bytes(changed));
 assert.equal(validate(f,request).ok,false);
 f.put(f.refs.package,packageBytes);assert.equal(validate(f,request).ok,true);
 f.put('candidate-change.md','Candidate changed\n');f.git(['add','candidate-change.md']);f.git(['commit','--quiet','-m','Change synthetic current candidate']);
 assert.equal(validate(f,request).ok,false);
});

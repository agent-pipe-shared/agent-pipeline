// Synthetic non-Codex authority fixture; NOT managed Codex/provider evidence.
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC21C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';

import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {loadRunnerProfilesV3Registry,validatePipelineUserV3} from '../lib/runner-profiles-v3.mjs';
import {resolveV3DutyRoute} from '../lib/critic-route-v3.mjs';
import {resolvePoGateRepositoryTopology,derivePoGateRepositoryFingerprint} from '../lib/po-gate-authority.mjs';
import {createDesignReadinessRunnerHostStore} from '../lib/design-readiness-runner-host-store.mjs';
import {designReadinessReportSha256,designReadinessRunnerSelectionSha256} from '../lib/design-readiness-host-evidence.mjs';
import {canonicalJson} from '../lib/codex-sandbox-compatibility.mjs';
import {createAdvisoryRouteSelection} from '../lib/advisory-route-selection.mjs';
import {readDesignWorkflowPackageFromRepository} from '../lib/design-workflow-package.mjs';
import {createDesignWorkflowPackageApprovalRequest,validateDesignWorkflowPackageApprovalRequest,verifyDesignWorkflowPackageApproval} from '../lib/design-workflow-approval.mjs';
import {verifyPoApprovalProof} from '../lib/po-approval-proof.mjs';
import {runHumanApproval} from './po-human-approval.mjs';
import {parseYaml} from '../lib/yaml-lite.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=v=>Buffer.from(canonicalJson(v));
function yaml(v,indent='') {if(Array.isArray(v))return v.map(x=>x!==null&&typeof x==='object'?`${indent}-\n${yaml(x,indent+'  ')}`:`${indent}- ${JSON.stringify(x)}\n`).join('');return Object.entries(v).map(([k,x])=>x!==null&&typeof x==='object'?`${indent}${k}:\n${yaml(x,indent+'  ')}`:`${indent}${k}: ${JSON.stringify(x)}\n`).join('');}
const fixtureRoot=process.env.PIPELINE_SIGNING_FIXTURE_ROOT ?? new URL("../../../../scratch/default-signing/",import.meta.url).pathname;
mkdirSync(fixtureRoot,{recursive:true});
function fixture(t){
 const root=mkdtempSync(join(fixtureRoot,'synthetic-dwp-default-repo-')),keys=mkdtempSync(join(fixtureRoot,'synthetic-dwp-default-keys-'));
 t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(keys,{recursive:true,force:true});});
 const put=(path,data)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),data);};
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','--quiet']);git(['config','user.name','Synthetic authority']);git(['config','user.email','fixture@example.invalid']);
 const r=loadRunnerProfilesV3Registry(),config={schema:'pipeline.user.v3',language:{human_facing:'en',agent_facing:'en'},agent_runtime:'other',runners:{enabled:['claude','codex'],default:'codex'},routing:{profiles:r.profiles,duties:r.duties},usage:{common_projection:'pipeline.runner-usage.v1',raw_persistence:'none'},autonomy:{push_policy:'gated',branch_model:'feature-branch',wip_limit:1},gates:{dev_plan:'blocking',push:'blocking',security:'warn',claude_md_max_lines:300},session:{keep_awake:true},critic_export:r.criticExportPolicy};
 assert.equal(validatePipelineUserV3(config).ok,true);assert.deepEqual(parseYaml(yaml(config)),config);put('pipeline.user.yaml',yaml(config));
 const sources=Object.fromEntries(['input','prd','spec','design','traceability'].map(name=>{const path=`specs/synthetic/${name}.md`,data=Buffer.from(`# Synthetic ${name}\nSynthetic isolated authority, not provider evidence.\n`);put(path,data);return[name,{path,sha256:sha(data)}];}));
 git(['add','pipeline.user.yaml','specs']);git(['commit','--quiet','-m','Synthetic canonical design authority']);
 const candidate={commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}'])},topology=resolvePoGateRepositoryTopology(root),repoFingerprint=derivePoGateRepositoryFingerprint({gitCommonDir:topology.gitCommonDir,primaryRoot:topology.primaryRoot});
 const resolved=resolveV3DutyRoute({rootDir:root,dutyId:'readiness',runner:'claude',candidateCommit:candidate.commit});
 const route=Object.fromEntries(['model','effort','sourceSha256','candidateCommit'].map(k=>[k,resolved[k]]));assert.equal(resolved.state,'default');
 const report={schema:'pipeline.design-readiness-receipt.v1',dispatchId:'synthetic-readiness',runner:'claude',candidate,sources,outcome:'ready-for-po-review',findings:[],unresolvedChoices:[],summary:'Synthetic authority fixture only; this is not a provider review.'};
 const record={schema:'pipeline.design-readiness-runner-host-receipt.v1',receiptId:'drh_'+'1'.repeat(32),runner:'claude',repoFingerprint,dispatchId:report.dispatchId,candidate,sources,route,executableSha256:sha('synthetic executable'),requestSha256:sha('synthetic request'),responseSha256:sha('synthetic response'),dutyReceiptSha256:designReadinessReportSha256(report),child:{started:true,exitCode:0,signal:null,stdoutStatus:'complete',writeToolsObserved:false},createdAt:'2026-09-28T10:00:00.000Z'};
 // Explicit synthetic store record uses the canonical API; no verifier dependency override.
 const store=createDesignReadinessRunnerHostStore({gitCommonDir:topology.gitCommonDir,repoFingerprint}),saved=store.write(record);
 const readiness={...report,hostExecution:{schema:'pipeline.design-readiness-host-execution.v1',runner:'claude',repoFingerprint,selectionId:record.receiptId,selectionSha256:designReadinessRunnerSelectionSha256(record),executionReceiptSha256:saved.sha256,dutyReceiptSha256:record.dutyReceiptSha256,route}};
 const receipt={schema:'pipeline.advisory-receipt.v1',receiptId:'synthetic-no-child',dispatch:{dispatchId:'synthetic-advisor',queueRevision:0,candidateCommit:candidate.commit,candidateTree:candidate.tree},duty:'advisory',profile:'feature',configuredRoute:{runner:'codex',selector:{kind:'model-id',value:'gpt-6-sol'},effort:'high'},adapter:'consult',observed:{status:'unavailable',identity:null},questionSha256:sources.design.sha256,answerSha256:null,fallback:{reason:'consult-unavailable',redactedErrorClass:'unavailable'},emittedAtMs:1};
 const receiptBytes=bytes(receipt),selection=createAdvisoryRouteSelection({receipt,receiptBytes,code:'ordinary-consult-host-callback-unavailable'}),selectionBytes=bytes(selection);
 const refs={receipt:'specs/synthetic/evidence/advisor.json',route:'specs/synthetic/evidence/route.json',readiness:'specs/synthetic/evidence/readiness.json',package:'specs/synthetic/evidence/package.json'};
 put(refs.receipt,receiptBytes);put(refs.route,selectionBytes);const readinessBytes=bytes(readiness);put(refs.readiness,readinessBytes);
 const pkg={schema:'pipeline.design-workflow-package.v1',featureId:'synthetic-feature',authoringDispatchId:'synthetic-author',candidate,sources,advisor:{status:'unavailable',runner:'codex',nativeAvailable:false,receipt:{path:refs.receipt,sha256:sha(receiptBytes)},attemptTrail:{path:refs.route,sha256:sha(selectionBytes)},disposition:null,exception:{status:'proposed',failureCode:'route-unavailable',rationale:'Synthetic no-child route for isolated signing transport only.'}},readiness:{path:refs.readiness,sha256:sha(readinessBytes),dispatchId:report.dispatchId},createdAt:'2026-09-28T10:00:00.000Z'};put(refs.package,bytes(pkg));
 const readCandidate=()=>({commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}'])});
 const read=()=>readDesignWorkflowPackageFromRepository({repoRoot:root,packagePath:refs.package,readCandidate});assert.equal(read().ok,true,JSON.stringify(read()));
 const prepared=createDesignWorkflowPackageApprovalRequest({repoRoot:root,packagePath:refs.package,readCandidate,featureId:pkg.featureId,planPath:sources.prd.path,planSha256:sources.prd.sha256,specPath:sources.spec.path,specSha256:sources.spec.sha256});assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString(),trustPolicy={keyReference:'synthetic-dwp-fixture-key',publicKeySha256:sha(publicKey)};
 writeFileSync(join(keys,'po-private.pem'),pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});writeFileSync(join(keys,'po-public.pem'),publicKey);writeFileSync(join(keys,'trust-policy.json'),JSON.stringify({...trustPolicy,humanName:'Synthetic Test Operator'}));
 const requestPath='scratch/dwp-request.json';put(requestPath,bytes(prepared.request));return {root,keys,put,git,read,request:prepared.request,requestPath,trustPolicy,refs,sources,candidate,readCandidate};
}
test('synthetic non-Codex authority: complete DWP nested request signs via unchanged default package validator and real OpenSSL',t=>{
 const f=fixture(t),prompts=[];
 const result=runHumanApproval(['sign-intent','--repo-root',f.root,'--directory',f.keys,'--request',f.requestPath],{readConfirmation:p=>{prompts.push(p);return 'approve';}});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(prompts.length,1);assert.match(prompts[0],/complete design workflow package/);assert.match(prompts[0],new RegExp(f.request.approvalIntent.sha256));
 for(const source of Object.values(f.sources))assert.match(prompts[0],new RegExp(source.path.replaceAll('.','\\.')));
 const proof=JSON.parse(readFileSync(result.paths.proof,'utf8'));assert.equal(verifyPoApprovalProof({intent:f.request.approvalIntent,proof,trustPolicy:f.trustPolicy}).verified,true);
 const verified=verifyDesignWorkflowPackageApproval({repoRoot:f.root,request:f.request,readCandidate:f.readCandidate,proof,anchors:[f.trustPolicy],featureId:'synthetic-feature',planPath:f.sources.prd.path,planSha256:f.sources.prd.sha256,specPath:f.sources.spec.path,specSha256:f.sources.spec.sha256});assert.equal(verified.ok,true,JSON.stringify(verified));
});
test('synthetic complete DWP refuses changed intent, extra request keys and physical source drift before confirmation or key use',t=>{
 const f=fixture(t);let confirmations=0,signs=0;
 const deny=()=>assert.throws(()=>runHumanApproval(['sign-intent','--repo-root',f.root,'--directory',f.keys,'--request',f.requestPath],{readConfirmation:()=>{confirmations++;return 'approve';},spawn:()=>{signs++;throw Error('unexpected signing');}}),/current, complete package/);
 f.put(f.requestPath,bytes({...f.request,intentSha256:f.request.approvalIntent.sha256}));deny();
 f.put(f.requestPath,bytes({...f.request,approvalIntent:{...f.request.approvalIntent,sha256:'a'.repeat(64)}}));deny();
 f.put(f.requestPath,bytes(f.request));f.put(f.sources.design.path,'changed physical design\n');deny();assert.equal(confirmations,0);assert.equal(signs,0);assert.equal(existsSync(join(f.keys,`proof-${f.request.approvalIntent.sha256}.json`)),false);
});

function approvalBinding(f){return {repoRoot:f.root,packagePath:f.refs.package,featureId:'synthetic-feature',planPath:f.sources.prd.path,planSha256:f.sources.prd.sha256,specPath:f.sources.spec.path,specSha256:f.sources.spec.sha256,readCandidate:f.readCandidate};}
test('canonical DWP equality accepts reordering at every object level without changing authority',t=>{
 const f=fixture(t),binding=approvalBinding(f),reordered=JSON.parse(canonicalJson(f.request));
 assert.notEqual(JSON.stringify(reordered),JSON.stringify(f.request));
 const original=validateDesignWorkflowPackageApprovalRequest({...binding,request:f.request});
 const checked=validateDesignWorkflowPackageApprovalRequest({...binding,request:reordered});
 assert.equal(original.ok,true);assert.equal(checked.ok,true,JSON.stringify(checked));assert.equal(checked.intentSha256,original.intentSha256);
 assert.deepEqual(checked.packageRead,original.packageRead);
});
test('canonical comparison retains exact shape, intent, package, source and candidate refusals before signing',t=>{
 const f=fixture(t),binding=approvalBinding(f),reordered=JSON.parse(canonicalJson(f.request));
 const mutations=[['extra outer',r=>{r.extra=true;}],['extra envelope',r=>{r.approvalIntent.extra=true;}],['extra intent',r=>{r.approvalIntent.value.extra=true;}],['extra candidate',r=>{r.approvalIntent.value.candidate.extra=true;}],['decision',r=>{r.approvalIntent.value.decision='decline';}],['feature',r=>{r.approvalIntent.value.featureId='different-feature';}],['plan',r=>{r.approvalIntent.value.planSha256='a'.repeat(64);}],['spec',r=>{r.approvalIntent.value.specSha256='b'.repeat(64);}],['subject',r=>{r.approvalIntent.value.subjectSha256='c'.repeat(64);}],['candidate',r=>{r.approvalIntent.value.candidate.commit='d'.repeat(40);}],['policy',r=>{r.approvalIntent.value.policyRevision='other-policy';}],['digest',r=>{r.approvalIntent.sha256='e'.repeat(64);}],['package digest',r=>{r.packageSha256='f'.repeat(64);}],['package path',r=>{r.packagePath='specs/synthetic/evidence/missing.json';}]];
 let confirmations=0,signs=0;
 for(const [name,mutate] of mutations){const request=structuredClone(reordered);mutate(request);assert.equal(validateDesignWorkflowPackageApprovalRequest({...binding,request}).ok,false,name);f.put(f.requestPath,bytes(request));assert.throws(()=>runHumanApproval(['sign-intent','--repo-root',f.root,'--directory',f.keys,'--request',f.requestPath],{readConfirmation:()=>{confirmations++;return 'approve';},spawn:()=>{signs++;throw Error('Unexpected signing');}}),/current, complete package/,name);}
 f.put(f.requestPath,bytes(reordered));f.put(f.sources.design.path,'Physical source drift\n');assert.equal(validateDesignWorkflowPackageApprovalRequest({...binding,request:reordered}).ok,false);assert.throws(()=>runHumanApproval(['sign-intent','--repo-root',f.root,'--directory',f.keys,'--request',f.requestPath],{readConfirmation:()=>{confirmations++;return 'approve';},spawn:()=>{signs++;throw Error('Unexpected signing');}}),/current, complete package/);
 assert.equal(confirmations,0);assert.equal(signs,0);assert.equal(existsSync(join(f.keys,`proof-${f.request.approvalIntent.sha256}.json`)),false);
});
test('canonical equality cannot accept changed physical package or current repository candidate',t=>{
 const f=fixture(t),binding=approvalBinding(f),request=JSON.parse(canonicalJson(f.request)),packageBytes=readFileSync(join(f.root,f.refs.package));
 const changed=JSON.parse(packageBytes);changed.createdAt='2026-09-28T11:00:00.000Z';f.put(f.refs.package,bytes(changed));assert.equal(validateDesignWorkflowPackageApprovalRequest({...binding,request}).ok,false);
 f.put(f.refs.package,packageBytes);f.put('candidate-change.md','Candidate changed\n');f.git(['add','candidate-change.md']);f.git(['commit','--quiet','-m','Change synthetic current candidate']);assert.equal(validateDesignWorkflowPackageApprovalRequest({...binding,request}).ok,false);
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 5) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

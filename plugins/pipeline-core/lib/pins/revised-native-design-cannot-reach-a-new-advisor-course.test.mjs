// SPDX-License-Identifier: SUL-1.0
// Pin for pipeline.revised-native-design-cannot-reach-a-new-advisor-course (AC-244).
// The ordinary initial Advisor course is RETIRED by doctrine: the CLI route to a new course is intentionally
// closed (qualified state, not a gap). This pin holds (i) the retirement, (ii) the surviving child-course
// owner-decision observer, (iii) child-course open / owner-decision reuse through the library, and
// (iv) idempotent publication of a re-derived native no-child result, and (v) the REPLACEMENT route (ADR-0085):
// a design revision after a review finding is one delta receipt plus one rebind, with zero PO interactions,
// zero overrides and no hand-invented identifier. It never restores the ceremony.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,realpathSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runDesignAdvisoryCoordinator,nativeChildCourseDecisionObserver,publishNativeInitialResult} from '../../scripts/design-advisory-coordinator.mjs';
import {coordinateInitialDesignAdvisory,rederiveNativeNoChildAdvisory} from '../design-advisory-coordinator-v2.mjs';
import {createNativeInitialAdvisorExecution} from '../native-initial-advisor-execution.mjs';
import {designAdvisorValueSha256} from '../design-advisor-course.mjs';
import {loadRunnerProfilesV3Registry} from '../runner-profiles-v3.mjs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {advisorHostFixture} from '../codex-advisor-host.fixture.mjs';
import {DESIGN_ADVISORY_COURSE_RETIRED} from '../retired-design-codes.mjs';
import {createReceiptFromDisk} from '../../scripts/design-review-receipt.mjs';
import {createDesignApprovalBinding,createDesignApprovalRequest,verifyDesignApprovalRequest} from '../design-approval-binding.mjs';

const scratchRoot=t=>{const root=realpathSync(mkdtempSync(join(tmpdir(),'revised-native-advisor-pin-')));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;};
const hex=c=>c.repeat(64);

// Contained git fixture: own `git init` first, ceiling pinned to the fixture's parent so no git call can
// ever discover the project repository. Works on every platform (no Linux-only host store).
function nativeFixture(t){
 const root=scratchRoot(t),env={...process.env,GIT_CEILING_DIRECTORIES:dirname(root)};
 const git=args=>execFileSync('git',args,{cwd:root,env,timeout:10000,stdio:['ignore','pipe','pipe']});
 git(['init','--quiet']);git(['config','user.email','fixture@example.invalid']);git(['config','user.name','Synthetic fixture']);git(['config','commit.gpgsign','false']);
 const sources=Object.fromEntries(['input','prd','spec','design','traceability'].map(name=>{const content=`Synthetic ${name} document.\n`;writeFileSync(join(root,`${name}.md`),content);return [name,{path:`${name}.md`,sha256:createHash('sha256').update(content).digest('hex')}];}));
 git(['add','input.md','prd.md','spec.md','design.md','traceability.md']);git(['commit','--quiet','-m','Synthetic sources']);
 const candidate={commit:git(['rev-parse','HEAD']).toString().trim(),tree:git(['rev-parse','HEAD^{tree}']).toString().trim()};
 const previous=process.env.GIT_CEILING_DIRECTORIES;process.env.GIT_CEILING_DIRECTORIES=dirname(root);
 t.after(()=>{if(previous===undefined)delete process.env.GIT_CEILING_DIRECTORIES;else process.env.GIT_CEILING_DIRECTORIES=previous;});
 const route={model:null,effort:null,sourceSha256:designAdvisorValueSha256(loadRunnerProfilesV3Registry()),candidateCommit:candidate.commit};
 const dispatch={dispatchId:'advisor_pin',queueRevision:0,candidateCommit:candidate.commit,candidateTree:candidate.tree};
 return {root,sources,candidate,route,dispatch};
}

test('(i) the CLI route to a new Advisor course is retired before parsing and touches no state',async t=>{
 const root=scratchRoot(t),before=readdirSync(root);
 const previous=process.cwd();process.chdir(root);
 let result;try{result=await runDesignAdvisoryCoordinator([]);}finally{process.chdir(previous);}
 assert.equal(result.code,DESIGN_ADVISORY_COURSE_RETIRED);
 assert.notEqual(result.ok,true);
 assert.deepEqual(readdirSync(root),before,'retired entry must create no file under the scratch root');
 // Even a fully formed historical-looking argv is retired, not parsed (no usage error, no state access).
 const withArgs=await runDesignAdvisoryCoordinator(['--runner','claude','--feature-id','x']);
 assert.equal(withArgs.code,DESIGN_ADVISORY_COURSE_RETIRED);
 assert.deepEqual(readdirSync(root),before);
});

const baseArgs={'feature-id':'feat-1','authoring-dispatch-id':'dispatch-2',sources:{prd:{sha256:hex('1')},spec:{sha256:hex('2')}}};
const baseDispatch={featureId:'feat-1',dispatchId:'dispatch-2',authorityDigests:{prdSha256:hex('1'),specSha256:hex('2')}};
const stateFor=(dispatch=baseDispatch,over={})=>({continuity:{featureId:'feat-1',queueHead:{dispatch},authority:{prd:{sha256:hex('1')},spec:{sha256:hex('2')}},...over}});
const request={kind:'new-substantive-question',parentCourseId:'course-parent',initialContextSha256:hex('3')};
function projectWith(root,state){mkdirSync(join(root,'project'),{recursive:true});if(state!==undefined)writeFileSync(join(root,'project','pipeline-state.json'),JSON.stringify(state));}

// The contract, parameterised over the observer factory so a mutant can be proven RED against it.
function assertObserverContract(factory,t){
 const ok=scratchRoot(t);projectWith(ok,stateFor());
 const approved=factory({root:ok,args:baseArgs,parentCourseId:'course-parent'})(request);
 assert.equal(approved.status,'approved');
 assert.equal(approved.decisionRef,'dispatch-2');
 assert.equal(approved.decisionSha256,designAdvisorValueSha256(baseDispatch));
 assert.equal(approved.parentCourseId,'course-parent');
 assert.equal(approved.initialContextSha256,request.initialContextSha256);
 const mismatches={
  featureId:{args:{...baseArgs,'feature-id':'other'}},
  dispatchId:{args:{...baseArgs,'authoring-dispatch-id':'dispatch-3'}},
  prdDigest:{args:{...baseArgs,sources:{...baseArgs.sources,prd:{sha256:hex('9')}}}},
  specDigest:{args:{...baseArgs,sources:{...baseArgs.sources,spec:{sha256:hex('9')}}}},
  parentCourseId:{parentCourseId:'course-other'},
 };
 for(const [name,over] of Object.entries(mismatches)){
  const out=factory({root:ok,args:over.args??baseArgs,parentCourseId:over.parentCourseId??'course-parent'})(name==='parentCourseId'?{...request,parentCourseId:'course-parent'}:request);
  assert.deepEqual(out,{status:'unavailable',code:'DAC-CHILD-COURSE-DECISION-UNBOUND'},'single mismatch '+name);
 }
 const missing=scratchRoot(t);
 assert.deepEqual(factory({root:missing,args:baseArgs,parentCourseId:'course-parent'})(request),{status:'unavailable',code:'DAC-CHILD-COURSE-DECISION-UNBOUND'});
}

test('(ii) the surviving child-course observer approves only a fully bound registration',t=>{
 assertObserverContract(nativeChildCourseDecisionObserver,t);
 // Registered state that disagrees on a single field is unbound too.
 const root=scratchRoot(t);
 for(const state of [
  stateFor({...baseDispatch,featureId:'other'}),
  stateFor(baseDispatch,{featureId:'other'}),
  stateFor({...baseDispatch,dispatchId:'dispatch-3'}),
  stateFor({...baseDispatch,authorityDigests:{...baseDispatch.authorityDigests,prdSha256:hex('9')}}),
  stateFor({...baseDispatch,authorityDigests:{...baseDispatch.authorityDigests,specSha256:hex('9')}}),
  stateFor(baseDispatch,{authority:{prd:{sha256:hex('9')},spec:{sha256:hex('2')}}}),
  stateFor(baseDispatch,{authority:{prd:{sha256:hex('1')},spec:{sha256:hex('9')}}}),
 ]){
  projectWith(root,state);
  assert.deepEqual(nativeChildCourseDecisionObserver({root,args:baseArgs,parentCourseId:'course-parent'})(request),{status:'unavailable',code:'DAC-CHILD-COURSE-DECISION-UNBOUND'});
 }
 projectWith(root,stateFor());
 const observe=nativeChildCourseDecisionObserver({root,args:baseArgs,parentCourseId:'course-parent'});
 assert.equal(observe({...request,kind:'other'}).code,'DAC-CHILD-COURSE-DECISION-UNBOUND');
 assert.equal(observe({...request,initialContextSha256:'nothex'}).code,'DAC-CHILD-COURSE-DECISION-UNBOUND');
});

test('(ii-RED) a mirror observer that ignores parentCourseId is caught by the contract',t=>{
 const mutant=({root,args})=>request=>{
  const state=JSON.parse(readFileSync(join(root,'project','pipeline-state.json'),'utf8')),c=state.continuity,d=c.queueHead.dispatch;
  if(c.featureId!==args['feature-id']||d.dispatchId!==args['authoring-dispatch-id']||d.authorityDigests.prdSha256!==args.sources.prd.sha256||d.authorityDigests.specSha256!==args.sources.spec.sha256)return {status:'unavailable',code:'DAC-CHILD-COURSE-DECISION-UNBOUND'};
  return {status:'approved',kind:request.kind,parentCourseId:request.parentCourseId,initialContextSha256:request.initialContextSha256,decisionRef:d.dispatchId,decisionSha256:designAdvisorValueSha256(d)};
 };
 assert.throws(()=>assertObserverContract(mutant,t),/single mismatch parentCourseId|deepEqual|Expected values/i);
});

test('(ii-host-skip) a symlinked pipeline-state.json is refused (K7: needs host symlink privilege)',t=>{
 const root=scratchRoot(t);mkdirSync(join(root,'project'));
 writeFileSync(join(root,'real.json'),JSON.stringify(stateFor()));
 try{symlinkSync(join(root,'real.json'),join(root,'project','pipeline-state.json'));}catch{t.skip('K7 host skip: symlink creation unavailable on this host');return;}
 assert.equal(nativeChildCourseDecisionObserver({root,args:baseArgs,parentCourseId:'course-parent'})(request).code,'DAC-CHILD-COURSE-DECISION-UNBOUND');
});

test('(iii-native) a native child course opens only with an owner decision and a reused decision is refused',async t=>{
 const f=nativeFixture(t),runner='claude';
 const input={repoRoot:f.root,runner,featureId:'native-feature',authoringDispatchId:'native-author',sources:f.sources,reason:'risk-review',profile:'feature',dispatch:f.dispatch,route:f.route,hostExecution:createNativeInitialAdvisorExecution({runner})};
 const first=await coordinateInitialDesignAdvisory(input);
 assert.equal(first.status,'unavailable-pending-final-approval',JSON.stringify(first));
 const decision=m=>({status:'approved',...m,decisionRef:'owner-new-question',decisionSha256:'a'.repeat(64)});
 const parent=first.courseBinding.courseId;
 const changed={...input,authoringDispatchId:'native-author-2',reason:'architecture-tradeoff',dispatch:{...f.dispatch,dispatchId:'advisor_successor'},hostExecution:createNativeInitialAdvisorExecution({runner}),newCourseParentId:parent};
 assert.equal((await coordinateInitialDesignAdvisory(changed)).code,'DAC2-COURSE-ALREADY-EXISTS','no owner decision, no child course');
 const unbound=await coordinateInitialDesignAdvisory({...changed,hostExecution:createNativeInitialAdvisorExecution({runner}),observeInitialCourseDecision:()=>({status:'unavailable',code:'DAC-CHILD-COURSE-DECISION-UNBOUND'})});
 assert.equal(unbound.ok,false);
 assert.equal(unbound.status==='unavailable-pending-final-approval'&&unbound.courseBinding.courseId!==parent,false,'an unbound decision opens no child course');
 const child=await coordinateInitialDesignAdvisory({...changed,hostExecution:createNativeInitialAdvisorExecution({runner}),observeInitialCourseDecision:decision});
 assert.equal(child.status,'unavailable-pending-final-approval',JSON.stringify(child));
 assert.notEqual(child.courseBinding.courseId,parent);
 const reused=await coordinateInitialDesignAdvisory({...input,dispatch:{...f.dispatch,dispatchId:'advisor_reused'},hostExecution:createNativeInitialAdvisorExecution({runner}),newCourseParentId:child.courseBinding.courseId,observeInitialCourseDecision:decision});
 assert.equal(reused.code,'DACS-OWNER-DECISION-REUSED',JSON.stringify(reused));
});

test('(iii) a child course opens only with an owner decision and a reused decision is refused (managed host fixture)',async t=>{
 if(process.platform!=='linux'){t.skip('host skip: the actual managed host fixture is Linux-only (CRHS-INPUT elsewhere)');return;}
 const f=advisorHostFixture(t);
 const input={repoRoot:f.root,featureId:'advisor-feature',authoringDispatchId:'elephant-author',sources:f.sources,reason:'risk-review',profile:'feature',dispatch:f.args.dispatch,route:f.route,hostExecution:f.execution};
 const first=await coordinateInitialDesignAdvisory(input);
 assert.equal(first.status,'answered',JSON.stringify(first));
 const decision=m=>({status:'approved',...m,decisionRef:'owner-new-question',decisionSha256:'a'.repeat(64)});
 const changed={...input,reason:'architecture-tradeoff',dispatch:{...input.dispatch,dispatchId:'advisor-successor'},newCourseParentId:first.courseBinding.courseId};
 assert.equal((await coordinateInitialDesignAdvisory(changed)).code,'DAC2-COURSE-ALREADY-EXISTS','no owner decision, no child course');
 const child=await coordinateInitialDesignAdvisory({...changed,observeInitialCourseDecision:decision});
 assert.equal(child.status,'answered',JSON.stringify(child));
 assert.notEqual(child.courseBinding.courseId,first.courseBinding.courseId);
 const reused=await coordinateInitialDesignAdvisory({...input,dispatch:{...input.dispatch,dispatchId:'advisor-reused-decision'},newCourseParentId:child.courseBinding.courseId,observeInitialCourseDecision:decision});
 assert.equal(reused.code,'DACS-OWNER-DECISION-REUSED');
});

test('(iv) re-deriving and publishing a native no-child result is idempotent',async t=>{
 const f=nativeFixture(t),runner='claude',{route,dispatch}=f;
 const coordinate=()=>coordinateInitialDesignAdvisory({repoRoot:f.root,runner,featureId:'native-feature',authoringDispatchId:'native-author',sources:f.sources,reason:'risk-review',profile:'feature',dispatch,route,hostExecution:createNativeInitialAdvisorExecution({runner})});
 const first=await coordinate();
 assert.equal(first.status,'unavailable-pending-final-approval',JSON.stringify(first));
 assert.equal(first.hostReceipt,null);
 assert.equal(first.implementationAuthority,false);
 const existing=await coordinate();
 assert.equal(existing.code,'DAC2-COURSE-ALREADY-EXISTS');
 assert.equal(existing.course.status,'reuse-terminal');
 const derive=()=>rederiveNativeNoChildAdvisory({repoRoot:f.root,featureId:'native-feature',authoringDispatchId:'native-author',sources:f.sources,runner,existing:existing.course});
 const a=derive(),b=derive();
 assert.equal(a.rederived,true);
 assert.equal(a.status,'unavailable-pending-final-approval');
 assert.equal(designAdvisorValueSha256(JSON.parse(JSON.stringify(a))),designAdvisorValueSha256(JSON.parse(JSON.stringify(b))),'re-derivation is deterministic');
 // Not applicable shapes return null and never fabricate bytes.
 assert.equal(rederiveNativeNoChildAdvisory({repoRoot:f.root,runner:'codex',existing:existing.course}),null);
 assert.equal(rederiveNativeNoChildAdvisory({repoRoot:f.root,runner,existing:{...existing.course,outcome:'answered'}}),null);
 const args={'feature-id':'native-feature','authoring-dispatch-id':'native-author',sources:f.sources,profile:'feature','output-prefix':'out/native-advisor'};
 const publish=()=>publishNativeInitialResult({root:f.root,args,runner,route,result:existing});
 const read=refs=>Object.fromEntries(Object.entries(refs).map(([k,v])=>[k,readFileSync(join(f.root,v.path))]));
 const one=publish(),bytes1=read(one.artifacts);
 assert.equal(one.status,'unavailable-pending-final-approval');
 assert.equal(one.implementationAuthority,false);
 assert.deepEqual(Object.keys(one.artifacts).sort(),['course-binding','failure','initial']);
 const two=publish(),bytes2=read(two.artifacts);
 assert.deepEqual(two.artifacts,one.artifacts,'re-run is byte-identical by reference and digest');
 for(const k of Object.keys(bytes1))assert.ok(bytes1[k].equals(bytes2[k]));
 const filesAfterTwo=readdirSync(join(f.root,'out')).sort();
 const three=publish();
 assert.deepEqual(three.artifacts,two.artifacts,'a second re-run is a no-op');
 assert.deepEqual(readdirSync(join(f.root,'out')).sort(),filesAfterTwo);
 // A result that is not an already-existing course passes through unchanged (no export, no state).
 const passthrough={ok:false,status:'recovery-required',code:'X'};
 assert.equal(publishNativeInitialResult({root:f.root,args,runner,route,result:passthrough}),passthrough);
});

// (v) The replacement route. Acceptance clause 1 of the item (Spec 21.5 R5-6/R5-8): one design revision after a review
// finding rebinds the sources in a single step, needs zero PO interactions and zero overrides, and does not loop.
// ADR-0085 retired the Advisor course; the revision route is: delta review receipt (`design-review-receipt.mjs create`,
// real, from disk) -> one rebind (`createDesignApprovalBinding`) -> one request carrying the single signature intent.
const sha256Text=text=>createHash('sha256').update(text).digest('hex');
const FORBIDDEN_IDENTIFIERS=/dispatch|course|advisor|override|continuity|signature|proof/iu;
const isoAt=hour=>()=>new Date(`2026-10-22T${hour}:00:00.000Z`);
const CANDIDATE={commit:'a'.repeat(40),tree:'b'.repeat(40)};

function revisionFixture(t){
 const root=scratchRoot(t),env={CLAUDECODE:'1'};
 const put=(rel,text)=>{mkdirSync(dirname(join(root,rel)),{recursive:true});writeFileSync(join(root,rel),text);};
 const ref=rel=>({path:rel,sha256:sha256Text(readFileSync(join(root,rel)))});
 const sourcesNow=()=>({prd:ref('specs/f1/prd.md'),spec:ref('specs/f1/spec.md'),companions:[ref('specs/f1/design.md')]});
 const receiptAt=(n,{previous=null,open=[],hour})=>{
  const made=createReceiptFromDisk({repo:root,featureId:'f1',reportPath:`specs/f1/review/report-${n}.md`,prdPath:'specs/f1/prd.md',specPath:'specs/f1/spec.md',
   companionPaths:['specs/f1/design.md'],previousPath:previous,openFindingIds:open,outPath:`specs/f1/review/receipt-${n}.json`},{env,now:isoAt(hour)});
  return made.ok?{ok:true,path:made.path,bytes:readFileSync(join(root,made.path))}:made;
 };
 put('specs/f1/prd.md','PRD v1\n');put('specs/f1/spec.md','Spec v1\n');put('specs/f1/design.md','Design v1\n');
 put('specs/f1/review/report-1.md','Review round 1: F-1 open.\n');put('specs/f1/review/report-2.md','Review round 2: pass.\n');
 return {root,put,sourcesNow,receiptAt};
}

// The whole contract, parameterised over the rebind function so mutants can be proven RED against it.
function assertSingleStepRevision(bind,t){
 const f=revisionFixture(t);
 const sources1=f.sourcesNow(),r1=f.receiptAt(1,{open:['F-1'],hour:'10'});
 assert.equal(r1.ok,true,JSON.stringify(r1));
 const stale=createDesignApprovalBinding({featureId:'f1',receipts:[r1],currentSources:sources1});
 assert.equal(stale.ok,true,JSON.stringify(stale));
 assert.equal(stale.binding.verdict,'open-findings');
 const staleRequest=createDesignApprovalRequest({binding:stale.binding,candidate:CANDIDATE});
 assert.equal(staleRequest.ok,true,JSON.stringify(staleRequest));
 // The revision: the finding is fixed in the Spec, then ONE delta receipt (round 2) is produced from disk.
 f.put('specs/f1/spec.md','Spec v2 (F-1 fixed)\n');
 const sources2=f.sourcesNow(),r2=f.receiptAt(2,{previous:'specs/f1/review/receipt-1.json',open:[],hour:'11'});
 assert.equal(r2.ok,true,JSON.stringify(r2));
 const receipts=[r1,r2];
 // A request over the pre-revision chain is stale evidence, refused with a typed code (never silently accepted).
 const staleVerdict=verifyDesignApprovalRequest({request:staleRequest.request,featureId:'f1',receipts,currentSources:sources2});
 assert.equal(staleVerdict.ok,false);
 assert.match(staleVerdict.code,/^DAB-/u);
 // The single rebind step. Its inputs are only the receipt chain and the current sources: no PO input of any kind.
 const rebound=bind({featureId:'f1',receipts,currentSources:sources2});
 assert.equal(rebound.ok,true,JSON.stringify(rebound));
 assert.deepEqual(rebound.binding.sources,sources2,'the binding rebinds the current (revised) sources');
 assert.deepEqual(rebound.binding.reviewReceipts.map(r=>r.round),[1,2]);
 assert.equal(rebound.binding.verdict,'pass');
 assert.deepEqual(rebound.binding.openFindingIds,[]);
 assert.equal(Object.hasOwn(rebound.binding,'unreviewedSourceDelta'),false,'nothing changed after the delta review');
 const request=createDesignApprovalRequest({binding:rebound.binding,candidate:CANDIDATE});
 assert.equal(request.ok,true,JSON.stringify(request));
 // One request, one intent to sign; no identifier, course, dispatch, override, continuity or proof is part of it.
 assert.deepEqual(Object.keys(request.request).sort(),['approvalIntent','binding','bindingSha256','schema']);
 assert.equal(FORBIDDEN_IDENTIFIERS.test(JSON.stringify(request.request)),false,'the request carries no hand-invented identifier or ceremony artefact');
 const verified=verifyDesignApprovalRequest({request:request.request,featureId:'f1',receipts,currentSources:sources2});
 assert.equal(verified.ok,true,JSON.stringify(verified));
 assert.equal(verified.intentSha256,request.intentSha256);
 return {f,receipts,sources2,rebound};
}

test('(v) a design revision on the replacement route is one delta receipt and one rebind with zero PO interactions',t=>{
 const {f,receipts,sources2,rebound}=assertSingleStepRevision(input=>createDesignApprovalBinding(input),t);
 // Does not loop: a further edit after the delta review is carried as an unreviewed delta in the SAME binding step,
 // and a third review round is refused (QG-13) instead of being asked for.
 f.put('specs/f1/design.md','Design v2 (edited after the delta review)\n');
 const drifted=createDesignApprovalBinding({featureId:'f1',receipts,currentSources:f.sourcesNow()});
 assert.equal(drifted.ok,true,JSON.stringify(drifted));
 assert.deepEqual(drifted.binding.unreviewedSourceDelta.map(entry=>entry.path),['specs/f1/design.md']);
 assert.equal(drifted.binding.reviewReceipts.length,2);
 f.put('specs/f1/review/report-3.md','Review round 3.\n');
 const third=f.receiptAt(3,{previous:'specs/f1/review/receipt-2.json',open:[],hour:'12'});
 assert.deepEqual([third.ok,third.code],[false,'DRR-ROUND-EXCEEDED']);
 assert.notDeepEqual(rebound.binding.sources,f.sourcesNow(),'fixture: the drift really changed a source');
 void sources2;
});

test('(v-doc) the documented revision route is mechanical agent work and names no Advisor course',()=>{
 const doc=readFileSync(new URL('../../skills/pipeline-start/references/design-course.md',import.meta.url),'utf8');
 assert.match(doc,/mechanical agent work, not another PO permission/u);
 assert.match(doc,/correct the\s+sources with `reopen-design`, `submit-plan`, `present-plan`/u);
 assert.match(doc,/There is no\s+mandatory initial Advisor course/u);
 const state=readFileSync(new URL('../../scripts/pipeline-state.mjs',import.meta.url),'utf8');
 assert.match(state,/present-plan accepts only --by <name> and --review-receipt <repo-relative-json-path>/u,'present-plan takes no dispatch, course or override argument');
});

test('(v-RED) a rebind that invents an identifier, or drops the delta receipt, is caught by the contract',t=>{
 const invents=input=>{const made=createDesignApprovalBinding(input);return made.ok?{...made,binding:{...made.binding,dispatchId:'invented-by-hand'}}:made;};
 assert.throws(()=>assertSingleStepRevision(invents,t),/dispatchId|DAB-SHAPE|Expected values|false/iu);
 const dropsDelta=input=>createDesignApprovalBinding({...input,receipts:input.receipts.slice(0,1)});
 assert.throws(()=>assertSingleStepRevision(dropsDelta,t),/DAB-REVIEW-CHAIN|Expected values|false/iu);
 // The unmutated rebind passes the very same contract.
 assertSingleStepRevision(input=>createDesignApprovalBinding(input),t);
});

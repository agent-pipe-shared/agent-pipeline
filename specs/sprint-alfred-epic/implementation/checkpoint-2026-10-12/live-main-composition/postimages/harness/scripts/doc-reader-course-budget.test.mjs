// SPDX-License-Identifier: SUL-1.0
// Real Git closure evidence, not Reader dispatch admission or host identity.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerTestCaseCompletion} from '../../plugins/pipeline-core/lib/test-case-completion.mjs';
import {READER_REVIEW_PATHS,READER_REVIEW_INPUT_PATHS,checkReaderBinding,snapshotReaderDocumentation,snapshotHistoricalReaderDocumentation} from './check-doc-reader-binding.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const completionCases=[];
function test(name,run){completionCases.push({id:'RC02C'+String(completionCases.length+1).padStart(3,'0'),name,run});}
const scratchRoot=process.env.PIPELINE_READER_BUDGET_FIXTURE_ROOT
  ??resolve(dirname(fileURLToPath(import.meta.url)),'../../scratch/reader-course-budget-fixtures');

function fixture(t,{count=2,escalation='early',policyChange=false,scopeExpansion=false}={}){
  mkdirSync(scratchRoot,{recursive:true});
  const root=mkdtempSync(join(scratchRoot,'course-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe'],
    env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_COUNT:'0',GIT_TERMINAL_PROMPT:'0'}}).trim();
  const write=(path,bytes)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),bytes);};
  const json=(path,value)=>write(path,JSON.stringify(value)+'\n');
  const commit=message=>{git(['add','-A']);git(['-c','core.hooksPath=/dev/null','-c','commit.gpgSign=false','-c','user.name=Fixture',
    '-c','user.email=fixture@example.invalid','commit','-qm',message]);return git(['rev-parse','HEAD']);};
  const featureId='reader-budget-fixture',prefix='specs/'+featureId+'/evidence/reader-review/';
  const declare=paths=>write('harness/scripts/check-doc-reader-binding.mjs','export const READER_REVIEW_PATHS = Object.freeze('+JSON.stringify(paths,null,2)+');\n');
  const scope=scopeExpansion?READER_REVIEW_PATHS.filter(path=>path!=='PIPELINE_FLOW.de.md'):READER_REVIEW_PATHS;
  declare(scope);for(const path of scope)write(path,'# '+path+'\nSynthetic public documentation.\n');
  for(const path of READER_REVIEW_INPUT_PATHS)write(path,path.endsWith('.json')?'{}\n':'# Synthetic committed Reader policy\n');
  const ownerSource=prefix+'course-decision-fixture.md';
  write(ownerSource,'# Synthetic documentation-owner decision\nTwo paired rounds; a justified third only; never a fourth.\n');
  git(['init','-q','--initial-branch=fixture']);commit('Synthetic initial documentation');
  const snap=(historical=false)=>{const c=git(['rev-parse','HEAD']),s=(historical?snapshotHistoricalReaderDocumentation:snapshotReaderDocumentation)({root,candidate:c,featureId});
    return {commit:c,tree:git(['rev-parse',c+'^{tree}']),coverage:s.coverage,inputs:s.inputs,docsetSha256:s.docsetSha256};};
  const rounds=[],correctionBatches=[];let final,policyTransition=null,escalationRef=null;
  const escalationPath=prefix+'course-escalation-fixture.md';
  const publishEscalation=()=>{write(escalationPath,'# Synthetic third-round justification\nA surrounding regression needs one complete paired escalation.\n');
    escalationRef={afterRound:2,reason:'A surrounding regression needs one complete paired escalation.',source:{path:escalationPath,sha256:hash(readFileSync(join(root,escalationPath)))}};
    commit('Synthetic prelaunch escalation justification');};
  for(let i=0;i<count;i++){
    if(i===2&&escalation==='early')publishEscalation();
    const round={id:'round-'+(i+1),mode:i===1?'corrections-only':'complete',reviewed:snap(true)};
    for(const [field,phase] of [['phaseOne','phase-one'],['phaseTwo','phase-two']]){
      const path=prefix+phase+'/'+round.id+'.md',bytes=Buffer.from('# Synthetic '+phase+'\nF1: correct the public fixture paragraph.\n');
      write(path,bytes);round[field]={path,sha256:hash(bytes),publication:{kind:'raw',rawSha256:hash(bytes)}};
    }
    commit('Synthetic paired reports '+(i+1));
    if(i===2&&escalation==='late')publishEscalation();
    write('README.md','# README\nSynthetic correction '+(i+1)+'.\n');
    if(scopeExpansion&&i===0){declare(READER_REVIEW_PATHS);write('PIPELINE_FLOW.de.md','# Newly split German guide\n');}
    if(policyChange&&i===count-1)write('harness/reader-review-protocol.md','# Synthetic explicit Reader policy transition\n');
    const resolutionCommit=commit('Synthetic correction '+(i+1));correctionBatches.push({afterRound:i+1,commits:[resolutionCommit]});
    if(i===count-1){final=snap();if(policyChange)policyTransition={fromSha256:round.reviewed.inputs.readerProtocolSha256,toSha256:final.inputs.readerProtocolSha256,commit:resolutionCommit};}
    const path=prefix+'disposition/'+round.id+'.json';
    json(path,{schema:'pipeline.doc-reader-terminal-disposition.v1',round:round.id,status:'resolved',findings:[{id:'F1',class:'fileline',status:'resolved',resolutionCommit}]});
    round.disposition={path,sha256:hash(readFileSync(join(root,path)))};commit('Synthetic disposition '+(i+1));rounds.push(round);
  }
  const owner={schema:'pipeline.doc-reader-terminal-owner-decision.v2',courseId:'fixture-course',authority:'documentation-owner',by:'Synthetic fixture owner',decision:'authorize-terminal-correction',
    maxRounds:3,maxCorrectionBatches:3,prohibitFourthReview:true,lastReviewedCommit:rounds.at(-1).reviewed.commit,acceptedFindingIds:[],source:{path:ownerSource,sha256:hash(readFileSync(join(root,ownerSource)))}};
  const ownerPath=prefix+'owner-decision.json';json(ownerPath,owner);
  const record={schema:'pipeline.doc-reader-terminal-record.v2',courseId:'fixture-course',rounds,correctionBatches,ownerDecision:{path:ownerPath,sha256:hash(readFileSync(join(root,ownerPath)))},final,policyTransition,escalation:count>=3?escalationRef:null};
  const recordPath=prefix+'record.json';json(recordPath,record);commit('Synthetic terminal binding');
  const refresh=()=>{json(recordPath,record);return commit('Synthetic binding mutation');};
  const setDisposition=mutate=>{const round=rounds.at(-1),value=JSON.parse(readFileSync(join(root,round.disposition.path)));mutate(value);json(round.disposition.path,value);round.disposition.sha256=hash(readFileSync(join(root,round.disposition.path)));refresh();};
  const setOwner=mutate=>{mutate(owner);json(ownerPath,owner);record.ownerDecision.sha256=hash(readFileSync(join(root,ownerPath)));refresh();};
  return {root,git,write,json,commit,record,recordPath,prefix,featureId,refresh,setDisposition,setOwner,
    check:()=>checkReaderBinding({root,candidate:git(['rev-parse','HEAD']),featureId})};
}
const passed=fx=>{const result=fx.check();assert.equal(result.status,'passed',result.findings.join('\n'));
  assert.equal(result.reviewedCommit,fx.record.rounds.at(-1).reviewed.commit);assert.equal(result.docsetSha256,fx.record.final.docsetSha256);
  assert.equal(result.assurance,'committed-state-and-evidence-presence-only');return result;};
const failed=fx=>assert.equal(fx.check().status,'failed');

test('two paired rounds close after final correction without a third reader',t=>{
  const fx=fixture(t);passed(fx);assert.notEqual(fx.record.rounds.at(-1).reviewed.docsetSha256,fx.record.final.docsetSha256);
});
test('third complete paired round closes with digest-bound prelaunch escalation',t=>passed(fixture(t,{count:3})));
test('exact owner acceptance closes an unchanged finding',t=>{
  const fx=fixture(t);fx.setDisposition(value=>Object.assign(value.findings[0],{status:'accepted',resolutionCommit:null}));
  fx.setOwner(owner=>{owner.acceptedFindingIds=['round-2/F1'];});passed(fx);
});
test('normalized public report and explicit final policy transition remain supported',t=>{
  const fx=fixture(t,{policyChange:true});fx.record.rounds.at(-1).phaseOne.publication={kind:'path-normalized',rawSha256:'a'.repeat(64)};fx.refresh();passed(fx);
  fx.record.policyTransition=null;fx.refresh();failed(fx);
});
test('historical document scope can expand without invented earlier coverage',t=>{
  const fx=fixture(t,{scopeExpansion:true});passed(fx);assert.equal(fx.record.rounds[0].reviewed.coverage.length,15);
  assert.equal(fx.record.rounds[1].reviewed.coverage.length,16);
  fx.record.rounds[0].reviewed.coverage.push(fx.record.rounds[1].reviewed.coverage.find(entry=>entry.path==='PIPELINE_FLOW.de.md'));fx.refresh();failed(fx);
});
test('third round without justification cannot close',t=>failed(fixture(t,{count:3,escalation:'missing'})));
test('justification first published after third reviewed state cannot close',t=>failed(fixture(t,{count:3,escalation:'late'})));
test('third-round reasons and committed source digest are mandatory',t=>{
  const fx=fixture(t,{count:3});const original=structuredClone(fx.record.escalation);
  for(const reason of ['', ' ', 'x'.repeat(501)]){fx.record.escalation={...original,reason};fx.refresh();failed(fx);}
  fx.record.escalation={...original,source:{...original.source,sha256:'b'.repeat(64)}};fx.refresh();failed(fx);
  fx.record.escalation={...original,afterRound:1};fx.refresh();failed(fx);
});
test('four paired rounds are forbidden by the v2 record',t=>failed(fixture(t,{count:4})));
test('fourth committed round cannot disappear through deleted evidence',t=>{
  const fx=fixture(t,{count:3}),paths=['phase-one/round-4.md','phase-two/round-4.md','disposition/round-4.json'].map(path=>fx.prefix+path);
  for(const path of paths)fx.write(path,'Synthetic forbidden fourth evidence\n');fx.commit('Synthetic fourth evidence');failed(fx);
  for(const path of paths)rmSync(join(fx.root,path));fx.commit('Synthetic deleted fourth evidence');failed(fx);
});
test('round IDs and course ID relabeling cannot erase historical evidence',t=>{
  const fx=fixture(t,{count:3});fx.record.courseId='renamed-course';fx.setOwner(owner=>{owner.courseId='renamed-course';});
  const round=fx.record.rounds[2];round.id='replacement-round';
  for(const [field,phase] of [['phaseOne','phase-one'],['phaseTwo','phase-two']]){
    const old=round[field].path,path=fx.prefix+phase+'/'+round.id+'.md';fx.write(path,readFileSync(join(fx.root,old)));rmSync(join(fx.root,old));round[field].path=path;
  }
  const old=round.disposition.path,path=fx.prefix+'disposition/'+round.id+'.json',value=JSON.parse(readFileSync(join(fx.root,old)));value.round=round.id;
  fx.json(path,value);rmSync(join(fx.root,old));round.disposition={path,sha256:hash(readFileSync(join(fx.root,path)))};fx.refresh();failed(fx);
});
test('duplicate round identities cannot close',t=>{const fx=fixture(t);fx.record.rounds[1].id=fx.record.rounds[0].id;fx.refresh();failed(fx);});
test('open finding cannot close',t=>{const fx=fixture(t);fx.setDisposition(value=>{value.findings[0].status='open';});failed(fx);});
test('unaccepted finding cannot close',t=>{const fx=fixture(t);fx.setDisposition(value=>Object.assign(value.findings[0],{status:'accepted',resolutionCommit:null}));failed(fx);});
test('invented resolution outside its correction batch cannot close',t=>{const fx=fixture(t);fx.setDisposition(value=>{value.findings[0].resolutionCommit=fx.record.rounds[0].reviewed.commit;});failed(fx);});
test('omitted correction commit cannot close',t=>{const fx=fixture(t);fx.record.correctionBatches[0].commits=[];fx.refresh();failed(fx);});
test('extra record owner escalation and finding fields are rejected',t=>{
  const a=fixture(t);a.record.extra=true;a.refresh();failed(a);
  const b=fixture(t);b.setOwner(owner=>{owner.extra=true;});failed(b);
  const c=fixture(t,{count:3});c.record.escalation.extra=true;c.refresh();failed(c);
  const d=fixture(t);d.setDisposition(value=>{value.findings[0].extra=true;});failed(d);
});
test('duplicate JSON keys are rejected',t=>{const fx=fixture(t);fx.write(fx.recordPath,JSON.stringify(fx.record).replace('"courseId":"fixture-course"','"courseId":"other","courseId":"fixture-course"'));fx.commit('Synthetic duplicate record key');failed(fx);});
test('two-round escalation and legacy owner fields are rejected',t=>{
  const fx=fixture(t);fx.record.escalation={afterRound:2,reason:'No third round exists',source:fx.record.ownerDecision};fx.refresh();failed(fx);
  const second=fixture(t);second.setOwner(owner=>{owner.prohibitFifthReview=true;owner.fourthReviewedCommit=owner.lastReviewedCommit;delete owner.prohibitFourthReview;delete owner.lastReviewedCommit;});failed(second);
});
test('changed then restored public report remains invalid',t=>{
  const fx=fixture(t),ref=fx.record.rounds[0].phaseOne,original=readFileSync(join(fx.root,ref.path));
  fx.write(ref.path,'Synthetic overwritten report\n');fx.commit('Synthetic report overwrite');fx.write(ref.path,original);fx.commit('Synthetic report restoration');failed(fx);
});
test('postclosure public document inventory governance and protocol drift fail',t=>{
  for(const path of ['README.md',...READER_REVIEW_INPUT_PATHS]){const fx=fixture(t);fx.write(path,path.endsWith('.json')?'{"changed":true}\n':'# Synthetic drift\n');fx.commit('Synthetic postclosure drift');failed(fx);}
});
test('owner last reviewed commit must match actual final round',t=>{const fx=fixture(t);fx.setOwner(owner=>{owner.lastReviewedCommit=fx.record.rounds[0].reviewed.commit;});failed(fx);});
test('missing paired report and stale publication digest cannot close',t=>{
  const fx=fixture(t);rmSync(join(fx.root,fx.record.rounds[1].phaseTwo.path));fx.commit('Synthetic missing paired report');failed(fx);
  const second=fixture(t);second.record.rounds[1].phaseOne.publication.rawSha256='b'.repeat(64);second.refresh();failed(second);
});
test('reviewed snapshot must be real ancestor with exact tree',t=>{const fx=fixture(t);fx.record.rounds[0].reviewed.tree='f'.repeat(40);fx.refresh();failed(fx);});

if(completionCases.length!==24)throw new Error('Reader budget completion case count drift');
registerTestCaseCompletion({cases:completionCases,fd:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD??3),maxBytes:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES??65536)});

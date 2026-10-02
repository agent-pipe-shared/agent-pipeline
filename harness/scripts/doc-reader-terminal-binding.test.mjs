// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "../../plugins/pipeline-core/lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC01C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {canonicalJson} from '../../plugins/pipeline-core/scripts/release-preflight.mjs';
import {READER_REVIEW_PATHS,READER_REVIEW_INPUT_PATHS} from './check-doc-reader-binding.mjs';
import {TERMINAL_READER_SCHEMA,parseTerminalReaderRecord,verifyTerminalReaderCourse} from './doc-reader-terminal-binding.mjs';
import {checkReaderBinding,snapshotReaderDocumentation,snapshotHistoricalReaderDocumentation} from './check-doc-reader-binding.mjs';
const api={checkReaderBinding,snapshotReaderDocumentation,snapshotHistoricalReaderDocumentation};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t,{policyChange=false,scopeExpansion=false}={}){
  const root=mkdtempSync(join(tmpdir(),'terminal-reader-fixture-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
  const write=(path,bytes)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),bytes);};
  const json=(path,value)=>write(path,JSON.stringify(value)+'\n');
  const commit=message=>{git(['add','-A']);git(['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm',message]);return git(['rev-parse','HEAD']);};
  const featureId='reader-terminal-fixture',prefix='specs/'+featureId+'/evidence/reader-review/';
  const scope=scopeExpansion?READER_REVIEW_PATHS.filter(path=>path!=='PIPELINE_FLOW.de.md'):READER_REVIEW_PATHS;
  const declareScope=paths=>write('harness/scripts/check-doc-reader-binding.mjs','export const READER_REVIEW_PATHS = Object.freeze('+JSON.stringify(paths,null,2)+');\n');
  declareScope(scope);
  for(const path of scope)write(path,'# '+path+'\nSynthetic document fixture.\n');
  for(const path of READER_REVIEW_INPUT_PATHS)write(path,path.endsWith('.json')?'{}\n':'# Synthetic protocol\n');
  const ownerSource=prefix+'course-decision-fixture.md';write(ownerSource,'# Synthetic owner decision\nAuthorize four rounds plus terminal correction, no fifth review.\n');
  git(['init','-q','--initial-branch=fixture']);commit('Synthetic initial documentation');
  const snap=(historical=false)=>{const c=git(['rev-parse','HEAD']),s=(historical?api.snapshotHistoricalReaderDocumentation:api.snapshotReaderDocumentation)({root,candidate:c,featureId});return {commit:c,tree:git(['rev-parse',c+'^{tree}']),coverage:s.coverage,inputs:s.inputs,docsetSha256:s.docsetSha256};};
  const rounds=[],correctionBatches=[];let final,policyTransition=null;
  for(let i=0;i<4;i++){
    const round={id:'round-'+(i+1),mode:['complete','corrections-only','complete','corrections-only'][i],reviewed:snap(true)};
    for(const [field,phase] of [['phaseOne','phase-one'],['phaseTwo','phase-two']]){
      const path=prefix+phase+'/'+round.id+'.md',bytes=Buffer.from('# Synthetic '+phase+'\nFinding: change fixture paragraph.\n');write(path,bytes);
      round[field]={path,sha256:hash(bytes),publication:{kind:'raw',rawSha256:hash(bytes)}};
    }
    commit('Synthetic round '+(i+1)+' reports');
    write('README.md','# README\nCorrection '+(i+1)+' for the synthetic finding.\n');
    if(scopeExpansion&&i===0){declareScope(READER_REVIEW_PATHS);write('PIPELINE_FLOW.de.md','# Newly split German guide\n');}
    if(policyChange&&i===3)write('harness/reader-review-protocol.md','# Synthetic terminal policy transition\n');
    const resolutionCommit=commit('Synthetic correction '+(i+1));
    correctionBatches.push({afterRound:i+1,commits:[resolutionCommit]});
    if(i===3){final=snap();if(policyChange)policyTransition={fromSha256:round.reviewed.inputs.readerProtocolSha256,toSha256:final.inputs.readerProtocolSha256,commit:resolutionCommit};}
    const path=prefix+'disposition/'+round.id+'.json';
    const disposition={schema:'pipeline.doc-reader-terminal-disposition.v1',round:round.id,status:'resolved',findings:[{id:'F1',class:'fileline',status:'resolved',resolutionCommit}]};
    json(path,disposition);round.disposition={path,sha256:hash(readFileSync(join(root,path)))};commit('Synthetic disposition '+(i+1));rounds.push(round);
  }
  const owner={schema:'pipeline.doc-reader-terminal-owner-decision.v1',courseId:'fixture-course',authority:'documentation-owner',by:'Synthetic fixture owner',decision:'authorize-terminal-correction',
    maxRounds:4,maxCorrectionBatches:4,prohibitFifthReview:true,fourthReviewedCommit:rounds[3].reviewed.commit,acceptedFindingIds:[],source:{path:ownerSource,sha256:hash(readFileSync(join(root,ownerSource)))}};
  const ownerPath=prefix+'owner-decision.json';json(ownerPath,owner);
  const record={schema:TERMINAL_READER_SCHEMA,courseId:'fixture-course',rounds,correctionBatches,ownerDecision:{path:ownerPath,sha256:hash(readFileSync(join(root,ownerPath)))},final,policyTransition};
  const recordPath=prefix+'record.json';json(recordPath,record);let candidate=commit('Synthetic bounded terminal binding');
  const refresh=()=>{json(recordPath,record);candidate=commit('Synthetic binding mutation');return candidate;};
  return {root,git,write,json,commit,record,recordPath,prefix,featureId,refresh,check:()=>api.checkReaderBinding({root,candidate:git(['rev-parse','HEAD']),featureId})};
}
test('four real committed fixture rounds close after terminal correction without fifth reader',t=>{
  const fx=fixture(t),result=fx.check();assert.equal(result.status,'passed',result.findings.join('\n'));
  assert.equal(result.reviewedCommit,fx.record.rounds[3].reviewed.commit);assert.equal(result.docsetSha256,fx.record.final.docsetSha256);
  assert.notEqual(fx.record.rounds[3].reviewed.docsetSha256,fx.record.final.docsetSha256);
  assert.equal(result.assurance,'committed-state-and-evidence-presence-only');
});
test('explicit policy transition and disclosed normalized public report are bound truthfully',t=>{
  const fx=fixture(t,{policyChange:true});fx.record.rounds[3].phaseOne.publication={kind:'path-normalized',rawSha256:'a'.repeat(64)};fx.refresh();
  assert.equal(fx.check().status,'passed');fx.record.policyTransition=null;fx.refresh();assert.equal(fx.check().status,'failed');
});
test('fifth report remains disallowed even if a later commit deletes it',t=>{
  const fx=fixture(t),path=fx.prefix+'phase-one/round-5.md';fx.write(path,'# Synthetic unwanted fifth review\n');fx.commit('Synthetic fifth report');
  assert.equal(fx.check().status,'failed');rmSync(join(fx.root,path));fx.commit('Delete synthetic fifth report');assert.equal(fx.check().status,'failed');
});
test('unresolved finding and invented resolution cannot close the course',t=>{
  const fx=fixture(t),round=fx.record.rounds[3],path=round.disposition.path;
  const disposition=JSON.parse(readFileSync(join(fx.root,path)));disposition.findings[0].status='open';fx.json(path,disposition);round.disposition.sha256=hash(readFileSync(join(fx.root,path)));fx.refresh();
  assert.equal(fx.check().status,'failed');disposition.findings[0].status='resolved';disposition.findings[0].resolutionCommit=fx.record.rounds[0].reviewed.commit;
  fx.json(path,disposition);round.disposition.sha256=hash(readFileSync(join(fx.root,path)));fx.refresh();assert.equal(fx.check().status,'failed');
});
test('post-closure covered-document and governance drift fail',t=>{
  const fx=fixture(t);fx.write('README.md','# Changed after closure\n');fx.commit('Synthetic drift');assert.equal(fx.check().status,'failed');
  const second=fixture(t);second.write('governance/observation-doc-governance.json','{"changed":true}\n');second.commit('Synthetic governance drift');assert.match(second.check().findings.join('\n'),/post-closure document or input drift/);
});
test('owner acceptance is required for any finding left unchanged',t=>{
  const fx=fixture(t),round=fx.record.rounds[3],path=round.disposition.path,disposition=JSON.parse(readFileSync(join(fx.root,path)));
  disposition.findings[0]={...disposition.findings[0],status:'accepted',resolutionCommit:null};fx.json(path,disposition);round.disposition.sha256=hash(readFileSync(join(fx.root,path)));fx.refresh();
  assert.equal(fx.check().status,'failed');const ownerPath=fx.record.ownerDecision.path,owner=JSON.parse(readFileSync(join(fx.root,ownerPath)));
  owner.acceptedFindingIds=[round.id+'/F1'];fx.json(ownerPath,owner);fx.record.ownerDecision.sha256=hash(readFileSync(join(fx.root,ownerPath)));fx.refresh();assert.equal(fx.check().status,'passed');
});
test('omitted correction commit and mismatched report bytes fail',t=>{
  const fx=fixture(t);fx.record.correctionBatches[0].commits=[];fx.refresh();assert.equal(fx.check().status,'failed');
  const second=fixture(t),ref=second.record.rounds[3].phaseOne;second.write(ref.path,'# Rewritten synthetic report\n');ref.sha256=hash(readFileSync(join(second.root,ref.path)));ref.publication.rawSha256=ref.sha256;second.refresh();
  assert.match(second.check().findings.join('\n'),/immutable report changed/);
  const restored=fixture(t),report=restored.record.rounds[0].phaseOne;
  const original=readFileSync(join(restored.root,report.path));
  restored.write(report.path,'# Temporarily overwritten report\n');restored.commit('Synthetic intermediate report overwrite');
  restored.write(report.path,original);restored.commit('Synthetic report restoration');
  assert.equal(hash(readFileSync(join(restored.root,report.path))),report.sha256);
  assert.match(restored.check().findings.join('\n'),/immutable report changed/);
});
test('terminal record rejects duplicate JSON keys and borrowed round identity',t=>{
  const fx=fixture(t);fx.write(fx.recordPath,JSON.stringify(fx.record).replace('"courseId":"fixture-course"','"courseId":"other","courseId":"fixture-course"'));fx.commit('Synthetic duplicate fields');
  assert.equal(fx.check().status,'failed');fx.record.rounds[3].id=fx.record.rounds[2].id;fx.refresh();assert.equal(fx.check().status,'failed');
});
test('historical 15-document scope expands to 16 without inventing an earlier review',t=>{
  const fx=fixture(t,{scopeExpansion:true}),result=fx.check();assert.equal(result.status,'passed',result.findings.join('\n'));
  assert.equal(fx.record.rounds[0].reviewed.coverage.length,15);assert.equal(fx.record.rounds[1].reviewed.coverage.length,16);
  fx.record.rounds[0].reviewed.coverage.push(fx.record.rounds[1].reviewed.coverage.find(entry=>entry.path==='PIPELINE_FLOW.de.md'));fx.refresh();
  assert.match(fx.check().findings.join('\n'),/snapshot digest mismatch/);
});

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 9) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

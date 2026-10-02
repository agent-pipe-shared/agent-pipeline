// SPDX-License-Identifier: SUL-1.0
// Actual managed Node protocol fixture; synthetic controls, no provider/model calls.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {readinessFixture} from './codex-readiness-finalization.fixture.mjs';
import {createInitialAdvisorContext} from './design-advisor-course.mjs';
import {hostDigest} from './codex-host-process-journal.mjs';
import {createCodexAdvisorExecution} from './codex-advisor-execution.mjs';
export function advisorHostFixture(t,scenario='clean',decision='approved'){
 const f=readinessFixture(t),script=join(f.input,'app-server');
 writeFileSync(join(f.root,'pipeline.user.yaml'),'advisor_export:\n  consent: approved\n');
 let source=readFileSync(script,'utf8');
 const start=source.indexOf('const report={'),end=source.indexOf("send({id:m.id,result:{turn:",start);
 if(start<0||end<0)throw Error('fixture anchor');
 source=source.slice(0,start)+`const input=JSON.parse(m.params.input[0].text.split('UNTRUSTED_INPUT_JSON\\n')[1]);
const refs=input.evidence.map(({path,sha256})=>({path,sha256}));
const report={schema:lit(p.schema),dispatchId:lit(p.dispatchId),initialContextSha256:lit(p.initialContextSha256),questionSha256:lit(p.questionSha256),evidenceSha256:lit(p.evidenceSha256),answer:'Actual unknown-at-launch '+require('node:crypto').randomUUID(),evidenceReferences:[refs[0]],proposals:[{proposalId:'proposal-1',text:'Synthetic actual managed output suggestion',evidenceReferences:[refs[0]]}]};
if(${JSON.stringify(scenario)}==='cross-citation')report.proposals[0].evidenceReferences=[{path:refs[0].path,sha256:refs[1].sha256}];
`+source.slice(end);
 if(scenario==='empty-process')source='process.exit(0);\n';
 writeFileSync(script,source);
 const contextResult=createInitialAdvisorContext({repoFingerprint:f.repoFingerprint,featureId:'advisor-feature',authoringDispatchId:'elephant-author',initialCandidate:f.candidate,sources:f.sources,sourceBytes:Object.fromEntries(Object.entries(f.sources).map(([name,s])=>[name,readFileSync(join(f.root,s.path))])),reason:'risk-review',routePolicySha256:hostDigest(f.route),createdAt:new Date().toISOString()});
 if(!contextResult.ok)throw Error(contextResult.code);
 const initialContext=contextResult.context,dispatch={dispatchId:'advisor-fixture',queueRevision:0,candidateCommit:f.candidate.commit,candidateTree:f.candidate.tree},courseBinding={courseId:'course-fixture',initialContextSha256:contextResult.contextSha256,reservationId:'reservation-fixture',slot:1,routeStepSha256:hostDigest(f.route)};
 const calls={ready:0,export:0},admission={requireReady:()=>{calls.ready++;return {status:'ready'};},observeCurrentMetadata:m=>m,observeRegisteredRoute:m=>m.route,admitHostExport:()=>{calls.export++;return {decision};}};
 const args={initialContext,dispatch,profile:'feature',reason:initialContext.reason,route:f.route,courseBinding};
 const execution=createCodexAdvisorExecution({repoRoot:f.root,trustedExecutablePath:process.execPath,inputDirectory:f.input,admission});
 return {...f,script,args,execution,calls,admission};
}

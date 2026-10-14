// SPDX-License-Identifier: SUL-1.0
// Regression pin: pipeline.preflight-hides-the-git-error-behind-gs-git-unavailable (ALF-C-P2-13, AC-229).
// Drives the real governance-scope module, the real preflight envelope and the real diagnostic script.
// The only injection is the module's documented read-only topology `spawn` seam (a failing git) and the
// preflight's `observeGovernanceScopeFn` seam, which here delegates to the real controller.
// Fixtures live under the repository's scratch/ (gitignored); no directory mode bits or symlinks are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readdirSync,rmSync,statSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createGovernanceScopeController,governanceScopeDiagnosticAction,governanceScopeFailureDiagnostic} from '../governance-scope.mjs';
import {observePipelineStartPreflight} from '../../scripts/pipeline-start-preflight.mjs';
import {diagnoseGovernanceScope,run as runDiagnose} from '../../scripts/governance-scope-diagnose.mjs';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..','..','..','..');
const scratch=join(repoRoot,'scratch');
function fixture(t){
  mkdirSync(scratch,{recursive:true});
  const base=mkdtempSync(join(scratch,'gs-git-cause-')),root=join(base,'repo');
  mkdirSync(root);mkdirSync(join(root,'.git')); // empty, unusable Git control: the probe failure is not a non-Git project
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  return {base,root,controller:createGovernanceScopeController({hostStateRoot:join(base,'host-store')})};
}
const failingGit=(status,stderr)=>({spawn:()=>({status,stdout:'',stderr,error:undefined,signal:null})});
function observeWith(f,topologyOptions){return f.controller.observe({rootDir:f.root,topologyOptions});}
function tree(dir,prefix=''){const out=[];for(const e of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(dir,e.name);out.push(prefix+e.name+(e.isDirectory()?'/':':'+statSync(p).size));if(e.isDirectory())out.push(...tree(p,prefix+e.name+'/'));}return out;}

test('AC-229 point 1: the git message is surfaced as a bounded cause next to the GS-GIT-UNAVAILABLE code',t=>{
  const f=fixture(t),obs=observeWith(f,failingGit(128,"fatal: unable to access 'NUL': Invalid argument\n"));
  assert.ok(obs.diagnostics.includes('GS-GIT-UNAVAILABLE'));
  assert.equal(obs.repositoryKind,'unavailable');
  const d=governanceScopeFailureDiagnostic(obs);
  assert.deepEqual(d.cause,{gitExitCode:128,stderrFirstLine:"fatal: unable to access 'NUL': Invalid argument"});
  assert.equal(d.topologyDiagnostic.reason,'unsupported-existing-control');
  assert.equal(d.topologyDiagnostic.boundary,'selected-root');
  assert.equal(d.topologyDiagnostic.ancestorDepth,0);
});

test('AC-229 point 2: the cause is bounded, first-line-only, control-stripped and path-redacted',t=>{
  const f=fixture(t),long='x'.repeat(900);
  const obs=observeWith(f,failingGit(1,"\u001b[31mfatal: cannot open 'C:\\Users\\a b\\secret dir\\f' and \"/home/u/.ssh/id\" at ~/.aws/c D:/Dev/p/q\u0007 "+long+"\nSECOND-LINE-LEAK /etc/passwd\n"));
  const line=governanceScopeFailureDiagnostic(obs).cause.stderrFirstLine;
  assert.ok(line.length<=500);
  assert.ok(!/SECOND-LINE-LEAK/.test(line));
  assert.ok(!/[\u0000-\u001f\u007f]/u.test(line));
  assert.ok(!/Users|secret dir|\.ssh|\.aws|Dev[\\/]p|passwd/.test(line));
  assert.ok(line.includes("'[path]'")&&line.includes('"[path]"'));
  assert.ok(line.startsWith('fatal: cannot open'));
});

test('AC-229 point 3: a git that cannot start yields a typed null exit and a fixed message, never raw exception text',t=>{
  const f=fixture(t),obs=observeWith(f,{spawn:()=>({status:null,stdout:'',stderr:'',error:new Error('spawn git ENOENT C:\\secret\\git.exe')})});
  const d=governanceScopeFailureDiagnostic(obs);
  assert.deepEqual(d.cause,{gitExitCode:null,stderrFirstLine:'Git topology probe unavailable'});
});

test('AC-229 point 4: the preflight envelope carries cause, topologyDiagnostic and a typed read-only nextAction',t=>{
  const f=fixture(t),real=f.controller;
  const result=observePipelineStartPreflight({cwd:f.root,observeGovernanceScopeFn:({rootDir})=>real.observe({rootDir,topologyOptions:failingGit(128,"fatal: unable to access 'NUL': Invalid argument\n")})});
  // An unenrolled root reports state "inactive"; the diagnostic must ride along on every non-active envelope.
  assert.equal(result.status,result.governanceScope.state==='inactive'?'pipeline-governance-inactive':'pipeline-governance-unverifiable');
  assert.equal(result.pipelineWorkPerformed,false);
  assert.ok(result.governanceScope.diagnostics.includes('GS-GIT-UNAVAILABLE'));
  assert.deepEqual(result.cause,{gitExitCode:128,stderrFirstLine:"fatal: unable to access 'NUL': Invalid argument"});
  assert.equal(result.topologyDiagnostic.reason,'unsupported-existing-control');
  const a=result.nextAction;
  assert.equal(a.schema,'pipeline.governance-scope-diagnostic-action.v1');
  assert.equal(a.kind,'command');assert.equal(a.mutation,false);assert.equal(a.requiresConfirmation,false);
  assert.deepEqual(a.argv.slice(1),['--root',f.root]);
  assert.equal(a.expected.schema,'pipeline.governance-scope-diagnosis.v1');
});

test('AC-229 point 5: diagnosis is non-authoritative; the scope schema is not widened and no fixture byte changes',t=>{
  const f=fixture(t),before=tree(f.base);
  const obs=observeWith(f,failingGit(128,'fatal: boom\n'));
  assert.deepEqual(Object.keys(obs).sort(),['diagnostics','hintAllowed','provenance','repositoryKind','requiresEnforcement','root','schema','scopeKey','state']);
  assert.equal(obs.hintAllowed,false);
  assert.equal(obs.requiresEnforcement,obs.state==='unverifiable-active'||obs.state==='active');
  const out=diagnoseGovernanceScope({rootDir:f.root},{observeGovernanceScopeFn:({rootDir})=>f.controller.observe({rootDir,topologyOptions:failingGit(128,'fatal: boom\n')})});
  assert.equal(out.schema,'pipeline.governance-scope-diagnosis.v1');
  assert.equal(out.status,'observed');assert.equal(out.authority,false);assert.equal(out.mutation,false);assert.equal(out.pipelineWorkPerformed,false);
  assert.equal(out.cause.stderrFirstLine,'fatal: boom');
  assert.deepEqual(tree(f.base),before);
});

test('AC-229 point 6: the diagnostic entry prints the same cause and refuses unsafe or malformed roots',t=>{
  const f=fixture(t);let printed='',errText='';
  const deps={writeStdoutFn:s=>{printed+=s;},writeStderrFn:s=>{errText+=s;},observeGovernanceScopeFn:({rootDir})=>f.controller.observe({rootDir,topologyOptions:failingGit(128,'fatal: boom\n')})};
  assert.equal(runDiagnose(['--root',f.root],deps),0);
  const parsed=JSON.parse(printed);
  assert.equal(parsed.cause.gitExitCode,128);assert.equal(parsed.mutation,false);
  for(const argv of [[],['--root'],['--root','relative/path'],['--root',join(f.base,'missing')],['--root',f.root,'--extra']]){
    errText='';printed='';assert.equal(runDiagnose(argv,deps),2);assert.equal(printed,'');assert.match(errText,/^GSD-(ARGS|ROOT)\n$/);
  }
});

test('AC-229 point 7: the nextAction is runnable as emitted and answers with the typed read-only diagnosis',t=>{
  const f=fixture(t),a=governanceScopeDiagnosticAction({rootDir:f.root});
  assert.ok(a,'action must be produced for a canonical existing root');
  const r=spawnSync(a.executable,a.argv,{encoding:'utf8',shell:false,timeout:60000});
  assert.ok(r.status===0||r.status===2,'exit '+r.status+' '+r.stderr);
  const parsed=JSON.parse(r.stdout);
  assert.equal(parsed.schema,'pipeline.governance-scope-diagnosis.v1');
  assert.equal(parsed.authority,false);assert.equal(parsed.mutation,false);assert.equal(parsed.pipelineWorkPerformed,false);
});

test('AC-229 near-misses: no diagnostic is invented when none exists, and unsafe action roots are refused',t=>{
  const f=fixture(t);
  assert.equal(governanceScopeFailureDiagnostic({}),null);
  assert.equal(governanceScopeDiagnosticAction({rootDir:'relative/dir'}),null);
  assert.equal(governanceScopeDiagnosticAction({rootDir:join(f.base,'missing')}),null);
  assert.equal(governanceScopeDiagnosticAction({rootDir:f.root},{executable:'node'}),null);
  assert.equal(governanceScopeDiagnosticAction({rootDir:f.root},{scriptPath:join(f.base,'other.mjs')}),null);
  const scope={schema:'pipeline.governance-scope.v1',state:'unverifiable-active',root:null,scopeKey:null,repositoryKind:'unavailable',provenance:{kind:'none',refs:[]},diagnostics:['GS-GIT-UNAVAILABLE'],requiresEnforcement:true,hintAllowed:false};
  const result=observePipelineStartPreflight({cwd:f.root,observeGovernanceScopeFn:()=>scope});
  assert.equal(result.status,'pipeline-governance-unverifiable');
  assert.ok(!('cause' in result)&&!('topologyDiagnostic' in result));
  assert.equal(result.nextAction,null);
});

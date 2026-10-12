#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
// Pure diagnostic projection: no readiness, enrollment, repair or housekeeping authority.
import {lstatSync,realpathSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {observeGovernanceScope,governanceScopeFailureDiagnostic} from '../lib/governance-scope.mjs';
import {isDirectInvocation} from '../lib/entrypoint.mjs';
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export function parseGovernanceScopeDiagnosticArgs(argv,{realpathSyncFn=realpathSync,lstatSyncFn=lstatSync}={}){
  if(!Array.isArray(argv)||argv.length!==2||argv[0]!=='--root')return {ok:false,code:'GSD-ARGS'};
  const rootDir=argv[1];
  try{if(typeof rootDir!=='string'||!isAbsolute(rootDir)||resolve(rootDir)!==rootDir||/[\x00-\x1f\x7f]/u.test(rootDir))return {ok:false,code:'GSD-ROOT'};
    const st=lstatSyncFn(rootDir);if(!st.isDirectory()||st.isSymbolicLink()||realpathSyncFn(rootDir)!==rootDir)return {ok:false,code:'GSD-ROOT'};
    return {ok:true,rootDir};
  }catch{return {ok:false,code:'GSD-ROOT'};}
}
function validScope(v){
  return exact(v,['schema','state','root','scopeKey','repositoryKind','provenance','diagnostics','requiresEnforcement','hintAllowed'])
    &&v.schema==='pipeline.governance-scope.v1'&&['active','inactive','declined','unverifiable-active'].includes(v.state)
    &&(v.root===null||typeof v.root==='string'&&isAbsolute(v.root)&&resolve(v.root)===v.root)
    &&(v.scopeKey===null||typeof v.scopeKey==='string'&&/^[a-f0-9]{64}$/u.test(v.scopeKey))
    &&['git','non-git','unavailable'].includes(v.repositoryKind)
    &&exact(v.provenance,['kind','refs'])&&typeof v.provenance.kind==='string'&&Array.isArray(v.provenance.refs)
    &&v.provenance.refs.every(r=>exact(r,['path','sha256'])&&typeof r.path==='string'&&/^[a-f0-9]{64}$/u.test(r.sha256??''))
    &&Array.isArray(v.diagnostics)&&v.diagnostics.every(d=>typeof d==='string'&&/^GS-[A-Z0-9-]+$/u.test(d))
    &&v.requiresEnforcement===['active','unverifiable-active'].includes(v.state)
    &&typeof v.hintAllowed==='boolean'&&(!v.hintAllowed||v.state==='inactive'&&v.root!==null);
}
function validDiagnostic(v){
  return exact(v,['cause','topologyDiagnostic'])&&exact(v.cause,['gitExitCode','stderrFirstLine'])
    &&(v.cause.gitExitCode===null||Number.isSafeInteger(v.cause.gitExitCode))
    &&typeof v.cause.stderrFirstLine==='string'&&v.cause.stderrFirstLine.length<=500&&!/[\x00-\x1f\x7f]/u.test(v.cause.stderrFirstLine)
    &&exact(v.topologyDiagnostic,['reason','errno','gitCode','gitReportsNotRepository','boundary','ancestorDepth'])
    &&typeof v.topologyDiagnostic.reason==='string'&&/^[a-z-]+$/u.test(v.topologyDiagnostic.reason)
    &&(v.topologyDiagnostic.errno===null||typeof v.topologyDiagnostic.errno==='string'&&/^[A-Z0-9_-]+$/u.test(v.topologyDiagnostic.errno))
    &&(v.topologyDiagnostic.gitCode===null||typeof v.topologyDiagnostic.gitCode==='string'&&/^[A-Z0-9_-]+$/u.test(v.topologyDiagnostic.gitCode))
    &&typeof v.topologyDiagnostic.gitReportsNotRepository==='boolean'&&['selected-root','ancestor','filesystem-root'].includes(v.topologyDiagnostic.boundary)
    &&Number.isSafeInteger(v.topologyDiagnostic.ancestorDepth)&&v.topologyDiagnostic.ancestorDepth>=0;
}
export function diagnoseGovernanceScope({rootDir},{observeGovernanceScopeFn=observeGovernanceScope,governanceScopeFailureDiagnosticFn=governanceScopeFailureDiagnostic}={}){
  const base={schema:'pipeline.governance-scope-diagnosis.v1',status:'unavailable',root:rootDir,governanceScope:null,cause:null,topologyDiagnostic:null,authority:false,mutation:false,pipelineWorkPerformed:false};
  try{const scope=observeGovernanceScopeFn({rootDir});if(!validScope(scope))return base;
    const diagnostic=governanceScopeFailureDiagnosticFn(scope);
    return {...base,status:'observed',governanceScope:scope,...(validDiagnostic(diagnostic)?diagnostic:{})};
  }catch{return base;}
}
export function run(argv=process.argv.slice(2),deps={}){
  const emit=deps.writeStdoutFn??(text=>process.stdout.write(text)),error=deps.writeStderrFn??(text=>process.stderr.write(text));
  const parsed=parseGovernanceScopeDiagnosticArgs(argv,deps);
  if(!parsed.ok){error(parsed.code+'\n');return 2;}
  const value=diagnoseGovernanceScope({rootDir:parsed.rootDir},deps);emit(JSON.stringify(value)+'\n');return value.status==='observed'?0:2;
}
if(isDirectInvocation(import.meta.url)){
  try{const self=fileURLToPath(import.meta.url);if(process.argv[1]!==self||realpathSync(self)!==self||lstatSync(self).isSymbolicLink()){
    process.stderr.write('GSD-SCRIPT\n');process.exitCode=2;
  }else process.exitCode=run();}catch{process.stderr.write('GSD-UNAVAILABLE\n');process.exitCode=2;}
}

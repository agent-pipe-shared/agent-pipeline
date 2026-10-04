#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/** Explicit one-course native Advisor entry. Session bootstrap never calls it. */
import {randomUUID,createHash} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,realpathSync,writeFileSync,readFileSync} from 'node:fs';
import {dirname,resolve,join,relative,sep} from 'node:path';
import {createNativeCodexDesignAdvisorExecution,inspectCodexInitialAdvisorMetadata} from './codex-design-advisor-host.mjs';
import {coordinateInitialDesignAdvisory} from '../lib/design-advisory-coordinator-v2.mjs';
import {advisorPublicPath,ADVISOR_SOURCE_NAMES} from '../lib/codex-advisor-request.mjs';
import {canonicalJson} from '../lib/codex-sandbox-compatibility.mjs';
import {isDirectInvocation} from '../lib/entrypoint.mjs';
const USAGE='codex-design-advisor-bootstrap.mjs --repo-root <physical-root> --feature-id <id> --authoring-dispatch-id <id> --profile <epic|feature> --expected-commit <commit> --expected-tree <tree> --input <path>:<sha256> --prd <path>:<sha256> --spec <path>:<sha256> --design <path>:<sha256> --traceability <path>:<sha256> --output-prefix <public-repo-relative-prefix> [--inspect]';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v),oid=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v),sha=b=>createHash('sha256').update(b).digest('hex');
export function parseCodexDesignAdvisorArgs(argv){
 const args={sources:{},inspect:false},seen=new Set();for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(seen.has(flag))throw Error(USAGE);seen.add(flag);if(flag==='--inspect'){args.inspect=true;continue;}const value=argv[++i];if(typeof value!=='string')throw Error(USAGE);
  const name=flag.slice(2);if(ADVISOR_SOURCE_NAMES.includes(name)){const m=/^(.+):([a-f0-9]{64})$/.exec(value);if(!m||!advisorPublicPath(m[1]))throw Error(USAGE);args.sources[name]={path:m[1],sha256:m[2]};}
  else if(['repo-root','feature-id','authoring-dispatch-id','profile','expected-commit','expected-tree','output-prefix'].includes(name))args[name]=value;else throw Error(USAGE);
 }
 if(!args['repo-root']||!id(args['feature-id'])||!id(args['authoring-dispatch-id'])||!['epic','feature'].includes(args.profile)||!oid(args['expected-commit'])||!oid(args['expected-tree'])||!advisorPublicPath(args['output-prefix'])||ADVISOR_SOURCE_NAMES.some(n=>!args.sources[n])||new Set(ADVISOR_SOURCE_NAMES.map(n=>args.sources[n].path)).size!==5)throw Error(USAGE);
 return args;
}
export function exportCodexDesignAdvisorArtifacts(root,prefix,result,{resume=false}={}){
 const artifacts=[['initial',Buffer.from(canonicalJson(result.initialContext))],['course-binding',Buffer.from(canonicalJson(result.courseBinding))]];
 if(result.status==='answered')artifacts.push(['receipt',Buffer.from(result.receiptBytes)],['report',Buffer.from(canonicalJson(result.report))],['consultation',Buffer.from(canonicalJson(result.consultation))]);
 else if(result.status==='unavailable-pending-final-approval'&&result.failureEvidence){artifacts.push(['failure',Buffer.from(canonicalJson(result.failureEvidence))]);if(result.receiptBytes)artifacts.push(['receipt',Buffer.from(result.receiptBytes)]);}
 else throw Error('CADB-PUBLIC-RESULT');
 // Hotfix 4: every target is validated before any directory is created or file written. resume (only for a
 // store re-derived no-child result) admits an existing target solely as a physical, byte-identical file.
 const present=path=>{try{lstatSync(path);return true;}catch(e){if(e?.code==='ENOENT')return false;throw e;}};
 const targets=artifacts.map(([name,bytes])=>{const ref=prefix+'.'+name+'.json',path=resolve(root,ref);if(!advisorPublicPath(ref)||relative(root,path).startsWith('..')||(!resume&&existsSync(path)))throw Error('CADB-PUBLIC-TARGET');if(bytes.length>65536)throw Error('CADB-PUBLIC-BOUND');let exists=false;if(resume&&present(path)){const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||realpathSync(path)!==path||!readFileSync(path).equals(bytes))throw Error('CADB-PUBLIC-TARGET');exists=true;}return {ref,path,bytes,exists};});
 // Output directory: created one platform segment at a time (sep, not '/'); each segment keeps the physical check.
 for(const t of targets){let parent=root;for(const p of relative(root,dirname(t.path)).split(sep).filter(Boolean)){parent=join(parent,p);try{mkdirSync(parent);}catch(e){if(e?.code!=='EEXIST')throw e;}const s=lstatSync(parent);if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(parent)!==parent)throw Error('CADB-PUBLIC-TARGET');}}
 const refs={};for(let i=0;i<targets.length;i++){const t=targets[i];if(!t.exists)writeFileSync(t.path,t.bytes,{flag:'wx',mode:0o600});const s=lstatSync(t.path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||realpathSync(t.path)!==t.path||!readFileSync(t.path).equals(t.bytes))throw Error('CADB-PUBLIC-READBACK');refs[artifacts[i][0]]={path:t.ref,sha256:sha(t.bytes)};}return refs;
}
export async function runCodexDesignAdvisorBootstrap(argv=process.argv.slice(2),{newCourseParentId=null,observeInitialCourseDecision,familyPorts=null}={}){
 const args=parseCodexDesignAdvisorArgs(argv),root=realpathSync(args['repo-root']);if(root!==resolve(args['repo-root']))throw Error('CADB-PHYSICAL-ROOT');
 const dispatch={dispatchId:'advisor_'+randomUUID(),queueRevision:0,candidateCommit:args['expected-commit'],candidateTree:args['expected-tree']};
 const observed=await inspectCodexInitialAdvisorMetadata({repoRoot:root,sources:args.sources,familyPorts,invocationId:dispatch.dispatchId,
  expectedCommit:args['expected-commit'],expectedTree:args['expected-tree']});
 if(args.inspect)return {ok:true,status:'metadata-admitted',candidate:observed.candidate,route:observed.route,sourceBlobIds:observed.sourceBlobIds,consentSha256:observed.consentSha256,implementationAuthority:false,childStarted:false,inputSubmitted:false};
 const native=await createNativeCodexDesignAdvisorExecution({repoRoot:root,sources:args.sources,featureId:args['feature-id'],profile:args.profile,reason:'risk-review',dispatch,familyPorts,initialObservation:observed});
 const result=await coordinateInitialDesignAdvisory({repoRoot:root,featureId:args['feature-id'],authoringDispatchId:args['authoring-dispatch-id'],sources:args.sources,reason:'risk-review',profile:args.profile,dispatch,route:native.observation.route,hostExecution:native.execution,newCourseParentId,observeInitialCourseDecision});
 if(!result.ok&&result.status!=='unavailable-pending-final-approval')return {ok:false,status:result.status,code:result.code,courseBinding:result.courseBinding??null,implementationAuthority:false};
 const artifacts=exportCodexDesignAdvisorArtifacts(root,args['output-prefix'],result);
 return {ok:result.ok,status:result.status,...(result.code?{code:result.code}:{}),hostReceipt:result.hostReceipt,courseBinding:result.courseBinding,artifacts,implementationAuthority:false};
}
if(isDirectInvocation(import.meta.url))runCodexDesignAdvisorBootstrap().then(result=>{process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=result.ok?0:2;},error=>{process.stderr.write((error.code??(error.message===USAGE?'CADB-USAGE':'CADB-FAILED'))+'\n');process.exitCode=error.message===USAGE?64:2;});

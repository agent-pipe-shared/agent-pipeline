// SPDX-License-Identifier: SUL-1.0
import {createHash} from 'node:crypto';
import {openSync,closeSync,fstatSync,lstatSync,realpathSync,readFileSync,writeFileSync,fsyncSync,constants} from 'node:fs';
import {resolve,relative,join,dirname,sep} from 'node:path';
import {screenPublicTransferArtifact,readScreenedTransferArtifact} from './bound-artifact-transfer.mjs';

export const GREENFIELD_INPUT_SCHEMA='pipeline.greenfield-public-observations.v1';
export const GREENFIELD_COMPARISON_SCHEMA='pipeline.greenfield-public-comparison.v1';
const MAX_BYTES=65536;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/u;
const id=value=>typeof value==='string'&&ID.test(value);
const SHA=/^[a-f0-9]{64}$/u;
const METRICS=['turns','tools','inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','activeMs','waitMs'];
const handles=new WeakMap();
const builtReports=new WeakMap();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const count=v=>v===null||(Number.isSafeInteger(v)&&v>=0);
const instant=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
function held(code){return Object.freeze({status:'held',code});}
function physical(rootDir,path){
  const root=resolve(rootDir);
  if(realpathSync(root)!==root||!lstatSync(root).isDirectory())throw Error('GPC-ROOT');
  if(typeof path!=='string'||path.length>512||!path.split('/').every(p=>/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(p)&&p!=='.'&&p!=='..'))throw Error('GPC-PATH');
  if(!['docs','evidence','public'].some(prefix=>path===prefix||path.startsWith(prefix+'/')))throw Error('GPC-PUBLIC-SCOPE');
  const full=resolve(root,path),rel=relative(root,full);
  if(!rel||rel.startsWith('..'+sep)||rel==='..'||resolve(root,rel)!==full)throw Error('GPC-PATH');
  let cursor=root;
  for(const part of rel.split(sep)){cursor=join(cursor,part);const st=lstatSync(cursor);if(st.isSymbolicLink()||realpathSync(cursor)!==cursor)throw Error('GPC-PHYSICAL');}
  return {root,full};
}
function same(a,b){return ['dev','ino','mode','nlink','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);}
function readBound(rootDir,path,expectedSha256){
  if(!SHA.test(expectedSha256))throw Error('GPC-DIGEST');
  const {root,full}=physical(rootDir,path),before=lstatSync(full);
  if(!before.isFile()||before.size<1||before.size>MAX_BYTES)throw Error('GPC-BOUND');
  const fd=openSync(full,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
    const opened=fstatSync(fd);if(!same(before,opened))throw Error('GPC-CAS');
    const bytes=readFileSync(fd);if(bytes.length!==before.size||hash(bytes)!==expectedSha256)throw Error('GPC-DIGEST');
    if(!same(opened,fstatSync(fd))||!same(before,lstatSync(full)))throw Error('GPC-CAS');
    return {root,full,bytes,stat:before};
  }finally{closeSync(fd);}
}
function validCase(row){
  if(!exact(row,['caseId','runner','pipeline','rulesetSha256','taskSha256','window','metrics','coverage','result','fidelity']))return false;
  if(!id(row.caseId)||!['claude','codex','antigravity'].includes(row.runner)||!['pipeline','no-pipeline'].includes(row.pipeline)||!SHA.test(row.taskSha256)||!(row.rulesetSha256===null||SHA.test(row.rulesetSha256)))return false;
  if(row.pipeline==='no-pipeline'&&row.rulesetSha256!==null)return false;
  const w=row.window;
  if(!exact(w,['start','end','firstCode','initialBuild','turnStart','turnEnd','toolStart','toolEnd','phase','includesAnalysis','denominator'])||!instant(w.start)||!instant(w.end)||Date.parse(w.end)<=Date.parse(w.start))return false;
  if(!['full','before-code','through-initial-build','phase'].includes(w.phase)||typeof w.includesAnalysis!=='boolean'||!['input-output','input-output-cache'].includes(w.denominator))return false;
  if(![w.turnStart,w.turnEnd,w.toolStart,w.toolEnd].every(count))return false;
  for(const [a,b]of [[w.turnStart,w.turnEnd],[w.toolStart,w.toolEnd]])if((a===null)!==(b===null)||(a!==null&&b<a))return false;
  if(![w.firstCode,w.initialBuild].every(v=>v===null||(instant(v)&&Date.parse(v)>=Date.parse(w.start)&&Date.parse(v)<=Date.parse(w.end))))return false;
  if(w.firstCode!==null&&w.initialBuild!==null&&Date.parse(w.initialBuild)<Date.parse(w.firstCode))return false;
  if(!exact(row.metrics,METRICS)||!Object.values(row.metrics).every(count))return false;
  const wall=Date.parse(w.end)-Date.parse(w.start);
  if([row.metrics.activeMs,row.metrics.waitMs].some(v=>v!==null&&v>wall)||row.metrics.activeMs!==null&&row.metrics.waitMs!==null&&row.metrics.activeMs+row.metrics.waitMs>wall)return false;
  if(!exact(row.coverage,['status','methodId'])||!['complete-reported','partial-reported','unknown'].includes(row.coverage.status)||!(row.coverage.methodId===null||id(row.coverage.methodId)))return false;
  if(!['succeeded-reported','failed-reported','stopped-reported','unknown'].includes(row.result))return false;
  return exact(row.fidelity,['rawSha256','derivativeSha256'])&&[row.fidelity.rawSha256,row.fidelity.derivativeSha256].every(v=>v===null||SHA.test(v));
}
function validate(input){
  if(!exact(input,['schema','comparisonId','cases'])||input.schema!==GREENFIELD_INPUT_SCHEMA||!id(input.comparisonId)||!Array.isArray(input.cases)||input.cases.length<2||input.cases.length>16||!input.cases.every(validCase))throw Error('GPC-SCHEMA');
  if(new Set(input.cases.map(c=>c.caseId)).size!==input.cases.length)throw Error('GPC-DUPLICATE');
}
function screened(bytes,sha){
  const screen=screenPublicTransferArtifact(bytes);
  if(screen?.status!=='screened')throw Error('GPC-PUBLIC-SCREEN');
  const copy=readScreenedTransferArtifact(screen.handle,sha);
  if(!Buffer.isBuffer(copy)||!copy.equals(bytes))throw Error('GPC-SCREEN-CUSTODY');
  return screen.handle;
}
/** Reads only a bounded structured public observation, not an original transcript/report. */
export function readGreenfieldPublicComparisonInput({rootDir,inputPath,inputSha256}={}){
  try{
    const source=readBound(rootDir,inputPath,inputSha256);screened(source.bytes,inputSha256);
    const input=JSON.parse(source.bytes.toString('utf8'));validate(input);
    // Canonical-only JSON also excludes duplicate-key and parser normalization ambiguities.
    if(source.bytes.toString('utf8')!==canonical(input)+'\n')return held('GPC-CANONICAL');
    const handle=Object.freeze({schema:GREENFIELD_INPUT_SCHEMA,inputSha256});
    handles.set(handle,{source,inputPath,inputSha256,input});
    return Object.freeze({status:'read',handle});
  }catch(error){return held(/^GPC-[A-Z-]+$/u.test(error?.message??'')?error.message:'GPC-INPUT-UNAVAILABLE');}
}
function summarize(row){
  const w=row.window,m=row.metrics,cache=w.denominator==='input-output-cache';
  const required=cache?['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens']:['inputTokens','outputTokens'];
  const sum=required.every(k=>m[k]!==null)?required.reduce((n,k)=>n+m[k],0):null;
  const denominator=Number.isSafeInteger(sum)&&sum>0?sum:null;
  return {...row,intervals:{wallMs:Date.parse(w.end)-Date.parse(w.start),beforeCodeMs:w.firstCode===null?null:Date.parse(w.firstCode)-Date.parse(w.start),throughInitialBuildMs:w.initialBuild===null?null:Date.parse(w.initialBuild)-Date.parse(w.start)},categoryShares:denominator===null?{status:'unknown',denominator:null,shares:null}:{status:'arithmetic-from-reported-counters',denominator,shares:Object.fromEntries(required.map(k=>[k,m[k]/denominator]))},metricEvidence:'reported-unverified',fidelityEvidence:'digest-claims-unverified-original-not-read'};
}
/** Only source-minted read handles authorize reconstruction; caller certificate booleans do not. */
export function buildGreenfieldPublicComparison({inputHandle}={}){
  const context=handles.get(inputHandle);if(!context)return held('GPC-HANDLE');
  try{
    const before=readBound(context.source.root,context.inputPath,context.inputSha256);
    if(!before.bytes.equals(context.source.bytes))throw Error('GPC-CAS');
    const cases=context.input.cases.slice().sort((a,b)=>a.caseId.localeCompare(b.caseId)).map(summarize),pairs=[];
    for(let i=0;i<cases.length;i++)for(let j=i+1;j<cases.length;j++){
      const a=cases[i],b=cases[j],reasons=[];
      for(const k of ['taskSha256'])if(a[k]!==b[k])reasons.push('different-task');
      for(const k of ['start','end','turnStart','turnEnd','toolStart','toolEnd','phase','includesAnalysis','denominator'])if(a.window[k]!==b.window[k])reasons.push('different-window-'+k);
      if(['turnStart','turnEnd','toolStart','toolEnd'].some(k=>a.window[k]===null||b.window[k]===null))reasons.push('unknown-boundaries');
      if(a.coverage.status!=='complete-reported'||b.coverage.status!=='complete-reported')reasons.push('incomplete-coverage');
      if(a.coverage.methodId===null||a.coverage.methodId!==b.coverage.methodId)reasons.push('different-or-unknown-method');
      pairs.push({caseIds:[a.caseId,b.caseId],sameWindow:reasons.length===0?'declared-matching':'unresolved',reasons,runnerDifference:a.runner!==b.runner,pipelineDifference:a.pipeline!==b.pipeline,rulesetDifference:a.rulesetSha256!==b.rulesetSha256,causalInference:'unsupported'});
    }
    const report={schema:GREENFIELD_COMPARISON_SCHEMA,comparisonId:context.input.comparisonId,inputSha256:context.inputSha256,cases,pairs,assurance:{screening:'deterministic-public-projection-screen-only',originalCustody:'unavailable',numericReproduction:'timestamp-and-counter-arithmetic-only',cost:'unknown-no-billing-source',quality:'unknown-no-controlled-product-proof',native:'unavailable'},conclusions:'descriptive-only-no-ROI-or-security-or-regression-guarantee'};
    const bytes=Buffer.from(canonical(report)+'\n'),reportSha256=hash(bytes);
    const screenHandle=screened(bytes,reportSha256);
    const built=Object.freeze({status:'built',reportSha256,byteLength:bytes.length});
    builtReports.set(built,{screenHandle,context});
    return built;
  }catch(error){return held(/^GPC-[A-Z-]+$/u.test(error?.message??'')?error.message:'GPC-RECONSTRUCTION-UNAVAILABLE');}
}
/** Exclusive output preserves an existing derivative and returns only digest/size, never source paths. */
export function publishGreenfieldPublicComparison({rootDir,outputPath,built}={}){
  try{
    const retained=builtReports.get(built);
    if(!retained||built?.status!=='built'||!SHA.test(built.reportSha256))throw Error('GPC-HANDLE');
    const bytes=readScreenedTransferArtifact(retained.screenHandle,built.reportSha256);
    if(!Buffer.isBuffer(bytes)||bytes.length!==built.byteLength||bytes.length>MAX_BYTES)throw Error('GPC-SCREEN-CUSTODY');
    const currentInput=readBound(retained.context.source.root,retained.context.inputPath,retained.context.inputSha256);
    if(!currentInput.bytes.equals(retained.context.source.bytes))throw Error('GPC-CAS');
    // Parent must already exist: observation never provisions an arbitrary publication tree.
    const parent=dirname(outputPath),leaf=outputPath.slice(parent.length+1);
    const probe=physical(rootDir,parent);if(!lstatSync(probe.full).isDirectory()||!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u.test(leaf))throw Error('GPC-PATH');
    const fd=openSync(join(probe.full,leaf),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o644);
    try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
    const readback=readBound(rootDir,outputPath,built.reportSha256);
    if(!readback.bytes.equals(bytes))throw Error('GPC-CAS');
    return Object.freeze({status:'published',reportSha256:built.reportSha256,byteLength:bytes.length});
  }catch(error){return held(/^GPC-[A-Z-]+$/u.test(error?.message??'')?error.message:'GPC-PUBLICATION-UNAVAILABLE');}
}

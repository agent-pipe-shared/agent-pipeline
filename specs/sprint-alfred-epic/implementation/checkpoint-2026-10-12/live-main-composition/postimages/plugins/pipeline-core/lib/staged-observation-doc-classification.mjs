// SPDX-License-Identifier: SUL-1.0
// Fixed read-only Git-index consumer of the SAME documentation classifier used by Verify.
import {spawnSync} from 'node:child_process';
import {checkObservationDocumentation} from './observation-doc-classification.mjs';
const POLICY='governance/observation-doc-governance.json';
const MAX_INDEX_BYTES=8388608, MAX_POLICY_BYTES=1048576, MAX_ENTRIES=65536;
const decode=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
function query(root,args,maxBuffer=MAX_INDEX_BYTES){
  const r=spawnSync('git',args,{cwd:root,timeout:15000,maxBuffer,encoding:null,shell:false});
  if(r.error||r.signal!=null||r.status!==0||!Buffer.isBuffer(r.stdout)||!Buffer.isBuffer(r.stderr)||r.stdout.length>maxBuffer)return null;
  return r.stdout;
}
function refused(code,applicable=true){return {applicable,ok:false,codes:[code]};}
function entries(raw){
  if(raw.length===0)return [];
  if(raw.at(-1)!==0)throw Error('index framing');
  const rows=decode(raw).slice(0,-1).split('\0');
  if(rows.length>MAX_ENTRIES)throw Error('index count');
  const names=new Set();
  return rows.map(row=>{
    const tab=row.indexOf('\t');
    const match=/^([0-7]{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([0-3])$/.exec(row.slice(0,tab));
    const path=row.slice(tab+1);
    if(tab<0||!match||!path||path.startsWith('/')||path.split('/').some(part=>!part||part==='.'||part==='..')||names.has(path))throw Error('index shape');
    names.add(path);
    return {mode:match[1],oid:match[2],stage:match[3],path};
  });
}
export function checkStagedObservationDocumentation(root){
  // No worktree policy/document content is consulted. The first and last index
  // snapshots must agree, including all actual blob IDs, modes and stages.
  const first=query(root,['ls-files','--stage','-z']);
  if(first===null)return refused('OG-INDEX-UNAVAILABLE');
  let rows;try{rows=entries(first);}catch{return refused('OG-INDEX-UNAVAILABLE');}
  const policyRow=rows.find(row=>row.path===POLICY);
  const head=spawnSync('git',['rev-parse','--verify','-q','HEAD'],{cwd:root,timeout:15000,maxBuffer:4096,encoding:null,shell:false});
  if(head.error||head.signal!=null||![0,1].includes(head.status))return refused('OG-INDEX-UNAVAILABLE');
  let historicalPolicy=false;
  if(head.status===0){
    const tree=query(root,['ls-tree','-z','HEAD','--',POLICY],4096);
    if(tree===null)return refused('OG-INDEX-UNAVAILABLE');
    historicalPolicy=tree.length>0;
  }
  if(!policyRow&&!historicalPolicy){
    const end=query(root,['ls-files','--stage','-z']);
    return end!==null&&first.equals(end)?{applicable:false,ok:true,codes:[]}:refused('OG-INDEX-DRIFT',false);
  }
  if(!policyRow)return refused('OG-POLICY-UNREADABLE');
  const relevant=rows.filter(row=>row.path===POLICY||row.path.startsWith('docs/'));
  if(relevant.some(row=>row.stage!=='0'))return refused('OG-INDEX-UNMERGED');
  if(relevant.some(row=>!['100644','100755'].includes(row.mode)))return refused('OG-DOC-NONREGULAR');
  const size=query(root,['cat-file','-s',policyRow.oid],4096);
  if(size===null)return refused('OG-POLICY-UNREADABLE');
  let length;try{const text=decode(size);if(!/^(?:0|[1-9][0-9]*)\n$/.test(text))throw Error('size');length=Number(text);}catch{return refused('OG-POLICY-UNREADABLE');}
  if(!Number.isSafeInteger(length)||length>MAX_POLICY_BYTES)return refused('OG-POLICY-UNREADABLE');
  const bytes=query(root,['cat-file','blob',policyRow.oid],MAX_POLICY_BYTES+1);
  if(bytes===null||bytes.length!==length)return refused('OG-POLICY-UNREADABLE');
  let policy;try{policy=JSON.parse(decode(bytes));}catch{return refused('OG-POLICY-UNREADABLE');}
  const result=checkObservationDocumentation(policy,rows.filter(row=>row.path.startsWith('docs/')).map(row=>row.path).sort());
  const last=query(root,['ls-files','--stage','-z']);
  if(last===null||!first.equals(last))return refused('OG-INDEX-DRIFT');
  // Codes alone are sufficient for the commit refusal; neither blob contents nor
  // arbitrary Git stderr, repository paths or local identifiers cross this seam.
  const codes=[...new Set(result.findings.map(f=>f.split(' ')[0]))].sort();
  return {applicable:true,ok:result.ok,codes};
}

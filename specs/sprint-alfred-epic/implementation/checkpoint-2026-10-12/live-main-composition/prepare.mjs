// Administrative public preparation only. Never stage, sign, commit or push.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const own=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(own,'../../../../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const rel=p=>path.relative(repo,p).split(path.sep).join('/');
const originalRoots=['plugins/pipeline-core','harness','templates'];
const [action,expectedHead]=process.argv.slice(2);
assert(['inventory','freeze','strict-check','request'].includes(action));
assert(!['GIT_INDEX_FILE','GIT_DIR','GIT_WORK_TREE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES'].some(k=>process.env[k]),'foreign Git environment');
const git=(args,cwd=repo,input)=>{
 const p=spawnSync('git',args,{cwd,input,encoding:null,maxBuffer:64*1024*1024,timeout:30000});
 const inside=path.relative(repo,cwd);
 const logicalCwd=inside==='..'||inside.startsWith('..'+path.sep)?'owned-external-base-source':rel(cwd)||'.';
 return {args,cwd:logicalCwd,status:p.status,signal:p.signal,error:p.error?{code:p.error.code,message:'Git subprocess could not complete'}:null,stdout:p.stdout||Buffer.alloc(0),stderr:p.stderr||Buffer.alloc(0)};
};
const mustGit=args=>{const r=git(args);assert.equal(r.status,0,`git ${args[0]} refused/failed`);return r.stdout;};
const head=()=>mustGit(['rev-parse','HEAD']).toString('utf8').trim();
const excluded=p=>{
 if(p===rel(own)||p.startsWith(rel(own)+'/'))return 'administrative helper/output; ordinary checkpoint ownership';
 if(p.startsWith('specs/sprint-alfred-epic/implementation/checkpoint-2026-10-12/')||p.startsWith('specs/sprint-alfred-epic/evidence/checkpoint-2026-10-12/'))return 'portable documentary checkpoint, not remaining production composition';
 if(p.split('/').some(s=>['.git','.claude','.codex','.agents','.aws','.ssh','scratch','private','private-state','privateState','sessions','transcripts','keys'].includes(s)))return 'private/runtime/scratch metadata path excluded';
 if(/(?:^|\/)(?:id_rsa|id_ed25519|\.env)(?:\.|$)|\.(?:pem|key|p12|pfx|jks)$/i.test(p))return 'potential credential/key store member excluded pending explicit classification';
 if(['project/pipeline-state.json','project/pipeline-state.compiled.json'].includes(p))return 'lifecycle payload excluded';
 return null;
};
const safe=p=>typeof p==='string'&&!p.startsWith('/')&&!/[\u0000-\u001f\\]/.test(p)&&!p.split('/').some(s=>s===''||s==='.'||s==='..')&&!excluded(p);
const currentPaths=()=>{
 const rawDirty=mustGit(['diff','HEAD','--name-only','-z']).toString('utf8').split('\0').filter(Boolean);
 const rawUntracked=mustGit(['ls-files','--others','--exclude-standard','-z']).toString('utf8').split('\0').filter(Boolean);
 const staged=mustGit(['diff','--cached','--name-only','-z']).toString('utf8').split('\0').filter(Boolean);
 const stagedSet=new Set(staged);
 const decisions=[...new Set([...rawDirty,...rawUntracked])].sort().map(p=>({path:p,excludeReason:stagedSet.has(p)?'already staged ordinary documentary checkpoint':excluded(p)}));
 const all=decisions.filter(r=>!r.excludeReason).map(r=>r.path);
 const remaining=new Set(all);
 return {dirty:rawDirty.filter(p=>remaining.has(p)),untracked:rawUntracked.filter(p=>remaining.has(p)),all,decisions,staged};
};
const physical=p=>{const s=fs.lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'unsafe physical Source member');assert.equal(fs.realpathSync(p),path.resolve(p),'Source alias');return {mode:s.mode&0o777,nlink:s.nlink,bytes:s.size};};
const write=(name,data)=>{const p=path.join(own,name);assert(!fs.existsSync(p),'write-once output exists');fs.writeFileSync(p,typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o644});return {path:rel(p),sha256:sha(fs.readFileSync(p))};};
const read=name=>JSON.parse(fs.readFileSync(path.join(own,name),'utf8'));
const saveMember=(prefix,p,bytes,mode)=>{const out=path.join(own,prefix,p);assert(path.relative(own,out).startsWith(prefix+path.sep));fs.mkdirSync(path.dirname(out),{recursive:true});assert(!fs.existsSync(out));fs.writeFileSync(out,bytes,{flag:'wx',mode});fs.chmodSync(out,mode);return out;};

if(action==='inventory'){
 const p=currentPaths();assert(p.all.every(safe),'unsafe public remaining path');
 const original=read('proposed-allowlist.json');
 const record={schema:'alfred.live-main-explicit-source-allowlist.v2',status:'PROPOSED WHOLE REMAINING PUBLIC MAIN PATH SCOPE; NOT FINAL COMPOSITION',headAtProposal:head(),originalThreeRootProposal:{path:rel(path.join(own,'proposed-allowlist.json')),sha256:sha(fs.readFileSync(path.join(own,'proposed-allowlist.json'))),count:original.paths.length,roots:originalRoots},paths:p.all,trackedDirtyPaths:p.dirty,untrackedPaths:p.untracked,counts:{total:p.all.length,trackedDirty:p.dirty.length,untracked:p.untracked.length,stagedOrdinaryExcluded:p.staged.length},exactExcludedDecisions:p.decisions.filter(r=>r.excludeReason),pathPolicy:'All actual public dirty/untracked gitpaths; exact explicit allowlist with per-path exclusions. No Source-root-only prefix assumption.',fixturePolicy:original.fixturePolicy,sourceBytesRead:false,strictCheckRun:false};
 console.log(JSON.stringify(write('proposed-allowlist-v2.json',record)));process.exit(0);
}
assert(/^[a-f0-9]{40,64}$/.test(expectedHead||''),'explicit Root-final base HEAD required');
assert.equal(head(),expectedHead,'HEAD changed; no final freeze');

if(action==='freeze'){
 const allow=read('proposed-allowlist-v2.json'),p=currentPaths();
 assert(p.all.every(x=>allow.paths.includes(x)&&safe(x)),'new Source path requires explicit scope amendment');
 assert(p.all.length>0,'no remaining Source delta');
 const rows=[],patches=[],secretFindings=[];
 for(const item of p.all){
  const actual=path.join(repo,item),meta=physical(actual),bytes=fs.readFileSync(actual);
  assert([0o644,0o755].includes(meta.mode),'unsupported Source mode');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{32,}/.test(bytes.toString('utf8'))){secretFindings.push({path:item,category:'credential body or public fixture body needing explicit static classification',rawValuePrinted:false});continue;}
  const entries=mustGit(['ls-tree',expectedHead,'--',item]).toString('utf8').trim();
  const match=/^(100644|100755) blob ([a-f0-9]{40,64})\t(.+)$/.exec(entries);
  assert(entries===''||match,'base is not regular Source blob');
  let preimage=null;
  if(match){const before=mustGit(['cat-file','blob',match[2]]);preimage={sha256:sha(before),mode:match[1]==='100755'?0o755:0o644,bytes:before.length};saveMember('base-source',item,before,preimage.mode);}
  const post=saveMember('postimages',item,bytes,meta.mode);
  rows.push({path:item,source:item,postimage:rel(post),postSha256:sha(bytes),postMode:meta.mode,postBytes:bytes.length,postPhysical:meta,preimage});
  if(!match){const r=git(['diff','--no-index','--binary','--no-ext-diff','--no-renames','--','/dev/null',item]);assert([0,1].includes(r.status),'new Source diff failed');patches.push(r.stdout);}
 }
 if(secretFindings.length){write('credential-classification-hold.json',{status:'HELD',findings:secretFindings,rawValuesPrinted:false});throw Error('credential-shaped Source body requires exact static classification; no patch/request emitted');}
 const tracked=rows.filter(r=>r.preimage).map(r=>r.path);
 const trackedPatch=tracked.length?mustGit(['diff','--binary','--no-ext-diff','--no-renames',expectedHead,'--',...tracked]):Buffer.alloc(0);
 const patch=Buffer.concat([trackedPatch,...patches]);
 const targets=patch.toString('utf8').split('\n').filter(l=>l.startsWith('+++ b/')).map(l=>l.slice(6)).sort();
 assert.deepEqual(targets,rows.map(r=>r.path).sort(),'raw patch target set mismatch');
 assert.equal(head(),expectedHead,'HEAD drift during snapshot');
 for(const r of rows)assert.equal(sha(fs.readFileSync(path.join(repo,r.path))),r.postSha256,'Source drift during snapshot');
 const patchRef=write('cumulative.patch',patch);
 const manifest={schema:'alfred.live-main-public-composition.v1',status:'PREPARED; STRICT CHECK NOT RUN',baseCommit:expectedHead,allowlist:rel(path.join(own,'proposed-allowlist-v2.json')),rows,pathCount:rows.length,patch:patchRef,patchSha256:patchRef.sha256,check:{status:'NOT RUN',exitCode:null},sourceApplied:false,staged:false,signed:false,committed:false,pushed:false};
 console.log(JSON.stringify(write('manifest.json',manifest)));process.exit(0);
}

const m=read('manifest.json');assert.equal(m.baseCommit,expectedHead);
const patch=fs.readFileSync(path.join(repo,m.patch.path));assert.equal(sha(patch),m.patchSha256);
for(const r of m.rows){assert(safe(r.path));assert.equal(sha(fs.readFileSync(path.join(repo,r.postimage))),r.postSha256);assert.equal(sha(fs.readFileSync(path.join(repo,r.path))),r.postSha256);assert.equal(physical(path.join(repo,r.path)).mode,r.postMode);}
if(action==='strict-check'){
 // Root-reviewed external fixture is essential: git apply inside Main can
 // ignore paths outside the cwd prefix and falsely return zero. Never gitinit.
 const base=fs.mkdtempSync('/var/tmp/alfred-main-checkpoint-');
 assert(fs.lstatSync(base).isDirectory()&&!fs.lstatSync(base).isSymbolicLink());
 assert.equal(fs.realpathSync(base),base,'external fixture alias');
 for(let ancestor=base;;ancestor=path.dirname(ancestor)){
  assert(!fs.existsSync(path.join(ancestor,'.git')),'external fixture has Git ancestor');
  if(path.dirname(ancestor)===ancestor)break;
 }
 const repoProbe=git(['rev-parse','--is-inside-work-tree'],base);
 assert.equal(repoProbe.status,128,'external fixture was not proved outside Git');
 assert.equal(repoProbe.stdout.toString('utf8').trim(),'','unexpected repository probe output');
 const baseRows=[];
 for(const row of m.rows){
  const target=path.join(base,row.path);assert(!path.relative(base,target).startsWith('..'));
  if(row.preimage){
   const original=path.join(own,'base-source',row.path),bytes=fs.readFileSync(original);
   assert.equal(sha(bytes),row.preimage.sha256);assert.equal(physical(original).mode,row.preimage.mode);
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx',mode:row.preimage.mode});fs.chmodSync(target,row.preimage.mode);
   assert.equal(sha(fs.readFileSync(target)),row.preimage.sha256);assert.equal(physical(target).mode,row.preimage.mode);
   baseRows.push({path:row.path,status:'base-byte-mode-CAS-matched',sha256:row.preimage.sha256,mode:row.preimage.mode});
  }else{assert(!fs.existsSync(target),'new Source preimage not absent');baseRows.push({path:row.path,status:'ABSENT'});}
 }
 const numstat=git(['apply','--numstat','-'],base,patch);
 const parsedTargets=numstat.status===0?numstat.stdout.toString('utf8').trimEnd().split('\n').filter(Boolean).map(line=>line.split('\t').slice(2).join('\t')).sort():[];
 const targetSetMatched=JSON.stringify(parsedTargets)===JSON.stringify(m.rows.map(row=>row.path).sort());
 const r=numstat.status===0&&targetSetMatched?git(['apply','--check','--whitespace=error','-'],base,patch):numstat;
 const actualPassed=numstat.status===0&&targetSetMatched&&r.status===0;
 const publicText=buffer=>buffer.toString('utf8').split(base).join('<owned-external-base-source>');
 const receipt={schema:'alfred.live-main-strict-check.v2',status:actualPassed?'ACTUAL GIT STRICT CHECK PASSED':'HELD; ACTUAL GIT CHECK FAILED/REFUSED',baseCommit:expectedHead,patchSha256:m.patchSha256,argv:r.args,cwd:r.cwd,exitCode:r.status,signal:r.signal,error:r.error,stdout:publicText(r.stdout),stderr:publicText(r.stderr),fixture:{logicalPath:'owned-external-base-source',gitInitialized:false,ancestorGitPresent:false,repositoryProbeExit:repoProbe.status,repositoryProbeStdout:repoProbe.stdout.toString('utf8'),baseRows,privateHostPathPublished:false},actualGitParsedTargetCount:parsedTargets.length,expectedTargetCount:m.rows.length,fullTargetSetMatched:targetSetMatched,numstatExitCode:numstat.status,patchApplied:false,indexWritten:false,sourceModified:false,sourcePostimageReadbacks:m.rows.length};
 // A successful check does not assert application/resulting Git-tree readback.
 assert.equal(head(),expectedHead,'HEAD drift after check');
 for(const row of m.rows)assert.equal(sha(fs.readFileSync(path.join(repo,row.path))),row.postSha256,'Source drift after check');
 console.log(JSON.stringify(write('strict-check-receipt.json',receipt)));process.exit(actualPassed?0:1);
}
const check=read('strict-check-receipt.json');assert.equal(check.exitCode,0,'no genuine strict-check success');assert.equal(check.status,'ACTUAL GIT STRICT CHECK PASSED');assert.equal(check.schema,'alfred.live-main-strict-check.v2');assert.equal(check.fullTargetSetMatched,true);assert.equal(check.actualGitParsedTargetCount,m.rows.length);assert.equal(check.fixture.repositoryProbeExit,128);assert.equal(check.fixture.ancestorGitPresent,false);assert.equal(check.baseCommit,expectedHead);assert.equal(check.patchSha256,m.patchSha256);
const {qualityPackageIntentSha256,describeSignedQualityPackageIntent}=await import('../../../../../plugins/pipeline-core/lib/signed-quality-package.mjs');
const record={schema:'pipeline.signed-quality-package.v1',baseCommit:expectedHead,unifiedDiff:patch.toString('utf8'),expectedDigests:Object.fromEntries(m.rows.map(r=>[r.path,r.postSha256])),intentSha256:''};
record.intentSha256=qualityPackageIntentSha256(record);
const disclosure=describeSignedQualityPackageIntent(record,record.intentSha256);assert(disclosure?.resolved,'actual package validator refused');
const out=write('quality-request.json',record);
write('quality-request-disclosure.json',{schema:'alfred.live-main-quality-request-disclosure.v1',request:out,intentSha256:record.intentSha256,baseCommit:expectedHead,paths:m.rows.length,disclosure,strictCheckReceipt:rel(path.join(own,'strict-check-receipt.json')),signingReady:false,signed:false,applied:false,staged:false,committed:false,pushed:false,note:'Public request preparation is no approval or release readiness. Genuine Root/operator signing and protected commit remain separate.'});
console.log(JSON.stringify(out));

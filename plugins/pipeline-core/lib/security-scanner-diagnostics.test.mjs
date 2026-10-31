// SPDX-License-Identifier: SUL-1.0
// Prepared G13 test proposal; per-case canonical completion, no envelope.
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,lstatSync,chmodSync,symlinkSync,linkSync,renameSync,unlinkSync,rmSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { runSecurityScan } from "../scripts/security-scan.mjs";
import { createServer } from "node:net";
import { run } from "../scripts/security-adapters/semgrep.mjs";
import { observeSemgrepChild,observeLocalRules,validateScannerDiagnostics,buildScannerDiagnostics,parseScannerDiagnostics } from "./security-scanner-diagnostics.mjs";
import { publishScannerDiagnostics } from "./security-scanner-diagnostics-publication.mjs";
const completionCases=[];
function test(name,run,options={}){completionCases.push({id:"G13D"+String(completionCases.length+1).padStart(3,"0"),name,run:options.skip?async context=>{context.skip(options.skip);}:run});}
const symlinkSkip=process.platform==="win32"&&"host limitation: creating symlinks needs a privilege this win32 account lacks (EPERM)";
const socketSkip=process.platform==="win32"&&"host limitation: Unix-domain socket listen on a filesystem path is not permitted on win32 (EACCES)";
const publisherSkip=process.platform==="win32"&&"host limitation: the scanner-diagnostics publisher is Linux-only and reports unavailable on win32";
const hash='a'.repeat(64);
const evidence={payloadSha256:hash,candidate:{commit:'b'.repeat(40),tree:'c'.repeat(40),inputSha256:'d'.repeat(64)}};
const child=(result={status:0,stdout:'{"version":"1.170.0","results":[],"errors":[]}',stderr:''})=>observeSemgrepChild(result,10.4,60000);
const record=(c=child())=>buildScannerDiagnostics(evidence,[{tool:'semgrep',executableSha256:hash,rules:observeLocalRules('/ignored','/ignored/rules'),child:c}]);
const invoke=async result=>{
  const seen=[];
  const value=await run({rootDir:'/tmp',config:{binaryPath:'/synthetic-semgrep',rulesDir:'/tmp/rules'},timeoutMs:4321,env:{SEMGREP_ENABLE_VERSION_CHECK:'1'},spawnFn:(...args)=>{seen.push(args);if(result instanceof Error)throw result;return result;}});
  return {value,seen};
};

test('one existing child call preserves clean verdict, argv/deadline and fixed offline env',async()=>{
  const {value,seen}=await invoke({status:0,stdout:'{"version":"1.170.0","results":[],"errors":[]}',stderr:''});
  assert.equal(value.status,'PASS');assert.equal(value.classification,'success');assert.deepEqual(value.findings,[]);
  assert.equal(seen.length,1);assert.equal(seen[0][0],'/synthetic-semgrep');
  assert.deepEqual(seen[0][1],['scan','--json','--timeout','45','--timeout-threshold','0','--config','/tmp/rules','/tmp']);
  assert.equal(seen[0][2].timeout,4321);assert.equal(seen[0][2].shell,false);assert.equal(seen[0][2].cwd,'/tmp');
  assert.equal(seen[0][2].env.SEMGREP_ENABLE_VERSION_CHECK,'0');assert.equal(seen[0][2].env.SEMGREP_SEND_METRICS,'off');
  assert.equal(value.diagnostics.version.value,'1.170.0');assert.equal(value.diagnostics.timeoutMs,4321);
});

test('clean JSON preceding ETIMEDOUT remains ERROR with original raw null and useful structural facts',async()=>{
  const {value,seen}=await invoke({status:null,error:{code:'ETIMEDOUT',message:'SECRET'},signal:'SIGTERM',stdout:'{"version":"1.170.0","results":[],"errors":[]}',stderr:'SECRET /private/root'});
  assert.equal(seen.length,1);assert.equal(value.status,'ERROR');assert.equal(value.classification,'scanner_error');assert.equal(value.raw,null);
  assert.equal(value.diagnostics.errorCode,'ETIMEDOUT');assert.equal(value.diagnostics.signal,'SIGTERM');assert.equal(value.diagnostics.output.resultsCount,0);
  assert.equal(value.diagnostics.output.interpretation,'complete-json');assert.equal(JSON.stringify(record(value.diagnostics)).includes('SECRET'),false);
});

test('throw EPERM retains execution-environment ERROR; unknown code/signal never transport text',async()=>{
  const error=Object.assign(new Error('secret arbitrary path'),{code:'EPERM'});
  const {value,seen}=await invoke(error);
  assert.equal(seen.length,1);assert.equal(value.status,'ERROR');assert.equal(value.classification,'execution_environment');assert.equal(value.diagnostics.errorCode,'EPERM');
  const c=child({error:{code:'TOKEN',message:'SECRET'},signal:'SECRET',stdout:'',stderr:'SECRET'});
  assert.equal(c.errorCode,'OTHER');assert.equal(c.signal,'OTHER');assert.equal(JSON.stringify(c).includes('SECRET'),false);
});

test('nonzero, malformed and tool error payload preserve their original ERROR classifications',async()=>{
  for(const response of [{status:7,stdout:'{}',stderr:'secret'},{status:0,stdout:'broken secret',stderr:''},{status:0,stdout:'{"results":[],"errors":[{"message":"secret"}]}',stderr:''}]) {
    const {value,seen}=await invoke(response);assert.equal(seen.length,1);assert.equal(value.status,'ERROR');assert.equal(value.classification,'scanner_error');
    assert.equal(JSON.stringify(record(value.diagnostics)).includes('secret'),false);
  }
});

test('untrusted version suffix and over-budget JSON are unknown rather than persisted or re-probed',()=>{
  for(const version of ['1.2.3-TOKEN','/home/person','1234567.2.3']) {
    const c=child({status:0,stdout:JSON.stringify({version,results:[]}),stderr:''});assert.deepEqual(c.version,{value:null,source:'unknown-or-withheld'});
    assert.equal(JSON.stringify(c).includes(version),false);
  }
  const c=child({status:0,stdout:JSON.stringify({version:'1.2.3',payload:'x'.repeat(1048576),results:[]}),stderr:''});
  assert.equal(c.output.interpretation,'over-diagnostic-budget');assert.equal(c.version.value,null);assert.equal(c.output.resultsCount,null);
});

test('bound envelope keeps exact evidence/candidate; closed validator rejects injection, duplicate records and coercion',()=>{
  const r=record();assert.equal(validateScannerDiagnostics(r),true);assert.deepEqual(r.candidate,evidence.candidate);assert.equal(r.evidencePayloadSha256,hash);
  for(const mutate of [x=>x.raw='SECRET',x=>x.scanners[0].child.path='/private',x=>x.scanners.push(x.scanners[0]),x=>x.scanners[0].child.version.value='1.2.3-token',x=>x.candidate.inputSha256='wrong',x=>x.evidencePayloadSha256={toString:()=>hash},x=>x.scanners[0].child.elapsedMs=Infinity]) {
    const x=structuredClone(r);mutate(x);assert.equal(validateScannerDiagnostics(x),false);
  }
  const x=structuredClone(r);Object.defineProperty(x,'toJSON',{value:()=>({SECRET:'token'})});assert.equal(validateScannerDiagnostics(x),false);
  const y=structuredClone(r);Object.defineProperty(y.candidate,'commit',{get(){throw Error('must not call getter')}});assert.equal(validateScannerDiagnostics(y),false);
});

test('absent child is explicit and never confuses missing capability or gate authority',()=>{
  const r=record({observation:'not-observed'});assert.equal(validateScannerDiagnostics(r),true);
  const empty=buildScannerDiagnostics(evidence,[]);assert.deepEqual(empty.scanners,[]);assert.equal(empty.authority,'diagnostic-only');
  assert.equal(evidence.payloadSha256,hash);
  assert.throws(()=>buildScannerDiagnostics({...evidence,payloadSha256:'bad'},[]),/diagnostic-record-invalid/);
});

test('unsupported rules mechanics never follow alias/special files or manufacture digests',()=>{
  const root=mkdtempSync(join(tmpdir(),'prepared-g13-rules-'));
  try {
    const privateFile=join(root,'private');writeFileSync(privateFile,'SECRET');symlinkSync(privateFile,join(root,'alias'));
    for(const path of [privateFile,join(root,'alias'),'/dev/zero','/missing',root]) {
      assert.deepEqual(observeLocalRules(root,path),{mode:'local',sha256:null,reason:'observation-unavailable',unchanged:null});
    }
    assert.deepEqual(observeLocalRules(root,null),{mode:'auto',sha256:null,reason:'remote-config-not-observed',unchanged:null});assert.equal(readFileSync(privateFile,'utf8'),'SECRET');
  } finally {rmSync(root,{recursive:true,force:true});}
},{skip:symlinkSkip});

const digest='a'.repeat(64);
const pubEvidence=(payloadSha256=digest)=>({payloadSha256,candidate:{commit:'b'.repeat(40),tree:'c'.repeat(40),inputSha256:'d'.repeat(64)}});
const pubRecord=(d=digest)=>buildScannerDiagnostics({payloadSha256:d,candidate:{commit:'b'.repeat(40),tree:'c'.repeat(40),inputSha256:'d'.repeat(64)}},[{tool:'semgrep',executableSha256:'e'.repeat(64),rules:observeLocalRules('/unknown','/unknown/rules'),child:observeSemgrepChild({status:0,stdout:'{"version":"1.170.0","results":[],"errors":[]}',stderr:''},10,60000)}]);
const target=root=>join(root,'evidence/security-latest.diagnostics.json');
const pending=root=>join(root,'evidence/.security-latest.diagnostics.pending');
const fixture=()=>{const root=mkdtempSync(join(tmpdir(),'g13-publish-'));mkdirSync(join(root,'evidence'),{mode:0o700});return root;};
const close=root=>rmSync(root,{recursive:true,force:true});

test('supported Linux genuinely publishes bounded owned latest data and atomically replaces a valid predecessor',()=>{
 const root=fixture();try{
  const first=publishScannerDiagnostics(root,pubRecord());assert.equal(first.status,'published');assert.ok(first.bytes<=16384);
  const bytes=readFileSync(target(root));assert.equal(parseScannerDiagnostics(bytes,pubEvidence()).ok,true);
  assert.equal(lstatSync(target(root)).mode&0o777,0o600);assert.equal(lstatSync(target(root)).nlink,1);assert.equal(lstatSync(target(root)).uid,process.getuid());
  const next='f'.repeat(64);assert.equal(publishScannerDiagnostics(root,pubRecord(next)).status,'published');
  assert.equal(parseScannerDiagnostics(readFileSync(target(root)),pubEvidence(next)).ok,true);assert.equal(parseScannerDiagnostics(bytes,pubEvidence(next)).code,'diagnostic-binding-stale');
  assert.deepEqual(readdirSync(join(root,'evidence')),['security-latest.diagnostics.json']);
 }finally{close(root);}
},{skip:publisherSkip});

test('foreign existing regular bytes survive rejected publication',()=>{
 const root=fixture();try{writeFileSync(target(root),'UNRELATED',{mode:0o600});assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'unavailable');assert.equal(readFileSync(target(root),'utf8'),'UNRELATED');assert.equal(readdirSync(join(root,'evidence')).length,1);}finally{close(root);}
});

test('terminal symlink and hardlink are not followed/replaced and unrelated referent survives',()=>{
 for(const kind of ['symlink','hardlink']){const root=fixture();try{const other=join(root,'other');writeFileSync(other,'UNRELATED',{mode:0o600});if(kind==='symlink')symlinkSync(other,target(root));else linkSync(other,target(root));const ino=lstatSync(target(root)).ino;assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'unavailable');assert.equal(lstatSync(target(root)).ino,ino);assert.equal(readFileSync(other,'utf8'),'UNRELATED');}finally{close(root);}}
},{skip:symlinkSkip});

test('actual special socket target is rejected without removal',async()=>{
 const root=fixture();const server=createServer();try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(target(root),resolve);});
  assert.equal(lstatSync(target(root)).isSocket(),true);assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'unavailable');assert.equal(lstatSync(target(root)).isSocket(),true);
 }finally{await new Promise(resolve=>server.close(resolve));close(root);}
},{skip:socketSkip});

test('shared/unsafe evidence directory and root aliases are rejected',()=>{
 const root=fixture();const alias=`${root}-alias`;try{
  chmodSync(join(root,'evidence'),0o777);assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'unavailable');assert.deepEqual(readdirSync(join(root,'evidence')),[]);
  chmodSync(join(root,'evidence'),0o700);symlinkSync(root,alias);assert.equal(publishScannerDiagnostics(alias,pubRecord()).status,'unavailable');assert.deepEqual(readdirSync(join(root,'evidence')),[]);
 }finally{try{unlinkSync(alias);}catch{}close(root);}
},{skip:symlinkSkip});

test('ancestor directory replacement is detected; anchored cleanup touches only owned staging inode',()=>{
 const root=fixture();try{
  const result=publishScannerDiagnostics(root,pubRecord(),{observer:phase=>{if(phase==='precommit'){renameSync(join(root,'evidence'),join(root,'retained-evidence'));mkdirSync(join(root,'evidence'),{mode:0o700});writeFileSync(join(root,'evidence/foreign'),'UNRELATED',{mode:0o600});}}});
  assert.equal(result.status,'unavailable');assert.equal(readFileSync(join(root,'evidence/foreign'),'utf8'),'UNRELATED');assert.deepEqual(readdirSync(join(root,'retained-evidence')),[]);assert.deepEqual(readdirSync(join(root,'evidence')),['foreign']);
 }finally{close(root);}
},{skip:publisherSkip});

test('detected terminal content drift keeps the changed bytes instead of overwriting',()=>{
 const root=fixture();try{
  assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'published');
  const result=publishScannerDiagnostics(root,pubRecord('f'.repeat(64)),{observer:phase=>{if(phase==='precommit')writeFileSync(target(root),'FOREIGN-CHANGED');}});
  assert.equal(result.status,'unavailable');assert.equal(readFileSync(target(root),'utf8'),'FOREIGN-CHANGED');assert.equal(readdirSync(join(root,'evidence')).length,1);
 }finally{close(root);}
},{skip:publisherSkip});

test('foreign staging replacement is neither published nor reclaimed by cleanup',()=>{
 const root=fixture();try{
  const result=publishScannerDiagnostics(root,pubRecord(),{observer:phase=>{if(phase==='staged'){renameSync(pending(root),join(root,'evidence/retained-temp'));writeFileSync(pending(root),'FOREIGN-STAGE',{mode:0o600});}}});
  assert.equal(result.status,'unavailable');assert.equal(readFileSync(pending(root),'utf8'),'FOREIGN-STAGE');assert.equal(parseScannerDiagnostics(readFileSync(join(root,'evidence/retained-temp')),pubEvidence()).ok,true);
 }finally{close(root);}
},{skip:publisherSkip});

test('cooperative concurrent publisher is rejected busy and cannot overwrite the admitted publisher',()=>{
 const root=fixture();let inner;try{
  const outer=publishScannerDiagnostics(root,pubRecord(),{observer:phase=>{if(phase==='staged')inner=publishScannerDiagnostics(root,pubRecord('f'.repeat(64)));}});
  assert.equal(inner.status,'unavailable');assert.equal(inner.code,'diagnostic-publication-busy');assert.equal(outer.status,'published');assert.equal(parseScannerDiagnostics(readFileSync(target(root)),pubEvidence()).ok,true);
 }finally{close(root);}
},{skip:publisherSkip});

test('new terminal alias during preparation is detected without following or deleting it',()=>{
 const root=fixture();try{
  const other=join(root,'other');writeFileSync(other,'UNRELATED',{mode:0o600});
  const result=publishScannerDiagnostics(root,pubRecord(),{observer:phase=>{if(phase==='precommit')symlinkSync(other,target(root));}});
  assert.equal(result.status,'unavailable');assert.equal(lstatSync(target(root)).isSymbolicLink(),true);assert.equal(readFileSync(other,'utf8'),'UNRELATED');
 }finally{close(root);}
},{skip:symlinkSkip});

test('strict readback rejects duplicate/escaped duplicate keys, invalid UTF8, oversized bytes and stale binding',()=>{
 assert.deepEqual(readFileSync(new URL('../../../schemas/pipeline.security-scanner-diagnostics.v1.json',import.meta.url)),readFileSync(new URL('../schemas/pipeline.security-scanner-diagnostics.v1.json',import.meta.url)));
 const valid=JSON.stringify(pubRecord());assert.equal(parseScannerDiagnostics(valid,pubEvidence()).ok,true);
 const bad=[valid.replace('"schema":','"schema":"pipeline.security-scanner-diagnostics.v1","schema":'),valid.replace('"authority":','"\\u0061uthority":"diagnostic-only","authority":'),Buffer.from([0xff]),' '.repeat(16385),valid.replace('"tool":"semgrep"','"tool":"semgrep","raw":"SECRET"')];
 for(const input of bad)assert.equal(parseScannerDiagnostics(input,pubEvidence()).ok,false);
 assert.equal(parseScannerDiagnostics(valid,pubEvidence('f'.repeat(64))).code,'diagnostic-binding-stale');
 assert.equal(parseScannerDiagnostics(valid,pubEvidence(digest+'\n')).code,'diagnostic-record-invalid');
 assert.equal(parseScannerDiagnostics(valid,digest).code,'diagnostic-record-invalid');
 for(const key of ['commit','tree','inputSha256']){
  const wrong=JSON.parse(valid);wrong.candidate[key]='e'.repeat(key==='inputSha256'?64:40);
  assert.equal(parseScannerDiagnostics(JSON.stringify(wrong),pubEvidence()).code,'diagnostic-candidate-mismatch');
  const expected=pubEvidence();expected.candidate[key]=null;
  assert.equal(parseScannerDiagnostics(valid,expected).code,'diagnostic-candidate-mismatch');
 }
 assert.throws(()=>pubRecord(digest+'\n'),/diagnostic-record-invalid/);
 const newlineVersion=observeSemgrepChild({status:0,stdout:JSON.stringify({version:'1.2.3\n',results:[]}),stderr:''},10,60000);
 assert.equal(newlineVersion.version.value,null);
});


// Producer integration fixtures: real disposable Git/Node preflight; selected
// scanner child responses are synthetic and make no native scanner claim.
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
function producerFixture(){
 const base=mkdtempSync(join(tmpdir(),'g13-producer-'));const root=join(base,'project');mkdirSync(root,{mode:0o700});mkdirSync(join(root,'.claude'));
 writeFileSync(join(root,'.gitignore'),'evidence/\n');
 writeFileSync(join(root,'.claude/pipeline.yaml'),'schema: pipeline.manifest.v0\ngates:\n  security:\n    mode: blocking\n    type: automated\nsecurity:\n  scanners:\n    gitleaks:\n      enabled: false\n    osv-scanner:\n      enabled: false\n    semgrep:\n      enabled: true\n    license-check:\n      enabled: false\n');
 const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',shell:false});assert.equal(r.status,0,r.stderr);};
 git(['init','-q']);git(['config','user.name','G13 Synthetic Fixture']);git(['config','user.email','g13@example.invalid']);
 // G32-SECURITY-REMOTE: the candidate snapshot is bound to the effective push remote, so the producer needs one.
 git(['remote','add','origin','https://example.invalid/pipeline/g13-fixture.git']);git(['add','-A']);git(['commit','-qm','G13 fixture']);
 const binary=join(base,'synthetic-semgrep');writeFileSync(binary,'synthetic selected child, never executed\n',{mode:0o600});
 return {base,root,binary};
}
function assertBound(result,root){
 const bytes=readFileSync(target(root));assert.ok(bytes.length<=16384);
 const parsed=parseScannerDiagnostics(bytes,result.evidence);assert.equal(parsed.ok,true);assert.deepEqual(parsed.record.candidate,{commit:result.evidence.candidate.commit,tree:result.evidence.candidate.tree,inputSha256:result.evidence.candidate.inputSha256});
 assert.deepEqual(JSON.parse(readFileSync(join(root,'evidence/security-latest.json'),'utf8')),result.evidence);
 if(Object.hasOwn(result,'evidenceV2')){
  assert.notEqual(result.evidenceV2,null);assert.notEqual(result.verdictV2,null);
  assert.deepEqual(JSON.parse(readFileSync(join(root,'evidence/security-latest.v2.json'),'utf8')),result.evidenceV2);
  assert.deepEqual(JSON.parse(readFileSync(join(root,'evidence/security-latest.v2.verdict.json'),'utf8')),result.verdictV2);
 }
 const {payloadSha256,...core}=result.evidence;assert.equal(createHash('sha256').update(canonical(core)).digest('hex'),payloadSha256);
 return parsed.record;
}
async function produce(f,response){
 let preflight=0,selected=0;
 const result=await runSecurityScan({rootDir:f.root,env:{...process.env,PIPELINE_SEMGREP_PATH:f.binary},timeoutMs:4321,
  assessTrustedExecutablePath:path=>path===f.binary?{ok:true,path}:{ok:false,status:'untrusted_path'},
  spawnFn:(command,args,options)=>{
   if(command===process.execPath&&args.length===2&&args[0]==='-e'&&args[1]==='process.exit(0)'){preflight++;return spawnSync(command,args,options);}
   assert.equal(command,f.binary);selected++;assert.equal(options.timeout,4321);assert.equal(options.shell,false);assert.equal(options.env.SEMGREP_ENABLE_VERSION_CHECK,'0');
   return response;
  }});
 assert.equal(preflight,1);assert.equal(selected,1);return result;
}
const cleanResponse=()=>({status:0,stdout:JSON.stringify({version:'1.170.0',results:[],errors:[]}),stderr:''});
test('public CLI genuine missing-tool result publishes an empty bound diagnostic without native scanner execution',()=>{
 const f=producerFixture();try{
 // An explicit absent binary alone still permits the producer's HOME tool
 // fallback. Omit that opt-in from this fixture so an installed host scanner
 // cannot turn the missing-tool case into a real scan.
 const missingToolEnv={...process.env,PIPELINE_SEMGREP_PATH:join(f.base,'missing-semgrep')};delete missingToolEnv.HOME;
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/security-scan.mjs',import.meta.url)),'--root',f.root,'--timeout-ms','4321'],{env:missingToolEnv,encoding:'utf8',shell:false,timeout:20000});
 assert.equal(result.status,0,JSON.stringify({stderr:result.stderr,stdout:result.stdout,error:result.error?.code}));const e=JSON.parse(readFileSync(join(f.root,'evidence/security-latest.json'),'utf8'));assert.equal(e.scanners.length,1);assert.equal(e.scanners[0].status,'SKIPPED');assert.equal(e.scanners[0].classification,'binary_missing');
 const record=assertBound({evidence:e},f.root);assert.deepEqual(record.scanners,[]);assert.equal(record.authority,'diagnostic-only');
 }finally{close(f.base);}
},{skip:publisherSkip});
test('producer completed synthetic Semgrep preserves clean v1 and binds genuine sidecar executable observation',async()=>{
 const f=producerFixture();try{const result=await produce(f,cleanResponse());assert.equal(result.exitCode,0);assert.equal(result.evidence.scanners[0].status,'PASS');const record=assertBound(result,f.root);assert.equal(record.scanners[0].child.version.value,'1.170.0');assert.equal(record.scanners[0].executableSha256,createHash('sha256').update(readFileSync(f.binary)).digest('hex'));assert.equal(record.scanners[0].rules.sha256,null);}finally{close(f.base);}
},{skip:publisherSkip});
test('producer selected child EPERM after real preflight retains ERROR and withholds secret error text',async()=>{
 const f=producerFixture();try{const result=await produce(f,{status:null,error:{code:'EPERM',message:'G13_PRIVATE_SECRET'},stdout:'',stderr:'G13_PRIVATE_SECRET'});assert.equal(result.exitCode,2);assert.equal(result.evidence.scanners[0].status,'ERROR');assert.equal(result.evidence.scanners[0].classification,'execution_environment');const record=assertBound(result,f.root);assert.equal(record.scanners[0].child.errorCode,'EPERM');assert.equal(JSON.stringify(record).includes('G13_PRIVATE_SECRET'),false);}finally{close(f.base);}
},{skip:publisherSkip});
test('producer clean JSON before timeout remains ERROR while bounded diagnostic retains completed output facts',async()=>{
 const f=producerFixture();try{const result=await produce(f,{...cleanResponse(),status:null,error:{code:'ETIMEDOUT',message:'G13_PRIVATE_SECRET'},signal:'SIGTERM'});assert.equal(result.exitCode,2);assert.equal(result.evidence.scanners[0].status,'ERROR');const record=assertBound(result,f.root);assert.equal(record.scanners[0].child.errorCode,'ETIMEDOUT');assert.equal(record.scanners[0].child.output.interpretation,'complete-json');assert.equal(record.scanners[0].child.output.resultsCount,0);}finally{close(f.base);}
},{skip:publisherSkip});
test('producer publication refusal preserves original evidence and verdict semantics and unrelated foreign bytes',async()=>{
 const f=producerFixture();try{
 const first=await produce(f,cleanResponse());assertBound(first,f.root);writeFileSync(target(f.root),'UNRELATED FOREIGN BYTES',{mode:0o600});
 const second=await produce(f,cleanResponse());assert.equal(readFileSync(target(f.root),'utf8'),'UNRELATED FOREIGN BYTES');assert.equal(second.exitCode,first.exitCode);assert.deepEqual(Object.keys(second).sort(),['evidence','evidenceV2','exitCode','verdictV2']);assert.deepEqual(Object.keys(second).sort(),Object.keys(first).sort());
 const normalize=value=>{if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['finishedAt','snapshotAt','payloadSha256'].includes(key)).map(([key,v])=>[key,normalize(v)]));return value;};
 assert.deepEqual(normalize(second),normalize(first));const {payloadSha256,...core}=second.evidence;assert.equal(createHash('sha256').update(canonical(core)).digest('hex'),payloadSha256);assert.deepEqual(JSON.parse(readFileSync(join(f.root,'evidence/security-latest.json'),'utf8')),second.evidence);assert.notEqual(second.evidenceV2,null);assert.deepEqual(JSON.parse(readFileSync(join(f.root,'evidence/security-latest.v2.json'),'utf8')),second.evidenceV2);assert.deepEqual(JSON.parse(readFileSync(join(f.root,'evidence/security-latest.v2.verdict.json'),'utf8')),second.verdictV2);
 }finally{close(f.base);}
},{skip:publisherSkip});

// K101 / AC-249 (PO decision 2026-10-23, batch 9): additive, bounded per-finding projection
// (rule id, repo-relative location, evidence fingerprint) inside the closed child-result shape.
// Synthetic scanner output only; the clear match text must never reach the serialised record.
const FAKE_TOKEN='ghp_FAKE0123456789abcdefTOKENsecretvalue99';
const projRoot='/work/root';
const semgrepResult=(id,path,line,lines)=>({check_id:id,path,start:{line,col:1,offset:0},end:{line,col:9,offset:8},extra:{message:'leak '+FAKE_TOKEN,severity:'ERROR',lines,metadata:{}}});
const semgrepOut=(results,extra={})=>JSON.stringify({version:'1.170.0',results,errors:[],...extra});
const projected=(results,extra,rootDir=projRoot)=>observeSemgrepChild({status:0,stdout:semgrepOut(results,extra),stderr:''},10,60000,rootDir);
const prefix12=text=>createHash('sha256').update(text,'utf8').digest('hex').slice(0,12);
const finding=(over={})=>({ruleId:'rules.hardcoded-token',location:{path:'src/a.js',line:3},evidenceFingerprint:{sha256:'0123456789ab',length:12},...over});
const withFindings=findings=>{const c=child();c.output={...c.output,resultsCount:Array.isArray(findings)?Math.max(1,findings.length):1};c.findings=findings;return record(c);};
const oneResult=()=>child({status:0,stdout:semgrepOut([semgrepResult('rules.token','a.js',1,'x')]),stderr:''});

test('findings projection: rule id, repo-relative location and a 12-hex fingerprint with length, nothing else',()=>{
  const lines='  token = "'+FAKE_TOKEN+'";';
  const c=projected([semgrepResult('rules.hardcoded-token','src/a.js',3,lines),semgrepResult('rules.other_rule:v1',projRoot+'/lib/b.js',7,'x')]);
  assert.deepEqual(c.findings,[
    {ruleId:'rules.hardcoded-token',location:{path:'src/a.js',line:3},evidenceFingerprint:{sha256:prefix12(lines),length:Buffer.byteLength(lines)}},
    {ruleId:'rules.other_rule:v1',location:{path:'lib/b.js',line:7},evidenceFingerprint:{sha256:prefix12('x'),length:1}},
  ]);
  assert.match(c.findings[0].evidenceFingerprint.sha256,/^[a-f0-9]{12}$/);
  const r=record(c);assert.equal(validateScannerDiagnostics(r),true);
  assert.deepEqual(parseScannerDiagnostics(JSON.stringify(r),evidence).record.scanners[0].child.findings,c.findings);
  assert.equal('findings' in child(),false,'a scan without findings keeps the previous child shape byte for byte');
  assert.equal('findings' in projected([]),false);
});

test('findings projection is bounded: at most 20 entries, over-long or unsafe identifiers are skipped, worst case stays inside the record budget',()=>{
  const many=Array.from({length:25},(_, i)=>semgrepResult('rule.n'+i,'f'+i+'.js',i+1,'t'+i));
  const c=projected(many);assert.equal(c.findings.length,20);assert.equal(c.output.resultsCount,25);assert.equal(c.findings[19].ruleId,'rule.n19');
  const longId='a'.repeat(129),longPath='d'.repeat(254)+'.js';
  const skipped=projected([semgrepResult(longId,'a.js',1,'x'),semgrepResult('rule.ok',longPath+'x','1'.length,'x'),semgrepResult('bad id with spaces','a.js',1,'x'),semgrepResult('rule.noline','a.js',0,'x'),semgrepResult('rule.fracline','a.js',1.5,'x'),semgrepResult('rule.nolines','a.js',1,undefined),semgrepResult('rule.kept','a.js',2,'x')]);
  assert.deepEqual(skipped.findings.map(f=>f.ruleId),['rule.kept']);
  const worst=Array.from({length:20},(_, i)=>semgrepResult('r'.repeat(127)+(i%10),'p'.repeat(250)+i+'.js',2147483647,'z'.repeat(5000)));
  const w=projected(worst);assert.equal(w.findings.length,20);
  const bytes=Buffer.byteLength(JSON.stringify(record(w)));assert.ok(bytes<=16384,'worst case record is '+bytes+' bytes');
  assert.equal(validateScannerDiagnostics(withFindings(Array.from({length:20},()=>finding()))),true);
  assert.throws(()=>withFindings(Array.from({length:21},()=>finding())),/diagnostic-record-invalid/,'21 entries exceed the cap');
  assert.throws(()=>withFindings([]),/diagnostic-record-invalid/,'an empty array is not a projection');
});

test('findings entries are closed and typed; malformed entries are refused by validator, builder and decoder with the typed refusal',()=>{
  assert.equal(validateScannerDiagnostics(withFindings([finding()])),true);
  const bad=[
    finding({ruleId:''}),finding({ruleId:'a'.repeat(129)}),finding({ruleId:'has space'}),finding({ruleId:'-leading'}),finding({ruleId:'rule\n'}),finding({ruleId:7}),
    finding({location:{path:'src/a.js',line:0}}),finding({location:{path:'src/a.js',line:1.5}}),finding({location:{path:'src/a.js',line:2147483648}}),finding({location:{path:'src/a.js',line:'3'}}),
    finding({location:{path:'src/a.js',line:3,column:1}}),finding({location:{path:'src/a.js'}}),finding({location:'src/a.js:3'}),
    finding({evidenceFingerprint:{sha256:'0123456789a',length:1}}),finding({evidenceFingerprint:{sha256:'0123456789abc',length:1}}),finding({evidenceFingerprint:{sha256:'0123456789AB',length:1}}),
    finding({evidenceFingerprint:{sha256:'0123456789ab',length:-1}}),finding({evidenceFingerprint:{sha256:'0123456789ab',length:1.5}}),finding({evidenceFingerprint:{sha256:'0123456789ab',length:1048577}}),
    finding({evidenceFingerprint:{sha256:'0123456789ab'}}),finding({evidenceFingerprint:{sha256:'0123456789ab',length:1,match:FAKE_TOKEN}}),
    {...finding(),snippet:FAKE_TOKEN},{ruleId:'a.b',location:{path:'a.js',line:1}},null,'rule',[]
  ];
  for(const entry of bad){
    assert.throws(()=>withFindings([entry]),/diagnostic-record-invalid/,JSON.stringify(entry));
  }
  const good=JSON.stringify(withFindings([finding()]));
  assert.equal(parseScannerDiagnostics(good.replace('"ruleId":"rules.hardcoded-token"','"ruleId":"rules.hardcoded-token","snippet":"x"'),evidence).code,'diagnostic-record-invalid');
  assert.equal(parseScannerDiagnostics(good.replace('"ruleId":"rules.hardcoded-token"','"ruleId":"has space"'),evidence).code,'diagnostic-record-invalid');
  const x=withFindings([finding()]);x.scanners[0].child.findings.extra='x';assert.equal(validateScannerDiagnostics(x),false);
  const y=withFindings([finding()]);Object.defineProperty(y.scanners[0].child.findings[0].location,'path',{get(){throw Error('must not call getter')},enumerable:true});assert.equal(validateScannerDiagnostics(y),false);
});

test('findings location is repo-relative: absolute, drive, UNC, backslash and parent-directory paths are never projected nor admitted',()=>{
  const refused=['/etc/passwd','C:\\x\\a.js','C:/x/a.js','\\\\server\\share\\a.js','a\\b.js','../a.js','a/../b.js','a/./b.js','a//b.js','a/b/','','a\u0000b.js','a\nb.js'];
  const c=projected(refused.map((p,i)=>semgrepResult('rule.r'+i,p,1,'x')).concat([semgrepResult('rule.outside','/other/place/a.js',1,'x'),semgrepResult('rule.fine',projRoot+'/ok/a.js',1,'x')]));
  assert.deepEqual(c.findings.map(f=>f.location.path),['ok/a.js']);
  const noRoot=observeSemgrepChild({status:0,stdout:semgrepOut([semgrepResult('rule.abs',projRoot+'/ok/a.js',1,'x'),semgrepResult('rule.rel','ok/a.js',1,'x')]),stderr:''},10,60000);
  assert.deepEqual(noRoot.findings.map(f=>f.ruleId),['rule.rel']);
  for(const p of refused.concat(['/abs/a.js','x'.repeat(257)])){assert.throws(()=>withFindings([finding({location:{path:p,line:1}})]),/diagnostic-record-invalid/,JSON.stringify(p));}
  assert.equal(validateScannerDiagnostics(withFindings([finding({location:{path:'a b/ä.js',line:1}})])),true);
});

test('the clear match text is never serialised: a fake secret-looking token reaches the record only as a 12-hex fingerprint and a length',()=>{
  const lines='aws = "'+FAKE_TOKEN+'"';
  const out=JSON.stringify({version:'1.170.0',results:[{...semgrepResult('rules.token','src/secret.js',4,lines),extra:{message:FAKE_TOKEN,severity:'ERROR',lines,metadata:{leak:FAKE_TOKEN},fingerprint:FAKE_TOKEN}}],errors:[]});
  const c=observeSemgrepChild({status:0,stdout:out,stderr:FAKE_TOKEN},10,60000,projRoot);
  const r=record(c);const bytes=JSON.stringify(r);
  assert.equal(c.findings.length,1);
  for(const needle of [FAKE_TOKEN,FAKE_TOKEN.slice(0,12),FAKE_TOKEN.slice(-12),lines,createHash('sha256').update(lines).digest('hex')])assert.equal(bytes.includes(needle),false,'record must not contain '+needle);
  assert.equal(bytes.includes(prefix12(lines)),true);
  assert.equal(parseScannerDiagnostics(bytes,evidence).ok,true);
  const smuggled=structuredClone(r);smuggled.scanners[0].child.findings[0].evidenceFingerprint.sha256=createHash('sha256').update(lines).digest('hex');
  assert.equal(validateScannerDiagnostics(smuggled),false,'a full digest is not a 12-hex prefix');
});

test('unavailable stays unavailable: no findings are projected, or admitted, when the scanner did not complete',async()=>{
  const body=semgrepOut([semgrepResult('rules.token','a.js',1,'x')]);
  const incomplete=[
    {status:null,error:{code:'ETIMEDOUT',message:FAKE_TOKEN},signal:'SIGTERM',stdout:body,stderr:''},
    {status:null,error:{code:'EPERM'},stdout:body,stderr:''},
    {status:7,stdout:body,stderr:''},
    {status:0,signal:'SIGKILL',stdout:body,stderr:''},
    {status:0,stdout:'not json '+body,stderr:''},
    {status:0,stdout:semgrepOut([semgrepResult('rules.token','a.js',1,'x')],{pad:'x'.repeat(1048576)}),stderr:''},
    {status:0,stdout:semgrepOut([semgrepResult('rules.token','a.js',1,'x')],{errors:[{level:'error',type:'Timeout',path:'a.js'}]}),stderr:''},
    {status:0,stdout:semgrepOut([semgrepResult('rules.token','a.js',1,'x')],{errors:[{level:'warn',type:'Timeout',path:'a.js'}]}),stderr:''},
    {status:0,stdout:JSON.stringify({version:'1.170.0',errors:[]}),stderr:''},
  ];
  for(const result of incomplete){const c=observeSemgrepChild(result,10,60000,projRoot);assert.equal('findings' in c,false,JSON.stringify(c));}
  assert.equal('findings' in observeSemgrepChild({status:0,stdout:body,stderr:''},10,0,projRoot),false);
  assert.deepEqual(observeSemgrepChild({status:0,stdout:body,stderr:''},10,0,projRoot),{observation:'not-observed'});
  // Degraded coverage (warn-level PartialParsing only) is still a completed scan, as in the adapter.
  const partial=projected([semgrepResult('rules.token','a.js',1,'x')],{errors:[{level:'warn',type:['PartialParsing',[]],path:'b.js'}]});
  assert.equal(partial.findings.length,1);
  // The closed validator enforces the same gate, so a forged record cannot carry findings for an unavailable child.
  const absent=record({observation:'not-observed'});absent.scanners[0].child.findings=[finding()];assert.equal(validateScannerDiagnostics(absent),false);
  const base=oneResult();assert.equal(validateScannerDiagnostics(record(base)),true);
  for(const patch of [{errorCode:'ETIMEDOUT'},{signal:'SIGTERM'},{exitCode:7},{exitCode:null},{output:{...base.output,interpretation:'not-complete-json'}},{output:{...base.output,interpretation:'over-diagnostic-budget'}},{output:{...base.output,resultsCount:null}},{output:{...base.output,resultsCount:0}}]){
    assert.throws(()=>record({...base,...patch}),/diagnostic-record-invalid/,JSON.stringify(patch));
  }
  assert.throws(()=>record({...base,findings:[finding(),finding()]}),/diagnostic-record-invalid/,'more findings than the observed resultsCount');
});

test('verdict independence and schema: adapter verdict, findings and exit semantics are unchanged; both schema copies declare the optional bounded array',async()=>{
  const {value}=await invoke({status:0,stdout:semgrepOut([semgrepResult('rules.token','a.js',3,'x '+FAKE_TOKEN)]),stderr:''});
  assert.equal(value.status,'FINDINGS');assert.equal(value.classification,'findings');assert.equal(value.findings.length,1);assert.equal(value.findings[0].rule,'rules.token');assert.equal(value.findings[0].line,3);
  assert.equal(value.diagnostics.findings.length,1);assert.equal(value.diagnostics.findings[0].ruleId,'rules.token');
  assert.equal(JSON.stringify(record(value.diagnostics)).includes(FAKE_TOKEN),false);
  const timedOut=(await invoke({status:null,error:{code:'ETIMEDOUT'},signal:'SIGTERM',stdout:semgrepOut([semgrepResult('rules.token','a.js',3,'x')]),stderr:''})).value;
  assert.equal(timedOut.status,'ERROR');assert.equal('findings' in timedOut.diagnostics,false);
  const clean=(await invoke({status:0,stdout:semgrepOut([]),stderr:''})).value;
  assert.equal(clean.status,'PASS');assert.equal('findings' in clean.diagnostics,false);
  for(const url of ['../../../schemas/pipeline.security-scanner-diagnostics.v1.json','../schemas/pipeline.security-scanner-diagnostics.v1.json']){
    const schema=JSON.parse(readFileSync(new URL(url,import.meta.url),'utf8'));
    const childResult=schema.properties.scanners.items.properties.child.oneOf[0];
    assert.equal(childResult.additionalProperties,false);assert.equal(childResult.required.includes('findings'),false);
    const f=childResult.properties.findings;assert.equal(f.type,'array');assert.equal(f.maxItems,20);assert.equal(f.items.additionalProperties,false);
    assert.deepEqual(f.items.required,['ruleId','location','evidenceFingerprint']);
    assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['schema','authority','evidencePayloadSha256','candidate','scanners']);
  }
});

test('producer: a synthetic Semgrep finding with a fake token publishes rule id, location and fingerprint, and the sidecar bytes never contain the token',async()=>{
 const f=producerFixture();try{
  const lines='k = "'+FAKE_TOKEN+'"';
  const result=await produce(f,{status:0,stdout:semgrepOut([semgrepResult('rules.token','src/a.js',4,lines)]),stderr:FAKE_TOKEN});
  assert.equal(result.evidence.scanners[0].status,'FINDINGS');
  const bytes=readFileSync(target(f.root));const parsed=parseScannerDiagnostics(bytes,result.evidence);assert.equal(parsed.ok,true);
  assert.deepEqual(parsed.record.scanners[0].child.findings,[{ruleId:'rules.token',location:{path:'src/a.js',line:4},evidenceFingerprint:{sha256:prefix12(lines),length:Buffer.byteLength(lines)}}]);
  assert.equal(bytes.toString('utf8').includes(FAKE_TOKEN),false);
  const timed=await produce(f,{status:null,error:{code:'ETIMEDOUT'},signal:'SIGTERM',stdout:semgrepOut([semgrepResult('rules.token','src/a.js',4,lines)]),stderr:''});
  assert.equal(timed.exitCode,2);assert.equal(timed.evidence.scanners[0].status,'ERROR');
  const timedParsed=parseScannerDiagnostics(readFileSync(target(f.root)),timed.evidence);assert.equal(timedParsed.ok,true);assert.equal('findings' in timedParsed.record.scanners[0].child,false);
 }finally{close(f.base);}
},{skip:publisherSkip});

if(completionCases.length!==32)throw new Error("G13 completion topology drift");
const completionFd=process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD===undefined
  ? openCompletionDescriptor(devNull,"w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({cases:completionCases,fd:completionFd,maxBytes:65536});

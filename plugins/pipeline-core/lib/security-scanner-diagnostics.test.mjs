// Prepared G13 test proposal; per-case canonical completion, no envelope.
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,lstatSync,chmodSync,symlinkSync,linkSync,renameSync,unlinkSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { runSecurityScan } from "../scripts/security-scan.mjs";
import { createServer } from "node:net";
import { run } from "../scripts/security-adapters/semgrep.mjs";
import { observeSemgrepChild,observeLocalRules,validateScannerDiagnostics,buildScannerDiagnostics,parseScannerDiagnostics } from "./security-scanner-diagnostics.mjs";
import { publishScannerDiagnostics } from "./security-scanner-diagnostics-publication.mjs";
const completionCases=[];
function test(name,run){completionCases.push({id:"G13D"+String(completionCases.length+1).padStart(3,"0"),name,run});}
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
});

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
});

test('foreign existing regular bytes survive rejected publication',()=>{
 const root=fixture();try{writeFileSync(target(root),'UNRELATED',{mode:0o600});assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'unavailable');assert.equal(readFileSync(target(root),'utf8'),'UNRELATED');assert.equal(readdirSync(join(root,'evidence')).length,1);}finally{close(root);}
});

test('terminal symlink and hardlink are not followed/replaced and unrelated referent survives',()=>{
 for(const kind of ['symlink','hardlink']){const root=fixture();try{const other=join(root,'other');writeFileSync(other,'UNRELATED',{mode:0o600});if(kind==='symlink')symlinkSync(other,target(root));else linkSync(other,target(root));const ino=lstatSync(target(root)).ino;assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'unavailable');assert.equal(lstatSync(target(root)).ino,ino);assert.equal(readFileSync(other,'utf8'),'UNRELATED');}finally{close(root);}}
});

test('actual special socket target is rejected without removal',async()=>{
 const root=fixture();const server=createServer();try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(target(root),resolve);});
  assert.equal(lstatSync(target(root)).isSocket(),true);assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'unavailable');assert.equal(lstatSync(target(root)).isSocket(),true);
 }finally{await new Promise(resolve=>server.close(resolve));close(root);}
});

test('shared/unsafe evidence directory and root aliases are rejected',()=>{
 const root=fixture();const alias=`${root}-alias`;try{
  chmodSync(join(root,'evidence'),0o777);assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'unavailable');assert.deepEqual(readdirSync(join(root,'evidence')),[]);
  chmodSync(join(root,'evidence'),0o700);symlinkSync(root,alias);assert.equal(publishScannerDiagnostics(alias,pubRecord()).status,'unavailable');assert.deepEqual(readdirSync(join(root,'evidence')),[]);
 }finally{try{unlinkSync(alias);}catch{}close(root);}
});

test('ancestor directory replacement is detected; anchored cleanup touches only owned staging inode',()=>{
 const root=fixture();try{
  const result=publishScannerDiagnostics(root,pubRecord(),{observer:phase=>{if(phase==='precommit'){renameSync(join(root,'evidence'),join(root,'retained-evidence'));mkdirSync(join(root,'evidence'),{mode:0o700});writeFileSync(join(root,'evidence/foreign'),'UNRELATED',{mode:0o600});}}});
  assert.equal(result.status,'unavailable');assert.equal(readFileSync(join(root,'evidence/foreign'),'utf8'),'UNRELATED');assert.deepEqual(readdirSync(join(root,'retained-evidence')),[]);assert.deepEqual(readdirSync(join(root,'evidence')),['foreign']);
 }finally{close(root);}
});

test('detected terminal content drift keeps the changed bytes instead of overwriting',()=>{
 const root=fixture();try{
  assert.equal(publishScannerDiagnostics(root,pubRecord()).status,'published');
  const result=publishScannerDiagnostics(root,pubRecord('f'.repeat(64)),{observer:phase=>{if(phase==='precommit')writeFileSync(target(root),'FOREIGN-CHANGED');}});
  assert.equal(result.status,'unavailable');assert.equal(readFileSync(target(root),'utf8'),'FOREIGN-CHANGED');assert.equal(readdirSync(join(root,'evidence')).length,1);
 }finally{close(root);}
});

test('foreign staging replacement is neither published nor reclaimed by cleanup',()=>{
 const root=fixture();try{
  const result=publishScannerDiagnostics(root,pubRecord(),{observer:phase=>{if(phase==='staged'){renameSync(pending(root),join(root,'evidence/retained-temp'));writeFileSync(pending(root),'FOREIGN-STAGE',{mode:0o600});}}});
  assert.equal(result.status,'unavailable');assert.equal(readFileSync(pending(root),'utf8'),'FOREIGN-STAGE');assert.equal(parseScannerDiagnostics(readFileSync(join(root,'evidence/retained-temp')),pubEvidence()).ok,true);
 }finally{close(root);}
});

test('cooperative concurrent publisher is rejected busy and cannot overwrite the admitted publisher',()=>{
 const root=fixture();let inner;try{
  const outer=publishScannerDiagnostics(root,pubRecord(),{observer:phase=>{if(phase==='staged')inner=publishScannerDiagnostics(root,pubRecord('f'.repeat(64)));}});
  assert.equal(inner.status,'unavailable');assert.equal(inner.code,'diagnostic-publication-busy');assert.equal(outer.status,'published');assert.equal(parseScannerDiagnostics(readFileSync(target(root)),pubEvidence()).ok,true);
 }finally{close(root);}
});

test('new terminal alias during preparation is detected without following or deleting it',()=>{
 const root=fixture();try{
  const other=join(root,'other');writeFileSync(other,'UNRELATED',{mode:0o600});
  const result=publishScannerDiagnostics(root,pubRecord(),{observer:phase=>{if(phase==='precommit')symlinkSync(other,target(root));}});
  assert.equal(result.status,'unavailable');assert.equal(lstatSync(target(root)).isSymbolicLink(),true);assert.equal(readFileSync(other,'utf8'),'UNRELATED');
 }finally{close(root);}
});

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
 git(['init','-q']);git(['config','user.name','G13 Synthetic Fixture']);git(['config','user.email','g13@example.invalid']);git(['add','-A']);git(['commit','-qm','G13 fixture']);
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
 const result=spawnSync(process.execPath,[new URL('../scripts/security-scan.mjs',import.meta.url).pathname,'--root',f.root,'--timeout-ms','4321'],{env:missingToolEnv,encoding:'utf8',shell:false,timeout:20000});
 assert.equal(result.status,0,JSON.stringify({stderr:result.stderr,stdout:result.stdout,error:result.error?.code}));const e=JSON.parse(readFileSync(join(f.root,'evidence/security-latest.json'),'utf8'));assert.equal(e.scanners.length,1);assert.equal(e.scanners[0].status,'SKIPPED');assert.equal(e.scanners[0].classification,'binary_missing');
 const record=assertBound({evidence:e},f.root);assert.deepEqual(record.scanners,[]);assert.equal(record.authority,'diagnostic-only');
 }finally{close(f.base);}
});
test('producer completed synthetic Semgrep preserves clean v1 and binds genuine sidecar executable observation',async()=>{
 const f=producerFixture();try{const result=await produce(f,cleanResponse());assert.equal(result.exitCode,0);assert.equal(result.evidence.scanners[0].status,'PASS');const record=assertBound(result,f.root);assert.equal(record.scanners[0].child.version.value,'1.170.0');assert.equal(record.scanners[0].executableSha256,createHash('sha256').update(readFileSync(f.binary)).digest('hex'));assert.equal(record.scanners[0].rules.sha256,null);}finally{close(f.base);}
});
test('producer selected child EPERM after real preflight retains ERROR and withholds secret error text',async()=>{
 const f=producerFixture();try{const result=await produce(f,{status:null,error:{code:'EPERM',message:'G13_PRIVATE_SECRET'},stdout:'',stderr:'G13_PRIVATE_SECRET'});assert.equal(result.exitCode,2);assert.equal(result.evidence.scanners[0].status,'ERROR');assert.equal(result.evidence.scanners[0].classification,'execution_environment');const record=assertBound(result,f.root);assert.equal(record.scanners[0].child.errorCode,'EPERM');assert.equal(JSON.stringify(record).includes('G13_PRIVATE_SECRET'),false);}finally{close(f.base);}
});
test('producer clean JSON before timeout remains ERROR while bounded diagnostic retains completed output facts',async()=>{
 const f=producerFixture();try{const result=await produce(f,{...cleanResponse(),status:null,error:{code:'ETIMEDOUT',message:'G13_PRIVATE_SECRET'},signal:'SIGTERM'});assert.equal(result.exitCode,2);assert.equal(result.evidence.scanners[0].status,'ERROR');const record=assertBound(result,f.root);assert.equal(record.scanners[0].child.errorCode,'ETIMEDOUT');assert.equal(record.scanners[0].child.output.interpretation,'complete-json');assert.equal(record.scanners[0].child.output.resultsCount,0);}finally{close(f.base);}
});
test('producer publication refusal preserves original evidence and verdict semantics and unrelated foreign bytes',async()=>{
 const f=producerFixture();try{
 const first=await produce(f,cleanResponse());assertBound(first,f.root);writeFileSync(target(f.root),'UNRELATED FOREIGN BYTES',{mode:0o600});
 const second=await produce(f,cleanResponse());assert.equal(readFileSync(target(f.root),'utf8'),'UNRELATED FOREIGN BYTES');assert.equal(second.exitCode,first.exitCode);assert.deepEqual(Object.keys(second).sort(),['evidence','evidenceV2','exitCode','verdictV2']);assert.deepEqual(Object.keys(second).sort(),Object.keys(first).sort());
 const normalize=value=>{if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['finishedAt','snapshotAt','payloadSha256'].includes(key)).map(([key,v])=>[key,normalize(v)]));return value;};
 assert.deepEqual(normalize(second),normalize(first));const {payloadSha256,...core}=second.evidence;assert.equal(createHash('sha256').update(canonical(core)).digest('hex'),payloadSha256);assert.deepEqual(JSON.parse(readFileSync(join(f.root,'evidence/security-latest.json'),'utf8')),second.evidence);assert.notEqual(second.evidenceV2,null);assert.deepEqual(JSON.parse(readFileSync(join(f.root,'evidence/security-latest.v2.json'),'utf8')),second.evidenceV2);assert.deepEqual(JSON.parse(readFileSync(join(f.root,'evidence/security-latest.v2.verdict.json'),'utf8')),second.verdictV2);
 }finally{close(f.base);}
});

if(completionCases.length!==24)throw new Error("G13 completion topology drift");
const completionFd=process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD===undefined
  ? openCompletionDescriptor(process.platform==="win32"?"NUL":"/dev/null","w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({cases:completionCases,fd:completionFd,maxBytes:65536});

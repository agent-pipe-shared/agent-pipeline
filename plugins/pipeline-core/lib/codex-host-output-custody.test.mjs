// Actual managed synthetic Node protocol plus focused custody-event boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {once} from 'node:events';
import {canonicalJson} from './codex-sandbox-compatibility.mjs';
import {runIsolatedStructuredHost} from './codex-isolated-structured-host.mjs';
import {registerCodexHostProcessRoot,readHostJournal,listOwnedSession} from './codex-host-process-journal.mjs';
import {createHostOutputCustody} from './codex-host-output-custody.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const rawReport='{\r\n "outcome" : "ok", "note" : "🧪"\r\n}';
function fixture(t,scenario){
  const root=mkdtempSync(join(tmpdir(),'codex-host-output-custody-fixture-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const cwd=join(root,'input'),common=join(root,'.git');mkdirSync(cwd,{mode:0o700});mkdirSync(common,{mode:0o700});
  const repoFingerprint='a'.repeat(64),receiptId='drh_'+randomBytes(16).toString('hex');
  const journalParent=registerCodexHostProcessRoot({gitCommonDir:common,repoFingerprint,purpose:'advisor'});
  const expected=join(cwd,'expected.json');
  writeFileSync(join(cwd,'app-server'),`
const {createInterface}=require('node:readline'),{createHash}=require('node:crypto'),{writeFileSync}=require('node:fs');
const scenario=${JSON.stringify(scenario)},rawReport=${JSON.stringify(rawReport)};
const stdoutHash=createHash('sha256'),stderrHash=createHash('sha256');let stdoutBytes=0,stderrBytes=0,finalFrameHash=null,rawReportHash=null;
const stdout=b=>{b=Buffer.isBuffer(b)?b:Buffer.from(b);stdoutHash.update(b);stdoutBytes+=b.length;process.stdout.write(b);};
const stderr=b=>{b=Buffer.isBuffer(b)?b:Buffer.from(b);stderrHash.update(b);stderrBytes+=b.length;process.stderr.write(b);};
const send=v=>stdout(JSON.stringify(v)+'\\n');
const args=process.argv.slice(2),overrides=args.filter((v,i)=>args[i-1]==='-c');
const profile=JSON.parse(overrides.find(v=>v.startsWith('default_permissions=')).split('=')[1]);
const features=Object.fromEntries(overrides.filter(v=>/^features\\.[^=]+=false$/.test(v)).map(v=>[v.slice(9,-6),false]));
const config={mcp_servers:{},features,notify:[],web_search:'disabled',project_doc_max_bytes:0,include_environment_context:false,shell_environment_policy:{inherit:'none'},history:{persistence:'none'},permissions:{[profile]:{extends:null,network:{enabled:false},filesystem:{':minimal':'read',[process.execPath]:'read',[process.cwd()]:'read',glob_scan_max_depth:null}}}};
const rl=createInterface({input:process.stdin});
rl.on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{}});
else if(m.method==='initialized')stderr(scenario==='invalid-stderr'?Buffer.from([0xff]):'Controlled stderr 🧪\\n');
else if(m.method==='config/read')send({id:m.id,result:{config}});
else if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'fixture-thread'},model:m.params.model,modelProvider:'openai',activePermissionProfile:{id:profile},approvalPolicy:'never'}});
else if(m.method==='mcpServerStatus/list')send({id:m.id,result:{data:[],nextCursor:null}});
else if(m.method==='turn/start'){
send({id:m.id,result:{turn:{id:'fixture-turn'}}});
if(scenario==='invalid-utf8'){stdout(Buffer.from([0xc3,0x28,0x0a]));return;}
const text=scenario==='invalid-report'?'{"outcome":"ok","outcome":"ok"}':rawReport;
let frame=JSON.stringify({method:'item/completed',params:{threadId:'fixture-thread',turnId:'fixture-turn',item:{type:'agentMessage',phase:'final_answer',text}}});
if(scenario==='duplicate-outer')frame=frame.replace('{"method":','{"method":"item/completed","method":');
finalFrameHash=createHash('sha256').update(frame).digest('hex');rawReportHash=createHash('sha256').update(text).digest('hex');
const finish=()=>{send({method:'turn/completed',params:{threadId:'fixture-thread',turn:{id:'fixture-turn',status:'completed'}}});};
if(scenario==='split-utf8'){const bytes=Buffer.from(frame+'\\n'),split=bytes.indexOf(Buffer.from('🧪'))+2;stdout(bytes.subarray(0,split));setTimeout(()=>{stdout(bytes.subarray(split));finish();},20);}
else{stdout(frame+'\\n');finish();}
}else if(m.method==='thread/unsubscribe'||m.method==='turn/interrupt'){send({id:m.id,result:{}});if(m.method==='thread/unsubscribe'){if(scenario==='trailing-partial')stdout('{"unfinished":');if(scenario==='trailing-full')stdout('{"unframed":true}');}}
});rl.on('close',()=>{writeFileSync('expected.json',JSON.stringify({stdoutSha256:stdoutHash.digest('hex'),stderrSha256:stderrHash.digest('hex'),stdoutBytes,stderrBytes,finalFrameHash,rawReportHash}));process.exit(scenario==='terminal-error'?3:0);});
`);
  return {root,cwd,expected,journalParent,receiptId,args:{codexPath:process.execPath,cwd,model:'synthetic-model',effort:'max',prompt:'Controlled request only.',
    outputSchema:{type:'object',additionalProperties:false,required:['outcome','note'],properties:{outcome:{type:'string',enum:['ok']},note:{type:'string'}}},
    startupTimeoutMs:3000,turnTimeoutMs:3000,inputContract:'advisor',advisorRecipeSha256:'b'.repeat(64),inputRecheckTimeoutMs:100,beforeTurnInput:()=>({decision:'approved'}),
    managedProcess:{journalParent,receiptId,binding:{repoFingerprint,dispatchId:'output-custody',candidateCommit:'c'.repeat(40)}}}};
}
for(const scenario of ['valid','split-utf8','invalid-utf8','duplicate-outer','trailing-partial','trailing-full','invalid-report','invalid-stderr','terminal-error'])test('managed output custody: '+scenario,async t=>{
  const f=fixture(t,scenario),result=await runIsolatedStructuredHost(f.args),custody=result.observed.outputCustody;
  const expected=JSON.parse(readFileSync(f.expected,'utf8'));
  assert.deepEqual(Object.keys(custody).sort(),['schema','stdioStatus','stdin','stdout','stderr','finalMessageFrameSha256','reportRawJsonSha256','reportRawJsonBytes','reportCanonicalSha256'].sort());
  assert.equal(custody.schema,'pipeline.codex-host-output-custody.v1');
  assert.equal(custody.stdout.sha256,expected.stdoutSha256);assert.equal(custody.stderr.sha256,expected.stderrSha256);
  assert.equal(custody.stdout.bytes,expected.stdoutBytes);assert.equal(custody.stderr.bytes,expected.stderrBytes);
  assert.equal(custody.stdout.retainedBytes,custody.stdout.bytes);assert.equal(custody.stderr.retainedBytes,custody.stderr.bytes);
  assert.equal(custody.stdin.finished,true);assert.equal(custody.stdin.closed,true);
  assert.equal(custody.stdout.ended,true);assert.equal(custody.stdout.closed,true);assert.equal(custody.stderr.ended,true);assert.equal(custody.stderr.closed,true);
  if(['valid','split-utf8'].includes(scenario)){
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(custody.stdioStatus,'complete');
    assert.equal(custody.finalMessageFrameSha256,expected.finalFrameHash);assert.equal(custody.reportRawJsonSha256,hash(rawReport));assert.equal(custody.reportRawJsonSha256,expected.rawReportHash);
    assert.equal(custody.reportRawJsonBytes,Buffer.byteLength(rawReport));assert.equal(custody.reportCanonicalSha256,hash(canonicalJson({outcome:'ok',note:'🧪'})));
    assert.notEqual(custody.reportCanonicalSha256,custody.reportRawJsonSha256);
  }else{
    assert.equal(result.ok,false);assert.equal(result.report,null);
    assert.equal(custody.stdioStatus,scenario==='terminal-error'?'complete':'failed');
    if(scenario==='duplicate-outer')assert.equal(custody.stdout.parserVerified,false);
    if(scenario.startsWith('trailing-'))assert.equal(custody.stdout.framingComplete,false);
    if(scenario==='invalid-utf8')assert.equal(custody.stdout.utf8Verified,false);
    if(scenario==='invalid-stderr')assert.equal(custody.stderr.utf8Verified,false);
  }
  const journal=join(f.journalParent,'codex-host-'+f.receiptId),terminal=readHostJournal(journal,'terminal'),launcher=readHostJournal(journal,'launcher');
  assert.equal(listOwnedSession(launcher.value.process).length,0);
  assert.equal(terminal.value.exitCode,scenario==='terminal-error'?3:0);
  if(scenario==='terminal-error')assert.equal(result.observed.ownership,null);else assert.equal(result.observed.ownership.status,'closed');

});
function collector(maxBytes=64){let faults=0;const frames=[];const c=createHostOutputCustody({maxBytes,onFrame:v=>frames.push(v),onFault:()=>faults++});return {c,frames,faults:()=>faults};}
function closeClean(c){c.end('stdout');c.close('stdout');c.end('stderr');c.close('stderr');c.stdinFinish();c.stdinClose();}
test('bounded collector retains at most cap while hashing every actually observed overflow byte',()=>{
  const {c,faults}=collector(16),bytes=Buffer.from('x'.repeat(30));c.data('stderr',bytes);closeClean(c);
  const s=c.snapshot();assert.equal(s.stdioStatus,'failed');assert.equal(s.stderr.retainedBytes,16);assert.equal(s.stderr.bytes,30);assert.equal(s.stderr.sha256,hash(bytes));assert.equal(s.stderr.bounded,false);assert.equal(faults(),1);
});
test('actual stream error event cannot be converted into complete custody',async()=>{
  const {c}=collector(),stream=new PassThrough();stream.on('data',b=>c.data('stdout',b));stream.on('end',()=>c.end('stdout'));stream.on('close',()=>c.close('stdout'));stream.on('error',()=>c.error('stdout'));
  const closed=once(stream,'close').catch(()=>{});stream.write(Buffer.from('{}\n'));stream.destroy(new Error('controlled stream failure'));await closed;await new Promise(resolve=>setImmediate(resolve));
  c.end('stderr');c.close('stderr');c.stdinFinish();c.stdinClose();const s=c.snapshot();assert.equal(s.stdioStatus,'failed');assert.equal(s.stdout.errored,true);assert.equal(s.stdout.ended,false);
});
test('pipe close without genuine end and stdin finish never implies completeness',()=>{
  const {c}=collector();c.data('stdout',Buffer.from('{}\n'));c.close('stdout');c.end('stderr');c.close('stderr');c.stdinClose();const s=c.snapshot();assert.equal(s.stdioStatus,'failed');assert.equal(s.stdout.ended,false);assert.equal(s.stdin.finished,false);
});

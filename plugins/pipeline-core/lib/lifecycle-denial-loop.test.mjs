// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "./test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";

const completionCases = [];
function test(name, run) {
  if (arguments.length !== 2 || typeof run !== "function") throw new TypeError("Required completion expects the preserved two-argument test registration");
  completionCases.push({ id: "RC16C" + String(completionCases.length + 1).padStart(3, "0"), name, run });
}
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir, devNull} from 'node:os';
import {join} from 'node:path';
import {observeReturnedActionDenial, resetLifecycleDenial} from './lifecycle-denial-loop.mjs';

const fields = ['sourceSha256','targetsSha256','barrierSha256','readbackSha256','stateSha256','handoverSha256','historySha256','checkpointSha256','planSha256'];
function fixture(fn) {
  const directory = fs.mkdtempSync(join(tmpdir(), 'lifecycle-denial-'));
  try {
    const commonDir = join(directory, 'git'); fs.mkdirSync(commonDir, {mode: 0o700});
    const input = {commonDir, scope:{sessionId:'session-one',agentId:null}, offeredActionMatches:true,
      status:'intake-required',reason:'PORG-NOT-READY',
      action:{kind:'command',executable:'/private/secret/node',argv:['/private/secret/tool','--text','secret-user-payload']},
      state:Object.fromEntries(fields.map(field => [field, 'a'.repeat(64)]))};
    fn(input, directory);
  } finally { fs.rmSync(directory, {recursive:true,force:true}); }
}
const saved = input => join(input.commonDir,'agent-pipeline','lifecycle-denial-loop');
const recordPath = input => join(saved(input),fs.readdirSync(saved(input)).find(name=>name.endsWith('.json')));

test('two identical matched refusals signal and saturate at two', () => fixture(input => {
  const first=observeReturnedActionDenial(input); assert.equal(first.count,1); assert.equal(first.code,null);
  const second=observeReturnedActionDenial(input); assert.equal(second.count,2); assert.equal(second.code,'GUARD-LIFECYCLE-RETURNED-ACTION-LOOP');
  assert.deepEqual(observeReturnedActionDenial(input),second);
  assert.equal(fs.readdirSync(saved(input)).length,1);
}));
test('state change in the same phase resets and rotates HMAC key', () => fixture(input => {
  observeReturnedActionDenial(input); observeReturnedActionDenial(input);
  const before=JSON.parse(fs.readFileSync(recordPath(input)));
  const changed={...input,state:{...input.state,checkpointSha256:'b'.repeat(64)}};
  assert.equal(observeReturnedActionDenial(changed).count,1);
  const after=JSON.parse(fs.readFileSync(recordPath(input))); assert.notEqual(after.key,before.key);
}));
test('action or reason change resets', () => fixture(input => {
  observeReturnedActionDenial(input);
  const changed={...input,action:{...input.action,argv:[...input.action.argv,'new']}};
  assert.equal(observeReturnedActionDenial(changed).count,1);
  assert.equal(observeReturnedActionDenial({...changed,reason:'PORG-INVALID-OBSERVATION'}).count,1);
}));
test('successful admission clears the record', () => fixture(input => {
  observeReturnedActionDenial(input); observeReturnedActionDenial(input);
  assert.equal(resetLifecycleDenial(input),true); assert.equal(fs.readdirSync(saved(input)).length,0);
  assert.equal(observeReturnedActionDenial(input).count,1);
}));
test('foreign attempt cannot claim loop and breaks consecutive repeats', () => fixture(input => {
  observeReturnedActionDenial(input);
  assert.equal(observeReturnedActionDenial({...input,offeredActionMatches:false}),null);
  assert.equal(observeReturnedActionDenial(input).count,1);
}));
test('missing or malformed match observation preserves existing record', () => fixture(input => {
  observeReturnedActionDenial(input); const path=recordPath(input), before=fs.readFileSync(path);
  for(const offeredActionMatches of [undefined,null,1,'true']) {
    assert.equal(observeReturnedActionDenial({...input,offeredActionMatches}),null);
    assert.deepEqual(fs.readFileSync(path),before);
  }
}));
test('present non-string session IDs never count or alter saved record', () => fixture(input => {
  observeReturnedActionDenial(input); const path=recordPath(input), before=fs.readFileSync(path);
  for(const sessionId of [undefined,null,123]) {
    const malformed={...input,scope:{sessionId,agentId:null}};
    assert.equal(observeReturnedActionDenial(malformed),null);
    assert.equal(observeReturnedActionDenial(malformed),null);
    assert.equal(resetLifecycleDenial(malformed),false);
    assert.deepEqual(fs.readFileSync(path),before);
    assert.equal(fs.readdirSync(saved(input)).length,1);
  }
}));
test('sessions and agents have isolated hashed scopes', () => fixture(input => {
  observeReturnedActionDenial(input);
  assert.equal(observeReturnedActionDenial({...input,scope:{...input.scope,agentId:'agent-a'}}).count,1);
  assert.equal(observeReturnedActionDenial({...input,scope:{sessionId:'session-two',agentId:null}}).count,1);
  const names=fs.readdirSync(saved(input)); assert.equal(names.length,3); names.forEach(name=>assert.match(name,/^[a-f0-9]{64}\.json$/u));
}));
test('missing malformed identity and reason/status/state schema do not write', () => fixture(input => {
  for(const bad of [{scope:null},{scope:{sessionId:undefined,agentId:null}},{scope:{sessionId:null,agentId:null}},
    {scope:{sessionId:123,agentId:null}},{scope:{sessionId:'../secret',agentId:null}},{scope:{sessionId:'s',agentId:'../a'}},
    {reason:'secret'}, {status:'unknown'}, {state:{...input.state,extra:'secret'}}, {state:{...input.state,planSha256:'secret'}}]) {
    assert.equal(observeReturnedActionDenial({...input,...bad}),null);
  }
  assert.equal(fs.existsSync(join(input.commonDir,'agent-pipeline')),false);
}));
test('malformed and oversized storage stays untouched without loop', () => fixture(input => {
  observeReturnedActionDenial(input); const path=recordPath(input);
  for(const bytes of ['{bad', 'x'.repeat(3000), JSON.stringify({schema:'foreign'})]) {
    fs.writeFileSync(path,bytes,{mode:0o600}); assert.equal(observeReturnedActionDenial(input),null);
    assert.equal(fs.readFileSync(path,'utf8'),bytes); assert.equal(resetLifecycleDenial(input),false);
  }
}));
test('symlink state and hardlinked state reject without touching aliases', () => fixture((input,directory) => {
  observeReturnedActionDenial(input); const path=recordPath(input), foreign=join(directory,'foreign');
  const bytes=fs.readFileSync(path); fs.writeFileSync(foreign,bytes,{mode:0o600}); fs.unlinkSync(path);
  fs.symlinkSync(foreign,path); assert.equal(observeReturnedActionDenial(input),null); assert.deepEqual(fs.readFileSync(foreign),bytes);
  fs.unlinkSync(path); fs.linkSync(foreign,path); assert.equal(observeReturnedActionDenial(input),null); assert.deepEqual(fs.readFileSync(foreign),bytes);
}));
test('ancestor symlink and storage directory alias reject', () => fixture((input,directory) => {
  const alias=join(directory,'alias'); fs.symlinkSync(input.commonDir,alias);
  assert.equal(observeReturnedActionDenial({...input,commonDir:alias}),null);
  const nested=join(input.commonDir,'nested'); fs.mkdirSync(nested);
  assert.equal(observeReturnedActionDenial({...input,commonDir:join(alias,'nested')}),null);
  fs.symlinkSync(directory,join(input.commonDir,'agent-pipeline'));
  assert.equal(observeReturnedActionDenial(input),null);
}));
test('busy lock fails without mutation', () => fixture(input => {
  observeReturnedActionDenial(input); const path=recordPath(input), lock=path.replace(/\.json$/u,'.lock');
  const bytes=fs.readFileSync(path); fs.writeFileSync(lock,'busy',{mode:0o600});
  assert.equal(observeReturnedActionDenial(input),null); assert.deepEqual(fs.readFileSync(path),bytes); assert.equal(fs.readFileSync(lock,'utf8'),'busy');
}));
test('file-shaped private directory fails without mutation', () => fixture(input => {
  const path=join(input.commonDir,'agent-pipeline');fs.writeFileSync(path,'foreign directory bytes',{mode:0o600});
  assert.equal(observeReturnedActionDenial(input),null);assert.equal(fs.readFileSync(path,'utf8'),'foreign directory bytes');
}));
test('foreign replacement of temp/lock content is retained on cleanup', () => fixture(input => {
  observeReturnedActionDenial(input);
  assert.equal(observeReturnedActionDenial(input,{beforePublish(){
    const names=fs.readdirSync(saved(input));
    for(const name of names.filter(name=>name.endsWith('.tmp')||name.endsWith('.lock'))) fs.writeFileSync(join(saved(input),name),'foreign replacement',{mode:0o600});
    throw new Error('interrupt');
  }}),null);
  for(const name of fs.readdirSync(saved(input)).filter(name=>!name.endsWith('.json'))) assert.equal(fs.readFileSync(join(saved(input),name),'utf8'),'foreign replacement');
}));
test('lost lock ownership before publication withholds loop and preserves state', () => fixture(input => {
  observeReturnedActionDenial(input); const path=recordPath(input),bytes=fs.readFileSync(path);
  assert.equal(observeReturnedActionDenial(input,{beforePublish(){fs.writeFileSync(path.replace(/\.json$/u,'.lock'),'foreign lock',{mode:0o600});}}),null);
  assert.deepEqual(fs.readFileSync(path),bytes);
}));
test('before-publication target replacement aborts and preserves foreign bytes', () => fixture((input,directory) => {
  observeReturnedActionDenial(input); const path=recordPath(input), foreign=join(directory,'foreign');
  fs.writeFileSync(foreign,'foreign bytes',{mode:0o600});
  const result=observeReturnedActionDenial(input,{beforePublish(){fs.unlinkSync(path);fs.symlinkSync(foreign,path);}});
  assert.equal(result,null); assert.equal(fs.readFileSync(foreign,'utf8'),'foreign bytes');
  assert.equal(fs.readdirSync(saved(input)).some(name=>name.endsWith('.tmp')||name.endsWith('.lock')),false);
}));
test('ancestor replacement before publication cannot redirect write', () => fixture((input,directory) => {
  observeReturnedActionDenial(input); const parent=join(input.commonDir,'agent-pipeline'), moved=join(directory,'moved'), foreign=join(directory,'foreign'); fs.mkdirSync(foreign);
  const result=observeReturnedActionDenial(input,{beforePublish(){fs.renameSync(parent,moved);fs.symlinkSync(foreign,parent);}});
  assert.equal(result,null); assert.deepEqual(fs.readdirSync(foreign),[]);
  assert.equal(fs.readdirSync(join(moved,'lifecycle-denial-loop')).filter(name=>name.endsWith('.json')).length,1);
}));
test('post-publication failure withholds loop claim', () => fixture(input => {
  observeReturnedActionDenial(input);
  assert.equal(observeReturnedActionDenial(input,{afterPublish(){throw new Error('private secret failure');}}),null);
}));
test('saved bytes contain only closed metadata and keyed fingerprints', () => fixture(input => {
  observeReturnedActionDenial(input);const path=recordPath(input),text=fs.readFileSync(path,'utf8'),value=JSON.parse(text);
  for(const secret of ['secret-user-payload','/private/secret','session-one','commonDir','argv','executable']) assert.equal(text.includes(secret),false,secret);
  assert.deepEqual(Object.keys(value).sort(),['schema','scope','key','status','reason','kind','action','state','count'].sort());
  assert.ok(Buffer.byteLength(text)<2048);assert.equal(fs.statSync(path).mode&0o077,0);
}));

// Each original sibling callback is registered individually; no envelope case.
if (completionCases.length !== 20) throw new Error("Required completion declared case count drift");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });

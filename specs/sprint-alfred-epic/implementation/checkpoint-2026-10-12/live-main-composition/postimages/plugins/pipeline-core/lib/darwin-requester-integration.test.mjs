// SPDX-License-Identifier: SUL-1.0
import {registerTestCaseCompletion} from './test-case-completion.mjs';
const cases=[];
function test(name,options,run){
  if(typeof options==='function'){run=options;options={};}
  cases.push({id:'DRI'+String(cases.length+1).padStart(3,'0'),name,mode:options.skip?'skip':'run',run});
}
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,chmodSync,writeFileSync,readFileSync,rmSync,realpathSync,readdirSync,lstatSync,existsSync} from 'node:fs';
import {userInfo} from 'node:os';
import {join,resolve} from 'node:path';
import {discoverRepository,inspectSignedDescriptorCustodyRepository} from './worktree-lifecycle.mjs';
import {createControlledMethodRuntimeFixture,inspectSourceOwnedCurrentAuthorityContext,spawnRequesterChild,createRequesterTransportMethodFault,withRequesterTransportMethodFault} from './session-requester-bridge.mjs';

// Genuine local processes/private custody/descriptor transport under an explicit
// controlled-method fixture. This never claims a productive native admission.
test('supported native POSIX host requester binds genuine current process and refuses unowned handles', {skip:!['linux','darwin'].includes(process.platform)},async()=>{
  const scratch=resolve('scratch');mkdirSync(scratch,{recursive:true});
  const root=realpathSync(mkdtempSync(join(scratch,'darwin-requester-integration-')));chmodSync(root,0o700);
  let runtime;
  try{
    const git=spawnSync('git',['init','-q',root],{encoding:'utf8'});assert.equal(git.status,0,git.stderr);
    const repository=discoverRepository(root);
    runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/native-posix-observation'),sessionId:'native-posix-observation'});
    assert.equal(inspectSourceOwnedCurrentAuthorityContext({repository}).status,'unavailable');
    await runtime.run(async()=>{
      assert.equal(inspectSourceOwnedCurrentAuthorityContext({repository}).status,'bound');
      const request={repository,requesterHandle:Object.freeze({}),executablePath:realpathSync(process.execPath),args:['-e','setTimeout(()=>{},1000)'],cwd:root,channelFd:4,startupTimeoutMs:10000};
      assert.equal((await spawnRequesterChild(request,runtime.runtimePort)).status,'unavailable');
    });
    assert.equal(inspectSourceOwnedCurrentAuthorityContext({repository}).status,'unavailable');
  }finally{if(runtime)await runtime.dispose();rmSync(root,{recursive:true,force:true});}
});

test('genuine native POSIX managed entry reserves registry member, observes exec child, binds requester and closes terminal', {skip:!['linux','darwin'].includes(process.platform)||typeof process.execve!=='function'},async()=>{
  const {registerCodexHostProcessRoot}=await import('./codex-host-process-journal.mjs');
  const {spawnManagedCodexHost}=await import('./codex-host-process-supervisor.mjs');
  const {createSessionAuthorityParticipantPorts}=await import('./session-authority-observers.mjs');
  const {initializeSessionAuthorityRegistry}=await import('./session-authority-registry.mjs');
  const scratch=resolve('scratch');mkdirSync(scratch,{recursive:true});
  const root=realpathSync(mkdtempSync(join(scratch,'darwin-managed-integration-')));chmodSync(root,0o700);
  let runtime,managed;
  try{
    const git=args=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
    git(['init','-q']);git(['-c','user.name=Native Fixture','-c','user.email=native-fixture@example.test','commit','--allow-empty','-m','native fixture']);
    mkdirSync(join(root,'.claude'),{mode:0o700});
    writeFileSync(join(root,'.claude','pipeline-state.json'),JSON.stringify({schema:'pipeline.state.v0',activeFeature:{id:'native-observation-fixture',planPath:'specs/native-observation-fixture.md',phase:'design'},planApproved:false,updatedAt:new Date().toISOString()}),{mode:0o600});
    const repository=inspectSignedDescriptorCustodyRepository(root);
    runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/native-managed-observation'),sessionId:'native-managed-observation'});
    await runtime.run(async()=>{
      const ports=createSessionAuthorityParticipantPorts({repository});
      assert.equal(initializeSessionAuthorityRegistry({repository},ports).status,'initialized');
      const journalParent=registerCodexHostProcessRoot({gitCommonDir:repository.commonDir,repoFingerprint:'a'.repeat(64)});
      managed=await spawnManagedCodexHost({journalParent,executablePath:realpathSync(process.execPath),args:['-e','process.stdin.resume();process.stdin.on("end",()=>process.exit(0));setTimeout(()=>process.exit(70),30000)'],cwd:root,
        binding:{repoFingerprint:'a'.repeat(64),dispatchId:'native-platform-delivery',candidateCommit:repository.candidate.commit,requestSha256:'b'.repeat(64)}});
      assert.equal(managed.runWithRequester(()=>inspectSourceOwnedCurrentAuthorityContext({repository}).status),'bound');
      managed.child.stdin.end();
      const result=await managed.finish();assert.equal(result.clean,true,JSON.stringify(result));
    });
  }finally{
    if(managed){try{await managed.stop();}catch(error){process.stderr.write('fixture stop: '+String(error.stack)+'\n');}}if(runtime)await runtime.dispose();
    if(process.platform==='linux'){
      const namespace=join(userInfo().homedir,'.apsp');
      if(existsSync(namespace))for(const name of readdirSync(namespace)){
        if(!/^[a-f0-9]{16}$/u.test(name))continue;
        const slot=join(namespace,name),s=lstatSync(slot),anchor=join(slot,'anchor.json');
        if(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o077)===0&&existsSync(anchor)){
          const record=JSON.parse(readFileSync(anchor,'utf8'));
          if(record.primaryRoot===root&&record.commonDir===join(root,'.git')&&readdirSync(slot).join(',')==='anchor.json')rmSync(slot,{recursive:true});
        }
      }
    }
    rmSync(root,{recursive:true,force:true});
  }
});

for(const faultName of [null,'capability-mismatch','second-frame','oversize'])test('genuine inherited requester channel '+(faultName??'binds source-owned child'),{skip:!['linux','darwin'].includes(process.platform)},async()=>{
  const root=realpathSync(mkdtempSync(join(resolve('scratch'),'darwin-transport-integration-')));chmodSync(root,0o700);
  let runtime;
  try{
    assert.equal(spawnSync('git',['init','-q',root]).status,0);
    const repository=discoverRepository(root),output=join(root,'result.json'),script=join(root,'child.mjs');
    writeFileSync(script,'import {discoverRepository} from '+JSON.stringify(new URL('./worktree-lifecycle.mjs',import.meta.url).href)+';import {readRequesterTransport} from '+JSON.stringify(new URL('./session-requester-bridge.mjs',import.meta.url).href)+';import {writeFileSync} from "node:fs";writeFileSync('+JSON.stringify(output)+',JSON.stringify({status:readRequesterTransport({repository:discoverRepository(process.cwd()),fd:4}).status}));',{mode:0o600});
    runtime=createControlledMethodRuntimeFixture({repository,fixtureRoot:join(repository.commonDir,'agent-pipeline/controlled-method-fixtures/native-transport'),sessionId:'native-transport'});
    await runtime.run(async()=>{
      const spawnChild=()=>spawnRequesterChild({repository,requesterHandle:runtime.requesterHandle,executablePath:realpathSync(process.execPath),args:[script],cwd:root,channelFd:4,startupTimeoutMs:10000},runtime.runtimePort);
      const spawned=faultName?await withRequesterTransportMethodFault({fault:createRequesterTransportMethodFault({fault:faultName})},spawnChild):await spawnChild();
      assert.equal(spawned.status,'spawned');spawned.child.stdout.resume();spawned.child.stderr.resume();
      assert.equal((await spawned.terminal).code,0);
      assert.equal(JSON.parse(readFileSync(output,'utf8')).status,faultName?'unavailable':'bound');
    });
  }finally{if(runtime)await runtime.dispose();rmSync(root,{recursive:true,force:true});}
});

registerTestCaseCompletion({fd:3,maxBytes:16384,cases});

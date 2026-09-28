// SPDX-License-Identifier: SUL-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,chmodSync,lstatSync,renameSync,symlinkSync,readdirSync,readFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createCodexDesignReadinessHostStore} from './codex-design-readiness-host-store.mjs';
import {readLocalRepositoryFingerprint} from './governance-event-store.mjs';
const REPO='a'.repeat(64),ID='drh_'+'b'.repeat(32);
function sharedFixture(t){const root=realpathSync(mkdtempSync(join(tmpdir(),'codex-readiness-shared-parent-')));execFileSync('git',['init','--quiet',root]);t.after(()=>rmSync(root,{recursive:true,force:true}));return {root,common:join(root,'.git')};}
const mode=path=>lstatSync(path).mode&0o777;
function bindingContext(repoFingerprint,onFingerprint=()=>{}){return {get repoFingerprint(){onFingerprint();return repoFingerprint;},dispatchId:'synthetic',candidate:{commit:'c'.repeat(40),tree:'d'.repeat(40)},sources:{},route:{},requestSha256:'e'.repeat(64),reportSha256:'f'.repeat(64)};}
test('Readiness shared parent: actual sanctioned GUID mint leaves0755 shared parent and private descendants unchanged',async t=>{
 const {common,root}=sharedFixture(t),repoFingerprint=await readLocalRepositoryFingerprint({repositoryRoot:root}),shared=join(common,'agent-pipeline'),binding=join(shared,'governance-events','repository-binding.json'),before=readFileSync(binding);
 assert.equal(mode(shared),0o755);const store=createCodexDesignReadinessHostStore({gitCommonDir:common,repoFingerprint});
 assert.equal(mode(shared),0o755);assert.equal(mode(dirname(dirname(store.processRoot))),0o700);assert.equal(mode(dirname(store.processRoot)),0o700);assert.equal(mode(store.processRoot),0o700);assert.equal(mode(join(dirname(store.processRoot),'receipts')),0o700);
 assert.deepEqual(readFileSync(binding),before);let evaluated=0;assert.equal(store.readForBinding(ID,bindingContext(repoFingerprint,()=>evaluated++)),null);assert.equal(evaluated,1);
});
test('Readiness shared parent: common0775 and0777 reject before creating namespace without chmod repair',t=>{
 for(const unsafe of [0o775,0o777]){const {common}=sharedFixture(t);chmodSync(common,unsafe);assert.throws(()=>createCodexDesignReadinessHostStore({gitCommonDir:common,repoFingerprint:REPO}),{code:'CRHS-COMMON-DIR'});assert.equal(mode(common),unsafe);assert.equal(readdirSync(common).includes('agent-pipeline'),false);}
});
test('Readiness shared parent: shared0775 and0777 reject before duty creation without chmod repair',t=>{
 for(const unsafe of [0o775,0o777]){const {common}=sharedFixture(t),shared=join(common,'agent-pipeline');mkdirSync(shared,{mode:0o755});chmodSync(shared,unsafe);assert.throws(()=>createCodexDesignReadinessHostStore({gitCommonDir:common,repoFingerprint:REPO}),{code:'CRHS-SHARED-DIRECTORY'});assert.equal(mode(shared),unsafe);assert.deepEqual(readdirSync(shared),[]);}
});
test('Readiness shared parent: physical common/shared aliases and private0755 duty still refuse',t=>{
 const {common,root}=sharedFixture(t),alias=join(root,'common-alias');symlinkSync(common,alias,'dir');assert.throws(()=>createCodexDesignReadinessHostStore({gitCommonDir:alias,repoFingerprint:REPO}),{code:'CRHS-COMMON-DIR'});
 const shared=join(common,'agent-pipeline'),physical=join(root,'shared-physical');mkdirSync(physical,{mode:0o755});symlinkSync(physical,shared,'dir');assert.throws(()=>createCodexDesignReadinessHostStore({gitCommonDir:common,repoFingerprint:REPO}),{code:'CRHS-SHARED-DIRECTORY'});rmSync(shared);mkdirSync(shared,{mode:0o755});mkdirSync(join(shared,'design-readiness-codex'),{mode:0o755});assert.throws(()=>createCodexDesignReadinessHostStore({gitCommonDir:common,repoFingerprint:REPO}),{code:'host-journal-directory-unsafe'});
});
test('Readiness shared parent: common and shared mode drift gates context reads and write admission',t=>{
 for(const coordinate of ['common','shared'])for(const unsafe of [0o700,0o775]){
  const {common}=sharedFixture(t),shared=join(common,'agent-pipeline');mkdirSync(shared,{mode:0o755});chmodSync(common,0o755);const store=createCodexDesignReadinessHostStore({gitCommonDir:common,repoFingerprint:REPO}),target=coordinate==='common'?common:shared;
  let evaluated=0;assert.equal(store.readForBinding(ID,bindingContext(REPO,()=>evaluated++)),null);assert.equal(evaluated,1);evaluated=0;chmodSync(target,unsafe);
  assert.equal(store.readForBinding(ID,bindingContext(REPO,()=>evaluated++)),null);assert.equal(evaluated,0);assert.equal(store.read(ID,{}),null);assert.throws(()=>store.write({receiptId:ID},{}),{code:'CRHS-ROOT-DRIFT'});assert.deepEqual(readdirSync(join(dirname(store.processRoot),'receipts')),[]);
 }
});
test('Readiness shared parent: exact common and shared inode replacement invalidates an existing store',t=>{
 for(const coordinate of ['common','shared']){
  const {common,root}=sharedFixture(t),shared=join(common,'agent-pipeline');mkdirSync(shared,{mode:0o755});const store=createCodexDesignReadinessHostStore({gitCommonDir:common,repoFingerprint:REPO}),target=coordinate==='common'?common:shared;
  renameSync(target,join(root,'old-'+coordinate));mkdirSync(join(dirname(store.processRoot),'receipts'),{recursive:true,mode:0o700});chmodSync(common,0o755);chmodSync(shared,0o755);
  let evaluated=0;assert.equal(store.readForBinding(ID,bindingContext(REPO,()=>evaluated++)),null);assert.equal(evaluated,0);assert.throws(()=>store.write({receiptId:ID},{}),{code:'CRHS-ROOT-DRIFT'});assert.deepEqual(readdirSync(join(dirname(store.processRoot),'receipts')),[]);
 }
});

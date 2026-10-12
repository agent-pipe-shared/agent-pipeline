import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,git} from './fixture.mjs';
const opts=p=>({activate:true,planSha256:p.planSha256});
function sibling(f,decision='decline',name='linked'){
 const path=join(f.base,name);git(f.root,['worktree','add','-b',name,path]);
 if(decision){const p=f.scope.planDecision({rootDir:path,decision,by:'Fixture Owner'});f.scope.applyDecision(p,opts(p));}return path;
}
test('explicitly declined sibling: conflict-free plan, owned hooks retired, content and sibling preserved',t=>{
 const f=fixture(t,{keys:false}),linked=sibling(f),before=f.digests(),siblingHead=git(linked,['rev-parse','HEAD']),p=f.controller.plan({rootDir:f.root});
 assert.deepEqual(p.conflicts,[]);assert.equal(f.controller.apply(p,opts(p)).status,'uninstalled');
 assert.deepEqual(f.digests(),before);assert.equal(git(linked,['rev-parse','HEAD']),siblingHead);assert.equal(f.scope.observe({rootDir:linked}).state,'declined');
 for(const h of p.git.hooks)assert.equal(existsSync(h.hookPath),false);
 assert.equal(f.controller.resume({rootDir:f.root,...opts(p)}).status,'uninstalled');
});
test('unknown sibling refuses planning, retains owned hooks',t=>{
 const f=fixture(t,{keys:false});sibling(f,null);assert.throws(()=>f.controller.plan({rootDir:f.root}),e=>e.code==='PU-SHARED-ACTIVE-WORKTREE');
 assert(existsSync(join(f.root,'.git/hooks/pre-commit')));
});
test('active sibling refuses planning, retains content and hooks',t=>{
 const f=fixture(t,{keys:false});sibling(f,'enroll');const before=f.digests();assert.throws(()=>f.controller.plan({rootDir:f.root}),e=>e.code==='PU-SHARED-ACTIVE-WORKTREE');assert.deepEqual(f.digests(),before);assert(existsSync(join(f.root,'.git/hooks/pre-commit')));
});
test('additional declined sibling after journal is topology drift, journal and hooks unchanged',t=>{
 const f=fixture(t,{keys:false});sibling(f);const p=f.controller.plan({rootDir:f.root});assert.throws(()=>f.controller.apply(p,{...opts(p),crashAt:'journal'}),e=>e.code==='PU-SIMULATED-FAULT');
 const journal=join(p.controls,p.planSha256,'journal.json'),before=readFileSync(journal);sibling(f,'decline','extra');assert.throws(()=>f.controller.resume({rootDir:f.root,...opts(p)}),e=>e.code==='PU-SHARED-SCOPE-DRIFT');assert.deepEqual(readFileSync(journal),before);assert(existsSync(join(f.root,'.git/hooks/pre-commit')));
});
test('modified user hook remains untouched and prevents retirement',t=>{
 const f=fixture(t,{keys:false});sibling(f);const hook=join(f.root,'.git/hooks/pre-commit');writeFileSync(hook,'#!/bin/sh\n# user hook\n');const bytes=readFileSync(hook),p=f.controller.plan({rootDir:f.root});assert.throws(()=>f.controller.apply(p,opts(p)),e=>e.code==='PU-FOREIGN-HOOK-CONFLICT');assert.deepEqual(readFileSync(hook),bytes);
});
test('declined sibling reenrollment after journal refuses before hook mutation',t=>{
 const f=fixture(t,{keys:false}),linked=sibling(f),p=f.controller.plan({rootDir:f.root});assert.throws(()=>f.controller.apply(p,{...opts(p),crashAt:'journal'}),e=>e.code==='PU-SIMULATED-FAULT');
 const enrollment=f.scope.planDecision({rootDir:linked,decision:'enroll',by:'Fixture Owner'});f.scope.applyDecision(enrollment,opts(enrollment));
 const journal=join(p.controls,p.planSha256,'journal.json'),before=readFileSync(journal);assert.throws(()=>f.controller.resume({rootDir:f.root,...opts(p)}),e=>e.code==='PU-SHARED-SCOPE-DRIFT');assert.deepEqual(readFileSync(journal),before);assert(existsSync(join(f.root,'.git/hooks/pre-commit')));
});
test('declined sibling partial shim interruption resumes exact owned objects',t=>{
 const f=fixture(t,{keys:false});sibling(f);const before=f.digests(),p=f.controller.plan({rootDir:f.root});assert.throws(()=>f.controller.apply(p,{...opts(p),crashDuringShim:'pre-commit'}),e=>e.code==='PU-SIMULATED-AFTER-SHIM');
 assert.equal(existsSync(join(f.root,'.git/hooks/pre-commit')),false);assert.equal(f.controller.resume({rootDir:f.root,...opts(p)}).status,'uninstalled');assert.deepEqual(f.digests(),before);
});

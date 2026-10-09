// SPDX-License-Identifier: SUL-1.0
// Real signed package operations in disposable simulated caches and Git repositories.
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { registerTestCaseCompletion } from './test-case-completion.mjs';
import fs from 'node:fs';
import cp from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const sourceLib = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(sourceLib, '..');
const repositoryRoot = resolve(pluginRoot, '../..');
const scratchRoot = join(repositoryRoot, 'scratch');
fs.mkdirSync(scratchRoot, { recursive: true });
const owned = fs.mkdtempSync(join(scratchRoot, 'signed-quality-package-scratch-'));
after(() => fs.rmSync(owned, { recursive: true, force: true }));
const cases = [];
function test(name, run) {
  cases.push({ id: 'QPS' + String(cases.length + 1).padStart(3, '0'), name, run });
}

// The closed local import graph and its two runtime JSON assets come from the
// actual library beside this test. No installed cache or historical Scratch
// source is consulted. Every copied module is checked byte for byte.
function copyPluginGraph(version) {
  const copied = new Set();
  function copyModule(source, target) {
    if (copied.has(source)) return;
    const inside = relative(pluginRoot, source);
    assert.ok(inside && inside !== '..' && !inside.startsWith('..' + sep), 'dependency remains in plugin');
    copied.add(source);
    fs.mkdirSync(dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    assert.deepEqual(fs.readFileSync(target), fs.readFileSync(source), 'immutable source copy');
    for (const match of fs.readFileSync(source, 'utf8').matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g)) {
      copyModule(resolve(dirname(source), match[1]), resolve(dirname(target), match[1]));
    }
  }
  copyModule(join(sourceLib, 'signed-quality-package.mjs'), join(version, 'lib/signed-quality-package.mjs'));
  for (const path of ['config/runner-profiles-v3.json', 'scripts/pipeline-user-v3.schema.json']) {
    const target = join(version, path);
    fs.mkdirSync(dirname(target), { recursive: true });
    fs.copyFileSync(join(pluginRoot, path), target);
    assert.deepEqual(fs.readFileSync(target), fs.readFileSync(join(pluginRoot, path)), 'immutable runtime asset copy');
  }
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root,args) => cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
let sequence=0;
async function fixture() {
  const graph = fs.mkdtempSync(join(owned,'fixture-'));
  const container=join(graph,'cache/pipeline-core');
  const modulePath=join(container,'version/lib/signed-quality-package.mjs');
  copyPluginGraph(join(container,'version'));
  const api=await import(pathToFileURL(modulePath).href+'?fixture='+sequence++);
  assert.equal(sha(fs.readFileSync(modulePath)),sha(fs.readFileSync(join(sourceLib,'signed-quality-package.mjs'))),'exact source copy');
  const root=join(graph,'target'); fs.mkdirSync(root);
  git(root,['init','-q']); git(root,['config','user.name','Fixture']); git(root,['config','user.email','fixture@example.invalid']);
  fs.mkdirSync(join(root,'scratch')); fs.writeFileSync(join(root,'.gitignore'),'/scratch/\n');
  fs.writeFileSync(join(root,'subject.txt'),'before\n'); git(root,['add','.gitignore','subject.txt']); git(root,['commit','-qm','fixture base']);
  const record={schema:api.SIGNED_QUALITY_PACKAGE_SCHEMA,baseCommit:git(root,['rev-parse','HEAD']),unifiedDiff:'diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n',expectedDigests:{'subject.txt':sha('after\n')}};
  const keys=generateKeyPairSync('ed25519'); const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
  const proofFor=record=>{record.intentSha256=api.qualityPackageIntentSha256(record);return {schema:'pipeline.po-approval-proof.v1',intentSha256:record.intentSha256,keyReference:'fixture-key',publicKey,signatureBase64:sign(null,Buffer.from(record.intentSha256),keys.privateKey).toString('base64')};};
  const proof=proofFor(record); const trustPolicy={keyReference:'fixture-key',publicKeySha256:sha(publicKey)};
  return {graph,container,root,api,record,proof,proofFor,trustPolicy};
}
function operation(item,mode) {
  const before=fs.readdirSync(item.container).sort(); const tempPrefixes=[]; const worktrees=[];
  const originalTemp=fs.mkdtempSync, originalSpawn=cp.spawnSync;
  // Observe built-in calls; do not change arguments, return values or module source.
  fs.mkdtempSync=function(prefix,...rest){tempPrefixes.push(String(prefix));return originalTemp.call(this,prefix,...rest);};
  cp.spawnSync=function(command,args,...rest){if(command==='git'&&args[0]==='worktree'&&args[1]==='add')worktrees.push(args[3]);return originalSpawn.call(this,command,args,...rest);};
  syncBuiltinESMExports();
  let result;
  try {
    const record=mode==='failure'?{...item.record,expectedDigests:{'subject.txt':sha('wrong\n')}}:item.record;
    const proof=mode==='failure'?item.proofFor(record):item.proof;
    result=item.api.applyQualityPackage({repoRoot:item.root,packageIntent:record,proof,trustPolicy:item.trustPolicy,applyToMain:mode==='apply'});
  } finally {fs.mkdtempSync=originalTemp;cp.spawnSync=originalSpawn;syncBuiltinESMExports();}
  assert.equal(result.code,{verify:'QUALITY-PACKAGE-VERIFIED',apply:'QUALITY-PACKAGE-APPLIED',failure:'QUALITY-PACKAGE-READBACK-MISMATCH'}[mode],'real operation reached expected branch');
  assert.equal(tempPrefixes.length,1,'temporary checkout actually allocated'); assert.equal(worktrees.length,1,'actual Git worktree add observed');
  assert.equal(fs.readFileSync(join(item.root,'subject.txt'),'utf8'),mode==='apply'?'after\n':'before\n','main bytes preserved or exactly applied');
  assert.equal(fs.existsSync(worktrees[0]),false,'temporary checkout removed on completion/failure');
  assert.equal(git(item.root,['worktree','list','--porcelain']).split('\n').filter(line=>line.startsWith('worktree ')).length,1,'Git worktree registration cleaned');
  assert.deepEqual(fs.readdirSync(join(item.root,'scratch')),[],'target Scratch left clean');
  return {before,after:fs.readdirSync(item.container).sort(),tempPrefixes,worktrees};
}
for(const mode of ['verify','apply','failure']) {
  test('control: '+mode+' retains signature/byte behavior and cleans actual worktree',async()=>{
    const item=await fixture(); try {operation(item,mode);} finally {fs.rmSync(item.graph,{recursive:true,force:true});}
  });
  test('target Scratch placement: '+mode,async()=>{
    const item=await fixture(); try {
      const observed=operation(item,mode);
      const inside=relative(join(item.root,'scratch'),observed.worktrees[0]);
      assert.ok(inside && inside!=='..' && !inside.startsWith('..'+sep) && !inside.startsWith(sep),'actual materializer worktree must be beneath TARGET repository Scratch');
    } finally {fs.rmSync(item.graph,{recursive:true,force:true});}
  });
  test('cached version-container siblings unchanged: '+mode,async()=>{
    const item=await fixture(); try {const observed=operation(item,mode);assert.deepEqual(observed.after,observed.before,'materializer must not create a sibling in simulated installed version container');}
    finally {fs.rmSync(item.graph,{recursive:true,force:true});}
  });
}
test('control: invalid signature, exact source binding and no overwrite',async()=>{
  const item=await fixture(); try {
    assert.equal(item.api.applyQualityPackage({repoRoot:item.root,packageIntent:item.record,proof:{...item.proof,signatureBase64:'AA=='},trustPolicy:item.trustPolicy}).ok,false);
    const tampered={...item.record,unifiedDiff:item.record.unifiedDiff.replace('after','other')};
    assert.equal(item.api.applyQualityPackage({repoRoot:item.root,packageIntent:tampered,proof:item.proof,trustPolicy:item.trustPolicy}).code,'QUALITY-PACKAGE-INVALID');
    fs.writeFileSync(join(item.root,'subject.txt'),'local edits\n');
    assert.equal(item.api.applyQualityPackage({repoRoot:item.root,packageIntent:item.record,proof:item.proof,trustPolicy:item.trustPolicy,applyToMain:true}).code,'QUALITY-PACKAGE-BASE-DRIFT');
    assert.equal(fs.readFileSync(join(item.root,'subject.txt'),'utf8'),'local edits\n');
    assert.deepEqual(fs.readdirSync(item.container),['version'],'rejected inputs allocate no plugin sibling');
  } finally {fs.rmSync(item.graph,{recursive:true,force:true});}
});

function snapshot(path) {
  let stat; try { stat=fs.lstatSync(path); } catch(error) { if(error.code==='ENOENT') return {absent:true}; throw error; }
  if(stat.isSymbolicLink()) return {link:fs.readlinkSync(path)};
  if(stat.isFile()) return {sha256:sha(fs.readFileSync(path)),mode:stat.mode};
  return Object.fromEntries(fs.readdirSync(path).sort().map(name=>[name,snapshot(join(path,name))]));
}
for(const kind of ['regular-file','sibling-symlink','dangling-symlink']) {
  test('unsafe Scratch safely rejects signed apply: '+kind,async()=>{
    const graph=fs.mkdtempSync(join(owned,'unsafe-'+kind+'-'));
    const container=join(graph,'cache/pipeline-core');
    try {
    copyPluginGraph(join(container,'version'));
    const modulePath=join(container,'version/lib/signed-quality-package.mjs');
    const api=await import(pathToFileURL(modulePath).href);
    assert.equal(sha(fs.readFileSync(modulePath)),sha(fs.readFileSync(join(sourceLib,'signed-quality-package.mjs'))));
    const root=join(graph,'target'); fs.mkdirSync(root);
    git(root,['init','-q']); git(root,['config','user.name','Fixture']); git(root,['config','user.email','fixture@example.invalid']);
    fs.writeFileSync(join(root,'.gitignore'),'/scratch\n'); fs.writeFileSync(join(root,'subject.txt'),'before\n');
    git(root,['add','.gitignore','subject.txt']); git(root,['commit','-qm','fixture base']);
    const scratch=join(root,'scratch'); const destination=join(graph,'controlled-sibling');
    if(kind==='regular-file') fs.writeFileSync(scratch,'scratch file sentinel\n');
    else {
      if(kind==='sibling-symlink') { fs.mkdirSync(destination); fs.writeFileSync(join(destination,'sentinel.txt'),'destination sentinel\n'); }
      fs.symlinkSync(destination,scratch,'dir');
    }
    const record={schema:api.SIGNED_QUALITY_PACKAGE_SCHEMA,baseCommit:git(root,['rev-parse','HEAD']),unifiedDiff:'diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n',expectedDigests:{'subject.txt':sha('after\n')}};
    record.intentSha256=api.qualityPackageIntentSha256(record);
    const keys=generateKeyPairSync('ed25519'); const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
    const proof={schema:'pipeline.po-approval-proof.v1',intentSha256:record.intentSha256,keyReference:'fixture-key',publicKey,signatureBase64:sign(null,Buffer.from(record.intentSha256),keys.privateKey).toString('base64')};
    const trustPolicy={keyReference:'fixture-key',publicKeySha256:sha(publicKey)};
    const before={cache:snapshot(container),scratch:snapshot(scratch),destination:snapshot(destination),subject:sha(fs.readFileSync(join(root,'subject.txt'))),registrations:git(root,['worktree','list','--porcelain']),status:git(root,['status','--porcelain'])};
    assert.equal(before.status,'','valid clean apply fixture');
    const tempPrefixes=[],worktreeAdds=[];
    const originalTemp=fs.mkdtempSync,originalSpawn=cp.spawnSync;
    fs.mkdtempSync=function(prefix,...args){tempPrefixes.push(String(prefix));return originalTemp.call(this,prefix,...args);};
    cp.spawnSync=function(command,args,...rest){if(command==='git'&&args[0]==='worktree'&&args[1]==='add')worktreeAdds.push(args);return originalSpawn.call(this,command,args,...rest);};
    syncBuiltinESMExports();
    let result;
    try { result=api.applyQualityPackage({repoRoot:root,packageIntent:record,proof,trustPolicy,applyToMain:true}); }
    finally {fs.mkdtempSync=originalTemp;cp.spawnSync=originalSpawn;syncBuiltinESMExports();}
    const after={cache:snapshot(container),scratch:snapshot(scratch),destination:snapshot(destination),subject:sha(fs.readFileSync(join(root,'subject.txt'))),registrations:git(root,['worktree','list','--porcelain']),status:git(root,['status','--porcelain'])};
    const checks={explicitRejection:result.ok===false&&result.code==='QUALITY-PACKAGE-SCRATCH-INVALID',noTemporaryAllocation:tempPrefixes.length===0,noActualWorktreeAdd:worktreeAdds.length===0,cacheUnchanged:JSON.stringify(after.cache)===JSON.stringify(before.cache),scratchUnchanged:JSON.stringify(after.scratch)===JSON.stringify(before.scratch),destinationUnchanged:JSON.stringify(after.destination)===JSON.stringify(before.destination),targetSubjectUnchanged:after.subject===before.subject,registrationsClean:after.registrations===before.registrations,targetStatusUnchanged:after.status===before.status};

    assert.deepEqual(checks,Object.fromEntries(Object.keys(checks).map(key=>[key,true])),'safe rejection before temporary allocation or real worktree add, with exact preservation');
    } finally { fs.rmSync(graph,{recursive:true,force:true}); }
  });
}

registerTestCaseCompletion({
  cases,
  fd: process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined ? 3 : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD),
  maxBytes: 16384,
});

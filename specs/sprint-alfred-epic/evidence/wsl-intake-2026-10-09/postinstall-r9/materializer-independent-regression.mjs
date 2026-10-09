// Independent behavioral RED contract. All copies and Git repositories live under owned Scratch.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import cp from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const owned = dirname(fileURLToPath(import.meta.url));
const sourceLib = join(owned,'baseline-cache/pipeline-core/version/lib');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root,args) => cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
let sequence=0;
async function fixture() {
  const graph = fs.mkdtempSync(join(owned,'fixture-'));
  const container=join(graph,'cache/pipeline-core');
  const modulePath=join(container,'version/lib/signed-quality-package.mjs');
  fs.cpSync(dirname(sourceLib),join(container,'version'),{recursive:true});
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
  test('green control: '+mode+' retains signature/byte behavior and cleans actual worktree',async()=>{
    const item=await fixture(); try {operation(item,mode);} finally {fs.rmSync(item.graph,{recursive:true,force:true});}
  });
  test('RED target Scratch placement: '+mode,async()=>{
    const item=await fixture(); try {
      const observed=operation(item,mode);
      const inside=relative(join(item.root,'scratch'),observed.worktrees[0]);
      assert.ok(inside && inside!=='..' && !inside.startsWith('..'+sep) && !inside.startsWith(sep),'actual materializer worktree must be beneath TARGET repository Scratch');
    } finally {fs.rmSync(item.graph,{recursive:true,force:true});}
  });
  test('RED cached version-container siblings unchanged: '+mode,async()=>{
    const item=await fixture(); try {const observed=operation(item,mode);assert.deepEqual(observed.after,observed.before,'materializer must not create a sibling in simulated installed version container');}
    finally {fs.rmSync(item.graph,{recursive:true,force:true});}
  });
}
test('green control: invalid signature, exact source binding and no overwrite',async()=>{
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

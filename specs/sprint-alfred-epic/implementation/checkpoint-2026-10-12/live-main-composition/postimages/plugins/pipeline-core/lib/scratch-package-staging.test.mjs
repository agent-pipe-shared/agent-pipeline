// Root-only substantive controls. Source author has not executed this file.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, lstatSync, linkSync, mkdirSync, mkdtempSync,
  readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerPackageStaging, inspectPackageStaging, beginPackageSweep,
  recheckPackageSweepMember, recordPackageSweepDeletion, closePackageSweep } from './scratch-package-staging.mjs';
import { planSweep } from './scratch-retention.mjs';
import { canonicalizeJson } from './governance-event.mjs';
import { registerTestCaseCompletion } from './test-case-completion.mjs';

const cli=fileURLToPath(new URL('../scripts/scratch-sweep.mjs',import.meta.url));
const cases=[],sha=b=>createHash('sha256').update(b).digest('hex');
const test=(id,name,run)=>cases.push({id,name,run});
function fixture(t,{payload=null,old=false}={}) {
  const root=mkdtempSync(join(tmpdir(),'alfred-spc-owned-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const hooks=join(root,'fixture-empty-hooks');mkdirSync(hooks);
  const git=args=>execFileSync('git',['-c',`core.hooksPath=${hooks}`,...args],{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:4194304,stdio:['ignore','pipe','pipe']}).trim();
  git(['init','--quiet']);git(['config','user.name','Controlled scratch fixture']);git(['config','user.email','spc@example.invalid']);
  const files=payload??{'a.bin':Buffer.from([0,255,13,10]),'nested/b.txt':Buffer.from('actual committed package bytes\n')};
  for(const [name,bytes]of Object.entries(files)){const target=join(root,'public-package',name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);chmodSync(target,0o644);}
  git(['add','--','public-package']);git(['commit','--quiet','-m','controlled package committed']);
  const packageCommit=git(['rev-parse','HEAD']),publicPrefix='public-package',stagingPath='scratch/package';
  mkdirSync(join(root,'scratch'));cpSync(join(root,publicPrefix),join(root,stagingPath),{recursive:true});
  const paths=Object.keys(files).sort().map(name=>`${stagingPath}/${name}`);
  if(old)for(const p of paths)utimesSync(join(root,p),new Date(0),new Date(0));
  const args={root,stagingPath,packageCommit,publicPrefix};
  const call=(argv)=>spawnSync(process.execPath,[cli,'--root',root,...argv],{encoding:'utf8',timeout:30000,maxBuffer:1048576,stdio:['ignore','pipe','pipe']});
  return {root,git,args,paths,call,register:()=>registerPackageStaging(args),store:join(root,'.git','agent-pipeline','scratch-package-staging')};
}
function registration(f){const result=f.register();assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(Object.keys(result).sort(),['code','memberCount','ok','receiptSha256']);return result;}
function held(f){const observed=inspectPackageStaging({root:f.root});assert.equal(observed.delete.length,0);assert.ok(observed.holds.length);assert.equal(planSweep({root:f.root}).delete.some(p=>p.startsWith('scratch/package/')),false);}
const snapshot=f=>Object.fromEntries(f.paths.filter(p=>existsSync(join(f.root,p))).map(p=>[p,{sha:sha(readFileSync(join(f.root,p))),ino:String(lstatSync(join(f.root,p),{bigint:true}).ino)}]));

test('SPC001','complete raw committed suffix set registers, previews and applies only original members',t=>{
 const f=fixture(t),before=snapshot(f),registered=f.call(['--register-staging','--staging-path',f.args.stagingPath,'--package-commit',f.args.packageCommit,'--public-prefix',f.args.publicPrefix]);
 assert.equal(registered.status,0,registered.stderr);assert.equal(JSON.parse(registered.stdout).ok,true);
 const r=registration(f),receipt=join(f.store,`${r.receiptSha256}.json`);
 assert.equal(lstatSync(receipt).nlink,1);assert.equal(sha(readFileSync(receipt)),r.receiptSha256);assert.equal(r.memberCount,2);
 assert.equal(f.register().receiptSha256,r.receiptSha256,'identical registration is immutable readback');
 for(const mode of ['--check','--sweep']){const p=f.call([mode]);assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout).plan.delete,f.paths);assert.deepEqual(snapshot(f),before);}
 const out=f.call(['--apply']);assert.equal(out.status,0,out.stderr);const report=JSON.parse(out.stdout);assert.deepEqual(report.deleted,f.paths);assert.ok(existsSync(join(f.root,'scratch/package/nested')),'empty directories remain');assert.equal(existsSync(receipt),true);assert.equal(sha(readFileSync(join(f.root,'public-package/a.bin'))),before[f.paths[0]].sha);
});
test('SPC002','real Git commit and tree provenance rejects alternate or nonregular views',t=>{
 for(const kind of ['abbreviated','zero','branch','blob','prefix-missing','index-only','symlink-tree']) {
  const f=fixture(t);let input={...f.args};
  if(kind==='abbreviated')input.packageCommit=input.packageCommit.slice(0,12);
  if(kind==='zero')input.packageCommit='0'.repeat(input.packageCommit.length);
  if(kind==='branch')input.packageCommit='HEAD';
  if(kind==='blob')input.packageCommit=f.git(['rev-parse','HEAD:public-package/a.bin']);
  if(kind==='prefix-missing')input.publicPrefix='not-committed';
  if(kind==='index-only'){mkdirSync(join(f.root,'index-only'));writeFileSync(join(f.root,'index-only/a.txt'),'index only');f.git(['add','index-only']);input.publicPrefix='index-only';}
  if(kind==='symlink-tree'){symlinkSync('a.bin',join(f.root,'public-package/link.txt'));f.git(['add','public-package/link.txt']);f.git(['commit','--quiet','-m','actual symlink object']);input.packageCommit=f.git(['rev-parse','HEAD']);}
  const before=snapshot(f);assert.equal(registerPackageStaging(input).ok,false,kind);assert.deepEqual(snapshot(f),before,kind);assert.equal(existsSync(f.store),false,'refused join creates no registration');
 }
});
test('SPC003','the complete staging/committed bijection and raw regular modes cannot be selected piecemeal',t=>{
 for(const kind of ['missing','extra','bytes','mode','case-collision','escape']) {
  const f=fixture(t);if(kind==='missing')unlinkSync(join(f.root,f.paths[0]));
  if(kind==='extra')writeFileSync(join(f.root,'scratch/package/extra.txt'),'unmapped durable decision');
  if(kind==='bytes')writeFileSync(join(f.root,f.paths[0]),'different raw bytes');
  if(kind==='mode')chmodSync(join(f.root,f.paths[0]),0o755);
  if(kind==='case-collision')writeFileSync(join(f.root,'scratch/package/A.bin'),readFileSync(join(f.root,f.paths[0])));
  const input=kind==='escape'?{...f.args,stagingPath:'scratch/package/../package'}:f.args;
  assert.equal(registerPackageStaging(input).ok,false,kind);assert.equal(existsSync(f.store),false,kind);
 }
});
test('SPC004','physical targets and existing tracked/reference/dispatch/live exclusions precede registration',t=>{
 for(const kind of ['root','dispatch','tracked','referenced','file-link','parent-link','hardlink','directory-member','oversize','live']) {
  const f=fixture(t);let input={...f.args},restore=null;
  if(kind==='root')input.stagingPath='scratch';
  if(kind==='dispatch'){renameSync(join(f.root,'scratch/package'),join(f.root,'scratch/dispatch'));input.stagingPath='scratch/dispatch';}
  if(kind==='tracked')f.git(['add','--',f.paths[0]]);
  if(kind==='referenced'){writeFileSync(join(f.root,'reference.md'),f.paths[0]);f.git(['add','reference.md']);}
  if(kind==='file-link'){unlinkSync(join(f.root,f.paths[0]));symlinkSync(join(f.root,'public-package/a.bin'),join(f.root,f.paths[0]));}
  if(kind==='parent-link'){renameSync(join(f.root,'scratch/package'),join(f.root,'scratch/elsewhere'));symlinkSync(join(f.root,'scratch/elsewhere'),join(f.root,'scratch/package'),'dir');}
  if(kind==='hardlink'){unlinkSync(join(f.root,f.paths[0]));linkSync(join(f.root,'public-package/a.bin'),join(f.root,f.paths[0]));}
  if(kind==='directory-member'){unlinkSync(join(f.root,f.paths[0]));mkdirSync(join(f.root,f.paths[0]));}
  if(kind==='oversize')writeFileSync(join(f.root,f.paths[0]),Buffer.alloc(1048577));
  if(kind==='live'){mkdirSync(join(f.root,'scratch/package/hooks'));mkdirSync(join(f.root,'scratch/package/.claude-plugin'));writeFileSync(join(f.root,'scratch/package/.claude-plugin/plugin.json'),'{}');const prior=process.env.CLAUDE_PLUGIN_ROOT;process.env.CLAUDE_PLUGIN_ROOT=join(f.root,'scratch/package');restore=()=>{if(prior===undefined)delete process.env.CLAUDE_PLUGIN_ROOT;else process.env.CLAUDE_PLUGIN_ROOT=prior;};}
  try{assert.equal(registerPackageStaging(input).ok,false,kind);assert.equal(existsSync(f.store),false,kind);}finally{restore?.();}
 }
});
test('SPC005','registered file/parent/membership/reference drift holds the whole old set without age fallback',t=>{
 for(const kind of ['content','extra-durable','missing','mode','inode','parent','reference']) {
  const f=fixture(t,{old:true});registration(f);
  if(kind==='content')writeFileSync(join(f.root,f.paths[0]),'replaced bytes');
  if(kind==='extra-durable')writeFileSync(join(f.root,'scratch/package/decision.md'),'only local decision');
  if(kind==='missing')unlinkSync(join(f.root,f.paths[0]));
  if(kind==='mode')chmodSync(join(f.root,f.paths[0]),0o755);
  if(kind==='inode'){const b=readFileSync(join(f.root,f.paths[0]));unlinkSync(join(f.root,f.paths[0]));writeFileSync(join(f.root,f.paths[0]),b);}
  if(kind==='parent'){renameSync(join(f.root,'scratch/package/nested'),join(f.root,'retained-old-nested'));mkdirSync(join(f.root,'scratch/package/nested'));cpSync(join(f.root,'retained-old-nested/b.txt'),join(f.root,f.paths[1]));}
  if(kind==='reference'){writeFileSync(join(f.root,'new-reference.md'),f.paths[0]);f.git(['add','new-reference.md']);}
  held(f);const before=snapshot(f),applied=f.call(['--apply']);assert.equal(applied.status,0,applied.stderr);assert.deepEqual(JSON.parse(applied.stdout).deleted,[]);assert.deepEqual(snapshot(f),before,kind);
 }
});
test('SPC006','closed immutable receipts refuse corruption, foreign binding, hardlinks and fabricated grants',t=>{
 for(const kind of ['content','open-schema','foreign','hardlink','unknown-file']) {
  const f=fixture(t,{old:true}),r=registration(f),path=join(f.store,`${r.receiptSha256}.json`);
  if(kind==='content')writeFileSync(path,'{"corrupt":true}');
  if(kind==='open-schema'){const v=JSON.parse(readFileSync(path));v.permission=true;const bytes=Buffer.from(canonicalizeJson(v));unlinkSync(path);writeFileSync(join(f.store,`${sha(bytes)}.json`),bytes,{mode:0o600});}
  if(kind==='foreign'){const other=fixture(t);const rr=registration(other);unlinkSync(path);cpSync(join(other.store,`${rr.receiptSha256}.json`),join(f.store,`${rr.receiptSha256}.json`));}
  if(kind==='hardlink')linkSync(path,join(f.root,'receipt-other-link'));
  if(kind==='unknown-file')writeFileSync(join(f.store,'unknown.json'),'{}',{mode:0o600});
  held(f);const before=snapshot(f);assert.equal(f.register().ok,false,kind);assert.deepEqual(snapshot(f),before);
 }
});
test('SPC007','original age semantics and owned interruption/replay retain exact remaining package members',t=>{
 const plain=fixture(t,{old:true});assert.deepEqual(planSweep({root:plain.root}).delete,plain.paths);
 for(const argv of [['--apply','--now','2099-01-01'],['--apply','--staging-path','scratch/package'],['--register-staging','--now','2099-01-01','--staging-path','scratch/package','--package-commit',plain.args.packageCommit,'--public-prefix','public-package']]) {
  const before=snapshot(plain),p=plain.call(argv);assert.equal(p.status,1);assert.deepEqual(snapshot(plain),before);
 }
 const f=fixture(t,{old:true});registration(f);const op=beginPackageSweep({root:f.root}),first=f.paths[0],last=f.paths[1];
 try{assert.deepEqual(op.inspection.delete,f.paths);assert.throws(()=>recordPackageSweepDeletion(op.handle,first));
  recheckPackageSweepMember(op.handle,first);unlinkSync(join(f.root,first));recordPackageSweepDeletion(op.handle,first);
  writeFileSync(join(f.root,last),'foreign replacement after one real deletion');assert.throws(()=>recheckPackageSweepMember(op.handle,last));assert.ok(existsSync(join(f.root,last)));assert.ok(existsSync(join(f.root,'scratch/package')));
 }finally{closePackageSweep(op.handle);}
 held(f);assert.equal(planSweep({root:f.root}).delete.includes(last),false);assert.equal(existsSync(join(f.root,first)),false);assert.equal(readFileSync(join(f.root,last),'utf8'),'foreign replacement after one real deletion');
});

if(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD!=='3')throw new Error('SPC controls require genuine Root-inherited FD3');
registerTestCaseCompletion({cases,fd:3,maxBytes:65536});

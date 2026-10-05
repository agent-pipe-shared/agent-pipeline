// SPDX-License-Identifier: SUL-1.0
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,openSync} from 'node:fs';
import {tmpdir, devNull} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {registerTestCaseCompletion} from '../../plugins/pipeline-core/lib/test-case-completion.mjs';
import {parseVerifyCaseCompletion,verifyCaseCompletionPolicySha256} from '../../plugins/pipeline-core/lib/verify-case-completion-receipt.mjs';
import {AUGMENTATION_SCHEMA,AUGMENTATION_PATH,validateVerifyCaseCompletionAugmentations,applyVerifyCaseCompletionAugmentations,loadAndApplyVerifyCaseCompletionAugmentations} from './verify-case-completion-augmentation.mjs';
const policy=()=>({schema:'pipeline.verify-case-completion-policy.v1',caseIds:['actual-one','actual-two'],maxBytes:4096});
const policySha256=value=>verifyCaseCompletionPolicySha256(value);
const suites=()=>[{name:'existing',file:'plugins/pipeline-core/lib/existing.test.mjs',invariantPinned:'original invariant',nonOverlapNote:'original coverage',durationMs:123},{name:'unaffected',file:'plugins/pipeline-core/lib/unaffected.test.mjs'}];
const table=(caseCompletion=policy())=>({schema:AUGMENTATION_SCHEMA,augmentations:[{name:'existing',file:suites()[0].file,caseCompletion}]});
function write(root,path,body){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),body);}
function fixture(t){const root=mkdtempSync(join(tmpdir(),'completion-augmentation-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function git(root,args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function commit(root){git(root,['add','.']);git(root,['commit','-qm','controlled candidate']);return git(root,['rev-parse','HEAD']);}
function initialize(root){git(root,['init','-q']);git(root,['config','user.email','fixture@example.invalid']);git(root,['config','user.name','Fixture']);write(root,'README','controlled fixture');}
const cases=[];function check(id,name,run){cases.push({id,name,run});}

check('VAC001','exact augmentation fills absent policy without changing any original row or order',()=>{
  const original=suites(),before=JSON.stringify(original),result=applyVerifyCaseCompletionAugmentations(original,table());
  assert.equal(result.ok,true);assert.equal(result.suites.length,original.length);assert.deepEqual(result.suites.map(s=>[s.name,s.file]),original.map(s=>[s.name,s.file]));
  assert.equal(JSON.stringify(original),before);assert.deepEqual(result.suites[0],{...original[0],caseCompletion:policy()});assert.equal(result.suites[1],original[1]);
});
check('VAC002','absent optional file preserves historical rows while present unknown policies cannot remain unconsumed',t=>{
  const root=fixture(t),original=suites(),result=loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,suites:original});assert.equal(result.ok,true);assert.equal(result.exists,false);assert.deepEqual(result.suites,original);
  write(root,AUGMENTATION_PATH,JSON.stringify(table()));assert.equal(loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,suites:[]}).code,'AUG-TARGET');
});
check('VAC003','augmentation binds exact existing name and file and refuses ambiguous targets',()=>{
  for(const change of [r=>r.name='unknown',r=>r.file='plugins/pipeline-core/lib/other.test.mjs']){const data=table();change(data.augmentations[0]);assert.equal(applyVerifyCaseCompletionAugmentations(suites(),data).code,'AUG-TARGET');}
  assert.equal(applyVerifyCaseCompletionAugmentations([suites()[0],suites()[0]],table()).code,'AUG-TARGET');
});
check('VAC004','even an equal existing policy cannot be shadowed or rewritten',()=>{
  for(const existing of [policy(),{...policy(),caseIds:['other']},undefined]){const rows=suites();rows[0].caseCompletion=existing;assert.equal(applyVerifyCaseCompletionAugmentations(rows,table()).code,'AUG-CONFLICT');}
});
check('VAC005','duplicate augmentation IDs are refused before composition',()=>{
  const data=table();data.augmentations.push(structuredClone(data.augmentations[0]));assert.equal(validateVerifyCaseCompletionAugmentations(data).code,'AUG-DUPLICATE');
  data.augmentations[1].file='plugins/pipeline-core/lib/other.test.mjs';assert.equal(validateVerifyCaseCompletionAugmentations(data).code,'AUG-DUPLICATE');
});
check('VAC006','closed root and row schemas reject extra or missing keys',()=>{
  for(const mutate of [d=>d.schema='other',d=>d.extra=true,d=>delete d.augmentations,d=>d.augmentations[0].extra=true,d=>delete d.augmentations[0].file]){const data=table();mutate(data);assert.equal(validateVerifyCaseCompletionAugmentations(data).ok,false);}
});
check('VAC007','full canonical completion-policy checks refuse unknown keys and case coverage drift',()=>{
  for(const mutate of [p=>p.extra=true,p=>p.caseIds=[],p=>p.caseIds=['duplicate','duplicate'],p=>p.caseIds=['z','a'],p=>p.maxBytes=1048577,p=>p.maxBytes=1,p=>p.schema='other']){const data=table();mutate(data.augmentations[0].caseCompletion);assert.equal(validateVerifyCaseCompletionAugmentations(data).code,'AUG-POLICY');}
});
check('VAC008','unsafe, path-shaped and wildcard target files never match an existing row',()=>{
  for(const file of ['../escape.test.mjs','/tmp/outside.test.mjs','plugins//bad.test.mjs','plugins/../bad.test.mjs','plugins\\bad.test.mjs','plugins/*.test.mjs','plugins/bad\n.test.mjs']){const data=table();data.augmentations[0].file=file;assert.equal(validateVerifyCaseCompletionAugmentations(data).code,'AUG-ENTRY');}
});
check('VAC009','physical JSON rejects duplicate keys, malformed bytes, directories and outside aliases',t=>{
  const root=fixture(t);for(const raw of ['{broken','{"schema":"other","schema":"'+AUGMENTATION_SCHEMA+'","augmentations":[]}']){write(root,AUGMENTATION_PATH,raw);assert.equal(loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,suites:suites()}).code,'AUG-READ');}
  write(root,AUGMENTATION_PATH,Buffer.from([123,34,120,34,58,34,255,34,125]));assert.equal(loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,suites:suites()}).code,'AUG-READ');
  rmSync(join(root,AUGMENTATION_PATH));mkdirSync(join(root,AUGMENTATION_PATH));assert.equal(loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,suites:suites()}).code,'AUG-READ');
  rmSync(join(root,AUGMENTATION_PATH),{recursive:true});const outside=fixture(t);write(outside,'table.json',JSON.stringify(table()));symlinkSync(join(outside,'table.json'),join(root,AUGMENTATION_PATH));assert.equal(loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,suites:suites()}).code,'AUG-READ');
});
check('VAC010','actual two-case FD completion cannot be weakened by a one-case supplementary policy',t=>{
  const root=fixture(t),path=suites()[0].file,helper=fileURLToPath(new URL('../../plugins/pipeline-core/lib/test-case-completion.mjs',import.meta.url));
  write(root,'plugins/pipeline-core/lib/test-case-completion.mjs',readFileSync(helper));
  const fixtureHelperUrl=pathToFileURL(join(root,'plugins/pipeline-core/lib/test-case-completion.mjs')).href;
  write(root,path,`import {registerTestCaseCompletion} from '${fixtureHelperUrl}';\nconst cases=[{id:'actual-one',name:'first real case',run(){}},{id:'actual-two',name:'second real case',run(){}}];\nconst fd=Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);\nregisterTestCaseCompletion({cases,fd,maxBytes:4096});\n`);
  const actual=spawnSync(process.execPath,['--input-type=module'],{cwd:dirname(join(root,path)),input:readFileSync(join(root,path)),stdio:['pipe','pipe','pipe','pipe'],timeout:10000,env:{...process.env,PIPELINE_VERIFY_CASE_COMPLETION_FD:'3'}});assert.equal(actual.status,0,actual.stderr?.toString());
  const admitted=applyVerifyCaseCompletionAugmentations(suites(),table());const receipt=parseVerifyCaseCompletion(actual.output[3],admitted.suites[0].caseCompletion);assert.equal(receipt.counts.pass,2);
  const weaker=table();weaker.augmentations[0].caseCompletion.caseIds=['actual-one'];const composition=applyVerifyCaseCompletionAugmentations(suites(),weaker);assert.equal(composition.ok,true);assert.throws(()=>parseVerifyCaseCompletion(actual.output[3],composition.suites[0].caseCompletion),/VERIFY-CASE-COMPLETION-DECLARATION/);
});
check('VAC011','actual candidate reads bind augmentation bytes and historical absence despite worktree changes',t=>{
  const root=fixture(t);initialize(root);const before=commit(root);write(root,AUGMENTATION_PATH,JSON.stringify(table()));const candidate=commit(root);
  const old=loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,candidate:before,suites:suites()});assert.equal(old.ok,true);assert.equal(old.exists,false);assert.equal(Object.hasOwn(old.suites[0],'caseCompletion'),false);
  write(root,AUGMENTATION_PATH,'{broken');const bound=loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,candidate,suites:suites()});assert.equal(bound.ok,true);assert.deepEqual(bound.suites[0].caseCompletion,policy());assert.equal(loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,suites:suites()}).code,'AUG-READ');
});
check('VAC012','candidate symlink/tree and unbound refs cannot borrow a regular worktree policy',t=>{
  const root=fixture(t);initialize(root);write(root,'valid.json',JSON.stringify(table()));mkdirSync(join(root,'harness/config'),{recursive:true});symlinkSync('../../valid.json',join(root,AUGMENTATION_PATH));const alias=commit(root);rmSync(join(root,AUGMENTATION_PATH));write(root,AUGMENTATION_PATH,JSON.stringify(table()));
  assert.equal(loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,candidate:alias,suites:suites()}).code,'AUG-READ');assert.equal(loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,candidate:'HEAD',suites:suites()}).code,'AUG-READ');
  rmSync(join(root,AUGMENTATION_PATH));mkdirSync(join(root,AUGMENTATION_PATH));write(root,AUGMENTATION_PATH+'/nested','controlled');const tree=commit(root);rmSync(join(root,AUGMENTATION_PATH),{recursive:true});write(root,AUGMENTATION_PATH,JSON.stringify(table()));assert.equal(loadAndApplyVerifyCaseCompletionAugmentations({rootDir:root,candidate:tree,suites:suites()}).code,'AUG-READ');
});
check('VAC013','exact previous-policy binding permits a strict ordered case-ID superset without mutating source rows',()=>{
  const original=suites();original[0].caseCompletion=policy();const before=JSON.stringify(original);
  const next={...policy(),caseIds:[...policy().caseIds,'actual-z']};const data=table(next);data.augmentations[0].previousPolicySha256=policySha256(policy());
  const result=applyVerifyCaseCompletionAugmentations(original,data);assert.equal(result.ok,true);assert.equal(JSON.stringify(original),before);
  assert.deepEqual(result.suites[0].caseCompletion,next);assert.deepEqual(result.suites[0].invariantPinned,original[0].invariantPinned);assert.equal(result.suites[1],original[1]);
});
check('VAC014','removing IDs, adding no new ID, or reducing maxBytes refuses a bound replacement',()=>{
  const previous=policy();
  const proposals=[
    {caseIds:['actual-one'],maxBytes:4096},
    {caseIds:['actual-one','actual-two'],maxBytes:4096},
    {caseIds:['actual-one','actual-z'],maxBytes:4096},
    {caseIds:['actual-one','actual-two','actual-z'],maxBytes:2048},
  ];
  for(const proposal of proposals){
    const rows=suites();rows[0].caseCompletion=previous;
    const data=table({schema:previous.schema,...proposal});data.augmentations[0].previousPolicySha256=policySha256(previous);
    assert.equal(applyVerifyCaseCompletionAugmentations(rows,data).code,'AUG-NON-MONOTONE');
  }
});
check('VAC015','wrong previous-policy preimage digest refuses an otherwise monotone extension',()=>{
  const rows=suites();rows[0].caseCompletion=policy();const data=table({...policy(),caseIds:[...policy().caseIds,'actual-z']});
  data.augmentations[0].previousPolicySha256='0'.repeat(64);assert.equal(applyVerifyCaseCompletionAugmentations(rows,data).code,'AUG-PREIMAGE');
});
check('VAC016','existing-policy shadowing remains a conflict without exact binding and binding cannot target an absent policy',()=>{
  const withPolicy=suites();withPolicy[0].caseCompletion=policy();assert.equal(applyVerifyCaseCompletionAugmentations(withPolicy,table()).code,'AUG-CONFLICT');
  const absent=table({...policy(),caseIds:[...policy().caseIds,'actual-z']});absent.augmentations[0].previousPolicySha256=policySha256(policy());
  assert.equal(applyVerifyCaseCompletionAugmentations(suites(),absent).code,'AUG-PREIMAGE');
});
check('VAC017','ordered superset may interleave new IDs while retaining every old ID in order',()=>{
  const previous={schema:'pipeline.verify-case-completion-policy.v1',caseIds:['old-one','old-three'],maxBytes:4096};
  const next={schema:'pipeline.verify-case-completion-policy.v1',caseIds:['old-one','old-one-a','old-three'],maxBytes:4096};
  const rows=suites();rows[0].caseCompletion=previous;const data=table(next);data.augmentations[0].previousPolicySha256=policySha256(previous);
  assert.equal(applyVerifyCaseCompletionAugmentations(rows,data).ok,true);
});
assert.equal(cases.length,17);
const fd=process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD===undefined?openSync(devNull,'w'):Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({cases,fd,maxBytes:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES??'65536')});

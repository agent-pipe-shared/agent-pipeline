// SPDX-License-Identifier: SUL-1.0
// HP02-Q1: synthetic nonhuman proof; physical receipt metadata, unchanged production checks.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,lstatSync,linkSync,symlinkSync,unlinkSync,chmodSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {authorizeQualityPackageCommit,qualityPackageIntentSha256,SIGNED_QUALITY_PACKAGE_SCHEMA,verifyQualityPackageCommitAuthorization,verifyQualityPackageIntegrationPreCommit,receiptModeBitsRefused} from './signed-quality-package.mjs';
import {registerTestCaseCompletion} from './test-case-completion.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
function fixture(){
 const base=realpathSync(process.env.QUALITY_SINGLE_LINK_FIXTURE_ROOT);
 const root=mkdtempSync(join(base,'quality-unit-'));
 try{
  git(root,['init','-q']);for(const [k,v] of [['user.email','unit@example.invalid'],['user.name','Synthetic Unit'],['core.autocrlf','false']])git(root,['config',k,v]);
  const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'pem'});
  writeFileSync(join(root,'subject.txt'),'before\n');mkdirSync(join(root,'project'));
  writeFileSync(join(root,'project/critical-human-proof.json'),JSON.stringify({schema:'pipeline.critical-human-proof-policy.v3',requiredKinds:['push'],waivedKinds:[],trustAnchors:[{keyReference:'synthetic-unit-key',publicKeySha256:sha(publicKey)}]}));
  git(root,['add','subject.txt','project/critical-human-proof.json']);git(root,['commit','-qm','synthetic base']);
  const record={schema:SIGNED_QUALITY_PACKAGE_SCHEMA,baseCommit:git(root,['rev-parse','HEAD']),unifiedDiff:'diff --git a/subject.txt b/subject.txt\nindex df967b9..3e75765 100644\n--- a/subject.txt\n+++ b/subject.txt\n@@ -1 +1 @@\n-before\n+after\n',expectedDigests:{'subject.txt':sha('after\n')}};
  record.intentSha256=qualityPackageIntentSha256(record);
  const proof={schema:'pipeline.po-approval-proof.v1',intentSha256:record.intentSha256,keyReference:'synthetic-unit-key',publicKey,signatureBase64:sign(null,Buffer.from(record.intentSha256),keys.privateKey).toString('base64')};
  // Exactly the staged-index precondition used by canonical authorization fixtures.
  writeFileSync(join(root,'subject.txt'),'after\n');git(root,['add','subject.txt']);
  assert.equal(authorizeQualityPackageCommit({repoRoot:root,packageIntent:record,proof}).code,'QUALITY-PACKAGE-COMMIT-AUTHORIZED');
  const receipt=join(git(root,['rev-parse','--path-format=absolute','--git-common-dir']),'agent-pipeline/signed-quality-packages/commit-authorizations',record.intentSha256+'.json');
  const item={root,record,proof,receipt};assert.equal(lstatSync(receipt).nlink,1);assert.equal(commit(item).code,'QUALITY-PACKAGE-COMMIT-VERIFIED');assert.equal(integration(item).code,'QUALITY-PACKAGE-INTEGRATION-PRECOMMIT-VERIFIED');return item;
 }catch(e){rmSync(root,{recursive:true,force:true});throw e;}
}
const commit=i=>verifyQualityPackageCommitAuthorization({repoRoot:i.root});
const integration=i=>verifyQualityPackageIntegrationPreCommit({repoRoot:i.root,intentSha256:i.record.intentSha256});
function using(body){const i=fixture();try{body(i);}finally{rmSync(i.root,{recursive:true,force:true});}}
const cases=[
 {id:'QSL001',name:'valid signed single-link receipt remains accepted by both readers',run(){using(i=>{assert.equal(lstatSync(i.receipt).nlink,1);assert.equal(commit(i).ok,true);assert.equal(integration(i).ok,true);});}},
 {id:'QSL002',name:'identical valid hardlinked receipt is refused by commit authorization',run(){using(i=>{
  const before=readFileSync(i.receipt),alias=join(i.root,'physical-receipt-alias');linkSync(i.receipt,alias);
  const a=lstatSync(i.receipt),b=lstatSync(alias);assert.equal(a.nlink,2);assert.equal(b.nlink,2);assert.equal(a.dev,b.dev);assert.equal(a.ino,b.ino);assert.deepEqual(readFileSync(i.receipt),before);assert.deepEqual(readFileSync(alias),before);
  assert.equal(integration(i).code,'QUALITY-PACKAGE-INTEGRATION-AUTHORIZATION-INVALID','exact reader already rejects identical two-link receipt');
  assert.equal(commit(i).ok,false,'commit authorization must refuse physical receipt with nlink 2 despite valid signature and unchanged staged index');
 });}},
 {id:'QSL003',name:'symlinked identical receipt remains refused',run(){using(i=>{const copy=join(i.root,'receipt-copy');writeFileSync(copy,readFileSync(i.receipt),{mode:0o600});unlinkSync(i.receipt);symlinkSync(copy,i.receipt,'file');assert.equal(lstatSync(i.receipt).isSymbolicLink(),true);assert.equal(commit(i).ok,false);assert.equal(integration(i).ok,false);});}},
 {id:'QSL004',name:'single-link receipt with forged proof remains refused',run(){using(i=>{const r=JSON.parse(readFileSync(i.receipt,'utf8'));r.proof.signatureBase64=Buffer.alloc(64).toString('base64');writeFileSync(i.receipt,JSON.stringify(r));assert.equal(lstatSync(i.receipt).nlink,1);assert.equal(commit(i).ok,false);assert.equal(integration(i).ok,false);});}},
 {id:'QSL005',name:'single-link valid proof with stale staged index remains refused',run(){using(i=>{writeFileSync(join(i.root,'subject.txt'),'stale\n');git(i.root,['add','subject.txt']);assert.equal(lstatSync(i.receipt).nlink,1);assert.equal(commit(i).ok,false);assert.equal(integration(i).code,'QUALITY-PACKAGE-INTEGRATION-INDEX-MISMATCH');});}},
 {id:'QSL006',name:'mode policy still refuses nonprivate receipt where mode bits exist',run(){using(i=>{chmodSync(i.receipt,0o644);assert.notEqual(lstatSync(i.receipt).mode&0o077,0);const refused=process.platform!=='win32';assert.equal(receiptModeBitsRefused(lstatSync(i.receipt).mode),refused);assert.equal(commit(i).ok,!refused);assert.equal(integration(i).ok,!refused);});}}
].map(c=>({...c,mode:'run'}));
registerTestCaseCompletion({cases,fd:3,maxBytes:16384});

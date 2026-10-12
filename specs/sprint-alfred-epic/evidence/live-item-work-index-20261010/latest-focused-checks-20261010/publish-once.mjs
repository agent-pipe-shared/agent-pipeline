// Root-only local documentation publication. No qualification or product import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const own=dirname(fileURLToPath(import.meta.url)),repo=process.cwd();
const expectedOwn='specs/sprint-alfred-epic/evidence/live-item-work-index-20261010/latest-focused-checks-20261010';
assert.equal(relative(repo,own),expectedOwn);assert.equal(realpathSync(own),own);assert.equal(realpathSync(repo),repo);
const hash=b=>createHash('sha256').update(b).digest('hex');
function ancestry(path){const rel=relative(repo,path);assert(!rel.startsWith('..'));let current=repo;for(const part of rel.split('/').filter(Boolean)){current=join(current,part);const s=lstatSync(current);assert(!s.isSymbolicLink());assert.equal(realpathSync(current),current);}}
function check(path,row){ancestry(path);const s=lstatSync(path);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,path+' regular owned file');const bytes=readFileSync(path);assert.equal(hash(bytes),row.sha256,path+' CAS');assert.equal(bytes.length,row.bytes,path+' bytes');if(row.mode!==undefined)assert.equal(s.mode&0o777,row.mode,path+' mode');return bytes;}
const freezePath=join(own,'preview-freeze.json'),freezeBytes=readFileSync(freezePath);assert.equal(hash(freezeBytes),'e2f394655cf575dac0fbae7fd592c4ec66d35297c7cc759489a6df3b93e7e574');
const freeze=JSON.parse(freezeBytes);assert.deepEqual(freeze.files.map(r=>r.name),['checks.json','README.md','receipt-bindings.json']);assert(freeze.rootSolePublisher&&!freeze.published);
for(const row of freeze.sourceReceipts)check(resolve(repo,row.path),row);
const payloads=freeze.files.map(row=>({row,bytes:check(join(own,'previews',row.name),row)}));
for(const {row}of payloads)assert(!existsSync(join(own,row.name)),'publication refuses an existing output '+row.name);
const put=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o644});
put(join(own,'publication-reservation.json'),{schema:'alfred.focused-checks.one-use-publication-reservation.v1',createdAt:new Date().toISOString(),previewFreezeSha256:hash(freezeBytes),noBusinessExecution:true});
const outputs=[];
for(const {row,bytes}of payloads){const target=join(own,row.name);writeFileSync(target,bytes,{flag:'wx',mode:0o644});chmodSync(target,0o644);check(target,{...row,mode:0o644});outputs.push({...row,path:relative(repo,target),mode:0o644});}
for(const row of freeze.sourceReceipts)check(resolve(repo,row.path),row);
for(const {row}of payloads)check(join(own,'previews',row.name),row);
const receipt={schema:'alfred.focused-checks.local-publication.v1',status:'published-and-readback-byte-equal',publishedAt:new Date().toISOString(),previewFreezeSha256:hash(freezeBytes),outputs,inputReceiptsConserved:true,previewsConserved:true,businessRuns:0,productImports:0,gitCommands:0,remotePublication:false,nativeAcceptance:false,itemAcceptance:false};
put(join(own,'publication-receipt.json'),receipt);console.log(JSON.stringify(receipt));

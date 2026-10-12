// Controlled METHOD tests only: no Human, native or installed authority claim.
import assert from 'node:assert/strict';
import {after} from 'node:test';
import {mkdtempSync,chmodSync,lstatSync,realpathSync} from 'node:fs';
import {userInfo} from 'node:os';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerTestCaseCompletion} from '../lib/test-case-completion.mjs';
const sourceRoot=fileURLToPath(new URL('../../../',import.meta.url));
const fixtureRoot=fileURLToPath(new URL('./signing-disclosure-sweep/',import.meta.url));
assert.equal(resolve(sourceRoot),resolve(fixtureRoot,'../../../..'));
const originalCwd=process.cwd();
const osUser=userInfo(),home=osUser.homedir;
assert(isAbsolute(home)&&resolve(home)===home&&home!=='/');
assert(Number.isSafeInteger(osUser.uid)&&osUser.uid===process.getuid());
const fields=['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'];
function directoryFact(path){
  const s=lstatSync(path,{bigint:true});
  assert(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o022n)===0n);
  assert.equal(realpathSync(path),path);
  try{lstatSync(join(path,'.git'));assert.fail('METHOD cwd must be outside every Git worktree');}catch(error){assert.equal(error.code,'ENOENT');}
  return {path,...Object.fromEntries(fields.map(key=>[key,s[key]]))};
}
const paths=[];for(let current=home;;current=dirname(current)){paths.unshift(current);if(current===dirname(current))break;}
const before=paths.map(directoryFact);assert.equal(before.at(-1).uid,BigInt(osUser.uid));
const operationRoot=mkdtempSync(join(home,'.pipeline-signing-method-'));chmodSync(operationRoot,0o700);
const parents=paths.map(directoryFact);
for(let index=0;index<before.length;index++){
  const keys=index===before.length-1?['dev','ino','uid','gid','mode']:fields;
  for(const key of keys)assert.equal(parents[index][key],before[index][key]);
}
const operation=directoryFact(operationRoot);assert.equal(operation.uid,BigInt(osUser.uid));assert.equal(operation.mode&0o777n,0o700n);
for(const expected of [...parents,operation]){const actual=directoryFact(expected.path);for(const key of fields)assert.equal(actual[key],expected[key]);}
process.chdir(operationRoot);assert.equal(process.cwd(),operationRoot);
// Retain physical METHOD artifacts; cleanup is not an authority terminal claim.
after(()=>process.chdir(originalCwd));
const {presentationCases}=await import('./signing-disclosure-sweep/presentation-cases.mjs');
const {typedHgoCases}=await import('./signing-disclosure-sweep/typed-hgo-cases.mjs');
const {sweepCases}=await import('./signing-disclosure-sweep/sweep-cases.mjs');
const {signingMethodCases}=await import('./signing-disclosure-sweep/signing-method-cases.mjs');
const {sweepAuthorityCases}=await import('./signing-disclosure-sweep/sweep-authority-cases.mjs');
const {sweepPhysicalMethodCases}=await import('./signing-disclosure-sweep/sweep-physical-method-cases.mjs');
const configuration={fixtureRoot,sourceRoot};
const originals=[...sweepAuthorityCases(configuration),...await sweepPhysicalMethodCases(configuration),...await presentationCases(configuration),...signingMethodCases(configuration),...await sweepCases(configuration),...await typedHgoCases(configuration)];
const caseIds=["SDA001","SDA002","SDA003","SDF001","SDF002","SDP001","SDP002","SDP003","SDP004","SDP005","SDP006","SDR001","SDR002","SDR003","SDS001","SDS002","SDS003","SDT001","SDT002"];
assert.deepEqual(originals.map(item=>item.id),caseIds);
const cases=originals.map(({id,scope,run})=>({id,name:scope,run}));
registerTestCaseCompletion({cases,fd:3,maxBytes:65536});

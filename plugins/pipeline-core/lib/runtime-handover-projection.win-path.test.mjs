// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {registerTestCaseCompletion} from "./test-case-completion.mjs";
import {projectionStorageForTest} from "./runtime-handover-projection.mjs";

// Rewrites backslashes to forward slashes in the git-common-dir output only (what native-Windows git
// prints). On POSIX there are no backslashes in the path, so this is a no-op and behaviour is unchanged.
const forwardSlashSpawn=(command,args,options)=>{
 const result=spawnSync(command,args,options);
 if(args.includes("--git-common-dir"))result.stdout=String(result.stdout).replaceAll("\\","/");
 return result;
};
const withRepo=run=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"rhp-win-path-")));
 try{execFileSync("git",["init","-q",root]);run(root);}finally{rmSync(root,{recursive:true,force:true});}
};
const cases=[
 {id:"RHPW001",name:"forward-slash git common dir is accepted (win32 git output); native separators unchanged elsewhere",run(){
  withRepo(root=>{
   const {path}=projectionStorageForTest(root,{spawnSync:forwardSlashSpawn});
   assert.equal(path.startsWith(resolve(root,".git")),true);
  });
 }},
 {id:"RHPW002",name:"symlink/junction identity refusal: common dir whose realpath differs is still refused",run(){
  withRepo(root=>{
   const realpath=p=>{const real=realpathSync(p);return p.endsWith(".git")?join(real,"..","elsewhere"):real;};
   assert.throws(()=>projectionStorageForTest(root,{spawnSync:forwardSlashSpawn,realpathSync:realpath}),/physical metadata/);
  });
 }},
];
registerTestCaseCompletion({cases,fd:3,maxBytes:65536});

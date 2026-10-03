// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {registerTestCaseCompletion} from "./test-case-completion.mjs";
import {publishRuntimeNextAction,readRuntimeNextAction} from "./runtime-handover-projection.mjs";
const cases=[
 {id:"RHP001",name:"runtime projection leaves tracked handover and Git index unchanged",run(){
  const root=mkdtempSync(join(tmpdir(),"runtime-handover-"));
  try {
   execFileSync("git",["init","-q",root]);mkdirSync(join(root,"docs"));
   writeFileSync(join(root,"docs/state.md"),"# Handover\n");execFileSync("git",["-C",root,"add","docs/state.md"]);
   const before=execFileSync("git",["-C",root,"status","--porcelain"]);
   const result=publishRuntimeNextAction({rootDir:root,state:{planApproved:false},sectionText:"Inspect the exact final package."});
   assert.equal(result.status,"projected");assert.equal(result.trackedHandoverChanged,false);
   assert.equal(readRuntimeNextAction({rootDir:root,state:{planApproved:false}}).status,"available");
   assert.equal(readRuntimeNextAction({rootDir:root,state:{planApproved:true}}).status,"unavailable");
   assert.equal(readFileSync(join(root,"docs/state.md"),"utf8"),"# Handover\n");
   assert.deepEqual(execFileSync("git",["-C",root,"status","--porcelain"]),before);
  }finally{rmSync(root,{recursive:true,force:true});}
 }},
 {id:"RHP002",name:"non-Git or oversized inputs cannot create projection authority",run(){
  const root=mkdtempSync(join(tmpdir(),"runtime-handover-unavailable-"));
  try{
   assert.equal(publishRuntimeNextAction({rootDir:root,state:{},sectionText:"inspect"}).status,"unavailable");
   assert.equal(publishRuntimeNextAction({rootDir:root,state:{},sectionText:"x".repeat(65537)}).status,"unavailable");
  }finally{rmSync(root,{recursive:true,force:true});}
 }},
];
registerTestCaseCompletion({cases,fd:3,maxBytes:65536});

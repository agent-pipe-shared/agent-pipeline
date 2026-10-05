// SPDX-License-Identifier: SUL-1.0
/** Private advisory handover projection; canonical pipeline state remains authoritative. */
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {lstatSync,realpathSync,readFileSync} from "node:fs";
import {resolve,join,isAbsolute} from "node:path";
import {writePrivateFileAtomic,assertPrivateRegularFile} from "./private-boundary.mjs";
import {isSuccessfulSpawn} from "./successful-spawn.mjs";

function projectionStorage(rootDir,seams={}) {
    const spawn=seams.spawnSync??spawnSync,realpath=seams.realpathSync??realpathSync;
    const root=resolve(rootDir);
    if(realpath(root)!==root||!lstatSync(root).isDirectory()||lstatSync(root).isSymbolicLink())throw Error("root");
    const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/iu.test(key))),LC_ALL:"C"};
    const git=args=>spawn("git",["-C",root,...args],{env,shell:false,encoding:"utf8",timeout:10000,maxBuffer:65536});
    const top=git(["rev-parse","--show-toplevel"]);
    if(!isSuccessfulSpawn(top)){
      if(top.status===128&&!top.error&&String(top.stderr).includes("not a git repository"))throw Object.assign(Error("non-Git"),{code:"RUNTIME-HANDOVER-NON-GIT"});
      throw Error("Git root");
    }
    if(realpath(top.stdout.trim())!==root)throw Error("Git root");
    const metadata=git(["rev-parse","--path-format=absolute","--git-common-dir"]);
    if(!isSuccessfulSpawn(metadata)||!isAbsolute(metadata.stdout.trim()))throw Error("Git metadata");
    // Git prints forward slashes on native Windows while realpath returns backslashes; normalise
    // lexically first so the identity check below still only fails for a real symlink/junction.
    const common=resolve(metadata.stdout.trim());
    if(realpath(common)!==common||!lstatSync(common).isDirectory()||lstatSync(common).isSymbolicLink())throw Error("physical metadata");
    // Each linked worktree gets its own projection; common metadata is not a scope merger.
    const rootSha256=createHash("sha256").update(root).digest("hex");
    const path=join(common,"agent-pipeline","handover-projections",rootSha256+".json");
    return {rootSha256,path};
}
/** Test seam: exposes the storage resolver with injectable spawnSync/realpathSync. */
export const projectionStorageForTest=projectionStorage;
const stateDigest=state=>{
 if(!state||typeof state!=="object"||Array.isArray(state))throw Error("state");
 return createHash("sha256").update(JSON.stringify(state)).digest("hex");
};
export function publishRuntimeNextAction({rootDir,state,sectionText}={}) {
  try {
    if(typeof sectionText!=="string"||Buffer.byteLength(sectionText)>65536)throw Error("input");
    const {rootSha256,path}=projectionStorage(rootDir);
    const stateSha256=stateDigest(state);
    const record={schema:"pipeline.runtime-next-action-projection.v1",rootSha256,stateSha256,sectionText,authority:"advisory-only"};
    writePrivateFileAtomic(path,Buffer.from(JSON.stringify(record,null,2)+"\n"));
    return {status:"projected",stateSha256,trackedHandoverChanged:false};
  }catch(error) {
    return {status:"unavailable",code:error?.code==="RUNTIME-HANDOVER-NON-GIT"?error.code:"RUNTIME-HANDOVER-PROJECTION-UNAVAILABLE",trackedHandoverChanged:false};
  }
}

/** Revalidate this advisory projection against the currently read canonical state. */
export function readRuntimeNextAction({rootDir,state}={}) {
 try {
  const {rootSha256,path}=projectionStorage(rootDir);
  assertPrivateRegularFile(path,"runtime handover projection");
  const metadata=lstatSync(path);
  if(metadata.size>131072)throw Error("bound");
  const raw=readFileSync(path);
  const record=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
  const keys=["schema","rootSha256","stateSha256","sectionText","authority"].sort();
  if(!record||typeof record!=="object"||Array.isArray(record)
    ||JSON.stringify(Object.keys(record).sort())!==JSON.stringify(keys)
    ||record.schema!=="pipeline.runtime-next-action-projection.v1"
    ||record.rootSha256!==rootSha256||record.stateSha256!==stateDigest(state)
    ||record.authority!=="advisory-only"||typeof record.sectionText!=="string"
    ||Buffer.byteLength(record.sectionText)>65536)throw Error("projection");
  return {status:"available",sectionText:record.sectionText,stateSha256:record.stateSha256,authority:"advisory-only"};
 }catch{
  return {status:"unavailable",code:"RUNTIME-HANDOVER-PROJECTION-UNAVAILABLE"};
 }
}

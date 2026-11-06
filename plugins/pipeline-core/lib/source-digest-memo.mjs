// SPDX-License-Identifier: SUL-1.0
// C19I-W238 O3 (ii): the cross-process layer of the registry's installed-source digest.
//
// The registry binds the SHA-256 of every participant source file into its catalogue. On Windows each digest costs one native helper start
// (about 0.5 s), and every hook is a new process that read the same unchanged files again (19 read-source starts in a warm admission). This
// module keeps what the registry itself computed: a digest, keyed on the file's lstat identity tuple (dev, ino, mode, nlink, size, mtimeNs,
// ctimeNs, birthtimeNs). An entry answers only while the file's CURRENT identity equals the stored one, the same rule the backend's
// cross-process observation memo applies (windows-owned-authority-backend.mjs, PERSIST_SCHEMA); any identity change is a miss and the caller
// reads the file as before. The file lives in the user's private application-data directory beside that memo, is size- and shape-bounded,
// validated entry by entry on load (a malformed or foreign entry is dropped, never trusted), written by an atomic rename after merging what
// another process wrote meanwhile, and any fault reading or writing it only means "no persisted answer".
import { lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const SOURCE_DIGEST_MEMO_SCHEMA='pipeline.source-digest-memo.v1';
export const SOURCE_DIGEST_MEMO_MAX_ENTRIES=256;
export const SOURCE_DIGEST_MEMO_MAX_FILE_BYTES=1024*1024;
const HEX64=/^[a-f0-9]{64}$/u,IDENTITY=/^[0-9]{1,40}(?::[0-9]{1,40}){7}$/u;
const closed=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const entryShape=row=>closed(row,['path','identity','sha256'])&&typeof row.path==='string'&&row.path.length<=32768&&isAbsolute(row.path)&&typeof row.identity==='string'&&IDENTITY.test(row.identity)&&typeof row.sha256==='string'&&HEX64.test(row.sha256);

/** The default location: next to the backend's observation memo. Absent (null) unless LOCALAPPDATA is an absolute, normalised path. */
export function defaultSourceDigestMemoFile(env=process.env){
  const base=env.LOCALAPPDATA;
  return typeof base==='string'&&isAbsolute(base)&&resolve(base)===base?join(base,'agent-pipeline','authority-source-digest-memo.v1.json'):null;
}
/** The lstat identity tuple as one string, or null when the file cannot be inspected. */
export function sourceIdentity(path){
  try{const s=lstatSync(path,{bigint:true});if(!s.isFile()||s.isSymbolicLink())return null;return [s.dev,s.ino,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs,s.birthtimeNs].join(':');}catch{return null;}
}
function readFileEntries(file){
  const rows=new Map();
  try{
    const info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size>SOURCE_DIGEST_MEMO_MAX_FILE_BYTES)return rows;
    const data=JSON.parse(readFileSync(file,'utf8'));
    if(!closed(data,['schema','entries'])||data.schema!==SOURCE_DIGEST_MEMO_SCHEMA||!Array.isArray(data.entries))return rows;
    for(const row of data.entries.slice(-SOURCE_DIGEST_MEMO_MAX_ENTRIES))if(entryShape(row))rows.set(row.path,{identity:row.identity,sha256:row.sha256});
  }catch{/* no persisted answer */}
  return rows;
}
export function createSourceDigestMemo({file}){
  let loaded=null,dirty=false;
  const entries=()=>loaded??=(file?readFileEntries(file):new Map());
  return {
    /** The stored digest for exactly this identity, or null. */
    lookup(path,identity){
      if(!file||typeof identity!=='string')return null;
      const row=entries().get(path);
      return row&&row.identity===identity?row.sha256:null;
    },
    remember(path,identity,sha256){
      if(!file||typeof path!=='string'||!isAbsolute(path)||typeof identity!=='string'||!IDENTITY.test(identity)||typeof sha256!=='string'||!HEX64.test(sha256))return;
      const rows=entries();rows.delete(path);rows.set(path,{identity,sha256});
      while(rows.size>SOURCE_DIGEST_MEMO_MAX_ENTRIES)rows.delete(rows.keys().next().value);
      dirty=true;
    },
    /** Merges with what another process wrote meanwhile, then replaces the file by an atomic rename. A fault is swallowed: the memo only saves work. */
    flush(){
      if(!file||!dirty)return;
      let temp=null;
      try{
        const merged=readFileEntries(file);
        for(const [path,row] of entries()){merged.delete(path);merged.set(path,row);}
        const rows=[...merged].slice(-SOURCE_DIGEST_MEMO_MAX_ENTRIES).map(([path,row])=>({path,identity:row.identity,sha256:row.sha256}));
        const text=JSON.stringify({schema:SOURCE_DIGEST_MEMO_SCHEMA,entries:rows});
        if(Buffer.byteLength(text)>SOURCE_DIGEST_MEMO_MAX_FILE_BYTES)return;
        mkdirSync(dirname(file),{recursive:true,mode:0o700});
        temp=`${file}.${process.pid}.tmp`;writeFileSync(temp,text,{flag:'w',mode:0o600});renameSync(temp,file);temp=null;dirty=false;
      }catch{/* the memo only saves work */}
      finally{if(temp!==null){try{unlinkSync(temp);}catch{/* already gone */}}}
    },
  };
}

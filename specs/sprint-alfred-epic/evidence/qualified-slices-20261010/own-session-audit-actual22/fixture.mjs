import {mkdirSync,writeFileSync,readFileSync,symlinkSync,linkSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const secret='SYNTHETIC-PRIVATE-CREDENTIAL-OSE-NOT-A-REAL-KEY';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const counters={input_tokens:100,cached_input_tokens:20,output_tokens:30,reasoning_output_tokens:4,total_tokens:134};
export function makeFixture(base,id){
  const home=join(base,id,'private-store'),root=join(base,id,'repository'),foreign=join(base,id,'foreign');
  for(const path of [root,foreign,join(home,'sessions')])mkdirSync(path,{recursive:true,mode:0o700});
  const session='method-session-'+id,store=join(home,'sessions');
  const f={home,root,foreign,session,store,secret};
  f.rows=(overrides={})=>[
    {type:'session_meta',payload:{id:session,cwd:root,unknown:secret,...overrides}},
    {type:'turn_context',payload:{model:'gpt-6.1',unknown:secret}},
    {type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{...counters,secret}}}},
    {type:'response_item',payload:{text:secret,arguments:{password:secret},error:secret}}
  ];
  f.write=(name,rows=f.rows())=>{const path=join(store,name);writeFileSync(path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{mode:0o600});return path;};
  f.options=()=>({rootDir:root,runner:'codex',metadataConsent:'approved'});
  f.environment=(overrides={})=>({...process.env,CODEX_HOME:home,CODEX_SESSION_ID:session,CODEX_THREAD_ID:session,...overrides});
  f.withEnv=(operation,overrides={})=>{
    const names=['CODEX_HOME','CODEX_SESSION_ID','CODEX_THREAD_ID'];
    const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
    const next={CODEX_HOME:home,CODEX_SESSION_ID:session,CODEX_THREAD_ID:session,...overrides};
    try{for(const name of names){if(next[name]===undefined)delete process.env[name];else process.env[name]=next[name];}return operation();}
    finally{for(const name of names){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}}
  };
  f.cli=(script,args,overrides={})=>{
    const result=spawnSync(process.execPath,[script,...args],{cwd:root,env:f.environment(overrides),encoding:'utf8',maxBuffer:2*1024*1024,timeout:30000});
    if(result.error)throw result.error;
    return {...result,json:()=>JSON.parse(result.stdout)};
  };
  f.argv=()=>['audit-current','--root',root,'--runner','codex','--metadata-consent','approved'];
  return f;
}
export function aliasFile(target,path){symlinkSync(target,path);}
export function hardlinkFile(target,path){linkSync(target,path);}
export function unchanged(paths,operation){const before=paths.map(path=>digest(readFileSync(path)));const value=operation();return {value,before,after:paths.map(path=>digest(readFileSync(path)))};}

// Read-only local diagnosis; output contains only Pipeline topology and lock metadata.
import {readFileSync,writeFileSync,existsSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
const home='/home/skar667',fixture=home+'/src/Rune_Test1_agy_70_113';
const sha=b=>createHash('sha256').update(b).digest('hex');
function json(path,project){if(!existsSync(path))return{path,present:false};const st=lstatSync(path);if(!st.isFile()||st.size>1048576)return{path,present:true,refused:'not-bounded-file'};const bytes=readFileSync(path);return{path,present:true,sha256:sha(bytes),bytes:bytes.length,mtime:st.mtime.toISOString(),projection:project(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)))};}
const registry=json(home+'/.gemini/config/plugins.json',v=>({pipelineEntries:(v.entries??[]).filter(e=>typeof e.path==='string'&&e.path.includes('pipeline')).map(e=>({path:e.path}))}));
const imported=json(home+'/.gemini/config/import_manifest.json',v=>({pipelineEntries:(v.imports??[]).filter(x=>x?.name==='agent-pipeline-core').map(x=>({name:x.name,source:x.source,importedAt:x.importedAt,components:x.components}))}));
const roots=[home+'/.gemini/config/plugins/agent-pipeline-core',home+'/agent-pipeline-local-marketplace/plugins/pipeline-core'];
const manifests=roots.flatMap(root=>['plugin.json','.claude-plugin/plugin.json','.codex-plugin/plugin.json'].map(p=>json(root+'/'+p,v=>({name:v.name,version:v.version}))));
const hookFiles=[home+'/.gemini/config/hooks.json',roots[0]+'/hooks.json',roots[0]+'/hooks/hooks.json'];
const hooks=hookFiles.map(path=>json(path,v=>{const commands=[];function visit(x){if(!x||typeof x!=='object')return;for(const[k,z]of Object.entries(x)){if(k==='command'&&typeof z==='string'&&(z.includes('pipeline')||z.includes('antigravity-')))commands.push(z);if(typeof z==='object')visit(z);}}visit(v);return{pipelineCommands:commands};}));
const run=fixture+'/.git/agent-pipeline/run',locks=[];
if(existsSync(run))for(const name of readdirSync(run).filter(x=>x.startsWith('session-')).sort()){const p=run+'/'+name+'/requires-bootstrap.lock';if(existsSync(p))locks.push(json(p,v=>({locked:v.locked??null,version:v.version??null})));}
const evidence={schema:'pipeline.backlog.agy-imported-snapshot-readonly.v1',observedAt:new Date().toISOString(),registry,imported,manifests,hooks,fixtureRegistry:json(fixture+'/.agents/plugins.json',v=>({entries:(v.entries??[]).map(e=>({path:e.path}))})),locks,limits:{mutations:false,liveRunnerExecution:false,precedenceProven:false,historicalSessionCoverage:false,crossRunnerSettingsInspected:false}};
writeFileSync('backlog/evidence/agy-imported-snapshot-20260928-readback.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({evidence:'backlog/evidence/agy-imported-snapshot-20260928-readback.json',sha256:sha(readFileSync('backlog/evidence/agy-imported-snapshot-20260928-readback.json')),imported:evidence.imported.projection,lockCount:locks.length,mutation:false}));

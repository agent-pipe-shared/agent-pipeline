import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {isReadOnlyDiagnosticCommand as original} from '../../../plugins/pipeline-core/lib/guard/shell-grammar.mjs';
const root=process.cwd(),own='scratch/alfred-postinstall-whole-items-20261011/passive-read-batch-correction';
const prep=JSON.parse(fs.readFileSync(path.join(own,'stat-preparation.json')));
const merged='scratch/alfred-postinstall-whole-items-20261011/passive-read-consumer-delivery/postimages/plugins/pipeline-core/hooks/guard-command-grammar.mjs';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(sha(prep.source.path)!==prep.source.sha256||sha(prep.postimage.path)!==prep.postimage.sha256||sha(merged)!=='3525f685ac661cfbfd97a226649aecf71ec074ea92990501cab1584b98fab5a6')throw Error('CAS drift');
function url(p,replace={}){const base=pathToFileURL(path.join(root,p)).href;const s=fs.readFileSync(p,'utf8').replace(/from (["'])(\.[^"']+)\1/g,(_,q,v)=>'from '+JSON.stringify(replace[v]??new URL(v,base).href)).replaceAll('import.meta.url',JSON.stringify(base));return 'data:text/javascript;base64,'+Buffer.from(s).toString('base64');}
const hook=url(merged,{'../lib/git-cmd.mjs':pathToFileURL(path.join(root,'plugins/pipeline-core/lib/git-cmd.mjs')).href,'../lib/passive-read-policy.mjs':pathToFileURL(path.join(root,'plugins/pipeline-core/lib/passive-read-policy.mjs')).href});
const sourceURL=pathToFileURL(path.join(root,prep.source.path)).href;
const imports=Object.fromEntries([...fs.readFileSync(prep.source.path,'utf8').matchAll(/from (["'])(\.[^"']+)\1/g)].map(m=>[m[2],new URL(m[2],sourceURL).href]));
imports['../../hooks/guard-command-grammar.mjs']=hook;
// Pin the complete static relative import closure before candidate import and
// behavioral execution, then recheck identical bytes/modes at publication.
const dependencies=new Map();
function collect(p){if(dependencies.has(p))return;const bytes=fs.readFileSync(p);dependencies.set(p,{path:p,sha256:sha(p),mode:fs.statSync(p).mode&0o777,bytes:bytes.length});for(const m of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)){const dep=path.normalize(path.join(path.dirname(p),m[1]));if(fs.existsSync(dep)&&fs.statSync(dep).isFile())collect(dep);}}
collect(prep.source.path);collect('plugins/pipeline-core/hooks/guard-command-grammar.mjs');
const sourceCAS=[...dependencies.values()];
const candidateModule=await import(url(prep.postimage.path,imports));
const candidate=candidateModule.isReadOnlyDiagnosticCommand;
const fixture=path.join(root,own,'stat-fixture');fs.mkdirSync(path.join(fixture,'docs'),{recursive:true});
fs.writeFileSync(path.join(fixture,'docs/state.md'),'metadata fixture\n');fs.writeFileSync(path.join(fixture,'docs/other.md'),'other\n');fs.writeFileSync(path.join(fixture,'.env'),'private fixture\n');
for(const [name,target] of [['alias','docs/state.md'],['outside',path.join(root,'AGENTS.md')],['secret','.env']])if(!fs.existsSync(path.join(fixture,name)))fs.symlinkSync(target,path.join(fixture,name));
const cases=[
 ['actual-source-format',"stat -c '%a %s %n' plugins/pipeline-core/lib/role-dispatch-preflight.mjs",root,true],
 ['actual-source-links',"stat -c '%a %s %h %n' plugins/pipeline-core/lib/role-dispatch-preflight.mjs plugins/pipeline-core/lib/role-route-preflight.mjs",root,true],
 ['long-format',"stat --format '%a %s %n' docs/state.md",fixture,true],
 ['directory',"stat -c '%a %s %n' docs",fixture,true],
 ['multi-path',"stat -c '%a %s %h %n' docs/state.md docs/other.md",fixture,true],
 ['missing-format','stat -c',fixture,false],
 ['missing-path',"stat -c '%a %s %n'",fixture,false],
 ['missing-target',"stat -c '%a %s %n' docs/no-such-file",fixture,false],
 ['missing-member',"stat -c '%a %s %n' docs/state.md docs/no-such-file",fixture,false],
 ['private-member',"stat -c '%a %s %n' docs/state.md .env",fixture,false],
 ['unknown-directive',"stat -c '%a %s %x %n' docs/state.md",fixture,false],
 ['percent-escape',"stat -c '%%a %s %n' docs/state.md",fixture,false],
 ['printf-option',"stat --printf '%a %s %n' docs/state.md",fixture,false],
 ['attached-short',"stat -c'%a %s %n' docs/state.md",fixture,false],
 ['attached-long',"stat --format='%a %s %n' docs/state.md",fixture,false],
 ['unknown-flag',"stat -c '%a %s %n' --unknown docs/state.md",fixture,false],
 ['follow-flag',"stat -L -c '%a %s %n' docs/state.md",fixture,false],
 ['filesystem-flag',"stat -f -c '%a %s %n' docs/state.md",fixture,false],
 ['repeated-format',"stat -c '%a %s %n' -c '%a %s %n' docs/state.md",fixture,false],
 ['alias',"stat -c '%a %s %n' alias",fixture,false],
 ['escaping-alias',"stat -c '%a %s %n' outside",fixture,false],
 ['private-alias',"stat -c '%a %s %n' secret",fixture,false],
 ['traversal',"stat -c '%a %s %n' ../qualify.test.mjs",fixture,false],
 ['absolute-escape',"stat -c '%a %s %n' "+path.join(root,'AGENTS.md'),fixture,false],
 ['substitution','stat -c "$(id)" docs/state.md',fixture,false],
 ['backtick','stat -c "`id`" docs/state.md',fixture,false],
 ['redirect',"stat -c '%a %s %n' docs/state.md > output",fixture,false],
 ['execute',"stat -c '%a %s %n' docs/state.md; touch output",fixture,false],
 ['private-basename',"stat -c '%a %s %n' po-private.pem",fixture,false],
 ['system',"stat -c '%a %s %n' /etc/shadow",root,false],
 ['ordinary-stat-retained','stat docs/state.md',fixture,true],
 ['existing-rg-retained',"rg -n 'fallback|runRoleDispatchBatch' plugins/pipeline-core/lib/role-route-preflight.test.mjs plugins/pipeline-core/lib/dispatch-policy.test.mjs",root,true],
 ['directory-rg-retained','rg --files scratch/alfred-postinstall-whole-items-20261011/next-item-reservation-plan/items/reader_terminal',root,true],
];
const results=cases.map(([id,command,cwd,expected])=>({id,command,cwd,expected,originalAdmitted:original(command,cwd),candidateAdmitted:candidate(command,cwd)})).map(c=>({...c,passed:c.candidateAdmitted===c.expected}));
const direct=candidateModule.isFormattedStatReadArgs;
const permissionControls=[
 ['unknown-lstat',()=>direct(['-c','%a %s %n','docs/state.md'],fixture,[],{lstat:()=>{throw Object.assign(Error('permission'),{code:'EACCES'});}})],
 ['unknown-realpath',()=>direct(['-c','%a %s %n','docs/state.md'],fixture,[],{realpath:()=>{throw Object.assign(Error('permission'),{code:'EACCES'});}})],
 ['policy-refusal',()=>direct(['-c','%a %s %n','docs/state.md'],fixture,[],{passive:()=>false})],
].map(([id,run])=>({id,admitted:run()})).map(c=>({...c,passed:c.admitted===false}));
const physical=spawnSync('stat',['-c','%a %s %h %n','docs/state.md'],{cwd:fixture,encoding:'utf8'});
const physicalResult={argv:['stat','-c','%a %s %h %n','docs/state.md'],exitCode:physical.status,stderr:physical.stderr,stdout:physical.stdout,passed:physical.status===0&&/^\d+ \d+ 1 docs\/state\.md\n$/.test(physical.stdout??'')};
const failed=[...results,...permissionControls,physicalResult].filter(c=>!c.passed);
const report={schema:'pipeline.private-formatted-stat-qualification.v1',preparationOnly:true,originalRed:results.filter(c=>c.expected&&!c.originalAdmitted),results,permissionControls,physicalResult,sourceCAS,sourceCASUnchanged:sourceCAS.every(c=>sha(c.path)===c.sha256&&(fs.statSync(c.path).mode&0o777)===c.mode),retainedMergedSha256:sha(merged),prior62Replayed:false,postimage:prep.postimage,passed:results.length+permissionControls.length+1-failed.length,failed:failed.length,native:false,installed:false};
fs.writeFileSync(path.join(own,'stat-original-red.json'),JSON.stringify({schema:report.schema,source:prep.source,results:report.originalRed},null,2)+'\n');
fs.writeFileSync(path.join(own,'stat-proposed-green.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,failed:report.failed,originalRed:report.originalRed.map(c=>c.id),failedIDs:failed.map(c=>c.id),sourceCASCount:sourceCAS.length,sourceCASUnchanged:report.sourceCASUnchanged}));
process.exitCode=failed.length||!report.sourceCASUnchanged?1:0;

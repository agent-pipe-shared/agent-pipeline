import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {isReadOnlyDiagnosticCommand as original} from '../../../plugins/pipeline-core/lib/guard/shell-grammar.mjs';
const root=process.cwd(),rel='scratch/alfred-postinstall-whole-items-20261011/passive-read-consumer-delivery',own=path.join(root,rel),pre=JSON.parse(fs.readFileSync(path.join(own,'pre.json')));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const check=()=>pre.dependencies.every(d=>sha(d.path)===d.sha256&&(fs.statSync(path.join(root,d.path)).mode&0o777)===d.mode)&&sha(pre.postimage.path)===pre.postimage.sha256;
if(!check())throw Error('pre CAS drift');
if(process.env.RIPGREP_CONFIG_PATH)throw Error('RIPGREP_CONFIG_PATH active');
// URL-adapt only relative imports. Imported dependency bytes stay unchanged;
// this is a controlled consumer, never installed/native runtime assurance.
function url(p,replace={}){const base=pathToFileURL(path.join(root,p)).href;const s=fs.readFileSync(path.join(root,p),'utf8').replace(/from (["'])(\.[^"']+)\1/g,(_,q,v)=>'from '+JSON.stringify(replace[v]??new URL(v,base).href)).replaceAll('import.meta.url',JSON.stringify(base));return 'data:text/javascript;base64,'+Buffer.from(s).toString('base64');}
const hook=url(pre.postimage.path,{'../lib/git-cmd.mjs':pathToFileURL(path.join(root,'plugins/pipeline-core/lib/git-cmd.mjs')).href,'../lib/passive-read-policy.mjs':pathToFileURL(path.join(root,'plugins/pipeline-core/lib/passive-read-policy.mjs')).href});
const candidate=(await import(url('plugins/pipeline-core/lib/guard/shell-grammar.mjs',{'../../hooks/guard-command-grammar.mjs':hook}))).isReadOnlyDiagnosticCommand;
const fixture=path.join(own,'consumer-fixture');fs.mkdirSync(path.join(fixture,'docs'),{recursive:true});
fs.writeFileSync(path.join(fixture,'docs/state.md'),'needle\nneedle\nneedle\n');fs.writeFileSync(path.join(fixture,'docs/example.js'),'needle\n');fs.writeFileSync(path.join(fixture,'docs/.hidden.md'),'hidden needle\n');
const newCases=[
 ['no-heading','rg --no-heading needle docs/state.md',true],
 ['short-max','rg -m 2 needle docs/state.md',true],
 ['combined-flags','rg --no-heading -n -m 2 needle docs/state.md',true],
 ['repeated-short-globs','rg -n needle -g "*.md" -g "*.js" docs',true],
 ['repeated-long-globs','rg --glob "*.md" --glob "*.js" needle docs',true],
 ['mixed-globs','rg -g "*.md" --glob "*.js" --no-heading -m 2 needle docs',true],
 ['repeated-files-globs','rg --files -g "*.md" -g "*.js" docs',true],
 ['bounded-max','rg -m 500 needle docs/state.md',true],
 ['rg-pipeline','rg --no-heading -m 2 needle docs/state.md | head -n 1',true],
 ['duplicate-no-heading','rg --no-heading --no-heading needle docs/state.md',false],
 ['unbounded-max','rg -m 501 needle docs/state.md',false],
 ['negative-max','rg -m -1 needle docs/state.md',false],
 ['noncanonical-max','rg -m 02 needle docs/state.md',false],
 ['missing-max','rg -m',false],
 ['pre','rg --pre cat needle docs/state.md',false],
 ['follow','rg --follow needle docs/state.md',false],
 ['hidden','rg --hidden needle docs',false],
 ['no-ignore','rg --no-ignore needle docs',false],
 ['hidden-glob','rg -g "*.md" -g ".hidden*" needle docs',false],
 ['path-glob','rg -g "*.md" -g "docs/*.js" needle docs',false],
 ['exclude-glob','rg -g "*.md" -g "!excluded.md" needle docs',false],
 ['any-glob','rg -g "*.md" -g "*" needle docs',false],
 ['credential','rg --no-heading -m 2 needle .env',false],
 ['credential-key','rg --no-heading -m 2 needle docs/po-private.pem',false],
 ['traversal','rg --no-heading -m 2 needle ../outside.md',false],
 ['output','rg --no-heading -m 2 needle docs/state.md > out.txt',false],
 ['substitution','rg --no-heading -m 2 "$(id)" docs/state.md',false],
 ['backtick','rg --no-heading -m 2 "`id`" docs/state.md',false],
 ['execution','rg --no-heading needle docs/state.md ; touch out.txt',false],
];
const phase=process.argv.includes('--original')?'original-red':'merged-green';
const results=newCases.map(([id,command,expected])=>{const originalAdmitted=original(command,fixture),admitted=(phase==='original-red'?original:candidate)(command,fixture);return{id,command,expected,originalAdmitted,admitted,passed:admitted===expected};});
// Necessary integration qualification of the retained git/head repair. The
// already successful four PAI tests and old consumer controls are not replayed.
const prior=JSON.parse(fs.readFileSync(path.join(root,'scratch/alfred-postinstall-whole-items-20261011/item-10/qualification.json')));
const retained=phase==='merged-green'?prior.results.map(c=>({id:c.id,command:c.normalized.command,expected:c.expected,admitted:candidate(c.normalized.command,c.normalized.cwd??c.rawEnvelope.toolCall.args.Cwd)})).map(c=>({...c,passed:c.admitted===c.expected})):[];
let realRg=[];
if(phase==='merged-green')for(const args of [['--no-heading','-n','-m','2','needle','docs/state.md'],['--files','-g','*.md','-g','*.js','docs']]){
 const r=spawnSync('rg',args,{cwd:fixture,encoding:'utf8',env:process.env});realRg.push({argv:args,exitCode:r.status,error:r.error?.code??null,stdout:r.stdout??'',stderr:r.stderr??'',passed:r.status===0&&!r.error});
}
const failed=[...results,...retained,...realRg].filter(c=>!c.passed),out={schema:'alfred.passive-consumer-qualification.v1',phase,preparationOnly:true,native:false,platform:process.platform,sourceUnchanged:check(),postimage:pre.postimage,results,retainedGitHeadIntegration:retained,realRg,passed:results.length+retained.length+realRg.length-failed.length,failed:failed.length,priorFourPAIReplayed:false};
fs.writeFileSync(path.join(own,phase+'.json'),JSON.stringify(out,null,2)+'\n');fs.writeFileSync(path.join(own,phase+'.log'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({phase,passed:out.passed,failed:out.failed,failedIDs:failed.map(c=>c.id??c.argv),sourceUnchanged:out.sourceUnchanged}));process.exitCode=failed.length||!out.sourceUnchanged?1:0;

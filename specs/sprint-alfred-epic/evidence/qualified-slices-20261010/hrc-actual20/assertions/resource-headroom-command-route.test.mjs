// Independent route assertions. Commands are inert data; no reporter or shell executes.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,linkSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isReadOnlySimpleWords,isReadOnlyDiagnosticCommand} from './shell-grammar.mjs';
import {devPlanShellRefusalHit} from './devplan-shell-lane.mjs';
import {registerTestCaseCompletion} from '../test-case-completion.mjs';
const repository=fileURLToPath(new URL('../../../../',import.meta.url));
const script=fileURLToPath(new URL('../../scripts/report-resource-headroom.mjs',import.meta.url));
const fixtureBase=join(repository,'scratch','headroom-command-route-owned-fixtures');
mkdirSync(fixtureBase,{recursive:true,mode:0o700});
const cases=[];
function check(name,run){cases.push({id:`HRC${String(cases.length+1).padStart(3,'0')}`,name,run});}
function fixture(){const root=mkdtempSync(join(fixtureBase,'case-'));mkdirSync(join(root,'inputs'),{mode:0o700});writeFileSync(join(root,'inputs','observations.json'),'{}\n',{flag:'wx',mode:0o600});return root;}
const words=(input='inputs/observations.json',target=script)=>['node',target,'--input',input];
const command=argv=>argv.map(word=>JSON.stringify(word)).join(' ');
function admitted(root,argv=words()){return isReadOnlySimpleWords(argv,root);}
check('exact physical bundled reporter and public bounded input are read-only',()=>{const root=fixture();assert(lstatSync(script).isFile());assert.equal(admitted(root),true);assert.equal(isReadOnlyDiagnosticCommand(command(words()),root),true);});
check('quoted public input containing spaces is data',()=>{const root=fixture();writeFileSync(join(root,'inputs','resource observations.json'),'{}\n',{flag:'wx'});assert.equal(isReadOnlyDiagnosticCommand(command(words('inputs/resource observations.json')),root),true);});
check('existing node.exe executable spelling preserves exact bundled route',()=>{const root=fixture();assert.equal(admitted(root,['node.exe',...words().slice(1)]),true);});
check('existing trailing stderr devnull compatibility remains read-only',()=>{const root=fixture();assert.equal(isReadOnlyDiagnosticCommand(command(words())+' 2>/dev/null',root),true);});
check('real devplan shell consumer uses actual read-only classifier',()=>{const root=fixture();assert.equal(devPlanShellRefusalHit(command(words()),root),null);});
check('existing syntax-check node route is conserved',()=>{const root=fixture();assert.equal(isReadOnlySimpleWords(['node','--check',script],root),true);});
check('foreign same-basename script never gains bundled identity',()=>{const root=fixture();const foreign=join(root,'report-resource-headroom.mjs');writeFileSync(foreign,'// inert foreign\n',{flag:'wx'});assert.equal(admitted(root,words(undefined,foreign)),false);});
check('repository-relative script copy is not the bundled identity',()=>{const root=fixture();mkdirSync(join(root,'scripts'));writeFileSync(join(root,'scripts','report-resource-headroom.mjs'),'// inert foreign\n',{flag:'wx'});assert.equal(admitted(root,words(undefined,'scripts/report-resource-headroom.mjs')),false);});
check('closed guard route refuses absent stdin and missing input argument',()=>{const root=fixture();for(const argv of [['node',script],['node',script,'--input']])assert.equal(admitted(root,argv),false);});
check('extra duplicate mutation and equals-form flags stay outside exact argv',()=>{const root=fixture();for(const argv of [[...words(),'--input','inputs/observations.json'],[...words(),'--write'],['node',script,'--input=inputs/observations.json'],['node','--eval',script,'--input','inputs/observations.json']])assert.equal(admitted(root,argv),false);});
check('private absolute traversal alias and nonjson lexical input shapes refuse',()=>{const root=fixture();for(const value of ['.git/data.json','.ssh/data.json','.aws/data.json','.codex/data.json','.agents/data.json','.claude/data.json','.pipeline/data.json','/outside/data.json','../outside.json','inputs/../data.json','./inputs/observations.json','inputs//observations.json','inputs\\observations.json','C:data.json','inputs/data.txt'])assert.equal(admitted(root,words(value)),false);});
check('missing physical input is unavailable rather than admitted',()=>{const root=fixture();assert.equal(admitted(root,words('inputs/missing.json')),false);});
check('symlink input file is refused',()=>{const root=fixture();symlinkSync('observations.json',join(root,'inputs','alias.json'));assert.equal(admitted(root,words('inputs/alias.json')),false);});
check('symlink input parent is refused',()=>{const root=fixture();symlinkSync('inputs',join(root,'alias'));assert.equal(admitted(root,words('alias/observations.json')),false);});
check('hardlinked input is refused',()=>{const root=fixture();linkSync(join(root,'inputs','observations.json'),join(root,'inputs','second.json'));assert.equal(admitted(root),false);});
check('oversized input is refused before diagnostic launch',()=>{const root=fixture();writeFileSync(join(root,'inputs','large.json'),Buffer.alloc(65537,32),{flag:'wx'});assert.equal(admitted(root,words('inputs/large.json')),false);});
check('directory named json is not a regular input',()=>{const root=fixture();mkdirSync(join(root,'inputs','directory.json'));assert.equal(admitted(root,words('inputs/directory.json')),false);});
check('substitution and effectful redirects never become headroom commands',()=>{const root=fixture();const good=command(words());for(const value of [good+' > inputs/output.json',good+' < inputs/observations.json','node '+JSON.stringify(script)+' --input $(printf inert)',good+' ; node foreign.mjs',good+' | node foreign.mjs',good+' `printf inert`'])assert.equal(isReadOnlyDiagnosticCommand(value,root),false);});
check('input operand types and control bytes are not valid path tokens',()=>{const root=fixture();for(const value of [null,17,{},'', 'inputs/line\n.json','inputs/nul\0.json'])assert.equal(admitted(root,['node',script,'--input',value]),false);});
check('route admission does not invent JSON validity freshness or compliance',()=>{const root=fixture();writeFileSync(join(root,'inputs','stale.json'),'not observation JSON\n',{flag:'wx'});assert.equal(admitted(root,words('inputs/stale.json')),true,'grammar is bounded read-only; reporter owns stale/malformed observation disposition');});
registerTestCaseCompletion({cases,fd:3,maxBytes:32768});

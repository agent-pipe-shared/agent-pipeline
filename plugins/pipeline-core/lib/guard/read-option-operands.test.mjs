// SPDX-License-Identifier: SUL-1.0
// Independent diagnostic regression: strings are parsed, never executed.
// This changes no command admission, SEC-11 scope, or private signing authority.
import assert from 'node:assert/strict';
import {after} from 'node:test';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGuardCommand} from '../../hooks/guard-command-grammar.mjs';
import {qp4OperandResolvesOutsideRoot,isReadOnlyDiagnosticCommand} from './shell-grammar.mjs';
import {registerTestCaseCompletion} from '../test-case-completion.mjs';
const repository=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
const supplied=process.env.ALFRED_ROPT_FIXTURE_ROOT;
const fixture=supplied??mkdtempSync(join(repository,'scratch','read-option-operands-'));
const project=join(fixture,'project'),outside=join(fixture,'outside');
mkdirSync(project,{recursive:true});mkdirSync(outside,{recursive:true});
writeFileSync(join(project,'scan.txt'),'ordinary fixture text\n');
writeFileSync(join(project,'options.txt'),'ordinary fixture option\n');
writeFileSync(join(outside,'options.txt'),'ordinary outside fixture option\n');
if(!supplied)after(()=>rmSync(fixture,{recursive:true,force:true}));
const parse=command=>parseGuardCommand(command,project,{platform:'linux'});
const outsideLabel=command=>qp4OperandResolvesOutsideRoot(parse(command),project);
const cases=[];
function add(name,run){cases.push({id:'ROPT'+String(cases.length+1).padStart(3,'0'),name,run});}
for(const [executable,option] of [['rg','--ignore-file'],['grep','--exclude-from']]){
 for(const equal of [false,true]){
  const command=executable+' '+option+(equal?'=../outside/options.txt':' ../outside/options.txt')+' needle scan.txt';
  add(executable+' '+option+' '+(equal?'equal':'separated')+' retains outside option-file diagnostic',()=>{
   const parsed=parse(command);
   assert.equal(parsed.parseStatus,'accepted','lexical parse must supply authoritative argv');
   assert.equal(parsed.segments[0].executable,executable);
   assert.ok(parsed.segments[0].argv.some(value=>value.includes('../outside/options.txt')));
   assert.equal(qp4OperandResolvesOutsideRoot(parsed,project),true,'a literal option value read as a file must not disappear from outside-root label');
   assert.equal(isReadOnlyDiagnosticCommand(command,project),false,'diagnostic recognition must not expand unsupported option admission');
  });
 }
}
for(const [executable,option] of [['rg','--ignore-file'],['grep','--exclude-from']]){
 for(const equal of [false,true]){
  const command=executable+' '+option+(equal?'=options.txt':' options.txt')+' needle scan.txt';
  add(executable+' '+option+' '+(equal?'equal':'separated')+' in-root file control',()=>{
   assert.equal(parse(command).parseStatus,'accepted');
   assert.equal(outsideLabel(command),false);
   assert.equal(isReadOnlyDiagnosticCommand(command,project),false,'unsupported option remains outside admission');
  });
 }
}
for(const executable of ['rg','grep'])add(executable+' supported pattern-file outside control',()=>{
 const command=executable+' -f ../outside/options.txt scan.txt';
 assert.equal(parse(command).parseStatus,'accepted');assert.equal(outsideLabel(command),true);
 // SEC-11 admits this exact ordinary external rg pattern file; grep -f stays unsupported.
 assert.equal(isReadOnlyDiagnosticCommand(command,project),executable==='rg','outside file is not admitted');
});
for(const [executable,option] of [['rg','--glob'],['grep','--exclude']])add(executable+' non-file option value remains text',()=>{
 const command=executable+' '+option+' ../outside/not-a-file -e needle scan.txt';
 assert.equal(parse(command).parseStatus,'accepted');assert.equal(outsideLabel(command),false);
});
add('explicit end-of-options retains outside positional target',()=>{
 assert.equal(outsideLabel('grep -e needle -- ../outside/options.txt'),true);
});
add('option-file syntax stays argv data and never becomes executable',()=>{
 const parsed=parse("rg --ignore-file 'node tools/inert.mjs' needle scan.txt");
 assert.equal(parsed.parseStatus,'accepted');assert.equal(parsed.segments[0].executable,'rg');
 assert.ok(parsed.segments[0].argv.includes('node tools/inert.mjs'));
 assert.equal(qp4OperandResolvesOutsideRoot(parsed,project),false);
});
add('malformed quoting remains rejected',()=>{
 const command="rg --ignore-file 'unterminated";
 assert.notEqual(parse(command).parseStatus,'accepted');assert.equal(isReadOnlyDiagnosticCommand(command,project),false);
});
add('missing option-file value remains unsupported',()=>{
 for(const command of ['rg --ignore-file','grep --exclude-from'])assert.equal(isReadOnlyDiagnosticCommand(command,project),false);
});
add('command substitution remains rejected without execution',()=>{
 const command='rg --ignore-file $(inert-probe) needle scan.txt';
 assert.notEqual(parse(command).parseStatus,'accepted');assert.equal(isReadOnlyDiagnosticCommand(command,project),false);
});
add('output redirect remains refused without execution',()=>{
 const command='rg --ignore-file options.txt needle scan.txt > out.txt';
 assert.equal(isReadOnlyDiagnosticCommand(command,project),false);
});
add('ordinary outside positional target remains labelled',()=>{
 assert.equal(outsideLabel('rg needle ../outside/options.txt'),true);
});
add('ordinary exact in-root diagnostic remains admitted',()=>{
 const command='rg needle scan.txt';
 assert.equal(parse(command).parseStatus,'accepted');assert.equal(outsideLabel(command),false);
 assert.equal(isReadOnlyDiagnosticCommand(command,project),true);
});
registerTestCaseCompletion({cases,fd:process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD===undefined?3:Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD),maxBytes:65536});

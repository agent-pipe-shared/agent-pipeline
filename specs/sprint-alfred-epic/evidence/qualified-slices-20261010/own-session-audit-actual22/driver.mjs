import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdirSync} from 'node:fs';
import {cases} from './assertions.mjs';

if(process.argv.length!==4)throw new Error('OSE-DRIVER-ARGS');
const graphRoot=resolve(process.argv[2]),outputRoot=resolve(process.argv[3]);
mkdirSync(outputRoot,{recursive:false,mode:0o700});
const helperPath=join(graphRoot,'plugins/pipeline-core/lib/runner-own-session-audit.mjs');
const cliPath=join(graphRoot,'plugins/pipeline-core/scripts/runner-transcript-recovery.mjs');
const {auditCurrentRunnerSession:audit}=await import(pathToFileURL(helperPath));
const {sanctionedTranscriptRecoveryArgs:guard}=await import(pathToFileURL(join(graphRoot,'plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs')));
const {createTestCaseCompletionRecorder}=await import(pathToFileURL(join(graphRoot,'plugins/pipeline-core/lib/test-case-completion.mjs')));
const recorder=createTestCaseCompletionRecorder({caseIds:cases.map(c=>c.id),fd:3,maxBytes:65536});
let failures=0;
for(const entry of cases){
  try{await entry.run({audit,guard,helperPath,cliPath,outputRoot});recorder.dispose(entry.id,'pass');process.stdout.write(JSON.stringify({id:entry.id,disposition:'pass'})+'\n');}
  catch(error){failures++;recorder.dispose(entry.id,'fail');process.stdout.write(JSON.stringify({id:entry.id,disposition:'fail',error:{name:error.name,code:error.code??null,message:String(error.message).slice(0,1024)}})+'\n');}
}
if(!recorder.snapshot().terminal)throw new Error('OSE-NONTERMINAL');
process.exitCode=failures?1:0;

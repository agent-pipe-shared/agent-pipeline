import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {isReadOnlyDiagnosticCommand as original} from '../../../plugins/pipeline-core/lib/guard/shell-grammar.mjs';
import {isAllowedPassiveReadTarget as policy} from '../../../plugins/pipeline-core/lib/passive-read-policy.mjs';
const root=process.cwd(),own='scratch/alfred-postinstall-whole-items-20261011/passive-read-batch-correction';
const prior='scratch/alfred-postinstall-whole-items-20261011/passive-read-consumer-delivery/postimages/plugins/pipeline-core/hooks/guard-command-grammar.mjs';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function url(p,replace={}){const base=pathToFileURL(path.join(root,p)).href;const s=fs.readFileSync(p,'utf8').replace(/from (["'])(\.[^"']+)\1/g,(_,q,v)=>'from '+JSON.stringify(replace[v]??new URL(v,base).href)).replaceAll('import.meta.url',JSON.stringify(base));return 'data:text/javascript;base64,'+Buffer.from(s).toString('base64');}
const priorHook=url(prior,{'../lib/git-cmd.mjs':pathToFileURL(path.join(root,'plugins/pipeline-core/lib/git-cmd.mjs')).href,'../lib/passive-read-policy.mjs':pathToFileURL(path.join(root,'plugins/pipeline-core/lib/passive-read-policy.mjs')).href});
const priorConsumer=(await import(url('plugins/pipeline-core/lib/guard/shell-grammar.mjs',{'../../hooks/guard-command-grammar.mjs':priorHook}))).isReadOnlyDiagnosticCommand;
const rows=[
 ['reader-directory','rg --files scratch/alfred-postinstall-whole-items-20261011/next-item-reservation-plan/items/reader_terminal'],
 ['semgrep-directory','rg --files scratch/alfred-postinstall-whole-items-20261011/next-item-reservation-plan/items/semgrep_console'],
 ['role-multiple-files',"rg -n 'fallback|runRoleDispatchBatch|prepareCanonicalRoleFallback' plugins/pipeline-core/lib/role-route-preflight.test.mjs plugins/pipeline-core/lib/dispatch-policy.test.mjs plugins/pipeline-core/lib/role-dispatch-preflight.test.mjs"],
 ['namespace-multiple-files',"rg -n 'shared|namespace' plugins/pipeline-core/lib/codex-advisor-host-store.test.mjs plugins/pipeline-core/lib/codex-design-readiness-host-store.test.mjs plugins/pipeline-core/lib/codex-host-process-journal.test.mjs"],
 ['routing-multiple-files','rg -n "MP-07|MP-03|goldfish-mechanic|Haiku|haiku|Opus|Sonnet" policies/model-policy.md plugins/pipeline-core/policies/model-policy.md'],
 ['formatted-stat',"stat -c '%a %s %n' plugins/pipeline-core/lib/role-dispatch-preflight.mjs"],
];
const targets=['scratch/alfred-postinstall-whole-items-20261011/next-item-reservation-plan/items/reader_terminal','plugins/pipeline-core/lib/role-dispatch-preflight.mjs','plugins/pipeline-core/lib/role-route-preflight.test.mjs','plugins/pipeline-core/lib/dispatch-policy.test.mjs','plugins/pipeline-core/lib/role-dispatch-preflight.test.mjs','policies/model-policy.md','plugins/pipeline-core/policies/model-policy.md'];
const result={preparationOnly:true,priorGrammarSha256:sha(prior),sourceCAS:['plugins/pipeline-core/hooks/guard-command-grammar.mjs','plugins/pipeline-core/lib/guard/shell-grammar.mjs','plugins/pipeline-core/lib/passive-read-policy.mjs',prior].map(p=>({path:p,sha256:sha(p),mode:fs.statSync(p).mode&0o777,bytes:fs.statSync(p).size})),results:rows.map(([id,command])=>({id,command,sourceAdmitted:original(command,root),priorMergedAdmitted:priorConsumer(command,root)})),targets:targets.map(p=>({path:p,exists:fs.existsSync(p),recursivePolicy:policy(p,{rootDir:root,recursive:true}),exactPolicy:policy(p,{rootDir:root})}))};
fs.writeFileSync(path.join(own,'causal-red.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
const controlled=[
 ['existing-role-multiple',"rg -n 'fallback|runRoleDispatchBatch|prepareCanonicalRoleFallback' plugins/pipeline-core/lib/role-route-preflight.test.mjs plugins/pipeline-core/lib/dispatch-policy.test.mjs",true],
 ['existing-files-inventory','rg --files plugins/pipeline-core/lib/role-route-preflight.test.mjs plugins/pipeline-core/lib/dispatch-policy.test.mjs',true],
 ['directory-reader',rows[0][1],true],['directory-semgrep',rows[1][1],true],
 ['missing-member',rows[2][1],false],['missing-policy-member',rows[4][1],false],
 ['private-member','rg -n needle plugins/pipeline-core/lib/dispatch-policy.test.mjs .env',false],
 ['unknown-option','rg --unknown-option needle plugins/pipeline-core/lib/dispatch-policy.test.mjs',false],
 ['execute-pre','rg --pre cat needle plugins/pipeline-core/lib/dispatch-policy.test.mjs',false],
 ['hidden-inventory','rg --files --hidden scratch/alfred-postinstall-whole-items-20261011/next-item-reservation-plan/items/reader_terminal',false],
 ['no-ignore-inventory','rg --files --no-ignore scratch/alfred-postinstall-whole-items-20261011/next-item-reservation-plan/items/reader_terminal',false],
 ['substitution','rg -n "$(id)" plugins/pipeline-core/lib/dispatch-policy.test.mjs',false],
 ['redirect','rg --files plugins/pipeline-core/lib/dispatch-policy.test.mjs > scratch/output',false],
 ['unknown-executable','unknown-reader plugins/pipeline-core/lib/dispatch-policy.test.mjs',false],
 ['missing-cat','cat scratch/alfred-postinstall-whole-items-20261011/passive-read-batch-correction/nonexistent-receipt.json',false],
];
const controls=controlled.map(([id,command,expected])=>({id,command,expected,sourceAdmitted:original(command,root),priorMergedAdmitted:priorConsumer(command,root)})).map(c=>({...c,passed:c.priorMergedAdmitted===c.expected}));
const negatives={results:controls,passed:controls.filter(c=>c.passed).length,failed:controls.filter(c=>!c.passed).length,policyUnknownDirectory:policy(targets[0],{rootDir:root,machinePlaneRead:()=>({status:'invalid'}),repoKeyDirectory:()=>({status:'absent'})}),policyUnknownMissing:policy('scratch/alfred-postinstall-whole-items-20261011/passive-read-batch-correction/nonexistent-receipt.json',{rootDir:root,machinePlaneRead:()=>({status:'invalid'}),repoKeyDirectory:()=>({status:'absent'})})};
fs.writeFileSync(path.join(own,'preserved-controls.json'),JSON.stringify(negatives,null,2)+'\n');
console.log(JSON.stringify({controlPassed:negatives.passed,controlFailed:negatives.failed,namespaceTargets:rows[3][1].split(' ').slice(3).map(p=>({path:p,exists:fs.existsSync(p)}))}));
const previousManifest='scratch/alfred-postinstall-whole-items-20261011/passive-read-consumer-delivery/manifest.json';
const previous=JSON.parse(fs.readFileSync(previousManifest,'utf8'));
fs.writeFileSync(path.join(own,'history-binding.json'),JSON.stringify({path:previousManifest,sha256:sha(previousManifest),topLevelKeys:Object.keys(previous),history:Object.fromEntries(Object.entries(previous).filter(([key])=>/history|budget|review|donor|original|batch/i.test(key))),newReviewCalls:0,reviewLimit:'FULL1+max3DIFF',reset:false},null,2)+'\n');
process.exitCode=negatives.failed||negatives.policyUnknownDirectory||negatives.policyUnknownMissing?1:0;
